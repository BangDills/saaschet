"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Loader2,
  Copy,
  Check,
  CircleStop,
  Download,
  MessageSquare,
  FileText,
  FilePlus2,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { defaultModelId, defaultModels } from "@/lib/chat/models";
import type { ModelInfo } from "@/lib/chat/types";
import { newId } from "@/lib/chat/storage";

const LS_KEY = "celiuz:lastConversationId";
/** Handoff to the chat composer — consumed by ChatPanel on mount. */
const BUILD_DRAFT_KEY = "celiuz:pendingComposerDraft";

const BUILD_INSTRUCTION =
  "Implementasikan PRD di atas ke repo yang saya pilih. Mulai dari Phase 1 " +
  "(MVP): siapkan struktur project dan fitur inti sesuai spesifikasi, " +
  "kerjakan bertahap, dan jalankan build untuk verifikasi sebelum membuka PR.";

const PRD_SYSTEM_PROMPT = `You are an expert Principal Product Manager. Your task is to transform the user's application idea into a comprehensive, high-level Product Requirement Document (PRD).

The user's first message is the app idea. Do not ask clarifying questions — where the idea is ambiguous, make a sensible decision and record it under "Assumptions".

The PRD must be well-structured, professional, and detailed. Use the following markdown structure:

# Product Requirement Document (PRD)

## 1. Executive Summary & Objective
- **Product Name**: Propose a suitable name based on the idea.
- **Problem Statement**: What problem is this solving?
- **Target Audience**: Who is the primary user?
- **Value Proposition**: Why does this product need to exist?
- **Assumptions**: Explicit decisions you made where the idea was ambiguous.

## 2. User Personas & Use Cases
- Describe 2-3 key user personas.
- Define a realistic user journey or key use cases for each persona.

## 3. Scope & MVP Features
Clearly partition the scope into:
- **Phase 1 (MVP)**: Critical core features, as a table with columns: Feature | Priority (P0/P1) | Acceptance criteria (one concrete, testable sentence).
- **Phase 2 (Post-MVP / Future Scope)**: Nice-to-have features.
- **Out of Scope**: What this product deliberately will NOT do, so the MVP stays small.

## 4. Functional Specifications
Detail the specifications for each core MVP module:
- E.g., User Authentication (OAuth, Email/Password), Dashboard, Main workflow pages, API endpoints structure.

## 5. Non-Functional Specifications
- **Security**: Data encryption, role-based access, token management.
- **Performance & Scale**: Caching, database indexing, latency expectations.
- **Availability & Compliance**: SLA targets, GDPR/privacy compliance considerations.

## 6. Technical Stack Recommendations
Propose a modern, scalable tech stack, explaining why for each choice:
- **Frontend Framework**: (e.g., Next.js App Router, React)
- **Database / Backend**: (e.g., Supabase, Postgres)
- **Styling**: (e.g., Tailwind CSS)
- **Hosting / Infra**: (e.g., Vercel)
- **Draft DB Schema**: Provide a simple relational database schema layout (tables and relationships).

## 7. Success Metrics
- One north-star metric, 3-4 supporting KPIs with realistic targets, and 1-2 guardrail metrics (what must NOT get worse).

## 8. Risks & Open Questions
- Top 3-5 risks (technical, product, or market) each with a one-line mitigation.
- Open questions that need an answer from the founder before or during the MVP build.

## 9. Next Actions & Milestones
- List 3-4 concrete development milestones to bring the MVP to life.

Be detailed but disciplined: prefer precise specifics over filler so the document stays scannable. Write in Indonesian if the user prompt is in Indonesian, otherwise write in English.

Hard rules — violating any of these makes the document unusable:
1. LANGUAGE PURITY: the entire document must contain ONLY the target language (Indonesian or English) plus universal technical terms. Never emit characters from any other script (Chinese, Cyrillic, etc.) — if one surfaces in your draft, replace it with the target-language word (e.g. write "kartu kredit", never 信用卡).
2. RUTHLESS MVP: Phase 1 may contain AT MOST 7 features, and at most 5 of them P0. An MVP is what a small team ships in a few weeks — everything else moves to Phase 2, however tempting.
3. VALID CODE ONLY: any SQL or code snippet must be syntactically valid and runnable exactly as written. If you cannot guarantee that, write clearly labelled pseudocode instead — never broken code dressed as real code.
4. INTERNAL CONSISTENCY: before finishing, re-check that no section contradicts another (e.g. a listing must not show "rating" if reviews are scheduled for Phase 2).
5. PROPORTIONATE NFRs: keep non-functional targets honest for an MVP scale — no multi-region failover, no five-nines SLA for a pilot with a handful of customers.

When the user sends a follow-up revision request (e.g. "make the MVP smaller", "switch the stack to Laravel"), output the COMPLETE revised PRD — the full document with the change applied and all unchanged sections kept intact — never a diff or a partial answer.`;

/** Example ideas for the empty state — one tap fills the textarea. */
const EXAMPLE_IDEAS = [
  "Aplikasi kasir untuk warung makan: catat pesanan per meja, hitung total, laporan penjualan harian via WhatsApp",
  "Platform booking lapangan futsal dengan pembayaran DP online dan pengingat jadwal otomatis",
  "Tool internal untuk tim sales: pipeline sederhana, follow-up reminder, dan laporan mingguan otomatis ke atasan",
];

/** One-tap refinement chips shown under a finished PRD. */
const REFINE_CHIPS = [
  "Persempit scope MVP-nya",
  "Tambah timeline & estimasi per milestone",
  "Detailkan skema database-nya",
  "Tulis versi English",
];

export default function PRDGeneratorPage() {
  const router = useRouter();
  const [models, setModels] = React.useState<ModelInfo[]>(defaultModels);
  const [modelId, setModelId] = React.useState<string>(defaultModelId);
  const [appIdea, setAppIdea] = React.useState("");
  const [refineText, setRefineText] = React.useState("");
  // Resettable: "PRD baru" starts a fresh conversation so a new idea never
  // inherits context (and revisions) from the previous one.
  const [conversationId, setConversationId] = React.useState(() => newId());
  const [copied, setCopied] = React.useState(false);
  const [downloaded, setDownloaded] = React.useState(false);

  // Fetch the live model list
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => r.json())
      .then((json: { models?: ModelInfo[] }) => {
        if (cancelled) return;
        if (Array.isArray(json.models) && json.models.length > 0) {
          setModels(json.models);
          if (!json.models.some((m) => m.id === modelId)) {
            setModelId(json.models[0].id);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modelIdRef = React.useRef(modelId);
  React.useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);

  /* eslint-disable react-hooks/refs */
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          model: modelIdRef.current,
          system: PRD_SYSTEM_PROMPT,
          conversationId,
        }),
      }),
    [conversationId],
  );
  /* eslint-enable react-hooks/refs */

  const { messages, sendMessage, status, error, stop } = useChat({
    id: conversationId,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";
  const hasStarted = messages.length > 0;

  // Latest assistant text = the current PRD (revisions replace the view).
  const prdOutput = React.useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return "";
    if (!lastMsg.parts) return "";
    return lastMsg.parts
      .map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
      .filter(Boolean)
      .join("");
  }, [messages]);

  const revisionCount = React.useMemo(
    () => messages.filter((m) => m.role === "assistant").length,
    [messages],
  );

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!appIdea.trim() || isStreaming || hasStarted) return;
    // Send the bare idea — the system prompt frames the task, and the
    // conversation title (derived from the first user message) stays clean.
    sendMessage({ text: appIdea.trim() });
  }

  function handleRefine(e: React.FormEvent) {
    e.preventDefault();
    const text = refineText.trim();
    if (!text || isStreaming) return;
    setRefineText("");
    sendMessage({ text });
  }

  function handleRefineChip(text: string) {
    if (isStreaming) return;
    sendMessage({ text });
  }

  function handleStop() {
    // Generation runs detached on the server now — stopping the client fetch
    // alone would leave the run working (and spending credits) in the
    // background, so also kill the server-side run.
    stop();
    void fetch(`/api/chat/${conversationId}/stream`, { method: "DELETE" }).catch(() => {});
  }

  function handleNewPrd() {
    if (isStreaming) handleStop();
    setConversationId(newId());
    setAppIdea("");
    setRefineText("");
    setCopied(false);
    setDownloaded(false);
  }

  async function handleCopy() {
    if (!prdOutput) return;
    try {
      await navigator.clipboard.writeText(prdOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function handleDownload() {
    if (!prdOutput) return;
    try {
      const blob = new Blob([prdOutput], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PRD-${appIdea.slice(0, 20).replace(/[^a-z0-9]/gi, "_")}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch {
      // ignore
    }
  }

  /** "Buat di Chat" — open this same conversation in the chat (the PRD is
   *  already in its history, so the agent has full context) with a build
   *  instruction pre-filled in the composer. The user picks a repo, hits
   *  send, and Agent Mode starts implementing. */
  function handleBuildFromPrd() {
    if (!conversationId) return;
    try {
      localStorage.setItem(LS_KEY, conversationId);
      localStorage.setItem(
        BUILD_DRAFT_KEY,
        JSON.stringify({ conversationId, text: BUILD_INSTRUCTION }),
      );
    } catch {}
    router.push("/ai-chat");
  }

  return (
    // min-w-0 is load-bearing: the dashboard <main> is a flex column, so this
    // page is a flex item whose min-width:auto floor otherwise lets wide
    // unbreakable children (idea chips, PRD tables/ASCII schema) push the
    // whole column past the mobile viewport instead of scrolling internally.
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 py-6">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              PRD Generator
            </h1>
            <p className="text-sm text-muted-foreground">
              Ubah ide aplikasi jadi Product Requirement Document yang terstruktur — lalu revisi sampai pas.
            </p>
          </div>
        </div>
        {hasStarted && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewPrd}
            className="flex shrink-0 items-center gap-1.5"
          >
            <FilePlus2 className="size-4" />
            <span className="hidden sm:inline">PRD baru</span>
          </Button>
        )}
      </div>

      {/* Input Section — locks after the first generation; refinement takes over. */}
      {!hasStarted && (
        <Card className="p-6">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-foreground">
                Jelaskan ide aplikasi Anda
              </label>
              <textarea
                value={appIdea}
                onChange={(e) => setAppIdea(e.target.value)}
                placeholder="Contoh: Aplikasi belanja kebutuhan harian untuk lansia — teks besar, perintah suara, dan tagihan yang bisa dipantau keluarga..."
                rows={4}
                disabled={isStreaming}
                className="mt-1 block w-full resize-none rounded-lg border border-border bg-card px-4 py-3 text-[14px] outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/30"
                required
              />
            </div>

            {!appIdea.trim() && (
              <div className="flex flex-wrap gap-2" aria-label="Contoh ide">
                {EXAMPLE_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => setAppIdea(idea)}
                    className="max-w-full truncate rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={idea}
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Model:</span>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  disabled={isStreaming}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="submit"
                disabled={isStreaming || !appIdea.trim()}
                className="flex items-center gap-2"
              >
                <Sparkles className="size-4" />
                Generate PRD
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Output Section */}
      {hasStarted && (
        <Card className="flex flex-col p-6 min-h-[400px]">
          {/* Action header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-muted-foreground" />
              Product Requirement Document
              {revisionCount > 1 && (
                <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Revisi {revisionCount - 1}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isStreaming ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStop}
                  className="flex items-center gap-1.5 h-8 text-xs"
                >
                  <CircleStop className="size-3.5" />
                  Stop
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!prdOutput}
                    className="flex items-center gap-1.5 h-8 text-xs"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    Copy
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!prdOutput}
                    className="flex items-center gap-1.5 h-8 text-xs"
                  >
                    {downloaded ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    .md
                  </Button>

                  {/* One primary action: opens the same conversation in the
                      chat with the build instruction pre-filled (merger of
                      the old "Buka di Chat" + "Bangun dari PRD"). */}
                  <Button
                    size="sm"
                    onClick={handleBuildFromPrd}
                    disabled={!prdOutput}
                    className="flex items-center gap-1.5 h-8 text-xs"
                  >
                    <MessageSquare className="size-3.5" />
                    Buat di Chat
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Render streaming markdown */}
          <div className="flex-1 overflow-y-auto">
            {prdOutput ? (
              <Markdown streaming={isStreaming}>{prdOutput}</Markdown>
            ) : (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                Menyusun PRD…
              </div>
            )}
          </div>

          {/* Refinement — iterate on the SAME document without leaving the page. */}
          {!isStreaming && prdOutput && (
            <div className="mt-4 border-t border-border/60 pt-4">
              <div className="mb-2 flex flex-wrap gap-2" aria-label="Revisi cepat">
                {REFINE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleRefineChip(chip)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <form onSubmit={handleRefine} className="flex items-center gap-2">
                <input
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  placeholder="Minta revisi… (mis. ganti stack ke Laravel, tambah fitur pembayaran)"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!refineText.trim()}
                  className="flex h-10 items-center gap-1.5 px-4"
                >
                  <Send className="size-3.5" />
                  <span className="hidden sm:inline">Revisi</span>
                </Button>
              </form>
            </div>
          )}
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong className="font-semibold">Error:</strong> {error.message}
        </div>
      )}
    </div>
  );
}
