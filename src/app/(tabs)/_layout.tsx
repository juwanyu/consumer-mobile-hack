import { useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { Avatar } from '@/components/avatar';
import { useMe } from '@/me';
import { colors } from '@/theme';

const ICONS: Record<string, { icon: SFSymbol; label: string }> = {
  index: { icon: 'house.fill', label: 'Feed' },
  community: { icon: 'person.3.fill', label: 'Crews' },
  studio: { icon: 'plus', label: 'Studio' },
  inbox: { icon: 'paperplane.fill', label: 'Inbox' },
  profile: { icon: 'person.crop.circle', label: 'Profile' },
};

export const TAB_BAR_HEIGHT = 64;

type BottomTabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
};

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { id, me } = useMe();
  const unread = useQuery(api.social.unreadCount, id ? { userId: id } : 'skip') ?? 0;
  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom - 6, 8) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = ICONS[route.name];
          if (!meta) return null;
          const onPress = () => {
            Haptics.selectionAsync();
            if (!focused) navigateToTab(route.key);
          };
          if (route.name === 'studio') {
            return (
              <Pressable key={route.key} testID="tab-studio" accessibilityRole="button" accessibilityLabel="Cast Studio" onPress={onPress} style={styles.slot}>
                <View style={[styles.studio, focused && { backgroundColor: colors.pink }]}>
                  <SymbolView name="plus" size={24} tintColor="#0A0A0A" weight="heavy" />
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable key={route.key} testID={`tab-${route.name}`} accessibilityRole="button" accessibilityLabel={meta.label} onPress={onPress} style={styles.slot}>
              <View style={[styles.pill, focused && styles.pillActive]}>
                {route.name === 'profile' && me?.look ? (
                  <Avatar look={me.look} size={28} ring={focused} />
                ) : (
                  <SymbolView name={meta.icon} size={24} tintColor={focused ? colors.text : 'rgba(255,255,255,0.6)'} weight="semibold" />
                )}
                {route.name === 'inbox' && unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...(props as unknown as BottomTabBarProps)} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="studio" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  outer: { backgroundColor: '#000', paddingHorizontal: 16, paddingTop: 6 },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 32,
    backgroundColor: 'rgba(22,22,30,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 58, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  studio: { width: 50, height: 40, borderRadius: 14, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
