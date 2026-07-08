import type { BuiltinCommandName, CommandCategory, CommandLocale } from './types';

const BUILTIN_COMMAND_DESCRIPTIONS_ZH: Readonly<Record<BuiltinCommandName, string>> = {
  help: '显示可用命令帮助',
  status: '显示当前状态（配置、模型、资源）',
  clear: '清空对话历史或终端屏幕',
  exit: '退出交互模式或关闭当前会话',
  as: '启动隔离的角色对话会话',
  'exit-as': '退出当前角色对话会话',
  new: '开始新对话',
  resume: '查看并恢复最近对话',
  config: '管理配置',
  model: '显示模型选择器或切换模型',
  settings: '打开设置面板',
  permissions: '查看并管理权限',
  init: '初始化项目配置',
  compact: '压缩当前 Agent 上下文以节省 token',
  plan: '切换计划模式（先设计再实现）',
  skills: '列出并管理技能',
  commands: '列出可用斜杠命令',
  tools: '列出并搜索可用工具',
  tasks: '显示后台任务',
  mcp: '显示 MCP 服务配置',
};

const CATEGORY_LABELS: Readonly<Record<CommandLocale, Readonly<Record<CommandCategory, string>>>> =
  {
    en: {
      core: 'Core Commands',
      session: 'Session Management',
      configuration: 'Configuration',
      context: 'Context Management',
      mode: 'Mode Switching',
      resources: 'Resource Management',
    },
    zh: {
      core: '核心命令',
      session: '会话管理',
      configuration: '配置',
      context: '上下文管理',
      mode: '模式切换',
      resources: '资源管理',
    },
  };

export interface CliHelpLabels {
  readonly availableCommands: string;
  readonly commandArtifacts: string;
}

const CLI_HELP_LABELS: Readonly<Record<CommandLocale, CliHelpLabels>> = {
  en: {
    availableCommands: 'Available Commands:',
    commandArtifacts: 'Command Artifacts:',
  },
  zh: {
    availableCommands: '可用命令:',
    commandArtifacts: '命令工件:',
  },
};

export interface SlashCommandListLabels {
  readonly availableSlashCommands: string;
  readonly builtinCommands: string;
  readonly commandArtifacts: string;
}

const SLASH_COMMAND_LIST_LABELS: Readonly<Record<CommandLocale, SlashCommandListLabels>> = {
  en: {
    availableSlashCommands: 'Available Slash Commands:',
    builtinCommands: 'Builtin Commands',
    commandArtifacts: 'Command Artifacts',
  },
  zh: {
    availableSlashCommands: '可用斜杠命令:',
    builtinCommands: '内置命令',
    commandArtifacts: '命令工件',
  },
};

export function normalizeCommandLocale(locale: CommandLocale | undefined): CommandLocale {
  return locale === 'zh' ? 'zh' : 'en';
}

export function localizeBuiltinCommandDescription(
  name: BuiltinCommandName,
  description: string,
  locale: CommandLocale | undefined,
): string {
  return normalizeCommandLocale(locale) === 'zh'
    ? BUILTIN_COMMAND_DESCRIPTIONS_ZH[name]
    : description;
}

export function localizeCommandArtifactDefaultDescription(
  commandName: string,
  locale: CommandLocale | undefined,
): string {
  return normalizeCommandLocale(locale) === 'zh'
    ? `激活命令 /${commandName}`
    : `Activate command /${commandName}`;
}

export function getCommandCategoryLabel(
  category: CommandCategory,
  locale: CommandLocale | undefined,
): string {
  return CATEGORY_LABELS[normalizeCommandLocale(locale)][category] ?? category;
}

export function getCliHelpLabels(locale: CommandLocale | undefined): CliHelpLabels {
  return CLI_HELP_LABELS[normalizeCommandLocale(locale)];
}

export function getSlashCommandListLabels(
  locale: CommandLocale | undefined,
): SlashCommandListLabels {
  return SLASH_COMMAND_LIST_LABELS[normalizeCommandLocale(locale)];
}
