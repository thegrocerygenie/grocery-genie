export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  needs_onboarding?: boolean;
}

export interface UserPreferences {
  notification_thresholds: {
    fifty: boolean;
    eighty: boolean;
    hundred: boolean;
  };
  weekly_summary: {
    enabled: boolean;
    day: number;
  };
  ocr_languages: string[];
}

/** Consent to send receipts to third-party AI (backend app/services/ai_consent.py). */
export interface AiConsent {
  /** True only for consent to the current policy version. */
  granted: boolean;
  granted_at: string | null;
  policy_version: string | null;
  current_policy_version: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  locale: string;
  currency_preference: string;
  email_verified_at: string | null;
  preferences: UserPreferences;
  needs_onboarding?: boolean;
  ai_consent?: AiConsent;
}
