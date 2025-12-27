'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from '../components/SessionProvider';

export default function Home() {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [loading, user, router]);

  if (!user) {
    return <p>Loading...</p>;
  }

  return (
    <div className="card stack">
      <h1>Welcome back{user.display_name ? `, ${user.display_name}` : ''}!</h1>
      <p>
        Jump into your groups, make picks for the current matchweek, and keep your profile up to
        date.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="button" onClick={() => router.push('/groups')}>
          View My Groups
        </button>
        <button className="button secondary" onClick={() => router.push('/picks')}>
          Make Picks
        </button>
      </div>
    </div>
  );
}
