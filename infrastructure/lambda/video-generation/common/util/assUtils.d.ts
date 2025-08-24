export declare function parseASSTime(assTime: string): number;
export declare function formatASSTime(seconds: number): string;
export declare function createASSStyleHeader(): string;
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
export declare function createWordTimedKaraokeASSSubtitle(words: SubtitleWord[], sceneStartTime: number): string;
