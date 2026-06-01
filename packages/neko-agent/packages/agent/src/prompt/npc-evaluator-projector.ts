import { isNpcEvaluationReport } from '@neko/shared';
import type { NpcEvaluationReport, NpcTranscriptArtifact } from '@neko/shared';

export interface NpcEvaluationPromptProjection {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export function projectNpcEvaluationPrompt(
  artifact: NpcTranscriptArtifact,
): NpcEvaluationPromptProjection {
  return {
    systemPrompt: [
      'You evaluate NPC validation transcripts against the supplied profile snapshot.',
      'Return JSON only, shaped as NpcEvaluationReport.',
      'Flag persona consistency issues, dialogue voice fit, knowledge leakage, relationship gaps, and profile improvement suggestions.',
      'Suggestions must remain suggested and require explicit user confirmation before any entity mutation.',
    ].join('\n'),
    userPrompt: [
      '## Profile Snapshot',
      JSON.stringify(artifact.profileSnapshot, null, 2),
      '',
      '## Transcript',
      JSON.stringify(artifact.transcript, null, 2),
      '',
      '## Expected JSON Shape',
      JSON.stringify(
        {
          version: 1,
          createdAt: 'ISO timestamp',
          entityRef: artifact.entityRef,
          summary: 'short evaluation summary',
          scores: [
            {
              dimension: 'persona-consistency',
              score: 0.8,
              summary: 'reason',
            },
          ],
          findings: [
            {
              id: 'finding-1',
              dimension: 'knowledge-boundary',
              severity: 'warning',
              message: 'what happened',
              transcriptMessageIds: ['message-id'],
              factKeys: ['profile.fact.key'],
            },
          ],
          suggestions: [
            {
              id: 'suggestion-1',
              kind: 'entity-metadata',
              status: 'suggested',
              title: 'suggestion title',
              rationale: 'why this should be considered',
              proposedValue: 'new value',
              applyTarget: {
                kind: 'entity-metadata',
                entityRef: artifact.entityRef,
                metadataKey: 'speechPattern',
              },
              authority: 'suggested',
              requiresUserConfirmation: true,
            },
          ],
        },
        null,
        2,
      ),
    ].join('\n'),
  };
}

export type NpcEvaluationReportParseResult =
  | {
      readonly status: 'parsed';
      readonly report: NpcEvaluationReport;
    }
  | {
      readonly status: 'invalid';
      readonly reason: string;
    };

export function parseNpcEvaluationReportOutput(output: string): NpcEvaluationReportParseResult {
  const json = extractJsonPayload(output);
  if (!json) {
    return { status: 'invalid', reason: 'Evaluator output did not contain JSON.' };
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!isNpcEvaluationReport(parsed)) {
      return { status: 'invalid', reason: 'Evaluator JSON did not match NpcEvaluationReport.' };
    }
    return { status: 'parsed', report: parsed };
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractJsonPayload(output: string): string | undefined {
  const trimmed = output.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  if (fenced) return fenced;

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return undefined;
  return trimmed.slice(firstBrace, lastBrace + 1);
}
