const CONTEXT7_BASE_URL = "https://context7.com";

export type Context7Library = {
  id: string;
  name: string;
  description: string;
  totalSnippets?: number;
  trustScore?: number;
  benchmarkScore?: number;
  versions?: string[];
};

type Context7SearchResponse = {
  results?: Array<{
    id?: string;
    name?: string;
    title?: string;
    description?: string;
    totalSnippets?: number;
    total_snippets?: number;
    trustScore?: number;
    trust_score?: number;
    benchmarkScore?: number;
    benchmark_score?: number;
    versions?: string[];
  }>;
};

function context7Headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

async function readContext7Error(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string; message?: string };
    return json.message || json.error || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function searchContext7Libraries({
  apiKey,
  libraryName,
  query,
}: {
  apiKey: string;
  libraryName: string;
  query: string;
}): Promise<Context7Library[]> {
  const url = new URL("/api/v2/libs/search", CONTEXT7_BASE_URL);
  url.searchParams.set("libraryName", libraryName);
  url.searchParams.set("query", query);

  const res = await fetch(url, {
    headers: context7Headers(apiKey),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Context7 library search failed: ${await readContext7Error(res)}`);
  }

  const json = (await res.json()) as Context7SearchResponse;
  return (json.results ?? [])
    .filter((library) => typeof library.id === "string")
    .map((library) => ({
      id: library.id!,
      name: library.name || library.title || library.id!,
      description: library.description || "",
      totalSnippets: library.totalSnippets ?? library.total_snippets,
      trustScore: library.trustScore ?? library.trust_score,
      benchmarkScore: library.benchmarkScore ?? library.benchmark_score,
      versions: library.versions,
    }));
}

export async function getContext7Docs({
  apiKey,
  libraryId,
  query,
  type = "txt",
}: {
  apiKey: string;
  libraryId: string;
  query: string;
  type?: "txt" | "json";
}): Promise<string> {
  const url = new URL("/api/v2/context", CONTEXT7_BASE_URL);
  url.searchParams.set("libraryId", libraryId);
  url.searchParams.set("query", query);
  url.searchParams.set("type", type);

  const res = await fetch(url, {
    headers: context7Headers(apiKey),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Context7 docs fetch failed: ${await readContext7Error(res)}`);
  }

  if (type === "txt") {
    return await res.text();
  }

  return JSON.stringify(await res.json(), null, 2);
}
