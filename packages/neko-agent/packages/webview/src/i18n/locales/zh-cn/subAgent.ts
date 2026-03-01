import type { MessageBundle } from '@neko/shared';

export const subAgent = {
  'subAgent.title': '子代理',
  'subAgent.running': '运行中',
  'subAgent.expand': '展开子代理',
  'subAgent.collapse': '收起子代理',
  'subAgent.cancel': '取消子代理',
  'subAgent.status.pending': '等待中',
  'subAgent.status.running': '运行中',
  'subAgent.status.completed': '已完成',
  'subAgent.status.failed': '失败',
  'subAgent.status.cancelled': '已取消',
} as const satisfies MessageBundle;
