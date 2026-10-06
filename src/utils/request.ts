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
