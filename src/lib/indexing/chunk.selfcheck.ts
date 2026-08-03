/**
 * Selfcheck for src/lib/indexing/chunk.ts
 *
 * Run: tsx src/lib/indexing/chunk.selfcheck.ts
 * Follows the project's selfcheck pattern (plain asserts, exit non-zero on failure).
 */

import { chunkFile, isIndexablePath, isSecretPath, looksBinary } from "./chunk";

let failures = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failures++;
  }
}

console.log("chunkFile");
{
  const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
  const chunks = chunkFile("a.ts", text);
  check("produces chunks for a 100-line file", chunks.length >= 3);
  check("first chunk starts at line 1", chunks[0]?.startLine === 1);
  check("first chunk covers 40 lines", chunks[0]?.endLine === 40);
  check(
    "consecutive chunks overlap by 6 lines",
    chunks[1]?.startLine === 35, // 40 - 6 + 1
  );
  check("last chunk reaches the final line", chunks.at(-1)?.endLine === 100);
  check("chunk_index is sequential", chunks.every((c, i) => c.chunkIndex === i));
}

{
  const tiny = "a\nb\nc";
  check("tiny files (<5 lines) produce no chunks", chunkFile("t.ts", tiny).length === 0);
}

{
  const empty = "";
  check("empty files produce no chunks", chunkFile("e.ts", empty).length === 0);
}

console.log("isIndexablePath");
{
  check(".ts is indexable", isIndexablePath("src/a.ts"));
  check(".tsx is indexable", isIndexablePath("src/a.tsx"));
  check(".sql is indexable", isIndexablePath("supabase/migrations/0001.sql"));
  check(".md is indexable", isIndexablePath("README.md"));
  check(".py is indexable", isIndexablePath("scripts/a.py"));
  check(".png is NOT indexable", !isIndexablePath("public/logo.png"));
  check(".lock is NOT indexable", !isIndexablePath("bun.lockb"));
  check("no-extension is NOT indexable", !isIndexablePath("Makefile"));
  check("oversized file is NOT indexable", !isIndexablePath("src/big.ts", 300 * 1024));
}

console.log("secret exclusion");
{
  check(".env skipped", !isIndexablePath(".env"));
  check(".env.local skipped", !isIndexablePath(".env.local"));
  check(".env.example skipped", !isIndexablePath(".env.example"));
  check("nested .env skipped", !isIndexablePath("packages/api/.env.production"));
  check(".pem skipped", !isIndexablePath("certs/private.pem"));
  check(".key skipped", !isIndexablePath("certs/app.key"));
  check("id_rsa skipped", !isIndexablePath("ssh/id_rsa"));

  // Everything above is decoration on its own: ".env", ".pem", ".key" and
  // "id_rsa" have no allowlisted extension, so the allowlist already rejects
  // them and these assertions keep passing even with isSecretPath deleted
  // (verified by mutation). The cases that actually pin secret exclusion are
  // secrets wearing an INDEXABLE extension — those reach isSecretPath or get
  // embedded. Losing these means real credentials land in the vector index.
  check("secrets.json skipped despite .json being indexable", !isIndexablePath("secrets.json"));
  check(".env.json skipped despite .json being indexable", !isIndexablePath("config/.env.json"));
  check(".env.yaml skipped despite .yaml being indexable", !isIndexablePath("deploy/.env.yaml"));

  // Tested head-on as well, because through isIndexablePath these branches are
  // unreachable-by-effect: the allowlist already rejects a .pem or an id_rsa,
  // so deleting them changes no observable behaviour today. They are the
  // defence that survives someone widening the allowlist later, and that only
  // holds if something actually pins them.
  check("isSecretPath: .env", isSecretPath(".env"));
  check("isSecretPath: nested .env.production", isSecretPath("packages/api/.env.production"));
  check("isSecretPath: .pem", isSecretPath("certs/private.pem"));
  check("isSecretPath: .key", isSecretPath("certs/app.key"));
  check("isSecretPath: .p12", isSecretPath("certs/bundle.p12"));
  check("isSecretPath: .pfx", isSecretPath("certs/bundle.pfx"));
  check("isSecretPath: id_rsa", isSecretPath("ssh/id_rsa"));
  check("isSecretPath: id_ed25519", isSecretPath("ssh/id_ed25519"));
  check("isSecretPath: secrets.json", isSecretPath("secrets.json"));
  check("isSecretPath: case-insensitive", isSecretPath("CERTS/PRIVATE.PEM"));
  check("isSecretPath: ordinary source file is not a secret", !isSecretPath("src/lib/env.ts"));
  check("isSecretPath: environment.ts is not a secret", !isSecretPath("src/environment.ts"));
}

console.log("looksBinary");
{
  check("plain text is not binary", !looksBinary("const a = 1;\nexport default a;"));
  check("NUL byte marks binary", looksBinary("abc\u0000def"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll chunk selfchecks passed");
