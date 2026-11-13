import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateGiftBonusPoints,
  CLASSROOM_GIFT_EVENTS_META,
  GIFT_POINTS_PER_COIN,
  resolveClassroomGiftKind,
} from '../config/constants';

test('GIFT_POINTS_PER_COIN strictly awards +5 points per 1 coin', () => {
  assert.equal(GIFT_POINTS_PER_COIN, 5);
  assert.equal(calculateGiftBonusPoints(1), 5);
  assert.equal(calculateGiftBonusPoints(3), 15);
  assert.equal(calculateGiftBonusPoints(5), 25);
  assert.equal(calculateGiftBonusPoints(10), 50);
  assert.equal(calculateGiftBonusPoints(20), 100);
  assert.equal(calculateGiftBonusPoints(99), 495);
  assert.equal(calculateGiftBonusPoints(1000), 5000);
  assert.equal(calculateGiftBonusPoints(0), 5);
});

test('All 7 classroom gift events have bonusPoints = coins * 5', () => {
  assert.equal(CLASSROOM_GIFT_EVENTS_META.length, 7);
  for (const meta of CLASSROOM_GIFT_EVENTS_META) {
    assert.equal(
      meta.bonusPoints,
      meta.coins * 5,
      `Expected ${meta.id} (${meta.coins} coins) to have ${meta.coins * 5} bonusPoints`
    );
  }
});

test('resolveClassroomGiftKind maps gifts and combos cleanly with 5 points per coin', () => {
  const rose = resolveClassroomGiftKind('Rose', 1);
  assert.equal(rose.id, 'rose');
  assert.equal(calculateGiftBonusPoints(1), 5);

  const roseCombo3 = resolveClassroomGiftKind('Rose', 3);
  assert.equal(roseCombo3.id, 'rose');
  assert.equal(calculateGiftBonusPoints(3), 15);

  const heart = resolveClassroomGiftKind('Finger Heart', 5);
  assert.equal(heart.id, 'heart');
  assert.equal(heart.bonusPoints, 25);

  const rosa = resolveClassroomGiftKind('Rosa', 10);
  assert.equal(rosa.id, 'pig');
  assert.equal(rosa.bonusPoints, 50);

  const vip = resolveClassroomGiftKind('Perfume', 20);
  assert.equal(vip.id, 'vip');
  assert.equal(vip.bonusPoints, 100);

  const galaxy = resolveClassroomGiftKind('Galaxy', 1000);
  assert.equal(galaxy.id, 'vip');
  assert.equal(calculateGiftBonusPoints(1000), 5000);
});
