import { useAction, useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useMyId } from '@/me';
import { colors, radius } from '@/theme';

export function useRemixGate(movieId: Id<'movies'>) {
  const router = useRouter();
  const me = useMyId();
  const access = useQuery(api.remix.access, { movieId, userId: me ?? undefined });
  const checkout = useAction(api.remix.checkout);
  const demoUnlock = useMutation(api.remix.demoUnlock);
  const [busy, setBusy] = useState(false);
  const locked = !!access && !access.unlocked;
  const label = locked ? `🔓 Remix · $${access!.price}` : 'Remix';

  const open = async () => {
    const go = () => router.push({ pathname: '/movie/[id]/remix', params: { id: movieId } });
    if (!locked || !me) return go();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      const res = await checkout({ movieId, userId: me });
      if (res.url) {
        await WebBrowser.openBrowserAsync(res.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
        return;
      }
      if (res.demo) {
        Alert.alert(
          `Remix license · $${access!.price}`,
          'Demo checkout: Whop sandbox keys are not connected on this build, so no money moves. The creator gets paid through Whop when it is live.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Simulate $${access!.price} purchase`,
              onPress: async () => {
                await demoUnlock({ movieId, userId: me });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                go();
              },
            },
          ],
        );
      }
    } finally {
      setBusy(false);
    }
  };
  return { access, locked, label, open, busy };
}

const PRICES = [0, 1, 3, 5];

export function RemixPrice({ movieId }: { movieId: Id<'movies'> }) {
  const me = useMyId();
  const access = useQuery(api.remix.access, { movieId, userId: me ?? undefined });
  const setPrice = useMutation(api.remix.setPrice);
  if (!access?.owner || !me) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>💸 Remix price</Text>
      <Text style={styles.sub}>People pay you through Whop to put themselves in this reel.</Text>
      <View style={styles.row}>
        {PRICES.map((p) => (
          <Pressable
            key={p}
            testID={`price-${p}`}
            onPress={() => {
              Haptics.selectionAsync();
              setPrice({ movieId, userId: me, price: p });
            }}
            style={[styles.chip, access.price === p && styles.chipOn]}>
            <Text style={[styles.chipText, access.price === p && { color: '#000' }]}>{p === 0 ? 'Free' : `$${p}`}</Text>
          </Pressable>
        ))}
      </View>
      {!access.live && access.price > 0 ? <Text style={styles.note}>Demo mode until Whop sandbox keys are added.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  sub: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  chipOn: { backgroundColor: colors.yellow },
  chipText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  note: { color: colors.faint, fontSize: 12, fontWeight: '700' },
});
