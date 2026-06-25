/**
 * Image lookup by name. Returns multiple candidates so the user can
 * disambiguate.
 *
 * Sources, in order:
 *   1. Naver image search — best for Korean commercial products (snacks, etc.).
 *      Routed through the dev proxy at /api/naver-image so the API secret stays
 *      server-side. Skipped automatically when the proxy/keys aren't configured.
 *   2. Wikipedia (ko → en) — clean entity portraits + Korean descriptions.
 *   3. Openverse — 800M+ openly-licensed images for broad fallback coverage.
 *
 * Sources 2–3 are keyless and CORS-enabled (work with no setup).
 */

export type ImageCandidate = {
  title: string;
  description?: string;
  thumbnail: string;
};

type NaverProxyResponse = {
  configured?: boolean;
  items?: Array<{ title?: string; thumbnail?: string }>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function naverCandidates(query: string): Promise<ImageCandidate[]> {
  // Retry a couple of times on 429 (rate limit) with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/naver-image?q=${encodeURIComponent(query)}`);
      if (res.status === 429) {
        await sleep(500 * (attempt + 1) + Math.random() * 300);
        continue;
      }
      if (!res.ok) return []; // not configured (501), no proxy (404), etc.
      const data: NaverProxyResponse = await res.json();
      return (data.items ?? [])
        .filter((it): it is { title?: string; thumbnail: string } =>
          Boolean(it.thumbnail),
        )
        .map((it) => ({
          title: it.title?.trim() || query,
          description: "네이버 이미지",
          thumbnail: it.thumbnail,
        }));
    } catch {
      return [];
    }
  }
  return [];
}

type WikiPage = {
  index: number;
  title: string;
  description?: string;
  thumbnail?: { source?: string };
};

async function wikipediaCandidates(
  query: string,
  lang: "ko" | "en",
): Promise<ImageCandidate[]> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "12");
  url.searchParams.set("prop", "pageimages|description");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "320");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 검색 실패 (${res.status})`);

  const data: { query?: { pages?: Record<string, WikiPage> } } =
    await res.json();
  const pages = data.query?.pages;
  if (!pages) return [];

  return Object.values(pages)
    .sort((a, b) => a.index - b.index)
    .filter((p): p is WikiPage & { thumbnail: { source: string } } =>
      Boolean(p.thumbnail?.source),
    )
    .map((p) => ({
      title: p.title,
      description: p.description,
      thumbnail: p.thumbnail.source,
    }));
}

type OpenverseResult = {
  title?: string;
  source?: string;
  thumbnail?: string;
};

async function openverseCandidates(query: string): Promise<ImageCandidate[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "12");

  const res = await fetch(url);
  if (!res.ok) return [];

  const data: { results?: OpenverseResult[] } = await res.json();
  return (data.results ?? [])
    .filter((r): r is OpenverseResult & { thumbnail: string } =>
      Boolean(r.thumbnail),
    )
    .map((r) => ({
      title: r.title?.trim() || query,
      description: r.source ? `Openverse · ${r.source}` : "Openverse",
      thumbnail: r.thumbnail,
    }));
}

/**
 * Returns image candidates for `name`: Naver (if configured) → Korean
 * Wikipedia → English Wikipedia → Openverse, using the first source with hits.
 */
export async function searchImageCandidates(
  name: string,
): Promise<ImageCandidate[]> {
  const q = name.trim();
  if (!q) return [];

  const naver = await naverCandidates(q);
  if (naver.length > 0) return naver;

  const ko = await wikipediaCandidates(q, "ko");
  if (ko.length > 0) return ko;

  const en = await wikipediaCandidates(q, "en");
  if (en.length > 0) return en;

  return openverseCandidates(q);
}
