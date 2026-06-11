## 1. Shared Contracts

- [x] 1.1 Define serializable facade request/result DTOs for entity detail, resolve, candidates, confirm, bind, visual draft, rename, alias, metadata, and default binding operations.
- [x] 1.2 Add type guards for facade DTOs and invalid project/entity/candidate/asset refs.
- [x] 1.3 Add tests for DTO validation and unsafe request rejection.

## 2. Runtime And Command Registry

- [x] 2.1 Add a project-scoped entity runtime registry in `neko-entity` and migrate existing entity commands to use it.
- [x] 2.2 Register read/resolve/list/propose/confirm/bind/draft/update facade commands.
- [x] 2.3 Ensure command writes emit `CreativeEntityChangeEvent` through the shared runtime event bus.
- [x] 2.4 Add tests proving a write through one command is observed by a separate source/listener for the same project.

## 3. Quick Edit Commands

- [x] 3.1 Implement `renameEntity` command with duplicate-name validation and optional native InputBox wrapper.
- [x] 3.2 Implement `addAlias` / `removeAlias` commands with alias normalization and optional QuickPick wrapper.
- [x] 3.3 Implement bounded `updateMetadata` command for short appearance summary fields and reject unsupported complex edits.
- [x] 3.4 Implement `setDefaultBinding` command backed by existing binding service behavior.
- [x] 3.5 Add tests for successful edits, validation failures, unsupported complex edits, and event emission.

## 4. EntityBindingWidget Trigger Integration

- [x] 4.1 Define the trigger protocol and host context shape for creative tools.
- [x] 4.2 Add a minimal host adapter that maps widget trigger actions to facade commands.
- [x] 4.3 Document that Webviews and future overlays trigger commands only and do not own entity writes.

## 5. Validation

- [x] 5.1 Run focused `neko-types` tests for facade DTO guards.
- [x] 5.2 Run focused `neko-entity` tests for command handlers and runtime event sharing.
- [x] 5.3 Run `openspec validate --all`.
- [x] 5.4 Run `git diff --check`.
