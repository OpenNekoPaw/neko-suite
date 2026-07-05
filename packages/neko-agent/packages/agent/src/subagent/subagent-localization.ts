import type { SpecializedAgentPreset } from './types';

export type SubAgentPromptLocale = 'en' | 'zh';

export interface SubAgentPromptLabels {
  readonly systemContext: string;
  readonly recentConversation: string;
  readonly contextFromParentAgent: string;
  readonly contextFromCoordinator: string;
  readonly task: string;
  readonly resultsFromPreviousTasks: string;
  readonly yourTask: string;
  readonly injectedSkills: string;
  readonly completedSubtasks: string;
  readonly roleLabels: Readonly<Record<string, string>>;
  readonly taskFocusInstruction: string;
}

const ZH_PRESET_TEXT: Readonly<Record<string, Pick<SpecializedAgentPreset, 'description' | 'systemPrompt'>>> = {
  'code-search': {
    description: '在代码库中搜索并分析代码',
    systemPrompt: `你是代码搜索专家。你的任务是查找相关代码模式、定义和引用。

准则：
- 使用 grep 和 glob 工具高效搜索
- 阅读文件以理解上下文
- 简洁总结发现
- 报告文件路径和行号`,
  },
  'file-explorer': {
    description: '探索并导航文件系统',
    systemPrompt: `你是文件系统导航助手。帮助定位并理解项目结构。

准则：
- 使用 glob 按模式查找文件
- 使用 list_directory 探索结构
- 提供清晰的文件组织总结`,
  },
  'test-runner': {
    description: '运行并分析测试',
    systemPrompt: `你是测试专家。运行测试并分析结果。

准则：
- 使用 bash 执行测试命令
- 阅读测试文件以理解覆盖范围
- 清晰说明失败原因
- 为失败测试提出修复建议`,
  },
  'document-writer': {
    description: '编写并更新文档',
    systemPrompt: `你是文档专家。创建清晰、简洁的文档。

准则：
- 阅读现有文件以理解上下文
- 编写结构良好的 Markdown
- 遵循项目文档约定
- 保持文档聚焦且准确`,
  },
  general: {
    description: '通用 Agent',
    systemPrompt: `你是通用 Agent。高效完成分配的任务。

准则：
- 只关注分配给你的任务
- 保持简洁高效
- 清晰报告结果
- 如果无法完成任务，说明原因`,
  },
  'npc-character': {
    description: 'NPC 角色验证会话',
    systemPrompt: `你是隔离的 NPC 角色测试 Agent。

准则：
- 保持在提供的角色档案和对话模式内。
- 将已确认的角色档案事实视为权威。
- 将建议中的角色档案事实视为不确定，避免编造确定性。
- 不要声称可以访问项目文件、工具、全局记忆或隐藏剧情上下文。
- 如果档案缺少答案，请在角色自身的不确定性内回应。`,
  },
};

const EN_LABELS: SubAgentPromptLabels = {
  systemContext: 'System Context',
  recentConversation: 'Recent Conversation',
  contextFromParentAgent: 'Context from Parent Agent',
  contextFromCoordinator: 'Context from Coordinator',
  task: 'Task',
  resultsFromPreviousTasks: 'Results from Previous Tasks',
  yourTask: 'Your Task',
  injectedSkills: 'Injected Skills',
  completedSubtasks: "I've completed the subtasks. Here are the results:",
  roleLabels: {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool',
  },
  taskFocusInstruction:
    'Focus on completing this specific task efficiently and report your findings clearly.',
};

const ZH_LABELS: SubAgentPromptLabels = {
  systemContext: '系统上下文',
  recentConversation: '最近对话',
  contextFromParentAgent: '父 Agent 上下文',
  contextFromCoordinator: '协调器上下文',
  task: '任务',
  resultsFromPreviousTasks: '前置任务结果',
  yourTask: '你的任务',
  injectedSkills: '注入的 Skills',
  completedSubtasks: '我已完成子任务。结果如下：',
  roleLabels: {
    user: '用户',
    assistant: '助手',
    system: '系统',
    tool: '工具',
  },
  taskFocusInstruction: '请高效完成这个具体任务，并清晰报告你的发现。',
};

export function normalizeSubAgentPromptLocale(locale: string | undefined): SubAgentPromptLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getSubAgentPromptLabels(locale: string | undefined): SubAgentPromptLabels {
  return normalizeSubAgentPromptLocale(locale) === 'zh' ? ZH_LABELS : EN_LABELS;
}

export function localizeBuiltinSubAgentPreset(
  type: string,
  preset: SpecializedAgentPreset,
  locale: string | undefined,
): SpecializedAgentPreset {
  if (normalizeSubAgentPromptLocale(locale) !== 'zh') {
    return preset;
  }
  const text = ZH_PRESET_TEXT[type];
  return text ? { ...preset, ...text } : preset;
}
