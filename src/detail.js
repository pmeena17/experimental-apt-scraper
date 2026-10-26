'use strict';

const { pick } = require('./kv');
const { parseNumber, parseFloor, energyClassFromKwh, normalizeEnergyClass, parseAddress, detectWbs, normId } = require('./util');
const { bezirkFromText } = require('./location');

// Fills the gaps of a listing from the label/value pairs of its detail page. Never overwrites list data.
function applyDetail(listing, kv, lines)
{
    const set = (field, value) =>
    {
        if ((listing[field] === null || listing[field] === undefined) && value !== null && value !== undefined && value !== '')
        {
            listing[field] = value;
        }
    };

    const combo = pick(kv, 'Bezirk/Ortsteil');
    const comboParts = combo ? combo.split('/').map((p) => p.trim()) : [];
    set('bezirk', bezirkFromText(pick(kv, 'Bezirk / Stadtbezirk', 'Bezirk') || comboParts[0] || ''));
    set('ortsteil', pick(kv, 'Ortsteil / Quartier') || comboParts[1] || null);

    const addressText = pick(kv, 'Anschrift', 'Adresse') || (pick(kv, 'Straße') ? pick(kv, 'Straße') + ', ' + (pick(kv, 'Ort') || '') : null);
    if (addressText)
    {
        const a = parseAddress(addressText);
        set('street', a.street);
        set('plz', a.plz);
        set('bezirk', a.bezirk);
    }

    set('rooms', parseNumber(pick(kv, 'Anzahl Zimmer', 'Anzahl der Zimmer', 'Zimmeranzahl')));
    set('area', parseNumber(pick(kv, 'Wohnfläche', 'Fläche in m²', 'Größe', 'Fläche')));
    set('rentCold', parseNumber(pick(kv, 'Kaltmiete', 'Nettokaltmiete', 'Grundmiete')));
    set('rentWarm', parseNumber(pick(kv, 'Gesamtmiete', 'Warmmiete')));

    const f = parseFloor(pick(kv, 'Etage'));
    set('floor', f.floor);
    set('floors', f.floors);

    const cls = normalizeEnergyClass(pick(kv, 'Energieeffizienzklasse'));
    set('energyClass', cls);
    const kwh = parseNumber(pick(kv, 'Endenergiebedarf', 'Errechneter Primärenergiebedarf', 'Energieverbrauchskennwert'));
    set('energyKwh', kwh);
    if (listing.energyClass === null || listing.energyClass === undefined)
    {
        listing.energyClass = energyClassFromKwh(listing.energyKwh);
    }

    const wbsText = pick(kv, 'WBS erforderlich', 'WBS');
    if (wbsText && (listing.wbs === null || listing.wbs === undefined))
    {
        listing.wbs = /^(nein|nicht|entf)/i.test(wbsText) ? false : /^(ja|erforderlich|WBS)/i.test(wbsText) ? true : detectWbs('WBS: ' + wbsText);
    }

    const objectNumber = pick(kv, 'Objektnummer', 'Objekt-Nr.');
    if (objectNumber)
    {
        listing.objectNumber = objectNumber;
        if (!listing.id)
        {
            listing.id = normId(objectNumber);
        }
    }

    const description = pick(kv, 'Beschreibung');
    if (description)
    {
        listing.text = (listing.text || '') + ' ' + description;
    }

    const whole = lines.join(' ');
    if (/Einkommensgrenzen|Einkommen von mehr als|Einkommensgrenze/i.test(whole) && !listing.flags.includes('income limits'))
    {
        listing.flags.push('income limits');
    }
    if (/Inserat deaktiviert|nicht mehr zur Verf/i.test(whole))
    {
        listing.closed = true;
    }
}

module.exports = { applyDetail };
