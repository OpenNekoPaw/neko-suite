import { isNpcEvaluationReport } from '@neko/shared';
import type { NpcEvaluationReport, NpcTranscriptArtifact } from '@neko/shared';

export interface CharacterRoleEvaluationPromptProjection {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export function projectCharacterRoleEvaluationPrompt(
  artifact: NpcTranscriptArtifact,
  options: { readonly locale?: string } = {},
): CharacterRoleEvaluationPromptProjection {
  const zh = options.locale?.trim().toLowerCase().startsWith('zh') === true;
  return {
    systemPrompt: zh
      ? [
          '你需要根据提供的角色档案快照评估角色对话转录。',
          '只返回 JSON，结构必须符合 NpcEvaluationReport。',
          '标记人设一致性、对白声线匹配、知识边界泄露、关系缺口和角色档案改进建议。',
          '所有建议必须保持 suggested 状态，并且在任何实体变更前都需要用户明确确认。',
        ].join('\n')
      : [
          'You evaluate character role transcripts against the supplied profile snapshot.',
          'Return JSON only, shaped as NpcEvaluationReport.',
          'Flag persona consistency issues, dialogue voice fit, knowledge leakage, relationship gaps, and profile improvement suggestions.',
          'Suggestions must remain suggested and require explicit user confirmation before any entity mutation.',
        ].join('\n'),
    userPrompt: [
      zh ? '## 角色档案快照' : '## Profile Snapshot',
      JSON.stringify(artifact.profileSnapshot, null, 2),
      '',
      zh ? '## 对话转录' : '## Transcript',
      JSON.stringify(artifact.transcript, null, 2),
      '',
      zh ? '## 期望 JSON 结构' : '## Expected JSON Shape',
      JSON.stringify(
        {
          version: 1,
          createdAt: 'ISO timestamp',
          entityRef: artifact.entityRef,
          summary: zh ? '简短评估摘要' : 'short evaluation summary',
          scores: [
            {
              dimension: 'persona-consistency',
              score: 0.8,
              summary: zh ? '原因' : 'reason',
            },
          ],
          findings: [
            {
              id: 'finding-1',
              dimension: 'knowledge-boundary',
              severity: 'warning',
              message: zh ? '发生了什么' : 'what happened',
              transcriptMessageIds: ['message-id'],
              factKeys: ['profile.fact.key'],
            },
          ],
          suggestions: [
            {
              id: 'suggestion-1',
              kind: 'entity-metadata',
              status: 'suggested',
              title: zh ? '建议标题' : 'suggestion title',
              rationale: zh ? '为什么需要考虑这个建议' : 'why this should be considered',
              proposedValue: zh ? '新值' : 'new value',
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

export type CharacterRoleEvaluationReportParseResult =
  | {
      readonly status: 'parsed';
      readonly report: NpcEvaluationReport;
    }
  | {
      readonly status: 'invalid';
      readonly reason: string;
    };

export function parseCharacterRoleEvaluationReportOutput(
  output: string,
): CharacterRoleEvaluationReportParseResult {
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
