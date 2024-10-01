import { existsSync, readFileSync, writeFileSync } from 'fs';
import Enquirer from 'enquirer';
import chalk from 'chalk';
import { Configuration } from './types';
import { TraktInstance } from './services/traktInstance.js';
import { DiscordRPC } from './services/discordRPC.js';
import { updateTraktCredentials } from './state/appState.js';
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

    console.log(chalk.green('\nTrakt instance created successfully.'));
    console.log(chalk.yellow('Please authorize the application in your browser.'));

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
        config.oAuth = JSON.stringify(token);
        updateTraktCredentials(config);
        writeFileSync('./config.json', JSON.stringify(config, null, 2));
        console.log(chalk.green('\nConfiguration saved successfully.'));
    } catch (error) {
        console.error(chalk.red('\nFailed to exchange code for token:'), error);
        throw error;
    }
}

async function ensureAuthentication(): Promise<Configuration> {
    let config: Configuration;

    if (!existsSync('./config.json')) {
        config = await generateTraktCredentials();
        await authoriseTrakt(config);
    } else {
        try {
            config = await fetchTraktCredentials();
            updateTraktCredentials(config);
        } catch (error) {
            console.error(chalk.red('Failed to read existing configuration. Generating new credentials.'));
            config = await generateTraktCredentials();
            await authoriseTrakt(config);
        }
    }

    return config;
}

async function startApplication(config: Configuration): Promise<void> {
    console.log(chalk.cyan('\nInitializing application...'));

    const traktInstance = new TraktInstance();
    await traktInstance.createTrakt();

    console.log(chalk.cyan('Connecting to Discord...'));

    const discordRPC = new DiscordRPC();
    await discordRPC.spawnRPC(traktInstance);

    console.log(chalk.green('\nApplication started successfully.'));
    console.log(chalk.yellow('You can now start using Trakt. Your Discord status will update automatically.\n'));

    // Initialize the progress bar after all console logs
    initializeProgressBar();
}

async function main(): Promise<void> {
    try {
        console.log(chalk.bold.magenta('\n=== Trakt Discord RPC ===\n'));
        const config = await ensureAuthentication();
        await startApplication(config);
    } catch (error) {
        console.error(chalk.red(`\nAn error occurred: ${error}`));
        process.exit(1);
    }
}

// Start the application
main().catch(console.error);
