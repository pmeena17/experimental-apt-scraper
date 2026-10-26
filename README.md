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
| `npm test` | 22 offline checks of the parsing, filter and Telegram logic |
| `npm run test-notify` | sends a test Windows notification; click it, it should open a page |
| `npm run probe` | downloads the real pages, tells you how many listings each parser found and which fields it filled. **If a line says FAILED or a count is 0 / low, zip the `debug` folder and send it to me.** |
| `npm run once` | one pass over everything online right now, shows `MATCH` / `skip` + the reason for each flat (use it to tune `config.js`) |
| `npm start` | the real thing. First start only remembers what is online, afterwards every new flat that passes your filters is reported |

Useful flags: `--verbose` (see every skip and every poll), `--source=degewo,gewobag`, `--notify-existing`.
`npm run stats` (after a few days) shows which source finds flats first, so we know where speed is won.

## Telegram on your phone (every alert contains the link to apply)

Each alert is one Telegram message: a bold headline (company, rooms, size, rent), address and facts, a
**"Jetzt bewerben" button**, a clickable "Zum Inserat / Bewerben" link, and the plain URL as well (so the link is
there even if Telegram shows only the text, e.g. on the lock screen). Link previews are switched off so the
message appears instantly. If Telegram is briefly unreachable or rate-limits, it retries; if it rejects the
button, it resends without the button and the link stays in the text.

One-time setup (about 3 minutes):

1. In Telegram, open **@BotFather**, send `/newbot`, choose a name. Copy the token it gives you.
2. Open your new bot in Telegram, press **Start**, send "hi".
3. In `config.js`, paste the token into `notify.telegram.botToken`.
4. Run `npm run telegram-setup`. It prints your `chatId`. Put it into `notify.telegram.chatId` in quotes and set `enabled: true`.
5. Run `npm run test-telegram`. You should get a test message with the button within a few seconds.

When `npm start` runs it sends "Wohnungs-Radar läuft" once, so you know it is alive (turn off with `startupMessage: false`).
Tip: in Telegram, set the bot chat to "Sound on" and, on Android, give it a loud notification channel.
The PC with the program running must be on. Applying from the phone is manual: tap the button, fill the form.

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
