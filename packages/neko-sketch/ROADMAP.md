# neko-sketch Roadmap

This roadmap describes direction only. Active implementation work lives in
[TODO.md](./TODO.md); stable package boundaries live in
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Current Product Shape

neko-sketch is the 2D authoring surface for Neko Suite. It owns `.nks`
editing, WebGL2 painting, layer and selection workflows, vector editing,
filter and lighting effects, PSD import, and AI-assisted result application.

## Direction

| Area | Direction |
|------|-----------|
| Native `.nks` authoring | Keep `.nks` and `@neko/shared/nks` as the editing source of truth, with schema migration tests guarding format drift |
| PSD compatibility | Treat PSD as an import adapter; expose compatibility issues explicitly instead of pretending lossless round-trip support |
| AI-assisted editing | Keep AI operations cancellable, undo-aware, and grounded in layer/selection/palette/brush preset contracts |
| Vector and layout tools | Continue Bezier, perspective, pattern, stamp, and transform work without folding those concerns into the core brush engine |
| Cross-package handoff | Export through explicit contracts to Canvas, Cut, Assets, and Agent rather than package-level coupling |
| Shared UI adoption | Move reusable controls to `@neko/ui` while keeping sketch document state inside the sketch package |

## Documentation Policy

Do not add completion ledgers, historical phase notes, code samples, or stale ADR
links here. Keep active work in TODO and update this file only when the product
direction or package boundary changes.
