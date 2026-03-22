# Epic: Smart Receipt Capture [MVP]

The foundational ingestion pipeline that powers all downstream features. Users photograph receipts and receive structured, validated data within seconds.

## User Stories

### RC-01: Camera Scan [MVP]
**As a** user, **I want to** photograph a receipt with my phone camera and have it automatically processed, **so that** I don't have to manually enter any data.

**Acceptance Criteria:**
1. Camera opens with real-time edge detection overlay highlighting receipt boundaries.
2. Image quality feedback before capture (blur warning, low-light warning).
3. User can retake before submitting.
4. Processing completes within 5 seconds for a standard single-page receipt.
5. Structured data (store name, date, line items with names/quantities/prices, subtotal) displayed for review.

### RC-02: Review & Correct [MVP]
**As a** user, **I want to** review and correct extracted data before it's saved, **so that** the data I rely on is accurate.

**Acceptance Criteria:**
1. Each extracted field is editable inline (tap to edit).
2. Fields with confidence < 0.7 (configurable) are visually flagged (amber highlight).
3. User corrections saved and associated with original extraction for training feedback.
4. "Confirm & Save" commits the receipt. No data committed without explicit user confirmation.
5. Original receipt image stored alongside structured data.

### RC-03: Upload from Library [MVP]
**As a** user, **I want to** upload a receipt image from my photo library or files, **so that** I can process receipts photographed earlier or received digitally.

**Acceptance Criteria:**
1. Supports JPEG, PNG, HEIC image formats.
2. Supports single-page PDF attachments.
3. Same extraction and review flow as camera capture.
4. Image validated for minimum resolution (300px width) before processing.

### RC-04: Scan History [MVP]
**As a** user, **I want to** see my scan history and access any previously scanned receipt, **so that** I can verify past purchases or re-review data.

**Acceptance Criteria:**
1. History displays receipts in reverse chronological order.
2. Each entry shows store name, date, total amount, item count.
3. Tapping shows full extracted data and original image.
4. Search within history by store name or date range.

### RC-05: International Receipts [MVP]
**As a** user, **I want to** scan receipts in non-English languages with locale-specific decimal formats, **so that** I can use the app regardless of which store or country I shop in.

**Acceptance Criteria:**
1. Correctly processes receipts in at least English, French, Spanish, German, Serbian/Cyrillic, and Mandarin.
2. Decimal separator detection: commas vs. periods correctly interpreted from receipt context.
3. All monetary values normalized to consistent internal format (period decimal separator).
4. Currency symbol/code extracted when present.

## Functional Requirements

### Image Capture & Preprocessing [MVP]
- Camera interface with real-time edge detection and auto-crop.
- Image quality assessment before submission: minimum resolution (300px width), blur detection (Laplacian variance threshold), brightness check.
- Supports JPEG, PNG, HEIC, single-page PDF.
- Full-resolution image stored for re-processing. Compressed thumbnail for history views.
- Target: camera capture to structured data display ≤5 seconds on modern smartphone over Wi-Fi.

### Vision Model Extraction [MVP]
- Vision model extracts: store/merchant name, date/time, line items (name, quantity, unit price, total price), subtotal, tax (if present), total.
- System prompt enforces: exact digit reproduction (no rounding), locale-aware decimal detection, anti-hallucination.
- Each extracted field carries a confidence score (0.0–1.0).
- Output is structured JSON conforming to the Receipt schema.
- LLM provider abstracted behind provider-agnostic interface. Backend swappable without code changes.

### Validation & Error Handling [MVP]
- Post-extraction validation: quantity × unit price = total price (±2% tolerance); sum of item totals = subtotal (±1%); date parseable and not in future.
- Validation failures flagged with specific error descriptions.
- Total extraction failure (zero items) shows error with retry or manual entry option.
- High-value threshold (default: $100 item or $500 total) triggers mandatory review.

### User Correction & Feedback Loop [MVP]
- All extracted fields inline-editable.
- Corrections persisted as correction events linked to original extraction.
- Corrections feed per-user item name mapping dictionary (e.g., "GRN BNLS" → "Green Beans").
- Correction rate tracked per receipt type/store to identify systematic failures for prompt improvement.
