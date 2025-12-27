'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function DisplayNamePage() {
  const { user, refresh, loading } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.display_name) {
      router.replace('/');
    }
  }, [loading, user, router]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/profile/display-name', {
        method: 'POST',
        body: JSON.stringify({ displayName })
      });
      await refresh();
      router.push('/');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading || !user) {
    return <p>Loading...</p>;
  }

  return (
    <div className="card stack" style={{ maxWidth: '420px' }}>
      <h2>Pick your display name</h2>
      <p>We&apos;ll show this name in groups and leaderboards.</p>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <form className="stack" onSubmit={handleSubmit}>
        <input
          className="input"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g., Goal Machine"
        />
        <button className="button" type="submit">
          Save and continue
        </button>
      </form>
    </div>
  );
}
