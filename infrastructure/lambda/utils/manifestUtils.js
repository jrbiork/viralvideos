"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManifest = createManifest;
exports.getManifest = getManifest;
exports.updateManifest = updateManifest;
exports.addSceneToManifest = addSceneToManifest;
exports.createManifestScene = createManifestScene;
exports.hydrateManifest = hydrateManifest;
const s3Uploader_1 = require("./s3Uploader");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const client_s3_1 = require("@aws-sdk/client-s3");
const videoEffects_1 = require("./videoEffects");
const VIDEO_PARTS_BUCKET_NAME = process.env.VIDEO_PARTS_BUCKET_NAME || '';
async function createManifest(userId, timestamp, scenes, totalDuration, voiceToneInstruction, voice, language, template) {
    try {
        const prefix = `${userId}/${timestamp}.scene-`;
        const currentTime = Date.now().toString();
        const manifest = {
            schemaVersion: 1,
            size: '0',
            key: `${userId}/${timestamp}.manifest.json`,
            userId,
            timestamp,
            bucket: VIDEO_PARTS_BUCKET_NAME,
            prefix,
            generatedAt: timestamp,
            updatedAt: currentTime,
            sceneCount: scenes.length,
            voiceToneInstruction,
            voice,
            language,
            template,
            scenes: scenes.map((scene, index) => ({
                id: scene.id,
                scenePosition: scene.id,
                removed: false,
                animated: false,
                files: {
                    mp3: `${userId}/${timestamp}.scene-${scene.id}.mp3`,
                    mp4: `${userId}/${timestamp}.scene-${scene.id}.mp4`,
                    combined: `${userId}/${timestamp}.scene-${scene.id}-combined.mp4`,
                    png: `${userId}/${timestamp}.scene-${scene.id}.png`,
                    subtitle: `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`,
                    ass: `${userId}/${timestamp}.scene-${scene.id}.ass`,
                    duration: scene.duration,
                },
            })),
            totalDuration,
            finalVideoUrl: '',
            videoGenerated: false,
        };
        // Convert manifest to JSON string
        const manifestJson = JSON.stringify(manifest, null, 2);
        // Upload manifest to S3
        const manifestKey = `${userId}/${timestamp}.manifest.json`;
        const manifestUrl = await (0, s3Uploader_1.uploadJsonToS3)(manifestJson, manifestKey);
        console.log('📋 Manifest created and uploaded:', manifestKey);
        console.log('📋 Manifest URL:', manifestUrl);
        return manifestUrl;
    }
    catch (error) {
        console.error('❌ Error creating manifest:', error);
        throw new Error(`Failed to create manifest: ${error}`);
    }
}
async function getManifest(userId, timestamp) {
    try {
        const manifestKey = `${userId}/${timestamp}.manifest.json`;
        const manifestData = await (0, s3Uploader_1.getObjectFromS3)(manifestKey);
        if (!manifestData) {
            return null;
        }
        // getObjectFromS3 already parses JSON, so we can return it directly
        return manifestData;
    }
    catch (error) {
        console.error('❌ Error getting manifest:', error);
        return null;
    }
}
async function updateManifest(existingManifest, updates) {
    const updatedManifest = {
        ...existingManifest,
        ...updates,
        updatedAt: Date.now().toString(),
    };
    await (0, s3Uploader_1.uploadJsonToS3)(JSON.stringify(updatedManifest), existingManifest.key);
    return updatedManifest;
}
// create a new update manifest that will receive manifest key and a new scene object
async function addSceneToManifest(existingManifest, scene) {
    // Create a copy of existing scenes
    const updatedScenes = [...existingManifest.scenes];
    // Insert the new scene at the correct position based on scenePosition
    updatedScenes.splice(scene.scenePosition, 0, scene);
    // bump up scenePosition for all subsequent scenes
    for (let i = scene.scenePosition + 1; i < updatedScenes.length; i++) {
        updatedScenes[i].scenePosition++;
    }
    // recalculate total duration from all scenes
    const totalDuration = updatedScenes.reduce((acc, scene) => acc + scene.files.duration, 0);
    const updatedManifest = {
        ...existingManifest,
        scenes: updatedScenes,
        sceneCount: updatedScenes.length,
        updatedAt: Date.now().toString(),
        totalDuration,
    };
    await (0, s3Uploader_1.uploadJsonToS3)(JSON.stringify(updatedManifest), existingManifest.key);
    return updatedManifest;
}
// create a function to create a single manifest scene from a Scene object
function createManifestScene(scene, userId, timestamp, scenePosition) {
    return {
        scenePosition: scenePosition,
        removed: false,
        id: scene.id,
        animated: scene.animated || false,
        animationPrompt: scene.animationPrompt,
        files: {
            mp3: `${userId}/${timestamp}.scene-${scene.id}.mp3`,
            mp4: `${userId}/${timestamp}.scene-${scene.id}.mp4`,
            combined: `${userId}/${timestamp}.scene-${scene.id}-combined.mp4`,
            png: `${userId}/${timestamp}.scene-${scene.id}.png`,
            subtitle: `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`,
            ass: `${userId}/${timestamp}.scene-${scene.id}.ass`,
            duration: scene.duration,
        },
    };
}
// create a function to hydrate scenes from manifest
// it will add pre sign url to the scenes .png, .mp3, .mp4
// and download the content of .ass, .subtitle.json files
async function hydrateManifest(manifest) {
    if (!manifest) {
        return null;
    }
    const scenes = [];
    const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    const expiresIn = 36000;
    const bucketVideoName = process.env.VIDEO_BUCKET_NAME || '';
    const bucketName = VIDEO_PARTS_BUCKET_NAME;
    // getSignedUrl never checks object existence — it's pure crypto-signing.
    // A scene's files.mp4 key is written to the manifest as soon as the video
    // is *planned* (createManifest/createManifestScene), long before the
    // Ken-Burns effect actually uploads that object. Without this check, every
    // manifest sent to the frontend before that upload finishes would carry a
    // plausible-looking but 404 mp4 URL. List which mp4s truly exist once
    // (single S3 call for all scenes) so we can omit signed URLs for the rest.
    const existingMp4Keys = await (0, videoEffects_1.listExistingSceneMp4Keys)(manifest.userId, manifest.timestamp);
    for (const scene of manifest.scenes) {
        const files = scene.files;
        // Validate required file keys before making S3 requests
        console.log(`🔍 Hydrating scene ${scene.scenePosition}, files:`, files);
        const [audioUrl, videoUrl, imageUrl, subtitleContent, assContent] = await Promise.all([
            (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                Bucket: bucketName,
                Key: files.mp3,
            }), {
                expiresIn,
            }),
            existingMp4Keys.has(files.mp4)
                ? (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({ Bucket: bucketName, Key: files.mp4 }), {
                    expiresIn,
                })
                : Promise.resolve(''),
            (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                Bucket: bucketName,
                Key: files.png || files.jpg,
            }), {
                expiresIn,
            }),
            // Fetch inline subtitle.json content
            s3
                .send(new client_s3_1.GetObjectCommand({ Bucket: bucketName, Key: files.subtitle }))
                .then(async (subtitleObj) => {
                const subtitleText = await subtitleObj.Body?.transformToString();
                try {
                    const parsedSubtitle = JSON.parse(subtitleText || '{}');
                    return parsedSubtitle.fullText || '';
                }
                catch {
                    return '';
                }
            })
                .catch((error) => {
                console.warn(`⚠️ Failed to fetch subtitle for scene ${scene.scenePosition}:`, error.message);
                return '';
            }),
            // Fetch inline .ass content
            s3
                .send(new client_s3_1.GetObjectCommand({ Bucket: bucketName, Key: files.ass }))
                .then(async (assObj) => {
                return (await assObj.Body?.transformToString()) || null;
            })
                .catch((error) => {
                console.warn(`⚠️ Failed to fetch ass for scene ${scene.scenePosition}:`, error.message);
                return null;
            }),
        ]);
        // create a scene object
        const sceneObject = {
            scenePosition: scene.scenePosition,
            id: scene.id,
            removed: scene.removed || false,
            animated: scene.animated || false,
            animationPrompt: scene.animationPrompt,
            files: {
                mp3: audioUrl,
                mp4: videoUrl,
                jpg: imageUrl,
                png: imageUrl,
                ass: assContent || '',
                subtitle: subtitleContent || '',
                duration: scene.files.duration,
            },
        };
        scenes.push(sceneObject);
    }
    return {
        ...manifest,
        scenes,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuaWZlc3RVdGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmlmZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFTQSx3Q0FnRUM7QUFFRCxrQ0FrQkM7QUFFRCx3Q0FZQztBQUdELGdEQStCQztBQUdELGtEQXNCQztBQUtELDBDQTRIQztBQXRTRCw2Q0FBK0Q7QUFFL0Qsd0VBQTZEO0FBQzdELGtEQUFnRTtBQUNoRSxpREFBMEQ7QUFFMUQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLEVBQUUsQ0FBQztBQUVuRSxLQUFLLFVBQVUsY0FBYyxDQUNsQyxNQUFjLEVBQ2QsU0FBaUIsRUFDakIsTUFBZSxFQUNmLGFBQXFCLEVBQ3JCLG9CQUE0QixFQUM1QixLQUFhLEVBQ2IsUUFBZ0IsRUFDaEIsUUFBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxTQUFTLENBQUM7UUFDL0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTFDLE1BQU0sUUFBUSxHQUFhO1lBQ3pCLGFBQWEsRUFBRSxDQUFDO1lBQ2hCLElBQUksRUFBRSxHQUFHO1lBQ1QsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsZ0JBQWdCO1lBQzNDLE1BQU07WUFDTixTQUFTO1lBQ1QsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQixNQUFNO1lBQ04sV0FBVyxFQUFFLFNBQVM7WUFDdEIsU0FBUyxFQUFFLFdBQVc7WUFDdEIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3pCLG9CQUFvQjtZQUNwQixLQUFLO1lBQ0wsUUFBUTtZQUNSLFFBQVE7WUFDUixNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3BDLEVBQUUs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QkFDckIsT0FBTyxDQUFDLE1BQU0sTUFBTSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDO1lBQzFELENBQUMsQ0FBQztpQkFDRCxLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDZixPQUFPLENBQUMsSUFBSSxDQUNWLG9DQUFvQyxLQUFLLENBQUMsYUFBYSxHQUFHLEVBQzFELEtBQUssQ0FBQyxPQUFPLENBQ2QsQ0FBQztnQkFDRixPQUFPLElBQUksQ0FBQztZQUNkLENBQUMsQ0FBQztTQUNMLENBQUMsQ0FBQztRQUVMLHdCQUF3QjtRQUN4QixNQUFNLFdBQVcsR0FBa0I7WUFDakMsYUFBYSxFQUFFLEtBQUssQ0FBQyxhQUFhO1lBQ2xDLEVBQUUsRUFBRSxLQUFLLENBQUMsRUFBRTtZQUNaLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUs7WUFDL0IsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLElBQUksS0FBSztZQUNqQyxlQUFlLEVBQUUsS0FBSyxDQUFDLGVBQWU7WUFDdEMsS0FBSyxFQUFFO2dCQUNMLEdBQUcsRUFBRSxRQUFRO2dCQUNiLEdBQUcsRUFBRSxRQUFRO2dCQUNiLEdBQUcsRUFBRSxRQUFRO2dCQUNiLEdBQUcsRUFBRSxRQUFRO2dCQUNiLEdBQUcsRUFBRSxVQUFVLElBQUksRUFBRTtnQkFDckIsUUFBUSxFQUFFLGVBQWUsSUFBSSxFQUFFO2dCQUMvQixRQUFRLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRO2FBQy9CO1NBQ0YsQ0FBQztRQUVGLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVELE9BQU87UUFDTCxHQUFHLFFBQVE7UUFDWCxNQUFNO0tBQ1AsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4vc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZEpzb25Ub1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QsIE1hbmlmZXN0U2NlbmUgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGxpc3RFeGlzdGluZ1NjZW5lTXA0S2V5cyB9IGZyb20gJy4vdmlkZW9FZmZlY3RzJztcblxuY29uc3QgVklERU9fUEFSVFNfQlVDS0VUX05BTUUgPSBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSB8fCAnJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZU1hbmlmZXN0KFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuICB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nLFxuICB2b2ljZTogc3RyaW5nLFxuICBsYW5ndWFnZTogc3RyaW5nLFxuICB0ZW1wbGF0ZTogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcmVmaXggPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS1gO1xuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKS50b1N0cmluZygpO1xuXG4gICAgY29uc3QgbWFuaWZlc3Q6IE1hbmlmZXN0ID0ge1xuICAgICAgc2NoZW1hVmVyc2lvbjogMSxcbiAgICAgIHNpemU6ICcwJyxcbiAgICAgIGtleTogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0ubWFuaWZlc3QuanNvbmAsXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBidWNrZXQ6IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgcHJlZml4LFxuICAgICAgZ2VuZXJhdGVkQXQ6IHRpbWVzdGFtcCxcbiAgICAgIHVwZGF0ZWRBdDogY3VycmVudFRpbWUsXG4gICAgICBzY2VuZUNvdW50OiBzY2VuZXMubGVuZ3RoLFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICB2b2ljZSxcbiAgICAgIGxhbmd1YWdlLFxuICAgICAgdGVtcGxhdGUsXG4gICAgICBzY2VuZXM6IHNjZW5lcy5tYXAoKHNjZW5lLCBpbmRleCkgPT4gKHtcbiAgICAgICAgaWQ6IHNjZW5lLmlkLFxuICAgICAgICBzY2VuZVBvc2l0aW9uOiBzY2VuZS5pZCxcbiAgICAgICAgcmVtb3ZlZDogZmFsc2UsXG4gICAgICAgIGFuaW1hdGVkOiBmYWxzZSxcbiAgICAgICAgZmlsZXM6IHtcbiAgICAgICAgICBtcDM6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2AsXG4gICAgICAgICAgbXA0OiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgLFxuICAgICAgICAgIGNvbWJpbmVkOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS1jb21iaW5lZC5tcDRgLFxuICAgICAgICAgIHBuZzogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYCxcbiAgICAgICAgICBzdWJ0aXRsZTogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmAsXG4gICAgICAgICAgYXNzOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5hc3NgLFxuICAgICAgICAgIGR1cmF0aW9uOiBzY2VuZS5kdXJhdGlvbixcbiAgICAgICAgfSxcbiAgICAgIH0pKSxcbiAgICAgIHRvdGFsRHVyYXRpb24sXG4gICAgICBmaW5hbFZpZGVvVXJsOiAnJyxcbiAgICAgIHZpZGVvR2VuZXJhdGVkOiBmYWxzZSxcbiAgICB9O1xuXG4gICAgLy8gQ29udmVydCBtYW5pZmVzdCB0byBKU09OIHN0cmluZ1xuICAgIGNvbnN0IG1hbmlmZXN0SnNvbiA9IEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKTtcblxuICAgIC8vIFVwbG9hZCBtYW5pZmVzdCB0byBTM1xuICAgIGNvbnN0IG1hbmlmZXN0S2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0ubWFuaWZlc3QuanNvbmA7XG4gICAgY29uc3QgbWFuaWZlc3RVcmwgPSBhd2FpdCB1cGxvYWRKc29uVG9TMyhtYW5pZmVzdEpzb24sIG1hbmlmZXN0S2V5KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5OLIE1hbmlmZXN0IGNyZWF0ZWQgYW5kIHVwbG9hZGVkOicsIG1hbmlmZXN0S2V5KTtcbiAgICBjb25zb2xlLmxvZygn8J+TiyBNYW5pZmVzdCBVUkw6JywgbWFuaWZlc3RVcmwpO1xuXG4gICAgcmV0dXJuIG1hbmlmZXN0VXJsO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBjcmVhdGluZyBtYW5pZmVzdDonLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIG1hbmlmZXN0OiAke2Vycm9yfWApO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRNYW5pZmVzdChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxNYW5pZmVzdCB8IG51bGw+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBtYW5pZmVzdEtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9Lm1hbmlmZXN0Lmpzb25gO1xuXG4gICAgY29uc3QgbWFuaWZlc3REYXRhID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKG1hbmlmZXN0S2V5KTtcbiAgICBpZiAoIW1hbmlmZXN0RGF0YSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gZ2V0T2JqZWN0RnJvbVMzIGFscmVhZHkgcGFyc2VzIEpTT04sIHNvIHdlIGNhbiByZXR1cm4gaXQgZGlyZWN0bHlcbiAgICByZXR1cm4gbWFuaWZlc3REYXRhIGFzIE1hbmlmZXN0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBnZXR0aW5nIG1hbmlmZXN0OicsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdXBkYXRlTWFuaWZlc3QoXG4gIGV4aXN0aW5nTWFuaWZlc3Q6IE1hbmlmZXN0LFxuICB1cGRhdGVzOiBQYXJ0aWFsPE1hbmlmZXN0Pixcbik6IFByb21pc2U8TWFuaWZlc3Q+IHtcbiAgY29uc3QgdXBkYXRlZE1hbmlmZXN0OiBNYW5pZmVzdCA9IHtcbiAgICAuLi5leGlzdGluZ01hbmlmZXN0LFxuICAgIC4uLnVwZGF0ZXMsXG4gICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXG4gIH07XG4gIGF3YWl0IHVwbG9hZEpzb25Ub1MzKEpTT04uc3RyaW5naWZ5KHVwZGF0ZWRNYW5pZmVzdCksIGV4aXN0aW5nTWFuaWZlc3Qua2V5KTtcblxuICByZXR1cm4gdXBkYXRlZE1hbmlmZXN0O1xufVxuXG4vLyBjcmVhdGUgYSBuZXcgdXBkYXRlIG1hbmlmZXN0IHRoYXQgd2lsbCByZWNlaXZlIG1hbmlmZXN0IGtleSBhbmQgYSBuZXcgc2NlbmUgb2JqZWN0XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWRkU2NlbmVUb01hbmlmZXN0KFxuICBleGlzdGluZ01hbmlmZXN0OiBNYW5pZmVzdCxcbiAgc2NlbmU6IE1hbmlmZXN0U2NlbmUsXG4pOiBQcm9taXNlPE1hbmlmZXN0PiB7XG4gIC8vIENyZWF0ZSBhIGNvcHkgb2YgZXhpc3Rpbmcgc2NlbmVzXG4gIGNvbnN0IHVwZGF0ZWRTY2VuZXMgPSBbLi4uZXhpc3RpbmdNYW5pZmVzdC5zY2VuZXNdO1xuXG4gIC8vIEluc2VydCB0aGUgbmV3IHNjZW5lIGF0IHRoZSBjb3JyZWN0IHBvc2l0aW9uIGJhc2VkIG9uIHNjZW5lUG9zaXRpb25cbiAgdXBkYXRlZFNjZW5lcy5zcGxpY2Uoc2NlbmUuc2NlbmVQb3NpdGlvbiwgMCwgc2NlbmUpO1xuXG4gIC8vIGJ1bXAgdXAgc2NlbmVQb3NpdGlvbiBmb3IgYWxsIHN1YnNlcXVlbnQgc2NlbmVzXG4gIGZvciAobGV0IGkgPSBzY2VuZS5zY2VuZVBvc2l0aW9uICsgMTsgaSA8IHVwZGF0ZWRTY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICB1cGRhdGVkU2NlbmVzW2ldLnNjZW5lUG9zaXRpb24rKztcbiAgfVxuXG4gIC8vIHJlY2FsY3VsYXRlIHRvdGFsIGR1cmF0aW9uIGZyb20gYWxsIHNjZW5lc1xuICBjb25zdCB0b3RhbER1cmF0aW9uID0gdXBkYXRlZFNjZW5lcy5yZWR1Y2UoXG4gICAgKGFjYywgc2NlbmUpID0+IGFjYyArIHNjZW5lLmZpbGVzLmR1cmF0aW9uLFxuICAgIDAsXG4gICk7XG5cbiAgY29uc3QgdXBkYXRlZE1hbmlmZXN0OiBNYW5pZmVzdCA9IHtcbiAgICAuLi5leGlzdGluZ01hbmlmZXN0LFxuICAgIHNjZW5lczogdXBkYXRlZFNjZW5lcyxcbiAgICBzY2VuZUNvdW50OiB1cGRhdGVkU2NlbmVzLmxlbmd0aCxcbiAgICB1cGRhdGVkQXQ6IERhdGUubm93KCkudG9TdHJpbmcoKSxcbiAgICB0b3RhbER1cmF0aW9uLFxuICB9O1xuXG4gIGF3YWl0IHVwbG9hZEpzb25Ub1MzKEpTT04uc3RyaW5naWZ5KHVwZGF0ZWRNYW5pZmVzdCksIGV4aXN0aW5nTWFuaWZlc3Qua2V5KTtcbiAgcmV0dXJuIHVwZGF0ZWRNYW5pZmVzdDtcbn1cblxuLy8gY3JlYXRlIGEgZnVuY3Rpb24gdG8gY3JlYXRlIGEgc2luZ2xlIG1hbmlmZXN0IHNjZW5lIGZyb20gYSBTY2VuZSBvYmplY3RcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNYW5pZmVzdFNjZW5lKFxuICBzY2VuZTogU2NlbmUsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyLFxuKTogTWFuaWZlc3RTY2VuZSB7XG4gIHJldHVybiB7XG4gICAgc2NlbmVQb3NpdGlvbjogc2NlbmVQb3NpdGlvbixcbiAgICByZW1vdmVkOiBmYWxzZSxcbiAgICBpZDogc2NlbmUuaWQsXG4gICAgYW5pbWF0ZWQ6IHNjZW5lLmFuaW1hdGVkIHx8IGZhbHNlLFxuICAgIGFuaW1hdGlvblByb21wdDogc2NlbmUuYW5pbWF0aW9uUHJvbXB0LFxuICAgIGZpbGVzOiB7XG4gICAgICBtcDM6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2AsXG4gICAgICBtcDQ6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGAsXG4gICAgICBjb21iaW5lZDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0tY29tYmluZWQubXA0YCxcbiAgICAgIHBuZzogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYCxcbiAgICAgIHN1YnRpdGxlOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5zdWJ0aXRsZS5qc29uYCxcbiAgICAgIGFzczogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uYXNzYCxcbiAgICAgIGR1cmF0aW9uOiBzY2VuZS5kdXJhdGlvbixcbiAgICB9LFxuICB9O1xufVxuXG4vLyBjcmVhdGUgYSBmdW5jdGlvbiB0byBoeWRyYXRlIHNjZW5lcyBmcm9tIG1hbmlmZXN0XG4vLyBpdCB3aWxsIGFkZCBwcmUgc2lnbiB1cmwgdG8gdGhlIHNjZW5lcyAucG5nLCAubXAzLCAubXA0XG4vLyBhbmQgZG93bmxvYWQgdGhlIGNvbnRlbnQgb2YgLmFzcywgLnN1YnRpdGxlLmpzb24gZmlsZXNcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoeWRyYXRlTWFuaWZlc3QoXG4gIG1hbmlmZXN0OiBNYW5pZmVzdCB8IG51bGwsXG4pOiBQcm9taXNlPE1hbmlmZXN0IHwgbnVsbD4ge1xuICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBzY2VuZXM6IE1hbmlmZXN0U2NlbmVbXSA9IFtdO1xuXG4gIGNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuICBjb25zdCBleHBpcmVzSW4gPSAzNjAwMDtcbiAgY29uc3QgYnVja2V0VmlkZW9OYW1lID0gcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUgfHwgJyc7XG4gIGNvbnN0IGJ1Y2tldE5hbWUgPSBWSURFT19QQVJUU19CVUNLRVRfTkFNRTtcblxuICAvLyBnZXRTaWduZWRVcmwgbmV2ZXIgY2hlY2tzIG9iamVjdCBleGlzdGVuY2Ug4oCUIGl0J3MgcHVyZSBjcnlwdG8tc2lnbmluZy5cbiAgLy8gQSBzY2VuZSdzIGZpbGVzLm1wNCBrZXkgaXMgd3JpdHRlbiB0byB0aGUgbWFuaWZlc3QgYXMgc29vbiBhcyB0aGUgdmlkZW9cbiAgLy8gaXMgKnBsYW5uZWQqIChjcmVhdGVNYW5pZmVzdC9jcmVhdGVNYW5pZmVzdFNjZW5lKSwgbG9uZyBiZWZvcmUgdGhlXG4gIC8vIEtlbi1CdXJucyBlZmZlY3QgYWN0dWFsbHkgdXBsb2FkcyB0aGF0IG9iamVjdC4gV2l0aG91dCB0aGlzIGNoZWNrLCBldmVyeVxuICAvLyBtYW5pZmVzdCBzZW50IHRvIHRoZSBmcm9udGVuZCBiZWZvcmUgdGhhdCB1cGxvYWQgZmluaXNoZXMgd291bGQgY2FycnkgYVxuICAvLyBwbGF1c2libGUtbG9va2luZyBidXQgNDA0IG1wNCBVUkwuIExpc3Qgd2hpY2ggbXA0cyB0cnVseSBleGlzdCBvbmNlXG4gIC8vIChzaW5nbGUgUzMgY2FsbCBmb3IgYWxsIHNjZW5lcykgc28gd2UgY2FuIG9taXQgc2lnbmVkIFVSTHMgZm9yIHRoZSByZXN0LlxuICBjb25zdCBleGlzdGluZ01wNEtleXMgPSBhd2FpdCBsaXN0RXhpc3RpbmdTY2VuZU1wNEtleXMoXG4gICAgbWFuaWZlc3QudXNlcklkLFxuICAgIG1hbmlmZXN0LnRpbWVzdGFtcCxcbiAgKTtcblxuICBmb3IgKGNvbnN0IHNjZW5lIG9mIG1hbmlmZXN0LnNjZW5lcykge1xuICAgIGNvbnN0IGZpbGVzID0gc2NlbmUuZmlsZXM7XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWxlIGtleXMgYmVmb3JlIG1ha2luZyBTMyByZXF1ZXN0c1xuICAgIGNvbnNvbGUubG9nKGDwn5SNIEh5ZHJhdGluZyBzY2VuZSAke3NjZW5lLnNjZW5lUG9zaXRpb259LCBmaWxlczpgLCBmaWxlcyk7XG5cbiAgICBjb25zdCBbYXVkaW9VcmwsIHZpZGVvVXJsLCBpbWFnZVVybCwgc3VidGl0bGVDb250ZW50LCBhc3NDb250ZW50XSA9XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgIGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICBCdWNrZXQ6IGJ1Y2tldE5hbWUsXG4gICAgICAgICAgICBLZXk6IGZpbGVzLm1wMyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBleHBpcmVzSW4sXG4gICAgICAgICAgfSxcbiAgICAgICAgKSxcbiAgICAgICAgZXhpc3RpbmdNcDRLZXlzLmhhcyhmaWxlcy5tcDQpXG4gICAgICAgICAgPyBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgICAgIHMzLFxuICAgICAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5tcDQgfSksXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBleHBpcmVzSW4sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICApXG4gICAgICAgICAgOiBQcm9taXNlLnJlc29sdmUoJycpLFxuICAgICAgICBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgQnVja2V0OiBidWNrZXROYW1lLFxuICAgICAgICAgICAgS2V5OiBmaWxlcy5wbmcgfHwgZmlsZXMuanBnLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICAvLyBGZXRjaCBpbmxpbmUgc3VidGl0bGUuanNvbiBjb250ZW50XG4gICAgICAgIHMzXG4gICAgICAgICAgLnNlbmQoXG4gICAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5zdWJ0aXRsZSB9KSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKHN1YnRpdGxlT2JqKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdWJ0aXRsZVRleHQgPSBhd2FpdCBzdWJ0aXRsZU9iai5Cb2R5Py50cmFuc2Zvcm1Ub1N0cmluZygpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgcGFyc2VkU3VidGl0bGUgPSBKU09OLnBhcnNlKHN1YnRpdGxlVGV4dCB8fCAne30nKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlZFN1YnRpdGxlLmZ1bGxUZXh0IHx8ICcnO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYOKaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggc3VidGl0bGUgZm9yIHNjZW5lICR7c2NlbmUuc2NlbmVQb3NpdGlvbn06YCxcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgfSksXG4gICAgICAgIC8vIEZldGNoIGlubGluZSAuYXNzIGNvbnRlbnRcbiAgICAgICAgczNcbiAgICAgICAgICAuc2VuZChuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5hc3MgfSkpXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKGFzc09iaikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChhd2FpdCBhc3NPYmouQm9keT8udHJhbnNmb3JtVG9TdHJpbmcoKSkgfHwgbnVsbDtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYOKaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggYXNzIGZvciBzY2VuZSAke3NjZW5lLnNjZW5lUG9zaXRpb259OmAsXG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgfSksXG4gICAgICBdKTtcblxuICAgIC8vIGNyZWF0ZSBhIHNjZW5lIG9iamVjdFxuICAgIGNvbnN0IHNjZW5lT2JqZWN0OiBNYW5pZmVzdFNjZW5lID0ge1xuICAgICAgc2NlbmVQb3NpdGlvbjogc2NlbmUuc2NlbmVQb3NpdGlvbixcbiAgICAgIGlkOiBzY2VuZS5pZCxcbiAgICAgIHJlbW92ZWQ6IHNjZW5lLnJlbW92ZWQgfHwgZmFsc2UsXG4gICAgICBhbmltYXRlZDogc2NlbmUuYW5pbWF0ZWQgfHwgZmFsc2UsXG4gICAgICBhbmltYXRpb25Qcm9tcHQ6IHNjZW5lLmFuaW1hdGlvblByb21wdCxcbiAgICAgIGZpbGVzOiB7XG4gICAgICAgIG1wMzogYXVkaW9VcmwsXG4gICAgICAgIG1wNDogdmlkZW9VcmwsXG4gICAgICAgIGpwZzogaW1hZ2VVcmwsXG4gICAgICAgIHBuZzogaW1hZ2VVcmwsXG4gICAgICAgIGFzczogYXNzQ29udGVudCB8fCAnJyxcbiAgICAgICAgc3VidGl0bGU6IHN1YnRpdGxlQ29udGVudCB8fCAnJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lLmZpbGVzLmR1cmF0aW9uLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgc2NlbmVzLnB1c2goc2NlbmVPYmplY3QpO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAuLi5tYW5pZmVzdCxcbiAgICBzY2VuZXMsXG4gIH07XG59XG4iXX0=