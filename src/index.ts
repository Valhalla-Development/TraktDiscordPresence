import 'colors';
import { existsSync } from 'fs';
import Enquirer from 'enquirer';

// Extract repetitive structure into a separate function
function generatePromptConfig(name: string, message: string) {
    return {
        type: 'input',
        name,
        message,
    };
}

async function generateTraktCredentials(): Promise<string | null> {
    const { prompt } = Enquirer;

    console.log(
        `Please follow the on-screen instructions to authorize your account.\n${
            '**IMPORTANT: Treat your credentials with utmost privacy; avoid sharing them. They will be stored in a file named `config.json`.\n'.red.italic
        }`,
    );

    // Utilize the newly defined function to create prompt config
    return prompt<string>([
        generatePromptConfig('clientId', 'Please provide your Trakt Client ID:'),
        generatePromptConfig('clientSecret', 'Please provide your Trakt Client Secret:'),
        generatePromptConfig('discordClientId', 'Please provide your Discord Client ID:'),
    ]);
}

async function main() {
    try {
        // Execute the function to generate configuration if it doesn't already exist
        if (!existsSync('./config.json')) {
            await generateTraktCredentials();
        }
    } catch (error) {
        console.error(`\nAn error occurred: ${error}`.red);
        process.exitCode = 1;
    }
}

// Execute the main function
main();
