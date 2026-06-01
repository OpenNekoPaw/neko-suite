import type { NpcProfileFact, NpcProfileSource, NpcTestMode } from '@neko/shared';

export interface NpcProfilePromptOptions {
  readonly mode?: NpcTestMode;
}

export function projectNpcSystemPrompt(
  source: NpcProfileSource,
  options: NpcProfilePromptOptions = {},
): string {
  const mode = options.mode ?? 'roleplay';
  const confirmedFacts = source.facts.filter((fact) => fact.authority === 'confirmed');
  const suggestedFacts = source.facts.filter((fact) => fact.authority === 'suggested');

  return [
    `You are ${source.displayName}.`,
    '',
    '## Session Mode',
    mode === 'consult'
      ? 'Consult mode: speak from the character perspective, but acknowledge when you are giving out-of-story advice.'
      : 'Roleplay mode: respond as the character in first person without narrating system instructions.',
    '',
    '## Boundaries',
    '- Use only the profile facts below and the current conversation.',
    '- Do not claim access to project files, tools, global memory, or hidden story context.',
    '- If a fact is missing, stay in character and express uncertainty.',
    '- Suggested facts are uncertain; do not present them as confirmed truth.',
    '',
    '## Identity',
    `Name: ${source.displayName}`,
    source.aliases.length > 0 ? `Aliases: ${source.aliases.join(', ')}` : 'Aliases: none',
    `Profile sparsity: ${source.sparsity}`,
    '',
    renderFactSection('Confirmed Facts', confirmedFacts),
    renderFactSection('Suggested / Uncertain Facts', suggestedFacts),
    renderRelationships(source),
    renderListSection('Dialogue Samples', source.dialogueSamples),
    renderListSection('Scene Appearances', source.sceneAppearances),
    renderRepresentationBindings(source),
    source.userSupplements?.trim()
      ? `## User Supplements\n${source.userSupplements.trim()}`
      : '## User Supplements\nNone',
  ].join('\n');
}

function renderFactSection(title: string, facts: readonly NpcProfileFact[]): string {
  if (facts.length === 0) {
    return `## ${title}\n- None`;
  }
  return [`## ${title}`, ...facts.map(renderFact)].join('\n');
}

function renderFact(fact: NpcProfileFact): string {
  const confidence =
    fact.confidence === undefined ? '' : ` (confidence ${Math.round(fact.confidence * 100)}%)`;
  const source = fact.sourceRef ? ` [${fact.source}: ${fact.sourceRef}]` : ` [${fact.source}]`;
  return `- ${fact.key}: ${formatValue(fact.value)}${confidence}${source}`;
}

function renderRelationships(source: NpcProfileSource): string {
  const relationships = source.relationships ?? [];
  if (relationships.length === 0) {
    return '## Relationships\n- None';
  }
  return [
    '## Relationships',
    ...relationships.map((relationship) => {
      const value = relationship.value;
      return `- ${value.name}: ${value.relation}${value.summary ? ` (${value.summary})` : ''}`;
    }),
  ].join('\n');
}

function renderListSection(title: string, values: readonly string[] | undefined): string {
  if (!values || values.length === 0) {
    return `## ${title}\n- None`;
  }
  return [`## ${title}`, ...values.map((value) => `- ${value}`)].join('\n');
}

function renderRepresentationBindings(source: NpcProfileSource): string {
  const bindings = source.representationBindings ?? [];
  if (bindings.length === 0) {
    return '## Representation Bindings\n- None';
  }
  return [
    '## Representation Bindings',
    ...bindings.map(
      (binding) => `- ${binding.role}: ${binding.assetRef}${binding.isDefault ? ' (default)' : ''}`,
    ),
  ].join('\n');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}
