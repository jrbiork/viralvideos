const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({ region: 'us-east-1' });

async function testVideoGeneration() {
  const testEvent = {
    prompt: 'A peaceful meditation scene by the ocean',
    userId: 'test-user-123',
    timestamp: new Date().toISOString(),
    duration: 10,
    sceneCount: 1,
  };

  try {
    console.log('🧪 Testing video generation...');
    console.log('📝 Test event:', JSON.stringify(testEvent, null, 2));

    const command = new InvokeCommand({
      FunctionName:
        'ViralVideosStack-VideoGenerationLambdaDF5A13BD-j0N55Vm56T4T',
      Payload: JSON.stringify(testEvent),
    });

    const response = await lambda.send(command);

    console.log('📊 Response status:', response.StatusCode);

    if (response.Payload) {
      const payload = JSON.parse(Buffer.from(response.Payload).toString());
      console.log('📄 Response payload:', JSON.stringify(payload, null, 2));
    }

    if (response.LogResult) {
      console.log(
        '📋 Logs:',
        Buffer.from(response.LogResult, 'base64').toString(),
      );
    }
  } catch (error) {
    console.error('❌ Error testing Lambda:', error);
  }
}

testVideoGeneration();
