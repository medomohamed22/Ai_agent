# Code Surgeon MVP

A mobile-friendly AI coding agent for **surgical file editing**. It keeps source files outside the model context by default and exposes tools that let the model inspect, search, read small ranges, apply exact patches, validate, and review diffs.

## Stack

- Next.js App Router + TypeScript
- Vercel AI SDK v7
- Vercel AI Gateway **or** any OpenAI-compatible provider URL
- Browser-local provider settings; custom API keys live in `sessionStorage`
- No database required for this MVP

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Gateway mode

Set:

```env
AI_GATEWAY_API_KEY=...
```

Then enter a Gateway model ID in Settings, for example a model available to your Vercel AI Gateway account.

### Custom OpenAI-compatible mode

In the UI choose **Custom URL** and enter:

- Provider name
- Base URL, e.g. `https://openrouter.ai/api/v1`
- Model ID
- API key

The key is kept in `sessionStorage`, not persistent `localStorage`, and is forwarded only to your `/api/chat` server route per request.

## Deploy to Vercel

1. Push this folder to a GitHub repository/branch.
2. Import the repository into Vercel.
3. Keep Framework Preset = Next.js.
4. If using Gateway mode, add `AI_GATEWAY_API_KEY` in Project Settings → Environment Variables.
5. Deploy.

Vercel will automatically redeploy when you push to the connected branch.

## Agent flow

```text
User request
  → inspectWorkspace
  → searchFile
  → readFileRange
  → applyPatch
  → validateFile
  → getDiff
  → updated file returned by API
```

The complete file is not injected into the prompt. It exists in a temporary server-side `Workspace` object for that request. Tools reveal only targeted snippets to the model.

## MVP limits

- Up to 20 files/request and 400 KB/file (adjust in `app/api/chat/route.ts`).
- Validation is structural, not a full compiler/test runner.
- Files are kept in React state; persistence to IndexedDB is a recommended next step.
- Custom-provider keys pass through your Vercel function. For a public multi-user production app, add authentication, rate limiting, encrypted secret handling, CSP, audit logs, and provider allow-listing.

## Recommended next milestone

1. IndexedDB project persistence.
2. Monaco Editor + true side-by-side diff.
3. AST-aware edits for TypeScript/JavaScript.
4. ESLint/TypeScript validation in Vercel Sandbox.
5. Zip/folder upload and project-wide symbol search.
6. Undo/redo patch history.
7. Streaming chat UI and tool activity cards.
