import 'colors';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import Enquirer from 'enquirer';
// @ts-ignore
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

async function fetchTraktCredentials(): Promise<TraktCredentials> {
    const configData = readFileSync('./config.json', 'utf8');
    return JSON.parse(configData);
}

let rpc: Client | null;
// eslint-disable-next-line no-undef
let statusInt: string | number | NodeJS.Timeout | undefined;

const spawnRPC = async (trakt: Trakt) => {
    try {
        console.log(trakt);
        const traktCredentials = await fetchTraktCredentials();
        rpc = new Client({ transport: 'ipc' });

        rpc.on('error', (err) => {
            console.log(err);
        });
        rpc.on('ready', () => {
            console.log('Successfully connected to Discord!'.green);
        });
        await rpc.login({ clientId: traktCredentials.discordClientId });
        await updateStatus(trakt);

        statusInt = setInterval(() => {
            updateStatus(trakt);
        }, 15000);
    } catch (err) {
        console.log('Failed to connect to Discord. Retrying in 15 seconds.'.red);
        setTimeout(() => {
            spawnRPC(trakt);
        }, 15000);
    }
};

async function createTrakt() {
    const traktCredentials = await fetchTraktCredentials();
    const trakt = new Trakt({
        client_id: traktCredentials.clientId,
        client_secret: traktCredentials.clientSecret,
    });
    trakt.import_token(traktCredentials.oAuth);
    return trakt;
}

async function updateStatus(trakt: Trakt) {
    if (rpc) {
        // @ts-ignore
        if (rpc.transport.socket.readyState !== 'open') {
            clearInterval(statusInt);
            await rpc.destroy();
            rpc = null;
            await spawnRPC(trakt);
            return;
        }

        const user = await trakt.users.settings();
        const watching = await trakt.users.watching({ username: user.user.username });

        if (watching) {
            const type: TraktContent = {
                smallImageKey: 'play',
                largeImageKey: 'trakt',
                startTimestamp: new Date(watching.started_at),
            };

            // Set the activity
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
            // Check if the user is currently watching something and if not, run on a timeout.
            console.log(`${formatDate()} | ${'Trakt:'.red.underline} Not Playing.`);
            await rpc.clearActivity();
        }
    }
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

async function main() {
    try {
        if (!existsSync('./config.json')) {
            const gen = await generateTraktCredentials();
            if (gen) await authoriseTrakt(gen);
        }
        const trakt = await createTrakt();
        await spawnRPC(trakt);
    } catch (error) {
        console.error(`\nAn error occurred: ${error}`.red);
        process.exit(1);
    }
}

main();
