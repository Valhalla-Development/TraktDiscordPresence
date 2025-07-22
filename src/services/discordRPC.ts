import { Client } from '@xhayper/discord-rpc';
import chalk from 'chalk';
import {
    appState,
    updateCountdownTimer,
    updateInstanceState,
    updateLastErrorMessage,
    updateRetryInterval,
    updateRPC,
} from '../state/appState.ts';
import { ConnectionState } from '../types/index.d';
import { updateProgressBar } from '../utils/progressBar.ts';
import type { TraktInstance } from './traktInstance.ts';

export class DiscordRPC {
    async spawnRPC(trakt: TraktInstance): Promise<void> {
        try {
            if (!appState.traktCredentials) {
                updateInstanceState(ConnectionState.Error);
                const errorMsg = 'Trakt credentials not found.';
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

            if (!appState.traktInstance) {
                appState.traktInstance = trakt;
            }

            // Check if we're in test mode
            const isTestMode = process.argv.includes('--test');
            
            if (isTestMode) {
                // Parse test type from arguments
                const testType = this.parseTestType();
                console.log(chalk.cyan('🧪 Running in test mode - simulating Trakt activity'));
                
                await trakt.updateStatus(true, testType); // Pass test mode flag and type
                
                // In test mode, update every 30 seconds to see changes
                setInterval(() => trakt.updateStatus(true, testType), 30_000);
            } else {
                await trakt.updateStatus();
                setInterval(() => trakt.updateStatus(), 15_000);
            }
        } catch (_err) {
            updateInstanceState(ConnectionState.Error);
            const errorMessage = 'Discord is not running or RPC connection failed.';

            // Store the error message in the app state
            updateLastErrorMessage(errorMessage);
            updateProgressBar({ error: errorMessage });
            await this.handleConnectionFailure(trakt);
        }
    }

    private handleConnectionFailure(trakt: TraktInstance): void {
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

            setTimeout(() => this.spawnRPC(trakt), 15_000);
        }

        if (isDisconnected) {
            updateInstanceState(ConnectionState.Disconnected);
        } else if (isError) {
            updateInstanceState(ConnectionState.Error);
        }
        // Use the stored error message for the initial update too
        updateProgressBar(currentErrorPayload);
    }

    private parseTestType(): 'movie' | 'show' | undefined {
        // Check which script was run
        const scriptName = process.env.npm_lifecycle_event || '';
        
        if (scriptName.includes('movie') || process.argv.includes('movie')) {
            return 'movie';
        }
        if (scriptName.includes('show') || process.argv.includes('show')) {
            return 'show';
        }
    }
}
