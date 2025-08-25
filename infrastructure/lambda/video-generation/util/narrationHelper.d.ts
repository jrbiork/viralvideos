/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - Original audio buffer
 * @param targetDuration - Target duration in seconds
 * @returns Adjusted audio buffer
 */
export declare function adjustAudioDuration(audioBuffer: Buffer, targetDuration: number): Promise<Buffer>;
/**
 * Estimates the duration of text when spoken at natural pace
 * @param text - The text to estimate duration for
 * @returns Estimated duration in seconds
 */
export declare function estimateTextDuration(text: string): number;
/**
 * Adjusts text to better fit target duration
 * @param text - Original text
 * @param targetDuration - Target duration in seconds
 * @returns Adjusted text that should fit better
 */
export declare function adjustTextForDuration(text: string, targetDuration: number): string;
