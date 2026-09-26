'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminLoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true); // checking existing session

  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  // ── If already logged-in, bounce to dashboard immediately ─────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/');
      } else {
        setChecking(false);
      }
    });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Redirect to the page the user originally tried to visit, or dashboard
    const next = searchParams.get('next') || '/';
    router.push(next);
    router.refresh();
  };

  // Show nothing while checking existing session — avoids flash of login form
  if (checking) {
    return (
      <div className="admin-login-page" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <span className="admin-spinner" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-login-page" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="admin-login-card">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'var(--admin-accent)',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: '18px',
            marginBottom: '16px',
          }}>
            B2B
          </div>
        </div>
        <h1>Skplore Admin</h1>
        <p>Sign in to manage your store</p>

        {error && <div className="admin-login-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="admin-form-group">
            <label className="admin-form-label">Email</label>
            <input
              type="email"
              className="admin-form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@skplore.com"
              required
              autoComplete="username"
              id="admin-login-email"
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Password</label>
            <input
              type="password"
              className="admin-form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              id="admin-login-password"
            />
          </div>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}
            disabled={loading}
            id="admin-login-submit"
          >
            {loading ? (
              <><span className="admin-spinner" style={{ width: 16, height: 16 }} /> Signing in...</>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
