export function getFullUrl(req) {
    return req.protocol + '://' + req.get('host') + req.originalUrl;
}