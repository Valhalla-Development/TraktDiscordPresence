import { TMDB } from 'tmdb-ts';

// Cache for season data to avoid repeat calls
const seasonCache = new Map<string, { seasonImage: string; episodes: { episode_number: number; still_path?: string }[]; timestamp: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_SIZE = 10; // Maximum number of cached seasons

const tmdb = new TMDB(process.env.TMDB_API_KEY!);

/**
 * Clean old entries from cache
 */
function cleanCache() {
    if (seasonCache.size >= MAX_CACHE_SIZE) {
        const entries = Array.from(seasonCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2));
        for (const [key] of toRemove) {
            seasonCache.delete(key);
        }
    }
}



/**
 * Fetches season poster and episode image from TMDB
 */
export async function getSeasonImage(tmdbId: string, seasonNumber: number, episodeNumber: number): Promise<{ seasonImage: string; episodeImage: string | null } | null> {
    const cacheKey = `season_${tmdbId}_${seasonNumber}`;
    const now = Date.now();

    // Check cache first
    const cached = seasonCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL) {
        // Find episode from cached data
        const episode = cached.episodes.find(ep => ep.episode_number === episodeNumber);
        return {
            seasonImage: cached.seasonImage,
            episodeImage: episode?.still_path ? `https://image.tmdb.org/t/p/w500${episode.still_path}` : null
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
            cleanCache();
            seasonCache.set(cacheKey, {
                seasonImage: seasonImageUrl,
                episodes: seasonData.episodes || [],
                timestamp: now
            });

            // Find the specific episode
            const episode = seasonData.episodes?.find(ep => ep.episode_number === episodeNumber);
            
            return {
                seasonImage: seasonImageUrl,
                episodeImage: episode?.still_path ? `https://image.tmdb.org/t/p/w500${episode.still_path}` : null
            };
        }
    } catch (error) {
        console.error(`Error fetching season ${seasonNumber} for TMDB ID ${tmdbId}:`, error);
    }
    
    return null;
}
