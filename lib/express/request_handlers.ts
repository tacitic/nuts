export function logErrors(err, req, res, next) {
    if (err instanceof Error) {
        console.error(err);
    }
    next(err, req, res, next);
}

export function absorbUnknownErrors(err, req, res, next) {
    if (err instanceof Error && !err.hasOwnProperty('code')) { // FIXME(@czyk): I would rather to an instanceof check
        return next(new Error('Something went wrong.'));
    }
    next(err, req, res, next);
}

export function renderErrror(err, req, res) {
    const name = err.name || err.message;
    const msg = err.message || err;
    const code = err.code || 500;

    // Return error
    res.format({
        'text/plain': function () {
            res.status(code).send(msg);
        },
        'text/html': function () {
            res.status(code).send(`
                <!DOCTYPE html>
                <head>
                    <meta charset="UTF-8">
                    <title>${name}</title>
                </head>                
                <html lang="en-GB">
                    <body>
                        <h1>${msg}</h1>
                    </body>
                </html>
            `);
        },
        'application/json': function () {
            res.status(code).send({
                'name': name,
                'error': msg,
                'code': code
            });
        }
    });
}