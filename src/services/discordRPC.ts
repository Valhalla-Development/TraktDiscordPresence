import { Client } from '@xhayper/discord-rpc';
import { ConnectionState, Configuration } from '../types';
import { TraktInstance } from './traktInstance';
import { updateProgressBar } from '../utils/progressBar';
import {
    appState, updateInstanceState, updateRPC, updateRetryInterval, updateCountdownTimer,
} from '../state/appState';

export class DiscordRPC {
    private statusInterval: NodeJS.Timeout | null = null;

    async spawnRPC(trakt: TraktInstance, traktCredentials: Configuration): Promise<void> {
        try {
            const rpc = new Client({
                clientId: traktCredentials.discordClientId,
                transport: { type: 'ipc' },
            });

            rpc.on('ready', async () => {
                updateInstanceState(ConnectionState.Connected);
                await updateProgressBar();
            });

            await rpc.login();
            updateRPC(rpc);

            if (appState.retryInterval) {
                clearInterval(appState.retryInterval);
                updateRetryInterval(null);
            }

            await trakt.updateStatus();

            this.statusInterval = setInterval(() => trakt.updateStatus(), 15000);
        } catch (err) {
            console.error('Failed to connect to Discord:', err);
            await this.handleConnectionFailure(trakt);
        }
    }

    private async handleConnectionFailure(trakt: TraktInstance): Promise<void> {
        updateInstanceState(ConnectionState.Disconnected);
        await updateProgressBar();

        updateCountdownTimer(15);
        if (appState.retryInterval) {
            clearInterval(appState.retryInterval);
        }
        const newInterval = setInterval(() => {
            if (appState.countdownTimer > 0 && appState.instanceState === ConnectionState.Disconnected) {
                updateCountdownTimer(appState.countdownTimer - 1);
            }
        }, 1000);
        updateRetryInterval(newInterval);

        setTimeout(() => this.spawnRPC(trakt, appState.traktCredentials), 15000);
    }
}
