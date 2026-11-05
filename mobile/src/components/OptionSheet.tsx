import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

interface OptionSheetProps {
  visible: boolean;
  options: { key: number; label: string }[];
  selected: number;
  onSelect: (key: number) => void;
  onClose: () => void;
  /** A question above the choices ("Mute until"), as an iOS action sheet has. */
  title?: string;
}

/** A bottom sheet of choices, the selected one checked (Settings pickers). */
export function OptionSheet({
  visible,
  options,
  selected,
  onSelect,
  onClose,
  title,
}: OptionSheetProps) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      {/* Taps only: accessible, these would hide the options from VoiceOver. */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessible={false}
        onAccessibilityEscape={onClose}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessible={false}>
          <View style={styles.card}>
            {title ? (
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {options.map((o, i) => (
              <Pressable
                key={o.key}
                onPress={() => onSelect(o.key)}
                style={[styles.row, (i > 0 || Boolean(title)) && styles.rowDivider]}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                accessibilityState={{ selected: selected === o.key }}
              >
                <Text style={type.body}>{o.label}</Text>
                {selected === o.key ? (
                  <SymbolView name="checkmark" size={14} tintColor={colors.tint} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: colors.iosBg2,
    borderRadius: radii.list,
    overflow: 'hidden',
  },
  title: {
    ...type.footnote,
    color: colors.iosLabel2,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
});
