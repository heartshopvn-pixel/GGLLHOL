export interface GoogleWarmMirrorCandidate {
  id: string;
  label: string;
  url: string;
  isSwitched: boolean;
}

/**
 * Chuẩn hóa đoạn văn bản ngắn gửi tới luồng Google Warm TTS
 */
export function normalizeGoogleWarmTextChunk(
  rawText: string,
  maxChars = 180
): string {
  return String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(10, maxChars));
}

/**
 * Danh sách các luồng stream trực tiếp trên trình duyệt cho giọng Google Warm
 * (Khác cụm máy chủ để khi 1 cụm bị nghẽn/429 thì tự động nhảy sang cụm tiếp theo)
 */
export function buildGoogleWarmDirectMirrorUrls(
  rawText: string,
  maxChars = 180
): GoogleWarmMirrorCandidate[] {
  const shortChunk = normalizeGoogleWarmTextChunk(rawText, maxChars);
  if (!shortChunk) return [];
  const encoded = encodeURIComponent(shortChunk);
  return [
    {
      id: 'direct-googleapis-twob',
      label: 'Google Warm (Stream #1)',
      url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`,
      isSwitched: false,
    },
    {
      id: 'direct-clients5-chrome',
      label: 'Google Warm (Mirror #2)',
      url: `https://clients5.google.com/translate_tts?ie=UTF-8&tl=vi&client=dict-chrome-ex&q=${encoded}`,
      isSwitched: true,
    },
  ];
}

/**
 * Danh sách các máy chủ Google TTS cho proxy phía Server (/api/tts & local :8080)
 */
export function buildServerGoogleWarmMirrorUrls(
  rawSegment: string
): GoogleWarmMirrorCandidate[] {
  const clean = normalizeGoogleWarmTextChunk(rawSegment, 180);
  if (!clean) return [];
  const encoded = encodeURIComponent(clean);
  return [
    {
      id: 'google-gtx',
      label: 'Google Warm (GTX Primary)',
      url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&ttsspeed=1&q=${encoded}`,
      isSwitched: false,
    },
    {
      id: 'google-clients5',
      label: 'Google Warm (Clients5 Mirror)',
      url: `https://clients5.google.com/translate_tts?ie=UTF-8&tl=vi&client=dict-chrome-ex&q=${encoded}`,
      isSwitched: true,
    },
    {
      id: 'google-tw-ob',
      label: 'Google Warm (TW-OB Mirror)',
      url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`,
      isSwitched: true,
    },
    {
      id: 'google-vn',
      label: 'Google Warm (VN Mirror)',
      url: `https://translate.google.com.vn/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`,
      isSwitched: true,
    },
  ];
}

/**
 * Tính toán độ trầm (pitch) tự nhiên khi Google Warm chuyển dự phòng sang Web Speech Tiếng Việt:
 * - Nếu là giọng Nam Thầy Cá (forceMaleWarmFilter): giữ tông trầm ấm nam tính (~0.78 - 0.88).
 * - Nếu là giọng Cô Thảo / sự kiện chung: ánh xạ từ hệ số Google Warm (mặc định 0.88) sang tông ấm tự nhiên trên giọng hệ thống (0.94 - 1.04).
 */
export function resolveGoogleWarmWebSpeechFallbackPitch(
  configuredWarmPitch: number | undefined,
  forceMaleWarmFilter = false
): number {
  const basePitch = Number.isFinite(configuredWarmPitch)
    ? Number(configuredWarmPitch)
    : forceMaleWarmFilter
    ? 0.84
    : 0.88;

  if (forceMaleWarmFilter) {
    return Math.max(0.75, Math.min(0.9, Number(basePitch.toFixed(2))));
  }

  const mapped = Math.max(0.9, Math.min(1.06, basePitch + 0.08));
  return Number(mapped.toFixed(2));
}

export interface SequentialFallbackStep<T> {
  name: string;
  run: () => Promise<T | null | undefined>;
}

export interface SequentialFallbackResult<T> {
  value: T | null;
  usedStepIndex: number;
  usedStepName: string | null;
  failedSteps: Array<{ name: string; reason: string }>;
}

/**
 * Chạy tuần tự chuỗi nguồn phát TTS (Primary -> Mirror -> Fallback):
 * - Dừng ngay khi một nguồn thành công.
 * - Ghi nhận chi tiết các nguồn bị lỗi trước đó để phục vụ chẩn đoán trạng thái.
 */
export async function runSequentialFallbackChain<T>(
  steps: SequentialFallbackStep<T>[],
  shouldAbort?: () => boolean
): Promise<SequentialFallbackResult<T>> {
  const failedSteps: Array<{ name: string; reason: string }> = [];

  for (let i = 0; i < steps.length; i++) {
    if (shouldAbort?.()) {
      return {
        value: null,
        usedStepIndex: -1,
        usedStepName: null,
        failedSteps,
      };
    }

    const step = steps[i];
    try {
      const result = await step.run();
      if (shouldAbort?.()) {
        return {
          value: null,
          usedStepIndex: -1,
          usedStepName: null,
          failedSteps,
        };
      }
      if (result !== null && result !== undefined) {
        return {
          value: result,
          usedStepIndex: i,
          usedStepName: step.name,
          failedSteps,
        };
      }
      failedSteps.push({ name: step.name, reason: 'empty_result' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || 'error');
      failedSteps.push({ name: step.name, reason: msg });
    }
  }

  return {
    value: null,
    usedStepIndex: -1,
    usedStepName: null,
    failedSteps,
  };
}
