import { Client } from '@xhayper/discord-rpc';
import {
    appState,
    updateCountdownTimer,
    updateInstanceState,
    updateLastErrorMessage,
    updateRPC,
    updateRetryInterval,
} from '../state/appState.ts';
import { ConnectionState } from '../types/index.d';
import { updateProgressBar } from '../utils/progressBar.ts';
import type { TraktInstance } from './traktInstance.ts';

export class DiscordRPC {
    async spawnRPC(trakt: TraktInstance): Promise<void> {
        try {
            if (!appState.traktCredentials) {
                updateInstanceState(ConnectionState.Error);
                const errorMsg = 'Trakt credentials not found';
                updateLastErrorMessage(errorMsg);
                updateProgressBar({ error: errorMsg });
                return;
            }

            const rpc = new Client({
                clientId: appState.traktCredentials.discordClientId,
                transport: { type: 'ipc' },
            });

            rpc.on('ready', () => {
                updateInstanceState(ConnectionState.Connected);
                updateLastErrorMessage(null);
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
            // Improve error handling to provide a more descriptive message when Discord is closed
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                      ? err
                      : 'Discord is not running or RPC connection failed';

            // Store the error message in the app state
            updateLastErrorMessage(errorMessage);
            updateProgressBar({ error: errorMessage });
            await this.handleConnectionFailure(trakt);
        }
    }

    private async handleConnectionFailure(trakt: TraktInstance): Promise<void> {
        const isDisconnected = appState.instanceState === ConnectionState.Disconnected;
        const isError = appState.instanceState === ConnectionState.Error;

        // Store the current error message to reuse during countdown
        const currentErrorPayload = { error: appState.lastErrorMessage || 'Connection failed' };

        if (isDisconnected || isError) {
            updateCountdownTimer(15);
            if (appState.retryInterval) {
                clearInterval(appState.retryInterval);
            }
            const newInterval = setInterval(() => {
                if (appState.countdownTimer > 0 && (isDisconnected || isError)) {
                    updateCountdownTimer(appState.countdownTimer - 1);
                    // Pass the stored error message during each update
                    updateProgressBar(currentErrorPayload);
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
        // Use the stored error message for the initial update too
        updateProgressBar(currentErrorPayload);
    }
}
