import { ApiError } from '@/services/api';

import { scanErrorHint } from '../utils/scanErrorHint';

// The backend's 422 details: app/api/routes/receipts.py and app/image/preprocessor.py.
describe('scanErrorHint', () => {
  it.each([
    [
      'Image quality insufficient: Image appears blurry (score: 42.0)',
      'Image looks blurry — hold steady',
    ],
    [
      'Image quality insufficient: Image is too dark (brightness: 20.1)',
      'Too dark — find more light',
    ],
    [
      'Image quality insufficient: Image is too bright (brightness: 250.3)',
      'Too much glare — tilt the receipt',
    ],
    ['This doesn’t appear to be a receipt.', 'That doesn’t look like a receipt'],
    ["This doesn't appear to be a receipt.", 'That doesn’t look like a receipt'],
  ])('maps "%s"', (detail, hint) => {
    expect(scanErrorHint(new ApiError(422, { detail }))).toBe(hint);
  });

  it('names blur first when a photo is both blurry and dark', () => {
    const detail =
      'Image quality insufficient: Image appears blurry (score: 12.0); Image is too dark (brightness: 20.1)';
    expect(scanErrorHint(new ApiError(422, { detail }))).toBe('Image looks blurry — hold steady');
  });

  it.each([
    ['an unknown 422', new ApiError(422, { detail: 'Empty file uploaded.' })],
    ['a 422 without a string detail', new ApiError(422, { detail: [{ msg: 'x' }] })],
    ['a non-API error', new Error('camera failed')],
    ['nothing', undefined],
  ])('falls back for %s', (_label, error) => {
    expect(scanErrorHint(error)).toBe('Couldn’t read that — try again');
  });
});
