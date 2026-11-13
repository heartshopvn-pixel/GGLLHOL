import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveSyncQueuePayload,
  LIVE_SYNC_QUEUE_WINDOW,
  LOCAL_STORAGE_QUEUE_WINDOW,
  mergeIncomingLiveSyncQueue,
  normalizeQuizDecksFast,
  parseLargeQuizTxtChunked,
  parseLargeQuizTxtFast,
  prepareEnqueuedQuestions,
  QuizDeckRecord,
  recordRecentAskedWord,
  sampleQuestionsFast,
  stripHeavyQuizDataForLocalStorage,
} from './quizDeckEngine';
import {
  build15MinuteTieredRoundQuestions,
  normalizeQuizDeckFileName,
} from '../config/vocabDecks';
import { DEFAULT_CONFIG } from '../config/constants';
import { EnglishQuizItem } from '../types/game';

function generateSyntheticTxtLines(count: number): string {
  const lines: string[] = ['# Bộ đề lớn kiểm thử hiệu năng'];
  for (let i = 0; i < count; i++) {
    // Tạo từ tiếng Anh giả lập A..Z hợp lệ duy nhất (6 chữ cái)
    let n = i;
    let code = '';
    for (let c = 0; c < 6; c++) {
      code += String.fromCharCode(65 + (n % 26));
      n = Math.floor(n / 26);
    }
    if (i % 5 === 0) {
      // Kiểm thử đảo cột EN | VI tự động
      lines.push(`${code} | Nghĩa tiếng Việt số ${i}`);
    } else {
      lines.push(`Từ vựng số ${i} | ${code} | /fəˈnetɪk/`);
    }
  }
  // Thêm vài dòng trùng lặp để kiểm thử khử trùng
  lines.push('Từ vựng số 1 | BAAAAA | /dup/');
  return lines.join('\n');
}

test('build15MinuteTieredRoundQuestions returns 10 questions: 3 easy + 4 normal + 2 hard + Q10 normal', () => {
  const round = build15MinuteTieredRoundQuestions(DEFAULT_CONFIG);
  assert.equal(round.length, 10);
  assert.deepEqual(
    round.map((q) => q.quizLevel),
    [
      'easy',
      'easy',
      'easy',
      'normal',
      'normal',
      'normal',
      'normal',
      'hard',
      'hard',
      'normal',
    ]
  );
});

test('parseLargeQuizTxtFast & parseLargeQuizTxtChunked parse 10,000 lines accurately and deduplicate', async () => {
  const rawTxt = generateSyntheticTxtLines(10_000);

  const t0 = performance.now();
  const syncItems = parseLargeQuizTxtFast(rawTxt, {
    idPrefix: 'fast10k',
    deckName: 'tienganh-de',
    quizLevel: 'easy',
  });
  const syncElapsedMs = performance.now() - t0;

  assert.equal(syncItems.length, 10_000);
  assert.ok(syncElapsedMs < 500, `Expected fast parse < 500ms, got ${syncElapsedMs}ms`);
  // Dòng 0 đảo cột EN | VI -> được tự động nhận diện chuẩn
  assert.equal(syncItems[0].en, 'AAAAAA');
  assert.equal(syncItems[0].vi, 'Nghĩa tiếng Việt số 0');
  assert.equal(syncItems[0].deckName, 'tienganh-de');
  assert.equal(syncItems[0].quizLevel, 'easy');
  assert.equal(syncItems[1].phonetic, '/fəˈnetɪk/');

  let progressCalls = 0;
  const asyncItems = await parseLargeQuizTxtChunked(rawTxt, {
    idPrefix: 'chunk10k',
    deckName: 'tienganh-kho',
    quizLevel: 'hard',
    chunkLines: 3000,
    onProgress: () => {
      progressCalls++;
    },
  });
  assert.equal(asyncItems.length, 10_000);
  assert.ok(progressCalls >= 3, 'Expected chunked progress callbacks');
  assert.equal(asyncItems[9999].en, syncItems[9999].en);
});

test('normalizeQuizDecksFast caches via WeakMap with O(1) reference preservation on re-renders', () => {
  const bigQuestions: EnglishQuizItem[] = Array.from({ length: 5000 }, (_, i) => ({
    id: `q-${i}`,
    vi: `Nghĩa ${i}`,
    en: `WORD${String.fromCharCode(65 + (i % 26))}`,
  }));
  const inputDecks: QuizDeckRecord[] = [
    {
      id: 'deck-tienganh-de',
      name: 'tienganh-de.txt',
      questions: bigQuestions,
    },
  ];

  const firstPass = normalizeQuizDecksFast(
    inputDecks,
    [],
    normalizeQuizDeckFileName,
    false
  );
  assert.equal(firstPass[0].name, 'tienganh-de');
  assert.equal(firstPass[0].level, 'easy');
  assert.equal(firstPass[0].questions.length, 5000);
  assert.equal(firstPass[0].questions[0].quizLevel, 'easy');

  const t0 = performance.now();
  const secondPass = normalizeQuizDecksFast(
    inputDecks,
    [],
    normalizeQuizDeckFileName,
    false
  );
  const cachedElapsed = performance.now() - t0;

  assert.strictEqual(firstPass, secondPass, 'Outer WeakMap should return identical array ref');
  assert.strictEqual(
    firstPass[0].questions,
    secondPass[0].questions,
    'Inner questions array must not be re-cloned'
  );
  assert.ok(cachedElapsed < 5, `Cached lookup must be < 5ms, got ${cachedElapsed}ms`);
});

test('sampleQuestionsFast picks O(k) unique items from 20,000 pool in < 10ms and respects recentUsedWords', () => {
  const hugePool: EnglishQuizItem[] = [];
  for (let i = 0; i < 20_000; i++) {
    let n = i;
    let word = '';
    for (let c = 0; c < 6; c++) {
      word += String.fromCharCode(65 + (n % 26));
      n = Math.floor(n / 26);
    }
    hugePool.push({
      id: `p-${i}`,
      vi: `Từ ${i}`,
      en: word,
    });
  }

  const recentSet = new Set<string>();
  for (let i = 0; i < 200; i++) {
    recordRecentAskedWord(recentSet, hugePool[i].en, 150);
  }
  assert.equal(recentSet.size, 150, 'Ring buffer caps at maxSize');

  const usedInRound = new Set<string>();
  const t0 = performance.now();
  const picked = sampleQuestionsFast(
    hugePool,
    10,
    usedInRound,
    'tienganh-de',
    'easy',
    recentSet
  );
  const elapsedMs = performance.now() - t0;

  assert.equal(picked.length, 10);
  assert.equal(usedInRound.size, 10);
  assert.ok(elapsedMs < 15, `Sampling 10 from 20,000 should be < 15ms, got ${elapsedMs}ms`);
  for (const q of picked) {
    assert.equal(recentSet.has(q.en.toLowerCase()), false, 'Should avoid recently asked words');
    assert.equal(q.deckName, 'tienganh-de');
    assert.equal(q.quizLevel, 'easy');
  }
});

test('prepareEnqueuedQuestions, stripHeavyQuizDataForLocalStorage & LiveSync slicing keep payloads tiny', () => {
  const raw5000: EnglishQuizItem[] = Array.from({ length: 5000 }, (_, i) => ({
    id: `src-${i}`,
    vi: `Nghĩa câu ${i}`,
    en: ` VOCAB${String.fromCharCode(65 + (i % 26))} `,
  }));

  const enqueued = prepareEnqueuedQuestions(raw5000, {
    deckName: 'tienganh-thuong',
    quizLevel: 'normal',
    shuffle: true,
    ratio1: 20,
    ratio2: 10,
    ratio3: 5,
  });
  assert.equal(enqueued.length, 5000);
  assert.ok(enqueued.some((q) => (q.luckyStars ?? 0) > 0));

  const heavyConfig = {
    ...DEFAULT_CONFIG,
    quizDecks: [
      { id: 'd1', name: 'tienganh-de', questions: enqueued },
      { id: 'd2', name: 'tienganh-thuong', questions: enqueued },
      { id: 'd3', name: 'tienganh-kho', questions: enqueued },
      { id: 'd4', name: 'tienganh-OMG', questions: enqueued },
    ],
    customQuizQuestions: enqueued,
  };

  const stripped = stripHeavyQuizDataForLocalStorage(heavyConfig);
  assert.equal(stripped.quizDecks, undefined);
  assert.equal(stripped.customQuizQuestions?.length, LOCAL_STORAGE_QUEUE_WINDOW);
  const jsonBytes = JSON.stringify(stripped).length;
  assert.ok(
    jsonBytes < 120_000,
    `Stripped config JSON must stay well under localStorage 5MB quota, got ${jsonBytes} bytes`
  );

  // Kiểm thử cắt lát gói mạng Live Sync & khôi phục không mất đuôi ở Studio
  const afterOneConsumed = enqueued.slice(1); // Còn 4999 câu
  const syncSlice = buildLiveSyncQueuePayload(afterOneConsumed);
  assert.equal(syncSlice.customQuizQuestions, undefined);
  assert.equal(syncSlice.customQuizQuestionsWindow?.length, LIVE_SYNC_QUEUE_WINDOW);
  assert.equal(syncSlice.customQuizTotalLength, 4999);

  const mergedOnStudio = mergeIncomingLiveSyncQueue(enqueued, syncSlice);
  assert.ok(mergedOnStudio);
  assert.equal(mergedOnStudio!.length, 4999);
  assert.equal(mergedOnStudio![0].id, afterOneConsumed[0].id);
  assert.equal(mergedOnStudio![4998].id, afterOneConsumed[4998].id);
});
