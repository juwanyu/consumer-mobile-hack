import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

export function ClapperButton({ onPress, loading, disabled }: { onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const clap = useRef(new Animated.Value(0)).current;
  const rotate = clap.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] });

  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.sequence([
      Animated.timing(clap, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(clap, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPress();
    }, 130);
  };

  return (
    <Pressable testID="action-button" accessibilityRole="button" accessibilityLabel="Action!" onPress={press} disabled={disabled || loading} style={{ opacity: disabled ? 0.4 : 1 }}>
      <Animated.View style={[styles.stick, { transform: [{ translateX: -150 }, { rotate }, { translateX: 150 }] }]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[styles.stripe, { backgroundColor: i % 2 ? colors.text : '#0A0A0A' }]} />
        ))}
      </Animated.View>
      <View style={styles.board}>
        {loading ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.text}>ACTION!</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stick: { height: 22, flexDirection: 'row', borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: 'hidden', marginBottom: 3 },
  stripe: { flex: 1, transform: [{ skewX: '-30deg' }] },
  board: { backgroundColor: colors.yellow, height: 72, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 30, fontWeight: '900', color: '#0A0A0A', letterSpacing: 2 },
});
