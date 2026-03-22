import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { strings } from '@/constants/strings';
import { colors, spacing, touchTarget, typography } from '@/constants/theme';

interface CategoryItem {
  id: string;
  name: string;
}

interface CategoryPickerProps {
  visible: boolean;
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  onClose: () => void;
  categories?: CategoryItem[];
}

export function CategoryPicker({
  visible,
  selectedId,
  onSelect,
  onClose,
  categories,
}: CategoryPickerProps) {
  const insets = useSafeAreaInsets();

  const items = categories ?? DEFAULT_CATEGORIES;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{strings.review.selectCategory}</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityLabel={strings.common.cancel}
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>{strings.common.cancel}</Text>
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                onSelect(item.id);
                onClose();
              }}
              accessibilityLabel={item.name}
              accessibilityRole="button"
            >
              <Text style={styles.categoryName}>{item.name}</Text>
              {selectedId === item.id && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
  },
  title: {
    ...typography.sectionHeader,
    color: colors.light.textPrimary,
  },
  closeButton: {
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minWidth,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  closeText: {
    ...typography.body,
    color: colors.light.primary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    minHeight: touchTarget.minHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.border,
  },
  categoryName: {
    ...typography.body,
    color: colors.light.textPrimary,
  },
  checkmark: {
    ...typography.bodyBold,
    color: colors.light.primary,
    fontSize: 18,
  },
});
