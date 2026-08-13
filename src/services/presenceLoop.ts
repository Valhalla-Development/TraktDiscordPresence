import {
    appState,
    updateInstanceState,
    updateLastErrorMessage,
    updateTraktCredentials,
} from '../state/appState.ts';
import { ConnectionState, type Movie, type TraktContent, type TvShow } from '../types/index.d';
import { getMovieImage, getShowImages } from '../utils/getContentDetails.ts';
import { updateProgressBar } from '../utils/progressBar.ts';
import type { DiscordRPC } from './discordRPC.ts';
import type { TraktInstance } from './traktInstance.ts';

export class PresenceLoop {
    private readonly trakt: TraktInstance;
    private readonly discordRPC: DiscordRPC;

    // Track current content and its images
    private currentContentId: string | null = null;
    private currentImages: { small: string; large: string } = {
        large: 'trakt',
        small: 'play',
    };

    constructor(trakt: TraktInstance, discordRPC: DiscordRPC) {
        this.trakt = trakt;
        this.discordRPC = discordRPC;
    }

    async tick(): Promise<void> {
        try {
            if (!this.discordRPC.isConnected()) {
                updateInstanceState(ConnectionState.Disconnected);
                const errorMsg =
                    'Discord is not running or RPC connection was lost. Attempting to reconnect...';
                updateLastErrorMessage(errorMsg);
                updateProgressBar({
                    error: errorMsg,
                });
                this.discordRPC.scheduleReconnect();
                return;
            }

            const isTestMode = process.argv.includes('--test');
            const watching = await this.trakt.getWatching(
                isTestMode,
                isTestMode ? this.parseTestType() : undefined
            );

            if (watching) {
                const contentType = this.isMovie(watching) ? 'movie' : 'show';
                const hasActiveClient = await this.ensureDiscordClientForContent(contentType);
                if (!hasActiveClient) {
                    return;
                }

                await this.handleWatchingContent(watching);
                updateInstanceState(ConnectionState.Playing);
            } else {
                updateInstanceState(ConnectionState.NotPlaying);
                updateProgressBar();

                // Clear the Discord activity when nothing is playing
                await this.discordRPC.clearActivity();
            }
        } catch (error) {
            updateInstanceState(ConnectionState.Error);
            const errorMsg = `Failed to update status: ${error}.`;
            updateLastErrorMessage(errorMsg);
            updateProgressBar({ error: errorMsg });
            if (!this.discordRPC.isConnected()) {
                this.discordRPC.scheduleReconnect();
            }
        }
    }

    private async handleWatchingContent(watching: Movie | TvShow): Promise<void> {
        // Create unique ID for current content
        const contentId = this.isMovie(watching)
            ? `movie_${watching.movie.ids.tmdb}`
            : `episode_${watching.episode.ids.tmdb}`;

        // Only fetch images if content changed
        if (contentId !== this.currentContentId) {
            this.currentContentId = contentId;

            try {
                if (this.isMovie(watching)) {
                    // Movie - get movie poster
                    const movieId = watching.movie.ids.tmdb;
                    if (movieId) {
                        const result = await getMovieImage(movieId);
                        this.currentImages = {
                            large: result || 'trakt',
                            small: 'play',
                        };
                    }
                } else {
                    // Episode - get both season and episode images
                    const seriesId = watching.show.ids.tmdb;
                    const seasonId = watching.episode.season;
                    const episodeId = watching.episode.number;

                    if (seasonId && episodeId) {
                        const result = await getShowImages(seriesId, seasonId, episodeId);

                        this.currentImages = {
                            large: result?.seasonImage || 'trakt',
                            small: result?.episodeImage || 'play',
                        };
                    }
                }
            } catch (error) {
                console.error('❌ Failed to fetch images:', error);
                // Keep previous images or use defaults
            }
        }

        const traktContent: TraktContent = {
            endTimestamp: new Date(watching.expires_at),
            largeImageKey: this.currentImages.large,
            smallImageKey: this.currentImages.small,
            startTimestamp: new Date(watching.started_at),
        };

        if (this.isMovie(watching)) {
            await this.handleMovie(watching, traktContent);
        } else {
            await this.handleEpisode(watching, traktContent);
        }
    }

    private isMovie(content: Movie | TvShow): content is Movie {
        return 'movie' in content;
    }

    private formatTraktUrl({
        type,
        title,
        year,
        season,
        episode,
    }: {
        type: 'movie' | 'show';
        title: string;
        year?: number;
        season?: number;
        episode?: number;
    }): string {
        const slug = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special chars
            .replace(/\s+/g, '-') // Replace spaces with dashes
            .trim();

        if (type === 'movie' && year) {
            return `https://trakt.tv/movies/${slug}-${year}`;
        }

        if (type === 'show' && season && episode) {
            return `https://trakt.tv/shows/${slug}/seasons/${season}/episodes/${episode}`;
        }

        // Fallback for show without episode info
        return `https://trakt.tv/shows/${slug}`;
    }

    private async handleMovie(watching: Movie, traktContent: TraktContent): Promise<void> {
        const { movie } = watching;
        const detail = `${movie.title} (${movie.year})`;

        updateProgressBar({
            content: detail,
            endsAt: watching.expires_at,
            startedAt: watching.started_at,
            type: 'Movie',
        });

        await this.discordRPC.setActivity({
            ...traktContent,
            buttons: [
                {
                    label: 'View on Trakt',
                    url: this.formatTraktUrl({
                        title: movie.title,
                        type: 'movie',
                        year: movie.year,
                    }),
                },
            ],
            details: detail,
            type: 3,
        });
    }

    private async handleEpisode(watching: TvShow, traktContent: TraktContent): Promise<void> {
        const { show, episode } = watching;
        const detail = `${show.title} (${show.year})`;
        const state = `S${episode.season} E${episode.number} · ${episode.title}`;

        updateProgressBar({
            content: `${detail} - ${state}`,
            endsAt: watching.expires_at,
            startedAt: watching.started_at,
            type: 'TV Show',
        });

        await this.discordRPC.setActivity({
            ...traktContent,
            buttons: [
                {
                    label: 'View on Trakt',
                    url: this.formatTraktUrl({
                        episode: episode.number,
                        season: episode.season,
                        title: show.title,
                        type: 'show',
                    }),
                },
            ],
            details: detail,
            state,
            type: 3,
        });
    }

    private async ensureDiscordClientForContent(contentType: 'movie' | 'show'): Promise<boolean> {
        if (!appState.traktCredentials) {
            throw new Error('Trakt credentials not found');
        }

        const targetClientId =
            contentType === 'movie'
                ? appState.traktCredentials.movieDiscordClientId
                : appState.traktCredentials.seriesDiscordClientId;

        if (
            targetClientId &&
            targetClientId === appState.traktCredentials.discordClientId &&
            this.discordRPC.isConnected()
        ) {
            return true;
        }

        if (!targetClientId) {
            return true;
        }

        updateTraktCredentials({
            ...appState.traktCredentials,
            discordClientId: targetClientId,
        });

        await this.discordRPC.reconnect();
        return false;
    }

    private parseTestType(): 'movie' | 'show' {
        // Check which script was run
        const scriptName = process.env.npm_lifecycle_event || '';

        if (scriptName.includes('movie') || process.argv.includes('movie')) {
            return 'movie';
        }

        // Return show
        return 'show';
    }
}
