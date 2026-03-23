# Document Format Support

NekoAgent supports reading and extracting content from various document formats for AI-powered content analysis and video generation workflows.

## Supported Formats

### Text Documents
- **PDF** (`.pdf`) - Portable Document Format
- **DOCX/DOC** (`.docx`, `.doc`) - Microsoft Word documents
- **Markdown** (`.md`) - Markdown files
- **Plain Text** (`.txt`) - Text files
- **Fountain** (`.fountain`) - Screenplay format
- **HTML** (`.html`, `.htm`) - Web pages
- **JSON/YAML** (`.json`, `.yaml`, `.yml`) - Structured data

### E-Books
- **EPUB** (`.epub`) - Electronic Publication format
  - Extracts text from all chapters
  - Preserves metadata (title, author, publisher)
  - Supports multi-chapter books

### Comic Archives
- **CBZ** (`.cbz`) - Comic Book ZIP archive
  - Extracts all image pages in reading order
  - Returns image paths for AI visual analysis
  - Supports JPG, PNG, GIF, WebP, BMP formats

- **CBR** (`.cbr`) - Comic Book RAR archive
  - Same capabilities as CBZ
  - Requires `node-unrar-js` package

## Usage

### Basic Reading

```typescript
import { DocumentReaderService } from '@neko-agent/extension';

const service = new DocumentReaderService();

// Check if format is supported
if (service.supports('/path/to/book.epub')) {
  // Read document
  const content = await service.read('/path/to/book.epub');

  console.log(content.text);        // Extracted text
  console.log(content.pageCount);   // Number of pages (if applicable)
  console.log(content.metadata);    // Document metadata
  console.log(content.imagePaths);  // Image paths (for comic archives)
}
```

### DRM Detection

```typescript
// Check for DRM protection
const hasDRM = await service.hasDRM('/path/to/book.epub');

if (hasDRM) {
  console.log('This file is DRM-protected and cannot be read');
}
```

### Comic Archive Processing

```typescript
// Read comic archive
const comic = await service.read('/path/to/comic.cbz');

console.log(`Comic has ${comic.pageCount} pages`);

// Image paths are available for AI visual analysis
if (comic.imagePaths) {
  for (const imagePath of comic.imagePaths) {
    // Process each page with AI vision models
    await analyzeComicPage(imagePath);
  }
}
```

## Legal Notice

### DRM-Protected Content

**NekoAgent does NOT support DRM-protected files** due to legal restrictions:
- DRM-protected EPUB files will be rejected
- DRM-protected PDF files will be rejected
- Only DRM-free content can be processed

### User Responsibilities

Users must ensure they have legal rights to process files:
- ✅ **Allowed**: Personal, legally-owned content
- ✅ **Allowed**: DRM-free purchased e-books
- ✅ **Allowed**: Public domain works
- ✅ **Allowed**: Self-created content
- ❌ **Not Allowed**: Pirated content
- ❌ **Not Allowed**: DRM-protected files
- ❌ **Not Allowed**: Unauthorized distribution

### Copyright Compliance

NekoAgent is a **local processing tool** that:
- Does NOT distribute content
- Does NOT bypass DRM protection
- Does NOT encourage copyright infringement
- Operates under fair use principles for personal content processing

**Users are solely responsible for ensuring their use complies with applicable copyright laws in their jurisdiction.**

## Dependencies

The following packages are required for format support:

```json
{
  "pdf-parse": "^2.4.5",      // MIT License
  "mammoth": "^1.12.0",       // BSD-2-Clause License
  "epub2": "^3.0.2",          // MIT License
  "adm-zip": "^0.5.16",       // MIT License
  "node-unrar-js": "^2.0.2"   // MIT License
}
```

All dependencies use permissive licenses compatible with GPL-3.0.

## Limitations

### File Size
- Large files (>100MB) may cause performance issues
- Consider splitting large documents into smaller chunks

### Format Variations
- Some PDF files with complex layouts may have extraction issues
- Scanned PDFs without OCR layer cannot be read
- Password-protected files are not supported

### Temporary Files
- Comic archives extract images to temporary directories
- Temporary files are automatically cleaned up after processing
- Location: `os.tmpdir()/neko_cbz_*` or `neko_cbr_*`

## Error Handling

```typescript
try {
  const content = await service.read('/path/to/file.epub');
} catch (error) {
  if (error.message.includes('DRM-protected')) {
    // Handle DRM-protected file
  } else if (error.message.includes('not installed')) {
    // Handle missing dependency
  } else {
    // Handle other errors
  }
}
```

## Integration with AI Workflows

### Flow A: Document → Script → Video
```
1. Read document (PDF/DOCX/EPUB)
2. Extract text content
3. LLM analyzes and generates screenplay
4. Convert to video timeline
```

### Flow E: Comic → Storyboard → Video
```
1. Read comic archive (CBZ/CBR)
2. Extract image pages
3. LLM visual analysis of each page
4. Generate video from scenes
```

See [ai-capabilities.md](../../docs/architecture/ai-capabilities.md) for detailed workflow documentation.

## Troubleshooting

### "Package not installed" Error
```bash
# Install missing dependencies
pnpm add pdf-parse mammoth epub2 adm-zip node-unrar-js -F @neko-agent/extension
```

### "DRM-protected files are not supported"
- Ensure the file is DRM-free
- For purchased e-books, check if DRM can be removed legally
- Use alternative DRM-free sources

### "Failed to read" Errors
- Verify file is not corrupted
- Check file permissions
- Ensure file format matches extension

## Contributing

When adding support for new formats:
1. Check license compatibility (must be GPL-3.0 compatible)
2. Add DRM detection if applicable
3. Update `SUPPORTED_EXTENSIONS` set
4. Add corresponding `read*()` method
5. Write unit tests
6. Update this documentation

---

**Last Updated**: 2026-03-24
