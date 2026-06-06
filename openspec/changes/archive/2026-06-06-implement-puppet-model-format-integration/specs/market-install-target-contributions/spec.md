## ADDED Requirements

### Requirement: Puppet Model And Config Install Targets
The system SHALL support domain install targets for puppet model and puppet config media kinds.

#### Scenario: Puppet model package installs through puppet target
- **WHEN** a media package has media kind `puppet-model`
- **THEN** target resolution selects the puppet model install target and installs it under the configured puppet model preset location

#### Scenario: Puppet config package installs through puppet target
- **WHEN** a media package has media kind `puppet-config`
- **THEN** target resolution selects the puppet config install target and installs it under the configured puppet config preset location

### Requirement: Model Asset Install Targets
The system SHALL support domain install targets for 3D model, model motion, and model config media kinds.

#### Scenario: 3D model package installs through model target
- **WHEN** a media package has media kind `model-3d`
- **THEN** target resolution selects the model asset install target and installs it under the configured 3D model location

#### Scenario: Model motion package installs through model target
- **WHEN** a media package has media kind `model-motion`
- **THEN** target resolution selects the model motion install target

### Requirement: Voice Pack Install Target
The system SHALL support a voice-pack media install target that can be shared by puppet and model consumers.

#### Scenario: Voice pack installs as shared media
- **WHEN** a media package has media kind `voice-pack`
- **THEN** target resolution selects the voice-pack install target and emits install events that puppet/model consumers can observe
