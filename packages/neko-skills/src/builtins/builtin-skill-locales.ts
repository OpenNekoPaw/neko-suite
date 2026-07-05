import type { Skill, SkillLocalizedText } from '@neko/shared';
import { normalizeBuiltinSkillLocale } from './builtin-skill-content';

export type BuiltinSkillLocaleMap = Readonly<Record<string, SkillLocalizedText>>;

export const builtinSkillLocales: Readonly<Record<string, BuiltinSkillLocaleMap>> = {
  'creation-persona': {
    'zh-cn': {
      name: '创作人格',
      description:
        'IDC Draft / Plan 阶段的共创伙伴，用于理解创作意图、提出方向、收集反馈，并把技术进展转成用户可读叙述。',
      tags: ['创作', '共创', '计划'],
    },
  },
  'execution-persona': {
    'zh-cn': {
      name: '执行人格',
      description:
        'IDC Apply 阶段的系统操作员，用于执行已批准 Draft、调用工具、提交变更、处理错误和运行自动修复链。',
      tags: ['执行', 'Apply', '自动修复'],
    },
  },
  'iteration-persona': {
    'zh-cn': {
      name: '迭代人格',
      description:
        '面向一致性问题的窄范围迭代伙伴，用于诊断漂移镜头、提出局部重跑范围和提示词/参考修改方案。',
      tags: ['迭代', '一致性', '局部重跑'],
    },
  },
  'ai-generate': {
    'zh-cn': {
      name: 'AI 媒体生成',
      description: '生成图片、视频、语音和背景音乐等 AI 媒体内容。',
      tags: ['AI', '生成'],
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
  'comic-to-storyboard': {
    'zh-cn': {
      name: '漫画转分镜表',
      description: '分析漫画或分镜页，提取画格、对白和镜头信息并转换为结构化分镜表。',
      tags: ['AI', '漫画', '分镜'],
    },
  },
  'comic-to-animation': {
    'zh-cn': {
      name: '漫画转动画',
      description: '编排漫画分镜、镜头图像准备、生成审批、Canvas 审阅、Cut 装配和导出交接。',
      tags: ['AI', '漫画', '动画', '视频'],
    },
  },
  'media-to-video': {
    'zh-cn': {
      name: '媒体转视频',
      description: '根据素材类型编排漫画分镜、图片转镜头、动画计划、Cut 装配和导出子技能。',
      tags: ['AI', '视频', '编排', '分镜'],
    },
  },
  'image-to-shot': {
    'zh-cn': {
      name: '图片转镜头',
      description: '将静态图片或图像序列转换为结构化镜头计划与分镜表行。',
      tags: ['AI', '图片', '镜头', '分镜'],
    },
  },
  'storyboard-to-animation-plan': {
    'zh-cn': {
      name: '分镜转动画计划',
      description: '把 StoryboardTable 分镜表转换为包含运动、镜头、生成和连续性建议的动画计划。',
      tags: ['AI', '分镜', '动画', '镜头'],
    },
  },
  'animation-plan-to-cut': {
    'zh-cn': {
      name: '动画计划转 Cut',
      description: '将已验证的动画计划或分镜表投射为可装配到 NekoCut 时间线的载荷。',
      tags: ['Cut', '时间线', '装配'],
    },
  },
  'generated-shot-assembly': {
    'zh-cn': {
      name: '生成镜头装配',
      description: '把生成的图片、视频、音频和字幕引用整理为一致的媒体转视频执行摘要。',
      tags: ['AI', '装配', '生成素材'],
    },
  },
  'export-video-package': {
    'zh-cn': {
      name: '视频导出打包',
      description: '为最终视频产物准备交付、导出或打包信息，并附带验证诊断。',
      tags: ['导出', '视频', '交付'],
    },
  },
  'quality-assessment': {
    'zh-cn': {
      name: '质量检查',
      description: '检查媒体质量、伪影、响度、提示词匹配和风格漂移，并给出修复建议。',
      tags: ['AI', '质量', '检查'],
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
