import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cut creative workbench layout boundary', () => {
  const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');
  const toolbarSource = readFileSync(resolve(__dirname, 'components/CutSideToolbar.tsx'), 'utf8');
  const timelineSource = readFileSync(
    resolve(__dirname, 'components/Timeline/Timeline.tsx'),
    'utf8',
  );
  const timelineControlsSource = readFileSync(
    resolve(__dirname, 'components/Timeline/TimelineControls.tsx'),
    'utf8',
  );

  it('uses the shared shell for left rail, preview timeline main panel, and right properties', () => {
    expect(appSource).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(appSource).toMatch(/<CreativeWorkbenchShell/);
    expect(appSource).toMatch(/mainKind="preview-timeline"/);
    expect(appSource).toMatch(/leftRail=\{\s*<CutSideToolbar/);
    expect(appSource).toMatch(/mainClassName="cut-main-panel"/);
    expect(appSource).toMatch(/rightPanel=\{\s*propertyPanelVisible \? \(/);
    expect(appSource).toMatch(/id="cut-property-panel"/);
  });

  it('keeps preview, timeline surfaces, and timeline controls inside the main panel', () => {
    expect(appSource).toMatch(/className="cut-preview-timeline-panel"/);
    expect(appSource).toMatch(/<PreviewControls/);
    expect(appSource).toMatch(/<Timeline \/>/);
    expect(timelineSource).toMatch(/<TimelineControls/);
    expect(timelineSource).toMatch(/mainPanelToolsVisible/);
    expect(timelineControlsSource).toMatch(/<MainPanelControlLayer/);
    expect(timelineControlsSource).toMatch(/id="cut-main-panel-tools"/);
    expect(timelineControlsSource).toMatch(/placement="timeline-header"/);
  });

  it('keeps timeline edit commands out of the left rail while exposing export/package actions', () => {
    expect(toolbarSource).toMatch(/CreativeLeftRail/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="add-media-track"/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="split-selection"/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="toggle-snapping"/);
    expect(toolbarSource).toMatch(/id: 'open-export'/);
    expect(toolbarSource).toMatch(/id: 'open-package'/);
    expect(toolbarSource).toMatch(/kind: 'common-action'/);
    expect(toolbarSource).toMatch(/kind: 'visibility-toggle'/);
    expect(toolbarSource).toMatch(/controls: 'cut-main-panel-tools'/);
    expect(toolbarSource).toMatch(/controls: 'cut-property-panel'/);
    expect(toolbarSource).not.toMatch(/controls: 'cut-timeline-minimap'/);
    expect(toolbarSource).not.toMatch(/visibilityTarget: 'hud'/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.mediaTrack/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.split/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.snapping/);
    expect(timelineControlsSource).toMatch(/timeline\.controls\.exportVideo/);
  });
});
