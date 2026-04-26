import { describe, expect, it, vi } from 'vitest';
import { ProviderCardProjectRouter } from '../provider-card-project-router';

function createFs(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error('ENOENT');
      return content;
    }),
    writeFile: vi.fn(async (path: string, data: string) => {
      files.set(path, data);
    }),
  };
}

describe('ProviderCardProjectRouter', () => {
  it('writes structured provider expression observations into project card overrides', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
    });

    const result = await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-expression-context-bypassed',
      styleFamily: 'anime',
      metadata: { mode: 'fallback' },
    });

    expect(result).toEqual({
      providerId: 'sdxl',
      path: '/workspace/demo/.neko/providers/sdxl.card.md',
      written: true,
      reason: 'fallback-observation',
    });
    expect(fs.mkdir).toHaveBeenCalledWith('/workspace/demo/.neko/providers', { recursive: true });

    const content = fs.files.get('/workspace/demo/.neko/providers/sdxl.card.md') ?? '';
    expect(content).toContain('## Project Observations');
    expect(content).toContain('"type":"provider-card-observation"');
    expect(content).toContain('"mode":"fallback"');
    expect(content).toContain('"styleFamily":"anime"');
    expect(content).toContain('"reason":"provider-expression-context-bypassed"');
  });

  it('queues project provider-card patches for human review when review mode is enabled', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
      reviewMode: 'review-queue',
    });

    const result = await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      styleFamily: 'anime',
      concepts: ['cluttercore'],
      metadata: { mode: 'agentic' },
    });

    expect(result).toEqual({
      providerId: 'sdxl',
      path: '/workspace/demo/.neko/providers/review/sdxl-1970-01-01T00-00-00-000Z.patch.md',
      written: true,
      reason: 'queued-for-review',
    });
    expect(fs.files.has('/workspace/demo/.neko/providers/sdxl.card.md')).toBe(false);

    const patch = fs.files.get(result?.path ?? '') ?? '';
    expect(patch).toContain('status: pending-review');
    expect(patch).toContain('Apply this patch only after human review');
    expect(patch).toContain('```markdown');
    expect(patch).toContain('cluttercore → project-observed anime concept');
  });

  it('rejects invalid provider ids before computing project override paths', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
    });

    const result = await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: '../../../etc/passwd',
      metadata: { mode: 'agentic' },
    });

    expect(result).toBeNull();
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('deduplicates review-queue observations against the live provider card', async () => {
    const path = '/workspace/demo/.neko/providers/sdxl.card.md';
    const fs = createFs({
      [path]: [
        '---',
        'providerId: "sdxl"',
        'version: 0.0.0',
        'capabilities: [image.generate]',
        '---',
        '# sdxl Project Override',
        '',
        '## Project Observations',
        '- {"type":"provider-card-observation","mode":"agentic","toolName":"GenerateImage","observedAt":"1970-01-01T00:00:00.000Z"}',
        '',
      ].join('\n'),
    });
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 1000,
      reviewMode: 'review-queue',
    });

    const result = await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-img-2',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      metadata: { mode: 'agentic' },
    });

    expect(result).toEqual({
      providerId: 'sdxl',
      path,
      written: false,
      reason: 'dedup',
    });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('appends observations into an existing Project Observations section', async () => {
    const path = '/workspace/demo/.neko/providers/sdxl.card.md';
    const fs = createFs({
      [path]: [
        '---',
        'providerId: sdxl',
        'version: 0.0.0',
        'capabilities: [image.generate]',
        '---',
        '# sdxl Project Override',
        '',
        '## Project Observations',
        '- {"type":"provider-card-observation","mode":"agentic","toolName":"GenerateImage","observedAt":"1970-01-01T00:00:00.000Z"}',
        '',
        '## Part 3: Training Profile',
        '',
        '### Anti-Bias Strategies',
      ].join('\n'),
    });
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 1000,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-img-2',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-card-not-found',
      metadata: { mode: 'fallback' },
    });

    const content = fs.files.get(path) ?? '';
    expect(content.indexOf('"mode":"fallback"')).toBeLessThan(
      content.indexOf('## Part 3: Training Profile'),
    );
  });

  it('writes native provider observations for explicit no-card model usage', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
    });

    const result = await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'native',
      providerId: 'brand-new-model',
      reason: 'provider-card-unavailable',
      styleFamily: 'photorealistic',
      concepts: ['high detail'],
      metadata: { mode: 'native' },
    });

    expect(result).toEqual({
      providerId: 'brand-new-model',
      path: '/workspace/demo/.neko/providers/brand-new-model.card.md',
      written: true,
      reason: 'native-observation',
    });

    const content = fs.files.get('/workspace/demo/.neko/providers/brand-new-model.card.md') ?? '';
    expect(content).toContain('"mode":"native"');
    expect(content).toContain('"reason":"provider-card-unavailable"');
    expect(content).toContain('- high detail → project-observed photorealistic concept');
    expect(content).toContain(
      '- Project observation for photorealistic: verify provider card coverage before routing generation requests.',
    );
  });

  it('writes semantic concepts into unknown concept coverage candidates', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-card-not-found',
      styleFamily: 'anime',
      concepts: ['cluttercore', 'cyberpunk'],
      metadata: { mode: 'fallback' },
    });

    const content = fs.files.get('/workspace/demo/.neko/providers/sdxl.card.md') ?? '';
    expect(content).toContain('## Part 2: Concept Coverage Map');
    expect(content).toContain('### Unknown');
    expect(content).toContain('- cluttercore → project-observed anime concept');
    expect(content).toContain('- cyberpunk → project-observed anime concept');
  });

  it('deduplicates unknown concept candidates', async () => {
    const path = '/workspace/demo/.neko/providers/sdxl.card.md';
    const fs = createFs({
      [path]: [
        '---',
        'providerId: sdxl',
        'version: 0.0.0',
        'capabilities: [image.generate]',
        '---',
        '# sdxl Project Override',
        '',
        '## Part 2: Concept Coverage Map',
        '',
        '### Unknown',
        '- cluttercore → project-observed anime concept',
        '',
      ].join('\n'),
    });
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 1000,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-img-2',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-card-not-found',
      styleFamily: 'anime',
      concepts: ['cluttercore'],
      metadata: { mode: 'fallback' },
    });

    const content = fs.files.get(path) ?? '';
    expect(content.match(/cluttercore → project-observed anime concept/g)).toHaveLength(1);
  });

  it('writes fallback observations as anti-bias strategy candidates', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-router-disabled',
      styleFamily: 'anime',
      metadata: { mode: 'fallback' },
    });

    const content = fs.files.get('/workspace/demo/.neko/providers/sdxl.card.md') ?? '';
    expect(content).toContain('## Part 3: Training Profile');
    expect(content).toContain('### Anti-Bias Strategies');
    expect(content).toContain(
      '- Project observation for anime: require explicit provider selection when automatic routing is disabled.',
    );
  });

  it('deduplicates anti-bias strategy candidates while keeping new observations', async () => {
    const path = '/workspace/demo/.neko/providers/sdxl.card.md';
    const fs = createFs({
      [path]: [
        '---',
        'providerId: sdxl',
        'version: 0.0.0',
        'capabilities: [image.generate]',
        '---',
        '# sdxl Project Override',
        '',
        '## Part 3: Training Profile',
        '',
        '### Anti-Bias Strategies',
        '- Project observation for anime: require explicit provider selection when automatic routing is disabled.',
        '',
      ].join('\n'),
    });
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 1000,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-img-2',
      toolName: 'GenerateImage',
      mode: 'fallback',
      providerId: 'sdxl',
      reason: 'provider-router-disabled',
      styleFamily: 'anime',
      metadata: { mode: 'fallback' },
    });

    const content = fs.files.get(path) ?? '';
    expect(content.match(/require explicit provider selection/g)).toHaveLength(1);
    expect(content).toContain('## Project Observations');
  });

  it('writes concept decisions into coverage subsections', async () => {
    const fs = createFs();
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 0,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 0,
      toolCallId: 'call-img',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      styleFamily: 'anime',
      conceptDecisions: [
        { concept: 'cluttercore', status: 'unknown', output: 'dense room details' },
        { concept: 'glitch halo', status: 'partial' },
        { concept: 'washed-out skin', status: 'anti-pattern' },
        { concept: 'portrait', status: 'native', output: 'portrait' },
      ],
      metadata: { mode: 'agentic' },
    });

    const content = fs.files.get('/workspace/demo/.neko/providers/sdxl.card.md') ?? '';
    expect(content).toContain('## Part 2: Concept Coverage Map');
    expect(content).toContain('### Unknown');
    expect(content).toContain('- cluttercore → dense room details');
    expect(content).toContain('### Partial');
    expect(content).toContain('- glitch halo → project-observed anime concept');
    expect(content).toContain('### Anti-Patterns');
    expect(content).toContain('- washed-out skin → project-observed anime concept');
    expect(content).not.toContain('- portrait → portrait');
  });

  it('deduplicates concept decision coverage lines', async () => {
    const path = '/workspace/demo/.neko/providers/sdxl.card.md';
    const fs = createFs({
      [path]: [
        '---',
        'providerId: sdxl',
        'version: 0.0.0',
        'capabilities: [image.generate]',
        '---',
        '# sdxl Project Override',
        '',
        '## Part 2: Concept Coverage Map',
        '',
        '### Partial',
        '- glitch halo → project-observed anime concept',
        '',
      ].join('\n'),
    });
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 1000,
    });

    await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-img-2',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      styleFamily: 'anime',
      conceptDecisions: [{ concept: 'glitch halo', status: 'partial' }],
      metadata: { mode: 'agentic' },
    });

    const content = fs.files.get(path) ?? '';
    expect(content.match(/glitch halo → project-observed anime concept/g)).toHaveLength(1);
  });

  it('deduplicates equivalent structured observations ignoring observedAt', async () => {
    const path = '/workspace/demo/.neko/providers/sdxl.card.md';
    const fs = createFs({
      [path]: [
        '---',
        'providerId: sdxl',
        'version: 0.0.0',
        'capabilities: [image.generate]',
        '---',
        '# sdxl Project Override',
        '',
        '## Project Observations',
        '- {"type":"provider-card-observation","mode":"agentic","toolName":"GenerateImage","styleFamily":"anime","observedAt":"1970-01-01T00:00:00.000Z"}',
        '',
      ].join('\n'),
    });
    const router = new ProviderCardProjectRouter({
      workspaceRoot: '/workspace/demo',
      fsOps: fs,
      now: () => 1000,
    });

    const result = await router.writeObservation({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-img-2',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'sdxl',
      styleFamily: 'anime',
      metadata: { mode: 'agentic' },
    });

    expect(result?.written).toBe(false);
    expect(result?.reason).toBe('dedup');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
