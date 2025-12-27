'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function PicksPage() {
  const { user, loading } = useSession();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [matchweek, setMatchweek] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [picks, setPicks] = useState({});
  const [groupPicks, setGroupPicks] = useState([]);
  const [requesterSubmitted, setRequesterSubmitted] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadGroups = async () => {
    const data = await apiRequest('/groups');
    setGroups(data.groups || []);
    if (!selectedGroup && data.groups?.length) {
      setSelectedGroup(data.groups[0].id);
    }
  };

  const loadFixtures = async () => {
    const data = await apiRequest('/fixtures/current');
    setMatchweek(data.matchweek);
    setFixtures(data.fixtures || []);
  };

  const loadUserPicks = async (groupId, matchweekId) => {
    if (!groupId || !matchweekId) return;
    const data = await apiRequest(`/picks?groupId=${groupId}&matchweekId=${matchweekId}`);
    const map = {};
    data.picks.forEach(pick => {
      map[pick.fixture_id] = { home: pick.home_score, away: pick.away_score };
    });
    setPicks(map);
  };

  const loadGroupPicks = async (groupId, matchweekId) => {
    if (!groupId || !matchweekId) return;
    const data = await apiRequest(`/groups/${groupId}/picks?matchweekId=${matchweekId}`);
    setGroupPicks(data.picks || []);
    setRequesterSubmitted(data.requesterSubmitted);
  };

  useEffect(() => {
    if (!loading && user) {
      loadGroups();
      loadFixtures();
    }
  }, [loading, user]);

  useEffect(() => {
    if (selectedGroup && matchweek?.id) {
      loadUserPicks(selectedGroup, matchweek.id);
      loadGroupPicks(selectedGroup, matchweek.id);
    }
  }, [selectedGroup, matchweek?.id]);

  const handleScoreChange = (fixtureId, side, value) => {
    setPicks(prev => ({
      ...prev,
      [fixtureId]: {
        ...prev[fixtureId],
        [side]: value === '' ? '' : Number(value)
      }
    }));
  };

  const handleBlur = async fixtureId => {
    const entry = picks[fixtureId];
    if (!entry) return;
    await apiRequest('/picks', {
      method: 'POST',
      body: JSON.stringify({
        groupId: selectedGroup,
        fixtureId,
        homeScore: entry.home === '' ? null : entry.home,
        awayScore: entry.away === '' ? null : entry.away
      })
    });
    setStatusMessage('Saved');
    loadGroupPicks(selectedGroup, matchweek.id);
  };

  const handleSubmit = async () => {
    if (!matchweek?.id) return;
    try {
      await apiRequest('/picks/submit', {
        method: 'POST',
        body: JSON.stringify({ groupId: selectedGroup, matchweekId: matchweek.id })
      });
      setStatusMessage('Submitted!');
      loadGroupPicks(selectedGroup, matchweek.id);
    } catch (err) {
      setStatusMessage(err.message);
    }
  };

  const completed = useMemo(() => {
    return fixtures.filter(
      f => picks[f.id]?.home !== undefined && picks[f.id]?.away !== undefined
    ).length;
  }, [fixtures, picks]);

  if (loading || !user) return <p>Loading...</p>;
  if (!groups.length) return <p>Create or join a group to start making picks.</p>;

  const isLocked = fixture => new Date(fixture.kickoff) <= new Date();

  return (
    <div className="stack">
      <div className="card stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Picks</h2>
          {matchweek && <span className="badge">{matchweek.label}</span>}
        </div>
        {matchweek && (
          <p>
            Deadline: {new Date(matchweek.deadline).toLocaleString()} — {completed} of{' '}
            {fixtures.length} picks completed
          </p>
        )}
        <select
          className="input"
          value={selectedGroup}
          onChange={e => setSelectedGroup(e.target.value)}
        >
          {groups.map(g => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {statusMessage && <p>{statusMessage}</p>}
      </div>

      <div className="stack">
        {fixtures.map(fixture => {
          const entry = picks[fixture.id] || {};
          const locked = isLocked(fixture);
          return (
            <div key={fixture.id} className="card stack">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>
                    <u>{fixture.home_team}</u> vs {fixture.away_team}
                  </strong>
                  <div style={{ color: '#9ca3af' }}>
                    {new Date(fixture.kickoff).toLocaleString()} {locked && '— locked'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    disabled={locked}
                    value={entry.home ?? ''}
                    onChange={e => handleScoreChange(fixture.id, 'home', e.target.value)}
                    onBlur={() => handleBlur(fixture.id)}
                    style={{ width: '70px' }}
                  />
                  <span style={{ alignSelf: 'center' }}>-</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    disabled={locked}
                    value={entry.away ?? ''}
                    onChange={e => handleScoreChange(fixture.id, 'away', e.target.value)}
                    onBlur={() => handleBlur(fixture.id)}
                    style={{ width: '70px' }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Submit all picks</h3>
            <p>
              {requesterSubmitted
                ? 'Submitted — you can see everyone else’s picks.'
                : 'Submit to reveal group picks.'}
            </p>
          </div>
          <button
            className="button"
            onClick={handleSubmit}
            disabled={fixtures.length === 0 || completed < fixtures.length || requesterSubmitted}
          >
            {requesterSubmitted ? 'Submitted' : 'Submit all picks'}
          </button>
        </div>
        {!requesterSubmitted && (
          <p style={{ color: '#fbbf24' }}>Submit all picks to reveal group picks.</p>
        )}
        {requesterSubmitted && (
          <div className="stack">
            <h4>Group picks</h4>
            {groupPicks.map(item => (
              <div
                key={`${item.user_id}-${item.fixture_id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1e2937',
                  padding: '0.35rem 0'
                }}
              >
                <div>
                  <strong>{item.display_name || item.email}</strong>
                  <div style={{ fontSize: '0.85rem' }}>
                    Fixture: {item.fixture_id.slice(0, 4)}...
                  </div>
                </div>
                <div>
                  {item.masked ? 'Hidden' : `${item.home_score} - ${item.away_score}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
