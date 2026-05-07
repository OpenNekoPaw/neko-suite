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
  'table.header.scene': 'Scene',
  'table.header.status': 'Status',
  'table.header.action': 'Action',
  'tab.screenplay': 'Screenplay',
  'tab.table': 'Breakdown',

  // Unified 5-state (creator perspective)
  'table.status.pending': 'Pending',
  'table.status.processing': 'Processing',
  'table.status.attention': 'Needs Attention',
  'table.status.done': 'Done',
  'table.status.skipped': 'Skipped',

  // Hover detail for processing/attention states
  'table.status.detail.analyzing': 'Analysing…',
  'table.status.detail.generating': 'Generating…',
  'table.status.detail.sending': 'Sending to canvas…',
  'table.status.detail.failed': 'Generation failed',
  'table.status.detail.review': 'Needs review',

  // Context-driven primary action
  'table.action.start': 'Start',
  'table.action.view': 'View',
  'table.action.retry': 'Retry',
  'table.action.review': 'Review',
  'table.action.restore': 'Restore',

  // Dropdown menu items
  'table.action.more': 'More',
  'table.action.analyze': 'Analyse',
  'table.action.storyboard': 'Storyboard',
  'table.action.sendToCanvas': 'Send to Canvas',
  'table.action.openCanvas': 'Open Canvas',
  'table.action.skip': 'Skip',
  'table.action.unskip': 'Unskip',
  'table.action.restart': 'Restart',

  // Summary bar
  'table.summary.progress': '{done}/{total} done',
  'table.batch.startAll': 'Start All',
} satisfies MessageBundle;
