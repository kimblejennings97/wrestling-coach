"""Download school logos (personal-use project) from ESPN's public team directory into assets/logos/<school-id>.png
and write js/data/logos.js (LOGOS_ENABLED flag + list of ids that have a logo). Schools without a logo get an initials badge in the UI.
Run: py tools/fetch_logos.py   (cached: re-run only fetches missing files; --refresh re-downloads)
NOTE: logos are the schools' trademarks. Fine for a private game; replace/disable (LOGOS_ENABLED=false) before sharing it."""
import json, os, re, sys, time, urllib.request, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'logos'); os.makedirs(OUT, exist_ok=True)
UA = 'wrestling-coach-personal-project'
LISTS = ['basketball/mens-college-basketball', 'football/college-football']


def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        b = r.read()
    return b if binary else json.loads(b.decode('utf8'))


def norm(s): return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', s).lower()).strip()


# game school name -> ESPN "location" (only where they differ)
ALIAS = {'CSU Bakersfield': 'Cal State Bakersfield', 'Appalachian State': 'App State', 'Army': 'Army', 'Penn': 'Pennsylvania', 'Pittsburgh': 'Pittsburgh',
         'Little Rock': 'Little Rock', 'Utah Valley': 'Utah Valley', 'Lock Haven': 'Lock Haven', 'Franklin & Marshall': 'Franklin & Marshall', 'LIU': 'Long Island University', 'American': 'American University'}


def school_list():
    src = open(os.path.join(ROOT, 'js', 'data', 'schools.js'), encoding='utf8').read()
    return re.findall(r"\['([^']+)', \d+\]", src)


def main():
    refresh = '--refresh' in sys.argv
    teams = {}
    for lg in LISTS:
        d = get(f'https://site.api.espn.com/apis/site/v2/sports/{lg}/teams?limit=1000')
        for t in d['sports'][0]['leagues'][0]['teams']:
            t = t['team']; teams.setdefault(norm(t['location']), t); teams.setdefault(norm(t['displayName']), t)
    ids, miss = [], []
    for name in school_list():
        sid = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        t = teams.get(norm(ALIAS.get(name, name)))
        if not t:
            miss.append(name); continue
        f = os.path.join(OUT, sid + '.png')
        if refresh or not os.path.exists(f):
            url = f"https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/{t['id']}.png&h=96&w=96"
            try:
                b = get(url, binary=True)
                if len(b) < 200: raise ValueError('tiny response')
                open(f, 'wb').write(b); time.sleep(0.4)
            except Exception as e:
                print('  fail', name, t['id'], e); miss.append(name); continue
        ids.append(sid)
    open(os.path.join(ROOT, 'js', 'data', 'logos.js'), 'w', encoding='utf8').write(
        "// School logos (assets/logos/<school-id>.png), fetched by tools/fetch_logos.py. Logos are trademarks of their schools: fine for a private game.\n"
        "// FOR SHARING: set LOGOS_ENABLED false (initials badges are used instead).\n"
        "export const LOGOS_ENABLED = true;\n"
        f"export const LOGO_IDS = new Set({json.dumps(sorted(ids))});\n")
    print(f'{len(ids)} logos; missing: {miss}')


if __name__ == '__main__':
    main()
