'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiRequest } from '../lib/api';
import { useSession } from './SessionProvider';

export default function NavBar() {
  const { user, refresh } = useSession();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      await refresh();
      router.push('/auth/login');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <header className="nav">
      <div>
        <Link href="/">Points Are Bad</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {user && (
          <>
            <Link href="/groups">My Groups</Link>
            <Link href="/picks">Picks</Link>
            <Link href="/settings/profile">Profile</Link>
          </>
        )}
        {user ? (
          <>
            <span className="badge">{user.display_name || user.email}</span>
            <button className="button secondary" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <Link href="/auth/login">Login</Link>
            <Link href="/auth/signup">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}
