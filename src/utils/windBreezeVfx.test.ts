import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWindBreezeRuntime,
  normalizeWindBreezeSettings,
  resolveGustDirection,
  spawnWindGust,
  stepAndDrawWindBreeze,
} from './windBreezeVfx';

test('normalizeWindBreezeSettings clamps out-of-range values and preserves valid options', () => {
  const defaults = normalizeWindBreezeSettings({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.intervalSec, 25);
  assert.equal(defaults.durationSec, 6.5);
  assert.equal(defaults.leafCount, 14);
  assert.equal(defaults.leafTheme, 'mixed');
  assert.equal(defaults.autumnRatio, 55);
  assert.equal(defaults.direction, 'left_to_right');
  assert.equal(defaults.showStreaks, true);

  const clamped = normalizeWindBreezeSettings({
    vfxWindBreezeEnabled: false,
    vfxWindBreezeIntervalSec: 1,
    vfxWindBreezeDurationSec: 99,
    vfxWindBreezeLeafCount: 200,
    vfxWindBreezeLeafTheme: 'autumn',
    vfxWindBreezeAutumnRatio: 150,
    vfxWindBreezeLeafScale: 0.1,
    vfxWindBreezeSpeed: 9,
    vfxWindBreezeOpacity: 0.02,
    vfxWindBreezeDirection: 'alternate',
    vfxWindBreezeShowStreaks: false,
  });

  assert.equal(clamped.enabled, false);
  assert.equal(clamped.intervalSec, 5);
  assert.equal(clamped.durationSec, 15);
  assert.equal(clamped.leafCount, 60);
  assert.equal(clamped.leafTheme, 'autumn');
  assert.equal(clamped.autumnRatio, 100);
  assert.equal(clamped.leafScale, 0.4);
  assert.equal(clamped.speed, 2.5);
  assert.equal(clamped.opacity, 0.2);
  assert.equal(clamped.direction, 'alternate');
  assert.equal(clamped.showStreaks, false);
});

test('spawnWindGust honors leaf themes, streak toggle, and alternating directions', () => {
  const runtime = createWindBreezeRuntime();

  const autumnSettings = normalizeWindBreezeSettings({
    vfxWindBreezeLeafCount: 10,
    vfxWindBreezeLeafTheme: 'autumn',
    vfxWindBreezeDirection: 'alternate',
    vfxWindBreezeShowStreaks: true,
  });
  spawnWindGust(runtime, autumnSettings, 540, 960);
  assert.equal(runtime.leaves.length, 10);
  assert.ok(runtime.streaks.length >= 3);
  assert.ok(runtime.leaves.every((lf) => lf.palette.kind === 'autumn'));
  assert.ok(runtime.leaves.every((lf) => lf.dir === 1 && lf.vx > 0));

  // Lần thổi thứ 2 ở chế độ 'alternate' phải đảo sang phải -> trái (-1)
  const greenNoStreak = normalizeWindBreezeSettings({
    vfxWindBreezeLeafCount: 8,
    vfxWindBreezeLeafTheme: 'green',
    vfxWindBreezeDirection: 'alternate',
    vfxWindBreezeShowStreaks: false,
  });
  runtime.leaves.length = 0;
  runtime.streaks.length = 0;
  spawnWindGust(runtime, greenNoStreak, 540, 960);
  assert.equal(runtime.leaves.length, 8);
  assert.equal(runtime.streaks.length, 0);
  assert.ok(runtime.leaves.every((lf) => lf.palette.kind === 'green'));
  assert.ok(runtime.leaves.every((lf) => lf.dir === -1 && lf.vx < 0));
  assert.equal(resolveGustDirection('right_to_left', 0), -1);
});

test('stepAndDrawWindBreeze triggers periodic gusts after x seconds and advances leaves across stage', () => {
  const runtime = createWindBreezeRuntime();
  const settings = normalizeWindBreezeSettings({
    vfxWindBreezeEnabled: true,
    vfxWindBreezeIntervalSec: 10,
    vfxWindBreezeDurationSec: 4,
    vfxWindBreezeLeafCount: 6,
    vfxWindBreezeDirection: 'left_to_right',
  });

  // Khởi tạo mốc chu kỳ ở t = 1000ms (bucket 0) -> chưa nổ ngay lúc mount
  stepAndDrawWindBreeze(null, runtime, settings, 0.016, 1000, 540, 960, 0);
  assert.equal(runtime.leaves.length, 0);

  // Sang t = 10_050ms (qua 10s -> sang bucket 1) -> tự động sinh đợt gió & lá
  stepAndDrawWindBreeze(null, runtime, settings, 0.016, 10_050, 540, 960, 0);
  assert.equal(runtime.leaves.length, 6);

  const firstLeaf = runtime.leaves.find((lf) => lf.ageSec >= -0.05) || runtime.leaves[0];
  const initialX = firstLeaf.x;

  // Chạy mô phỏng 2 giây -> lá bay sang phải (x tăng lên)
  let simNow = 10_050;
  for (let frame = 0; frame < 120; frame++) {
    simNow += 16.67;
    stepAndDrawWindBreeze(null, runtime, settings, 0.01667, simNow, 540, 960, 0);
  }
  assert.ok(firstLeaf.x > initialX);

  // Khi tắt hiệu ứng -> lập tức dọn sạch hạt đang bay
  const disabledSettings = { ...settings, enabled: false };
  stepAndDrawWindBreeze(null, runtime, disabledSettings, 0.016, simNow + 20, 540, 960, 0);
  assert.equal(runtime.leaves.length, 0);
  assert.equal(runtime.streaks.length, 0);
});
