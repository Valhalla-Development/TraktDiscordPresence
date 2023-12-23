import { existsSync, readFileSync, writeFileSync } from 'fs';
import 'colors';
import Enquirer from 'enquirer';
// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import { Client } from '@xhayper/discord-rpc';
import { DateTime } from 'luxon';
import {
    GenericFormatter, Options, Params, SingleBar,
} from 'cli-progress';
import prettyMilliseconds from 'pretty-ms';

const { prompt } = Enquirer;

interface Configuration {
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
    state?: string;
}

interface Movie {
    expires_at: string;
    started_at: string;
    movie: {
        title: string;
        year: number;
    }

}

interface TvShow {
    expires_at: string;
    started_at: string;
    show: {
        title: string;
    }
    episode: {
        season: number;
        number: number;
        title: string;
    }
}

/**
 * This variable can be either an instance of the `Client` from 'discord-rpc' or null.
 * It is used to control the Discord Rich Presence client.
 *
 * @type Client | null
 */
let rpc: Client | null;

/**
 * `progressBar` is a SingleBar instance from the `cli-progress` module that represents a progress bar instance.
 * It is initially null but will be assigned later when a movie starts playing.
 *
 * The SingleBar instance is used to visualize the progress of the movie's play time on the terminal.
 *
 * @see {@link https://www.npmjs.com/package/cli-progress} for more information about how the cli-progress module works.
 */
let progressBar: SingleBar | null;

/**
 * Enum representing the various states of a connection.
 */
enum ConnectionState {
    Playing,
    NotPlaying,
    Connected,
    Disconnected,
    Connecting
}

/**
 * Represents the state of a connection instance.
 */
let instanceState: ConnectionState;

/**
 * Represents the interval ID for a NodeJS timeout.
 */
let retryInterval: NodeJS.Timeout;
/**
 * Represents the countdown timer value in seconds.
 */
let countdownTimer: number = 15;

/**
 * This class is responsible for managing the Discord Rich Presence Client and its connection.
 *
 * @class
 */
class DiscordRPC {
    public statusInt: NodeJS.Timeout | null = null;

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

            // Initialize the RPC client with IPC transport
            rpc = new Client({
                clientId: traktCredentials.discordClientId,
                transport: {
                    type: 'ipc',
                },
            });

            // Event handler for when the RPC client is ready
            rpc.on('ready', async () => {
                instanceState = ConnectionState.Connected;
                if (progressBar) progressBar.stop();
                progressBar = await generateProgressBar();
                progressBar.start(0, 0);
            });

            // Login to Discord
            await rpc.login();

            // Clear the retryInterval if it exists
            if (retryInterval) clearInterval(retryInterval);

            // Update the status initially
            await trakt.updateStatus(this.statusInt);

            // Set up interval for updating status
            this.statusInt = setInterval(async () => {
                await trakt.updateStatus(this.statusInt);
            }, 15 * 1000);
        } catch (err) {
            instanceState = ConnectionState.Disconnected;
            if (progressBar) progressBar.stop();
            progressBar = await generateProgressBar();
            progressBar.start(0, 0);

            // Start an interval that will decrement countdownTimer each second if disconnected
            countdownTimer = 15;
            // Clear the previous retry
            if (retryInterval) clearInterval(retryInterval);
            retryInterval = setInterval(() => {
                if (countdownTimer > 0 && instanceState === ConnectionState.Disconnected) countdownTimer -= 1;
            }, 1000);

            // Retry the connection to RPC after 15 seconds
            setTimeout(() => {
                this.spawnRPC(trakt);
            }, 15 * 1000);
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
        // Fetch Trakt credentials
        const traktCredentials = await fetchTraktCredentials();

        // Create a new Trakt instance
        this.trakt = new Trakt({
            client_id: traktCredentials.clientId,
            client_secret: traktCredentials.clientSecret,
        });

        // Import Trakt OAuth token
        this.trakt.import_token(traktCredentials.oAuth);

        // Return the Trakt instance
        return this.trakt;
    }

    /**
     * Connects with the Discord RPC and updates the status.
     *
     * @async
     * @param discordStatusInterval - Timeout interval for updating the Discord status.
     */
    async updateStatus(discordStatusInterval: NodeJS.Timeout | null) {
        if (!rpc) return;

        // Check if the RPC transport socket is connected
        if (!rpc.transport.isConnected) {
            // Clear the Discord status interval
            if (discordStatusInterval) clearInterval(discordStatusInterval);

            rpc = null;

            // Respawn the RPC client
            await new DiscordRPC().spawnRPC(this);
            return;
        }

        // Fetch user settings and currently watching content from Trakt
        const user = await this.trakt.users.settings();
        const watching = await this.trakt.users.watching({ username: user.user.username });

        if (watching) {
            if (instanceState !== ConnectionState.Playing && progressBar) {
                progressBar.stop();
                progressBar = null;
            }

            instanceState = ConnectionState.Playing;

            // Prepare Trakt content for Discord RPC
            let traktContent: TraktContent = {
                smallImageKey: 'play',
                largeImageKey: 'trakt',
                startTimestamp: new Date(watching.started_at),
            };

            // Handle different content types (movie or episode)
            if (watching.type === 'movie') {
                traktContent = await this.handleMovie(watching, traktContent);
            } else if (watching.type === 'episode') {
                traktContent = await this.handleEpisode(watching, traktContent);
            }

            // Set Discord activity with Trakt content
            await rpc.user?.setActivity({ ...traktContent });
            return;
        }

        instanceState = ConnectionState.NotPlaying;

        if (progressBar) {
            progressBar.stop();
            progressBar = null;
        }

        // Initialize progress bar if it doesn't exist
        progressBar = await generateProgressBar();
        progressBar.start(0, 0);

        // Clear Discord activity
        await rpc.user?.clearActivity();
    }

    /**
     * Processes a movie object received from Trakt and prepares it for Discord.
     *
     * @private
     * @async
     * @param watching - The movie object from Trakt.
     * @param traktContent - The content to send to Discord.
     * @returns The modified content to send to Discord.
     */
    private async handleMovie(watching: Movie, traktContent: TraktContent): Promise<TraktContent> {
        const { movie } = watching;
        const detail = `${movie.title} (${movie.year})`;

        // Calculate total and elapsed durations in seconds
        const totalDuration = DateTime.fromISO(watching.expires_at).diff(DateTime.fromISO(watching.started_at), 'seconds').seconds;
        const elapsedDuration = DateTime.local().diff(DateTime.fromISO(watching.started_at), 'seconds').seconds;

        // Initialize progress bar if it doesn't exist
        if (!progressBar) {
            progressBar = await generateProgressBar();
            progressBar.start(totalDuration, elapsedDuration, {
                content: detail,
                startedAt: watching.started_at,
                endsAt: watching.expires_at,
                type: 'Movie',
            });
        }

        // If the progressBar instance exists, update its progress with the elapsed duration
        if (progressBar) progressBar.update(elapsedDuration);

        // Update Trakt content details
        return { ...traktContent, details: detail };
    }

    /**
     * Processes a TV show object received from Trakt and prepares it for Discord.
     *
     * @private
     * @async
     * @param watching - The TV show object from Trakt.
     * @param traktContent - The content to send to Discord.
     * @returns The modified content to send to Discord.
     */
    private async handleEpisode(watching: TvShow, traktContent: TraktContent): Promise<TraktContent> {
        const { show, episode } = watching;
        const detail = `${show.title}`;
        const state = `S${episode.season}E${episode.number} (${episode.title})`;

        // Calculate total and elapsed durations in seconds
        const totalDuration = DateTime.fromISO(watching.expires_at).diff(DateTime.fromISO(watching.started_at), 'seconds').seconds;
        const elapsedDuration = DateTime.local().diff(DateTime.fromISO(watching.started_at), 'seconds').seconds;

        // Initialize progress bar if it doesn't exist
        if (!progressBar) {
            progressBar = await generateProgressBar();
            progressBar.start(totalDuration, elapsedDuration, {
                content: `${detail} - ${state}`,
                startedAt: watching.started_at,
                endsAt: watching.expires_at,
                type: 'TV Show',
            });
        }

        // If the progressBar instance exists, update its progress with the elapsed duration
        if (progressBar) progressBar.update(elapsedDuration);

        // Update Trakt content details and state
        return { ...traktContent, details: detail, state };
    }
}

/**
 * Formats a date and time string into a localized time string using the current time zone.
 *
 * @param date - A string representing a date and time.
 * @returns A string representing the formatted time in the local time zone.
 */
function formatDateTime(date: string): string {
    return DateTime.fromISO(date).setZone('local').toLocaleString(DateTime.TIME_SIMPLE);
}

/**
 * Calculates the elapsed duration in seconds between the current time and the specified starting time.
 *
 * @param startedAt - A string representing the starting date and time.
 * @returns The elapsed duration in seconds.
 */
function calculateElapsedDuration(startedAt: string): number {
    return DateTime.local().diff(DateTime.fromISO(startedAt), 'seconds').seconds;
}

/**
 * Generates a string representing a progress bar based on the specified options and parameters.
 *
 * @param options - An object containing optional settings for the progress bar.
 * @param params - An object containing parameters for generating the progress bar.
 * @returns A string representing the generated progress bar.
 */
function generateBarProgress(options: Options, params: Params): string {
    // Calculate the number of complete and incomplete characters based on the progress and bar size.
    const complete = (options.barCompleteString || '').slice(0, Math.round(params.progress * (options.barsize ?? 0)));
    const incomplete = (options.barIncompleteString || '').slice(0, Math.round((1 - params.progress) * (options.barsize ?? 0)));

    // Combine complete and incomplete parts to form the progress bar string.
    // @ts-expect-error [issue with the package not defining 'bright' colors']
    return `${complete.brightRed}${incomplete.green}`;
}

/**
 * Asynchronously generates a progress bar using the provided options and parameters.
 *
 * @returns A `SingleBar` instance representing the generated progress bar.
 */
async function generateProgressBar() {
    // Define a custom format function for the progress bar
    const formatFunction: GenericFormatter = (options, params, payload) => {
        switch (instanceState) {
        case ConnectionState.Playing: {
            // Extract relevant information from the payload
            const {
                startedAt, endsAt, content, type,
            } = payload;

            // Format start and end dates in local time
            const localEndDate = formatDateTime(endsAt);

            // Calculate elapsed duration and format it in a human-readable format
            const elapsedDuration = calculateElapsedDuration(startedAt);

            // Remaining time of content
            const totalDuration = (new Date(endsAt).getTime() - new Date(startedAt).getTime()) / 1000;
            const remainingDuration = Math.max(totalDuration - elapsedDuration, 0);
            const prettyRemainingTime = prettyMilliseconds(remainingDuration * 1000, { secondsDecimalDigits: 0 });

            // Generate progress bar
            const barProgress = generateBarProgress(options, params);

            // Construct the progress bar line with formatted information
            return `🎭 ${`[${type}]`.italic} ${content.yellow} ${barProgress} | Finishes At: ${localEndDate.blue} ⏳  Remaining: ${prettyRemainingTime.blue}`.bold.toString();
        }

        case ConnectionState.NotPlaying:
            return `📅 ${formatDate().green.italic} ${'|'.magenta} ${'Trakt:'.red} ${'Not playing.'}`.bold.toString();

        case ConnectionState.Connected:
            return '🎉 Connected to Discord!'.green.bold.toString();

        case ConnectionState.Disconnected:
            // @ts-expect-error [issue with the package not defining 'bright' colors']
            return `⚠️ ${'Discord connection lost. Retrying in'.red} ${countdownTimer.toString().brightBlue} ${'seconds... '.red}`.bold.toString();

        case ConnectionState.Connecting:
            return '🔒 Connecting to Discord...'.magenta.bold.toString();

        default:
            return `📅 ${formatDate().green.italic} ${'|'.magenta} ${'Trakt:'.red} ${'Not playing.'}`.bold.toString();
        }
    };

    // Create a new SingleBar instance with specified options
    return new SingleBar({
        format: formatFunction,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        clearOnComplete: true,
        linewrap: true,
        fps: 1,
        forceRedraw: true,
    });
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
async function fetchTraktCredentials(): Promise<Configuration> {
    try {
        // Read the configuration file synchronously
        const configData = readFileSync('./config.json', 'utf8');

        // Return the parsed credentials
        return JSON.parse(configData);
    } catch (error) {
        // Handle errors during file reading or JSON parsing
        console.error('Error fetching Trakt credentials:', error);
        process.exit(1);
    }
}

/**
 * Formats the current date and time into a specific format.
 *
 * @returns Returns the current date and time as a string, formatted like '5:12:35 PM'.
 *
 * @example
 * ```typescript
 * console.log(formatDate());
 * ```
 * will log the current time, formatted as described above.
 *
 * This function uses `DateTime` from the `luxon` module to get the current date and time, and format it.
 */
function formatDate(): string {
    const now = DateTime.now();

    return now.toFormat('h:mm:ss a');
}

/**
 * Generates a configuration object for creating a prompt in enquirer's prompt interface.
 *
 * @param type - The type of prompt
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
function generatePromptConfig(type: string, name: string, message: string) {
    return {
        type,
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
async function generateTraktCredentials(): Promise<Configuration | null> {
    console.log(
        `Kindly adhere to the instructions displayed on the screen to authenticate your account.\n${
            '**CRUCIAL: Handle your login credentials with the highest level of privacy and avoid disclosing them. They will be stored in a `config.json` file.\n'.red.italic
        }`,
    );

    return prompt([
        generatePromptConfig('input', 'clientId', 'Please provide your Trakt Client ID:'),
        generatePromptConfig('input', 'clientSecret', 'Please provide your Trakt Client Secret:'),
        generatePromptConfig('input', 'discordClientId', 'Please provide your Discord Client ID:'),
    ]);
}

/**
 * Authorizes Trakt by generating a new Trakt instance, creating and sending a request
 * to acquire an authorization code, and then exchanging that code for a token.
 * The obtained token is then saved into a file named `config.json`.
 * In case the provided token is incorrect, the function logs the error message and terminates the process.
 *
 * @param gen - An object of a type `TraktCredentials` that contains
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
async function authoriseTrakt(gen: Configuration) {
    // Create a Trakt instance with client ID and client secret
    const traktOptions = {
        client_id: gen.clientId,
        client_secret: gen.clientSecret,
    };
    const traktInstance = new Trakt(traktOptions);

    // Get the Trakt authorization URL
    const traktAuthUrl = traktInstance.get_url();

    // Prompt the user to visit the Trakt authorization URL and enter the received code
    const auth = await prompt<Configuration>([
        generatePromptConfig('input', 'oAuth', `Please visit the following link and subsequently, paste the received code into the console:\n${traktAuthUrl}\n`),
    ]);

    // Prepare a TraktCredentials object with essential information
    const updatedCredentials: Configuration = {
        clientId: gen.clientId,
        clientSecret: gen.clientSecret,
        discordClientId: gen.discordClientId,
    };

    try {
        // Exchange the authorization code for an access token
        await traktInstance.exchange_code(auth.oAuth, null);

        // Export the Trakt access token and store it in the credentials object
        updatedCredentials.oAuth = await traktInstance.export_token();
    } catch (error) {
        // Handle errors during the token exchange process
        console.error('\nAn incorrect token has been provided! Please restart the program and try again.'.red.bold);
        process.exit(1);
    }

    // Write the updated credentials to the configuration file
    writeFileSync('./config.json', JSON.stringify(updatedCredentials, null, 3));

    // Prompt the user to restart the program
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
        // Check if the configuration file exists
        if (!existsSync('./config.json')) {
            // Generate Trakt credentials if the file doesn't exist
            const generatedCredentials = await generateTraktCredentials();

            // If credentials were generated, authorize Trakt
            if (generatedCredentials) {
                await authoriseTrakt(generatedCredentials);
            }
        }

        // Create an initial progress bar indicating progress.
        instanceState = ConnectionState.Connecting;
        progressBar = await generateProgressBar();
        progressBar.start(0, 0);

        // Initialize Trakt and Discord RPC
        await initializeTraktAndDiscordRPC();
    } catch (error) {
        // Handle and log errors
        console.error(`\nAn error occurred: ${error}`.red);
        process.exit(1);
    }
}

// Call the main function
await main();
