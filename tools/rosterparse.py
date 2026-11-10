"""Generic Sidearm-style roster table parser (stdlib only). Usage: parse_roster(html) -> list of dicts.
Finds the table whose header row has a Name column and a weight column, and maps Class / Hometown / High School / Previous School if present."""
import re
from html.parser import HTMLParser


class _T(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []   # each: list of rows; row = list of (is_header, text)
        self.stack = []
        self.row = None
        self.cell = None
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
        elif tag == 'table': self.stack.append([])
        elif tag == 'tr' and self.stack: self.row = []
        elif tag in ('td', 'th') and self.row is not None: self.cell = [tag == 'th', []]
        elif tag == 'br' and self.cell is not None: self.cell[1].append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1)
        elif tag in ('td', 'th') and self.cell is not None and self.row is not None:
            self.row.append((self.cell[0], re.sub(r'\s+', ' ', ' '.join(self.cell[1])).strip())); self.cell = None
        elif tag == 'tr' and self.row is not None and self.stack:
            self.stack[-1].append(self.row); self.row = None
        elif tag == 'table' and self.stack: self.tables.append(self.stack.pop())

    def handle_data(self, d):
        if self.cell is not None and not self.skip: self.cell[1].append(d)


def _col(headers, *names):
    for i, h in enumerate(headers):
        hl = h.lower().replace('.', '').strip()
        if any(hl == n or hl.startswith(n) for n in names): return i
    return None


def parse_roster(html):
    p = _T(); p.feed(html)
    best = []
    for tb in p.tables:
        hi = next((i for i, r in enumerate(tb) if any('name' in c[1].lower() and 'school' not in c[1].lower() for c in r) and any(re.match(r'(wt|weight|pos)', c[1].lower()) for c in r)), None)
        if hi is None: continue
        hdr = [c[1] for c in tb[hi]]
        ci = dict(name=next((i for i, h in enumerate(hdr) if 'name' in h.lower() and 'school' not in h.lower()), None), wt=_col(hdr, 'wt', 'weight', 'pos'), cls=_col(hdr, 'cl', 'class', 'year', 'yr', 'academic'), town=_col(hdr, 'hometown', 'home town'),
                  hs=_col(hdr, 'high school', 'highschool', 'hs'), prev=_col(hdr, 'previous school', 'prev'), ht=_col(hdr, 'ht', 'height'))
        out = []
        for r in tb[hi + 1:]:
            cells = [c[1] for c in r]
            # Sidearm tables sometimes carry a leading photo cell; align from the right if the row is longer than the header
            off = len(cells) - len(hdr)
            def g(k):
                i = ci.get(k)
                if i is None: return ''
                j = i + off if off > 0 else i
                return cells[j] if 0 <= j < len(cells) else ''
            nm = g('name')
            if not nm or nm.lower() in ('name', 'full name'): continue
            if ',' in nm and not re.search(r'(jr|sr|ii|iii|iv)\.?$', nm.lower()):
                last, first = [x.strip() for x in nm.split(',', 1)]
                nm = (first + ' ' + last).strip()
            town, hs = g('town'), g('hs')
            if ' / ' in town and not hs: town, hs = [x.strip() for x in town.split(' / ', 1)]
            out.append(dict(name=nm, wt=g('wt'), cls=g('cls'), town=town, hs=hs, prev=g('prev')))
        if len(out) > len(best): best = out
    return best


if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        r = parse_roster(open(f, encoding='utf8', errors='replace').read())
        print(f, len(r)); [print('  ', x) for x in r[:4]]
