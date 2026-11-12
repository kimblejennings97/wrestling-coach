"""Build the folder you upload to Netlify (or any static host): `py tools/build_deploy.py` -> dist/
Only what the game needs: index.html, css/, js/ (minus the balance harness), assets/ (logos). Everything else in the project (WrestlerNames/, tools/,
test and diagnostic pages, CLAUDE.md) stays out, which turns a ~155 MB project folder into ~1 MB.
Options: --with-lab also ships lab.html (Match Lab). Then drag the `dist` folder onto https://app.netlify.com/drop (or run `netlify deploy --dir dist --prod`)."""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
with_lab = '--with-lab' in sys.argv

# Empty dist/ without deleting the folder itself (Windows refuses to delete a folder that another program, e.g. a local test server, is sitting in).
os.makedirs(DIST, exist_ok=True)
for name in os.listdir(DIST):
    path = os.path.join(DIST, name)
    try:
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
    except OSError as e:
        print('could not remove', path, '-', e)
for f in ['index.html', 'moves.html'] + (['lab.html'] if with_lab else []):
    shutil.copy2(os.path.join(ROOT, f), os.path.join(DIST, f))
shutil.copytree(os.path.join(ROOT, 'css'), os.path.join(DIST, 'css'), dirs_exist_ok=True)
shutil.copytree(os.path.join(ROOT, 'js'), os.path.join(DIST, 'js'), ignore=shutil.ignore_patterns('harness.js'), dirs_exist_ok=True)
shutil.copytree(os.path.join(ROOT, 'assets'), os.path.join(DIST, 'assets'), dirs_exist_ok=True)

# Browsers must re-check the game's HTML/JS/CSS on every load (a stale copy of one module next to new copies of the others blanks the page);
# the logo images can be cached for a day. Netlify reads this file when you drag-and-drop the folder.
with open(os.path.join(DIST, '_headers'), 'w', newline='\n') as h:
    h.write('/*\n  Cache-Control: no-cache\n\n/assets/*\n  Cache-Control: public, max-age=86400\n')

n = sum(len(fs) for _, _, fs in os.walk(DIST))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(DIST) for f in fs)
print(f'dist/ ready: {n} files, {size / 1e6:.2f} MB. Drag the dist folder onto https://app.netlify.com/drop')
