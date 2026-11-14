import { redirect } from 'next/navigation';

// Editing the profile is a modal on /profile now; old links open it there.
export default function EditProfilePage() {
  redirect('/profile?edit=1');
}
