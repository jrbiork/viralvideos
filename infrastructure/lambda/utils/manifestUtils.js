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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuaWZlc3RVdGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmlmZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFTQSx3Q0FnRUM7QUFFRCxrQ0FrQkM7QUFFRCx3Q0FZQztBQUdELGdEQStCQztBQUdELGtEQXFCQztBQUtELDBDQTJIQztBQXBTRCw2Q0FBK0Q7QUFFL0Qsd0VBQTZEO0FBQzdELGtEQUFnRTtBQUNoRSxpREFBMEQ7QUFFMUQsTUFBTSx1QkFBdUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLEVBQUUsQ0FBQztBQUVuRSxLQUFLLFVBQVUsY0FBYyxDQUNsQyxNQUFjLEVBQ2QsU0FBaUIsRUFDakIsTUFBZSxFQUNmLGFBQXFCLEVBQ3JCLG9CQUE0QixFQUM1QixLQUFhLEVBQ2IsUUFBZ0IsRUFDaEIsUUFBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxTQUFTLENBQUM7UUFDL0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTFDLE1BQU0sUUFBUSxHQUFhO1lBQ3pCLGFBQWEsRUFBRSxDQUFDO1lBQ2hCLElBQUksRUFBRSxHQUFHO1lBQ1QsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsZ0JBQWdCO1lBQzNDLE1BQU07WUFDTixTQUFTO1lBQ1QsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQixNQUFNO1lBQ04sV0FBVyxFQUFFLFNBQVM7WUFDdEIsU0FBUyxFQUFFLFdBQVc7WUFDdEIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3pCLG9CQUFvQjtZQUNwQixLQUFLO1lBQ0wsUUFBUTtZQUNSLFFBQVE7WUFDUixNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3BDLEVBQUUs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SUFBSSxFQUFFLGlCQUFpQixFQUFFLENBQUMsSUFBSSxJQUFJLENBQUM7WUFDMUQsQ0FBQyxDQUFDO2lCQUNELEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO2dCQUNmLE9BQU8sQ0FBQyxJQUFJLENBQ1Ysb0NBQW9DLEtBQUssQ0FBQyxhQUFhLEdBQUcsRUFDMUQsS0FBSyxDQUFDLE9BQU8sQ0FDZCxDQUFDO2dCQUNGLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQyxDQUFDO1NBQ0wsQ0FBQyxDQUFDO1FBRUwsd0JBQXdCO1FBQ3hCLE1BQU0sV0FBVyxHQUFrQjtZQUNqQyxhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWE7WUFDbEMsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ1osT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSztZQUMvQixRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLO1lBQ2pDLEtBQUssRUFBRTtnQkFDTCxHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsVUFBVSxJQUFJLEVBQUU7Z0JBQ3JCLFFBQVEsRUFBRSxlQUFlLElBQUksRUFBRTtnQkFDL0IsUUFBUSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUTthQUMvQjtTQUNGLENBQUM7UUFFRixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxPQUFPO1FBQ0wsR0FBRyxRQUFRO1FBQ1gsTUFBTTtLQUNQLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL25hcnJhdGlvbic7XG5pbXBvcnQgeyB1cGxvYWRKc29uVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi9zM1VwbG9hZGVyJztcbmltcG9ydCB7IE1hbmlmZXN0LCBNYW5pZmVzdFNjZW5lIH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgeyBHZXRPYmplY3RDb21tYW5kLCBTM0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBsaXN0RXhpc3RpbmdTY2VuZU1wNEtleXMgfSBmcm9tICcuL3ZpZGVvRWZmZWN0cyc7XG5cbmNvbnN0IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FID0gcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUgfHwgJyc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVNYW5pZmVzdChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzY2VuZXM6IFNjZW5lW10sXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyxcbiAgdm9pY2U6IHN0cmluZyxcbiAgbGFuZ3VhZ2U6IHN0cmluZyxcbiAgdGVtcGxhdGU6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYDtcbiAgICBjb25zdCBjdXJyZW50VGltZSA9IERhdGUubm93KCkudG9TdHJpbmcoKTtcblxuICAgIGNvbnN0IG1hbmlmZXN0OiBNYW5pZmVzdCA9IHtcbiAgICAgIHNjaGVtYVZlcnNpb246IDEsXG4gICAgICBzaXplOiAnMCcsXG4gICAgICBrZXk6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9Lm1hbmlmZXN0Lmpzb25gLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgYnVja2V0OiBWSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIHByZWZpeCxcbiAgICAgIGdlbmVyYXRlZEF0OiB0aW1lc3RhbXAsXG4gICAgICB1cGRhdGVkQXQ6IGN1cnJlbnRUaW1lLFxuICAgICAgc2NlbmVDb3VudDogc2NlbmVzLmxlbmd0aCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgdm9pY2UsXG4gICAgICBsYW5ndWFnZSxcbiAgICAgIHRlbXBsYXRlLFxuICAgICAgc2NlbmVzOiBzY2VuZXMubWFwKChzY2VuZSwgaW5kZXgpID0+ICh7XG4gICAgICAgIGlkOiBzY2VuZS5pZCxcbiAgICAgICAgc2NlbmVQb3NpdGlvbjogc2NlbmUuaWQsXG4gICAgICAgIHJlbW92ZWQ6IGZhbHNlLFxuICAgICAgICBhbmltYXRlZDogZmFsc2UsXG4gICAgICAgIGZpbGVzOiB7XG4gICAgICAgICAgbXAzOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDNgLFxuICAgICAgICAgIG1wNDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YCxcbiAgICAgICAgICBjb21iaW5lZDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0tY29tYmluZWQubXA0YCxcbiAgICAgICAgICBwbmc6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnBuZ2AsXG4gICAgICAgICAgc3VidGl0bGU6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnN1YnRpdGxlLmpzb25gLFxuICAgICAgICAgIGFzczogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uYXNzYCxcbiAgICAgICAgICBkdXJhdGlvbjogc2NlbmUuZHVyYXRpb24sXG4gICAgICAgIH0sXG4gICAgICB9KSksXG4gICAgICB0b3RhbER1cmF0aW9uLFxuICAgICAgZmluYWxWaWRlb1VybDogJycsXG4gICAgICB2aWRlb0dlbmVyYXRlZDogZmFsc2UsXG4gICAgfTtcblxuICAgIC8vIENvbnZlcnQgbWFuaWZlc3QgdG8gSlNPTiBzdHJpbmdcbiAgICBjb25zdCBtYW5pZmVzdEpzb24gPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG5cbiAgICAvLyBVcGxvYWQgbWFuaWZlc3QgdG8gUzNcbiAgICBjb25zdCBtYW5pZmVzdEtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9Lm1hbmlmZXN0Lmpzb25gO1xuICAgIGNvbnN0IG1hbmlmZXN0VXJsID0gYXdhaXQgdXBsb2FkSnNvblRvUzMobWFuaWZlc3RKc29uLCBtYW5pZmVzdEtleSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+TiyBNYW5pZmVzdCBjcmVhdGVkIGFuZCB1cGxvYWRlZDonLCBtYW5pZmVzdEtleSk7XG4gICAgY29uc29sZS5sb2coJ/Cfk4sgTWFuaWZlc3QgVVJMOicsIG1hbmlmZXN0VXJsKTtcblxuICAgIHJldHVybiBtYW5pZmVzdFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY3JlYXRpbmcgbWFuaWZlc3Q6JywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSBtYW5pZmVzdDogJHtlcnJvcn1gKTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0TWFuaWZlc3QoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8TWFuaWZlc3QgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgbWFuaWZlc3RLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5tYW5pZmVzdC5qc29uYDtcblxuICAgIGNvbnN0IG1hbmlmZXN0RGF0YSA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhtYW5pZmVzdEtleSk7XG4gICAgaWYgKCFtYW5pZmVzdERhdGEpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIGdldE9iamVjdEZyb21TMyBhbHJlYWR5IHBhcnNlcyBKU09OLCBzbyB3ZSBjYW4gcmV0dXJuIGl0IGRpcmVjdGx5XG4gICAgcmV0dXJuIG1hbmlmZXN0RGF0YSBhcyBNYW5pZmVzdDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBtYW5pZmVzdDonLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZU1hbmlmZXN0KFxuICBleGlzdGluZ01hbmlmZXN0OiBNYW5pZmVzdCxcbiAgdXBkYXRlczogUGFydGlhbDxNYW5pZmVzdD4sXG4pOiBQcm9taXNlPE1hbmlmZXN0PiB7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdDogTWFuaWZlc3QgPSB7XG4gICAgLi4uZXhpc3RpbmdNYW5pZmVzdCxcbiAgICAuLi51cGRhdGVzLFxuICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICB9O1xuICBhd2FpdCB1cGxvYWRKc29uVG9TMyhKU09OLnN0cmluZ2lmeSh1cGRhdGVkTWFuaWZlc3QpLCBleGlzdGluZ01hbmlmZXN0LmtleSk7XG5cbiAgcmV0dXJuIHVwZGF0ZWRNYW5pZmVzdDtcbn1cblxuLy8gY3JlYXRlIGEgbmV3IHVwZGF0ZSBtYW5pZmVzdCB0aGF0IHdpbGwgcmVjZWl2ZSBtYW5pZmVzdCBrZXkgYW5kIGEgbmV3IHNjZW5lIG9iamVjdFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFkZFNjZW5lVG9NYW5pZmVzdChcbiAgZXhpc3RpbmdNYW5pZmVzdDogTWFuaWZlc3QsXG4gIHNjZW5lOiBNYW5pZmVzdFNjZW5lLFxuKTogUHJvbWlzZTxNYW5pZmVzdD4ge1xuICAvLyBDcmVhdGUgYSBjb3B5IG9mIGV4aXN0aW5nIHNjZW5lc1xuICBjb25zdCB1cGRhdGVkU2NlbmVzID0gWy4uLmV4aXN0aW5nTWFuaWZlc3Quc2NlbmVzXTtcblxuICAvLyBJbnNlcnQgdGhlIG5ldyBzY2VuZSBhdCB0aGUgY29ycmVjdCBwb3NpdGlvbiBiYXNlZCBvbiBzY2VuZVBvc2l0aW9uXG4gIHVwZGF0ZWRTY2VuZXMuc3BsaWNlKHNjZW5lLnNjZW5lUG9zaXRpb24sIDAsIHNjZW5lKTtcblxuICAvLyBidW1wIHVwIHNjZW5lUG9zaXRpb24gZm9yIGFsbCBzdWJzZXF1ZW50IHNjZW5lc1xuICBmb3IgKGxldCBpID0gc2NlbmUuc2NlbmVQb3NpdGlvbiArIDE7IGkgPCB1cGRhdGVkU2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgdXBkYXRlZFNjZW5lc1tpXS5zY2VuZVBvc2l0aW9uKys7XG4gIH1cblxuICAvLyByZWNhbGN1bGF0ZSB0b3RhbCBkdXJhdGlvbiBmcm9tIGFsbCBzY2VuZXNcbiAgY29uc3QgdG90YWxEdXJhdGlvbiA9IHVwZGF0ZWRTY2VuZXMucmVkdWNlKFxuICAgIChhY2MsIHNjZW5lKSA9PiBhY2MgKyBzY2VuZS5maWxlcy5kdXJhdGlvbixcbiAgICAwLFxuICApO1xuXG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdDogTWFuaWZlc3QgPSB7XG4gICAgLi4uZXhpc3RpbmdNYW5pZmVzdCxcbiAgICBzY2VuZXM6IHVwZGF0ZWRTY2VuZXMsXG4gICAgc2NlbmVDb3VudDogdXBkYXRlZFNjZW5lcy5sZW5ndGgsXG4gICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXG4gICAgdG90YWxEdXJhdGlvbixcbiAgfTtcblxuICBhd2FpdCB1cGxvYWRKc29uVG9TMyhKU09OLnN0cmluZ2lmeSh1cGRhdGVkTWFuaWZlc3QpLCBleGlzdGluZ01hbmlmZXN0LmtleSk7XG4gIHJldHVybiB1cGRhdGVkTWFuaWZlc3Q7XG59XG5cbi8vIGNyZWF0ZSBhIGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIHNpbmdsZSBtYW5pZmVzdCBzY2VuZSBmcm9tIGEgU2NlbmUgb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWFuaWZlc3RTY2VuZShcbiAgc2NlbmU6IFNjZW5lLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbik6IE1hbmlmZXN0U2NlbmUge1xuICByZXR1cm4ge1xuICAgIHNjZW5lUG9zaXRpb246IHNjZW5lUG9zaXRpb24sXG4gICAgcmVtb3ZlZDogZmFsc2UsXG4gICAgaWQ6IHNjZW5lLmlkLFxuICAgIGFuaW1hdGVkOiBzY2VuZS5hbmltYXRlZCB8fCBmYWxzZSxcbiAgICBmaWxlczoge1xuICAgICAgbXAzOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDNgLFxuICAgICAgbXA0OiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgLFxuICAgICAgY29tYmluZWQ6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LWNvbWJpbmVkLm1wNGAsXG4gICAgICBwbmc6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnBuZ2AsXG4gICAgICBzdWJ0aXRsZTogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmAsXG4gICAgICBhc3M6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LmFzc2AsXG4gICAgICBkdXJhdGlvbjogc2NlbmUuZHVyYXRpb24sXG4gICAgfSxcbiAgfTtcbn1cblxuLy8gY3JlYXRlIGEgZnVuY3Rpb24gdG8gaHlkcmF0ZSBzY2VuZXMgZnJvbSBtYW5pZmVzdFxuLy8gaXQgd2lsbCBhZGQgcHJlIHNpZ24gdXJsIHRvIHRoZSBzY2VuZXMgLnBuZywgLm1wMywgLm1wNFxuLy8gYW5kIGRvd25sb2FkIHRoZSBjb250ZW50IG9mIC5hc3MsIC5zdWJ0aXRsZS5qc29uIGZpbGVzXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaHlkcmF0ZU1hbmlmZXN0KFxuICBtYW5pZmVzdDogTWFuaWZlc3QgfCBudWxsLFxuKTogUHJvbWlzZTxNYW5pZmVzdCB8IG51bGw+IHtcbiAgaWYgKCFtYW5pZmVzdCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3Qgc2NlbmVzOiBNYW5pZmVzdFNjZW5lW10gPSBbXTtcblxuICBjb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcbiAgY29uc3QgZXhwaXJlc0luID0gMzYwMDA7XG4gIGNvbnN0IGJ1Y2tldFZpZGVvTmFtZSA9IHByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FIHx8ICcnO1xuICBjb25zdCBidWNrZXROYW1lID0gVklERU9fUEFSVFNfQlVDS0VUX05BTUU7XG5cbiAgLy8gZ2V0U2lnbmVkVXJsIG5ldmVyIGNoZWNrcyBvYmplY3QgZXhpc3RlbmNlIOKAlCBpdCdzIHB1cmUgY3J5cHRvLXNpZ25pbmcuXG4gIC8vIEEgc2NlbmUncyBmaWxlcy5tcDQga2V5IGlzIHdyaXR0ZW4gdG8gdGhlIG1hbmlmZXN0IGFzIHNvb24gYXMgdGhlIHZpZGVvXG4gIC8vIGlzICpwbGFubmVkKiAoY3JlYXRlTWFuaWZlc3QvY3JlYXRlTWFuaWZlc3RTY2VuZSksIGxvbmcgYmVmb3JlIHRoZVxuICAvLyBLZW4tQnVybnMgZWZmZWN0IGFjdHVhbGx5IHVwbG9hZHMgdGhhdCBvYmplY3QuIFdpdGhvdXQgdGhpcyBjaGVjaywgZXZlcnlcbiAgLy8gbWFuaWZlc3Qgc2VudCB0byB0aGUgZnJvbnRlbmQgYmVmb3JlIHRoYXQgdXBsb2FkIGZpbmlzaGVzIHdvdWxkIGNhcnJ5IGFcbiAgLy8gcGxhdXNpYmxlLWxvb2tpbmcgYnV0IDQwNCBtcDQgVVJMLiBMaXN0IHdoaWNoIG1wNHMgdHJ1bHkgZXhpc3Qgb25jZVxuICAvLyAoc2luZ2xlIFMzIGNhbGwgZm9yIGFsbCBzY2VuZXMpIHNvIHdlIGNhbiBvbWl0IHNpZ25lZCBVUkxzIGZvciB0aGUgcmVzdC5cbiAgY29uc3QgZXhpc3RpbmdNcDRLZXlzID0gYXdhaXQgbGlzdEV4aXN0aW5nU2NlbmVNcDRLZXlzKFxuICAgIG1hbmlmZXN0LnVzZXJJZCxcbiAgICBtYW5pZmVzdC50aW1lc3RhbXAsXG4gICk7XG5cbiAgZm9yIChjb25zdCBzY2VuZSBvZiBtYW5pZmVzdC5zY2VuZXMpIHtcbiAgICBjb25zdCBmaWxlcyA9IHNjZW5lLmZpbGVzO1xuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgZmlsZSBrZXlzIGJlZm9yZSBtYWtpbmcgUzMgcmVxdWVzdHNcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBIeWRyYXRpbmcgc2NlbmUgJHtzY2VuZS5zY2VuZVBvc2l0aW9ufSwgZmlsZXM6YCwgZmlsZXMpO1xuXG4gICAgY29uc3QgW2F1ZGlvVXJsLCB2aWRlb1VybCwgaW1hZ2VVcmwsIHN1YnRpdGxlQ29udGVudCwgYXNzQ29udGVudF0gPVxuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgQnVja2V0OiBidWNrZXROYW1lLFxuICAgICAgICAgICAgS2V5OiBmaWxlcy5tcDMsXG4gICAgICAgICAgfSksXG4gICAgICAgICAge1xuICAgICAgICAgICAgZXhwaXJlc0luLFxuICAgICAgICAgIH0sXG4gICAgICAgICksXG4gICAgICAgIGV4aXN0aW5nTXA0S2V5cy5oYXMoZmlsZXMubXA0KVxuICAgICAgICAgID8gZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgICAgICBzMyxcbiAgICAgICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldE5hbWUsIEtleTogZmlsZXMubXA0IH0pLFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZXhwaXJlc0luLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgKVxuICAgICAgICAgIDogUHJvbWlzZS5yZXNvbHZlKCcnKSxcbiAgICAgICAgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgIEJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgICAgICAgIEtleTogZmlsZXMucG5nIHx8IGZpbGVzLmpwZyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBleHBpcmVzSW4sXG4gICAgICAgICAgfSxcbiAgICAgICAgKSxcbiAgICAgICAgLy8gRmV0Y2ggaW5saW5lIHN1YnRpdGxlLmpzb24gY29udGVudFxuICAgICAgICBzM1xuICAgICAgICAgIC5zZW5kKFxuICAgICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldE5hbWUsIEtleTogZmlsZXMuc3VidGl0bGUgfSksXG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKGFzeW5jIChzdWJ0aXRsZU9iaikgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc3VidGl0bGVUZXh0ID0gYXdhaXQgc3VidGl0bGVPYmouQm9keT8udHJhbnNmb3JtVG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHBhcnNlZFN1YnRpdGxlID0gSlNPTi5wYXJzZShzdWJ0aXRsZVRleHQgfHwgJ3t9Jyk7XG4gICAgICAgICAgICAgIHJldHVybiBwYXJzZWRTdWJ0aXRsZS5mdWxsVGV4dCB8fCAnJztcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgIGDimqDvuI8gRmFpbGVkIHRvIGZldGNoIHN1YnRpdGxlIGZvciBzY2VuZSAke3NjZW5lLnNjZW5lUG9zaXRpb259OmAsXG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgIH0pLFxuICAgICAgICAvLyBGZXRjaCBpbmxpbmUgLmFzcyBjb250ZW50XG4gICAgICAgIHMzXG4gICAgICAgICAgLnNlbmQobmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldE5hbWUsIEtleTogZmlsZXMuYXNzIH0pKVxuICAgICAgICAgIC50aGVuKGFzeW5jIChhc3NPYmopID0+IHtcbiAgICAgICAgICAgIHJldHVybiAoYXdhaXQgYXNzT2JqLkJvZHk/LnRyYW5zZm9ybVRvU3RyaW5nKCkpIHx8IG51bGw7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgIGDimqDvuI8gRmFpbGVkIHRvIGZldGNoIGFzcyBmb3Igc2NlbmUgJHtzY2VuZS5zY2VuZVBvc2l0aW9ufTpgLFxuICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgIH0pLFxuICAgICAgXSk7XG5cbiAgICAvLyBjcmVhdGUgYSBzY2VuZSBvYmplY3RcbiAgICBjb25zdCBzY2VuZU9iamVjdDogTWFuaWZlc3RTY2VuZSA9IHtcbiAgICAgIHNjZW5lUG9zaXRpb246IHNjZW5lLnNjZW5lUG9zaXRpb24sXG4gICAgICBpZDogc2NlbmUuaWQsXG4gICAgICByZW1vdmVkOiBzY2VuZS5yZW1vdmVkIHx8IGZhbHNlLFxuICAgICAgYW5pbWF0ZWQ6IHNjZW5lLmFuaW1hdGVkIHx8IGZhbHNlLFxuICAgICAgZmlsZXM6IHtcbiAgICAgICAgbXAzOiBhdWRpb1VybCxcbiAgICAgICAgbXA0OiB2aWRlb1VybCxcbiAgICAgICAganBnOiBpbWFnZVVybCxcbiAgICAgICAgcG5nOiBpbWFnZVVybCxcbiAgICAgICAgYXNzOiBhc3NDb250ZW50IHx8ICcnLFxuICAgICAgICBzdWJ0aXRsZTogc3VidGl0bGVDb250ZW50IHx8ICcnLFxuICAgICAgICBkdXJhdGlvbjogc2NlbmUuZmlsZXMuZHVyYXRpb24sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBzY2VuZXMucHVzaChzY2VuZU9iamVjdCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIC4uLm1hbmlmZXN0LFxuICAgIHNjZW5lcyxcbiAgfTtcbn1cbiJdfQ==