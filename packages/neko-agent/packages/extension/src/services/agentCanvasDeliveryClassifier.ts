import type {
  CanvasBoardDeliveryArtifact,
  DocumentArchiveResourceRef,
  ResourceRef,
} from '@neko/shared';

export type AgentCanvasDeliveryCandidate =
  | {
      readonly kind: 'markdown';
      readonly artifactId: string;
      readonly title: string;
      readonly markdown: string;
      readonly creatorUseful: boolean;
    }
  | {
      readonly kind: 'selected-reference';
      readonly artifactId: string;
      readonly title: string;
      readonly selected: boolean;
      readonly resourceRef?: ResourceRef;
      readonly documentResourceRef?: DocumentArchiveResourceRef;
    }
  | {
      readonly kind: 'generated-output';
      readonly artifactId: string;
      readonly title: string;
      readonly mediaKind: 'image' | 'audio' | 'video';
      readonly reviewable: boolean;
      readonly resourceRef?: ResourceRef;
    }
  | {
      readonly kind:
        | 'ordinary-prose'
        | 'reasoning'
        | 'log'
        | 'scratch'
        | 'unselected-search-result'
        | 'runtime-handle'
        | 'failed-result';
      readonly artifactId?: string;
    };

export type AgentCanvasDeliveryClassification =
  | {
      readonly eligible: true;
      readonly artifactId: string;
      readonly artifact: CanvasBoardDeliveryArtifact;
    }
  | {
      readonly eligible: false;
      readonly reason:
        | 'not-creator-content'
        | 'not-selected'
        | 'not-reviewable'
        | 'missing-stable-reference'
        | 'empty-markdown';
    };

export function classifyAgentCanvasDelivery(
  candidate: AgentCanvasDeliveryCandidate,
): AgentCanvasDeliveryClassification {
  switch (candidate.kind) {
    case 'markdown':
      if (!candidate.creatorUseful) return { eligible: false, reason: 'not-creator-content' };
      if (!candidate.markdown.trim()) return { eligible: false, reason: 'empty-markdown' };
      return {
        eligible: true,
        artifactId: candidate.artifactId,
        artifact: {
          kind: 'markdown',
          title: candidate.title,
          markdown: candidate.markdown,
        },
      };
    case 'selected-reference':
      if (!candidate.selected) return { eligible: false, reason: 'not-selected' };
      if (!candidate.resourceRef && !candidate.documentResourceRef) {
        return { eligible: false, reason: 'missing-stable-reference' };
      }
      return {
        eligible: true,
        artifactId: candidate.artifactId,
        artifact: {
          kind: 'file-reference',
          title: candidate.title,
          ...(candidate.resourceRef ? { resourceRef: candidate.resourceRef } : {}),
          ...(candidate.documentResourceRef
            ? { documentResourceRef: candidate.documentResourceRef }
            : {}),
        },
      };
    case 'generated-output':
      if (!candidate.reviewable) return { eligible: false, reason: 'not-reviewable' };
      if (!candidate.resourceRef) {
        return { eligible: false, reason: 'missing-stable-reference' };
      }
      return {
        eligible: true,
        artifactId: candidate.artifactId,
        artifact: {
          kind: candidate.mediaKind,
          title: candidate.title,
          resourceRef: candidate.resourceRef,
        },
      };
    case 'ordinary-prose':
    case 'reasoning':
    case 'log':
    case 'scratch':
    case 'unselected-search-result':
    case 'runtime-handle':
    case 'failed-result':
      return { eligible: false, reason: 'not-creator-content' };
  }
}
