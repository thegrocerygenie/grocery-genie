import React from 'react';
import { Switch, type SwitchProps } from 'react-native';

import { colors } from '@/constants/theme';

type AppSwitchProps = Omit<SwitchProps, 'trackColor' | 'ios_backgroundColor' | 'thumbColor'>;

/**
 * The app's switch: brand green when on, as the design draws it (F7), and the
 * system fill when off. The tint is #1F7A4A in light (5.4:1 on a white card)
 * and #34D17A in dark (9:1 on #1C1C1E), both past WCAG's 3:1 for controls, and
 * it darkens or brightens with Increase Contrast. Use this, never a bare
 * Switch, so no screen drifts back to system green.
 */
export function AppSwitch(props: AppSwitchProps) {
  return (
    <Switch
      {...props}
      trackColor={{ false: colors.iosFill1, true: colors.tint }}
      ios_backgroundColor={colors.iosFill1}
    />
  );
}
