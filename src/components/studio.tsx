import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { Look } from '../../convex/looks';
import { BlockyCharacter } from '@/components/blocky-character';
import { compact, type ReelItem } from '@/components/reel-card';
import { ART_STYLES, STYLE_STILLS, useArtStyle, type ArtStyle } from '@/art-style';
import { addLocal } from '@/local';
import { useMe } from '@/me';
import { formatSeconds, TEMPLATES, type StudioTemplate, type TemplateStats } from '@/templates';
import { colors, radius, type } from '@/theme';

export function tap(style: 'light' | 'medium' | 'heavy' = 'light') {
  Haptics.impactAsync(
    style === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : style === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable
          hitSlop={10}
          onPress={() => {
            tap();
            onAction();
          }}>
          <Text style={styles.sectionAction}>{action} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Tag({ text, color, dark }: { text: string; color: string; dark?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: color }]}>
      <Text style={[styles.tagText, { color: dark ? colors.text : '#0A0A0A' }]}>{text}</Text>
    </View>
  );
}

export function EntryCard({
  icon,
  title,
  subtitle,
  accent,
  onPress,
  testID,
  children,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  accent: string;
  onPress: () => void;
  testID?: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        tap('medium');
        onPress();
      }}
      style={({ pressed }) => [styles.entry, { borderColor: `${accent}55`, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={[styles.entryGlow, { backgroundColor: accent }]} />
      <View style={[styles.entryIcon, { backgroundColor: accent }]}>
        <SymbolView name={icon} size={26} tintColor="#0A0A0A" weight="bold" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.entryTitle}>{title}</Text>
        <Text style={styles.entrySub} numberOfLines={2}>
          {subtitle}
        </Text>
        {children}
      </View>
      <SymbolView name="chevron.right" size={16} tintColor={colors.muted} weight="bold" />
    </Pressable>
  );
}

function TemplateArt({ template, stats, style }: { template: StudioTemplate; stats?: TemplateStats; style?: ViewStyle }) {
  const source = stats?.thumbnailUrl ? { uri: stats.thumbnailUrl } : template.still;
  return (
    <View style={[styles.art, { backgroundColor: `${template.accent}33` }, style]}>
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <>
          <View style={[styles.artBlob, { backgroundColor: template.accent, top: -40, right: -30 }]} />
          <View style={[styles.artBlob, { backgroundColor: colors.yellow, bottom: -60, left: -40, opacity: 0.18 }]} />
          <Text style={styles.artEmoji}>{template.emoji}</Text>
        </>
      )}
    </View>
  );
}

export function TemplateTags({ stats }: { stats?: TemplateStats }) {
  if (stats?.tag === 'trending') return <Tag text="🔥 Trending" color={colors.yellow} />;
  if (stats?.tag === 'new') return <Tag text="✨ New" color={colors.cyan} />;
  return null;
}

export function TemplateCard({
  template,
  stats,
  onPress,
  width,
  height = 270,
}: {
  template: StudioTemplate;
  stats?: TemplateStats;
  onPress: () => void;
  width?: number | `${number}%`;
  height?: number;
}) {
  return (
    <Pressable
      testID={`template-${template.id}`}
      accessibilityRole="button"
      accessibilityLabel={template.label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.templateCard, { width, height, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <TemplateArt template={template} stats={stats} style={StyleSheet.absoluteFill} />
      <View style={styles.scrimTop} />
      <View style={styles.scrimBottom} />
      <View style={styles.templateTop}>
        <TemplateTags stats={stats} />
      </View>
      <View style={styles.templateMeta}>
        <Text style={styles.templateEmoji}>{template.emoji}</Text>
        <Text style={styles.templateTitle} numberOfLines={2}>
          {template.label}
        </Text>
        <Text style={styles.templateSub} numberOfLines={1}>
          {template.roles.length} {template.roles.length === 1 ? 'role' : 'roles'} · {formatSeconds(template.seconds)} · {template.beats.length}{' '}
          {template.kind === 'reel' ? 'beats' : 'shots'}
        </Text>
        {stats && stats.reels.length > 0 ? (
          <Text style={styles.templateStat}>
            ▶ {compact(stats.views)} · {compact(stats.remixes)} remixes
          </Text>
        ) : null}
      </View>
      <View style={[styles.templateBar, { backgroundColor: template.accent }]} />
    </Pressable>
  );
}

export function TemplateHeroArt({ template, stats }: { template: StudioTemplate; stats?: TemplateStats }) {
  return <TemplateArt template={template} stats={stats} style={styles.heroArt} />;
}

export function RemixCard({ item, onOpen, onRemix, width = 158 }: { item: ReelItem; onOpen: () => void; onRemix: () => void; width?: number }) {
  return (
    <Pressable
      testID={`copy-${item._id}`}
      onPress={() => {
        tap();
        onOpen();
      }}
      style={({ pressed }) => [styles.remixCard, { width, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <View style={[styles.remixThumb, { height: width * 1.42 }]}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : item.cast[0]?.look ? (
          <BlockyCharacter look={item.cast[0].look} size={80} animate={false} />
        ) : null}
        <View style={styles.scrimBottomSoft} />
        <View style={styles.remixStats}>
          <Text style={styles.remixStat}>▶ {compact(item.views)}</Text>
          <Text style={styles.remixStat}>♥ {compact(item.likes)}</Text>
        </View>
      </View>
      <View style={{ gap: 2, paddingHorizontal: 2 }}>
        <Text style={styles.remixTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.remixBy} numberOfLines={1}>
          @{item.owner?.handle ?? 'cast.studio'} · {item.style}
        </Text>
      </View>
      <Pressable
        testID={`remix-${item._id}`}
        accessibilityRole="button"
        accessibilityLabel={`Remix ${item.title}`}
        onPress={() => {
          tap('medium');
          onRemix();
        }}
        style={({ pressed }) => [styles.remixBtn, { opacity: pressed ? 0.8 : 1 }]}>
        <SymbolView name="arrow.triangle.2.circlepath" size={14} tintColor="#0A0A0A" weight="bold" />
        <Text style={styles.remixBtnText}>Remix</Text>
      </Pressable>
    </Pressable>
  );
}

type Production = { _id: Id<'movies'>; title: string; status: string; thumbnailUrl: string | null; cast: { look: Look | null }[] };

const RUNNING = ['voicing', 'queued', 'rendering'];
export function useQuickRemix() {
  const router = useRouter();
  const { id, me } = useMe();
  const remix = useMutation(api.movies.remix);
  const setArtStyle = useMutation(api.movies.setArtStyle);
  const { style } = useArtStyle();
  const [busy, setBusy] = useState<string | null>(null);
  const castMemberId = me?.castMemberId as Id<'castMembers'> | undefined;
  const go = async (movieId: Id<'movies'>, isReel: boolean) => {
    tap('heavy');
    if (!castMemberId) {
      router.push({ pathname: '/movie/[id]/remix', params: { id: movieId } });
      return;
    }
    setBusy(movieId);
    try {
      const newId = await remix({ movieId, castMemberId, ownerId: id ?? undefined });
      await addLocal('mine', newId);
      await setArtStyle({ movieId: newId, artStyle: style }).catch(() => {});
      router.push({ pathname: isReel ? '/movie/[id]/edit' : '/movie/[id]/story', params: { id: newId } });
    } catch (e) {
      Alert.alert('Could not remix', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };
  return { go, busy };
}

export function durationFor(item: { isReel: boolean; style: string; genre: string }) {
  const t = TEMPLATES.find((x) => (item.isReel ? x.kind === 'reel' && x.label === item.style : x.kind === 'genre' && x.id === item.genre));
  return t ? formatSeconds(t.seconds) : null;
}

export function ago(ms: number | undefined) {
  if (!ms) return 'just now';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

type ProjectItem = Production & { isReel: boolean; style: string; genre: string; finishedAt?: number };

export function ProjectCard({ item, onPress, seeded, busy }: { item: ProjectItem; onPress: () => void; seeded?: boolean; busy?: boolean }) {
  const live = useQuery(api.movies.get, item.finishedAt ? 'skip' : { movieId: item._id });
  const when = item.finishedAt ?? live?._creationTime;
  const status = live?.status ?? item.status;
  const pct = live?.progress?.pct;
  const meta = seeded
    ? `Starter · edited ${ago(when)}`
    : RUNNING.includes(status)
      ? `Rendering ${pct !== undefined ? `${Math.round(pct)}%` : '…'}`
      : status === 'failed'
        ? 'Failed · tap to retry'
        : `${status === 'draft' ? 'Draft · ' : ''}edited ${ago(when)}`;
  const duration = durationFor(item);
  return (
    <Pressable
      testID={`project-${item._id}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.project, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <View style={styles.projectThumb}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : item.cast[0]?.look ? (
          <View style={{ marginTop: 34 }}>
            <BlockyCharacter look={item.cast[0].look} size={86} animate={false} />
          </View>
        ) : null}
        {duration ? (
          <View style={styles.duration}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        ) : null}
        {seeded ? (
          <View style={styles.seeded}>
            <SymbolView name="arrow.triangle.2.circlepath" size={11} tintColor="#0A0A0A" weight="bold" />
          </View>
        ) : status !== 'done' ? (
          <View style={[styles.seeded, { backgroundColor: status === 'draft' ? colors.text : status === 'failed' ? colors.red : colors.yellow }]}>
            <SymbolView name={status === 'draft' ? 'pencil' : 'film'} size={11} tintColor="#0A0A0A" weight="bold" />
          </View>
        ) : null}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : null}
      </View>
      <Text style={styles.projectTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={[styles.projectMeta, RUNNING.includes(status) && { color: colors.yellow }, status === 'failed' && { color: colors.red }]} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

export function CategoryCard({
  label,
  emoji,
  blurb,
  count,
  source,
  accent,
  onPress,
  wide,
}: {
  label: string;
  emoji: string;
  blurb: string;
  count: number;
  source: number | { uri: string } | null;
  accent: string;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      testID={`category-${label}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.category, wide ? { width: '100%', height: 150 } : null, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
      <View style={styles.categoryShade} />
      <View style={[styles.templateBar, { backgroundColor: accent }]} />
      <View style={styles.categoryMeta}>
        <Text style={styles.categoryTitle}>
          {emoji} {label}
        </Text>
        <Text style={styles.templateSub} numberOfLines={1}>
          {blurb} · {count} {count === 1 ? 'template' : 'templates'}
        </Text>
      </View>
    </Pressable>
  );
}

export function TrendingCard({ item, rank, onOpen, onRemix, busy }: { item: ReelItem; rank: number; onOpen: () => void; onRemix: () => void; busy?: boolean }) {
  return (
    <Pressable
      testID={`trending-${item._id}`}
      onPress={() => {
        tap();
        onOpen();
      }}
      style={({ pressed }) => [styles.trending, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {item.thumbnailUrl ? <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
      <View style={styles.scrimBottom} />
      <View style={styles.templateTop}>
        <Tag text={`#${rank} 🔥 Trending`} color={colors.yellow} />
      </View>
      <View style={styles.trendingMeta}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.templateTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.templateSub} numberOfLines={1}>
            @{item.owner?.handle ?? 'cast.studio'} · ▶ {compact(item.views)} · ♥ {compact(item.likes)}
          </Text>
          <Text style={styles.templateStat} numberOfLines={1}>
            {item.cast.map((c) => c.role).join(' + ')}
          </Text>
        </View>
        <Pressable
          testID={`trending-remix-${item._id}`}
          accessibilityRole="button"
          accessibilityLabel={`Remix ${item.title}`}
          onPress={onRemix}
          style={({ pressed }) => [styles.remixBtn, styles.trendingBtn, { opacity: pressed ? 0.8 : 1 }]}>
          {busy ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <>
              <SymbolView name="arrow.triangle.2.circlepath" size={14} tintColor="#0A0A0A" weight="bold" />
              <Text style={styles.remixBtnText}>Remix</Text>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

export function StyleTile({ id, size = 92, selected, onPress }: { id: ArtStyle; size?: number; selected?: boolean; onPress: () => void }) {
  const meta = ART_STYLES.find((s) => s.id === id)!;
  const [a, b, c] = meta.colors;
  return (
    <Pressable
      testID={`style-${id}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={meta.label}
      onPress={() => {
        tap('medium');
        onPress();
      }}
      style={({ pressed }) => [{ width: size, gap: 6, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
      <View style={[styles.styleArt, { width: size, height: size * 1.25, backgroundColor: a, borderColor: selected ? colors.text : 'transparent' }]}>
        {id === 'blocky' ? (
          <View style={{ gap: 4, alignItems: 'center' }}>
            <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: 4, backgroundColor: b }} />
            <View style={{ width: size * 0.5, height: size * 0.36, borderRadius: 4, backgroundColor: c }} />
          </View>
        ) : null}
        {id === 'anime2d'
          ? [0, 1, 2, 3, 4].map((i) => <View key={i} style={[styles.speedLine, { top: 10 + i * size * 0.22, backgroundColor: c, transform: [{ rotate: '-24deg' }] }]} />)
          : null}
        {id === 'pixel' ? (
          <View style={styles.pixelGrid}>
            {Array.from({ length: 16 }, (_, i) => (
              <View key={i} style={{ width: '25%', aspectRatio: 1, backgroundColor: (i + Math.floor(i / 4)) % 2 ? b : c, opacity: (i * 7) % 3 === 0 ? 0.55 : 1 }} />
            ))}
          </View>
        ) : null}
        {id === 'clay' ? (
          <>
            <View style={[styles.blob, { width: size * 0.7, height: size * 0.6, backgroundColor: b, bottom: -size * 0.12, left: -size * 0.1 }]} />
            <View style={[styles.blob, { width: size * 0.45, height: size * 0.45, backgroundColor: c, top: size * 0.12, right: -size * 0.06 }]} />
          </>
        ) : null}
        {id === 'comic' ? (
          <View style={styles.dots}>
            {Array.from({ length: 30 }, (_, i) => (
              <View key={i} style={{ width: 7, height: 7, borderRadius: 4, margin: 3, backgroundColor: b, opacity: 0.85 }} />
            ))}
          </View>
        ) : null}
        <Image source={STYLE_STILLS[id]} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <Text style={[styles.styleEmoji, { fontSize: size * 0.22, position: 'absolute', bottom: 6, left: 6 }]}>{meta.emoji}</Text>
        {selected ? (
          <View style={styles.styleCheck}>
            <SymbolView name="checkmark" size={11} tintColor="#0A0A0A" weight="heavy" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.styleLabel, selected && { color: colors.text }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 },
  sectionTitle: { ...type.heading, fontSize: 21, letterSpacing: -0.4 },
  sectionAction: { color: colors.yellow, fontWeight: '800', fontSize: 14 },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    overflow: 'hidden',
  },
  entryGlow: { position: 'absolute', width: 160, height: 160, borderRadius: 80, left: -70, top: -70, opacity: 0.14 },
  entryIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { color: colors.text, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  entrySub: { color: colors.muted, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  art: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  artBlob: { position: 'absolute', width: 200, height: 200, borderRadius: 100, opacity: 0.45 },
  artEmoji: { fontSize: 76, marginBottom: 50 },
  heroArt: { height: 320, borderRadius: radius.lg },
  templateCard: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 70, backgroundColor: 'rgba(0,0,0,0.2)' },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '58%', backgroundColor: 'rgba(0,0,0,0.6)' },
  scrimBottomSoft: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: 'rgba(0,0,0,0.45)' },
  templateTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  templateMeta: { padding: 14, paddingBottom: 18, gap: 3 },
  templateEmoji: { fontSize: 26 },
  templateTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  templateSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  templateStat: { color: colors.yellow, fontSize: 12, fontWeight: '800', marginTop: 2 },
  templateBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4 },
  remixCard: { gap: 8 },
  remixThumb: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'flex-end' },
  remixStats: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', gap: 10 },
  remixStat: { color: colors.text, fontSize: 12, fontWeight: '800' },
  remixTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  remixBy: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  remixBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.cyan, borderRadius: radius.pill, paddingVertical: 9 },
  remixBtnText: { color: '#0A0A0A', fontWeight: '900', fontSize: 14 },
  project: { width: 118, gap: 4 },
  projectThumb: { width: 118, height: 158, borderRadius: 14, backgroundColor: colors.surfaceHi, overflow: 'hidden', alignItems: 'center' },
  duration: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  durationText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  seeded: { position: 'absolute', left: 6, top: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center' },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  projectTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  projectMeta: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  category: { width: '48.5%', height: 170, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHi, justifyContent: 'flex-end' },
  categoryShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.55)' },
  categoryMeta: { padding: 12, paddingBottom: 14, gap: 2 },
  categoryTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  trending: { width: 300, height: 380, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHi, justifyContent: 'flex-end' },
  trendingMeta: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 14, paddingBottom: 16 },
  styleArt: { borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  speedLine: { position: 'absolute', left: -20, right: -20, height: 3, opacity: 0.7 },
  pixelGrid: { ...StyleSheet.absoluteFill, flexDirection: 'row', flexWrap: 'wrap' },
  blob: { position: 'absolute', borderRadius: 999 },
  dots: { ...StyleSheet.absoluteFill, flexDirection: 'row', flexWrap: 'wrap', padding: 2 },
  styleEmoji: { position: 'absolute', bottom: 6, right: 8 },
  styleCheck: { position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  styleLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  trendingBtn: { paddingHorizontal: 16, paddingVertical: 11, minWidth: 96 },
});
