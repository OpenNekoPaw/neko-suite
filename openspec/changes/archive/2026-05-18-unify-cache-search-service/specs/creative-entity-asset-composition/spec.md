## ADDED Requirements

### Requirement: Creative Entity Search Does Not Require Visual Identity
The system SHALL expose confirmed creative entities, script-derived entity candidates, and missing representation requirements to project search even when they do not have a visual identity draft, generated asset, confirmed asset binding, or resolved representation.

#### Scenario: Script character is searchable before portrait exists
- **WHEN** Story identifies a candidate character from a script and no portrait or visual identity exists for that name
- **THEN** project search can return the candidate as an entity-candidate or script-role result

#### Scenario: Confirmed entity without asset is searchable
- **WHEN** a creative entity exists as a confirmed project fact but has no bound asset
- **THEN** project search can return that entity by canonical name or alias

#### Scenario: Missing representation requirement is searchable
- **WHEN** the project records that an entity is missing a portrait, reference image, Live2D model, or other representation
- **THEN** project search can surface the entity and requirement without creating a fake asset record

#### Scenario: Visual identity remains optional layer
- **WHEN** search returns an entity that has no visual identity
- **THEN** the result indicates the entity identity and missing representation state without treating visual facts as required identity fields
