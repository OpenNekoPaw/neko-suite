import type { ChatMessage, ContentPart, MultimodalContextPacket } from '@neko/shared';
import type { AgentMultimodalEvidenceRef } from '@neko-agent/types';

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
      continue;
    }

    if (input.modality === 'audio') {
      parts.push({ type: 'text', text: summarizeAudioInput(input) });
    }
  }

  const evidenceSummary = summarizeEvidenceRefs(readEvidenceRefs(packet));
  if (evidenceSummary) {
    parts.push({ type: 'text', text: evidenceSummary });
  }

  if (parts.length === 0) {
    return { role: 'user', content: summarizePacket(packet) };
  }

  return { role: 'user', content: parts };
}

function summarizePacket(packet: MultimodalContextPacket): string {
  const modalities = Array.from(new Set(packet.perceptionInputs.map((input) => input.modality)));
  const evidenceSummary = summarizeEvidenceRefs(readEvidenceRefs(packet));
  return [
    `Multimodal context packet ${packet.id}: ${modalities.join(', ') || 'no inputs'}`,
    evidenceSummary,
  ]
    .filter(Boolean)
    .join('\n');
}

function readMimeType(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = metadata?.['mimeType'];
  return typeof value === 'string' ? value : undefined;
}

function summarizeAudioInput(input: {
  readonly id: string;
  readonly uri?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): string {
  return [
    `Audio context: ${input.id}`,
    input.uri ? `uri=${input.uri}` : undefined,
    readMimeType(input.metadata) ? `mimeType=${readMimeType(input.metadata)}` : undefined,
    readDurationMs(input.metadata) ? `durationMs=${readDurationMs(input.metadata)}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function readDurationMs(
  metadata: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  const value = metadata?.['durationMs'];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readEvidenceRefs(packet: MultimodalContextPacket): readonly AgentMultimodalEvidenceRef[] {
  const value = packet.metadata?.['evidenceRefs'];
  return Array.isArray(value)
    ? value.filter((item): item is AgentMultimodalEvidenceRef => isEvidenceRef(item))
    : [];
}

function isEvidenceRef(value: unknown): value is AgentMultimodalEvidenceRef {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { readonly id?: unknown }).id === 'string' &&
    typeof (value as { readonly modality?: unknown }).modality === 'string',
  );
}

function summarizeEvidenceRefs(evidenceRefs: readonly AgentMultimodalEvidenceRef[]): string {
  if (evidenceRefs.length === 0) return '';
  const included = evidenceRefs.filter((evidence) => !evidence.withheld);
  const withheld = evidenceRefs.filter((evidence) => evidence.withheld);
  return [
    included.length > 0
      ? `Included feedback evidence: ${included.map(formatEvidenceRef).join('; ')}`
      : 'Included feedback evidence: none',
    withheld.length > 0
      ? `Withheld feedback evidence: ${withheld
          .map(
            (evidence) => `${formatEvidenceRef(evidence)} (${evidence.withheldReason ?? 'policy'})`,
          )
          .join('; ')}`
      : 'Withheld feedback evidence: none',
  ].join('\n');
}

function formatEvidenceRef(evidence: AgentMultimodalEvidenceRef): string {
  return `${evidence.id} [${evidence.modality}]${evidence.summary ? ` ${evidence.summary}` : ''}`;
}
