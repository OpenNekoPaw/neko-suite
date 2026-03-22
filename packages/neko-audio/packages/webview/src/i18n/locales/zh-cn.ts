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
