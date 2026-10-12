# Twin Turbo

A compact arcade racer with twelve circuits. Choose Chinese or English, race the AI in one full-width view or a friend in split screen, and challenge up to two saved ghosts.

The opening selection is Shanghai Skyline Spiral, one lap, against the AI. Its fastest-lap leaderboard and ghost picker use the same Shanghai circuit.

At the finish, each human driver enters one nickname directly in the results panel to save the race, fastest lap and ghosts together. Failed saves can be retried there without leaving fullscreen.

[Play Twin Turbo](https://yiiiiming.github.io/twin-turbo/)

## Circuits and controls

The first six circuits are Shanghai Skyline Spiral, London Riverside, Rio Coastal Rhythm, Austin River Run, Beijing Imperial Run and Paris Seine Loop. Austin includes the UT Tower and a roadside football squad. Paris includes the Eiffel Tower, the Arc de Triomphe, the Louvre Pyramid, Haussmann boulevards and two Seine crossings on the gilded Pont Alexandre III and the stone-arch Pont Neuf. The original seven harbor, forest, city and spiral circuits follow the city courses.

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

This repository owns the game's source and publication. In Settings → Pages, use **Deploy from a branch**, **main**, **/docs**. The `docs/` directory contains the verified standalone web bundle and sky/scenery images and theatre poster artwork. Rebuild with `python3 build.py`, copy the contents of `dist/` into `docs/`, and commit both source changes and the refreshed publication.

The separate score service remains at `https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site`. Records and ghosts are keyed by their existing city/version/attempt identifiers, so moving the game URL does not reset them. Old and new Pages URLs share the same origin, preserving browser-local preferences.

The old large London prototype is retired. This main branch contains only the current compact game; the earlier prototype remains recoverable through Git history.

## Validation

The five-landmark extension passed 31 focused geometry, renderer and London driving checks. Both AI drivers finish one- and three-lap races without rescue; the original route fingerprint and previous four landmark placements remain exact. Every added building was inspected from both a detail camera and the real chase camera. The Globe's courtyard is open while its walls are solid. All five additions total 56,937 triangles, keeping the complete London scene below the existing 40 MB geometry budget (33.84 MB measured); the online bundle grows by about 17 KB and reuses all existing images.

The London landmarks / Paris leaderboard update passed 93 focused frontend checks, covering all twelve circuits' AI one- and three-lap completion, city selection, record isolation and the new landmark geometry. London's sampled route and elevation fingerprint is unchanged; the new buildings clear the driving corridor and chase camera. All four additions were visually checked in the browser in close-up and driving views. The shared record service passed 47 checks, and live read-only requests verified Paris race and ghost boards without inserting test scores.

The four city skies use an original generated cloud-only image; other circuits retain their existing scenery. Landmark design references include [UT Austin's Tower history](https://news.utexas.edu/2018/10/04/whats-the-story-behind-the-tower/), [Beijing's Temple of Heaven architecture](https://english.visitbeijing.com.cn/article/47ONy6AX0b3), [Austin's downtown guide](https://www.austintexas.org/explore/entertainment-districts/downtown/), and [Visit Brasil's Rio guide](https://www.visitbrasil.com/en/location/rio-de-janeiro-en/).

Shanghai is circuit **1**: twelve distinct landmarks, a 720° ascending spiral around the Oriental Pearl, a descending skyline run, Huangpu crossing and flowing Bund bends. It retains the same 240 km/h cruising scale and all existing one/three-lap, AI, local two-player, dual-ghost and independent leaderboard modes. The route is a compact architectural interpretation, not a geographic recreation.

London now adds eight further theatres: His Majesty’s, Theatre Royal Drury Lane, Lyceum, Sondheim, Apollo Victoria, Victoria Palace, Savoy and Prince Edward. Their individually designed show advertisements feature Phantom, Frozen, The Lion King, Les Misérables, Wicked, Hamilton, The Book of Mormon and The Play That Goes Wrong. The game programme is illustrative and does not assert current real-world theatre residencies.

Beijing gains a continuous rising and falling Great Wall ridge around the entire circuit, with 225 wall segments and 18 watchtowers. The original road layout and checkpoint timing remain unchanged.

## October 12 city expansion validation

338 frontend checks cover the thirteen circuits, score and ghost isolation, UI mode selection, geometry and driving. The shared record service passes 49 checks. New London theatre geometry stays within the existing 40 MB scene budget; Beijing measures 23.60 MB and Shanghai about 19.9 MB. Shanghai production AI completes one and three laps without rescue (53–56 second laps), with height-aware projection across the spiral decks and clear full-route car/chase-camera probes. All 20 new theatre/Shanghai models and the Beijing wall were inspected in the browser.


## October 12 staged scenery and ghost update

The default circuit is Shanghai, followed by London, Rio, Austin, Beijing and Paris. Each keeps one- and three-lap races, single-player AI or local split screen, and two independently colored ghosts. Shanghai and Austin display a NEW marker and use fresh lap/three-lap ghost versions; old replay rows and total scores remain in storage, but previous-version ghosts are not offered in the current challenge picker.

Ghost search offers the fastest 20 attempts per normalized nickname, circuit and race distance. Slower attempts are archived from the challenge list without deleting their historical rows. Total rankings and fastest-lap rankings still have five places each. A single nickname saves the race and both eligible replay types together; a replay outside the personal top 20 does not block saving the race result.

London’s Book of Mormon, The Play That Goes Wrong and The Lion King advertisements use real promotional key art from official theatre operators. Artwork is proportionally fitted, locally served and embedded in the offline edition; attribution and source URLs are in [assets/posters/README.md](assets/posters/README.md). Two upper belfry windows on St Paul’s use separated infill, frames and louvres to avoid nearly coplanar geometry flickering. London’s road layout is unchanged.

Austin includes a continuous Sixth Street district with The Driskill Bar, Maggie Mae’s, Blind Pig Pub, Casino El Camino and Shakespeare’s Pub. Paramount Theatre, Frost Bank Tower, Moody Center, Austin Central Library and ACL Live at The Moody Theater join the Capitol and UT Tower, bringing the total to 12 named real buildings. The roadside football scene shows 11 offensive and 11 defensive players, with the quarterback poised to throw. Its large scoreboard reads the real clock in America/Chicago (including daylight saving), updates each minute and displays “It's HH:MM and OU still sucks!”.

Shanghai now crosses a bounded Huangpu River and follows a 1,150-unit northwest-facing Bund avenue, with Customs House, HSBC and Peace Hotel on the Puxi side. The Oriental Pearl remains visible across the in-scene river from the normal driving camera for several seconds. The start and 720° spiral remain; the revised route is 19,897.45 units. Two banks, a granite promenade, benches, lamps, planters and a ferry replace the open sea.

Final combined release validation: all 364 frontend checks and 51 backend checks passed. Visual review covered the three official theatre posters, the Bund from the normal chase camera, Sixth Street, the new Austin buildings, the 22-player formation and the real-time scoreboard from both the approach road and close-up views. Austin’s route fingerprint is unchanged; Shanghai is the only revised circuit geometry in this update.

## 2026-10-12: Extended Bund and circuit retirement

Shanghai now has a 3,000-unit continuous Bund straight, six Pudong skyline groups and fifteen detailed named landmarks, with extra architecture on both sides of the last sector. The Pearl 720-degree spiral is unchanged. Shanghai ghost paths use v3; older paths are not offered. Lighthouse Grand Prix has been removed from the game and all score/ghost categories. Its source definition is recoverable in macOS Trash and its online records were moved atomically to the private database recycle bin. All remaining routes are frozen unless the owner explicitly authorizes a specific change.
