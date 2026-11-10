// In-season tournaments, anchored to a WEEKDAY RULE (e.g. "first Friday of December") so each year's date shifts to keep the same weekday.
// The 2026 rules reproduce the real dates: Cliff Keen Las Vegas Invitational Dec 4-5 2026 and Midlands Dec 29-30 2026 (verified by web search, Nov 2026);
// Southern Scuffle Jan 2-3 2027 is INFERRED (first weekend of January). Other names/rules are approximate or generic placeholders.
// Game weeks are Saturdays; an event lands in the week whose Saturday is nearest its (start) date.
const SAT = 6;
// { name, tier, loc, confs (regional bias), m: month 0-11, nth: 1-5 or -1 (last), dow: 0=Sun..6=Sat, days: length in days }
export const TOURNAMENT_RULES = [
  { name: 'Daktronics Open',                   tier: 'open',  loc: 'Brookings, SD',   confs: ['Big 12', 'Big Ten'],                 m: 10, nth: 1,  dow: SAT, days: 1 },
  { name: 'Mid-Atlantic Open',                 tier: 'open',  loc: 'Mid-Atlantic',    confs: ['EIWA', 'ACC'],                       m: 10, nth: 1,  dow: 0,   days: 1 },
  { name: 'Great Lakes Open',                  tier: 'open',  loc: 'Great Lakes',     confs: ['Big Ten', 'MAC'],                    m: 10, nth: 2,  dow: SAT, days: 1 },
  { name: 'Southeast Open',                    tier: 'open',  loc: 'Southeast',       confs: ['ACC', 'Independent / Other'],        m: 10, nth: 3,  dow: SAT, days: 1 },
  { name: 'Pacific Open',                      tier: 'open',  loc: 'West Coast',      confs: ['Big 12', 'Independent / Other'],     m: 10, nth: 3,  dow: 0,   days: 1 },
  { name: 'Cliff Keen Las Vegas Invitational', tier: 'major', loc: 'Las Vegas, NV',   confs: [],                                    m: 11, nth: 1,  dow: 5,   days: 2 },
  { name: 'Eastern Open',                      tier: 'open',  loc: 'Northeast',       confs: ['EIWA', 'ACC'],                       m: 11, nth: 2,  dow: SAT, days: 1 },
  { name: 'Reno Tournament of Champions',      tier: 'major', loc: 'Reno, NV',        confs: [],                                    m: 11, nth: 3,  dow: SAT, days: 1 },
  { name: 'Midlands Championships',            tier: 'major', loc: 'Evanston, IL',    confs: [],                                    m: 11, nth: -1, dow: 2,   days: 2 },
  { name: 'Southern Scuffle',                  tier: 'major', loc: 'Chattanooga, TN', confs: [],                                    m: 0,  nth: 1,  dow: SAT, days: 2, yearOffset: 1 },
  { name: 'Rocky Mountain Open',               tier: 'open',  loc: 'Mountain West',   confs: ['Big 12'],                            m: 0,  nth: 4,  dow: SAT, days: 1, yearOffset: 1 },
  { name: 'Midwest Classic',                   tier: 'open',  loc: 'Midwest',         confs: ['Big Ten', 'Big 12', 'MAC'],          m: 1,  nth: 1,  dow: SAT, days: 1, yearOffset: 1 },
  { name: 'Last Chance Open',                  tier: 'open',  loc: 'Neutral site',    confs: [],                                    m: 1,  nth: 4,  dow: SAT, days: 1, yearOffset: 1 },
];

const DAY = 86400000;
// nth weekday of a month (nth = -1 -> last). Returns a UTC ms timestamp.
export function nthWeekday(year, month, dow, nth) {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month, 1)), delta = (dow - first.getUTCDay() + 7) % 7;
    return Date.UTC(year, month, 1 + delta + (nth - 1) * 7);
  }
  const last = new Date(Date.UTC(year, month + 1, 0)), delta = (last.getUTCDay() - dow + 7) % 7;
  return Date.UTC(year, month + 1, 0 - delta);
}
const fmt = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Season calendar: week 1 = first Saturday of November. Conference tournaments = first Saturday of March.
// NCAA Championships = third Thursday of March (their Saturday final is the NCAA week). Selection week is the week before.
export function seasonCalendar(season) {
  const start = nthWeekday(season, 10, SAT, 1);
  const weekOf = ms => Math.round((ms - start) / (7 * DAY)) + 1;
  const confMs = nthWeekday(season + 1, 2, SAT, 1), ncaaThu = nthWeekday(season + 1, 2, 4, 3);
  const confWeek = weekOf(confMs), ncaaWeek = weekOf(ncaaThu + 2 * DAY);
  return { season, start, confWeek, selWeek: ncaaWeek - 1, ncaaWeek, lastWeek: ncaaWeek, lastDualWeek: confWeek - 1, confDates: `${fmt(confMs)}-${fmt(confMs + DAY).split(' ')[1]}`, ncaaDates: `${fmt(ncaaThu)}-${fmt(ncaaThu + 2 * DAY).split(' ')[1]}` };
}

// Resolve the rules into concrete events for a season.
export function resolveTournaments(season, cal = seasonCalendar(season)) {
  return TOURNAMENT_RULES.map(r => {
    const ms = nthWeekday(season + (r.yearOffset || 0), r.m, r.dow, r.nth);
    const week = Math.max(1, Math.min(cal.lastDualWeek, Math.round((ms - cal.start) / (7 * DAY)) + 1));
    const dates = r.days > 1 ? `${fmt(ms)}-${fmt(ms + (r.days - 1) * DAY).split(' ')[1]}` : fmt(ms);
    return { name: r.name, tier: r.tier, loc: r.loc, confs: r.confs, week, dates };
  });
}

// Automatic NCAA berths per weight class by conference (APPROXIMATE; real allocation depends on conference strength). 23 + 10 at-large = 33.
export const CONF_BIDS = { 'Big Ten': 7, 'Big 12': 6, 'ACC': 3, 'EIWA': 4, 'MAC': 2, 'Independent / Other': 1 };
export const NCAA_FIELD = 33;
