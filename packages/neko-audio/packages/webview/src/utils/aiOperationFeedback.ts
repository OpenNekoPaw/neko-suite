import type { AudioAutomationLane, EditOperation } from '@neko/shared';

export interface AiOperationAffectedEntityIds {
  trackIds: string[];
  elementIds: string[];
  effectIds: string[];
}

interface MutableAffectedEntityIds {
  trackIds: Set<string>;
  elementIds: Set<string>;
  effectIds: Set<string>;
}

export function deriveAiOperationAffectedEntities(
  operation: EditOperation,
): AiOperationAffectedEntityIds {
  const affected = createMutableAffectedEntityIds();
  collectAffectedEntities(operation, affected);
  return {
    trackIds: [...affected.trackIds],
    elementIds: [...affected.elementIds],
    effectIds: [...affected.effectIds],
  };
}

function collectAffectedEntities(
  operation: EditOperation,
  affected: MutableAffectedEntityIds,
): void {
  switch (operation.type) {
    case 'batch':
      operation.payload.operations.forEach((child) => collectAffectedEntities(child, affected));
      return;

    case 'track.add':
      affected.trackIds.add(operation.payload.track.id);
      return;
    case 'track.remove':
    case 'track.update':
    case 'track.reorder':
    case 'track.toggle':
      affected.trackIds.add(operation.payload.trackId);
      return;

    case 'element.add':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.element.id);
      return;
    case 'element.remove':
    case 'element.update':
    case 'element.toggle':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.elementId);
      return;
    case 'element.move':
      affected.trackIds.add(operation.payload.fromTrackId);
      affected.trackIds.add(operation.payload.toTrackId);
      affected.elementIds.add(operation.payload.elementId);
      return;
    case 'element.linkAudio':
      affected.trackIds.add(operation.payload.videoTrackId);
      affected.trackIds.add(operation.payload.audioTrackId);
      affected.elementIds.add(operation.payload.videoElementId);
      affected.elementIds.add(operation.payload.audioElement.id);
      if (operation.payload.audioTrack) {
        affected.trackIds.add(operation.payload.audioTrack.id);
      }
      return;
    case 'element.unlinkAudio':
      affected.trackIds.add(operation.payload.videoTrackId);
      affected.trackIds.add(operation.before.audioTrackId);
      affected.elementIds.add(operation.payload.videoElementId);
      affected.elementIds.add(operation.before.audioElement.id);
      return;

    case 'element.splitAt':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.elementId);
      affected.elementIds.add(operation.payload.rightElement.id);
      return;
    case 'element.splitKeepLeft':
    case 'element.splitKeepRight':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.elementId);
      return;

    case 'keyframe.add':
    case 'keyframe.remove':
    case 'keyframe.update':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.elementId);
      if (operation.payload.target.kind === 'effect') {
        affected.effectIds.add(operation.payload.target.effectId);
      }
      return;

    case 'audio.effect.add':
      affected.effectIds.add(operation.payload.effect.id);
      return;
    case 'audio.effect.remove':
    case 'audio.effect.update':
    case 'audio.effect.toggle':
    case 'audio.effect.move':
      affected.effectIds.add(operation.payload.effectId);
      return;

    case 'track.mix.setVolume':
    case 'track.mix.setPan':
    case 'track.mix.setSolo':
      affected.trackIds.add(operation.payload.trackId);
      return;
    case 'track.mix.effect.add':
      affected.trackIds.add(operation.payload.trackId);
      affected.effectIds.add(operation.payload.effect.id);
      return;
    case 'track.mix.effect.remove':
    case 'track.mix.effect.update':
    case 'track.mix.effect.move':
      affected.trackIds.add(operation.payload.trackId);
      affected.effectIds.add(operation.payload.effectId);
      return;
    case 'track.mix.setAutomation':
      affected.trackIds.add(operation.payload.trackId);
      collectAutomationEffectIds(operation.payload.automation, affected);
      collectAutomationEffectIds(operation.before.automation, affected);
      return;

    case 'clipboard.paste':
      operation.payload.items.forEach((item) => {
        affected.trackIds.add(item.trackId);
        affected.elementIds.add(item.element.id);
        if (item.newTrack) {
          affected.trackIds.add(item.newTrack.id);
        }
      });
      return;

    case 'shape.addElement':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.element.id);
      return;
    case 'shape.add':
    case 'shape.remove':
    case 'shape.duplicate':
    case 'shape.update':
    case 'shape.updateGeometry':
    case 'shape.updateStyle':
    case 'shape.toggle':
    case 'shape.reorder':
      affected.trackIds.add(operation.payload.trackId);
      affected.elementIds.add(operation.payload.elementId);
      return;

    case 'project.update':
    case 'audio.setBpm':
    case 'audio.setTimeSignature':
    case 'audio.setMasterVolume':
    case 'canvas.node.add':
    case 'canvas.node.remove':
    case 'canvas.node.update':
    case 'canvas.node.reorder':
    case 'canvas.node.group':
    case 'canvas.node.ungroup':
    case 'canvas.connection.add':
    case 'canvas.connection.remove':
    case 'sketch.layer.add':
    case 'sketch.layer.remove':
    case 'sketch.layer.update':
    case 'sketch.layer.move':
    case 'sketch.layer.duplicate':
    case 'sketch.layer.group':
    case 'sketch.layer.ungroup':
    case 'sketch.stroke.apply':
    case 'sketch.canvas.update':
      return;
  }
}

function collectAutomationEffectIds(
  lanes: AudioAutomationLane[] | undefined,
  affected: MutableAffectedEntityIds,
): void {
  lanes?.forEach((lane) => {
    if (lane.target.kind === 'effect-param') {
      affected.effectIds.add(lane.target.effectId);
    }
  });
}

function createMutableAffectedEntityIds(): MutableAffectedEntityIds {
  return {
    trackIds: new Set<string>(),
    elementIds: new Set<string>(),
    effectIds: new Set<string>(),
  };
}
