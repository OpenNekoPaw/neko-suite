/**
 * QA Types — Data types for creative output quality analysis
 *
 * Agent layer, zero vscode dependency.
 *
 * These types are used by:
 *   - Pipeline diagnostics Skill (Agent-guided analysis on user request)
 *   - Gate preview enrichment (scene summary + media path for user review)
 *   - Run report scene summary
 *
 * NOT used for automated LLM-evaluates-LLM scoring.
 * Quality judgment is the user's responsibility via Gate confirm/cancel.
 */

// =============================================================================
// Scene Review (user-facing, shown at Gate preview)
// =============================================================================

/** User verdict after reviewing a scene at a Gate */
export type SceneVerdict = 'accept' | 'needs-edit' | 'regenerate';

/** Per-scene review card — structured data for Gate preview */
export interface SceneReviewCard {
  /** Scene index (matches StoryboardScene.index) */
  sceneIndex: number;
  /** Scene heading from storyboard */
  heading: string;
  /** Scene description (brief, for user reference) */
  description: string;
  /** Path to the generated media file */
  mediaPath: string;
  /** Media type */
  mediaType: 'image' | 'video';
  /** User verdict (set during Gate review) */
  verdict?: SceneVerdict;
  /** User notes (optional, from Gate review) */
  notes?: string;
}

/** Gate preview data — sent to WebView when pipeline pauses for user review */
export interface GatePreviewData {
  /** Stage that triggered the gate */
  stageName: string;
  /** Scene review cards for user inspection */
  scenes: SceneReviewCard[];
  /** Global style applied */
  globalStyle?: string;
  /** Indices of scenes that failed generation */
  failedIndices: number[];
}

// =============================================================================
// Diagnostics (Agent-guided analysis on user request)
// =============================================================================

/** Scene diagnostic — produced by diagnostics Skill when user asks "what went wrong" */
export interface SceneDiagnostic {
  sceneIndex: number;
  heading: string;
  /** What the storyboard asked for */
  intendedDescription: string;
  /** What was actually generated (media path) */
  generatedPath?: string;
  /** Issues identified by Agent analysis */
  issues: string[];
  /** Agent's suggested fix (prompt revision, style change, etc.) */
  suggestion: string;
}

/** Pipeline diagnostics report — produced by diagnostics Skill */
export interface DiagnosticsReport {
  pipelineId: string;
  flowId: string;
  /** Overall status */
  status: 'healthy' | 'partial-failure' | 'failed';
  /** Which stages succeeded/failed */
  stagesSummary: string;
  /** Per-scene diagnostics (only for scenes with issues) */
  sceneDiagnostics: SceneDiagnostic[];
  /** Recommended next actions */
  recommendations: string[];
}

// =============================================================================
// P2: Cross-Scene Consistency (data types — used by future Skill)
// =============================================================================

/** Style drift between two adjacent scenes */
export interface StyleDriftPair {
  fromScene: number;
  toScene: number;
  /** Drift score 0-100 (0 = identical style, 100 = completely different) */
  driftScore: number;
  /** Description of the style change */
  description: string;
}

/** Character appearance tracking across scenes */
export interface CharacterAppearance {
  /** Character name or identifier */
  name: string;
  /** Per-scene appearance evaluations */
  appearances: Array<{
    sceneIndex: number;
    /** Consistency score vs first appearance (0-100) */
    score: number;
    /** Specific inconsistencies found */
    issues: string[];
  }>;
}

/** Complete cross-scene consistency report */
export interface ConsistencyReport {
  /** Overall consistency score (0-100) */
  overallConsistency: number;
  /** Style drift analysis between adjacent scenes */
  styleDrift: StyleDriftPair[];
  /** Character appearance consistency */
  characterConsistency: CharacterAppearance[];
  /** Overall aesthetic quality score (0-100) */
  aestheticScore: number;
  /** Actionable recommendations */
  recommendations: string[];
}
