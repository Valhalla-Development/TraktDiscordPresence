import type { Movie, TvShow } from './types/index.d';

export function parseTestType(): 'movie' | 'show' {
    // Check which script was run
    const scriptName = process.env.npm_lifecycle_event || '';

    if (scriptName.includes('movie') || process.argv.includes('movie')) {
        return 'movie';
    }

    // Return show
    return 'show';
}

export function getTestWatching(type: 'movie' | 'show'): Movie | TvShow {
    const testMovie: Movie = {
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        movie: {
            ids: {
                slug: 'interstellar-2014',
                tmdb: 157_336,
            },
            title: 'Interstellar',
            year: 2014,
        },
        started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    };

    const testShow: TvShow = {
        episode: {
            ids: {
                tmdb: 1396,
            },
            number: 16,
            season: 5,
            title: 'Felina',
        },
        expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45 minutes from now
        show: {
            ids: {
                slug: 'breaking-bad',
                tmdb: 1396,
                trakt: 1,
            },
            title: 'Breaking Bad',
            year: 2008,
        },
        started_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
    };

    if (type === 'movie') {
        return testMovie;
    }

    return testShow;
}
