import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import db, {
  addMemberToGroup,
  createGroup,
  createUser,
  currentMatchweek,
  fixturesForMatchweek,
  getGroupById,
  getGroupByInviteCode,
  getGroupMembership,
  getSubmission,
  getUserByEmail,
  getUserById,
  groupMembers,
  listGroupMembers,
  listGroupPicks,
  listSubmissionsForGroup,
  listUserGroups,
  markSubmission,
  removeMember,
  updateFixtureScore,
  updateUserDisplayName,
  upsertPick,
  listPicksForUser
} from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      displayName: user.display_name ?? null
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function setAuthCookie(res, user) {
  const token = signToken(user);
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/auth/signup', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'Email already in use' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = createUser({ email, password_hash, displayName });
  setAuthCookie(res, user);
  res.json({ user: sanitizeUser(user) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  setAuthCookie(res, user);
  res.json({ user: sanitizeUser(user) });
});

app.post('/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

app.post('/profile/display-name', requireAuth, (req, res) => {
  const { displayName } = req.body || {};
  const updated = updateUserDisplayName(req.user.id, displayName);
  setAuthCookie(res, updated);
  res.json({ user: sanitizeUser(updated) });
});

app.post('/groups', requireAuth, (req, res) => {
  const { name, description } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const group = createGroup({ name, description, createdBy: req.user.id });
  res.json({ group });
});

app.post('/groups/join', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Invite code required' });
  const group = getGroupByInviteCode(code);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const membership = addMemberToGroup({ groupId: group.id, userId: req.user.id });
  res.json({ group, membership });
});

app.get('/groups', requireAuth, (req, res) => {
  const groups = listUserGroups(req.user.id).map(group => ({
    ...group,
    members: listGroupMembers(group.id)
  }));
  res.json({ groups });
});

app.get('/groups/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const group = getGroupById(id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const membership = getGroupMembership(id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Forbidden' });
  const members = groupMembers(id);
  res.json({ group, members, membership });
});

app.post('/groups/:id/leave', requireAuth, (req, res) => {
  const { id } = req.params;
  const membership = getGroupMembership(id, req.user.id);
  if (!membership) return res.status(404).json({ error: 'Membership not found' });
  if (membership.role === 'admin') {
    return res.status(400).json({ error: 'Admins cannot leave their own group' });
  }
  removeMember(id, req.user.id);
  res.json({ ok: true });
});

app.get('/fixtures/current', requireAuth, (req, res) => {
  const mw = currentMatchweek();
  if (!mw) return res.json({ matchweek: null, fixtures: [] });
  const fixtures = fixturesForMatchweek(mw.id);
  res.json({ matchweek: mw, fixtures, deadline: mw.deadline });
});

app.get('/picks', requireAuth, (req, res) => {
  const { groupId, matchweekId } = req.query;
  if (!groupId || !matchweekId) {
    return res.status(400).json({ error: 'groupId and matchweekId are required' });
  }
  const membership = getGroupMembership(groupId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Forbidden' });
  const picks = listPicksForUser({ userId: req.user.id, groupId, matchweekId });
  res.json({ picks });
});

app.post('/picks', requireAuth, (req, res) => {
  const { groupId, fixtureId, homeScore, awayScore } = req.body || {};
  if (!groupId || !fixtureId) return res.status(400).json({ error: 'Missing fields' });
  const membership = getGroupMembership(groupId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  const fixture = db.prepare('SELECT * FROM fixtures WHERE id = ?').get(fixtureId);
  if (!fixture) return res.status(404).json({ error: 'Fixture not found' });
  if (new Date(fixture.kickoff) <= new Date()) {
    return res.status(400).json({ error: 'Fixture locked at kickoff' });
  }

  const pick = upsertPick({
    userId: req.user.id,
    groupId,
    fixtureId,
    homeScore,
    awayScore
  });
  res.json({ pick });
});

app.post('/picks/submit', requireAuth, (req, res) => {
  const { groupId, matchweekId } = req.body || {};
  if (!groupId || !matchweekId) return res.status(400).json({ error: 'Missing fields' });
  const membership = getGroupMembership(groupId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Forbidden' });
  const fixtures = fixturesForMatchweek(matchweekId);
  const picks = listPicksForUser({ userId: req.user.id, groupId, matchweekId });
  if (fixtures.length === 0) return res.status(400).json({ error: 'No fixtures to submit' });
  if (picks.length < fixtures.length) {
    return res.status(400).json({ error: 'Please enter picks for all fixtures' });
  }
  const anyLocked = fixtures.some(f => new Date(f.kickoff) <= new Date());
  if (anyLocked) {
    return res.status(400).json({ error: 'Matchweek locked; cannot submit' });
  }
  const submission = markSubmission({ userId: req.user.id, groupId, matchweekId });
  res.json({ submission });
});

app.get('/groups/:id/picks', requireAuth, (req, res) => {
  const { id } = req.params;
  const { matchweekId } = req.query;
  if (!matchweekId) return res.status(400).json({ error: 'matchweekId required' });
  const membership = getGroupMembership(id, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  const requesterSubmitted = !!getSubmission(req.user.id, id, matchweekId);
  const submissions = listSubmissionsForGroup(id, matchweekId);
  const picks = listGroupPicks({ groupId: id, matchweekId });
  const responsePicks = picks.map(pick => {
    const finished = ['final', 'finished'].includes(
      (db.prepare('SELECT status FROM fixtures WHERE id = ?').get(pick.fixture_id)?.status ||
        '').toLowerCase()
    );
    const shouldMask = !requesterSubmitted && pick.user_id !== req.user.id;
    return {
      ...pick,
      masked: shouldMask,
      home_score: shouldMask ? null : pick.home_score,
      away_score: shouldMask ? null : pick.away_score,
      finished
    };
  });

  res.json({
    picks: responsePicks,
    submissionsCount: submissions.length,
    requesterSubmitted
  });
});

app.post('/fixtures/:id/score', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status, finalHomeScore, finalAwayScore } = req.body || {};
  const fixture = db.prepare('SELECT * FROM fixtures WHERE id = ?').get(id);
  if (!fixture) return res.status(404).json({ error: 'Fixture not found' });
  // simple guard: allow admins from any group to update shared fixtures
  const membership = req.body.groupId
    ? getGroupMembership(req.body.groupId, req.user.id)
    : null;
  if (membership && membership.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  const updated = updateFixtureScore({
    fixtureId: id,
    status: status || 'finished',
    final_home_score: finalHomeScore ?? fixture.final_home_score,
    final_away_score: finalAwayScore ?? fixture.final_away_score
  });
  res.json({ fixture: updated });
});

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
