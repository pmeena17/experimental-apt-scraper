'use strict';

const { load, linesOf, cardsByLink } = require('../html');
const { makeListing } = require('../listing');
const { parseNumber, detectWbs, parseAddress, absoluteUrl } = require('../util');
const { ortsteilInfo } = require('../location');
const { fetchDetailGeneric } = require('./common');

const BASE = 'https://www.wbm.de/wohnungen-berlin/angebote/';

function isDetailLink(href)
{
    return href.includes('/wohnungen-berlin/angebote/details/');
}

// card: title (+ address) / "Street 1, 13591 Berlin" / "1.112,13 € Warmmiete" / "3 Zimmer" / optional district line
function parseCard(lines, href)
{
    const title = (lines[0] || '').replace(/\s+\S+(?:\s\S+)*\s+\d{5}\s+Berlin\s*$/, '').trim() || lines[0] || '';
    const addrLine = lines.find((l) => /^[^,]+,\s*\d{5}\s+Berlin/.test(l)) || '';
    const addr = parseAddress(addrLine);
    const rest = lines.slice(1).join(' ');
    const warm = (rest.match(/([\d.]*\d,\d{2})\s*€\s*Warmmiete/) || [])[1];
    const roomsLine = lines.slice(1).find((l) => /^\d+(?:,\d)?\s*Zimmer$/i.test(l));
    const rooms = roomsLine ? roomsLine.match(/^(\d+(?:,\d)?)/)[1] : (rest.match(/(\d+(?:,\d)?)\s*Zimmer/) || [])[1];
    const area = (rest.match(/([\d.]*\d[,.]\d{1,2})\s*m²/) || [])[1];
    const placeLine = lines.slice(1).find((l) => l.length < 30 && !/\d/.test(l) && ortsteilInfo(l));
    const ot = placeLine ? ortsteilInfo(placeLine) : null;
    return makeListing({
        source: 'wbm',
        company: 'wbm',
        url: href,
        title,
        text: lines.join(' '),
        street: addr.street,
        plz: addr.plz,
        bezirk: ot ? ot.bezirk : null,
        ortsteil: ot ? ot.name : null,
        rooms: parseNumber(rooms),
        area: parseNumber(area),
        rentWarm: parseNumber(warm),
        wbs: detectWbs(title)
    });
}

async function fetchList(ctx)
{
    const res = await ctx.http.get(BASE, { cache: true });
    if (res.notModified)
    {
        return { listings: [], unchanged: true };
    }
    const $ = load(res.text);
    const listings = cardsByLink($, isDetailLink).map((card) => parseCard(linesOf($, card.node), absoluteUrl(card.href, BASE)));
    return { listings };
}

async function fetchDetail(ctx, listing)
{
    await fetchDetailGeneric(ctx, listing, {});
}

module.exports = { name: 'wbm', listUrl: BASE, fetchList, fetchDetail, parseCard };
