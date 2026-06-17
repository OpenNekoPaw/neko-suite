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
  'puppet.action.reset': 'Reset',
  'puppet.panel.parameters': 'Parameters',
  'puppet.panel.blendShapes': 'Blend Shapes',
  'puppet.panel.nodes': 'Nodes',
  'puppet.panel.runtime': 'Runtime',
  'puppet.parameter.resetDefault': 'Reset to default',
  'puppet.parameter.resetParam': 'Reset {name} to default',
  'puppet.nodes.treeLabel': 'Puppet nodes',
  'puppet.runtime.profile': 'Profile',
  'puppet.runtime.profile.live2d': 'Live2D Puppet',
  'puppet.runtime.profile.native': 'Neko Puppet',
  'puppet.runtime.adapter': 'Adapter',

  // Control drivers
  'puppet.panel.controlDrivers': 'Control Drivers',
  'puppet.controlDriver.priority': 'Priority',
  'puppet.controlDriver.curvePreview': 'Control driver curve preview',
  'puppet.controlDriver.source.blendShape': 'BlendShape',
  'puppet.controlDriver.source.expression': 'Expression',
  'puppet.controlDriver.source.tracking': 'Tracking',
  'puppet.controlDriver.source.live2d': 'Live2D',
  'puppet.controlDriver.target.bone': 'Bone',
  'puppet.controlDriver.target.position': 'position',
  'puppet.controlDriver.target.scale': 'scale',
  'puppet.controlDriver.target.blendShape': 'BlendShape',
  'puppet.controlDriver.curve.linear': 'linear',
  'puppet.controlDriver.curve.bezier': 'bezier',
  'puppet.controlDriver.curve.step': 'step',

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

  // Toolbar
  'puppet.toolbar.import': 'Import MOC3',
  'puppet.toolbar.export': 'Export puppet assets',
  'puppet.toolbar.package': 'Package project',
  'puppet.toolbar.fitView': 'Fit view',
  'puppet.toolbar.leftRail': 'Puppet workbench toolbar',
  'puppet.toolbar.viewportControls': 'Viewport controls',
  'puppet.toolbar.showRightPanel': 'Show right panel',
  'puppet.toolbar.hideRightPanel': 'Hide right panel',
  'puppet.toolbar.onionSkin': 'Onion skin',
  'puppet.rightDock.mode.label': 'Creation mode',
  'puppet.rightDock.mode.basic': 'Basic',
  'puppet.rightDock.mode.basic.description': 'AI-assisted posing and key parameters',
  'puppet.rightDock.mode.professional': 'Professional',
  'puppet.rightDock.mode.professional.description':
    'Node tree, control drivers, and animation tools',

  // Viewport and timeline
  'puppet.viewport.localPreview': 'Local preview',
  'puppet.keyframes.title': 'Keyframes',
  'puppet.keyframes.collapse': 'Collapse keyframe editor',
  'puppet.keyframes.expand': 'Expand keyframe editor',

  // Status
  'puppet.status.ready': 'Ready',
  'puppet.status.loading': 'Loading puppet...',
  'puppet.status.loaded': 'Puppet loaded',
  'puppet.status.loadFailed': 'Failed to load puppet',
  'puppet.status.engineUnavailable':
    'Neko Engine is not available. Start the engine and reopen the puppet.',
};
