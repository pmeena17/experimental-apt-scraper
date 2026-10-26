'use strict';

const { exec } = require('node:child_process');
const { fmtEuro, fmtNum, clock } = require('./util');

function openUrl(url)
{
    const safe = String(url).replace(/"/g, '%22');
    if (process.platform === 'win32')
    {
        exec('start "" "' + safe + '"');
    }
    else if (process.platform === 'darwin')
    {
        exec('open "' + safe + '"');
    }
    else
    {
        exec('xdg-open "' + safe + '"');
    }
}

function describe(listing, flags, via)
{
    const place = [listing.ortsteil, listing.bezirk].filter(Boolean).join(', ');
    const title = listing.company.toUpperCase() + ' | ' + fmtNum(listing.rooms) + ' Zi | ' + fmtNum(listing.area) + ' m² | ' + fmtEuro(listing.rentWarm || listing.rentCold);
    const lines = [];
    lines.push([listing.street, listing.plz, place].filter(Boolean).join(' | '));
    const facts = [];
    if (listing.floor !== null)
    {
        facts.push('Etage ' + listing.floor + (listing.floors ? '/' + listing.floors : ''));
    }
    if (listing.energyClass)
    {
        facts.push('Energie ' + listing.energyClass);
    }
    if (listing.available)
    {
        facts.push('frei ab ' + listing.available);
    }
    if (facts.length > 0)
    {
        lines.push(facts.join(' | '));
    }
    if (flags.length > 0)
    {
        lines.push('Hinweis: ' + flags.join(', '));
    }
    lines.push('gefunden ' + clock() + ' via ' + via);
    return { title, body: lines.join('\n'), url: listing.url };
}

function toast(title, body, url)
{
    let notifier = null;
    try
    {
        notifier = require('node-notifier');
    }
    catch (err)
    {
        return false;
    }
    notifier.notify({ title, message: body, wait: true, sound: true, appID: 'Wohnungs-Radar' }, (error, response) =>
    {
        if (response === 'activate' && url)
        {
            openUrl(url);
        }
    });
    return true;
}

async function telegram(settings, text)
{
    const res = await fetch('https://api.telegram.org/bot' + settings.botToken + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: settings.chatId, text }) });
    if (!res.ok)
    {
        throw new Error('Telegram HTTP ' + res.status);
    }
}

async function notifyListing(cfg, listing, flags, via, log)
{
    const n = cfg.notify || {};
    const d = describe(listing, flags, via);
    if (n.console !== false)
    {
        console.log('\n\x07*** NEW *** ' + d.title + '\n' + d.body + '\n' + d.url + '\n');
    }
    if (n.desktop !== false)
    {
        toast(d.title, d.body, d.url);
    }
    if (n.openBrowser)
    {
        openUrl(d.url);
    }
    if (n.telegram && n.telegram.enabled)
    {
        try
        {
            await telegram(n.telegram, d.title + '\n' + d.body + '\n' + d.url);
        }
        catch (err)
        {
            log.warn('telegram failed: ' + err.message);
        }
    }
}

module.exports = { notifyListing, describe, openUrl, toast };
