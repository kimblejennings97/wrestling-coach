"""Merge WrestleStat starters (saved pages in WrestlerNames/) with official roster pages (tools/rosters.json) into js/data/realteams.js.
Run: py tools/build_realteams.py
Output per school: lines 'Name|weight|class(1-4)|ovr|S' (S = WrestleStat starter). Ratings are on the game's OVR scale:
 - starters: WrestleStat ELO -> percentile within the weight -> OVR (top ~18.8 .. bottom ~9)
 - backups: placed below the team's starter at that weight (older = closer), deterministic noise from the name."""
import glob, html, json, os, re, sys, unicodedata, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEIGHTS = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285]
ALIAS = {'Army West Point': 'Army', 'Pennsylvania': 'Penn'}
CLS_WS = {'FR': 1, 'SO': 2, 'JR': 3, 'SR': 4, 'GR': 4}


def strip_acc(s): return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def norm(name):
    n = strip_acc(name).lower().replace('.', '').replace("'", '').replace('’', '').replace('‘', '').replace('-', ' ')
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
    return ' '.join(n.split())


def lastfirst(name):
    t = norm(name).split()
    return (t[0], t[-1]) if t else ('', '')


def snap(w):
    best = min(WEIGHTS, key=lambda x: abs(x - w))
    return best if abs(best - w) <= 8 else None


def parse_weights(s):
    s = s.lower().replace('lbs.', ' ').replace('lbs', ' ')
    out = []
    for part in re.split(r'[/,&\s]+', s):
        if not part: continue
        if part in ('hwt', 'hvy', 'hw', 'heavyweight'): out.append(285); continue
        m = re.match(r'^(\d{3})(?:\.\d+)?$', part)
        if m:
            w = snap(int(m.group(1)))
            if w: out.append(w)
    return out


def parse_class(s):
    t = strip_acc(s).lower()
    if not t: return None
    if re.search(r'grad|5th|6th|\bgr\b|fifth|\bsr\b|senior|4th|fourth', t): return 4
    t = re.sub(r'redshirt|\br[- ]|\brs[- ]|\(r\)', ' ', t)
    if re.search(r'\bjr|junior|3rd|third', t): return 3
    if re.search(r'\bso\b|soph|2nd|second', t): return 2
    if re.search(r'\bfr|fresh|1st|first', t): return 1
    return None


def hometown(p):
    t, h = (p.get('town') or '').strip(), (p.get('hs') or '').strip()
    return (t + (' / ' + h if h else '')).replace('|', ' ').replace('`', "'")


def hnoise(name, spread):
    return ((zlib.crc32(name.encode()) % 1000) / 1000 - 0.5) * 2 * spread


def parse_ws():
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'WrestlerNames', '*lbs.html'))):
        wt = int(re.search(r'(\d+) lbs\.html', f).group(1))
        s = open(f, encoding='utf8', errors='replace').read()
        tb = s[s.index('<tbody>'):s.index('</tbody>')]
        for tr in re.findall(r'<tr>(.*?)</tr>', tb, re.S):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
            if len(tds) < 8: continue
            nm = html.unescape(re.sub(r'<[^>]+>', '', re.search(r'<span class="h2">(.*?)</span>', tds[2], re.S).group(1))).replace('\xa0', ' ')
            nm = nm.replace('Fffd', "'")
            nm = nm.replace('�', "'")
            last, _, first = nm.partition(',')
            team = html.unescape(re.sub(r'<[^>]+>', '', tds[3])).strip()
            team = re.sub(r'^#\d+\s+', '', team); team = ALIAS.get(team, team)
            cls = CLS_WS.get(re.sub(r'<[^>]+>', '', tds[4]).strip(), None)
            elo = float(re.sub(r'<[^>]+>', '', tds[7]).strip())
            out.setdefault(team, []).append(dict(name=(first.strip() + ' ' + last.strip()).strip(), wt=wt, cls=cls, elo=elo))
    return out


def elo_to_ovr(ws):
    """percentile of ELO within each weight -> OVR (piecewise linear)."""
    pts = [(0.0, 9.0), (0.5, 12.6), (0.8, 14.8), (0.98, 17.6), (1.0, 18.8)]
    def f(u):
        for (u0, v0), (u1, v1) in zip(pts, pts[1:]):
            if u <= u1: return v0 + (v1 - v0) * (u - u0) / (u1 - u0)
        return pts[-1][1]
    by = {}
    for team, ps in ws.items():
        for p in ps: by.setdefault(p['wt'], []).append(p)
    for wt, ps in by.items():
        ps.sort(key=lambda p: p['elo'])
        for i, p in enumerate(ps): p['ovr'] = round(f((i + 0.5) / len(ps)), 1)


def main():
    ws = parse_ws(); elo_to_ovr(ws)
    rosters = json.load(open(os.path.join(HERE, 'rosters.json'), encoding='utf8'))
    # WrestleStat team pages saved by hand (WrestlerNames/WrestleStat _ <Team> Wrestling Roster...html) fill schools with no official roster page
    sys.path.insert(0, HERE)
    import rosterparse
    for f in glob.glob(os.path.join(ROOT, 'WrestlerNames', '*Wrestling Roster*.html')):
        s = open(f, encoding='utf8', errors='replace').read()
        team = re.search(r'<title>WrestleStat \| (.*?) Wrestling Roster', s).group(1); team = ALIAS.get(team, team)
        if rosters.get(team, {}).get('players'): continue
        p = rosterparse._T(); p.feed(s)
        tb = next((t for t in p.tables if t and [c[1] for c in t[0]][:3] == ['Weight', 'Name', 'Class']), None)
        if not tb: print('  no roster table in', f); continue
        pl = []
        for r in tb[1:]:
            c = [x[1] for x in r]
            if len(c) < 3: continue
            nm = re.sub(r'^#\d+\s+', '', c[1]).replace('�', "'")
            last, _, first = nm.partition(',')
            pl.append(dict(name=(first.strip() + ' ' + last.strip()).strip(), wt=c[0], cls=c[2], town='', hs='', prev=''))
        rosters[team] = dict(url='wrestlestat-team-page', players=pl); print(f'  {team}: {len(pl)} players from WrestleStat team page')
    teams = {}
    stats = dict(starters=0, matched=0, roster_only=0, ws_only=0)
    for team, starters in ws.items():
        rp = [dict(p, wts=parse_weights(p['wt']), cls_n=parse_class(p['cls']), key=norm(p['name'])) for p in rosters.get(team, {}).get('players', [])]
        used = set(); entries = []
        for s in starters:
            stats['starters'] += 1
            lf = lastfirst(s['name']); hit = None
            for i, p in enumerate(rp):                       # 1) exact normalized name
                if i not in used and p['key'] == norm(s['name']): hit = i; break
            if hit is None:                                  # 2) same last name + same first initial, or last name at the same weight
                for i, p in enumerate(rp):
                    pl = lastfirst(p['name'])
                    if i not in used and pl[1] == lf[1] and (pl[0][:1] == lf[0][:1] or s['wt'] in p['wts']): hit = i; break
            if hit is not None:
                used.add(hit); stats['matched'] += 1
                p = rp[hit]; entries.append(dict(name=p['name'], wt=s['wt'], cls=s['cls'] or p['cls_n'] or 2, ovr=s['ovr'], S=1, hm=hometown(p)))
            else:
                stats['ws_only'] += 1; entries.append(dict(name=s['name'], wt=s['wt'], cls=s['cls'] or 2, ovr=s['ovr'], S=1))
        # backups: everyone on the roster page who is not a starter
        st_at = {e['wt']: e['ovr'] for e in entries}
        mean_st = sum(st_at.values()) / max(1, len(st_at))
        back = {}
        for i, p in enumerate(rp):
            if i in used or not p['wts']: continue
            back.setdefault(p['wts'][0], []).append(p)
        for wt, ps in back.items():
            ps.sort(key=lambda p: -(p['cls_n'] or 1))
            for k, p in enumerate(ps):
                top = st_at.get(wt, mean_st - 0.5)
                c = p['cls_n'] or 1
                ovr = top - (2.0 + 0.9 * k) - (0.9 if c == 1 else 0) + hnoise(p['name'], 0.6)
                entries.append(dict(name=p['name'], wt=wt, cls=c, ovr=round(max(7.0, min(top - 0.6, ovr)), 1), S=0, hm=hometown(p))); stats['roster_only'] += 1
        # cap 4 per weight (starter first, then best)
        keep = []
        for wt in WEIGHTS:
            g = sorted([e for e in entries if e['wt'] == wt], key=lambda e: (-e['S'], -e['ovr']))[:4]
            keep += g
        teams[team] = keep
    # schools in the roster data but not in WrestleStat (none expected) are skipped on purpose
    lines = ['// REAL team data merged from WrestleStat (starters + ratings) and official roster pages. Generated by tools/build_realteams.py -- do not edit by hand.',
             '// Per school: "Name|weight|class 1-4|ovr|S|hometown / high school" (S=1 WrestleStat starter). Names are real; set REAL_NAMES_ENABLED false (data/realtop.js) to anonymise.',
             'export const REAL_TEAMS = {']
    for team in sorted(teams):
        body = '\\n'.join(f"{e['name']}|{e['wt']}|{e['cls']}|{e['ovr']}|{e['S']}|{e.get('hm', '')}" for e in teams[team]).replace('`', "'")
        lines.append(f"  {json.dumps(team)}: `{body.replace(chr(92) + 'n', chr(10))}`,")
    lines.append('};')
    open(os.path.join(ROOT, 'js', 'data', 'realteams.js'), 'w', encoding='utf8').write('\n'.join(lines) + '\n')
    n_ro = sum(1 for t in teams if rosters.get(t, {}).get('players'))
    print(f"teams {len(teams)} (with roster pages {n_ro}); starters {stats['starters']}, matched to roster {stats['matched']}, WS-only {stats['ws_only']}, backups {stats['roster_only']}")
    sizes = sorted(len(v) for v in teams.values()); print('roster sizes min/median/max', sizes[0], sizes[len(sizes) // 2], sizes[-1])
    miss = [t for t in teams if not rosters.get(t, {}).get('players')]; print('teams with starters only (no roster page):', miss)
    # unmatched starters on teams that DO have a roster page (name mismatches worth a look)
    for team, starters in ws.items():
        if rosters.get(team, {}).get('players'):
            ents = {e['name'] for e in teams[team] if e['S']}
            rn = {norm(p['name']) for p in rosters[team]['players']}
            bad = [s['name'] for s in starters if norm(s['name']) not in rn]
            if bad: print('  name not on roster page:', team, bad)


if __name__ == '__main__':
    main()
