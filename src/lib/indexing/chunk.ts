/**
 * File chunking for the repo semantic index.
 *
 * Deliberately naive (line-window with overlap) instead of AST-aware:
 * fast, deterministic, language-agnostic, and good enough for v1 recall.
 * Upgrade path: split on function/class boundaries via tree-sitter.
 */

export type Chunk = {
  chunkIndex: number;
  /** 1-based, inclusive */
  startLine: number;
  /** 1-based, inclusive */
  endLine: number;
  content: string;
};

const CHUNK_LINES = 40;
const OVERLAP_LINES = 6;
const MAX_FILE_BYTES = 200 * 1024; // 200KB — larger files are read directly, not indexed

/** Extensions worth embedding. Allowlist beats blocklist: unknown/binary
 *  formats never make it into the index by accident. */
const INDEXABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php",
  ".cs", ".cpp", ".cc", ".c", ".h", ".hpp",
  ".sql", ".md", ".mdx", ".json", ".yaml", ".yml", ".toml",
  ".sh", ".bash", ".zsh", ".css", ".scss", ".html", ".vue", ".svelte",
  ".prisma", ".graphql", ".proto",
]);

/** Paths that must NEVER be embedded — secrets and env files. Matching is
 *  on the basename so nested paths are covered too.
 *
 *  Exported so the selfcheck can test it head-on. Reached only through
 *  isIndexablePath, most of these branches cannot change any outcome: nothing
 *  ending in .pem or .key carries an allowlisted extension, so the allowlist
 *  rejects those files first and a regression in here would be invisible. What
 *  the allowlist does NOT cover is a secret wearing an indexable extension —
 *  secrets.json, .env.json — and that is the case worth guarding. */
export function isSecretPath(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return (
    base.startsWith(".env") || // .env, .env.local, .env.production…
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.endsWith(".p12") ||
    base.endsWith(".pfx") ||
    base === "id_rsa" ||
    base === "id_ed25519" ||
    base === "secrets.json"
  );
}

function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

/** Should this repo path be fetched + chunked + embedded at all? */
export function isIndexablePath(path: string, size?: number): boolean {
  if (isSecretPath(path)) return false;
  const ext = extensionOf(path);
  if (!INDEXABLE_EXTENSIONS.has(ext)) return false;
  if (typeof size === "number" && size > MAX_FILE_BYTES) return false;
  return true;
}

/** Cheap binary sniff: NUL byte in the first 512 chars of decoded text. */
export function looksBinary(text: string): boolean {
  // Escaped, not a literal NUL byte: a raw 0x00 in the source makes this
  // file read as binary to grep/ripgrep (so it silently drops out of code
  // searches) and risks being mangled by tools that move text through
  // APIs. The escape is the same character to the runtime.
  return text.slice(0, 512).includes("\u0000");
}

/**
 * Split file text into overlapping line windows.
 *
 * Empty/tiny files produce zero chunks (nothing worth retrieving).
 * Overlap keeps context that straddles a boundary readable in both chunks.
 */
export function chunkFile(_path: string, text: string): Chunk[] {
  const lines = text.split("\n");
  if (lines.length < 5) return [];

  const chunks: Chunk[] = [];
  const step = CHUNK_LINES - OVERLAP_LINES;

  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + CHUNK_LINES, lines.length);
    const content = lines.slice(start, end).join("\n").trim();
    if (content.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        startLine: start + 1, // 1-based
        endLine: end,
        content,
      });
    }
    if (end === lines.length) break;
  }

  return chunks;
}
