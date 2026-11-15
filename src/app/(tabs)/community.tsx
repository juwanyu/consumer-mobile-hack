import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { ago } from '@/components/sheets';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

export default function Community() {
  const router = useRouter();
  const id = useMyId();
  const crews = useQuery(api.crews.list, { userId: id ?? undefined });

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FlatList
        data={crews ?? []}
        keyExtractor={(c) => c._id}
        contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 6, marginBottom: 6 }}>
            <Text style={type.title}>Crews</Text>
            <Text style={type.small}>Groups that make reels together. Share a reel to your crew and everyone can put themselves in it. Chats sync with Whop communities.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable testID={`crew-${item.slug}`} onPress={() => router.push({ pathname: '/crew/[slug]', params: { slug: item.slug } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
            <View style={styles.emoji}>
              <Text style={{ fontSize: 34 }}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.onWhop ? (
                  <View style={styles.whop}>
                    <Text style={styles.whopText}>WHOP</Text>
                  </View>
                ) : null}
              </View>
              <Text style={type.small} numberOfLines={1}>
                {item.last ? `${item.last.author}: ${item.last.body} · ${ago(item.last.at)}` : item.blurb}
              </Text>
              <Text style={[type.small, { color: item.joined ? colors.green : colors.faint }]}>
                {item.members} member{item.members === 1 ? '' : 's'}
                {item.joined ? ' · joined' : ''}
              </Text>
            </View>
            <Text style={{ color: colors.faint, fontSize: 22 }}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emoji: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 17, fontWeight: '900' },
  whop: { backgroundColor: '#FA4616', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  whopText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
});
