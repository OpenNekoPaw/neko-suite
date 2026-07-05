## Temporary Compatibility Shims

### File task storage legacy array reader

- Owner: Agent task storage (`packages/neko-agent/packages/agent/src/task/task-storage.ts`).
- Compatibility: `FileTaskStorage` can still read the previous top-level `SerializableTask[]` JSON file.
- Replacement path: new writes use `{ version, writeMetadata, tasks }` with owner/revision stale-write diagnostics.
- Validation: `pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/task/__tests__/task-storage.test.ts`.
- Removal condition: remove after prelaunch local task storage files have either been rewritten once by the new versioned writer or intentionally discarded.

### File task recovery legacy array reader

- Owner: Agent task recovery storage (`packages/neko-agent/packages/agent/src/task/task-recovery-storage.ts`).
- Compatibility: `FileTaskRecoveryStorage` can still read the previous top-level `TaskRecoveryInfo[]` JSON file.
- Replacement path: new writes use `{ version, writeMetadata, recovery }` with owner/revision stale-write diagnostics.
- Validation: `pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/task/__tests__/task-recovery-storage.test.ts`.
- Removal condition: remove after prelaunch recovery files have either been rewritten once by the new versioned writer or intentionally discarded.
