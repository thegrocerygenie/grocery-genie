import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { fetchMe } from '@/features/auth/services/authApi';
import { API_BASE_URL, ApiError, clientHeaders, getAuthHeaders } from '@/services/api';

/** `json`: one document. `csv`: a zip with one CSV file per kind of data. */
export type ExportFormat = 'json' | 'csv';

const FEATURE = 'data_export';

function premiumRequired(): ApiError {
  return new ApiError(403, { detail: { code: 'premium_required', feature: FEATURE } });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `grocery-genie-export-2026-11-03.json` (or `.zip` for CSV), in local time. */
export function exportFileName(format: ExportFormat, now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `grocery-genie-export-${day}.${format === 'csv' ? 'zip' : 'json'}`;
}

/**
 * Download `GET /api/users/me/export?format=...` into the cache and return its
 * file URI. The profile is read first: it refreshes an expired session (the
 * native download cannot) and says whether the server holds Premium. A free
 * user, or a 403 from the download, rejects with `premium_required`, which the
 * screen turns into the upgrade prompt.
 */
export async function downloadExport(
  format: ExportFormat,
  now: Date = new Date(),
): Promise<string> {
  const me = await fetchMe();
  if (!me.is_premium) throw premiumRequired();

  const target = new File(Paths.cache, exportFileName(format, now));
  if (target.exists) target.delete();
  try {
    const file = await File.downloadFileAsync(
      `${API_BASE_URL}/api/users/me/export?format=${format}`,
      target,
      { headers: { ...clientHeaders(), ...getAuthHeaders() }, idempotent: true },
    );
    return file.uri;
  } catch (error) {
    // The native download reports only "response has status 403".
    if (error instanceof Error && /status 403\b/.test(error.message)) throw premiumRequired();
    throw error;
  }
}

/**
 * Hand the file to the iOS share sheet (Save to Files, AirDrop, Mail…), then
 * delete the cached copy: it holds every receipt the user has.
 */
export async function shareExport(uri: string): Promise<void> {
  try {
    await Share.share({ url: uri });
  } finally {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // A leftover cache file only costs disk space; iOS purges the cache.
    }
  }
}
