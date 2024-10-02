// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import {
    ConnectionState, Movie, TvShow, TraktContent, TraktToken,
} from '../types';
import { updateProgressBar } from '../utils/progressBar.js';
import { appState, updateInstanceState, updateRetryInterval } from '../state/appState.js';
import { DiscordRPC } from './discordRPC.js';

export class TraktInstance {
    private trakt: Trakt;

    private discordRPC: DiscordRPC;

    constructor() {
        this.discordRPC = new DiscordRPC();
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
            this.trakt.import_token(JSON.parse(appState.traktCredentials.oAuth));
        }
    }

    async getAuthorizationUrl(): Promise<string> {
        return this.trakt.get_url();
    }

    async exchangeCodeForToken(code: string): Promise<TraktToken> {
        try {
            await this.trakt.exchange_code(code);
            return this.trakt.export_token();
        } catch (error) {
            console.error('Failed to exchange code for token:', error);
            throw error;
        }
    }

    async updateStatus(): Promise<void> {
        try {
            if (!appState.rpc || !appState.rpc.transport.isConnected) {
                updateInstanceState(ConnectionState.Disconnected);
                updateProgressBar({ error: 'Discord RPC not connected. Attempting to reconnect...' });
                if (appState.retryInterval) {
                    clearInterval(appState.retryInterval);
                    updateRetryInterval(null);
                }
                await this.discordRPC.spawnRPC(this);
                return;
            }

            const user = await this.trakt.users.settings();
            const watching = await this.trakt.users.watching({ username: user.user.username });

            if (watching) {
                updateInstanceState(ConnectionState.Playing);
                await this.handleWatchingContent(watching);
            } else {
                updateInstanceState(ConnectionState.NotPlaying);
                updateProgressBar();
            }
        } catch (error) {
            updateInstanceState(ConnectionState.Error);
            updateProgressBar({ error: `Failed to update status: ${error}` });
            if (appState.retryInterval) {
                clearInterval(appState.retryInterval);
                updateRetryInterval(null);
            }
            await this.handleUpdateFailure();
        }
    }

    private async handleWatchingContent(watching: Movie | TvShow): Promise<void> {
        const traktContent: TraktContent = {
            smallImageKey: 'play',
            largeImageKey: 'trakt',
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

    private async handleMovie(watching: Movie, traktContent: TraktContent): Promise<void> {
        const { movie } = watching;
        const detail = `${movie.title} (${movie.year})`;

        updateProgressBar({
            content: detail,
            startedAt: watching.started_at,
            endsAt: watching.expires_at,
            type: 'Movie',
        });

        await appState.rpc?.user?.setActivity({ ...traktContent, details: detail });
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

        await appState.rpc?.user?.setActivity({ ...traktContent, details: detail, state });
    }

    private async handleUpdateFailure(): Promise<void> {
        updateInstanceState(ConnectionState.Disconnected);
        await this.discordRPC.spawnRPC(this);
    }
}
