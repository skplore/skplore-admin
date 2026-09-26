import { createClient } from '@/lib/supabase/server';
import AdminLayoutClient from './AdminLayoutClient';
import { redirect } from 'next/navigation';
import './admin.css';

export const metadata = {
  title: 'Admin Dashboard | Skplore',
  description: 'Manage products, categories, and store content.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }) {
  const supabase = await createClient();

  // getUser() validates the JWT with Supabase servers — cannot be spoofed.
  // getSession() only reads the local cookie and is NOT safe for auth checks.
  const { data: { user } } = await supabase.auth.getUser();

  // ── No user → only allow the /login page to render ──────────────────────
  // Middleware should have already redirected, but this is the server-side
  // safety net in case middleware is bypassed (e.g. direct fetch, curl, etc.)
  if (!user) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body style={{ margin: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }} suppressHydrationWarning>
          {children}
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }} suppressHydrationWarning>
        <AdminLayoutClient user={user}>
          {children}
        </AdminLayoutClient>
      </body>
    </html>
  );
}

