# Changelog

All notable changes to `@neko/platform` will be documented in this file.

## [0.1.0] - 2024-12-24

### Added

#### Configuration Layer
- Three-tier configuration system (builtin < user < workspace)
- `ConfigManager` with automatic config merging
- `UserConfigManager` for VS Code globalState integration
- Workspace config loader (`.neko/config.json`)
- Builtin presets for providers, models, and groups

#### Adapter Layer
- `BaseAdapter` abstract class for provider implementations
- `OpenAIAdapter` - OpenAI API support
- `AnthropicAdapter` - Anthropic Claude API support
- `GoogleAdapter` - Google AI (Gemini) support
- `AzureAdapter` - Azure OpenAI support
- `OllamaAdapter` - Local Ollama models support
- `GenericAdapter` - REST API fallback for custom endpoints
- Streaming response aggregator

#### Provider Layer
- `ProviderRegistry` for provider and model management
- Local model auto-discovery (Ollama, LMStudio)
- Provider health checking

#### Routing Layer
- `GroupManager` for model group management
- Routing strategies: priority, round-robin, weighted, cost-optimal
- Automatic fallback mechanism

#### Retry & Timeout System
- `RetryPolicy` with configurable retry behavior
- `TimeoutPolicy` for request and stream timeouts
- `BackoffStrategy` calculators (fixed, linear, exponential, jitter)
- `PlatformError` with error classification
- `RetryExecutor` with combined retry and timeout support
- Stream timeout wrapper

#### Service Layer
- `Service` class with unified AI API
- `chat()` method with automatic routing and retry
- `chatStream()` method with stream timeout
- `chatWithTools()` for tool calling
- `generateImage()` and `generateVideo()` methods
- `embed()` for embeddings

#### Task Management
- `TaskManager` for async task handling
- Task polling with timeout
- Progress callbacks

#### Tool System
- `Tool` interface for custom tools
- `ToolRegistry` for tool management
- `BuiltinTool` base class
- Project operation tools (timeline, media, etc.)
- Per-tool retry/timeout configuration

#### Memory System
- `SessionMemory` interface with `InMemorySessionMemory`
- `ConversationCompressor` - turn-aware context compression (replaced legacy compressors)
- ~~`SimpleTokenCounter`, `SlidingWindowCompressor`, `SummarizeCompressor`, `SelectiveCompressor`, `ContextManager`, `KeyFactExtractor`~~ — removed, use `ConversationCompressor`

#### Prompt System
- `PromptManager` for prompt templates
- Variable substitution with validation
- `ChainPromptExecutor` for multi-step prompts

#### Project Context
- `ProjectContext` interface
- Timeline, Media, Selection context adapters

#### MCP Integration
- `StdioMCPClient` for stdio transport
- `HttpMCPClient` for HTTP transport with retry
- `MCPManager` for server management
- `MCPTool` wrapper for platform integration
- Dynamic tool registration from MCP servers

#### Workflow Integration
- `WorkflowManager` for workflow orchestration
- `BuiltinWorkflowExecutor` for custom workflows
- `N8nWorkflowExecutor` client with timeout
- `ComfyUIWorkflowExecutor` client with timeout
- `WorkflowTool` wrapper for agent integration

#### Media Management
- `MediaManager` for media file handling
- HTTP downloader with retry and caching
- `MediaCache` with LRU eviction
- `ThumbnailGenerator` with frame extraction
- Media tools for agent integration

#### Agent Execution
- `AgentExecutor` with ReAct loop pattern
- `EnhancedAgentExecutor` with advanced features:
  - Multi-model collaboration (primary + purpose-specific)
  - Tool retry with configurable policy
  - Model fallback on failure
  - Session memory integration
  - Context compression
- Checkpoint and resume mechanism

#### Execution Monitoring
- `ExecutionMonitor` for observability
- Retry event recording
- Timeout event recording
- Execution statistics aggregation

### Test Coverage
- 500+ unit tests across all modules
- Configuration: 28 tests
- Adapters: 45 tests
- Providers: 28 tests
- Groups: 33 tests
- Retry/Timeout: 39 tests
- Service: 18 tests
- Tasks: 33 tests
- MCP: 23 tests
- Workflow: 28 tests
- Media: 42 tests
- Agent: 38 tests
- Monitor: 30 tests
- Memory/Prompt/Context: 115+ tests
