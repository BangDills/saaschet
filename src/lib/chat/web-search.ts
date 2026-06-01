/**
 * Web search via Tavily AI (https://tavily.com).
 *
 * Tavily is purpose-built for AI agents — it returns clean, deduplicated
 * search results with optional pre-summarized answer text. Free tier:
 * 1000 searches/month.
 *
 * Set the env var `TAVILY_API_KEY` to enable web search. Without it, the
 * search route returns 503 and the chat falls back to model-only answers.
 */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type TavilyResponse = {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
};

type RawTavilyResponse = {
  query?: string;
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
};

export async function searchWeb(
  query: string,
  apiKey: string,
  options: { maxResults?: number; includeAnswer?: boolean } = {},
): Promise<TavilyResponse> {
  const { maxResults = 5, includeAnswer = true } = options;

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: includeAnswer,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as RawTavilyResponse;

  const cleaned: TavilySearchResult[] = (json.results ?? [])
    .filter((r) => Boolean(r.title && r.url && r.content))
    .map((r) => ({
      title: String(r.title),
      url: String(r.url),
      content: String(r.content),
      score: typeof r.score === "number" ? r.score : undefined,
    }));

  return {
    query: json.query ?? query,
    answer: json.answer,
    results: cleaned,
  };
}

/**
 * Render Tavily search results as Markdown for injection into the system
 * prompt. The model is instructed to cite these sources inline.
 */
export function formatSearchResults(response: TavilyResponse): string {
  const lines: string[] = [];

  lines.push(
    `# Web search results for: "${response.query}"\n` +
      `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
  );

  if (response.answer) {
    lines.push(`\n## Quick answer\n${response.answer}`);
  }

  lines.push("\n## Top results");
  response.results.forEach((r, i) => {
    lines.push(
      `\n### [${i + 1}] ${r.title}\n` +
        `Source: ${r.url}\n` +
        `${r.content}`,
    );
  });

  lines.push(
    "\n---\n" +
      "When using these results, cite the source by writing the number in " +
      "brackets like [1], [2] and include a short reference list at the end " +
      "with each source's URL.",
  );

  return lines.join("\n");
}
