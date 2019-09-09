const Q = require('q')
const notes = require('../utils/notes');
const _ = require('lodash');


// Serve releases notes
// FIXME(@czyk): re-enable
export function onServerNotes(req, res, next) {
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
                        "pub_date": (latest as any).published_at.toISOString()
                    });
                },
                'default': () => {
                    res.send(notes.merge(versions));
                }
            });
        })
        .fail(next);
}
