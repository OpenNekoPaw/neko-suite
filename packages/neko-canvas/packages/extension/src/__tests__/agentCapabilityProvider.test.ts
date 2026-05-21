import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const providerSource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');
const toolNamesSource = readFileSync(
  join(__dirname, '../../../../../neko-types/src/types/tool-names.ts'),
  'utf-8',
);

describe('agentCapabilityProvider storyboard export contracts', () => {
  it('registers the target-aware Agent content command and editor provider bridge', () => {
    const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
    const editorProviderSource = readFileSync(
      join(__dirname, '../editor/canvasEditorProvider.ts'),
      'utf-8',
    );

    expect(extensionSource).toContain("'neko.canvas.importAgentContent'");
    expect(extensionSource).toContain('canvasEditorProvider.applyAgentContent(payload)');
    expect(editorProviderSource).toContain("'nodes.getActiveContext'");
    expect(editorProviderSource).toContain("'nodes.applyAgentContent'");
    expect(editorProviderSource).toContain("operationType: 'nodes.applyAgentContent'");
  });

  it('syncs shot timeline import metadata after neko-cut import', () => {
    expect(providerSource).toContain('applyCanvasTimelineSyncToCanvas');
    expect(providerSource).toContain(
      "await vscode.commands.executeCommand('neko.cut.importStoryboard'",
    );
    expect(providerSource).toContain('buildStoryboardImportTimelineSyncPayload(');
  });

  it('registers additive composable Canvas Agent tools', () => {
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE');
  });

  it('marks Canvas query and mutation tools with target-aware safety metadata', () => {
    expect(providerSource).toContain("safetyKind: 'read-only-query'");
    expect(providerSource).toContain("safetyKind: 'confirmation-gated'");
    expect(providerSource).toContain('targetRequirements');
    expect(providerSource).toContain('queryBeforeMutate');
    expect(providerSource).toContain('allowedFallbacks');
    expect(providerSource).toContain('preferredQueryTools');
  });

  it('drives preset schemas from shared registry constants', () => {
    expect(providerSource).toContain('CANVAS_AGENT_NODE_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_DERIVE_TARGET_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_CONTAINER_PRESETS');
    expect(providerSource).not.toContain("'shot',\n                'scene'");
  });

  it('validates Canvas Agent node type inputs at the provider boundary', () => {
    expect(providerSource).toContain('isCanvasNodeType');
    expect(providerSource).toContain('readOptionalCanvasNodeType(args.type)');
    expect(providerSource).toContain("readOptionalCanvasNodeType(value.type, 'child node type')");
    expect(providerSource).toContain("readOptionalCanvasNodeType(args.targetType, 'derive target type')");
  });

  it('requests additive subsystem metadata only when callers opt in', () => {
    expect(providerSource).toContain('includeSubsystemMetadata');
    expect(providerSource).toContain(
      'includeSubsystemMetadata: args.includeSubsystemMetadata as boolean | undefined',
    );
  });

  it('contributes prompt fragments for mixed-purpose Canvas subsystem context', () => {
    expect(providerSource).toContain('getPromptFragments(');
    expect(providerSource).toContain('neko-canvas:multi-purpose-canvas-subsystems');
    expect(providerSource).toContain('activeSubsystems');
    expect(providerSource).toContain('includeSubsystemMetadata: true');
    expect(providerSource).toContain('projection adapters');
  });

  it('registers narrative traversal as a read-only mixed Canvas tool', () => {
    expect(providerSource).toContain('traverseNarrativeFlow');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE');
    expect(toolNamesSource).toContain("CANVAS_NARRATIVE_TRAVERSE: 'canvas_narrative_traverse'");
    expect(providerSource).toContain('Ignores storyboard, behavior, entity, and memory nodes');
  });
});
