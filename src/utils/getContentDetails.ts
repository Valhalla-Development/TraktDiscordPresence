import { getTitleDetailsByIMDBId } from 'movier';

// Cache for series data to avoid repeat calls
const seriesCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_SIZE = 10; // Maximum number of cached series

/**
 * Fetches content images from IMDb
 * @param movieId - IMDb ID for movie (movie only)
 * @param seriesId - IMDb ID for series (episode only)
 * @param episodeId - IMDb ID for episode (episode only)
 * @returns Promise with image URLs
 */
export async function getContentDetails(movieId?: string, seriesId?: string, episodeId?: string) {
    try {
        // Movie - single call
        if (movieId) {
            const data = await getTitleDetailsByIMDBId(movieId);
            return {
                type: 'movie' as const,
                image: data?.posterImage.url,
            };
        }

        // Episode - parallel calls for both series and episode
        if (seriesId && episodeId) {
            let seriesImagePromise: Promise<string | undefined>;

            // Check cache and clean expired entries
            const cached = seriesCache.get(seriesId);
            const now = Date.now();

            if (cached && now - cached.timestamp < CACHE_TTL) {
                // Cache hit - use cached image
                seriesImagePromise = Promise.resolve(cached.url);
            } else {
                // Cache miss or expired - fetch new data
                seriesImagePromise = getTitleDetailsByIMDBId(seriesId).then((data) => {
                    const image = data?.posterImage.url;
                    if (image) {
                        // Clean cache if it's getting too large
                        if (seriesCache.size >= MAX_CACHE_SIZE) {
                            // Remove oldest entries (simple LRU)
                            const entries = Array.from(seriesCache.entries());
                            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                            const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2));
                            for (const [key] of toRemove) {
                                seriesCache.delete(key);
                            }
                        }

                        seriesCache.set(seriesId, { url: image, timestamp: now });
                    }
                    return image;
                });
            }

            const episodeImagePromise = getTitleDetailsByIMDBId(episodeId).then(
                (data) => data?.posterImage.url
            );

            const [seriesImage, episodeImage] = await Promise.all([
                seriesImagePromise,
                episodeImagePromise,
            ]);

            return {
                type: 'episode' as const,
                seriesImage,
                episodeImage,
            };
        }

        throw new Error('Invalid arguments: provide movieId OR both seriesId and episodeId');
    } catch (error) {
        console.error('Error fetching content images:', error);
    }
}

// Convenience functions
export function getMovieImage(id: string) {
    return getContentDetails(id);
}

export function getEpisodeImages(seriesId: string, episodeId: string) {
    return getContentDetails('', seriesId, episodeId);
}
