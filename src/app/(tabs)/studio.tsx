import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { BlockyCharacter } from '@/components/blocky-character';
import { CategoryCard, EntryCard, ProjectCard, RemixCard, SectionHeader, StyleTile, tap, TrendingCard, useQuickRemix } from '@/components/studio';
import { ART_STYLES, useArtStyle } from '@/art-style';
import { DEMO_LOOK } from '@/demo-look';
import { useLocalIds } from '@/local';
import { useMe } from '@/me';
import { CATEGORIES, templateById, templateStats, TRENDING_REELS } from '@/templates';
import { colors, radius } from '@/theme';

export default function Studio() {
  const router = useRouter();
  const { id, me } = useMe();
  const profile = useQuery(api.social.profile, id ? { userId: id, viewerId: id } : 'skip');
  const feed = useQuery(api.movies.feed);
  const trending = useQuery(api.movies.byIds, { ids: TRENDING_REELS });
  const saved = useLocalIds('saved');
  const savedItems = useQuery(api.movies.byIds, { ids: saved.ids });
  const stats = useMemo(() => templateStats(feed), [feed]);
  const quick = useQuickRemix();
  const look = useArtStyle();

  const castMemberId = me?.castMemberId as Id<'castMembers'> | undefined;
  const firstName = me?.look ? me.name : null;
  const mine = profile?.reels ?? [];
  const seeded = (feed ?? []).filter((r) => r.owner?._id !== id && r.thumbnailUrl).slice(0, Math.max(0, 8 - mine.length));

  const open = (item: { _id: Id<'movies'>; status: string; isReel: boolean }) => {
    const pathname =
      item.status === 'done' ? '/movie/[id]/premiere' : item.status === 'draft' ? (item.isReel ? '/movie/[id]/edit' : '/movie/[id]/story') : '/movie/[id]/render';
    router.push({ pathname, params: { id: item._id } });
  };

  const scratch = () => {
    if (!castMemberId) return router.push('/cast/consent');
    router.push({ pathname: '/movie/new', params: { castMemberId } });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.kicker}>CAST STUDIO</Text>
            <Text style={styles.pageTitle}>Create</Text>
          </View>
          <Pressable
            testID="studio-new"
            onPress={() => {
              tap('medium');
              scratch();
            }}
            style={({ pressed }) => [styles.newBtn, { opacity: pressed ? 0.85 : 1 }]}>
            <SymbolView name="plus" size={16} tintColor="#0A0A0A" weight="heavy" />
            <Text style={styles.newBtnText}>New project</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={[styles.glow, { backgroundColor: colors.pink, top: -90, right: -60 }]} />
          <View style={[styles.glow, { backgroundColor: colors.yellow, bottom: -120, left: -80, opacity: 0.16 }]} />
          <View style={styles.heroText}>
            <Text style={styles.heroKicker}>{firstName ? 'NOW STARRING' : 'STEP 1'}</Text>
            <Text style={styles.heroName} numberOfLines={2} adjustsFontSizeToFit>
              {firstName ? `${firstName},` : 'Cast yourself,'}
            </Text>
            <Text style={styles.heroStar}>{firstName ? "you're the star." : 'then star in anything.'}</Text>
            <Text style={styles.heroSub}>
              {firstName ? 'Your blocky twin is ready for any role.' : 'One selfie becomes your blocky twin. The photo is deleted right after.'}
            </Text>
            <Pressable
              testID="studio-cast"
              onPress={() => {
                tap('medium');
                router.push('/cast/consent');
              }}
              style={({ pressed }) => [styles.heroBtn, firstName ? styles.heroBtnGhost : null, { opacity: pressed ? 0.85 : 1 }]}>
              <SymbolView name="camera.fill" size={14} tintColor={firstName ? colors.text : '#0A0A0A'} />
              <Text style={[styles.heroBtnText, firstName ? { color: colors.text } : null]}>{firstName ? 'Recast' : 'Cast yourself'}</Text>
            </Pressable>
          </View>
          <View style={styles.heroArt}>
            <View style={styles.spotlight} />
            <BlockyCharacter look={me?.look ?? DEMO_LOOK} size={150} />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <EntryCard
            testID="studio-scratch"
            icon="square.and.pencil"
            accent={colors.yellow}
            title="Start from scratch"
            subtitle="Pick a world and write every line yourself."
            onPress={scratch}
          />
          <EntryCard
            testID="studio-templates"
            icon="square.grid.2x2.fill"
            accent={colors.pink}
            title="Use a template"
            subtitle="Fate/Ship Night, Send It, Wax On and more. Just drop yourself in."
            onPress={() => router.push('/create/templates')}
          />
          <EntryCard
            testID="studio-copy"
            icon="arrow.triangle.2.circlepath"
            accent={colors.cyan}
            title="Copy & edit a reel"
            subtitle="Take a hit from the feed, swap yourself in, rewrite the lines."
            onPress={() => router.push('/create/remix')}
          />
        </View>

        <SectionHeader title="Look" />
        <Text style={styles.lookSub}>Pick the art style for your next reel. You can change it per project in the editor.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {ART_STYLES.map((a) => (
            <StyleTile key={a.id} id={a.id} size={96} selected={look.style === a.id} onPress={() => look.choose(a.id)} />
          ))}
        </ScrollView>

        <SectionHeader title="Projects" action={mine.length > 0 ? `${mine.length} yours` : undefined} onAction={() => router.push('/(tabs)/profile')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          <Pressable
            onPress={() => {
              tap('medium');
              scratch();
            }}
            style={({ pressed }) => [styles.newTile, { opacity: pressed ? 0.85 : 1 }]}>
            <View style={styles.newTileIcon}>
              <SymbolView name="plus" size={22} tintColor="#0A0A0A" weight="heavy" />
            </View>
            <Text style={styles.newTileText}>New</Text>
          </Pressable>
          {mine.map((m) => (
            <ProjectCard key={m._id} item={m} onPress={() => open(m)} />
          ))}
          {seeded.map((m) => (
            <ProjectCard key={m._id} item={{ ...m, status: 'done' }} seeded busy={quick.busy === m._id} onPress={() => quick.go(m._id, m.isReel)} />
          ))}
        </ScrollView>

        <SectionHeader title="Remix trending" action="See all" onAction={() => router.push('/create/remix')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} decelerationRate="fast" snapToInterval={312} snapToAlignment="start">
          {(trending ?? []).map((r, i) => (
            <TrendingCard
              key={r._id}
              item={r}
              rank={i + 1}
              busy={quick.busy === r._id}
              onOpen={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: r._id } })}
              onRemix={() => quick.go(r._id, r.isReel)}
            />
          ))}
        </ScrollView>

        <SectionHeader title="Templates" action="See all" onAction={() => router.push('/create/templates')} />
        <View style={styles.grid}>
          {CATEGORIES.map((c, i) => {
            const templates = c.templates.map(templateById).filter((t) => !!t);
            const art = templates.map((t) => stats[t.id]?.thumbnailUrl).find(Boolean);
            return (
              <CategoryCard
                key={c.id}
                wide={i === 0}
                label={c.label}
                emoji={c.emoji}
                blurb={c.blurb}
                count={templates.length}
                accent={templates[0]?.accent ?? colors.yellow}
                source={templates.find((t) => t.still)?.still ?? (art ? { uri: art } : null)}
                onPress={() => router.push({ pathname: '/create/templates', params: { category: c.id } })}
              />
            );
          })}
        </View>

        <SectionHeader title="Your saved reels" />
        {(savedItems ?? []).length === 0 ? (
          <View style={styles.emptyCard}>
            <SymbolView name="bookmark" size={22} tintColor={colors.yellow} />
            <Text style={styles.empty}>Bookmark reels in the feed and they show up here, one tap from your own remix.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {(savedItems ?? []).map((r) => (
              <RemixCard
                key={r._id}
                item={r}
                onOpen={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: r._id } })}
                onRemix={() => quick.go(r._id, r.isReel)}
              />
            ))}
          </ScrollView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { color: colors.pink, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  pageTitle: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 },
  newBtnText: { color: '#0A0A0A', fontWeight: '900', fontSize: 14 },
  hero: {
    flexDirection: 'row',
    borderRadius: 28,
    backgroundColor: '#15101F',
    borderWidth: 1,
    borderColor: 'rgba(255,46,136,0.35)',
    overflow: 'hidden',
    minHeight: 210,
  },
  glow: { position: 'absolute', width: 240, height: 240, borderRadius: 120, opacity: 0.28 },
  heroText: { flex: 1, padding: 18, paddingRight: 4, gap: 4, justifyContent: 'center' },
  heroKicker: { color: colors.yellow, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  heroName: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1, lineHeight: 33 },
  heroStar: { color: colors.pink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: -2 },
  heroSub: { color: colors.muted, fontSize: 13, fontWeight: '600', lineHeight: 18, marginTop: 4 },
  heroBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.yellow,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  heroBtnGhost: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroBtnText: { color: '#0A0A0A', fontWeight: '900', fontSize: 14 },
  heroArt: { width: 140, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  spotlight: { position: 'absolute', bottom: 8, width: 120, height: 26, borderRadius: 60, backgroundColor: 'rgba(255,210,63,0.22)' },
  rail: { gap: 12, paddingRight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  newTile: { width: 92, height: 158, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 8 },
  newTileIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  newTileText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  lookSub: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: -6 },
  empty: { color: colors.muted, fontSize: 14, fontWeight: '600', lineHeight: 20, flex: 1 },
  emptyCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
});
