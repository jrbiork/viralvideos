export function parseASSTime(assTime: string): number {
  const match = assTime.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
  if (!match) return 0;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const seconds = parseInt(match[3]);
  let fraction = match[4];
  let centiseconds = 0;
  if (fraction.length === 2) {
    centiseconds = parseInt(fraction); // already centiseconds
  } else {
    centiseconds = Math.floor(parseInt(fraction) / 10); // milliseconds to centiseconds
  }
  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

export function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.round((seconds % 1) * 100);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export function createASSStyleHeader(): string {
  let header = '[Script Info]\n';
  header += 'Title: Test\n';
  header += 'ScriptType: v4.00+\n';
  header += 'WrapStyle: 1\n';
  header += 'ScaledBorderAndShadow: yes\n';
  header += 'YCbCr Matrix: None\n';
  header += 'PlayResX: 1080\n';
  header += 'PlayResY: 1920\n\n';

  header += '[V4+ Styles]\n';
  header +=
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';

  // Style with LibreBaskerville font, extra bold white text with enhanced outline and shadow, positioned between center and bottom
  header +=
    'Style: Default,LibreBaskerville-Bold,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,6,8,10,10,30,1\n\n';

  header += '[Events]\n';
  header +=
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  return header;
}

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Creates a word-timed karaoke style ASS subtitle with progressive word highlighting
 * @param words - Array of words with their start and end timestamps
 * @param sceneStartTime - The start time of the scene in the overall video
 * @returns ASS subtitle content with karaoke effects
 */
export function createWordTimedKaraokeASSSubtitle(
  words: SubtitleWord[],
  sceneStartTime: number,
): string {
  const assContent = createASSStyleHeader();
  let dialogueLines = '';

  // Create dialogue lines for word pairs with progressive highlighting
  for (let i = 0; i < words.length; i += 2) {
    const currentWord = words[i];
    const nextWord = words[i + 1];

    if (nextWord) {
      // First dialogue line: first word yellow, second word white
      const firstStart = sceneStartTime + currentWord.start;
      const firstEnd = sceneStartTime + currentWord.end;
      const firstText = `{\\c&H00FFFF&}${currentWord.word.toUpperCase()}{\\c&H00FFFFFF&} ${nextWord.word.toUpperCase()}`;
      dialogueLines += `Dialogue: 0,${formatASSTime(
        firstStart,
      )},${formatASSTime(firstEnd)},Default,,0,0,0,,${firstText}\n`;

      // Second dialogue line: first word white, second word yellow
      const secondStart = sceneStartTime + currentWord.end;
      const secondEnd = sceneStartTime + nextWord.end;
      const secondText = `{\\c&H00FFFFFF&}${currentWord.word.toUpperCase()} {\\c&H00FFFF&}${nextWord.word.toUpperCase()}`;
      dialogueLines += `Dialogue: 0,${formatASSTime(
        secondStart,
      )},${formatASSTime(secondEnd)},Default,,0,0,0,,${secondText}\n`;
    } else {
      // Single word in yellow
      const wordStart = sceneStartTime + currentWord.start;
      const wordEnd = sceneStartTime + currentWord.end;
      const singleText = `{\\c&H00FFFF&}${currentWord.word.toUpperCase()}`;
      dialogueLines += `Dialogue: 0,${formatASSTime(wordStart)},${formatASSTime(
        wordEnd,
      )},Default,,0,0,0,,${singleText}\n`;
    }
  }

  return assContent + dialogueLines;
}
