import { ProfileView } from '@/components/profile-view';
import { useMyId } from '@/me';

export default function MyProfile() {
  const id = useMyId();
  return <ProfileView userId={id} />;
}
