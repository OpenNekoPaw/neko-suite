#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if rg -n "^\s*use .*DataAccess|DataAccess::" "$ROOT_DIR/packages/host-api/src/controllers" --glob '*.rs'; then
  echo "host-api controllers must not import or reference runtime DataAccess" >&2
  exit 1
fi

if rg -n "^\s*use .*DataAccess|^\s*use .*bevy_ecs.*World|DataAccess::|bevy_ecs::world::World|bevy_ecs::prelude::World" \
  "$ROOT_DIR/packages/engine-kernel/src/services/impls/scene_renderer.rs"; then
  echo "SceneRenderer must consume snapshots and must not import live World or DataAccess" >&2
  exit 1
fi

echo "scene dual API guards passed"
