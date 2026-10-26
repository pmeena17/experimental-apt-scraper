'use strict';

const { load, linesOf, cardsByLink } = require('../html');
const { extractKv, pick } = require('../kv');
const { makeListing } = require('../listing');
const { parseNumber, parseFloor, parseAddress, companyFromUrl, absoluteUrl } = require('../util');

const BASE = 'https://www.inberlinwohnen.de/wohnungsfinder';

function isDetailLink(href, a)
{
    return /Alle Details/i.test(a.text()) || /Expose/i.test(a.attr('title') || '');
}

// lines of one card -> listing (pure function, unit-tested with real page text)
function parseCard(lines, href)
{
    const kv = extractKv(lines);
    const company = companyFromUrl(href);
    if (!company)
    {
        return null;
    }
    const addr = parseAddress(pick(kv, 'Adresse') || '');
    const title = lines.find((l) => !/^\d+[.,]?\d*\s*Zimmer/i.test(l) && !/Alle Details|Wohnungsbild|^Adresse|^Eine Wohnung/i.test(l) && l.length > 5) || '';
    const cold = parseNumber(pick(kv, 'Kaltmiete'));
    const extra = parseNumber(pick(kv, 'Nebenkosten'));
    const warm = parseNumber(pick(kv, 'Gesamtmiete')) || (cold !== null && extra !== null ? cold + extra : null);
    const f = parseFloor(pick(kv, 'Etage'));
    const wbsText = pick(kv, 'WBS') || '';
    const wbs = /nicht/i.test(wbsText) ? false : /erforderlich/i.test(wbsText) ? true : null;
    return makeListing({
        source: 'inberlinwohnen',
        company,
        url: href,
        title,
        text: lines.join(' '),
        street: addr.street,
        plz: addr.plz,
        bezirk: addr.bezirk,
        rooms: parseNumber(pick(kv, 'Zimmeranzahl')),
        area: parseNumber(pick(kv, 'Wohnfläche')),
        rentCold: cold,
        rentWarm: warm,
        floor: f.floor,
        floors: f.floors,
        energyKwh: parseNumber(pick(kv, 'Energieverbrauchskennwert')),
        wbs,
        available: pick(kv, 'Bezugsfertig ab'),
        listedOn: pick(kv, 'Eingestellt am')
    });
}

async function fetchList(ctx)
{
    const pages = ctx.cfg.pages || 1;
    const listings = [];
    for (let page = 1; page <= pages; page++)
    {
        const url = page === 1 ? BASE : BASE + '?page=' + page;
        const res = await ctx.http.get(url, { cache: pages === 1 });
        if (res.notModified)
        {
            return { listings: [], unchanged: true };
        }
        const $ = load(res.text);
        const cards = cardsByLink($, isDetailLink);
        for (const card of cards)
        {
            const listing = parseCard(linesOf($, card.node), absoluteUrl(card.href, url));
            if (listing)
            {
                listings.push(listing);
            }
        }
        if (cards.length === 0)
        {
            break;
        }
    }
    return { listings };
}

module.exports = { name: 'inberlinwohnen', listUrl: BASE, fetchList, parseCard, fetchDetail: null };
