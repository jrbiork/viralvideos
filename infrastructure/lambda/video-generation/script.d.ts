export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
  animated: boolean;
}
export declare function addSceneIds(scenes: Scene[]): Scene[];
export declare function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  sceneDuration: number,
  totalDuration: number,
  userId: string,
  timestamp: string,
): Promise<{
  scenes: Scene[];
  voiceToneInstruction: string;
}>;
