import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { fillNames, REEL_TEMPLATES, type Beat, type SlotId } from '../../../../convex/reels';
import { Avatar } from '@/components/avatar';
import { BlockyCharacter } from '@/components/blocky-character';
import { Chips } from '@/components/chips';
import { DirectorSheet } from '@/components/director-sheet';
import { StyleTile, Tag, tap } from '@/components/studio';
import { ART_STYLES } from '@/art-style';
import { useMyId } from '@/me';
import { library } from '@/library';
import { formatSeconds, templateById, TEMPLATE_SOURCE_REEL } from '@/templates';
import { colors, radius } from '@/theme';

type Tool = 'style' | 'clip' | 'cast' | 'script' | 'camera' | 'set' | 'captions' | 'voice' | 'music';

const TOOLS: { id: Tool; icon: SFSymbol; label: string }[] = [
  { id: 'style', icon: 'paintpalette.fill', label: 'Style' },
  { id: 'cast', icon: 'person.2.fill', label: 'Cast' },
  { id: 'script', icon: 'text.quote', label: 'Script' },
  { id: 'camera', icon: 'video.fill', label: 'Camera' },
  { id: 'set', icon: 'building.columns.fill', label: 'Set' },
  { id: 'captions', icon: 'captions.bubble.fill', label: 'Captions' },
  { id: 'voice', icon: 'waveform', label: 'Voice' },
  { id: 'music', icon: 'music.note', label: 'Music' },
];

const TITLES: Record<Tool, string> = { style: 'Look', clip: 'Clip', cast: 'Cast', script: 'Script', camera: 'Camera', set: 'Set', captions: 'Captions', voice: 'Voice', music: 'Music' };
const CLIP_PX = 48;
const MIN_SECONDS = 1.5;
const MAX_SECONDS = 4;
const words = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const place = (id: string) => library.locations[id as keyof typeof library.locations]?.label ?? words(id);

export default function ReelStudioEditor() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const cut = useQuery(api.director.cut, { movieId: id });
  const ready = useQuery(api.casting.listReady);
  const updateReel = useMutation(api.movies.updateReel);
  const saveCut = useMutation(api.director.saveCut);
  const setSlot = useMutation(api.movies.setSlot);
  const lock = useMutation(api.movies.action);
  const setArtStyle = useMutation(api.movies.setArtStyle);
  const ping = useMutation(api.coop.ping);
  const myId = useMyId();
  const coop = useQuery(api.coop.forDraft, { movieId: id });
  const [now, setNow] = useState(() => Math.floor(Date.now() / 5000) * 5000);
  const presence = useQuery(api.coop.presence, coop ? { movieId: id, now } : 'skip');
  const [shots, setShots] = useState<Beat[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [tool, setTool] = useState<Tool | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [director, setDirector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ next: Beat[]; structural: boolean } | null>(null);

  const templateId = movie?.reel?.templateId;
  const template = templateId ? REEL_TEMPLATES[templateId] : undefined;
  const sourceId = (movie?.remixOf ?? (templateId ? TEMPLATE_SOURCE_REEL[templateId] : undefined)) as Id<'movies'> | undefined;
  const source = useQuery(api.movies.get, movie && movie.previewUrls.length === 0 && sourceId ? { movieId: sourceId } : 'skip');

  useEffect(() => {
    if (cut && !pending.current) setShots(cut.beats as Beat[]);
  }, [cut]);

  useEffect(() => {
    if (movie && movie.status !== 'draft') router.replace({ pathname: '/movie/[id]/render', params: { id } });
  }, [movie, router, id]);

  useEffect(() => {
    if (!playing || !shots?.[selected]) return;
    const t = setTimeout(() => {
      if (selected >= shots.length - 1) setPlaying(false);
      else setSelected(selected + 1);
    }, shots[selected].duration * 1000);
    return () => clearTimeout(t);
  }, [playing, selected, shots]);

  useEffect(() => {
    if (shots && shots.length > 0 && selected > shots.length - 1) setSelected(shots.length - 1);
  }, [shots, selected]);

  useEffect(() => {
    if (!coop) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 5000) * 5000), 5000);
    return () => clearInterval(t);
  }, [coop]);

  const coopId = coop?._id;
  useEffect(() => {
    if (!coopId || !myId) return;
    const send = () => ping({ movieId: id, userId: myId, beat: selected }).catch(() => {});
    send();
    const t = setInterval(send, 8000);
    return () => clearInterval(t);
  }, [coopId, myId, id, selected, ping]);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    if (job.structural) await saveCut({ movieId: id, beats: job.next });
    else await updateReel({ movieId: id, beats: job.next.map((b) => ({ caption: b.caption, narration: b.narration })) });
  };

  if (!movie || !movie.reel || !shots || !template || !shots[selected]) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        {movie === null || (movie && !movie.reel) ? <Text style={styles.title}>This one isn't a reel</Text> : <ActivityIndicator color={colors.yellow} size="large" />}
      </SafeAreaView>
    );
  }

  const options = cut?.library;
  const previews = [...(movie.previewUrls.length ? movie.previewUrls : (source?.previewUrls ?? []))].sort((a, b) => a.shot - b.shot);
  const fallbackStill = templateById(template.id)?.still ?? null;
  const frameFor = (i: number) => {
    const loc = shots[i]?.location;
    const at = template.beats[i]?.location === loc ? i : template.beats.findIndex((b) => b.location === loc);
    return previews[at] ? { uri: previews[at].url } : fallbackStill;
  };
  const names = Object.fromEntries(movie.castDetails.map((c) => [c.slot ?? 'master', c.name])) as Partial<Record<SlotId, string>>;
  const beat = shots[selected];
  const total = shots.reduce((s, b) => s + b.duration, 0);
  const elapsed = shots.slice(0, selected).reduce((s, b) => s + b.duration, 0);
  const inShot = beat.characters
    .filter((ch) => !ch.slot.startsWith('npc:'))
    .map((ch) => movie.castDetails.find((c) => (c.slot ?? 'master') === ch.slot))
    .filter((c) => !!c);
  const fxList = [beat.fx].flat().filter(Boolean);
  const artStyle = ART_STYLES.find((a) => a.id === movie.artStyle) ?? ART_STYLES[0];
  const others = (presence ?? []).filter((p) => p.user && p.user._id !== myId);
  const here = (i: number) => others.filter((p) => p.beat === i);

  const commit = (next: Beat[], structural: boolean) => {
    setShots(next);
    pending.current = { next, structural: structural || !!pending.current?.structural };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush().catch((e) => setError(e instanceof Error ? e.message : 'Could not save.')), structural ? 600 : 500);
  };
  const patch = (p: Partial<Beat>, structural: boolean) => commit(shots.map((b, j) => (j === selected ? { ...b, ...p } : b)), structural);

  const select = (i: number) => {
    tap();
    setPlaying(false);
    setSelected(i);
  };

  const move = (dir: -1 | 1) => {
    const to = selected + dir;
    if (to < 0 || to >= shots.length) return;
    tap('medium');
    const next = [...shots];
    [next[selected], next[to]] = [next[to], next[selected]];
    commit(next, true);
    setSelected(to);
  };
  const duplicate = () => {
    tap('medium');
    const next = [...shots.slice(0, selected + 1), { ...shots[selected] }, ...shots.slice(selected + 1)];
    commit(next, true);
    setSelected(selected + 1);
  };
  const remove = () => {
    if (shots.length <= 1) return;
    tap('heavy');
    commit(
      shots.filter((_, j) => j !== selected),
      true,
    );
    setSelected(Math.max(0, selected - 1));
    setTool(null);
  };

  const roll = async () => {
    tap('heavy');
    setRolling(true);
    setError(null);
    try {
      await flush();
      await lock({ movieId: id });
      router.replace({ pathname: '/movie/[id]/render', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not roll camera.');
      setRolling(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          hitSlop={14}
          onPress={() => {
            tap();
            flush().catch(() => {});
            router.back();
          }}
          style={styles.iconBtn}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.text} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            {template.emoji} {template.label}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {movie.story.title}
          </Text>
        </View>
        <Pressable testID="roll-camera" disabled={rolling} onPress={roll} style={({ pressed }) => [styles.roll, { opacity: pressed || rolling ? 0.85 : 1 }]}>
          {rolling ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.rollText}>Roll camera 🎬</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {coop ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coopRow} style={{ flexGrow: 0 }}>
          <View style={styles.coopTag}>
            <Text style={styles.coopTagText}>👥 Co-op · {coop.title}</Text>
          </View>
          {coop.slots.map((slot) => {
            const live = others.find((o) => o.user?._id === slot.player?._id);
            return (
              <View key={slot.id} style={[styles.coopPlayer, slot.mine && { borderColor: colors.yellow }]}>
                <Avatar look={slot.player?.look ?? null} name={slot.player?.name ?? '?'} size={22} ring={!!live} />
                <Text style={styles.coopPlayerText} numberOfLines={1}>
                  {slot.player ? slot.player.name.split(' ')[0] : 'Open'} · {slot.emoji} {slot.role}
                  {live ? ` · shot ${live.beat + 1}` : ''}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.viewport}>
        <View style={styles.frame}>
          {frameFor(selected) ? <Image source={frameFor(selected)!} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: artStyle.colors[0], opacity: artStyle.id === 'blocky' ? 0 : 0.22 }]} />
          <View style={styles.styleBadge}>
            <Text style={styles.styleBadgeText}>
              {artStyle.emoji} {artStyle.label}
            </Text>
          </View>
          <View style={styles.frameTop}>
            <View style={styles.hud}>
              <Text style={styles.hudLabel}>{words(beat.camera.mark)}</Text>
              <Text style={styles.hudValue}>{words(beat.camera.move)}</Text>
            </View>
            {fxList.slice(0, 2).map((f) => (
              <View key={f} style={styles.hud}>
                <Text style={styles.hudLabel}>FX</Text>
                <Text style={styles.hudValue}>{words(f)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.frameCaption} numberOfLines={2}>
            {fillNames(beat.caption, names)}
          </Text>
          <View style={styles.frameCast}>
            {inShot.map((c) => (
              <View key={c.castMemberId} style={{ marginRight: -6 }}>
                <Avatar look={c.look} name={c.name} size={30} ring />
              </View>
            ))}
          </View>
          <View style={styles.frameSet}>
            <Text style={styles.frameSetText}>{place(beat.location)}</Text>
          </View>
        </View>
        <View style={styles.transport}>
          <Text style={styles.time}>
            {formatSeconds(Math.round(elapsed))} / {formatSeconds(Math.round(total))}
          </Text>
          <Pressable
            testID="preview-play"
            onPress={() => {
              tap('medium');
              if (!playing && selected >= shots.length - 1) setSelected(0);
              setPlaying(!playing);
            }}
            style={styles.play}>
            <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={16} tintColor="#0A0A0A" />
            <Text style={styles.playText}>{playing ? 'Pause' : 'Preview'}</Text>
          </Pressable>
          <Text style={[styles.time, { textAlign: 'right' }]}>
            Shot {selected + 1}/{shots.length}
          </Text>
        </View>
      </View>

      <View style={styles.timeline}>
        <View style={styles.trackIcons}>
          {(['film', 'captions.bubble', 'waveform', 'music.note'] as SFSymbol[]).map((icon, i) => (
            <View key={icon} style={[styles.trackIcon, { height: i === 0 ? 62 : 24 }]}>
              <SymbolView name={icon} size={13} tintColor={colors.muted} />
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tracks}>
          <View style={{ gap: 6 }}>
            <View style={styles.row}>
              {shots.map((b, i) => {
                const frame = frameFor(i);
                return (
                  <Pressable
                    key={i}
                    testID={`clip-${i + 1}`}
                    onPress={() => select(i)}
                    onLongPress={() => {
                      tap('heavy');
                      setPlaying(false);
                      setSelected(i);
                      setTool('clip');
                    }}
                    delayLongPress={350}
                    style={[styles.clip, { width: b.duration * CLIP_PX }, i === selected && styles.clipSelected]}>
                    {frame ? <Image source={frame} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    <View style={styles.clipShade} />
                    <View style={styles.clipTop}>
                      <Text style={styles.clipNum}>{i + 1}</Text>
                      <View style={{ flexDirection: 'row' }}>
                        {here(i).map((p) => (
                          <View key={p.user!._id} style={{ marginLeft: -6 }}>
                            <Avatar look={p.user!.look} name={p.user!.name} size={18} ring />
                          </View>
                        ))}
                      </View>
                    </View>
                    <Text style={styles.clipDur}>{b.duration.toFixed(1)}s</Text>
                  </Pressable>
                );
              })}
              <Pressable testID="add-shot" onPress={duplicate} style={styles.addClip}>
                <SymbolView name="plus" size={18} tintColor="#0A0A0A" weight="heavy" />
              </Pressable>
            </View>
            <View style={styles.row}>
              {shots.map((b, i) => (
                <Pressable key={i} onPress={() => select(i)} style={[styles.chipTrack, { width: b.duration * CLIP_PX, backgroundColor: i === selected ? colors.pink : '#5A1A3A' }]}>
                  <Text style={styles.trackText} numberOfLines={1}>
                    {fillNames(b.caption, names) || '—'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              {shots.map((b, i) => (
                <Pressable key={i} onPress={() => select(i)} style={[styles.chipTrack, { width: b.duration * CLIP_PX, backgroundColor: i === selected ? colors.cyan : '#12505A' }]}>
                  <Text style={[styles.trackText, i === selected && { color: '#0A0A0A' }]} numberOfLines={1}>
                    {fillNames(b.narration, names) || '—'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.chipTrack, { width: total * CLIP_PX + (shots.length - 1) * 4, backgroundColor: '#1F4A2E' }]}>
              <Text style={styles.trackText} numberOfLines={1}>
                ♪ {template.label} score · ducked under narration
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
      <Text style={styles.timelineHint} numberOfLines={1}>
        {others.length
          ? others.map((p) => `${p.user!.name.split(' ')[0]} is on shot ${p.beat + 1}`).join(' · ')
          : 'Tap a clip to select · hold to move, duplicate or cut · + adds a shot'}
      </Text>

      <View style={{ flex: 1 }} />
      <Pressable
        testID="director"
        onPress={() => {
          tap('medium');
          flush().catch(() => {});
          setDirector(true);
        }}
        style={styles.director}>
        <Text style={styles.directorText}>🎬 Director</Text>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar} style={{ flexGrow: 0 }}>
        {TOOLS.map((t) => (
          <Pressable
            key={t.id}
            testID={`tool-${t.id}`}
            onPress={() => {
              tap();
              setPlaying(false);
              setTool(t.id);
            }}
            style={({ pressed }) => [styles.tool, { opacity: pressed ? 0.7 : 1 }]}>
            <SymbolView name={t.icon} size={22} tintColor={colors.text} />
            <Text style={styles.toolText}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={tool !== null} transparent animationType="slide" onRequestClose={() => setTool(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setTool(null)} />
        <KeyboardAvoidingView behavior="padding">
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{tool ? TITLES[tool] : ''}</Text>
              {tool !== 'cast' && tool !== 'music' && tool !== 'style' ? (
                <View style={styles.shotNav}>
                  <Pressable hitSlop={10} disabled={selected === 0} onPress={() => select(selected - 1)} style={{ opacity: selected === 0 ? 0.3 : 1 }}>
                    <SymbolView name="chevron.left" size={16} tintColor={colors.text} weight="bold" />
                  </Pressable>
                  <Text style={styles.shotNavText}>
                    Shot {selected + 1} of {shots.length}
                  </Text>
                  <Pressable hitSlop={10} disabled={selected === shots.length - 1} onPress={() => select(selected + 1)} style={{ opacity: selected === shots.length - 1 ? 0.3 : 1 }}>
                    <SymbolView name="chevron.right" size={16} tintColor={colors.text} weight="bold" />
                  </Pressable>
                </View>
              ) : null}
              <Pressable hitSlop={10} onPress={() => setTool(null)} style={styles.done}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>

            {tool === 'style' ? (
              <View style={{ gap: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {ART_STYLES.map((a) => (
                    <StyleTile
                      key={a.id}
                      id={a.id}
                      size={76}
                      selected={artStyle.id === a.id}
                      onPress={() => setArtStyle({ movieId: id, artStyle: a.id }).catch((e) => setError(e instanceof Error ? e.message : 'Could not change the look.'))}
                    />
                  ))}
                </ScrollView>
                <Text style={styles.hint}>The whole reel renders in this look{coop ? ', for everyone in the session' : ''}.</Text>
              </View>
            ) : null}

            {tool === 'clip' ? (
              <View style={styles.clipActions}>
                <ClipAction icon="arrow.left" label="Move left" disabled={selected === 0} onPress={() => move(-1)} />
                <ClipAction icon="arrow.right" label="Move right" disabled={selected === shots.length - 1} onPress={() => move(1)} />
                <ClipAction icon="plus.square.on.square" label="Duplicate" onPress={duplicate} />
                <ClipAction
                  icon="trash"
                  label="Delete"
                  danger
                  disabled={shots.length <= 1}
                  onPress={() =>
                    Alert.alert(`Delete shot ${selected + 1}?`, undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: remove },
                    ])
                  }
                />
              </View>
            ) : null}

            {tool === 'cast'
              ? template.slots.map((slot) => {
                  const current = movie.castDetails.find((c) => c.slot === slot.id);
                  return (
                    <View key={slot.id} style={{ gap: 8 }}>
                      <Text style={styles.fieldLabel}>{slot.role}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {!slot.required ? (
                          <Pressable
                            onPress={() => {
                              tap();
                              setSlot({ movieId: id, slot: slot.id });
                            }}
                            style={[styles.person, !current && styles.personOn]}>
                            <Text style={{ fontSize: 26, color: colors.muted }}>∅</Text>
                            <Text style={styles.personName}>Nobody</Text>
                          </Pressable>
                        ) : null}
                        {(ready ?? []).map((m) => (
                          <Pressable
                            key={m._id}
                            onPress={() => {
                              tap();
                              setSlot({ movieId: id, slot: slot.id, castMemberId: m._id });
                            }}
                            style={[styles.person, current?.castMemberId === m._id && styles.personOn]}>
                            {m.look ? <BlockyCharacter look={m.look} size={44} animate={false} /> : null}
                            <Text style={styles.personName} numberOfLines={1}>
                              {m.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  );
                })
              : null}

            {tool === 'script' ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>Narrator line</Text>
                <TextInput
                  testID="edit-narration"
                  value={beat.narration}
                  onChangeText={(narration) => patch({ narration }, false)}
                  style={styles.input}
                  multiline
                  maxLength={140}
                  autoFocus
                />
                <View style={styles.hintRow}>
                  <Text style={styles.hint}>Use {'{master}'} or {'{caster}'} for cast names · {beat.narration.length}/140</Text>
                  {template.beats[selected] ? (
                    <Pressable onPress={() => patch({ narration: template.beats[selected].narration }, false)}>
                      <Text style={styles.reset}>Reset</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {tool === 'captions' ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>On-screen caption</Text>
                <TextInput
                  testID="edit-caption"
                  value={beat.caption}
                  onChangeText={(caption) => patch({ caption }, false)}
                  style={[styles.input, { fontWeight: '900' }]}
                  maxLength={60}
                  autoFocus
                />
                <View style={styles.hintRow}>
                  <Text style={styles.hint}>Word-pop captions · {beat.caption.length}/60</Text>
                  {template.beats[selected] ? (
                    <Pressable onPress={() => patch({ caption: template.beats[selected].caption }, false)}>
                      <Text style={styles.reset}>Reset</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {tool === 'camera' ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.fieldLabel}>Framing</Text>
                <Chips
                  accent={colors.yellow}
                  value={beat.camera.mark}
                  onChange={(mark) => patch({ camera: { ...beat.camera, mark } }, true)}
                  options={(options?.cameraMarks ?? library.camera_marks).map((m) => ({ id: m, label: words(m) }))}
                />
                <Text style={styles.fieldLabel}>Move</Text>
                <Chips
                  accent={colors.yellow}
                  value={beat.camera.move}
                  onChange={(m) => patch({ camera: { ...beat.camera, move: m } }, true)}
                  options={(options?.cameraMoves ?? library.camera_moves).map((m) => ({ id: m, label: words(m) }))}
                />
                <Text style={styles.fieldLabel}>Length</Text>
                <View style={styles.stepper}>
                  <Pressable
                    disabled={beat.duration <= MIN_SECONDS}
                    onPress={() => {
                      tap();
                      patch({ duration: Math.max(MIN_SECONDS, Math.round((beat.duration - 0.5) * 10) / 10) }, true);
                    }}
                    style={[styles.stepBtn, beat.duration <= MIN_SECONDS && { opacity: 0.3 }]}>
                    <SymbolView name="minus" size={16} tintColor={colors.text} weight="bold" />
                  </Pressable>
                  <Text style={styles.stepValue}>{beat.duration.toFixed(1)}s</Text>
                  <Pressable
                    disabled={beat.duration >= MAX_SECONDS}
                    onPress={() => {
                      tap();
                      patch({ duration: Math.min(MAX_SECONDS, Math.round((beat.duration + 0.5) * 10) / 10) }, true);
                    }}
                    style={[styles.stepBtn, beat.duration >= MAX_SECONDS && { opacity: 0.3 }]}>
                    <SymbolView name="plus" size={16} tintColor={colors.text} weight="bold" />
                  </Pressable>
                  <Text style={styles.hint}>  1.5 to 4 seconds</Text>
                </View>
              </View>
            ) : null}

            {tool === 'set' ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.fieldLabel}>Location</Text>
                <Chips
                  accent={colors.pink}
                  value={beat.location}
                  onChange={(location) => patch({ location }, true)}
                  options={(options?.locations ?? Object.keys(library.locations)).map((l) => ({ id: l, label: place(l) }))}
                />
                <Text style={styles.fieldLabel}>FX · tap to toggle</Text>
                <View style={styles.fxWrap}>
                  {(options?.fx ?? []).map((f) => {
                    const on = fxList.includes(f);
                    return (
                      <Pressable
                        key={f}
                        onPress={() => {
                          tap();
                          patch({ fx: on ? fxList.filter((x) => x !== f) : [...fxList, f].slice(0, 4) }, true);
                        }}
                        style={[styles.fxChip, on && { backgroundColor: colors.pink, borderColor: colors.pink }]}>
                        <Text style={[styles.fxText, on && { color: '#0A0A0A' }]}>{words(f)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {tool === 'voice' ? (
              <View style={{ gap: 10 }}>
                <Locked rows={[['Narrator', `${words(template.voice)} · ${template.voiceSpeed}× speed`]]} />
                <Text style={styles.fieldLabel}>This shot says</Text>
                <Text style={styles.quote}>“{fillNames(beat.narration, names)}”</Text>
                <Pressable
                  onPress={() => {
                    tap();
                    setTool('script');
                  }}
                  style={styles.secondary}>
                  <Text style={styles.secondaryText}>Rewrite the line</Text>
                </Pressable>
              </View>
            ) : null}

            {tool === 'music' ? <Locked rows={[['Track', `${template.label} score`], ['Mix', 'Auto-ducked under narration']]} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DirectorSheet
        movieId={id}
        visible={director}
        onClose={() => setDirector(false)}
        onApplied={() => {
          pending.current = null;
          setSelected(0);
        }}
      />
    </SafeAreaView>
  );
}

function ClipAction({ icon, label, onPress, disabled, danger }: { icon: SFSymbol; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.clipAction, { opacity: disabled ? 0.3 : pressed ? 0.7 : 1 }]}>
      <SymbolView name={icon} size={22} tintColor={danger ? colors.red : colors.text} />
      <Text style={[styles.toolText, danger && { color: colors.red }]}>{label}</Text>
    </Pressable>
  );
}

function Locked({ rows }: { rows: [string, string][] }) {
  return (
    <View style={{ gap: 8 }}>
      <Tag text="🎬 Ask the Director to change this" color={colors.surfaceHi} dark />
      {rows.map(([k, v], i) => (
        <View key={i} style={styles.lockedRow}>
          <Text style={styles.lockedKey}>{k}</Text>
          <Text style={styles.lockedValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.pink, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  roll: { backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, minWidth: 120, alignItems: 'center' },
  rollText: { color: '#0A0A0A', fontWeight: '900', fontSize: 14 },
  error: { color: colors.red, fontWeight: '700', paddingHorizontal: 16 },
  viewport: { alignItems: 'center', gap: 8, paddingTop: 4 },
  frame: { height: 300, aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  frameTop: { position: 'absolute', top: 8, left: 8, right: 84, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  hud: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  hudLabel: { color: colors.yellow, fontSize: 8, fontWeight: '900' },
  hudValue: { color: colors.text, fontSize: 11, fontWeight: '900' },
  frameCaption: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 44,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  frameCast: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row' },
  frameSet: { position: 'absolute', right: 6, bottom: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, maxWidth: 90 },
  frameSetText: { color: colors.text, fontSize: 9, fontWeight: '800' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 16 },
  time: { color: colors.muted, fontSize: 12, fontWeight: '700', width: 90 },
  play: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  playText: { color: '#0A0A0A', fontWeight: '900', fontSize: 14 },
  timeline: { flexDirection: 'row', marginTop: 12, backgroundColor: '#0B0B10', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  timelineHint: { color: colors.faint, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  trackIcons: { width: 34, gap: 6, alignItems: 'center' },
  trackIcon: { justifyContent: 'center' },
  tracks: { paddingRight: 24 },
  row: { flexDirection: 'row', gap: 4 },
  clip: { height: 62, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surfaceHi, borderWidth: 2, borderColor: 'transparent', justifyContent: 'space-between', padding: 4 },
  clipSelected: { borderColor: colors.yellow },
  clipShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.2)' },
  clipTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 4 },
  styleBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, zIndex: 2 },
  styleBadgeText: { color: colors.text, fontSize: 9, fontWeight: '900' },
  coopRow: { gap: 8, paddingHorizontal: 14, paddingBottom: 6 },
  coopTag: { backgroundColor: colors.pink, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, justifyContent: 'center' },
  coopTagText: { color: colors.text, fontWeight: '900', fontSize: 12 },
  coopPlayer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'transparent' },
  coopPlayerText: { color: colors.text, fontWeight: '800', fontSize: 12, maxWidth: 180 },
  clipNum: { color: colors.text, fontSize: 11, fontWeight: '900' },
  clipDur: { color: colors.text, fontSize: 10, fontWeight: '800', alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 3, overflow: 'hidden' },
  addClip: { width: 44, height: 62, borderRadius: 8, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  chipTrack: { height: 24, borderRadius: 6, justifyContent: 'center', paddingHorizontal: 6 },
  trackText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  director: { position: 'absolute', right: 16, bottom: 96, backgroundColor: colors.pink, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10 },
  directorText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  toolbar: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tool: { width: 64, alignItems: 'center', gap: 5, paddingVertical: 4 },
  toolText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 40, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '900', flex: 1 },
  shotNav: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  shotNavText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  done: { backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  doneText: { color: '#0A0A0A', fontWeight: '900', fontSize: 13 },
  clipActions: { flexDirection: 'row', justifyContent: 'space-between' },
  clipAction: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, marginHorizontal: 4, borderRadius: radius.md, backgroundColor: colors.bg },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  input: { color: colors.text, fontSize: 17, fontWeight: '600', backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { color: colors.faint, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  reset: { color: colors.yellow, fontWeight: '800', fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: colors.text, fontSize: 20, fontWeight: '900', minWidth: 54, textAlign: 'center' },
  fxWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fxChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHi, paddingHorizontal: 12, paddingVertical: 7 },
  fxText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  person: { width: 76, alignItems: 'center', gap: 4, backgroundColor: colors.bg, borderRadius: radius.md, padding: 8, borderWidth: 2, borderColor: 'transparent' },
  personOn: { borderColor: colors.pink },
  personName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  lockedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, backgroundColor: colors.bg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
  lockedKey: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  lockedValue: { color: colors.text, fontWeight: '800', fontSize: 14, flexShrink: 1, textAlign: 'right' },
  quote: { color: colors.text, fontSize: 17, fontWeight: '700', fontStyle: 'italic', lineHeight: 23 },
  secondary: { alignSelf: 'flex-start', backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  secondaryText: { color: colors.text, fontWeight: '800' },
});
