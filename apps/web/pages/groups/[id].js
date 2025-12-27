'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function GroupDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { loading, user } = useSession();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [membership, setMembership] = useState(null);
  const [error, setError] = useState('');

  const loadGroup = async groupId => {
    try {
      const data = await apiRequest(`/groups/${groupId}`);
      setGroup(data.group);
      setMembers(data.members);
      setMembership(data.membership);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!loading && user && id) {
      loadGroup(id);
    }
  }, [loading, user, id]);

  const handleLeave = async () => {
    try {
      await apiRequest(`/groups/${id}/leave`, { method: 'POST' });
      router.push('/groups');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading || !user || !group) return <p>Loading...</p>;

  return (
    <div className="stack">
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <div className="card stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>{group.name}</h2>
            <p>{group.description}</p>
            <p className="badge">Invite code: {group.invite_code}</p>
          </div>
          {membership?.role !== 'admin' && (
            <button className="button secondary" onClick={handleLeave}>
              Leave group
            </button>
          )}
        </div>
      </div>

      <div className="card stack">
        <h3>Members</h3>
        <div className="stack">
          {members.map(member => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0',
                borderBottom: '1px solid #1e2937'
              }}
            >
              <div>
                <strong>{member.display_name || member.email}</strong>
                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{member.email}</div>
              </div>
              <span className="badge">{member.role === 'admin' ? 'Admin' : 'Member'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
