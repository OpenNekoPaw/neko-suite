/**
 * ArtifactSchemaModule — projects the IDC artifact file contract into the
 * L1 schema layer. Previously embedded verbatim in creation-persona.ts
 * (L45-111 before PR3c); extracted here so all personas implicitly inherit
 * the contract without duplicating ~67 lines of schema text, and so new
 * personas that touch Draft / Plan / Task artifacts don't need to repeat
 * the contract boilerplate.
 *
 * The content mirrors the field / enum definitions owned by
 * ArtifactValidator (DRAFT_SCHEMA / PLAN_SCHEMA / TASK_SCHEMA, see
 * src/artifact/artifact-validator.ts). Keep both sides in sync when
 * either side changes — validator is the machine-check SSOT, this module
 * is the LLM-facing narrative of the same rules.
 *
 * Activation: requires a runId on the context. Without an active IDC run
 * the schema section is suppressed — consistent with the prior UX where
 * the persona prompt told the agent to ask the user to start a session
 * before writing artifacts.
 *
 * Not yet runtime-wired: PR3c introduces the module and the layer; the
 * session-level driver that flips it on/off as IdcRuns come and go lives
 * in PR3d. Tests here use renderSync with a crafted PromptContext to
 * verify the projection contract is correct in isolation.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';
import type { PromptContext } from '../../context';

/**
 * Template for the schema section. The `{runId}` placeholder is replaced
 * with the active IdcRun id at render time.
 */
const SCHEMA_TEMPLATE = `## Artifact file contract (required)

You write the three IDC artifacts through the generic \`Write\` tool.
There is no dedicated DraftWrite / PlanWrite / TaskWrite tool anymore.
The ArtifactWatcher parses and validates every file you write; emit invalid
frontmatter and you'll see an \`artifact.invalid\` observation next turn.

### File paths

- Draft:  \`.neko/drafts/draft-{runId}.md\`
- Plan:   \`.neko/plans/plan-{runId}.md\`
- Task:   \`.neko/tasks/task-{runId}.md\`

The paths above are rendered for the currently active run. If you still
see \`{runId}\` as a literal, no run has started yet — ask the user to
begin a session before writing artifacts. Never hand-edit the prefix or
the \`.md\` extension.

### Required frontmatter (all artifacts)

\`\`\`yaml
---
id: <stable artifact id>
kind: draft | plan | task
createdAt: <ISO 8601>   # preserve across rewrites
updatedAt: <ISO 8601>   # current time on every write
# ... kind-specific fields below
---
\`\`\`

### Draft frontmatter (additional)

\`\`\`yaml
title: <headline>
status: draft | pending_review | approved | refined | rejected
domain: cut | canvas | story | puppet | ...
# optional
referenceChain:
  - asset://characters/hero
\`\`\`

### Plan frontmatter (additional)

\`\`\`yaml
title: <headline>
draftId: <id of the Draft this plan compiles from>
status: draft | ready | in_progress | completed | failed | aborted
\`\`\`

### Task frontmatter

Task only requires the shared fields (id / kind / createdAt / updatedAt).

### Write rules

1. **Full-file overwrite** — always write the entire file. Do not use \`append\`.
2. **Preserve createdAt** — read the existing file first; keep its \`createdAt\`.
   First write seeds \`createdAt\` with the current time.
3. **Update updatedAt** — stamp the current ISO 8601 timestamp on every write.
4. **kind matches the directory** — a file in \`drafts/\` must declare
   \`kind: draft\`; same for \`plans/\` / \`tasks/\`. Mismatches surface as
   \`wrong-kind\` validation issues.
5. **No block scalars** (\`|\` / \`>\`) in frontmatter — use single-line values.
6. **Quote values containing \`: \`** so the parser does not split them.

If you see an \`artifact.invalid\` observation after a write, read the listed
\`issues\` and re-write the same file with the fixes on the next turn.`;

export class ArtifactSchemaModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'artifact.schema',
    layers: ['schema'],
    requires: ['runId'],
    priority: 50,
    cost: 'free',
    cacheKey: (ctx) => ctx.runId,
  };

  async render(ctx: PromptContext): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync(ctx);
  }

  /**
   * Sync variant for sync callers (e.g. AgentSession wiring during run
   * transitions). Returns null when no runId is set; otherwise emits one
   * schema-layer section with all `{runId}` placeholders resolved.
   */
  renderSync(ctx: PromptContext): readonly PromptModuleSection[] | null {
    if (!ctx.runId) return null;
    const content = SCHEMA_TEMPLATE.replace(/\{runId\}/g, ctx.runId);
    return [
      {
        sectionId: 'artifact-schema',
        layer: 'schema',
        content,
        priority: 50,
      },
    ];
  }
}
