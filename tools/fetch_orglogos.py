"""Download conference / NCAA logos (personal-use project) into assets/logos/org/<key>.png for the bout viewer's mat centre.
Run: py tools/fetch_orglogos.py   (cached: re-run only fetches missing files; --refresh re-downloads)
EIWA and Independent have no logo source: the viewer draws a text badge for them (js/data/venues.js).
NOTE: logos are trademarks. Fine for a private game; LOGOS_ENABLED=false (js/data/logos.js) turns them off before sharing."""
import os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'logos', 'org'); os.makedirs(OUT, exist_ok=True)
UA = 'wrestling-coach-personal-project'
SRC = {
    'ncaa': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NCAA_logo.svg/330px-NCAA_logo.svg.png',
    'big-ten': 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_ten.png',
    'big-12': 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/big_12.png',
    'acc': 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/acc.png',
    'mac': 'https://a.espncdn.com/i/teamlogos/ncaa_conf/500/mac.png',
}


def main():
    refresh = '--refresh' in sys.argv
    for key, url in SRC.items():
        dst = os.path.join(OUT, key + '.png')
        if os.path.exists(dst) and not refresh: print('cached', key); continue
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=40) as r: b = r.read()
        open(dst, 'wb').write(b); print('saved', key, len(b))


if __name__ == '__main__':
    main()
