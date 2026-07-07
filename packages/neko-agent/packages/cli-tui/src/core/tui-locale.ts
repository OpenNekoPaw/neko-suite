import { execFileSync } from 'node:child_process';
import { normalizeLocale } from '@neko/shared';

export type TuiLocale = 'en' | 'zh';

export interface TuiLabels {
  readonly sessionModes: Readonly<Record<string, string>>;
  readonly executionModes: Readonly<Record<string, string>>;
  readonly chrome: {
    readonly model: string;
    readonly workDir: string;
    readonly mode: string;
    readonly chat: string;
    readonly media: string;
    readonly none: string;
    readonly skill: string;
    readonly skills: string;
    readonly queue: string;
    readonly locked: string;
    readonly more: string;
    readonly multiLineHint: string;
    readonly selectionHint: string;
    readonly noMatchingCommands: string;
    readonly startupHelp: string;
  };
  readonly mediaCategories: Readonly<Record<string, string>>;
  readonly referenceSources: Readonly<Record<string, string>>;
  readonly suggestionKinds: Readonly<Record<string, string>>;
}

const TUI_LABELS: Readonly<Record<TuiLocale, TuiLabels>> = {
  en: {
    sessionModes: {
      agent: 'agent',
      image: 'image',
      video: 'video',
      audio: 'audio',
    },
    executionModes: {
      auto: 'auto',
      plan: 'plan',
      ask: 'ask',
    },
    chrome: {
      model: 'Model',
      workDir: 'WorkDir',
      mode: 'Mode',
      chat: 'chat',
      media: 'media',
      none: 'none',
      skill: 'skill',
      skills: 'skills',
      queue: 'queue',
      locked: 'locked',
      more: 'more',
      multiLineHint: '[multi-line: Shift+Enter for newline]',
      selectionHint: '↑↓:navigate Enter:select Esc:cancel',
      noMatchingCommands: 'No matching commands',
      startupHelp: 'Type /help for commands, /exit to quit',
    },
    mediaCategories: {
      image: 'image',
      video: 'video',
      audio: 'audio',
      sequence: 'sequence',
      text: 'text',
      document: 'document',
    },
    referenceSources: {
      'workspace file': 'workspace file',
      'asset-library': 'asset-library',
      'generated-assets': 'generated-assets',
      'media-library': 'media-library',
      'entity-graph': 'entity-graph',
      story: 'story',
      canvas: 'canvas',
    },
    suggestionKinds: {
      command: 'command',
      skill: 'skill',
      file: 'file',
      asset: 'asset',
      media: 'media',
      entity: 'entity',
      'canvas-node': 'canvas-node',
      character: 'character',
      scene: 'scene',
    },
  },
  zh: {
    sessionModes: {
      agent: '助理',
      image: '图像',
      video: '视频',
      audio: '音频',
    },
    executionModes: {
      auto: '自动',
      plan: '计划',
      ask: '询问',
    },
    chrome: {
      model: '模型',
      workDir: '工作目录',
      mode: '模式',
      chat: '对话',
      media: '媒体',
      none: '无',
      skill: '技能',
      skills: '技能',
      queue: '队列',
      locked: '锁定',
      more: '更多',
      multiLineHint: '[多行: Shift+Enter 换行]',
      selectionHint: '↑↓:导航 Enter:选择 Esc:取消',
      noMatchingCommands: '无匹配命令',
      startupHelp: '输入 /help 查看命令，输入 /exit 退出',
    },
    mediaCategories: {
      image: '图像',
      video: '视频',
      audio: '音频',
      sequence: '序列',
      text: '文本',
      document: '文档',
    },
    referenceSources: {
      'workspace file': '工作区文件',
      'asset-library': '素材库',
      'generated-assets': '生成素材',
      'media-library': '媒体库',
      'entity-graph': '实体图谱',
      story: '故事',
      canvas: '画布',
    },
    suggestionKinds: {
      command: '命令',
      skill: '技能',
      file: '文件',
      asset: '素材',
      media: '媒体',
      entity: '实体',
      'canvas-node': '画布节点',
      character: '角色',
      scene: '场景',
    },
  },
};

let hostLocaleCache: string | null | undefined;

export function detectTuiLocale(
  env: Record<string, string | undefined> = process.env,
  readHostLocale: () => string | undefined = detectHostLocale,
): TuiLocale {
  const raw = readEnvironmentLocale(env) ?? readHostLocale() ?? '';
  return normalizeLocale(raw) === 'zh-cn' ? 'zh' : 'en';
}

export function getTuiLabels(locale: TuiLocale = detectTuiLocale()): TuiLabels {
  return TUI_LABELS[locale];
}

export function formatTuiLabel(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value;
}

function readEnvironmentLocale(env: Record<string, string | undefined>): string | undefined {
  const explicitLocale = env['NEKO_LOCALE'];
  if (explicitLocale && explicitLocale.trim().length > 0) {
    return explicitLocale;
  }

  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANGUAGE', 'LANG'] as const) {
    const value = env[key];
    if (value && value.trim().length > 0 && !isNeutralLocale(value)) {
      return value;
    }
  }
  return undefined;
}

function detectHostLocale(): string | undefined {
  if (hostLocaleCache !== undefined) {
    return hostLocaleCache ?? undefined;
  }

  hostLocaleCache =
    process.platform === 'darwin' ? detectMacOsLocale() : (detectIntlLocale() ?? null);
  return hostLocaleCache ?? undefined;
}

function detectIntlLocale(): string | undefined {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return locale && !isNeutralLocale(locale) ? locale : undefined;
}

function detectMacOsLocale(): string | undefined {
  const appleLocale = readDefaultsValue(['read', '-g', 'AppleLocale']);
  if (appleLocale && !isNeutralLocale(appleLocale)) {
    return appleLocale;
  }

  const appleLanguages = readDefaultsValue(['read', '-g', 'AppleLanguages']);
  return appleLanguages ? readFirstLocaleToken(appleLanguages) : detectIntlLocale();
}

function readDefaultsValue(args: readonly string[]): string | undefined {
  try {
    return execFileSync('defaults', [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function readFirstLocaleToken(value: string): string | undefined {
  const match = value.match(/"([^"]+)"|([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)/);
  return match?.[1] ?? match?.[2];
}

function isNeutralLocale(value: string): boolean {
  const normalized = value.trim();
  return /^(?:C|POSIX)(?:[._-].*)?$/i.test(normalized);
}
