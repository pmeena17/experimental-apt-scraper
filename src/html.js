'use strict';

let cheerioLib = null;

// cheerio is loaded lazily so the pure parsing logic can be unit-tested without it
function load(html)
{
    if (!cheerioLib)
    {
        cheerioLib = require('cheerio');
    }
    return cheerioLib.load(html);
}

const BLOCK_SELECTOR = 'p,div,li,ul,ol,dl,dt,dd,tr,td,th,table,h1,h2,h3,h4,h5,h6,section,article,header,footer,figure,figcaption,button,label,option,select,address';

// Element -> list of trimmed text lines. Block elements and <br> start a new line.
function linesOf($, node)
{
    const clone = $(node).clone();
    clone.find('script,style,noscript,svg,template').remove();
    clone.find('br').replaceWith('\n');
    clone.find(BLOCK_SELECTOR).each((i, el) =>
    {
        $(el).prepend('\n');
        $(el).append('\n');
    });
    return clone.text().split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Finds the "card" of every listing: starting at the detail link, climb up while the parent still contains
// exactly one distinct detail link. Works without knowing any CSS class names.
function cardsByLink($, isDetailLink, options)
{
    const maxDepth = (options && options.maxDepth) || 8;
    const maxChars = (options && options.maxChars) || 3500;
    const test = (el) => isDetailLink($(el).attr('href') || '', $(el));
    const anchors = $('a[href]').toArray().filter(test);
    const seen = new Set();
    const cards = [];
    for (const a of anchors)
    {
        const href = $(a).attr('href');
        if (seen.has(href))
        {
            continue;
        }
        seen.add(href);
        let node = $(a);
        for (let depth = 0; depth < maxDepth; depth++)
        {
            const parent = node.parent();
            if (!parent.length || parent.is('body, html, main'))
            {
                break;
            }
            const hrefs = new Set(parent.find('a[href]').toArray().filter(test).map((x) => $(x).attr('href')));
            if (hrefs.size !== 1 || parent.text().length > maxChars)
            {
                break;
            }
            node = parent;
        }
        cards.push({ href, node });
    }
    return cards;
}

// href of the "next page" link, if the page has one
function findNext($)
{
    let href = null;
    $('a[href]').each((i, a) =>
    {
        const label = ($(a).text() + ' ' + ($(a).attr('aria-label') || '') + ' ' + ($(a).attr('title') || '') + ' ' + ($(a).attr('rel') || '')).toLowerCase();
        if (!href && /nächste|naechste|\bnext\b/.test(label))
        {
            href = $(a).attr('href');
        }
    });
    return href;
}

function mainLines($)
{
    const root = $('main').length ? $('main').first() : $('body');
    return linesOf($, root);
}

module.exports = { load, linesOf, cardsByLink, findNext, mainLines };
