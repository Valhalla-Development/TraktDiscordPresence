import { existsSync, readFileSync, writeFileSync } from 'fs';
import Enquirer from 'enquirer';
import chalk from 'chalk';
import { Configuration, ConnectionState } from './types';
import { TraktInstance } from './services/traktInstance.js';
import { DiscordRPC } from './services/discordRPC.js';
import { updateTraktCredentials, updateInstanceState } from './state/appState.js';
import { initializeProgressBar } from './utils/progressBar.js';

const { prompt } = Enquirer;

async function fetchTraktCredentials(): Promise<Configuration> {
    try {
        const configData = readFileSync('./config.json', 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error fetching Trakt credentials:', error);
        throw error;
    }
}

async function generateTraktCredentials(): Promise<Configuration> {
    console.log(chalk.yellow('Please follow the instructions on the screen to authenticate your account.'));
    console.log(chalk.red.italic('IMPORTANT: Keep your login credentials private and do not share them. They will be stored in a `config.json` file.\n'));

    return prompt([
        {
            type: 'input',
            name: 'clientId',
            message: 'Please provide your Trakt Client ID:',
        },
        {
            type: 'input',
            name: 'clientSecret',
            message: 'Please provide your Trakt Client Secret:',
        },
        {
            type: 'input',
            name: 'discordClientId',
            message: 'Please provide your Discord Client ID:',
        },
    ]);
}

async function authoriseTrakt(config: Configuration): Promise<void> {
    updateTraktCredentials(config);
    const traktInstance = new TraktInstance();
    await traktInstance.createTrakt();

    const authUrl = await traktInstance.getAuthorizationUrl();
    console.log(chalk.blue('\nPlease visit this URL to authorize:'));
    console.log(chalk.blue.underline(authUrl));

    const auth = await prompt<{ code: string }>({
        type: 'input',
        name: 'code',
        message: 'Please paste the received code here:',
    });

    try {
        const token = await traktInstance.exchangeCodeForToken(auth.code);
        const updatedConfig = {
            ...config,
            oAuth: JSON.stringify(token),
        };
        updateTraktCredentials(updatedConfig);
        writeFileSync('./config.json', JSON.stringify(updatedConfig, null, 2));

        // Clear the console after successful authentication
        console.clear();
    } catch (error) {
        console.error(chalk.red('\nFailed to exchange code for token:'), error);
        throw error;
    }
}

async function ensureAuthentication(): Promise<void> {
    if (!existsSync('./config.json')) {
        const config = await generateTraktCredentials();
        await authoriseTrakt(config);
    } else {
        try {
            const config = await fetchTraktCredentials();
            updateTraktCredentials(config);
        } catch {
            console.error(chalk.red('Failed to read existing configuration. Generating new credentials.'));
            const config = await generateTraktCredentials();
            await authoriseTrakt(config);
        }
    }
}

async function startApplication(): Promise<void> {
    updateInstanceState(ConnectionState.Connecting);
    initializeProgressBar();

    const traktInstance = new TraktInstance();
    await traktInstance.createTrakt();

    const discordRPC = new DiscordRPC();
    await discordRPC.spawnRPC(traktInstance);
}

async function main(): Promise<void> {
    try {
        await ensureAuthentication();
        await startApplication();
    } catch (error) {
        console.error(chalk.red(`\nAn error occurred: ${error}`));
        process.exit(1);
    }
}

// Start the application
main().catch(console.error);
