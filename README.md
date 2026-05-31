# Horizon AI — SaaS Dashboard

Modern AI SaaS dashboard built with **Next.js 16**, **React 19**, **Tailwind CSS v4**, **Recharts**, and **next-themes**. Designed to be deployed on shared cPanel hosting via Node.js Selector (Phusion Passenger).

![dashboard preview](public/next.svg)

## Features

- Sidebar with 11 navigation entries (AI Assistant, Chat, Text/Image/Speech generators, Users, Subscription, History, etc.)
- 4 KPI stat cards (Total Credits Used, Total Users, Credits Available, Current Plan)
- Area chart for daily credit usage (last 30 days, mobile + desktop split)
- Bar chart for monthly credit usage (current vs previous period)
- Users table with row selection and pagination
- Light / Dark mode toggle
- Fully responsive (mobile drawer included)
- Custom Next.js server (`server.js`) ready for cPanel Passenger

## Tech stack

| Concern        | Choice                                |
| -------------- | ------------------------------------- |
| Framework      | Next.js 16 (App Router) + TypeScript  |
| Styling        | Tailwind CSS v4 + custom design tokens|
| Icons          | lucide-react                          |
| Charts         | Recharts                              |
| Theming        | next-themes                           |
| Runtime target | Node.js >= 20.9                       |

## Local development

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Production build

```bash
npm run build
npm start                # standard Next.js server
# or
npm run start:cpanel     # custom server.js (used on cPanel)
```

## Deployment

See **[DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)** for the full step-by-step guide to deploy this app on cPanel using Node.js Selector.

## Project structure

```
src/
  app/
    (dashboard)/        # Authenticated dashboard route group
      layout.tsx        # Sidebar + Topbar shell
      page.tsx          # Main Dashboard
      ai-assistant/     # ...and other feature pages
    layout.tsx          # Root layout (theme provider, fonts)
    globals.css         # Design tokens (light + dark)
  components/
    dashboard/          # Sidebar, Topbar, charts, table
    ui/                 # Card, Button, Badge primitives
    theme-provider.tsx
  lib/
    data.ts             # Dummy data (replace with API calls)
    nav.ts              # Sidebar config
    utils.ts            # cn(), formatNumber()
server.js               # Custom Next.js server for Passenger
next.config.ts
```

## Roadmap

This is **step 1 of 3** — the UI shell with dummy data. Next steps:

1. ~~Frontend dashboard with dummy data~~ ✅
2. Authentication + database (Supabase or MySQL on cPanel)
3. Wire up AI generators (text/image/speech) with credits ledger

## License

MIT
