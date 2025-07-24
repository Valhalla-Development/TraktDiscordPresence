import chalk from 'chalk';
// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import { getMovieImage, getShowImages } from 'utils/getContentDetails.ts';
import {
    appState,
    updateInstanceState,
    updateLastErrorMessage,
    updateRetryInterval,
} from '../state/appState.ts';
import {
    ConnectionState,
    type Movie,
    type TraktContent,
    type TraktToken,
    type TvShow,
} from '../types/index.d';
import { updateProgressBar } from '../utils/progressBar.ts';
import { DiscordRPC } from './discordRPC.ts';

export class TraktInstance {
    private trakt: Trakt;
    private discordRPC: DiscordRPC;
    private readonly REFRESH_BUFFER = 60 * 60 * 1000; // 1 hour buffer before expiration

    // Track current content and its images
    private currentContentId: string | null = null;
    private currentImages: { small: string; large: string } = { small: 'play', large: 'trakt' };

    constructor() {
        this.discordRPC = new DiscordRPC();
    }

    calculateTimeUntilRefresh(token: TraktToken): number {
        if (!(token?.expires_in && token.created_at)) {
            return 0;
        }

        const expiresIn = token.expires_in * 1000; // Convert to milliseconds
        const createdAt = token.created_at * 1000; // Convert to milliseconds
        const expiresAt = createdAt + expiresIn;
        const now = Date.now();

        // Calculate time until we should refresh (1 hour before expiration)
        const timeUntilExpiry = expiresAt - now - this.REFRESH_BUFFER;

        // If token is expired or will expire soon, refresh immediately
        if (timeUntilExpiry <= 0) {
            return 0;
        }

        return timeUntilExpiry;
    }

    shouldRefreshToken(): boolean {
        if (!appState.traktCredentials?.oAuth) {
            return true;
        }

        const token = JSON.parse(appState.traktCredentials.oAuth);
        const timeUntilRefresh = this.calculateTimeUntilRefresh(token);
        return timeUntilRefresh <= 0;
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
            const token = JSON.parse(appState.traktCredentials.oAuth);
            const isValid = this.validateToken(token);

            if (!isValid) {
                console.warn(
                    chalk.yellow('Stored token is invalid or expired, attempting to refresh...')
                );
                try {
                    const newToken = await this.refreshToken();
                    await this.trakt.import_token(newToken);
                    return;
                } catch (refreshError) {
                    console.error(chalk.red('Token refresh failed:'), refreshError);
                    throw new Error('Token is invalid and refresh failed. Please re-authenticate.');
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
        } catch {
            console.error(chalk.red('\nFAuthorization timed out. Please try again.'));
            throw new Error('Authorization timed out. Please try again.');
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
                if (appState.retryInterval) {
                    clearInterval(appState.retryInterval);
                    updateRetryInterval(null);
                }
                await this.discordRPC.spawnRPC(this);
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
                const user = await this.trakt.users.settings();
                watching = await this.trakt.users.watching({ username: user.user.username });
            }

            if (watching) {
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
            if (appState.retryInterval) {
                clearInterval(appState.retryInterval);
                updateRetryInterval(null);
            }
            await this.handleUpdateFailure();
        }
    }

    private async handleWatchingContent(watching: Movie | TvShow): Promise<void> {
        // Create unique ID for current content
        const contentId = this.isMovie(watching)
            ? `movie_${watching.movie.ids?.tmdb}`
            : `episode_${watching.episode.ids?.tmdb}`;

        // Only fetch images if content changed
        if (contentId !== this.currentContentId) {
            this.currentContentId = contentId;

            try {
                if (this.isMovie(watching)) {
                    // Movie - get movie poster
                    const movieId = watching.movie.ids?.tmdb;
                    if (movieId) {
                        const result = await getMovieImage(movieId);
                        this.currentImages = {
                            small: 'play',
                            large: result || 'trakt',
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
                            small: result?.episodeImage || 'play',
                            large: result?.seasonImage || 'trakt',
                        };
                    }
                }
            } catch (error) {
                console.error('❌ Failed to fetch images:', error);
                // Keep previous images or use defaults
            }
        }

        const traktContent: TraktContent = {
            smallImageKey: this.currentImages.small,
            largeImageKey: this.currentImages.large,
            startTimestamp: new Date(watching.started_at),
            endTimestamp: new Date(watching.expires_at),
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

    private formatTraktUrl(
        type: 'movie' | 'show',
        title: string,
        year?: number,
        season?: number,
        episode?: number
    ): string {
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
            startedAt: watching.started_at,
            endsAt: watching.expires_at,
            type: 'Movie',
        });

        await appState.rpc?.user?.setActivity({
            ...traktContent,
            details: detail,
            type: 3,
            buttons: [
                {
                    label: 'View on Trakt',
                    url: this.formatTraktUrl('movie', movie.title, movie.year),
                },
            ],
        });
    }

    private async handleEpisode(watching: TvShow, traktContent: TraktContent): Promise<void> {
        const { show, episode } = watching;
        const detail = show.title;
        const state = `S${episode.season}E${episode.number} (${episode.title})`;

        updateProgressBar({
            content: `${detail} - ${state}`,
            startedAt: watching.started_at,
            endsAt: watching.expires_at,
            type: 'TV Show',
        });

        await appState.rpc?.user?.setActivity({
            ...traktContent,
            details: detail,
            state,
            type: 3,
            buttons: [
                {
                    label: 'View on Trakt',
                    url: this.formatTraktUrl(
                        'show',
                        show.title,
                        undefined,
                        episode.season,
                        episode.number
                    ),
                },
            ],
        });
    }

    private async handleUpdateFailure(): Promise<void> {
        updateInstanceState(ConnectionState.Disconnected);
        await this.discordRPC.spawnRPC(this);
    }

    private generateTestWatchingData(type: 'movie' | 'show'): Movie | TvShow {
        const testMovie: Movie = {
            expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
            started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
            movie: {
                title: 'Interstellar',
                year: 2014,
                ids: {
                    tmdb: '157336',
                },
            },
        };

        const testShow: TvShow = {
            expires_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45 minutes from now
            started_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
            show: {
                title: 'Breaking Bad',
                ids: {
                    tmdb: '1396',
                },
            },
            episode: {
                season: 5,
                number: 16,
                title: 'Felina',
                ids: {
                    tmdb: '1396',
                },
            },
        };

        if (type === 'movie') {
            return testMovie;
        }

        return testShow;
    }

    private validateToken(token: TraktToken): boolean {
        try {
            if (!(token?.access_token && token.refresh_token)) {
                return false;
            }

            // Check if token is expired or will expire soon (within 5 minutes)
            const expiresIn = token.expires_in || 0;
            const createdAt = token.created_at || 0;
            const now = Math.floor(Date.now() / 1000);
            const timeElapsed = now - createdAt;

            return timeElapsed < expiresIn - 300;
        } catch (error) {
            console.error(chalk.red('Token validation failed:'), error);
            return false;
        }
    }
}
