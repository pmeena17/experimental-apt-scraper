'use strict';

const { load, linesOf, cardsByLink } = require('../html');
const { makeListing } = require('../listing');
const { parseNumber, detectWbs, absoluteUrl } = require('../util');
const { ortsteilInfo } = require('../location');
const { fetchDetailGeneric } = require('./common');

const BASE = 'https://www.gesobau.de/mieten/wohnungssuche/';

function pageUrl(n)
{
    return n === 1 ? BASE : BASE + '?tx_solr%5Bpage%5D=' + n;
}

function isDetailLink(href)
{
    return href.includes('/wohnungssuche/detailseite/');
}

// card: title / "Niederschönhausen" / "Dietzgenstraße 20," "13156 Berlin" / "1.725,59 €" "3 Zimmer" "79,41 m²" / tags
function parseCard(lines, href)
{
    const title = lines[0] || '';
    const rest = lines.slice(1);
    const joined = rest.join(' ');
    const plzIndex = rest.findIndex((l) => /\b\d{5}\s+Berlin/.test(l));
    const plz = plzIndex >= 0 ? rest[plzIndex].match(/\b(\d{5})\b/)[1] : null;
    const streetLine = plzIndex > 0 && !/\d{5}/.test(rest[plzIndex - 1] || '') ? rest[plzIndex - 1] : (plzIndex >= 0 ? rest[plzIndex].split(',')[0] : null);
    const street = streetLine ? streetLine.replace(/,\s*$/, '').trim() : null;
    const quartier = rest.find((l) => l.length < 40 && !/\d/.test(l) && ortsteilInfo(l));
    const ot = quartier ? ortsteilInfo(quartier) : null;
    const price = (joined.match(/([\d.]*\d,\d{2})\s*€/) || [])[1];
    const rooms = (joined.match(/(\d+(?:,\d)?)\s*Zimmer/) || [])[1];
    const area = (joined.match(/([\d.]*\d,\d{1,2})\s*m²/) || [])[1];
    return makeListing({
        source: 'gesobau',
        company: 'gesobau',
        url: href,
        title,
        text: lines.join(' '),
        street,
        plz,
        bezirk: ot ? ot.bezirk : null,
        ortsteil: quartier || null,
        rooms: parseNumber(rooms),
        area: parseNumber(area),
        rentWarm: parseNumber(price),
        wbs: detectWbs(title)
    });
}

async function fetchList(ctx)
{
    const maxPages = ctx.cfg.maxPages || 4;
    const listings = [];
    const seen = new Set();
    for (let page = 1; page <= maxPages; page++)
    {
        const url = pageUrl(page);
        const res = await ctx.http.get(url);
        const $ = load(res.text);
        let added = 0;
        for (const card of cardsByLink($, isDetailLink))
        {
            const abs = absoluteUrl(card.href, url);
            if (!seen.has(abs))
            {
                seen.add(abs);
                listings.push(parseCard(linesOf($, card.node), abs));
                added++;
            }
        }
        if (added === 0)
        {
            break;
        }
    }
    return { listings };
}

async function fetchDetail(ctx, listing)
{
    await fetchDetailGeneric(ctx, listing, {});
}

module.exports = { name: 'gesobau', listUrl: BASE, fetchList, fetchDetail, parseCard };
