import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

type Key = 'liked' | 'saved' | 'mine';
const listeners = new Map<Key, Set<(ids: string[]) => void>>();
const cache = new Map<Key, string[]>();

async function read(key: Key) {
  if (cache.has(key)) return cache.get(key)!;
  try {
    const raw = await SecureStore.getItemAsync(`cast.${key}`);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    cache.set(key, ids);
    return ids;
  } catch {
    return [];
  }
}

async function write(key: Key, ids: string[]) {
  const trimmed = ids.slice(0, 40);
  cache.set(key, trimmed);
  listeners.get(key)?.forEach((fn) => fn(trimmed));
  await SecureStore.setItemAsync(`cast.${key}`, JSON.stringify(trimmed)).catch(() => {});
}

export async function addLocal(key: Key, id: string) {
  const ids = await read(key);
  if (!ids.includes(id)) await write(key, [id, ...ids]);
}

export function useLocalIds(key: Key) {
  const [ids, setIds] = useState<string[]>(cache.get(key) ?? []);
  useEffect(() => {
    let alive = true;
    read(key).then((v) => alive && setIds(v));
    const set = listeners.get(key) ?? new Set();
    set.add(setIds);
    listeners.set(key, set);
    return () => {
      alive = false;
      set.delete(setIds);
    };
  }, [key]);
  const toggle = useCallback(
    async (id: string) => {
      const current = await read(key);
      const has = current.includes(id);
      await write(key, has ? current.filter((x) => x !== id) : [id, ...current]);
      return !has;
    },
    [key],
  );
  return { ids, has: (id: string) => ids.includes(id), toggle };
}
