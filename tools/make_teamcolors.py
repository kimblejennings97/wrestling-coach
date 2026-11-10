"""Regenerates js/data/teamcolors.js from the logos: py tools/make_teamcolors.py  (needs the local server on :8765 and Edge)."""
import json, os, re, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
dom = subprocess.run([edge, '--headless=new', '--virtual-time-budget=60000', '--dump-dom', 'http://localhost:8765/tools/teamcolors.html'], capture_output=True, text=True).stdout
OVERRIDES = {'iowa': '#f2c33a', 'minnesota': '#f2b134'}   # grayscale / maroon logos that don't sample well
data = json.loads(re.search(r'<pre id="o">(\{.*?\})</pre>', dom, re.S).group(1))
data.update(OVERRIDES)
open(os.path.join(ROOT, 'js', 'data', 'teamcolors.js'), 'w', encoding='utf8').write(
    '// Team accent colours sampled from the logos by tools/make_teamcolors.py (lightened to read on the dark theme).\n'
    'export const TEAM_COLORS = ' + json.dumps(data, indent=1) + ';\n')
print(len(data), 'colours')
