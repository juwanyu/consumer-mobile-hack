import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

async function download(url: string, title: string) {
  const slug = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'reel';
  const version = url.split('/').pop()?.slice(0, 8) ?? 'v';
  const dest = `${FileSystem.cacheDirectory}cast-${slug}-${version}.mp4`;
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) await FileSystem.downloadAsync(url, dest);
  return dest;
}

export async function saveVideo(url: string, title: string) {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    Alert.alert('Allow Photos access', 'Cast needs permission to save reels to your Photos. You can turn it on in Settings.');
    return false;
  }
  try {
    await MediaLibrary.saveToLibraryAsync(await download(url, title));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch {
    Alert.alert('Could not save', 'The reel did not download. Check your connection and try again.');
    return false;
  }
}

export async function shareVideo(url: string, title: string) {
  try {
    const file = await download(url, title);
    await Sharing.shareAsync(file, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: title });
    return true;
  } catch {
    Alert.alert('Could not share', 'The reel did not download. Check your connection and try again.');
    return false;
  }
}
