import {onUpdate} from "./nuts.onupdate";
import {onUpdateWin} from "./nuts.onUpdateWin";
import {onDownload} from "./nuts.ondownload";
import {onServeVersionsFeed} from "./nuts.onservecersionsfeed";
import {onUpdateRedirect} from "./nuts.onupdateredirect";
import {onServerNotes} from "./nuts.onservernotes";

const _ = require('lodash');
const Q = require('q');
const Understudy = require('understudy');
const express = require('express');
const useragent = require('express-useragent');

const BACKENDS = require('../backends/index');
const Versions = require('../versions');
const API_METHODS = require('../api');

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

    // this.router.get('/', this.onDownload);
    this.router.get('/download/channel/:channel/:platform?', onDownload.bind(this));
    this.router.get('/download/version/:tag/:platform?', onDownload.bind(this));
    this.router.get('/download/:tag/:filename', onDownload.bind(this));
    this.router.get('/download/:platform?', onDownload.bind(this));

    this.router.get('/feed/channel/:channel.atom', onServeVersionsFeed.bind(this));

    this.router.get('/update', onUpdateRedirect.bind(this));
    this.router.get('/update/:platform/:version', onUpdate.bind(this));
    this.router.get('/update/:platform/:version/RELEASES', onUpdateWin.bind(this));

    this.router.get('/notes/:version?', onServerNotes.bind(this));

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