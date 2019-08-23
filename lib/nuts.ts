import {generateSignature, validateSignature} from "./utils/signature";
import {UnauthorizedError} from "./utils/errors";

const _ = require('lodash');
const Q = require('q');
const Feed = require('feed');
const urljoin = require('urljoin.js');
const Understudy = require('understudy');
const express = require('express');
const useragent = require('express-useragent');

const BACKENDS = require('./backends');
const Versions = require('./versions');
const notes = require('./utils/notes');
const platforms = require('./utils/platforms');
const winReleases = require('./utils/win-releases');
const API_METHODS = require('./api');

function getFullUrl(req) {
    return req.protocol + '://' + req.get('host') + req.originalUrl;
}

export function Nuts(opts) {
    if (!(this instanceof Nuts)){
        // XXX(@czyk): `(_Nuts as any)` is order to satisfy the TypeScript Compiler
        //   @see https://stackoverflow.com/questions/37789502/only-void-function-can-be-called-with-the-new-keyword
        return new (Nuts as any)(opts);
    }
    const that = this;

    Understudy.call(this);
    _.bindAll(this);

    this.opts = _.defaults(opts || {}, {
        // Backend to use
        backend: 'github',

        // Timeout for releases cache (seconds)
        timeout: 60*60*1000,

        // Pre-fetch list of releases at startup
        preFetch: true,

        // Secret for GitHub webhook
        refreshSecret: 'secret',

        // Sign urls
        signedUrls: false,

        // Super Secret
        signedUrlsSecret: '',

        signedUrlsQueryParamKey: 'signature'
    });

    if(this.opts.signedUrls && this.opts.signedUrlsSecret.length < 3){
        throw new Error('signedUrls are enabled but not secret is set.');
    }

    // .init() is now a memoized version of ._init()
    this.init = _.memoize(this._init);

    // Create router
    this.router = express.Router();

    // Create backend
    this.backend = new (BACKENDS(this.opts.backend))(this, this.opts);
    this.versions = new Versions(this.backend);

    // Bind routes
    this.router.use(useragent.express());

    this.router.get('/', this.onDownload);
    this.router.get('/download/channel/:channel/:platform?', this.onDownload);
    this.router.get('/download/version/:tag/:platform?', this.onDownload);
    this.router.get('/download/:tag/:filename', this.onDownload);
    this.router.get('/download/:platform?', this.onDownload);

    this.router.get('/feed/channel/:channel.atom', this.onServeVersionsFeed);

    this.router.get('/update', this.onUpdateRedirect);
    this.router.get('/update/:platform/:version', this.onUpdate);
    this.router.get('/update/:platform/:version/RELEASES', this.onUpdateWin);

    this.router.get('/notes/:version?', this.onServeNotes);

    // Bind API
    this.router.use('/api', this.onAPIAccessControl);
    _.each(API_METHODS, function(method, route) {
        this.router.get('/api/' + route, (req, res, next) => Q()
            .then(() => method.call(that, req))
            .then(result => {
                res.send(result);
            }, next));
    }, this);
}

// _init does the real init work, initializing backend and prefetching versions
Nuts.prototype._init = function() {
    const that = this;
    return Q()
        .then(() => that.backend.init())
        .then(() => {
            if (!that.opts.preFetch){
                return;
            }
            return that.versions.list();
        });
};


// Perform a hook using promised functions
Nuts.prototype.performQ = function(name, arg, fn) {
    const that = this;
    fn = fn || function () { };

    console.log("this.perform", this, this.perform);

    return Q.nfcall(this.perform, name, arg, next => {
        Q()
            .then(() => fn.call(that, arg))
            .then(() => {
                next();
            }, next);
    })
};

// Serve an asset to the response
Nuts.prototype.serveAsset = function(req, res, version, asset) {
    const that = this;

    return that.init()
        .then(() => that.performQ('download', {
            req: req,
            version: version,
            platform: asset
        }, () => that.backend.serveAsset(asset, req, res)));
};

// Handler for download routes
Nuts.prototype.onDownload = function(req, res, next) {
    const that = this;

    if(that.opts.signedUrls){
        const key = that.opts.signedUrlsQueryParamKey;
        const signature = req.query[key];
        if(!validateSignature(that.opts.signedUrlsSecret, signature)){
            return next(new UnauthorizedError('Invalid Signature'));
        }
    }

    let channel = req.params.channel;
    let platform = req.params.platform;
    const tag = req.params.tag || 'latest';
    const filename = req.params.filename;
    const filetypeWanted = req.query.filetype;

    // When serving a specific file, platform is not required
    if (!filename) {
        // Detect platform from useragent
        if (!platform) {
            if (req.useragent.isMac) platform = platforms.OSX;
            if (req.useragent.isWindows) platform = platforms.WINDOWS;
            if (req.useragent.isLinux) platform = platforms.LINUX;
            if (req.useragent.isLinux64) platform = platforms.LINUX_64;
        }

        if (!platform) return next(new Error('No platform specified and impossible to detect one'));
    } else {
        platform = null;
    }

    // If specific version, don't enforce a channel
    if (tag != 'latest') channel = '*';

    this.versions.resolve({
        channel: channel,
        platform: platform,
        tag: tag
    })

    // Fallback to any channels if no version found on stable one
        .fail(err => {
            if (channel || tag != 'latest') throw err;

            return that.versions.resolve({
                channel: '*',
                platform: platform,
                tag: tag
            });
        })

        // Serve downloads
        .then(version => {
            let asset;

            if (filename) {
                asset = _.find(version.platforms, {
                    filename: filename
                });
            } else {
                asset = platforms.resolve(version, platform, {
                    wanted: filetypeWanted? '.'+filetypeWanted : null
                });
            }

            if (!asset) throw new Error("No download available for platform "+platform+" for version "+version.tag+" ("+(channel || "beta")+")");

            // Call analytic middleware, then serve
            return that.serveAsset(req, res, version, asset);
        })
        .fail(next);
};


// Request to update
Nuts.prototype.onUpdateRedirect = (req, res, next) => {
    Q()
        .then(() => {
            if (!req.query.version) throw new Error('Requires "version" parameter');
            if (!req.query.platform) throw new Error('Requires "platform" parameter');

            return res.redirect('/update/'+req.query.platform+'/'+req.query.version);
        })
        .fail(next);
};

// Updater used by OSX (Squirrel.Mac) and others
Nuts.prototype.onUpdate = function(req, res, next) {
    const that = this;
    const fullUrl = getFullUrl(req);
    let platform = req.params.platform;
    const tag = req.params.version;
    const filetype = req.query.filetype ? req.query.filetype : "zip";

    Q()
        .then(() => {

            if (!tag) throw new Error('Requires "version" parameter');
            if (!platform) throw new Error('Requires "platform" parameter');

            platform = platforms.detect(platform);

            return that.versions.filter({
                tag: '>='+tag,
                platform: platform,
                channel: '*'
            });
        })
        .then(versions => {
            const latest = _.first(versions);
            if (!latest || latest.tag == tag) return res.status(204).send('No updates'); // XXX(@czyk): Return 204Error

            let notesSlice = versions.slice(0, -1);
            if (versions.length === 1) {
                notesSlice = [versions[0]];
            }
            const releaseNotes = notes.merge(notesSlice, {includeTag: false});

            let queryParams = '?filetype='+filetype;

            if(that.opts.signedUrls){
                const signature = generateSignature(that.opts.signedUrlsSecret);
                queryParams += `&${that.opts.signedUrlsQueryParamKey}=${signature}`;
            }

            res.status(200).send({
                "url": urljoin(fullUrl, '/../../../', '/download/version/' + latest.tag + '/' + platform + queryParams),
                "name": latest.tag,
                "notes": releaseNotes,
                "pub_date": latest.published_at.toISOString()
            });
            next();
        })
        .fail(next);
};

// Update Windows (Squirrel.Windows)
// Auto-updates: Squirrel.Windows: serve RELEASES from latest version
// Currently, it will only serve a full.nupkg of the latest release with a normalized filename (for pre-release)
Nuts.prototype.onUpdateWin = function(req, res, next) {
    const that = this;

    const fullUrl = getFullUrl(req);
    let platform = 'win_32';
    const tag = req.params.version;

    that.init()
        .then(() => {
            platform = platforms.detect(platform);

            return that.versions.filter({
                tag: '>='+tag,
                platform: platform,
                channel: '*'
            });
        })
        .then(versions => {
            // Update needed?
            const latest = _.first(versions);
            if (!latest) throw new Error("Version not found");

            // File exists
            const asset = _.find(latest.platforms, {
                filename: 'RELEASES'
            });
            if (!asset) throw new Error("File not found");

            return that.backend.readAsset(asset)
                .then(content => {
                    let releases = winReleases.parse(content.toString('utf-8'));

                    releases = _.chain(releases)

                    // Change filename to use download proxy
                        .map(function (entry) {
                            // TODO(@czyk): Signed URLS
                            entry.filename = urljoin(fullUrl, '/../../../../', '/download/' + entry.semver + '/' + entry.filename);
                            return entry;
                        })

                        .value();

                    const output = winReleases.generate(releases);

                    res.header('Content-Length', output.length);
                    res.attachment("RELEASES");
                    res.send(output);
                });
        })
        .fail(next);
};

// Serve releases notes
Nuts.prototype.onServeNotes = function(req, res, next) {
    const that = this;
    const tag = req.params.version;

    Q()
        .then(() => that.versions.filter({
            tag: tag ? '>=' + tag : '*',
            channel: '*'
        }))
        .then(versions => {
            const latest = _.first(versions);

            if (!latest) throw new Error('No versions matching');

            res.format({
                'text/plain': () => {
                    res.send(notes.merge(versions));
                },
                'application/json': () => {
                    res.send({
                        "notes": notes.merge(versions, { includeTag: false }),
                        "pub_date": latest.published_at.toISOString()
                    });
                },
                'default': () => {
                    res.send(notes.merge(versions));
                }
            });
        })
        .fail(next);
};

// Serve versions list as RSS
Nuts.prototype.onServeVersionsFeed = function(req, res, next) {
    const that = this;
    const channel = req.params.channel || 'all';
    const channelId = channel === 'all' ? '*' : channel;
    const fullUrl = getFullUrl(req);

    const feed = new Feed({
        id: 'versions/channels/' + channel,
        title: 'Versions (' + channel + ')',
        link: fullUrl
    });

    Q()
        .then(() => that.versions.filter({
            channel: channelId
        }))
        .then(versions => {
            _.each(versions, version => {
                feed.addItem({
                    title: version.tag,
                    link:  urljoin(fullUrl, '/../../../', '/download/version/'+version.tag),
                    description: version.notes,
                    date: version.published_at,
                    author: []
                });
            });

            res.set('Content-Type', 'application/atom+xml; charset=utf-8');
            res.send(feed.render('atom-1.0'));
        })
        .fail(next);
};

// Control access to the API
Nuts.prototype.onAPIAccessControl = function(req, res, next) {
    this.performQ('api', {
        req: req,
        res: res
    })
        .then(() => {
            next();
        }, next);
};