# Twin Turbo

A compact split-screen arcade racer with eleven circuits. Choose Chinese or English, race the AI or a friend, and challenge up to two saved ghosts.

[Play Twin Turbo](https://yiiiiming.github.io/twin-turbo/)

## Circuits and controls

The first four circuits are Austin River Run, Beijing Imperial Run, London Riverside and Rio Coastal Rhythm. Austin includes the UT Tower and a roadside football squad. The original seven harbor, forest, city and spiral circuits remain available.

Every circuit supports one-lap sprints and three-lap races, AI/local play, two ghost colors, checkpoint gaps, and independent top-five total and lap records. AI races accept either keyboard layout; custom bindings, language and nicknames are stored in this browser. Flat-road cruising is 240 km/h, with uphill slowing and downhill gains.

## Local development

Install Node.js and Python 3, then run:

```sh
npm install
npm test
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Run `python3 build.py` to build `dist/` and the self-contained `Twin Turbo.html` offline edition.

## GitHub Pages

This repository owns the game's source and publication. In Settings → Pages, use **Deploy from a branch**, **main**, **/docs**. The `docs/` directory contains the verified standalone web bundle and four sky/scenery images. Rebuild with `python3 build.py`, copy the contents of `dist/` into `docs/`, and commit both source changes and the refreshed publication.

The separate score service remains at `https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site`. Records and ghosts are keyed by their existing city/version/attempt identifiers, so moving the game URL does not reset them. Old and new Pages URLs share the same origin, preserving browser-local preferences.

The old large London prototype is retired. This main branch contains only the current compact game; the earlier prototype remains recoverable through Git history.

## Validation

The city release passed 303 frontend checks, including both AI drivers completing one- and three-lap races on every circuit, quarter splits, mesh and camera clearances, language/setup flows, record isolation and matching ghosts. The shared record service passed 45 checks. Browser screenshot acceptance was unavailable during this release.

The four city skies use an original generated cloud-only image; other circuits retain their existing scenery. Landmark design references include [UT Austin's Tower history](https://news.utexas.edu/2018/10/04/whats-the-story-behind-the-tower/), [Beijing's Temple of Heaven architecture](https://english.visitbeijing.com.cn/article/47ONy6AX0b3), [Austin's downtown guide](https://www.austintexas.org/explore/entertainment-districts/downtown/), and [Visit Brasil's Rio guide](https://www.visitbrasil.com/en/location/rio-de-janeiro-en/).
