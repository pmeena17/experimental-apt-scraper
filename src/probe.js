'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sources = require('./sources');

const DEBUG_DIR = path.join(__dirname, '..', 'debug');

// Sites that are not scraped directly yet: only the raw page is saved so the structure can be inspected.
const RAW_ONLY = {
    howoge: ['https://www.howoge.de/immobiliensuche/wohnungssuche.html'],
    stadtundland: ['https://stadtundland.de/wohnungssuche', 'https://stadtundland.de/mieten/wohnungssuche-ibw']
};

const FIELDS = ['company', 'street', 'plz', 'bezirk', 'ortsteil', 'rooms', 'area', 'rentWarm', 'wbs', 'floor', 'energyClass', 'id'];

function save(name, content)
{
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEBUG_DIR, name), content);
}

async function runProbe(rt, names)
{
    const out = [];
    const say = (line) =>
    {
        console.log(line);
        out.push(line);
    };
    say('Wohnungs-Radar probe, ' + new Date().toISOString());

    for (const name of names)
    {
        const source = sources[name];
        const ctx = { http: rt.http, cfg: rt.cfg.sources[name] || {}, log: rt.log };
        say('\n=== ' + name + ' ===');
        try
        {
            const raw = await rt.http.get(source.listUrl);
            save(name + '-list.html', raw.text);
            say('list page: ' + raw.text.length + ' bytes saved to debug/' + name + '-list.html');
        }
        catch (err)
        {
            say('list page FAILED: ' + err.message);
        }
        let listings = [];
        try
        {
            const result = await source.fetchList(ctx);
            listings = result.listings || [];
        }
        catch (err)
        {
            say('parser FAILED: ' + err.message);
            continue;
        }
        say('parsed listings: ' + listings.length);
        if (listings.length === 0)
        {
            continue;
        }
        const health = FIELDS.map((f) => f + ' ' + listings.filter((l) => l[f] !== null && l[f] !== undefined && l[f] !== '').length + '/' + listings.length).join(' | ');
        say('fields filled: ' + health);
        for (const l of listings.slice(0, 2))
        {
            say('sample: ' + JSON.stringify({ url: l.url, title: l.title, street: l.street, plz: l.plz, bezirk: l.bezirk, ortsteil: l.ortsteil, rooms: l.rooms, area: l.area, rentWarm: l.rentWarm, wbs: l.wbs, id: l.id }));
        }
        if (source.fetchDetail)
        {
            const target = listings[0];
            try
            {
                const rawDetail = await rt.http.get(target.url);
                save(name + '-detail.html', rawDetail.text);
                await source.fetchDetail(ctx, target);
                say('detail page saved to debug/' + name + '-detail.html; after enrichment: ' + JSON.stringify({ bezirk: target.bezirk, ortsteil: target.ortsteil, floor: target.floor, energyClass: target.energyClass, wbs: target.wbs, area: target.area, id: target.id, flags: target.flags }));
            }
            catch (err)
            {
                say('detail FAILED: ' + err.message);
            }
        }
    }

    for (const name of Object.keys(RAW_ONLY))
    {
        say('\n=== ' + name + ' (raw page only) ===');
        for (const url of RAW_ONLY[name])
        {
            try
            {
                const res = await rt.http.get(url);
                const file = name + '-' + Buffer.from(url).toString('hex').slice(-8) + '.html';
                save(file, res.text);
                say(url + ' -> ' + res.text.length + ' bytes, saved to debug/' + file);
            }
            catch (err)
            {
                say(url + ' FAILED: ' + err.message);
            }
        }
    }

    save('summary.txt', out.join('\n'));
    console.log('\nDone. Zip the "debug" folder and send it if anything above says FAILED or shows 0 / low field counts.');
}

module.exports = { runProbe };
