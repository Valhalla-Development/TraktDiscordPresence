import { expect, test } from 'bun:test';
import Trakt from 'trakt.tv';

test('Trakt aborts a stalled HTTP request at the deadline without internal retries', async () => {
    let requests = 0;
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        idleTimeout: 60,
        fetch() {
            requests++;
            return new Promise(() => {});
        },
    });
    try {
        const trakt = new Trakt({ client_id: 'dummy', client_secret: 'dummy', api_url: server.url.href.replace(/\/$/, '') });
        await trakt.import_token({ access_token: 'dummy', refresh_token: 'dummy', expires: Date.now() + 60_000 });
        const started = Date.now();
        await expect(trakt.users.watching({ username: 'me' })).rejects.toThrow('Timeout awaiting');
        expect(Date.now() - started).toBeLessThan(20_000);
        expect(requests).toBe(1);
    } finally { await server.stop(true); }
}, 25_000);
