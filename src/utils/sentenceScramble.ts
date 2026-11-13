import { EnglishQuizItem } from '../types/game';

const LEADING_NUM_PREFIX_RE = /^\d+[.)]\s*/;

const EN_EXCLAMATORY_RE =
  /^(?:what\s+(?:a|an)\b|how\s+(?:beautiful|amazing|wonderful|nice|great|lovely|lucky|cute|funny|sad|weird|strange|sweet|kind|awesome|terrible|horrible|exciting|delicious|fast|slow|cold|hot)\b(?!\s+(?:am|is|are|was|were|do|does|did|can|could|will|would|shall|should|have|has|had)\b))/i;

const EN_AUX_QUESTION_RE =
  /^(?:have|has|had|do|does|did|am|is|are|was|were|can|could|will|would|shall|should|may|might|must)\s+(?:i|you|we|they|he|she|it|this|that|these|those|there|anybody|anyone|anything|everybody|everyone|somebody|someone|nobody|nothing|today|tomorrow|yesterday|work|class|school|dinner|lunch|breakfast|management|people|students|teacher|boss|mom|dad|your|my|our|his|her|their|the|a|an)\b/i;

const EN_WH_QUESTION_RE =
  /^(?:who|whom|whose|where|when|why|which)\b|^what\b(?!\s+(?:a|an)\b)|^how\s+(?:many|much|long|often|old|far|about|come|am|is|are|was|were|do|does|did|can|could|will|would|shall|should|have|has|had)\b/i;

const VI_EXCLAMATORY_END_RE =
  /\b(?:đẹp\s+quá|hay\s+quá|vui\s+quá|buồn\s+quá|tuyệt\s+quá|ngon\s+quá|dễ\s+thương\s+quá|giỏi\s+quá|nhanh\s+quá|chậm\s+quá)\s*$/i;

const VI_QUESTION_END_RE =
  /(?:\b(?:chưa|hả|nhỉ|sao|mấy|nào|đâu\s+rồi|đâu|ai\s+vậy|gì\s+vậy|thế\s+nào|bao\s+lâu|bao\s+nhiêu)\s*|(?:không|vậy|đấy\s+à|muộn\s+à|hẹn\s+à|thật\s+à|đúng\s+không|phải\s+không)\s*)$/i;

export function isSentenceDeckName(deckName?: string | null): boolean {
  if (!deckName) return false;
  const clean = deckName
    .trim()
    .replace(/\.txt$/i, '')
    .toLowerCase();
  return (
    clean.startsWith('ghepcau') ||
    clean.includes('ghepcau') ||
    clean.includes('ghep-cau') ||
    clean.includes('ghep_cau') ||
    clean.includes('ghép câu')
  );
}

export function isSentenceScrambleItem(
  item?: EnglishQuizItem | null
): boolean {
  if (!item) return false;
  if (item.questionType === 'sentence_scramble') return true;
  if (item.questionType === 'vocab') return false;
  if (isSentenceDeckName(item.deckName)) return true;
  const trimmedEn = (item.en || '').trim();
  return /\b[a-zA-Z0-9']+\s+[a-zA-Z0-9']+\b/.test(trimmedEn);
}

export interface ParsedSentenceComponents {
  viDisplay: string;
  enCanonical: string;
  words: string[];
  trailingPunct: '' | '?' | '!';
}

/**
 * Tách câu Tiếng Việt & Tiếng Anh thành danh sách các từ + dấu câu cuối (? / !).
 * Tự động nhận diện câu hỏi (?) và câu cảm thán (!) kể cả khi file .txt lược bỏ dấu câu cuối.
 */
export function analyzeSentencePair(
  viRaw: string,
  enRaw: string
): ParsedSentenceComponents {
  const cleanViBase = (viRaw || '')
    .replace(LEADING_NUM_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanEnBase = (enRaw || '')
    .replace(LEADING_NUM_PREFIX_RE, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  let trailingPunct: '' | '?' | '!' = '';
  if (/\?\s*$/.test(cleanEnBase) || /\?\s*$/.test(cleanViBase)) {
    trailingPunct = '?';
  } else if (/!\s*$/.test(cleanEnBase) || /!\s*$/.test(cleanViBase)) {
    trailingPunct = '!';
  } else {
    const enNoTrail = cleanEnBase.replace(/[.?!,;:\s]+$/g, '').trim();
    const viNoTrail = cleanViBase.replace(/[.?!,;:\s]+$/g, '').trim();
    if (
      EN_EXCLAMATORY_RE.test(enNoTrail) ||
      (VI_EXCLAMATORY_END_RE.test(viNoTrail) &&
        !EN_AUX_QUESTION_RE.test(enNoTrail) &&
        !EN_WH_QUESTION_RE.test(enNoTrail))
    ) {
      trailingPunct = '!';
    } else if (
      EN_AUX_QUESTION_RE.test(enNoTrail) ||
      EN_WH_QUESTION_RE.test(enNoTrail) ||
      VI_QUESTION_END_RE.test(viNoTrail)
    ) {
      trailingPunct = '?';
    }
  }

  const rawTokens =
    cleanEnBase
      .replace(/[^a-zA-Z0-9'\s-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^'+|'+$/g, '').trim())
      .filter(Boolean) || [];

  const words = rawTokens.map((w) => w.toLowerCase());

  const viCore = cleanViBase.replace(/[.?!]+\s*$/g, '').trim();
  const viDisplay =
    trailingPunct === '?'
      ? `${viCore} ?`
      : trailingPunct === '!'
      ? `${viCore} !`
      : cleanViBase;

  const enCore = rawTokens.join(' ');
  const enCapitalized = enCore
    ? enCore.charAt(0).toUpperCase() + enCore.slice(1)
    : '';
  const enCanonical = trailingPunct
    ? `${enCapitalized}${trailingPunct}`
    : enCapitalized;

  return {
    viDisplay,
    enCanonical,
    words,
    trailingPunct,
  };
}

function hashSeed(seedKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedKey.length; i++) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function nextXorShift32(state: number): number {
  let x = state >>> 0 || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0 || 1;
}

/**
 * Xáo trộn ngẫu nhiên các từ trong câu theo seed tất định (đồng bộ 100% giữa Chrome & OBS ?obs=1).
 * Đảm bảo từ đầu tiên của đáp án KHÔNG BAO GIỜ đứng ở vị trí đầu tiên (index 0).
 */
export function scrambleSentenceWords(
  words: readonly string[],
  seedKey: string
): string[] {
  const n = words.length;
  if (n <= 1) return [...words];

  const arr = [...words];
  let rng = hashSeed(seedKey || 'default_seed');

  for (let i = n - 1; i > 0; i--) {
    rng = nextXorShift32(rng);
    const j = rng % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  const firstAnswerWordLower = words[0].toLowerCase();
  if (arr[0].toLowerCase() === firstAnswerWordLower) {
    const validSwapIndices: number[] = [];
    for (let k = 1; k < n; k++) {
      if (arr[k].toLowerCase() !== firstAnswerWordLower) {
        validSwapIndices.push(k);
      }
    }
    if (validSwapIndices.length > 0) {
      rng = nextXorShift32(rng);
      const chosenSwapIdx =
        validSwapIndices[rng % validSwapIndices.length];
      const tmp = arr[0];
      arr[0] = arr[chosenSwapIdx];
      arr[chosenSwapIdx] = tmp;
    }
  }

  return arr;
}

export function normalizeEnglishSentenceTokens(raw: string): string[] {
  if (!raw) return [];
  return raw
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/**
 * Kiểm tra câu trả lời của học sinh cho dạng Ghép Câu:
 * - Không phân biệt hoa/thường
 * - Có hoặc không có dấu ? / ! ở cuối đều tính đúng
 * - Dấu ? / ! dính liền từ cuối (ví dụ "yet?") hoặc tách rời ("yet ?") đều tính đúng
 * - Bắt buộc đúng thứ tự các từ trong câu đáp án
 */
export function doesCommentMatchSentence(
  rawComment: string,
  targetEn?: string | null
): boolean {
  if (!targetEn) return false;
  const targetTokens = normalizeEnglishSentenceTokens(targetEn);
  if (targetTokens.length === 0) return false;

  const commentTokens = normalizeEnglishSentenceTokens(rawComment);
  if (commentTokens.length < targetTokens.length) return false;

  const stripApos = (s: string) => s.replace(/'/g, '');
  const tLen = targetTokens.length;

  for (let start = 0; start <= commentTokens.length - tLen; start++) {
    let allMatch = true;
    for (let k = 0; k < tLen; k++) {
      const cTok = commentTokens[start + k];
      const tTok = targetTokens[k];
      if (cTok !== tTok && stripApos(cTok) !== stripApos(tTok)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  return false;
}

/**
 * Trả về câu trả lời sạch (không kèm dấu ? / !) cho NPC hoặc nút test.
 */
export function formatCleanSentenceAnswer(targetEn: string): string {
  const tokens = normalizeEnglishSentenceTokens(targetEn);
  return tokens.join(' ');
}

/**
 * Tạo câu trả lời sai tự nhiên cho NPC ở câu hỏi Ghép Câu bằng cách đảo vị trí 2 từ liền nhau.
 */
export function buildWrongScrambledNpcSentence(targetEn: string): string {
  const tokens = normalizeEnglishSentenceTokens(targetEn);
  if (tokens.length < 2) {
    return `${targetEn}a`;
  }
  const copy = [...tokens];
  const swapPositions: number[] = [];
  for (let i = 0; i < copy.length - 1; i++) {
    if (copy[i] !== copy[i + 1]) {
      swapPositions.push(i);
    }
  }
  if (swapPositions.length > 0) {
    const idx =
      swapPositions[Math.floor(Math.random() * swapPositions.length)];
    const tmp = copy[idx];
    copy[idx] = copy[idx + 1];
    copy[idx + 1] = tmp;
    return copy.join(' ');
  }
  return `${copy.join(' ')} now`;
}
