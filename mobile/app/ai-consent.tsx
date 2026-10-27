import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import { AiConsentContent } from '@/features/ai-consent/components/AiConsentContent';
import { AI_CONSENT_COPY } from '@/features/ai-consent/constants';
import { useGrantAiConsent } from '@/features/ai-consent/hooks/useAiConsent';
import { answerAiConsent } from '@/features/ai-consent/services/consentPrompt';

/**
 * App Store 5.1.2(i): the one-time consent sheet before the first import, and
 * from Settings. useAiConsentGate opens it and waits for the answer.
 */
export default function AiConsentSheet() {
  const router = useRouter();
  const grant = useGrantAiConsent();
  // Allow is answered once the sheet is gone: the import waiting on it opens
  // the photo picker, which iOS refuses while the sheet is still closing.
  // A swipe down is a "no".
  const allowed = useRef(false);
  useEffect(() => () => answerAiConsent(allowed.current), []);

  const onAllow = () => {
    grant.mutate(undefined, {
      onSuccess: () => {
        allowed.current = true;
        router.back();
      },
    });
  };

  const onManual = () => {
    answerAiConsent(false);
    router.replace('/manual-entry');
  };

  return (
    <AiConsentContent
      onAllow={onAllow}
      onManual={onManual}
      saving={grant.isPending}
      error={grant.isError ? AI_CONSENT_COPY.saveFailed : null}
    />
  );
}
