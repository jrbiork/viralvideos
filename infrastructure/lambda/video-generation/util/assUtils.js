"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseASSTime = parseASSTime;
exports.formatASSTime = formatASSTime;
exports.createASSStyleHeader = createASSStyleHeader;
function parseASSTime(assTime) {
    const match = assTime.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
    if (!match)
        return 0;
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    let fraction = match[4];
    let ms = 0;
    if (fraction.length === 2) {
        ms = parseInt(fraction) * 10;
    }
    else {
        ms = parseInt(fraction);
    }
    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
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
        'Style: Default,LiberationSans,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n\n';
    header += '[Events]\n';
    header +=
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    return header;
}
