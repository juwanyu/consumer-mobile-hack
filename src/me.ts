import { useMutation, useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

let cached: Id<'users'> | null = null;
let pending: Promise<Id<'users'>> | null = null;
let device: string | null = null;
const listeners = new Set<(id: Id<'users'>) => void>();

async function deviceKey() {
  if (device) return device;
  device = await readDeviceKey();
  return device;
}

async function readDeviceKey() {
  const existing = await SecureStore.getItemAsync('cast.device').catch(() => null);
  if (existing) return existing;
  const key = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync('cast.device', key).catch(() => {});
  return key;
}

export function useMyId() {
  const ensure = useMutation(api.social.ensureUser);
  const [id, setId] = useState<Id<'users'> | null>(cached);
  const [key, setKey] = useState<string | null>(device);
  const owner = useQuery(api.social.byDevice, key ? { deviceKey: key } : 'skip');
  useEffect(() => {
    if (!key) deviceKey().then(setKey);
  }, [key]);
  useEffect(() => {
    if (!owner || owner === cached) return;
    cached = owner;
    pending = Promise.resolve(owner);
    listeners.forEach((fn) => fn(owner));
  }, [owner]);
  useEffect(() => {
    listeners.add(setId);
    if (cached) {
      setId(cached);
      return () => {
        listeners.delete(setId);
      };
    }
    pending ??= deviceKey().then((key) => ensure({ deviceKey: key }));
    pending.then((value) => {
      cached = value;
      listeners.forEach((fn) => fn(value));
    }, () => {
      pending = null;
    });
    return () => {
      listeners.delete(setId);
    };
  }, [ensure]);
  return id;
}

export function useSwitchAccount() {
  const switchAccount = useMutation(api.social.switchAccount);
  return async (toUserId: Id<'users'>) => {
    const key = await deviceKey();
    const id = await switchAccount({ deviceKey: key, toUserId });
    cached = id;
    pending = Promise.resolve(id);
    listeners.forEach((fn) => fn(id));
  };
}

export function useNewAccount() {
  const create = useMutation(api.social.newAccount);
  return async () => {
    const key = await deviceKey();
    const id = await create({ deviceKey: key });
    cached = id;
    pending = Promise.resolve(id);
    listeners.forEach((fn) => fn(id));
  };
}

export function useMe() {
  const id = useMyId();
  const me = useQuery(api.social.me, id ? { userId: id } : 'skip');
  return { id, me };
}
