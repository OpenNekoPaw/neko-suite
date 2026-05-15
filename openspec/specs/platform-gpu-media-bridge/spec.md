# platform-gpu-media-bridge Specification

## Purpose
TBD - created by archiving change abstract-platform-gpu-media-bridge. Update Purpose after archive.
## Requirements
### Requirement: Platform GPU Media Bridge Contract
The engine SHALL expose a platform GPU media bridge contract for native GPU media import and export operations used by preview and export pipelines.

#### Scenario: Orchestration calls bridge contract
- **WHEN** preview or export needs to import a decoded native GPU frame or export an encoder-ready NV12 GPU frame
- **THEN** it calls the platform GPU media bridge contract
- **THEN** shared orchestration does not hardcode macOS IOSurface-specific control flow

#### Scenario: Platform implementation owns unsafe interop
- **WHEN** a bridge implementation touches IOSurface, DMA-BUF, VA-API, DXGI, D3D, Metal, Vulkan, or platform synchronization primitives
- **THEN** that unsafe/platform-specific code remains inside engine-gpu platform modules
- **THEN** kernel preview/export orchestration receives typed GPU frame or handle results

### Requirement: Capability Detection Drives Path Selection
The bridge SHALL report capabilities by direction, format, handle kind, and synchronization support.

#### Scenario: Supported bridge is selected
- **WHEN** a platform reports support for the required import/export direction and format
- **THEN** preview/export may select that bridge path
- **THEN** the selected path returns GPU-resident frames or handles without CPU readback

#### Scenario: Unsupported bridge is explicit
- **WHEN** no platform bridge supports the required realtime operation
- **THEN** preview/export returns an explicit unsupported-capability error
- **THEN** it does not silently fall back to CPU readback in the realtime path

### Requirement: macOS IOSurface Zero-Copy Is Preserved
The macOS bridge SHALL preserve the existing IOSurface zero-copy preview/export hot path.

#### Scenario: macOS export remains GPU resident
- **WHEN** macOS export renders RGBA to NV12 for VideoToolbox encoding
- **THEN** the bridge returns an IOSurface-backed `GpuOutputHandle`
- **THEN** the path does not add GPU-to-CPU readback or memcpy

#### Scenario: macOS preview remains GPU resident
- **WHEN** macOS preview imports decoded VideoToolbox frames
- **THEN** the bridge imports IOSurface-backed textures into wgpu without CPU copy
- **THEN** unsupported IOSurface interop failures surface as unsupported capability or platform interop errors

### Requirement: Non-macOS Bridges Are Capability-Gated
Linux and Windows GPU media paths SHALL be wired through the same bridge contract and gated by runtime/platform capability.

#### Scenario: Linux bridge reports DMA-BUF or VA-API support
- **WHEN** Linux platform interop can import or export the requested DMA-BUF/VA-API/Vulkan handle path
- **THEN** the Linux bridge reports that capability
- **THEN** preview/export can select it through the shared bridge contract

#### Scenario: Windows bridge reports DXGI or D3D support
- **WHEN** Windows platform interop can import or export the requested DXGI/D3D handle path
- **THEN** the Windows bridge reports that capability
- **THEN** preview/export can select it through the shared bridge contract

#### Scenario: Incomplete platform support fails cleanly
- **WHEN** Linux or Windows interop code exists but cannot satisfy the full requested realtime operation
- **THEN** the bridge reports unsupported for that operation
- **THEN** validation covers the unsupported result so the gap is visible

### Requirement: Native Handle Lifetimes Remain Protected
The bridge SHALL preserve safe lifetime handling for native GPU handles.

#### Scenario: Lease stays alive for safe submission
- **WHEN** a bridge returns a GPU output handle that will be consumed by an encoder or sink
- **THEN** the safe path keeps the associated frame lease or backing store alive for the duration of consumption
- **THEN** bare platform handles are not treated as owned resources by themselves

#### Scenario: Bare handle extraction is documented
- **WHEN** a bridge or sink extracts a raw IOSurface, DMA-BUF, or DXGI handle
- **THEN** the extraction boundary documents the required lifetime guarantee
- **THEN** tests or code structure keep the safe path protected against premature resource release

### Requirement: Bridge Validation Protects Hot Paths
The platform bridge change SHALL include validation that protects zero-copy and unsupported-capability behavior.

#### Scenario: Capability selection is tested
- **WHEN** validation runs
- **THEN** tests cover bridge selection for supported and unsupported capability sets
- **THEN** unsupported realtime paths return explicit errors

#### Scenario: macOS path has regression coverage
- **WHEN** macOS-specific tests or cfg-gated checks run
- **THEN** they verify IOSurface-backed import/export still returns GPU handles and avoids readback-only paths

