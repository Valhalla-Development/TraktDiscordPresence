const Trakt = require('trakt.tv');
const fs = require('fs');
const { prompt } = require('enquirer');

// If the config file does not exist, run the questios() function, which will create the file and auth the account
if (!fs.existsSync('./config.json')) {
	questions();
	return;
}

// Fetching the data from config.json
const { clientId, clientSecret, oAuth } = require('./config.json');

// Checks if the oAuth has expired and runs tokenExpired() function if it has
if (Date.now() > oAuth.expires) {
	tokenExpired(clientId, clientSecret);
}

// Trakt client options
const options = {
	client_id: clientId,
	client_secret: clientSecret
};

// Spawn new Trakt client with options
const trakt = new Trakt(options);
trakt.import_token(oAuth);

async function questions() {
	console.log('Please follow the on-screen instructions on authorizing your account.\n**NOTE: Your credentials are private and should not be shared, your credentials will be stored in a file called `config.json`.\n');

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

	try {
		await qTrakt.exchange_code(auth.oAuth, null);
		const token = await qTrakt.export_token();
		arr.oAuth = token;
	} catch {
		console.log('\nAn invalid token was provided! Please try again by restarting the program.');
		process.exit(1);
	}

	await fs.writeFileSync('./config.json', JSON.stringify(arr, null, 3));

	console.log('\nPlease restart this program.');
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
		console.log('\nAn invalid token was provided! Please try again by restarting the program.');
		process.exit(1);
	}

	console.log('\nPlease restart this program.');
	process.exit(1);
}
