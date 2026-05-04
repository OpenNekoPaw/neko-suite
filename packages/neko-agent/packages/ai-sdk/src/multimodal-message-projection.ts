import type { ChatMessage, ContentPart, MultimodalContextPacket } from '@neko/shared';

export interface MultimodalMessageProjectionOptions {
  readonly includeTextInputs?: boolean;
  readonly imageDetail?: 'auto' | 'low' | 'high';
}

export function projectMultimodalPacketToChatMessage(
  packet: MultimodalContextPacket,
  options: MultimodalMessageProjectionOptions = {},
): ChatMessage {
  const parts: ContentPart[] = [];
  const includeTextInputs = options.includeTextInputs ?? true;

  for (const input of packet.perceptionInputs) {
    if (input.modality === 'text' && includeTextInputs) {
      const text = input.metadata?.['text'];
      if (typeof text === 'string' && text.trim().length > 0) {
        parts.push({ type: 'text', text });
      }
      continue;
    }

    if (input.modality === 'image' && input.uri) {
      parts.push({ type: 'image', imageUrl: input.uri, detail: options.imageDetail ?? 'auto' });
      continue;
    }

    if (input.modality === 'video' && input.uri) {
      parts.push({
        type: 'video',
        videoUrl: input.uri,
        ...(readMimeType(input.metadata) ? { mimeType: readMimeType(input.metadata) } : {}),
      });
    }
  }

  if (parts.length === 0) {
    return { role: 'user', content: summarizePacket(packet) };
  }

  return { role: 'user', content: parts };
}

function summarizePacket(packet: MultimodalContextPacket): string {
  const modalities = Array.from(new Set(packet.perceptionInputs.map((input) => input.modality)));
  return `Multimodal context packet ${packet.id}: ${modalities.join(', ') || 'no inputs'}`;
}

function readMimeType(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = metadata?.['mimeType'];
  return typeof value === 'string' ? value : undefined;
}
