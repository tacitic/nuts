import {getFullUrl} from "../utils/url";

const platforms = require('../utils/platforms');
const winReleases = require('../utils/win-releases');
const urljoin = require('urljoin.js');
const _ = require('lodash');

// Update Windows (Squirrel.Windows)
// Auto-updates: Squirrel.Windows: serve RELEASES from latest version
// Currently, it will only serve a full.nupkg of the latest release with a normalized filename (for pre-release)
export function onUpdateWin(req, res, next) {
    const that = this;

    const fullUrl = getFullUrl(req);
    let platform = 'win_32';
    const tag = req.params.version;

    that.init()
        .then(() => {
            platform = platforms.detect(platform);

            return that.versions.filter({
                tag: `>${tag}`,
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
}
