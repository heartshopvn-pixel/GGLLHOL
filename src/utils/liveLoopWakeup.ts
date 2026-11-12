/**
 * Bộ đánh thức vòng lặp Game ("Wake-Up Loop") chống treo cho TikTok Live Studio & OBS Browser Source (CEF).
 *
 * Nguyên nhân treo trên TikTok Live Studio:
 * - TikTok Live Studio nhúng link web bằng nhân CEF (Chromium Embedded Framework) ở chế độ offscreen/windowless
 *   không có tiêu điểm cửa sổ hệ điều hành.
 * - Bộ lập lịch của Chromium/CEF thường ngắt hẳn `requestAnimationFrame` (0 FPS) và bóp nghẹt `setInterval`/`setTimeout`
 *   trên luồng chính xuống 1s–60s khiến toàn bộ nhân vật, camera, hạt hiệu ứng và đồng hồ câu hỏi đứng hình.
 *
 * Giải pháp Hybrid 2 tầng:
 * 1. Khi chạy trên Chrome bình thường (`requestAnimationFrame` đang đập đều < 55ms): dùng 100% `requestAnimationFrame`
 *    gốc của màn hình (60Hz / 120Hz / 144Hz), KHÔNG nhân đôi khung hình, KHÔNG tốn tài nguyên thừa.
 * 2. Ngay khi `requestAnimationFrame` bị CEF/TikTok Live Studio ngắt nhịp (> 55ms không phản hồi):
 *    Web Worker độc lập chạy ngầm ở luồng riêng (không bao giờ bị CEF bóp băng thông hay đóng băng offscreen)
 *    tự động nhảy vào "đánh thức" và bơm nhịp ~40 FPS cho toàn bộ vật lý, camera, canvas FX và bộ đếm giờ!
 */

export interface LiveLoopSchedulerDeps {
  now: () => number;
  requestAnimFrame: (cb: (nowMs: number) => void) => number;
  cancelAnimFrame: (id: number) => void;
  startHeartbeat: (onTick: () => void, intervalMs: number) => () => void;
}

export interface LiveLoopScheduler {
  subscribeAnimationLoop: (cb: (nowMs: number) => void) => () => void;
  setUnthrottledInterval: (cb: () => void, intervalMs: number) => () => void;
  setUnthrottledTimeout: (cb: () => void, delayMs: number) => () => void;
  dispose: () => void;
}

const WORKER_TICK_MS = 25; // ~40 FPS khi chạy bằng nhịp đánh thức CEF
const RAF_STALL_THRESHOLD_MS = 55; // Nếu quá 55ms không có rAF gốc -> Worker lập tức tiếp quản
const RAF_REPROBE_INTERVAL_MS = 500; // Định kỳ dò lại rAF gốc nếu cửa sổ được cấp lại compositor

export function isLiveStreamBrowserView(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('obs') === '1' ||
      params.get('view') === 'live' ||
      params.get('mode') === 'live'
    ) {
      return true;
    }
    const ua = (window.navigator?.userAgent || '').toLowerCase();
    return (
      ua.includes('obs') ||
      ua.includes('tiktok') ||
      ua.includes('live studio') ||
      ua.includes('bytedance')
    );
  } catch {
    return false;
  }
}

function startDefaultWorkerHeartbeat(
  onTick: () => void,
  intervalMs: number
): () => void {
  if (typeof window === 'undefined') {
    const timer = setInterval(onTick, intervalMs);
    return () => clearInterval(timer);
  }

  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let worker: Worker | null = null;
  let blobUrl: string | null = null;
  let disposed = false;

  const ensureFallbackInterval = () => {
    if (disposed || fallbackTimer !== null) return;
    fallbackTimer = setInterval(onTick, intervalMs);
  };

  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const workerCode = [
        'var timerId = null;',
        'self.onmessage = function(e) {',
        '  var d = e.data || {};',
        '  if (d.cmd === "start") {',
        '    if (timerId !== null) clearInterval(timerId);',
        '    timerId = setInterval(function() { self.postMessage(1); }, d.ms || 25);',
        '  } else if (d.cmd === "stop") {',
        '    if (timerId !== null) { clearInterval(timerId); timerId = null; }',
        '  }',
        '};',
      ].join('\n');
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      worker.onmessage = () => {
        if (!disposed) onTick();
      };
      worker.onerror = () => {
        // Nếu CSP chặn Blob Worker trên một số trình duyệt nhúng -> tự động chuyển sang bộ đếm dự phòng
        try {
          worker?.terminate();
        } catch {
          // Ignore
        }
        worker = null;
        ensureFallbackInterval();
      };
      worker.postMessage({ cmd: 'start', ms: intervalMs });
    } catch {
      worker = null;
      ensureFallbackInterval();
    }
  } else {
    ensureFallbackInterval();
  }

  return () => {
    disposed = true;
    if (worker) {
      try {
        worker.postMessage({ cmd: 'stop' });
        worker.terminate();
      } catch {
        // Ignore
      }
      worker = null;
    }
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Ignore
      }
      blobUrl = null;
    }
    if (fallbackTimer !== null) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };
}

export function createLiveLoopScheduler(
  customDeps?: Partial<LiveLoopSchedulerDeps>
): LiveLoopScheduler {
  const deps: LiveLoopSchedulerDeps = {
    now:
      customDeps?.now ||
      (() =>
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()),
    requestAnimFrame:
      customDeps?.requestAnimFrame ||
      ((cb) =>
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame(cb)
          : (setTimeout(() => cb(deps.now()), 16) as unknown as number)),
    cancelAnimFrame:
      customDeps?.cancelAnimFrame ||
      ((id) => {
        if (
          typeof window !== 'undefined' &&
          typeof window.cancelAnimationFrame === 'function'
        ) {
          window.cancelAnimationFrame(id);
        } else {
          clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
        }
      }),
    startHeartbeat: customDeps?.startHeartbeat || startDefaultWorkerHeartbeat,
  };

  const animSubscribers = new Set<(nowMs: number) => void>();

  interface IntervalEntry {
    id: number;
    cb: () => void;
    intervalMs: number;
    nextAt: number;
  }

  interface TimeoutEntry {
    id: number;
    cb: () => void;
    fireAt: number;
  }

  const intervals = new Map<number, IntervalEntry>();
  const timeouts = new Map<number, TimeoutEntry>();
  let nextTaskId = 1;

  let stopHeartbeatFn: (() => void) | null = null;
  let rafId = 0;
  let rafScheduled = false;
  let lastNativeRafAt = -Infinity;
  let animLoopStartedAt = 0;
  let lastRafProbeAt = 0;
  let lastDispatchedAnimAt = -Infinity;

  const hasAnyWork = () =>
    animSubscribers.size > 0 || intervals.size > 0 || timeouts.size > 0;

  const dispatchAnimSubscribers = (frameNow: number) => {
    // Chống gọi trùng cùng một mốc thời gian nếu rAF vừa nổ sát nút nhịp Worker (< 4ms)
    if (frameNow - lastDispatchedAnimAt < 4) return;
    lastDispatchedAnimAt = frameNow;
    animSubscribers.forEach((cb) => {
      try {
        cb(frameNow);
      } catch (err) {
        console.warn('[LiveLoopWakeup] Lỗi trong callback vòng lặp nhưng vòng lặp vẫn được bảo toàn:', err);
      }
    });
  };

  const scheduleNativeRaf = (currentNow: number) => {
    if (rafScheduled || animSubscribers.size === 0) return;
    rafScheduled = true;
    lastRafProbeAt = currentNow;
    try {
      rafId = deps.requestAnimFrame(onNativeRaf);
    } catch {
      rafScheduled = false;
    }
  };

  const onNativeRaf = (rawRafNow: number) => {
    rafScheduled = false;
    if (animSubscribers.size === 0) return;
    const monotonicNow = deps.now();
    // Một số bản CEF trả về DOMHighResTimeStamp lệch hệ quy chiếu so với performance.now(), ưu tiên deps.now() nếu chênh lệch lớn
    const safeNow =
      typeof rawRafNow === 'number' &&
      Number.isFinite(rawRafNow) &&
      Math.abs(rawRafNow - monotonicNow) < 2000
        ? rawRafNow
        : monotonicNow;
    lastNativeRafAt = monotonicNow;
    dispatchAnimSubscribers(safeNow);
    if (animSubscribers.size > 0) {
      scheduleNativeRaf(monotonicNow);
    }
  };

  const onHeartbeatTick = () => {
    const currentNow = deps.now();

    // 1. Thực thi tất cả Timeout không bị CEF bóp nghẹt
    if (timeouts.size > 0) {
      const dueTimeouts: TimeoutEntry[] = [];
      timeouts.forEach((entry) => {
        if (currentNow >= entry.fireAt) {
          dueTimeouts.push(entry);
        }
      });
      for (const entry of dueTimeouts) {
        if (timeouts.delete(entry.id)) {
          try {
            entry.cb();
          } catch (err) {
            console.warn('[LiveLoopWakeup] Lỗi trong unthrottled timeout:', err);
          }
        }
      }
    }

    // 2. Thực thi tất cả Interval không bị CEF bóp nghẹt
    if (intervals.size > 0) {
      intervals.forEach((entry) => {
        if (currentNow >= entry.nextAt) {
          // Tránh dồn cục nhiều lần gọi nếu máy vừa ngủ dậy sau thời gian dài
          entry.nextAt = Math.max(
            currentNow + entry.intervalMs * 0.5,
            entry.nextAt + entry.intervalMs
          );
          if (entry.nextAt <= currentNow) {
            entry.nextAt = currentNow + entry.intervalMs;
          }
          try {
            entry.cb();
          } catch (err) {
            console.warn('[LiveLoopWakeup] Lỗi trong unthrottled interval:', err);
          }
        }
      });
    }

    // 3. Đánh thức vòng lặp Animation nếu requestAnimationFrame bị TikTok Live Studio / CEF treo!
    if (animSubscribers.size > 0) {
      const referenceAt =
        lastNativeRafAt > -Infinity ? lastNativeRafAt : animLoopStartedAt;
      const elapsedWithoutRaf = currentNow - referenceAt;

      if (elapsedWithoutRaf > RAF_STALL_THRESHOLD_MS) {
        dispatchAnimSubscribers(currentNow);

        // Định kỳ thử đánh thức lại rAF gốc (hủy ID cũ trước để không dồn hàng đợi callback trong CEF)
        if (currentNow - lastRafProbeAt >= RAF_REPROBE_INTERVAL_MS) {
          if (rafScheduled) {
            try {
              deps.cancelAnimFrame(rafId);
            } catch {
              // Ignore
            }
            rafScheduled = false;
          }
          scheduleNativeRaf(currentNow);
        }
      }
    }

    maybeStopEngineIfIdle();
  };

  const ensureHeartbeatRunning = () => {
    if (stopHeartbeatFn !== null) return;
    stopHeartbeatFn = deps.startHeartbeat(onHeartbeatTick, WORKER_TICK_MS);
  };

  const maybeStopEngineIfIdle = () => {
    if (hasAnyWork()) return;
    if (rafScheduled) {
      try {
        deps.cancelAnimFrame(rafId);
      } catch {
        // Ignore
      }
      rafScheduled = false;
    }
    if (stopHeartbeatFn) {
      stopHeartbeatFn();
      stopHeartbeatFn = null;
    }
  };

  const subscribeAnimationLoop = (cb: (nowMs: number) => void): (() => void) => {
    const wasEmpty = animSubscribers.size === 0;
    animSubscribers.add(cb);
    if (wasEmpty) {
      const startNow = deps.now();
      animLoopStartedAt = startNow;
      ensureHeartbeatRunning();
      scheduleNativeRaf(startNow);
    }
    return () => {
      animSubscribers.delete(cb);
      maybeStopEngineIfIdle();
    };
  };

  const setUnthrottledInterval = (
    cb: () => void,
    intervalMs: number
  ): (() => void) => {
    const safeMs = Math.max(16, intervalMs);
    const id = nextTaskId++;
    intervals.set(id, {
      id,
      cb,
      intervalMs: safeMs,
      nextAt: deps.now() + safeMs,
    });
    ensureHeartbeatRunning();
    return () => {
      intervals.delete(id);
      maybeStopEngineIfIdle();
    };
  };

  const setUnthrottledTimeout = (
    cb: () => void,
    delayMs: number
  ): (() => void) => {
    const safeMs = Math.max(0, delayMs);
    if (safeMs === 0) {
      const immediateTimer = setTimeout(() => {
        try {
          cb();
        } catch (err) {
          console.warn('[LiveLoopWakeup] Lỗi trong immediate timeout:', err);
        }
      }, 0);
      return () => clearTimeout(immediateTimer);
    }
    const id = nextTaskId++;
    timeouts.set(id, {
      id,
      cb,
      fireAt: deps.now() + safeMs,
    });
    ensureHeartbeatRunning();
    return () => {
      timeouts.delete(id);
      maybeStopEngineIfIdle();
    };
  };

  const dispose = () => {
    animSubscribers.clear();
    intervals.clear();
    timeouts.clear();
    maybeStopEngineIfIdle();
  };

  return {
    subscribeAnimationLoop,
    setUnthrottledInterval,
    setUnthrottledTimeout,
    dispose,
  };
}

let installedCefVisibilityPatch = false;

/**
 * Ngăn trình duyệt nhúng CEF của TikTok Live Studio / OBS báo trạng thái `document.hidden = true`
 * làm các thư viện giao diện / media tự tạm dừng render khi cửa sổ nguồn trình duyệt nằm khuất.
 */
export function installLiveStudioWakeupGuards(): void {
  if (installedCefVisibilityPatch || typeof document === 'undefined') return;
  installedCefVisibilityPatch = true;

  if (!isLiveStreamBrowserView()) return;

  try {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  } catch {
    // Một số trình duyệt khóa descriptor trên document -> bộ đánh thức Worker vẫn hoạt động độc lập 100%
  }

  try {
    document.addEventListener(
      'visibilitychange',
      (ev) => {
        ev.stopImmediatePropagation();
      },
      true
    );
  } catch {
    // Ignore
  }
}

installLiveStudioWakeupGuards();

const defaultScheduler = createLiveLoopScheduler();

export const subscribeAnimationLoop = defaultScheduler.subscribeAnimationLoop;
export const setUnthrottledInterval = defaultScheduler.setUnthrottledInterval;
export const setUnthrottledTimeout = defaultScheduler.setUnthrottledTimeout;
