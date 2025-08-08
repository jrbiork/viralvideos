export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}
export declare function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  sceneDuration: number,
  totalDuration: number,
): Promise<{ scenes: Scene[]; voiceToneInstruction: string }>;
