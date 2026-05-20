# Transform Core Placement Decision

The first implementation places the shared transform propagation algorithm in
`engine-types::transform_propagation`.

Rationale:

- the extracted core only needs `Copy + Mul<Output = Matrix>` and runtime-supplied closures;
- it does not import Bevy, glam, runtime-scene, or runtime-puppet;
- scene and puppet still own their ECS queries, component insertion, and borrow behavior;
- creating `engine-ecs-core` now would add a crate before there is an ECS-specific abstraction to host.

Follow-up:

- create `engine-ecs-core` only if future Affine / EcsWorldHandle / generic system work requires Bevy/ECS traits;
- keep pure DTOs and pure algorithm helpers out of that crate unless an ADR explicitly changes the shared-layer boundary.
