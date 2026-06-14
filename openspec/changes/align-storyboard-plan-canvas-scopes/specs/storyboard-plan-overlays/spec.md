## ADDED Requirements

### Requirement: Storyboard plan overlays reference storyboard identity
The system SHALL represent execution plans such as AnimationPlan as overlays that reference a source storyboard artifact and its shot identifiers. A plan overlay MUST NOT duplicate scene order, shot order, dialogue, character participation, or source media facts that are already authoritative in StoryboardTable.

#### Scenario: AnimationPlan binds to storyboard shots
- **WHEN** Agent emits an AnimationPlan for a storyboard table
- **THEN** the plan overlay includes a source storyboard reference and shot overlay records keyed by `shotId`
- **THEN** it stores only execution intent fields such as motion, camera, image preparation, prompt intent, audio intent, approval hints, and target capability hints

#### Scenario: Missing shot reference is diagnosed
- **WHEN** a plan overlay contains a shot overlay whose `shotId` is absent from the referenced StoryboardTable
- **THEN** validation reports an orphan overlay diagnostic
- **THEN** the renderer MUST NOT silently attach that overlay to a different shot by row index

### Requirement: Storyboard rendering merges plan overlays into one creator-facing view
The Agent Webview SHALL render StoryboardTable and compatible plan overlays as a single enhanced storyboard view when they reference the same storyboard or matching shot IDs. The UI MUST avoid presenting a second duplicate table for plan fields.

#### Scenario: Animation fields appear on storyboard rows
- **WHEN** a StoryboardTable and AnimationPlan overlay are available for the same response or artifact
- **THEN** each matching storyboard row shows animation fields such as motion intent, camera intent, image prep, video prompt intent, audio prompt intent, and generation requirements in row-level columns or expandable row details

#### Scenario: Plan without storyboard degrades safely
- **WHEN** an AnimationPlan overlay is received without its referenced StoryboardTable
- **THEN** the Webview renders a compact plan summary and a diagnostic explaining that the source storyboard is unavailable
- **THEN** it does not claim the plan is a complete storyboard

### Requirement: Plan overlays separate execution intent from runtime state
Plan overlays SHALL describe how storyboard shots should be prepared or generated, but runtime state such as queued, running, completed, failed, canceled, progress, provider run ID, attempt count, and generated output status MUST remain in Agent async task or execution summary contracts.

#### Scenario: Running task status is derived
- **WHEN** a shot has an AnimationPlan overlay and an Agent async task is running for that shot
- **THEN** the storyboard view may show the running status by joining task state to `shotId`
- **THEN** the AnimationPlan overlay itself remains unchanged by the runtime progress update

#### Scenario: Retry creates execution record not plan rewrite
- **WHEN** the user retries a failed video generation task with the same plan overlay
- **THEN** the system records a new async task or execution run
- **THEN** it does not rewrite the creative storyboard fields or mutate the plan overlay merely to store attempt state

### Requirement: Provider prompts derive from provider-neutral plan intent
The system SHALL treat provider prompts as derived from provider-neutral plan intent and storyboard context. Provider-specific prompt strings MAY be cached or displayed, but the stable plan overlay MUST retain the provider-neutral motion, camera, audio, and preparation intent needed to regenerate prompts for another provider.

#### Scenario: Provider adapter creates prompt
- **WHEN** a video provider adapter prepares a generation request from an AnimationPlan overlay
- **THEN** it derives the provider prompt from storyboard shot content, character context, source media refs, motion intent, camera intent, and provider constraints

#### Scenario: Provider switch preserves intent
- **WHEN** a shot is regenerated with a different provider
- **THEN** the system can derive a new provider-specific prompt from the existing storyboard and plan overlay without requiring a duplicate storyboard table

### Requirement: Plan overlays use durable media and artifact references
Plan overlays SHALL use durable resource, artifact, storyboard, Canvas, Cut, tool-result, or generated-asset references. They MUST NOT persist Webview URIs, blob URLs, inline base64 data, localhost runtime URLs, engine tokens, or absolute local paths.

#### Scenario: Prepared keyframe ref is durable
- **WHEN** an AnimationPlan overlay references a prepared keyframe
- **THEN** the reference uses a stable generated asset ref, resource ref, or tool-result locator
- **THEN** the renderer resolves display URLs through the host boundary rather than reading a persisted runtime URL

#### Scenario: Unsafe runtime URL is rejected
- **WHEN** a plan overlay contains only a blob URL or Webview URI as a generated video reference
- **THEN** validation reports a non-durable media reference diagnostic
- **THEN** projection to provider or Cut payloads does not consume that reference
