## Why

The project is still pre-release, but the new artifact protocols already expose `V1` suffixes in TypeScript exports, registry strings, Skill metadata, prompts, and ADR/OpenSpec text. Keeping those suffixes as public names makes the first protocol generation look permanently version-specific even though runtime compatibility is already carried by `schemaVersion` and `profileVersion`.

This change establishes unversioned public protocol names before the contracts become harder to rename.

## What Changes

- **BREAKING (pre-release)** Rename Neko-owned artifact/storyboard public protocol names from version-suffixed names to canonical unversioned names.
- Keep durable payload compatibility checks on explicit fields such as `schemaVersion` and `profileVersion`.
- Reserve `V1` / `V2` type suffixes for true side-by-side version support, migration code, or external APIs that already define versioned names.
- Update registry protocol ids, `domainKind` values, Skill validation requirements, built-in prompt guidance, transfer DTO names, validators, projectors, and docs to use canonical unversioned names.
- Do not add public compatibility aliases for the pre-release rename unless a temporary implementation bridge is needed inside a single package.

## Capabilities

### New Capabilities

- `protocol-public-naming`: Defines how shared Neko-owned protocols choose public names, how runtime versions are represented, and when version-suffixed types are allowed.

### Modified Capabilities

- `agent-storyboard-table-contract`: Rename the shared storyboard semantic contract from `StoryboardTableV1` public naming to `StoryboardTable` while preserving `schemaVersion: 1`.

## Impact

- Shared contracts: `packages/neko-types` artifact and storyboard protocol exports, constants, validators, normalizers, projectors, tests, and index exports.
- Agent contracts/runtime: artifact transfer DTOs, composite-content parsing, storyboard presentation, backfill payloads, capability registration, and injection metadata.
- Skills: built-in Skill metadata and Markdown prompts that currently request `CompositeArtifactV1`, `GenericTableV1`, or `StoryboardTableV1`.
- Capability/projector registry strings: protocol ids, validation requirement ids, domain payload ids, renderer/projector accepts/renders declarations.
- Docs/OpenSpec/ADR: active composite artifact proposal docs and architecture ADR wording should use unversioned public names and call out `schemaVersion` as the durable version discriminator.
