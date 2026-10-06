import { afterEach, expect, spyOn, test } from 'bun:test';
import * as presence from '../src/presence.ts';
import * as details from '../src/utils/getContentDetails.ts';
import * as progress from '../src/utils/progressBar.ts';
import { PresenceLoop } from '../src/services/presenceLoop.ts';

const spies = [];
const spy = (object, key, fn) => { const item = spyOn(object, key).mockImplementation(fn); spies.push(item); return item; };
afterEach(() => { for (const item of spies.splice(0)) item.mockRestore(); });
const movie = (id) => ({ movie: { title: 'Movie', year: 2026, ids: { trakt: id, tmdb: id } }, started_at: '2026-10-06T10:00:00Z', expires_at: '2026-10-06T12:00:00Z' });
const special = { show: { title: 'Show', year: 2026, ids: { trakt: 1, tmdb: 1 } }, episode: { season: 0, number: 1, title: 'Special', ids: {} }, started_at: '2026-10-06T10:00:00Z', expires_at: '2026-10-06T12:00:00Z' };

test('season-zero specials have episode links and request artwork', async () => {
    expect(presence.traktUrl(special)).toBe('https://trakt.tv/shows/1/seasons/0/episodes/1');
    const images = spy(details, 'getShowImages', async () => ({ seasonImage: 'season', episodeImage: 'episode' }));
    expect(await presence.imagesForWatching(special)).toEqual({ large: 'season', small: 'episode' });
    expect(images).toHaveBeenCalledWith(1, 0, 1);
});

test('missing TMDB IDs do not merge different titles or episodes', () => {
    const first = movie(1); delete first.movie.ids.tmdb;
    const second = movie(2); delete second.movie.ids.tmdb;
    expect(presence.watchingContentId(first)).not.toBe(presence.watchingContentId(second));
    const next = { ...special, episode: { ...special.episode, number: 2 } };
    expect(presence.watchingContentId(special)).not.toBe(presence.watchingContentId(next));
});

test('failed images use defaults, back off, and recover for the same title', async () => {
    let now = 1000;
    spy(Date, 'now', () => now);
    spy(progress, 'updateProgressBar', () => {});
    const calls = [];
    const loop = new PresenceLoop({}, { setActivity: async (activity) => calls.push(activity) });
    let lookups = 0;
    spy(presence, 'imagesForWatching', async () => {
        lookups++;
        return lookups === 2 ? null : { large: `poster-${lookups}`, small: 'play' };
    });
    await loop.handleWatchingContent(movie(1));
    await loop.handleWatchingContent(movie(2));
    expect(calls[1].largeImageKey).toBe('trakt');
    await loop.handleWatchingContent(movie(2));
    expect(lookups).toBe(2);
    now += 60_000;
    await loop.handleWatchingContent(movie(2));
    expect(calls[3].largeImageKey).toBe('poster-3');
    await loop.handleWatchingContent(movie(2));
    expect(lookups).toBe(3);
});
