const Trakt = require('trakt.tv');
const DiscordRPC = require('discord-rpc');
const fs = require('fs');
const { prompt } = require('enquirer');
const { DateTime } = require('luxon');
const chalk = require('chalk');

// If the config file does not exist, run the questios() function, which will create the file and auth the account
if (!fs.existsSync('./config.json')) {
	questions();
	return;
}

// Fetching the data from config.json
const { clientId, clientSecret, oAuth, discordClientId } = require('./config.json');

// Checks if the oAuth has expired and runs tokenExpired() function if it has
if (Date.now() > oAuth.expires) {
	tokenExpired(clientId, clientSecret);
	return;
}

// Trakt client options
const options = {
	client_id: clientId,
	client_secret: clientSecret
};

// Spawn new Trakt client with options
const trakt = new Trakt(options);
trakt.import_token(oAuth);

// Create the Discord RPC client
// Create client

// Set rpc as null
let rpc;

const spawnRPC = async () => {
	try {
		// Attempt to spawn an RPC Client
		rpc = new DiscordRPC.Client({ transport: 'ipc' });

		// Log when error is thrown
		rpc.on('error', (err) => {
			console.log(err);
		});
		// Log when connected
		await rpc.on('ready', () => {
			console.log(chalk.green.bold('Successfully connected to Discord!'));
		});
		// Attempt to log in
		await rpc.login({ clientId: discordClientId });
		// Update status
		updateStatus();

		// Update status every 15 seconds
		setInterval(() => {
			updateStatus();
		}, 15000);
	} catch (err) {
		console.log(chalk.red.bold('Failed to connect to Discord. Retrying in 15 seconds.'));
		// Retry every 15 seconds until successful.
		setTimeout(() => {
			spawnRPC();
		}, 15000);
		return;
	}
};

// Spawn the RPC
spawnRPC();

// Get Trakt user
async function updateStatus() {
	// TODO Check if RPC is still connected
	const user = await trakt.users.settings();
	const watching = await trakt.users.watching({ username: user.user.username });

	if (watching) {
		const type = {};

		type.smallImageKey = 'play';
		type.largeImageKey = 'trakt';
		type.startTimestamp = new Date(watching.started_at);

		// Set the activity
		if (watching.type === 'movie') {
			const { movie } = watching;
			type.details = `${movie.title} (${movie.year})`;
		} else if (watching.type === 'episode') {
			const { show, episode } = watching;
			type.details = `${show.title}`;
			type.state = `S${episode.season}E${episode.number} (${episode.title})`;
		}
		rpc.setActivity({ ...type });

		console.log(`${formatDate()} | ${chalk.red.bold.underline('Trakt Playing:')} ${type.details}${type.state ? ` - ${type.state}` : ''}`);
	} else {
		// Check if the user is currently watching something and if not, run on a timeout.
		console.log(`${formatDate()} | ${chalk.red.bold.underline('Trakt:')} Not Playing.`);
		rpc.clearActivity();
	}
}

// Function to ask the user for their Trakt credentials
async function questions() {
	console.log(chalk.green.bold('Please follow the on-screen instructions on authorizing your account.\n**NOTE: Your credentials are private and should not be shared, your credentials will be stored in a file called `config.json`.\n'));

	const response = await prompt([
		{
			type: 'input',
			name: 'clientId',
			message: 'What is your Trakt Client ID?'
		},
		{
			type: 'input',
			name: 'clientSecret',
			message: 'What is your Trakt Client Secret?'
		},
		{
			type: 'input',
			name: 'discordClientId',
			message: 'What is your Discord Client ID?'
		}
	]).catch(() => {
		console.error('The user aborted the request.');
		process.exit(1);
	});

	const qOptions = {
		client_id: response.clientId,
		client_secret: response.clientSecret
	};

	const qTrakt = new Trakt(qOptions);

	const traktAuthUrl = qTrakt.get_url();

	const auth = await prompt([
		{
			type: 'input',
			name: 'oAuth',
			message: `Please go to the follow link and then paste the code into the console:\n${traktAuthUrl}\n`
		}
	]).catch(() => {
		console.error('The user aborted the request.');
		process.exit(1);
	});

	const arr = {};
	arr.clientId = response.clientId;
	arr.clientSecret = response.clientSecret;
	arr.discordClientId = response.discordClientId;

	try {
		await qTrakt.exchange_code(auth.oAuth, null);
		const token = await qTrakt.export_token();
		arr.oAuth = token;
	} catch {
		console.log(chalk.red.bold('\nAn invalid token was provided! Please try again by restarting the program.'));
		process.exit(1);
	}

	await fs.writeFileSync('./config.json', JSON.stringify(arr, null, 3));

	console.log(chalk.green.bold('\nPlease restart this program.'));
	process.exit(1);
}

// Function to manually re-auth Trakt
async function tokenExpired(id, secret) {
	const rOptions = {
		client_id: id,
		client_secret: secret
	};

	const rTrakt = new Trakt(rOptions);

	const traktAuthUrl = rTrakt.get_url();

	const reAuth = await prompt([
		{
			type: 'input',
			name: 'oAuth',
			message: `Your Trakt token has expired, please regenerate one by going to the following link and pasting the code in the console:\n${traktAuthUrl}\n`
		}
	]).catch(() => {
		console.error('The user aborted the request.');
		process.exit(1);
	});

	try {
		await rTrakt.exchange_code(reAuth.oAuth, null);
		const token = await rTrakt.export_token();
		const config = require('./config');
		config.oAuth = token;
		fs.writeFileSync('./config.json', JSON.stringify(config, null, 3));
	} catch {
		console.log(chalk.red.bold('\nAn invalid token was provided! Please try again by restarting the program.'));
		process.exit(1);
	}

	console.log(chalk.green.bold('\nPlease restart this program.'));
	process.exit(1);
}

// Function to format the current date
function formatDate() {
	const now = DateTime.now();

	return chalk.green.italic(`${now.toLocaleString(DateTime.DATE_HUGE)} - ${now.toLocaleString(DateTime.TIME_WITH_SHORT_OFFSET)}`);
}
