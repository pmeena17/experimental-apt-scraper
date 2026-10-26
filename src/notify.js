'use strict';

const { exec } = require('node:child_process');
const { fmtEuro, fmtNum, clock, sleep } = require('./util');

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

// ---------------------------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------------------------
function escapeHtml(text)
{
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(text)
{
    return escapeHtml(text).replace(/"/g, '&quot;');
}

function telegramConfigured(settings)
{
    return !!(settings && settings.enabled && settings.botToken && settings.chatId);
}

// The message always carries the link to the listing: as a button, as a clickable text link and as the plain URL.
function telegramPayload(settings, listing, flags, via)
{
    const d = describe(listing, flags, via);
    const text = '<b>' + escapeHtml(d.title) + '</b>\n' + escapeHtml(d.body) + '\n\n<a href="' + escapeAttr(d.url) + '">Zum Inserat / Bewerben</a>\n' + escapeHtml(d.url);
    return { chat_id: settings.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: 'Jetzt bewerben', url: d.url }]] } };
}

async function telegramCall(token, method, payload)
{
    const res = await fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
}

// retries on rate limit / network errors; if Telegram rejects the button URL, resends without the button
async function sendTelegram(token, payload)
{
    let current = payload;
    let lastError = 'unknown error';
    for (let attempt = 0; attempt < 4; attempt++)
    {
        try
        {
            const r = await telegramCall(token, 'sendMessage', current);
            if (r.ok)
            {
                return;
            }
            lastError = 'Telegram ' + r.status + ': ' + ((r.body && r.body.description) || 'error');
            if (r.status === 429)
            {
                await sleep((((r.body || {}).parameters || {}).retry_after || 1) * 1000);
            }
            else if (r.status === 400 && current.reply_markup)
            {
                current = { ...current, reply_markup: undefined };
            }
            else
            {
                break;
            }
        }
        catch (err)
        {
            lastError = 'network: ' + err.message;
            await sleep(700);
        }
    }
    throw new Error(lastError);
}

async function notifyListing(cfg, listing, flags, via, log)
{
    const n = cfg.notify || {};
    const d = describe(listing, flags, via);
    // start Telegram first: it is the slowest part and runs while the local alerts fire
    let telegramJob = null;
    if (telegramConfigured(n.telegram))
    {
        telegramJob = sendTelegram(n.telegram.botToken, telegramPayload(n.telegram, listing, flags, via));
        telegramJob.catch(() => {});
    }
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
    if (telegramJob)
    {
        try
        {
            await telegramJob;
        }
        catch (err)
        {
            log.warn('Telegram alert FAILED: ' + err.message);
        }
    }
}

module.exports = { notifyListing, describe, openUrl, toast, telegramPayload, telegramConfigured, sendTelegram, telegramCall };
