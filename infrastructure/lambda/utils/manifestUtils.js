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
const VIDEO_PARTS_BUCKET_NAME = process.env.VIDEO_PARTS_BUCKET_NAME || '';
async function createManifest(userId, timestamp, scenes, totalDuration, voiceToneInstruction, voice, language) {
    try {
        const prefix = `${userId}/${timestamp}.scene-`;
        const currentTime = Date.now().toString();
        const manifest = {
            schemaVersion: 1,
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
            scenes: scenes.map((scene, index) => ({
                id: scene.id,
                scenePosition: scene.id,
                removed: false,
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
            finalVideoUrl: `${userId}/${timestamp}-final-video.mp4`,
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
    const expiresIn = 3600; // 1 hour
    const bucketName = VIDEO_PARTS_BUCKET_NAME;
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
            (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({ Bucket: bucketName, Key: files.mp4 }), {
                expiresIn,
            }),
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
            removed: scene.removed,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuaWZlc3RVdGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmlmZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFRQSx3Q0E0REM7QUFFRCxrQ0FrQkM7QUFFRCx3Q0FZQztBQUdELGdEQStCQztBQUdELGtEQW9CQztBQUtELDBDQTJHQztBQTlRRCw2Q0FBK0Q7QUFFL0Qsd0VBQTZEO0FBQzdELGtEQUFnRTtBQUVoRSxNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLElBQUksRUFBRSxDQUFDO0FBRW5FLEtBQUssVUFBVSxjQUFjLENBQ2xDLE1BQWMsRUFDZCxTQUFpQixFQUNqQixNQUFlLEVBQ2YsYUFBcUIsRUFDckIsb0JBQTRCLEVBQzVCLEtBQWEsRUFDYixRQUFnQjtJQUVoQixJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLFNBQVMsQ0FBQztRQUMvQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFMUMsTUFBTSxRQUFRLEdBQWE7WUFDekIsYUFBYSxFQUFFLENBQUM7WUFDaEIsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsZ0JBQWdCO1lBQzNDLE1BQU07WUFDTixTQUFTO1lBQ1QsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQixNQUFNO1lBQ04sV0FBVyxFQUFFLFNBQVM7WUFDdEIsU0FBUyxFQUFFLFdBQVc7WUFDdEIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3pCLG9CQUFvQjtZQUNwQixLQUFLO1lBQ0wsUUFBUTtZQUNSLE1BQU0sRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDcEMsRUFBRSxFQUFFLEtBQUssQ0FBQyxFQUFFO2dCQUNaLGFBQWEsRUFBRSxLQUFLLENBQUMsRUFBRTtnQkFD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O2dCQUNiLEdBQUcsRUFBRSxRQUFRO2dCQUNiLEdBQUcsRUFBRSxVQUFVLElBQUksRUFBRTtnQkFDckIsUUFBUSxFQUFFLGVBQWUsSUFBSSxFQUFFO2dCQUMvQixRQUFRLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRO2FBQy9CO1NBQ0YsQ0FBQztRQUVGLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVELE9BQU87UUFDTCxHQUFHLFFBQVE7UUFDWCxNQUFNO0tBQ1AsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vbmFycmF0aW9uJztcbmltcG9ydCB7IHVwbG9hZEpzb25Ub1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QsIE1hbmlmZXN0U2NlbmUgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCB7IEdldE9iamVjdENvbW1hbmQsIFMzQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcblxuY29uc3QgVklERU9fUEFSVFNfQlVDS0VUX05BTUUgPSBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSB8fCAnJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZU1hbmlmZXN0KFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuICB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nLFxuICB2b2ljZTogc3RyaW5nLFxuICBsYW5ndWFnZTogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcmVmaXggPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS1gO1xuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKS50b1N0cmluZygpO1xuXG4gICAgY29uc3QgbWFuaWZlc3Q6IE1hbmlmZXN0ID0ge1xuICAgICAgc2NoZW1hVmVyc2lvbjogMSxcbiAgICAgIGtleTogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0ubWFuaWZlc3QuanNvbmAsXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBidWNrZXQ6IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgcHJlZml4LFxuICAgICAgZ2VuZXJhdGVkQXQ6IHRpbWVzdGFtcCxcbiAgICAgIHVwZGF0ZWRBdDogY3VycmVudFRpbWUsXG4gICAgICBzY2VuZUNvdW50OiBzY2VuZXMubGVuZ3RoLFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICB2b2ljZSxcbiAgICAgIGxhbmd1YWdlLFxuICAgICAgc2NlbmVzOiBzY2VuZXMubWFwKChzY2VuZSwgaW5kZXgpID0+ICh7XG4gICAgICAgIGlkOiBzY2VuZS5pZCxcbiAgICAgICAgc2NlbmVQb3NpdGlvbjogc2NlbmUuaWQsXG4gICAgICAgIHJlbW92ZWQ6IGZhbHNlLFxuICAgICAgICBmaWxlczoge1xuICAgICAgICAgIG1wMzogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXAzYCxcbiAgICAgICAgICBtcDQ6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGAsXG4gICAgICAgICAgY29tYmluZWQ6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LWNvbWJpbmVkLm1wNGAsXG4gICAgICAgICAgcG5nOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5wbmdgLFxuICAgICAgICAgIHN1YnRpdGxlOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5zdWJ0aXRsZS5qc29uYCxcbiAgICAgICAgICBhc3M6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LmFzc2AsXG4gICAgICAgICAgZHVyYXRpb246IHNjZW5lLmR1cmF0aW9uLFxuICAgICAgICB9LFxuICAgICAgfSkpLFxuICAgICAgdG90YWxEdXJhdGlvbixcbiAgICAgIGZpbmFsVmlkZW9Vcmw6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LWZpbmFsLXZpZGVvLm1wNGAsXG4gICAgICB2aWRlb0dlbmVyYXRlZDogZmFsc2UsXG4gICAgfTtcblxuICAgIC8vIENvbnZlcnQgbWFuaWZlc3QgdG8gSlNPTiBzdHJpbmdcbiAgICBjb25zdCBtYW5pZmVzdEpzb24gPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG5cbiAgICAvLyBVcGxvYWQgbWFuaWZlc3QgdG8gUzNcbiAgICBjb25zdCBtYW5pZmVzdEtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9Lm1hbmlmZXN0Lmpzb25gO1xuICAgIGNvbnN0IG1hbmlmZXN0VXJsID0gYXdhaXQgdXBsb2FkSnNvblRvUzMobWFuaWZlc3RKc29uLCBtYW5pZmVzdEtleSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+TiyBNYW5pZmVzdCBjcmVhdGVkIGFuZCB1cGxvYWRlZDonLCBtYW5pZmVzdEtleSk7XG4gICAgY29uc29sZS5sb2coJ/Cfk4sgTWFuaWZlc3QgVVJMOicsIG1hbmlmZXN0VXJsKTtcblxuICAgIHJldHVybiBtYW5pZmVzdFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY3JlYXRpbmcgbWFuaWZlc3Q6JywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSBtYW5pZmVzdDogJHtlcnJvcn1gKTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0TWFuaWZlc3QoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8TWFuaWZlc3QgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgbWFuaWZlc3RLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5tYW5pZmVzdC5qc29uYDtcblxuICAgIGNvbnN0IG1hbmlmZXN0RGF0YSA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhtYW5pZmVzdEtleSk7XG4gICAgaWYgKCFtYW5pZmVzdERhdGEpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIGdldE9iamVjdEZyb21TMyBhbHJlYWR5IHBhcnNlcyBKU09OLCBzbyB3ZSBjYW4gcmV0dXJuIGl0IGRpcmVjdGx5XG4gICAgcmV0dXJuIG1hbmlmZXN0RGF0YSBhcyBNYW5pZmVzdDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBtYW5pZmVzdDonLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZU1hbmlmZXN0KFxuICBleGlzdGluZ01hbmlmZXN0OiBNYW5pZmVzdCxcbiAgdXBkYXRlczogUGFydGlhbDxNYW5pZmVzdD4sXG4pOiBQcm9taXNlPE1hbmlmZXN0PiB7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdDogTWFuaWZlc3QgPSB7XG4gICAgLi4uZXhpc3RpbmdNYW5pZmVzdCxcbiAgICAuLi51cGRhdGVzLFxuICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICB9O1xuICBhd2FpdCB1cGxvYWRKc29uVG9TMyhKU09OLnN0cmluZ2lmeSh1cGRhdGVkTWFuaWZlc3QpLCBleGlzdGluZ01hbmlmZXN0LmtleSk7XG5cbiAgcmV0dXJuIHVwZGF0ZWRNYW5pZmVzdDtcbn1cblxuLy8gY3JlYXRlIGEgbmV3IHVwZGF0ZSBtYW5pZmVzdCB0aGF0IHdpbGwgcmVjZWl2ZSBtYW5pZmVzdCBrZXkgYW5kIGEgbmV3IHNjZW5lIG9iamVjdFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFkZFNjZW5lVG9NYW5pZmVzdChcbiAgZXhpc3RpbmdNYW5pZmVzdDogTWFuaWZlc3QsXG4gIHNjZW5lOiBNYW5pZmVzdFNjZW5lLFxuKTogUHJvbWlzZTxNYW5pZmVzdD4ge1xuICAvLyBDcmVhdGUgYSBjb3B5IG9mIGV4aXN0aW5nIHNjZW5lc1xuICBjb25zdCB1cGRhdGVkU2NlbmVzID0gWy4uLmV4aXN0aW5nTWFuaWZlc3Quc2NlbmVzXTtcblxuICAvLyBJbnNlcnQgdGhlIG5ldyBzY2VuZSBhdCB0aGUgY29ycmVjdCBwb3NpdGlvbiBiYXNlZCBvbiBzY2VuZVBvc2l0aW9uXG4gIHVwZGF0ZWRTY2VuZXMuc3BsaWNlKHNjZW5lLnNjZW5lUG9zaXRpb24sIDAsIHNjZW5lKTtcblxuICAvLyBidW1wIHVwIHNjZW5lUG9zaXRpb24gZm9yIGFsbCBzdWJzZXF1ZW50IHNjZW5lc1xuICBmb3IgKGxldCBpID0gc2NlbmUuc2NlbmVQb3NpdGlvbiArIDE7IGkgPCB1cGRhdGVkU2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgdXBkYXRlZFNjZW5lc1tpXS5zY2VuZVBvc2l0aW9uKys7XG4gIH1cblxuICAvLyByZWNhbGN1bGF0ZSB0b3RhbCBkdXJhdGlvbiBmcm9tIGFsbCBzY2VuZXNcbiAgY29uc3QgdG90YWxEdXJhdGlvbiA9IHVwZGF0ZWRTY2VuZXMucmVkdWNlKFxuICAgIChhY2MsIHNjZW5lKSA9PiBhY2MgKyBzY2VuZS5maWxlcy5kdXJhdGlvbixcbiAgICAwLFxuICApO1xuXG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdDogTWFuaWZlc3QgPSB7XG4gICAgLi4uZXhpc3RpbmdNYW5pZmVzdCxcbiAgICBzY2VuZXM6IHVwZGF0ZWRTY2VuZXMsXG4gICAgc2NlbmVDb3VudDogdXBkYXRlZFNjZW5lcy5sZW5ndGgsXG4gICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXG4gICAgdG90YWxEdXJhdGlvbixcbiAgfTtcblxuICBhd2FpdCB1cGxvYWRKc29uVG9TMyhKU09OLnN0cmluZ2lmeSh1cGRhdGVkTWFuaWZlc3QpLCBleGlzdGluZ01hbmlmZXN0LmtleSk7XG4gIHJldHVybiB1cGRhdGVkTWFuaWZlc3Q7XG59XG5cbi8vIGNyZWF0ZSBhIGZ1bmN0aW9uIHRvIGNyZWF0ZSBhIHNpbmdsZSBtYW5pZmVzdCBzY2VuZSBmcm9tIGEgU2NlbmUgb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWFuaWZlc3RTY2VuZShcbiAgc2NlbmU6IFNjZW5lLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbik6IE1hbmlmZXN0U2NlbmUge1xuICByZXR1cm4ge1xuICAgIHNjZW5lUG9zaXRpb246IHNjZW5lUG9zaXRpb24sXG4gICAgcmVtb3ZlZDogZmFsc2UsXG4gICAgaWQ6IHNjZW5lLmlkLFxuICAgIGZpbGVzOiB7XG4gICAgICBtcDM6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2AsXG4gICAgICBtcDQ6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGAsXG4gICAgICBjb21iaW5lZDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0tY29tYmluZWQubXA0YCxcbiAgICAgIHBuZzogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYCxcbiAgICAgIHN1YnRpdGxlOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5zdWJ0aXRsZS5qc29uYCxcbiAgICAgIGFzczogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uYXNzYCxcbiAgICAgIGR1cmF0aW9uOiBzY2VuZS5kdXJhdGlvbixcbiAgICB9LFxuICB9O1xufVxuXG4vLyBjcmVhdGUgYSBmdW5jdGlvbiB0byBoeWRyYXRlIHNjZW5lcyBmcm9tIG1hbmlmZXN0XG4vLyBpdCB3aWxsIGFkZCBwcmUgc2lnbiB1cmwgdG8gdGhlIHNjZW5lcyAucG5nLCAubXAzLCAubXA0XG4vLyBhbmQgZG93bmxvYWQgdGhlIGNvbnRlbnQgb2YgLmFzcywgLnN1YnRpdGxlLmpzb24gZmlsZXNcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoeWRyYXRlTWFuaWZlc3QoXG4gIG1hbmlmZXN0OiBNYW5pZmVzdCB8IG51bGwsXG4pOiBQcm9taXNlPE1hbmlmZXN0IHwgbnVsbD4ge1xuICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBzY2VuZXM6IE1hbmlmZXN0U2NlbmVbXSA9IFtdO1xuXG4gIGNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuICBjb25zdCBleHBpcmVzSW4gPSAzNjAwOyAvLyAxIGhvdXJcbiAgY29uc3QgYnVja2V0TmFtZSA9IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FO1xuXG4gIGZvciAoY29uc3Qgc2NlbmUgb2YgbWFuaWZlc3Quc2NlbmVzKSB7XG4gICAgY29uc3QgZmlsZXMgPSBzY2VuZS5maWxlcztcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGZpbGUga2V5cyBiZWZvcmUgbWFraW5nIFMzIHJlcXVlc3RzXG4gICAgY29uc29sZS5sb2coYPCflI0gSHlkcmF0aW5nIHNjZW5lICR7c2NlbmUuc2NlbmVQb3NpdGlvbn0sIGZpbGVzOmAsIGZpbGVzKTtcblxuICAgIGNvbnN0IFthdWRpb1VybCwgdmlkZW9VcmwsIGltYWdlVXJsLCBzdWJ0aXRsZUNvbnRlbnQsIGFzc0NvbnRlbnRdID1cbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgIEJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgICAgICAgIEtleTogZmlsZXMubXAzLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldE5hbWUsIEtleTogZmlsZXMubXA0IH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgQnVja2V0OiBidWNrZXROYW1lLFxuICAgICAgICAgICAgS2V5OiBmaWxlcy5wbmcgfHwgZmlsZXMuanBnLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICAvLyBGZXRjaCBpbmxpbmUgc3VidGl0bGUuanNvbiBjb250ZW50XG4gICAgICAgIHMzXG4gICAgICAgICAgLnNlbmQoXG4gICAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5zdWJ0aXRsZSB9KSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKHN1YnRpdGxlT2JqKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdWJ0aXRsZVRleHQgPSBhd2FpdCBzdWJ0aXRsZU9iai5Cb2R5Py50cmFuc2Zvcm1Ub1N0cmluZygpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgcGFyc2VkU3VidGl0bGUgPSBKU09OLnBhcnNlKHN1YnRpdGxlVGV4dCB8fCAne30nKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlZFN1YnRpdGxlLmZ1bGxUZXh0IHx8ICcnO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYOKaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggc3VidGl0bGUgZm9yIHNjZW5lICR7c2NlbmUuc2NlbmVQb3NpdGlvbn06YCxcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgfSksXG4gICAgICAgIC8vIEZldGNoIGlubGluZSAuYXNzIGNvbnRlbnRcbiAgICAgICAgczNcbiAgICAgICAgICAuc2VuZChuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5hc3MgfSkpXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKGFzc09iaikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChhd2FpdCBhc3NPYmouQm9keT8udHJhbnNmb3JtVG9TdHJpbmcoKSkgfHwgbnVsbDtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYOKaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggYXNzIGZvciBzY2VuZSAke3NjZW5lLnNjZW5lUG9zaXRpb259OmAsXG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgfSksXG4gICAgICBdKTtcblxuICAgIC8vIGNyZWF0ZSBhIHNjZW5lIG9iamVjdFxuICAgIGNvbnN0IHNjZW5lT2JqZWN0OiBNYW5pZmVzdFNjZW5lID0ge1xuICAgICAgc2NlbmVQb3NpdGlvbjogc2NlbmUuc2NlbmVQb3NpdGlvbixcbiAgICAgIGlkOiBzY2VuZS5pZCxcbiAgICAgIHJlbW92ZWQ6IHNjZW5lLnJlbW92ZWQsXG4gICAgICBmaWxlczoge1xuICAgICAgICBtcDM6IGF1ZGlvVXJsLFxuICAgICAgICBtcDQ6IHZpZGVvVXJsLFxuICAgICAgICBqcGc6IGltYWdlVXJsLFxuICAgICAgICBwbmc6IGltYWdlVXJsLFxuICAgICAgICBhc3M6IGFzc0NvbnRlbnQgfHwgJycsXG4gICAgICAgIHN1YnRpdGxlOiBzdWJ0aXRsZUNvbnRlbnQgfHwgJycsXG4gICAgICAgIGR1cmF0aW9uOiBzY2VuZS5maWxlcy5kdXJhdGlvbixcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIHNjZW5lcy5wdXNoKHNjZW5lT2JqZWN0KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLi4ubWFuaWZlc3QsXG4gICAgc2NlbmVzLFxuICB9O1xufVxuIl19