import { REEL_TEMPLATES } from '../convex/reels';
import { GENRE_COLORS, library, type GenreId } from '@/library';
import type { ReelItem } from '@/components/reel-card';
import { colors } from '@/theme';

export type StudioTemplate = {
  id: string;
  category: string;
  kind: 'reel' | 'genre';
  label: string;
  emoji: string;
  tagline: string;
  accent: string;
  still: number | null;
  roles: string[];
  seconds: number;
  beats: { title: string; line: string }[];
};

const STILLS: Record<string, number> = {
  fate: require('../assets/templates/fate.jpg'),
  heist: require('../assets/templates/heist.jpg'),
  space: require('../assets/templates/space.jpg'),
  kaiju: require('../assets/templates/kaiju.jpg'),
  zombie: require('../assets/templates/zombie.jpg'),
  romcom: require('../assets/templates/romcom.jpg'),
  western: require('../assets/templates/western.jpg'),
};

const REEL_ACCENTS: Record<string, string> = { nba_yaxel: '#FF7A1A', nba_podz: '#1D9BF0', fate: '#8B6BFF', mtb: '#3DDC84', karate: '#FF2E88', wallbreak: '#E8473B', shonen: '#FF7A1A', isekai: '#2EE6FF' };

const GENRE_CATEGORY: Record<string, string> = { heist: 'Heist', romcom: 'Rom-com' };

const place = (id: string) =>
  library.locations[id as keyof typeof library.locations]?.label ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const reels: StudioTemplate[] = Object.values(REEL_TEMPLATES).map((t) => ({
  id: t.id,
  category: t.category ?? 'Action',
  kind: 'reel',
  label: t.label,
  emoji: t.emoji,
  tagline: t.logline,
  accent: REEL_ACCENTS[t.id] ?? colors.yellow,
  still: STILLS[t.id] ?? null,
  roles: t.slots.map((s) => s.role),
  seconds: Math.round(t.beats.reduce((sum, b) => sum + b.duration, 0)),
  beats: t.beats.map((b) => ({ title: place(b.location), line: b.narration.replace(/\{(master|caster)\}/g, (_, s: string, at: number, all: string) => {
      const word = s === 'master' ? 'the star' : 'the sidekick';
      return at === 0 || /[.!?]\s*$/.test(all.slice(0, at)) ? word[0].toUpperCase() + word.slice(1) : word;
    }) })),
}));

const genres: StudioTemplate[] = (Object.keys(library.genres) as GenreId[])
  .filter((id) => id !== 'fate')
  .map((id) => {
    const g = library.genres[id];
    return {
      id,
      category: GENRE_CATEGORY[id] ?? 'Action',
      kind: 'genre',
      label: g.label,
      emoji: g.emoji,
      tagline: `3-shot cinematic · you write every line`,
      accent: GENRE_COLORS[id] ?? colors.yellow,
      still: STILLS[id] ?? null,
      roles: g.roles,
      seconds: library.render.max_shots * library.render.shot_seconds,
      beats: g.default_locations.slice(0, library.render.max_shots).map((loc, i) => ({ title: place(loc), line: `Shot ${i + 1} · your line here` })),
    };
  });

const FEATURED = ['nba_yaxel', 'nba_podz', 'fate', 'wallbreak', 'shonen', 'isekai', 'mtb', 'karate', 'heist', 'space', 'kaiju'];

export const TEMPLATES: StudioTemplate[] = [...reels, ...genres].filter((t) => t.kind === 'reel').sort((a, b) => rank(a.id) - rank(b.id));

function rank(id: string) {
  const i = FEATURED.indexOf(id);
  return i === -1 ? FEATURED.length : i;
}

export const FEATURED_TEMPLATES = TEMPLATES.filter((t) => FEATURED.includes(t.id));

export function templateById(id: string) {
  return TEMPLATES.find((t) => t.id === id);
}

export type TemplateStats = { reels: ReelItem[]; thumbnailUrl: string | null; views: number; remixes: number; tag: 'trending' | 'new' | null };

export function templateStats(feed: ReelItem[] | undefined): Record<string, TemplateStats> {
  const out: Record<string, TemplateStats> = {};
  for (const t of TEMPLATES) {
    const reels = (feed ?? [])
      .filter((r) => (t.kind === 'reel' ? r.isReel && r.style === t.label : !r.isReel && r.genre === t.id))
      .sort((a, b) => b.views - a.views);
    out[t.id] = {
      reels,
      thumbnailUrl: reels.find((r) => r.thumbnailUrl)?.thumbnailUrl ?? null,
      views: reels.reduce((s, r) => s + r.views, 0),
      remixes: reels.reduce((s, r) => s + r.remixCount, 0),
      tag: feed && reels.length === 0 ? 'new' : null,
    };
  }
  Object.entries(out)
    .filter(([, s]) => s.reels.length > 0)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 2)
    .forEach(([, s]) => (s.tag = 'trending'));
  return out;
}

export function formatSeconds(s: number) {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export const TRENDING_REELS = ['jh79gtb7wv328zse5qwa054kf18j8863', 'jh72mmkvh3y7taygyqdtab1tg18j99b0', 'jh79s63xw4crdgzz8ts4ny83t98j8pqk'];

export const TEMPLATE_SOURCE_REEL: Record<string, string> = {
  nba_yaxel: 'jh7ee0tsm2yw5phn9p0nm07g418ja0dp',
  nba_podz: 'jh7bcd1t7prad0qzqttst10j5h8jbrqc',
  fate: TRENDING_REELS[0],
  mtb: TRENDING_REELS[1],
  karate: TRENDING_REELS[2],
};

const CATEGORY_META = [
  { id: 'NBA', emoji: '🏀', blurb: 'Dunk on Yaxel or Podz' },
  { id: 'Anime', emoji: '⚔️', blurb: 'Summon, transform, break the wall' },
  { id: 'Action', emoji: '💥', blurb: 'Kaiju, space, dojo fights' },
  { id: 'Sports', emoji: '🏆', blurb: 'Send it' },
  { id: 'Heist', emoji: '💰', blurb: 'One last job' },
  { id: 'Rom-com', emoji: '💘', blurb: 'Meet-cute energy' },
];

export const CATEGORIES = CATEGORY_META.map((c) => ({
  id: c.id,
  label: c.id,
  emoji: c.emoji,
  blurb: c.blurb,
  templates: TEMPLATES.filter((t) => t.category === c.id).map((t) => t.id),
})).filter((c) => c.templates.length > 0);
