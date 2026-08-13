import type { Movie, ProgressBarPayload, TraktContent, TvShow } from './types.ts';
import { getMovieImage, getShowImages } from './utils/getContentDetails.ts';

export type PresenceActivity = TraktContent & {
    buttons: { label: string; url: string }[];
    details: string;
    type: 3;
};

export interface MappedPresence {
    activity: PresenceActivity;
    progress: ProgressBarPayload;
}

const DEFAULT_IMAGES = {
    large: 'trakt',
    small: 'play',
};

export function isMovie(content: Movie | TvShow): content is Movie {
    return 'movie' in content;
}

export function watchingContentId(watching: Movie | TvShow): string {
    return isMovie(watching)
        ? `movie_${watching.movie.ids.tmdb}`
        : `episode_${watching.episode.ids.tmdb}`;
}

export function traktUrl(watching: Movie | TvShow): string {
    if (isMovie(watching)) {
        const id = watching.movie.ids.slug ?? watching.movie.ids.trakt;
        return id ? `https://trakt.tv/movies/${id}` : 'https://trakt.tv';
    }

    const id = watching.show.ids.slug ?? watching.show.ids.trakt;
    if (!id) {
        return 'https://trakt.tv';
    }

    const { season, number } = watching.episode;
    if (season && number) {
        return `https://trakt.tv/shows/${id}/seasons/${season}/episodes/${number}`;
    }

    // Fallback for show without episode info
    return `https://trakt.tv/shows/${id}`;
}

export async function imagesForWatching(
    watching: Movie | TvShow
): Promise<{ large: string; small: string } | null> {
    try {
        if (isMovie(watching)) {
            // Movie - get movie poster
            const movieId = watching.movie.ids.tmdb;
            if (movieId) {
                const result = await getMovieImage(movieId);
                return {
                    large: result || 'trakt',
                    small: 'play',
                };
            }
        } else {
            // Episode - get both season and episode images
            const seriesId = watching.show.ids.tmdb;
            const seasonId = watching.episode.season;
            const episodeId = watching.episode.number;

            if (seasonId && episodeId && seriesId) {
                const result = await getShowImages(seriesId, seasonId, episodeId);

                return {
                    large: result?.seasonImage || 'trakt',
                    small: result?.episodeImage || 'play',
                };
            }
        }
    } catch (error) {
        console.error('❌ Failed to fetch images:', error);
        // Keep previous images or use defaults
        return null;
    }

    return DEFAULT_IMAGES;
}

export function mapWatching(
    watching: Movie | TvShow,
    images: { large: string; small: string }
): MappedPresence {
    const timestamps = {
        endTimestamp: new Date(watching.expires_at),
        largeImageKey: images.large,
        smallImageKey: images.small,
        startTimestamp: new Date(watching.started_at),
    };

    if (isMovie(watching)) {
        const detail = `${watching.movie.title} (${watching.movie.year})`;

        return {
            activity: {
                ...timestamps,
                buttons: [
                    {
                        label: 'View on Trakt',
                        url: traktUrl(watching),
                    },
                ],
                details: detail,
                type: 3,
            },
            progress: {
                content: detail,
                endsAt: watching.expires_at,
                startedAt: watching.started_at,
                type: 'Movie',
            },
        };
    }

    const detail = `${watching.show.title} (${watching.show.year})`;
    const state = `S${watching.episode.season} E${watching.episode.number} · ${watching.episode.title}`;

    return {
        activity: {
            ...timestamps,
            buttons: [
                {
                    label: 'View on Trakt',
                    url: traktUrl(watching),
                },
            ],
            details: detail,
            state,
            type: 3,
        },
        progress: {
            content: `${detail} - ${state}`,
            endsAt: watching.expires_at,
            startedAt: watching.started_at,
            type: 'TV Show',
        },
    };
}
