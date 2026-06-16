import type { MessageBundle } from '@neko/shared';

export const zhCN = {
  // Script renderer
  'script.empty.title': '未加载剧本',
  'script.empty.hint': '打开 .fountain 文件进行预览',
  'script.print.tooltip': '导出为 PDF（在打印对话框中选择「另存为 PDF」）',
  'script.print.label': '打印 / PDF',

  // Error boundary
  'error.title': '出了点问题',
  'error.retry': '重试',

  // Scene table view
  'table.empty': '打开剧本文件以生成分镜表',
  'table.noScenes': '未找到场景标题（以 INT./EXT. 开头的行）',
  'table.title': '分镜表',
  'table.summary': '分镜表统计',
  'table.scenes': '{count} 个场景',
  'table.characters': '{count} 个角色',
  'table.header.scene': '场景',
  'table.header.characters': '人物',
  'tab.screenplay': '剧本预览',
  'tab.table': '分镜表',

  'table.visualStatus.bound': '已绑定',
  'table.visualStatus.generated': '已生成',
  'table.visualStatus.missing': '缺形象',
  'table.visualStatus.unresolved': '未绑定',
  'table.visualStatus.stale': '需确认',
  'table.visualStatus.unknown': '未知',
  'table.visualStatus.referenced': '有引用',
  'table.character.missingReason.assetsUnavailable': '资产服务不可用，暂时无法确认人物形象',
  'table.character.missingReason.missingVisual': '缺少可用人物形象',
  'table.character.missingReason.unresolvedCharacter': '剧本角色未绑定到 characters.json',
  'table.character.missingReason.staleVisual': '人物记录已过期，需要确认形象是否仍可用',
  'table.missingInput.unresolvedCharacter': '{name} 未绑定角色身份',
  'table.missingInput.characterVisual': '{name} 缺少人物形象',
  'table.missingInput.characterVisualUnknown': '{name} 人物形象状态未知',
  'table.missingInput.location': '缺少场景地点信息',
  'table.missingInput.duration': '缺少可靠场景时长',

  // Whole-table action
  'table.batch.sendTableToAgent': '分析整表',
} satisfies MessageBundle;
