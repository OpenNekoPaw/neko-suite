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
  'table.header.duration': '时长',

  // Creative grid view
  'grid.empty': '打开剧本文件以显示创意视图',
  'grid.noScenes': '未找到场景标题（以 INT./EXT. 开头的行）',
  'grid.scenes': '{count} 个场景',
  'grid.estDuration': '预计 {duration}',
  'grid.generated': '{done}/{total} 已生成',
  'grid.notGenerated': '未生成',
} satisfies MessageBundle;
