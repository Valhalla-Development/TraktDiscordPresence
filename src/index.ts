import { existsSync, readFileSync, writeFileSync } from 'fs';
import 'colors';
import Enquirer from 'enquirer';
// @ts-expect-error [currently, no types are present in trakt.tv, so this will cause an error]
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

/**
 * This variable can be either an instance of the `Client` from 'discord-rpc' or null.
 * It is used to control the Discord Rich Presence client.
 *
 * @example
 * ```typescript
 * import { Client } from 'discord-rpc';
 * let rpc: Client | null;
 * ```
 * @see {@link DiscordRPC#spawnRPC} for the method where this variable is mainly used.
 *
 * @type Client | null
 */
let rpc: Client | null;

/**
 * This class is responsible for managing the Discord Rich Presence Client and its connection.
 *
 * @class
 */
class DiscordRPC {
    public statusInt: NodeJS.Timeout | undefined;

    /**
     * Spawns and manages a Discord Rich Presence client.
     *
     * @async
     * @public
     * @param trakt - An instance of Trakt that contains the necessary methods to interact with the Trakt service.
     * @throws When it fails to connect to Discord or fetch Trakt Credentials.
     */
    async spawnRPC(trakt: TraktInstance) {
        try {
            const traktCredentials = await fetchTraktCredentials();
            rpc = new Client({ transport: 'ipc' });
            rpc.on('ready', () => {
                console.log('Successfully connected to Discord!'.green);
            });
            await rpc.login({ clientId: traktCredentials.discordClientId });
            await trakt.updateStatus(this.statusInt);
            this.statusInt = setInterval(async () => {
                await trakt.updateStatus(this.statusInt);
            }, 15000);
        } catch {
            console.log('Failed to connect to Discord. Retrying in 15 seconds.'.red);
            setTimeout(() => {
                this.spawnRPC(trakt);
            }, 15000);
        }
    }
}

/**
 * This class encapsulates the Trakt API with necessary methods to interact with the service.
 *
 * @class
 */
class TraktInstance {
    trakt: Trakt;

    /**
     * Initializes the Trakt API object.
     *
     * @async
     * @returns Returns a promise that resolves with an instance of the Trakt API.
     */
    async createTrakt(): Promise<Trakt> {
        const traktCredentials = await fetchTraktCredentials();
        this.trakt = new Trakt({
            client_id: traktCredentials.clientId,
            client_secret: traktCredentials.clientSecret,
        });
        this.trakt.import_token(traktCredentials.oAuth);
        return this.trakt;
    }

    /**
     * Checks the user's Trakt status and sends it to Discord.
     *
     * @async
     * @param statusInt - An interval ID used with the Node.js global setInterval() function, or undefined.
     * @throws When the RPC connection isn't open or if it fails to fetch Trakt user or watching data.
     */
    async updateStatus(statusInt: NodeJS.Timeout | undefined) {
        if (rpc) {
            // @ts-expect-error [currently, no types are present in trakt.tv, so this will cause an error]
            if (rpc.transport.socket.readyState !== 'open') {
                if (statusInt) clearInterval(statusInt);
                await rpc.destroy();
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

                console.log(`${formatDate()} | ${'Trakt Playing:'.red} ${type.details}${type.state ? ` - ${type.state}` : ''}`.bold);
            } else {
                console.log(`${formatDate()} | ${'Trakt:'.red} Not Playing.`.bold);
                await rpc.clearActivity();
            }
        }
    }
}

/**
 * Asynchronously fetches Trakt credentials from a `config.json` file.
 *
 * @returns Returns a promise that resolves with the Trakt Credentials.
 *
 * @example
 * ```typescript
 * const credentials = await fetchTraktCredentials();
 * ```
 *
 * The `TraktCredentials` interface consists of the following properties:
 * - `clientId`: string
 * - `clientSecret`: string
 * - `discordClientId`: string
 * - `oAuth?`: string (optional)
 *
 * The function reads a JSON file using `readFileSync` from the `fs` module and parses it to a JavaScript object.
 * In case of an error during reading the file, it will throw an error.
 */
async function fetchTraktCredentials(): Promise<TraktCredentials> {
    const configData = readFileSync('./config.json', 'utf8');
    return JSON.parse(configData);
}

/**
 * Formats the current date and time into a specific format.
 *
 * @returns Returns the current date and time as a string, formatted like:
 * 'Thursday, April 14, 2022' for date, and '11:37 PM +08:00' for time.
 * The formatted date and time is styled using ANSI escape codes to be green and italic.
 *
 * @example
 * ```typescript
 * console.log(formatDate());
 * ```
 * will log the current date and time, formatted and styled as described above.
 *
 * Note: The ANSI styling will only be visible in environments that support it, like many terminal emulators.
 *
 * This function uses `DateTime` from the `luxon` module to get the current date and time, and format it.
 */
function formatDate(): string {
    const now = DateTime.now();

    return `${now.toLocaleString(DateTime.DATE_HUGE)} - ${now.toLocaleString(DateTime.TIME_WITH_SHORT_OFFSET)}`.green.italic;
}

/**
 * Generates a configuration object for creating a prompt in enquirer's prompt interface.
 *
 * @param name - The name of the input field (also used as a key in the final object response i.e. `clientId`, `clientSecret`, `discordClientId`, `oAuth`).
 * @param message - The message to show in the prompt.
 *
 * @returns An object with properties `type`, `name`, and `message` which can be used with enquirer's prompt interface.
 *
 * @example
 * Usage with Enquirer prompt function:
 *
 * ```typescript
 * prompt([
 *      generatePromptConfig('clientId', 'Please provide your Trakt Client ID:')
 * ])
 * ```
 *
 * It will create a single input prompt with name as 'clientId' and message as 'Please provide your Trakt Client ID:'.
 */
function generatePromptConfig(name: string, message: string) {
    return {
        type: 'input',
        name,
        message,
    };
}

/**
 * Asynchronously generates Trakt credentials by prompting for necessary inputs.
 *
 * It sends prompts to the console for `clientId`, `clientSecret`, and `discordClientId` and
 * returns an object containing these inputs after successful entry.
 *
 * @remarks
 * This method should be run if there's no existing 'config.json' file.
 * It utilizes `generatePromptConfig` to generate prompt configurations for enquirer's prompt interface.
 * Once the necessary input prompts are answered correctly, the function returns
 * an object that satisfies the `TraktCredentials` interface.
 *
 * @example
 * If there's no 'config.json' file, it will generate Trakt credentials:
 *
 * ```typescript
 * if (!existsSync('./config.json')) {
 *      const generatedCredentials = await generateTraktCredentials();
 * }
 * ```
 *
 * @returns A Promise that resolves to an object satisfying the `TraktCredentials`
 * interface or null if inputs were not provided or there was an error.
 *
 * @async
 */
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

/**
 * Authorizes Trakt by generating a new Trakt instance, creating and sending a request
 * to acquire an authorization code, and then exchanging that code for a token.
 * The obtained token is then saved into a file named `config.json`.
 * In case the provided token is incorrect, the function logs the error message and terminates the process.
 *
 * @param gen - An object of type `TraktCredentials` that contains
 * `clientId`, `clientSecret`, and `discordClientId`.
 *
 * @throws When the received token is incorrect or if unable
 * to write the received token into `config.json`.
 *
 * @remarks
 * The function uses the `prompt` function to interact with the user directly.
 *
 * @returns A Promise that is resolved when the process of authorization
 * is finished successfully or throws an error otherwise.
 *
 * @async
 */
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
        arr.oAuth = await qTrakt.export_token();
    } catch {
        console.log('\nAn incorrect token has been provided! Please restart the program and try again.'.red.bold); process.exit(1);
    }

    writeFileSync('./config.json', JSON.stringify(arr, null, 3));

    console.log('\nPlease restart this program.'.green.bold);
    process.exit(1);
}

/**
 * Initializes instances of Trakt and Discord RPC.
 *
 * @throws When there is a failure to initialize Trakt and Discord RPC.
 * @returns A Promise that resolves when the operation is finished.
 */
async function initializeTraktAndDiscordRPC(): Promise<void> {
    const traktInstance = new TraktInstance();
    await traktInstance.createTrakt();
    const discordRPC = new DiscordRPC();
    await discordRPC.spawnRPC(traktInstance);
}

/**
 * The main function of the application.
 *
 * If there's no 'config.json' file, it will generate Trakt credentials and authorize them.
 * Then, it will initialize Trakt and Discord RPC.
 *
 * If any error occurs during these operations, it will be logged in the console,
 * and the process will exit with status code 1.
 *
 * @throws When unable to perform operations.
 * @returns A Promise that resolves when all operations are finished.
 */
async function main(): Promise<void> {
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
