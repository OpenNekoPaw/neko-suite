## ADDED Requirements

### Requirement: GPU Core Owns Platform Media Bridge Implementations
The GPU core crate SHALL own platform GPU media bridge implementations and expose them to kernel orchestration through narrow contracts.

#### Scenario: Kernel does not own platform interop
- **WHEN** preview or export orchestration needs IOSurface, DMA-BUF, VA-API, DXGI, D3D, Metal, Vulkan, or platform synchronization interop
- **THEN** it calls engine-gpu bridge APIs
- **THEN** platform interop implementation files do not move back into engine-kernel

#### Scenario: Renderer companions use bridge contracts
- **WHEN** renderer or export companion crates need platform GPU media import/export
- **THEN** they use engine-gpu bridge contracts or DTOs
- **THEN** they do not duplicate platform-specific import/export orchestration
