import chalk from 'chalk';
import { DiscordRPC } from './services/discordRPC.ts';
import { TraktInstance } from './services/traktInstance.ts';
import {
    appState,
    updateInstanceState,
    updateTraktCredentials,
    updateTraktInstance,
} from './state/appState.js';
import { type Configuration, ConnectionState } from './types/index.d';
import { initializeProgressBar } from './utils/progressBar.js';
import {
    MAX_SETTIMEOUT_MS,
    persistToken,
    readAuth,
    remainingMs,
    shouldRefreshToken,
} from './utils/traktToken.ts';

const discordRPC = new DiscordRPC();
let refreshTimeoutId: NodeJS.Timeout | null = null;

function createTraktInstance(): TraktInstance {
    return new TraktInstance(discordRPC);
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
    const token = appState.traktCredentials?.oAuth;
    if (!(appState.traktInstance && token)) {
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
        const nextToken = appState.traktCredentials?.oAuth;
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
        if (!appState.traktInstance) {
            // Create a new instance if it doesn't exist
            const traktInstance = createTraktInstance();
            await traktInstance.createTrakt();
            updateTraktInstance(traktInstance);
        }

        // Only refresh if needed
        if (shouldRefreshToken(appState.traktCredentials?.oAuth)) {
            const newToken = await appState.traktInstance!.refreshToken();

            // Validate the new token
            if (!(newToken?.access_token && newToken.refresh_token)) {
                throw new Error('Invalid token received from refresh');
            }

            persistToken(newToken);
        }
    } catch (refreshError) {
        // If refresh fails, attempt to re-authenticate
        try {
            if (!appState.traktCredentials) {
                throw new Error('Authentication failed: No credentials available', {
                    cause: refreshError,
                });
            }
            await authoriseTrakt(appState.traktCredentials);
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

async function authoriseTrakt(config: Configuration): Promise<void> {
    if (!appState.traktInstance) {
        const traktInstance = createTraktInstance();
        await traktInstance.createTrakt();
        updateTraktInstance(traktInstance);
    }

    try {
        console.log(chalk.blue('\nStarting device authentication flow...'));
        const token = await appState.traktInstance!.getDeviceAuthentication();

        persistToken(token, config);

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
        const config = loadConfig();

        // Check for stored token first
        const storedToken = readAuth();
        if (storedToken) {
            try {
                updateTraktCredentials({
                    ...config,
                    oAuth: storedToken,
                });

                // Initialize the TraktInstance
                const traktInstance = createTraktInstance();
                await traktInstance.createTrakt();
                updateTraktInstance(traktInstance);

                // Set up token refresh (immediately and every 20 hours)
                await setupTokenRefresh();

                return;
            } catch {
                console.warn(chalk.yellow('Failed to load stored token, will authenticate again'));
            }
        }

        // No valid stored token, need to authenticate
        updateTraktCredentials(config);
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
    updateInstanceState(ConnectionState.Connecting);
    initializeProgressBar();

    if (!appState.traktInstance) {
        const traktInstance = createTraktInstance();
        await traktInstance.createTrakt();
        updateTraktInstance(traktInstance);
    }

    await discordRPC.spawnRPC(appState.traktInstance!);
}

function cleanup() {
    discordRPC.destroy();
    if (appState.retryInterval) {
        clearInterval(appState.retryInterval);
    }
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
