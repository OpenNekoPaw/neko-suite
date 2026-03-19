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
    <div className={`audio-player__cover ${isPlaying ? 'audio-player__cover--playing' : ''}`}>
      {coverUri ? (
        <>
          <div
            className="audio-player__cover-blur"
            style={{ backgroundImage: `url(${coverUri})` }}
          />
          <img className="audio-player__cover-img" src={coverUri} alt="Album art" />
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
