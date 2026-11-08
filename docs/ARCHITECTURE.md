# RikyTech AI Studio — Architecture

## Product goal
A Spanish-first production workspace for short-form documentary videos. The same product serves mobile browsers as an installable PWA and Android through a Capacitor shell.

## Delivery strategy
Start with a responsive client-side foundation, then add a secure backend and media-processing workers. Do not put provider API keys in the browser or Android app.

## Monorepo structure
- `apps/web`: React + TypeScript + Vite responsive PWA.
- `apps/android`: Capacitor Android wrapper around the web build (introduced after the PWA stabilizes).
- `packages/core`: shared domain types and workflow logic (future extraction).
- `docs`: architecture, security, roadmap and provider decisions.

## Core workflow
1. Project brief and factual research.
2. Script editor with hook, development and closing.
3. Scene planner: split narration into numbered scenes with visual prompts. Default visual direction: cinematic photorealism; distinguish authentic archival material from AI-generated historical reconstructions in every scene.
4. Asset library: generated/imported images, narration audio, music and clips.
5. Timeline and assembly: scene order, duration, transitions, captions and audio.
6. Export presets: vertical 9:16 Shorts/Reels/TikTok and horizontal 16:9.

## Proposed stack
- Frontend: React, TypeScript, Vite.
- UI: accessible responsive CSS; mobile-first.
- Installability: Web App Manifest + service worker/PWA.
- Android: Capacitor wrapping the same web application.
- Backend: not required for the current local-first workflow. Supabase Auth, Postgres and Storage can be added later for accounts and cloud sync.
- Media processing (phase 3): server-side jobs/FFmpeg worker; never assume a phone can render long videos reliably.
- AI providers: provider adapter layer so models can be changed; keys remain server-side.

## Visual documentary policy
- Default art direction: cinematic photorealistic photography, with natural-looking light, believable materials, camera-like framing and historical detail.
- Prefer authentic photographs, archives, artifacts and documents when available and relevant.
- Use clearly labeled photorealistic AI reconstructions when no authentic visual record exists or when illustrating a past scene.
- Never describe or present AI-generated reconstructions as authentic historical photographs or archival evidence.
- Avoid illustration, cartoon and videogame-render aesthetics unless a project explicitly requests a different style.
- Default short-form canvas: vertical 9:16.

## Security and privacy
- Never commit API keys, tokens, passwords, or private media.
- Use environment variables and server-side secret storage.
- Keep user projects private by default.
- Require explicit confirmation before publishing, spending credits, or deleting assets.
- Treat generated scripts and imported files as untrusted content.

## Milestones
- M0: architecture and responsive starter workspace.
- M1: project and script CRUD with local persistence; default visual identity and documentary image-authenticity policy.
- M2: scene breakdown and asset management. The initial scene planner stores editable narration segments, visual descriptions, image provenance/type, prompts and estimated durations locally.
- M3: backend authentication and cloud project sync.
- M4: provider integrations. Current image workflow hands prompts to Google Flow in the browser; the user generates with Nano Banana under Google's own daily quotas and imports the resulting files. No unofficial Flow API or browser automation is used.
- M5: timeline assembly, captions and export.
- M6: Android packaging, testing and release.

## Current scope
The current client-side increment supports project/script management, editable scene planning, and per-scene image import with IndexedDB persistence on the current device. It copies each scene prompt and opens Google Flow for user-driven image generation. Flow has no public official API for direct prompt submission from this app. Cloud sync and video export are not implemented. Imported scene images are local to the browser/device and are not backed up or synchronized. Those capabilities will be added in separate, testable milestones.
