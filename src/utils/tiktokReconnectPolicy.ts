/**
 * Chính sách Bảo Vệ Hạn Mức Kết Nối TikTok Live (4 Chốt Chống Đốt Lượt EulerStream):
 *
 * 1. Chốt Offline / Kết thúc Live (`offline_or_ended`):
 *    - Khi kênh chưa bật Live (`UserOfflineError`, `not live`, `offline`), sai ID kênh, hoặc chủ phòng đã tắt Live (`streamEnd`):
 *    -> DỪNG NGAY LẬP TỨC, tuyệt đối không tự gọi kết nối lại.
 *
 * 2. Chốt Giới hạn lượt / Xác thực (`rate_limit_or_auth`):
 *    - Khi chạm trần lượt miễn phí (`SignatureRateLimitError`, `429`, `rate limit`, `too many requests`, `quota`)
 *      hoặc sai API Key (`401`, `403`, `invalid api key`):
 *    -> DỪNG NGAY LẬP TỨC để không gõ bồi làm khóa IP lâu hơn.
 *
 * 3. Chốt Giãn Nhịp Thông Minh (`transient_network`):
 *    - Chỉ khi đang Live thật sự mà rớt mạng giữa chừng hoặc lỗi mạng tạm thời mới tự nối lại
 *      theo chu kỳ giãn dần: 8s -> 20s -> 45s -> 90s (tối đa 4 lần thử liên tiếp, vào lại được phòng sẽ reset bộ đếm về 0).
 *
 * 4. Chốt Cấu Hình EulerStream API Key (`applyEulerSignConfig`):
 *    - Tự động nạp khóa riêng từ biến môi trường / `.env` / `euler_key.txt` vào `SignConfig.apiKey`
 *      và xóa `SignConfig.cachedInstance` để có hiệu lực tức thì.
 */

export type TikTokFailureCategory =
  | 'stream_ended'
  | 'offline_or_not_found'
  | 'rate_limit'
  | 'auth_key_error'
  | 'transient_error';

export interface TikTokFailureClassification {
  category: TikTokFailureCategory;
  shouldAutoReconnect: boolean;
  userMessageVi: string;
}

export interface TikTokReconnectPlan {
  shouldReconnect: boolean;
  delayMs: number;
  nextAttempt: number;
  reasonVi: string;
}

export const TIKTOK_BACKOFF_SCHEDULE_MS: readonly number[] = [
  8_000,
  20_000,
  45_000,
  90_000,
];

export const MAX_TIKTOK_AUTO_RECONNECTS = TIKTOK_BACKOFF_SCHEDULE_MS.length;

export function extractRawTikTokErrorString(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as Record<string, any>;
    const parts = [
      e.name,
      e.constructor?.name,
      e.code,
      e.status,
      e.statusCode,
      e.response?.status,
      e.message,
      e.info,
      e.exception?.message,
      Array.isArray(e.errors)
        ? e.errors.map((x: any) => x?.message || String(x)).join(' | ')
        : '',
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
  }
  return String(err);
}

export function classifyTikTokError(err: unknown): TikTokFailureClassification {
  const raw = extractRawTikTokErrorString(err);
  const lower = raw.toLowerCase();

  // Chốt 2A: Chạm giới hạn lượt kết nối (Rate Limit / 429 / Quota)
  if (
    lower.includes('signatureratelimiterror') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('ratelimit') ||
    lower.includes('too many requests') ||
    /\b429\b/.test(lower) ||
    lower.includes('quota') ||
    lower.includes('limit reached') ||
    lower.includes('daily limit') ||
    lower.includes('hourly limit') ||
    lower.includes('max requests')
  ) {
    return {
      category: 'rate_limit',
      shouldAutoReconnect: false,
      userMessageVi:
        '🛑 Đã chạm giới hạn lượt kết nối EulerStream (429 Rate Limit). Hệ thống ĐÃ DỪNG tự kết nối lại để bảo vệ IP/Key!',
    };
  }

  // Chốt 2B: Lỗi khóa Euler API Key không hợp lệ (401 / 403)
  if (
    lower.includes('invalid api key') ||
    lower.includes('api key is invalid') ||
    lower.includes('unauthorized') ||
    /\b401\b/.test(lower) ||
    (lower.includes('signapierror') && /\b403\b/.test(lower))
  ) {
    return {
      category: 'auth_key_error',
      shouldAutoReconnect: false,
      userMessageVi:
        '🔑 Mã EULER_API_KEY không hợp lệ hoặc đã hết hạn (401/403). Đã dừng tự động thử lại — vui lòng kiểm tra lại khóa trong .env!',
    };
  }

  // Chốt 1: Kênh chưa bật Live (Offline), đã tắt Live, hoặc sai ID kênh
  if (
    lower.includes('userofflineerror') ||
    lower.includes('invaliduniqueiderror') ||
    lower.includes('offline') ||
    lower.includes('not live') ||
    lower.includes("isn't live") ||
    lower.includes('is not currently live') ||
    lower.includes('live has ended') ||
    lower.includes('stream has ended') ||
    lower.includes('room_not_found') ||
    lower.includes('user_not_found') ||
    lower.includes('failed to retrieve room_id') ||
    lower.includes('not found')
  ) {
    return {
      category: 'offline_or_not_found',
      shouldAutoReconnect: false,
      userMessageVi:
        '⏹️ Kênh hiện chưa bật Live (Offline) hoặc sai ID. Hệ thống tự dừng chờ để KHÔNG tốn lượt kết nối miễn phí!',
    };
  }

  // Còn lại: Lỗi mạng tạm thời -> cho phép giãn nhịp Backoff có trần
  return {
    category: 'transient_error',
    shouldAutoReconnect: true,
    userMessageVi: raw || 'Gián đoạn kết nối mạng tạm thời',
  };
}

export function computeTikTokReconnectPlan(params: {
  currentAttempt: number;
  manualDisconnect?: boolean;
  streamEndedByHost?: boolean;
  error?: unknown;
}): TikTokReconnectPlan {
  if (params.manualDisconnect) {
    return {
      shouldReconnect: false,
      delayMs: 0,
      nextAttempt: params.currentAttempt,
      reasonVi: '⏹️ Người dùng đã chủ động ngắt kết nối.',
    };
  }

  if (params.streamEndedByHost) {
    return {
      shouldReconnect: false,
      delayMs: 0,
      nextAttempt: params.currentAttempt,
      reasonVi:
        '⏹️ Phiên Live đã kết thúc (streamEnd) — Đã dừng tự động kết nối lại để bảo vệ lượt miễn phí.',
    };
  }

  if (params.error !== undefined) {
    const classified = classifyTikTokError(params.error);
    if (!classified.shouldAutoReconnect) {
      return {
        shouldReconnect: false,
        delayMs: 0,
        nextAttempt: params.currentAttempt,
        reasonVi: classified.userMessageVi,
      };
    }
  }

  if (params.currentAttempt >= MAX_TIKTOK_AUTO_RECONNECTS) {
    return {
      shouldReconnect: false,
      delayMs: 0,
      nextAttempt: params.currentAttempt,
      reasonVi: `🛑 Đã thử tự kết nối lại tối đa ${MAX_TIKTOK_AUTO_RECONNECTS} lần không thành công — Tạm dừng để bảo vệ hạn mức EulerStream. Hãy bấm "Kết nối Live" khi mạng ổn định!`,
    };
  }

  const delayMs =
    TIKTOK_BACKOFF_SCHEDULE_MS[params.currentAttempt] ??
    TIKTOK_BACKOFF_SCHEDULE_MS[TIKTOK_BACKOFF_SCHEDULE_MS.length - 1];
  const nextAttempt = params.currentAttempt + 1;

  return {
    shouldReconnect: true,
    delayMs,
    nextAttempt,
    reasonVi: `🔄 Mất kết nối tạm thời — Tự thử lại lần ${nextAttempt}/${MAX_TIKTOK_AUTO_RECONNECTS} sau ${Math.round(
      delayMs / 1000
    )} giây...`,
  };
}

export function applyEulerSignConfig(
  tiktokPkg: Record<string, any>,
  rawApiKey?: string | null
): boolean {
  const cleanKey = String(rawApiKey || '').trim();
  const signCfg = tiktokPkg?.SignConfig || tiktokPkg?.default?.SignConfig;
  if (signCfg && typeof signCfg === 'object') {
    const prevKey = signCfg.apiKey || undefined;
    const nextKey = cleanKey || undefined;
    if (prevKey !== nextKey) {
      signCfg.apiKey = nextKey;
      if ('cachedInstance' in signCfg) {
        signCfg.cachedInstance = undefined;
      }
    }
  }
  return Boolean(cleanKey);
}
