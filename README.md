# Celiuz AI — AI Coding Agent Platform

Platform AI coding agent dengan integrasi GitHub, live sandbox execution, multi-model OpenAI-compatible, dan dashboard lengkap dengan autentikasi. Dibangun dengan **Next.js 16**, **React 19**, **Tailwind CSS v4**, dan **Vercel AI SDK**.

## ✨ Features

### AI Chat & Agent Mode
- **Multi model** — GLM 5.2, Kimi 2.7 Code, DeepSeek V4 Pro, DeepSeek V4 Flash, Qwen 3.7 Plus, MiniMax M3
- **Agent Mode otomatis** — model dengan tool-calling auto-enable agent tools saat repo dihubungkan
- **Integrasi GitHub** — read, write, edit, search code, create branches & PRs (scope `workflow` untuk push CI/CD files)
- **Live sandbox** — Daytona sandbox (4 vCPU, 8GB RAM, 10GB disk) untuk eksekusi kode
- **Activity Timeline** — timeline terstruktur per kategori (Explore, Read, Search, Commands, Code, Created, Updated, Deleted) dengan summary card
- **Quick Actions** — tombol aksi context-aware berbasis AgentState (task type + status dari orchestrator)
- **Context7 docs** — lookup dokumentasi library/framework terkini di chat dan Agent Mode
- **Web search** — Tavily-powered in-chat web search toggle
- **Memory extraction** — vector memory (Jina embeddings) + structured profile memory (Fireworks LLM)
- **Streaming** — real-time tool call streaming dengan context trimming, abort on disconnect

### Projects
- **Project folders** — kelompokkan conversation ke project dengan nama, warna, deskripsi
- **Sidebar integration** — project list di sidebar dengan conversation count
- **Auto-assign** — conversation baru otomatis ke project aktif

### Credits & Billing
- **Sistem kredit harian** — Free 50/hari, Pro 3000/24 jam (Rp10.000 trial)
- **Atomic billing** — RPC `spend_credits` dengan row lock, race-condition safe
- **Pro trial 24 jam** — aktivasi via WhatsApp + admin approval, auto-downgrade
- **Credit meter** — sidebar meter dengan Pro countdown

### Dashboard
- KPI stat cards (Credits Used, Total Users, Credits Available, Plan)
- Area chart (daily credit usage, last 30 days)
- Bar chart (monthly credit usage)
- Users table dengan pagination + Pro activation
- Light / Dark mode toggle
- Fully responsive (mobile drawer)

### Auth & Security
- Supabase authentication (email/password, GitHub OAuth)
- Chat history persistence (conversations + tool-call parts + metadata)
- Row Level Security (RLS) di semua tables
- CSP + security headers (X-Frame-Options, X-Content-Type-Options, Permissions-Policy)
- Idempotent message save (ON CONFLICT, no duplicate on reload)
- XSS protection (markdown href scheme validation, no raw HTML injection)

## 🛠 Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + custom design tokens |
| AI SDK | Vercel AI SDK v6 (`ai`, `@ai-sdk/openai`) |
| Inference | OpenAI-compatible API (6 models) |
| Sandbox | Daytona SDK (snapshot-based, 4 vCPU/8GB) |
| Auth & DB | Supabase (Postgres + Auth + RLS) |
| Web Search | Tavily AI |
| Docs Lookup | Context7 API |
| Memory | Jina AI (embeddings) + Fireworks (extraction) |
| Icons | lucide-react |
| Charts | Recharts |
| Theming | next-themes |
| Deployment | Coolify (Docker, persistent) / Vercel (legacy) |

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
| `FIREWORKS_API_KEY` | ✅ | OpenAI-compatible API key ([get here](https://fireworks.ai)) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `GITHUB_TOKEN` | ✅ | GitHub PAT for agent mode repo access |
| `GITHUB_APP_CLIENT_ID` | ✅ | GitHub OAuth App client ID (connect repo flow) |
| `GITHUB_APP_CLIENT_SECRET` | ✅ | GitHub OAuth App client secret |
| `TAVILY_API_KEY` | Optional | Tavily API key for web search ([tavily.com](https://tavily.com)) |
| `CONTEXT7_API_KEY` | Optional | Context7 API key for library docs ([context7.com](https://context7.com)) |
| `JINA_API_KEY` | Optional | Jina AI key for vector embeddings (memory search) |
| `DAYTONA_API_KEY` | Optional | Daytona API key for sandbox execution |
| `DAYTONA_SERVER_URL` | Optional | Daytona server URL (default: `https://app.daytona.io/api`) |
| `DAYTONA_TARGET` | Optional | Daytona target region (`us` or `eu`, default `us`) |
| `DAYTONA_SANDBOX_SNAPSHOT` | Optional | Pre-provisioned snapshot name for resource-heavy sandboxes |
| `SERENA_MCP_URL` | Optional | Serena MCP HTTP/SSE endpoint for semantic code tools |
| `SERENA_MCP_TOKEN` | Optional | Bearer token for a protected Serena MCP bridge |
| `SERENA_ALLOW_WRITE_TOOLS` | Optional | Set `true` to expose Serena write/execute tools; defaults read-only |

## 📁 Project Structure

```
src/
  app/
    (auth)/               # Login / signup pages
    (dashboard)/          # Authenticated dashboard route group
      layout.tsx          # Sidebar + Topbar shell
      dashboard/          # Admin dashboard (KPI cards, charts)
      ai-chat/            # AI Chat page (multi-model, agent, projects)
      prd-generator/      # PRD generator
      history/            # Chat history browser
      profile/            # User profile settings
      subscription/       # Subscription / Pro trial management
      users/              # Admin users table + Pro activation
    api/
      chat/route.ts       # AI chat endpoint (streaming, tools, multi-model)
      models/route.ts     # Model list endpoint (Fireworks whitelist)
      conversations/      # CRUD for chat history + parts + metadata
      projects/           # CRUD for project folders
      credits/            # Credits balance API
      github/             # GitHub OAuth + repo content
      profile/            # Profile + tier API
    globals.css           # Design tokens (light + dark)
  components/
    chat/                 # ChatPanel, ChatInput, ModelSelector, MessageBubble
    chat/activity/        # ActivityTimeline, ActivityGroup, FileOperationGroup, CommandGroup, SummaryCard
    dashboard/            # Sidebar, Topbar, charts, projects-list, credits-meter
    auth/                 # Auth forms
    ui/                   # Card, Button, Badge primitives
  lib/
    chat/                 # Models config, types, web search, memory
    agent/                # Agent tools + action-registry (Quick Actions)
    context7/             # Context7 documentation lookup
    github/               # GitHub API client
    daytona/              # Sandbox tools (run_command, write_file, etc.)
    credits/              # Credits system (atomic RPC)
    supabase/             # Supabase client (server + browser)
    url.ts                # resolveOrigin + redactVendorPath
    nav.ts                # Sidebar navigation config
  supabase/migrations/    # SQL migrations (0001-0018)
  Dockerfile              # Multi-stage Docker build (standalone, Coolify)
```

## 🤖 Supported Models

| Model | Provider | Agent Capable | Multimodal |
|-------|----------|:---:|:---:|
| GLM 5.2 | OpenAI-compatible | ✅ | — |
| Kimi 2.7 Code | OpenAI-compatible | ✅ | ✅ |
| DeepSeek V4 Pro | OpenAI-compatible | ✅ | — |
| DeepSeek V4 Flash | OpenAI-compatible | ✅ | — |
| Qwen 3.7 Plus | OpenAI-compatible | ✅ | ✅ |
| MiniMax M3 | OpenAI-compatible | ✅ | ✅ |

Semua model support function-calling (verified via Fireworks API).

## 🏗 Deployment

### Coolify (recommended — production)
Docker-based deploy dengan `Dockerfile` (multi-stage, `output: 'standalone'`). Persistent process — tidak ada Vercel 5-menit limit untuk agent loop.

1. Install Coolify di VPS (Hetzner/DigitalOcean 8GB+)
2. Connect repo → auto-detect Dockerfile
3. Set env vars via Coolify UI
4. Deploy → auto SSL Let's Encrypt

### Vercel (legacy/staging)
Push ke GitHub → connect Vercel → add env vars → deploy. Note: 5-menit function timeout limit untuk agent.

### cPanel (legacy)
See **[DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)** for the step-by-step guide.

## 📄 License

MIT
