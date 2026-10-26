'use strict';

const BEZIRKE = ['Charlottenburg-Wilmersdorf', 'Friedrichshain-Kreuzberg', 'Marzahn-Hellersdorf', 'Steglitz-Zehlendorf', 'Tempelhof-Schöneberg', 'Treptow-Köpenick', 'Reinickendorf', 'Lichtenberg', 'Neukölln', 'Spandau', 'Pankow', 'Mitte'];

function sleep(ms)
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// lower case, no umlauts/diacritics, so "Köpenick" == "Kopenick" == "koepenick"-ish comparisons work
function fold(value)
{
    return String(value === null || value === undefined ? '' : value).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// "1.168,16 €" -> 1168.16, "46.16" -> 46.16, "1.000" -> 1000, "unbekannt" -> null
function parseNumber(value)
{
    if (value === null || value === undefined)
    {
        return null;
    }
    const token = String(value).match(/\d[\d.,]*/);
    if (!token)
    {
        return null;
    }
    let s = token[0].replace(/[.,]+$/, '');
    if (s.includes(','))
    {
        s = s.replace(/\./g, '').replace(',', '.');
    }
    else if (/^\d{1,3}(\.\d{3})+$/.test(s))
    {
        s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

function matchTotalFloors(s)
{
    const m = s.match(/(?:von\s*\(?\s*insg\.?\s*|\/\s*)(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

// "6 von (insg. 6)" -> 6, "4 / 5" -> 4, "Erdgeschoss"/"EG" -> 0
function parseFloor(value)
{
    if (value === null || value === undefined)
    {
        return { floor: null, floors: null };
    }
    const s = String(value);
    if (/erdgeschoss|^\s*eg\b/i.test(s))
    {
        return { floor: 0, floors: matchTotalFloors(s) };
    }
    const m = s.match(/-?\d+/);
    return { floor: m ? parseInt(m[0], 10) : null, floors: matchTotalFloors(s) };
}

// German energy efficiency classes for residential buildings (kWh/m²a)
function energyClassFromKwh(kwh)
{
    if (kwh === null || kwh === undefined || !Number.isFinite(kwh) || kwh <= 0)
    {
        return null;
    }
    const steps = [[30, 'A+'], [50, 'A'], [75, 'B'], [100, 'C'], [130, 'D'], [160, 'E'], [200, 'F'], [250, 'G']];
    for (const [limit, name] of steps)
    {
        if (kwh < limit)
        {
            return name;
        }
    }
    return 'H';
}

function normalizeEnergyClass(value)
{
    const m = String(value || '').trim().match(/^([A-H])\s*(\+)?$/i);
    return m ? m[1].toUpperCase() + (m[2] || '') : null;
}

const COMPANY_HOSTS = [['degewo', 'degewo'], ['gewobag', 'gewobag'], ['gesobau', 'gesobau'], ['howoge', 'howoge'], ['stadtundland', 'stadtundland'], ['wbm.de', 'wbm'], ['berlinovo', 'berlinovo']];

function companyFromUrl(url)
{
    let host = '';
    try
    {
        host = new URL(url).hostname.toLowerCase();
    }
    catch (err)
    {
        host = String(url || '').toLowerCase();
    }
    for (const [needle, name] of COMPANY_HOSTS)
    {
        if (host.includes(needle))
        {
            return name;
        }
    }
    return null;
}

function normId(value)
{
    return String(value === null || value === undefined ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Object ids that are visible in the company URLs. They are the same on the company site and on inberlinwohnen.de,
// which is what lets us recognise the same flat on two sources.
function objectIdFromUrl(company, url)
{
    const u = String(url || '');
    let m = null;
    if (company === 'degewo')
    {
        m = u.match(/properties\/([A-Za-z0-9-]+)\.html/);
    }
    else if (company === 'gewobag')
    {
        m = u.match(/(\d{4}-\d{5}-\d{4}-\d{4})/);
    }
    else if (company === 'gesobau')
    {
        m = u.match(/(\d{2}-\d{5}-\d{5}-\d{4})/);
    }
    else if (company === 'stadtundland')
    {
        m = u.match(/wohnungssuche\/([\w%]+)/);
        if (m)
        {
            try
            {
                m[1] = decodeURIComponent(m[1]);
            }
            catch (err)
            {
                // keep as is
            }
        }
    }
    else if (company === 'howoge')
    {
        m = u.match(/detail\/(\d+-\d+-\d+)\.html/);
    }
    else if (company === 'wbm')
    {
        m = u.match(/immobilie%5D=([^&]+)/i) || u.match(/immobilie\]=([^&]+)/i);
        if (m)
        {
            try
            {
                m[1] = decodeURIComponent(m[1]);
            }
            catch (err)
            {
                // keep as is
            }
        }
    }
    return m ? m[1] : null;
}

// "Freudstr. 13" and "Freudstraße 13" must give the same key
function normStreetKey(street)
{
    return fold(street).replace(/strasse|str\./g, 'str').replace(/[^a-z0-9]/g, '');
}

function absoluteUrl(href, base)
{
    try
    {
        return new URL(href, base).toString();
    }
    catch (err)
    {
        return href;
    }
}

const WBS_NEGATIVE = /(?:ohne|kein(?:en|e)?)\s+WBS|WBS\s*(?:ist\s+)?(?:nicht\s+erforderlich|entf[aä]llt)|WBS\s*(?:erforderlich)?\s*:\s*(?:nein|nicht\s+erforderlich)/i;
const WBS_POSITIVE = /WBS\s*(?:erforderlich)?\s*:\s*(?:ja|erforderlich)|nur\s+mit\s+WBS|\bmit\s+WBS|\bf(?:ü|ue)r\s+WBS|WBS\s*(?:bis\s*)?\d{2,3}|WBS\s+erforderlich|Wohnberechtigungsschein\s+erforderlich/i;

// true = WBS needed, false = not needed, null = cannot tell
function detectWbs(text)
{
    const t = String(text || '');
    if (WBS_NEGATIVE.test(t))
    {
        return false;
    }
    if (WBS_POSITIVE.test(t))
    {
        return true;
    }
    return null;
}

// Handles "Welsestraße 1, 13057, Lichtenberg", "Freudstr. 13, 13589 Berlin/SpandauTitle...", "Dietzgenstraße 20, 13156 Berlin"
function parseAddress(text)
{
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    const plz = (s.match(/\b(\d{5})\b/) || [])[1] || null;
    const street = s.split(',')[0].trim() || null;
    let bezirk = null;
    let rest = '';
    const slash = s.match(/Berlin\s*\/\s*(.*)$/);
    if (slash)
    {
        const tail = slash[1];
        const hit = BEZIRKE.find((b) => fold(tail).startsWith(fold(b)));
        if (hit)
        {
            bezirk = hit;
            rest = tail.slice(hit.length).trim();
        }
    }
    else
    {
        const parts = s.split(',').map((p) => p.trim());
        const last = parts[parts.length - 1] || '';
        bezirk = BEZIRKE.find((b) => fold(last) === fold(b)) || null;
    }
    return { street, plz, bezirk, rest };
}

function fmtEuro(n)
{
    return n === null || n === undefined ? '? €' : Math.round(n).toLocaleString('de-DE') + ' €';
}

function fmtNum(n)
{
    return n === null || n === undefined ? '?' : String(Math.round(n * 100) / 100).replace('.', ',');
}

function pad2(n)
{
    return String(n).padStart(2, '0');
}

function clock(date)
{
    const d = date || new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

// minutes since midnight in the given time zone
function minutesNow(timezone, date)
{
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date || new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour').value, 10) % 24;
    const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
    return h * 60 + m;
}

function toMinutes(hhmm)
{
    const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
    return h * 60 + (m || 0);
}

function isActive(schedule, date)
{
    if (!schedule)
    {
        return true;
    }
    const now = minutesNow(schedule.timezone || 'Europe/Berlin', date);
    const start = toMinutes(schedule.start || '00:00');
    const end = toMinutes(schedule.end || '23:59');
    return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

function jittered(ms, fraction)
{
    const f = fraction || 0;
    return Math.round(ms * (1 + (Math.random() * 2 - 1) * f));
}

module.exports = { BEZIRKE, sleep, fold, parseNumber, parseFloor, energyClassFromKwh, normalizeEnergyClass, companyFromUrl, normId, objectIdFromUrl, normStreetKey, absoluteUrl, detectWbs, parseAddress, fmtEuro, fmtNum, pad2, clock, minutesNow, toMinutes, isActive, jittered };
