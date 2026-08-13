import { Client } from '@xhayper/discord-rpc';
import chalk from 'chalk';
import { ConnectionState, type TraktContent } from '../types/index.d';
import {
    getLastErrorMessage,
    setCountdownTimer,
    setInstanceState,
    updateProgressBar,
} from '../utils/progressBar.ts';

export const POLL_PLAYING_MS = 15_000;
export const POLL_IDLE_MS = 30_000;
export const POLL_TEST_MS = 30_000;

const POLL_ERROR_MIN_MS = 15_000;
const POLL_ERROR_MAX_MS = 60_000;
const RECONNECT_MIN_SECONDS = 15;
const RECONNECT_MAX_SECONDS = 60;

type ActivityPayload = TraktContent & {
    buttons?: { label: string; url: string }[];
    type?: number;
};

export class DiscordRPC {
    private rpc: Client | null = null;
    private statusTimer: NodeJS.Timeout | null = null;
    private retryTimer: NodeJS.Timeout | null = null;
    private session = 0;
    private connecting = false;
    private lifecycle: 'alive' | 'destroyed' = 'alive';
    private onStatus: (() => Promise<void>) | null = null;
    private readonly getClientId: () => string;
    private pollIntervalMs = POLL_IDLE_MS;
    private errorBackoffMs = POLL_ERROR_MIN_MS;
    private reconnectAttempt = 0;
    private lastActivityHash: string | null = null;

    constructor(getClientId: () => string) {
        this.getClientId = getClientId;
    }

    setStatusHandler(handler: () => Promise<void>): void {
        this.onStatus = handler;
    }

    isConnected(): boolean {
        return Boolean(this.rpc?.transport.isConnected);
    }

    setPollInterval(ms: number): void {
        this.pollIntervalMs = ms;
        this.errorBackoffMs = POLL_ERROR_MIN_MS;
    }

    notePollError(): void {
        this.pollIntervalMs = this.errorBackoffMs;
        this.errorBackoffMs = Math.min(this.errorBackoffMs * 2, POLL_ERROR_MAX_MS);
    }

    async setActivity(activity: ActivityPayload): Promise<void> {
        const hash = JSON.stringify(activity);
        if (hash === this.lastActivityHash) {
            return;
        }

        if (!this.rpc?.user) {
            return;
        }

        await this.rpc.user.setActivity(activity);
        this.lastActivityHash = hash;
    }

    async clearActivity(): Promise<void> {
        if (this.lastActivityHash === null) {
            return;
        }

        if (!this.rpc?.user) {
            return;
        }

        await this.rpc.user.clearActivity();
        this.lastActivityHash = null;
    }

    async spawnRPC(): Promise<void> {
        const session = await this.connectClient();
        if (session === null) {
            return;
        }

        await this.runStatusAndSchedule(session);
    }

    /**
     * Tear down the current client and connect immediately.
     * Used when switching movie/series Discord application IDs.
     * Does not poll — the caller sets activity on the new client.
     */
    async reconnect(): Promise<void> {
        if (this.lifecycle === 'destroyed') {
            return;
        }

        this.connecting = false;
        this.clearRetryTimer();
        await this.connectClient();
    }

    /**
     * Queue a single reconnect. No-ops if a connect or retry is already in flight
     * so watching updates cannot stack Discord clients.
     */
    scheduleReconnect(): void {
        if (this.lifecycle === 'destroyed' || this.connecting || this.retryTimer) {
            return;
        }

        this.clearStatusTimer();
        this.destroyRpcClient();

        const errorPayload = { error: getLastErrorMessage() || 'Connection failed' };
        let remaining = Math.min(
            RECONNECT_MIN_SECONDS * 2 ** this.reconnectAttempt,
            RECONNECT_MAX_SECONDS
        );
        this.reconnectAttempt += 1;
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
        this.clearStatusTimer();
        this.clearRetryTimer();
        this.destroyRpcClient();
    }

    private async connectClient(): Promise<number | null> {
        if (this.lifecycle === 'destroyed' || this.connecting) {
            return null;
        }

        const session = this.session + 1;
        this.session = session;
        this.connecting = true;
        this.clearStatusTimer();
        this.clearRetryTimer();
        this.destroyRpcClient();

        let rpc: Client | null = null;

        try {
            const clientId = this.getClientId();
            if (!clientId) {
                setInstanceState(ConnectionState.Error, {
                    error: 'Trakt credentials not found.',
                });
                return null;
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
                return null;
            }

            this.rpc = rpc;
            rpc = null;
            this.connecting = false;
            this.reconnectAttempt = 0;
            this.lastActivityHash = null;

            const isTestMode = process.argv.includes('--test');
            if (isTestMode) {
                console.log(chalk.cyan('🧪 Running in test mode - simulating Trakt activity'));
            }

            return session;
        } catch {
            rpc?.destroy();

            if (session !== this.session) {
                return null;
            }

            this.connecting = false;
            this.destroyRpcClient();
            const errorMessage = 'Discord is not running or RPC connection failed.';
            setInstanceState(ConnectionState.Error, { error: errorMessage });
            this.scheduleReconnect();
            return null;
        } finally {
            if (session === this.session) {
                this.connecting = false;
            }
        }
    }

    private async runStatus(): Promise<void> {
        await this.onStatus?.();
    }

    private async runStatusAndSchedule(session: number): Promise<void> {
        if (session !== this.session) {
            return;
        }

        await this.runStatus();

        if (this.lifecycle === 'destroyed' || this.retryTimer) {
            return;
        }

        this.scheduleNextTick(this.session, this.pollIntervalMs);
    }

    private scheduleNextTick(session: number, delayMs: number): void {
        if (session !== this.session || this.retryTimer || this.lifecycle === 'destroyed') {
            return;
        }

        this.clearStatusTimer();
        this.statusTimer = setTimeout(async () => {
            if (session !== this.session) {
                return;
            }
            await this.runStatusAndSchedule(session);
        }, delayMs);
    }

    private destroyRpcClient(): void {
        if (!this.rpc) {
            return;
        }

        this.rpc.destroy();
        this.rpc = null;
        this.lastActivityHash = null;
    }

    private clearStatusTimer(): void {
        if (this.statusTimer) {
            clearTimeout(this.statusTimer);
            this.statusTimer = null;
        }
    }

    private clearRetryTimer(): void {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
    }
}
