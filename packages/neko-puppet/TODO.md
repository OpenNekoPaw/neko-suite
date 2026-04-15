# neko-puppet TODO

> MOC3 (.moc3) support implementation status and remaining tasks.
> Full design: [docs/development/neko-puppet-moc3-support.md](../../docs/development/neko-puppet-moc3-support.md)
> License analysis: [docs/analysis/live2d-license-analysis-2026-04-13.md](../../docs/analysis/live2d-license-analysis-2026-04-13.md)

---

## Completed (2026-04-14)

- [x] **Phase 0**: Remove inox2d ghost dependency — RUSTSEC-2022-0081 resolved
- [x] **Phase 1**: MOC3 parser + loader + 1D key form interpolation (self-built, zero unsafe)
- [x] **Phase 2**: WarpDeformer (bilinear grid) + RotationDeformer (pivot rotation) + deformer systems
- [x] **Phase 3**: Expression (.exp3.json) + Motion (.motion3.json) + Physics (.physics3.json) + API layer
- [x] **Phase 4**: Extension .moc3 file type + webview drag-drop + i18n (en/zh-cn)
- [x] **Phase 5**: Face tracking enhancement (ParamBody/Breath/Cheek/EyeSmile + LIVE2D_PARAM_ALIASES)

**Stats**: 104 Rust unit tests, clippy zero warnings, pnpm build 29/29

---

## Remaining

### Phase 6: AI-Assisted Puppet Creation (3-4 days, Priority: Medium)

**Goal**: AI agent tools for MOC3 expression control + template import UI

- [ ] Add `PuppetListExpressions` tool to `agentCapabilityProvider.ts`
- [ ] Add `PuppetSetExpression` tool to `agentCapabilityProvider.ts`
- [ ] Register tools in `TOOL_NAMES` constants (`@neko/shared/types/tool-names.ts`)
- [ ] Template selection UI: add "Import .moc3 model" option in `puppetEditorProvider.ts`
- [ ] `NkpProjectData` add `expressions` / `activeExpression` fields

**Files**:
- `neko-puppet/extension/src/agentCapabilityProvider.ts`
- `neko-puppet/extension/src/editor/puppetEditorProvider.ts`
- `neko-types/src/types/puppet.ts`
- `neko-types/src/types/tool-names.ts`

### Phase 7: VTube Studio API Compatibility (4-5 days, Priority: Low)

**Goal**: WebSocket endpoint accepting VTS plugin protocol for external plugin interop

- [ ] New file: `host-http/src/routes/vtube_studio_api.rs` — VTS WebSocket protocol
- [ ] New file: `host-http/src/routes/vtube_studio_types.rs` — VTS message types
- [ ] Supported API subset:
  - `APIStateRequest` — connection status
  - `AuthenticationTokenRequest/Response` — plugin auth
  - `InputParameterListRequest` — parameter list
  - `InjectParameterDataRequest` — external parameter injection (core)
  - `ExpressionStateRequest/ActivationRequest` — expression control

### Other Enhancements

- [ ] 2D bilinear interpolation (dual-axis key form interpolation for complex parameter bindings)
- [ ] Real .moc3 model E2E testing (validate parser against production models)
- [ ] MOC3 texture loading via model3.json (base64 external PNG → ImageBitmap)
- [ ] Puppet export (MOC3 writer — currently read-only; INP format deprecated, legacy read-only retained)
