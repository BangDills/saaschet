# SaaSchet — AI-Powered SaaS Platform

Modern AI SaaS platform built with **Next.js 16**, **React 19**, **Tailwind CSS v4**, and **Vercel AI SDK**. Features an AI coding agent with GitHub integration, live sandbox execution, multi-model support, and a full dashboard with auth.

## ✨ Features

### AI Chat & Agent Mode
- **Multi-model chat** — DeepSeek V4 Pro, DeepSeek 4 Flash, Kimi K2.5/K2.6, GLM 5
- **Free model** — DeepSeek V4 Flash via OpenCode (no payment required)
- **Automatic Agent Mode** — models with tool-calling auto-enable agent tools when a repo is connected
- **GitHub integration** — read, write, edit, search code, create branches & PRs
- **Live sandbox** — Daytona-powered sandboxes (8 CPU, 8GB RAM) for running code
- **Batch file writes** — write multiple files in a single tool call
- **Web search** — Tavily-powered in-chat web search toggle
- **Context7 docs** — up-to-date library/framework documentation tools in chat and Agent Mode
- **Serena semantic tools** — optional MCP-powered symbol/references lookup for Agent Mode
- **Streaming** — real-time tool call streaming with context trimming
- **Kimi compat** — automatic SSE stream patching for Kimi K2.x tool calling

### Dashboard
- KPI stat cards (Credits Used, Total Users, Credits Available, Plan)
- Area chart (daily credit usage, last 30 days)
- Bar chart (monthly credit usage)
- Users table with pagination
- Light / Dark mode toggle
- Fully responsive (mobile drawer)

### Auth & Infrastructure
- Supabase authentication (email/password, OAuth)
- Chat history persistence (conversations stored in Supabase)
- Credits system with usage tracking
- Row Level Security (RLS) on all tables

## 🛠 Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + custom design tokens |
| AI SDK | Vercel AI SDK v6 (`ai`, `@ai-sdk/openai`) |
| Inference | DigitalOcean Serverless Inference (OpenAI-compatible) |
| Free Models | OpenCode Zen API |
| Sandbox | Daytona SDK (ephemeral containers) |
| Auth & DB | Supabase (Postgres + Auth + RLS) |
| Web Search | Tavily AI |
| Docs Lookup | Context7 API |
| Code Intelligence | Serena MCP |
| Icons | lucide-react |
| Charts | Recharts |
| Theming | next-themes |
| Deployment | Vercel (primary) / cPanel (legacy) |

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/BangDills/saaschet.git
cd saaschet

# 2. Install
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your keys (see Environment Variables below)

# 4. Run
npm run dev
# Open http://localhost:3000
```

## 🔑 Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

| Variable | Required | Description |
|----------|:---:|-------------|
| `DO_INFERENCE_API_KEY` | ✅ | DigitalOcean model access key ([get here](https://cloud.digitalocean.com)) |
| `OPENCODE_API_KEY` | Optional | OpenCode Zen API key for free DeepSeek model ([opencode.ai](https://opencode.ai)) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `TAVILY_API_KEY` | Optional | Tavily API key for web search ([tavily.com](https://tavily.com)) |
| `CONTEXT7_API_KEY` | Optional | Context7 API key for up-to-date library docs in chat and Agent Mode ([context7.com](https://context7.com)) |
| `SERENA_MCP_URL` | Optional | Serena MCP HTTP/SSE endpoint for semantic code tools in Agent Mode ([github.com/oraios/serena](https://github.com/oraios/serena)) |
| `SERENA_MCP_TOKEN` | Optional | Bearer token for a protected Serena MCP bridge |
| `SERENA_ALLOW_WRITE_TOOLS` | Optional | Set `true` only to expose Serena write/execute tools; defaults to read-only semantic tools |
| `GITHUB_TOKEN` | Optional | GitHub PAT for agent mode repo access |
| `DAYTONA_API_KEY` | Optional | Daytona API key for live sandbox execution |
| `DAYTONA_SERVER_URL` | Optional | Daytona server URL (`DAYTONA_API_URL` is also accepted as a legacy alias) |
| `DAYTONA_TARGET` | Optional | Daytona target region |

## 📁 Project Structure

```
src/
  app/
    (auth)/               # Login / signup pages
    (dashboard)/          # Authenticated dashboard route group
      layout.tsx          # Sidebar + Topbar shell
      page.tsx            # Main Dashboard (KPI cards, charts)
      ai-chat/            # AI Chat page (multi-model, agent)
      ai-text/            # AI Text generator
      ai-image/           # AI Image generator
      ai-speech/          # AI Speech generator
      history/            # Chat history browser
      profile/            # User profile settings
      subscription/       # Subscription management
      users/              # Admin users table
    api/
      chat/route.ts       # AI chat endpoint (streaming, tools, multi-provider)
      models/route.ts     # Model list endpoint (whitelisted)
      conversations/      # CRUD for chat history
      credits/            # Credits balance API
      dashboard/          # Dashboard stats API
      github/             # GitHub OAuth callback
      profile/            # Profile API
    layout.tsx            # Root layout (theme, fonts)
    globals.css           # Design tokens (light + dark)
  components/
    chat/                 # ChatPanel, ChatInput, ModelSelector, ToolCall UI
    dashboard/            # Sidebar, Topbar, charts, stat cards
    auth/                 # Auth forms
    ui/                   # Card, Button, Badge primitives
  lib/
    chat/                 # Models config, types, web search, kimi-compat
    agent/                # Agent tools (GitHub read/write/edit/search)
    context7/             # Context7 documentation lookup client
    github/               # GitHub API client
    daytona/              # Sandbox tools (run_command, write_file, etc.)
    credits/              # Credits system
    supabase/             # Supabase client (server + browser)
    nav.ts                # Sidebar navigation config
    utils.ts              # cn(), formatNumber()
  middleware.ts           # Supabase auth middleware
```

## 🤖 Supported Models

| Model | Provider | Agent Capable | Free |
|-------|----------|:---:|:---:|
| DeepSeek V4 Flash | OpenCode | ✅ | ✅ |
| DeepSeek V4 Pro | DigitalOcean | ✅ | — |
| DeepSeek 4 Flash | DigitalOcean | ✅ | — |
| Kimi K2.6 | DigitalOcean | ✅ | — |
| Kimi K2.5 | DigitalOcean | ✅ | — |
| GLM 5 | DigitalOcean | — | — |

## 🏗 Deployment

### Vercel (recommended)
Push to GitHub → connect to Vercel → add env vars → deploy.

### cPanel (legacy)
See **[DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)** for the step-by-step guide.

## 📄 License

MIT
