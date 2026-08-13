import chalk from 'chalk';
import { imagesForWatching, isMovie, mapWatching, watchingContentId } from '../presence.ts';
import { getTestWatching, parseTestType } from '../testWatching.ts';
import { ConnectionState, type Movie, type TvShow } from '../types/index.d';
import { setInstanceState, updateProgressBar } from '../utils/progressBar.ts';
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
                const errorMsg =
                    'Discord is not running or RPC connection was lost. Attempting to reconnect...';
                setInstanceState(ConnectionState.Disconnected, {
                    error: errorMsg,
                });
                this.discordRPC.scheduleReconnect();
                return;
            }

            const isTestMode = process.argv.includes('--test');
            let watching: Movie | TvShow | null;

            if (isTestMode) {
                const testType = parseTestType();
                console.log(chalk.blue(`🧪 Test mode: Simulating watching ${testType}...`));
                watching = getTestWatching(testType);
            } else {
                watching = await this.trakt.getWatching();
            }

            if (watching) {
                const contentType = isMovie(watching) ? 'movie' : 'show';
                const hasActiveClient = await this.ensureDiscordClientForContent(contentType);
                if (!hasActiveClient) {
                    return;
                }

                await this.handleWatchingContent(watching);
                setInstanceState(ConnectionState.Playing);
            } else {
                setInstanceState(ConnectionState.NotPlaying);

                // Clear the Discord activity when nothing is playing
                await this.discordRPC.clearActivity();
            }
        } catch (error) {
            const errorMsg = `Failed to update status: ${error}.`;
            setInstanceState(ConnectionState.Error, { error: errorMsg });
            if (!this.discordRPC.isConnected()) {
                this.discordRPC.scheduleReconnect();
            }
        }
    }

    private async handleWatchingContent(watching: Movie | TvShow): Promise<void> {
        // Create unique ID for current content
        const contentId = watchingContentId(watching);

        // Only fetch images if content changed
        if (contentId !== this.currentContentId) {
            this.currentContentId = contentId;
            const nextImages = await imagesForWatching(watching);
            if (nextImages) {
                this.currentImages = nextImages;
            }
        }

        const { activity, progress } = mapWatching(watching, this.currentImages);
        updateProgressBar(progress);
        await this.discordRPC.setActivity(activity);
    }

    private async ensureDiscordClientForContent(contentType: 'movie' | 'show'): Promise<boolean> {
        const config = this.trakt.getConfig();
        const targetClientId =
            contentType === 'movie' ? config.movieDiscordClientId : config.seriesDiscordClientId;

        if (
            targetClientId &&
            targetClientId === config.discordClientId &&
            this.discordRPC.isConnected()
        ) {
            return true;
        }

        if (!targetClientId) {
            return true;
        }

        this.trakt.setConfig({
            ...config,
            discordClientId: targetClientId,
        });

        await this.discordRPC.reconnect();
        return false;
    }
}
