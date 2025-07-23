import { TMDB } from 'tmdb-ts';

// Cache for images to avoid repeat calls
const imageCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_SIZE = 10; // Maximum number of cached images

const tmdb = new TMDB(process.env.TMDB_API_KEY!);

/**
 * Clean old entries from cache
 */
function cleanCache() {
    if (imageCache.size >= MAX_CACHE_SIZE) {
        const entries = Array.from(imageCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2));
        for (const [key] of toRemove) {
            imageCache.delete(key);
        }
    }
}

/**
 * Get cached image or fetch new one
 */
async function getCachedImage(
    cacheKey: string,
    fetchFn: () => Promise<string | null>
): Promise<string | null> {
    const cached = imageCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.url;
    }

    try {
        const imageUrl = await fetchFn();
        if (imageUrl) {
            cleanCache();
            imageCache.set(cacheKey, { url: imageUrl, timestamp: now });
        }
        return imageUrl;
    } catch (error) {
        console.error(`Error fetching image for ${cacheKey}:`, error);
        return null;
    }
}

/**
 * Fetches season poster from TMDB
 */
export function getSeasonImage(tmdbId: string, seasonNumber: number): Promise<string | null> {
    const cacheKey = `season_${tmdbId}_${seasonNumber}`;

    return getCachedImage(cacheKey, async () => {
        try {
            const seasonData = await tmdb.tvSeasons.details({
                tvShowID: Number.parseInt(tmdbId, 10),
                seasonNumber,
            });

            if (seasonData.poster_path) {
                return `https://image.tmdb.org/t/p/w500${seasonData.poster_path}`;
            }
        } catch (error) {
            console.error(`Error fetching season ${seasonNumber} for TMDB ID ${tmdbId}:`, error);
        }
        return null;
    });
}
