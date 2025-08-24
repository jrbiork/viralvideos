import React from 'react';

// Parse ASS time format (H:MM:SS.cc) to seconds
export const parseTime = (timeStr: string): number => {
  const match = timeStr.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const centiseconds = parseInt(match[4]);
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  }
  return 0;
};

// Parse ASS subtitle file with color information and styles
export const parseAssFile = (assContent: string) => {
  const lines = assContent.split('\n');
  const events: Array<{
    start: number;
    end: number;
    text: string;
    coloredText: string;
  }> = [];

  let styleInfo = {
    fontName: 'DMSerifText',
    fontSize: 30,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H00000000',
    shadowColor: '&H80000000',
    bold: 1,
    outline: 6,
    shadow: 6,
    alignment: 2,
  };

  let inStyles = false;
  let inEvents = false;

  for (const line of lines) {
    // Parse style information
    if (line.startsWith('[V4+ Styles]')) {
      inStyles = true;
      continue;
    }
    if (inStyles && line.startsWith('Format:')) {
      continue;
    }
    if (inStyles && line.startsWith('Style:')) {
      const styleParts = line.split(',');
      if (styleParts.length >= 10) {
        styleInfo = {
          fontName: styleParts[1] || 'DMSerifText',
          fontSize: parseInt(styleParts[2]) || 30,
          primaryColor: styleParts[3] || '&H00FFFFFF',
          outlineColor: styleParts[5] || '&H00000000',
          shadowColor: styleParts[6] || '&H80000000',
          bold: parseInt(styleParts[7]) || 1,
          outline: parseInt(styleParts[16]) || 6,
          shadow: parseInt(styleParts[17]) || 6,
          alignment: parseInt(styleParts[18]) || 2,
        };
      }
      inStyles = false;
      continue;
    }

    // Parse events
    if (line.startsWith('[Events]')) {
      inEvents = true;
      continue;
    }
    if (inEvents && line.startsWith('Format:')) {
      continue;
    }
    if (inEvents && line.startsWith('Dialogue:')) {
      const parts = line.split(',');
      if (parts.length >= 10) {
        const startTime = parseTime(parts[1]);
        const endTime = parseTime(parts[2]);
        const rawText = parts.slice(9).join(',');

        // Extract text without ASS formatting
        const cleanText = rawText
          .replace(/\\N/g, ' ')
          .replace(/\{[^}]*\}/g, '')
          .trim();

        // Extract text with color information preserved
        const coloredText = rawText.replace(/\\N/g, ' ').trim();

        events.push({
          start: startTime,
          end: endTime,
          text: cleanText,
          coloredText,
        });
      }
    }
  }

  // Store style info in a global variable or return it with events
  (globalThis as any).assStyleInfo = styleInfo;

  return events;
};

// Parse colored text and convert to JSX elements
export const parseColoredText = (coloredText: string) => {
  // Get ASS style information
  const styleInfo = (globalThis as any).assStyleInfo || {
    fontName: 'DMSerifText',
    fontSize: 30,
    bold: 1,
    outline: 6,
    shadow: 6,
  };

  // Create style object based on ASS styles
  const subtitleStyle = {
    fontFamily: styleInfo.fontName,
    fontSize: '24px', // Reduced by 20% from 30px to 24px
    fontWeight: styleInfo.bold ? 'bold' : 'normal',
    textShadow: '2px 2px 2px rgba(0, 0, 0, 0.9)', // Darker shadow
    textAlign: 'center' as const,
  };

  // First, remove all bracket codes to get clean text
  const cleanText = coloredText.replace(/\{[^}]*\}/g, '');

  // If no color codes found, return plain white text with ASS styles
  if (!coloredText.includes('{\\c&H')) {
    return [
      React.createElement(
        'span',
        {
          key: 'default',
          className: 'text-white',
          style: subtitleStyle,
        },
        cleanText,
      ),
    ];
  }

  // Find the first yellow word and make everything else white
  const yellowMatch = coloredText.match(/\{\\c&H00FFFF&\}([^{]+)/);

  if (yellowMatch) {
    const yellowWord = yellowMatch[1].trim();
    const allText = coloredText.replace(/\{[^}]*\}/g, '').trim();

    // Split the text to find where the yellow word appears
    const words = allText.split(' ');
    const yellowWordIndex = words.findIndex(
      (word) => allText.indexOf(yellowWord) === allText.indexOf(word),
    );

    const parts = [];

    for (let i = 0; i < words.length; i++) {
      if (i === yellowWordIndex) {
        // This is the yellow word
        parts.push(
          React.createElement(
            'span',
            {
              key: `yellow-${i}`,
              style: {
                ...subtitleStyle,
                color: '#fbbf24',
              },
            },
            words[i] + (i < words.length - 1 ? ' ' : ''),
          ),
        );
      } else {
        // This is a white word
        parts.push(
          React.createElement(
            'span',
            {
              key: `white-${i}`,
              style: {
                ...subtitleStyle,
                color: 'white',
              },
            },
            words[i] + (i < words.length - 1 ? ' ' : ''),
          ),
        );
      }
    }

    return parts;
  } else {
    // No yellow word found, return all text in white
    const cleanText = coloredText.replace(/\{[^}]*\}/g, '').trim();
    return [
      React.createElement(
        'span',
        {
          key: 'default',
          style: {
            ...subtitleStyle,
            color: 'white',
          },
        },
        cleanText,
      ),
    ];
  }
};
