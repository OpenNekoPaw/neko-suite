import type { MessageBundle } from '@neko/shared';

export const zhCN = {
  // App toolbar
  'toolbar.faceEditor': '面部编辑器',
  'toolbar.latencyTest': '延迟测试',
  'toolbar.vrmExpression': 'VRM 表情',
  'toolbar.boneExpression': '骨骼表情',
  'toolbar.geometry': '几何体',
  'toolbar.text3d': '3D 文字',
  'toolbar.csg': 'CSG',
  'toolbar.sculpt': '雕刻笔刷',
  'toolbar.exportGlb': '导出 GLB',
  'toolbar.saveProject': '保存项目',

  // Toolbar (continued)
  'toolbar.keyframes': '关键帧',
  'toolbar.qualityPreview': '引擎质量预览',

  // Empty state
  'empty.hint': '打开 .gltf、.glb 或 .vrm 文件进行查看',
  'empty.dropHint': '拖入 .gltf、.glb 或 .vrm 文件，或选择以下方式开始',
  'empty.import': '导入文件',
  'empty.templateBlank': '空白场景',
  'empty.templateHumanoid': '简单人形',

  // Scene tree
  'sceneTree.title': '场景',

  // Animation player
  'animation.selectPlaceholder': '-- 选择动画 --',
  'animation.play': '播放',
  'animation.pause': '暂停',
  'animation.stop': '停止',
  'animation.statusPlaying': '播放中',
  'animation.statusPaused': '已暂停',
  'animation.statusStopped': '已停止',

  // Transform panel
  'transform.noSelection': '未选择节点',
  'transform.mode': '变换模式',
  'transform.position': '位置',
  'transform.rotation': '旋转 (XYZW)',
  'transform.scale': '缩放',
  'transform.translate': '平移',
  'transform.rotate': '旋转',
  'transform.scaleMode': '缩放',
  'transform.mesh': '网格',
  'transform.light': '灯光',
  'transform.camera': '相机',
  'transform.skeleton': '骨骼',

  // Face editor
  'face.title': '面部编辑器',
  'face.random': '随机',
  'face.reset': '重置',
  'face.aiGenerate': 'AI 生成',
  'face.paramCount': '{count} 个参数',

  // Expression preset
  'expression.title': 'VRM 表情预设',
  'expression.loadVrm': '请加载 VRM 模型以使用表情预设',
  'expression.apply': '应用表情',
  'expression.footer': 'VRM 1.0 标准表情预设',

  // Bone expression
  'bone.title': '骨骼表情',
  'bone.lipSync': '口型同步',
  'bone.eyeTracking': '眼球追踪',
  'bone.eyebrow': '眉毛',
  'bone.moveMouse': '移动鼠标',
  'bone.raise': '上扬',
  'bone.lower': '下压',
  'bone.furrow': '皱眉',

  // CSG panel
  'csg.title': 'CSG 布尔运算',
  'csg.operation': '运算类型',
  'csg.operandA': '操作对象 A',
  'csg.operandB': '操作对象 B',
  'csg.select': '选择',
  'csg.confirm': '确认',
  'csg.execute': '执行{operation}',
  'csg.union': '并集',
  'csg.difference': '差集',
  'csg.intersection': '交集',
  'csg.none': '（无）',
  'csg.sameMeshError': '操作对象必须是不同的节点',

  // Shape creator
  'shape.title': '形状创建器',
  'shape.shapeSection': '形状',
  'shape.parameters': '参数',
  'shape.create': '创建{shape}',
  'shape.cube': '立方体',
  'shape.sphere': '球体',
  'shape.cylinder': '圆柱体',
  'shape.cone': '圆锥体',
  'shape.torus': '圆环体',
  'shape.plane': '平面',

  // Text editor
  'textMesh.title': '文字网格',
  'textMesh.text': '文本',
  'textMesh.fontSize': '字体大小',
  'textMesh.depth': '挤出深度',
  'textMesh.placeholder': '输入文本...',
  'textMesh.create': '创建文字网格',

  // Latency tester
  'latency.title': '延迟测试',
  'latency.start': '开始测试 (100 次)',
  'latency.testing': '测试中...',
  'latency.currentRtt': '当前 RTT',
  'latency.min': '最小值',
  'latency.max': '最大值',
  'latency.avg': '平均值',
  'latency.p95': 'P95',
  'latency.samples': '样本数',
  'latency.excellent': '✅ 延迟优秀，H.264 流方案足够',
  'latency.moderate': '⚠️ 延迟中等，考虑 JPEG 单帧模式',
  'latency.high': '❌ 延迟较高，建议 R3F 双渲染',
  'latency.footer': '测量 Webview ↔ Rust 引擎往返时间',
} satisfies MessageBundle;
