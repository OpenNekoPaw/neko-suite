export const STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID = 'creative-table.storyboard';

export const STORYBOARD_CREATIVE_TABLE_HEADERS = [
  'scene',
  'shot',
  'source',
  'sourcePanel',
  'decision',
  'duration',
  'visual',
  'motion',
  'audio',
  'characters',
  'dialogue',
  'prompt',
  'reviewStatus',
  'nextAction',
  'contentType',
  'decisionReason',
  'requiresSplit',
  'duplicateOf',
] as const;

export type StoryboardCreativeTableHeader = (typeof STORYBOARD_CREATIVE_TABLE_HEADERS)[number];

export interface StoryboardCreativeTableFieldDescriptor {
  readonly id: StoryboardCreativeTableHeader;
  readonly label: {
    readonly en: string;
    readonly 'zh-cn': string;
  };
  readonly aliases: readonly string[];
}

export const STORYBOARD_CREATIVE_TABLE_FIELDS: readonly StoryboardCreativeTableFieldDescriptor[] = [
  {
    id: 'scene',
    label: { en: 'Scene', 'zh-cn': '场景' },
    aliases: ['scene', '场景', '场次'],
  },
  {
    id: 'shot',
    label: { en: 'Shot', 'zh-cn': '镜头' },
    aliases: ['shot', 'shot id', 'shotid', '镜头', '镜头编号', '镜号', '分镜'],
  },
  {
    id: 'source',
    label: { en: 'Source', 'zh-cn': '来源' },
    aliases: [
      'source',
      'image',
      'images',
      'resource',
      'reference',
      'ref',
      'media',
      '来源',
      '源页',
      '来源页',
      '图片',
      '图像',
      '图像引用',
      '素材',
      '参考图',
    ],
  },
  {
    id: 'sourcePanel',
    label: { en: 'Source Panel', 'zh-cn': '来源分格' },
    aliases: [
      'sourcepanel',
      'source panel',
      'panel',
      'panel ref',
      'panelref',
      '来源分格',
      '分格',
      '分格位置',
      '对应分格',
      '裁切',
    ],
  },
  {
    id: 'decision',
    label: { en: 'Decision', 'zh-cn': '决策' },
    aliases: ['decision', 'keep skip split', '保留决策', '决策', '处理', '画面判断'],
  },
  {
    id: 'duration',
    label: { en: 'Duration', 'zh-cn': '时长' },
    aliases: ['duration', 'time', 'seconds', '时长', '时长秒', '时长建议'],
  },
  {
    id: 'visual',
    label: { en: 'Visual', 'zh-cn': '画面' },
    aliases: [
      'visual',
      'visual description',
      'visualdescription',
      'description',
      'content',
      '画面',
      '画面内容',
      '画面描述',
      '视觉',
      '分镜建议',
    ],
  },
  {
    id: 'motion',
    label: { en: 'Motion', 'zh-cn': '运镜' },
    aliases: [
      'motion',
      'camera',
      'camera movement',
      'cameramovement',
      '运镜',
      '镜头运动',
      '运动建议',
      '动作与节奏',
    ],
  },
  {
    id: 'audio',
    label: { en: 'Audio', 'zh-cn': '音频' },
    aliases: ['audio', 'sound', 'sfx', '音频', '声音', '音效', '声音/氛围', '氛围'],
  },
  {
    id: 'characters',
    label: { en: 'Characters', 'zh-cn': '人物' },
    aliases: ['characters', 'character', 'cast', '人物', '角色'],
  },
  {
    id: 'dialogue',
    label: { en: 'Dialogue', 'zh-cn': '对白' },
    aliases: ['dialogue', 'voiceover', 'voice over', 'text', '台词', '旁白', '对白', '文本/对白'],
  },
  {
    id: 'prompt',
    label: { en: 'Prompt', 'zh-cn': '提示词' },
    aliases: [
      'prompt',
      'generation prompt',
      'generationprompt',
      'visual prompt',
      '提示词',
      '生成提示词',
      '视觉提示词',
      '图像提示词',
      '动画化提示',
    ],
  },
  {
    id: 'reviewStatus',
    label: { en: 'Review Status', 'zh-cn': '审阅状态' },
    aliases: ['reviewstatus', 'review status', 'status', '审阅状态', '状态'],
  },
  {
    id: 'nextAction',
    label: { en: 'Next Action', 'zh-cn': '建议操作' },
    aliases: [
      'nextaction',
      'next action',
      'action',
      'operation',
      '执行',
      '下一步',
      '下一步操作',
      '建议操作',
      '操作',
    ],
  },
  {
    id: 'contentType',
    label: { en: 'Content Type', 'zh-cn': '内容类型' },
    aliases: ['contenttype', 'content type', 'type', '内容类型', '类型'],
  },
  {
    id: 'decisionReason',
    label: { en: 'Decision Reason', 'zh-cn': '决策理由' },
    aliases: ['decisionreason', 'decision reason', 'reason', '决策理由', '原因', '备注'],
  },
  {
    id: 'requiresSplit',
    label: { en: 'Requires Split', 'zh-cn': '需要拆分' },
    aliases: ['requiressplit', 'requires split', 'split', '需要拆分', '是否拆分', '拆分'],
  },
  {
    id: 'duplicateOf',
    label: { en: 'Duplicate Of', 'zh-cn': '重复来源' },
    aliases: ['duplicateof', 'duplicate of', 'duplicate', '重复来源', '重复于', '去重'],
  },
] as const;

const STORYBOARD_CREATIVE_TABLE_FIELD_BY_NORMALIZED_ALIAS = new Map(
  STORYBOARD_CREATIVE_TABLE_FIELDS.flatMap((field) => [
    [normalizeStoryboardCreativeTableHeader(field.id), field.id] as const,
    ...field.aliases.map(
      (alias) => [normalizeStoryboardCreativeTableHeader(alias), field.id] as const,
    ),
  ]),
);

export function normalizeStoryboardCreativeTableHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function resolveStoryboardCreativeTableHeader(
  value: string,
): StoryboardCreativeTableHeader | undefined {
  return STORYBOARD_CREATIVE_TABLE_FIELD_BY_NORMALIZED_ALIAS.get(
    normalizeStoryboardCreativeTableHeader(value),
  );
}
