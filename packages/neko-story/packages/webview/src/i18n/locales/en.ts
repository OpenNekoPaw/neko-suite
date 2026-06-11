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
  'table.header.duration': 'Duration',
  'table.header.characters': 'Characters',
  'table.header.status': 'Status',
  'table.header.progressIssues': 'Progress / Issues',
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
  'table.shotPlan': '{count} planned shots',
  'table.sceneIssues.none': 'No blocking issues',

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
  'table.summary.progress': '{done}/{total} done',
  'table.selection.all': 'All scenes',
  'table.selection.selected': '{count} selected',
  'table.selection.allRows': 'Select all scenes',
  'table.selection.row': 'Select {scene}',
  'table.batch.startAll': 'Start All',
  'table.batch.startSelected': 'Start Selected',
  'table.batch.sendToAgent': 'Send All to Agent',
  'table.batch.sendToCanvas': 'Send All to Canvas',
  'table.batch.generateStoryboard': 'Generate Storyboard Table',
  'table.batch.syncCanvas': 'Sync to Canvas',
  'table.batch.startVideo': 'Start Video Generation',
  'table.batch.sendSelectedToAgent': 'Send Selected to Agent',
  'table.batch.sendSelectedToCanvas': 'Send Selected to Canvas',
} satisfies MessageBundle;
