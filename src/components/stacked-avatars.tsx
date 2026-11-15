import { View } from 'react-native';

import type { Look } from '../../convex/looks';
import { Avatar } from '@/components/avatar';
import { colors } from '@/theme';

export function StackedAvatars({ members, size = 54 }: { members: { name: string; look: Look | null }[]; size?: number }) {
  const shown = members.slice(0, 2);
  const small = size * 0.72;
  return (
    <View style={{ width: size, height: size }}>
      {shown.map((m, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i === 0 ? 0 : size - small,
            top: i === 0 ? 0 : size - small,
            borderRadius: small / 2,
            borderWidth: 2,
            borderColor: colors.bg,
          }}>
          <Avatar look={m.look} name={m.name} size={small - 4} />
        </View>
      ))}
    </View>
  );
}
