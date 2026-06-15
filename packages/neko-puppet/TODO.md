# neko-puppet TODO

> Active puppet work only. Current implemented behavior should be read from the
> code, README, and package architecture docs; this file does not keep completed
> phase history.

## AI-Assisted Puppet Creation

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

## VTube Studio API Compatibility

**Goal**: WebSocket endpoint accepting VTS plugin protocol for external plugin interop

- [ ] New file: `host-http/src/routes/vtube_studio_api.rs` — VTS WebSocket protocol
- [ ] New file: `host-http/src/routes/vtube_studio_types.rs` — VTS message types
- [ ] Supported API subset:
  - `APIStateRequest` — connection status
  - `AuthenticationTokenRequest/Response` — plugin auth
  - `InputParameterListRequest` — parameter list
  - `InjectParameterDataRequest` — external parameter injection (core)
  - `ExpressionStateRequest/ActivationRequest` — expression control

## Other Enhancements

- [ ] 2D bilinear interpolation (dual-axis key form interpolation for complex parameter bindings)
- [ ] Real .moc3 model E2E testing (validate parser against production models)
- [ ] MOC3 texture loading via model3.json (base64 external PNG → ImageBitmap)
- [ ] Puppet export (MOC3 writer — currently read-only)
