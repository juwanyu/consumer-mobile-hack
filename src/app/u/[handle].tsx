import { useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/profile-view';

export default function UserProfile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <ProfileView handle={handle} showBack />;
}
