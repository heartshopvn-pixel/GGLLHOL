import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCacheBustedReminderUrl,
  DEFAULT_REMINDER_ALERT_KEYWORDS,
  DEFAULT_REMINDER_ALERT_URL,
  matchReminderAlertKeyword,
  parseReminderKeywordsInput,
} from './silentReminderAlert';

test('matchReminderAlertKeyword matches Vietnamese lag/freeze phrases without false-matching English words', () => {
  const kws = DEFAULT_REMINDER_ALERT_KEYWORDS;

  assert.equal(matchReminderAlertKeyword('Cô ơi sao game đứng rồi ạ!', kws), 'game đứng');
  assert.equal(matchReminderAlertKeyword('Mạng LAG quá cô ơi', kws), 'lag');
  assert.equal(matchReminderAlertKeyword('hình như mất tiếng rồi', kws), 'mất tiếng');

  // Must NOT false-trigger on English vocabulary words containing "lag"
  assert.equal(matchReminderAlertKeyword('flag', kws), null);
  assert.equal(matchReminderAlertKeyword('village', kws), null);
  assert.equal(matchReminderAlertKeyword('luggage', kws), null);
});

test('parseReminderKeywordsInput splits comma/newline inputs and deduplicates case-insensitively', () => {
  const parsed = parseReminderKeywordsInput('game đứng, lag, LAG , đơ hình\nmất tiếng');
  assert.deepEqual(parsed, ['game đứng', 'lag', 'đơ hình', 'mất tiếng']);
});

test('buildCacheBustedReminderUrl preserves ring=2 query parameter and appends _ts', () => {
  const url = buildCacheBustedReminderUrl(DEFAULT_REMINDER_ALERT_URL, 1700000000123);
  assert.equal(
    url,
    'https://heartshopvn-pixel.github.io/Focus-Reminder/?ring=2&_ts=1700000000123'
  );
  assert.equal(buildCacheBustedReminderUrl('javascript:alert(1)', 123), null);
});
