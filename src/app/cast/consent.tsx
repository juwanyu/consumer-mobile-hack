import { useMutation } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import { BigButton, Label, Screen } from '@/components/ui';
import { colors, radius, type } from '@/theme';

export default function Consent() {
  const router = useRouter();
  const { recast, remix } = useLocalSearchParams<{ recast?: string; remix?: string }>();
  const giveConsent = useMutation(api.casting.giveConsent);
  const [name, setName] = useState('');
  const [okToPost, setOkToPost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    setSaving(true);
    setError(null);
    try {
      const castMemberId = await giveConsent({ name, okToPost });
      router.replace({ pathname: '/cast/[id]/photo', params: { id: castMemberId, ...(recast ? { recast } : {}), ...(remix ? { remix } : {}) } });
    } catch {
      setError("Couldn't save that. Check the connection and try again.");
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={16}>
            <Text style={type.small}>← Back</Text>
          </Pressable>
          <Text style={type.title}>Before we roll</Text>

          <View style={styles.field}>
            <Label>Your name</Label>
            <TextInput
              testID="consent-name"
              accessibilityLabel="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Type your name"
              placeholderTextColor={colors.faint}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              style={styles.input}
            />
          </View>

          <View style={styles.card}>
            <Text style={type.heading}>What we use</Text>
            <Bullet>Your name and one photo.</Bullet>
            <Bullet>Only to make your character and your movie in this app.</Bullet>
            <Bullet>The photo is deleted right after your character is made.</Bullet>
            <Bullet>Your movie is private unless you tick the box below.</Bullet>
          </View>

          <View style={styles.toggleRow}>
            <Text style={[type.body, { flex: 1 }]}>OK to post my movie to the feed</Text>
            <Switch
              testID="consent-ok-to-post"
              accessibilityLabel="OK to post to the feed"
              value={okToPost}
              onValueChange={setOkToPost}
              trackColor={{ true: colors.pink, false: colors.surfaceHi }}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <BigButton testID="consent-agree" label="I agree" icon="✅" onPress={agree} disabled={!name.trim()} loading={saving} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ color: colors.yellow, fontSize: 17, fontWeight: '900' }}>•</Text>
      <Text style={[type.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingBottom: 24 },
  field: { gap: 8 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 10, borderWidth: 1, borderColor: colors.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16 },
  error: { color: colors.red, fontWeight: '700' },
});
