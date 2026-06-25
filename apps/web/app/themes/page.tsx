import { redirect } from 'next/navigation';

export default function ThemesRedirectPage() {
  redirect('/settings/themes');
}
