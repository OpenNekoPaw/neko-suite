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
draft, or other creator-facing artifact, write only the human-readable artifact
body in chat. Do not include YAML frontmatter, \`id:\`, \`kind:\`,
\`status:\`, \`domain:\`, or \`referenceChain:\` in normal assistant replies
unless a host/runtime tool explicitly asks for persisted creation-document
Markdown.

The runtime may persist approved creation documents in a project-owned visible
directory such as
\`neko/creations/<creation-id>/brief.md\`,
\`neko/creations/<creation-id>/plan.md\`, and
\`neko/creations/<creation-id>/checklist.md\`.

Do not write or read hidden managed runtime directories for creation documents.
Managed runtime/cache paths are not a valid creation-document surface.

### Required frontmatter for runtime-persisted creation documents only

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
   provide a corrected artifact body in chat without YAML frontmatter unless the
   diagnostic explicitly requests a persisted creation-document Markdown block.`;

const SCHEMA_TEMPLATE_ZH = `## 创作文档契约（必需）

当前 IDC run id 是 \`{runId}\`。

Draft / Plan / Task 是面向创作者的文档。不要调用通用 \`Read\`、
\`Write\`、shell 命令或 cache/runtime 路径来检查或持久化它们。
宿主的 creation-document 服务负责存储、审批门禁和路径选择。

当用户要求 proposal、需求、计划、任务列表、分镜草稿或其他面向创作者的产物时，
聊天中只输出人类可读的产物正文。普通 assistant 回复不要包含 YAML frontmatter、
\`id:\`、\`kind:\`、\`status:\`、\`domain:\` 或 \`referenceChain:\`，
除非 host/runtime 工具明确要求输出用于持久化的创作文档 Markdown。

运行时可以把已批准的创作文档持久化到项目可见目录，例如
\`neko/creations/<creation-id>/brief.md\`、
\`neko/creations/<creation-id>/plan.md\` 和
\`neko/creations/<creation-id>/checklist.md\`。

不要写入或读取隐藏的托管运行时目录来处理创作文档。
托管运行时/cache 路径不是有效的创作文档表面。

### 仅 runtime-persisted creation documents 使用的必需 frontmatter

\`\`\`yaml
---
id: <stable artifact id>
kind: draft | plan | task
createdAt: <ISO 8601>   # preserve across rewrites
updatedAt: <ISO 8601>   # current time on every write
# ... kind-specific fields below
---
\`\`\`

### Draft frontmatter（附加字段）

\`\`\`yaml
title: <headline>
status: draft | pending_review | approved | refined | rejected
domain: cut | canvas | story | puppet | ...
# optional
referenceChain:
  - asset://characters/hero
\`\`\`

### Plan frontmatter（附加字段）

\`\`\`yaml
title: <headline>
draftId: <id of the Draft this plan compiles from>
status: draft | ready | in_progress | completed | failed | aborted
\`\`\`

### Task frontmatter

Task 只需要 shared fields（id / kind / createdAt / updatedAt）。

### 写入规则

1. 不要自行创建、读取或修复创作文档文件。
2. 不要通过读取文件路径来保留 \`createdAt\`；运行时服务在持久化修订文档时负责保留 metadata。
3. 不要为创作文档发明隐藏路径、cache 路径、Webview URI 或 provider 私有路径。
4. 如果宿主报告创作文档 diagnostic，解释该 diagnostic，并在聊天中提供修正后的产物正文；
   除非 diagnostic 明确要求 persisted creation-document Markdown block，否则不要输出 YAML frontmatter。`;

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
    const template = ctx.locale === 'zh' ? SCHEMA_TEMPLATE_ZH : SCHEMA_TEMPLATE;
    const content = template.replace(/\{runId\}/g, ctx.runId);
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
