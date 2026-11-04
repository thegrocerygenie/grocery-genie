import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ME_QUERY_KEY } from '@/features/auth/hooks/useAuth';
import {
  downloadExport,
  shareExport,
  type ExportFormat,
} from '@/features/settings/services/exportApi';
import { isPremiumRequired } from '@/utils/premium';

/** Download the export, then open the share sheet with it (V11-P2). */
export function useExportData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (format: ExportFormat) => {
      const uri = await downloadExport(format);
      await shareExport(uri);
    },
    onError: (error) => {
      // Premium lapsed since the profile was read: show the free plan everywhere.
      if (isPremiumRequired(error)) void qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}
