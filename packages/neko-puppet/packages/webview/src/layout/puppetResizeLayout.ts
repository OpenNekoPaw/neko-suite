export interface PuppetResizePanelSpec {
  readonly panelId: string;
  readonly defaultSize: number;
  readonly minSize: number;
  readonly maxSize: number;
}

export const PUPPET_RIGHT_PANEL_RESIZE = {
  panelId: 'puppet.rightPanel',
  defaultSize: 280,
  minSize: 200,
  maxSize: 400,
} as const satisfies PuppetResizePanelSpec;
