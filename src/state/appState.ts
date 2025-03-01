import type { Client } from '@xhayper/discord-rpc';
import { type Configuration, ConnectionState } from '../types/index.d';

export interface AppState {
    instanceState: ConnectionState;
    rpc: Client | null;
    retryInterval: NodeJS.Timeout | null;
    countdownTimer: number;
    traktCredentials: Configuration | null;
    lastErrorMessage: string | null;
}

export const appState: AppState = {
    instanceState: ConnectionState.Disconnected,
    rpc: null,
    retryInterval: null,
    countdownTimer: 15,
    traktCredentials: null,
    lastErrorMessage: null,
};

export function updateInstanceState(newState: ConnectionState): void {
    appState.instanceState = newState;
}

export function updateRPC(newRPC: Client | null): void {
    appState.rpc = newRPC;
}

export function updateRetryInterval(newInterval: NodeJS.Timeout | null): void {
    appState.retryInterval = newInterval;
}

export function updateCountdownTimer(newTimer: number): void {
    appState.countdownTimer = newTimer;
}

export function updateTraktCredentials(newCredentials: Configuration | null): void {
    appState.traktCredentials = newCredentials;
}

export function updateLastErrorMessage(errorMessage: string | null): void {
    appState.lastErrorMessage = errorMessage;
}
