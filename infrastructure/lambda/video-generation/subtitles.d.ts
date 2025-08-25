import { Scene } from './script';
import { SubtitleData } from './audio';
export declare function generateSubtitles(scenes: Scene[], userId: string, timestamp: string, subtitleData?: SubtitleData[]): Promise<string[]>;
