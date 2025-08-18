"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const script_1 = require("./script");
const handler = async (event) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
        };
        if (event.httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers,
                body: '',
            };
        }
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' }),
            };
        }
        if (!event.body) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Request body is required' }),
            };
        }
        const request = JSON.parse(event.body);
        if (!request.prompt || request.prompt.trim() === '') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Prompt is required' }),
            };
        }
        const sceneCount = request.sceneCount || 3;
        const totalDuration = request.totalDuration || 30;
        const sceneDuration = Math.floor(totalDuration / sceneCount);
        if (sceneCount < 1 || sceneCount > 10) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Scene count must be between 1 and 10' }),
            };
        }
        if (totalDuration < 10 || totalDuration > 60) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Total duration must be between 10 and 60 seconds',
                }),
            };
        }
        console.log('🎬 Generating story breakdown...');
        console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
        console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
        const storyBreakdown = await (0, script_1.generateStoryBreakdown)(request.prompt, sceneCount, sceneDuration, totalDuration);
        const { scenes, voiceToneInstruction } = storyBreakdown;
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to generate story breakdown' }),
            };
        }
        console.log('✅ Story breakdown generated successfully');
        console.log(`📝 Generated ${scenes.length} scenes`);
        const response = {
            scenes,
            voiceToneInstruction,
            sceneCount,
            totalDuration,
            sceneDuration,
        };
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error('❌ Error in generate-story-breakdown lambda:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
