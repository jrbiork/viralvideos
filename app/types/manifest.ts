export interface ManifestFile {
  mp3: string;
  mp4: string;
  combined: string;
  jpg?: string;
  png?: string;
  subtitle: string;
  ass: string;
  duration: number;
}

export interface ManifestScene {
  scenePosition: number;
  id: number;
  removed?: boolean;
  animated?: boolean;
  animationPrompt?: string;
  files: ManifestFile;
}

export interface Manifest {
  schemaVersion: number;
  userId: string;
  bucket: string;
  prefix: string;
  generatedAt: string;
  updatedAt: string;
  sceneCount: number;
  scenes: ManifestScene[];
  timestamp?: string;
  finalVideoUrl?: string;
  totalDuration?: number;
  size?: string;
  // True from the moment combine-video is enqueued until the final video
  // finishes (or fails) — used to block editing a video that's still being
  // rendered in the background.
  isCombining?: boolean;
}
