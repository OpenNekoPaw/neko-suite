import type { Skill, SkillLocalizedText } from '@neko/shared';
import { normalizeBuiltinSkillLocale } from './builtin-skill-content';

export type BuiltinSkillLocaleMap = Readonly<Record<string, SkillLocalizedText>>;

export const builtinSkillLocales: Readonly<Record<string, BuiltinSkillLocaleMap>> = {
  storyboard: {
    'zh-cn': {
      name: '分镜',
      description:
        '从提示词、文本、剧本、文档、漫画、图片序列或已有修订版创建 canonical Storyboard。',
      tags: ['分镜', '镜头', '来源归一化'],
    },
  },
  image: {
    'zh-cn': {
      name: '图片',
      description: '通过 capability-neutral 操作生成、编辑、扩展、增强、融合、上色或切分图片。',
      tags: ['图片', '生成', '编辑'],
    },
  },
  video: {
    'zh-cn': {
      name: '视频',
      description: '从提示词、图片、关键帧或参考视频生成和转换单个视频片段。',
      tags: ['视频', '生成', '转换'],
    },
  },
  'media-production': {
    'zh-cn': {
      name: '媒体制作',
      description:
        '编排从来源归一化、分镜、生成和质量 Gate 到项目 authoring、导出与交付验证的完整流程。',
      tags: ['媒体制作', '编排', '导出'],
    },
  },
  'media-quality-review': {
    'zh-cn': {
      name: '媒体质量审查',
      description: '使用修订版绑定证据和策略 Gate 审查创作素材、项目、成片与导出交付物。',
      tags: ['媒体质量', '证据', 'Gate'],
    },
  },
  'skill-creator': {
    'zh-cn': {
      name: 'Skill 创建指导',
      description: '指导设计、创建、改进、验证和 forward-test 可复用、可移植的 Agent Skill 包。',
      tags: ['Agent', 'Skill', '创作'],
    },
  },
  'scene-to-music': {
    'zh-cn': {
      name: '场景配乐',
      description: '分析时间线场景并生成匹配的背景音乐，然后插入为音频轨道。',
      tags: ['AI', '配乐', '时间线'],
    },
  },
  'video-editing': {
    'zh-cn': {
      name: '视频剪辑助手',
      description: '协助完成剪切、裁剪、转场、时间线调整、分割与合并片段等视频剪辑任务。',
      tags: ['AI', '剪辑', '时间线'],
    },
  },
  'color-grading': {
    'zh-cn': {
      name: '调色助手',
      description: '协助完成调色、校色、LUT、白平衡、曝光、对比度和电影感风格处理。',
      tags: ['AI', '调色', '视频'],
    },
  },
  'audio-mixing': {
    'zh-cn': {
      name: '音频混音助手',
      description: '协助调整音量、音乐、旁白、音效、标准化、淡入淡出和自动闪避。',
      tags: ['AI', '音频', '混音'],
    },
  },
  'subtitle-assistant': {
    'zh-cn': {
      name: '字幕助手',
      description: '协助添加字幕、创建说明文字、转写视频、翻译字幕并调整字幕时间轴。',
      tags: ['AI', '字幕', '转写'],
    },
  },
  'script-generation': {
    'zh-cn': {
      name: '剧本生成',
      description: '协助创作剧本、分镜脚本、对白和短片、广告、音乐视频等内容草稿。',
      tags: ['AI', '剧本', '写作'],
    },
  },
  'script-to-timeline': {
    'zh-cn': {
      name: '剧本转时间线',
      description: '将 Fountain 剧本转换为 NekoCut 时间线项目，生成场景和对白字幕轨道。',
      tags: ['AI', '剧本', '时间线'],
    },
  },
};

export function localizeBuiltinSkillCatalogText(skill: Skill, locale?: string): Skill {
  const normalizedLocale = normalizeBuiltinSkillLocale(locale);
  const localized = builtinSkillLocales[skill.name]?.[normalizedLocale];
  if (!localized?.description || containsCjk(skill.description)) {
    return skill;
  }

  return {
    ...skill,
    description: localized.description,
  };
}

function containsCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}
