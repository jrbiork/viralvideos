import { Manifest } from '@/app/types/manifest';

export function buildMediaFiles(manifest?: Manifest): Record<string, string> {
  if (!manifest) return {};
  const mediaFiles: Record<string, string> = {};
  const timestamp = manifest.generatedAt;
  manifest.scenes.forEach((scene) => {
    const { files } = scene;
    const sceneNumber =
      files.mp3?.match(/scene-(\d+)\./)?.[1] || scene.scenePosition.toString();
    if (files.png)
      mediaFiles[`${timestamp}.scene-${sceneNumber}.png`] = files.png;
    if (files.jpg)
      mediaFiles[`${timestamp}.scene-${sceneNumber}.jpg`] = files.jpg;
    if (files.mp3)
      mediaFiles[`${timestamp}.scene-${sceneNumber}.mp3`] = files.mp3;
    // Prefer the fully-combined clip (narration-length, with the animation
    // looped and subtitles baked in) over the raw source video whenever it
    // exists, so the editor preview matches what the final export produces.
    if (files.mp4)
      mediaFiles[`${timestamp}.scene-${sceneNumber}.mp4`] = files.mp4;
    if (files.combined)
      mediaFiles[`${timestamp}.scene-${sceneNumber}.mp4`] = files.combined;
  });
  return mediaFiles;
}

/**
 * True only once every non-removed scene has a real (existence-checked, see
 * hydrateManifest on the backend) mp4 URL. Used to gate the video preview
 * panel so it never shows a partial/broken mix of ready and not-yet-ready
 * scenes — self-correcting regardless of whether the manifest arrived via a
 * WebSocket broadcast or a plain REST fetch.
 */
export function isManifestFullyReady(manifest?: Manifest): boolean {
  if (!manifest || !manifest.scenes.length) return false;
  const mediaFiles = buildMediaFiles(manifest);
  const timestamp = manifest.generatedAt;
  return manifest.scenes
    .filter((scene) => !scene.removed)
    .every((scene) => {
      const sceneNumber =
        scene.files.mp3?.match(/scene-(\d+)\./)?.[1] ||
        scene.scenePosition.toString();
      return Boolean(mediaFiles[`${timestamp}.scene-${sceneNumber}.mp4`]);
    });
}

export function buildSubtitles(manifest?: Manifest): Record<string, string> {
  if (!manifest) return {};
  const subtitles: Record<string, string> = {};
  const timestamp = manifest.generatedAt;
  manifest.scenes.forEach((scene) => {
    const sceneNumber =
      scene.files.mp3?.match(/scene-(\d+)\./)?.[1] ||
      scene.scenePosition.toString();
    const subtitleKey = `${timestamp}.scene-${sceneNumber}.subtitle`;
    subtitles[subtitleKey] = scene.files.subtitle;
  });
  return subtitles;
}

export function buildAssFiles(manifest?: Manifest): Record<string, string> {
  if (!manifest) return {};
  const assFiles: Record<string, string> = {};
  const timestamp = manifest.generatedAt;
  manifest.scenes.forEach((scene) => {
    const sceneNumber =
      scene.files.mp3?.match(/scene-(\d+)\./)?.[1] ||
      scene.scenePosition.toString();
    const assKey = `${timestamp}.scene-${sceneNumber}.ass`;
    assFiles[assKey] = scene.files.ass;
  });
  return assFiles;
}
