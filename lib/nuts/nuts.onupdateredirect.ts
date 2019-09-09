const Q = require('q');

// Request to update
export function onUpdateRedirect(req, res, next){
    Q()
        .then(() => {
            if (!req.query.version) throw new Error('Requires "version" parameter');
            if (!req.query.platform) throw new Error('Requires "platform" parameter');

            return res.redirect('/update/'+req.query.platform+'/'+req.query.version);
        })
        .fail(next);
}
