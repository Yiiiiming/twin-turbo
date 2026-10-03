#!/usr/bin/env python3
"""Create a self-contained, offline, double-clickable edition of Twin Turbo."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
html = (ROOT / 'index.html').read_text()
css = (ROOT / 'style.css').read_text()
engine = re.sub(r'^export ', '', (ROOT / 'engine.js').read_text(), flags=re.MULTILINE)
game = re.sub(r'^import .*?;\n', '', (ROOT / 'main.js').read_text(), count=1)
script = (engine + '\n\n' + game).replace('</script', '<\\/script')
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script type="module" src="./main.js"></script>', '<script type="module">\n' + script + '\n</script>')
html = html.replace('href="./" aria-label="Twin Turbo 首页"', 'href="#" aria-label="Twin Turbo 首页"')
destination = ROOT / 'Twin Turbo.html'
destination.write_text(html)
print(f'Built: {destination.name} ({destination.stat().st_size:,} bytes)')
