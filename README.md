# Viral Videos MVP

A web-based MVP that generates 60-second vertical videos for TikTok and Instagram Reels using AI-powered video generation, narration, and subtitles.

## Features

- **AI Video Generation**: Uses Runway Gen-3 API to create 10-second video clips
- **AI Narration**: OpenAI TTS API for natural voice narration
- **Story Breakdown**: GPT-4 automatically breaks down prompts into scenes
- **Vertical Format**: Optimized for 1080×1920 resolution (TikTok/Instagram)
- **S3 Storage**: Secure video storage with pre-signed URLs
- **Modern UI**: Beautiful, responsive interface built with Next.js and Tailwind CSS

## Architecture

### Frontend

- **Next.js 14**: React framework with App Router
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Type-safe development
- **Lucide React**: Modern icon library

### Backend

- **AWS Lambda**: Serverless video generation
- **Amazon S3**: Video and asset storage
- **AWS CDK**: Infrastructure as Code
- **Runway Gen-3 API**: AI video generation
- **OpenAI API**: TTS and GPT-4 for story breakdown

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate permissions
- Runway API key
- OpenAI API key

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd viralvideos
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and update with your values:

```bash
cp env.example .env.local
```

Update `.env.local` with your actual API keys and AWS configuration.

### 3. Deploy AWS Infrastructure

```bash
cd infrastructure
npm install
npm run build
npm run deploy
```

This will create:

- S3 bucket for video storage
- Lambda function for video generation
- IAM roles and policies
- CloudWatch log groups

### 4. Update Environment Variables

After deployment, update your `.env.local` with the actual ARNs from the CDK output:

```bash
cd ..
# Update .env.local with the actual values from CDK output
```

### 5. Run the Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to use the application.

## Usage

1. **Enter a Prompt**: Describe your video content in detail
2. **Generate Video**: Click "Generate Video" to start the process
3. **Wait for Processing**: The AI will create scenes, narration, and combine them
4. **Download Result**: Get your 60-second vertical video ready for social media

## API Endpoints

### POST /api/generate-video

Generates a video from a text prompt.

**Request Body:**

```json
{
  "prompt": "A beautiful sunset over the ocean with gentle waves"
}
```

**Response:**

```json
{
  "videoUrl": "https://s3.amazonaws.com/...",
  "videoKey": "videos/user-id/timestamp/final-video.mp4",
  "message": "Video generated successfully"
}
```

## Development

### Project Structure

```
viralvideos/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── VideoGenerator.tsx # Video generation form
│   └── VideoPreview.tsx   # Video player component
├── infrastructure/        # AWS CDK infrastructure
│   ├── bin/              # CDK app entry point
│   ├── lib/              # CDK stack definitions
│   └── lambda/           # Lambda function code
└── package.json          # Dependencies and scripts
```

### Available Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint
- `cd infrastructure && npm run deploy`: Deploy AWS infrastructure
- `cd infrastructure && npm run destroy`: Destroy AWS infrastructure

## Environment Variables

| Variable                      | Description               | Required |
| ----------------------------- | ------------------------- | -------- |
| `AWS_REGION`                  | AWS region for deployment | Yes      |
| `VIDEO_GENERATION_LAMBDA_ARN` | Lambda function ARN       | Yes      |
| `VIDEO_BUCKET_NAME`           | S3 bucket name            | Yes      |
| `RUNWAY_API_KEY`              | Runway Gen-3 API key      | Yes      |
| `OPENAI_API_KEY`              | OpenAI API key            | Yes      |

## Deployment

### Frontend Deployment

The Next.js app can be deployed to Vercel, Netlify, or any other hosting platform.

### Backend Deployment

The AWS infrastructure is deployed using CDK:

```bash
cd infrastructure
npm run deploy
```

## Security Considerations

- API keys are stored as environment variables
- S3 bucket has public access blocked
- Lambda function has minimal required permissions
- Videos are served via pre-signed URLs with expiration

## Cost Optimization

- S3 lifecycle policies automatically delete old videos
- Lambda timeout is set to 15 minutes maximum
- CloudWatch logs are retained for 1 week only

## Troubleshooting

### Common Issues

1. **Lambda Timeout**: Increase timeout in CDK stack
2. **S3 Permission Errors**: Check IAM roles and policies
3. **API Key Errors**: Verify environment variables are set correctly
4. **Video Generation Fails**: Check CloudWatch logs for Lambda errors

### Debugging

- Check CloudWatch logs for Lambda function errors
- Verify API keys are valid and have sufficient credits
- Ensure AWS credentials are properly configured

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
