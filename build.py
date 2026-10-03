#!/usr/bin/env python3
"""Bundle native modules for GitHub Pages and a self-contained offline edition."""
from pathlib import Path
import base64
import json
import re
import shutil

ROOT = Path(__file__).resolve().parent
html = (ROOT / 'index.html').read_text()
css = (ROOT / 'style.css').read_text()

def module_source(name):
    source = (ROOT / name).read_text()
    source = re.sub(r'^import .*?;\n', '', source, flags=re.MULTILINE)
    return re.sub(r'^export ', '', source, flags=re.MULTILINE)


engine_exports = 'RaceEngine, TRACK, trackPoint, projectTrack, mod'
leaderboard_exports = 'LEADERBOARD_VERSION, LEADERBOARD_LIMIT, normalizeName, normalizeEntries, qualifyingRank, insertRecord'
script = (
    'const Collisions = (() => {\n' + module_source('collisions.js')
    + '\nreturn {ObstacleWorld};\n})();\n'
    + 'const Engine = (({ObstacleWorld}) => {\n' + module_source('engine.js')
    + '\nreturn {' + engine_exports + '};\n})(Collisions);\n'
    + 'const Rendering = (({' + engine_exports + '}) => {\n'
    + module_source('renderer.js') + '\nreturn {RaceRenderer, sceneWeights};\n})(Engine);\n'
    + 'const AI = (({' + engine_exports + '}) => {\n'
    + module_source('ai.js') + '\nreturn {RaceAI};\n})(Engine);\n'
    + 'const Leaderboard = (() => {\n' + module_source('leaderboard.js')
    + '\nreturn {' + leaderboard_exports + '};\n})();\n'
    + 'const Online = (({' + leaderboard_exports + '}) => {\n'
    + module_source('leaderboard-client.js') + '\nreturn {LeaderboardClient};\n})(Leaderboard);\n'
    + '(({' + engine_exports + '}, {RaceRenderer, sceneWeights}, {RaceAI}, {LeaderboardClient}) => {\n'
    + module_source('main.js') + '\n})(Engine, Rendering, AI, Online);\n'
).replace('</script', '<\\/script')


def edition(styles, prelude=''):
    result = html.replace('<link rel="stylesheet" href="./style.css">', '<style>\n' + styles + '\n</style>')
    result = result.replace('<script type="module" src="./main.js"></script>', '<script>\n' + prelude + script + '\n</script>')
    return result.replace('href="./" aria-label="Twin Turbo 首页"', 'href="#" aria-label="Twin Turbo 首页"')


web_directory = ROOT / 'dist'
web_directory.mkdir(exist_ok=True)
(web_directory / 'assets').mkdir(exist_ok=True)
embedded = {}
offline_css = css
for name in ('coast', 'alpine', 'city'):
    asset = ROOT / 'assets' / f'{name}.png'
    shutil.copy2(asset, web_directory / 'assets' / asset.name)
    embedded[name] = 'data:image/png;base64,' + base64.b64encode(asset.read_bytes()).decode('ascii')
    offline_css = offline_css.replace(f"url('./assets/{name}.png')", f'var(--scene-{name})')

(web_directory / 'index.html').write_text(edition(css))
destination = ROOT / 'Twin Turbo.html'
prelude = 'globalThis.TWIN_SCENE_ART=' + json.dumps(embedded) + ';\n'
prelude += 'for(const [name,url] of Object.entries(TWIN_SCENE_ART)) document.documentElement.style.setProperty("--scene-"+name,`url("${url}")`);\n'
destination.write_text(edition(offline_css, prelude))
print(f'Built: {destination.name} ({destination.stat().st_size:,} bytes)')
print('Built: dist/index.html + dist/assets/ (GitHub Pages edition)')
