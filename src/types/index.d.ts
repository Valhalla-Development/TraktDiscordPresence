export interface Configuration {
    clientId: string;
    clientSecret: string;
    discordClientId: string;
    oAuth?: string;
}

export interface TraktContent {
    smallImageKey: string;
    largeImageKey: string;
    startTimestamp: Date;
    details?: string;
    state?: string;
}

export interface Movie {
    expires_at: string;
    started_at: string;
    movie: {
        title: string;
        year: number;
    }
}

export interface TvShow {
    expires_at: string;
    started_at: string;
    show: {
        title: string;
    }
    episode: {
        season: number;
        number: number;
        title: string;
    }
}

export interface TraktToken {
    access_token: string;
    expires: number;
    refresh_token: string;
}

export interface ProgressBarPayload {
    content?: string;
    startedAt?: string;
    endsAt?: string;
    type?: string;
}

export const enum ConnectionState {
    Playing,
    NotPlaying,
    Connected,
    Disconnected,
    Connecting
}
