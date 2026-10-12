# Twin Turbo

A compact arcade racer with twelve circuits. Choose Chinese or English, race the AI in one full-width view or a friend in split screen, and challenge up to two saved ghosts.

The opening selection is London Riverside, one lap, against the AI. Its fastest-lap leaderboard and ghost picker use the same London circuit.

At the finish, each human driver enters one nickname directly in the results panel to save the race, fastest lap and ghosts together. Failed saves can be retried there without leaving fullscreen.

[Play Twin Turbo](https://yiiiiming.github.io/twin-turbo/)

## Circuits and controls

The first five circuits are London Riverside, Rio Coastal Rhythm, Austin River Run, Beijing Imperial Run and Paris Seine Loop. Austin includes the UT Tower and a roadside football squad. Paris includes the Eiffel Tower, the Arc de Triomphe, the Louvre Pyramid, Haussmann boulevards and two Seine crossings on the gilded Pont Alexandre III and the stone-arch Pont Neuf. The original seven harbor, forest, city and spiral circuits follow the city courses.

London adds four detailed roadside landmarks along its existing route: the Royal Opera House and glazed Floral Hall, the red terracotta Palace Theatre, the classical London Palladium, and Piccadilly Circus with curved illuminated panels and the Shaftesbury Memorial Fountain. These are compact architectural interpretations for the game, not a geographically exact reconstruction; track geometry, checkpoints, elevation and physics are unchanged.

Five further landmarks fill distinct roadside plots: Buckingham Palace with its central balcony and ceremonial railings, Westminster Abbey with Gothic twin towers and tracery, the British Museum with its Ionic portico, St Paul's Cathedral with a layered dome and lantern, and Shakespeare's Globe with timber galleries around an open courtyard. The previous landmarks and original circuit remain in place. New buildings use native batched geometry and share existing materials and sky assets.

Architectural references: [Royal Opera House history](https://www.rbo.org.uk/about/history), [Floral Hall](https://www.rbo.org.uk/venue-hire), [Palace Theatre](https://historicengland.org.uk/listing/the-list/list-entry/1066339), [London Palladium](https://historicengland.org.uk/listing/the-list/list-entry/1210130), and [Shaftesbury Memorial Fountain](https://historicengland.org.uk/listing/the-list/list-entry/1265625).

Additional references: [Buckingham Palace's East Wing](https://www.rct.uk/visit/buckingham-palace/history-of-the-east-wing-of-buckingham-palace), [Westminster Abbey architecture](https://www.westminster-abbey.org/history/explore-our-history/architecture), [British Museum architecture](https://www.britishmuseum.org/about-us/british-museum-story/architecture), [St Paul's Cathedral](https://www.stpauls.co.uk/explore-our-map), and [Globe Theatre](https://www.shakespearesglobe.com/discover/about-us/globe-theatre/).

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

The five-landmark extension passed 31 focused geometry, renderer and London driving checks. Both AI drivers finish one- and three-lap races without rescue; the original route fingerprint and previous four landmark placements remain exact. Every added building was inspected from both a detail camera and the real chase camera. The Globe's courtyard is open while its walls are solid. All five additions total 56,937 triangles, keeping the complete London scene below the existing 40 MB geometry budget (33.84 MB measured); the online bundle grows by about 17 KB and reuses all existing images.

The London landmarks / Paris leaderboard update passed 93 focused frontend checks, covering all twelve circuits' AI one- and three-lap completion, city selection, record isolation and the new landmark geometry. London's sampled route and elevation fingerprint is unchanged; the new buildings clear the driving corridor and chase camera. All four additions were visually checked in the browser in close-up and driving views. The shared record service passed 47 checks, and live read-only requests verified Paris race and ghost boards without inserting test scores.

The four city skies use an original generated cloud-only image; other circuits retain their existing scenery. Landmark design references include [UT Austin's Tower history](https://news.utexas.edu/2018/10/04/whats-the-story-behind-the-tower/), [Beijing's Temple of Heaven architecture](https://english.visitbeijing.com.cn/article/47ONy6AX0b3), [Austin's downtown guide](https://www.austintexas.org/explore/entertainment-districts/downtown/), and [Visit Brasil's Rio guide](https://www.visitbrasil.com/en/location/rio-de-janeiro-en/).
