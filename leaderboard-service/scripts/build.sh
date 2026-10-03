#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$project_root/dist/server" "$project_root/dist/.openai" "$project_root/dist/drizzle"
cp "$project_root/.openai/hosting.json" "$project_root/dist/.openai/hosting.json"
cp -R "$project_root/drizzle/." "$project_root/dist/drizzle/"
node "$project_root/scripts/bundle.mjs"
