/**
 * Returns a Fountain-format story template with the given title.
 */
export function getStoryTemplate(title: string): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

  return [
    `Title: ${title}`,
    'Author: ',
    `Draft date: ${dateStr}`,
    '',
    '# Act 1',
    '',
    'INT. LOCATION - DAY',
    '',
    'Description of the scene.',
    '',
  ].join('\n');
}
