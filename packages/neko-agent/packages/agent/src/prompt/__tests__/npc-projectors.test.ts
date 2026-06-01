import { describe, expect, it } from 'vitest';
import type { NpcProfileSource, NpcTranscriptArtifact } from '@neko/shared';
import { NPC_TRANSCRIPT_ARTIFACT_VERSION } from '@neko/shared';
import {
  parseNpcEvaluationReportOutput,
  projectNpcEvaluationPrompt,
} from '../npc-evaluator-projector';
import { projectNpcSystemPrompt } from '../npc-profile-projector';

const entityRef = {
  entityId: 'char_xiaoju',
  entityKind: 'character',
  projectRoot: '${workspaceFolder}',
} as const;

const richProfile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: ['Xiaoju'],
  sparsity: 'rich',
  facts: [
    {
      key: 'metadata.role',
      value: 'protagonist',
      source: 'registry',
      authority: 'confirmed',
    },
    {
      key: 'speech.catchphrase',
      value: '我先看看',
      source: 'agent-inferred',
      authority: 'suggested',
      confidence: 0.72,
    },
  ],
  relationships: [
    {
      key: 'relationship.char_laozhang.mentor',
      value: {
        name: '老张',
        relation: 'mentor',
        summary: 'strong',
      },
      source: 'relationship-graph',
      authority: 'confirmed',
    },
  ],
  dialogueSamples: ['小橘：我会自己确认。'],
  sceneAppearances: ['story/test.fountain:12'],
  representationBindings: [
    {
      role: 'portrait',
      assetRef: 'project://assets/xiaoju-portrait',
      isDefault: true,
    },
  ],
};

describe('NPC prompt projectors', () => {
  it('renders roleplay mode with confirmed and suggested facts separated', () => {
    const prompt = projectNpcSystemPrompt(richProfile, { mode: 'roleplay' });

    expect(prompt).toContain('Roleplay mode');
    expect(prompt).toContain('## Confirmed Facts');
    expect(prompt).toContain('- metadata.role: protagonist [registry]');
    expect(prompt).toContain('## Suggested / Uncertain Facts');
    expect(prompt).toContain('- speech.catchphrase: 我先看看 (confidence 72%) [agent-inferred]');
    expect(prompt).toContain('- 老张: mentor (strong)');
    expect(prompt).toContain('- portrait: project://assets/xiaoju-portrait (default)');
  });

  it('renders consult mode as in-character advice without pretending uncertainty is confirmed', () => {
    const prompt = projectNpcSystemPrompt(richProfile, { mode: 'consult' });

    expect(prompt).toContain('Consult mode');
    expect(prompt).toContain(
      'Suggested facts are uncertain; do not present them as confirmed truth.',
    );
  });

  it('renders thin profiles with explicit missing context boundaries', () => {
    const prompt = projectNpcSystemPrompt(
      {
        entityRef,
        displayName: '小橘',
        aliases: [],
        facts: [
          {
            key: 'identity.name',
            value: '小橘',
            source: 'registry',
            authority: 'confirmed',
          },
        ],
        sparsity: 'thin',
      },
      { mode: 'roleplay' },
    );

    expect(prompt).toContain('Profile sparsity: thin');
    expect(prompt).toContain('If a fact is missing, stay in character and express uncertainty.');
    expect(prompt).toContain('## Relationships\n- None');
    expect(prompt).toContain('## Dialogue Samples\n- None');
  });

  it('renders evaluator prompts with structured report requirements', () => {
    const artifact: NpcTranscriptArtifact = {
      version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
      createdAt: '2026-06-01T00:00:00.000Z',
      entityRef,
      mode: 'roleplay',
      profileSnapshot: richProfile,
      transcript: [
        {
          id: 'm1',
          role: 'user',
          content: '你好',
          createdAt: '2026-06-01T00:00:01.000Z',
        },
      ],
    };

    const prompt = projectNpcEvaluationPrompt(artifact);

    expect(prompt.systemPrompt).toContain('Return JSON only');
    expect(prompt.systemPrompt).toContain('require explicit user confirmation');
    expect(prompt.userPrompt).toContain('"dimension": "persona-consistency"');
    expect(prompt.userPrompt).toContain('"authority": "suggested"');
    expect(prompt.userPrompt).toContain('"requiresUserConfirmation": true');
  });

  it('parses evaluator JSON only when it matches the report contract', () => {
    const report = {
      version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
      createdAt: '2026-06-01T00:00:00.000Z',
      entityRef,
      summary: 'No issues found.',
      scores: [{ dimension: 'persona-consistency', score: 1, summary: 'ok' }],
      findings: [],
      suggestions: [],
    };

    expect(parseNpcEvaluationReportOutput(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``)).toEqual(
      {
        status: 'parsed',
        report,
      },
    );
    expect(
      parseNpcEvaluationReportOutput(JSON.stringify({ ...report, suggestions: [{}] })),
    ).toEqual({
      status: 'invalid',
      reason: 'Evaluator JSON did not match NpcEvaluationReport.',
    });
  });
});
