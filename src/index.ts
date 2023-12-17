import 'colors';
import { existsSync, writeFileSync } from 'fs';
import Enquirer from 'enquirer';
// @ts-ignore
import Trakt from 'trakt.tv';

const { prompt } = Enquirer;

interface TraktCredentials {
    clientId: string;
    clientSecret: string;
    discordClientId: string;
    oAuth?: string;
}

// Extract repetitive structure into a separate function
function generatePromptConfig(name: string, message: string) {
    return {
        type: 'input',
        name,
        message,
    };
}

async function generateTraktCredentials(): Promise<TraktCredentials | null> {
    console.log(
        `Kindly adhere to the instructions displayed on the screen to authenticate your account.\n${
            '**CRUCIAL: Handle your login credentials with the highest level of privacy and avoid disclosing them. They will be stored in a `config.json` file.\n'.red.italic
        }`,
    );

    // Utilize the newly defined function to create prompt config
    return prompt([
        generatePromptConfig('clientId', 'Please provide your Trakt Client ID:'),
        generatePromptConfig('clientSecret', 'Please provide your Trakt Client Secret:'),
        generatePromptConfig('discordClientId', 'Please provide your Discord Client ID:'),
    ]);
}

async function authoriseTrakt(gen: TraktCredentials) {
    const qOptions = {
        client_id: gen.clientId,
        client_secret: gen.clientSecret,
    };

    const qTrakt = new Trakt(qOptions);

    const traktAuthUrl = qTrakt.get_url();

    const auth = await prompt<TraktCredentials>([
        generatePromptConfig('oAuth', `Please visit the following link and subsequently, paste the received code into the console:\n${traktAuthUrl}\n`),
    ]);

    const arr: TraktCredentials = {
        clientId: gen.clientId,
        clientSecret: gen.clientSecret,
        discordClientId: gen.discordClientId,
    };

    try {
        await qTrakt.exchange_code(auth.oAuth, null);
        const token = await qTrakt.export_token();
        arr.oAuth = token;
    } catch {
        console.log('\nAn incorrect token has been provided! Please restart the program and try again.'.red); process.exit(1);
    }

    writeFileSync('./config.json', JSON.stringify(arr, null, 3));

    console.log('\nPlease restart this program.'.green);
    process.exit(1);
}

async function main() {
    try {
        // Execute the function to generate configuration if it doesn't already exist
        if (!existsSync('./config.json')) {
            const gen = await generateTraktCredentials();
            if (gen) await authoriseTrakt(gen);
        }
    } catch (error) {
        console.error(`\nAn error occurred: ${error}`.red);
        process.exit(1);
    }
}

// Execute the main function
main();
