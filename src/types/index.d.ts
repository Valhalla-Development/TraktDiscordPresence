export interface Configuration {
    clientId: string;
    clientSecret: string;
    discordClientId: string;
    movieDiscordClientId: string;
    oAuth?: string;
    seriesDiscordClientId: string;
}

export interface TraktContent {
    details?: string;
    endTimestamp?: Date;
    largeImageKey: string;
    smallImageKey: string;
    startTimestamp: Date;
    state?: string;
}

export interface Movie {
    expires_at: string;
    movie: {
        title: string;
        year: number;
        ids: {
            tmdb: string;
        };
    };
    started_at: string;
}

export interface TvShow {
    episode: {
        season: number;
        number: number;
        title: string;
        ids: {
            tmdb: string;
        };
    };
    expires_at: string;
    show: {
        title: string;
        ids: {
            tmdb: string;
        };
        year: number;
    };
    started_at: string;
}

export interface TraktToken {
    access_token: string;
    created_at: number;
    expires_in: number;
    refresh_token: string;
}

export interface ProgressBarPayload {
    content?: string;
    endsAt?: string;
    error?: string;
    startedAt?: string;
    type?: string;
}

export const ConnectionState = {
    Connected: 2,
    Connecting: 4,
    Disconnected: 3,
    Error: 5,
    NotPlaying: 1,
    Playing: 0,
} as const;

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];
