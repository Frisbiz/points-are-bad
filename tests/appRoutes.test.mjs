import test from 'node:test';
import assert from 'node:assert/strict';
import { appPath, parseAppRoute } from '../src/appRoutes.js';

test('dashboard has a stable route', () => {
  assert.deepEqual(parseAppRoute('/dashboard'), { page: 'dashboard' });
  assert.equal(appPath({ page: 'dashboard' }), '/dashboard');
});

test('group ids are encoded into their own stable route', () => {
  assert.equal(appPath({ page: 'group', groupId: 'group / 7' }), '/groups/group%20%2F%207');
  assert.deepEqual(parseAppRoute('/groups/group%20%2F%207'), { page: 'group', groupId: 'group / 7' });
});

test('public and sign-in routes are recognized', () => {
  assert.deepEqual(parseAppRoute('/'), { page: 'home' });
  assert.deepEqual(parseAppRoute('/signin'), { page: 'signin' });
  assert.deepEqual(parseAppRoute('/link-discord'), { page: 'discord-link' });
  assert.equal(appPath({ page: 'discord-link' }), '/link-discord');
});

test('unknown and malformed routes resolve safely', () => {
  assert.deepEqual(parseAppRoute('/wat'), { page: 'not-found' });
  assert.deepEqual(parseAppRoute('/groups/%E0%A4%A'), { page: 'not-found' });
});
