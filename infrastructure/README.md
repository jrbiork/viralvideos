# Viral Videos Infrastructure

This directory contains the AWS CDK infrastructure for the Viral Videos MVP.

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**

   ```bash
   npm run setup
   ```

   This will create a `.env` file from the template. Edit it and add your actual API keys:

   - `RUNWAY_API_KEY` - Your Runway API key
   - `OPENAI_API_KEY` - Your OpenAI API key

3. **Build the project:**
   ```bash
   npm run build
   ```

## Deployment

Deploy the infrastructure to AWS:

```bash
npm run deploy
```

This will create:

- S3 bucket for storing videos
- Lambda function for video generation
- IAM roles and permissions
- CloudWatch log groups

## Environment Variables

The Lambda function will receive these environment variables:

- `VIDEO_BUCKET_NAME` - Automatically set by CDK
- `RUNWAY_API_KEY` - From your `.env` file
- `OPENAI_API_KEY` - From your `.env` file

## Cleanup

To destroy the infrastructure:

```bash
npm run destroy
```

## Files

- `lib/viral-videos-stack.ts` - Main CDK stack definition
- `env.template` - Template for environment variables
- `setup-env.sh` - Setup script for environment variables
- `deploy.sh` - Alternative deployment script (optional)
