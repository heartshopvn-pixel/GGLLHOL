import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { NODE_SERVER_CODE } from '../config/constants';
import {
  applyEulerSignConfig,
  classifyTikTokError,
  computeTikTokReconnectPlan,
} from './tiktokReconnectPolicy';

test('Mã nguồn server.js (NODE_SERVER_CODE) có cú pháp JavaScript chuẩn 100% và đủ 4 chốt bảo vệ', () => {
  assert.doesNotThrow(() => {
    new vm.Script(NODE_SERVER_CODE, { filename: 'server.js' });
  });
  assert.match(NODE_SERVER_CODE, /streamEnd/);
  assert.match(NODE_SERVER_CODE, /BACKOFF_SCHEDULE_MS = \[8000, 20000, 45000, 90000\]/);
  assert.match(NODE_SERVER_CODE, /resolveEulerApiKey/);
  assert.match(NODE_SERVER_CODE, /SignConfig/);
});

test('Chốt 1: Kênh Offline hoặc Phiên Live kết thúc (streamEnd) -> Dừng hẳn, KHÔNG tự kết nối lại', () => {
  const offlinePlan = computeTikTokReconnectPlan({
    currentAttempt: 0,
    error: Object.assign(new Error('The requested user is currently offline.'), {
      name: 'UserOfflineError',
    }),
  });
  assert.equal(offlinePlan.shouldReconnect, false);
  assert.match(offlinePlan.reasonVi, /chưa bật Live|Offline/i);

  const streamEndPlan = computeTikTokReconnectPlan({
    currentAttempt: 0,
    streamEndedByHost: true,
  });
  assert.equal(streamEndPlan.shouldReconnect, false);
  assert.match(streamEndPlan.reasonVi, /streamEnd/i);
});

test('Chốt 2: Chạm giới hạn lượt 429 Rate Limit hoặc lỗi API Key -> Ngắt ngay lập tức không gọi bồi', () => {
  const rateLimitErr = Object.assign(
    new Error('Request failed with status code 429: Too Many Requests'),
    { name: 'SignatureRateLimitError' }
  );
  const classified = classifyTikTokError(rateLimitErr);
  assert.equal(classified.category, 'rate_limit');
  assert.equal(classified.shouldAutoReconnect, false);

  const plan = computeTikTokReconnectPlan({
    currentAttempt: 0,
    error: rateLimitErr,
  });
  assert.equal(plan.shouldReconnect, false);

  const authPlan = computeTikTokReconnectPlan({
    currentAttempt: 0,
    error: new Error('SignAPIError: 401 Invalid API key'),
  });
  assert.equal(authPlan.shouldReconnect, false);
});

test('Chốt 3: Rớt mạng tạm thời -> Giãn nhịp 8s -> 20s -> 45s -> 90s rồi dừng an toàn ở lần thứ 5', () => {
  const expectedDelays = [8000, 20000, 45000, 90000];
  let attempt = 0;

  for (const expectedDelay of expectedDelays) {
    const plan = computeTikTokReconnectPlan({
      currentAttempt: attempt,
      error: new Error('ECONNRESET: socket hang up'),
    });
    assert.equal(plan.shouldReconnect, true);
    assert.equal(plan.delayMs, expectedDelay);
    attempt = plan.nextAttempt;
  }

  // Sau 4 lần thử không thành công -> lần thứ 5 bắt buộc dừng hẳn
  const cappedPlan = computeTikTokReconnectPlan({
    currentAttempt: attempt,
    error: new Error('ECONNRESET: socket hang up'),
  });
  assert.equal(cappedPlan.shouldReconnect, false);
});

test('Chốt 4: applyEulerSignConfig gán SignConfig.apiKey và xóa cachedInstance để ăn key ngay lập tức', () => {
  const fakePkg = {
    SignConfig: {
      apiKey: undefined as string | undefined,
      cachedInstance: { stale: true } as unknown,
    },
  };

  const hasKey = applyEulerSignConfig(fakePkg, '  euler_live_test_123  ');
  assert.equal(hasKey, true);
  assert.equal(fakePkg.SignConfig.apiKey, 'euler_live_test_123');
  assert.equal(fakePkg.SignConfig.cachedInstance, undefined);

  const cleared = applyEulerSignConfig(fakePkg, '');
  assert.equal(cleared, false);
  assert.equal(fakePkg.SignConfig.apiKey, undefined);
});
