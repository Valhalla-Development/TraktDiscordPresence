import { existsSync, readFileSync, writeFileSync } from 'fs';
import 'colors';
import Enquirer from 'enquirer';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import Trakt from 'trakt.tv';
import { Client } from 'discord-rpc';
import { DateTime } from 'luxon';

const { prompt } = Enquirer;

interface TraktCredentials {
    clientId: string;
    clientSecret: string;
    discordClientId: string;
    oAuth?: string;
}

interface TraktContent {
    smallImageKey: string;
    largeImageKey: string;
    startTimestamp: Date;
    details?: string;
    state?: string
}

class DiscordRPC {
    rpc: Client | null;

    statusInt: NodeJS.Timeout | undefined;

    constructor() {
        this.rpc = null;
    }

    async spawnRPC(trakt: TraktInstance) {
        try {
            const traktCredentials = await fetchTraktCredentials();
            this.rpc = new Client({ transport: 'ipc' });
            this.rpc.on('ready', () => {
                console.log('Successfully connected to Discord!'.green);
            });
            await this.rpc.login({ clientId: traktCredentials.discordClientId });
            await trakt.updateStatus(this.rpc, this.statusInt);
            this.statusInt = setInterval(async () => {
                await trakt.updateStatus(this.rpc, this.statusInt);
            }, 15000);
        } catch {
            console.log('Failed to connect to Discord. Retrying in 15 seconds.'.red);
            setTimeout(() => {
                this.spawnRPC(trakt);
            }, 15000);
        }
    }
}

class TraktInstance {
    trakt: Trakt;

    async createTrakt() {
        const traktCredentials = await fetchTraktCredentials();
        this.trakt = new Trakt({
            client_id: traktCredentials.clientId,
            client_secret: traktCredentials.clientSecret,
        });
        this.trakt.import_token(traktCredentials.oAuth);
        return this.trakt;
    }

    // eslint-disable-next-line no-undef
    async updateStatus(rpc: Client | null, statusInt: string | number | NodeJS.Timeout | undefined) {
        if (rpc) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            if (rpc.transport.socket.readyState !== 'open') {
                if (statusInt) clearInterval(statusInt);
                await rpc.destroy();
                // eslint-disable-next-line no-param-reassign
                rpc = null;
                await new DiscordRPC().spawnRPC(this);
                return;
            }

            const user = await this.trakt.users.settings();
            const watching = await this.trakt.users.watching({ username: user.user.username });

            if (watching) {
                const type: TraktContent = {
                    smallImageKey: 'play',
                    largeImageKey: 'trakt',
                    startTimestamp: new Date(watching.started_at),
                };

                if (watching.type === 'movie') {
                    const { movie } = watching;
                    type.details = `${movie.title} (${movie.year})`;
                } else if (watching.type === 'episode') {
                    const { show, episode } = watching;
                    type.details = `${show.title}`;
                    type.state = `S${episode.season}E${episode.number} (${episode.title})`;
                }
                await rpc.setActivity({ ...type });

                console.log(`${formatDate()} | ${'Trakt Playing:'.red} ${type.details}${type.state ? ` - ${type.state}` : ''}`);
            } else {
                console.log(`${formatDate()} | ${'Trakt:'.red.underline} Not Playing.`);
                await rpc.clearActivity();
            }
        }
    }
}

async function fetchTraktCredentials(): Promise<TraktCredentials> {
    const configData = readFileSync('./config.json', 'utf8');
    return JSON.parse(configData);
}

function formatDate() {
    const now = DateTime.now();

    return `${now.toLocaleString(DateTime.DATE_HUGE)} - ${now.toLocaleString(DateTime.TIME_WITH_SHORT_OFFSET)}`.green.italic;
}

function generatePromptConfig(name: string, message: string) {
    return {
        type: 'input',
        name,
        message,
    };
}

async function generateTraktCredentials(): Promise<TraktCredentials | null> {
    console.log(
        `Kindly adhere to the instructions displayed on the screen to authenticate your account.\n${
            '**CRUCIAL: Handle your login credentials with the highest level of privacy and avoid disclosing them. They will be stored in a `config.json` file.\n'.red.italic
        }`,
    );

    return prompt([
        generatePromptConfig('clientId', 'Please provide your Trakt Client ID:'),
        generatePromptConfig('clientSecret', 'Please provide your Trakt Client Secret:'),
        generatePromptConfig('discordClientId', 'Please provide your Discord Client ID:'),
    ]);
}

async function authoriseTrakt(gen: TraktCredentials) {
    const qOptions = {
        client_id: gen.clientId,
        client_secret: gen.clientSecret,
    };

    const qTrakt = new Trakt(qOptions);

    const traktAuthUrl = qTrakt.get_url();

    const auth = await prompt<TraktCredentials>([
        generatePromptConfig('oAuth', `Please visit the following link and subsequently, paste the received code into the console:\n${traktAuthUrl}\n`),
    ]);

    const arr: TraktCredentials = {
        clientId: gen.clientId,
        clientSecret: gen.clientSecret,
        discordClientId: gen.discordClientId,
    };

    try {
        await qTrakt.exchange_code(auth.oAuth, null);
        const token = await qTrakt.export_token();
        arr.oAuth = token;
    } catch {
        console.log('\nAn incorrect token has been provided! Please restart the program and try again.'.red); process.exit(1);
    }

    writeFileSync('./config.json', JSON.stringify(arr, null, 3));

    console.log('\nPlease restart this program.'.green);
    process.exit(1);
}

async function initializeTraktAndDiscordRPC() {
    const traktInstance = new TraktInstance();
    await traktInstance.createTrakt();
    const discordRPC = new DiscordRPC();
    await discordRPC.spawnRPC(traktInstance);
}

async function main() {
    try {
        if (!existsSync('./config.json')) {
            const generatedCredentials = await generateTraktCredentials();
            if (generatedCredentials) await authoriseTrakt(generatedCredentials);
        }
        await initializeTraktAndDiscordRPC();
    } catch (error) {
        console.error(`\nAn error occurred: ${error}`.red);
        process.exit(1);
    }
}
await main();
