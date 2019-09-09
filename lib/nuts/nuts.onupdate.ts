import {generateSignature} from "../utils/signature";
import {getFullUrl} from "../utils/url";

const _ = require('lodash');
const platforms = require('../utils/platforms');
const Q = require('q');
const notes = require('../utils/notes');
const urljoin = require('urljoin.js');

/**getFullUrl
 * Updater used by OSX (Squirrel.Mac) and others
 */
export function onUpdate(req, res, next) {
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
                tag: `>${tag}`,
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
        })
        .fail(next);
}
