import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveLoopScheduler } from './liveLoopWakeup';

test('Wake-Up Loop: Khi requestAnimationFrame bị treo (0 FPS trên TikTok Live Studio CEF), Worker tự động nhảy vào bơm nhịp mượt mà', () => {
  let virtualNow = 1000;
  const hooks: { workerTick: (() => void) | null } = { workerTick: null };
  const rafCallbacks = new Map<number, (t: number) => void>();
  let nextRafId = 1;

  const scheduler = createLiveLoopScheduler({
    now: () => virtualNow,
    requestAnimFrame: (cb) => {
      const id = nextRafId++;
      // Mô phỏng CEF offscreen trên TikTok Live Studio: nhận đăng ký rAF nhưng KHÔNG BAO GIỜ gọi callback!
      rafCallbacks.set(id, cb);
      return id;
    },
    cancelAnimFrame: (id) => {
      rafCallbacks.delete(id);
    },
    startHeartbeat: (onTick) => {
      hooks.workerTick = onTick;
      return () => {
        hooks.workerTick = null;
      };
    },
  });

  const frames: number[] = [];
  const unsubscribe = scheduler.subscribeAnimationLoop((t) => {
    frames.push(t);
  });

  assert.ok(hooks.workerTick, 'Worker heartbeat phải được khởi chạy ngay khi có subscriber');

  // Nhịp 25ms đầu tiên: chưa vượt ngưỡng 55ms chờ rAF gốc
  virtualNow += 25;
  hooks.workerTick();
  assert.equal(frames.length, 0);

  // Nhịp 60ms: vượt ngưỡng 55ms mà rAF vẫn câm lặng -> Worker lập tức tiếp quản đánh thức vòng lặp!
  virtualNow += 35; // 1060ms
  hooks.workerTick();
  assert.equal(frames.length, 1);
  assert.equal(frames[0], 1060);

  // Các nhịp 25ms tiếp theo (~40 FPS): Worker bơm đều đặn liên tục, game không bao giờ đứng hình
  for (let i = 0; i < 10; i++) {
    virtualNow += 25;
    hooks.workerTick();
  }
  assert.equal(frames.length, 11);

  unsubscribe();
  assert.equal(hooks.workerTick, null, 'Hủy hết subscriber thì Worker tự nghỉ sạch');
});

test('Wake-Up Loop: Khi Chrome chạy bình thường (rAF 60Hz đều đặn), Worker KHÔNG nhân đôi khung hình', () => {
  let virtualNow = 2000;
  const hooks: {
    workerTick: (() => void) | null;
    pendingRaf: ((t: number) => void) | null;
  } = {
    workerTick: null,
    pendingRaf: null,
  };

  const scheduler = createLiveLoopScheduler({
    now: () => virtualNow,
    requestAnimFrame: (cb) => {
      hooks.pendingRaf = cb;
      return 1;
    },
    cancelAnimFrame: () => {
      hooks.pendingRaf = null;
    },
    startHeartbeat: (onTick) => {
      hooks.workerTick = onTick;
      return () => {
        hooks.workerTick = null;
      };
    },
  });

  let frameCount = 0;
  const unsub = scheduler.subscribeAnimationLoop(() => {
    frameCount++;
  });

  // Mô phỏng 6 khung hình 60FPS liên tiếp (~16ms/frame) xen kẽ với nhịp Worker 25ms
  for (let step = 1; step <= 6; step++) {
    virtualNow += 16;
    const cb = hooks.pendingRaf;
    hooks.pendingRaf = null;
    cb?.(virtualNow);
    // Worker nổ ngay sau đó 9ms (tổng mới 9ms kể từ rAF gần nhất < 55ms) -> KHÔNG được gọi trùng!
    virtualNow += 9;
    hooks.workerTick?.();
  }

  assert.equal(frameCount, 6, 'Chỉ đúng 6 khung hình từ rAF gốc, tuyệt đối không bị nhân đôi bởi Worker');
  unsub();
  scheduler.dispose();
});

test('Wake-Up Loop: Lỗi bất ngờ trong 1 subscriber hoặc interval không bao giờ làm chết vòng lặp chung', () => {
  let virtualNow = 5000;
  const hooks: { workerTick: (() => void) | null } = { workerTick: null };

  const scheduler = createLiveLoopScheduler({
    now: () => virtualNow,
    requestAnimFrame: () => 1, // Giả lập rAF treo
    cancelAnimFrame: () => {},
    startHeartbeat: (onTick) => {
      hooks.workerTick = onTick;
      return () => {
        hooks.workerTick = null;
      };
    },
  });

  let healthyFrames = 0;
  scheduler.subscribeAnimationLoop(() => {
    throw new Error('Giả lập lỗi render 1 frame');
  });
  scheduler.subscribeAnimationLoop(() => {
    healthyFrames++;
  });

  let intervalHits = 0;
  let timeoutHits = 0;
  scheduler.setUnthrottledInterval(() => {
    intervalHits++;
  }, 100);
  scheduler.setUnthrottledTimeout(() => {
    timeoutHits++;
  }, 150);

  for (let i = 0; i < 8; i++) {
    virtualNow += 30;
    hooks.workerTick?.();
  }

  assert.ok(healthyFrames >= 6, 'Subscriber lành lặn vẫn chạy mượt dù subscriber kia ném lỗi');
  assert.equal(intervalHits, 2, 'Unthrottled interval 100ms nổ chuẩn xác ở ~100ms và ~200ms');
  assert.equal(timeoutHits, 1, 'Unthrottled timeout 150ms nổ đúng 1 lần duy nhất');

  scheduler.dispose();
});
