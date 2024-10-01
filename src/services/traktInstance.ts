// @ts-expect-error [currently, no types file exists for trakt.tv, so this will cause an error]
import Trakt from 'trakt.tv';
import {
    ConnectionState, Configuration, Movie, TvShow, TraktContent,
} from '../types';
import { updateProgressBar } from '../utils/progressBar';
import { appState, updateInstanceState } from '../state/appState';
import { DiscordRPC } from './discordRPC';

export class TraktInstance {
    private trakt: Trakt;

    async createTrakt(traktCredentials: Configuration): Promise<void> {
        this.trakt = new Trakt({
            client_id: traktCredentials.clientId,
            client_secret: traktCredentials.clientSecret,
        });

        this.trakt.import_token(traktCredentials.oAuth);
    }

    async updateStatus(): Promise<void> {
        try {
            if (!appState.rpc || !appState.rpc.transport.isConnected) {
                throw new Error('Discord RPC not connected');
            }

            const user = await this.trakt.users.settings();
            const watching = await this.trakt.users.watching({ username: user.user.username });

            if (watching) {
                updateInstanceState(ConnectionState.Playing);
                await this.handleWatchingContent(watching);
            } else {
                updateInstanceState(ConnectionState.NotPlaying);
                await this.handleNotPlaying();
            }
        } catch (error) {
            console.error('Failed to update status:', error);
            await this.handleUpdateFailure();
        }
    }

    private async handleWatchingContent(watching: Movie | TvShow): Promise<void> {
        const traktContent: TraktContent = {
            smallImageKey: 'play',
            largeImageKey: 'trakt',
            startTimestamp: new Date(watching.started_at),
        };

        if ('movie' in watching) {
            await this.handleMovie(watching, traktContent);
        } else {
            await this.handleEpisode(watching, traktContent);
        }
    }

    private async handleMovie(watching: Movie, traktContent: TraktContent): Promise<void> {
        const { movie } = watching;
        const detail = `${movie.title} (${movie.year})`;

        await this.updateProgressBar(watching, detail, 'Movie');
        await appState.rpc?.user?.setActivity({ ...traktContent, details: detail });
    }

    private async handleEpisode(watching: TvShow, traktContent: TraktContent): Promise<void> {
        const { show, episode } = watching;
        const detail = show.title;
        const state = `S${episode.season}E${episode.number} (${episode.title})`;

        await this.updateProgressBar(watching, `${detail} - ${state}`, 'TV Show');
        await appState.rpc?.user?.setActivity({ ...traktContent, details: detail, state });
    }

    private async handleNotPlaying(): Promise<void> {
        await updateProgressBar();
        await appState.rpc?.user?.clearActivity();
    }

    private async handleUpdateFailure(): Promise<void> {
        updateInstanceState(ConnectionState.Disconnected);
        const discordRPC = new DiscordRPC();
        await discordRPC.spawnRPC(this, appState.traktCredentials);
    }

    private async updateProgressBar(watching: Movie | TvShow, content: string, type: string): Promise<void> {
        // TODO
        await updateProgressBar();
    }
}
