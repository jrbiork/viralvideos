"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitles = generateSubtitles;
const client_s3_1 = require("@aws-sdk/client-s3");
const assUtils_1 = require("./util/assUtils");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateSubtitles(scenes, userId, timestamp, subtitleData) {
    console.log('📝 Generating ASS subtitles with word-timed karaoke...');
    try {
        const subtitleKeys = [];
        let currentTime = 0;
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let assContent;
            const sceneSubtitleData = subtitleData?.find((data) => data.sceneIndex === i);
            if (sceneSubtitleData && sceneSubtitleData.words.length > 0) {
                console.log(`🎤 Creating word-timed karaoke subtitle for scene ${i} with ${sceneSubtitleData.words.length} words`);
                assContent = (0, assUtils_1.createWordTimedKaraokeASSSubtitle)(sceneSubtitleData.words, currentTime);
            }
            else {
                console.log(`📝 Creating simple subtitle for scene ${i} (no word data available)`);
                assContent = createSimpleASSSubtitle(i + 1, currentTime, scene.duration, scene.narration);
            }
            const assSubtitleBuffer = Buffer.from(assContent, 'utf-8');
            const assSubtitleKey = `${userId}/${timestamp}.scene-${i}.ass`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: assSubtitleKey,
                Body: assSubtitleBuffer,
                ContentType: 'text/plain',
            }));
            subtitleKeys.push(assSubtitleKey);
            currentTime += scene.duration;
        }
        return subtitleKeys;
    }
    catch (error) {
        console.error('❌ Error in generateSubtitles:', error);
        throw error;
    }
}
function createSimpleASSSubtitle(index, startTime, duration, text) {
    const assContent = (0, assUtils_1.createASSStyleHeader)();
    const startTimeFormatted = (0, assUtils_1.formatASSTime)(startTime);
    const endTimeFormatted = (0, assUtils_1.formatASSTime)(startTime + duration);
    const subtitleText = text || `Scene ${index + 1}`;
    return (assContent +
        `Dialogue: 0,${startTimeFormatted},${endTimeFormatted},Default,,0,0,0,,${subtitleText}\n`);
}
