"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManifest = createManifest;
exports.getManifest = getManifest;
exports.updateManifest = updateManifest;
exports.addSceneToManifest = addSceneToManifest;
exports.hydrateManifest = hydrateManifest;
const s3Uploader_1 = require("./s3Uploader");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const client_s3_1 = require("@aws-sdk/client-s3");
const VIDEO_PARTS_BUCKET_NAME = process.env.VIDEO_PARTS_BUCKET_NAME || '';
async function createManifest(userId, timestamp, scenes, totalDuration) {
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
            scenes: scenes.map((scene, index) => ({
                sceneIndex: scene.id,
                files: {
                    mp3: `${userId}/${timestamp}.scene-${scene.id}.mp3`,
                    mp4: `${userId}/${timestamp}.scene-${scene.id}.mp4`,
                    combined: `${userId}/${timestamp}.scene-${scene.id}-combined.mp4`,
                    png: `${userId}/${timestamp}.scene-${scene.id}.png`,
                    subtitle: `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`,
                    ass: `${userId}/${timestamp}.scene-${scene.id}.ass`,
                },
            })),
            totalDuration,
            finalVideoUrl: `${userId}/${timestamp}.final-video.mp4`,
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
    const updatedManifest = {
        ...existingManifest,
        scenes: [...existingManifest.scenes, scene],
    };
    await (0, s3Uploader_1.uploadJsonToS3)(JSON.stringify(updatedManifest), existingManifest.key);
    return updatedManifest;
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
        console.log(`🔍 Hydrating scene ${scene.sceneIndex}, files:`, files);
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
                console.warn(`⚠️ Failed to fetch subtitle for scene ${scene.sceneIndex}:`, error.message);
                return '';
            }),
            // Fetch inline .ass content
            s3
                .send(new client_s3_1.GetObjectCommand({ Bucket: bucketName, Key: files.ass }))
                .then(async (assObj) => {
                return (await assObj.Body?.transformToString()) || null;
            })
                .catch((error) => {
                console.warn(`⚠️ Failed to fetch ass for scene ${scene.sceneIndex}:`, error.message);
                return null;
            }),
        ]);
        // create a scene object
        const sceneObject = {
            sceneIndex: scene.sceneIndex,
            files: {
                mp3: audioUrl,
                mp4: videoUrl,
                jpg: imageUrl,
                png: imageUrl,
                ass: assContent || '',
                subtitle: subtitleContent || '',
            },
        };
        scenes.push(sceneObject);
    }
    return {
        ...manifest,
        scenes,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuaWZlc3RVdGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmlmZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFRQSx3Q0FtREM7QUFFRCxrQ0FrQkM7QUFFRCx3Q0FZQztBQUdELGdEQVVDO0FBS0QsMENBd0dDO0FBdE5ELDZDQUErRDtBQUUvRCx3RUFBNkQ7QUFDN0Qsa0RBQWdFO0FBRWhFLE1BQU0sdUJBQXVCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsSUFBSSxFQUFFLENBQUM7QUFFbkUsS0FBSyxVQUFVLGNBQWMsQ0FDbEMsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLE1BQWUsRUFDZixhQUFxQjtJQUVyQixJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLFNBQVMsQ0FBQztRQUMvQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFMUMsTUFBTSxRQUFRLEdBQWE7WUFDekIsYUFBYSxFQUFFLENBQUM7WUFDaEIsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsZ0JBQWdCO1lBQzNDLE1BQU07WUFDTixTQUFTO1lBQ1QsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQixNQUFNO1lBQ04sV0FBVyxFQUFFLFNBQVM7WUFDdEIsU0FBUyxFQUFFLFdBQVc7WUFDdEIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3pCLE1BQU0sRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLEtBQUssQ0FBQyxFQUFFO2dCQUNwQixLQUFLLEVBQUU7b0JBQ0wsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsVUFBVSxLQUFLLENBQUMsRUFBRSxNQUFNO29CQUNuRCxHQUFHLEVBQUUsR0FBRyxNQUFNLElBQUksU0FBUyxV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QztpQkFDbEUsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDckIsT0FBTyxDQUFDLE1BQU0sTUFBTSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDO1lBQzFELENBQUMsQ0FBQztpQkFDRCxLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDZixPQUFPLENBQUMsSUFBSSxDQUNWLG9DQUFvQyxLQUFLLENBQUMsVUFBVSxHQUFHLEVBQ3ZELEtBQUssQ0FBQyxPQUFPLENBQ2QsQ0FBQztnQkFDRixPQUFPLElBQUksQ0FBQztZQUNkLENBQUMsQ0FBQztTQUNMLENBQUMsQ0FBQztRQUVMLHdCQUF3QjtRQUN4QixNQUFNLFdBQVcsR0FBa0I7WUFDakMsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO1lBQzVCLEtBQUssRUFBRTtnQkFDTCxHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsUUFBUTtnQkFDYixHQUFHLEVBQUUsVUFBVSxJQUFJLEVBQUU7Z0JBQ3JCLFFBQVEsRUFBRSxlQUFlLElBQUksRUFBRTthQUNoQztTQUNGLENBQUM7UUFFRixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxPQUFPO1FBQ0wsR0FBRyxRQUFRO1FBQ1gsTUFBTTtLQUNQLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL25hcnJhdGlvbic7XG5pbXBvcnQgeyB1cGxvYWRKc29uVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi9zM1VwbG9hZGVyJztcbmltcG9ydCB7IE1hbmlmZXN0LCBNYW5pZmVzdFNjZW5lIH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgeyBHZXRPYmplY3RDb21tYW5kLCBTM0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmNvbnN0IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FID0gcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUgfHwgJyc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVNYW5pZmVzdChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzY2VuZXM6IFNjZW5lW10sXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJlZml4ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYDtcbiAgICBjb25zdCBjdXJyZW50VGltZSA9IERhdGUubm93KCkudG9TdHJpbmcoKTtcblxuICAgIGNvbnN0IG1hbmlmZXN0OiBNYW5pZmVzdCA9IHtcbiAgICAgIHNjaGVtYVZlcnNpb246IDEsXG4gICAgICBrZXk6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9Lm1hbmlmZXN0Lmpzb25gLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgYnVja2V0OiBWSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIHByZWZpeCxcbiAgICAgIGdlbmVyYXRlZEF0OiB0aW1lc3RhbXAsXG4gICAgICB1cGRhdGVkQXQ6IGN1cnJlbnRUaW1lLFxuICAgICAgc2NlbmVDb3VudDogc2NlbmVzLmxlbmd0aCxcbiAgICAgIHNjZW5lczogc2NlbmVzLm1hcCgoc2NlbmUsIGluZGV4KSA9PiAoe1xuICAgICAgICBzY2VuZUluZGV4OiBzY2VuZS5pZCxcbiAgICAgICAgZmlsZXM6IHtcbiAgICAgICAgICBtcDM6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2AsXG4gICAgICAgICAgbXA0OiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgLFxuICAgICAgICAgIGNvbWJpbmVkOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS1jb21iaW5lZC5tcDRgLFxuICAgICAgICAgIHBuZzogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYCxcbiAgICAgICAgICBzdWJ0aXRsZTogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmAsXG4gICAgICAgICAgYXNzOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5hc3NgLFxuICAgICAgICB9LFxuICAgICAgfSkpLFxuICAgICAgdG90YWxEdXJhdGlvbixcbiAgICAgIGZpbmFsVmlkZW9Vcmw6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LmZpbmFsLXZpZGVvLm1wNGAsXG4gICAgICB2aWRlb0dlbmVyYXRlZDogZmFsc2UsXG4gICAgfTtcblxuICAgIC8vIENvbnZlcnQgbWFuaWZlc3QgdG8gSlNPTiBzdHJpbmdcbiAgICBjb25zdCBtYW5pZmVzdEpzb24gPSBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMik7XG5cbiAgICAvLyBVcGxvYWQgbWFuaWZlc3QgdG8gUzNcbiAgICBjb25zdCBtYW5pZmVzdEtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9Lm1hbmlmZXN0Lmpzb25gO1xuICAgIGNvbnN0IG1hbmlmZXN0VXJsID0gYXdhaXQgdXBsb2FkSnNvblRvUzMobWFuaWZlc3RKc29uLCBtYW5pZmVzdEtleSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+TiyBNYW5pZmVzdCBjcmVhdGVkIGFuZCB1cGxvYWRlZDonLCBtYW5pZmVzdEtleSk7XG4gICAgY29uc29sZS5sb2coJ/Cfk4sgTWFuaWZlc3QgVVJMOicsIG1hbmlmZXN0VXJsKTtcblxuICAgIHJldHVybiBtYW5pZmVzdFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY3JlYXRpbmcgbWFuaWZlc3Q6JywgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSBtYW5pZmVzdDogJHtlcnJvcn1gKTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0TWFuaWZlc3QoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8TWFuaWZlc3QgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgbWFuaWZlc3RLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5tYW5pZmVzdC5qc29uYDtcblxuICAgIGNvbnN0IG1hbmlmZXN0RGF0YSA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhtYW5pZmVzdEtleSk7XG4gICAgaWYgKCFtYW5pZmVzdERhdGEpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIGdldE9iamVjdEZyb21TMyBhbHJlYWR5IHBhcnNlcyBKU09OLCBzbyB3ZSBjYW4gcmV0dXJuIGl0IGRpcmVjdGx5XG4gICAgcmV0dXJuIG1hbmlmZXN0RGF0YSBhcyBNYW5pZmVzdDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBtYW5pZmVzdDonLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZU1hbmlmZXN0KFxuICBleGlzdGluZ01hbmlmZXN0OiBNYW5pZmVzdCxcbiAgdXBkYXRlczogUGFydGlhbDxNYW5pZmVzdD4sXG4pOiBQcm9taXNlPE1hbmlmZXN0PiB7XG4gIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdDogTWFuaWZlc3QgPSB7XG4gICAgLi4uZXhpc3RpbmdNYW5pZmVzdCxcbiAgICAuLi51cGRhdGVzLFxuICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICB9O1xuICBhd2FpdCB1cGxvYWRKc29uVG9TMyhKU09OLnN0cmluZ2lmeSh1cGRhdGVkTWFuaWZlc3QpLCBleGlzdGluZ01hbmlmZXN0LmtleSk7XG5cbiAgcmV0dXJuIHVwZGF0ZWRNYW5pZmVzdDtcbn1cblxuLy8gY3JlYXRlIGEgbmV3IHVwZGF0ZSBtYW5pZmVzdCB0aGF0IHdpbGwgcmVjZWl2ZSBtYW5pZmVzdCBrZXkgYW5kIGEgbmV3IHNjZW5lIG9iamVjdFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFkZFNjZW5lVG9NYW5pZmVzdChcbiAgZXhpc3RpbmdNYW5pZmVzdDogTWFuaWZlc3QsXG4gIHNjZW5lOiBNYW5pZmVzdFNjZW5lLFxuKTogUHJvbWlzZTxNYW5pZmVzdD4ge1xuICBjb25zdCB1cGRhdGVkTWFuaWZlc3Q6IE1hbmlmZXN0ID0ge1xuICAgIC4uLmV4aXN0aW5nTWFuaWZlc3QsXG4gICAgc2NlbmVzOiBbLi4uZXhpc3RpbmdNYW5pZmVzdC5zY2VuZXMsIHNjZW5lXSxcbiAgfTtcbiAgYXdhaXQgdXBsb2FkSnNvblRvUzMoSlNPTi5zdHJpbmdpZnkodXBkYXRlZE1hbmlmZXN0KSwgZXhpc3RpbmdNYW5pZmVzdC5rZXkpO1xuICByZXR1cm4gdXBkYXRlZE1hbmlmZXN0O1xufVxuXG4vLyBjcmVhdGUgYSBmdW5jdGlvbiB0byBoeWRyYXRlIHNjZW5lcyBmcm9tIG1hbmlmZXN0XG4vLyBpdCB3aWxsIGFkZCBwcmUgc2lnbiB1cmwgdG8gdGhlIHNjZW5lcyAucG5nLCAubXAzLCAubXA0XG4vLyBhbmQgZG93bmxvYWQgdGhlIGNvbnRlbnQgb2YgLmFzcywgLnN1YnRpdGxlLmpzb24gZmlsZXNcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoeWRyYXRlTWFuaWZlc3QoXG4gIG1hbmlmZXN0OiBNYW5pZmVzdCB8IG51bGwsXG4pOiBQcm9taXNlPE1hbmlmZXN0IHwgbnVsbD4ge1xuICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBzY2VuZXM6IE1hbmlmZXN0U2NlbmVbXSA9IFtdO1xuXG4gIGNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuICBjb25zdCBleHBpcmVzSW4gPSAzNjAwOyAvLyAxIGhvdXJcbiAgY29uc3QgYnVja2V0TmFtZSA9IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FO1xuXG4gIGZvciAoY29uc3Qgc2NlbmUgb2YgbWFuaWZlc3Quc2NlbmVzKSB7XG4gICAgY29uc3QgZmlsZXMgPSBzY2VuZS5maWxlcztcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGZpbGUga2V5cyBiZWZvcmUgbWFraW5nIFMzIHJlcXVlc3RzXG4gICAgY29uc29sZS5sb2coYPCflI0gSHlkcmF0aW5nIHNjZW5lICR7c2NlbmUuc2NlbmVJbmRleH0sIGZpbGVzOmAsIGZpbGVzKTtcblxuICAgIGNvbnN0IFthdWRpb1VybCwgdmlkZW9VcmwsIGltYWdlVXJsLCBzdWJ0aXRsZUNvbnRlbnQsIGFzc0NvbnRlbnRdID1cbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgIEJ1Y2tldDogYnVja2V0TmFtZSxcbiAgICAgICAgICAgIEtleTogZmlsZXMubXAzLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoeyBCdWNrZXQ6IGJ1Y2tldE5hbWUsIEtleTogZmlsZXMubXA0IH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgQnVja2V0OiBidWNrZXROYW1lLFxuICAgICAgICAgICAgS2V5OiBmaWxlcy5wbmcgfHwgZmlsZXMuanBnLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGV4cGlyZXNJbixcbiAgICAgICAgICB9LFxuICAgICAgICApLFxuICAgICAgICAvLyBGZXRjaCBpbmxpbmUgc3VidGl0bGUuanNvbiBjb250ZW50XG4gICAgICAgIHMzXG4gICAgICAgICAgLnNlbmQoXG4gICAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5zdWJ0aXRsZSB9KSxcbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKHN1YnRpdGxlT2JqKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdWJ0aXRsZVRleHQgPSBhd2FpdCBzdWJ0aXRsZU9iai5Cb2R5Py50cmFuc2Zvcm1Ub1N0cmluZygpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgcGFyc2VkU3VidGl0bGUgPSBKU09OLnBhcnNlKHN1YnRpdGxlVGV4dCB8fCAne30nKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlZFN1YnRpdGxlLmZ1bGxUZXh0IHx8ICcnO1xuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYOKaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggc3VidGl0bGUgZm9yIHNjZW5lICR7c2NlbmUuc2NlbmVJbmRleH06YCxcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgfSksXG4gICAgICAgIC8vIEZldGNoIGlubGluZSAuYXNzIGNvbnRlbnRcbiAgICAgICAgczNcbiAgICAgICAgICAuc2VuZChuZXcgR2V0T2JqZWN0Q29tbWFuZCh7IEJ1Y2tldDogYnVja2V0TmFtZSwgS2V5OiBmaWxlcy5hc3MgfSkpXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKGFzc09iaikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChhd2FpdCBhc3NPYmouQm9keT8udHJhbnNmb3JtVG9TdHJpbmcoKSkgfHwgbnVsbDtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYOKaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggYXNzIGZvciBzY2VuZSAke3NjZW5lLnNjZW5lSW5kZXh9OmAsXG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgfSksXG4gICAgICBdKTtcblxuICAgIC8vIGNyZWF0ZSBhIHNjZW5lIG9iamVjdFxuICAgIGNvbnN0IHNjZW5lT2JqZWN0OiBNYW5pZmVzdFNjZW5lID0ge1xuICAgICAgc2NlbmVJbmRleDogc2NlbmUuc2NlbmVJbmRleCxcbiAgICAgIGZpbGVzOiB7XG4gICAgICAgIG1wMzogYXVkaW9VcmwsXG4gICAgICAgIG1wNDogdmlkZW9VcmwsXG4gICAgICAgIGpwZzogaW1hZ2VVcmwsXG4gICAgICAgIHBuZzogaW1hZ2VVcmwsXG4gICAgICAgIGFzczogYXNzQ29udGVudCB8fCAnJyxcbiAgICAgICAgc3VidGl0bGU6IHN1YnRpdGxlQ29udGVudCB8fCAnJyxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIHNjZW5lcy5wdXNoKHNjZW5lT2JqZWN0KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgLi4ubWFuaWZlc3QsXG4gICAgc2NlbmVzLFxuICB9O1xufVxuIl19