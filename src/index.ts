import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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

const AUTH_FILE = path.join('auth.json');
let refreshTimeoutId: NodeJS.Timeout | null = null;

function checkEnvironmentVariables() {
    const requiredEnvVars = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'DISCORD_CLIENT_ID'];
    const missing = requiredEnvVars.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        console.error(chalk.red(`\nMissing required environment variables: ${missing.join(', ')}`));
        process.exit(1);
    }
}

function scheduleNextRefresh(): void {
    if (!(appState.traktInstance && appState.traktCredentials?.oAuth)) {
        return;
    }

    // Clear any existing timeout
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
    }

    const token = JSON.parse(appState.traktCredentials.oAuth);
    const timeUntilRefresh = appState.traktInstance.calculateTimeUntilRefresh(token);

    // Schedule the next refresh
    refreshTimeoutId = setTimeout(async () => {
        try {
            await refreshAndSaveToken();
            scheduleNextRefresh();
        } catch (error) {
            console.error(chalk.red('Failed to refresh token:'), error);
        }
    }, timeUntilRefresh);
}

async function refreshAndSaveToken(): Promise<void> {
    try {
        if (!appState.traktInstance) {
            // Create a new instance if it doesn't exist
            const traktInstance = new TraktInstance();
            await traktInstance.createTrakt();
            updateTraktInstance(traktInstance);
        }

        // Only refresh if needed
        if (appState.traktInstance!.shouldRefreshToken()) {
            const newToken = await appState.traktInstance!.refreshToken();

            // Validate the new token
            if (!(newToken?.access_token && newToken.refresh_token)) {
                throw new Error('Invalid token received from refresh');
            }

            writeFileSync(AUTH_FILE, JSON.stringify(newToken, null, 2));

            // Update the app state with the new token
            if (appState.traktCredentials) {
                const updatedConfig = {
                    ...appState.traktCredentials,
                    oAuth: JSON.stringify(newToken),
                };
                updateTraktCredentials(updatedConfig);
            }
        }
    } catch (_error) {
        // If refresh fails, attempt to re-authenticate
        try {
            if (appState.traktCredentials) {
                await authoriseTrakt(appState.traktCredentials);
            } else {
                throw new Error('Authentication failed: No credentials available');
            }
        } catch (_authError) {
            console.error(
                chalk.red('Authentication failed. Please check your credentials and try again.')
            );
            cleanup();
            process.exit(1);
        }
    }
}

function setupTokenRefresh(): void {
    // Schedule the first refresh based on token expiration
    scheduleNextRefresh();
}

async function authoriseTrakt(config: Configuration): Promise<void> {
    if (!appState.traktInstance) {
        const traktInstance = new TraktInstance();
        await traktInstance.createTrakt();
        updateTraktInstance(traktInstance);
    }

    try {
        console.log(chalk.blue('\nStarting device authentication flow...'));
        const token = await appState.traktInstance!.getDeviceAuthentication();

        const updatedConfig = {
            ...config,
            oAuth: JSON.stringify(token),
        };
        updateTraktCredentials(updatedConfig);

        // Save the token
        writeFileSync(AUTH_FILE, JSON.stringify(token, null, 2));
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
        await checkEnvironmentVariables();

        // Create a configuration object from environment variables
        const config: Configuration = {
            clientId: process.env.TRAKT_CLIENT_ID!,
            clientSecret: process.env.TRAKT_CLIENT_SECRET!,
            discordClientId: process.env.DISCORD_CLIENT_ID!,
        };

        // Check for stored token first
        if (existsSync(AUTH_FILE)) {
            try {
                // Fetch existing token
                const storedToken = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));

                // Check for invalid token data before proceeding  
                const MAX_REASONABLE_TOKEN_LIFE = 86_400; // 24 hours
                if (storedToken.expires_in > MAX_REASONABLE_TOKEN_LIFE) {
                    console.log(chalk.yellow('🔄 Expired token detected, starting authentication...'));
                    // Skip to fresh authentication
                    updateTraktCredentials(config);
                    await authoriseTrakt(config);
                    setupTokenRefresh();
                    return;
                }

                const configWithToken = {
                    ...config,
                    oAuth: JSON.stringify(storedToken),
                };
                updateTraktCredentials(configWithToken);

                // Initialize the TraktInstance
                const traktInstance = new TraktInstance();
                await traktInstance.createTrakt();
                updateTraktInstance(traktInstance);

                // Set up token refresh (immediately and every 20 hours)
                setupTokenRefresh();

                return;
            } catch {
                console.warn(chalk.yellow('Failed to load stored token, will authenticate again'));
            }
        }

        // No valid stored token, need to authenticate
        updateTraktCredentials(config);
        await authoriseTrakt(config);

        // After initial authentication, set up token refresh
        setupTokenRefresh();
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
        const traktInstance = new TraktInstance();
        await traktInstance.createTrakt();
        updateTraktInstance(traktInstance);
    }

    const discordRPC = new DiscordRPC();
    await discordRPC.spawnRPC(appState.traktInstance!);
}

function cleanup() {
    if (appState.retryInterval) {
        clearInterval(appState.retryInterval);
    }
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
    }
    if (appState.rpc) {
        appState.rpc.destroy();
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
