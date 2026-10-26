'use strict';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

class HttpError extends Error
{
    constructor(message, status, retryAfterMs)
    {
        super(message);
        this.status = status;
        this.retryAfterMs = retryAfterMs || 0;
    }
}

function parseRetryAfter(value)
{
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n * 1000 : 0;
}

function createHttp(timeoutMs)
{
    const cache = new Map();
    const timeout = timeoutMs || 15000;

    // options.cache = true -> conditional request (ETag / Last-Modified) when the server supports it
    async function get(url, options)
    {
        const opts = options || {};
        const headers = { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'de-DE,de;q=0.9,en;q=0.7' };
        const cached = opts.cache ? cache.get(url) : null;
        if (cached && cached.etag)
        {
            headers['if-none-match'] = cached.etag;
        }
        if (cached && cached.lastModified)
        {
            headers['if-modified-since'] = cached.lastModified;
        }
        const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
        if (res.status === 304)
        {
            return { status: 304, text: '', notModified: true, url: res.url };
        }
        if (!res.ok)
        {
            throw new HttpError('HTTP ' + res.status + ' for ' + url, res.status, parseRetryAfter(res.headers.get('retry-after')));
        }
        const text = await res.text();
        if (opts.cache)
        {
            cache.set(url, { etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') });
        }
        return { status: res.status, text, notModified: false, url: res.url };
    }

    return { get };
}

module.exports = { createHttp, HttpError };
