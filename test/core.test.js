'use strict';

const test = require('node:test');
const assert = require('node:assert');

const util = require('../src/util');
const { extractKv, pick } = require('../src/kv');
const { ortsteilInfo, bezirkFromText } = require('../src/location');
const { makeListing, keysOf } = require('../src/listing');
const { evaluate } = require('../src/filter');
const { Store } = require('../src/store');
const { applyDetail } = require('../src/detail');
const ibw = require('../src/sources/inberlinwohnen');
const degewo = require('../src/sources/degewo');
const gewobag = require('../src/sources/gewobag');
const wbm = require('../src/sources/wbm');
const gesobau = require('../src/sources/gesobau');

const baseCfg = () => ({ companies: ['degewo', 'gewobag', 'gesobau', 'howoge', 'stadtundland', 'wbm'], filters: { wbs: 'exclude', unknownWbs: 'notify', incomeRestricted: 'flag', excludeKeywords: ['senior', 'studierende', /\b(55|60|65)\s*\+/], maxRentWarm: null, minRooms: null, maxRooms: null, minArea: null, maxArea: null, minFloor: null, maxFloor: null, energyClasses: null }, locations: { default: 'allow', unknown: 'notify', bezirke: {} } });

test('number parsing', () =>
{
    assert.strictEqual(util.parseNumber('1.168,16 €'), 1168.16);
    assert.strictEqual(util.parseNumber('46.16'), 46.16);
    assert.strictEqual(util.parseNumber('1.000'), 1000);
    assert.strictEqual(util.parseNumber('ab 795,37€'), 795.37);
    assert.strictEqual(util.parseNumber('unbekannt kWh/(a m²)'), null);
    assert.strictEqual(util.parseNumber('59,10 kWh/(a m²)'), 59.1);
});

test('floor parsing', () =>
{
    assert.deepStrictEqual(util.parseFloor('6 von (insg. 6)'), { floor: 6, floors: 6 });
    assert.deepStrictEqual(util.parseFloor('4 / 5'), { floor: 4, floors: 5 });
    assert.deepStrictEqual(util.parseFloor('Erdgeschoss'), { floor: 0, floors: null });
    assert.deepStrictEqual(util.parseFloor('EG'), { floor: 0, floors: null });
    assert.deepStrictEqual(util.parseFloor('0 von (insg. 5)'), { floor: 0, floors: 5 });
});

test('energy class matches the classes degewo prints next to the kWh values', () =>
{
    assert.strictEqual(util.energyClassFromKwh(25.2), 'A+');
    assert.strictEqual(util.energyClassFromKwh(83), 'C');
    assert.strictEqual(util.energyClassFromKwh(87), 'C');
    assert.strictEqual(util.energyClassFromKwh(114), 'D');
    assert.strictEqual(util.energyClassFromKwh(119), 'D');
    assert.strictEqual(util.energyClassFromKwh(null), null);
});

test('WBS detection', () =>
{
    assert.strictEqual(util.detectWbs('Großer Balkon - ohne WBS'), false);
    assert.strictEqual(util.detectWbs('WBS erforderlich: Nein'), false);
    assert.strictEqual(util.detectWbs('Objektnummer 1 WBS: Nicht erforderlich'), false);
    assert.strictEqual(util.detectWbs('Neubau Erstbezug. Nur mit WBS 160 bis 220'), true);
    assert.strictEqual(util.detectWbs('2-Zimmer-Wohnung mit WBS 100 oder WBS 140'), true);
    assert.strictEqual(util.detectWbs('Wohnung für Rentner ab 55 Jahren mit WBS'), true);
    assert.strictEqual(util.detectWbs('Bekomme ich einen WBS? Geförderte Wohnung auch für mittlere Einkommen'), null);
    assert.strictEqual(util.detectWbs('Schöne 3 Zimmer'), null);
});

test('address parsing', () =>
{
    assert.deepStrictEqual(util.parseAddress('Welsestraße 1, 13057, Lichtenberg'), { street: 'Welsestraße 1', plz: '13057', bezirk: 'Lichtenberg', rest: '' });
    const g = util.parseAddress('Freudstr. 13, 13589 Berlin/SpandauWohnung für Rentner ab 55 Jahren mit WBS');
    assert.strictEqual(g.street, 'Freudstr. 13');
    assert.strictEqual(g.plz, '13589');
    assert.strictEqual(g.bezirk, 'Spandau');
    assert.strictEqual(g.rest, 'Wohnung für Rentner ab 55 Jahren mit WBS');
    const m = util.parseAddress('Alt-Treptow Moderlieschenstr. 32, 13599 Berlin/SpandauNeubau');
    assert.strictEqual(m.plz, '13599');
});

test('street keys and ids line up across sources', () =>
{
    assert.strictEqual(util.normStreetKey('Freudstr. 13'), util.normStreetKey('Freudstraße 13'));
    assert.strictEqual(util.normStreetKey('Köpenicker Strasse 105A'), util.normStreetKey('Köpenicker Straße 105A'));
    const fromIbw = util.normId(util.objectIdFromUrl('degewo', 'https://www.degewo.de/de/properties/W1300-02408-0012-0403.html'));
    const fromDetail = util.normId('W1300.02408.0012-0403');
    assert.strictEqual(fromIbw, fromDetail);
    assert.strictEqual(util.objectIdFromUrl('gewobag', 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-02559-0604-0181'), '0100-02559-0604-0181');
    assert.strictEqual(util.objectIdFromUrl('gesobau', 'https://www.gesobau.de/?immo_ref=10-01266-00001-1005-5331b6ca-b301-4a73-a498-a05314ad5bd2'), '10-01266-00001-1005');
    assert.strictEqual(util.objectIdFromUrl('gesobau', 'https://www.gesobau.de/mieten/wohnungssuche/detailseite/dietzgenstrasse-10-01266-00001-1005-5e7c5778-7181-4091-be5a-bf054860b6cc/'), '10-01266-00001-1005');
    assert.strictEqual(util.objectIdFromUrl('stadtundland', 'https://stadtundland.de/wohnungssuche/1001%2F0471%2F00173'), '1001/0471/00173');
    assert.strictEqual(util.objectIdFromUrl('howoge', 'https://www.howoge.de/wohnungen-gewerbe/wohnungssuche/detail/1771-13579-46.html?t=ibw'), '1771-13579-46');
    assert.strictEqual(util.companyFromUrl('https://stadtundland.de/wohnungssuche/1'), 'stadtundland');
    assert.strictEqual(util.companyFromUrl('https://www.wbm.de/wohnungen-berlin/angebote/'), 'wbm');
});

test('location lookup', () =>
{
    assert.strictEqual(ortsteilInfo('Köpenick Nord').bezirk, 'Treptow-Köpenick');
    assert.strictEqual(ortsteilInfo('Märkisches Viertel').bezirk, 'Reinickendorf');
    assert.strictEqual(ortsteilInfo('Neu-Hohenschönhausen').name, 'Neu-Hohenschönhausen');
    assert.strictEqual(ortsteilInfo('Joachim-Ringelnatz-Siedlung'), null);
    assert.strictEqual(bezirkFromText('Berlin/Spandau'), 'Spandau');
    assert.strictEqual(bezirkFromText('Charlottenburg-Nord'), 'Charlottenburg-Wilmersdorf');
});

const IBW_CARD = ['1,0 Zimmer, 29,00 m², 464,00 € | Welsestraße 1, 13057 Lichtenberg', 'Wohnen ohne WBS am grünen Stadtrand von Berlin', 'Alle Details', 'Adresse:', 'Welsestraße 1, 13057, Lichtenberg', 'Zimmeranzahl:', '1,0', 'Wohnfläche:', '29,00 m²', 'Kaltmiete:', '464,00 €', 'Nebenkosten:', '61,01 €', 'Gesamtmiete:', '575,37 €', 'Bezugsfertig ab:', '01.12.2026', 'Eingestellt am:', '21.10.2026', 'WBS:', 'nicht erforderlich', 'Etage:', '6 von (insg. 6)', 'Badezimmer:', '1', 'Baujahr:', '2023', 'Heizung:', 'Fußbodenheizung Zentralheizung', 'Hauptenergieträger:', 'Fernwärme', 'Energieverbrauchskennwert:', 'unbekannt kWh/(a m²)', 'Energieausweis:', 'Bedarfsausweis', 'Balkon / Loggia / Terrasse Dusche Aufzug Barrierefrei Keller', 'Eine Wohnung der'];

test('inberlinwohnen card (text copied from the live page)', () =>
{
    const l = ibw.parseCard(IBW_CARD, 'https://www.howoge.de/wohnungen-gewerbe/wohnungssuche/detail/1771-13579-46.html?t=ibw');
    assert.strictEqual(l.company, 'howoge');
    assert.strictEqual(l.title, 'Wohnen ohne WBS am grünen Stadtrand von Berlin');
    assert.strictEqual(l.street, 'Welsestraße 1');
    assert.strictEqual(l.plz, '13057');
    assert.strictEqual(l.bezirk, 'Lichtenberg');
    assert.strictEqual(l.rooms, 1);
    assert.strictEqual(l.area, 29);
    assert.strictEqual(l.rentCold, 464);
    assert.strictEqual(l.rentWarm, 575.37);
    assert.strictEqual(l.wbs, false);
    assert.strictEqual(l.floor, 6);
    assert.strictEqual(l.floors, 6);
    assert.strictEqual(l.energyKwh, null);
    assert.strictEqual(l.id, '177113579' + '46');
    assert.strictEqual(l.available, '01.12.2026');
});

test('inberlinwohnen senior flat is recognised as WBS + senior', () =>
{
    const lines = ['1,0 Zimmer, 35,42 m², 345,20 € | Spießweg 38, 13437 Reinickendorf', 'Seniorenwohnung 60+ mit Notwendigkeit eines Wohnberechtigungsscheins', 'Alle Details', 'Adresse:', 'Spießweg 38, 13437, Reinickendorf', 'Zimmeranzahl:', '1,0', 'Wohnfläche:', '35,42 m²', 'Kaltmiete:', '345,20 €', 'Gesamtmiete:', '523,20 €', 'WBS:', 'erforderlich', 'Etage:', '1 von (insg. 7)'];
    const l = ibw.parseCard(lines, 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01230-0102-0035');
    assert.strictEqual(l.wbs, true);
    assert.strictEqual(l.id, '0100012300102' + '0035');
    assert.strictEqual(evaluate(l, baseCfg(), false).status, 'reject');
});

const DEGEWO_CARD = ['1 Zimmer sucht Nachmieter', 'Friedrich-Kayßler-Weg 3 | Gropiusstadt', 'Aufzug', 'Badewanne', '520,40 €', 'Warmmiete', '1', 'Zimmer', '37,14', 'm²', '01.01.2027', 'frei ab'];

test('degewo card (text copied from the live page)', () =>
{
    const l = degewo.parseCard(DEGEWO_CARD, 'https://www.degewo.de/immosuche/details/1-zimmer-sucht-nachmieter-3');
    assert.strictEqual(l.street, 'Friedrich-Kayßler-Weg 3');
    assert.strictEqual(l.ortsteil, 'Gropiusstadt');
    assert.strictEqual(l.bezirk, 'Neukölln');
    assert.strictEqual(l.rentWarm, 520.4);
    assert.strictEqual(l.rooms, 1);
    assert.strictEqual(l.area, 37.14);
    assert.strictEqual(l.available, '01.01.2027');
    assert.strictEqual(l.wbs, null);
    const tagged = degewo.parseCard(['Am Bahndamm 31 – Modern wohnen für Studierende und Auszubildende mit WBS', 'Am Bahndamm 31 | Köpenick Nord', 'Mit WBS', 'Barrierefrei', '400,18 €', 'Warmmiete', '1', 'Zimmer', '36,38', 'm²', '01.11.2026', 'frei ab'], 'https://www.degewo.de/immosuche/details/x');
    assert.strictEqual(tagged.wbs, true);
    assert.strictEqual(tagged.bezirk, 'Treptow-Köpenick');
    assert.strictEqual(degewo.parseCard(['Großer Balkon - Nähe Gärten der Welt - ohne WBS', 'Cecilienstraße 193 | Joachim-Ringelnatz-Siedlung', 'Aufzug', '890,50 €', 'Warmmiete', '1', 'Zimmer', '44,26', 'm²', 'sofort', 'frei ab'], 'https://www.degewo.de/immosuche/details/y').wbs, false);
});

test('degewo detail page text (Allgemeine Daten block)', () =>
{
    const lines = ['Objektnummer: W1100.22012.0016-0112 WBS: Nicht erforderlich', 'Straße: Scheelestraße 110 Baujahr: 1984', 'Ort: 12209 Berlin Verfügbar ab: ab sofort', 'Bezirk / Stadtbezirk: Steglitz-Zehlendorf Wohnfläche: 50,92 m²', 'Ortsteil / Quartier: Steglitz Etage: 1 / 6', 'Anzahl Zimmer: 2,0', 'Kaltmiete: 541,08 € Nebenkosten: 127,30 €', 'Heizkosten: 72,30 € Gesamtmiete 740,68 €', 'Energieeffizienzklasse: C Wesentliche Energieträger: Fernwärme', 'Endenergiebedarf: 83.00 kWh/m²/a'];
    const kv = extractKv(lines);
    assert.strictEqual(pick(kv, 'WBS'), 'Nicht erforderlich');
    assert.strictEqual(pick(kv, 'Etage'), '1 / 6');
    assert.strictEqual(pick(kv, 'Bezirk / Stadtbezirk'), 'Steglitz-Zehlendorf');
    const l = degewo.parseCard(DEGEWO_CARD, 'https://www.degewo.de/immosuche/details/z');
    l.ortsteil = null;
    l.bezirk = null;
    l.area = null;
    applyDetail(l, kv, lines);
    assert.strictEqual(l.bezirk, 'Steglitz-Zehlendorf');
    assert.strictEqual(l.ortsteil, 'Steglitz');
    assert.strictEqual(l.floor, 1);
    assert.strictEqual(l.floors, 6);
    assert.strictEqual(l.wbs, false);
    assert.strictEqual(l.energyClass, 'C');
    assert.strictEqual(l.area, 50.92);
    assert.strictEqual(l.id, util.normId('W1100.22012.0016-0112'));
});

test('gewobag card (table rows without colon)', () =>
{
    const lines = ['WBS erforderlich', 'Bezirk', 'Siemensstadt', 'Adresse', 'Moderlieschenstr. 32, 13599 Berlin/Spandau', 'Neubauwohnung mit Fußbodenheizung und Balkon im Erstbezug / WBS 180 erforderlich', 'Fläche', '3 Zimmer | 74,09 m²', 'Frei ab', '01.10.2026', 'Gesamtmiete', 'ab 985,40€', 'Mietangebot ansehen'];
    const l = gewobag.parseCard(lines, 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/6011-31045-0207-0221/');
    assert.strictEqual(l.ortsteil, 'Siemensstadt');
    assert.strictEqual(l.bezirk, 'Spandau');
    assert.strictEqual(l.street, 'Moderlieschenstr. 32');
    assert.strictEqual(l.plz, '13599');
    assert.strictEqual(l.rooms, 3);
    assert.strictEqual(l.area, 74.09);
    assert.strictEqual(l.rentWarm, 985.4);
    assert.strictEqual(l.wbs, true);
    assert.strictEqual(l.id, '6011310450207' + '0221');
    const income = gewobag.parseCard(['Bezirk', 'Prenzlauer Berg', 'Adresse', 'Pieskower Weg 52, 10409 Berlin/PankowEinkommensgrenzen beachten…', 'Fläche', '3 Zimmer | 91,32 m²', 'Frei ab', '01.11.2026', 'Gesamtmiete', 'ab 937,66€'], 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/1000-00188-0101-0142/');
    assert.strictEqual(income.wbs, null);
    assert.deepStrictEqual(income.flags, ['income limits']);
    assert.strictEqual(income.bezirk, 'Pankow');
});

test('wbm card', () =>
{
    const l = wbm.parseCard(['WBS 160/180/220 - Wohnkomfort pur - Lichtdurchflutete 3 Zimmer mit Balkon', 'Eidechsenweg 9, 13591 Berlin', '1.112,13 € Warmmiete', '3 Zimmer'], 'https://www.wbm.de/wohnungen-berlin/angebote/details/wbs-x/');
    assert.strictEqual(l.street, 'Eidechsenweg 9');
    assert.strictEqual(l.plz, '13591');
    assert.strictEqual(l.rentWarm, 1112.13);
    assert.strictEqual(l.rooms, 3);
    assert.strictEqual(l.wbs, true);
    const detailLines = ['Anzahl der Zimmer: 1', 'Größe: ca. 46.16 m²', 'Etage: EG', 'Objektnummer: 51-2781/6/62', 'Bezugsfertig ab: sofort', 'WBS erforderlich: Nein', 'Errechneter Primärenergiebedarf: 30,00 kWh/(a m²)'];
    const free = wbm.parseCard(['1-Zimmer-Wohnung in Mitte', 'Bernauer Strasse 29, 10115 Berlin', '1.254,62 € Warmmiete', '1 Zimmer'], 'https://www.wbm.de/wohnungen-berlin/angebote/details/1-zimmer-wohnung-in-mitte/');
    applyDetail(free, extractKv(detailLines), detailLines);
    assert.strictEqual(free.area, 46.16);
    assert.strictEqual(free.floor, 0);
    assert.strictEqual(free.wbs, false);
    assert.strictEqual(free.energyClass, 'A');
});

test('gesobau card', () =>
{
    const l = gesobau.parseCard(['Raumwunder für Groß & Klein – Willkommen zu Hause', 'Niederschönhausen', 'Dietzgenstraße 20,', '13156 Berlin', '1.725,59 €', '3 Zimmer', '79,41 m²'], 'https://www.gesobau.de/mieten/wohnungssuche/detailseite/dietzgenstrasse-10-01266-00001-1005-5e7c5778-7181-4091-be5a-bf054860b6cc/');
    assert.strictEqual(l.street, 'Dietzgenstraße 20');
    assert.strictEqual(l.plz, '13156');
    assert.strictEqual(l.ortsteil, 'Niederschönhausen');
    assert.strictEqual(l.bezirk, 'Pankow');
    assert.strictEqual(l.rooms, 3);
    assert.strictEqual(l.area, 79.41);
    assert.strictEqual(l.rentWarm, 1725.59);
    assert.strictEqual(l.id, '10012660000' + '11005');
});

test('same flat on inberlinwohnen and on the company site is one flat', () =>
{
    const store = new Store(null);
    const viaIbw = ibw.parseCard(['2,0 Zimmer, 62,20 m², 808,60 € | Betulaweg 21, 12524 Treptow-Köpenick', 'Große 2 Zimmer Wohnung', 'Alle Details', 'Adresse:', 'Betulaweg 21, 12524, Treptow-Köpenick', 'Zimmeranzahl:', '2,0', 'Wohnfläche:', '62,20 m²', 'Gesamtmiete:', '1.026,60 €', 'WBS:', 'nicht erforderlich'], 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-0701-0310/');
    const direct = gewobag.parseCard(['Bezirk', 'Altglienicke', 'Adresse', 'Betulaweg 21, 12524 Berlin/Treptow-KöpenickGroße 2 Zimmer Wohnung', 'Fläche', '2 Zimmer | 62,20 m²', 'Gesamtmiete', 'ab 1.026,60€'], 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-0701-0310/');
    assert.strictEqual(store.find(viaIbw), null);
    store.add(viaIbw, {});
    assert.ok(store.find(direct), 'same object id must be found');
    const noId = makeListing({ source: 'x', company: 'gewobag', url: 'https://example.org/other', street: 'Betulaweg 21', rooms: 2, area: 62.2 });
    assert.ok(store.find(noId), 'street+rooms+size match works while one side has no id');
});

test('two identical flats in one building with different ids are NOT merged', () =>
{
    const store = new Store(null);
    const a = makeListing({ source: 'ibw', company: 'gewobag', url: 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-1301-0515/', street: 'Daumstr. 54B', rooms: 4, area: 88.86 });
    const b = makeListing({ source: 'ibw', company: 'gewobag', url: 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-0801-0530/', street: 'Daumstr. 54B', rooms: 4, area: 88.86 });
    store.add(a, {});
    assert.strictEqual(store.find(b), null);
});

test('filters: WBS, keywords, ranges, energy, floors', () =>
{
    const cfg = baseCfg();
    const flat = (extra) => makeListing({ source: 't', company: 'degewo', url: 'https://x/' + Math.random(), title: 'Schöne Wohnung', street: 'A 1', rooms: 2, area: 55, rentWarm: 800, floor: 2, wbs: false, bezirk: 'Mitte', ...extra });
    assert.strictEqual(evaluate(flat({}), cfg, true).status, 'accept');
    assert.strictEqual(evaluate(flat({ wbs: true }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ title: 'Wohnung für Studierende' }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ title: 'Seniorenwohnung' }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ text: 'Gesamtmiete ab 551,60€ 3 Zimmer' }), cfg, true).status, 'accept');
    cfg.filters.maxRentWarm = 750;
    assert.strictEqual(evaluate(flat({}), cfg, true).status, 'reject');
    cfg.filters.maxRentWarm = null;
    cfg.filters.minFloor = 1;
    assert.strictEqual(evaluate(flat({ floor: 0 }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ floor: null }), cfg, false).status, 'needs-detail');
    assert.ok(evaluate(flat({ floor: null }), cfg, true).flags.includes('floor unknown'));
    cfg.filters.minFloor = null;
    cfg.filters.energyClasses = ['A+', 'A', 'B', 'C', 'D'];
    assert.strictEqual(evaluate(flat({ energyClass: 'F' }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ energyClass: 'C' }), cfg, true).status, 'accept');
    assert.strictEqual(evaluate(flat({ energyClass: null }), cfg, false).status, 'needs-detail');
    const unclear = evaluate(flat({ wbs: null }), baseCfg(), true);
    assert.strictEqual(unclear.status, 'accept');
    assert.ok(unclear.flags.includes('WBS unclear'));
});

test('filters: Bezirk rules, partial Bezirk by Ortsteil and postcode', () =>
{
    const cfg = baseCfg();
    cfg.locations.bezirke = { 'Marzahn-Hellersdorf': 'exclude', 'Lichtenberg': { allowOrtsteile: ['Karlshorst', 'Friedrichsfelde'], allowPostcodes: ['10318'] } };
    const flat = (extra) => makeListing({ source: 't', company: 'degewo', url: 'https://x/' + Math.random(), title: 't', street: 'A 1', rooms: 2, area: 55, wbs: false, ...extra });
    assert.strictEqual(evaluate(flat({ bezirk: 'Marzahn-Hellersdorf' }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ bezirk: 'Mitte' }), cfg, true).status, 'accept');
    assert.strictEqual(evaluate(flat({ bezirk: 'Lichtenberg', ortsteil: 'Karlshorst' }), cfg, true).status, 'accept');
    assert.strictEqual(evaluate(flat({ bezirk: 'Lichtenberg', ortsteil: 'Fennpfuhl' }), cfg, true).status, 'reject');
    assert.strictEqual(evaluate(flat({ bezirk: 'Lichtenberg', plz: '10318' }), cfg, true).status, 'accept');
    assert.strictEqual(evaluate(flat({ bezirk: 'Lichtenberg', plz: '13057' }), cfg, true).status, 'reject');
    const noPlace = evaluate(flat({ bezirk: null }), cfg, false);
    assert.strictEqual(noPlace.status, 'needs-detail');
    const unknownFinal = evaluate(flat({ bezirk: null }), cfg, true);
    assert.strictEqual(unknownFinal.status, 'accept');
    assert.ok(unknownFinal.flags.includes('location unclear'));
    assert.strictEqual(evaluate(flat({ bezirk: 'Lichtenberg' }), cfg, true).status, 'accept');
});

test('active hours', () =>
{
    const schedule = { timezone: 'Europe/Berlin', start: '06:00', end: '23:59' };
    assert.strictEqual(util.isActive(schedule, new Date('2026-10-22T09:00:00+02:00')), true);
    assert.strictEqual(util.isActive(schedule, new Date('2026-10-22T03:30:00+02:00')), false);
    assert.strictEqual(util.isActive(schedule, new Date('2026-10-22T23:59:00+02:00')), true);
    assert.strictEqual(util.isActive({ timezone: 'Europe/Berlin', start: '22:00', end: '02:00' }, new Date('2026-10-22T23:30:00+02:00')), true);
});

test('pipeline: baseline, new flat, cross-source duplicate, detail enrichment', async () =>
{
    const { tick } = require('../src/index');
    const cfg = baseCfg();
    cfg.sources = { fake: { intervalSec: 1 }, other: { intervalSec: 1 } };
    cfg.notify = { console: false, desktop: false, openBrowser: false };
    cfg.startup = { notifyExisting: false };
    cfg.filters.minFloor = 1;
    const rt = { cfg, flags: {}, log: { info: () => {}, warn: () => {}, debug: () => {} }, http: null, store: new Store(null), counts: {} };

    const old = makeListing({ source: 'fake', company: 'gewobag', url: 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-00001-0101-0001/', title: 'alt', street: 'Alte Str. 1', rooms: 2, area: 50, wbs: false, floor: 2 });
    let details = 0;
    const fake = { name: 'fake', fetchList: async () => ({ listings: fake.data }), fetchDetail: async (ctx, l) => { details++; l.floor = 3; }, data: [old] };
    await tick(rt, fake);
    assert.strictEqual(rt.store.data.baseline.fake, true);
    assert.strictEqual(Object.values(rt.store.data.entries).filter((e) => e.notified).length, 0, 'baseline must not notify');

    const fresh = makeListing({ source: 'fake', company: 'gewobag', url: 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-00002-0101-0002/', title: 'neu', street: 'Neue Str. 2', rooms: 3, area: 70, wbs: false, floor: null });
    fake.data = [old, fresh];
    await tick(rt, fake);
    assert.strictEqual(details, 1, 'floor was missing, detail page fetched once');
    const entry = rt.store.find(fresh);
    assert.strictEqual(entry.notified, true);

    const sameFlatElsewhere = makeListing({ source: 'other', company: 'gewobag', url: 'https://www.inberlinwohnen.de/x', title: 'neu', street: 'Neue Str. 2', rooms: 3, area: 70, wbs: false, floor: 3 });
    sameFlatElsewhere.url = 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-00002-0101-0002/?t=ibw';
    const other = { name: 'other', fetchList: async () => ({ listings: [sameFlatElsewhere] }), fetchDetail: null };
    await tick(rt, other);
    assert.strictEqual(Object.values(rt.store.data.entries).filter((e) => e.notified).length >= 1, true);
    assert.ok(entry.seenBy.other !== undefined, 'second source recorded as later sighting, no second alert');

    const rejected = makeListing({ source: 'fake', company: 'gewobag', url: 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-00003-0101-0003/', title: 'EG', street: 'Tief Str. 3', rooms: 2, area: 50, wbs: false, floor: 0 });
    fake.data = [old, fresh, rejected];
    await tick(rt, fake);
    assert.strictEqual(rt.store.find(rejected).notified, false, 'ground floor rejected by minFloor');
});

test('telegram message always carries the link (button, text link, plain url)', () =>
{
    const { telegramPayload, telegramConfigured } = require('../src/notify');
    const url = 'https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-0701-0310/?a=1&b=2';
    const l = makeListing({ source: 'ibw', company: 'gewobag', url, title: 'Tom & <Jerry>', street: 'Betulaweg 21', plz: '12524', bezirk: 'Treptow-Köpenick', rooms: 2, area: 62.2, rentWarm: 1026.6, floor: 3, floors: 5, energyClass: 'C' });
    const p = telegramPayload({ chatId: '123' }, l, ['WBS unclear'], 'inberlinwohnen');
    assert.strictEqual(p.chat_id, '123');
    assert.strictEqual(p.parse_mode, 'HTML');
    assert.strictEqual(p.disable_web_page_preview, true);
    assert.strictEqual(p.reply_markup.inline_keyboard[0][0].url, url);
    assert.ok(p.text.includes('<a href="https://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-0701-0310/?a=1&amp;b=2">'));
    assert.ok(p.text.includes('\nhttps://www.gewobag.de/fuer-mietinteressentinnen/mietangebote/0100-01036-0701-0310/?a=1&amp;b=2'));
    assert.ok(p.text.includes('GEWOBAG | 2 Zi | 62,2 m²'));
    assert.ok(p.text.includes('Hinweis: WBS unclear'));
    assert.ok(!p.text.includes('<Jerry>'));
    assert.strictEqual(telegramConfigured({ enabled: true, botToken: 't', chatId: '1' }), true);
    assert.strictEqual(telegramConfigured({ enabled: true, botToken: '', chatId: '1' }), false);
    assert.strictEqual(telegramConfigured({ enabled: false, botToken: 't', chatId: '1' }), false);
});

test('telegram sending: success, rate limit retry, button fallback, hard failure', async () =>
{
    const { sendTelegram } = require('../src/notify');
    const realFetch = globalThis.fetch;
    const calls = [];
    const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    try
    {
        calls.length = 0;
        globalThis.fetch = async (u, opts) =>
        {
            calls.push(JSON.parse(opts.body));
            return respond(200, { ok: true });
        };
        await sendTelegram('tok', { chat_id: '1', text: 'x', reply_markup: { a: 1 } });
        assert.strictEqual(calls.length, 1);

        calls.length = 0;
        globalThis.fetch = async (u, opts) =>
        {
            calls.push(JSON.parse(opts.body));
            return calls.length === 1 ? respond(429, { parameters: { retry_after: 0 } }) : respond(200, { ok: true });
        };
        await sendTelegram('tok', { chat_id: '1', text: 'x' });
        assert.strictEqual(calls.length, 2, 'retried after 429');

        calls.length = 0;
        globalThis.fetch = async (u, opts) =>
        {
            calls.push(JSON.parse(opts.body));
            return calls.length === 1 ? respond(400, { description: 'BUTTON_URL_INVALID' }) : respond(200, { ok: true });
        };
        await sendTelegram('tok', { chat_id: '1', text: 'x', reply_markup: { inline_keyboard: [] } });
        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[1].reply_markup, undefined, 'resent without the button, link still in the text');

        globalThis.fetch = async () => respond(401, { description: 'Unauthorized' });
        await assert.rejects(() => sendTelegram('bad', { chat_id: '1', text: 'x' }), /Unauthorized/);
    }
    finally
    {
        globalThis.fetch = realFetch;
    }
});
