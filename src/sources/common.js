'use strict';

const { load, mainLines } = require('../html');
const { extractKv } = require('../kv');
const { applyDetail } = require('../detail');
const { detectWbs } = require('../util');

// Fetches the exposé page of a listing and fills the missing fields.
async function fetchDetailGeneric(ctx, listing, options)
{
    const res = await ctx.http.get(listing.url);
    const $ = load(res.text);
    const lines = mainLines($);
    applyDetail(listing, extractKv(lines), lines);
    if (listing.wbs === null)
    {
        listing.wbs = detectWbs(lines.filter((l) => /WBS/i.test(l)).join(' '));
    }
    if (listing.wbs === null && options && options.wbsDefault !== undefined)
    {
        listing.wbs = options.wbsDefault;
    }
}

module.exports = { fetchDetailGeneric };
