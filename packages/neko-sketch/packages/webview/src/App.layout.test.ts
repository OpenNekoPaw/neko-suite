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
    expect(appSource).toMatch(/className="sketch-right-sidebar-stack"/);
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
    expect(cssSource).toMatch(/min-width:\s*200px/);
    expect(cssSource).toMatch(/max-width:\s*400px/);
    expect(cssSource).toMatch(/\.sketch-right-sidebar-stack\s*\{/);
    expect(cssSource).toMatch(/overflow-x:\s*hidden/);
    expect(cssSource).toMatch(/overflow-y:\s*auto/);
    expect(cssSource).toMatch(/\.sketch-right-sidebar input\[type='range'\]/);
  });
});
