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
  'table.scenes': '{count} 个场景',
  'table.characters': '{count} 个角色',
  'table.header.scene': '场景',
  'table.header.characters': '人物',
  'tab.screenplay': '剧本预览',
  'tab.table': '分镜表',

  // Blocking details surfaced from Agent / Canvas state
  'table.status.detail.failed': '生成失败',
  'table.status.detail.review': '需要审核',
  'table.visualStatus.bound': '已绑定',
  'table.visualStatus.generated': '已生成',
  'table.visualStatus.missing': '缺形象',
  'table.visualStatus.unresolved': '未绑定',
  'table.visualStatus.stale': '需确认',
  'table.visualStatus.unknown': '未知',
  'table.visualStatus.referenced': '有引用',
  'table.character.sendToAgent': '发送到 Agent',
  'table.character.missingReason.assetsUnavailable': '资产服务不可用，暂时无法确认人物形象',
  'table.character.missingReason.missingVisual': '缺少可用人物形象',
  'table.character.missingReason.unresolvedCharacter': '剧本角色未绑定到 characters.json',
  'table.character.missingReason.staleVisual': '人物记录已过期，需要确认形象是否仍可用',
  'table.missingInput.unresolvedCharacter': '{name} 未绑定角色身份',
  'table.missingInput.characterVisual': '{name} 缺少人物形象',
  'table.missingInput.characterVisualUnknown': '{name} 人物形象状态未知',
  'table.missingInput.location': '缺少场景地点信息',
  'table.missingInput.duration': '缺少可靠场景时长',
  'table.missingInput.canvasHandoff': '尚未发送到 Canvas',
  'table.canvasProgress': 'Canvas {done}/{total}',
  'table.sceneIssues.skipped': '已跳过',

  // Context-driven primary action
  'table.action.start': '开始',
  'table.action.view': '查看',
  'table.action.retry': '重试',
  'table.action.review': '审核',
  'table.action.restore': '恢复',
  'table.action.startScene': '仅处理本场',

  // Dropdown menu items
  'table.action.more': '更多',
  'table.action.analyze': '分析',
  'table.action.storyboard': '分镜',
  'table.action.sendToCanvas': '发送到画布',
  'table.action.openCanvas': '打开画布',
  'table.action.skip': '跳过',
  'table.action.unskip': '取消跳过',
  'table.action.restart': '重新开始',

  // Summary bar
  'table.selection.all': '全部场景',
  'table.selection.selected': '已选 {count} 个',
  'table.selection.allRows': '选择全部场景',
  'table.selection.row': '选择 {scene}',
  'table.batch.sendTableToAgent': '发送整表到 Agent',
  'table.batch.sendSelectedToAgent': '所选发送到 Agent',
} satisfies MessageBundle;
