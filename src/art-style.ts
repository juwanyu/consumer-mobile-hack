import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

export const ART_STYLES = [
  { id: 'blocky', emoji: '🧱', label: 'Blocky 3D', colors: ['#FFD23F', '#FF2E88', '#2EE6FF'] },
  { id: 'anime2d', emoji: '🎌', label: '2D Anime', colors: ['#FF8FC7', '#7A5CFF', '#FFFFFF'] },
  { id: 'pixel', emoji: '👾', label: 'Pixel', colors: ['#3DDC84', '#1B6CFF', '#0A0A0A'] },
  { id: 'clay', emoji: '🏺', label: 'Claymation', colors: ['#D9824B', '#F2C29B', '#7A4A2A'] },
  { id: 'comic', emoji: '💥', label: 'Comic', colors: ['#FFE14D', '#E8262B', '#111111'] },
] as const;

export type ArtStyle = (typeof ART_STYLES)[number]['id'];

export const STYLE_STILLS: Record<ArtStyle, number> = {
  blocky: require('../assets/styles/blocky.jpg'),
  anime2d: require('../assets/styles/anime2d.jpg'),
  pixel: require('../assets/styles/pixel.jpg'),
  clay: require('../assets/styles/clay.jpg'),
  comic: require('../assets/styles/comic.jpg'),
};

const KEY = 'cast.artStyle';
let current: ArtStyle = 'blocky';
let loaded = false;
const listeners = new Set<(s: ArtStyle) => void>();

export function useArtStyle() {
  const [style, setStyle] = useState<ArtStyle>(current);
  useEffect(() => {
    listeners.add(setStyle);
    if (!loaded) {
      loaded = true;
      SecureStore.getItemAsync(KEY)
        .then((v) => {
          if (v && ART_STYLES.some((s) => s.id === v)) {
            current = v as ArtStyle;
            listeners.forEach((fn) => fn(current));
          }
        })
        .catch(() => {});
    }
    return () => {
      listeners.delete(setStyle);
    };
  }, []);
  const choose = (next: ArtStyle) => {
    current = next;
    listeners.forEach((fn) => fn(next));
    SecureStore.setItemAsync(KEY, next).catch(() => {});
  };
  return { style, choose };
}
