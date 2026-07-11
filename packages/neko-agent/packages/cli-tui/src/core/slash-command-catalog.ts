import { listSlashCommandCatalog } from '@neko/agent';
import { detectTuiLocale, type TuiLocale } from './tui-locale';

export interface TuiSlashCommandOption {
  readonly name: string;
  readonly description: string;
}

export interface TuiSkillInvocationOption {
  readonly name: string;
  readonly description: string;
}

export interface TuiLocalCommandEffect extends TuiSlashCommandOption {
  readonly surface: 'tui';
  readonly descriptions: Readonly<Record<TuiLocale, string>>;
}

const TUI_LOCAL_COMMANDS: readonly TuiLocalCommandEffect[] = [
  {
    name: 'mode',
    surface: 'tui',
    description: 'Show or switch session mode',
    descriptions: {
      en: 'Show or switch session mode',
      zh: '显示或切换会话模式',
    },
  },
  {
    name: 'model',
    surface: 'tui',
    description: 'List or switch the current chat model',
    descriptions: {
      en: 'List or switch the current chat model',
      zh: '列出或切换当前对话模型',
    },
  },
  {
    name: 'media',
    surface: 'tui',
    description: 'List or switch image/video/audio models',
    descriptions: {
      en: 'List or switch image/video/audio models',
      zh: '列出或切换图像、视频、音频模型',
    },
  },
  {
    name: 'param',
    surface: 'tui',
    description: 'Show or set LLM and media parameters',
    descriptions: {
      en: 'Show or set LLM and media parameters',
      zh: '显示或设置 LLM 与媒体参数',
    },
  },
  {
    name: 'queue',
    surface: 'tui',
    description: 'List, send next, cancel, or edit queued prompts',
    descriptions: {
      en: 'List, send next, cancel, or edit queued prompts',
      zh: '列出、提升、取消或编辑队列中的提示',
    },
  },
  {
    name: 'mcp',
    surface: 'tui',
    description: 'Show MCP server status, tools, and connection controls',
    descriptions: {
      en: 'Show MCP server status, tools, and connection controls',
      zh: '显示 MCP 服务状态、工具和连接控制',
    },
  },
  {
    name: 'capability',
    surface: 'tui',
    description: 'Show TUI capability providers, diagnostics, and tools',
    descriptions: {
      en: 'Show TUI capability providers, diagnostics, and tools',
      zh: '显示 TUI 能力提供者、诊断和工具',
    },
  },
  {
    name: 'artifact',
    surface: 'tui',
    description: 'List, show, open, or send terminal artifact references',
    descriptions: {
      en: 'List, show, open, or send terminal artifact references',
      zh: '列出、显示、打开或发送终端工件引用',
    },
  },
  {
    name: 'compact',
    surface: 'tui',
    description: 'Compact the current Agent context',
    descriptions: {
      en: 'Compact the current Agent context',
      zh: '压缩当前 Agent 上下文',
    },
  },
  {
    name: 'status',
    surface: 'tui',
    description: 'Show mode, model, queue, Skill, task, and context state',
    descriptions: {
      en: 'Show mode, model, queue, Skill, task, and context state',
      zh: '显示模式、模型、队列、技能、任务和上下文状态',
    },
  },
  {
    name: 'auto',
    surface: 'tui',
    description: 'Switch to auto execution mode',
    descriptions: {
      en: 'Switch to auto execution mode',
      zh: '切换到自动执行模式',
    },
  },
  {
    name: 'ask',
    surface: 'tui',
    description: 'Switch to ask-before-action execution mode',
    descriptions: {
      en: 'Switch to ask-before-action execution mode',
      zh: '切换到执行前询问模式',
    },
  },
  {
    name: 'skill',
    surface: 'tui',
    description: 'Activate or deactivate a Skill lifecycle record',
    descriptions: {
      en: 'Activate or deactivate a Skill lifecycle record',
      zh: '激活或停用技能生命周期记录',
    },
  },
];

export function listTuiLocalCommandEffects(
  locale: TuiLocale = detectTuiLocale(),
): readonly (TuiSlashCommandOption & { readonly surface: 'tui' })[] {
  return TUI_LOCAL_COMMANDS.map((command) => ({
    name: command.name,
    description: command.descriptions[locale],
    surface: command.surface,
  }));
}

export function createTuiSlashCommandCatalog(
  skills?: ReadonlyArray<{
    entryPointKind?: 'skill' | 'command-artifact';
    command?: string;
    description?: string;
    enabled?: boolean;
    supportsArguments?: boolean;
    argumentHint?: string;
  }>,
  locale: TuiLocale = detectTuiLocale(),
): TuiSlashCommandOption[] {
  const commands = listSlashCommandCatalog({
    surface: 'tui',
    skills,
    locale,
  }).map((command) => ({
    name: command.name,
    description: command.description,
  }));
  const names = new Set(commands.map((command) => command.name));
  for (const command of listTuiLocalCommandEffects(locale)) {
    if (!names.has(command.name)) {
      commands.push({
        name: command.name,
        description: command.description,
      });
    }
  }
  return commands;
}

export function createTuiSkillInvocationCatalog(
  skills?: ReadonlyArray<{
    name: string;
    description?: string;
    enabled?: boolean;
  }>,
  locale: TuiLocale = detectTuiLocale(),
): TuiSkillInvocationOption[] {
  return (skills ?? [])
    .filter((skill) => skill.enabled !== false)
    .map((skill) => ({
      name: `$${skill.name}`,
      description: readSkillDescription(skill.description, skill.name, locale),
    }));
}

function readSkillDescription(
  description: string | undefined,
  skillName: string,
  locale: TuiLocale,
): string {
  const trimmed = description?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return locale === 'zh' ? `激活技能 ${skillName}` : `Activate skill ${skillName}`;
}
