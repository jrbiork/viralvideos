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
    if (files.mp4)
      mediaFiles[`${timestamp}.scene-${sceneNumber}.mp4`] = files.mp4;
  });
  return mediaFiles;
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
