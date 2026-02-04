import type { TitlePage } from '../types';
import { navigateToLine } from '../hooks/useVSCodeMessaging';

interface TitlePageRendererProps {
  titlePage: TitlePage;
}

export function TitlePageRenderer({ titlePage }: TitlePageRendererProps) {
  const handleClick = () => {
    navigateToLine(titlePage.range.start.line);
  };

  // Find title entry
  const titleEntry = titlePage.entries.find(
    (e) => e.key.toLowerCase() === 'title'
  );

  return (
    <div className="title-page element" onClick={handleClick}>
      {titleEntry && <div className="title">{titleEntry.value}</div>}
      {titlePage.entries
        .filter((e) => e.key.toLowerCase() !== 'title')
        .map((entry, index) => (
          <div key={index} className="entry">
            <span className="entry-key">{entry.key}:</span> {entry.value}
          </div>
        ))}
    </div>
  );
}
