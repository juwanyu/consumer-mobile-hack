import { StyleSheet, Text, View } from 'react-native';

import type { Look } from '../../convex/looks';
import { BlockyCharacter } from '@/components/blocky-character';
import { colors } from '@/theme';

export function Avatar({ look, name, size = 40, ring }: { look?: Look | null; name?: string; size?: number; ring?: boolean }) {
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        ring && { borderWidth: 2, borderColor: colors.pink },
      ]}>
      {look ? (
        <View style={{ marginTop: size * 0.55 }}>
          <BlockyCharacter look={look} size={size * 1.6} animate={false} />
        </View>
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{(name ?? '?').slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: colors.text, fontWeight: '900' },
});
