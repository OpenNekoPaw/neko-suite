## ADDED Requirements

### Requirement: Provider connection modes are explicit

Agent provider configuration SHALL distinguish the connection path from adapter selection. A provider MAY still use its provider type for adapter lookup, but it SHALL be able to declare whether it is a gateway, custom gateway, local runtime, or future direct official API.

#### Scenario: Gateway provider is classified

- **WHEN** the default Agent configuration defines a NewAPI-compatible gateway provider
- **THEN** the provider declares a gateway connection mode and a NewAPI-compatible protocol profile

#### Scenario: Local provider is classified

- **WHEN** the default Agent configuration defines a local model provider
- **THEN** the provider declares a local connection mode and a local protocol profile

### Requirement: NewAPI-compatible gateway is the MVP proxy path

The Agent MVP SHALL expose NewAPI-compatible gateway configuration as the supported proxy/cloud path. Official direct providers and additional proxy products SHALL NOT be required for the MVP default configuration.

#### Scenario: Default config prefers gateway and local providers

- **WHEN** a default Agent configuration is created
- **THEN** its built-in providers include a NewAPI-compatible gateway and a local provider
- **THEN** official direct vendor providers are not the recommended default provider path

#### Scenario: Custom NewAPI endpoint is configurable

- **WHEN** a user wants to use a third-party or self-hosted NewAPI-compatible endpoint
- **THEN** the configuration can represent that provider as a custom gateway without changing adapter code

### Requirement: Local providers do not require API keys

Local private model providers SHALL be configurable and selectable without an API key when their provider configuration explicitly declares that no API key is required.

#### Scenario: Local provider appears configured without credentials

- **WHEN** an enabled local provider has `requiresApiKey` set to false
- **THEN** Agent settings projection treats the provider as configured

### Requirement: LLM vision is capability-scoped

The Agent SHALL treat visual understanding as a model capability instead of a requirement for every LLM model.

#### Scenario: Text-only local LLM remains selectable

- **WHEN** a local LLM model supports chat but does not declare vision capability
- **THEN** the model remains selectable for text chat workflows

#### Scenario: Vision workflow filters by capability

- **WHEN** a workflow requires image understanding
- **THEN** it must request or validate a model with the vision capability

### Requirement: Default media models use canonical IDs

Default media model configuration SHALL use canonical model IDs that resolve directly through the configuration manager.

#### Scenario: Media routing uses configured default

- **WHEN** media routing selects a provider for a generation type with a configured default media model
- **THEN** the configured default resolves to an existing model by ID
- **THEN** the route returns that model and its provider

### Requirement: Future provider support is roadmap-scoped

Official direct provider APIs, additional proxy products, broad LLM family catalogs, and broad generation provider catalogs SHALL be documented as future roadmap work unless the provider path has verified configuration, adapter behavior, and tests.

#### Scenario: Unsupported provider family is not implied by MVP

- **WHEN** a provider family such as OpenRouter, SubAPI, official direct Gemini/Grok/Claude/GPT/DeepSeek/GLM, or generation providers such as Suno/Seedance/Kling/GPT image is discussed
- **THEN** the MVP documentation identifies it as future or gateway-compatible support unless verified in code and tests
