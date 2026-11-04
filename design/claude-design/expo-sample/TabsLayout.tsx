/**
 * Tabs layout — Bottom navigation chrome.
 *
 * Drop-in for `app/(tabs)/_layout.tsx`. Three tabs match the design.
 * Custom floating chrome-material tab bar (matches MVP mocks).
 */

import React from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { colors, type } from './theme';

const TABS = [
  { name: 'index',   label: 'Budget',  symbol: 'cart.fill' },
  { name: 'scan',    label: 'Scan',    symbol: 'camera.viewfinder' },
  { name: 'history', label: 'History', symbol: 'clock.fill' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

function FloatingTabBar({ state, navigation }: any) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BlurView intensity={80} tint="systemChromeMaterial" style={styles.bar}>
        {state.routes.map((route: any, idx: number) => {
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
            >
              <SymbolView
                name={tab.symbol as any}
                size={16}
                tintColor={active ? colors.tint : colors.iosLabel2}
              />
              <Text
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
