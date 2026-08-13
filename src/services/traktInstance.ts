import chalk from 'chalk';
// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import {
    appState,
    updateInstanceState,
    updateLastErrorMessage,
    updateTraktCredentials,
} from '../state/appState.ts';
import {
    ConnectionState,
    type Movie,
    type TraktContent,
    type TraktToken,
    type TvShow,
} from '../types/index.d';
import { getMovieImage, getShowImages } from '../utils/getContentDetails.ts';
import { updateProgressBar } from '../utils/progressBar.ts';
import { persistToken, shouldRefreshToken } from '../utils/traktToken.ts';
import type { DiscordRPC } from './discordRPC.ts';

export class TraktInstance {
    private trakt: Trakt;
    private readonly discordRPC: DiscordRPC;

    // Track current content and its images
    private currentContentId: string | null = null;
    private currentImages: { small: string; large: string } = {
        large: 'trakt',
        small: 'play',
    };

    constructor(discordRPC: DiscordRPC) {
        this.discordRPC = discordRPC;
    }

    async createTrakt(): Promise<void> {
        if (!appState.traktCredentials) {
            throw new Error('Trakt credentials not found');
        }

        this.trakt = new Trakt({
            client_id: appState.traktCredentials.clientId,
            client_secret: appState.traktCredentials.clientSecret,
        });

        if (appState.traktCredentials.oAuth) {
            const token = appState.traktCredentials.oAuth;

            if (shouldRefreshToken(token)) {
                console.warn(
                    chalk.yellow('Stored token is invalid or expired, attempting to refresh...')
                );
                try {
                    await this.trakt.import_token(token);
                    const newToken = await this.refreshToken();
                    persistToken(newToken);
                    return;
                } catch (refreshError) {
                    console.error(chalk.red('Token refresh failed:'), refreshError);
                    throw new Error(
                        'Token is invalid and refresh failed. Please re-authenticate.',
                        { cause: refreshError }
                    );
                }
            }

            return this.trakt.import_token(token);
        }

        return Promise.resolve();
    }

    async refreshToken(): Promise<TraktToken> {
        try {
            const newToken = await this.trakt.refresh_token();

            await this.trakt.import_token(newToken);

            return newToken;
        } catch (error) {
            console.error(chalk.red('Failed to refresh token:'), error);
            throw error;
        }
    }

    async getDeviceAuthentication(): Promise<TraktToken> {
        try {
            const pollData = await this.trakt.get_codes();

            console.log(`\n${chalk.red.bold('TRAKT AUTHORIZATION')}\n`);
            console.log(
                chalk.magenta('➤ Visit:') + chalk.cyan.bold(` ${pollData.verification_url}`)
            );
            console.log(
                chalk.magenta('➤ Enter code:') + chalk.yellowBright.bold(` ${pollData.user_code}`)
            );
            console.log(`\n${chalk.white.italic('WAITING FOR AUTHORIZATION...')}`);

            const token = await this.trakt.poll_access(pollData);
            console.log(
                '\n' +
                    chalk.bgGreen.black(' SUCCESS ') +
                    chalk.green(' Authorization complete! ') +
                    '✓'
            );
            return token;
        } catch (error) {
            console.error(chalk.red('\nFAuthorization timed out. Please try again.'));
            throw new Error('Authorization timed out. Please try again.', { cause: error });
        }
    }

    async updateStatus(testMode = false, testType?: 'movie' | 'show'): Promise<void> {
        try {
            if (!appState.rpc?.transport.isConnected) {
                updateInstanceState(ConnectionState.Disconnected);
                const errorMsg =
                    'Discord is not running or RPC connection was lost. Attempting to reconnect...';
                updateLastErrorMessage(errorMsg);
                updateProgressBar({
                    error: errorMsg,
                });
                this.discordRPC.scheduleReconnect(this);
                return;
            }

            let watching: Movie | TvShow | null = null;

            if (testMode) {
                // Generate test data
                watching = this.generateTestWatchingData(testType!);
                const typeMsg = testType ? `${testType}` : 'random content';
                console.log(chalk.blue(`🧪 Test mode: Simulating watching ${typeMsg}...`));
            } else {
                // Normal mode: get real data from Trakt
                watching = await this.trakt.users.watching({ username: 'me' });
            }

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
                await appState.rpc?.user?.clearActivity();
            }
        } catch (error) {
            updateInstanceState(ConnectionState.Error);
            const errorMsg = `Failed to update status: ${error}.`;
            updateLastErrorMessage(errorMsg);
            updateProgressBar({ error: errorMsg });
            if (!appState.rpc?.transport.isConnected) {
                this.discordRPC.scheduleReconnect(this);
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

        await appState.rpc?.user?.setActivity({
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

        await appState.rpc?.user?.setActivity({
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

    private generateTestWatchingData(type: 'movie' | 'show'): Movie | TvShow {
        const testMovie: Movie = {
            expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
            movie: {
                ids: {
                    tmdb: '157336',
                },
                title: 'Interstellar',
                year: 2014,
            },
            started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        };

        const testShow: TvShow = {
            episode: {
                ids: {
                    tmdb: '1396',
                },
                number: 16,
                season: 5,
                title: 'Felina',
            },
            expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45 minutes from now
            show: {
                ids: {
                    tmdb: '1396',
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
            appState.rpc?.transport.isConnected
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

        await this.discordRPC.reconnect(this);
        return false;
    }
}
