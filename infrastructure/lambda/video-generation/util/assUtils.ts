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

  // Style with DMSerifText font, extra bold white text with enhanced outline and shadow, positioned 50px below center
  header +=
    'Style: Default,DMSerifText,100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,6,2,10,10,480,1\n\n';

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
  console.log(
    `🔍 Creating karaoke subtitle with sceneStartTime: ${sceneStartTime}, words count: ${words.length}`,
  );
  const assContent = createASSStyleHeader();
  let dialogueLines = '';

  // Create dialogue lines for individual words with highlighting
  for (let i = 0; i < words.length; i++) {
    const currentWord = words[i];
    const wordStart = sceneStartTime + currentWord.start;
    const wordEnd = sceneStartTime + currentWord.end;

    // Build the full text with current word highlighted
    let fullText = '';
    for (let j = 0; j < words.length; j++) {
      if (j === i) {
        // Current word in yellow (highlighted)
        fullText += `{\\c&H00FFFF&}${words[
          j
        ].word.toUpperCase()}{\\c&H00FFFFFF&}`;
      } else {
        // Other words in white
        fullText += words[j].word.toUpperCase();
      }

      // Add space between words (except for the last word)
      if (j < words.length - 1) {
        fullText += ' ';
      }
    }

    dialogueLines += `Dialogue: 0,${formatASSTime(wordStart)},${formatASSTime(
      wordEnd,
    )},Default,,,,,,${fullText}\n`;

    if (i === 0) {
      console.log(
        `🔍 First word timing: sceneStartTime=${sceneStartTime}, word.start=${currentWord.start}, word.end=${currentWord.end}, wordStart=${wordStart}, wordEnd=${wordEnd}`,
      );
    }
  }

  return assContent + dialogueLines;
}
