import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { fetchMe } from '@/features/auth/services/authApi';
import { API_BASE_URL, ApiError, apiClient, clientHeaders, getAuthHeaders } from '@/services/api';

/** `json`: one document. `csv`: a zip of one CSV file per kind of data. `pdf`: a spend report. */
export type ExportFormat = 'json' | 'csv' | 'pdf';

/** The "Includes" switches (PREM-04 AC 3), as the server names them. */
export type ExportInclude = 'receipts' | 'prices' | 'budgets' | 'images';

const INCLUDE_ORDER: ExportInclude[] = ['receipts', 'prices', 'budgets', 'images'];

export interface ExportRequest {
  format: ExportFormat;
  /** First and last day, `YYYY-MM-DD`, inclusive; null for no bound (All time). */
  from: string | null;
  to: string | null;
  /** At least one. */
  includes: ExportInclude[];
}

export interface ExportSummary {
  receipt_count: number;
}

const FEATURE = 'data_export';

function premiumRequired(): ApiError {
  return new ApiError(403, { detail: { code: 'premium_required', feature: FEATURE } });
}

const EXPORT_BUSY = 'export_busy';

/** A 429 from the export: too many this hour, or one already being built. */
function exportBusy(): ApiError {
  return new ApiError(429, { detail: { code: EXPORT_BUSY } });
}

export function isExportBusy(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function rangeParams(from: string | null, to: string | null): URLSearchParams {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params;
}

/** The export's query string: format, range and includes (in the screen's order). */
export function exportQuery(request: ExportRequest): string {
  const params = new URLSearchParams({ format: request.format });
  rangeParams(request.from, request.to).forEach((value, key) => params.set(key, value));
  const includes = INCLUDE_ORDER.filter((i) => request.includes.includes(i));
  params.set('include', includes.join(','));
  return params.toString();
}

/**
 * `grocery-genie-export-2026-11-03.json`, `.zip` for CSV or with receipt
 * images, `grocery-genie-report-2026-11-03.pdf` for the report; local time.
 * The server names its files the same way.
 */
export function exportFileName(request: ExportRequest, now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (request.includes.includes('images') || request.format === 'csv') {
    return `grocery-genie-export-${day}.zip`;
  }
  if (request.format === 'pdf') return `grocery-genie-report-${day}.pdf`;
  return `grocery-genie-export-${day}.json`;
}

/** How many receipts an export of the range holds (PREM-04 AC 4). */
export function fetchExportSummary(from: string | null, to: string | null): Promise<ExportSummary> {
  const query = rangeParams(from, to).toString();
  return apiClient<ExportSummary>(`/api/users/me/export/summary${query ? `?${query}` : ''}`);
}

/**
 * Download `GET /api/users/me/export?...` into the cache and return its file
 * URI. The profile is read first: it refreshes an expired session (the native
 * download cannot) and says whether the server holds Premium. A free user, or
 * a 403 from the download, rejects with `premium_required`, which the screen
 * turns into the upgrade prompt.
 */
export async function downloadExport(
  request: ExportRequest,
  now: Date = new Date(),
): Promise<string> {
  const me = await fetchMe();
  if (!me.is_premium) throw premiumRequired();

  const target = new File(Paths.cache, exportFileName(request, now));
  if (target.exists) target.delete();
  try {
    const file = await File.downloadFileAsync(
      `${API_BASE_URL}/api/users/me/export?${exportQuery(request)}`,
      target,
      { headers: { ...clientHeaders(), ...getAuthHeaders() }, idempotent: true },
    );
    return file.uri;
  } catch (error) {
    // The native download reports only "response has status 403" (or 429),
    // never the body, so a 429 cannot tell the hourly limit from a running export.
    if (error instanceof Error && /status 403\b/.test(error.message)) throw premiumRequired();
    if (error instanceof Error && /status 429\b/.test(error.message)) throw exportBusy();
    throw error;
  }
}

/**
 * Hand the file to the iOS share sheet (Save to Files, AirDrop, Mail…), then
 * delete the cached copy: it holds the user's receipts.
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
