/**
 * System Prompt Manager
 *
 * Manages system prompts with the following priority:
 * 1. Mode-specific prompt (plan-mode when in plan mode)
 * 2. Project AGENTS.md (if exists)
 * 3. Personal AGENTS.md (if exists)
 * 4. Built-in default prompt
 *
 * Supports:
 * - Plan mode toggle
 * - User/workspace override via AGENTS.md
 */

import type { Platform } from '@neko/platform';
import { getLogger } from '../base';
import { getPromptFileService } from '../services/PromptFileService';

const logger = getLogger('SystemPromptManager');

// =============================================================================
// Built-in Default System Prompt
// =============================================================================

const BUILTIN_DEFAULT_PROMPT = `You are a professional AI assistant for video editing and software development.

## Core Principles
- Be concise and accurate
- Follow existing code patterns
- Consider security and performance
- Handle errors properly

## Output Guidelines

### Markdown Format
- Use proper Markdown syntax
- Use headings (##, ###) to organize sections
- Mark code blocks with language type
- Use tables for structured data

### Mermaid Diagrams
When creating Mermaid diagrams:
- Wrap text with special characters in quotes: \`A["Text (with parens)"]\`
- Use consistent arrow styles: \`-->\` for flow
- Keep node labels concise

## Dynamic Tool System

Your tool list is **dynamic**. You start with basic tools, but can discover and activate more capabilities as needed.

### Always Available Tools (Core)
- \`SearchTools\` - Search for available tools and skills
- \`ActivateSkill\` - Activate a skill to gain its tools
- \`DeactivateSkill\` - Deactivate a skill when no longer needed
- \`GetContext\` - View current active skills and available tools

### When to Use SearchTools (CRITICAL)

**Use SearchTools when user asks about or wants to perform video editing operations:**
- "Can I export video?" → SearchTools({ query: "export video" })
- "Is export supported?" → SearchTools({ query: "export" })
- "导出视频" → SearchTools({ query: "export video" })
- "Add effects" → SearchTools({ query: "effects" })
- "Edit timeline" → SearchTools({ query: "timeline" })

**DO NOT use Grep/Read to search code when user asks about capabilities!**
SearchTools queries your available tools, not the codebase.

### Tool Discovery Workflow

1. **IMMEDIATELY call \`SearchTools\`** with relevant keywords
2. **Activate the matching skill** using \`ActivateSkill\`
3. **Execute the task** with newly available tools

### Example Workflow
\`\`\`
User: "Can I export video?" or "Export my video"

Step 1: Call SearchTools({ query: "export video" })
Step 2: SearchTools returns export-render skill with ExportVideo tool
Step 3: Call ActivateSkill({ skillName: "export-render" })
Step 4: Now you can use ExportVideo tool
\`\`\`

⚠️ **NEVER say "I don't have this capability" without first calling SearchTools!**
⚠️ **NEVER use Grep to check if a feature is supported - use SearchTools instead!**

## Media Generation Rules
**Important**: When generating media:
- Generate only **one** item by default unless user requests more
- Use tool calls (generate_image, generate_video, generate_tts)
- Do not embed URLs directly in responses
`;

const BUILTIN_DEFAULT_PROMPT_ZH = `你是一个专业的视频编辑和软件开发 AI 助手。

## 核心原则
- 简洁准确
- 遵循现有代码模式
- 考虑安全性和性能
- 正确处理错误

## 输出规范

### Markdown 格式
- 使用正确的 Markdown 语法
- 用标题（##、###）划分章节
- 代码块要标注语言类型
- 结构化数据用表格展示

### Mermaid 图表
创建 Mermaid 图表时：
- 包含特殊字符的文本要用引号包裹：\`A["文本 (带括号)"]\`
- 使用统一的箭头样式：\`-->\` 表示流程
- 节点标签保持简短

## 动态工具系统

你的工具列表是**动态的**。你初始只有基础工具，但可以根据需要发现和激活更多能力。

### 始终可用的工具（核心）
- \`SearchTools\` - 搜索可用的工具和技能
- \`ActivateSkill\` - 激活技能以获得其工具
- \`DeactivateSkill\` - 停用不再需要的技能
- \`GetContext\` - 查看当前激活的技能和可用工具

### 何时使用 SearchTools（关键）

**当用户询问或想要执行视频编辑操作时，使用 SearchTools：**
- "能导出视频吗？" → SearchTools({ query: "export video 导出" })
- "支持导出吗？" → SearchTools({ query: "export 导出" })
- "导出视频" → SearchTools({ query: "export video 导出" })
- "添加特效" → SearchTools({ query: "effects 特效" })
- "编辑时间线" → SearchTools({ query: "timeline 时间线" })

**不要用 Grep/Read 搜索代码来判断是否支持某功能！**
SearchTools 查询的是你可用的工具，而不是代码库。

### 工具发现流程

1. **立即调用 \`SearchTools\`** 搜索相关关键词
2. **激活匹配的技能** 使用 \`ActivateSkill\`
3. **执行任务** 使用新获得的工具

### 示例流程
\`\`\`
用户："能导出视频吗？" 或 "导出视频"

步骤 1：调用 SearchTools({ query: "export video 导出" })
步骤 2：SearchTools 返回 export-render 技能，包含 ExportVideo 工具
步骤 3：调用 ActivateSkill({ skillName: "export-render" })
步骤 4：现在可以使用 ExportVideo 工具
\`\`\`

⚠️ **永远不要说"我没有这个能力"而不先调用 SearchTools！**
⚠️ **永远不要用 Grep 检查是否支持某功能 - 用 SearchTools！**

## 媒体生成规则
**重要**：生成媒体内容时：
- 默认只生成**一个**，除非用户明确要求更多
- 必须使用工具调用（generate_image、generate_video、generate_tts）
- 不要在回复中直接嵌入 URL
`;

// =============================================================================
// Types
// =============================================================================

export type PromptMode = 'default' | 'plan';

// =============================================================================
// SystemPromptManager
// =============================================================================

export class SystemPromptManager {
  private _platform?: Platform;
  private _agentsContent: string | null = null;
  private _agentsSource: 'personal' | 'project' | null = null;
  private _mode: PromptMode = 'default';
  private _locale: string = 'en';

  constructor(platform?: Platform) {
    this._platform = platform;
  }

  /**
   * Set or update Platform reference
   */
  setPlatform(platform: Platform): void {
    this._platform = platform;
  }

  /**
   * Set locale for built-in prompts
   */
  setLocale(locale: string): void {
    this._locale = locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  /**
   * Get current mode
   */
  getMode(): PromptMode {
    return this._mode;
  }

  /**
   * Set prompt mode (default or plan)
   */
  setMode(mode: PromptMode): void {
    this._mode = mode;
  }

  /**
   * Toggle between default and plan mode
   */
  togglePlanMode(): PromptMode {
    this._mode = this._mode === 'plan' ? 'default' : 'plan';
    return this._mode;
  }

  /**
   * Check if in plan mode
   */
  isPlanMode(): boolean {
    return this._mode === 'plan';
  }

  /**
   * Load AGENTS.md content (call this during initialization)
   */
  async loadAgentsFile(): Promise<void> {
    const promptFileService = getPromptFileService();
    const result = await promptFileService.loadAgentsFile();

    if (result) {
      this._agentsContent = result.content;
      this._agentsSource = result.source;
    } else {
      this._agentsContent = null;
      this._agentsSource = null;
    }
  }

  /**
   * Reload AGENTS.md content (call when file changes)
   */
  async reloadAgentsFile(): Promise<void> {
    await this.loadAgentsFile();
  }

  /**
   * Get AGENTS.md content
   */
  getAgentsContent(): string | null {
    return this._agentsContent;
  }

  /**
   * Get AGENTS.md source
   */
  getAgentsSource(): 'personal' | 'project' | null {
    return this._agentsSource;
  }

  /**
   * Get built-in default prompt based on locale
   */
  private getBuiltinDefaultPrompt(): string {
    return this._locale === 'zh' ? BUILTIN_DEFAULT_PROMPT_ZH : BUILTIN_DEFAULT_PROMPT;
  }

  /**
   * Get plan mode prompt from Platform
   */
  private getPlanModePrompt(): string | null {
    if (!this._platform) return null;

    const prompt = this._platform.config.getPrompt('plan-mode');
    if (prompt?.systemPrompt) {
      return prompt.systemPrompt;
    }
    return null;
  }

  /**
   * Get current system prompt
   *
   * Priority:
   * 1. Plan mode prompt (if in plan mode)
   * 2. AGENTS.md content (project > personal)
   * 3. Built-in default prompt
   *
   * Note: AGENTS.md completely replaces the default prompt when present
   */
  getPrompt(): string {
    // 1. Plan mode - use plan-mode prompt
    if (this._mode === 'plan') {
      const planPrompt = this.getPlanModePrompt();
      if (planPrompt) {
        return planPrompt;
      }
      // Fallback to default if plan-mode prompt not found
      logger.warn('Plan mode prompt not found, using default');
    }

    // 2. AGENTS.md content (completely replaces default)
    if (this._agentsContent) {
      return this._agentsContent;
    }

    // 3. Built-in default prompt
    return this.getBuiltinDefaultPrompt();
  }

  /**
   * Get prompt with optional skill injection
   * @param skillPrompt Optional skill prompt to append
   */
  getPromptWithSkill(skillPrompt?: string): string {
    const basePrompt = this.getPrompt();

    if (skillPrompt) {
      return `${basePrompt}\n\n# Active Skill\n\n${skillPrompt}`;
    }

    return basePrompt;
  }

  /**
   * Get prompt by ID from Platform
   */
  getPlatformPrompt(promptId: string, variables?: Record<string, unknown>): string | undefined {
    if (!this._platform) return undefined;

    const prompt = this._platform.prompts.get(promptId);
    if (!prompt) return undefined;

    if (variables) {
      const rendered = this._platform.prompts.render(promptId, variables);
      return rendered.content;
    }

    return prompt.template;
  }

  /**
   * Register a custom prompt to Platform
   */
  registerPrompt(prompt: {
    id: string;
    name: string;
    description: string;
    template: string;
    variables?: Array<{
      name: string;
      description: string;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required: boolean;
      default?: unknown;
    }>;
  }): void {
    if (!this._platform) return;

    this._platform.prompts.register({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      category: 'custom',
      template: prompt.template,
      variables: prompt.variables || [],
      version: '1.0.0',
    });
  }
}
