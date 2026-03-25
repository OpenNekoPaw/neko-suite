/**
 * English translations for neko-assets
 */

export const en = {
  // Media Library Management
  'mediaLibrary.add.title': 'Select media library directory',
  'mediaLibrary.add.namePrompt': 'Enter a name for this media library',
  'mediaLibrary.add.namePlaceholder': 'e.g., Team Footage',
  'mediaLibrary.add.variablePrompt': 'Enter a variable name (used as ${VARIABLE} in paths)',
  'mediaLibrary.add.variablePlaceholder': 'e.g., TEAM_FOOTAGE',
  'mediaLibrary.add.variableError': 'Variable must be UPPER_SNAKE_CASE',
  'mediaLibrary.add.success': 'Media library "{name}" added',
  'mediaLibrary.add.error': 'Failed to add library: {error}',

  'mediaLibrary.remove.selectTitle': 'Select library to remove',
  'mediaLibrary.remove.success': 'Media library removed',

  'mediaLibrary.override.selectTitle': 'Select library to set local override',
  'mediaLibrary.override.dialogTitle': 'Select local path for ${variable}',
  'mediaLibrary.override.success': 'Local override set for ${variable}',

  'mediaLibrary.import.success': 'Imported: {name}',
  'mediaLibrary.import.successMultiple': 'Imported {count} files',

  'mediaLibrary.copyPath.success': 'File path copied to clipboard',

  'mediaLibrary.placeholder': 'No media libraries configured',
  'mediaLibrary.placeholder.action': 'Add Media Library',

  'mediaLibrary.status.online': 'Status: Online',
  'mediaLibrary.status.offline': 'Status: Offline',

  'mediaLibrary.fileCount': '{count} file',
  'mediaLibrary.fileCount.plural': '{count} files',

  // Search
  'mediaLibrary.search.placeholder': 'Search media files across all libraries...',
  'mediaLibrary.search.noResults': 'No matching files found',
  'mediaLibrary.search.scanning': 'Scanning media libraries...',

  // Commands
  'command.previewVideo': 'Preview Video',
  'command.previewAudio': 'Preview Audio',
  'command.openFile': 'Open File',

  // Metadata tooltips
  'metadata.resolution': 'Resolution',
  'metadata.duration': 'Duration',
  'metadata.frameRate': 'Frame Rate',
  'metadata.codec': 'Codec',
  'metadata.size': 'Size',
  'metadata.sampleRate': 'Sample Rate',
  'metadata.channels': 'Channels',
  'metadata.bitrate': 'Bitrate',
};

export type AssetTranslations = typeof en;
