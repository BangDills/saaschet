import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Mic,
  ClipboardList,
  Check,
  ChevronDown,
  Bot,
  Zap,
  Coins,
  Shield,
  Layers,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let appLink = "/login";
  if (user) {
    // If user is logged in, check role to determine landing app URL
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    appLink = profile?.role === "admin" ? "/dashboard" : "/ai-chat";
  }

  const features = [
    {
      title: "Interactive AI Agent",
      description: "Chat with state-of-the-art models (Qwen, GLM, Kimi) capable of executing tools, managing codebases, and writing code.",
      icon: Bot,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      href: user ? "/ai-chat" : "/login",
      badge: "Flagship",
    },
    {
      title: "PRD Generator",
      description: "Auto-compile comprehensive, professional Product Requirements Documents in markdown using optimized AI templates.",
      icon: ClipboardList,
      color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      href: user ? "/prd-generator" : "/login",
    },
    {
      title: "AI Image Studio",
      description: "Generate highly realistic, stunning digital art and illustrations using Alibaba's next-gen Wan 2.7 Pro & Z-Image engines.",
      icon: ImageIcon,
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      href: user ? "/ai-image" : "/login",
    },
    {
      title: "Natural Text-to-Speech",
      description: "Convert written copy into ultra-realistic human-like audio voiceovers using advanced synthesis technology.",
      icon: Mic,
      color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
      href: user ? "/ai-speech" : "/login",
    },
    {
      title: "AI Copywriter",
      description: "Produce high-converting blog posts, marketing copies, and documentation snippets formatted for speed.",
      icon: FileText,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      href: user ? "/ai-text" : "/login",
    },
    {
      title: "Unified Credit System",
      description: "Control your costs transparently. Pay only for what you generate with detailed real-time usage graphs and logging.",
      icon: Coins,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      href: user ? "/profile" : "/login",
    },
  ];

  const faqs = [
    {
      question: "What is Celiuz AI Studio?",
      answer: "Celiuz AI Studio is a unified dashboard that houses an advanced suite of AI products. Instead of paying for multiple subscriptions, we bundle LLM Chat Agents, Image Generators, PRD Compilers, Copywriters, and TTS synthesizers under a single user account and credit pool.",
    },
    {
      question: "How does the Credit System work?",
      answer: "Every generation (text, image, speech) consumes a set amount of credits depending on the complexity of the model used. You can monitor your consumption in real-time on your dashboard and easily top-up or subscribe to higher tiers.",
    },
    {
      question: "Can I bring my own API keys?",
      answer: "Yes! While we provide premium computing presets by default, you can configure your own OpenAI or GitHub API keys in your profile settings to run tasks using your personal quotas.",
    },
    {
      question: "Is there a free trial available?",
      answer: "Absolutely. All new signups are automatically provisioned on our Free tier with a starting credit allocation, allowing you to test all premium models without committing to any paid plans.",
    },
  ];

  return (
    <div className="relative min-h-screen bg-background font-sans text-foreground">
      {/* Background decoration grid */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-gradient-to-b from-primary/5 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Sparkles className="size-6 text-primary animate-pulse" />
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              Celiuz AI Studio
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faqs" className="hover:text-foreground transition-colors">FAQs</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href={appLink}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition-colors"
              >
                Go to App <ArrowRight className="size-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition-colors"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pt-20 pb-16 text-center sm:px-6 lg:px-8">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary mb-6">
          <Zap className="size-3.5 fill-current" />
          <span>Presenting the Next Generation of AI SaaS</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground">
          Automate, Create & Build with{" "}
          <span className="bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">
            Celiuz AI Studio
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg text-muted-foreground leading-relaxed">
          A unified, premium suite of AI tools designed for creators, developers, and product managers. 
          Generate code, write complete PRDs, create ultra-realistic images, and synthesize natural human speech in seconds.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={user ? appLink : "/signup"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] hover:opacity-90 transition-all"
          >
            Get Started for Free <ArrowRight className="size-5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-8 py-4 text-base font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Explore Features
          </a>
        </div>

        {/* Dashboard Mockup Preview */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 hover:shadow-primary/5">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-3">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-yellow-400/80" />
            <span className="size-3 rounded-full bg-green-400/80" />
            <span className="ml-4 text-xs font-mono text-muted-foreground">app.celiuz-ai.studio/ai-chat</span>
          </div>
          <div className="bg-background/50 p-6 sm:p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
              <div className="md:col-span-1 border border-border rounded-xl p-4 bg-card/60">
                <div className="text-xs font-bold text-muted-foreground uppercase mb-3">Workspace</div>
                <div className="space-y-2">
                  <div className="h-8 rounded bg-primary/10 border border-primary/20 flex items-center px-3 text-xs font-semibold text-primary">💬 AI Chat Agent</div>
                  <div className="h-8 rounded bg-muted/30 flex items-center px-3 text-xs text-muted-foreground">📝 PRD Builder</div>
                  <div className="h-8 rounded bg-muted/30 flex items-center px-3 text-xs text-muted-foreground">🎨 Image Studio</div>
                </div>
              </div>
              <div className="md:col-span-3 border border-border rounded-xl p-4 bg-card/60 flex flex-col justify-between min-h-[220px]">
                <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                  <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-semibold text-muted-foreground">Model Connected: Qwen 3.7 Max</span>
                </div>
                <div className="my-4 text-sm text-foreground space-y-3 leading-relaxed">
                  <p className="text-xs text-primary font-mono font-semibold">sys@celiuz-ai:~$ generate code</p>
                  <p className="text-muted-foreground">Building Next.js application with TailwindCSS and Supabase Auth...</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <div className="h-7 w-20 rounded bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">Deploy</div>
                  <div className="h-7 w-20 rounded border border-border text-muted-foreground text-[11px] font-semibold flex items-center justify-center">Copy</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="relative z-10 border-t border-border bg-muted/20 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              A Unified Suite of Advanced AI Tools
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything you need to build, design, write, and synthesize, powered by top-tier models and a frictionless developer experience.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div
                  key={idx}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={`flex size-10 items-center justify-center rounded-xl ${feat.color}`}>
                        <Icon className="size-5" />
                      </div>
                      {feat.badge && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {feat.badge}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {feat.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feat.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/40">
                    <Link
                      href={feat.href}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:underline"
                    >
                      Try Feature <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credit System & Pricing Section */}
      <section id="pricing" className="relative z-10 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Simple Pricing, Flexible Credit Tiers
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Pay only for what you generate. Our unified credit system applies transparent rates for all text, image, and speech services.
            </p>
          </div>

          <div className="mx-auto max-w-3xl grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Free Plan */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-8 shadow-sm">
              <div>
                <h3 className="text-lg font-bold text-foreground">Free Tier</h3>
                <p className="mt-2 text-sm text-muted-foreground">Perfect for testing models and personal experiments.</p>
                <div className="mt-4 flex items-baseline text-foreground">
                  <span className="text-4xl font-extrabold tracking-tight">$0</span>
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">/forever</span>
                </div>

                <ul className="mt-8 space-y-4">
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>Access to standard AI Chat models</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>Free starter credits on registration</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>Community support</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href="/signup"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  Sign up free
                </Link>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-primary bg-card p-8 shadow-lg relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">
                Most Popular
              </div>

              <div>
                <h3 className="text-lg font-bold text-foreground">Pro Tier</h3>
                <p className="mt-2 text-sm text-muted-foreground">Unlimited possibilities with premium credits.</p>
                <div className="mt-4 flex items-baseline text-foreground">
                  <span className="text-4xl font-extrabold tracking-tight">$9</span>
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">/month</span>
                </div>

                <ul className="mt-8 space-y-4">
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span className="text-foreground font-medium">Access all premium engines (Wan 2.7 Pro)</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>Large monthly credit allocation</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>Bring your own custom API keys</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>Priority task processing queues</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href="/signup"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                >
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faqs" className="relative z-10 border-t border-border bg-muted/20 py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Frequently Asked Questions
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Have questions? Find quick answers about our capabilities, credits, and pricing.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <details
                key={idx}
                className="group border border-border rounded-2xl bg-card p-5 [&_summary::-webkit-details-marker]:hidden cursor-pointer"
              >
                <summary className="flex items-center justify-between focus:outline-none select-none">
                  <h3 className="text-base font-semibold text-foreground pr-4">
                    {faq.question}
                  </h3>
                  <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180 transition-transform duration-300 shrink-0" />
                </summary>
                <div className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border/40 pt-4">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Integrations Badge */}
      <section className="relative z-10 border-t border-border py-16 text-center bg-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="flex flex-col items-center gap-2">
              <Shield className="size-8 text-primary" />
              <h4 className="font-bold text-foreground">Secure Payments</h4>
              <p className="text-xs text-muted-foreground">Fully integrated Stripe payment processing.</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Layers className="size-8 text-primary" />
              <h4 className="font-bold text-foreground">Bring Your Own Key</h4>
              <p className="text-xs text-muted-foreground">Run models using your custom OpenAI or GitHub keys.</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Zap className="size-8 text-primary" />
              <h4 className="font-bold text-foreground">Self-Healing APIs</h4>
              <p className="text-xs text-muted-foreground">Dynamic routing and automated fallbacks guarantee maximum uptime.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border bg-background py-12">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <span className="text-base font-bold tracking-tight text-foreground">Celiuz AI Studio</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Celiuz AI Studio. All rights reserved. Built with Next.js, Supabase, and TailwindCSS.
          </p>
          <div className="flex gap-4 text-xs font-medium text-muted-foreground">
            <a href="#" className="hover:text-foreground">Privacy Policy</a>
            <a href="#" className="hover:text-foreground">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
