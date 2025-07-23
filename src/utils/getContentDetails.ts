import { LRUCache } from 'lru-cache';
import { TMDB } from 'tmdb-ts';

// Cache for season data to avoid repeat calls
const seasonCache = new LRUCache<
    string,
    { seasonImage: string; episodes: { episode_number: number; still_path?: string }[] }
>({
    max: 50, // Maximum number of cached seasons
    ttl: 6 * 60 * 60 * 1000, // 6 hours TTL
    updateAgeOnGet: true, // Reset TTL when item is accessed (keeps popular seasons fresh)
    ttlAutopurge: true, // Automatically remove expired items in background
});

const tmdb = new TMDB(process.env.TMDB_API_KEY!);

/**
 * Fetches season poster and episode image from TMDB
 */
export async function getSeasonImage(
    tmdbId: string,
    seasonNumber: number,
    episodeNumber: number
): Promise<{ seasonImage: string; episodeImage: string | null } | null> {
    const cacheKey = `season_${tmdbId}_${seasonNumber}`;

    // Check cache first
    const cached = seasonCache.get(cacheKey);
    if (cached) {
        // Find episode from cached data
        const episode = cached.episodes.find((ep) => ep.episode_number === episodeNumber);
        return {
            seasonImage: cached.seasonImage,
            episodeImage: episode?.still_path
                ? `https://image.tmdb.org/t/p/w500${episode.still_path}`
                : null,
        };
    }

    try {
        const seasonData = await tmdb.tvSeasons.details({
            tvShowID: Number.parseInt(tmdbId, 10),
            seasonNumber,
        });

        if (seasonData.poster_path) {
            const seasonImageUrl = `https://image.tmdb.org/t/p/w500${seasonData.poster_path}`;

            // Cache the season data
            seasonCache.set(cacheKey, {
                seasonImage: seasonImageUrl,
                episodes: seasonData.episodes || [],
            });

            // Find the specific episode
            const episode = seasonData.episodes?.find((ep) => ep.episode_number === episodeNumber);

            return {
                seasonImage: seasonImageUrl,
                episodeImage: episode?.still_path
                    ? `https://image.tmdb.org/t/p/w500${episode.still_path}`
                    : null,
            };
        }
    } catch (error) {
        console.error(`Error fetching season ${seasonNumber} for TMDB ID ${tmdbId}:`, error);
    }

    return null;
}
