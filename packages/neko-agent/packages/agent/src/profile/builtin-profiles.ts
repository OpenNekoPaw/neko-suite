import {
  COMIC_SHOT_ASSET_PREP_PROFILE,
  type ArtifactProfileDescriptor,
  type CreationProfileDescriptor,
} from '@neko/shared';

export const IDC_DEFAULT_CREATION_PROFILE: CreationProfileDescriptor = {
  profileId: 'idc.default',
  kind: 'creation',
  version: '1.0.0',
  source: 'builtin',
  title: 'Intent-Driven Creation',
  defaultStageId: 'draft',
  stages: [
    {
      stageId: 'draft',
      purpose: 'Clarify creative intent, constraints, inputs, and missing context.',
      expectedOutputs: ['brief'],
    },
    {
      stageId: 'plan',
      purpose: 'Decompose work into reviewable steps, artifact expectations, and tool policy.',
      expectedOutputs: ['plan', 'checklist'],
    },
    {
      stageId: 'apply',
      purpose: 'Execute approved work, validate results, and surface diagnostics.',
      expectedOutputs: ['artifact', 'diagnostics'],
    },
  ],
  transitions: [
    { fromStageId: 'draft', toStageId: 'plan', condition: 'manual' },
    { fromStageId: 'plan', toStageId: 'apply', condition: 'user-approved' },
  ],
  approvalPolicy: { policy: 'before-side-effect' },
  reviewPolicy: { policy: 'before-apply' },
  recoveryPolicy: { policy: 'revise-previous-stage', maxAttempts: 2 },
  lifecycleConstraints: [
    {
      constraintId: 'apply-side-effects-require-approval',
      stageIds: ['apply'],
      kind: 'requires-approval',
    },
  ],
  promptGuidance: [
    {
      text: 'Draft clarifies intent, Plan decomposes work, Apply executes verified changes.',
    },
  ],
};

export const BUILTIN_ARTIFACT_PROFILES: readonly ArtifactProfileDescriptor[] = [
  COMIC_SHOT_ASSET_PREP_PROFILE,
];

export const BUILTIN_CREATION_PROFILES: readonly CreationProfileDescriptor[] = [
  IDC_DEFAULT_CREATION_PROFILE,
];
