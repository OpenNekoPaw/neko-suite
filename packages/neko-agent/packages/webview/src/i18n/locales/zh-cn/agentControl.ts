import type { MessageBundle } from '@neko/shared';

export const agentControl = {
  'agentControl.title': 'Agent 会话',
  'agentControl.summaryActive': '活跃',
  'agentControl.summaryTotal': '总计',
  'agentControl.stopAll': '停止全部',
  'agentControl.clearIdle': '清除空闲',
  'agentControl.running': '运行中',
  'agentControl.idle': '空闲',
  'agentControl.noSessions': '无会话',
  'agentControl.noSessionsHint': '开始对话以查看 Agent 活动',
  'agentControl.untitled': '未命名',
  'agentControl.queued': '排队中',
  'agentControl.navigate': '跳转到对话',
  'agentControl.stop': '停止',
  'agentControl.phase.idle': '空闲',
  'agentControl.phase.thinking': '思考中',
  'agentControl.phase.acting': '执行中',
  'agentControl.phase.streaming': '输出中',
} as const satisfies MessageBundle;
