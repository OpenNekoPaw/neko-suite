## Context

Media generation produces a durable generated-output file plus a `GeneratedAssetIndex` record used for reload, projection, digest/revision tracking, lineage, and resource resolution. That generated lifecycle record is not an `AssetEntity` in the AssetLibrary. The Agent task-result normalizer currently infers `kind: 'asset'` from every item in an `assets` presentation collection and also emits `kind: 'resource'` when the same item contains a `ResourceRef`. The follow-up prompt therefore advertises a generated-output id as an asset even though `GetAsset` correctly queries only `NekoAssetsAPI.getAllEntities()`.

The change crosses Agent task normalization, media task projection, Extension delivery, AssetLibrary capability validation, and real TUI Evaluation. It does not change generated file persistence or AssetLibrary storage.

## Goals / Non-Goals

**Goals:**

- Make Agent result-reference identity explicit and unambiguous.
- Preserve generated-output preview, `ReadImage`, perception, reload, lineage, and async continuation behavior through `ResourceRef`.
- Keep AssetLibrary membership explicit and make pre-promotion `GetAsset` failure visible.
- Prove the canonical resource route and forbidden asset route with deterministic tests and focused real TUI Evaluation.

**Non-Goals:**

- Rename every existing `GeneratedAsset` or presentation `assets` type in this change.
- Merge `GeneratedAssetIndex` with AssetLibrary or add an AssetLibrary fallback to generated-output lookup.
- Delete generated files, generated-output index records, or historical conversations.
- Add a new Webview flow, project format, Engine contract, Protobuf message, or resource-cache owner.

## Decisions

### 1. Result-reference identity is declared, not inferred from collection names

`AgentTaskResultRefKind` remains the existing `resource | artifact | asset | url` union. A generated output already has the correct `ResourceRef`; a new `generated-output` ref kind would duplicate the resource-access contract without adding a resolver.

The task-result normalizer will apply these rules:

- typed `resultRefs` with `kind: 'asset'`, `assetId`, and `assetIds` are explicit AssetLibrary identities;
- entries in the generic/presentation `assets` collection do not become asset refs merely because they contain `id`;
- an entry containing a valid `resourceRef` is projected only as `kind: 'resource'`;
- path-only generated entries do not produce a stable result ref and remain rejected by the media projection boundary before observation recording.

Alternative rejected: infer both identities from the same object. It recreates the bug and makes routing depend on whichever tool the model chooses.

Alternative rejected: rename every media DTO immediately. `assets` is also a rendering/work-item term across current UI contracts. The semantic boundary can be corrected now without a broad unrelated UI migration; future naming cleanup remains independent.

### 2. GeneratedOutputIndex and AssetLibrary remain separate owners

The generated-output index owns generated file resolution, revision/digest, lineage, and reload. AssetLibrary owns `AssetEntity` facts and the `ListAssets`/`GetAsset` capability. `GetAsset` will not query or fall back to the generated-output index.

Explicit promotion/addition uses the existing ingest/import boundary. After that mutation returns an AssetLibrary entity id, later task/tool results may declare that id as `kind: 'asset'`.

Alternative rejected: make every generation completion create an AssetEntity. This would fill the user-curated library with transient iterations and conflate generation history with retained project assets.

### 3. Follow-up context advertises only usable capabilities

Generated image follow-up context will contain the stable resource reference and concrete `ReadImage.images[]` projection. It must not include an `asset: <generated-id>` line before promotion. AssetLibrary references remain available when an explicit asset id is present.

No prompt wording will compensate for an ambiguous runtime contract; the result-ref projection is corrected first, and prompt output follows that typed projection.

### 4. Compatibility is deliberately breaking at the internal observation boundary

Existing persisted observations that already contain both refs remain readable historical evidence. New terminal events stop writing the false asset ref. No dual-write or fallback is added. Generated files and generated index state are preserved; no user data migration is required.

### 5. Evaluation uses the real TUI owner path

The owning Evaluation suite will verify one generated-image path through the TUI: generation reaches terminal completion, the durable generated artifact/resource exists, follow-up resource access succeeds, and `GetAsset` does not participate before promotion. A boundary assertion will keep `GetAsset(generatedId)` fail-visible. Key-free validation does not count as real Agent acceptance; provider/model/runtime blockers will be recorded explicitly.

### 6. TUI content capabilities receive the canonical metadata store and generated-output lookup

Real TUI Evaluation showed that the task continuation carried the correct generated `ResourceRef`, but the `ReadImage` Tool was registered by `createTuiDefaultCapabilityProviders()` with a second `NodeContentAccessRuntime` that did not receive the SQLite-backed `ResourceCacheManifestStore`. The Platform/perception assembly already received the same store, so the duplicate omission failed only at Tool execution.

The TUI default capability factory will require `resourceCacheManifestStore` and the existing session-owned `GeneratedAssetIndex`. It passes the store to its content-access runtime and adapts the index's generated-output record into the existing `GeneratedAssetDerivativeResourceCacheProvider.resolveAsset` callback. `useAgentSession` will supply both dependencies after creating them from the same `TuiSqliteConversationStorageBinding`. Tests and other callers must pass explicit dependencies; the factory will not create a JSON manifest, in-memory fallback, second SQLite owner, direct-path fallback, or AssetLibrary lookup.

Alternative rejected: add the generated file path back to the Agent-visible lifecycle `ResourceRef`. Stable generated-output identity is deliberately pathless, and host-local resolution belongs to the generated-output index.

Alternative rejected: let generated resources bypass ResourceCache and read the path directly. That would hide the missing dependency and split generated/document content access behavior.

Alternative rejected: make the store optional and catch the error in `ReadImage`. The workspace storage layout requires the canonical metadata owner, and missing assembly dependencies must fail during testing rather than degrade at runtime.

### 7. Running task continuations retain their typed identity through the queue

The real TUI evidence showed that a task result could arrive while the preceding Agent turn was still being finalized. In that branch, `AgentTaskResultObservationRuntime` queued only continuation content and source even though the follow-up request already contained `taskId`, `observationId`, `runId`, and policy. The subsequent turn executed successfully, but runtime facts correctly diagnosed the continuation as identity-incomplete and could not link the completed task to its observation.

The running-Agent queue port will carry the same typed continuation metadata as the idle dispatcher, including the explicit task-result display kind. TUI and Extension hosts already use the shared Agent message queue contract, so they will preserve this metadata rather than parse identity from prompt text. Evaluation will reject the `task-continuation-identity-incomplete` diagnostic instead of accepting a result-only success.

Alternative rejected: suppress the diagnostic because `ReadImage` succeeded. That would hide a broken task-to-observation link and weaken recovery evidence.

Alternative rejected: recover task identity from continuation prompt text. Prompt prose is not a stable runtime contract and cannot replace typed queue metadata.

### 8. Extension content access resolves pathless generated resources through the canonical index

The Extension creates one workspace `GeneratedAssetIndex` from the conversation-owned ResourceCache metadata binding. That index must be created before `AgentContentAccessRuntime`, then adapted into `GeneratedAssetDerivativeResourceCacheProvider.resolveAsset`. `ReadImage` and Extension perception share this runtime, so both resolve the same pathless lifecycle `ResourceRef` without adding host paths back to Agent-visible identity.

TUI and Extension will use one host-neutral generated-resource resolver from Platform. The resolver accepts only `generated-asset` resource identity, looks up the existing generated-output record, and returns host-local path and media metadata to ResourceCache. It does not create an index, query AssetLibrary, or fall back to a direct path.

Alternative rejected: leave Extension on the provider's path-reading compatibility branch. Lifecycle refs deliberately omit paths, and the branch cannot resolve the canonical generated-output identity.

Alternative rejected: create the index after capability registration and mutate the runtime later. Content access dependencies are assembly-time contracts; late mutation would introduce order-sensitive partial initialization.

## Five-Layer Analysis

### Responsibility

Media Platform owns generation lifecycle and generated-output projection. Agent task/session owns durable observations, typed continuation identity, and follow-up context. Content access owns `ResourceRef` resolution. AssetLibrary owns `AssetEntity` membership and asset tools. Evaluation owns acceptance scenarios and reports.

TUI session bootstrap and Extension activation each own creation and lifetime of their existing user-level SQLite metadata binding and `GeneratedAssetIndex`; content capabilities borrow the manifest-store adapter and index lookup and do not create or dispose a parallel store.

### Dependency

The resolver stays host-neutral in Platform and reuses `@neko/shared` `ResourceRef`/ResourceCache contracts. TUI and Extension adapt their existing index into that resolver and do not redefine identity. Webview, VSCode, Rust Engine, and AssetLibrary storage do not gain cross-package imports.

### Interface

The public distinction is expressed by existing discriminated refs. Asset identity must be explicit; generated presentation objects are not interpreted as AssetLibrary entities. Unknown or unsafe refs continue to fail visibly.

### Extension

Future generated media types reuse the same resource rule. Future tasks returning actual library entities declare `assetId`, `assetIds`, or typed asset result refs rather than relying on a collection name.

### Testing

Focused tests cover resource-only normalization, explicit AssetLibrary identity, follow-up prompt content, media observation projection, strict `GetAsset` failure, explicit import/promotion success, typed identity across the running-Agent continuation queue, and pathless Extension content access for both `ReadImage` and perception. Integration coverage proves Extension terminal delivery reaches the normalizer. TUI Evaluation proves real routing, linked task observation, terminal state, artifact evidence, and forbidden pre-promotion fallback. Extension Development Host acceptance verifies the installed Webview path uses the resolver without the missing-metadata diagnostic.

### Proportionality

No new service, registry, storage table, feature flag, retry, or compatibility adapter is added. Platform supplies one narrow adapter to the ResourceCache provider's existing resolver callback for both hosts, and the existing discriminated ref contract remains sufficient.

### Fail-Visible Behavior

Invalid `ResourceRef`, unsafe path identity, missing generated lifecycle identity, missing AssetLibrary entity, and forbidden fallback continue to produce explicit errors. The change does not return empty asset records or silently treat generated files as library membership.

## Risks / Trade-offs

- [Risk] A task producer may have relied on `assets[].id` implicitly becoming an AssetLibrary ref. -> Mitigation: require that producer to use `assetId`, `assetIds`, or typed `resultRefs`, and cover the explicit path in tests.
- [Risk] Historical observations still contain the old dual identity. -> Mitigation: preserve them as historical data; all new events use the corrected contract, and no migration rewrites conversation evidence.
- [Risk] Real TUI Evaluation may require provider credentials and incur model cost. -> Mitigation: run key-free validation first, then one focused case; record exact blockers and residual behavior risk if real execution is unavailable.
- [Risk] Multiple TUI content runtimes could drift if they receive different metadata adapters or generated-output lookups. -> Mitigation: require the same binding-owned store and session-owned generated-output index in default Tool capabilities and Platform/perception assembly, with an execution-level test through the ToolRegistry.
- [Risk] A result-only Evaluation could pass while continuation identity diagnostics remain. -> Mitigation: preserve typed identity through the running queue and add a hard gate that forbids the identity-incomplete diagnostic.
- [Risk] TUI and Extension generated-resource mapping could drift. -> Mitigation: use one Platform resolver contract and cover both host assemblies with path-level tests.

## Migration Plan

1. Add regression tests that fail while generated outputs still produce `kind: 'asset'`.
2. Remove implicit asset inference from presentation entries while preserving resource projection.
3. Verify Extension follow-up and Platform media observation paths.
4. Verify AssetLibrary strict failure and explicit import success.
5. Wire the binding-owned ResourceCache metadata store and session-owned generated-output index into TUI default content capabilities, then verify a pathless lifecycle `ResourceRef` through the real ToolRegistry assembly.
6. Preserve typed task-result continuation metadata through the running-Agent queue and reject identity-incomplete facts.
7. Update and run the focused TUI Evaluation case.
8. Build the Extension index before content access, inject the shared resolver, and validate both `ReadImage` and perception in the Extension Development Host.

Rollback reverts the result-ref normalization and tests only. It does not touch generated files, generated-output index state, AssetLibrary files, or project formats.

## Open Questions

None for this scope. A broader terminology migration from `GeneratedAsset` to `GeneratedOutput` can be proposed separately if it can update all UI and package contracts atomically.
