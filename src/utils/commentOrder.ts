import type { ClassBoardQuizWinner, EnglishQuizItem, TikTokOrderMeta } from '../types/game';
import { doesCommentMatchSentence } from './sentenceScramble';

/**
 * Chuyển đổi giá trị int64/uint64 từ Protobuf (chuỗi số, number, BigInt, hoặc Long { low, high, unsigned })
 * sang chuỗi số thập phân nguyên dương chuẩn để so sánh 64-bit không mất độ chính xác.
 */
export function parseProtoInt64ToString(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;

  if (typeof val === 'bigint') {
    return val > 0n ? val.toString(10) : undefined;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val <= 0) return undefined;
    return Math.trunc(val).toString(10);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    if (/^\d+$/.test(trimmed)) {
      const stripped = trimmed.replace(/^0+/, '');
      return stripped.length > 0 ? stripped : undefined;
    }
    return undefined;
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.low === 'number' && typeof obj.high === 'number') {
      const low = BigInt(obj.low >>> 0);
      const high =
        obj.unsigned === false
          ? BigInt(obj.high | 0)
          : BigInt(obj.high >>> 0);
      const combined = (high << 32n) | low;
      return combined > 0n ? combined.toString(10) : undefined;
    }
    if (typeof (obj as { toString?: () => string }).toString === 'function') {
      const str = String(obj).trim();
      if (/^\d+$/.test(str)) {
        const stripped = str.replace(/^0+/, '');
        return stripped.length > 0 ? stripped : undefined;
      }
    }
  }

  return undefined;
}

/**
 * Chuẩn hóa createTime từ TikTok (có thể ở đơn vị giây 10 chữ số, mili-giây 13 chữ số, hoặc micro-giây 16 chữ số)
 * về đơn vị mili-giây (ms).
 */
export function normalizeTikTokCreateTimeMs(val: unknown): number | undefined {
  const digits = parseProtoInt64ToString(val);
  if (!digits) return undefined;
  const num = Number(digits);
  if (!Number.isFinite(num) || num <= 0) return undefined;

  // Unix seconds (ví dụ 1762949000 -> ~10 chữ số)
  if (num >= 1_000_000_000 && num < 100_000_000_000) {
    return Math.trunc(num * 1000);
  }
  // Unix milliseconds (ví dụ 1762949000123 -> ~13 chữ số)
  if (num >= 100_000_000_000 && num < 100_000_000_000_000) {
    return Math.trunc(num);
  }
  // Unix microseconds (~16 chữ số)
  if (num >= 100_000_000_000_000 && num < 100_000_000_000_000_000) {
    return Math.trunc(num / 1000);
  }
  return undefined;
}

/**
 * So sánh 2 chuỗi số nguyên dương lớn (Snowflake/Protobuf 64-bit msgId) mà không bị tràn số Number 53-bit.
 */
export function compareBigIntDecimalStrings(a?: string, b?: string): number {
  const cleanA = (a || '').trim().replace(/^0+/, '');
  const cleanB = (b || '').trim().replace(/^0+/, '');
  if (!cleanA && !cleanB) return 0;
  if (!cleanA) return 1;
  if (!cleanB) return -1;
  if (cleanA.length !== cleanB.length) {
    return cleanA.length < cleanB.length ? -1 : 1;
  }
  if (cleanA === cleanB) return 0;
  return cleanA < cleanB ? -1 : 1;
}

/**
 * Trích xuất bộ khóa thứ tự gốc của máy chủ TikTok từ mọi định dạng gói tin (tiktok-live-connector v1/v2, relay server.js, TikFinity).
 */
export function extractTikTokOrderMeta(
  raw: unknown,
  fallbackArrivalSeq?: number
): TikTokOrderMeta {
  if (!raw || typeof raw !== 'object') {
    return {
      arrivalSeq: fallbackArrivalSeq,
      orderTimestampMs: Date.now(),
    };
  }

  const r = raw as Record<string, any>;
  const d = r.data && typeof r.data === 'object' ? r.data : undefined;
  const innerRaw = r.raw && typeof r.raw === 'object' ? r.raw : undefined;

  const msgIdCandidate =
    r.tiktokMsgId ??
    r.common?.msgId ??
    r.msgId ??
    r.messageId ??
    r.common?.messageId ??
    d?.tiktokMsgId ??
    d?.common?.msgId ??
    d?.msgId ??
    d?.messageId ??
    innerRaw?.common?.msgId ??
    innerRaw?.msgId;

  const createTimeCandidate =
    r.tiktokCreateTimeMs ??
    r.common?.createTime ??
    r.createTime ??
    d?.tiktokCreateTimeMs ??
    d?.common?.createTime ??
    d?.createTime ??
    innerRaw?.common?.createTime ??
    innerRaw?.createTime ??
    r.timestamp ??
    d?.timestamp;

  const tiktokMsgId = parseProtoInt64ToString(msgIdCandidate);
  const tiktokCreateTimeMs = normalizeTikTokCreateTimeMs(createTimeCandidate);

  const rawServerSeq = Number(r.serverSeq ?? d?.serverSeq ?? innerRaw?.serverSeq);
  const serverSeq =
    Number.isFinite(rawServerSeq) && rawServerSeq > 0
      ? Math.trunc(rawServerSeq)
      : undefined;

  const rawArrivalSeq = Number(r.arrivalSeq ?? fallbackArrivalSeq);
  const arrivalSeq =
    Number.isFinite(rawArrivalSeq) && rawArrivalSeq > 0
      ? Math.trunc(rawArrivalSeq)
      : undefined;

  const rawOrderTs = Number(
    r.orderTimestampMs ?? r.serverReceivedAtMs ?? d?.serverReceivedAtMs
  );
  const orderTimestampMs =
    tiktokCreateTimeMs ??
    (Number.isFinite(rawOrderTs) && rawOrderTs > 0
      ? Math.trunc(rawOrderTs)
      : Date.now());

  return {
    tiktokMsgId,
    tiktokCreateTimeMs,
    serverSeq,
    arrivalSeq,
    orderTimestampMs,
  };
}

/**
 * So sánh thứ tự chuẩn xác giữa 2 người trả lời đúng:
 * 1. Người chơi thật (!isBot) luôn được ưu tiên xếp trên NPC Bot (isBot) để không bao giờ bị độ trễ luồng Live 3-6s làm mất Top tốc độ vào tay Bot.
 * 2. Nếu cả hai đều có tiktokMsgId từ máy chủ TikTok:
 *    - Nếu tiktokCreateTimeMs lệch nhau > 1500ms (vượt độ phân giải 1 giây của Unix timestamp), ưu tiên tiktokCreateTimeMs.
 *    - Trong cùng khung giây cạnh tranh sát nút, so sánh trực tiếp BigInt(tiktokMsgId) (mã tăng dần đơn điệu do máy chủ TikTok cấp).
 * 3. Nếu có tiktokCreateTimeMs -> so sánh tiktokCreateTimeMs.
 * 4. Nếu cùng nguồn server relay (serverSeq) -> so sánh serverSeq.
 * 5. Dự phòng tuần tự: orderTimestampMs -> arrivalSeq -> elapsedSec.
 */
export function compareWinnerOrder(
  a: ClassBoardQuizWinner,
  b: ClassBoardQuizWinner
): number {
  const aBot = Boolean(a.isBot);
  const bBot = Boolean(b.isBot);
  if (aBot !== bBot) {
    return aBot ? 1 : -1;
  }

  if (a.tiktokMsgId && b.tiktokMsgId) {
    if (
      typeof a.tiktokCreateTimeMs === 'number' &&
      typeof b.tiktokCreateTimeMs === 'number' &&
      Math.abs(a.tiktokCreateTimeMs - b.tiktokCreateTimeMs) > 1500
    ) {
      return a.tiktokCreateTimeMs - b.tiktokCreateTimeMs;
    }
    const msgCmp = compareBigIntDecimalStrings(a.tiktokMsgId, b.tiktokMsgId);
    if (msgCmp !== 0) return msgCmp;
  }

  if (
    typeof a.tiktokCreateTimeMs === 'number' &&
    typeof b.tiktokCreateTimeMs === 'number' &&
    a.tiktokCreateTimeMs !== b.tiktokCreateTimeMs
  ) {
    return a.tiktokCreateTimeMs - b.tiktokCreateTimeMs;
  }

  if (
    typeof a.serverSeq === 'number' &&
    typeof b.serverSeq === 'number' &&
    a.serverSeq !== b.serverSeq
  ) {
    return a.serverSeq - b.serverSeq;
  }

  if (
    typeof a.orderTimestampMs === 'number' &&
    typeof b.orderTimestampMs === 'number' &&
    a.orderTimestampMs !== b.orderTimestampMs
  ) {
    return a.orderTimestampMs - b.orderTimestampMs;
  }

  if (
    typeof a.arrivalSeq === 'number' &&
    typeof b.arrivalSeq === 'number' &&
    a.arrivalSeq !== b.arrivalSeq
  ) {
    return a.arrivalSeq - b.arrivalSeq;
  }

  if (a.elapsedSec !== b.elapsedSec) {
    return a.elapsedSec - b.elapsedSec;
  }

  return 0;
}

export interface ReRankQuizWinnersOptions {
  currentQuestion?: EnglishQuizItem | null;
  getRankPoints: (
    rankOneBased: number,
    question?: EnglishQuizItem | null
  ) => number;
  getPunishmentMultiplier?: (lowerUsername: string) => number;
}

export interface ReRankedQuizWinnersResult {
  winners: ClassBoardQuizWinner[];
  classWinners: ClassBoardQuizWinner[];
  outsideWinners: ClassBoardQuizWinner[];
}

/**
 * Khử trùng lặp theo username (giữ bản ghi có thứ tự sớm nhất), sắp xếp lại toàn bộ danh sách trả lời đúng
 * theo thứ tự chuẩn máy chủ TikTok, đồng bộ elapsedSec không bị ngược chiều hiển thị, và tính lại điểm Top 1, 2, 3...
 */
export function sortAndReRankQuizWinners(
  rawWinners: ClassBoardQuizWinner[],
  options: ReRankQuizWinnersOptions
): ReRankedQuizWinnersResult {
  const dedupMap = new Map<string, ClassBoardQuizWinner>();

  for (const item of rawWinners) {
    const cleanName = (item?.username || '').trim();
    if (!cleanName) continue;
    const lower = cleanName.toLowerCase();
    const existing = dedupMap.get(lower);
    if (!existing) {
      dedupMap.set(lower, { ...item, username: cleanName });
    } else if (compareWinnerOrder(item, existing) < 0) {
      dedupMap.set(lower, {
        ...existing,
        ...item,
        username: cleanName,
        avatarUrl: item.avatarUrl || existing.avatarUrl || null,
        avatarColor: item.avatarColor || existing.avatarColor,
        pilgrimId: item.pilgrimId ?? existing.pilgrimId,
        isSeated: item.isSeated ?? existing.isSeated,
      });
    } else {
      // Giữ nguyên thứ tự sớm hơn của existing, nhưng bổ sung thông tin hiển thị nếu thiếu
      if (!existing.avatarUrl && item.avatarUrl) {
        existing.avatarUrl = item.avatarUrl;
      }
      if (existing.pilgrimId === undefined && item.pilgrimId !== undefined) {
        existing.pilgrimId = item.pilgrimId;
      }
    }
  }

  const sorted = Array.from(dedupMap.values()).sort(compareWinnerOrder);

  // Đảm bảo elapsedSec hiển thị trên bảng điểm của người chơi thật tăng dần hợp lý theo đúng thứ tự xếp hạng
  // (tránh trường hợp gói tin Top 1 về trễ 150ms qua HTTP nên hiển thị số giây lớn hơn Top 2)
  for (let i = sorted.length - 2; i >= 0; i--) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (!cur.isBot && !next.isBot && cur.elapsedSec > next.elapsedSec) {
      sorted[i] = {
        ...cur,
        elapsedSec: Math.max(0.3, next.elapsedSec),
      };
    }
  }

  const rawStars = options.currentQuestion?.luckyStars || 0;
  const luckyMult = rawStars > 0 ? rawStars + 1 : 1;

  const classWinners: ClassBoardQuizWinner[] = [];
  const outsideWinners: ClassBoardQuizWinner[] = [];
  const updatedByLower = new Map<string, ClassBoardQuizWinner>();

  for (const w of sorted) {
    const lower = w.username.trim().toLowerCase();
    if (w.isSeated !== false) {
      const rank = classWinners.length + 1;
      const punishMult = Math.max(
        1,
        options.getPunishmentMultiplier?.(lower) || 1
      );
      const calcPts =
        options.getRankPoints(rank, options.currentQuestion) *
        punishMult *
        luckyMult;
      const enriched: ClassBoardQuizWinner = {
        ...w,
        points: calcPts,
        exp: calcPts,
      };
      classWinners.push(enriched);
      updatedByLower.set(lower, enriched);
    } else {
      const rank = outsideWinners.length + 1;
      const calcPts =
        options.getRankPoints(rank, options.currentQuestion) * luckyMult;
      const enriched: ClassBoardQuizWinner = {
        ...w,
        points: calcPts,
        exp: calcPts,
      };
      outsideWinners.push(enriched);
      updatedByLower.set(lower, enriched);
    }
  }

  const finalWinners = sorted.map(
    (w) => updatedByLower.get(w.username.trim().toLowerCase()) || w
  );

  return {
    winners: finalWinners,
    classWinners,
    outsideWinners,
  };
}

/**
 * Chọn ghế trống tất định (deterministic) theo tên người chơi & vòng/câu hiện tại để mọi Tab đồng bộ cùng 1 ghế.
 */
export function pickDeterministicSlotIndex(
  seedKey: string,
  slotCount: number
): number {
  if (slotCount <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i++) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % slotCount;
}

export const LATE_QUIZ_ANSWER_BUBBLE_TEXT = 'Không kịp giờ rồi';

/**
 * Kiểm tra bình luận có khớp từ tiếng Anh mục tiêu của câu hỏi hay không.
 */
export function doesCommentMatchQuizWord(
  rawComment: string,
  targetEn?: string | null
): boolean {
  if (!targetEn) return false;
  const trimmedTarget = targetEn.trim();
  if (!trimmedTarget) return false;

  // Nếu đáp án là câu ghép từ (>= 2 từ cách nhau bởi khoảng trắng):
  // khớp đúng thứ tự các từ, chấp nhận cả có hoặc không có dấu ? / ! (dính vào từ cuối hay cách ra đều tính)
  if (/\b[a-zA-Z0-9']+\s+[a-zA-Z0-9']+\b/.test(trimmedTarget)) {
    return doesCommentMatchSentence(rawComment, trimmedTarget);
  }

  const cleanText = (rawComment || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanText) return false;

  const targetWord = trimmedTarget
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!targetWord) return false;

  const words = cleanText.split(' ');
  return (
    words.includes(targetWord) ||
    cleanText === targetWord ||
    (targetWord === 'fridge' && words.includes('refrigerator'))
  );
}

export interface ExpiredQuizWindowSnapshot {
  en: string;
  winnerLowerSet: ReadonlySet<string>;
  expiredAtMs: number;
}

export interface LateQuizAnswerCheckParams {
  rawComment: string;
  lowerUser: string;
  isBot: boolean;
  showClassBoardBox?: boolean;
  activeEngine?: string;
  isZombieActive?: boolean;
  boardPhase?: string;
  currentQuestionEn?: string | null;
  currentWinnerLowers?: Iterable<string>;
  lastExpiredWindow?: ExpiredQuizWindowSnapshot | null;
  nowMs?: number;
}

/**
 * Xác định xem bình luận của người chơi có phải là đáp án ĐÚNG nhưng gửi MUỘN
 * (sau khi đã hết thời gian trả lời + hết cả 2s bù trễ ASKING_POST_ZERO_GRACE_MS)
 * nên bị tính là sai hay không.
 */
export function isLateCorrectQuizAnswerPure(
  params: LateQuizAnswerCheckParams
): boolean {
  if (params.isBot) return false;
  if (params.showClassBoardBox === false) return false;
  if (params.isZombieActive) return false;

  const engine = params.activeEngine || 'english_quiz';
  if (engine !== 'english_quiz' && engine !== 'result_board') {
    return false;
  }

  const phase = params.boardPhase || '';
  // Trong suốt thời gian hỏi bài (kể cả 2s bù trễ sau 0s), phase vẫn là 'asking' và câu trả lời được tính ĐÚNG
  if (!phase || phase === 'asking') {
    return false;
  }

  const lower = (params.lowerUser || '').trim().toLowerCase();
  if (!lower) return false;

  const isPostAskingSameQuestion =
    phase === 'answer_flash' ||
    phase === 'result_summary' ||
    phase === 'ranking_board' ||
    phase === 'reveal' ||
    phase === 'record_notice' ||
    phase === 'punishment_notice' ||
    phase === 'round_end';

  if (isPostAskingSameQuestion) {
    const targetEn =
      (params.currentQuestionEn || '').trim() ||
      (params.lastExpiredWindow?.en || '').trim();
    if (!doesCommentMatchQuizWord(params.rawComment, targetEn)) {
      return false;
    }

    if (params.currentWinnerLowers) {
      for (const w of params.currentWinnerLowers) {
        if (w.trim().toLowerCase() === lower) {
          return false;
        }
      }
    }
    if (
      params.lastExpiredWindow &&
      params.lastExpiredWindow.en.trim().toLowerCase() ===
        targetEn.toLowerCase() &&
      params.lastExpiredWindow.winnerLowerSet.has(lower)
    ) {
      return false;
    }

    return true;
  }

  // Trường hợp bình luận trễ vừa rơi sang vài giây đầu của luồng chuẩn bị câu mới ('preparing' / 'lesson_start')
  if (
    (phase === 'preparing' || phase === 'lesson_start') &&
    params.lastExpiredWindow
  ) {
    const now = params.nowMs ?? Date.now();
    if (now - params.lastExpiredWindow.expiredAtMs <= 30_000) {
      if (params.lastExpiredWindow.winnerLowerSet.has(lower)) {
        return false;
      }
      return doesCommentMatchQuizWord(
        params.rawComment,
        params.lastExpiredWindow.en
      );
    }
  }

  return false;
}
