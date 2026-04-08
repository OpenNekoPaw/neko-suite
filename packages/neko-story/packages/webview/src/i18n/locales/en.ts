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
  'table.header.number': 'Scene #',
  'table.header.heading': 'Scene Heading',
  'table.header.intExt': 'I/E',
  'table.header.location': 'Location',
  'table.header.time': 'Time',
  'table.header.characters': 'Characters',
  'table.header.duration': 'Duration',
  'table.header.agent': 'Agent Status',
  'table.header.canvas': 'Canvas Status',
  'table.header.action': 'Action',
  'table.status.agent.pending': 'Pending',
  'table.status.agent.ready': 'Analysed',
  'table.status.agent.review': 'Needs Review',
  'table.status.agent.sent': 'Sent',
  'table.status.canvas.pending': 'Not Sent',
  'table.status.canvas.queued': 'Queued',
  'table.status.canvas.sent': 'Sent',
  'table.status.canvas.opened': 'Opened',
  'table.status.skipped': 'Skipped',
  'table.action.jump': 'Jump',
  'table.action.analyze': 'Analyse',
  'table.action.storyboard': 'Storyboard',
  'table.action.canvas': 'Send to Canvas',
  'table.action.openCanvas': 'Open Canvas',
  'table.action.skip': 'Skip',
  'table.action.unskip': 'Unskip',

  // Creative grid view
  'grid.empty': 'Open a screenplay file to show the creative view',
  'grid.noScenes': 'No scene headings found (lines starting with INT./EXT.)',
  'grid.scenes': '{count} scenes',
  'grid.estDuration': 'Est. {duration}',
  'grid.generated': '{done}/{total} generated',
  'grid.notGenerated': 'Not generated',
} satisfies MessageBundle;
