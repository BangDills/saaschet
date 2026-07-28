"use client";

import { ChatGLM, DeepSeek, Kimi, Minimax, Qwen } from "@lobehub/icons";

/**
 * Bundled brand icons for the landing model grid. The icons ship with
 * @lobehub/icons (already a dependency), so nothing is fetched from a CDN at
 * runtime — no broken-image state when unpkg is slow, blocked, or changes
 * under its mutable @latest tag.
 */
const ICONS = {
  chatglm: ChatGLM.Color,
  // Kimi.Color is a white glyph meant for dark backgrounds — invisible on the
  // light theme. The bare export is the mono mark (currentColor), which is
  // both brand-accurate and theme-proof.
  kimi: Kimi,
  deepseek: DeepSeek.Color,
  qwen: Qwen.Color,
  minimax: Minimax.Color,
} as const;

export type ModelIconName = keyof typeof ICONS;

export function ModelIcon({ name, size = 32 }: { name: ModelIconName; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden="true" />;
}
