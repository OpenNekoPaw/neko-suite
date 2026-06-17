import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sketch creative workbench layout boundary', () => {
  const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');
  const cssSource = readFileSync(resolve(__dirname, 'index.css'), 'utf8');
  const toolbarSource = readFileSync(resolve(__dirname, 'components/Toolbar.tsx'), 'utf8');
  const frameTimelineSource = readFileSync(
    resolve(__dirname, 'components/FrameTimeline.tsx'),
    'utf8',
  );

  it('uses the shared shell for drawing canvas, left tool rail, right panels, and timeline', () => {
    expect(appSource).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(appSource).toMatch(/<CreativeWorkbenchShell/);
    expect(appSource).toMatch(/mainKind="drawing-canvas"/);
    expect(appSource).toMatch(/rightPanelClassName="sketch-right-sidebar-host"/);
    expect(appSource).toMatch(
      /leftRail=\{<Toolbar onOpenExport=\{handleOpenExport\} onOpenPackage=\{handleOpenPackage\} \/>}/,
    );
    expect(appSource).toMatch(/mainClassName="sketch-main-panel"/);
    expect(appSource).toMatch(/className="sketch-canvas-container"/);
    expect(appSource).toMatch(/bottomPanel=\{\s*showFrameTimeline \? \(/);
    expect(appSource).toMatch(/<FrameTimeline isKeyboardFocusedRef=\{isKeyboardFocusedRef\} \/>/);
  });

  it('separates keyboard focus ownership from sidebar resize geometry', () => {
    expect(appSource).toMatch(/const keyboardRootRef = useRef<HTMLDivElement \| null>\(null\)/);
    expect(appSource).toMatch(/containerRef: sidebarResizeRef/);
    expect(appSource).toMatch(/useFocusedWebviewRoot\(\s*keyboardRootRef/);
    expect(appSource).toMatch(/useReportWebviewKeyboardFocus\(keyboardRootRef, vscode\)/);
    expect(appSource).toMatch(/ref=\{keyboardRootRef\}/);
  });

  it('captures sketch shortcuts before browser text selection can run', () => {
    expect(appSource).toMatch(/handleSketchKeyboardEvent\(event, \{/);
    expect(appSource).toMatch(
      /isKeyboardFocused: isKeyboardFocusedRef\.current \|\| document\.hasFocus\(\)/,
    );
    expect(appSource).toMatch(
      /clearTextSelection: \(\) => window\.getSelection\(\)\?\.removeAllRanges\(\)/,
    );
    expect(appSource).toMatch(/dispatchKeyboardAction\(action, store\.getState\(\), vscode\)/);
    expect(appSource).toMatch(
      /window\.addEventListener\('keydown', handleKeyDown, SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS\)/,
    );
    expect(appSource).toMatch(
      /window\.removeEventListener\('keydown', handleKeyDown, SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS\)/,
    );
  });

  it('keeps drawing tools on the left rail while sidebar controls stay in the right panel', () => {
    const uiSliceSource = readFileSync(resolve(__dirname, 'stores/slices/uiSlice.ts'), 'utf8');

    expect(uiSliceSource).toMatch(/showSidebar: false/);
    expect(uiSliceSource).toMatch(/sidebarWidth: 300/);
    expect(uiSliceSource).toMatch(/Math\.max\(220, Math\.min\(440, width\)\)/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-export"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-package"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-kind="common-action"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-kind="visibility-toggle"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="main-panel"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="right-panel"/);
    expect(toolbarSource).toMatch(/aria-controls="sketch-frame-timeline"/);
    expect(toolbarSource).toMatch(/aria-controls="sketch-right-sidebar"/);
    expect(appSource).toMatch(/rightPanel=\{\s*showSidebar \? \(/);
    expect(appSource).toMatch(/id="sketch-right-sidebar"/);
    expect(appSource).toMatch(/ref=\{sidebarResizeRef\}/);
    expect(appSource).toMatch(/className="sketch-right-sidebar"/);
    expect(appSource).toMatch(/style=\{\{ width: sidebarWidth \}\}/);
    expect(appSource).toMatch(/<SketchInspectorStack/);
    for (const token of [
      '<BrushPanel',
      '<PalettePanel',
      '<LayerPanel',
      '<FilterPanel',
      '<FrameControls',
      '<ScenePanel',
    ]) {
      expect(appSource).toMatch(new RegExp(token.replace('<', '<')));
    }
  });

  it('models the sketch inspector as default, contextual, animation, and advanced panels', () => {
    const inspectorSource = appSource.slice(
      appSource.indexOf('function SketchInspectorStack'),
      appSource.indexOf('function AIRunMonitor'),
    );

    expect(appSource).toMatch(/function SketchInspectorStack/);
    expect(appSource).toMatch(/VECTOR_INSPECTOR_TOOLS/);
    expect(appSource).toMatch(/FILL_INSPECTOR_TOOLS/);
    expect(inspectorSource).toContain(
      'className="sketch-right-sidebar-stack sketch-inspector-compact"',
    );

    const brushIndex = inspectorSource.indexOf('<BrushPanel');
    const paletteIndex = inspectorSource.indexOf('<PalettePanel');
    const layerIndex = inspectorSource.indexOf('<LayerPanel');
    const frameIndex = inspectorSource.indexOf('<FrameControls');
    const advancedIndex = inspectorSource.indexOf(
      '<CollapsiblePanel titleKey="sketch.panel.advanced" defaultExpanded={false}>',
    );
    const spritesheetIndex = inspectorSource.indexOf('<SpriteSheetPlayer');
    const filterIndex = inspectorSource.indexOf('<FilterPanel');
    const perspectiveIndex = inspectorSource.indexOf('<PerspectiveGridPanel');
    const aiIndex = inspectorSource.indexOf('<AIPanel');
    const particleIndex = inspectorSource.indexOf('<ParticlePanel');
    const sceneIndex = inspectorSource.indexOf('<ScenePanel');

    expect(inspectorSource).toMatch(
      /showFrameTimeline && \(\s*<CollapsiblePanel titleKey="sketch\.panel\.frames"/,
    );
    expect(inspectorSource).toMatch(
      /showFrameTimeline && \(\s*<CollapsiblePanel titleKey="sketch\.panel\.spritesheet" defaultExpanded=\{false\}/,
    );

    expect(brushIndex).toBeGreaterThan(-1);
    expect(paletteIndex).toBeGreaterThan(brushIndex);
    expect(layerIndex).toBeGreaterThan(paletteIndex);
    expect(frameIndex).toBeGreaterThan(layerIndex);
    expect(advancedIndex).toBeGreaterThan(frameIndex);
    for (const advancedPanelIndex of [
      spritesheetIndex,
      filterIndex,
      perspectiveIndex,
      aiIndex,
      particleIndex,
      sceneIndex,
    ]) {
      expect(advancedPanelIndex).toBeGreaterThan(advancedIndex);
    }
  });

  it('projects passive status to VSCode and keeps frame controls in the main workbench', () => {
    expect(appSource).toMatch(/type: 'status:update'/);
    expect(appSource).toMatch(/zoom: viewport\.zoom/);
    expect(appSource).toMatch(/activeTool/);
    expect(frameTimelineSource).toMatch(/id="sketch-frame-timeline"/);
    expect(frameTimelineSource).toMatch(/className="flex flex-col border-t/);
    expect(frameTimelineSource).toMatch(/role="listbox"/);
  });

  it('keeps the right sidebar fixed, scrollable, and clipped inside its workbench lane', () => {
    expect(cssSource).toMatch(/\.sketch-right-sidebar-host\s*\{/);
    expect(cssSource).toMatch(/\.sketch-right-sidebar\s*\{/);
    expect(cssSource).toMatch(/flex:\s*0 0 auto/);
    expect(cssSource).toMatch(/min-width:\s*220px/);
    expect(cssSource).toMatch(/max-width:\s*440px/);
    expect(cssSource).toMatch(/\.sketch-right-sidebar-stack\s*\{/);
    expect(cssSource).toMatch(/overflow-x:\s*hidden/);
    expect(cssSource).toMatch(/overflow-y:\s*auto/);
    expect(cssSource).toMatch(/\.sketch-right-sidebar input\[type='range'\]/);
    expect(cssSource).toMatch(/\.neko-collapsible\s*\{/);
    expect(cssSource).toMatch(/\.neko-collapsible\.expanded\s*\{/);
    expect(cssSource).toMatch(/\.neko-collapsible-body > \.sketch-panel > h3\.sketch-panel-title/);
    expect(cssSource).not.toMatch(
      /\.sketch-inspector-compact \.sketch-panel-title\s*\{\s*display:\s*none/,
    );
  });
});
