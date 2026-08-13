import chalk from 'chalk';
import { DiscordRPC } from './services/discordRPC.ts';
import { PresenceLoop } from './services/presenceLoop.ts';
import { TraktInstance } from './services/traktInstance.ts';
import { type Configuration, ConnectionState } from './types/index.d';
import { initializeProgressBar, setInstanceState } from './utils/progressBar.ts';
import {
    MAX_SETTIMEOUT_MS,
    persistToken,
    readAuth,
    remainingMs,
    shouldRefreshToken,
} from './utils/traktToken.ts';

let config: Configuration;
let trakt: TraktInstance | null = null;
const discordRPC = new DiscordRPC(() => config.discordClientId);
let refreshTimeoutId: NodeJS.Timeout | null = null;

function createTraktInstance(nextConfig: Configuration): TraktInstance {
    return new TraktInstance(nextConfig, (updated) => {
        config = updated;
    });
}

function loadConfig(): Configuration {
    const requiredEnvVars = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'];
    const missing = requiredEnvVars.filter((key) => !process.env[key]);

    const fallback = process.env.DISCORD_CLIENT_ID;
    const movieDiscordClientId = process.env.MOVIE_DISCORD_CLIENT_ID || fallback;
    const seriesDiscordClientId = process.env.SERIES_DISCORD_CLIENT_ID || fallback;

    if (!(movieDiscordClientId && seriesDiscordClientId)) {
        missing.push(
            'DISCORD_CLIENT_ID (or both MOVIE_DISCORD_CLIENT_ID and SERIES_DISCORD_CLIENT_ID)'
        );
    }

    if (missing.length > 0) {
        console.error(chalk.red(`\nMissing required environment variables: ${missing.join(', ')}`));
        process.exit(1);
    }

    return {
        clientId: process.env.TRAKT_CLIENT_ID!,
        clientSecret: process.env.TRAKT_CLIENT_SECRET!,
        discordClientId: movieDiscordClientId!,
        movieDiscordClientId: movieDiscordClientId!,
        seriesDiscordClientId: seriesDiscordClientId!,
    };
}

async function scheduleNextRefresh(): Promise<void> {
    const token = config.oAuth;
    if (!(trakt && token)) {
        return;
    }

    // Clear any existing timeout
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = null;
    }

    let delay = remainingMs(token);
    if (delay <= 0) {
        await refreshAndSaveToken();
        const nextToken = config.oAuth;
        if (nextToken && remainingMs(nextToken) > 0) {
            await scheduleNextRefresh();
        }
        return;
    }

    // Check if value is too large for a 32-bit signed integer
    if (delay > MAX_SETTIMEOUT_MS) {
        delay = MAX_SETTIMEOUT_MS;
    }

    // Schedule the next refresh
    refreshTimeoutId = setTimeout(async () => {
        try {
            await refreshAndSaveToken();
            await scheduleNextRefresh();
        } catch (error) {
            console.error(chalk.red('Failed to refresh token:'), error);
        }
    }, delay);
}

async function refreshAndSaveToken(): Promise<void> {
    try {
        if (!trakt) {
            // Create a new instance if it doesn't exist
            trakt = createTraktInstance(config);
            await trakt.createTrakt();
        }

        // Only refresh if needed
        if (shouldRefreshToken(config.oAuth)) {
            const newToken = await trakt.refreshToken();

            // Validate the new token
            if (!(newToken.access_token && newToken.refresh_token)) {
                throw new Error('Invalid token received from refresh');
            }

            trakt.setConfig(persistToken(newToken, config));
        }
    } catch {
        // If refresh fails, attempt to re-authenticate
        try {
            await authoriseTrakt(config);
        } catch (authError) {
            console.error(
                chalk.red('Authentication failed. Please check your credentials and try again.'),
                authError
            );
            cleanup();
            process.exit(1);
        }
    }
}

async function setupTokenRefresh(): Promise<void> {
    // Schedule the first refresh based on token expiration
    await scheduleNextRefresh();
}

async function authoriseTrakt(nextConfig: Configuration): Promise<void> {
    if (!trakt) {
        trakt = createTraktInstance(nextConfig);
        await trakt.createTrakt();
    }

    try {
        console.log(chalk.blue('\nStarting device authentication flow...'));
        const token = await trakt.getDeviceAuthentication();

        trakt.setConfig(persistToken(token, trakt.getConfig()));

        console.log(chalk.green('\nAuthentication token saved successfully'));

        // Clear the console after successful authentication
        console.clear();
    } catch (error) {
        console.error(chalk.red('\nFailed to authenticate:'), error);
        throw error;
    }
}

async function ensureAuthentication(): Promise<void> {
    try {
        config = loadConfig();

        // Check for stored token first
        const storedToken = readAuth();
        if (storedToken) {
            try {
                config = {
                    ...config,
                    oAuth: storedToken,
                };

                // Initialize the TraktInstance
                trakt = createTraktInstance(config);
                await trakt.createTrakt();

                // Set up token refresh (immediately and every 20 hours)
                await setupTokenRefresh();

                return;
            } catch {
                console.warn(chalk.yellow('Failed to load stored token, will authenticate again'));
            }
        }

        // No valid stored token, need to authenticate
        await authoriseTrakt(config);

        // After initial authentication, set up token refresh
        await setupTokenRefresh();
    } catch (error) {
        console.error(
            chalk.red(
                'Failed to read environment variables. Please ensure the environment variables are set correctly.'
            ),
            error
        );
        process.exit(1);
    }
}

async function startApplication(): Promise<void> {
    setInstanceState(ConnectionState.Connecting);
    initializeProgressBar();

    if (!trakt) {
        trakt = createTraktInstance(config);
        await trakt.createTrakt();
    }

    const presenceLoop = new PresenceLoop(trakt, discordRPC);
    discordRPC.setStatusHandler(() => presenceLoop.tick());
    await discordRPC.spawnRPC();
}

function cleanup() {
    discordRPC.destroy();
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
    }
}

process.on('SIGINT', () => {
    cleanup();
    console.log('SIGINT received, exiting...');
    process.exit();
});

process.on('SIGTERM', () => {
    cleanup();
    console.log('SIGTERM received, exiting...');
    process.exit();
});

async function main(): Promise<void> {
    try {
        await ensureAuthentication();
        await startApplication();
    } catch (error) {
        console.error(chalk.red(`\nAn error occurred: ${error}`));
        cleanup();
        process.exit(1);
    }
}

// Start the application
main().catch(console.error);
