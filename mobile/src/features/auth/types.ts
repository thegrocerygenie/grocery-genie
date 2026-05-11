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

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  locale: string;
  currency_preference: string;
  email_verified_at: string | null;
  preferences: UserPreferences;
  needs_onboarding?: boolean;
}
