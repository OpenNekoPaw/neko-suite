/**
 * CoverView - Album cover art display
 *
 * Shows real album art with blurred background when available,
 * falls back to placeholder with first letter of filename + gradient.
 */

interface CoverViewProps {
  /** File name (used to generate placeholder letter) */
  fileName: string;
  /** Whether audio is currently playing (enables pulse animation) */
  isPlaying: boolean;
  /** Album cover art data URI */
  coverUri?: string;
}

export function CoverView({ fileName, isPlaying, coverUri }: CoverViewProps) {
  const letter = getDisplayLetter(fileName);

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center ${isPlaying ? 'animate-pulse' : ''}`}
    >
      {coverUri ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30"
            style={{ backgroundImage: `url(${coverUri})` }}
          />
          <img
            className="relative z-10 max-w-[60%] max-h-[60%] rounded-lg shadow-2xl object-contain"
            src={coverUri}
            alt="Album art"
          />
        </>
      ) : (
        <div className="audio-player__cover-placeholder">
          <span className="audio-player__cover-letter">{letter}</span>
        </div>
      )}
    </div>
  );
}

/** Extract first meaningful character from filename (skip leading dots/numbers) */
function getDisplayLetter(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, ''); // strip extension
  for (const ch of name) {
    if (/[a-zA-Z\u4e00-\u9fff]/.test(ch)) return ch;
  }
  return name[0] ?? '♪';
}
