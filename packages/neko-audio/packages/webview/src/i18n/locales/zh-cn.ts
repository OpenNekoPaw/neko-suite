import type { MessageBundle } from '@neko/shared';

const audio: MessageBundle = {
  // Loading & errors
  'audio.loading': '正在加载音频...',
  'audio.error.load': '加载音频文件失败',
  'audio.error.engine': '音频引擎不可用',
  'audio.error.stream': '启动音频流失败',

  // File info
  'audio.info.format': '{codec} · {sampleRate}Hz · {channels}声道',
  'audio.info.duration': '时长：{duration}',

  // Transport controls
  'audio.controls.play': '播放',
  'audio.controls.pause': '暂停',
  'audio.controls.stop': '停止',
  'audio.controls.volume': '音量',
  'audio.controls.mute': '静音',
  'audio.controls.speed': '速度',
  'audio.controls.loop': '循环',

  // Waveform
  'audio.waveform.loading': '正在生成波形...',
  'audio.waveform.selection': '选区：{start} - {end}',
  'audio.waveform.noSelection': '未选择区域',

  // Editing
  'audio.edit.trim': '裁剪',
  'audio.edit.fadeIn': '淡入',
  'audio.edit.fadeOut': '淡出',
  'audio.edit.selectAll': '全选',
  'audio.edit.clearSelection': '清除选区',
  'audio.edit.trimSuccess': '音频裁剪成功',
  'audio.edit.trimError': '裁剪失败：{error}',

  // Spectrum
  'audio.spectrum.title': '频谱分析仪',
  'audio.spectrum.toggle': '切换频谱',

  // Effects
  'audio.effects.title': '效果器',
  'audio.effects.add': '添加效果',
  'audio.effects.remove': '移除',
  'audio.effects.apply': '应用效果',
  'audio.effects.bypass': '旁通',
  'audio.effects.noEffects': '未添加效果',
  'audio.effects.clear': '清除全部',

  // Effect categories
  'audioEffects.category.dynamics': '动态',
  'audioEffects.category.filter': '滤波器',
  'audioEffects.category.spatial': '空间',
  'audioEffects.category.modulation': '调制',
  'audioEffects.category.utility': '工具',

  // Effect names
  'audioEffects.noiseReduction': '降噪',
  'audioEffects.compressor': '压缩器',
  'audioEffects.limiter': '限制器',
  'audioEffects.reverb': '混响',
  'audioEffects.delay': '延迟',
  'audioEffects.chorus': '合唱',
  'audioEffects.distortion': '失真',
  'audioEffects.pitchShift': '音高调整',
  'audioEffects.timeStretch': '时间拉伸',
  'audioEffects.highPass': '高通滤波器',
  'audioEffects.lowPass': '低通滤波器',
  'audioEffects.bandPass': '带通滤波器',

  // Effect descriptions
  'audioEffects.noiseReduction.description': '降低背景噪音',
  'audioEffects.compressor.description': '动态范围压缩',
  'audioEffects.limiter.description': '峰值限制',
  'audioEffects.reverb.description': '添加混响效果',
  'audioEffects.delay.description': '回声与延迟效果',
  'audioEffects.chorus.description': '合唱调制效果',
  'audioEffects.distortion.description': '失真效果',
  'audioEffects.pitchShift.description': '升高或降低音高',
  'audioEffects.timeStretch.description': '拉伸或压缩时间',
  'audioEffects.highPass.description': '高通频率滤波',
  'audioEffects.lowPass.description': '低通频率滤波',
  'audioEffects.bandPass.description': '带通频率滤波',

  // Effect parameters
  'audioEffects.params.amount': '程度',
  'audioEffects.params.threshold': '阈值',
  'audioEffects.params.smoothing': '平滑',
  'audioEffects.params.ratio': '比率',
  'audioEffects.params.attack': '启动',
  'audioEffects.params.release': '释放',
  'audioEffects.params.knee': '拐点',
  'audioEffects.params.makeupGain': '补偿增益',
  'audioEffects.params.ceiling': '天花板',
  'audioEffects.params.type': '类型',
  'audioEffects.params.roomSize': '房间大小',
  'audioEffects.params.damping': '阻尼',
  'audioEffects.params.wetDry': '干湿比',
  'audioEffects.params.width': '宽度',
  'audioEffects.params.preDelay': '预延迟',
  'audioEffects.params.delayTime': '延迟时间',
  'audioEffects.params.feedback': '反馈',
  'audioEffects.params.stereo': '立体声',
  'audioEffects.params.pingPong': '乒乓',
  'audioEffects.params.rate': '速率',
  'audioEffects.params.depth': '深度',
  'audioEffects.params.delay': '延迟',
  'audioEffects.params.drive': '驱动',
  'audioEffects.params.outputGain': '输出增益',
  'audioEffects.params.semitones': '半音',
  'audioEffects.params.preserveFormants': '保持共振峰',
  'audioEffects.params.preservePitch': '保持音高',
  'audioEffects.params.frequency': '频率',
  'audioEffects.params.resonance': '共振',
  'audioEffects.params.bandwidth': '带宽',
  'audioEffects.params.gain': '增益',

  // Reverb types
  'audioEffects.reverbType.room': '房间',
  'audioEffects.reverbType.hall': '大厅',
  'audioEffects.reverbType.plate': '板式',
  'audioEffects.reverbType.spring': '弹簧',
  'audioEffects.reverbType.chamber': '室内',

  // Distortion types
  'audioEffects.distortionType.soft': '柔和',
  'audioEffects.distortionType.hard': '硬',
  'audioEffects.distortionType.tube': '电子管',
  'audioEffects.distortionType.fuzz': '毛绒',

  // Common UI
  'audio.common.close': '关闭',
  'audio.common.mono': '单声道',
  'audio.common.stereo': '立体声',

  // Spectrum
  'audio.spectrum.noData': '无频谱数据',

  // Timeline
  'audio.timeline.empty': '暂无轨道 — 导入音频文件以开始',

  // Recording
  'audio.recording.micFallback': '麦克风 {id}',

  // Empty project
  'audio.import.empty': '暂无音频源，导入文件以开始编辑。',
  'audio.import.drop': '拖放音频文件到此处',
  'audio.import.button': '选择音频文件',
  'audio.import.failed': '导入音频失败：{error}',

  // Recording
  'audio.recording.title': '录音',
  'audio.recording.start': '开始录音',
  'audio.recording.stop': '停止录音',
  'audio.recording.save': '保存录音',
  'audio.recording.device': '输入设备',
  'audio.recording.level': '电平',
  'audio.recording.duration': '时长：{duration}',

  // Properties
  'audio.properties.title': '属性',
  'audio.properties.volume': '音量',
  'audio.properties.pan': '声像',
  'audio.properties.gain': '增益',

  // Analysis
  'audio.analysis.loudness': '响度分析',
  'audio.analysis.silence': '静音检测',
  'audio.analysis.denoise': 'AI 降噪',
  'audio.analysis.normalize': '标准化',
  'audio.analysis.integrated': '综合响度',
  'audio.analysis.truePeak': '真峰值',
  'audio.analysis.range': '响度范围',
  'audio.analysis.noData': '点击 📏 分析响度',

  // Toast
  'audio.toast.trimSuccess': '裁剪完成',
  'audio.toast.trimError': '裁剪失败：{error}',
  'audio.toast.effectsSuccess': '效果已应用',
  'audio.toast.effectsError': '效果应用失败：{error}',
  'audio.toast.recordingSaved': '录音已保存：{path}',
  'audio.toast.recordingError': '保存录音失败：{error}',
  'audio.toast.denoiseStarted': '正在降噪处理…',
  'audio.toast.normalizeStarted': '正在标准化…',
  'audio.toast.exportStarted': '正在导出…',

  // Track operations (context menu)
  'audio.track.mute': '静音轨道',
  'audio.track.unmute': '取消静音',
  'audio.track.lock': '锁定轨道',
  'audio.track.unlock': '解锁轨道',
  'audio.track.moveUp': '上移',
  'audio.track.moveDown': '下移',
  'audio.track.delete': '删除轨道',

  // Clip operations (context menu)
  'audio.clip.mute': '静音片段',
  'audio.clip.unmute': '取消静音',
  'audio.clip.duplicate': '复制片段',
  'audio.clip.delete': '删除片段',

  // Export
  'audio.export.title': '导出为',
  'audio.export.format': '格式',
  'audio.export.quality': '质量',
  'audio.export.sampleRate': '采样率',
  'audio.export.bitrate': '码率',
  'audio.export.channels': '声道',
  'audio.export.mono': '单声道',
  'audio.export.stereo': '立体声',
  'audio.export.export': '导出',
  'audio.export.toggle': '导出为…',
};

export const bundles: Record<string, MessageBundle> = { audio };
