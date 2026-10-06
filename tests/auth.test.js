import { afterEach, expect, spyOn, test } from 'bun:test';
import { AuthSession } from '../src/auth.ts';
import * as tokens from '../src/utils/traktToken.ts';
import { isAuthenticationError } from '../src/utils/request.ts';

const config = { clientId: 'dummy', clientSecret: 'dummy', discordClientId: 'dummy', movieDiscordClientId: 'dummy', seriesDiscordClientId: 'dummy' };
const expired = { access_token: 'dummy', refresh_token: 'dummy', created_at: 1, expires_in: 1 };
const spies = [];
const spy = (object, key, implementation) => {
    const result = spyOn(object, key).mockImplementation(implementation);
    spies.push(result);
    return result;
};
afterEach(() => { for (const item of spies.splice(0)) item.mockRestore(); });

test('rejected stored token is cleared before device authorization', async () => {
    const session = new AuthSession(config);
    spy(tokens, 'readAuth', () => expired);
    spy(tokens, 'persistToken', (token, current) => ({ ...current, oAuth: token }));
    const create = spy(session.trakt, 'createTrakt', async () => {
        if (session.trakt.getConfig().oAuth) {
            throw Object.assign(new Error('invalid_grant'), { response: { statusCode: 400 } });
        }
    });
    const device = spy(session.trakt, 'getDeviceAuthentication', async () => expired);
    await session.ensureAuthenticated();
    expect(create).toHaveBeenCalledTimes(2);
    expect(device).toHaveBeenCalledTimes(1);
});

test('startup outage retains stored credentials and does not request authorization', async () => {
    const session = new AuthSession(config);
    spy(tokens, 'readAuth', () => expired);
    spy(session.trakt, 'createTrakt', async () => { throw new Error('network unavailable'); });
    const device = spy(session.trakt, 'getDeviceAuthentication', async () => expired);
    await expect(session.ensureAuthenticated()).rejects.toThrow('network unavailable');
    expect(session.trakt.getConfig().oAuth).toEqual(expired);
    expect(device).not.toHaveBeenCalled();
});

test('refresh outage schedules a retry without discarding the token', async () => {
    const session = new AuthSession({ ...config, oAuth: expired });
    spy(session.trakt, 'refreshToken', async () => { throw new Error('network unavailable'); });
    const device = spy(session.trakt, 'getDeviceAuthentication', async () => expired);
    await session.scheduleNextRefresh();
    expect(session.refreshTimeoutId).not.toBeNull();
    expect(session.trakt.getConfig().oAuth).toEqual(expired);
    expect(device).not.toHaveBeenCalled();
    session.stopRefresh();
    expect(session.refreshTimeoutId).toBeNull();
});

test('wrapped OAuth rejection is distinguished from server errors', () => {
    const rejected = Object.assign(new Error('request failed'), { response: { statusCode: 401 } });
    expect(isAuthenticationError(new Error('refresh failed', { cause: rejected }))).toBe(true);
    expect(isAuthenticationError(Object.assign(new Error('unavailable'), { response: { statusCode: 503 } }))).toBe(false);
});
