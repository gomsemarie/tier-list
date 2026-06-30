export type OgCard = {
  url: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fallback(url: string): OgCard {
  return { url, title: hostOf(url), siteName: hostOf(url) };
}

/**
 * Fetch OpenGraph metadata for a URL via the dev `/api/og` proxy. Always
 * resolves (falls back to a bare host card on error). Caching/dedup is handled
 * by TanStack Query — see `useOg` in `lib/queries`.
 */
export function fetchOg(url: string): Promise<OgCard> {
  return fetch(`/api/og?url=${encodeURIComponent(url)}`)
    .then((r) => r.json())
    .then((d): OgCard =>
      !d || d.error
        ? fallback(url)
        : {
            url: d.url ?? url,
            title: d.title || hostOf(url),
            description: d.description || undefined,
            image: d.image || undefined,
            siteName: d.siteName || hostOf(url),
          },
    )
    .catch(() => fallback(url));
}
