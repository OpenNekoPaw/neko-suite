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
  'table.title': 'Breakdown',
  'table.summary': 'Breakdown summary',
  'table.scenes': '{count} scenes',
  'table.characters': '{count} characters',
  'table.header.scene': 'Scene',
  'table.header.characters': 'Characters',
  'tab.screenplay': 'Screenplay',
  'tab.table': 'Breakdown',

  'table.visualStatus.bound': 'Bound',
  'table.visualStatus.generated': 'Generated',
  'table.visualStatus.missing': 'Missing visual',
  'table.visualStatus.unresolved': 'Unresolved',
  'table.visualStatus.stale': 'Needs confirmation',
  'table.visualStatus.unknown': 'Unknown',
  'table.visualStatus.referenced': 'Referenced',
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

  // Whole-table action
  'table.batch.sendTableToAgent': 'Analyze Table',
} satisfies MessageBundle;
