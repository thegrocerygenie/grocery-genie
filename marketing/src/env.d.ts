/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_LAUNCH_STATE?: string;
  readonly PUBLIC_APP_STORE_ID?: string;
  readonly PUBLIC_WAITLIST_ENDPOINT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
