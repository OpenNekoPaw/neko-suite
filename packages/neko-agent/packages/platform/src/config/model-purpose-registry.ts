import type { Model } from '../types/provider';

export type AgentModelPurpose =
  | 'llm.chat'
  | 'llm.plan'
  | 'llm.judge'
  | 'llm.vision'
  | 'image.generate'
  | 'image.edit'
  | 'image.understand'
  | 'video.generate'
  | 'video.understand'
  | 'video.safety'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.asr'
  | 'audio.understand'
  | 'audio.music.generate'
  | 'content.safety.moderate'
  | 'local.video.probe';

const PURPOSE_CAPABILITY_MATCHES = {
  'llm.chat': ['llm.chat', 'chat'],
  'llm.plan': ['llm.plan', 'chat'],
  'llm.judge': ['llm.judge', 'chat'],
  'llm.vision': ['llm.vision', 'vision'],
  'image.generate': ['image.generate', 'text_to_image', 'image_generation'],
  'image.edit': ['image.edit', 'image_edit'],
  'image.understand': ['image.understand'],
  'video.generate': ['video.generate', 'text_to_video', 'video_generation'],
  'video.understand': ['video.understand'],
  'video.safety': ['video.safety'],
  'audio.generate': ['audio.generate', 'text_to_audio', 'audio'],
  'audio.tts': ['audio.tts', 'text_to_audio', 'audio'],
  'audio.asr': ['audio.asr', 'audio'],
  'audio.understand': ['audio.understand'],
  'audio.music.generate': ['audio.music.generate', 'text_to_music'],
  'content.safety.moderate': ['content.safety.moderate'],
  'local.video.probe': ['local.video.probe'],
} as const satisfies Record<AgentModelPurpose, readonly string[]>;

export function getModelPurposeCapabilityMatches(purpose: AgentModelPurpose): readonly string[] {
  return PURPOSE_CAPABILITY_MATCHES[purpose];
}

export function modelSupportsPurpose(model: Pick<Model, 'capabilities'>, purpose: string): boolean {
  const accepted =
    PURPOSE_CAPABILITY_MATCHES[purpose as AgentModelPurpose] ?? ([purpose] as readonly string[]);
  return accepted.some((capability) => model.capabilities.includes(capability));
}
