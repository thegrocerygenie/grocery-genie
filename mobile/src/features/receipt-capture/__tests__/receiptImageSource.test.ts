import { receiptImageSource } from '../utils/receiptImageSource';

const BASE = 'http://192.168.1.10:8001';
const AUTH = { Authorization: 'Bearer token-123' };

describe('receiptImageSource', () => {
  it('returns null when there is no image', () => {
    expect(receiptImageSource(null, BASE, AUTH)).toBeNull();
    expect(receiptImageSource(undefined, BASE, AUTH)).toBeNull();
  });

  it('resolves a relative API path and attaches auth headers', () => {
    expect(receiptImageSource('/api/receipts/r1/image', BASE, AUTH)).toEqual({
      uri: 'http://192.168.1.10:8001/api/receipts/r1/image',
      headers: AUTH,
    });
  });

  it('does not double the slash when the base URL ends with one', () => {
    expect(receiptImageSource('/api/receipts/r1/image', `${BASE}/`, AUTH)?.uri).toBe(
      'http://192.168.1.10:8001/api/receipts/r1/image',
    );
  });

  it('passes a local capture through without headers', () => {
    expect(receiptImageSource('file:///tmp/capture.jpg', BASE, AUTH)).toEqual({
      uri: 'file:///tmp/capture.jpg',
    });
  });

  it('does not send the token to another host', () => {
    expect(receiptImageSource('https://cdn.example.com/r1.jpg', BASE, AUTH)).toEqual({
      uri: 'https://cdn.example.com/r1.jpg',
    });
  });
});
