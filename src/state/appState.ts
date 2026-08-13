import type { Client } from '@xhayper/discord-rpc';
import type { TraktInstance } from '../services/traktInstance';
import { type Configuration, ConnectionState } from '../types/index.d';

export interface AppState {
    countdownTimer: number;
    instanceState: ConnectionState;
    lastErrorMessage: string | null;
    retryInterval: NodeJS.Timeout | null;
    rpc: Client | null;
    traktCredentials: Configuration | null;
    traktInstance: TraktInstance | null;
}

export const appState: AppState = {
    countdownTimer: 15,
    instanceState: ConnectionState.Disconnected,
    lastErrorMessage: null,
    retryInterval: null,
    rpc: null,
    traktCredentials: null,
    traktInstance: null,
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

export function updateTraktInstance(instance: TraktInstance | null): void {
    appState.traktInstance = instance;
}

export function updateLastErrorMessage(errorMessage: string | null): void {
    appState.lastErrorMessage = errorMessage;
}
