# Twin Turbo shared leaderboard service

Durable D1 leaderboard API for the GitHub Pages game. Public nicknames, race times and race categories are stored after an explicit player submission. Three-lap and five-lap rankings are separate; AI scores are excluded. Equal times retain the earlier record. Atomic qualification and idempotent IDs handle retries and concurrent entries. No game source credentials are sent to browsers.

The browser reports completed times; this casual leaderboard does not claim authoritative server-side replay verification. Impossible durations, unsupported modes and invalid entries are rejected. CORS permits the game origin and local/offline development. A transient per-isolate write limit limits accidental spam.

`pnpm db:generate` generates schema-only migrations. `pnpm build` creates the Worker bundle and includes D1 migrations. `pnpm test` exercises the production handler against real in-memory SQLite.
