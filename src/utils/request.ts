/** Identify rejected OAuth credentials without treating outages as revocation. */
export function isAuthenticationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    if ('response' in error && typeof error.response === 'object' && error.response !== null) {
        const { response } = error;
        if (
            'statusCode' in response &&
            (response.statusCode === 400 || response.statusCode === 401)
        ) {
            return true;
        }
    }
    // The Trakt SDK converts some OAuth 401 responses into plain errors.
    return (
        /invalid[_ ](?:grant|token)|(?:token|grant).*(?:invalid|revoked|expired)/i.test(
            error.message
        ) ||
        (error.cause instanceof Error && isAuthenticationError(error.cause))
    );
}

/** Bound polling even when a service does not expose request cancellation. */
export async function withRequestTimeout<T>(
    request: Promise<T>,
    service: string,
    timeoutMs = 15_000
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${service} request timed out`)), timeoutMs);
    });
    try {
        return await Promise.race([request, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** Abort optional artwork requests, including response-body reads. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
    const timeout = AbortSignal.timeout(15_000);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
};
