import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Configuration, TraktToken } from '../types/index.d';

const AUTH_FILE = path.resolve(import.meta.dirname, '../../auth.json');

const REFRESH_BUFFER_MS = 60 * 60 * 1000; // 1 hour buffer before expiration
// Node setTimeout only accepts a 32-bit signed delay
export const MAX_SETTIMEOUT_MS = 2 ** 31 - 1;

export function isTraktToken(value: unknown): value is TraktToken {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    return (
        'access_token' in value &&
        'refresh_token' in value &&
        'expires_in' in value &&
        'created_at' in value &&
        typeof value.access_token === 'string' &&
        typeof value.refresh_token === 'string' &&
        typeof value.expires_in === 'number' &&
        typeof value.created_at === 'number'
    );
}

export function remainingMs(token: TraktToken): number {
    if (!(token.expires_in && token.created_at)) {
        return 0;
    }

    const expiresAt = token.created_at * 1000 + token.expires_in * 1000;
    const timeUntilRefresh = expiresAt - Date.now() - REFRESH_BUFFER_MS;

    // If token is expired or will expire soon, refresh immediately
    if (timeUntilRefresh <= 0) {
        return 0;
    }

    return timeUntilRefresh;
}

export function shouldRefreshToken(token: TraktToken | undefined): boolean {
    if (!(token?.access_token && token.refresh_token)) {
        return true;
    }

    return remainingMs(token) <= 0;
}

export function readAuth(): TraktToken | null {
    if (!existsSync(AUTH_FILE)) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
        return isTraktToken(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function persistToken(token: TraktToken, config: Configuration): Configuration {
    writeFileSync(AUTH_FILE, JSON.stringify(token, null, 2));
    return {
        ...config,
        oAuth: token,
    };
}
