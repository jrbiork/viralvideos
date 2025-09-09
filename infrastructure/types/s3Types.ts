export interface ManifestFile {
  mp3: string;
  mp4: string;
  combined: string;
  jpg?: string;
  png?: string;
  subtitle: string;
  ass: string;
}

export interface ManifestScene {
  scenePosition: number;
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
  timestamp: string; // Added for compatibility with the code that uses manifest.timestamp
}
