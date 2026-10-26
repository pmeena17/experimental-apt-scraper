'use strict';

const { BEZIRKE, fold } = require('./util');

// Official Ortsteile (plus a few well-known Kieze the companies use as "Quartier") -> Bezirk
const OT = {
    'Mitte': ['Mitte', 'Moabit', 'Hansaviertel', 'Tiergarten', 'Wedding', 'Gesundbrunnen'],
    'Friedrichshain-Kreuzberg': ['Friedrichshain', 'Kreuzberg'],
    'Pankow': ['Prenzlauer Berg', 'Weißensee', 'Blankenburg', 'Heinersdorf', 'Karow', 'Stadtrandsiedlung Malchow', 'Pankow', 'Blankenfelde', 'Buch', 'Französisch Buchholz', 'Niederschönhausen', 'Rosenthal', 'Wilhelmsruh'],
    'Charlottenburg-Wilmersdorf': ['Charlottenburg', 'Charlottenburg-Nord', 'Wilmersdorf', 'Schmargendorf', 'Grunewald', 'Westend', 'Halensee'],
    'Spandau': ['Spandau', 'Haselhorst', 'Siemensstadt', 'Staaken', 'Gatow', 'Kladow', 'Hakenfelde', 'Falkenhagener Feld', 'Wilhelmstadt'],
    'Steglitz-Zehlendorf': ['Steglitz', 'Lichterfelde', 'Lankwitz', 'Zehlendorf', 'Dahlem', 'Nikolassee', 'Schlachtensee', 'Wannsee'],
    'Tempelhof-Schöneberg': ['Schöneberg', 'Friedenau', 'Tempelhof', 'Mariendorf', 'Marienfelde', 'Lichtenrade'],
    'Neukölln': ['Neukölln', 'Britz', 'Buckow', 'Rudow', 'Gropiusstadt'],
    'Treptow-Köpenick': ['Alt-Treptow', 'Treptow', 'Plänterwald', 'Baumschulenweg', 'Johannisthal', 'Niederschöneweide', 'Altglienicke', 'Adlershof', 'Bohnsdorf', 'Oberschöneweide', 'Köpenick', 'Friedrichshagen', 'Rahnsdorf', 'Grünau', 'Müggelheim', 'Schmöckwitz'],
    'Marzahn-Hellersdorf': ['Marzahn', 'Biesdorf', 'Kaulsdorf', 'Mahlsdorf', 'Hellersdorf'],
    'Lichtenberg': ['Friedrichsfelde', 'Karlshorst', 'Lichtenberg', 'Falkenberg', 'Malchow', 'Wartenberg', 'Neu-Hohenschönhausen', 'Alt-Hohenschönhausen', 'Hohenschönhausen', 'Fennpfuhl', 'Rummelsburg'],
    'Reinickendorf': ['Reinickendorf', 'Tegel', 'Konradshöhe', 'Heiligensee', 'Frohnau', 'Hermsdorf', 'Waidmannslust', 'Lübars', 'Wittenau', 'Märkisches Viertel', 'Borsigwalde']
};

// folded name -> { name, bezirk }, longest names first so "Neu-Hohenschönhausen" wins over "Hohenschönhausen"
const ENTRIES = [];
for (const bezirk of Object.keys(OT))
{
    for (const name of OT[bezirk])
    {
        ENTRIES.push({ key: fold(name), name, bezirk });
    }
}
ENTRIES.sort((a, b) => b.key.length - a.key.length);

function wordRegex(key)
{
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z])' + esc + '([^a-z]|$)');
}

const ENTRY_REGEX = ENTRIES.map((e) => ({ ...e, re: wordRegex(e.key) }));
const BEZIRK_REGEX = BEZIRKE.map((b) => ({ name: b, re: wordRegex(fold(b)) }));

// "Siemensstadt" -> { name: 'Siemensstadt', bezirk: 'Spandau' }; "Köpenick Nord" -> Köpenick / Treptow-Köpenick
function ortsteilInfo(text)
{
    const f = fold(text);
    if (!f)
    {
        return null;
    }
    const hit = ENTRY_REGEX.find((e) => e.re.test(f));
    return hit ? { name: hit.name, bezirk: hit.bezirk } : null;
}

// canonical Bezirk name from free text ("Treptow-Köpenick", "Berlin/Spandau", "Köpenick Nord")
function bezirkFromText(text)
{
    const f = fold(text);
    if (!f)
    {
        return null;
    }
    const direct = BEZIRK_REGEX.find((b) => b.re.test(f));
    if (direct)
    {
        return direct.name;
    }
    const ot = ortsteilInfo(text);
    return ot ? ot.bezirk : null;
}

function matchName(haystack, needle)
{
    const h = fold(haystack);
    const n = fold(needle);
    return n.length > 0 && h.includes(n);
}

module.exports = { OT, ortsteilInfo, bezirkFromText, matchName };
