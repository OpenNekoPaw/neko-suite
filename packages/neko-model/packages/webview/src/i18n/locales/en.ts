import type { MessageBundle } from '@neko/shared';

export const en = {
  // App toolbar
  'toolbar.faceEditor': 'Face Editor',
  'toolbar.latencyTest': 'Latency Tester',
  'toolbar.vrmExpression': 'VRM Expression',
  'toolbar.boneExpression': 'Bone Expression',
  'toolbar.geometry': 'Geometry',
  'toolbar.text3d': '3D Text',
  'toolbar.csg': 'CSG',
  'toolbar.sculpt': 'Sculpt Brush',
  'toolbar.exportGlb': 'Export GLB',
  'toolbar.saveProject': 'Save Project',

  // Toolbar (continued)
  'toolbar.keyframes': 'Keyframes',
  'toolbar.qualityPreview': 'Engine Quality Preview',

  // Empty state
  'empty.hint': 'Open a .gltf, .glb, or .vrm file to view',
  'empty.dropHint': 'Drop .gltf, .glb, or .vrm file here, or choose an option below',
  'empty.emptyScene': 'This scene is empty. Add a template or import a model to start.',
  'empty.import': 'Import File',
  'empty.templateBlank': 'Blank Scene',
  'empty.templateHumanoid': 'Simple Humanoid',

  // Scene tree
  'sceneTree.title': 'Scene',

  // Animation player
  'animation.selectPlaceholder': '-- Select Animation --',
  'animation.play': 'Play',
  'animation.pause': 'Pause',
  'animation.stop': 'Stop',
  'animation.statusPlaying': 'Playing',
  'animation.statusPaused': 'Paused',
  'animation.statusStopped': 'Stopped',
  'animation.fade': 'Fade',
  'animation.unit': 's',

  // Transform panel
  'transform.noSelection': 'No node selected',
  'transform.mode': 'Transform Mode',
  'transform.position': 'Position',
  'transform.rotation': 'Rotation (XYZW)',
  'transform.scale': 'Scale',
  'transform.translate': 'Translate',
  'transform.rotate': 'Rotate',
  'transform.scaleMode': 'Scale',
  'transform.mesh': 'Mesh',
  'transform.light': 'Light',
  'transform.camera': 'Camera',
  'transform.skeleton': 'Skeleton',

  // Face editor
  'face.title': 'Face Editor',
  'face.random': 'Random',
  'face.reset': 'Reset',
  'face.aiGenerate': 'AI Generate',
  'face.paramCount': '{count} parameters',

  // Expression preset
  'expression.title': 'VRM Expression Preset',
  'expression.loadVrm': 'Please load a VRM model to use expression presets',
  'expression.apply': 'Apply Expression',
  'expression.footer': 'VRM 1.0 standard expression presets',

  // Bone expression
  'bone.title': 'Bone Expression',
  'bone.lipSync': 'Lip Sync',
  'bone.eyeTracking': 'Eye Tracking',
  'bone.eyebrow': 'Eyebrow',
  'bone.moveMouse': 'Move mouse',
  'bone.raise': 'Raise',
  'bone.lower': 'Lower',
  'bone.furrow': 'Furrow',

  // CSG panel
  'csg.title': 'CSG Boolean',
  'csg.operation': 'Operation',
  'csg.operandA': 'Operand A',
  'csg.operandB': 'Operand B',
  'csg.select': 'Select',
  'csg.confirm': 'Confirm',
  'csg.execute': 'Execute {operation}',
  'csg.union': 'Union',
  'csg.difference': 'Difference',
  'csg.intersection': 'Intersection',
  'csg.none': '(none)',
  'csg.sameMeshError': 'Operands must be different nodes',

  // Shape creator
  'shape.title': 'Shape Creator',
  'shape.shapeSection': 'Shape',
  'shape.parameters': 'Parameters',
  'shape.create': 'Create {shape}',
  'shape.cube': 'Cube',
  'shape.sphere': 'Sphere',
  'shape.cylinder': 'Cylinder',
  'shape.cone': 'Cone',
  'shape.torus': 'Torus',
  'shape.plane': 'Plane',

  // Text editor
  'textMesh.title': 'Text Mesh',
  'textMesh.text': 'Text',
  'textMesh.fontSize': 'Font Size',
  'textMesh.depth': 'Extrusion Depth',
  'textMesh.placeholder': 'Enter text...',
  'textMesh.create': 'Create Text Mesh',

  // Latency tester
  'latency.title': 'Latency Tester',
  'latency.start': 'Start Test (100x)',
  'latency.testing': 'Testing...',
  'latency.currentRtt': 'Current RTT',
  'latency.min': 'Min',
  'latency.max': 'Max',
  'latency.avg': 'Average',
  'latency.p95': 'P95',
  'latency.samples': 'Samples',
  'latency.excellent': 'Excellent latency, H.264 streaming sufficient',
  'latency.moderate': 'Moderate latency, consider JPEG frame mode',
  'latency.high': 'High latency, recommend R3F dual rendering',
  'latency.footer': 'Measure Webview ↔ Rust engine round-trip time',

  // Diagnostics panel
  'diagnostics.title': 'Engine',
  'diagnostics.scene': 'scene',
  'diagnostics.topology': 'topology',
  'diagnostics.appliedSeq': 'appliedSeq',
  'diagnostics.predictions': 'predictions',
  'diagnostics.session': 'session',
  'diagnostics.quality': 'quality',
  'diagnostics.ackP95': 'ack p95',
  'diagnostics.patchBw': 'patch bw',
  'diagnostics.gpuUpload': 'gpu upload',
  'diagnostics.frameP95': 'frame p95',
  'diagnostics.dropped': 'dropped',

  // Error boundary
  'error.title': 'Something went wrong',
  'error.retry': 'Try again',

  // Keyframe timeline
  'keyframe.noTracks': 'No keyframe tracks',
  'keyframe.selectClip': 'Select an animation clip',

  // Sculpt brush
  'sculpt.title': 'Sculpt Brush',
  'sculpt.brush': 'Brush',
  'sculpt.radius': 'Radius',
  'sculpt.strength': 'Strength',
  'sculpt.falloff': 'Falloff',
  'sculpt.session': 'Session',
  'sculpt.begin': 'Begin',
  'sculpt.strokeSample': 'Stroke Sample',
  'sculpt.commit': 'Commit',
  'sculpt.cancel': 'Cancel',
  'sculpt.selectMesh': 'Select a mesh',
  'sculpt.engineUnavailable': 'Engine unavailable',
  'sculpt.ready': 'Ready',
  'sculpt.sessionInfo': 'Session {id}',
  'sculpt.lastPatchSeq': 'Last patch seq {seq}',
} satisfies MessageBundle;
