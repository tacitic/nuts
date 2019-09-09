import {validateSignature} from "../utils/signature";
import {UnauthorizedError} from "../utils/errors";

const _ = require('lodash');
const platforms = require('../utils/platforms');

export function onDownload(req, res, next) {

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
}