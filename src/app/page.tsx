import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  Coins,
  Paperclip,
  Send,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CeliuzLogo } from "@/components/celiuz-logo";

export const dynamic = "force-dynamic";

const features = [
  {
    number: "01",
    title: "AI Agent Interaktif",
    description:
      "Bekerja dengan model canggih yang bisa menalar, memakai tools, mengelola codebase, dan mengubah ide menjadi kode yang jalan.",
    icon: Bot,
    href: "/ai-chat",
    badge: "Andalan",
  },
  {
    number: "02",
    title: "Generator PRD",
    description:
      "Ubah brief kasar menjadi dokumen product requirements yang terstruktur dan siap diimplementasikan dalam hitungan menit.",
    icon: ClipboardList,
    href: "/prd-generator",
  },
  {
    number: "03",
    title: "Satu Sistem Kredit",
    description:
      "Pakai satu saldo transparan untuk semua model dengan pelacakan pemakaian real-time yang detail.",
    icon: Coins,
    href: "/profile",
  },
];

const faqs = [
  {
    question: "Apa itu Celiuz AI?",
    answer:
      "Celiuz AI adalah satu workspace untuk chat AI dan pembuatan PRD. Satu akun dan satu saldo kredit memberi Anda akses ke seluruh fitur.",
  },
  {
    question: "Bagaimana sistem kredit bekerja?",
    answer:
      "Setiap generasi memakai kredit sesuai model dan tugas. Pemakaian Anda terlihat real-time, jadi Anda selalu tahu berapa yang dihabiskan dan bisa top-up hanya saat dibutuhkan.",
  },
  {
    question: "Ada uji coba gratis?",
    answer:
      "Ya. Akun baru mendapat kredit awal agar Anda bisa menjelajahi fitur inti sebelum memilih paket berbayar.",
  },
];

const LOBE = "https://unpkg.com/@lobehub/icons-static-svg@latest/icons";

const MODELS = [
  {
    name: "GLM 5.2",
    logo: `${LOBE}/chatglm-color.svg`,
    tagline: "Model andalan untuk Agent Mode. Penalaran kuat, andal memanggil tool, dan jago ngoding.",
    badge: "Agen · Default",
  },
  {
    name: "Kimi 2.7 Code",
    logo: `${LOBE}/kimi-color.svg`,
    tagline: "Spesialis kode. Cepat memahami codebase dan menulis kode yang bersih.",
    badge: "Strong Coder",
  },
  {
    name: "DeepSeek V4 Pro",
    logo: `${LOBE}/deepseek-color.svg`,
    tagline: "Model reasoning kelas berat. Cocok untuk tugas kompleks dan multi-langkah.",
    badge: "Reasoning Pro",
  },
  {
    name: "DeepSeek V4 Flash",
    logo: `${LOBE}/deepseek-color.svg`,
    tagline: "Varian cepat dan ringan. Respons instan untuk chat sehari-hari.",
    badge: "Fast",
  },
  {
    name: "Qwen 3.7 Plus",
    logo: `${LOBE}/qwen-color.svg`,
    tagline: "Seimbang antara kecepatan dan kualitas. Andal untuk tugas umum.",
    badge: "Speed & Quality",
  },
  {
    name: "MiniMax M3",
    logo: `${LOBE}/minimax-color.svg`,
    tagline: "Model serbaguna dengan hasil stabil di berbagai tipe pertanyaan.",
    badge: "Balanced",
  },
];

function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="Celiuz AI home">
      <CeliuzLogo className="rounded-none transition-transform group-hover:-translate-y-0.5" />
      <span className="text-sm font-extrabold tracking-[-0.03em] sm:text-base">CELIUZ AI</span>
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
          <span className="size-1.5 bg-foreground" /> Langsung
        </span>
      </div>

      <div className="grid min-h-[420px] md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-foreground p-4 md:flex md:flex-col md:justify-between">
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
              <p className="mt-2 text-sm font-bold">Peluncuran produk</p>
            </div>
            <nav className="flex flex-col gap-1 text-xs" aria-label="Workspace preview">
              <span className="flex items-center gap-2 bg-foreground px-3 py-2.5 font-semibold text-background">
                <Bot className="size-4" /> AI Agent
              </span>
              <span className="flex items-center gap-2 px-3 py-2.5 text-muted-foreground">
                <ClipboardList className="size-4" /> PRD Builder
              </span>
            </nav>
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
              <span>Kredit</span><span>8.420</span>
            </div>
            <div className="mt-2 h-1 bg-muted"><div className="h-full w-3/4 bg-foreground" /></div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
            <div>
              <p className="text-xs font-bold">Celiuz Agent</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">GLM 5.2 · Tools aktif</p>
            </div>
            <span className="border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-wider">Auto</span>
          </div>

          <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
            <div className="ml-auto max-w-[84%] bg-foreground px-4 py-3 text-sm leading-relaxed text-background sm:max-w-[70%]">
              Buatkan rencana peluncuran untuk dashboard analitik baru kita. Sertakan positioning, milestone, dan kerangka landing page.
            </div>
            <div className="max-w-[92%] border-l-2 border-foreground pl-4 sm:max-w-[78%]">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-3.5" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]">Respons agen</span>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Aku akan menyusun ini jadi tiga fase fokus dan menghubungkan tiap milestone ke hasil pelanggan yang jelas.
              </p>
              <div className="mt-4 grid grid-cols-3 border border-border text-center">
                {["Posisi", "Bangun", "Luncur"].map((step, index) => (
                  <div key={step} className="border-r border-border px-2 py-3 last:border-r-0">
                    <span className="font-mono text-[9px] text-muted-foreground">0{index + 1}</span>
                    <p className="mt-1 text-[11px] font-bold">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="m-4 mt-0 border border-foreground bg-background p-3 sm:m-6 sm:mt-0">
            <p className="text-xs text-muted-foreground">Minta Celiuz membangun, menulis, meneliti, atau membuat...</p>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" aria-label="Lampirkan file" className="flex size-8 items-center justify-center border border-border text-muted-foreground">
                <Paperclip className="size-3.5" />
              </button>
              <button type="button" aria-label="Kirim pesan" className="flex size-8 items-center justify-center bg-foreground text-background">
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
            <a href="#features" className="transition-opacity hover:opacity-50">Fitur</a>
            <a href="#pricing" className="transition-opacity hover:opacity-50">Harga</a>
            <a href="#faqs" className="transition-opacity hover:opacity-50">FAQ</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {!user && <Link href="/login" className="hidden px-3 py-2 text-xs font-bold uppercase tracking-wider sm:inline-flex">Masuk</Link>}
            <Link href={user ? appLink : "/signup"} className="inline-flex items-center gap-2 bg-foreground px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-background transition-opacity hover:opacity-75">
              {user ? "Buka app" : "Mulai gratis"}<ArrowRight className="size-3.5" />
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
                Satu workspace. Semua alur kerja kreatif.
              </div>
              <h1 className="max-w-5xl text-balance text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-7xl lg:text-[6.6rem]">
                Dari ide jadi hasil, tanpa pekerjaan ribet.
              </h1>
            </div>
            <div className="border-l border-foreground pl-5 lg:pb-2">
              <p className="text-pretty text-base leading-relaxed text-muted-foreground">
                Chat, ngoding, dan shipping dengan rangkaian tool AI yang fokus, dibuat untuk orang yang membangun sesuatu.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link href={user ? appLink : "/signup"} className="inline-flex items-center justify-between bg-foreground px-5 py-3.5 text-sm font-bold text-background transition-opacity hover:opacity-75">
                  Mulai bangun gratis <ArrowRight className="size-4" />
                </Link>
                <a href="#features" className="inline-flex items-center justify-between border border-foreground bg-background px-5 py-3.5 text-sm font-bold transition-colors hover:bg-foreground hover:text-background">
                  Jelajahi fitur <span className="font-mono text-xs">↓</span>
                </a>
              </div>
            </div>
          </div>
          <div className="mt-14 sm:mt-20"><ProductPreview /></div>
        </div>
      </section>

      <section className="border-b border-foreground bg-foreground text-background" aria-label="Platform capabilities">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-background/25 px-4 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[['03', 'Tool AI'], ['01', 'Saldo kredit'], ['24/7', 'Selalu tersedia'], ['24 jam', 'Trial Pro']].map(([value, label]) => (
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
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 01 — Rangkaian tool ]</p>
            <div>
              <h2 className="text-balance text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-6xl">Tiga tool. Satu alur kerja jelas.</h2>
              <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">Berhenti ganti tab dan langganan. Pindah dari riset ke produksi dalam satu workspace yang terhubung.</p>
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
                    <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider">Buka tool <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="models" className="border-b border-foreground py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 border-b border-foreground pb-10 lg:grid-cols-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 02 — Model ]</p>
            <div>
              <h2 className="text-balance text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-6xl">Model terbaik, satu platform.</h2>
              <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">Celiuz memakai model-model berkualitas, untuk memaksimalkan kinerja kode dalam pekerjaan Anda.</p>
            </div>
          </div>
          <div className="grid gap-px bg-foreground sm:grid-cols-2 lg:grid-cols-3">
            {MODELS.map((m) => (
              <div key={m.name} className="flex flex-col gap-4 bg-background p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.logo} alt="" className="size-8 shrink-0 object-contain" />
                  <h3 className="text-lg font-extrabold tracking-[-0.03em]">{m.name}</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{m.tagline}</p>
                <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m.badge}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-foreground bg-muted py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 02 — Harga ]</p>
              <h2 className="mt-6 text-balance text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-6xl">Bayar untuk hasil, bukan kursi kosong.</h2>
              <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">Satu saldo kredit untuk chat, PRD, dan alur kerja agen. Mulai gratis dan upgrade saat pekerjaan Anda berkembang.</p>
            </div>
            <div className="grid md:grid-cols-2">
              <article className="flex min-h-[460px] flex-col justify-between border border-foreground bg-background p-7">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Starter</p>
                  <p className="mt-5 text-5xl font-extrabold tracking-[-0.06em]">Rp0</p>
                  <p className="mt-2 text-sm text-muted-foreground">Tanpa kartu. Milik Anda selamanya.</p>
                  <ul className="mt-8 flex flex-col gap-4 text-sm">
                    {["Alokasi kredit awal", "Model chat standar", "Akses semua fitur inti", "Dukungan komunitas"].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0" />{item}</li>)}
                  </ul>
                </div>
                <Link href="/signup" className="mt-8 inline-flex items-center justify-between border border-foreground px-4 py-3 text-sm font-bold hover:bg-foreground hover:text-background">Buat akun gratis <ArrowRight className="size-4" /></Link>
              </article>
              <article className="flex min-h-[460px] flex-col justify-between bg-foreground p-7 text-background">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Pro</p>
                    <span className="border border-background/40 px-2 py-1 font-mono text-[9px] uppercase tracking-wider">Paling populer</span>
                  </div>
                  <p className="mt-5 text-5xl font-extrabold tracking-[-0.06em]">Rp10.000<span className="text-base tracking-normal text-background/50"> / 24 jam</span></p>
                  <p className="mt-2 text-sm text-background/55">Untuk kreator yang shipping tiap minggu.</p>
                  <ul className="mt-8 flex flex-col gap-4 text-sm">
                    {["Akses model premium", "Kolam kredit harian besar", "Agen penuh (baca + tulis + PR)", "Prioritas pemrosesan tugas"].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0" />{item}</li>)}
                  </ul>
                </div>
                <Link href="/signup" className="mt-8 inline-flex items-center justify-between bg-background px-4 py-3 text-sm font-bold text-foreground transition-opacity hover:opacity-80">Mulai dengan Pro <ArrowRight className="size-4" /></Link>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="faqs" className="border-b border-foreground py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.65fr_1.35fr] lg:px-8">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ 03 — FAQ ]</p>
            <h2 className="mt-6 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Pertanyaan bagus, jawaban jelas.</h2>
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
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-background/55"><Terminal className="size-4" /> Siap kapan pun Anda</div>
              <h2 className="mt-6 max-w-4xl text-balance text-5xl font-extrabold leading-[0.94] tracking-[-0.06em] sm:text-7xl">Buat hal berikutnya, lebih cepat.</h2>
            </div>
            <Link href={user ? appLink : "/signup"} className="inline-flex min-w-56 items-center justify-between bg-background px-6 py-4 font-bold text-foreground transition-opacity hover:opacity-80">Mulai bangun <ArrowRight className="size-5" /></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-background/20 bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <Brand />
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-background/45">© 2026 Celiuz AI. Buat yang suka bikin sesuatu.</p>
        </div>
      </footer>
    </main>
  );
}
