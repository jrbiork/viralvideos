---
description: End-to-end browser test of the video creation, websocket-update, and scene-editing flow
---

Drive a full end-to-end test of the video creation flow through the Browser pane. Use the preview/browser tools (preview_start, navigate, computer, read_page, find, read_console_messages, read_network_requests) — do not just read code. Take screenshots at key checkpoints and report what you observe at the end.

If `.claude/launch.json` has no config for this project, create one for `npm run dev` on the Next.js default port before starting.

## Steps

1. **Open `/create`.** Start the dev server, navigate to `/create`.

2. **Enter a random topic.** Type a short random video idea (3–5 words) into the script textarea (placeholder "Write your idea here...").

3. **Click Enhance.** Click the "✨ Enhance your idea with AI" button and wait for it to finish (button text changes from "Enhancing..." back to normal, or the textarea content changes).

4. **Choose an image style.** Open the "Image Style" dropdown (`ImageTemplateSelection`) and pick any template.

5. **Choose a voice.** Open the "Voice" dropdown (`VoiceSelection`) and pick any voice.

6. **Click "Generate Preview Scenes".** Click it, then immediately move on — do NOT wait for scene generation to complete. This triggers `POST /api/generate-video` and a websocket connection.

7. **Go to `/videos`.** Navigate to the videos gallery page without waiting for step 6 to finish generating. Confirm that:
   - the websocket connection is live (check console/network for the socket, or watch for state updates),
   - the new video eventually appears/updates in the gallery via the websocket `preview_completed` event (`VideoGallery`'s `addVideoFromManifest`),
   - a toaster notification appears (e.g. "Video scenes generated!"). Screenshot the toaster when it fires.
   Poll/wait for this rather than assuming — give it a reasonable amount of time (up to ~2 minutes), checking periodically.

8. **Edit the new video.** Click "Edit" on the newly created video's card. This navigates to `/create?timestamp=<ts>&step=2` and loads the scene cards.

9. **Add 3 scenes in random positions.** Use the dashed "+" `AddSceneButton` controls between/before/after existing scenes — pick 3 different random insertion points.

10. **Remove 2 existing (original, not the ones you just added) scenes.** Use the delete icon (`title="Delete Scene"`) on two original scene cards. Confirm they show the "Restore scene" undo state rather than disappearing outright.

11. **Change images on at least one scene.** Click the pencil "Edit" overlay on a scene thumbnail, opening `ImageEditModal`. Enter a short description, click "Generate image", wait for the result, then click "Use this image".

12. **Change narration on at least one scene.** Double-click a scene's narration text to enter edit mode, change the text, and click "Save".

13. **Save / apply changes.** Click the "Apply changes (N)" sidebar button to submit the batched edits (`POST /api/apply-edits`). Wait for the `preview_completed` websocket event to clear the pending edits.

14. **Check the result.** Verify via `read_page`/screenshot that: the 2 removed scenes are gone (or marked removed), the 3 new scenes are present, the edited image and narration changes are reflected, and there are no console errors or failed network requests.

## Reporting

At the end, give a concise pass/fail summary per step (1–14), including:
- any console errors or failed network/websocket requests seen along the way,
- whether the toaster and websocket-driven gallery update actually fired (step 7) — this is the trickiest part and worth calling out explicitly if it didn't work,
- screenshots/evidence for the final edited scene state.

If any step fails, stop, investigate the root cause (read relevant source under `components/`, `hooks/`, `app/create/page.tsx`, `app/videos/page.tsx`), and report the likely cause rather than guessing.
