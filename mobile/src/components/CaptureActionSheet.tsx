import React, { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { colors, radii, spacing, type } from '@/constants/theme';

interface ActionDef {
  key: string;
  label: string;
  symbol: string;
  onPress: () => void;
}

interface CaptureActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseFromLibrary: () => void;
  onChooseFiles: () => void;
  onManualEntry: () => void;
}

export function CaptureActionSheet({
  visible,
  onClose,
  onTakePhoto,
  onChooseFromLibrary,
  onChooseFiles,
  onManualEntry,
}: CaptureActionSheetProps) {
  const actions: ActionDef[] = [
    { key: 'photo', label: 'Take Photo', symbol: 'camera.fill', onPress: onTakePhoto },
    {
      key: 'library',
      label: 'Choose from Library',
      symbol: 'photo.on.rectangle',
      onPress: onChooseFromLibrary,
    },
    { key: 'files', label: 'Choose Files', symbol: 'doc.fill', onPress: onChooseFiles },
    { key: 'manual', label: 'Manual Entry', symbol: 'plus', onPress: onManualEntry },
  ];

  // The chosen action runs once the sheet has finished dismissing. iOS tears
  // down anything presented above the sheet when it closes, so a picker opened
  // in the same tick appeared and vanished.
  const pendingAction = useRef<(() => void) | null>(null);
  const runPendingAction = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
      onDismiss={runPendingAction}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={styles.wrap}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
        >
          <View style={styles.card}>
            {actions.map((a, i) => (
              <Pressable
                key={a.key}
                onPress={() => {
                  pendingAction.current = a.onPress;
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivider,
                  pressed && { backgroundColor: colors.iosFill3 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={a.label}
              >
                <Text style={styles.label}>{a.label}</Text>
                <SymbolView
                  name={a.symbol as Parameters<typeof SymbolView>[0]['name']}
                  size={18}
                  tintColor={colors.tint}
                />
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              pressed && { backgroundColor: colors.iosFill3 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.label, { fontWeight: '600' }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent: 'flex-end',
  },
  wrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.sheetBg,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 50,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.iosSeparator,
  },
  label: { ...type.body, color: colors.tint },
  cancel: {
    minHeight: 50,
    paddingVertical: spacing.sm,
    borderRadius: radii.list,
    backgroundColor: colors.sheetBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
