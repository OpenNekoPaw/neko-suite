## 1. Error Path Coverage

- [x] 1.1 Add `SessionPersistence` tests for store replacement and dispose warning behavior when store disposal rejects
- [x] 1.2 Add `SessionArtifactFacade` tests for restore rejection warnings and write rejection propagation
- [x] 1.3 Add `SessionArtifactFacade` tests for observed artifact sync queue failure and task projection queue failure recovery
- [x] 1.4 Add `FeedbackRuntimeBridge` test for control-plane stage transition persistence failure behavior
- [x] 1.5 Split `PromptRuntimeFacade` boundary tests into dedicated coverage for no executor, no system history message, and empty sections

## 2. Validation

- [x] 2.1 Run focused session collaborator tests
- [x] 2.2 Run related trace, provider isolation, tool isolation, and architecture guard tests
- [x] 2.3 Run `pnpm --dir packages/neko-agent run compile:extension`
- [x] 2.4 Run `pnpm check` and record unrelated repository baseline failures

Validation note: `pnpm check` currently fails in repository-level `knip` baseline
checks for pre-existing unused files/dependencies/exports and unlisted
dependencies; no reported item is introduced by this session collaborator test
change.
