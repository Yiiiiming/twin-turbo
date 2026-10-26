# Twin Turbo: route preservation

## Temporarily hidden six maps, 2026-10-24

The user asked to hide the last six maps while deciding how to use them, and explicitly said not to delete them. Future references to “隐藏的六个地图” mean exactly:

- `coast` — 海岸技术环线
- `coast-bay` — 碧湾追风
- `coast-pines` — 松岚曲径
- `coast-neon` — 霓虹疾驰
- `coast-marina` — 帆港绕行
- `coast-ridge` — 云脊双螺旋

Hide these from player-facing map choices, including the home screen and leaderboard selector. Preserve their routes, scenery, resources, saved records, ghost namespaces and all twelve-map regression coverage. Do not delete or repurpose them without a new user request. The six visible maps remain London, Beijing, Shanghai, Rio, Austin and Paris, in that order.

## Automatic city palettes, 2026-10-24

Selecting a map on the home screen changes the whole page, landmark hologram, pointer rings and entry animation to its palette, then carries it into the ordinary holographic scenery and roads. London and Paris use purple, Beijing red, Austin UT burnt orange, Rio emerald green, and Shanghai ice blue with silver gray. Real in-world landmarks retain their original colors; player and ghost identity colors remain separate. This replaces the earlier idea of a manual settings color picker.

## Main-version publishing preference, 2026-10-23

The user explicitly authorized publishing the main game and said “正常就直接在主版本发布就可以了”. After validating ordinary requested main-game changes, publish them to the existing `yiiiiming/twin-turbo` GitHub Pages site without asking again. The separately created London Beta was rejected and abandoned; do not merge or publish it. This preference does not authorize unrequested route changes, unrelated uploads or repository visibility changes.

## User instruction, 2026-10-12

The user has frozen **every existing map's racing route** after the accepted
Shanghai and Austin updates. Do not alter a route without a new, explicit user
request authorizing route changes for that specific map.

- Preserve the centerline, turns, curve radii, distances, road width, elevation,
  slopes, bridge decks, start/finish position, staggered starting grid and
  checkpoint layout. Changes to shared geometry or interpolation code count as
  route changes if any existing map's driving surface changes.
- The Shanghai long-Bund and Austin route permissions have been used and are now
  closed. They do not authorize further adjustments to those courses.
- London scenery and architecture work does not authorize a route change.
  Beijing has the specific, consumed stadium exception recorded below.
  Other architecture or scenery work is not permission to move a road.
- Lighthouse Grand Prix (`coast-grand`, 灯塔大奖赛) was explicitly deleted by the
  user. Its retirement is the authorized catalog exception, not permission to
  delete or redesign any other course.
- Names, menu order, landmark models, vegetation, lighting and materials may be
  updated within the user's task while preserving the driving course and safe
  driving/camera clearance. A new, separately authorized map may have a new route.

## Locked regression baseline

`tests/fixtures/route-locks.json` records the 12 accepted courses. The route-lock
test checks both geometry and actual sampled driving/elevation output. It also
pins the fixture's checksum separately, so changing the fixture alone cannot
silently erase the protection. Tests are read-only and provide no automatic
snapshot-update switch.

**Never regenerate a route baseline, change its pinned checksum, weaken/skip the
test, reduce its covered fields or precision, or relabel an existing course just
to make a route-change failure pass.** Restore the accidental route change.

Only after the user explicitly authorizes a particular map's route change may
that map's baseline be updated. Record the exact authorization and map in the
fixture's authorization history, update only the authorized map entry, verify
every other entry stays unchanged, and include the baseline and checksum changes
in the reviewable diff. Run the route-lock test, that map's geometry/clearance
tests, and production AI tests for 1- and 3-lap races. Coordinate the record/ghost
version when a changed route invalidates previous runs. Catalog additions or
removals require the corresponding explicit user request as well.

## Beijing stadium authorization implemented, 2026-10-20

The user explicitly requested “给北京能不能加一个项目 就是能开进鸟巢里面 绕着里面的跑道跑一圈再出来继续” and confirmed “必经路段：进场绕一圈再出来”. Only Beijing's local stadium bend was replaced with a mandatory drive-through oval, raised entrance and separate ground exit. Its new route baseline is now frozen; this permission does not authorize further route edits. All eleven other courses retain their previous exact hashes. The pre-stadium Beijing base remains the reference for existing city plots. New Beijing total-record and ghost namespaces keep the longer course separate from old records.

## Single-player grid authorization implemented, 2026-10-22

The user explicitly requested “单人比赛在中间起步就可以了”. A one-car race now starts at lateral lane 0 for both colors, and its pre-line recovery returns there. The longitudinal grid station, local two-player slots, driving surface, finish line and checkpoints remain unchanged. This narrow exception does not authorize any other route or grid changes.

## Repository organization, 2026-10-24

The user requested GitHub cleanup, explicit current-versus-archive labels and grouping loose files. Current JavaScript/CSS lives in `src/`; development `index.html` stays at the root. `docs/` is the GitHub Pages publication, not prose documentation. Current explanatory docs live in `documentation/`; old notes and fixed-commit history pointers live in `archive/`. Never classify currently imported city batches or the six temporarily hidden maps as retired just because of their filenames. Local `work/`, generated offline HTML and logs are not release inputs.

## Austin split timing authorization implemented, 2026-10-24

The user asked “austin的有一个checkpoint的右边的排名挡住ou still sucks了 把哪个checkpoint挪走”. Austin's first visible split timing gate and player/ghost split measurement now use existing progress gate 30/68 rather than 25%, after the scoreboard view. The physical road, all 68 racing progression checkpoints, and the frozen route baseline remain identical. Only the three authorized Austin scenery hashes are updated in the hologram scene fixture, with the exact request recorded there.

## Fullscreen and background verification, 2026-10-26

The user reported that verification repeatedly pulled their computer into the game while they were using other applications, and asked to stop it. Do not trigger real fullscreen or bring the game/browser to the foreground during background verification. Use deterministic browser/DOM mocks for native fullscreen transitions; do not run automated launch/resume clicks that request fullscreen on the user's desktop. Open any inspection-only tabs in the background.

The game no longer requests fullscreen on page load, refresh, language choice, map selection or a generic first gesture. Only the user's explicit race launch, resume button or fullscreen button may request it. Pausing and finishing exit fullscreen; resuming gives a full 3–2–1 countdown while the race stays frozen.
