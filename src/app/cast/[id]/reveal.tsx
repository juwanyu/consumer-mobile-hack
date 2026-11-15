import { useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { BlockyCharacter } from '@/components/blocky-character';
import { BigButton, Pill, Screen } from '@/components/ui';
import { colors, type } from '@/theme';

const LINES = ['Reading the vibe…', 'Mixing skin tones…', 'Sculpting the hair…', 'Picking the outfit…', 'Snapping on the head…'];

export default function Reveal() {
  const { id } = useLocalSearchParams<{ id: Id<'castMembers'> }>();
  const router = useRouter();
  const member = useQuery(api.casting.get, { castMemberId: id });
  const [line, setLine] = useState(0);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (member?.status !== 'analyzing') return;
    const timer = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1400);
    return () => clearInterval(timer);
  }, [member?.status]);

  useEffect(() => {
    if (member?.status === 'ready') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }).start();
    }
    if (member?.status === 'failed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [member?.status, pop]);

  if (member === undefined || member?.status === 'analyzing' || member?.status === 'awaiting_photo') {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.yellow} />
        <Text style={type.title}>{LINES[line]}</Text>
        <Text style={type.small}>Your photo is deleted as soon as this is done.</Text>
      </Screen>
    );
  }

  if (member === null) {
    return (
      <Screen style={styles.centered}>
        <Text style={type.title}>Cast member not found</Text>
        <BigButton label="Back home" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (member.status === 'failed' || !member.look) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ fontSize: 64 }}>🎭</Text>
        <Text style={[type.title, { textAlign: 'center' }]}>Casting hiccup</Text>
        <Text style={[type.body, { textAlign: 'center', color: colors.muted }]}>{member.error ?? 'Something went wrong.'}</Text>
        <BigButton label="Try another photo" onPress={() => router.replace({ pathname: '/cast/[id]/photo', params: { id } })} />
      </Screen>
    );
  }

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const rotate = pop.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '0deg'] });

  return (
    <Screen>
      <View style={styles.centered}>
        <Pill text="You're cast!" color={colors.yellow} />
        <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
          <BlockyCharacter look={member.look} size={240} />
        </Animated.View>
        <Text testID="cast-name" style={[type.hero, { textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit>
          {member.name}
        </Text>
        <Text style={[type.body, styles.vibe]}>“{member.look.vibe}”</Text>
      </View>
      <BigButton testID="pick-genre" icon="🎞️" label="Pick a genre" onPress={() => router.push({ pathname: '/movie/new', params: { castMemberId: id } })} />
      <BigButton variant="ghost" label="Cast someone else" onPress={() => router.replace('/cast/consent')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  vibe: { textAlign: 'center', color: colors.cyan, fontStyle: 'italic', paddingHorizontal: 12 },
});
