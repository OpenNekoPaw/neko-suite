# @neko/markdown

`@neko/markdown` owns Neko Markdown extension syntax and pure projection contracts. It is intentionally host-agnostic: core exports must not import Agent, Canvas, VS Code, React, DOM, content services, or feature package internals.

## Scope

- Parse CommonMark/GFM-compatible source without rewriting the original Markdown.
- Project GFM creative tables, CommonMark image references, `@` mentions, Neko resource-reference tokens, semantic prompt spans, diagnostics, and stable handoff refs.
- Define resolver and renderer adapter contracts so callers can resolve entities, resources, files, Canvas nodes, documents, or prompt spans through their own domain services.
- Preserve unsupported syntax such as `![[...]]` / `[[...#...]]` with diagnostics until a caller enables resolver-backed semantics.

## Non-Goals

- It does not validate Canvas fields, profiles, nodes, connections, prompts, resources, or execution actions.
- It does not mutate Canvas, Agent state, project files, resource caches, or VS Code workspace state.
- It does not authorize resources or turn Webview URIs, blob URLs, cache paths, temp paths, display labels, table row order, or raw file names into durable identities.
- It does not choose Agent Skills, Canvas tools, lifecycle phases, or approval decisions.

## Boundary

```text
Markdown source
  -> @neko/markdown projection
  -> caller-provided resolvers/renderers
  -> host/domain-specific display or handoff metadata
  -> owning domain validates and mutates, if appropriate
```

Agent Webview may consume projections to render chips, thumbnails, diagnostics, prompt spans, and Canvas handoff metadata. Canvas remains the authority for Canvas field/profile validation and mutation. Agent remains the authority for deciding whether to query Canvas, activate a Skill, call a tool, ask for approval, or decline.

## Syntax Notes

| Syntax | Projection Meaning |
| --- | --- |
| GFM table | Creative table candidate with preserved headers/rows and optional unknown-column diagnostics |
| `@Rin` | Semantic mention token resolved only through caller-provided candidates |
| `![alt](P1#panel_2)` | CommonMark image target with lookup token `P1` and placement hint `panel_2` |
| `![[cover.png]]` | Neko resource-reference embed token; unsupported unless resolver-backed semantics are enabled |
| `[[script.md#Scene 2]]` | Neko resource/document link token; not automatically media |
| semantic prompt span metadata | Read-only display/handoff projection for prompt-first creative workflows |

Unknown columns, unresolved mentions, ambiguous refs, and unsupported resource-reference syntax must be preserved with diagnostics. They are hints for the owning domain, not successful validation.
