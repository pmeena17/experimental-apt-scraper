'use strict';

// ============================================================================
//  Wohnungs-Radar settings. Edit, save, restart the program (Ctrl+C, npm start).
//  "null" means "this filter is off".
// ============================================================================

module.exports = {
    // Companies you want to hear about. (inberlinwohnen.de also lists berlinovo, which is ignored.)
    companies: ['degewo', 'gewobag', 'gesobau', 'howoge', 'stadtundland', 'wbm'],

    // The program only polls inside this window, measured in Berlin time.
    schedule: { timezone: 'Europe/Berlin', start: '06:00', end: '23:59' },

    // Where to look and how often (seconds, +- jitter). inberlinwohnen.de covers ALL six companies
    // (HOWOGE and Stadt und Land are only reachable through it for now). The direct sources may show a
    // flat earlier; run "npm run stats" after a few days to see which source is really first.
    sources: {
        inberlinwohnen: { enabled: true, intervalSec: 30, pages: 1 },
        degewo: { enabled: true, intervalSec: 90, maxPages: 15 },
        gewobag: { enabled: true, intervalSec: 60, maxPages: 10 },
        wbm: { enabled: true, intervalSec: 60 },
        gesobau: { enabled: true, intervalSec: 60, maxPages: 4 }
    },
    jitter: 0.2,

    filters: {
        // 'exclude' = never show flats that need a WBS. ('only' = only WBS flats, 'any' = don't care)
        wbs: 'exclude',
        // when a listing does not say whether a WBS is needed: 'notify' (shown with a warning) or 'exclude'
        unknownWbs: 'notify',
        // Flats with "Einkommensgrenzen" (income bands 140-220 %, no WBS paper needed). 'flag' | 'exclude' | 'allow'
        incomeRestricted: 'flag',

        // Texts that remove a listing (senior housing, student/apprentice housing ...). Strings are matched
        // without regard to case/umlauts; /regex/ is also possible.
        excludeKeywords: ['senior', 'rentner', 'im alter', 'seniorenwohnen', /\bab\s*(55|60|65)\s*(jahren|j\.)/i, /\b(55|60|65)\s*\+/, 'studierende', 'studenten', 'studentisch', 'studis', 'student', 'azubi', 'auszubildende', 'wohnheim', 'junges wohnen', 'wohnen auf zeit'],

        // numbers; examples: maxRentWarm: 950, minRooms: 2, maxRooms: 3.5, minArea: 45, minFloor: 1 (0 = ground floor)
        maxRentWarm: null,
        maxRentCold: null,
        minRooms: null,
        maxRooms: null,
        minArea: null,
        maxArea: null,
        minFloor: null,
        maxFloor: null,

        // allowed energy classes, e.g. ['A+', 'A', 'B', 'C', 'D']. null = off. (Classes are derived from kWh when missing.)
        energyClasses: null
    },

    locations: {
        // Bezirk not listed below: 'allow' or 'exclude'
        default: 'allow',
        // what to do when the place of a listing can not be determined: 'notify' (with a warning) or 'exclude'
        unknown: 'notify',
        // One entry per Bezirk. Values:
        //   'exclude'  never
        //   'allow'    everything
        //   { allowOrtsteile: [...], allowPostcodes: [...], excludeOrtsteile: [...], excludePostcodes: [...] }
        // Postcodes are the most reliable way to pick parts of a Bezirk (every source has them).
        bezirke: {
            // 'Marzahn-Hellersdorf': 'exclude',
            // 'Lichtenberg': { allowOrtsteile: ['Karlshorst', 'Friedrichsfelde'], allowPostcodes: ['10318', '10319'] },
            // 'Pankow': 'allow'
        }
    },

    notify: {
        console: true,
        desktop: true,        // Windows toast, click = open the listing
        openBrowser: false,   // true = open every match directly in your default browser (fastest way to apply)
        // Phone alerts: every message has a "Jetzt bewerben" button plus the link to the listing.
        // Setup: README, section Telegram. startupMessage: one message when the program starts.
        telegram: { enabled: false, botToken: '', chatId: '', startupMessage: true }
    },

    // true = on the very first start, also report everything that is online right now (normally it is
    // only remembered, so you don't get 100 alerts at once)
    startup: { notifyExisting: false }
};
