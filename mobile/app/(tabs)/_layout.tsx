import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { colors, type } from '@/constants/theme';
import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

interface TabDef {
  name: string;
  label: string;
  symbol: string;
}

const TABS: TabDef[] = [
  { name: 'index', label: 'Budget', symbol: 'cart.fill' },
  { name: 'scan', label: 'Scan', symbol: 'camera.viewfinder' },
  { name: 'history', label: 'History', symbol: 'clock.fill' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false } as BottomTabNavigationOptions}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BlurView intensity={80} tint="systemChromeMaterial" style={styles.bar}>
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
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
            >
              <SymbolView
                name={tab.symbol as Parameters<typeof SymbolView>[0]['name']}
                size={16}
                tintColor={active ? colors.tint : (colors.iosLabel2 as string)}
              />
              <Text
                style={[
                  type.caption1,
                  {
                    color: active ? colors.tint : (colors.iosLabel2 as string),
                    fontWeight: '600',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
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
  tabActive: { backgroundColor: colors.tintBg },
});
