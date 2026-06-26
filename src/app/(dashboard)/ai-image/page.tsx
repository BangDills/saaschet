"use client";

import * as React from "react";
import {
  ImageIcon,
  Loader2,
  Download,
  Copy,
  Check,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fireCreditsRefresh } from "@/components/dashboard/credits-meter";

const IMAGE_MODELS = [
  // ── Alibaba Cloud Model Studio (MaaS) ──
  { id: "wan2.7-image-pro", name: "Wan 2.7 Image Pro", provider: "Alibaba" },
  { id: "wan2.7-image", name: "Wan 2.7 Image", provider: "Alibaba" },
  { id: "qwen-image-2.0-pro", name: "Qwen Image 2.0 Pro", provider: "Alibaba" },
  { id: "z-image-turbo", name: "Z Image Turbo", provider: "Alibaba" },

  // ── Pollinations.ai (free, no key needed) ──
  { id: "zimage", name: "Z Image", provider: "Pollinations" },
  { id: "flux", name: "Flux Schnell", provider: "Pollinations" },
  { id: "gptimage", name: "GPT Image", provider: "Pollinations" },
  { id: "seedream", name: "Seedream", provider: "Pollinations" },
  { id: "kontext", name: "Kontext", provider: "Pollinations" },
  { id: "wan-image", name: "Wan Image", provider: "Pollinations" },
  { id: "grok-imagine", name: "Grok Imagine", provider: "Pollinations" },
  { id: "nova-canvas", name: "Nova Canvas", provider: "Pollinations" },
  { id: "qwen-image", name: "Qwen Image", provider: "Pollinations" },
];

const DIMENSION_PRESETS = [
  { id: "1024x1024", name: "1:1 Square (1024x1024)" },
  { id: "1536x1024", name: "3:2 Landscape (1536x1024)" },
  { id: "1024x1536", name: "2:3 Portrait (1024x1536)" },
  { id: "1792x1024", name: "7:4 Wide (1792x1024)" },
];

export default function Page() {
  const [prompt, setPrompt] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState(IMAGE_MODELS[0].id);
  const [selectedSize, setSelectedSize] = React.useState(DIMENSION_PRESETS[0].id);
  const [generating, setGenerating] = React.useState(false);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setError(null);
    setImageUrl(null);

    try {
      const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel);
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel,
          size: selectedSize,
          provider: currentModel?.provider === "Pollinations" ? "pollinations" : "alibaba",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to generate image");
      }

      if (json.image) {
        setImageUrl(json.image);
        fireCreditsRefresh(); // Refresh credit meter in sidebar
      } else {
        throw new Error("No image data returned from API");
      }
    } catch (err) {
      console.error("[image] generate click error:", err);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!imageUrl) return;
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function handleDownload() {
    if (!imageUrl) return;
    try {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `Celiuz-AI-Image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <ImageIcon className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            AI Image Generator
          </h1>
          <p className="text-sm text-muted-foreground">
            Create high-quality custom visuals instantly using state-of-the-art diffusion models.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        {/* Left column: Controls */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="E.g., A cinematic shot of a sleek modern kitchen with dark marble counters, copper accents, and warm ambient lighting, 8k resolution..."
                  rows={5}
                  disabled={generating}
                  className="mt-1 block w-full resize-none rounded-lg border border-border bg-card px-4 py-3 text-[14px] outline-none placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/30"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">
                  Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={generating}
                  className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">
                  Dimensions
                </label>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  disabled={generating}
                  className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {DIMENSION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Note */}
              {IMAGE_MODELS.find((m) => m.id === selectedModel)?.provider === "Pollinations" ? (
                <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-600 dark:text-sky-300">
                  <Zap className="size-4 shrink-0" />
                  <span>Free via Pollinations.ai — 5 credits still apply for usage tracking</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300">
                  <Zap className="size-4 shrink-0" />
                  <span>Costs 5 credits per image generation</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={generating || !prompt.trim()}
                className="w-full flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate Image
                  </>
                )}
              </Button>
            </form>
          </Card>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Right column: Preview Card */}
        <div className="md:col-span-3">
          <Card className="flex flex-col h-full min-h-[450px] overflow-hidden">
            {/* Header toolbar */}
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-3 shrink-0">
              <span className="text-sm font-semibold text-foreground">
                Output Preview
              </span>

              {imageUrl && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
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
                        Copy URL
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 h-8 text-xs"
                  >
                    <Download className="size-3.5" />
                    Download
                  </Button>
                </div>
              )}
            </div>

            {/* Display Body */}
            <div className="flex-1 flex items-center justify-center bg-zinc-950/5 p-6 relative">
              {generating ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Generating your masterpiece...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This takes 5–15 seconds depending on server load.
                    </p>
                  </div>
                </div>
              ) : imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Generated AI art"
                  className="max-h-[500px] w-auto max-w-full rounded-lg object-contain shadow-md border border-border"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-center py-20 text-muted-foreground/60">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40">
                    <ImageIcon className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      No image generated yet
                    </p>
                    <p className="max-w-xs text-xs">
                      Enter a detailed prompt on the left and click Generate to see your visual ideas come to life.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
