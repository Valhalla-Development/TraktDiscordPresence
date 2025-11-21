export type Configuration = {
    clientId: string;
    clientSecret: string;
    discordClientId: string;
    movieDiscordClientId: string;
    seriesDiscordClientId: string;
    oAuth?: string;
};

export type TraktContent = {
    smallImageKey: string;
    largeImageKey: string;
    startTimestamp: Date;
    endTimestamp?: Date;
    details?: string;
    state?: string;
};

export type Movie = {
    expires_at: string;
    started_at: string;
    movie: {
        title: string;
        year: number;
        ids: {
            tmdb: string;
        };
    };
};

export type TvShow = {
    expires_at: string;
    started_at: string;
    show: {
        title: string;
        ids: {
            tmdb: string;
        };
        year: number;
    };
    episode: {
        season: number;
        number: number;
        title: string;
        ids: {
            tmdb: string;
        };
    };
};

export type TraktToken = {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    created_at: number;
};

export type ProgressBarPayload = {
    content?: string;
    startedAt?: string;
    endsAt?: string;
    type?: string;
    error?: string;
};

export const ConnectionState = {
    Playing: 0,
    NotPlaying: 1,
    Connected: 2,
    Disconnected: 3,
    Connecting: 4,
    Error: 5,
} as const;

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];
