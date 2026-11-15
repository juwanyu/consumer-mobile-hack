import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BlockyCharacter } from '@/components/blocky-character';
import { BigButton, Label, Screen } from '@/components/ui';
import { colors, type } from '@/theme';

const DEMO_LOOK = {
  skin_tone: '#E0A878',
  hair_color: '#FFD23F',
  hair_style: 'spiky',
  facial_hair: 'none',
  glasses: 'sunglasses',
  shirt_color: '#FF2E88',
  shirt_style: 'hoodie',
  pants_color: '#2EE6FF',
  accessory: 'none',
  vibe: '',
} as const;

export default function Home() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>
          CAST<Text style={{ color: colors.yellow }}>.</Text>
        </Text>
        <Label>Live from the stage</Label>
      </View>
      <View style={styles.hero}>
        <BlockyCharacter look={DEMO_LOOK} size={200} />
        <Text style={[type.title, styles.center]}>Turn a judge into a movie star.</Text>
        <Text style={[type.small, styles.center]}>Snap a photo, get a blocky twin, roll camera.</Text>
      </View>
      <BigButton testID="cast-a-judge" icon="🎬" label="Cast a judge" onPress={() => router.push('/cast/consent')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  center: { textAlign: 'center' },
});
