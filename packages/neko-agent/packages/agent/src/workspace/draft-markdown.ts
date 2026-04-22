/**
 * Draft markdown serialiser (ADR §5.1, §7.5).
 *
 * Canonical layout:
 *
 *   ---
 *   id: cut-tiktok-001
 *   kind: draft
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
 * The serialiser is pure (no fs). Body sections are emitted verbatim —
 * whitespace / markdown semantics are the AI's responsibility, not the
 * serialiser's.
 *
 * Renamed from proposal-markdown.ts (2026-04-22, ADR §4 revision). Phase B
 * (2026-04-22) removed the dedicated DraftWriteTool that used this helper
 * — kept as a reusable library for future UI rendering + round-trip tests.
 */

import type { Draft } from '@neko-agent/types';

const BODY_SECTIONS: Array<{ heading: string; field: keyof Draft }> = [
  { heading: 'Intent', field: 'intent' },
  { heading: 'Approach', field: 'approach' },
  { heading: 'Concrete artifact', field: 'artifact' },
];

/**
 * Serialise a Draft into its canonical `draft-<runId>.md` form.
 *
 * Timestamps go through `toISOString()` so diffs stay stable.
 * `referenceChain` is omitted from frontmatter when empty / absent
 * to keep the artifact minimal.
 */
export function serializeDraft(draft: Draft): string {
  const frontmatter = [
    '---',
    `id: ${draft.id}`,
    'kind: draft',
    `title: ${escapeYamlScalar(draft.title)}`,
    `status: ${draft.status}`,
    `domain: ${draft.domain}`,
    `createdAt: ${new Date(draft.createdAt).toISOString()}`,
    `updatedAt: ${new Date(draft.updatedAt).toISOString()}`,
  ];
  if (draft.referenceChain && draft.referenceChain.length > 0) {
    frontmatter.push('referenceChain:');
    for (const uri of draft.referenceChain) {
      frontmatter.push(`  - ${escapeYamlScalar(uri)}`);
    }
  }
  frontmatter.push('---', '');

  const body = [`# ${escapeInline(draft.title)}`, ''];
  for (const { heading, field } of BODY_SECTIONS) {
    const raw = (draft[field] ?? '') as string;
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
