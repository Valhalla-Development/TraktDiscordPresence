import { Client } from '@xhayper/discord-rpc';
import { ConnectionState } from '../types';
import { TraktInstance } from './traktInstance.js';
import { updateProgressBar } from '../utils/progressBar.js';
import {
    appState, updateInstanceState, updateRPC, updateRetryInterval, updateCountdownTimer,
} from '../state/appState.js';

export class DiscordRPC {
    private statusInterval: NodeJS.Timeout | null = null;

    async spawnRPC(trakt: TraktInstance): Promise<void> {
        try {
            if (!appState.traktCredentials) {
                throw new Error('Trakt credentials not found');
            }

            const rpc = new Client({
                clientId: appState.traktCredentials.discordClientId,
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
                updateProgressBar();
            }
        }, 1000);
        updateRetryInterval(newInterval);

        setTimeout(() => this.spawnRPC(trakt), 15000);
    }
}
