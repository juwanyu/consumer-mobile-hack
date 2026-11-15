import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius } from '@/theme';

export function Chips({
  options,
  value,
  onChange,
  accent = colors.yellow,
  testID,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  accent?: string;
  testID?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID={testID}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(o.id);
            }}
            style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]}>
            <Text style={[styles.text, selected && { color: '#0A0A0A' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 20 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHi, paddingHorizontal: 14, paddingVertical: 9 },
  text: { color: colors.text, fontWeight: '800', fontSize: 14 },
});
