// The privacy policy and privacy address, read from the iPhone app at build time so /privacy
// shows exactly what Settings → Privacy shows. Edit the text in the app file, never here.
// See mobile-sources.mjs for how the '@/constants/links' import inside privacy.ts resolves.
export { PRIVACY_POLICY } from '../../mobile/src/features/settings/content/privacy';
export { PRIVACY_EMAIL } from '../../mobile/src/constants/links';

/** The public support address (App Store Connect support URL points at /support). */
export const SUPPORT_EMAIL = 'support@grocerygenie.app';

/** The app's draft banner text (PrivacyPolicy.tsx), shown while PRIVACY_POLICY.reviewed is false. */
export const DRAFT_NOTICE = 'Draft · pending legal review';
