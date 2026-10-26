'use strict';

const { load, linesOf, cardsByLink, findNext } = require('../html');
const { makeListing } = require('../listing');
const { parseNumber, detectWbs, absoluteUrl } = require('../util');
const { ortsteilInfo } = require('../location');
const { fetchDetailGeneric } = require('./common');

const BASE = 'https://www.degewo.de/immosuche';

function isDetailLink(href)
{
    return href.includes('/immosuche/details/') && !/\/pdf(\?|$)/.test(href);
}

// card text looks like: title / "Street 1 | Quartier" / tags / "400,18 €" "Warmmiete" "1" "Zimmer" "36,38" "m²" "01.11.2026" "frei ab"
function parseCard(lines, href)
{
    const title = lines[0] || '';
    const addrLine = lines.find((l) => l.includes(' | ')) || '';
    const [street, quartier] = addrLine.split('|').map((p) => p.trim());
    const rest = lines.slice(1).filter((l) => l !== addrLine).join(' ');
    const warm = (rest.match(/([\d.]*\d,\d{2})\s*€\s*Warmmiete/) || [])[1];
    const rooms = (rest.match(/(\d+(?:,\d)?)\s*Zimmer/) || [])[1];
    const area = (rest.match(/([\d.]*\d,\d{1,2})\s*m²/) || [])[1];
    const free = (rest.match(/(\d{2}\.\d{2}\.\d{4}|sofort)\s*frei ab/i) || [])[1];
    const tagWbs = /\bMit WBS\b/i.test(rest) ? true : null;
    const wbs = tagWbs !== null ? tagWbs : detectWbs(title);
    const ot = quartier ? ortsteilInfo(quartier) : null;
    return makeListing({
        source: 'degewo',
        company: 'degewo',
        url: href,
        title,
        text: lines.join(' '),
        street: street || null,
        ortsteil: quartier || null,
        bezirk: ot ? ot.bezirk : null,
        rooms: parseNumber(rooms),
        area: parseNumber(area),
        rentWarm: parseNumber(warm),
        wbs,
        available: free || null
    });
}

async function fetchList(ctx)
{
    const maxPages = ctx.cfg.maxPages || 15;
    const listings = [];
    const visited = new Set();
    let url = BASE;
    while (url && visited.size < maxPages && !visited.has(url))
    {
        visited.add(url);
        const res = await ctx.http.get(url);
        const $ = load(res.text);
        for (const card of cardsByLink($, isDetailLink))
        {
            listings.push(parseCard(linesOf($, card.node), absoluteUrl(card.href, url)));
        }
        const next = findNext($);
        url = next ? absoluteUrl(next, url) : null;
    }
    return { listings };
}

async function fetchDetail(ctx, listing)
{
    await fetchDetailGeneric(ctx, listing, {});
}

module.exports = { name: 'degewo', listUrl: BASE, fetchList, fetchDetail, parseCard };
