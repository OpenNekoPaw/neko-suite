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

  // Viewport controls
  'viewport.controls': '视口控制',
  'viewport.zoomIn': '拉近',
  'viewport.zoomOut': '拉远',
  'viewport.pan': '平移',
  'viewport.panUp': '向上平移',
  'viewport.panDown': '向下平移',
  'viewport.panLeft': '向左平移',
  'viewport.panRight': '向右平移',
  'viewport.orbit': '旋转视图',
  'viewport.grid': '显示坐标网格',
  'viewport.resetCamera': '重置相机',

  // Workbench
  'workbench.vscodePanel': 'VSCode Webview 面板',
  'workbench.workspace.layout': '布局',
  'workbench.workspace.modeling': '建模',
  'workbench.workspace.sculpting': '雕刻',
  'workbench.workspace.animation': '动画',
  'workbench.transform.move': '移动',
  'workbench.transform.rotate': '旋转',
  'workbench.transform.scale': '缩放',
  'workbench.outliner': '大纲视图',
  'workbench.properties': '属性',
  'workbench.noSelection': '未选择',
  'workbench.objectCount': '{count} 个物体',
  'workbench.syncing': '同步中',
  'workbench.engineOffline': '引擎离线',
  'workbench.enginePort': '引擎 :{port}',

  // Empty state
  'empty.hint': '打开 .gltf、.glb 或 .vrm 文件进行查看',
  'empty.dropHint': '拖入 .gltf、.glb 或 .vrm 文件，或选择以下方式开始',
  'empty.emptyScene': '当前场景为空，请新增基础场景或导入模型以开始编辑',
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
  'animation.fade': '淡入淡出',
  'animation.unit': '秒',
  'animation.noClips': '无动画片段',

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

  // Diagnostics panel
  'diagnostics.title': '引擎',
  'diagnostics.scene': '场景',
  'diagnostics.topology': '拓扑',
  'diagnostics.appliedSeq': '已应用序列',
  'diagnostics.predictions': '预测',
  'diagnostics.session': '会话',
  'diagnostics.quality': '质量',
  'diagnostics.ackP95': '确认 p95',
  'diagnostics.patchBw': '补丁带宽',
  'diagnostics.gpuUpload': 'GPU 上传',
  'diagnostics.frameP95': '帧 p95',
  'diagnostics.dropped': '丢弃',

  // Error boundary
  'error.title': '出现错误',
  'error.retry': '重试',
  'error.cameraUpdateFailed': '相机更新失败',
  'error.cameraAckViewportMismatch': '相机更新响应与当前视口不匹配',
  'error.hitTestFailed': '命中测试失败',
  'error.webCodecsUnavailable': 'WebCodecs 不可用',
  'error.engineStreamDisconnected': '引擎视频流已断开',
  'error.engineStreamUnavailable': '引擎视频流不可用',
  'error.routeAUnavailable': 'Route A 不可用',
  'error.sceneCommandRejected': '场景命令被拒绝',
  'error.sceneCommandStatus': '场景命令 {status}',
  'error.sceneControlDisconnected': '场景控制连接未建立',
  'error.noEngineCharacterSelected': '未选择引擎角色',

  // Keyframe timeline
  'keyframe.noTracks': '无关键帧轨道',
  'keyframe.selectClip': '请选择动画片段',

  // Sculpt brush
  'sculpt.title': '雕刻笔刷',
  'sculpt.brush': '笔刷',
  'sculpt.radius': '半径',
  'sculpt.strength': '强度',
  'sculpt.falloff': '衰减',
  'sculpt.session': '会话',
  'sculpt.begin': '开始',
  'sculpt.strokeSample': '笔画采样',
  'sculpt.commit': '提交',
  'sculpt.cancel': '取消',
  'sculpt.selectMesh': '请选择网格',
  'sculpt.engineUnavailable': '引擎不可用',
  'sculpt.ready': '就绪',
  'sculpt.sessionInfo': '会话 {id}',
  'sculpt.lastPatchSeq': '最后补丁序列 {seq}',
} satisfies MessageBundle;
