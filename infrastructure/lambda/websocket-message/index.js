"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const handler = async (event) => {
    console.log('WebSocket message event:', JSON.stringify(event, null, 2));
    const connectionId = event.requestContext.connectionId;
    const messageBody = event.body || '{}';
    try {
        // Parse the incoming message
        const message = JSON.parse(messageBody);
        console.log('Received message:', message);
        // Handle different message types
        switch (message.action) {
            case 'ping':
                return await sendMessage(connectionId, {
                    action: 'pong',
                    timestamp: new Date().toISOString(),
                }, event);
            default:
                return await sendMessage(connectionId, {
                    action: 'error',
                    message: 'Unknown action',
                }, event);
        }
    }
    catch (error) {
        console.error('Error processing message:', error);
        return await sendMessage(connectionId, {
            action: 'error',
            message: 'Error processing message',
        }, event);
    }
};
exports.handler = handler;
async function sendMessage(connectionId, message, event) {
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const endpoint = `https://${domainName}/${stage}`;
    const apiGateway = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({ endpoint });
    try {
        await apiGateway.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(message),
        }));
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Message sent successfully' }),
        };
    }
    catch (error) {
        console.error('Error sending message:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error sending message' }),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw0RkFHaUQ7QUFFMUMsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUV4RSxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFlBQWEsQ0FBQztJQUN4RCxNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQztJQUV2QyxJQUFJLENBQUM7UUFDSCw2QkFBNkI7UUFDN0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRTFDLGlDQUFpQztRQUNqQyxRQUFRLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN2QixLQUFLLE1BQU07Z0JBQ1QsT0FBTyxNQUFNLFdBQVcsQ0FDdEIsWUFBWSxFQUNaO29CQUNFLE1BQU0sRUFBRSxNQUFNO29CQUNkLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtpQkFDcEMsRUFDRCxLQUFLLENBQ04sQ0FBQztZQUVKO2dCQUNFLE9BQU8sTUFBTSxXQUFXLENBQ3RCLFlBQVksRUFDWjtvQkFDRSxNQUFNLEVBQUUsT0FBTztvQkFDZixPQUFPLEVBQUUsZ0JBQWdCO2lCQUMxQixFQUNELEtBQUssQ0FDTixDQUFDO1FBQ04sQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRCxPQUFPLE1BQU0sV0FBVyxDQUN0QixZQUFZLEVBQ1o7WUFDRSxNQUFNLEVBQUUsT0FBTztZQUNmLE9BQU8sRUFBRSwwQkFBMEI7U0FDcEMsRUFDRCxLQUFLLENBQ04sQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUE5Q1csUUFBQSxPQUFPLFdBOENsQjtBQUVGLEtBQUssVUFBVSxXQUFXLENBQ3hCLFlBQW9CLEVBQ3BCLE9BQVksRUFDWixLQUEyQjtJQUUzQixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVcsQ0FBQztJQUNwRCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLEtBQU0sQ0FBQztJQUMxQyxNQUFNLFFBQVEsR0FBRyxXQUFXLFVBQVUsSUFBSSxLQUFLLEVBQUUsQ0FBQztJQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLDhEQUE2QixDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUVuRSxJQUFJLENBQUM7UUFDSCxNQUFNLFVBQVUsQ0FBQyxJQUFJLENBQ25CLElBQUksd0RBQXVCLENBQUM7WUFDMUIsWUFBWSxFQUFFLFlBQVk7WUFDMUIsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO1NBQzlCLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQztTQUMvRCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLENBQUM7U0FDM0QsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHtcbiAgQXBpR2F0ZXdheU1hbmFnZW1lbnRBcGlDbGllbnQsXG4gIFBvc3RUb0Nvbm5lY3Rpb25Db21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtYXBpZ2F0ZXdheW1hbmFnZW1lbnRhcGknO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ1dlYlNvY2tldCBtZXNzYWdlIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgY29ubmVjdGlvbklkID0gZXZlbnQucmVxdWVzdENvbnRleHQuY29ubmVjdGlvbklkITtcbiAgY29uc3QgbWVzc2FnZUJvZHkgPSBldmVudC5ib2R5IHx8ICd7fSc7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSB0aGUgaW5jb21pbmcgbWVzc2FnZVxuICAgIGNvbnN0IG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VCb2R5KTtcbiAgICBjb25zb2xlLmxvZygnUmVjZWl2ZWQgbWVzc2FnZTonLCBtZXNzYWdlKTtcblxuICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgbWVzc2FnZSB0eXBlc1xuICAgIHN3aXRjaCAobWVzc2FnZS5hY3Rpb24pIHtcbiAgICAgIGNhc2UgJ3BpbmcnOlxuICAgICAgICByZXR1cm4gYXdhaXQgc2VuZE1lc3NhZ2UoXG4gICAgICAgICAgY29ubmVjdGlvbklkLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGFjdGlvbjogJ3BvbmcnLFxuICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgfSxcbiAgICAgICAgICBldmVudCxcbiAgICAgICAgKTtcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIGF3YWl0IHNlbmRNZXNzYWdlKFxuICAgICAgICAgIGNvbm5lY3Rpb25JZCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBhY3Rpb246ICdlcnJvcicsXG4gICAgICAgICAgICBtZXNzYWdlOiAnVW5rbm93biBhY3Rpb24nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgZXZlbnQsXG4gICAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgcmV0dXJuIGF3YWl0IHNlbmRNZXNzYWdlKFxuICAgICAgY29ubmVjdGlvbklkLFxuICAgICAge1xuICAgICAgICBhY3Rpb246ICdlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdFcnJvciBwcm9jZXNzaW5nIG1lc3NhZ2UnLFxuICAgICAgfSxcbiAgICAgIGV2ZW50LFxuICAgICk7XG4gIH1cbn07XG5cbmFzeW5jIGZ1bmN0aW9uIHNlbmRNZXNzYWdlKFxuICBjb25uZWN0aW9uSWQ6IHN0cmluZyxcbiAgbWVzc2FnZTogYW55LFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4ge1xuICBjb25zdCBkb21haW5OYW1lID0gZXZlbnQucmVxdWVzdENvbnRleHQuZG9tYWluTmFtZSE7XG4gIGNvbnN0IHN0YWdlID0gZXZlbnQucmVxdWVzdENvbnRleHQuc3RhZ2UhO1xuICBjb25zdCBlbmRwb2ludCA9IGBodHRwczovLyR7ZG9tYWluTmFtZX0vJHtzdGFnZX1gO1xuICBjb25zdCBhcGlHYXRld2F5ID0gbmV3IEFwaUdhdGV3YXlNYW5hZ2VtZW50QXBpQ2xpZW50KHsgZW5kcG9pbnQgfSk7XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBhcGlHYXRld2F5LnNlbmQoXG4gICAgICBuZXcgUG9zdFRvQ29ubmVjdGlvbkNvbW1hbmQoe1xuICAgICAgICBDb25uZWN0aW9uSWQ6IGNvbm5lY3Rpb25JZCxcbiAgICAgICAgRGF0YTogSlNPTi5zdHJpbmdpZnkobWVzc2FnZSksXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ01lc3NhZ2Ugc2VudCBzdWNjZXNzZnVsbHknIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2VuZGluZyBtZXNzYWdlOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnRXJyb3Igc2VuZGluZyBtZXNzYWdlJyB9KSxcbiAgICB9O1xuICB9XG59XG4iXX0=