'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function GroupsPage() {
  const { user, loading } = useSession();
  const [groups, setGroups] = useState([]);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const loadGroups = async () => {
    try {
      const data = await apiRequest('/groups');
      setGroups(data.groups || []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      loadGroups();
    }
  }, [loading, user]);

  const handleCreate = async e => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiRequest('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: createName, description: createDescription })
      });
      setCreateName('');
      setCreateDescription('');
      setGroups(prev => [data.group, ...prev]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoin = async e => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/groups/join', {
        method: 'POST',
        body: JSON.stringify({ code: inviteCode })
      });
      setInviteCode('');
      loadGroups();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading || !user) return <p>Loading...</p>;

  return (
    <div className="stack">
      <div className="card stack">
        <h2>My Groups</h2>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {groups.map(group => (
            <div key={group.id} className="card" style={{ background: '#0f1724' }}>
              <h3>{group.name}</h3>
              <p>{group.description || 'No description yet.'}</p>
              <p className="badge">Invite: {group.invite_code}</p>
              <button className="button secondary" onClick={() => router.push(`/groups/${group.id}`)}>
                Open
              </button>
            </div>
          ))}
          {groups.length === 0 && <p>No groups yet. Create one or join with a code.</p>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <form className="card stack" onSubmit={handleCreate}>
          <h3>Create a group</h3>
          <input
            className="input"
            placeholder="Group name"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
          />
          <textarea
            className="input"
            style={{ minHeight: '80px' }}
            placeholder="Description (optional)"
            value={createDescription}
            onChange={e => setCreateDescription(e.target.value)}
          />
          <button className="button" type="submit">
            Create
          </button>
        </form>

        <form className="card stack" onSubmit={handleJoin}>
          <h3>Join with invite code</h3>
          <input
            className="input"
            placeholder="Enter code"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
          />
          <button className="button secondary" type="submit">
            Join group
          </button>
        </form>
      </div>
    </div>
  );
}
