import { Client } from '@xhayper/discord-rpc';
import { ConnectionState } from '../types';
import { TraktInstance } from './traktInstance.js';
import { updateProgressBar } from '../utils/progressBar.js';
import {
    appState, updateInstanceState, updateRPC, updateRetryInterval, updateCountdownTimer,
} from '../state/appState.js';

export class DiscordRPC {
    async spawnRPC(trakt: TraktInstance): Promise<void> {
        try {
            if (!appState.traktCredentials) {
                updateInstanceState(ConnectionState.Error);
                updateProgressBar({ error: 'Trakt credentials not found' });
                return;
            }

            const rpc = new Client({
                clientId: appState.traktCredentials.discordClientId,
                transport: { type: 'ipc' },
            });

            rpc.on('ready', async () => {
                updateInstanceState(ConnectionState.Connected);
                updateProgressBar();
            });

            await rpc.login();
            updateRPC(rpc);

            if (appState.retryInterval) {
                clearInterval(appState.retryInterval);
                updateRetryInterval(null);
            }

            await trakt.updateStatus();

            setInterval(() => trakt.updateStatus(), 15000);
        } catch (err) {
            updateInstanceState(ConnectionState.Error);
            updateProgressBar({ error: `Failed to connect to Discord: ${err}` });
            await this.handleConnectionFailure(trakt);
        }
    }

    private async handleConnectionFailure(trakt: TraktInstance): Promise<void> {
        const isDisconnected = appState.instanceState === ConnectionState.Disconnected;
        const isError = appState.instanceState === ConnectionState.Error;

        if (isDisconnected || isError) {
            updateCountdownTimer(15);
            if (appState.retryInterval) {
                clearInterval(appState.retryInterval);
            }
            const newInterval = setInterval(() => {
                if (appState.countdownTimer > 0 && (isDisconnected || isError)) {
                    updateCountdownTimer(appState.countdownTimer - 1);
                    updateProgressBar();
                }
            }, 1000);
            updateRetryInterval(newInterval);

            setTimeout(() => this.spawnRPC(trakt), 15000);
        }

        if (isDisconnected) {
            updateInstanceState(ConnectionState.Disconnected);
        } else if (isError) {
            updateInstanceState(ConnectionState.Error);
        }
        updateProgressBar();
    }
}
