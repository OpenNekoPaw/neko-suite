import type { MessageBundle } from '@neko/shared';

export const en = {
  // Script renderer
  'script.empty.title': 'No Script Loaded',
  'script.empty.hint': 'Open a .fountain file to preview',
  'script.print.tooltip': 'Export as PDF (select "Save as PDF" in print dialog)',
  'script.print.label': 'Print / PDF',

  // Error boundary
  'error.title': 'Something went wrong',
  'error.retry': 'Try again',

  // Scene table view
  'table.empty': 'Open a screenplay file to generate a scene breakdown',
  'table.noScenes': 'No scene headings found (lines starting with INT./EXT.)',
  'table.scenes': '{count} scenes',
  'table.characters': '{count} characters',
  'table.totalDuration': 'Est. total {duration}',
  'table.header.heading': 'Scene',
  'table.header.characters': 'Characters',
  'table.header.status': 'Status',
  'table.header.action': 'Action',
  'tab.screenplay': 'Screenplay',
  'tab.table': 'Breakdown',
  'table.status.agent.pending': 'Pending',
  'table.status.agent.ready': 'Analysed',
  'table.status.agent.review': 'Needs Review',
  'table.status.agent.sent': 'Sent',
  'table.status.canvas.pending': 'Not Sent',
  'table.status.canvas.queued': 'Queued',
  'table.status.canvas.sent': 'Sent',
  'table.status.canvas.opened': 'Opened',
  'table.status.skipped': 'Skipped',
  'table.action.analyze': 'Analyse',
  'table.action.storyboard': 'Storyboard',
  'table.action.canvas': 'To Canvas',
  'table.action.openCanvas': 'Open Canvas',
  'table.action.skip': 'Skip',
  'table.action.unskip': 'Unskip',
} satisfies MessageBundle;
