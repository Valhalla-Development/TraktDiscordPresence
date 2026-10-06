import { expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTraktToken, persistToken, readAuth } from '../src/utils/traktToken.ts';

const token = { access_token: 'dummy', refresh_token: 'dummy', created_at: 1, expires_in: 3600 };

test('token replacements are complete and owner-only on POSIX', () => {
    const directory = mkdtempSync(join(tmpdir(), 'trakt-token-test-'));
    const file = join(directory, 'auth.json');
    persistToken(token, {}, file);
    if (process.platform !== 'win32') {
        expect(statSync(file).mode & 0o777).toBe(0o600);
        chmodSync(file, 0o644);
    }
    expect(readAuth(file)).toEqual(token);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    const replacement = { ...token, access_token: 'replacement' };
    expect(persistToken(replacement, {}, file).oAuth).toEqual(replacement);
    expect(readAuth(file)).toEqual(replacement);
    expect(readdirSync(directory)).toEqual(['auth.json']);
});

test('invalid token never replaces existing credentials', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'trakt-token-test-')), 'auth.json');
    persistToken(token, {}, file);
    expect(() => persistToken({ ...token, expires_in: NaN }, {}, file)).toThrow('Invalid authentication token');
    expect(readAuth(file)).toEqual(token);
    expect(isTraktToken({ ...token, access_token: '' })).toBe(false);
    expect(isTraktToken({ ...token, expires_in: -1 })).toBe(false);
});
