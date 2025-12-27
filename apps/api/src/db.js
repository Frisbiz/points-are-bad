import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'app.db');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  UNIQUE(group_id, user_id),
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matchweeks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  deadline TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixtures (
  id TEXT PRIMARY KEY,
  matchweek_id TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff TEXT NOT NULL,
  status TEXT NOT NULL,
  final_home_score INTEGER,
  final_away_score INTEGER,
  FOREIGN KEY(matchweek_id) REFERENCES matchweeks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS picks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  fixture_id TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, group_id, fixture_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  matchweek_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  UNIQUE(user_id, group_id, matchweek_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(matchweek_id) REFERENCES matchweeks(id) ON DELETE CASCADE
);
`);

const insertMatchweek = db.prepare(`
  INSERT INTO matchweeks (id, label, deadline) VALUES (@id, @label, @deadline)
`);
const insertFixture = db.prepare(`
  INSERT INTO fixtures (id, matchweek_id, home_team, away_team, kickoff, status, final_home_score, final_away_score)
  VALUES (@id, @matchweek_id, @home_team, @away_team, @kickoff, @status, @final_home_score, @final_away_score)
`);

function seedFixtures() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM matchweeks').get();
  if (existing.count > 0) return;

  const now = Date.now();
  const kickoff1 = new Date(now + 1000 * 60 * 60 * 24).toISOString();
  const kickoff2 = new Date(now + 1000 * 60 * 60 * 26).toISOString();
  const matchweekId = uuidv4();

  insertMatchweek.run({
    id: matchweekId,
    label: 'Week 1',
    deadline: kickoff1
  });

  insertFixture.run({
    id: uuidv4(),
    matchweek_id: matchweekId,
    home_team: 'Lions',
    away_team: 'Tigers',
    kickoff: kickoff1,
    status: 'scheduled',
    final_home_score: null,
    final_away_score: null
  });

  insertFixture.run({
    id: uuidv4(),
    matchweek_id: matchweekId,
    home_team: 'Bears',
    away_team: 'Wolves',
    kickoff: kickoff2,
    status: 'scheduled',
    final_home_score: null,
    final_away_score: null
  });
}

seedFixtures();

export function createUser({ email, password_hash, displayName }) {
  const id = uuidv4();
  const created_at = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, created_at)
    VALUES (@id, @email, @password_hash, @display_name, @created_at)
  `);

  stmt.run({
    id,
    email,
    password_hash,
    display_name: displayName ?? null,
    created_at
  });

  return getUserById(id);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserDisplayName(id, displayName) {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName ?? null, id);
  return getUserById(id);
}

export function createGroup({ name, description, createdBy }) {
  const id = uuidv4();
  const invite_code = nanoid(8);
  const created_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO groups (id, name, description, invite_code, created_by, created_at)
    VALUES (@id, @name, @description, @invite_code, @created_by, @created_at)
  `).run({
    id,
    name,
    description: description || null,
    invite_code,
    created_by: createdBy,
    created_at
  });

  const memberId = uuidv4();
  db.prepare(`
    INSERT INTO group_members (id, group_id, user_id, role, joined_at)
    VALUES (@id, @group_id, @user_id, @role, @joined_at)
  `).run({
    id: memberId,
    group_id: id,
    user_id: createdBy,
    role: 'admin',
    joined_at: created_at
  });

  return getGroupById(id);
}

export function getGroupByInviteCode(code) {
  return db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code);
}

export function getGroupById(id) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
}

export function addMemberToGroup({ groupId, userId, role = 'member' }) {
  const memberId = uuidv4();
  const joined_at = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, joined_at)
    VALUES (@id, @group_id, @user_id, @role, @joined_at)
  `).run({
    id: memberId,
    group_id: groupId,
    user_id: userId,
    role,
    joined_at
  });
  return getGroupMembership(groupId, userId);
}

export function removeMember(groupId, userId) {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
}

export function getGroupMembership(groupId, userId) {
  return db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

export function listUserGroups(userId) {
  const stmt = db.prepare(`
    SELECT g.*, gm.role, gm.joined_at
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC
  `);
  return stmt.all(userId);
}

export function groupMembers(groupId) {
  const stmt = db.prepare(`
    SELECT u.id, u.email, u.display_name, gm.role, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.created_at ASC
  `);
  return stmt.all(groupId);
}

export function upsertPick({ userId, groupId, fixtureId, homeScore, awayScore }) {
  const id = uuidv4();
  const updated_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO picks (id, user_id, group_id, fixture_id, home_score, away_score, updated_at)
    VALUES (@id, @user_id, @group_id, @fixture_id, @home_score, @away_score, @updated_at)
    ON CONFLICT(user_id, group_id, fixture_id)
    DO UPDATE SET home_score = excluded.home_score, away_score = excluded.away_score, updated_at = excluded.updated_at
  `).run({
    id,
    user_id: userId,
    group_id: groupId,
    fixture_id: fixtureId,
    home_score: homeScore,
    away_score: awayScore,
    updated_at
  });
  return getPick(userId, groupId, fixtureId);
}

export function getPick(userId, groupId, fixtureId) {
  return db
    .prepare('SELECT * FROM picks WHERE user_id = ? AND group_id = ? AND fixture_id = ?')
    .get(userId, groupId, fixtureId);
}

export function listPicksForUser({ userId, groupId, matchweekId }) {
  const stmt = db.prepare(`
    SELECT p.*, f.matchweek_id
    FROM picks p
    JOIN fixtures f ON f.id = p.fixture_id
    WHERE p.user_id = ? AND p.group_id = ? AND f.matchweek_id = ?
  `);
  return stmt.all(userId, groupId, matchweekId);
}

export function markSubmission({ userId, groupId, matchweekId }) {
  const id = uuidv4();
  const submitted_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO submissions (id, user_id, group_id, matchweek_id, submitted_at)
    VALUES (@id, @user_id, @group_id, @matchweek_id, @submitted_at)
    ON CONFLICT(user_id, group_id, matchweek_id)
    DO UPDATE SET submitted_at = excluded.submitted_at
  `).run({
    id,
    user_id: userId,
    group_id: groupId,
    matchweek_id: matchweekId,
    submitted_at
  });
  return getSubmission(userId, groupId, matchweekId);
}

export function getSubmission(userId, groupId, matchweekId) {
  return db
    .prepare('SELECT * FROM submissions WHERE user_id = ? AND group_id = ? AND matchweek_id = ?')
    .get(userId, groupId, matchweekId);
}

export function listSubmissionsForGroup(groupId, matchweekId) {
  return db
    .prepare('SELECT * FROM submissions WHERE group_id = ? AND matchweek_id = ?')
    .all(groupId, matchweekId);
}

export function currentMatchweek() {
  return db.prepare('SELECT * FROM matchweeks ORDER BY deadline ASC LIMIT 1').get();
}

export function fixturesForMatchweek(matchweekId) {
  return db
    .prepare('SELECT * FROM fixtures WHERE matchweek_id = ? ORDER BY kickoff ASC')
    .all(matchweekId);
}

export function listGroupPicks({ groupId, matchweekId }) {
  const stmt = db.prepare(`
    SELECT p.*, u.display_name, u.email
    FROM picks p
    JOIN fixtures f ON f.id = p.fixture_id
    JOIN users u ON u.id = p.user_id
    WHERE p.group_id = ? AND f.matchweek_id = ?
  `);
  return stmt.all(groupId, matchweekId);
}

export function updateFixtureScore({ fixtureId, status, final_home_score, final_away_score }) {
  db.prepare(
    'UPDATE fixtures SET status = ?, final_home_score = ?, final_away_score = ? WHERE id = ?'
  ).run(status, final_home_score, final_away_score, fixtureId);
  return db.prepare('SELECT * FROM fixtures WHERE id = ?').get(fixtureId);
}

export function listGroupMembers(groupId) {
  return groupMembers(groupId);
}

export default db;
