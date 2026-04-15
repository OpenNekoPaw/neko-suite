// =============================================================================
// Puppet Project Types — .nkp file format (supports .inp and .moc3 binaries)
//
// Lightweight JSON wrapper referencing an external .inp/.moc3 binary puppet file.
// Stores parameter overrides and viewport state.
// =============================================================================

/** Supported puppet binary formats */
export type PuppetFormat = 'inp' | 'moc3';

/** .nkp project data */
export interface NkpProjectData {
  version: string;
  name: string;
  puppet: {
    src: string | null;
    /** Binary format (auto-detected from file extension if omitted) */
    format?: PuppetFormat;
  };
  parameters: Record<string, number>;
  /** Standard face parameter values (subset matching PUPPET_FACE_PARAMETERS) */
  faceParameters?: Record<string, number>;
  viewport: { zoom: number };
}
