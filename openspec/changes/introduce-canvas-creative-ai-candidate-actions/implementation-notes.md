## Implementation Notes

### Validation

- `/opt/homebrew/bin/pnpm run compile:extension` in `packages/neko-canvas`
- `/opt/homebrew/bin/pnpm run compile:webview` in `packages/neko-canvas`
- `/opt/homebrew/bin/pnpm run compile:extension` in `packages/neko-agent`
- `/opt/homebrew/bin/pnpm exec tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json`
- `/opt/homebrew/bin/pnpm exec vitest run packages/neko-types/src/types/__tests__/creative-ai-invocation.test.ts packages/neko-types/src/types/__tests__/canvas-creative-ai-actions.test.ts packages/neko-canvas/packages/extension/src/__tests__/creativeAiCanvasAdapter.test.ts packages/neko-canvas/packages/webview/src/components/panels/ContentOverlay.test.tsx packages/neko-canvas/packages/webview/src/CanvasApp.layout.test.ts packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.test.tsx packages/neko-agent/packages/agent/src/runtime/__tests__/creative-ai-run-runtime.test.ts`
- `/opt/homebrew/bin/pnpm exec vitest run --config vitest.config.ts packages/extension/src/commands/__tests__/agentCoreCommands.test.ts` in `packages/neko-agent`
- `/opt/homebrew/bin/pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/creativeAiCanvasAdapter.test.ts`

### Residual Risk

- `packages/neko-canvas` full `typecheck` still reports existing moduleResolution and legacy implicit-any errors unrelated to this change; narrower Canvas extension/webview builds pass.
- VS Code Webview runtime smoke has not been run in this batch, so focus/CSP/postMessage behavior still needs runtime acceptance before archival.
- Agent now resolves provider/model capability before run creation, writes visible background session projections, emits run/workItem observations, and supports explicit judge workItems. Real provider quality still depends on the configured external APIs and media task executor.
- Legacy `GenerationPromptPanel` still uses `generateForNode` and `generationProgress`; Shot overlay AI buttons are poisoned at source-test level and use the new typed creative action path.
