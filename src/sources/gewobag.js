'use strict';

const { load, linesOf, cardsByLink } = require('../html');
const { extractKv, pick } = require('../kv');
const { makeListing } = require('../listing');
const { parseNumber, detectWbs, parseAddress, absoluteUrl, BEZIRKE } = require('../util');
const { fetchDetailGeneric } = require('./common');

const BASE = 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/';
const FIRST = BASE + '?objekttyp%5B%5D=wohnung';

function pageUrl(n)
{
    return BASE + 'page/' + n + '/?objekttyp%5B0%5D=wohnung';
}

function isDetailLink(href)
{
    return /\/mietangebote\/\d{4}-\d{5}-\d{4}-\d{4}\/?(\?|#|$)/.test(href);
}

// card: tag lines ("WBS erforderlich", "für Senioren") + table rows Bezirk / Adresse / Fläche / Frei ab / Gesamtmiete
function parseCard(lines, href)
{
    const kv = extractKv(lines);
    const flat = lines.join(' ');
    const addr = parseAddress(pick(kv, 'Adresse') || '');
    const areaMatch = flat.match(/(\d+(?:,\d)?)\s*Zimmer\s*\|\s*([\d.]*\d,\d{1,2})\s*m²/);
    const rentMatch = flat.match(/Gesamtmiete\s*(?:ab\s*)?([\d.]*\d,\d{2})\s*€/);
    const text = flat;
    const wbs = detectWbs(text);
    const flags = /Einkommensgrenzen/i.test(text) ? ['income limits'] : [];
    return makeListing({
        source: 'gewobag',
        company: 'gewobag',
        url: href,
        title: addr.rest || '',
        text,
        street: addr.street,
        plz: addr.plz,
        bezirk: addr.bezirk,
        ortsteil: pick(kv, 'Bezirk') || null,
        rooms: areaMatch ? parseNumber(areaMatch[1]) : null,
        area: areaMatch ? parseNumber(areaMatch[2]) : null,
        rentWarm: rentMatch ? parseNumber(rentMatch[1]) : null,
        wbs,
        available: pick(kv, 'Frei ab'),
        flags
    });
}

function collect($, base, listings)
{
    for (const card of cardsByLink($, isDetailLink))
    {
        listings.push(parseCard(linesOf($, card.node), absoluteUrl(card.href, base)));
    }
}

async function fetchList(ctx)
{
    const maxPages = ctx.cfg.maxPages || 10;
    const listings = [];
    const first = await ctx.http.get(FIRST);
    const $first = load(first.text);
    collect($first, FIRST, listings);
    let last = 1;
    $first('a[href]').each((i, a) =>
    {
        const m = ($first(a).attr('href') || '').match(/\/page\/(\d+)\//);
        if (m)
        {
            last = Math.max(last, parseInt(m[1], 10));
        }
    });
    last = Math.min(last, maxPages);
    const rest = [];
    for (let p = 2; p <= last; p++)
    {
        rest.push(ctx.http.get(pageUrl(p)));
    }
    for (const res of await Promise.all(rest))
    {
        collect(load(res.text), BASE, listings);
    }
    return { listings };
}

// Gewobag marks WBS flats explicitly; no mark after the detail page = no WBS needed
async function fetchDetail(ctx, listing)
{
    await fetchDetailGeneric(ctx, listing, { wbsDefault: false });
}

module.exports = { name: 'gewobag', listUrl: FIRST, fetchList, fetchDetail, parseCard, wbsDefault: false };
