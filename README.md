# BlueAgent V2

A minimal browser-based AI coding agent with an isolated Vercel Sandbox, terminal, GitHub public repo import, Git status/diff, live preview, responsive mobile UI, Arabic/English support, dark mode, and custom OpenAI-compatible providers.

## Files

```text
api/
  chat.js       AI agent + file/shell/git tools
  models.js     fetch/filter provider models
  sandbox.js    Vercel Sandbox, terminal, GitHub import, preview
index.html
main.jsx
style.css
package.json
README.md
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repository into Vercel.
3. Deploy. Vercel automatically provides Sandbox authentication in production.
4. For local Sandbox usage, install/login to Vercel CLI, run `vercel link`, then `vercel env pull .env` before using the Sandbox API.

```bash
npm install
npm run dev
```

## AI providers

Settings accepts a provider name, a base URL such as `https://api.openai.com/v1`, and an API key. BlueAgent expects OpenAI-compatible `GET /models` and `POST /chat/completions` endpoints with tool calling support.

The API key is stored in browser localStorage in this MVP. For a production multi-user service, move keys to encrypted server-side storage and add authentication.

## Sandbox features

- Persistent named Vercel Sandbox per browser project
- Browser files synced into `/vercel/sandbox/repo`
- Shell commands in the isolated microVM
- Git status and diff
- Public GitHub HTTPS clone
- Pull files back from Sandbox
- Dev-server preview through exposed ports 3000, 3001, 5173 and 8000
- AI tools: list/read/write/edit/delete/search files, run command, git status, git diff

## Important V2 limits

- GitHub import is public repositories only.
- There is no login/database yet, so projects/messages/provider keys are local to the browser.
- Provider compatibility depends on proper OpenAI-style tool calling.
- Do not treat localStorage as secure storage for production secrets.
