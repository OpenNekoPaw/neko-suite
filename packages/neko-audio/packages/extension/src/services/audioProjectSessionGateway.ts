import type {
  AudioProjectData,
  AudioOperation,
  EditOperation,
  ElementOperation,
  ElementSplitOperation,
  MixStreamConfig,
  MixConfigWarning,
  TrackMixOperation,
  TrackOperation,
  BatchOperation,
} from '@neko/shared';

export type AudioProjectEditOperation =
  | AudioOperation
  | TrackMixOperation
  | TrackOperation
  | ElementOperation
  | ElementSplitOperation
  | BatchOperation;

export interface ProjectSession {
  documentUri: string;
  projectData: AudioProjectData;
}

export interface ProjectMixConfigResult {
  config: MixStreamConfig;
  warnings: MixConfigWarning[];
}

export interface AudioProjectSessionGateway {
  resolveSession(documentUri?: string): Promise<ProjectSession | null>;
  applyOperation(
    session: ProjectSession,
    operation: AudioProjectEditOperation,
    options?: { syncReason?: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change' },
  ): Promise<ProjectSession>;
  buildMixConfig(session: ProjectSession): Promise<ProjectMixConfigResult>;
}
