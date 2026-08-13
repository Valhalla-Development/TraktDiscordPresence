import chalk from 'chalk';
import { AuthSession } from './auth.ts';
import { DiscordRPC } from './services/discordRPC.ts';
import { PresenceLoop } from './services/presenceLoop.ts';
import { ConnectionState } from './types/index.d';
import { initializeProgressBar, setInstanceState } from './utils/progressBar.ts';

async function startPresence(auth: AuthSession, discordRPC: DiscordRPC): Promise<void> {
    setInstanceState(ConnectionState.Connecting);
    initializeProgressBar();

    const presenceLoop = new PresenceLoop(auth.trakt, discordRPC);
    discordRPC.setStatusHandler(() => presenceLoop.tick());
    await discordRPC.spawnRPC();
}

async function main(): Promise<void> {
    const config = AuthSession.loadConfig();
    const auth = await AuthSession.start(config);
    const discordRPC = new DiscordRPC(() => auth.getClientId());

    function cleanup() {
        discordRPC.destroy();
        auth.stopRefresh();
    }

    auth.setFatalHandler(cleanup);

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

    try {
        await startPresence(auth, discordRPC);
    } catch (error) {
        console.error(chalk.red(`\nAn error occurred: ${error}`));
        cleanup();
        process.exit(1);
    }
}

// Start the application
main().catch(console.error);
