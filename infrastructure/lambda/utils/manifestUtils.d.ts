import { Scene } from './script';
import { Manifest, ManifestScene } from '../types/s3Types';
export declare function createManifest(userId: string, timestamp: string, scenes: Scene[], totalDuration: number, voiceToneInstruction: string, voice: string, language: string, template: string): Promise<string>;
export declare function getManifest(userId: string, timestamp: string): Promise<Manifest | null>;
export declare function updateManifest(existingManifest: Manifest, updates: Partial<Manifest>): Promise<Manifest>;
export declare function addSceneToManifest(existingManifest: Manifest, scene: ManifestScene): Promise<Manifest>;
export declare function createManifestScene(scene: Scene, userId: string, timestamp: string, scenePosition: number): ManifestScene;
export declare function hydrateManifest(manifest: Manifest | null): Promise<Manifest | null>;
