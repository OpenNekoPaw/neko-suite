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
  'table.header.number': '场景编号',
  'table.header.heading': '场景标题',
  'table.header.intExt': '景',
  'table.header.location': '地点',
  'table.header.time': '时',
  'table.header.characters': '角色',
  'table.header.duration': '时长',
  'table.header.agent': 'Agent 状态',
  'table.header.canvas': 'Canvas 状态',
  'table.header.action': '操作',
  'table.status.agent.pending': '未分析',
  'table.status.agent.ready': '已分析',
  'table.status.agent.review': '待确认',
  'table.status.agent.sent': '已发送',
  'table.status.canvas.pending': '未派发',
  'table.status.canvas.queued': '待生成',
  'table.status.canvas.sent': '已发送',
  'table.status.canvas.opened': '已打开',
  'table.status.skipped': '已跳过',
  'table.action.jump': '跳转',
  'table.action.analyze': '分析',
  'table.action.storyboard': '分镜',
  'table.action.canvas': '发到 Canvas',
  'table.action.openCanvas': '打开 Canvas',
  'table.action.skip': '跳过',
  'table.action.unskip': '取消跳过',

  // Creative grid view
  'grid.empty': '打开剧本文件以显示创意视图',
  'grid.noScenes': '未找到场景标题（以 INT./EXT. 开头的行）',
  'grid.scenes': '{count} 个场景',
  'grid.estDuration': '预计 {duration}',
  'grid.generated': '{done}/{total} 已生成',
  'grid.notGenerated': '未生成',
} satisfies MessageBundle;
