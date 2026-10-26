/**
 * Blur for a transparent native-stack header, by iOS version.
 *
 * iOS 26+ draws its own glass behind a transparent header, and a blur effect
 * on top of it renders the large title as an unreadable smear. Older iOS draws
 * nothing, so without the blur, scrolled content shows through the title.
 */
export function headerBlurFor(iosVersion: string | number): 'systemChromeMaterial' | undefined {
  const major = parseInt(String(iosVersion), 10);
  return major >= 26 ? undefined : 'systemChromeMaterial';
}
