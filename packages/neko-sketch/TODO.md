# neko-sketch TODO

> Open implementation items with in-code `TODO(P1)` markers or missing end-to-end wiring.

## P1 Closers (code skeleton exists, needs final wiring)

### Gradient Rendering
- **File**: `packages/webview/src/components/SketchCanvas.tsx` (onStrokeEnd gradient branch)
- **Status**: Pointer start/end separated; `LINEAR_GRADIENT_FRAG` / `RADIAL_GRADIENT_FRAG` shaders written
- **Remaining**: Compile gradient program, bind uniforms (u_start, u_end, u_color0, u_color1, u_resolution), drawQuad to active layer FBO on pointer end
- **Complexity**: Low

### Text Editing Overlay
- **Files**: `packages/webview/src/tools/text-tool.ts`, `packages/webview/src/components/SketchCanvas.tsx`
- **Status**: `renderTextToImageData()` implemented; pointer branch guards text tool from brush fallthrough
- **Remaining**: HTML textarea overlay at click position, font/size/color controls, confirm → `renderTextToImageData()` → `texImage2D` upload to layer texture
- **Complexity**: Medium

### Clone Stamp Interaction
- **Files**: `packages/webview/src/tools/clone-tool.ts`, `packages/webview/src/components/SketchCanvas.tsx`
- **Status**: `cloneStamp()` CPU algorithm implemented; pointer branch guards clone tool
- **Remaining**: Alt+click sets source offset, normal drag calls `cloneStamp()` per pointer-move with `readTextureToImageData` → mutate → `uploadImageDataToTexture`, update source offset tracking
- **Complexity**: Medium
