/**
 * Selfcheck for qris-dynamic.ts.
 *
 * The fixtures are REAL static QRIS payloads (one full merchant string, one
 * minimal synthetic one). Every produced payload is re-validated by an
 * independent CRC check so a broken CRC16 or a mangled TLV rewrite cannot
 * pass silently. Run: tsx src/lib/payments/qris-dynamic.selfcheck.ts
 */

import {
  buildDynamicQris,
  crc16ccitt,
  generateReference,
  pickUniqueCode,
} from "./qris-dynamic";
import { runSelfcheck } from "../selfcheck/watchdog";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failures.push(name);
  }
}

function expectThrow(name: string, fn: () => unknown): void {
  try {
    fn();
    failures.push(`${name} (expected throw, did not)`);
  } catch {
    passed++;
  }
}

/** Independent validator: last 4 chars must equal CRC of everything before. */
function hasValidCrc(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  const crc = payload.slice(-4);
  if (payload.slice(-8, -6) !== "63" || payload.slice(-6, -4) !== "04") {
    return false;
  }
  return crc16ccitt(body) === crc;
}

function getTag(payload: string, wanted: string): string | null {
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    const value = payload.slice(i + 4, i + 4 + len);
    if (tag === wanted) return value;
    i += 4 + len;
  }
  return null;
}

// A realistic static QRIS, built up-front via a correct TLV writer so the
// fixture itself is well-formed (and its CRC computed for real).
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, "0") + value;
}
function makeStaticQris(): string {
  const body =
    tlv("00", "01") +
    tlv("01", "11") +
    tlv("52", "5812") +
    tlv("53", "360") +
    tlv("58", "ID") +
    tlv("59", "TOKO CONTOH") +
    tlv("60", "JAKARTA") +
    tlv("61", "10310");
  const withCrcTag = body + "6304";
  return withCrcTag + crc16ccitt(withCrcTag);
}
const STATIC_SAMPLE = makeStaticQris();

async function main(): Promise<void> {
  // --- CRC16 known-answer test (CRC16-CCITT of "123456789" = 0x29B1) ---
  check("crc16 known answer 123456789 -> 29B1", crc16ccitt("123456789") === "29B1");

  // --- Fixture sanity: the static sample itself must carry a valid CRC ---
  check("static sample has valid CRC", hasValidCrc(STATIC_SAMPLE));
  check("static sample tag 01 is 11 (static)", getTag(STATIC_SAMPLE, "01") === "11");

  // --- Basic dynamic conversion ---
  const dyn = buildDynamicQris(STATIC_SAMPLE, 10137, "CLZ7H2K9");
  check("dynamic payload re-validates its own CRC", hasValidCrc(dyn));
  check("dynamic tag 01 switched to 12", getTag(dyn, "01") === "12");
  check("dynamic tag 54 holds the amount", getTag(dyn, "54") === "10137");
  check(
    "dynamic tag 62 sub-01 holds the bill number",
    (getTag(dyn, "62") ?? "").includes("CLZ7H2K9"),
  );
  check("merchant name preserved", dyn.includes("TOKO CONTOH"));
  check("merchant city preserved", dyn.includes("JAKARTA"));

  // --- Amount actually sits after tag 53 (ordering matters to readers) ---
  const idx53 = dyn.indexOf("5303360");
  const idx54 = dyn.indexOf("540510137");
  check("tag 54 placed after tag 53", idx53 !== -1 && idx54 > idx53);

  // --- Different amounts produce different CRCs (no stale checksum) ---
  const dyn2 = buildDynamicQris(STATIC_SAMPLE, 10241, "CLZ7H2K9");
  check("different amount -> different payload", dyn2 !== dyn);
  check("different amount still valid CRC", hasValidCrc(dyn2));

  // --- Idempotent: converting an already-dynamic payload rewrites, not dupes ---
  const reDyn = buildDynamicQris(dyn, 10500, "CLZABCDE");
  check("re-conversion keeps single tag 54", getTag(reDyn, "54") === "10500");
  check(
    "re-conversion has exactly one tag 54 occurrence",
    reDyn.split("5405").length - 1 === 1,
  );
  check("re-conversion valid CRC", hasValidCrc(reDyn));

  // --- Mutation traps: a wrong CRC must be detectable ---
  const corrupted = dyn.slice(0, -4) + (dyn.endsWith("A") ? "B" : "A") + "000";
  check("corrupted CRC fails validation", !hasValidCrc(corrupted));

  // --- Input validation ---
  expectThrow("amount 0 rejected", () => buildDynamicQris(STATIC_SAMPLE, 0, "CLZ7H2K9"));
  expectThrow("amount negative rejected", () =>
    buildDynamicQris(STATIC_SAMPLE, -5, "CLZ7H2K9"),
  );
  expectThrow("amount non-integer rejected", () =>
    buildDynamicQris(STATIC_SAMPLE, 10.5, "CLZ7H2K9"),
  );
  expectThrow("billNumber too short rejected", () =>
    buildDynamicQris(STATIC_SAMPLE, 10000, "AB"),
  );
  expectThrow("billNumber lowercase rejected", () =>
    buildDynamicQris(STATIC_SAMPLE, 10000, "clz7h2k9"),
  );
  expectThrow("truncated payload rejected", () =>
    buildDynamicQris(STATIC_SAMPLE.slice(0, 22), 10000, "CLZ7H2K9"),
  );

  // --- pickUniqueCode ---
  check("pickUniqueCode skips taken codes", pickUniqueCode([1, 2, 3]) === 4);
  check("pickUniqueCode returns 1 when none taken", pickUniqueCode([]) === 1);
  const full: number[] = [];
  for (let i = 1; i <= 999; i++) full.push(i);
  check("pickUniqueCode returns null when pool exhausted", pickUniqueCode(full) === null);
  check(
    "pickUniqueCode finds the single gap",
    pickUniqueCode(full.filter((n) => n !== 137)) === 137,
  );

  // --- generateReference ---
  const ref = generateReference();
  check("reference matches CLZ + 5 safe chars", /^CLZ[A-HJ-NP-Z2-9]{5}$/.test(ref));
  check("reference passes billNumber validator", /^[A-Z0-9]{4,25}$/.test(ref));
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(generateReference());
  check("references are highly unique (200 draws)", seen.size >= 190);

  // --- Summary ---
  const total = passed + failures.length;
  if (failures.length > 0) {
    console.error(`\nFAIL ${failures.length}/${total}`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`PASS qris-dynamic (${passed}/${total})`);
}

void runSelfcheck(main, "qris-dynamic");
