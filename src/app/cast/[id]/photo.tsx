import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Id } from '../../../../convex/_generated/dataModel';
import { BigButton, Screen } from '@/components/ui';
import { colors, radius, type } from '@/theme';
import { uploadPhoto } from '@/upload';

export default function Photo() {
  const { id, recast, remix } = useLocalSearchParams<{ id: Id<'castMembers'>; recast?: string; remix?: string }>();
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (uri: string, mimeType?: string) => {
    setBusy(true);
    setError(null);
    try {
      await uploadPhoto(id, uri, mimeType);
      router.replace({ pathname: '/cast/[id]/reveal', params: { id, ...(recast ? { recast } : {}), ...(remix ? { remix } : {}) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Try again.');
      setBusy(false);
    }
  };

  const snap = async () => {
    const photo = await camera.current?.takePictureAsync({ quality: 0.4 });
    if (!photo) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await send(photo.uri, 'image/jpeg');
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, allowsEditing: true, aspect: [3, 4] });
    if (result.canceled) return;
    const asset = result.assets[0];
    await send(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  if (busy) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.yellow} />
        <Text style={type.heading}>Sending to casting…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={16}>
        <Text style={type.small}>← Back</Text>
      </Pressable>
      <Text style={type.title}>Strike a pose</Text>
      <View style={styles.viewfinder}>
        {permission?.granted ? (
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" onCameraReady={() => setReady(true)} />
        ) : (
          <View style={styles.centered}>
            <Text style={[type.body, { textAlign: 'center' }]}>Camera access lets you snap your photo right here.</Text>
            {permission?.canAskAgain !== false ? (
              <BigButton variant="secondary" label="Allow camera" onPress={requestPermission} />
            ) : (
              <Text style={type.small}>Camera is off for this app. Upload a photo instead.</Text>
            )}
          </View>
        )}
        <View pointerEvents="none" style={styles.frame} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {permission?.granted ? (
        <BigButton testID="take-photo" icon="📸" label="Take photo" onPress={snap} disabled={!ready} />
      ) : null}
      <BigButton testID="upload-photo" variant="secondary" icon="🖼️" label="Upload photo" onPress={pick} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  frame: { position: 'absolute', top: '12%', left: '18%', right: '18%', bottom: '22%', borderWidth: 3, borderColor: colors.yellow, borderRadius: 200, opacity: 0.7 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  error: { color: colors.red, fontWeight: '700' },
});
