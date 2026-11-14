import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '@/constants/links';

describe('contact addresses', () => {
  it('sends feedback and support to the support role address', () => {
    expect(SUPPORT_EMAIL).toBe('support@grocerygenie.app');
  });

  it('sends privacy requests to the privacy role address', () => {
    expect(PRIVACY_EMAIL).toBe('privacy@grocerygenie.app');
  });
});
