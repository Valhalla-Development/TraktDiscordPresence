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

// 20 hours in milliseconds
const REFRESH_INTERVAL = 20 * 60 * 60 * 1000;
let refreshIntervalId: NodeJS.Timeout | null = null;

async function checkEnvironmentVariables() {
    const requiredEnvVars = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'DISCORD_CLIENT_ID'];
    const missing = requiredEnvVars.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        console.error(chalk.red(`\nMissing required environment variables: ${missing.join(', ')}`));
        process.exit(1);
    }
}

async function refreshAndSaveToken(): Promise<void> {
    try {
        if (!appState.traktInstance) {
            // Create a new instance if it doesn't exist
            const traktInstance = new TraktInstance();
            await traktInstance.createTrakt();
            updateTraktInstance(traktInstance);
        }

        // Refresh the token
        const newToken = await appState.traktInstance!.refreshToken();

        // Save the new token to the auth file
        writeFileSync(AUTH_FILE, JSON.stringify(newToken, null, 2));

        // Update the app state with the new token
        if (appState.traktCredentials) {
            const updatedConfig = {
                ...appState.traktCredentials,
                oAuth: JSON.stringify(newToken),
            };
            updateTraktCredentials(updatedConfig);
        }
    } catch (error) {
        console.warn(chalk.yellow('Token refresh failed, continuing with existing token'), error);
    }
}

async function setupTokenRefresh(): Promise<void> {
    // Refresh token immediately on start
    await refreshAndSaveToken();

    // Set up interval to refresh token every 20 hours
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }

    refreshIntervalId = setInterval(async () => {
        await refreshAndSaveToken();
    }, REFRESH_INTERVAL);
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
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
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
