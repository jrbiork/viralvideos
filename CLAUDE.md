# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend
npm run dev        # Start Next.js dev server (sets AWS_PROFILE=rubens)
npm run build      # Build for production
npm run lint       # Run ESLint

# Infrastructure
cd infrastructure && ./deploy.sh          # Build + bundle + deploy all Lambda + CDK stack
cd infrastructure && ./bundle-lambda.sh   # Bundle a specific Lambda function
cd infrastructure && ./package-lambda.sh  # Package Lambda for deployment
```

> Always use `./deploy.sh` to deploy — never raw `cdk deploy` without pre-built Lambdas.

## Architecture

### Frontend (Next.js 14 App Router)

- `app/` — pages and API routes. Protected routes: `/create`, `/videos`, `/debug` (enforced in `middleware.ts` via Cognito cookie)
- `components/` — React components. Key ones: `VideoCreator.tsx` (orchestrates scene creation), `EditScene.tsx` (per-scene editing), `VideoGallery.tsx` (lists user videos), `AuthContext.tsx` (Cognito auth state), `WebSocketContext.tsx` (real-time progress)
- `hooks/` — `useUserCredits.ts`, `useToaster.tsx`
- `lib/` — `auth-utils.ts` (JWT + Cognito verification), `stripe-config.ts`

### API Routes (`app/api/`)

Each folder maps to an endpoint. Auth is handled server-side via the Cognito cookie (`viral-videos-cognito-token`). JWT tokens contain only `sub` and `username` fields — do not expect other fields.

### Lambda Functions (`infrastructure/lambda/`)

All Lambdas share `infrastructure/tsconfig.json` and `infrastructure/package.json` — **do not create separate ones per Lambda**.

Key Lambdas:
- `video-generation/` — SQS-triggered; processes scenes with FFmpeg (15min timeout, 3GB RAM)
- `video-queue/` — queues generation requests to SQS
- `websocket-{connect,disconnect,message,broadcast}/` — API Gateway WebSocket handlers
- `jwt-authorizer/` — API Gateway Lambda authorizer (do not re-verify JWT in Lambda handlers)
- `upsert-user/` — creates/updates user in DynamoDB on first login

Shared utilities in `infrastructure/lambda/utils/`:
- `videoCombiner.ts` — FFmpeg-based scene concatenation with subtitles
- `videoEffects.ts` — FFmpeg filters
- `audio.ts` / `audioUtils.ts` — OpenAI TTS and audio processing
- `image.ts` / `imageNanoBanana.ts` — Gemini image generation
- `manifestUtils.ts` — reads/writes the S3 manifest JSON that tracks scene state
- `credits.ts` — DynamoDB credit management
- `broadcastProgress.ts` — sends progress updates via WebSocket

### Data Model

The **manifest** (`infrastructure/lambda/types/s3Types.ts`) is the central state object for a video project. It tracks all scenes (`ManifestScene[]`), their associated S3 file keys (mp3, mp4, jpg, subtitles), and final video status. It is stored in S3 and mutated throughout the generation pipeline.

### Video Generation Flow

```
User prompt → /api/generate-video → video-queue Lambda → SQS
                                                           ↓
User (WebSocket updates) ← websocket-broadcast ← video-generation Lambda
                                                     (FFmpeg combines scenes → S3)
```

### Infrastructure

AWS CDK stack in `infrastructure/lib/viral-videos-stack.ts`. Resources:
- S3: two buckets (final videos + video parts, both private with pre-signed URL access)
- DynamoDB: `viral-videos-users` table + WebSocket connections table
- SQS: `video-generation-queue` with DLQ (max 3 retries, 15min visibility timeout)
- API Gateway: REST API (JWT-authorized) + WebSocket API

## Key Constraints

- **JWT authorizer**: already validates the token at API Gateway. Do not re-verify inside Lambda handlers.
- **Lambda config**: all Lambdas share the `infrastructure/` tsconfig and package.json.
- **Auth token fields**: only `sub` and `username` are available in the JWT payload.
- **FFmpeg layer**: binaries at `/opt/bin/ffmpeg`; fonts embedded; Lambda needs 3GB memory.
- **Stripe webhooks**: local testing via `stripe listen --forward-to localhost:3000/api/stripe/webhook`
