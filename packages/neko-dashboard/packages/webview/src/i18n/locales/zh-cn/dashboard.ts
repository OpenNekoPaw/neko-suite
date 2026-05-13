import type { MessageBundle } from '@neko/shared';

export const dashboard = {
  'dashboard.title': 'Neko 工作台',

  'dashboard.status.engine': '引擎',
  'dashboard.status.projects': '项目',
  'dashboard.status.agent': '智能体',
  'dashboard.status.assets': '素材',
  'dashboard.status.ready': '就绪',
  'dashboard.status.running': '{running}/{total} 运行中',
  'dashboard.status.files': '{count} 个文件',

  'dashboard.quickStart': '快速开始',
  'dashboard.quickStart.video': '新建视频',
  'dashboard.quickStart.canvas': '新建画布',
  'dashboard.quickStart.sketch': '新建绘画',
  'dashboard.quickStart.audio': '新建音频',
  'dashboard.quickStart.model': '新建模型',
  'dashboard.quickStart.puppet': '新建动画',
  'dashboard.quickStart.ai': '打开对话',

  'dashboard.workflows': '创作工作流',

  'dashboard.workflow.filmmaking': '影视制作',
  'dashboard.workflow.filmmaking.desc': '视频剪辑、音频混音、AI 生成与增强',
  'dashboard.workflow.filmmaking.tags': '视频, 音频, AI 生成',

  'dashboard.workflow.screenwriting': '剧本创作',
  'dashboard.workflow.screenwriting.desc': '剧本编辑与智能补全、分镜生成、一键转时间线',
  'dashboard.workflow.screenwriting.tags': '剧本, 分镜, AI 编剧',

  'dashboard.workflow.visual': '视觉创作',
  'dashboard.workflow.visual.desc': '压感手绘、画布合成、AI 图像生成',
  'dashboard.workflow.visual.tags': '绘画, 画布, AI 绘图',

  'dashboard.workflow.modeling': '3D / 角色',
  'dashboard.workflow.modeling.desc': '3D 建模编辑、角色捏脸、GPU 实时视口',
  'dashboard.workflow.modeling.tags': '建模, 捏脸, AI 角色',

  'dashboard.workflow.animation': '动画 / Live',
  'dashboard.workflow.animation.desc': '2D 骨骼动画、实时动作捕捉、虚拟形象直播',
  'dashboard.workflow.animation.tags': '动画, 直播, 动捕',

  'dashboard.workflow.ai': 'AI 助手',
  'dashboard.workflow.ai.desc': '多模型对话、图像/视频/音频生成、多模态分析',
  'dashboard.workflow.ai.tags': '对话, 生成, 分析',

  'dashboard.workflow.unavailable': '扩展未安装',

  'dashboard.skills': '已安装技能',
  'dashboard.skills.empty': '暂无可用技能。安装 Neko 套件扩展以解锁 AI 能力。',
} as const satisfies MessageBundle;
