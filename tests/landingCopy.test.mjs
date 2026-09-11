import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const landingSource = fs.readFileSync(new URL('../src/LandingPage.jsx', import.meta.url), 'utf8');

test('landing page uses the approved direct, low-points copy', () => {
  const approvedCopy = [
    'Football predictions with friends',
    'Predict the score.',
    'Lowest points wins.',
    'Pick each score before kickoff.',
    'Free to play. Private groups.',
    'See how scoring works',
    'One goal off. One point.',
    'Difference from the final score',
    'Lower is better.',
    'Example fixture. Not a live result.',
    'Choose a competition',
    'Create a separate group for each competition.',
    'How it works',
    'Pick scores. Get points for being wrong.',
    'Create a group',
    'Make your picks',
    'Keep your total low',
    'Example group',
    'Everyone predicts the same matches.',
    'Lowest total leads the group.',
    'The closer your predictions, the lower your total.',
    'Play across the biggest competitions.',
    'Ready to make your picks?',
    'Football score predictions with friends.',
  ];

  for (const copy of approvedCopy) assert.ok(landingSource.includes(copy), `missing approved copy: ${copy}`);
});

test('landing page removes the rejected corny copy', () => {
  const rejectedCopy = [
    'For the group chat’s football experts.',
    'Big opinions.',
    'A little off. A point worse.',
    'The group chat.',
    'Being right gets you nothing.',
    'You’ve talked a good game.',
  ];

  for (const copy of rejectedCopy) assert.ok(!landingSource.includes(copy), `rejected copy remains: ${copy}`);
});
