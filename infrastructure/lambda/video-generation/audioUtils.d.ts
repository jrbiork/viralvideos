export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}
export interface SubtitleData {
  scenePosition: number;
  words: SubtitleWord[];
  fullText: string;
}
export interface NarrationResult {
  audioKeys: string[];
  subtitles: SubtitleData[];
  narrationUrls: Array<{
    [key: string]: string;
  }>;
}
export declare function fetchAudioFilesForTimestamp(
  userId: string,
  timestamp: string,
): Promise<NarrationResult>;
export declare function getAudioSignedUrl(
  audioKey: string,
): Promise<string | null>;
export declare function checkAudioCaptionExists(
  userId: string,
  timestamp: string,
): Promise<boolean>;
