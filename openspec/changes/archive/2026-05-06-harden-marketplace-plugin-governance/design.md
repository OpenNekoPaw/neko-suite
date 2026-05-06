## Context

`marketplace-plugin-governance.md` has become the authority for native engine plugin governance and cross-type sideload policy. It correctly defines `plugin` as a neko-engine native `cdylib`, not a VSCode extension or WASM module, and it correctly states that in-process native plugins have no portable runtime sandbox.

The remaining implementation risk is contract drift. The same governance decision is reflected across manifest schema, registry client contract, install runtime, management UI, and engine PluginManager behavior. If those surfaces interpret Workspace Trust, sideload paths, publisher verification, or plugin build APIs differently, a security rule can be bypassed even when each individual module looks reasonable.

Five-layer analysis:

- Responsibility: server owns publisher verification, final manifests, signing, entitlement, and plugin build artifacts; client owns display, installation orchestration, local records, and user prompts; engine owns final plugin loading, license checks, integrity/signature checks, host-api audit, and Workspace Trust activation gates.
- Dependencies: shared manifest types remain the contract layer; market-core stays Layer 0 and host-agnostic; VSCode extension owns auth and settings adapters; engine does not depend on React or marketplace webview code.
- Interfaces: changes concentrate in `AssetManifest` metadata, `AssetDistribution.publisher`, local install record/source shape, Registry API wrappers, Workspace Trust provider, and PluginManager load preflight.
- Extension: current design preserves in-process loading but leaves a future out-of-process plugin host as an explicit replacement path for syscall-level enforcement.
- Testing: scenarios must cover server-final manifest validation, local trust-store authority, sideload isolation, Developer Mode expiry, shader/model validation warnings, registry API request shapes, and UI disclosure states.

## Goals / Non-Goals

**Goals:**

- Make native plugin governance deterministic across documentation, OpenSpec requirements, and future implementation.
- Prevent project-supplied Workspace Trust files from becoming authoritative.
- Define local sideload storage and manifest semantics without absolute-path persistence by default.
- Keep plugin permission fields honest: disclosure, review, and host-api audit metadata, not sandbox controls.
- Align plugin build and publisher verification endpoints with Bearer-auth-scoped server authority.
- Make shader and model sideload permissive enough for creators while still validating format and resource risk before activation.

**Non-Goals:**

- No WASM runtime is introduced.
- No syscall-level sandbox or OS-specific process isolation is added in this change.
- No payment, Publisher Portal, or server build farm internals are implemented in this repository.
- No relaxation of existing TypeScript strictness, webview sandbox, or layer dependency rules.

## Decisions

### Decision 1: Workspace Trust is local-machine authority

Workspace Trust state will be stored in a Neko-owned local trust store keyed by a workspace fingerprint. Project files may contain provenance hints, but they MUST NOT mark a workspace trusted by themselves.

Rationale: a malicious starter, shared project, or downloaded archive can carry `.neko/workspace-trust.json`. Treating that file as authoritative lets the attacker choose the trust level. A local trust store matches the security property we need: trust is a user decision on this machine.

Alternative considered: keep per-project `.neko/workspace-trust.json` as the source of truth. Rejected because it is portable with the untrusted project.

### Decision 2: Local install defaults to copy-managed storage

Sideloaded reusable assets will default to copied storage under `${NEKO_HOME}/local/<type>/...`. External references require an explicit local-link source shape and uninstall only removes the record.

Rationale: copy-managed local installs make uninstall, backup, and migration deterministic and avoid persisting absolute paths in normal manifests. Some creator workflows still need external files, so local-link is allowed only as an explicit mode.

Alternative considered: always reference the original selected path. Rejected because uninstall semantics become ambiguous and absolute paths leak into persistent records.

### Decision 3: Plugin governance is a separate capability, while market capabilities enforce local boundaries

`market-plugin-governance` owns native plugin requirements. Existing market specs receive added requirements only for their boundaries: manifest shape, install/runtime gates, registry client calls, and UI surfaces.

Rationale: native plugin security should not be scattered as hidden target behavior. At the same time, install runtime and UI must still expose testable behavior at their boundary.

Alternative considered: put all requirements into `market-install-runtime`. Rejected because server publishing, manifest fields, UI disclosure, and engine audit do not belong solely to installation.

### Decision 4: Permission policy remains declarative, with explicit high-sensitive rules

`PluginPermission` continues to describe declared behavior for review and disclosure. The high-sensitive rules are made unambiguous: `process-spawn` is T1-only by default with documented T2 security-review exception if retained; `network:any` requires explicit review and warning; `system-info` returns coarse-grained values only.

Rationale: native code can bypass host APIs. The system must not imply enforcement it cannot provide.

Alternative considered: implement a permission-enforcing sandbox in PluginManager. Rejected for the current in-process architecture; future syscall enforcement requires out-of-process hosting.

### Decision 5: Registry client request identity is derived from auth, not request bodies

Plugin build and entitlement-related calls derive user identity from Bearer auth. Client request bodies include package/version/target/session data but not `userId`.

Rationale: user identity in request bodies is easy to spoof and already belongs to auth/session state.

Alternative considered: keep `userId` in plugin build body for explicit cache keys. Rejected at the client contract layer; server can still include authenticated user id in its internal cache key.

## Risks / Trade-offs

- Project trust migration can surprise existing users → provide a one-time migration that imports prior trusted entries only after user confirmation or trusted provenance.
- Copy-managed local installs duplicate large assets → allow explicit local-link mode and show link/delete semantics in UI.
- Shader/model validation can block experimental assets → surface diagnostics and allow trusted-workspace override for non-native assets only.
- T2 plugin publisher workflow becomes heavier → document community alternatives through skill, preset, shader, model, identity, starter, endpoint, provider, and bundle.
- Engine remains unable to stop native direct syscalls → keep UI and docs explicit that KYC, signing, audit, and revocation are deterrence and traceability controls, not sandboxing.

## Migration Plan

1. Update architecture docs and OpenSpec requirements to make the governance contract authoritative.
2. Add shared type/schema changes for plugin metadata, publisher verification, local source variants, and local install records.
3. Add market-core validation and install preflight gates behind existing middleware and target hooks.
4. Add extension/webview settings and UI surfaces for Developer Mode, Workspace Trust promotion, and local install warnings.
5. Add engine PluginManager gates for integrity, signature, license, trust, Workspace Trust, and host-api audit reporting.
6. Migrate existing project-local trust records into the local trust store only after explicit user confirmation; leave project files as hints.
7. Validate with `pnpm check`, focused market tests, and engine host-api tests; run broader `pnpm test` when implementation touches shared contracts.

## Open Questions

- Should T2 `process-spawn` be entirely forbidden or allowed only through an explicit security-review exception path?
- What exact fingerprint inputs define a stable workspace identity across moved folders without trusting project contents?
- Which shader validators are mandatory for P1: Naga only, SPIR-V Tools, or both depending on artifact form?
- Should local-link be available in P1 or deferred until copy-managed local installs are stable?
