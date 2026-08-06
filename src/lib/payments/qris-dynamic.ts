/**
 * QRIS static → dynamic payload conversion (EMVCo Merchant Presented Mode).
 *
 * A static QRIS string (tag 01 = "11") carries no amount and no reference, so
 * every payer types the nominal by hand and no two checkouts can be told
 * apart from the merchant side. This module rewrites the payload into a
 * dynamic one (tag 01 = "12") with:
 *   - tag 54            = the exact amount (unique per checkout, see below)
 *   - tag 62 sub-tag 01 = the Bill Number (human reference, e.g. "CLZ7H2K9")
 * and recomputes the CRC16-CCITT checksum (tag 63). The money still lands in
 * the SAME merchant account and the payer's app still shows the SAME merchant
 * name — only the payload changed.
 *
 * Uniqueness strategy: the UNIQUE reference a merchant actually sees in their
 * bank/e-wallet mutation feed is the AMOUNT, not tag 62 (many apps never
 * surface the bill number). So the caller adds a small unique code to the
 * base price (e.g. 10.000 + 137 = Rp10.137) and passes it as `amount`.
 *
 * Pure module — no `@/` aliases, no imports — so it can run under tsx in the
 * selfcheck suite.
 */

/** CRC16-CCITT (poly 0x1021, init 0xFFFF, no reflection) over ASCII bytes. */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

type Tlv = { tag: string; value: string };

/** Split an EMVCo payload into TLV segments. Strict: rejects truncation. */
function parseTlv(payload: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) {
      throw new Error("QRIS payload truncated (segment header)");
    }
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) {
      throw new Error(`QRIS payload malformed at offset ${i}`);
    }
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) {
      throw new Error(`QRIS payload truncated (tag ${tag})`);
    }
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

function serializeTlv(segments: Tlv[]): string {
  return segments
    .map((s) => s.tag + String(s.value.length).padStart(2, "0") + s.value)
    .join("");
}

function subTag01(billNumber: string): string {
  const v = "01" + String(billNumber.length).padStart(2, "0") + billNumber;
  return v;
}

/**
 * Convert a static QRIS payload to a dynamic one with an amount + bill number.
 *
 * @param staticQris  The static QRIS string from the merchant's printed QR.
 * @param amount      Integer IDR amount (already includes the unique code).
 * @param billNumber  Short human reference shown to the user (A-Z0-9, ≤25).
 * @returns           A complete dynamic QRIS payload, CRC included.
 */
export function buildDynamicQris(
  staticQris: string,
  amount: number,
  billNumber: string,
): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amount must be a positive integer (IDR)");
  }
  if (!/^[A-Z0-9]{4,25}$/.test(billNumber)) {
    throw new Error("billNumber must be 4-25 chars of A-Z0-9");
  }

  // Strip the existing CRC (tag 63, always last, 4-char value) if present.
  let body = staticQris.trim();
  if (body.length < 8) throw new Error("QRIS payload too short");
  if (body.slice(-8, -6) === "63" && body.slice(-6, -4) === "04") {
    body = body.slice(0, -8);
  }

  const segments = parseTlv(body);

  const out: Tlv[] = [];
  let inserted54 = false;
  for (const seg of segments) {
    if (seg.tag === "01") {
      out.push({ tag: "01", value: "12" }); // static → dynamic
      continue;
    }
    if (seg.tag === "54") continue; // drop any pre-existing amount
    if (seg.tag === "62") continue; // drop any pre-existing additional data
    // Amount must come after tag 53 (currency). Insert right after 53.
    if (seg.tag === "53") {
      out.push(seg);
      out.push({ tag: "54", value: String(amount) });
      inserted54 = true;
      continue;
    }
    out.push(seg);
  }

  // If no tag 53 existed (shouldn't happen in valid QRIS), append amount.
  if (!inserted54) out.push({ tag: "54", value: String(amount) });

  out.push({ tag: "62", value: subTag01(billNumber) });

  const withoutCrc = serializeTlv(out) + "6304";
  return withoutCrc + crc16ccitt(withoutCrc);
}

/**
 * Pick a unique amount suffix in [1, 999] that is not already taken by a
 * pending payment. Returns null when the pool is exhausted.
 */
export function pickUniqueCode(taken: number[]): number | null {
  const used = new Set(taken);
  for (let code = 1; code <= 999; code++) {
    if (!used.has(code)) return code;
  }
  return null;
}

/** Generate a short human reference like "CLZ7H2K9" (A-Z0-9, no ambiguous 0/O/1/I). */
export function generateReference(rand: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "CLZ";
  for (let i = 0; i < 5; i++) {
    out += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return out;
}
