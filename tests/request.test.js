import { expect, spyOn, test } from 'bun:test';
import { fetchWithTimeout, withRequestTimeout } from '../src/utils/request.ts';

test('a stalled request releases the polling loop', async () => {
    await expect(withRequestTimeout(new Promise(() => {}), 'Trakt', 5)).rejects.toThrow('Trakt request timed out');
});

test('successful requests and service errors retain their result', async () => {
    expect(await withRequestTimeout(Promise.resolve('watching'), 'Trakt', 100)).toBe('watching');
    await expect(withRequestTimeout(Promise.reject(new Error('offline')), 'Trakt', 100)).rejects.toThrow('offline');
});

test('artwork fetch receives an abort signal and preserves caller cancellation', async () => {
    const controller = new AbortController();
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        controller.abort();
        expect(init.signal.aborted).toBe(true);
        return new Response('{}');
    });
    try {
        await fetchWithTimeout('https://example.invalid', { signal: controller.signal });
    } finally { fetchSpy.mockRestore(); }
});
