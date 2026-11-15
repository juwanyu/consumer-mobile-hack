import { Text, View } from 'react-native';

import type { Look } from '../../convex/looks';
import { Avatar } from '@/components/avatar';
import { colors } from '@/theme';

export function FaceRow({ faces, size = 26, extra }: { faces: { name: string; look: Look | null }[]; size?: number; extra?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {faces.slice(0, 5).map((f, i) => (
        <View key={i} style={{ marginLeft: i ? -size * 0.35 : 0, borderRadius: size, borderWidth: 2, borderColor: colors.bg }}>
          <Avatar look={f.look} name={f.name} size={size} />
        </View>
      ))}
      {extra ? <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13, marginLeft: 8 }}>{extra}</Text> : null}
    </View>
  );
}
