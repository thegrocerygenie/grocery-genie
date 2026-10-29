import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { colors, type } from '@/constants/theme';
import { useReduceTransparency } from '@/hooks/useAccessibilitySetting';
import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

interface TabDef {
  name: string;
  label: string;
  symbol: string;
}

const TABS: TabDef[] = [
  { name: '(budget)', label: 'Budget', symbol: 'cart.fill' },
  { name: 'scan', label: 'Scan', symbol: 'camera.viewfinder' },
  { name: 'history', label: 'History', symbol: 'clock.fill' },
];

// The pill bar floats over content, so its labels grow only so far with
// Dynamic Type; VoiceOver and the Large Content Viewer still read them in full.
const TAB_LABEL_MAX_FONT_SCALE = 1.3;

export default function TabsLayout() {
  return (
    <Tabs
      // Scan's Cancel returns to the tab the user came from, not always Budget.
      backBehavior="history"
      screenOptions={{ headerShown: false } as BottomTabNavigationOptions}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

function FloatingTabBar({ state, navigation, descriptors }: BottomTabBarProps) {
  const reduceTransparency = useReduceTransparency();
  // A screen hides the bar with `tabBarStyle: { display: 'none' }` (Scan's camera).
  const focused = descriptors[state.routes[state.index].key];
  const barStyle = StyleSheet.flatten(focused?.options.tabBarStyle as StyleProp<ViewStyle>);
  if (barStyle?.display === 'none') return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TabBarSurface opaque={reduceTransparency}>
        {state.routes.map((route, idx) => {
          const active = state.index === idx;
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;

          const onPress = () => {
            Haptics.selectionAsync();
            if (!active) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.name}
              onPress={onPress}
              style={[styles.tab, active && styles.tabActive]}
              hitSlop={8}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
            >
              <SymbolView
                name={tab.symbol as Parameters<typeof SymbolView>[0]['name']}
                size={16}
                tintColor={active ? colors.tint : colors.iosLabel2}
              />
              <Text
                maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE}
                style={[
                  type.caption1,
                  {
                    color: active ? colors.tint : colors.iosLabel2,
                    fontWeight: '600',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </TabBarSurface>
    </View>
  );
}

// Reduce Transparency: an opaque bar, not a material (design motion.jsx).
function TabBarSurface({ opaque, children }: { opaque: boolean; children: React.ReactNode }) {
  if (opaque) {
    return (
      <View style={[styles.bar, styles.barOpaque]} testID="tab-bar" accessibilityRole="tablist">
        {children}
      </View>
    );
  }
  return (
    <BlurView
      intensity={80}
      tint="systemChromeMaterial"
      style={styles.bar}
      testID="tab-bar"
      accessibilityRole="tablist"
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 14,
    left: 12,
    right: 12,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 6,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  barOpaque: { backgroundColor: colors.iosBg2 },
  tabActive: { backgroundColor: colors.tintBg },
});
