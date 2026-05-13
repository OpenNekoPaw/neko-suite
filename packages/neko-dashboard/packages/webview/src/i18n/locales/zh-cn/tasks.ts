import type { MessageBundle } from '@neko/shared';

export const tasks = {
  'tasks.title': '任务',
  'tasks.column.task': '任务',
  'tasks.column.source': '来源',
  'tasks.column.type': '类型',
  'tasks.column.status': '状态',
  'tasks.column.progress': '进度',
  'tasks.column.started': '开始时间',
  'tasks.column.actions': '操作',
  'tasks.empty': '暂无活跃任务。',
  'tasks.lane.running': '运行中 ({count})',
  'tasks.lane.queued': '排队中 ({count})',
  'tasks.lane.completed': '已完成 ({count})',
} as const satisfies MessageBundle;
