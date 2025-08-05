"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseASSTime = parseASSTime;
exports.formatASSTime = formatASSTime;
exports.createASSStyleHeader = createASSStyleHeader;
exports.createWordTimedKaraokeASSSubtitle = createWordTimedKaraokeASSSubtitle;
function parseASSTime(assTime) {
    const match = assTime.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
    if (!match)
        return 0;
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    let fraction = match[4];
    let centiseconds = 0;
    if (fraction.length === 2) {
        centiseconds = parseInt(fraction);
    }
    else {
        centiseconds = Math.floor(parseInt(fraction) / 10);
    }
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}
function formatASSTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centis = Math.round((seconds % 1) * 100);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}
function createASSStyleHeader() {
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
    header +=
        'Style: Default,LiberationSans,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,2,2,10,10,40,1\n\n';
    header += '[Events]\n';
    header +=
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    return header;
}
function createWordTimedKaraokeASSSubtitle(words, sceneStartTime) {
    const assContent = createASSStyleHeader();
    let dialogueLines = '';
    for (let i = 0; i < words.length; i += 2) {
        const currentWord = words[i];
        const nextWord = words[i + 1];
        const pairStart = sceneStartTime + currentWord.start;
        const pairEnd = nextWord
            ? sceneStartTime + nextWord.end
            : sceneStartTime + currentWord.end;
        const startTimeFormatted = formatASSTime(pairStart);
        const endTimeFormatted = formatASSTime(pairEnd);
        const pairText = nextWord
            ? `${currentWord.word.toUpperCase()} ${nextWord.word.toUpperCase()}`
            : currentWord.word.toUpperCase();
        dialogueLines += `Dialogue: 0,${startTimeFormatted},${endTimeFormatted},Default,,0,0,0,,${pairText}\n`;
    }
    return assContent + dialogueLines;
}
