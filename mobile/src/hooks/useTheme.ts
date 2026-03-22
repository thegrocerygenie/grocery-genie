import { useColorScheme } from 'react-native';
import { colors } from '@/constants/theme';

export function useTheme() {
  const colorScheme = useColorScheme();
  const currentColors = colorScheme === 'dark' ? colors.dark : colors.light;
  return { colors: currentColors, isDark: colorScheme === 'dark' };
}
