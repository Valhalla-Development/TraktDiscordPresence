import { existsSync, readFileSync, writeFileSync } from 'fs';
import Enquirer from 'enquirer';
import chalk from 'chalk';
import { Configuration } from './types';
import { TraktInstance } from './services/traktInstance';
import { DiscordRPC } from './services/discordRPC';
import { updateTraktCredentials } from './state/appState';
import { updateProgressBar } from './utils/progressBar';

const { prompt } = Enquirer;

async function fetchTraktCredentials(): Promise<Configuration> {
    try {
        const configData = readFileSync('./config.json', 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Error fetching Trakt credentials:', error);
        process.exit(1);
    }
}

async function generateTraktCredentials(): Promise<Configuration> {
    console.log(chalk.yellow('Please follow the instructions on the screen to authenticate your account.'));
    console.log(chalk.red.italic('IMPORTANT: Keep your login credentials private and do not share them. They will be stored in a `config.json` file.'));

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
    const traktInstance = new TraktInstance();
    await traktInstance.createTrakt();

    console.log(chalk.green('Trakt instance created successfully.'));
    console.log(chalk.yellow('Please authorize the application in your browser.'));

    const auth = await prompt<{ oAuth: string }>({
        type: 'input',
        name: 'oAuth',
        message: 'Please paste the received code here:',
    });

    config.oAuth = auth.oAuth;

    writeFileSync('./config.json', JSON.stringify(config, null, 2));
    console.log(chalk.green('Configuration saved successfully.'));
}

async function main(): Promise<void> {
    try {
        let config: Configuration;

        if (!existsSync('./config.json')) {
            config = await generateTraktCredentials();
            await authoriseTrakt(config);
        } else {
            config = await fetchTraktCredentials();
        }

        updateTraktCredentials(config);

        const traktInstance = new TraktInstance();
        await traktInstance.createTrakt();

        const discordRPC = new DiscordRPC();
        await discordRPC.spawnRPC(traktInstance);

        console.log(chalk.green('Application started successfully.'));

        // Keep the process running
        setInterval(() => {}, 1000);
    } catch (error) {
        console.error(chalk.red(`An error occurred: ${error}`));
        process.exit(1);
    }
}

// Initialize progress bar
updateProgressBar();

// Start the application
main().catch(console.error);
