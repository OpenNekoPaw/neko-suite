import { describe, expect, it } from 'vitest';
import type { ApprovalBinding } from '../approval-types';
import { assessCreatorReplan, type CreatorReplanKind } from '../creator-replan-policy';

const approved: ApprovalBinding = {
  contentDigest: 'sha256:approved-plan',
  target: '90-second animated short',
  criticalInputIds: ['story.md@sha256:source'],
  creativeScope: ['story:v1', 'character:rin', 'style:ink'],
  costRiskCeiling: 'medium',
  mutationScope: ['neko/generated/video/'],
  deliveryBoundary: 'local:1080p-mp4',
};

describe('creator replan policy', () => {
  it.each<CreatorReplanKind>(['reorder', 'batch-split', 'equivalent-capability', 'local-repair'])(
    'keeps bounded %s changes inside the approved scope',
    (kind) => {
      const result = assessCreatorReplan({
        approved,
        proposed: { ...approved, contentDigest: `sha256:${kind}` },
        kind,
      });

      expect(result.requiresRenewedApproval).toBe(false);
    },
  );

  it.each<CreatorReplanKind>([
    'story',
    'character',
    'core-style',
    'core-sound',
    'primary-technique',
    'cost-risk',
    'mutation-scope',
    'delivery-boundary',
    'critical-input',
  ])('requires renewed approval for material %s changes', (kind) => {
    expect(
      assessCreatorReplan({
        approved,
        proposed: { ...approved, contentDigest: `sha256:${kind}` },
        kind,
      }).requiresRenewedApproval,
    ).toBe(true);
  });

  it('requires renewed approval when a nominally local repair crosses a bound scope', () => {
    const result = assessCreatorReplan({
      approved,
      proposed: {
        ...approved,
        contentDigest: 'sha256:changed-delivery',
        deliveryBoundary: 'publish:4k-master',
      },
      kind: 'local-repair',
    });

    expect(result).toEqual({
      requiresRenewedApproval: true,
      reason: 'Proposed replan changes the approved delivery boundary.',
    });
  });
});
