import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LandingForm from './LandingForm';

export const dynamic = 'force-dynamic';

// Server shell for the landing page. If a logged-in user lands here we send
// them straight to the right surface for their role — admins to /admin,
// regular users to /extension-activity. Otherwise we render the (client) login/signup form.
export default async function Landing() {
  const s = await getSession();
  if (s.userId) {
    if (s.role === 'admin' || s.role === 'super_admin') redirect('/admin');
    redirect('/extension-activity');
  }
  return <LandingForm />;
}
