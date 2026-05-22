import type { MessageBundle } from '@neko/shared';

export const en: MessageBundle = {
  // Animation panel
  'puppet.panel.animation': 'Animation',
  'puppet.animation.noClips': 'No animation clips',
  'puppet.animation.liveStream': 'Live stream active',
  'puppet.animation.stop': 'Stop animation',
  'puppet.animation.play': 'Play animation',
  'puppet.animation.seek': 'Seek position',
  'puppet.animation.disablePhysics': 'Disable physics',
  'puppet.animation.enablePhysics': 'Enable physics',
  'puppet.animation.disablePhysicsSim': 'Disable physics simulation',
  'puppet.animation.enablePhysicsSim': 'Enable physics simulation',

  // Crossfade
  'puppet.animation.fadeDuration': 'Fade',

  // Parameter panel
  'puppet.panel.parameters': 'Parameters',
  'puppet.parameter.resetDefault': 'Reset to default',
  'puppet.parameter.resetParam': 'Reset {name} to default',

  // Control drivers
  'puppet.panel.controlDrivers': 'Control Drivers',
  'puppet.controlDriver.priority': 'Priority',
  'puppet.controlDriver.curvePreview': 'Control driver curve preview',

  // Morph editor
  'puppet.panel.morph': 'Morph Targets',
  'puppet.morph.noTargets': 'No morph targets',
  'puppet.morph.play': 'Play morph animation',
  'puppet.morph.stop': 'Stop morph animation',
  'puppet.morph.stopped': 'Stopped',

  // Import
  'puppet.import.title': 'Import Puppet (.moc3)',
  'puppet.import.dropHint': 'Drop .moc3 file or click to import',

  // Empty state
  'puppet.empty.hint': 'Drop .moc3 file here or choose an option below',
  'puppet.empty.import': 'Import MOC3',
  'puppet.empty.templateBlank': 'Blank Skeleton',
  'puppet.empty.templateHumanoid': 'Simple Humanoid',

  // Status
  'puppet.status.ready': 'Ready',
  'puppet.status.loading': 'Loading puppet...',
  'puppet.status.loaded': 'Puppet loaded',
  'puppet.status.loadFailed': 'Failed to load puppet',
  'puppet.status.engineUnavailable':
    'Neko Engine is not available. Start the engine and reopen the puppet.',
};
