export function generateSignature(secret: string): string{
    // TODO(@czyk): how to sign etc?
    return secret;
}

export function validateSignature(secret, signature): boolean {
    // TODO(@czyk): how to validate etc?
    return secret === signature;
}