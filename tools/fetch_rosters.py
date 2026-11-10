"""Fetch official team roster pages (Sidearm sites) for the game's schools and parse them to tools/rosters.json.
Polite: one request at a time, ~1.5s apart, cached under tools/cache/. Re-run is cheap (uses the cache unless --refresh).
Usage:  py tools/fetch_rosters.py [--refresh] [School Name ...]"""
import json, os, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(__file__))
from rosterparse import parse_roster

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
UA = 'wrestling-coach-personal-project (single polite fetch per school)'
DOMAINS = {
 'Penn State': 'gopsusports.com', 'Iowa': 'hawkeyesports.com', 'Ohio State': 'ohiostatebuckeyes.com', 'Nebraska': 'huskers.com', 'Minnesota': 'gophersports.com',
 'Michigan': 'mgoblue.com', 'Illinois': 'fightingillini.com', 'Rutgers': 'scarletknights.com', 'Northwestern': 'nusports.com', 'Wisconsin': 'uwbadgers.com',
 'Michigan State': 'msuspartans.com', 'Purdue': 'purduesports.com', 'Indiana': 'iuhoosiers.com', 'Maryland': 'umterps.com',
 'Oklahoma State': 'okstate.com', 'Iowa State': 'cyclones.com', 'Arizona State': 'thesundevils.com', 'Missouri': 'mutigers.com', 'Oklahoma': 'soonersports.com',
 'Northern Iowa': 'unipanthers.com', 'North Dakota State': 'gobison.com', 'Cal Poly': 'gopoly.com', 'South Dakota State': 'gojacks.com', 'Northern Colorado': 'uncbears.com',
 'West Virginia': 'wvusports.com', 'Utah Valley': 'wolverinegreen.com', 'Wyoming': 'gowyo.com', 'Air Force': 'goairforcefalcons.com',
 'NC State': 'gopack.com', 'Virginia Tech': 'hokiesports.com', 'Pittsburgh': 'pittsburghpanthers.com', 'North Carolina': 'goheels.com', 'Stanford': 'gostanford.com',
 'Virginia': 'virginiasports.com', 'Duke': 'goduke.com',
 'Cornell': 'cornellbigred.com', 'Lehigh': 'lehighsports.com', 'Princeton': 'goprincetontigers.com', 'Penn': 'pennathletics.com', 'Binghamton': 'binghamtonbearcats.com',
 'Army': 'goarmywestpoint.com', 'Navy': 'navysports.com', 'Harvard': 'gocrimson.com', 'Lock Haven': 'lhuathletics.com', 'Bucknell': 'bucknellbison.com', 'Brown': 'brownbears.com',
 'Columbia': 'gocolumbialions.com', 'American': 'aueagles.com', 'Hofstra': 'gohofstra.com', 'Drexel': 'drexeldragons.com', 'Franklin & Marshall': 'godiplomats.com',
 'Sacred Heart': 'sacredheartpioneers.com',
 'Central Michigan': 'cmuchippewas.com', 'Rider': 'ridercdragons.com', 'Ohio': 'ohiobobcats.com', 'Buffalo': 'ubbulls.com', 'Kent State': 'kentstatesports.com', 'Northern Illinois': 'niuhuskies.com',
 'Oregon State': 'osubeavers.com', 'Little Rock': 'lrtrojans.com', 'SIU Edwardsville': 'siuecougars.com', 'Campbell': 'gocamels.com', 'Gardner-Webb': 'gwusports.com',
 'Appalachian State': 'appstatesports.com', 'Chattanooga': 'gomocs.com',
}
DOMAINS['Rider'] = 'gobroncs.com'
DOMAINS['Lock Haven'] = 'lockhavenathletics.com'
# smaller D1 programs that WrestleStat lists but the original game did not (domains are best guesses; failures are reported)
DOMAINS.update({'Bellarmine': 'bellarmineknights.com', 'Bloomsburg': 'bloomuhuskies.com', 'CSU Bakersfield': 'gorunners.com', 'Clarion': 'clarionathletics.com',
  'Davidson': 'davidsonwildcats.com', 'Edinboro': 'gofightingscots.com', 'George Mason': 'gomason.com', 'LIU': 'liuathletics.com', 'Mercyhurst': 'hurstathletics.com',
  'Morgan State': 'morganstatebears.com', 'Presbyterian': 'gobluehose.com', 'The Citadel': 'citadelsports.com', 'VMI': 'vmikeydets.com'})
PATHS = [f'/sports/{sl}/roster{q}' for sl in ('wrestling', 'wr', 'mens-wrestling', 'mwrestle') for q in ('?view=table', '')]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf8', errors='replace')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    refresh = '--refresh' in sys.argv
    out = {}
    if os.path.exists(os.path.join(HERE, 'rosters.json')) and args:
        out = json.load(open(os.path.join(HERE, 'rosters.json'), encoding='utf8'))
    for school, dom in DOMAINS.items():
        if args and school not in args: continue
        cf = os.path.join(CACHE, school.replace(' ', '_').replace('&', 'and') + '.html')
        html, url = None, None
        if os.path.exists(cf) and not refresh and parse_roster(open(cf, encoding='utf8').read()):
            html = open(cf, encoding='utf8').read(); url = 'cache'
        else:
            html = None
            for p in PATHS:
                try:
                    url = 'https://' + dom + p; html = get(url)
                    if parse_roster(html): break
                    html = None
                except Exception as e:
                    html = None; print('   ', school, p, 'ERR', str(e)[:60])
                time.sleep(0.8)
            if html: open(cf, 'w', encoding='utf8').write(html)
            time.sleep(1.5)
        players = parse_roster(html) if html else []
        out[school] = dict(url=url, players=players)
        print(f'{school:22s} {len(players):3d} players  {url}', flush=True)
    json.dump(out, open(os.path.join(HERE, 'rosters.json'), 'w', encoding='utf8'), indent=0, ensure_ascii=False)


if __name__ == '__main__':
    main()
