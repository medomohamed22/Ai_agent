<div align="left">

# 🤖 AiWay — Your AI Assistant in Arabic

A fully **Arabic AI chat interface** running from a **single file** (`index.html`) — no server, no build step, no complicated setup. Open the file in your browser and start chatting.

---

## ✨ Key Features

### 💬 Complete Arabic Chat Experience
- Fully **RTL interface** with the elegant IBM Plex Sans Arabic typeface
- **Dark / light mode** 🌙☀️
- **Streaming responses** with a stop button
- Rich **Markdown rendering**: headings, links, task lists ✅, and file trees 📁

### 🔌 Works With Any AI Provider
Supports any **OpenAI-compatible API**, with ready-made presets for the most popular providers:

| Provider | Base URL |
|---|---|
| OpenAI | `api.openai.com/v1` |
| OpenRouter | `openrouter.ai/api/v1` |
| Groq | `api.groq.com/openai/v1` |
| Gemini | `generativelanguage.googleapis.com/v1beta/openai` |
| ➕ Custom provider | Any URL you set yourself |

- 🔑 Per-provider API key management
- 📋 Fetch the model list automatically from the provider
- ⚙️ Full generation controls: `temperature`, `topP`, `max_tokens`

### 🧑‍💻 Two Smart Modes: Chat & Coding
- **Chat mode** 💬 — a general assistant that speaks clearly, precisely, and politely
- **Coding mode** 👨‍💻 — an expert coding assistant working inside a real file workspace, replying in your language
- Each mode has its own **Rules** (system prompt) and **Skills**, sent to the model only when that mode is active

### 🛠️ Built-in Skills & Tools
- A **text-based tool protocol**: the model calls tools by writing an exact text block
- Built-in tools: `web_search` 🔍, `open_page` 🌐, `load_skill` 📚
- A ready library of Arabic skills, including:
  - Creating/writing files • searching files • inserting lines
  - Running & testing code • debugging 🐞 • UI development 🎨
  - Security & performance 🔒 • testing & docs 📝 • research & sources
  - Analysis & decision-making 📊 • teaching & explanations 🎓 • writing & translation ✍️
- ➕ Add your own custom skills from the settings panel

### 🔍 Real Web Search
Direct integration with search providers — paste your key and enable search from the chat:

| Provider |
|---|
| **Jina** |
| **Exa** |
| **Tavily** |

### 🎙️ Full Voice: Input & Output
- **Voice input** with two engines:
  - 🌐 Browser — instant and free
  - 🤖 **Whisper** via your provider — most accurate for Arabic & English
- 🗣️ Languages: Auto (Arabic + English) • Arabic (Egypt 🇪🇬) • Arabic (Saudi 🇸🇦) • English
- 🔊 **Read replies aloud** (TTS) with playback-rate control (0.8× to 1.5×)

### 📎 Smart Attachments
- Attach **images** 🖼️ and **text/code files** (`.txt` `.md` `.js` `.py` `.html` `.css` `.json` `.csv` `.sql` and more)

### 📊 Full Transparency on Usage
- **Token counter**: input (with cache-hit ⚡ percentage) and output
- 💰 **Cost tracking** per conversation
- 🩺 **Diagnostics log** recording recent errors and events for easier troubleshooting

### 💾 Your Data Stays Yours
- Conversations and settings auto-saved in your browser (localStorage)
- 📤 Full **import / export** of settings and skills as JSON
- 🔄 Safe reset button for each section

### 📦 One File — Zero Complexity
- Everything (styling + logic + icons) lives **inside `index.html`** — no build, no server
- Works straight from GitHub Pages or any static file host 🚀

---

## 🚀 Getting Started

1. Open `index.html` in your browser
2. From settings ⚙️, add a provider and paste your API key
3. Fetch the models, pick yours — and start chatting 💬

---

## 📄 Docs

- [FEATURES.md](FEATURES.md) — feature overview in Arabic 🇪🇬

---

<p align="center">Made with ❤️ — AiWay</p>

</div>
