import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  Coins,
  Command,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Send,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const features = [
  {
    number: "01",
    title: "Interactive AI Agent",
    description:
      "Work with advanced models that can reason, use tools, manage codebases, and turn an idea into working code.",
    icon: Bot,
    href: "/ai-chat",
    badge: "Flagship",
  },
  {
    number: "02",
    title: "PRD Generator",
    description:
      "Turn a rough brief into a structured, implementation-ready product requirements document in minutes.",
    icon: ClipboardList,
    href: "/prd-generator",
  },
  {
    number: "03",
    title: "AI Image Studio",
    description:
      "Create production-ready visuals, concepts, and illustrations with next-generation image models.",
    icon: ImageIcon,
    href: "/ai-image",
  },
  {
    number: "04",
    title: "Natural Text-to-Speech",
    description:
      "Transform scripts into natural, human-like voiceovers for demos, content, and product experiences.",
    icon: Mic,
    href: "/ai-speech",
  },
  {
    number: "05",
    title: "AI Copywriter",
    description:
      "Produce clear long-form content, campaign copy, and documentation without losing your voice.",
    icon: FileText,
    href: "/ai-text",
  },
  {
    number: "06",
    title: "One Credit System",
    description:
      "Use one transparent balance across every model with detailed, real-time usage tracking.",
    icon: Coins,
    href: "/profile",
  },
];

const faqs = [
  {
    question: "What is Celiuz AI Studio?",
    answer:
      "Celiuz AI Studio is one workspace for AI chat, image generation, PRD creation, copywriting, and text-to-speech. One account and one credit balance gives you access to the full suite.",
  },
  {
    question: "How does the credit system work?",
    answer:
      "Each generation uses credits based on the model and task. Your usage is visible in real time, so you always know what you are spending and can top up only when needed.",
  },
  {
    question: "Can I bring my own API keys?",
    answer:
      "Yes. You can connect supported personal API keys from your profile and run eligible tasks using your own provider quota.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. New accounts receive starter credits so you can explore the core tools before choosing a paid plan.",
  },
];

function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="Celiuz AI Studio home">
      <span className="flex size-9 items-center justify-center border border-foreground bg-foreground text-background transition-colors group-hover:bg-background group-hover:text-foreground">
        <Command aria-hidden="true" className="size-4" />
      </span>
      <span className="text-sm font-extrabold tracking-[-0.03em] sm:text-base">CELIUZ / AI</span>
    </Link>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-6xl border border-foreground bg-background shadow-[8px_8px_0_0_var(--foreground)] sm:shadow-[14px_14px_0_0_var(--foreground)]">
      <div className="flex items-center justify-between border-b border-foreground px-3 py-3 sm:px-5">
        <div className="flex items-center gap-2" aria-hidden="true">
          <Circle className="size-2.5 fill-foreground" />
          <Circle className="size-2.5" />
          <Circle className="size-2.5" />
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:block">
          workspace.celiuz.ai / agent
        </span>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="size-1.5 bg-foreground" /> Live
        </span>
      </div>

      <div className="grid min-h-[420px] md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-foreground p-4 md:flex md:flex-col md:justify-between">
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
              <p className="mt-2 text-sm font-bold">Product launch</p>
            </div>
            <nav className="flex flex-col gap-1 text-xs" aria-label="Workspace preview">
              <span className="flex items-center gap-2 bg-foreground px-3 py-2.5 font-semibold text-background">
                <Bot className="size-4" /> AI Agent
              </span>
              <span className="flex items-center gap-2 px-3 py-2.5 text-muted-foreground">
                <ClipboardList className="size-4" /> PRD Builder
              </span>
              <span className="flex items-center gap-2 px-3 py-2.5 text-muted-foreground">
                <ImageIcon className="size-4" /> Image Studio
              </span>
            </nav>
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
              <span>Credits</span><span>8,420</span>
            </div>
            <div className="mt-2 h-1 bg-muted"><div className="h-full w-3/4 bg-foreground" /></div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
            <div>
              <p className="text-xs font-bold">Celiuz Agent</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Qwen 3.7 Max · Tools enabled</p>
            </div>
            <span className="border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-wider">Auto</span>
          </div>

          <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
            <div className="ml-auto max-w-[84%] bg-foreground px-4 py-3 text-sm leading-relaxed text-background sm:max-w-[70%]">
              Build a launch plan for our new analytics dashboard. Include positioning, milestones, and a landing page outline.
            </div>
            <div className="max-w-[92%] border-l-2 border-foreground pl-4 sm:max-w-[78%]">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-3.5" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]">Agent response</span>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                I&apos;ll structure this into three focused phases and connect each milestone to a clear customer outcome.
              </p>
              <div className="mt-4 grid grid-cols-3 border border-border text-center">
                {["Position", "Build", "Launch"].map((step, index) => (
                  <div key={step} className="border-r border-border px-2 py-3 last:border-r-0">
                    <span className="font-mono text-[9px] text-muted-foreground">0{index + 1}</span>
                    <p className="mt-1 text-[11px] font-bold">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="m-4 mt-0 border border-foreground bg-background p-3 sm:m-6 sm:mt-0">
            <p className="text-xs text-muted-foreground">Ask Celiuz to build, write, research, or create...</p>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" aria-label="Attach file" className="flex size-8 items-center justify-center border border-border text-muted-foreground">
                <Paperclip className="size-3.5" />
              </button>
              <button type="button" aria-label="Send message" className="flex size-8 items-center justify-center bg-foreground text-background">
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let appLink = "/login";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    appLink = profile?.role === "admin" ? "/dashboard" : "/ai-chat";
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-xs font-bold uppercase tracking-[0.12em] md:flex" aria-label="Primary navigation">
            <a href="#features" className="transition-opacity hover:opacity-50">Tools</a>
            <a href="#pricing" className="transition-opacity hover:opacity-50">Pricing</a>
            <a href="#faqs" className="transition-opacity hover:opacity-50">FAQ</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {!user && <Link href="/login" className="hidden px-3 py-2 text-xs font-bold uppercase tracking-wider sm:inline-flex">Log in</Link>}
            <Link href={user ? appLink : "/signup"} className="inline-flex items-center gap-2 bg-foreground px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-background transition-opacity hover:opacity-75">
              {user ? "Open app" : "Start free"}<ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative border-b border-foreground">
        <div className="mono-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-6 flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
                <span className="inline-flex size-6 items-center justify-center bg-foreground text-background"><Zap className="size-3" /></span>
                One workspace. Every creative workflow.
              </div>
              <h1 className="max-w-5xl text-balance text-5xl font-extrabold leading-[0.94] tracking-[-0.065em] sm:text-7xl lg:text-[6.6rem]">
                From idea to output, without the busywork.
              </h1>
            </div>
            <div className="border-l border-foreground pl-5 lg:pb-2">
              <p className="text-pretty text-base leading-relaxed text-muted-foreground">
                Chat, code, write, design, and ship with a focused suite of AI tools built for people who make things.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link href={user ? appLink : "/signup"} className="inline-flex items-center justify-between bg-foreground px-5 py-3.5 text-sm font-bold text-background transition-opacity hover:opacity-75">
                  Start building free <ArrowRight className="size-4" />
                </Link>
                <a href="#features" className="inline-flex items-center justify-between border border-foreground bg-background px-5 py-3.5 text-sm font-bold transition-colors hover:bg-foreground hover:text-background">
                  Explore the tools <span className="font-mono text-xs">↓</span>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-14 sm:mt-20"><ProductPreview /></div>
        </div>
      </section>

      <section className="border-b border-foreground bg-foreground text-background" aria-label="Platform capabilities">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-background/25 px-4 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[['06', 'AI tools'], ['01', 'Credit balance'], ['24/7', 'Always available'], ['BYOK', 'Keys supported']].map(([value, label]) => (
            <div key={label} className="px-3 py-7 text-center sm:px-6">
              <p className="font-mono text-xl font-bold sm:text-2xl">{value}</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.15em] text-background/60 sm:text-[10px]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="border-b border-foreground py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 border-b border-foreground pb-10 lg:grid-cols-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 01 — Tool suite ]</p>
            <div>
              <h2 className="text-balance text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-6xl">Six tools. One clear workflow.</h2>
              <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">Stop switching tabs and subscriptions. Move from research to production in one connected workspace.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link key={feature.number} href={user ? feature.href : "/login"} className="group -ml-px -mt-px flex min-h-72 flex-col justify-between border border-foreground p-6 transition-colors hover:bg-foreground hover:text-background sm:p-7">
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-xs">{feature.number}</span>
                    <Icon className="size-6 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
                  </div>
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <h3 className="text-xl font-extrabold tracking-[-0.03em]">{feature.title}</h3>
                      {feature.badge && <span className="border border-current px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider">{feature.badge}</span>}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground group-hover:text-background/65">{feature.description}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider">Open tool <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-foreground bg-muted py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 02 — Pricing ]</p>
              <h2 className="mt-6 text-balance text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-6xl">Pay for output, not empty seats.</h2>
              <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">One credit balance for text, images, speech, and agent workflows. Start free and upgrade when your work scales.</p>
            </div>
            <div className="grid md:grid-cols-2">
              <article className="flex min-h-[460px] flex-col justify-between border border-foreground bg-background p-7">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Starter</p>
                  <p className="mt-5 text-5xl font-extrabold tracking-[-0.06em]">$0</p>
                  <p className="mt-2 text-sm text-muted-foreground">No card required. Yours forever.</p>
                  <ul className="mt-8 flex flex-col gap-4 text-sm">
                    {["Starter credit allocation", "Standard chat models", "Access to all core tools", "Community support"].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0" />{item}</li>)}
                  </ul>
                </div>
                <Link href="/signup" className="mt-8 inline-flex items-center justify-between border border-foreground px-4 py-3 text-sm font-bold hover:bg-foreground hover:text-background">Create free account <ArrowRight className="size-4" /></Link>
              </article>
              <article className="flex min-h-[460px] flex-col justify-between bg-foreground p-7 text-background">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Pro</p>
                    <span className="border border-background/40 px-2 py-1 font-mono text-[9px] uppercase tracking-wider">Most popular</span>
                  </div>
                  <p className="mt-5 text-5xl font-extrabold tracking-[-0.06em]">$9<span className="text-base tracking-normal text-background/50"> / mo</span></p>
                  <p className="mt-2 text-sm text-background/55">For creators shipping every week.</p>
                  <ul className="mt-8 flex flex-col gap-4 text-sm">
                    {["Premium model access", "Large monthly credit pool", "Bring your own API keys", "Priority task processing"].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0" />{item}</li>)}
                  </ul>
                </div>
                <Link href="/signup" className="mt-8 inline-flex items-center justify-between bg-background px-4 py-3 text-sm font-bold text-foreground transition-opacity hover:opacity-80">Start with Pro <ArrowRight className="size-4" /></Link>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="faqs" className="border-b border-foreground py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.65fr_1.35fr] lg:px-8">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 03 — FAQ ]</p>
            <h2 className="mt-6 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Good questions, clear answers.</h2>
          </div>
          <div className="border-t border-foreground">
            {faqs.map((faq, index) => (
              <details key={faq.question} className="group border-b border-foreground">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start gap-4 text-base font-bold sm:text-lg"><span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span>{faq.question}</span>
                  <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl pb-6 pl-9 text-sm leading-relaxed text-muted-foreground sm:text-base">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-foreground py-20 text-background sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-background/55"><Terminal className="size-4" /> Ready when you are</div>
              <h2 className="mt-6 max-w-4xl text-balance text-5xl font-extrabold leading-[0.94] tracking-[-0.06em] sm:text-7xl">Make the next thing, faster.</h2>
            </div>
            <Link href={user ? appLink : "/signup"} className="inline-flex min-w-56 items-center justify-between bg-background px-6 py-4 font-bold text-foreground transition-opacity hover:opacity-80">Start building <ArrowRight className="size-5" /></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-background/20 bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <Brand />
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-background/45">© 2026 Celiuz AI Studio. Built for makers.</p>
        </div>
      </footer>
    </main>
  );
}
