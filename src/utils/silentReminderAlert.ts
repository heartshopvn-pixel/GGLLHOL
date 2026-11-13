export const DEFAULT_REMINDER_ALERT_URL =
  'https://heartshopvn-pixel.github.io/Focus-Reminder/?ring=2';

export const DEFAULT_REMINDER_ALERT_COOLDOWN_SEC = 180;

export const DEFAULT_REMINDER_ALERT_KEYWORDS: string[] = [
  'game đứng',
  'đứng hình',
  'lag',
  'bị đơ',
  'treo game',
  'mất tiếng',
];

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseReminderKeywordsInput(rawInput: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of rawInput.split(/[,;\n]+/)) {
    const cleaned = part.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(cleaned);
  }
  return out;
}

/**
 * Quét bình luận của người xem tìm cụm từ khóa cảnh báo (theo ranh giới từ Unicode,
 * tránh bắt nhầm từ vựng tiếng Anh như "flag" hay "village" khi từ khóa là "lag").
 */
export function matchReminderAlertKeyword(
  comment: string,
  keywords: string[]
): string | null {
  const normalizedComment = normalizeText(comment || '');
  if (!normalizedComment || !Array.isArray(keywords) || keywords.length === 0) {
    return null;
  }

  for (const rawKw of keywords) {
    const kw = normalizeText(rawKw || '');
    if (!kw) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(kw)}(?![\\p{L}\\p{N}])`,
      'u'
    );
    if (pattern.test(normalizedComment)) {
      return rawKw.trim();
    }
  }
  return null;
}

export function buildCacheBustedReminderUrl(
  rawUrl?: string,
  nowMs = Date.now()
): string | null {
  const target = (rawUrl || DEFAULT_REMINDER_ALERT_URL).trim();
  if (!target) return null;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.searchParams.set('_ts', String(nowMs));
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Mở ngầm link cảnh báo bằng 1 khung <iframe> ẩn 0x0 bên ngoài khung nhìn (không mở tab mới,
 * không làm giật hay chuyển hướng link game đang chạy, tương thích cả Chrome và TikTok Live Studio).
 */
export function triggerSilentReminderUrl(rawUrl?: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const finalUrl = buildCacheBustedReminderUrl(rawUrl, Date.now());
  if (!finalUrl) return false;

  try {
    const iframe = document.createElement('iframe');
    iframe.src = finalUrl;
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px;visibility:hidden;';
    document.body.appendChild(iframe);

    window.setTimeout(() => {
      try {
        iframe.src = 'about:blank';
        iframe.remove();
      } catch {
        // Ignore cleanup errors
      }
    }, 12000);

    return true;
  } catch {
    return false;
  }
}
