'use strict';

const { fold } = require('./util');
const { bezirkFromText, ortsteilInfo, matchName } = require('./location');

function outside(value, min, max)
{
    if (value === null || value === undefined)
    {
        return false;
    }
    return (min !== null && min !== undefined && value < min) || (max !== null && max !== undefined && value > max);
}

function keywordHit(text, keyword)
{
    if (keyword instanceof RegExp)
    {
        return keyword.test(text);
    }
    return fold(text).includes(fold(keyword));
}

// { ok: true } | { ok: false, reason } | { unknown: true }
function checkLocation(listing, locations)
{
    const rules = locations.bezirke || {};
    const bezirk = bezirkFromText(listing.bezirk || '') || (listing.ortsteil ? (ortsteilInfo(listing.ortsteil) || {}).bezirk : null);
    if (!bezirk)
    {
        return { unknown: true };
    }
    const rule = rules[bezirk] !== undefined ? rules[bezirk] : (locations.default || 'allow');
    if (rule === 'allow')
    {
        return { ok: true };
    }
    if (rule === 'exclude')
    {
        return { ok: false, reason: 'Bezirk ' + bezirk + ' is excluded' };
    }
    const ot = listing.ortsteil;
    const plz = listing.plz;
    const allowOt = rule.allowOrtsteile || [];
    const allowPlz = rule.allowPostcodes || [];
    const exOt = rule.excludeOrtsteile || [];
    const exPlz = rule.excludePostcodes || [];
    if ((ot && exOt.some((n) => matchName(ot, n))) || (plz && exPlz.includes(plz)))
    {
        return { ok: false, reason: 'excluded part of ' + bezirk + ' (' + (ot || plz) + ')' };
    }
    if (allowOt.length > 0 || allowPlz.length > 0)
    {
        if ((ot && allowOt.some((n) => matchName(ot, n))) || (plz && allowPlz.includes(plz)))
        {
            return { ok: true };
        }
        const decidable = (ot && allowOt.length > 0) || (plz && allowPlz.length > 0);
        return decidable ? { ok: false, reason: 'not in the allowed parts of ' + bezirk + ' (' + (ot || plz) + ')' } : { unknown: true };
    }
    return { ok: true };
}

// final = false: first look at what the list page gave us. Fields still missing -> status "needs-detail".
// final = true : no more data is coming, apply the "unknown" policies.
function evaluate(listing, cfg, final)
{
    const f = cfg.filters || {};
    const loc = cfg.locations || {};
    const reasons = [];
    const missing = [];
    const flags = listing.flags.slice();

    if (cfg.companies && listing.company && !cfg.companies.includes(listing.company))
    {
        return { status: 'reject', reasons: ['company ' + listing.company + ' not selected'], flags };
    }
    if (listing.closed)
    {
        return { status: 'reject', reasons: ['listing already closed'], flags };
    }

    if (f.wbs === 'exclude' && listing.wbs === true)
    {
        reasons.push('needs a WBS');
    }
    if (f.wbs === 'only' && listing.wbs === false)
    {
        reasons.push('no WBS (you asked for WBS-only)');
    }
    if (listing.wbs === null && f.wbs && f.wbs !== 'any')
    {
        missing.push('wbs');
    }

    const text = (listing.title || '') + ' ' + (listing.text || '');
    for (const keyword of f.excludeKeywords || [])
    {
        if (keywordHit(text, keyword))
        {
            reasons.push('keyword ' + String(keyword));
            break;
        }
    }
    if (f.incomeRestricted === 'exclude' && flags.includes('income limits'))
    {
        reasons.push('income limits apply');
    }

    if (f.maxRentWarm !== null && f.maxRentWarm !== undefined && listing.rentWarm !== null && listing.rentWarm > f.maxRentWarm)
    {
        reasons.push('warm rent ' + listing.rentWarm + ' > ' + f.maxRentWarm);
    }
    if (f.maxRentCold !== null && f.maxRentCold !== undefined && listing.rentCold !== null && listing.rentCold > f.maxRentCold)
    {
        reasons.push('cold rent ' + listing.rentCold + ' > ' + f.maxRentCold);
    }
    if (outside(listing.rooms, f.minRooms, f.maxRooms))
    {
        reasons.push('rooms ' + listing.rooms + ' outside ' + f.minRooms + '..' + f.maxRooms);
    }
    if (outside(listing.area, f.minArea, f.maxArea))
    {
        reasons.push('area ' + listing.area + ' outside ' + f.minArea + '..' + f.maxArea);
    }
    if (outside(listing.floor, f.minFloor, f.maxFloor))
    {
        reasons.push('floor ' + listing.floor + ' outside ' + f.minFloor + '..' + f.maxFloor);
    }
    if (f.energyClasses && listing.energyClass && !f.energyClasses.includes(listing.energyClass))
    {
        reasons.push('energy class ' + listing.energyClass + ' not allowed');
    }

    const needs = (value, a, b) => value === null && ((a !== null && a !== undefined) || (b !== null && b !== undefined));
    if (needs(listing.rooms, f.minRooms, f.maxRooms))
    {
        missing.push('rooms');
    }
    if (needs(listing.area, f.minArea, f.maxArea))
    {
        missing.push('area');
    }
    if (needs(listing.floor, f.minFloor, f.maxFloor))
    {
        missing.push('floor');
    }
    if (f.energyClasses && !listing.energyClass)
    {
        missing.push('energy');
    }

    const place = checkLocation(listing, loc);
    if (place.ok === false)
    {
        reasons.push(place.reason);
    }
    const hasLocationRules = Object.keys(loc.bezirke || {}).length > 0;
    if (place.unknown && hasLocationRules)
    {
        missing.push('location');
    }

    if (reasons.length > 0)
    {
        return { status: 'reject', reasons, flags };
    }
    if (missing.length > 0 && !final)
    {
        return { status: 'needs-detail', missing, reasons: [], flags };
    }

    for (const field of missing)
    {
        if (field === 'wbs')
        {
            if (f.unknownWbs === 'exclude')
            {
                return { status: 'reject', reasons: ['WBS unclear and unknownWbs=exclude'], flags };
            }
            flags.push('WBS unclear');
        }
        else if (field === 'location')
        {
            if (loc.unknown === 'exclude')
            {
                return { status: 'reject', reasons: ['location unknown and unknown=exclude'], flags };
            }
            flags.push('location unclear');
        }
        else
        {
            flags.push(field + ' unknown');
        }
    }
    return { status: 'accept', reasons: [], flags };
}

module.exports = { evaluate, checkLocation };
