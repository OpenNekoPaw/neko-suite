# neko-agent Settings Redesign — Design

**Date**: 2026-03-07
**Status**: Approved
**Target users**: Video creators (non-developers)

## Problem

The current `SettingsView` exposes developer-oriented concepts (MCP servers, Skills/Commands, ToolSkills) to video creators who only need to connect an AI service once and then get to work. The settings tab creates unnecessary cognitive overhead for this audience.

## Solution: Replace SettingsView with AccountBar + OnboardingFlow

Remove the Settings tab entirely. Replace the gear button in the Header with a lightweight `AccountBar` component. Show an `OnboardingFlow` overlay on first use to guide AI service connection.

## Auth Model

Two supported paths:

- **SSO login** — user authenticates via OAuth; API keys loaded automatically
- **Custom API Key** — user provides their own key for a supported provider

## Architecture Changes

### Deleted

| File / Feature | Reason |
|---|---|
| `SettingsView/index.tsx` | Replaced by AccountBar + OnboardingFlow |
| `SettingsView/ProviderSettings.tsx` | Complex multi-provider CRUD not needed |
| `SettingsView/MCPSettings.tsx` | MCP moved to file config |
| `SettingsView/SkillSettings.tsx` | Skills are already file-based |
| `SettingsView/SkillContentEditor.tsx` | Redundant with VSCode editor |
| `SettingsView/ModelSettings.tsx` | Unused (not in SUB_TABS) |
| `TabType = 'settings'` | No more settings tab |
| `SettingsSubTab` type | No sub-tabs |
| `onToggleSettings` in Header | Replaced by AccountBar interaction |
| MCP/Skill CRUD in `configBridge.ts` | MCP via `.neko/settings.json`; Skills read-only |

### Added

| Component | Location | Responsibility |
|---|---|---|
| `AccountBar` | `Header/AccountBar.tsx` | Replaces gear button; shows connection status + dropdown |
| `OnboardingFlow` | `OnboardingFlow/index.tsx` | First-run overlay for AI service connection |

### Unchanged

- `ConfigBridge` Provider operations (`updateProvider`, `validateApiKey`, `listProviderModels`)
- Skills/Hooks filesystem scanning (continues in background, no UI exposure)
- MCP runtime (configured via `.neko/settings.json`)

## Component Design

### AccountBar

Replaces the gear icon button in `Header`. Three visual states:

```
Not configured (warning):
  [!] Connect AI Service   ← click opens OnboardingFlow

SSO logged in:
  [Avatar] Studio ▾
    user@studio.com
    Pro · 12,400 tokens
    ───────────────
    Sign out

Custom key configured:
  [●] Claude ▾
    claude-sonnet-4-5
    ───────────────
    Change API Key
    Switch provider
```

Data source: existing `connectionStates` from `ConfigBridge` + new SSO session field in config state.

### OnboardingFlow

Full-screen overlay. Appears automatically when no AI service is configured. Dismissed on successful connection. Re-opened by "Change API Key" or "Sign out → reconnect" from AccountBar.

```
Step 0 — Choose method:
  [ SSO Login ]
  — or —
  Use a custom API Key

Path A (SSO):
  → Open browser for OAuth
  → Callback closes flow automatically
  → AccountBar updates to logged-in state

Path B (Custom Key):
  Step 1: Select provider
    ○ Claude (Anthropic)
    ○ GPT-4o (OpenAI)
    ○ Custom endpoint...

  Step 2: Enter key
    API Key: [________________]
    [ Test connection ]
    Pass → [ Get started ]  (closes flow)
    Fail → inline error, stay on step 2
```

## Data Flow

### Startup

```
Extension Host                         Webview
──────────────────────────────────────────────
ConfigBridge.buildConfigState()
  providers[]  (with/without apiKey)
  ssoSession   (new field: { user, plan, usage } | null)
→ postMessage('configStateWithStatus')
                                       → AccountBar renders correct state
                                       → OnboardingFlow shows if unconfigured
```

### Custom Key Setup

```
Webview → postMessage('updateProvider', { id, apiKey, type })
→ ConfigBridge → platform.config.setProvider()
→ postMessage('configChanged')
→ AccountBar updates to connected state
→ OnboardingFlow closes
```

### SSO Login

```
Webview → postMessage('ssoLogin')
→ Extension Host opens OAuth URL in browser
→ OAuth callback → Extension Host receives token
→ postMessage('ssoSessionChanged', { user, plan, usage })
→ AccountBar updates to logged-in state
→ OnboardingFlow closes
```

## MCP Developer Configuration

MCP servers are no longer configurable via UI. Developers use `.neko/settings.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  }
}
```

The existing `SettingsHookLoader` file-watching pattern is reused for MCP config.

## Impact Summary

| Metric | Before | After |
|---|---|---|
| SettingsView files | 6 | 0 |
| New component files | — | 2 |
| Lines deleted (est.) | — | ~600 |
| Lines added (est.) | — | ~200 |
| Concepts exposed to creators | Provider, MCP, Skills, Models | None (AccountBar only) |
