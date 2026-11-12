import { EnglishQuizItem, GameConfig, QuizDifficultyLevel } from '../types/game';

export const QUIZ_DECKS_IDB_KEY = 'classroom_quiz_decks_v1';
export const QUIZ_QUEUE_IDB_KEY = 'classroom_quiz_queue_v1';

export const LOCAL_STORAGE_QUEUE_WINDOW = 30;
export const LIVE_SYNC_QUEUE_WINDOW = 30;
export const RECENT_ASKED_RING_LIMIT = 400;

export interface QuizDeckRecord {
  id: string;
  name: string;
  level?: QuizDifficultyLevel;
  questions: EnglishQuizItem[];
}

const LEADING_NUMBER_RE = /^\d+[.)]\s*/;
const NON_ALPHA_EN_RE = /[^A-Z]/g;
const VIETNAMESE_DIACRITICS_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function splitQuizLineColumns(line: string): [string, string, string | undefined] | null {
  let dIdx = line.indexOf('|');
  let dLen = 1;

  if (dIdx < 0) {
    dIdx = line.indexOf('\t');
  }
  if (dIdx < 0) {
    dIdx = line.indexOf(':');
  }
  if (dIdx < 0) {
    dIdx = line.indexOf('=');
  }
  if (dIdx < 0) {
    dIdx = line.indexOf(';');
  }
  if (dIdx < 0) {
    dIdx = line.indexOf(' - ');
    if (dIdx >= 0) dLen = 3;
  }
  if (dIdx < 0) {
    dIdx = line.indexOf('-');
  }
  if (dIdx < 0) {
    dIdx = line.indexOf(',');
  }

  if (dIdx <= 0) return null;

  const col0 = line.slice(0, dIdx);
  const rest = line.slice(dIdx + dLen);
  if (!rest) return null;

  // Optional 3rd column (phonetic) when using '|' or '\t'
  let col1 = rest;
  let col2: string | undefined;
  const sepChar = line[dIdx];
  if (sepChar === '|' || sepChar === '\t') {
    const secondIdx = rest.indexOf(sepChar);
    if (secondIdx >= 0) {
      col1 = rest.slice(0, secondIdx);
      const third = rest.slice(secondIdx + 1).trim();
      if (third) col2 = third;
    }
  }

  return [col0, col1, col2];
}

function parseSingleQuizLine(
  rawLine: string,
  seenKeys: Set<string>,
  idPrefix: string,
  idx: number,
  deckName?: string,
  quizLevel?: QuizDifficultyLevel
): EnglishQuizItem | null {
  const line = rawLine.trim();
  if (!line) return null;
  const firstCode = line.charCodeAt(0);
  // '#' = 35, '//' = 47,47
  if (firstCode === 35 || (firstCode === 47 && line.charCodeAt(1) === 47)) {
    return null;
  }

  const cols = splitQuizLineColumns(line);
  if (!cols) return null;

  const [rawCol0, rawCol1, phonetic] = cols;
  let vi: string;
  let en: string;

  if (!VIETNAMESE_DIACRITICS_RE.test(rawCol0) && VIETNAMESE_DIACRITICS_RE.test(rawCol1)) {
    vi = rawCol1.trim();
    en = rawCol0.replace(LEADING_NUMBER_RE, '').trim().toUpperCase().replace(NON_ALPHA_EN_RE, '');
  } else {
    vi = rawCol0.replace(LEADING_NUMBER_RE, '').trim();
    en = rawCol1.trim().toUpperCase().replace(NON_ALPHA_EN_RE, '');
  }

  if (!vi || en.length < 2) return null;

  const dedupKey = `${vi.toLowerCase()}__${en}`;
  if (seenKeys.has(dedupKey)) return null;
  seenKeys.add(dedupKey);

  const item: EnglishQuizItem = {
    id: `${idPrefix}-${idx}`,
    vi,
    en,
  };
  if (phonetic) item.phonetic = phonetic;
  if (deckName) item.deckName = deckName;
  if (quizLevel) item.quizLevel = quizLevel;
  return item;
}

export interface ParseQuizTxtOptions {
  idPrefix?: string;
  deckName?: string;
  quizLevel?: QuizDifficultyLevel;
  chunkLines?: number;
  onProgress?: (parsedCount: number) => void;
}

/**
 * Đọc cực nhanh file .txt (hàng nghìn - hàng chục nghìn dòng) không cấp phát mảng split khổng lồ.
 */
export function parseLargeQuizTxtFast(
  rawText: string,
  options?: ParseQuizTxtOptions
): EnglishQuizItem[] {
  if (!rawText) return [];
  const totalLen = rawText.length;
  if (totalLen === 0) return [];

  const idPrefix = options?.idPrefix || `txt-${Date.now()}`;
  const deckName = options?.deckName;
  const quizLevel = options?.quizLevel;
  const parsed: EnglishQuizItem[] = [];
  const seenKeys = new Set<string>();

  let pos = 0;
  let lineIdx = 0;
  while (pos < totalLen) {
    let nextNl = rawText.indexOf('\n', pos);
    if (nextNl < 0) nextNl = totalLen;
    let end = nextNl;
    if (end > pos && rawText.charCodeAt(end - 1) === 13) {
      end--;
    }
    if (end > pos) {
      const item = parseSingleQuizLine(
        rawText.slice(pos, end),
        seenKeys,
        idPrefix,
        lineIdx,
        deckName,
        quizLevel
      );
      if (item) parsed.push(item);
    }
    pos = nextNl + 1;
    lineIdx++;
  }

  return parsed;
}

/**
 * Đọc bất đồng bộ theo từng chunk (mặc định 4000 dòng / nhịp) để khi nạp file 5.000 - 50.000 câu
 * luồng chính 60Hz/120Hz của Canvas và UI không bao giờ bị khựng dù chỉ 1 khung hình.
 */
export async function parseLargeQuizTxtChunked(
  rawText: string,
  options?: ParseQuizTxtOptions
): Promise<EnglishQuizItem[]> {
  if (!rawText) return [];
  const totalLen = rawText.length;
  if (totalLen === 0) return [];

  const idPrefix = options?.idPrefix || `txt-${Date.now()}`;
  const deckName = options?.deckName;
  const quizLevel = options?.quizLevel;
  const chunkLines = Math.max(500, options?.chunkLines ?? 4000);
  const parsed: EnglishQuizItem[] = [];
  const seenKeys = new Set<string>();

  let pos = 0;
  let lineIdx = 0;
  let linesInSlice = 0;

  while (pos < totalLen) {
    let nextNl = rawText.indexOf('\n', pos);
    if (nextNl < 0) nextNl = totalLen;
    let end = nextNl;
    if (end > pos && rawText.charCodeAt(end - 1) === 13) {
      end--;
    }
    if (end > pos) {
      const item = parseSingleQuizLine(
        rawText.slice(pos, end),
        seenKeys,
        idPrefix,
        lineIdx,
        deckName,
        quizLevel
      );
      if (item) parsed.push(item);
    }
    pos = nextNl + 1;
    lineIdx++;
    linesInSlice++;

    if (linesInSlice >= chunkLines && pos < totalLen) {
      linesInSlice = 0;
      options?.onProgress?.(parsed.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  options?.onProgress?.(parsed.length);
  return parsed;
}

const deckListCache = new WeakMap<QuizDeckRecord[], QuizDeckRecord[]>();
const deckQuestionsCache = new WeakMap<
  EnglishQuizItem[],
  { deckName: string; level: QuizDifficultyLevel; normalized: EnglishQuizItem[] }
>();

/**
 * Chuẩn hóa danh sách bộ đề với bộ nhớ đệm WeakMap O(1):
 * Không bao giờ nhân bản lại mảng hàng chục nghìn câu hỏi trên mỗi lần re-render.
 */
export function normalizeQuizDecksFast(
  existingDecks: QuizDeckRecord[] | undefined,
  builtInDecks: QuizDeckRecord[],
  normalizeDeckNameFn: (rawName: string) => {
    deckName: string;
    deckKey: string;
    level: QuizDifficultyLevel;
  },
  forceReset = false
): QuizDeckRecord[] {
  if (forceReset || !Array.isArray(existingDecks) || existingDecks.length === 0) {
    return builtInDecks.map((d) => ({
      ...d,
      questions: d.questions,
    }));
  }

  const cachedList = deckListCache.get(existingDecks);
  if (cachedList) {
    return cachedList;
  }

  const validDecks: QuizDeckRecord[] = [];
  for (let i = 0; i < existingDecks.length; i++) {
    const d = existingDecks[i];
    if (!d || !Array.isArray(d.questions) || d.questions.length === 0) continue;

    const norm = normalizeDeckNameFn(d.name);
    const resolvedLevel = d.level || norm.level;

    let normalizedQuestions: EnglishQuizItem[];
    const cachedQ = deckQuestionsCache.get(d.questions);
    if (
      cachedQ &&
      cachedQ.deckName === norm.deckName &&
      cachedQ.level === resolvedLevel
    ) {
      normalizedQuestions = cachedQ.normalized;
    } else {
      // Kiểm tra nhanh nếu tất cả câu đã có đúng deckName & quizLevel thì tái sử dụng trực tiếp mảng gốc
      let alreadyNormalized = true;
      for (let qIdx = 0; qIdx < d.questions.length; qIdx++) {
        const q = d.questions[qIdx];
        if (!q || q.deckName !== norm.deckName || !q.quizLevel) {
          alreadyNormalized = false;
          break;
        }
      }

      if (alreadyNormalized) {
        normalizedQuestions = d.questions;
      } else {
        normalizedQuestions = new Array<EnglishQuizItem>(d.questions.length);
        for (let qIdx = 0; qIdx < d.questions.length; qIdx++) {
          const q = d.questions[qIdx];
          normalizedQuestions[qIdx] = {
            ...q,
            deckName: norm.deckName,
            quizLevel: q.quizLevel || resolvedLevel,
          };
        }
      }

      deckQuestionsCache.set(d.questions, {
        deckName: norm.deckName,
        level: resolvedLevel,
        normalized: normalizedQuestions,
      });
      if (normalizedQuestions !== d.questions) {
        deckQuestionsCache.set(normalizedQuestions, {
          deckName: norm.deckName,
          level: resolvedLevel,
          normalized: normalizedQuestions,
        });
      }
    }

    validDecks.push({
      ...d,
      name: norm.deckName,
      level: resolvedLevel,
      questions: normalizedQuestions,
    });
  }

  if (validDecks.length === 0) {
    return builtInDecks.map((d) => ({
      ...d,
      questions: d.questions,
    }));
  }

  deckListCache.set(existingDecks, validDecks);
  deckListCache.set(validDecks, validDecks);
  return validDecks;
}

/**
 * Lấy ngẫu nhiên k câu hỏi từ kho N câu với độ phức tạp O(k) (Zero-Clone, không shuffle toàn mảng).
 * Hỗ trợ tránh lặp từ đã hỏi gần đây qua recentUsedEnLower.
 */
export function sampleQuestionsFast(
  pool: EnglishQuizItem[],
  count: number,
  usedEnLower: Set<string>,
  deckLabel: string,
  quizLevel: QuizDifficultyLevel,
  recentUsedEnLower?: ReadonlySet<string>
): EnglishQuizItem[] {
  const poolLen = Array.isArray(pool) ? pool.length : 0;
  if (poolLen === 0 || count <= 0) return [];

  const picked: EnglishQuizItem[] = [];
  const pickedIndices = new Set<number>();

  const tryAcceptItem = (idx: number, checkRecent: boolean): boolean => {
    if (pickedIndices.has(idx)) return false;
    const item = pool[idx];
    if (!item || !item.en) return false;
    const enLower = item.en.trim().toLowerCase();
    if (!enLower || usedEnLower.has(enLower)) return false;
    if (checkRecent && recentUsedEnLower && recentUsedEnLower.has(enLower)) {
      return false;
    }
    pickedIndices.add(idx);
    usedEnLower.add(enLower);
    picked.push({
      ...item,
      deckName: deckLabel,
      quizLevel,
    });
    return true;
  };

  // Pha 1: Random index probing O(k) - cực nhanh khi kho có hàng trăm đến hàng chục nghìn câu
  const maxRandomProbes = Math.min(poolLen * 2, Math.max(48, count * 24));
  const hasRecentSet = Boolean(recentUsedEnLower && recentUsedEnLower.size > 0);
  for (let probe = 0; probe < maxRandomProbes && picked.length < count; probe++) {
    const rndIdx = Math.floor(Math.random() * poolLen);
    tryAcceptItem(rndIdx, hasRecentSet);
  }

  // Pha 2: Nếu kho nhỏ hoặc gần hết từ mới chưa nằm trong recentUsedEnLower, quét vòng từ vị trí ngẫu nhiên
  if (picked.length < count && hasRecentSet) {
    const startOffset = Math.floor(Math.random() * poolLen);
    for (let step = 0; step < poolLen && picked.length < count; step++) {
      tryAcceptItem((startOffset + step) % poolLen, true);
    }
  }

  // Pha 3: Nới lỏng recentUsedEnLower (chỉ cần không trùng trong cùng vòng 10 câu hiện tại)
  if (picked.length < count) {
    for (let probe = 0; probe < maxRandomProbes && picked.length < count; probe++) {
      const rndIdx = Math.floor(Math.random() * poolLen);
      tryAcceptItem(rndIdx, false);
    }
  }
  if (picked.length < count) {
    const startOffset = Math.floor(Math.random() * poolLen);
    for (let step = 0; step < poolLen && picked.length < count; step++) {
      tryAcceptItem((startOffset + step) % poolLen, false);
    }
  }

  // Pha 4: Trường hợp bộ đề tự tạo siêu nhỏ (ít từ hơn count, ví dụ đề chỉ có 2 câu nhưng cần 6 câu)
  if (picked.length < count) {
    let cursor = Math.floor(Math.random() * poolLen);
    while (picked.length < count) {
      const item = pool[cursor % poolLen];
      cursor++;
      if (!item || !item.en) break;
      usedEnLower.add(item.en.trim().toLowerCase());
      picked.push({
        ...item,
        deckName: deckLabel,
        quizLevel,
      });
    }
  }

  return picked;
}

/**
 * Lưu từ vừa hỏi vào bộ đệm vòng (Ring Buffer Set) để không lặp lại câu hỏi qua nhiều hiệp liên tiếp.
 */
export function recordRecentAskedWord(
  ringSet: Set<string>,
  word: string | undefined | null,
  maxSize = RECENT_ASKED_RING_LIMIT
): void {
  if (!word) return;
  const clean = word.trim().toLowerCase();
  if (!clean) return;
  if (ringSet.has(clean)) {
    ringSet.delete(clean);
  }
  ringSet.add(clean);
  while (ringSet.size > maxSize) {
    const oldest = ringSet.values().next().value;
    if (oldest === undefined) break;
    ringSet.delete(oldest);
  }
}

export interface PrepareEnqueuedOptions {
  deckName: string;
  quizLevel?: QuizDifficultyLevel;
  shuffle?: boolean;
  ratio1?: number;
  ratio2?: number;
  ratio3?: number;
  nowMs?: number;
}

/**
 * Chuẩn bị danh sách câu hỏi nạp vào hàng chờ chỉ trong 1 lượt cấp phát duy nhất (Single-pass),
 * hỗ trợ xáo trộn Fisher-Yates tại chỗ và gán Sao May Mắn cho bộ đề hàng nghìn câu tức thì.
 */
export function prepareEnqueuedQuestions(
  source: EnglishQuizItem[],
  opts: PrepareEnqueuedOptions
): EnglishQuizItem[] {
  const len = Array.isArray(source) ? source.length : 0;
  if (len === 0) return [];

  const r1 = Math.max(0, Math.min(100, opts.ratio1 ?? 15));
  const r2 = Math.max(0, Math.min(100, opts.ratio2 ?? 10));
  const r3 = Math.max(0, Math.min(100, opts.ratio3 ?? 5));
  const ts = opts.nowMs ?? Date.now();
  const out = new Array<EnglishQuizItem>(len);

  for (let i = 0; i < len; i++) {
    const src = source[i];
    let stars: 0 | 1 | 2 | 3 = 0;
    if (typeof src.luckyStars === 'number') {
      stars = src.luckyStars;
    } else {
      const rnd = Math.random() * 100;
      if (rnd < r3) stars = 3;
      else if (rnd < r3 + r2) stars = 2;
      else if (rnd < r3 + r2 + r1) stars = 1;
    }

    out[i] = {
      ...src,
      id: `en-${ts}-${i}`,
      deckName: opts.deckName,
      quizLevel: src.quizLevel || opts.quizLevel,
      luckyStars: stars,
    };
  }

  if (opts.shuffle) {
    for (let i = len - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
  }

  return out;
}

/**
 * Tách kho đề nặng (quizDecks) và giới hạn cửa sổ hàng chờ (customQuizQuestions <= 30 câu)
 * trước khi ghi vào localStorage & snapshot chung để không bao giờ nghẽn JSON.stringify hoặc tràn 5MB Quota.
 */
export function stripHeavyQuizDataForLocalStorage(config: GameConfig): GameConfig {
  const cappedQueue = Array.isArray(config.customQuizQuestions)
    ? config.customQuizQuestions.length > LOCAL_STORAGE_QUEUE_WINDOW
      ? config.customQuizQuestions.slice(0, LOCAL_STORAGE_QUEUE_WINDOW)
      : config.customQuizQuestions
    : config.customQuizQuestions;

  return {
    ...config,
    quizDecks: undefined,
    customQuizQuestions: cappedQueue,
  };
}

export interface LiveSyncQueueSlicePayload {
  customQuizQuestions?: EnglishQuizItem[];
  customQuizQuestionsWindow?: EnglishQuizItem[];
  customQuizTotalLength?: number;
}

/**
 * Đóng gói hàng chờ câu hỏi cho gói đồng bộ mạng SYNC_CLASS_BOARD_STATE:
 * - Nếu <= 30 câu (ví dụ vòng 10 câu tiêu chuẩn): gửi nguyên vẹn customQuizQuestions.
 * - Nếu > 30 câu (ví dụ nạp đè cả bộ đề 5.000 câu): chỉ gửi cửa sổ 30 câu đầu (customQuizQuestionsWindow)
 *   kèm tổng độ dài để không bao giờ bắn gói mạng hàng MB sau mỗi câu hỏi.
 */
export function buildLiveSyncQueuePayload(
  queue: EnglishQuizItem[]
): LiveSyncQueueSlicePayload {
  if (!Array.isArray(queue)) return {};
  if (queue.length <= LIVE_SYNC_QUEUE_WINDOW) {
    return { customQuizQuestions: queue };
  }
  return {
    customQuizQuestionsWindow: queue.slice(0, LIVE_SYNC_QUEUE_WINDOW),
    customQuizTotalLength: queue.length,
  };
}

/**
 * Hợp nhất gói hàng chờ nhận từ SYNC_CLASS_BOARD_STATE mà không làm mất phần đuôi hàng nghìn câu ở tab Điều khiển.
 */
export function mergeIncomingLiveSyncQueue(
  localQueue: EnglishQuizItem[] | undefined,
  payload: LiveSyncQueueSlicePayload
): EnglishQuizItem[] | null {
  if (Array.isArray(payload.customQuizQuestions)) {
    return payload.customQuizQuestions;
  }
  if (!Array.isArray(payload.customQuizQuestionsWindow)) {
    return null;
  }

  const win = payload.customQuizQuestionsWindow;
  const targetLen = Number(payload.customQuizTotalLength || win.length);

  if (
    Array.isArray(localQueue) &&
    localQueue.length >= win.length &&
    win.length > 0
  ) {
    const headId = win[0]?.id;
    if (headId) {
      // Tìm vị trí câu đầu cửa sổ trong hàng chờ cục bộ (thường ở index 0..5)
      const maxSearch = Math.min(localQueue.length, 60);
      for (let i = 0; i < maxSearch; i++) {
        if (localQueue[i]?.id === headId) {
          const tailStart = i + win.length;
          return tailStart < localQueue.length
            ? [...win, ...localQueue.slice(tailStart)]
            : win;
        }
      }
    }
    if (localQueue.length > targetLen && targetLen > win.length) {
      const consumed = localQueue.length - targetLen;
      return [...win, ...localQueue.slice(consumed + win.length)];
    }
  }

  return win;
}
