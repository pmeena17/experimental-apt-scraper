'use strict';

const path = require('node:path');
const { createHttp } = require('./http');
const { Store } = require('./store');
const { evaluate } = require('./filter');
const { notifyListing, describe, toast } = require('./notify');
const { makeListing } = require('./listing');
const sources = require('./sources');
const { isActive, jittered, clock, fmtEuro, fmtNum } = require('./util');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv)
{
    const out = { command: null, flags: {} };
    for (const arg of argv)
    {
        if (arg.startsWith('--'))
        {
            const [key, value] = arg.slice(2).split('=');
            out.flags[key] = value === undefined ? true : value;
        }
        else if (!out.command)
        {
            out.command = arg;
        }
    }
    return out;
}

function makeLog(verbose)
{
    const stamp = () => '[' + clock() + ']';
    return {
        info: (message) => console.log(stamp() + ' ' + message),
        warn: (message) => console.warn(stamp() + ' WARN ' + message),
        debug: (message) =>
        {
            if (verbose)
            {
                console.log(stamp() + ' ' + message);
            }
        }
    };
}

function shortLine(l)
{
    const place = [l.plz, l.ortsteil || l.bezirk].filter(Boolean).join(' ');
    return l.company.padEnd(12) + ' ' + fmtNum(l.rooms).padStart(3) + ' Zi ' + fmtNum(l.area).padStart(6) + ' m² ' + fmtEuro(l.rentWarm || l.rentCold).padStart(8) + '  ' + (l.street || '?') + ', ' + place;
}

function enabledSources(cfg, flags)
{
    const wanted = flags.source ? String(flags.source).split(',') : null;
    return Object.keys(sources).filter((name) => cfg.sources[name] && cfg.sources[name].enabled && (!wanted || wanted.includes(name)));
}

function ctxFor(rt, source)
{
    return { http: rt.http, cfg: rt.cfg.sources[source.name] || {}, log: rt.log };
}

// ---------------------------------------------------------------------------------------------
// decision pipeline for a listing that has not been seen before
// ---------------------------------------------------------------------------------------------
async function decide(rt, source, listing, entry)
{
    let verdict = evaluate(listing, rt.cfg, false);
    if (verdict.status === 'needs-detail')
    {
        if (source.fetchDetail)
        {
            try
            {
                await source.fetchDetail(ctxFor(rt, source), listing);
            }
            catch (err)
            {
                rt.log.warn(source.name + ': detail page failed (' + err.message + ') ' + listing.url);
            }
            rt.store.addKeys(listing, entry);
            const other = rt.store.findOther(listing, entry);
            if (other)
            {
                rt.store.noteSeenBy(other, source.name);
                rt.log.debug('duplicate of a flat already seen via ' + other.source + ': ' + shortLine(listing));
                return;
            }
        }
        verdict = evaluate(listing, rt.cfg, true);
    }
    if (verdict.status === 'accept')
    {
        entry.notified = true;
        rt.store.save();
        rt.log.info('MATCH via ' + source.name + ': ' + shortLine(listing));
        await notifyListing(rt.cfg, listing, verdict.flags, source.name, rt.log);
    }
    else
    {
        rt.log.debug('skip ' + shortLine(listing) + ' -> ' + verdict.reasons.join('; '));
    }
}

async function tick(rt, source)
{
    const started = Date.now();
    const result = await source.fetchList(ctxFor(rt, source));
    const listings = result.listings;
    const ms = Date.now() - started;
    if (result.unchanged)
    {
        rt.log.debug(source.name + ': unchanged (' + ms + ' ms)');
        return;
    }
    const before = rt.counts[source.name];
    if (listings.length === 0 && (before === undefined || before > 0))
    {
        rt.log.warn(source.name + ': 0 listings found. Either there are none right now or the page layout changed. Run: npm run probe -- --source=' + source.name);
    }
    rt.counts[source.name] = listings.length;

    const firstRun = !rt.store.data.baseline[source.name];
    const silent = firstRun && !rt.cfg.startup.notifyExisting && !rt.flags['notify-existing'];
    const jobs = [];
    let fresh = 0;
    for (const listing of listings)
    {
        const existing = rt.store.find(listing);
        if (existing)
        {
            const lag = rt.store.noteSeenBy(existing, source.name);
            if (lag !== null)
            {
                rt.log.debug(source.name + ' also sees a flat that ' + existing.source + ' found first (+' + lag + ' s): ' + shortLine(listing));
            }
            continue;
        }
        const entry = rt.store.add(listing, {});
        fresh++;
        if (!silent)
        {
            jobs.push(decide(rt, source, listing, entry));
        }
    }
    if (firstRun)
    {
        rt.store.data.baseline[source.name] = true;
        rt.store.save();
        rt.log.info(source.name + ': ' + listings.length + ' current listings remembered' + (silent ? ' (not reported)' : ''));
    }
    await Promise.all(jobs);
    rt.log.debug(source.name + ': ' + listings.length + ' listings, ' + fresh + ' new, ' + ms + ' ms');
}

function startLoop(rt, source)
{
    const settings = rt.cfg.sources[source.name];
    const base = (settings.intervalSec || 60) * 1000;
    let errors = 0;
    let sleeping = false;
    const loop = async () =>
    {
        let delay = jittered(base, rt.cfg.jitter);
        if (!isActive(rt.cfg.schedule))
        {
            if (!sleeping)
            {
                rt.log.info(source.name + ': outside active hours, sleeping');
                sleeping = true;
            }
            delay = 60000;
        }
        else
        {
            sleeping = false;
            try
            {
                await tick(rt, source);
                errors = 0;
            }
            catch (err)
            {
                errors++;
                const blocked = err.status === 403 || err.status === 429 || err.status === 503;
                delay = Math.min(600000, Math.max(err.retryAfterMs || 0, base * Math.pow(2, errors)));
                rt.log.warn(source.name + ': ' + err.message + (blocked ? ' (blocked or rate limited?)' : '') + ' - retry in ' + Math.round(delay / 1000) + ' s');
            }
        }
        setTimeout(loop, delay);
    };
    setTimeout(loop, Math.random() * 4000);
}

// ---------------------------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------------------------
async function cmdRun(rt)
{
    const names = enabledSources(rt.cfg, rt.flags);
    const s = rt.cfg.schedule;
    console.log('Wohnungs-Radar running. Active ' + s.start + '-' + s.end + ' (' + s.timezone + '). Sources: ' + names.map((n) => n + ' every ' + rt.cfg.sources[n].intervalSec + ' s').join(', '));
    console.log('Ctrl+C to stop. First start only remembers what is online; new listings are reported from then on.\n');
    for (const name of names)
    {
        startLoop(rt, sources[name]);
    }
    const stop = () =>
    {
        rt.store.flush();
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

// one pass, nothing stored, nothing notified: shows what the filters would do with everything that is online now
async function cmdOnce(rt)
{
    for (const name of enabledSources(rt.cfg, rt.flags))
    {
        const source = sources[name];
        let result = null;
        try
        {
            result = await source.fetchList(ctxFor(rt, source));
        }
        catch (err)
        {
            rt.log.warn(name + ': ' + err.message);
            continue;
        }
        console.log('\n== ' + name + ': ' + result.listings.length + ' listings ==');
        let budget = 15;
        for (const listing of result.listings)
        {
            let verdict = evaluate(listing, rt.cfg, false);
            if (verdict.status === 'needs-detail')
            {
                if (source.fetchDetail && budget-- > 0)
                {
                    try
                    {
                        await source.fetchDetail(ctxFor(rt, source), listing);
                    }
                    catch (err)
                    {
                        rt.log.warn('detail failed: ' + err.message);
                    }
                }
                verdict = evaluate(listing, rt.cfg, true);
            }
            const tail = verdict.status === 'accept' ? verdict.flags.join(', ') : '-> ' + verdict.reasons.join('; ');
            console.log((verdict.status === 'accept' ? 'MATCH ' : 'skip  ') + shortLine(listing) + '  ' + tail);
        }
    }
}

function cmdStats(rt)
{
    const seen = new Set();
    const first = {};
    const lags = {};
    for (const key of Object.keys(rt.store.data.entries))
    {
        const entry = rt.store.data.entries[key];
        const id = entry.first + '|' + entry.url;
        if (seen.has(id))
        {
            continue;
        }
        seen.add(id);
        first[entry.source] = (first[entry.source] || 0) + 1;
        for (const name of Object.keys(entry.seenBy || {}))
        {
            (lags[name] = lags[name] || []).push(entry.seenBy[name]);
        }
    }
    console.log('Flats remembered: ' + seen.size + '\nFirst seen by:');
    for (const name of Object.keys(first))
    {
        console.log('  ' + name.padEnd(16) + first[name]);
    }
    console.log('Other sources saw the same flat later by (seconds, average / count):');
    for (const name of Object.keys(lags))
    {
        const avg = Math.round(lags[name].reduce((a, b) => a + b, 0) / lags[name].length);
        console.log('  ' + name.padEnd(16) + avg + ' s / ' + lags[name].length);
    }
}

function cmdTestNotify(rt)
{
    const sample = makeListing({ source: 'test', company: 'degewo', url: 'https://www.degewo.de/immosuche', title: 'Testwohnung', street: 'Teststraße 1', plz: '10115', bezirk: 'Mitte', ortsteil: 'Mitte', rooms: 2, area: 55, rentWarm: 800, floor: 2, floors: 5, energyClass: 'C', available: 'sofort' });
    const d = describe(sample, ['Testalarm'], 'test');
    console.log(d.title + '\n' + d.body);
    console.log(toast(d.title, d.body, d.url) ? 'Toast sent (click it to open the link).' : 'node-notifier not installed - run npm install.');
}

async function main()
{
    const args = parseArgs(process.argv.slice(2));
    const cfgPath = args.flags.config ? path.resolve(String(args.flags.config)) : path.join(ROOT, 'config.js');
    const cfg = require(cfgPath);
    const rt = {
        cfg,
        flags: args.flags,
        log: makeLog(!!args.flags.verbose || args.command === 'once'),
        http: createHttp(15000),
        store: new Store(path.join(ROOT, 'data', 'state.json')),
        counts: {}
    };
    const command = args.command || 'run';
    if (command === 'run')
    {
        await cmdRun(rt);
    }
    else if (command === 'once')
    {
        await cmdOnce(rt);
    }
    else if (command === 'probe')
    {
        await require('./probe').runProbe(rt, enabledSources(rt.cfg, rt.flags));
    }
    else if (command === 'stats')
    {
        cmdStats(rt);
    }
    else if (command === 'test-notify')
    {
        cmdTestNotify(rt);
    }
    else
    {
        console.log('Commands: run (default) | once | probe | stats | test-notify    Flags: --verbose --source=a,b --notify-existing --config=file');
    }
}

if (require.main === module)
{
    main().catch((err) =>
    {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { parseArgs, shortLine, tick, decide };
