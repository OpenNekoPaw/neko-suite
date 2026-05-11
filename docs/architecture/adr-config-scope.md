# ADR: Configuration Scope Design

## Status: Accepted

## Context

neko-agent needs to manage configuration at two levels:
- **User level** (`~/.neko/config.json`): personal settings shared across all projects
- **Workspace level** (`neko/config.json`): project-specific settings

The question is: which configuration types should be workspace-scoped?

## Decision

### Scope Assignment

| Config Type | Scope | Rationale |
|---|---|---|
| Providers | User only | API keys are personal credentials, not project-specific |
| Models | User only | Model availability depends on provider API keys |
| MCP Servers | User + Workspace | Projects need project-specific tools (e.g., filesystem with `${workspaceFolder}`) |
| Scalars (temperature, maxTokens, defaultModel) | User only | Personal preferences |

### MCP Merge Strategy

Workspace MCP servers merge with user MCP servers by `id`:
- Same id → workspace replaces user entry entirely
- New id → appended to the list
- `mcpServerOverrides` → field-level patch on existing entries

### Industry Alignment

| Tool | Provider/Model scope | MCP scope |
|---|---|---|
| Claude Code | User only (env var) | User + Project (independent lists) |
| Cursor | User only (UI) | Global + Project (merged) |
| VSCode | User only (settings) | N/A |
| **neko-agent** | **User only** | **User + Workspace (merged by id)** |

## Future: Temperature & Permissions

### Temperature / MaxTokens

Currently user-level scalars in `~/.neko/config.json`. If workspace-level override is needed later:

```jsonc
// neko/config.json (workspace)
{
  "temperature": 0.3,      // override for this project
  "maxTokens": 16384
}
```

Implementation: read workspace scalars in `ensureMerged()`, apply `workspace.temperature ?? user.temperature`. Low priority — no current demand.

### Permissions (Future)

Not yet implemented. When needed, follow Claude Code's model:

```jsonc
// ~/.neko/config.json (user)
{
  "permissions": {
    "allow": ["mcp__github__*", "shell:read"],
    "deny": []
  }
}

// neko/config.json (workspace)
{
  "permissions": {
    "allow": ["mcp__filesystem__*"],
    "deny": ["shell:write"]
  }
}
```

Merge strategy: **additive allow, union deny** (learning from Claude Code issue #21851 where override-based permissions caused user frustration).

```
effective.allow = user.allow ∪ workspace.allow
effective.deny  = user.deny  ∪ workspace.deny
deny takes precedence over allow
```

## Consequences

- Workspace `neko/config.json` is minimal (MCP only), safe to commit to git
- No risk of API key leakage through workspace config
- Users manage providers/models in one place (`~/.neko/config.json`)
- Projects can define project-specific MCP servers with `${workspaceFolder}` paths
