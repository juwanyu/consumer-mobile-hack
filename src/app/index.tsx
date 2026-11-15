import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import { BlockyCharacter } from '@/components/blocky-character';
import { FeedChrome } from '@/components/feed-chrome';
import { ReelFeed } from '@/components/reel-feed';
import { BigButton, Screen } from '@/components/ui';
import { DEMO_LOOK } from '@/demo-look';
import { colors, type } from '@/theme';


export default function ForYou() {
  const router = useRouter();
  const feed = useQuery(api.movies.feed);

  if (feed === undefined) {
    return (
      <View style={[styles.full, styles.center]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  if (feed.length === 0) {
    return (
      <Screen>
        <View style={styles.hero}>
          <BlockyCharacter look={DEMO_LOOK} size={200} />
          <Text style={[type.title, { textAlign: 'center' }]}>Turn yourself into a movie star.</Text>
          <Text style={[type.small, { textAlign: 'center' }]}>No reels yet. The first one is yours.</Text>
        </View>
        <BigButton testID="cast-yourself" icon="🎬" label="Cast yourself" onPress={() => router.push('/cast/consent')} />
      </Screen>
    );
  }

  return (
    <View style={styles.full}>
      <ReelFeed items={feed} />
      <FeedChrome tab="foryou" />
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
