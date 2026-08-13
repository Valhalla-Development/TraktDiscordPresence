import { Client } from '@xhayper/discord-rpc';
import chalk from 'chalk';
import {
    appState,
    updateCountdownTimer,
    updateInstanceState,
    updateLastErrorMessage,
    updateRPC,
} from '../state/appState.ts';
import { ConnectionState, type TraktContent } from '../types/index.d';
import { updateProgressBar } from '../utils/progressBar.ts';

const RETRY_DELAY_SECONDS = 15;

export class DiscordRPC {
    private statusInterval: NodeJS.Timeout | null = null;
    private retryTimer: NodeJS.Timeout | null = null;
    private session = 0;
    private connecting = false;
    private lifecycle: 'alive' | 'destroyed' = 'alive';
    private onStatus: (() => Promise<void>) | null = null;

    setStatusHandler(handler: () => Promise<void>): void {
        this.onStatus = handler;
    }

    isConnected(): boolean {
        return Boolean(appState.rpc?.transport.isConnected);
    }

    async setActivity(
        activity: TraktContent & {
            buttons?: { label: string; url: string }[];
            type?: number;
        }
    ): Promise<void> {
        await appState.rpc?.user?.setActivity(activity);
    }

    async clearActivity(): Promise<void> {
        await appState.rpc?.user?.clearActivity();
    }

    async spawnRPC(): Promise<void> {
        if (this.lifecycle === 'destroyed' || this.connecting) {
            return;
        }

        const session = this.session + 1;
        this.session = session;
        this.connecting = true;
        this.clearStatusInterval();
        this.clearRetryTimer();
        this.destroyRpcClient();

        let rpc: Client | null = null;

        try {
            if (!appState.traktCredentials) {
                updateInstanceState(ConnectionState.Error);
                const errorMsg = 'Trakt credentials not found.';
                updateLastErrorMessage(errorMsg);
                updateProgressBar({ error: errorMsg });
                return;
            }

            rpc = new Client({
                clientId: appState.traktCredentials.discordClientId,
                transport: { type: 'ipc' },
            });

            rpc.on('ready', () => {
                if (session !== this.session) {
                    return;
                }
                updateInstanceState(ConnectionState.Connected);
                updateLastErrorMessage(null);
                updateProgressBar();
            });

            await rpc.login();

            if (session !== this.session) {
                rpc.destroy();
                rpc = null;
                return;
            }

            updateRPC(rpc);
            rpc = null;
            this.connecting = false;

            const isTestMode = process.argv.includes('--test');

            if (isTestMode) {
                console.log(chalk.cyan('🧪 Running in test mode - simulating Trakt activity'));
                await this.runStatus();
                this.startStatusLoop(session, () => this.runStatus(), 30_000);
            } else {
                await this.runStatus();
                this.startStatusLoop(session, () => this.runStatus(), 15_000);
            }
        } catch {
            rpc?.destroy();
            rpc = null;

            if (session !== this.session) {
                return;
            }

            this.connecting = false;
            this.destroyRpcClient();
            updateInstanceState(ConnectionState.Error);
            const errorMessage = 'Discord is not running or RPC connection failed.';
            updateLastErrorMessage(errorMessage);
            updateProgressBar({ error: errorMessage });
            this.scheduleReconnect();
        } finally {
            if (session === this.session) {
                this.connecting = false;
            }
        }
    }

    /**
     * Tear down the current client and connect immediately.
     * Used when switching movie/series Discord application IDs.
     */
    async reconnect(): Promise<void> {
        if (this.lifecycle === 'destroyed') {
            return;
        }

        this.connecting = false;
        this.clearRetryTimer();
        await this.spawnRPC();
    }

    /**
     * Queue a single reconnect. No-ops if a connect or retry is already in flight
     * so watching updates cannot stack Discord clients.
     */
    scheduleReconnect(): void {
        if (this.lifecycle === 'destroyed' || this.connecting || this.retryTimer) {
            return;
        }

        this.clearStatusInterval();
        this.destroyRpcClient();

        const errorPayload = { error: appState.lastErrorMessage || 'Connection failed' };
        updateCountdownTimer(RETRY_DELAY_SECONDS);
        updateProgressBar(errorPayload);

        this.retryTimer = setInterval(async () => {
            if (this.lifecycle === 'destroyed') {
                this.clearRetryTimer();
                return;
            }

            const remaining = appState.countdownTimer - 1;
            if (remaining > 0) {
                updateCountdownTimer(remaining);
                updateProgressBar(errorPayload);
                return;
            }

            this.clearRetryTimer();
            await this.spawnRPC();
        }, 1000);
    }

    destroy(): void {
        this.lifecycle = 'destroyed';
        this.session += 1;
        this.connecting = false;
        this.clearStatusInterval();
        this.clearRetryTimer();
        this.destroyRpcClient();
    }

    private async runStatus(): Promise<void> {
        await this.onStatus?.();
    }

    private startStatusLoop(session: number, tick: () => Promise<void>, intervalMs: number): void {
        if (session !== this.session || this.retryTimer) {
            return;
        }

        this.clearStatusInterval();
        this.statusInterval = setInterval(async () => {
            await tick();
        }, intervalMs);
    }

    private destroyRpcClient(): void {
        if (!appState.rpc) {
            return;
        }

        appState.rpc.destroy();
        updateRPC(null);
    }

    private clearStatusInterval(): void {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    private clearRetryTimer(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
    }
}
