"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAudioFilesForTimestamp = fetchAudioFilesForTimestamp;
exports.getAudioSignedUrl = getAudioSignedUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
async function fetchAudioFilesForTimestamp(userId, timestamp) {
    try {
        console.log(`🔍 Fetching audio files for user: ${userId}, timestamp: ${timestamp}`);
        const listCommand = new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
        });
        const response = await s3.send(listCommand);
        if (!response.Contents || response.Contents.length === 0) {
            console.log('📭 No audio files found for the given timestamp');
            return { audioKeys: [], subtitles: [] };
        }
        const audioObjects = response.Contents.filter((obj) => obj.Key?.endsWith('.mp3')).sort((a, b) => {
            const sceneA = parseInt(a.Key?.split('scene-')[1]?.split('.')[0] || '0');
            const sceneB = parseInt(b.Key?.split('scene-')[1]?.split('.')[0] || '0');
            return sceneA - sceneB;
        });
        console.log(`✅ Found ${audioObjects.length} audio files:`, audioObjects.map((obj) => obj.Key));
        const audioKeys = [];
        const subtitles = [];
        for (const audioObj of audioObjects) {
            if (!audioObj.Key)
                continue;
            const audioKey = audioObj.Key;
            audioKeys.push(audioKey);
            const sceneMatch = audioKey.match(/scene-(\d+)\.mp3$/);
            const sceneIndex = sceneMatch ? parseInt(sceneMatch[1]) : 0;
            const subtitleKey = audioKey.replace('.mp3', '.subtitles.json');
            try {
                const subtitleCommand = new client_s3_1.GetObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: subtitleKey,
                });
                const subtitleResponse = await s3.send(subtitleCommand);
                if (subtitleResponse.Body) {
                    const subtitleContent = await subtitleResponse.Body.transformToString();
                    const subtitleData = JSON.parse(subtitleContent);
                    subtitles.push({
                        sceneIndex,
                        words: subtitleData.words || [],
                        fullText: subtitleData.fullText || '',
                    });
                    console.log(`✅ Found subtitle data for scene ${sceneIndex}`);
                }
            }
            catch (error) {
                console.log(`⚠️ No subtitle data found for scene ${sceneIndex}, creating fallback`);
                subtitles.push({
                    sceneIndex,
                    words: [],
                    fullText: '',
                });
            }
        }
        console.log(`✅ Fetched ${audioKeys.length} audio files and ${subtitles.length} subtitle sets`);
        return { audioKeys, subtitles };
    }
    catch (error) {
        console.error('❌ Error fetching audio files from S3:', error);
        return { audioKeys: [], subtitles: [] };
    }
}
async function getAudioSignedUrl(audioKey) {
    try {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: audioKey,
        });
        return await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
    }
    catch (error) {
        console.error(`❌ Error getting signed URL for ${audioKey}:`, error);
        return null;
    }
}
