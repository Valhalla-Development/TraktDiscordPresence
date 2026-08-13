import { Client } from '@xhayper/discord-rpc';
import chalk from 'chalk';
import { ConnectionState, type TraktContent } from '../types/index.d';
import {
    getLastErrorMessage,
    setCountdownTimer,
    setInstanceState,
    updateProgressBar,
} from '../utils/progressBar.ts';

const RETRY_DELAY_SECONDS = 15;

export class DiscordRPC {
    private rpc: Client | null = null;
    private statusInterval: NodeJS.Timeout | null = null;
    private retryTimer: NodeJS.Timeout | null = null;
    private session = 0;
    private connecting = false;
    private lifecycle: 'alive' | 'destroyed' = 'alive';
    private onStatus: (() => Promise<void>) | null = null;
    private readonly getClientId: () => string;

    constructor(getClientId: () => string) {
        this.getClientId = getClientId;
    }

    setStatusHandler(handler: () => Promise<void>): void {
        this.onStatus = handler;
    }

    isConnected(): boolean {
        return Boolean(this.rpc?.transport.isConnected);
    }

    async setActivity(
        activity: TraktContent & {
            buttons?: { label: string; url: string }[];
            type?: number;
        }
    ): Promise<void> {
        await this.rpc?.user?.setActivity(activity);
    }

    async clearActivity(): Promise<void> {
        await this.rpc?.user?.clearActivity();
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
            const clientId = this.getClientId();
            if (!clientId) {
                setInstanceState(ConnectionState.Error, {
                    error: 'Trakt credentials not found.',
                });
                return;
            }

            rpc = new Client({
                clientId,
                transport: { type: 'ipc' },
            });

            rpc.on('ready', () => {
                if (session !== this.session) {
                    return;
                }
                setInstanceState(ConnectionState.Connected);
            });

            await rpc.login();

            if (session !== this.session) {
                rpc.destroy();
                rpc = null;
                return;
            }

            this.rpc = rpc;
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
            const errorMessage = 'Discord is not running or RPC connection failed.';
            setInstanceState(ConnectionState.Error, { error: errorMessage });
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

        const errorPayload = { error: getLastErrorMessage() || 'Connection failed' };
        let remaining = RETRY_DELAY_SECONDS;
        setCountdownTimer(remaining);
        updateProgressBar(errorPayload);

        this.retryTimer = setInterval(async () => {
            if (this.lifecycle === 'destroyed') {
                this.clearRetryTimer();
                return;
            }

            remaining -= 1;
            if (remaining > 0) {
                setCountdownTimer(remaining);
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
        if (!this.rpc) {
            return;
        }

        this.rpc.destroy();
        this.rpc = null;
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
