import chalk from 'chalk';
// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import type { Configuration, Movie, TraktToken, TvShow } from '../types/index.d';
import { persistToken, shouldRefreshToken } from '../utils/traktToken.ts';

export class TraktInstance {
    private trakt: Trakt;
    private config: Configuration;
    private readonly onConfig?: (config: Configuration) => void;

    constructor(config: Configuration, onConfig?: (config: Configuration) => void) {
        this.config = config;
        this.onConfig = onConfig;
    }

    getConfig(): Configuration {
        return this.config;
    }

    setConfig(config: Configuration): void {
        this.config = config;
        this.onConfig?.(config);
    }

    async createTrakt(): Promise<void> {
        this.trakt = new Trakt({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
        });

        if (this.config.oAuth) {
            const token = this.config.oAuth;

            if (shouldRefreshToken(token)) {
                console.warn(
                    chalk.yellow('Stored token is invalid or expired, attempting to refresh...')
                );
                try {
                    await this.trakt.import_token(token);
                    const newToken = await this.refreshToken();
                    this.setConfig(persistToken(newToken, this.config));
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

    async getWatching(
        testMode = false,
        testType?: 'movie' | 'show'
    ): Promise<Movie | TvShow | null> {
        if (testMode) {
            // Generate test data
            const watching = this.generateTestWatchingData(testType!);
            const typeMsg = testType ? `${testType}` : 'random content';
            console.log(chalk.blue(`🧪 Test mode: Simulating watching ${typeMsg}...`));
            return watching;
        }

        // Normal mode: get real data from Trakt
        return await this.trakt.users.watching({ username: 'me' });
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
}
