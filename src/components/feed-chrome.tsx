import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export function FeedChrome({ tab }: { tab: 'foryou' | 'saved' }) {
  const router = useRouter();
  return (
    <>
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.tabs}>
          <Pressable testID="tab-foryou" onPress={() => tab !== 'foryou' && router.replace('/')} hitSlop={10}>
            <Text style={[styles.tab, tab === 'foryou' && styles.tabActive]}>For You</Text>
          </Pressable>
          <Text style={styles.divider}>|</Text>
          <Pressable testID="tab-saved" onPress={() => tab !== 'saved' && router.replace('/saved')} hitSlop={10}>
            <Text style={[styles.tab, tab === 'saved' && styles.tabActive]}>Saved</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
        <Pressable
          testID="create"
          accessibilityRole="button"
          accessibilityLabel="Create a reel"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            router.push('/create');
          }}
          style={({ pressed }) => [styles.create, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
          <Text style={styles.createText}>＋ Create</Text>
        </Pressable>
      </SafeAreaView>
    </>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6 },
  tab: { color: 'rgba(255,255,255,0.65)', fontSize: 17, fontWeight: '800', ...shadow },
  tabActive: { color: colors.text, textDecorationLine: 'underline' },
  divider: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  create: { backgroundColor: colors.yellow, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10 },
  createText: { color: '#0A0A0A', fontSize: 18, fontWeight: '900' },
});
