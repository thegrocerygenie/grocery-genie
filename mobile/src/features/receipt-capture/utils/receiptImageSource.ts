import type { ImageURISource } from 'react-native';

/**
 * Turn a receipt image reference into an <Image> source.
 *
 * The backend returns a relative, authenticated path (/api/receipts/{id}/image),
 * so it needs the API base URL and the bearer header. Local captures and
 * other hosts pass through without the token.
 */
export function receiptImageSource(
  uri: string | null | undefined,
  apiBaseUrl: string,
  authHeaders: Record<string, string>,
): ImageURISource | null {
  if (!uri) return null;
  if (!uri.startsWith('/')) return { uri };
  return { uri: `${apiBaseUrl.replace(/\/+$/, '')}${uri}`, headers: authHeaders };
}
