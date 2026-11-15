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
  const verify = useAction(api.remix.verify);
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
        for (let i = 0; i < 4; i++) {
          const v = await verify({ movieId, userId: me }).catch(() => ({ unlocked: false }));
          if (v.unlocked) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return go();
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        return;
      }
      if (res.reason === 'whop_error') {
        Alert.alert('Checkout unavailable', 'Whop could not open a checkout right now. Try again in a moment.');
        return;
      }
      if (res.demo) {
        Alert.alert(
          `Remix license · $${access!.price}`,
          'Checkout runs through Whop, and the creator gets paid every time someone remixes. This is a demo purchase, so no money moves.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Pay $${access!.price} with Whop`,
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
      {access.price > 0 ? <Text style={styles.note}>Paid out through Whop.</Text> : null}
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
