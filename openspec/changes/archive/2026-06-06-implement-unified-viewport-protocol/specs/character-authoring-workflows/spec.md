## ADDED Requirements

### Requirement: Model Controller Uses ISceneController
Model editor viewport interactions SHALL be mediated by a `ModelController` implementation of `ISceneController`.

#### Scenario: Model pointer selection delegates through controller
- **WHEN** a user clicks the model viewport
- **THEN** ViewportShell delegates the event to ModelController, which sends an engine-mediated hit-test or selection command

#### Scenario: Model toolbar extensions are supplied by controller
- **WHEN** ViewportToolbar renders for a model scene
- **THEN** model-specific camera, material preview, or gizmo controls are supplied through controller toolbar descriptors

### Requirement: Character Prediction Uses Viewport Metadata
Character morph, IK, bone, and transform predictions in the model editor SHALL reconcile through ViewportProtocol events and frame metadata.

#### Scenario: IK prediction clears on frame
- **WHEN** a model IK command is acknowledged and a matching frame metadata event arrives
- **THEN** the model controller clears the local IK prediction and displays the engine frame as visual truth
