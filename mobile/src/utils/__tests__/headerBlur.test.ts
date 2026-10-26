import { headerBlurFor } from '../headerBlur';

describe('headerBlurFor', () => {
  it.each([16, '17.5', '25.4'])('keeps the blur on iOS %s, which draws no glass itself', (v) => {
    expect(headerBlurFor(v)).toBe('systemChromeMaterial');
  });

  it.each(['26.0', '27.1', 27])('drops the blur on iOS %s, where it hides the large title', (v) => {
    expect(headerBlurFor(v)).toBeUndefined();
  });

  it('keeps the blur when the version is unreadable', () => {
    expect(headerBlurFor('unknown')).toBe('systemChromeMaterial');
  });
});
