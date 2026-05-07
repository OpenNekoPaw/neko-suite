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
  'table.totalDuration': '预计总时长 {duration}',
  'table.header.scene': '场景',
  'table.header.status': '状态',
  'table.header.action': '操作',
  'tab.screenplay': '剧本预览',
  'tab.table': '分镜表',

  // Unified 5-state (creator perspective)
  'table.status.pending': '待开始',
  'table.status.processing': '处理中',
  'table.status.attention': '需关注',
  'table.status.done': '已完成',
  'table.status.skipped': '已跳过',

  // Hover detail for processing/attention states
  'table.status.detail.analyzing': '正在分析…',
  'table.status.detail.generating': '正在生成…',
  'table.status.detail.sending': '正在派发…',
  'table.status.detail.failed': '生成失败',
  'table.status.detail.review': '需要审核',

  // Context-driven primary action
  'table.action.start': '开始',
  'table.action.view': '查看',
  'table.action.retry': '重试',
  'table.action.review': '审核',
  'table.action.restore': '恢复',

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
  'table.summary.progress': '{done}/{total} 已完成',
  'table.batch.startAll': '全部开始',
} satisfies MessageBundle;
