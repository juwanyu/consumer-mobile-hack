import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';

export default function HomeScreen() {
  const theme = useTheme();
  const items = useQuery(api.items.list);
  const addItem = useMutation(api.items.add);
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    await addItem({ text });
    setText('');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Items</ThemedText>
        {items !== undefined && (
          <ThemedText type="small" testID="item-count">
            {items.length === 1 ? '1 item' : `${items.length} items`}
          </ThemedText>
        )}

        <ThemedView type="backgroundElement" style={styles.form}>
          <TextInput
            testID="item-input"
            accessibilityLabel="New item"
            placeholder="Add an item"
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            returnKeyType="done"
            style={[styles.input, { color: theme.text }]}
          />
          <Pressable testID="add-item" accessibilityRole="button" onPress={submit} style={styles.button}>
            <ThemedText type="smallBold" style={styles.buttonText}>
              Add
            </ThemedText>
          </Pressable>
        </ThemedView>

        {items === undefined ? (
          <ThemedText type="small">Loading…</ThemedText>
        ) : (
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(item) => item._id}
            ListEmptyComponent={<ThemedText type="small">No items yet.</ThemedText>}
            renderItem={({ item }) => (
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText>{item.text}</ThemedText>
              </ThemedView>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  form: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  button: {
    backgroundColor: '#208AEF',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
  },
  list: {
    alignSelf: 'stretch',
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
  },
});
