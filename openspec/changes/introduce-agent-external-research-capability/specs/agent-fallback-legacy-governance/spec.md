## ADDED Requirements

### Requirement: Unavailable external research tools fail visibly
Agent tool metadata, resident tool injection, and permission classification SHALL NOT advertise `WebSearch` or `WebFetch` as available unless the corresponding executable external research tool is registered for the active session and mode.

#### Scenario: External research is disabled
- **WHEN** external research mode is `disabled`
- **THEN** `WebSearch` and `WebFetch` MUST NOT appear in resident/core tool injection
- **AND** Agent MUST NOT classify them as currently available tools for the session

#### Scenario: External research provider is missing
- **WHEN** external research mode is enabled but no valid provider resolves
- **THEN** Agent MUST surface a configuration diagnostic
- **AND** Agent MUST NOT expose `WebSearch` or `WebFetch` as executable tools
- **AND** Agent MUST NOT return success through project search, MCP, or model-only fallback

#### Scenario: Indexed mode does not expose fetch
- **WHEN** external research mode is `indexed` and a valid indexed provider resolves
- **THEN** Agent MAY expose `WebSearch` as an executable tool
- **AND** Agent MUST NOT expose `WebFetch` as an executable tool

#### Scenario: Permission metadata exists without executable tool
- **WHEN** permission rules mention `WebSearch`, `WebFetch`, or `WebFetch(domain:...)` but the corresponding tool is not registered
- **THEN** permission matching MUST NOT make the tool executable
- **AND** execution MUST fail with an unregistered or disabled capability diagnostic
