'use strict';

const { normId, normStreetKey, objectIdFromUrl, energyClassFromKwh } = require('./util');

// One flat, whatever source it came from. Unknown values are null, never guessed.
function makeListing(base)
{
    const l = {
        source: null,
        company: null,
        url: null,
        title: '',
        text: '',
        street: null,
        plz: null,
        bezirk: null,
        ortsteil: null,
        rooms: null,
        area: null,
        rentCold: null,
        rentWarm: null,
        floor: null,
        floors: null,
        energyClass: null,
        energyKwh: null,
        wbs: null,
        available: null,
        listedOn: null,
        objectNumber: null,
        id: null,
        flags: [],
        closed: false,
        seenAt: Date.now(),
        ...base
    };
    if (!l.id && l.company && l.url)
    {
        const fromUrl = objectIdFromUrl(l.company, l.url);
        l.id = fromUrl ? normId(fromUrl) : null;
    }
    else if (l.id)
    {
        l.id = normId(l.id);
    }
    if (!l.energyClass && l.energyKwh)
    {
        l.energyClass = energyClassFromKwh(l.energyKwh);
    }
    return l;
}

// Keys that identify a flat. url: the exact page; id: the company's object id (same on all sources);
// fp: street + rooms + size, used only when no object id is known yet.
function keysOf(listing)
{
    const urlKey = listing.url ? 'url:' + listing.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase() : null;
    const idKey = listing.id && listing.company ? 'id:' + listing.company + ':' + listing.id : null;
    const fpKey = listing.street && listing.rooms !== null && listing.area !== null ? 'fp:' + normStreetKey(listing.street) + '|' + listing.rooms + '|' + Math.round(listing.area * 10) : null;
    return { urlKey, idKey, fpKey };
}

module.exports = { makeListing, keysOf };
