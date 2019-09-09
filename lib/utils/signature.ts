export function generateSignature(secret: string): string{
    // TODO(@czyk): how to sign etc?
    return Buffer.from(secret).toString('base64');
}

export function validateSignature(secret, signature): boolean {
    // TODO(@czyk): how to validate etc?
    return generateSignature(secret) === signature;
}