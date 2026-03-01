import type { MessageBundle } from '@neko/shared';

export const subAgent = {
  'subAgent.title': 'SubAgents',
  'subAgent.running': 'running',
  'subAgent.expand': 'Expand SubAgents',
  'subAgent.collapse': 'Collapse SubAgents',
  'subAgent.cancel': 'Cancel SubAgent',
  'subAgent.status.pending': 'Pending',
  'subAgent.status.running': 'Running',
  'subAgent.status.completed': 'Completed',
  'subAgent.status.failed': 'Failed',
  'subAgent.status.cancelled': 'Cancelled',
} as const satisfies MessageBundle;
