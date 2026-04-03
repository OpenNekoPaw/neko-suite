// =============================================================================
// Puppet Project Types — .nkp file format
//
// Lightweight JSON wrapper referencing an external .inp binary puppet file.
// Stores parameter overrides and viewport state.
// =============================================================================

/** .nkp project data */
export interface NkpProjectData {
  version: string;
  name: string;
  puppet: { src: string | null };
  parameters: Record<string, number>;
  /** Standard face parameter values (subset matching PUPPET_FACE_PARAMETERS) */
  faceParameters?: Record<string, number>;
  viewport: { zoom: number };
}
