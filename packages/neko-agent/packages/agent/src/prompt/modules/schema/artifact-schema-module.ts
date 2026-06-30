/**
 * ArtifactSchemaModule — projects the IDC creation-document contract into the
 * L1 schema layer.
 *
 * Draft / Plan / Task are creator-facing documents. Agent may propose their
 * content, but host/runtime services own persistence, approval, and paths.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';
import type { PromptContext } from '../../context';

const SCHEMA_TEMPLATE = `## Creation document contract (required)

The active IDC run id is \`{runId}\`.

Draft / Plan / Task are creator-facing documents. Do not call generic \`Read\`,
\`Write\`, shell commands, or cache/runtime paths to inspect or persist them.
The host creation-document service owns storage, approval gates, and path
selection.

When a user asks for a proposal, requirement, plan, task list, storyboard
draft, or other creator-facing artifact, write the content in the chat
using the structure below. The runtime may persist approved creation documents
in a project-owned visible directory such as
\`neko/creations/<creation-id>/brief.md\`,
\`neko/creations/<creation-id>/plan.md\`, and
\`neko/creations/<creation-id>/checklist.md\`.

Do not write or read hidden managed runtime directories for creation documents.
Managed runtime/cache paths are not a valid creation-document surface.

### Required frontmatter when the runtime persists creation documents

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

1. Do not create, read, or repair creation document files yourself.
2. Do not preserve \`createdAt\` by reading a file path; the runtime service
   preserves metadata when it persists a revised document.
3. Do not invent hidden paths, cache paths, Webview URIs, or provider-private
   paths for creation documents.
4. If the host reports a creation-document diagnostic, explain the diagnostic and
   provide a corrected artifact body in chat.`;

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
