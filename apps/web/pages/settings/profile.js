'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function ProfileSettings() {
  const { user, refresh, loading } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name);
    }
  }, [user]);

  const handleSave = async e => {
    e.preventDefault();
    if (!displayName) return;
    setSaving(true);
    setMessage('Saved!');
    try {
      await apiRequest('/profile/display-name', {
        method: 'POST',
        body: JSON.stringify({ displayName })
      });
      await refresh();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return <p>Loading...</p>;

  return (
    <div className="card stack" style={{ maxWidth: '520px' }}>
      <h2>Profile</h2>
      <p>Update how others see you across groups.</p>
      <form className="stack" onSubmit={handleSave}>
        <label>Display name</label>
        <input
          className="input"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="button" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}
