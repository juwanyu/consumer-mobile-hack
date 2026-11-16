import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Tag, tap, TemplateHeroArt, TemplateTags } from '@/components/studio';
import { compact } from '@/components/reel-card';
import { useArtStyle } from '@/art-style';
import { addLocal } from '@/local';
import { useMe } from '@/me';
import { formatSeconds, templateById, templateStats, TEMPLATE_SOURCE_REEL } from '@/templates';
import { colors, radius } from '@/theme';

export default function TemplateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const template = templateById(id);
  const { id: ownerId, me } = useMe();
  const feed = useQuery(api.movies.feed);
  const stats = useMemo(() => templateStats(feed), [feed]);
  const createReel = useMutation(api.movies.createReel);
  const create = useMutation(api.movies.create);
  const setArtStyle = useMutation(api.movies.setArtStyle);
  const { style } = useArtStyle();
  const [busy, setBusy] = useState(false);

  if (!template) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.title}>Template not found</Text>
      </SafeAreaView>
    );
  }
  const s = stats[template.id];
  const source = TEMPLATE_SOURCE_REEL[template.id] ?? s?.reels[0]?._id;
  const castMemberId = me?.castMemberId as Id<'castMembers'> | undefined;

  const use = async () => {
    tap('heavy');
    if (!castMemberId) {
      router.push('/cast/consent');
      return;
    }
    setBusy(true);
    try {
      const movieId =
        template.kind === 'reel'
          ? await createReel({ templateId: template.id, master: castMemberId, ownerId: ownerId ?? undefined })
          : await create({ castMemberId, genre: template.id, ownerId: ownerId ?? undefined });
      await addLocal('mine', movieId);
      await setArtStyle({ movieId, artStyle: style }).catch(() => {});
      router.push({ pathname: template.kind === 'reel' ? '/movie/[id]/edit' : '/movie/[id]/story', params: { id: movieId } });
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <TemplateHeroArt template={template} stats={s} />
          <View style={styles.heroShade} />
          <Pressable
            hitSlop={14}
            onPress={() => {
              tap();
              router.back();
            }}
            style={styles.back}>
            <SymbolView name="chevron.left" size={18} tintColor={colors.text} weight="bold" />
          </Pressable>
          <View style={styles.heroTags}>
            <TemplateTags stats={s} />
            <Tag text={template.kind === 'reel' ? '🎙️ Narrated reel' : '🎬 Cinematic'} color="rgba(0,0,0,0.6)" dark />
          </View>
          {source ? (
            <Pressable
              onPress={() => {
                tap();
                router.push({ pathname: '/movie/[id]/premiere', params: { id: source } });
              }}
              style={styles.watch}>
              <SymbolView name="play.fill" size={14} tintColor="#0A0A0A" />
              <Text style={styles.watchText}>Watch an example</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[styles.kicker, { color: template.accent }]}>{template.emoji} TEMPLATE</Text>
          <Text style={styles.title}>{template.label}</Text>
          <Text style={styles.tagline}>{template.tagline}</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat value={formatSeconds(template.seconds)} label="Length" />
          <Stat value={String(template.beats.length)} label={template.kind === 'reel' ? 'Beats' : 'Shots'} />
          <Stat value={String(template.roles.length)} label={template.roles.length === 1 ? 'Role' : 'Roles'} />
          <Stat value={s && s.reels.length ? compact(s.views) : '—'} label="Views" />
        </View>

        <Text style={styles.section}>Roles</Text>
        <View style={styles.roles}>
          {template.roles.map((r, i) => (
            <View key={r} style={[styles.role, i === 0 && { borderColor: template.accent }]}>
              <Text style={styles.roleText}>{r}</Text>
              <Text style={styles.roleSub}>{i === 0 ? 'You' : 'Optional'}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>{template.kind === 'reel' ? 'The beats' : 'The shots'}</Text>
        <View style={{ gap: 8 }}>
          {template.beats.map((b, i) => (
            <View key={i} style={styles.beat}>
              <View style={[styles.beatNum, { backgroundColor: template.accent }]}>
                <Text style={styles.beatNumText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.beatTitle}>{b.title}</Text>
                <Text style={styles.beatLine}>{b.line}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>Every line is editable after you drop yourself in.</Text>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable testID="use-template" disabled={busy} onPress={use} style={({ pressed }) => [styles.use, { opacity: pressed || busy ? 0.85 : 1 }]}>
          {busy ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.useText}>{castMemberId ? '✂️ Edit in Film Studio' : 'Cast yourself to start'}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingTop: 6, gap: 14, paddingBottom: 30 },
  heroShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 80, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.25)' },
  back: { position: 'absolute', top: 12, left: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  heroTags: { position: 'absolute', top: 18, right: 12, flexDirection: 'row', gap: 6 },
  watch: { position: 'absolute', bottom: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  watchText: { color: '#0A0A0A', fontWeight: '900', fontSize: 14 },
  kicker: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  tagline: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  statsRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  section: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 6 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  role: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  roleText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  roleSub: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  beat: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  beatNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  beatNumText: { color: '#0A0A0A', fontWeight: '900', fontSize: 13 },
  beatTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  beatLine: { color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  hint: { color: colors.faint, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  footer: { paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  use: { height: 58, borderRadius: radius.lg, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  useText: { color: '#0A0A0A', fontWeight: '900', fontSize: 18 },
});
