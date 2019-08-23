import {NotFoundError} from "../utils/errors";
import {absorbUnknownErrors, logErrors, renderErrror} from "../express/request_handlers";

const express = require('express');
const uuid = require('uuid');
const basicAuth = require('basic-auth');
const Analytics = require('analytics-node');
const nuts = require('../index');

const app = express();

let analytics = undefined;
const downloadEvent = process.env.ANALYTICS_EVENT_DOWNLOAD || 'download';

if (process.env.ANALYTICS_TOKEN) {
    analytics = new Analytics(process.env.ANALYTICS_TOKEN, null);
}

const myNuts = nuts.Nuts({
    repository: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN,
    endpoint: process.env.GITHUB_ENDPOINT,
    username: process.env.GITHUB_USERNAME,
    password: process.env.GITHUB_PASSWORD,
    timeout: process.env.VERSIONS_TIMEOUT,
    cache: process.env.VERSIONS_CACHE,
    refreshSecret: process.env.GITHUB_SECRET,
    proxyAssets: !Boolean(process.env.DONT_PROXY_ASSETS),
    signedUrls: Boolean(process.env.SIGNED_URLS),
    signedUrlsSecret: process.env.SIGNED_URLS_SECRET,
});

// Control access to API
myNuts.before('api', (access, next) => {

    const apiAuth =  {
        username: process.env.API_USERNAME,
        password: process.env.API_PASSWORD
    };

    if (!apiAuth.username) return next();

    function unauthorized() {
        next(new Error('Invalid username/password for API'));
    }

    const user = basicAuth(access.req);
    if (!user || !user.name || !user.pass) {
        return unauthorized();
    }

    if (user.name === apiAuth.username && user.pass === apiAuth.password) {
        return next();
    } else {
        return unauthorized();
    }
});

// Log download
myNuts.before('download', (download, next) => {
    console.log('download', download.platform.filename, "for version", download.version.tag, "on channel", download.version.channel, "for", download.platform.type);

    next();
});
myNuts.after('download', (download, next) => {
    console.log('downloaded', download.platform.filename, "for version", download.version.tag, "on channel", download.version.channel, "for", download.platform.type);

    // Track on segment if enabled
    if (analytics) {
        const userId = download.req.query.user;

        analytics.track({
            event: downloadEvent,
            anonymousId: userId? null : uuid.v4(),
            userId: userId,
            properties: {
                version: download.version.tag,
                channel: download.version.channel,
                platform: download.platform.type,
                os: nuts.platforms.toType(download.platform.type)
            }
        });
    }

    next();
});

if (process.env.TRUST_PROXY) {
    try {
        const trustProxyObject = JSON.parse(process.env.TRUST_PROXY);
        app.set('trust proxy', trustProxyObject);
    }
    catch (e) {
        app.set('trust proxy', process.env.TRUST_PROXY);
    }
}

app.use(myNuts.router);

// Error handling
app.use((req, res, next) => {
    return next(new NotFoundError("Page not found"));
});

app.use(logErrors);
app.use(absorbUnknownErrors);
app.use(renderErrror);

// Start the HTTP server
myNuts.init()
    .then(() => {
        const server = app.listen(process.env.PORT || 5000, () => {
            const host = server.address().address;
            const port = server.address().port;

            console.log('Listening at http://%s:%s', host, port);
        });
    }, err => {
        console.log(err.stack || err);
        process.exit(1);
    });
