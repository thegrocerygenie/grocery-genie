// --- Extraction types (from POST /api/receipts/scan response) ---

export interface LineItemExtraction {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category_id: string | null;
  category_confidence: number | null;
  extraction_confidence: number | null;
}

export interface ReceiptExtraction {
  store_name: string;
  date: string;
  items: LineItemExtraction[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
  confidence: number;
}

export interface ReceiptScanResponse {
  receipt_id: string;
  status: string;
  extraction: ReceiptExtraction;
}

// --- Full receipt types (from GET/PATCH response) ---

export interface LineItemResponse {
  id: string;
  raw_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  unit_of_measure: string | null;
  category_id: string | null;
  category_confidence: number | null;
  extraction_confidence: number | null;
  corrected: boolean;
}

export interface ReceiptResponse {
  id: string;
  user_id: string;
  store_name: string | null;
  date: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
  image_url: string | null;
  extraction_confidence: number | null;
  status: string;
  items: LineItemResponse[];
  created_at: string | null;
}

// --- List types (from GET /api/receipts) ---

export interface ReceiptListResponse {
  items: ReceiptResponse[];
  total: number;
  page: number;
  per_page: number;
}

// --- Correction types (for PATCH /api/receipts/{id}) ---

export interface LineItemCorrection {
  id: string;
  name?: string;
  category_id?: string;
}

export interface ReceiptUpdateRequest {
  items?: LineItemCorrection[];
  status?: string;
}

// --- UI state types ---

export type CaptureMode = 'camera' | 'library';
export type ScanState = 'camera' | 'preview' | 'uploading';

export interface EditableLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryId: string | null;
  extractionConfidence: number | null;
  isEdited: boolean;
}

export interface ReviewFormState {
  storeName: string;
  date: string;
  items: EditableLineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
}
