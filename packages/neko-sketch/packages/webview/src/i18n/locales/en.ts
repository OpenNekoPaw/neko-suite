import type { MessageBundle } from '@neko/shared';

export const en: MessageBundle = {
  // Toolbar tools
  'sketch.toolbar.brush': 'Brush',
  'sketch.toolbar.eraser': 'Eraser',
  'sketch.toolbar.select': 'Select',
  'sketch.toolbar.move': 'Move',
  'sketch.toolbar.shape': 'Shape',
  'sketch.toolbar.transform': 'Transform',
  'sketch.toolbar.eyedropper': 'Eyedropper',
  'sketch.toolbar.fill': 'Fill',
  'sketch.toolbar.zoom': 'Zoom',
  'sketch.toolbar.ariaLabel': 'Drawing tools',

  // Layer panel
  'sketch.layer.new': 'New Layer',
  'sketch.layer.delete': 'Delete Layer',
  'sketch.layer.duplicate': 'Duplicate Layer',
  'sketch.layer.mergeDown': 'Merge Down',
  'sketch.layer.flatten': 'Flatten Visible',
  'sketch.layer.group': 'Group Layers',
  'sketch.layer.ungroup': 'Ungroup',
  'sketch.panel.layers': 'Layers',
  'sketch.layer.add': 'Add layer',
  'sketch.layer.show': 'Show layer',
  'sketch.layer.hide': 'Hide layer',
  'sketch.layer.lock': 'Lock layer',
  'sketch.layer.unlock': 'Unlock layer',
  'sketch.layer.remove': 'Remove layer',

  // Brush panel
  'sketch.brush.pencil': 'Pencil',
  'sketch.brush.pen': 'Pen',
  'sketch.brush.watercolor': 'Watercolor',
  'sketch.brush.airbrush': 'Airbrush',
  'sketch.brush.eraser': 'Eraser',
  'sketch.brush.marker': 'Marker',
  'sketch.brush.pixel': 'Pixel',
  'sketch.panel.brush': 'Brush Settings',
  'sketch.brush.type': 'Type',
  'sketch.brush.size': 'Size: {size}px',
  'sketch.brush.opacity': 'Opacity: {opacity}%',

  // Color panel
  'sketch.panel.color': 'Color',
  'sketch.color.brushColor': 'Brush color',
  'sketch.color.colorLabel': 'Color {color}',

  // Filter panel
  'sketch.panel.filters': 'Filters',
  'sketch.filter.addFilter': 'Add Filter...',
  'sketch.filter.noFilters': 'No filters applied',
  'sketch.filter.remove': 'Remove filter',
  'sketch.filter.category.blur': 'Blur',
  'sketch.filter.category.color': 'Color',
  'sketch.filter.category.distort': 'Distort',
  'sketch.filter.category.stylize': 'Stylize',

  // Particle panel
  'sketch.panel.particles': 'Particles',
  'sketch.particle.togglePreview': 'Toggle particle preview',
  'sketch.particle.addEmitter': 'Add emitter',
  'sketch.particle.noEmitters': 'No emitters',
  'sketch.particle.remove': 'Remove {name}',
  'sketch.particle.shape': 'Shape',
  'sketch.particle.shapeLabel': 'Emitter shape',
  'sketch.particle.shape.point': 'Point',
  'sketch.particle.shape.line': 'Line',
  'sketch.particle.shape.circle': 'Circle',
  'sketch.particle.shape.rect': 'Rect',
  'sketch.particle.blend': 'Blend',
  'sketch.particle.blendLabel': 'Blend mode',
  'sketch.particle.blend.additive': 'Additive',
  'sketch.particle.blend.normal': 'Normal',
  'sketch.particle.blend.multiply': 'Multiply',
  'sketch.particle.rate': 'Rate',
  'sketch.particle.speed': 'Speed',
  'sketch.particle.size': 'Size',
  'sketch.particle.direction': 'Dir',
  'sketch.particle.spread': 'Spread',

  // Atmosphere panel
  'sketch.panel.atmosphere': 'Atmosphere',
  'sketch.atmosphere.preset': 'Preset',
  'sketch.atmosphere.presetLabel': 'Atmosphere preset',
  'sketch.atmosphere.preset.none': 'None',
  'sketch.atmosphere.preset.fog': 'Fog',
  'sketch.atmosphere.preset.rain': 'Rain',
  'sketch.atmosphere.preset.snow': 'Snow',
  'sketch.atmosphere.preset.fireflies': 'Fireflies',
  'sketch.atmosphere.preset.dust': 'Dust',
  'sketch.atmosphere.intensity': 'Intensity',
  'sketch.atmosphere.windX': 'Wind X',

  // Scene panel
  'sketch.panel.scene': 'Scene',
  'sketch.scene.selectScene': 'Select scene...',
  'sketch.scene.newScene': 'New scene',
  'sketch.scene.createScene': 'Create scene',
  'sketch.scene.useTemplate': 'Or use a template:',
  'sketch.scene.zoom': 'Zoom',
  'sketch.scene.cameraZoom': 'Camera zoom',
  'sketch.scene.layers': 'Layers',
  'sketch.scene.addLayer': 'Add scene layer',
  'sketch.scene.parallaxX': 'Parallax X',
  'sketch.scene.removeLayer': 'Remove {name}',
  'sketch.scene.deleteScene': 'Delete scene',
  'sketch.scene.activeScene': 'Active scene',
  'sketch.scene.defaultName': 'Scene {index}',
  'sketch.scene.defaultLayerName': 'Layer {index}',

  // Frame controls
  'sketch.panel.frames': 'Frames',
  'sketch.frame.newFrameLayer': '+ New Frame Layer',
  'sketch.frame.frameLayer': 'Frame layer',
  'sketch.frame.addFrameLayer': 'Add frame layer',
  'sketch.frame.addFrame': 'Add frame',
  'sketch.frame.addFrameKey': 'Add frame (F6)',
  'sketch.frame.addFrameButton': '+ Frame',
  'sketch.frame.addBlank': 'Add blank frame',
  'sketch.frame.addBlankButton': '+ Blank',
  'sketch.frame.duplicate': 'Duplicate frame',
  'sketch.frame.duplicateTooltip': 'Duplicate current frame',
  'sketch.frame.delete': 'Delete frame',
  'sketch.frame.deleteTooltip': 'Delete current frame',
  'sketch.frame.exportSpriteSheet': 'Export Sprite Sheet',
  'sketch.frame.exportSpriteSheetTooltip': 'Export as sprite sheet',

  // Morph editor
  'sketch.panel.morph': 'Morph Targets',
  'sketch.morph.noTargets': 'No morph targets',
  'sketch.morph.play': 'Play morph animation',
  'sketch.morph.stop': 'Stop morph animation',
  'sketch.morph.stopped': 'Stopped',

  // Vector toolbar
  'sketch.panel.vector': 'Vector Tools',
  'sketch.vector.sides': 'Sides',
  'sketch.vector.sidesLabel': 'Polygon sides',
  'sketch.vector.points': 'Points',
  'sketch.vector.pointsLabel': 'Star points',

  // Palette panel
  'sketch.panel.palette': 'Palette',
  'sketch.palette.select': 'Select palette',

  // File
  'sketch.file.import': 'Import',
  'sketch.file.export': 'Export',

  // Animation panel
  'sketch.panel.animation': 'Animation',
  'sketch.animation.noClips': 'No animation clips',
  'sketch.animation.liveStream': 'Live stream active',
  'sketch.animation.stop': 'Stop animation',
  'sketch.animation.play': 'Play animation',
  'sketch.animation.seek': 'Seek position',
  'sketch.animation.disablePhysics': 'Disable physics',
  'sketch.animation.enablePhysics': 'Enable physics',
  'sketch.animation.disablePhysicsSim': 'Disable physics simulation',
  'sketch.animation.enablePhysicsSim': 'Enable physics simulation',

  // Parameter panel
  'sketch.panel.parameters': 'Parameters',
  'sketch.parameter.resetDefault': 'Reset to default',
  'sketch.parameter.resetParam': 'Reset {name} to default',

  // Frame timeline
  'sketch.timeline.stop': 'Stop playback',
  'sketch.timeline.play': 'Play animation',
  'sketch.timeline.fps': 'FPS:',
  'sketch.timeline.fpsLabel': 'Frames per second',
  'sketch.timeline.onionSkin': 'Toggle onion skin (O)',
  'sketch.timeline.onionSkinLabel': 'Toggle onion skin',
  'sketch.timeline.frames': 'Animation frames',
  'sketch.timeline.frame': 'Frame {index}',
  'sketch.timeline.frameKey': 'Frame {index} (key)',

  // Scene templates
  'sketch.template.platformer': 'Platformer (3-layer parallax)',
  'sketch.template.topdownRpg': 'Top-Down RPG (2-layer)',
  'sketch.template.visualNovel': 'Visual Novel (BG + FG)',
  'sketch.template.sideScroller': 'Side Scroller (4-layer)',
  'sketch.template.layer.sky': 'Sky',
  'sketch.template.layer.mountains': 'Mountains',
  'sketch.template.layer.foreground': 'Foreground',
  'sketch.template.layer.ground': 'Ground',
  'sketch.template.layer.objects': 'Objects',
  'sketch.template.layer.background': 'Background',
  'sketch.template.layer.characters': 'Characters',
  'sketch.template.layer.farBg': 'Far BG',
  'sketch.template.layer.nearBg': 'Near BG',
  'sketch.template.layer.gameplay': 'Gameplay',

  // Default names
  'sketch.layer.defaultName': 'Layer {index}',
  'sketch.layer.copySuffix': '{name} copy',
  'sketch.layer.defaultGroup': 'Group',

  // Filter toggle
  'sketch.filter.toggle': 'Toggle {name}',

  // Sprite sheet player
  'sketch.panel.spritesheet': 'Sprite Sheet Player',
  'sketch.spritesheet.cols': 'Cols',
  'sketch.spritesheet.colsLabel': 'Grid columns',
  'sketch.spritesheet.rows': 'Rows',
  'sketch.spritesheet.rowsLabel': 'Grid rows',
  'sketch.spritesheet.importLabel': 'Import sprite sheet',
  'sketch.spritesheet.dropHint': 'Drop PNG (+ JSON) or click to import',
  'sketch.spritesheet.reimport': 'Drop or click to replace',
  'sketch.spritesheet.noFrames': 'No frames found in sprite sheet',
  'sketch.spritesheet.preview': 'Frame preview',
  'sketch.spritesheet.seek': 'Seek frame',
  'sketch.spritesheet.fps': 'FPS',
  'sketch.spritesheet.fpsLabel': 'Playback FPS',
  'sketch.spritesheet.play': 'Play animation',
  'sketch.spritesheet.stop': 'Stop animation',
  'sketch.spritesheet.frameList': 'Frame thumbnails',

  // Status bar
  'sketch.status.ready': 'Ready',
  'sketch.status.layers': 'layers',
};
