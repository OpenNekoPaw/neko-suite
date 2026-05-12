export function generateAudioOutputPath(inputPath: string, suffix: string): string {
  const lastDot = inputPath.lastIndexOf('.');
  if (lastDot === -1) return `${inputPath}_${suffix}`;
  return `${inputPath.substring(0, lastDot)}_${suffix}${inputPath.substring(lastDot)}`;
}

export function exportAudioExtension(format: string): string {
  switch (format) {
    case 'mp3':
    case 'aac':
    case 'flac':
    case 'opus':
    case 'wav':
    case 'ogg':
    case 'm4a':
      return format;
    default:
      return 'wav';
  }
}
