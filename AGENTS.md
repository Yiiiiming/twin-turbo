# Twin Turbo: route preservation

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
- The current London and Beijing work concerns buildings and scenery only.
  Improving architecture, views or scenery is not permission to move a road.
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
