/**
 * Server-side payment configuration. All values come from the environment;
 * none are NEXT_PUBLIC (the static QRIS string is a secret-ish merchant
 * payload and must never ship to the client — the client only ever receives
 * the derived per-checkout DYNAMIC payload).
 */

import { envNumber } from "../env";

/** Base Pro 24h price in IDR, before the unique-amount code is added. */
export function proPriceIdr(): number {
  return envNumber("PRO_PRICE_IDR", 10_000, {
    min: 1_000,
    max: 10_000_000,
    integer: true,
  });
}

/** How long a checkout stays open before it expires (minutes). */
export function paymentExpiryMinutes(): number {
  return envNumber("PAYMENT_EXPIRY_MINUTES", 30, { min: 5, max: 240, integer: true });
}

/**
 * The merchant's STATIC QRIS string (from the printed QR). Required at
 * checkout time — /api/payments/create returns 503 if unset, so the feature
 * fails loudly in config rather than silently producing a broken QR.
 */
export function staticQrisString(): string {
  const raw = process.env.QRIS_STATIC_STRING;
  if (!raw || raw.trim() === "") {
    throw new Error("QRIS_STATIC_STRING is not configured");
  }
  return raw.trim();
}
