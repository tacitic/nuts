// Serve versions list as RSS
// FIXME(@czyk): re-enable
export function onServeVersionsFeed(req, res, next) {
//     const that = this;
//     const channel = req.params.channel || 'all';
//     const channelId = channel === 'all' ? '*' : channel;
//     const fullUrl = getFullUrl(req);
//
//     const feed = new Feed({
//         id: 'versions/channels/' + channel,
//         title: 'Versions (' + channel + ')',
//         link: fullUrl
//     });
//
//     Q()
//         .then(() => that.versions.filter({
//             channel: channelId
//         }))
//         .then(versions => {
//             _.each(versions, version => {
//                 feed.addItem({
//                     title: version.tag,
//                     link:  urljoin(fullUrl, '/../../../', '/download/version/'+version.tag),
//                     description: version.notes,
//                     date: version.published_at,
//                     author: []
//                 });
//             });
//
//             res.set('Content-Type', 'application/atom+xml; charset=utf-8');
//             res.send(feed.render('atom-1.0'));
//         })
//         .fail(next);
}
