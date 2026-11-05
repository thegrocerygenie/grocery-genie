import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import {
  downloadExport,
  fetchExportSummary,
  shareExport,
  type ExportRequest,
} from '@/features/settings/services/exportApi';
import { isPremiumRequired } from '@/utils/premium';

/** Download the export, then open the share sheet with it (V11-P2, PREM-04). */
export function useExportData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (request: ExportRequest) => {
      const uri = await downloadExport(request);
      await shareExport(uri);
    },
    onError: (error) => {
      // Premium lapsed since the profile was read: show the free plan everywhere.
      if (isPremiumRequired(error)) void qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export const EXPORT_SUMMARY_KEY = ['export-summary'] as const;

/**
 * The receipt count behind "Export N receipts" (PREM-04 AC 4). Off for a
 * free user and for a range with From after To.
 */
export function useExportSummary(from: string | null, to: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...EXPORT_SUMMARY_KEY, from, to],
    queryFn: () => fetchExportSummary(from, to),
    enabled,
  });
}
