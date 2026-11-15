import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BlockyCharacter } from '@/components/blocky-character';
import { BigButton, Screen } from '@/components/ui';
import { type } from '@/theme';
import { DEMO_LOOK } from '@/demo-look';

export default function Create() {
  const router = useRouter();
  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={16}>
        <Text style={type.small}>← Back</Text>
      </Pressable>
      <View style={styles.hero}>
        <BlockyCharacter look={DEMO_LOOK} size={200} />
        <Text style={[type.title, { textAlign: 'center' }]}>Turn yourself into a movie star.</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>Snap a photo, get a blocky twin, pick a reel, roll camera.</Text>
      </View>
      <BigButton testID="cast-yourself" icon="🎬" label="Cast yourself" onPress={() => router.push('/cast/consent')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
