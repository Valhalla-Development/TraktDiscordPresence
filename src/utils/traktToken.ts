import { randomUUID } from 'node:crypto';
import {
    chmodSync,
    closeSync,
    existsSync,
    fsyncSync,
    openSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { Configuration, TraktToken } from '../types.ts';

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
        value.access_token.length > 0 &&
        typeof value.refresh_token === 'string' &&
        value.refresh_token.length > 0 &&
        typeof value.expires_in === 'number' &&
        Number.isFinite(value.expires_in) &&
        value.expires_in > 0 &&
        typeof value.created_at === 'number' &&
        Number.isFinite(value.created_at) &&
        value.created_at > 0
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

export function readAuth(authFile = AUTH_FILE): TraktToken | null {
    if (!existsSync(authFile)) {
        return null;
    }

    try {
        // Tighten permissions on tokens saved by earlier versions on POSIX systems.
        if (process.platform !== 'win32') {
            chmodSync(authFile, 0o600);
        }
        const parsed: unknown = JSON.parse(readFileSync(authFile, 'utf8'));
        return isTraktToken(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function persistToken(
    token: TraktToken,
    config: Configuration,
    authFile = AUTH_FILE
): Configuration {
    if (!isTraktToken(token)) {
        throw new Error('Invalid authentication token');
    }
    // Replace only a complete, flushed file so interrupted writes retain the old token.
    const temporaryFile = `${authFile}.${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
        descriptor = openSync(temporaryFile, 'wx', 0o600);
        writeFileSync(descriptor, JSON.stringify(token, null, 2));
        fsyncSync(descriptor);
        closeSync(descriptor);
        descriptor = undefined;
        renameSync(temporaryFile, authFile);
    } finally {
        if (descriptor !== undefined) {
            closeSync(descriptor);
        }
        if (existsSync(temporaryFile)) {
            unlinkSync(temporaryFile);
        }
    }
    return {
        ...config,
        oAuth: token,
    };
}
