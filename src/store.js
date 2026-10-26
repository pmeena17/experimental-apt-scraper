'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { keysOf } = require('./listing');

const KEEP_DAYS = 45;

class Store
{
    constructor(file)
    {
        this.file = file;
        this.data = { version: 1, baseline: {}, entries: {} };
        this.timer = null;
        this.load();
    }

    load()
    {
        if (!this.file || !fs.existsSync(this.file))
        {
            return;
        }
        try
        {
            const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            this.data = { version: 1, baseline: parsed.baseline || {}, entries: parsed.entries || {} };
        }
        catch (err)
        {
            console.error('state file unreadable, starting fresh:', err.message);
        }
        const cutoff = Date.now() - KEEP_DAYS * 86400000;
        for (const key of Object.keys(this.data.entries))
        {
            if (Date.parse(this.data.entries[key].first) < cutoff)
            {
                delete this.data.entries[key];
            }
        }
    }

    // Existing entry for this flat, or null. fp keys only count when one side has no object id,
    // so two identical flats in one building (different ids) are not merged.
    find(listing)
    {
        const { urlKey, idKey, fpKey } = keysOf(listing);
        const entries = this.data.entries;
        if (urlKey && entries[urlKey])
        {
            return entries[urlKey];
        }
        if (idKey && entries[idKey])
        {
            return entries[idKey];
        }
        if (fpKey && entries[fpKey] && (!idKey || !entries[fpKey].idKey))
        {
            return entries[fpKey];
        }
        return null;
    }

    add(listing, meta)
    {
        const { urlKey, idKey, fpKey } = keysOf(listing);
        const entry = { first: new Date().toISOString(), source: listing.source, company: listing.company, url: listing.url, title: listing.title, idKey, notified: false, seenBy: {}, ...meta };
        for (const key of [urlKey, idKey, fpKey])
        {
            if (key && !this.data.entries[key])
            {
                this.data.entries[key] = entry;
            }
        }
        this.save();
        return entry;
    }

    // after a detail fetch the listing may have gained an object id / size: register the new keys on the same entry
    addKeys(listing, entry)
    {
        const { idKey, fpKey } = keysOf(listing);
        entry.idKey = entry.idKey || idKey;
        for (const key of [idKey, fpKey])
        {
            if (key && !this.data.entries[key])
            {
                this.data.entries[key] = entry;
            }
        }
        this.save();
    }

    // Another entry (not `own`) already known under the object id? -> same flat seen on another source
    findOther(listing, own)
    {
        const { idKey } = keysOf(listing);
        const other = idKey ? this.data.entries[idKey] : null;
        return other && other !== own ? other : null;
    }

    // remembers how many seconds after the first sighting another source saw the same flat
    noteSeenBy(entry, sourceName)
    {
        if (sourceName !== entry.source && entry.seenBy[sourceName] === undefined)
        {
            const lag = Math.round((Date.now() - Date.parse(entry.first)) / 1000);
            entry.seenBy[sourceName] = lag;
            this.save();
            return lag;
        }
        return null;
    }

    save()
    {
        if (!this.file || this.timer)
        {
            return;
        }
        this.timer = setTimeout(() =>
        {
            this.timer = null;
            this.flush();
        }, 400);
    }

    flush()
    {
        if (!this.file)
        {
            return;
        }
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file);
    }
}

module.exports = { Store };
