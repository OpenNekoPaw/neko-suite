## Context

Neko's model configuration has two different concepts that must stay separate:

- **Model capability**: metadata on a concrete model, used for filtering, diagnostics, and adapter routing.
- **Product purpose**: a durable default binding for a product use case, such as `[default_model_purposes.video_understand]`.

The current stable capability vocabulary is intentionally pragmatic. It reflects provider catalog fields and product routing needs rather than a complete ontology for every possible multimodal AI feature.

## Decisions

### Keep Current Capabilities

This change keeps the existing capability strings:

```text
chat
function_calling
streaming
json_mode
code
audio
vision
vision_video
text_to_image
image_to_image
image_edit
text_to_video
image_to_video
text_to_music
text_to_audio
```

Do not introduce `input.*` or generic operation capabilities in this iteration. Provider-specific abilities can remain in provider adapters, catalog metadata, or task schemas until they prove stable enough to become global capabilities.

### Media Understanding Capabilities Are File-Modality Oriented

`audio`, `vision`, and `vision_video` are LLM media understanding capabilities:

| Capability | Meaning |
| --- | --- |
| `audio` | Understand standalone audio files. |
| `vision` | Understand image or still-frame files. |
| `vision_video` | Understand video files as integrated video inputs. |

`vision_video` is not shorthand for `vision + audio`. It is the ability to accept a video file and analyze it as video. Depending on provider support, the analysis may include visual, temporal, cinematic, and audiovisual cues, but the capability is still file-modality oriented.

No capability implies another capability. A model that can understand both images and video must declare both `vision` and `vision_video`.

### Product Purposes Stay Durable

The durable config keeps product-purpose keys:

```toml
[default_model_purposes.image_understand]
provider_id = "google"
model_id = "google-gemini-2.5-flash"

[default_model_purposes.audio_understand]
provider_id = "google"
model_id = "google-gemini-2.5-flash"

[default_model_purposes.video_understand]
provider_id = "google"
model_id = "google-gemini-2.5-flash"
```

These keys express product use cases, not model capability names. Runtime validation maps them to the required capability:

| Purpose | Required model capability |
| --- | --- |
| `image.understand` | `vision` |
| `audio.understand` | `audio` |
| `video.understand` | `vision_video` |

### Generation Capabilities Stay Task-Oriented

Generation models continue to use existing task-oriented capability names:

| Output model type | Current generation capabilities |
| --- | --- |
| `image` | `text_to_image`, `image_to_image`, `image_edit` |
| `video` | `text_to_video`, `image_to_video` |
| `audio` | `text_to_music`, `text_to_audio` |

This is intentionally less abstract than `type + input modality + operation`. It keeps configuration aligned with current provider catalogs and avoids premature classification of unstable multimodal features.

### Agent Routing

When a turn includes a media attachment, Agent resolves the relevant understand model by file modality:

| Attachment type | Purpose | Required capability |
| --- | --- | --- |
| image | `image.understand` | `vision` |
| audio | `audio.understand` | `audio` |
| video | `video.understand` | `vision_video` |

Routing follows the selected models:

```text
chat model == understand model -> native multimodal context
chat model != understand model -> perception/tool path with scoped understanding context
```

The different-model path must not replace the whole Agent turn model and must not send the full Agent conversation context to the understand model. The understand model receives only the media analysis request and the scoped context needed for that analysis.

## Alternatives Considered

### `input.*` Capabilities

Rejected for this iteration. `input.image`, `input.audio`, and `input.video` are attractive, but they overload meaning across LLM understanding and generative model source-material support. They also do not solve provider-specific generation modes without reintroducing operation fields or provider metadata.

### Generic Operation Capabilities

Rejected for this iteration. `generate`, `edit`, and `extend` are product or provider-operation concepts. Provider APIs differ enough that these fields could create false precision in global model config.

### Capability Implication

Rejected. `vision_video` does not imply `vision`, and video understanding does not imply standalone audio understanding. Explicit capability declaration keeps routing fail-visible and testable.

## Test Strategy

- Model resolver tests prove that each media purpose requires the correct capability.
- Agent turn runtime tests prove same-model native context and different-model tool/perception context.
- Webview tests prove understand model selectors filter by `audio`, `vision`, and `vision_video` without writing config.
- Gemini/perception tests prove per-turn understand model overrides reach the media understanding client without leaking routing metadata into prompts.
