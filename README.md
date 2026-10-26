# Wohnungs-Radar (milestone 1: watch + notify)

Watches the listings of degewo, Gewobag, WBM, Gesobau and inberlinwohnen.de (which carries all six
companies, including HOWOGE and Stadt und Land), removes flats you don't want, removes duplicates across
sources, and alerts you within seconds. It does **not** apply for you (that is milestone 2).

## Install (Windows 11, once)

1. Open PowerShell and run: `winget install OpenJS.NodeJS.LTS` (then close and reopen PowerShell).
2. Unzip this folder, open PowerShell inside it (Shift + right click -> "Open in Terminal").
3. `npm install`

## First run, in this order

| command | what it does |
|---|---|
| `npm test` | 20 offline checks of the parsing/filter logic |
| `npm run test-notify` | sends a test Windows notification; click it, it should open a page |
| `npm run probe` | downloads the real pages, tells you how many listings each parser found and which fields it filled. **If a line says FAILED or a count is 0 / low, zip the `debug` folder and send it to me.** |
| `npm run once` | one pass over everything online right now, shows `MATCH` / `skip` + the reason for each flat (use it to tune `config.js`) |
| `npm start` | the real thing. First start only remembers what is online, afterwards every new flat that passes your filters is reported |

Useful flags: `--verbose` (see every skip and every poll), `--source=degewo,gewobag`, `--notify-existing`.
`npm run stats` (after a few days) shows which source finds flats first, so we know where speed is won.

## Settings: `config.js`

Open it in any text editor, it is commented. Fixed things you asked for are already in there: no WBS flats,
no senior / student / apprentice housing, active 06:00-23:59 Berlin time, no limit on alerts.
Fill in rent / rooms / size / floor / energy class limits, and Bezirk rules (`'exclude'`, or allow only some
Ortsteile / postcodes inside a big Bezirk). `openBrowser: true` opens every match in your browser immediately,
which together with your one-click form filler is currently the fastest way to apply by hand.

## What is verified and what is not

* Page structure of inberlinwohnen.de, degewo, Gewobag, WBM and Gesobau was checked against the live pages
  (server-rendered HTML, no login). The text patterns the parsers rely on are covered by `npm test`.
* The HTML element layer (finding the card around each listing) could not be run against live pages in the
  environment where this was written. `npm run probe` is the check for that.
* HOWOGE's list is built by JavaScript, Stadt und Land's list was not inspectable: both come through
  inberlinwohnen.de for now. `probe` saves their pages so direct support can be added.
* Ortsteil rules work where the source names the Ortsteil (degewo, Gewobag, Gesobau). inberlinwohnen.de only
  gives Bezirk + postcode, so for exact control inside a Bezirk use `allowPostcodes`.
