## Validation Notes

## Commands Passed

- `./node_modules/.bin/tsc -p packages/neko-markdown/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc -p packages/neko-ui/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc -p packages/neko-canvas/packages/webview/tsconfig.json --noEmit`
- `cd packages/neko-ui && ../../node_modules/.bin/vitest run --config vitest.config.ts src/markdown/markdown.test.tsx src/__tests__/boundary.test.ts src/__tests__/public-entrypoints.test.ts`
- `cd packages/neko-canvas/packages/webview && ../../../../node_modules/.bin/vitest run src/components/panels/ContentOverlay.test.tsx src/components/content/NodeContentDispatcher.test.ts`
- `cd packages/neko-agent/packages/webview && ../../../../node_modules/.bin/vitest run src/host-runtime-boundary.test.ts`

## Commands Attempted But Blocked By Environment

- `pnpm --filter @neko/ui check`
- `pnpm --filter @neko/ui test`

Both commands reached pnpm's dependency-status/install guard before running the
package scripts and failed with `ERR_PNPM_IGNORED_BUILDS` for ignored build
scripts such as `esbuild`, `sharp`, `keytar`, `tesseract.js`, and
`@fission-ai/openspec`. The direct `tsc` and focused `vitest` commands above
were used as equivalent package-level validation for this change.

## Boundary Evidence

- `rg "@neko/ui/markdown" packages/neko-agent packages/neko-canvas packages/neko-ui packages/neko-markdown`
  found only the Canvas Webview adapter imports.
- Agent Header, InputArea, selectors, and SendToMenu have no
  `@neko/ui/markdown` imports.
- `packages/neko-ui/src/markdown` imports React, `@neko/markdown`, keyboard, and
  local UI utilities only.

## Deferred Runtime Smoke

VS Code Extension Development Host smoke for the Canvas prompt editing path is
deferred in this implementation slice because no Extension Development Host
runtime is active for this thread, and pnpm's install guard is currently blocking
script-based setup. Residual risk: jsdom validates the component contract,
keyboard metadata, textarea updates, and token rendering, but it does not prove
actual VS Code Webview CSP, focus choreography, or textarea/highlight visual
alignment.
