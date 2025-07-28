# Viral Videos MVP - Setup Guide

## 🚀 Quick Start

This guide will help you get the Viral Videos MVP running on your local machine.

### Prerequisites

- Node.js 18.12.0+ (we're using 18.12.0 which works with Next.js 13.5.6)
- npm or yarn
- AWS CLI configured with appropriate permissions
- Runway API key
- OpenAI API key

### 1. Install Dependencies

```bash
# Install main application dependencies
npm install

# Install infrastructure dependencies
cd infrastructure
npm install

# Install Lambda function dependencies
cd lambda/video-generation
npm install
cd ../../..
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp env.example .env.local

# Edit .env.local with your actual values
```

Update `.env.local` with:

- Your AWS region
- Your Runway API key
- Your OpenAI API key
- (After deployment) The actual Lambda ARN and S3 bucket name

### 3. Deploy AWS Infrastructure

```bash
cd infrastructure

# Build the CDK project
npm run build

# Deploy to AWS (requires AWS CLI configured)
npm run deploy
```

This will create:

- S3 bucket for video storage
- Lambda function for video generation
- IAM roles and policies
- CloudWatch log groups

### 4. Update Environment Variables

After deployment, update your `.env.local` with the actual values from the CDK output:

```bash
cd ..
# Update .env.local with the actual ARNs from CDK output
```

### 5. Start the Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to use the application.

## 🏗️ Architecture Overview

### Frontend (Next.js 13.5.6)

- **Framework**: Next.js with App Router
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **TypeScript**: Full type safety

### Backend (AWS)

- **Lambda**: Serverless video generation
- **S3**: Video and asset storage
- **CDK**: Infrastructure as Code

### External APIs

- **Runway Gen-3**: AI video generation
- **OpenAI TTS**: Text-to-speech narration
- **OpenAI GPT-4**: Story breakdown and scene generation

## 📁 Project Structure

```
viralvideos/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── generate-video/ # Video generation endpoint
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
│       └── video-generation/
│           ├── index.ts   # Main Lambda handler
│           └── package.json
├── package.json          # Main dependencies
├── env.example           # Environment variables template
└── README.md            # Comprehensive documentation
```

## 🔧 Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint

# Deploy infrastructure
cd infrastructure && npm run deploy

# Destroy infrastructure
cd infrastructure && npm run destroy
```

## 🎯 Features Implemented

✅ **Modern UI**: Beautiful, responsive interface with Tailwind CSS
✅ **Video Generation Form**: User-friendly prompt input
✅ **API Integration**: Ready for Runway and OpenAI APIs
✅ **AWS Infrastructure**: Complete CDK setup with S3 and Lambda
✅ **Video Preview**: Player component for generated videos
✅ **Environment Configuration**: Proper setup for different environments

## 🚧 Next Steps

1. **Add API Keys**: Get Runway and OpenAI API keys
2. **Deploy Infrastructure**: Run CDK deployment
3. **Test Video Generation**: Try the full pipeline
4. **Add Error Handling**: Improve error messages and retry logic
5. **Add Authentication**: User management system
6. **Add Video Processing**: Implement FFmpeg for video editing
7. **Add Subtitles**: Generate and overlay SRT files
8. **Add Progress Tracking**: Real-time generation status

## 🐛 Troubleshooting

### Common Issues

1. **Node.js Version**: Make sure you're using Node.js 18.12.0+
2. **API Keys**: Ensure Runway and OpenAI API keys are valid
3. **AWS Permissions**: Verify AWS CLI has appropriate permissions
4. **Port Conflicts**: Make sure port 3000 is available

### Debug Commands

```bash
# Check Node.js version
node --version

# Check if server is running
curl http://localhost:3000

# Check AWS credentials
aws sts get-caller-identity

# View Lambda logs
aws logs tail /aws/lambda/ViralVideosStack-VideoGenerationLambda
```

## 📝 Environment Variables

| Variable                      | Description               | Required |
| ----------------------------- | ------------------------- | -------- |
| `AWS_REGION`                  | AWS region for deployment | Yes      |
| `VIDEO_GENERATION_LAMBDA_ARN` | Lambda function ARN       | Yes      |
| `VIDEO_BUCKET_NAME`           | S3 bucket name            | Yes      |
| `RUNWAY_API_KEY`              | Runway Gen-3 API key      | Yes      |
| `OPENAI_API_KEY`              | OpenAI API key            | Yes      |

## 🎉 Success!

Once everything is set up, you should be able to:

1. Visit `http://localhost:3000`
2. Enter a video prompt
3. Click "Generate Video"
4. Wait for AI processing
5. Download your 60-second vertical video

The application is now ready for development and testing!
