/**
 * Receipt languages the extractor reads (RC-05). It reads all of them on
 * every receipt; keep this list in step with the extraction prompt
 * (backend/app/llm/prompts/receipt_extraction.py).
 */
export interface ReceiptLanguage {
  id: string;
  english: string;
  native: string;
}

export const RECEIPT_LANGUAGES: readonly ReceiptLanguage[] = [
  { id: 'en', english: 'English', native: 'English' },
  { id: 'fr', english: 'French', native: 'Français' },
  { id: 'es', english: 'Spanish', native: 'Español' },
  { id: 'de', english: 'German', native: 'Deutsch' },
  { id: 'sr', english: 'Serbian', native: 'Српски' },
  { id: 'zh', english: 'Mandarin', native: '中文' },
];
