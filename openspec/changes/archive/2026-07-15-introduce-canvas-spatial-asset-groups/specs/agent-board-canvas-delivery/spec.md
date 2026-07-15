## MODIFIED Requirements

### Requirement: Typed creative results automatically author into the resolved Canvas

The Agent delivery boundary SHALL automatically author creator-useful Markdown documents, selected already-durable file/reference inputs, and other valid durable creator-output projections into the resolved Board Canvas through existing public Canvas authoring capabilities. Completed generated binary media that has not been promoted to AssetLibrary/AssetStore MUST instead create or update a runtime generated-draft Group bound to the resolved Board and MUST NOT become a durable `.nkc` node.

#### Scenario: Storyboard planning completes

- **WHEN** Agent produces a Storyboard plan as a creator-useful Markdown artifact without explicit structured authoring intent
- **THEN** it is authored as normal Markdown/document content in the resolved Board Canvas without Send to Canvas

#### Scenario: Media task completes

- **WHEN** an image, audio, or video task completes with valid unpromoted generated-output identity
- **THEN** Canvas receives a runtime review Group projection for the frozen Board target and MUST NOT author a durable media node until explicit Asset promotion succeeds

#### Scenario: Promoted media is accepted for Board authoring

- **WHEN** explicit Save to Assets returns stable Asset identities for selected generated candidates
- **THEN** the delivery boundary MAY author ordinary Asset-backed nodes and their manual Group into the frozen Board target through revision-checked Canvas authoring
