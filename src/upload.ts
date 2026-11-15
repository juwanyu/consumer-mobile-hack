import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { convex } from '@/convex';

export async function uploadPhoto(castMemberId: Id<'castMembers'>, uri: string, mimeType = 'image/jpeg') {
  const uploadUrl = await convex.mutation(api.casting.generateUploadUrl, {});
  const file = await (await fetch(uri)).blob();
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: file,
  });
  if (!response.ok) throw new Error('Upload failed. Check the connection and try again.');
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };
  await convex.mutation(api.casting.submitPhoto, { castMemberId, storageId });
}
