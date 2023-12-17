import { existsSync, readFileSync, writeFileSync } from 'fs';
import 'colors';
import Enquirer from 'enquirer';
// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import { Client } from 'discord-rpc';
import { DateTime } from 'luxon';
import {
    GenericFormatter, Options, Params, SingleBar,
} from 'cli-progress';
import prettyMilliseconds from 'pretty-ms';

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
            rpc = new Client({ transport: 'ipc' });

            // Event handler for when the RPC client is ready
            rpc.on('ready', () => {
                console.log('Successfully connected to Discord!'.green);
            });

            // Login to Discord using Trakt's Discord client ID
            await rpc.login({ clientId: traktCredentials.discordClientId });

            // Update the status initially
            await trakt.updateStatus(this.statusInt);

            // Set up interval for updating status
            this.statusInt = setInterval(async () => {
                await trakt.updateStatus(this.statusInt);
            }, 15 * 1000);
        } catch (err) {
            // Handle errors and retry after 15 seconds
            console.log('Failed to connect to Discord. Retrying in 15 seconds.'.red, `(${err})`.italic);
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

        // Check if the RPC transport socket is not open
        // @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
        if (rpc.transport.socket.readyState !== 'open') {
            // Clear the Discord status interval
            if (discordStatusInterval) clearInterval(discordStatusInterval);

            // Destroy the RPC client
            await rpc.destroy();
            rpc = null;

            // Stop the progress bar if it exists
            if (progressBar) progressBar.stop();

            // Respawn the RPC client
            await new DiscordRPC().spawnRPC(this);
            return;
        }

        // Fetch user settings and currently watching content from Trakt
        const user = await this.trakt.users.settings();
        const watching = await this.trakt.users.watching({ username: user.user.username });

        if (watching) {
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
            await rpc.setActivity({ ...traktContent });
            return;
        }

        // Stop the progress bar if not watching anything, and it exists
        if (progressBar) progressBar.stop();

        // Log that Trakt is not playing anything
        console.log(`${formatDate()} | ${'Trakt:'.red} Not Playing.`.bold);

        // Clear Discord activity
        await rpc.clearActivity();
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
            });
        }

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
            });
        }

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
    return complete + incomplete;
}

/**
 * Asynchronously generates a progress bar using the provided options and parameters.
 *
 * @returns A `SingleBar` instance representing the generated progress bar.
 */
async function generateProgressBar() {
    // Define a custom format function for the progress bar
    const formatFunction: GenericFormatter = (options, params, payload) => {
        // Extract relevant information from the payload
        const { startedAt, endsAt, content } = payload;

        // Format start and end dates in local time
        const localStartDate = formatDateTime(startedAt);
        const localEndDate = formatDateTime(endsAt);

        // Calculate elapsed duration and format it in a human-readable format
        const elapsedDuration = calculateElapsedDuration(startedAt);
        const prettyDuration = prettyMilliseconds(elapsedDuration * 1000, { secondsDecimalDigits: 0 });

        // Generate progress bar
        const barProgress = generateBarProgress(options, params);

        // Construct the progress bar line with formatted information
        return `${content.cyan.padStart(3)} ${barProgress} Started at ${localStartDate.green.bold} | Ends at ${localEndDate.green.bold} | Time Elapsed: ${prettyDuration.green.bold}`;
    };

    // todo pretty duration started at negative numbers for me idk why

    // Create a new SingleBar instance with specified options
    return new SingleBar({
        format: formatFunction,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
        clearOnComplete: true,
        linewrap: true,
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
async function fetchTraktCredentials(): Promise<TraktCredentials> {
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
async function authoriseTrakt(gen: TraktCredentials) {
    // Create a Trakt instance with client ID and client secret
    const traktOptions = {
        client_id: gen.clientId,
        client_secret: gen.clientSecret,
    };
    const traktInstance = new Trakt(traktOptions);

    // Get the Trakt authorization URL
    const traktAuthUrl = traktInstance.get_url();

    // Prompt the user to visit the Trakt authorization URL and enter the received code
    const auth = await prompt<TraktCredentials>([
        generatePromptConfig('oAuth', `Please visit the following link and subsequently, paste the received code into the console:\n${traktAuthUrl}\n`),
    ]);

    // Prepare a TraktCredentials object with essential information
    const updatedCredentials: TraktCredentials = {
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
        console.log('\nAn incorrect token has been provided! Please restart the program and try again.'.red.bold);
        console.error(error);
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
