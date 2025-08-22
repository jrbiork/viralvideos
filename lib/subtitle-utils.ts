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
  console.log('Original colored text:', coloredText);

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
    fontSize: '30px', // Force 30px regardless of ASS file
    fontWeight: styleInfo.bold ? 'bold' : 'normal',
    textShadow: '2px 2px 2px rgba(0, 0, 0, 0.9)', // Darker shadow
    textAlign: 'center' as const,
  };

  // First, remove all bracket codes to get clean text
  const cleanText = coloredText.replace(/\{[^}]*\}/g, '');
  console.log('Clean text after removing all brackets:', cleanText);

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

  const parts = [];
  let currentIndex = 0;
  let currentColor = 'white'; // default color

  // Match ASS color codes: {\c&H00FFFF&} or {\c&H00FFFFFF&}
  const colorRegex = /\{\\c&H([0-9A-Fa-f]{6})&\}/g;
  let match;

  while ((match = colorRegex.exec(coloredText)) !== null) {
    const colorCode = match[1].toUpperCase();
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    // Add text before this color code (clean version)
    if (matchStart > currentIndex) {
      const beforeTextWithCodes = coloredText.slice(currentIndex, matchStart);
      const beforeTextClean = beforeTextWithCodes.replace(/\{[^}]*\}/g, '');
      if (beforeTextClean.trim()) {
        parts.push(
          React.createElement(
            'span',
            {
              key: `text-${currentIndex}`,
              className: `text-${
                currentColor === 'yellow' ? 'yellow-300' : 'white'
              }`,
              style: subtitleStyle,
            },
            beforeTextClean,
          ),
        );
      }
    }

    // Determine color based on the code
    if (colorCode === '00FFFF') {
      currentColor = 'yellow';
    } else if (colorCode === 'FFFFFF') {
      currentColor = 'white';
    }
    // For any other color codes, keep current color

    currentIndex = matchEnd;
  }

  // Add remaining text after the last color code (clean version)
  if (currentIndex < coloredText.length) {
    const remainingTextWithCodes = coloredText.slice(currentIndex);
    const remainingTextClean = remainingTextWithCodes.replace(/\{[^}]*\}/g, '');
    if (remainingTextClean.trim()) {
      parts.push(
        React.createElement(
          'span',
          {
            key: `text-end-${currentIndex}`,
            className: `text-${
              currentColor === 'yellow' ? 'yellow-300' : 'white'
            }`,
            style: subtitleStyle,
          },
          remainingTextClean,
        ),
      );
    }
  }

  console.log('Parsed parts:', parts);
  return parts.length > 0
    ? parts
    : [
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
};
