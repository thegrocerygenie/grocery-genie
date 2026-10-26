import { Directory, File, Paths } from 'expo-file-system';

const PENDING_DIR = 'pending-receipts';

/**
 * Copy a camera photo out of the cache, which iOS may purge under storage
 * pressure, into the documents directory so a queued receipt survives until
 * it uploads. Returns the new file URI.
 */
export function persistCapturedImage(uri: string): string {
  const dir = new Directory(Paths.document, PENDING_DIR);
  dir.create({ idempotent: true, intermediates: true });
  const source = new File(uri);
  const target = new File(dir, `${Date.now()}-${source.name}`);
  source.copy(target);
  return target.uri;
}

/** Remove a queued photo once it has uploaded or been discarded. Missing files are fine. */
export function deletePendingImage(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A leftover file only costs disk space; never fail the sync over it.
  }
}
