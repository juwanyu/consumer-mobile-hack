import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { BlockyCharacter } from '@/components/blocky-character';
import { ReelFeed } from '@/components/reel-feed';
import { BigButton } from '@/components/ui';
import { DEMO_LOOK } from '@/demo-look';
import { useMyId } from '@/me';
import { colors, type } from '@/theme';

export default function Feed() {
  const router = useRouter();
  const id = useMyId();
  const feed = useQuery(api.movies.feed);
  const following = useQuery(api.social.followingIds, { userId: id ?? undefined });
  const [tab, setTab] = useState<'foryou' | 'following'>('foryou');

  if (feed === undefined) {
    return (
      <View style={[styles.full, styles.center]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  const items = tab === 'foryou' ? feed : feed.filter((m) => m.owner && following?.includes(m.owner._id));

  return (
    <View style={styles.full}>
      {items.length > 0 ? (
        <ReelFeed key={tab} items={items} />
      ) : (
        <View style={[styles.full, styles.center, { gap: 16, padding: 32 }]}>
          <BlockyCharacter look={DEMO_LOOK} size={160} />
          <Text style={[type.heading, { textAlign: 'center' }]}>{tab === 'following' ? 'Follow people to see their reels here.' : 'No reels yet. The first one is yours.'}</Text>
          <BigButton icon="🎬" label="Open the Studio" onPress={() => router.push('/(tabs)/studio')} />
        </View>
      )}
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.logo}>Cast</Text>
          <View style={styles.tabs}>
            {(['foryou', 'following'] as const).map((t) => (
              <Pressable key={t} testID={`feed-${t}`} onPress={() => setTab(t)} hitSlop={10}>
                <Text style={[styles.tab, tab === t && styles.tabActive]}>{t === 'foryou' ? 'For You' : 'Following'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ width: 52 }} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  logo: { color: colors.yellow, fontSize: 22, fontWeight: '900', letterSpacing: -1, width: 52, ...shadow },
  tabs: { flexDirection: 'row', gap: 20 },
  tab: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '800', ...shadow },
  tabActive: { color: colors.text },
});
