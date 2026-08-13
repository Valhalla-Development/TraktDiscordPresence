declare module 'trakt.tv' {
    import type { Movie, TraktToken, TvShow } from './types.ts';

    export default class Trakt {
        constructor(settings: { client_id: string; client_secret: string });
        get_codes(): Promise<{ user_code: string; verification_url: string }>;
        import_token(token: TraktToken): Promise<void>;
        poll_access(pollData: unknown): Promise<TraktToken>;
        refresh_token(): Promise<TraktToken>;
        users: {
            watching: (params: { username: string }) => Promise<Movie | TvShow | null>;
        };
    }
}
