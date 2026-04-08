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
  'table.header.duration': 'Duration',

  // Creative grid view
  'grid.empty': 'Open a screenplay file to show the creative view',
  'grid.noScenes': 'No scene headings found (lines starting with INT./EXT.)',
  'grid.scenes': '{count} scenes',
  'grid.estDuration': 'Est. {duration}',
  'grid.generated': '{done}/{total} generated',
  'grid.notGenerated': 'Not generated',
} satisfies MessageBundle;
