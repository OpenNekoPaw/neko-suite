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
  'table.header.scene': 'Scene',
  'table.header.characters': 'Characters',
  'tab.screenplay': 'Screenplay',
  'tab.table': 'Breakdown',

  // Blocking details surfaced from Agent / Canvas state
  'table.status.detail.failed': 'Generation failed',
  'table.status.detail.review': 'Needs review',
  'table.visualStatus.bound': 'Bound',
  'table.visualStatus.generated': 'Generated',
  'table.visualStatus.missing': 'Missing visual',
  'table.visualStatus.unresolved': 'Unresolved',
  'table.visualStatus.stale': 'Needs confirmation',
  'table.visualStatus.unknown': 'Unknown',
  'table.visualStatus.referenced': 'Referenced',
  'table.character.sendToAgent': 'Send to Agent',
  'table.character.missingReason.assetsUnavailable':
    'Asset service is unavailable, so the character visual cannot be confirmed yet',
  'table.character.missingReason.missingVisual': 'No usable character visual is available',
  'table.character.missingReason.unresolvedCharacter':
    'Script character is not bound to characters.json',
  'table.character.missingReason.staleVisual':
    'Character record is outdated; confirm whether the visual is still valid',
  'table.missingInput.unresolvedCharacter': '{name} is not bound to a character identity',
  'table.missingInput.characterVisual': '{name} is missing a character visual',
  'table.missingInput.characterVisualUnknown': '{name} character visual status is unknown',
  'table.missingInput.location': 'Scene location is missing',
  'table.missingInput.duration': 'Reliable scene duration is missing',
  'table.missingInput.canvasHandoff': 'Not sent to Canvas yet',
  'table.canvasProgress': 'Canvas {done}/{total}',
  'table.sceneIssues.skipped': 'Skipped',

  // Context-driven primary action
  'table.action.start': 'Start',
  'table.action.view': 'View',
  'table.action.retry': 'Retry',
  'table.action.review': 'Review',
  'table.action.restore': 'Restore',
  'table.action.startScene': 'Process Scene Only',

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
  'table.selection.all': 'All scenes',
  'table.selection.selected': '{count} selected',
  'table.selection.allRows': 'Select all scenes',
  'table.selection.row': 'Select {scene}',
  'table.batch.sendTableToAgent': 'Send Table to Agent',
  'table.batch.sendSelectedToAgent': 'Send Selected to Agent',
} satisfies MessageBundle;
