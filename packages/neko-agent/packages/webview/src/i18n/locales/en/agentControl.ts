import type { MessageBundle } from '@neko/shared';

export const agentControl = {
  'agentControl.title': 'Agent Sessions',
  'agentControl.summaryActive': 'Active',
  'agentControl.summaryTotal': 'Total',
  'agentControl.stopAll': 'Stop All',
  'agentControl.clearIdle': 'Clear Idle',
  'agentControl.running': 'Running',
  'agentControl.idle': 'Idle',
  'agentControl.noSessions': 'No open sessions',
  'agentControl.noSessionsHint': 'Open a conversation tab to see agent activity',
  'agentControl.untitled': 'Untitled',
  'agentControl.queued': 'queued',
  'agentControl.navigate': 'Switch to tab',
  'agentControl.stop': 'Stop',
  'agentControl.phase.idle': 'Idle',
  'agentControl.phase.thinking': 'Thinking',
  'agentControl.phase.acting': 'Acting',
  'agentControl.phase.streaming': 'Writing',
} as const satisfies MessageBundle;
