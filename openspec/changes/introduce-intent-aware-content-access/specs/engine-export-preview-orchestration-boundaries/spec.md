## ADDED Requirements

### Requirement: Export and preview orchestration are separated by content intent
The system SHALL keep export orchestration and preview orchestration separated by explicit content access intent so preview backends may use derived variants while export backends use source-backed inputs.

#### Scenario: Preview orchestration requests preview variant
- **WHEN** preview orchestration needs a poster, thumbnail, proxy, FOV crop, or screenshot
- **THEN** it requests preview-intent content or a preview variant
- **THEN** the result is treated as runtime preview data

#### Scenario: Export orchestration requests source
- **WHEN** export orchestration needs a media, model, document, or generated asset input
- **THEN** it requests final-export source content
- **THEN** it does not consume the preview orchestration's runtime URL, preview token, or derived cache artifact

### Requirement: Export-preview tests cover cache/source separation
The system SHALL include tests or architecture guardrails that prove preview cache artifacts do not become export inputs by default.

#### Scenario: Guard rejects thumbnail export input
- **WHEN** an export backend receives a thumbnail, preview, Webview URI, or cache-only reference as its sole input
- **THEN** validation fails or the resolver returns missing-source

#### Scenario: Guard allows explicit draft proxy input
- **WHEN** an export request explicitly uses draft/proxy quality mode
- **THEN** validation allows proxy-backed input
- **THEN** diagnostics record that the export intentionally used proxy media
