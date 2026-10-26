'use strict';

const { fold } = require('./util');

const LABELS = ['Zimmeranzahl', 'Anzahl der Zimmer', 'Anzahl Zimmer', 'Wohnfläche / Nutzfläche', 'Wohnfläche', 'Fläche in m²', 'Fläche', 'Größe', 'Kaltmiete', 'Nettokaltmiete', 'Grundmiete', 'Nebenkosten', 'Heizkosten', 'Gesamtmiete', 'Warmmiete', 'Bezugsfertig ab', 'Bezugsfrei ab', 'Verfügbar ab', 'Frei ab', 'Eingestellt am', 'WBS erforderlich', 'WBS', 'Etage', 'Badezimmer', 'Baujahr', 'Heizungsart', 'Heizung', 'Hauptenergieträger', 'Wesentl. Energietr.', 'Wesentliche Energieträger', 'Energieverbrauchskennwert', 'Endenergiebedarf', 'Errechneter Primärenergiebedarf', 'Energieeffizienzklasse', 'Art des Energieausweises', 'Energieausweis', 'Bezirk / Stadtbezirk', 'Ortsteil / Quartier', 'Bezirk/Ortsteil', 'Bezirk', 'Anschrift', 'Adresse', 'Straße', 'Ort', 'Objektnummer', 'Objekt-Nr.', 'Objektart', 'Objekttyp', 'Beschreibung', 'Zustand', 'Kaution', 'Stand vom', 'Besondere Merkmale'];

// labels that may stand alone on a line, value on the next line (table layouts without colon)
const BARE_LABELS = new Set(['bezirk', 'adresse', 'flache', 'frei ab', 'gesamtmiete', 'besondere eigenschaften']);

function escapeRegex(s)
{
    return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

const SORTED = LABELS.slice().sort((a, b) => b.length - a.length);
const LABEL_RE = new RegExp('(?<![\\wÄÖÜäöüß])(' + SORTED.map(escapeRegex).join('|') + ')\\s*:', 'gi');

function startsWithLabel(line)
{
    const re = new RegExp(LABEL_RE.source, 'i');
    const m = re.exec(line);
    return !!m && m.index === 0;
}

// Returns { <folded label>: value }. Handles "Label: value", several pairs on one line,
// "Label:" followed by the value on the next line, and bare label lines for a few table layouts.
function extractKv(lines)
{
    const kv = {};
    const put = (label, value) =>
    {
        const key = fold(label);
        const v = String(value || '').trim();
        if (v && kv[key] === undefined)
        {
            kv[key] = v;
        }
    };
    for (let i = 0; i < lines.length; i++)
    {
        const line = lines[i];
        const matches = [...line.matchAll(LABEL_RE)];
        if (matches.length > 0)
        {
            for (let m = 0; m < matches.length; m++)
            {
                const start = matches[m].index + matches[m][0].length;
                const end = m + 1 < matches.length ? matches[m + 1].index : line.length;
                let value = line.slice(start, end).trim();
                if (!value && m === matches.length - 1 && i + 1 < lines.length && !startsWithLabel(lines[i + 1]))
                {
                    value = lines[i + 1];
                }
                put(matches[m][1], value);
            }
        }
        else if (BARE_LABELS.has(fold(line)) && i + 1 < lines.length)
        {
            put(line, lines[i + 1]);
        }
    }
    return kv;
}

// first present value among several label names
function pick(kv, ...names)
{
    for (const name of names)
    {
        const v = kv[fold(name)];
        if (v !== undefined && v !== '')
        {
            return v;
        }
    }
    return null;
}

module.exports = { extractKv, pick };
