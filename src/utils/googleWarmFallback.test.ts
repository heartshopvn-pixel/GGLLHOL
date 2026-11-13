import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleWarmDirectMirrorUrls,
  buildServerGoogleWarmMirrorUrls,
  normalizeGoogleWarmTextChunk,
  resolveGoogleWarmWebSpeechFallbackPitch,
  runSequentialFallbackChain,
} from './googleWarmFallback';

test('buildGoogleWarmDirectMirrorUrls & buildServerGoogleWarmMirrorUrls generate multi-host Vietnamese mirrors', () => {
  const direct = buildGoogleWarmDirectMirrorUrls('  Xin   chào cả lớp 12A1!  ');
  assert.equal(direct.length, 2);
  assert.equal(direct[0].isSwitched, false);
  assert.equal(direct[1].isSwitched, true);
  assert.ok(direct[0].url.includes('translate.googleapis.com'));
  assert.ok(direct[1].url.includes('clients5.google.com'));
  assert.ok(direct[0].url.includes(encodeURIComponent('Xin chào cả lớp 12A1!')));

  const serverMirrors = buildServerGoogleWarmMirrorUrls('Cô Thảo kiểm tra bài cũ');
  assert.equal(serverMirrors.length, 4);
  assert.equal(serverMirrors[0].id, 'google-gtx');
  assert.equal(serverMirrors[1].id, 'google-clients5');
  assert.ok(serverMirrors[3].url.includes('translate.google.com.vn'));

  assert.deepEqual(buildGoogleWarmDirectMirrorUrls('   '), []);
  assert.equal(normalizeGoogleWarmTextChunk('a'.repeat(250), 180).length, 180);
});

test('resolveGoogleWarmWebSpeechFallbackPitch preserves male warmth and maps general warm pitch naturally', () => {
  // Giọng Nam Thầy Cá giữ tông trầm 0.82 - 0.84
  assert.equal(resolveGoogleWarmWebSpeechFallbackPitch(0.84, true), 0.84);
  assert.equal(resolveGoogleWarmWebSpeechFallbackPitch(0.6, true), 0.75);

  // Giọng Google Warm mặc định (0.88) ánh xạ sang 0.96 ấm tự nhiên trên Web Speech
  assert.equal(resolveGoogleWarmWebSpeechFallbackPitch(0.88, false), 0.96);
  assert.equal(resolveGoogleWarmWebSpeechFallbackPitch(0.94, false), 1.02);
});

test('runSequentialFallbackChain falls back across mirrors to Web Speech and auto-recovers on next call', async () => {
  let primaryHealthy = false;

  const speakSentence = async () =>
    runSequentialFallbackChain<string>([
      {
        name: 'google-proxy',
        run: async () => {
          if (!primaryHealthy) throw new Error('HTTP 502');
          return 'played-via-google-warm-proxy';
        },
      },
      {
        name: 'google-direct-mirror',
        run: async () => null, // giả lập stream trực tiếp cũng bị chặn mạng
      },
      {
        name: 'web-speech-vi-fallback',
        run: async () => 'played-via-web-speech-vi',
      },
    ]);

  // Lượt 1: Google Warm nghẽn -> tự động fallback xuống Web Speech Tiếng Việt
  const firstAttempt = await speakSentence();
  assert.equal(firstAttempt.value, 'played-via-web-speech-vi');
  assert.equal(firstAttempt.usedStepName, 'web-speech-vi-fallback');
  assert.equal(firstAttempt.failedSteps.length, 2);

  // Lượt 2: Khi Google Warm ổn định trở lại -> tự động phục hồi phát bằng Google Warm ngay lập tức
  primaryHealthy = true;
  const secondAttempt = await speakSentence();
  assert.equal(secondAttempt.value, 'played-via-google-warm-proxy');
  assert.equal(secondAttempt.usedStepIndex, 0);
  assert.equal(secondAttempt.failedSteps.length, 0);
});
