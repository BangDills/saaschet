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
  Download,
  MessageSquare,
  FileText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/chat/markdown";
import { defaultModelId, defaultModels } from "@/lib/chat/models";
import type { ModelInfo } from "@/lib/chat/types";
import { newId } from "@/lib/chat/storage";

const LS_KEY = "saaschet:lastConversationId";

const PRD_SYSTEM_PROMPT = `You are an expert Principal Product Manager. Your task is to transform the user's application idea into a comprehensive, high-level Product Requirement Document (PRD).

The PRD must be well-structured, professional, and detailed. Use the following markdown structure:

# Product Requirement Document (PRD)

## 1. Executive Summary & Objective
- **Product Name**: Propose a suitable name based on the idea.
- **Problem Statement**: What problem is this solving?
- **Target Audience**: Who is the primary user?
- **Value Proposition**: Why does this product need to exist?

## 2. User Personas & Use Cases
- Describe 2-3 key user personas.
- Define a realistic user journey or key use cases for each persona.

## 3. Scope & MVP Features
Clearly partition the scope into:
- **Phase 1 (MVP - Minimum Viable Product)**: Critical core features (e.g., Auth, basic dashboard, CRUD operations).
- **Phase 2 (Post-MVP / Future Scope)**: Nice-to-have features (e.g., advanced AI integrations, mobile apps, real-time sync).

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

## 7. Next Actions & Milestones
- List 3-4 concrete development milestones to bring the MVP to life.

Be highly detailed, structured, and professional. Write in Indonesian if the user prompt is in Indonesian, otherwise write in English.`;

export default function PRDGeneratorPage() {
  const router = useRouter();
  const [models, setModels] = React.useState<ModelInfo[]>(defaultModels);
  const [modelId, setModelId] = React.useState<string>(defaultModelId);
  const [appIdea, setAppIdea] = React.useState("");
  const [conversationId] = React.useState(() => newId());
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

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Helper to extract text from AI SDK UIMessage parts
  const prdOutput = React.useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return "";
    if (!lastMsg.parts) return "";
    return lastMsg.parts
      .map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
      .filter(Boolean)
      .join("");
  }, [messages]);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!appIdea.trim() || isStreaming) return;
    sendMessage({ text: `Create a PRD for this app idea: "${appIdea}"` });
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

  function handleOpenInChat() {
    if (!conversationId) return;
    try {
      // Persist the conversation ID so the chat page auto-restores it on redirect
      localStorage.setItem(LS_KEY, conversationId);
      router.push("/ai-chat");
    } catch {
      router.push("/ai-chat");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ClipboardList className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            PRD Generator
          </h1>
          <p className="text-sm text-muted-foreground">
            Transform your app ideas into complete, structured Product Requirement Documents.
          </p>
        </div>
      </div>

      {/* Input Section */}
      <Card className="p-6">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              Describe your application idea
            </label>
            <textarea
              value={appIdea}
              onChange={(e) => setAppIdea(e.target.value)}
              placeholder="E.g., An on-demand grocery app for elderly users featuring simplified text size, voice commands, and family billing tracking..."
              rows={4}
              disabled={isStreaming}
              className="mt-1 block w-full resize-none rounded-lg border border-border bg-card px-4 py-3 text-[14px] outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/30"
              required
            />
          </div>

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
                    {m.label} ({m.vendor})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              disabled={isStreaming || !appIdea.trim()}
              className="flex items-center gap-2"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate PRD
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Output Section */}
      {(prdOutput || isStreaming) && (
        <Card className="flex flex-col p-6 min-h-[400px]">
          {/* Action header */}
          <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-muted-foreground" />
              Product Requirement Document
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!prdOutput}
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!prdOutput}
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                {downloaded ? (
                  <>
                    <Check className="size-3.5 text-emerald-500" />
                    Downloaded
                  </>
                ) : (
                  <>
                    <Download className="size-3.5" />
                    Download .md
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenInChat}
                disabled={!prdOutput || isStreaming}
                className="flex items-center gap-1.5 h-8 text-xs border-violet-500/30 hover:bg-violet-500/5 text-violet-600 dark:text-violet-300"
              >
                <MessageSquare className="size-3.5" />
                Open in Chat
              </Button>
            </div>
          </div>

          {/* Render streaming markdown */}
          <div className="flex-1 overflow-y-auto">
            <Markdown streaming={isStreaming}>{prdOutput}</Markdown>
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <strong className="font-semibold">Error:</strong> {error.message}
        </div>
      )}
    </div>
  );
}
