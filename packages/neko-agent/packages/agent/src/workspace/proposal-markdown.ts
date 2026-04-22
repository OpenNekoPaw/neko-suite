/**
 * Proposal markdown serialiser (ADR §5.1, §7.5).
 *
 * Canonical layout:
 *
 *   ---
 *   id: cut-tiktok-001
 *   kind: proposal
 *   title: <title>
 *   status: pending_review
 *   domain: cut
 *   createdAt: <ISO 8601>
 *   updatedAt: <ISO 8601>
 *   referenceChain:            # optional; omitted when empty
 *     - asset://characters/hero
 *   ---
 *
 *   # <title>
 *
 *   ## Intent
 *   <intent body>
 *
 *   ## Approach
 *   <approach body>
 *
 *   ## Concrete artifact
 *   <artifact body>
 *
 * The serialiser is pure (no fs); the ProposalWriteTool handles I/O.
 * Body sections are emitted verbatim — whitespace / markdown semantics
 * are the AI's responsibility, not the serialiser's.
 */

import type { Proposal } from '@neko-agent/types';

const BODY_SECTIONS: Array<{ heading: string; field: keyof Proposal }> = [
  { heading: 'Intent', field: 'intent' },
  { heading: 'Approach', field: 'approach' },
  { heading: 'Concrete artifact', field: 'artifact' },
];

/**
 * Serialise a Proposal into its canonical `.nkproposal.md` form.
 *
 * Timestamps go through `toISOString()` so diffs stay stable.
 * `referenceChain` is omitted from frontmatter when empty / absent
 * to keep the artifact minimal.
 */
export function serializeProposal(proposal: Proposal): string {
  const frontmatter = [
    '---',
    `id: ${proposal.id}`,
    'kind: proposal',
    `title: ${escapeYamlScalar(proposal.title)}`,
    `status: ${proposal.status}`,
    `domain: ${proposal.domain}`,
    `createdAt: ${new Date(proposal.createdAt).toISOString()}`,
    `updatedAt: ${new Date(proposal.updatedAt).toISOString()}`,
  ];
  if (proposal.referenceChain && proposal.referenceChain.length > 0) {
    frontmatter.push('referenceChain:');
    for (const uri of proposal.referenceChain) {
      frontmatter.push(`  - ${escapeYamlScalar(uri)}`);
    }
  }
  frontmatter.push('---', '');

  const body = [`# ${escapeInline(proposal.title)}`, ''];
  for (const { heading, field } of BODY_SECTIONS) {
    const raw = (proposal[field] ?? '') as string;
    body.push(`## ${heading}`, '', raw.trimEnd(), '');
  }

  return `${frontmatter.join('\n')}\n${body.join('\n')}`;
}

// =============================================================================
// Escaping
// =============================================================================

/**
 * Protect YAML scalars that might confuse the parser. Only quote when
 * necessary — leave readable values (URIs, paths) bare:
 *
 *   - Leading hazardous char (indicator or whitespace) → quote
 *   - Contains `: ` (colon + space) → quote (YAML key/value separator)
 *   - Contains quotes / backticks / newlines → quote
 *   - Starts or ends with whitespace → quote
 *
 * `asset://characters/hero` has a colon but no `: ` pair, so it stays
 * bare. `"Launch: v2"` gets quoted because of the `: ` pair.
 */
function escapeYamlScalar(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ');
  if (clean.length === 0) return '""';
  const trimmed = clean.trim();
  if (trimmed.length === 0) return '""';
  const leadingHazard = /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(trimmed);
  const pairHazard = /: /.test(trimmed);
  const quoteHazard = /["'`]/.test(trimmed);
  const edgeHazard = clean !== trimmed;
  if (leadingHazard || pairHazard || quoteHazard || edgeHazard) {
    return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return trimmed;
}

function escapeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
