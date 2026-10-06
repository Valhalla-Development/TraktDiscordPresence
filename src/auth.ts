import chalk from 'chalk';
import { TraktInstance } from './services/traktInstance.ts';
import type { Configuration } from './types.ts';
import { isAuthenticationError } from './utils/request.ts';
import {
    MAX_SETTIMEOUT_MS,
    persistToken,
    readAuth,
    remainingMs,
    shouldRefreshToken,
} from './utils/traktToken.ts';

export class AuthSession {
    readonly trakt: TraktInstance;
    private config: Configuration;
    private refreshTimeoutId: NodeJS.Timeout | null = null;
    private lifecycle: 'active' | 'stopped' = 'active';
    private onFatal: (() => void) | null = null;

    private constructor(config: Configuration) {
        this.config = config;
        this.trakt = new TraktInstance(config, (updated) => {
            this.config = updated;
        });
    }

    static loadConfig(): Configuration {
        const requiredEnvVars = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'];
        const missing = requiredEnvVars.filter((key) => !process.env[key]);

        const fallback = process.env.DISCORD_CLIENT_ID;
        const movieDiscordClientId = process.env.MOVIE_DISCORD_CLIENT_ID || fallback;
        const seriesDiscordClientId = process.env.SERIES_DISCORD_CLIENT_ID || fallback;

        if (!(movieDiscordClientId && seriesDiscordClientId)) {
            missing.push(
                'DISCORD_CLIENT_ID (or both MOVIE_DISCORD_CLIENT_ID and SERIES_DISCORD_CLIENT_ID)'
            );
        }

        if (missing.length > 0) {
            console.error(
                chalk.red(`\nMissing required environment variables: ${missing.join(', ')}`)
            );
            process.exit(1);
        }

        return {
            clientId: process.env.TRAKT_CLIENT_ID!,
            clientSecret: process.env.TRAKT_CLIENT_SECRET!,
            discordClientId: movieDiscordClientId!,
            movieDiscordClientId: movieDiscordClientId!,
            seriesDiscordClientId: seriesDiscordClientId!,
        };
    }

    static async start(config: Configuration): Promise<AuthSession> {
        const session = new AuthSession(config);
        await session.ensureAuthenticated();
        await session.setupTokenRefresh();
        return session;
    }

    getClientId(): string {
        return this.config.discordClientId;
    }

    setFatalHandler(handler: () => void): void {
        this.onFatal = handler;
    }

    stopRefresh(): void {
        this.lifecycle = 'stopped';
        if (this.refreshTimeoutId) {
            clearTimeout(this.refreshTimeoutId);
            this.refreshTimeoutId = null;
        }
    }

    private async ensureAuthenticated(): Promise<void> {
        try {
            // Check for stored token first
            const storedToken = readAuth();
            if (storedToken) {
                try {
                    this.config = {
                        ...this.config,
                        oAuth: storedToken,
                    };
                    this.trakt.setConfig(this.config);

                    // Initialize the TraktInstance
                    await this.trakt.createTrakt();

                    return;
                } catch (error) {
                    if (!isAuthenticationError(error)) {
                        throw error;
                    }
                    console.warn(
                        chalk.yellow('Failed to load stored token, will authenticate again')
                    );
                }
            }

            // No valid stored token, need to authenticate
            await this.authoriseTrakt();
        } catch (error) {
            console.error(
                chalk.red(
                    'Failed to initialize authentication. Please check your connection and credentials.'
                ),
                error instanceof Error ? error.message : 'Unknown authentication error'
            );
            throw error;
        }
    }

    private async authoriseTrakt(): Promise<void> {
        // A rejected token must not be imported again before device authorization.
        const { oAuth: _rejectedToken, ...config } = this.config;
        this.trakt.setConfig(config);
        await this.trakt.createTrakt();

        try {
            console.log(chalk.blue('\nStarting device authentication flow...'));
            const token = await this.trakt.getDeviceAuthentication();

            this.trakt.setConfig(persistToken(token, this.trakt.getConfig()));

            console.log(chalk.green('\nAuthentication token saved successfully'));

            // Clear the console after successful authentication
            console.clear();
        } catch (error) {
            console.error(chalk.red('\nFailed to authenticate:'), error);
            throw error;
        }
    }

    private async setupTokenRefresh(): Promise<void> {
        // Schedule the first refresh based on token expiration
        await this.scheduleNextRefresh();
    }

    private async scheduleNextRefresh(): Promise<void> {
        if (this.lifecycle === 'stopped') {
            return;
        }
        const token = this.config.oAuth;
        if (!token) {
            return;
        }

        // Clear any existing timeout
        if (this.refreshTimeoutId) {
            clearTimeout(this.refreshTimeoutId);
            this.refreshTimeoutId = null;
        }

        let delay = remainingMs(token);
        if (delay <= 0) {
            try {
                await this.refreshAndSaveToken();
            } catch {
                this.scheduleRefreshRetry();
                return;
            }
            const nextToken = this.config.oAuth;
            if (nextToken && remainingMs(nextToken) > 0) {
                await this.scheduleNextRefresh();
            }
            return;
        }

        // Check if value is too large for a 32-bit signed integer
        if (delay > MAX_SETTIMEOUT_MS) {
            delay = MAX_SETTIMEOUT_MS;
        }

        // Schedule the next refresh
        this.refreshTimeoutId = setTimeout(async () => {
            try {
                await this.refreshAndSaveToken();
                await this.scheduleNextRefresh();
            } catch {
                this.scheduleRefreshRetry();
            }
        }, delay);
    }

    private scheduleRefreshRetry(): void {
        if (this.lifecycle === 'stopped') {
            return;
        }
        console.warn(chalk.yellow('Token refresh unavailable, retrying in 60 seconds.'));
        this.refreshTimeoutId = setTimeout(() => {
            this.scheduleNextRefresh().catch(() => this.scheduleRefreshRetry());
        }, 60_000);
    }

    private async refreshAndSaveToken(): Promise<void> {
        try {
            // Only refresh if needed
            if (shouldRefreshToken(this.config.oAuth)) {
                const newToken = await this.trakt.refreshToken();

                // Validate the new token
                if (!(newToken.access_token && newToken.refresh_token)) {
                    throw new Error('Invalid token received from refresh');
                }

                this.trakt.setConfig(persistToken(newToken, this.config));
            }
        } catch (error) {
            if (!isAuthenticationError(error)) {
                throw error;
            }
            // Re-authenticate only when Trakt rejects the credentials.
            try {
                await this.authoriseTrakt();
            } catch (authError) {
                console.error(
                    chalk.red(
                        'Authentication failed. Please check your credentials and try again.'
                    ),
                    authError
                );
                this.onFatal?.();
                process.exit(1);
            }
        }
    }
}
