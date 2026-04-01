# Permission System Analysis for AI Creative Scenarios

> neko-agent permission architecture assessment: CLI security model vs creative production model

## 1. Core Difference: Two Fundamentally Different Risk Models

```
CLI Security Model (Claude Code):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Threat: AI executes Bash → may rm -rf / leak secrets / network attacks
  Concern: System safety → prevent AI from executing dangerous commands
  Decision: "Is this command safe?"

Creative Production Model (neko-agent):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Threat: AI calls creative APIs → costs money / wastes GPU time / outputs mismatch
  Concern: Cost + Quality → prevent AI from blindly consuming expensive resources
  Decision: "Is this operation worth doing?"
```

## 2. Six-Level Verification Adaptability

### Layer 1: AST Syntax Parsing (Tree-sitter) — Not Applicable 🔴

Creative tools are 95%+ **structured API calls** (TypeScript typed parameters), not free-text Bash commands. Tree-sitter Bash AST parsing has no value for structured calls like `engineClient.applyEffect({ type: 'subtitle' })`.

The only exception: neko-agent does have a Bash tool, but usage frequency is <5% in creative scenarios (mainly `pnpm build`, `git`). Full AST parsing for such low volume is poor ROI.

### Layer 2: Injection Detection (30+ Attack Patterns) — Not Applicable 🔴

Creative API parameters are **closed-space** (TypeScript interface constraints) — no concept of "pipe bypass" or "command concatenation".

The real injection risk in creative scenarios is **Prompt Injection** (malicious prompts to LLMs), which requires an LLM safety layer, not command injection detection. 30+ Bash attack patterns are irrelevant to calls like `engineClient.loadModel()`.

### Layer 3: User Rule Matching — Applicable, Needs Extended Dimensions 🟢

Already implemented in neko-agent (`PermissionRuleMatcher` + `tool-pattern-matcher.ts`).

But creative scenarios need **additional matching dimensions**:

```typescript
// CLI rules: based on command safety
deny: ["Bash(rm:*)"]
allow: ["Bash(git:*)"]

// Creative rules needed: based on cost and resources
deny: ["MediaGenerate(cost:>$5)"]         // Block single calls >$5
allow: ["MediaGenerate(provider:local)"]  // Allow local models (no API cost)
ask:  ["Export(duration:>60s)"]           // Exports >60s need confirmation
allow: ["Effect(category:preview)"]       // Preview effects auto-allowed
```

### Layer 4: Sandbox Auto-Allow — Concept Fits, Whitelist Needs Rebuild 🟡

The concept of "auto-allow harmless operations" is **highly applicable** to creative scenarios, but the definition of "harmless" is completely different:

```
CLI "harmless":                         Creative "harmless":
├─ Read (read files)                    ├─ Preview (preview render)
├─ Glob (search files)                  ├─ GetTimeline (get timeline state)
├─ Grep (search content)               ├─ GetSceneSnapshot (get scene snapshot)
└─ WebSearch (search web)               ├─ ListEffects (list available effects)
                                        ├─ GetAnimationClips (get animation clips)
                                        ├─ TickScene (scene preview refresh)
                                        └─ AdjustParameter (adjust params, reversible)
```

Current `DEFAULT_READ_ONLY_TOOLS` targets development tools, **lacks creative tool whitelist**.

### Layer 5: AI Classifier (BASH_CLASSIFIER) — Severely Mismatched 🔴

This is the **least compatible** layer:

| Dimension | Bash Classifier | Creative Scenario Needs |
|-----------|----------------|------------------------|
| **Training Data** | 1M+ Bash command history | Creative API call patterns (entirely different domain) |
| **Risk Model** | Is command dangerous? (safety) | Is operation worthwhile? (cost/quality/intent) |
| **Output** | 0-1 safety risk score | Multi-dimensional: cost, time, quality, reversibility |
| **Thresholds** | 0.95/0.5 split | No universal threshold — depends on user budget and creative stage |

What creative scenarios actually need is not a "safety classifier" but a **"cost-value evaluator"**:

```typescript
interface CreativeDecisionFactors {
  estimatedCost: number;           // Estimated API cost ($)
  estimatedTime: number;           // Estimated processing time (seconds)
  isReversible: boolean;           // Can be undone?
  isPreview: boolean;              // Preview only (not final output)?
  resourceType: 'local' | 'cloud'; // Local GPU vs cloud API
  creativeStage: 'explore' | 'refine' | 'final'; // Explore / Refine / Final output
}
```

### Layer 6: Context Decision — Concept Fits, Feature Space Completely Different 🟡

The **concept** of "context-aware decisions" is highly applicable, but the context signals are entirely different:

```
CLI context:                            Creative context:
├─ Session history (what was done)      ├─ Creative stage (draft/refine/delivery)
├─ User habits (which cmds approved)    ├─ Project budget balance (API quota left)
├─ Project type (frontend/backend)      ├─ Asset dependencies (render needs imported assets)
└─ Security risk tolerance              ├─ User preferences (style/quality/speed tradeoff)
                                        ├─ Workflow stage (current timeline state)
                                        └─ Export target (preview vs final delivery)
```

## 3. Permission Mode Analysis

### 3.1 plan Mode — Valuable, Needs Semantic Upgrade ⭐⭐⭐⭐

**Current implementation**: Read-only mode (16 read-only tools + plan file write).

**Creative value**: Creative workflows naturally split into **conceive → execute**. Plan mode maps to the "conceive" phase, but creative "conceiving" is more than reading files:

```
CLI plan:                              Creative plan:
━━━━━━━━                               ━━━━━━━━━━━━
Read code → Write proposal              Read assets → Try previews → Estimate costs → Write proposal

Tools needed:                           Tools needed:
├─ Read/Glob/Grep                      ├─ Read/Glob/Grep (same)
└─ Write(.neko/plan.md)                ├─ GetTimeline / GetSceneSnapshot (scene awareness)
                                       ├─ ListEffects / GetAnimationClips (capability discovery)
                                       ├─ Preview / TickScene (low-cost preview)
                                       ├─ EstimateCost (cost estimation — critical!)
                                       └─ Write(.neko/plan.md)
```

**Recommendation**: Keep plan mode, expand to "discover + preview" mode:

```
plan mode v2:
  ├─ Allow: all read-only tools (existing)
  ├─ Allow: all preview tools (new: Preview/TickScene/GetSnapshot)
  ├─ Allow: cost estimation tools (new: EstimateCost)
  ├─ Allow: write to plan file (existing)
  └─ Deny: generate/export/write (unchanged)
```

**Scenario**: User says "make a video" → AI enters plan mode:
1. Analyze assets (read timeline, check materials)
2. Try a few previews (low-cost rapid iteration)
3. Estimate total cost ("3 AI video segments ~$2.5, export ~45s")
4. Write proposal for user confirmation
5. User confirms → switch to auto/ask mode for execution

### 3.2 auto Mode — Highest Value, Needs Conditional Guards ⭐⭐⭐⭐⭐

**Current implementation**: ✅ **Implemented** — trait-based conditional auto mode.

Auto mode's core value is irreplaceable — creation is **high-frequency iteration**. If every parameter adjustment, preview refresh, or timeline tweak requires a confirmation dialog, UX breaks. But unconditionally allowing all operations risks uncontrolled API spending.

**Solution (implemented)**: Two-rule trait-based decision:

```
auto mode v2 (conditional auto):
  ├─ Rule A: reversible OR local → auto-allow (timeline edits, previews, param adjustments)
  ├─ Rule B: network + irreversible → ask user (AI generation, final exports)
  └─ Fallback: no traits registry → unconditional allow (backward compatible)
```

**Why no budget tracking**: Users configure their own API keys or use local models — the agent has no reliable way to know actual costs. Reversibility + locality are objective, observable properties that don't require external configuration. Budget management belongs to the API provider layer, not the permission system.

**Implementation** (in `PermissionRuleMatcher.check()`):

```typescript
if (mode === 'auto') {
  if (this.traitsRegistry) {
    const traits = this.traitsRegistry.get(toolCall.name);
    if (traits.reversible || traits.locality === 'local') return allow;
    return ask;  // network + irreversible → confirm
  }
  return allow;  // no registry → backward compatible
}
```

### 3.3 bypass Mode — Low Value, Merge into auto ⭐

**Image definition**: Skip all verification (sandbox environments only).

**Analysis**: The "zero-risk" operations in creative scenarios (local preview rendering, reversible parameter adjustments, scene navigation) are already covered by auto v2's unconditional-allow branch.

The only potential bypass scenario is **batch automation** ("add watermark to all 100 images and export"), but the overhead of 100 condition checks at μs level is negligible.

**Recommendation**: Do not implement bypass as independent mode.

Reasons:
1. All bypass scenarios covered by auto v2's unconditional-allow branch
2. Adding bypass increases user cognitive load with no practical benefit
3. "Skip all verification" risks uncontrolled API spending if mistakenly enabled
4. Alternative: support "fast-path" markers in auto mode rules: `allow: ["Effect(*)", "Preview(*)", "Timeline(*)"]`

## 4. Adaptability Summary

### Six-Layer Verification

| Layer | Applicable? | Note |
|-------|------------|------|
| 1. AST Syntax Parsing | 🔴 No | Structured API calls don't need Bash AST parsing |
| 2. Injection Detection | 🔴 No | Typed parameters have no injection surface; real risk is prompt injection |
| 3. User Rule Matching | 🟢 Yes | Already implemented, needs cost/resource dimension extension |
| 4. Sandbox Auto-Allow | 🟡 Partial | Concept fits, whitelist needs creative tool rebuild |
| 5. AI Classifier | 🔴 No | Safety risk score irrelevant; need cost-value evaluator instead |
| 6. Context Decision | 🟡 Partial | Concept fits, feature space completely different |

### Permission Modes

| Mode | Creative Value | Recommendation | Key Change |
|------|---------------|----------------|------------|
| **plan** | ⭐⭐⭐⭐ | ✅ Keep and upgrade | Whitelist expansion: +preview tools +cost estimation |
| **ask** | ⭐⭐⭐ | ✅ Keep as-is | Default/cautious mode, no changes needed |
| **auto** | ⭐⭐⭐⭐⭐ | ✅ Keep and add conditions | Unconditional → conditional by reversibility/cost/locality |
| **bypass** | ⭐ | ❌ Do not introduce | auto + broad allow rules fully covers this |

### Final Mode Set

```typescript
PermissionMode = 'plan' | 'ask' | 'auto'  // Maintain current three modes

// plan  → Discover + Preview + Estimate (conceive phase)
// ask   → Confirm each operation (default/cautious mode)
// auto  → Conditional auto (core creative mode, with cost/reversibility guards)

// No bypass — auto mode's "reversible + local" branch is de facto bypass
// No default — no AI classifier; use ToolTraits metadata instead of risk scores
```

## 5. Recommended Creative Decision Pipeline

If building from scratch for creative scenarios:

```
Creative Decision Pipeline:
━━━━━━━━━━━━━━━━━━━━━━━━

1. Operation Classification  → Classify: preview/edit/generate/export (replaces AST parsing)
2. Cost Estimation           → Estimate: API cost + GPU time + wait time (replaces injection detection)
3. User Rule Matching        → Reuse existing PermissionRuleMatcher ✅ (already adapted)
4. Creative Context          → Sense: creative stage + project budget + asset readiness (replaces sandbox whitelist)
5. Smart Decision            → Combine: within budget? reversible? user history preference? (replaces AI classifier)

Decision outputs: auto-proceed / confirm-cost / confirm-quality / block-budget
```

```
Creative Permission Modes:
━━━━━━━━━━━━━━━━━━━━━━━━

explore  → Exploration phase: previews free, generation needs confirm, export needs confirm
refine   → Refinement phase: param adjustments free, regeneration needs confirm
produce  → Delivery phase: all generation/export operations need confirm (prevent mistakes)
budget   → Budget mode: cost < threshold auto-execute, over-budget needs confirm
```

## 6. Implementation Status (2026-03)

### What Was Built

The creative permission system has been implemented with a **minimal, backward-compatible** design:

#### New Types (`@neko/shared`)

```typescript
// ToolTraits — behavioral metadata for any tool
interface ToolTraits {
  cost: 'free' | 'cheap' | 'moderate' | 'expensive';
  reversible: boolean;
  locality: 'local' | 'network' | 'hybrid';
  impactLevel: 'none' | 'low' | 'high' | 'critical';
}
```

#### New Components (`@neko/agent`)

| Component | File | Purpose |
|-----------|------|---------|
| `ToolTraitsRegistry` | `permission/tool-traits-registry.ts` | Decoupled registry mapping tool names → traits |
| `DEFAULT_CREATIVE_TOOL_TRAITS` | same file | 26 pre-configured entries for creative tools |
| `CREATIVE_PLAN_TOOLS` | `permission/types.ts` | 8 read-only creative tools for plan mode whitelist |

#### Modified Decision Flow

```
PermissionRuleMatcher.check() flow:
  1. deny rules (existing)           → block
  2. plan mode readOnlyTools check   → allow (now includes CREATIVE_PLAN_TOOLS)
  3. allow rules (existing)          → allow
  4. ask rules (existing)            → confirm
  5. auto mode (UPGRADED):
     ├─ With traitsRegistry:
     │   ├─ reversible OR local → allow
     │   └─ network + irreversible → ask
     └─ Without traitsRegistry → allow (backward compatible)
```

#### Runtime Integration

`AgentSessionConfig.traitsRegistry` connects the full chain:

```typescript
import { ToolTraitsRegistry, DEFAULT_CREATIVE_TOOL_TRAITS, createAgentSession } from '@neko/agent';

const registry = new ToolTraitsRegistry();
registry.registerMany(DEFAULT_CREATIVE_TOOL_TRAITS);

const session = createAgentSession({
  // ...other config
  traitsRegistry: registry,  // enables creative auto mode
});
```

#### What Was Intentionally NOT Built

| Feature | Reason |
|---------|--------|
| **CreativeBudget** (session cost tracking) | Users configure their own API keys or use local models; the agent cannot reliably know actual costs. Budget belongs to the API provider layer. |
| **bypass mode** | auto mode's `reversible \|\| local` branch is de facto bypass for safe operations. |
| **AI risk classifier** | ToolTraits metadata provides objective, deterministic classification without needing ML inference. |

#### Test Coverage

29 test cases in `permission/__tests__/creative-permission.test.ts`:
- ToolTraitsRegistry: 8 tests (get/register/registerMany/has/keys/size)
- Auto mode with traits: 14 tests (local→allow, network+irreversible→ask, backward compat, rule precedence)
- Plan mode creative tools: 4 tests (allow read-only, deny generation/write)
- DEFAULT_CREATIVE_TOOL_TRAITS validation: 3 tests (valid values, generation→network, timeline→local)
