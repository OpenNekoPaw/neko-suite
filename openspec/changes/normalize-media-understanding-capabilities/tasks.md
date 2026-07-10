## 1. Documentation

- [x] 1.1 Update Agent media model configuration docs to describe current capability taxonomy.
- [x] 1.2 Clarify that `audio`, `vision`, and `vision_video` are understanding capabilities and do not imply each other.
- [x] 1.3 Clarify that `default_model_purposes.*_understand` remain durable product-purpose keys and are mapped to model capabilities at validation/routing time.

## 2. Capability Mapping

- [x] 2.1 Add or centralize a purpose-to-capability mapping: `image.understand -> vision`, `audio.understand -> audio`, `video.understand -> vision_video`.
- [x] 2.2 Update understand model filtering and validation to use the mapping instead of `image.understand`, `audio.understand`, or `video.understand` model capabilities.
- [x] 2.3 Keep legacy understand capability aliases readable only if required by existing fixtures/catalogs, with visible migration notes and tests.

## 3. Agent Routing

- [x] 3.1 Ensure same chat/understand model keeps media in native multimodal context.
- [x] 3.2 Ensure different chat/understand model uses perception/tool routing and scoped understanding context.
- [x] 3.3 Ensure different-model routing does not switch the whole Agent turn to the understand model.

## 4. Webview Selection

- [x] 4.1 Filter image understand models by `type = "llm"` and `vision`.
- [x] 4.2 Filter audio understand models by `type = "llm"` and `audio`.
- [x] 4.3 Filter video understand models by `type = "llm"` and `vision_video`.
- [x] 4.4 Keep understand model selection session-scoped and read-only with respect to config files.

## 5. Validation

- [x] 5.1 Add resolver tests for all three purpose-to-capability mappings.
- [x] 5.2 Add runtime tests for same-model native context and different-model perception context.
- [x] 5.3 Add Webview tests for understand model filtering.
- [x] 5.4 Run focused TypeScript/package checks and document any unrelated existing failures.
