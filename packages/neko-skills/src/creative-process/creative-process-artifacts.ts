import type {
  AgentArtifactKind as ArtifactKind,
  AgentStageId as IdcStage,
} from '@neko/shared';

export interface ArtifactDescriptor {
  readonly id: string;
  readonly label: string;
  readonly stageId: IdcStage | string;
  readonly storageKind: ArtifactKind;
  readonly description?: string;
  readonly schemaId?: string;
  readonly enabled: boolean;
}

export interface IReadonlyArtifactRegistry {
  get(id: string): ArtifactDescriptor | undefined;
  byStage(stageId: string): ArtifactDescriptor | undefined;
  list(): readonly ArtifactDescriptor[];
  has(id: string): boolean;
}

export interface IArtifactRegistry extends IReadonlyArtifactRegistry {
  register(descriptor: ArtifactDescriptor): void;
  unregister(id: string): void;
}

export class ArtifactRegistry implements IArtifactRegistry {
  private readonly descriptors = new Map<string, ArtifactDescriptor>();

  register(descriptor: ArtifactDescriptor): void {
    if (!descriptor.id.trim()) {
      throw new Error('ArtifactRegistry: descriptor id must not be empty');
    }
    if (!descriptor.stageId.trim()) {
      throw new Error('ArtifactRegistry: descriptor stageId must not be empty');
    }
    this.descriptors.set(descriptor.id, descriptor);
  }

  unregister(id: string): void {
    this.descriptors.delete(id);
  }

  get(id: string): ArtifactDescriptor | undefined {
    return this.descriptors.get(id);
  }

  byStage(stageId: string): ArtifactDescriptor | undefined {
    return [...this.descriptors.values()].find((descriptor) => descriptor.stageId === stageId);
  }

  list(): readonly ArtifactDescriptor[] {
    return [...this.descriptors.values()];
  }

  has(id: string): boolean {
    return this.descriptors.has(id);
  }
}

export function createArtifactRegistry(
  descriptors: readonly ArtifactDescriptor[] = [],
): IArtifactRegistry {
  const registry = new ArtifactRegistry();
  for (const descriptor of descriptors) {
    registry.register(descriptor);
  }
  return registry;
}

export function createDefaultArtifactRegistry(): IArtifactRegistry {
  return createArtifactRegistry([
    {
      id: 'draft',
      label: 'Draft',
      stageId: 'draft',
      storageKind: 'draft',
      description: 'Business intent and user-facing approval artifact.',
      schemaId: 'idc.draft',
      enabled: true,
    },
    {
      id: 'plan',
      label: 'Plan',
      stageId: 'plan',
      storageKind: 'plan',
      description: 'Technical execution plan compiled from the draft.',
      schemaId: 'idc.plan',
      enabled: true,
    },
    {
      id: 'apply',
      label: 'Apply',
      stageId: 'apply',
      storageKind: 'task',
      description: 'Apply-stage task projection persisted as a visible creation document.',
      schemaId: 'idc.task',
      enabled: true,
    },
  ]);
}
