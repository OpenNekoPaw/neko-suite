## ADDED Requirements

### Requirement: Puppet And Model Media Kinds
Market media manifests SHALL support puppet/model asset media kinds for model, motion, config, and voice assets.

#### Scenario: Validate puppet model media manifest
- **WHEN** a media manifest declares media kind `puppet-model`
- **THEN** manifest validation accepts it only when required media metadata and files are present

#### Scenario: Validate model config media manifest
- **WHEN** a media manifest declares media kind `model-config`
- **THEN** manifest validation accepts it only when required config metadata and files are present

### Requirement: Character And Motion Bundle Types
Market bundle manifests SHALL support character-pack and motion-pack bundle type metadata.

#### Scenario: Character pack bundle
- **WHEN** a bundle manifest declares bundle type `character-pack`
- **THEN** bundle contents can reference model, motion, config, and optional voice packages

#### Scenario: Motion pack bundle
- **WHEN** a bundle manifest declares bundle type `motion-pack`
- **THEN** bundle contents can reference one or more motion packages for puppet or model consumers
