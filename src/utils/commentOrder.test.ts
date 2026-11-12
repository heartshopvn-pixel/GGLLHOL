import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { NODE_SERVER_CODE } from '../config/constants';
import {
  compareBigIntDecimalStrings,
  compareWinnerOrder,
  doesCommentMatchQuizWord,
  extractTikTokOrderMeta,
  isLateCorrectQuizAnswerPure,
  LATE_QUIZ_ANSWER_BUBBLE_TEXT,
  normalizeTikTokCreateTimeMs,
  parseProtoInt64ToString,
  pickDeterministicSlotIndex,
  sortAndReRankQuizWinners,
} from './commentOrder';
import type { ClassBoardQuizWinner } from '../types/game';

const mockRankPoints = (rank: number): number => {
  if (rank === 1) return 10;
  if (rank === 2) return 8;
  if (rank === 3) return 7;
  return 5;
};

test('parseProtoInt64ToString handles string, number, bigint, and Protobuf Long {low, high}', () => {
  assert.equal(
    parseProtoInt64ToString('7436281940281940281'),
    '7436281940281940281'
  );
  assert.equal(parseProtoInt64ToString(7436281940281940281n), '7436281940281940281');
  assert.equal(parseProtoInt64ToString(1762949000), '1762949000');

  // Protobuf Long representation of 7436281940281940281 = (1731394316 << 32) | 3098997049
  const val = 7436281940281940281n;
  const low = Number(val & 0xffffffffn) | 0;
  const high = Number((val >> 32n) & 0xffffffffn) | 0;
  assert.equal(
    parseProtoInt64ToString({ low, high, unsigned: true }),
    '7436281940281940281'
  );
});

test('normalizeTikTokCreateTimeMs normalizes seconds, milliseconds, and microseconds to ms', () => {
  assert.equal(normalizeTikTokCreateTimeMs('1762949000'), 1762949000000);
  assert.equal(normalizeTikTokCreateTimeMs(1762949000123), 1762949000123);
  assert.equal(normalizeTikTokCreateTimeMs('1762949000123456'), 1762949000123);
});

test('compareBigIntDecimalStrings compares 64-bit Snowflake msgIds accurately', () => {
  assert.equal(
    compareBigIntDecimalStrings('7436281940281940100', '7436281940281940255'),
    -1
  );
  assert.equal(
    compareBigIntDecimalStrings('7436281940281940255', '7436281940281940100'),
    1
  );
  assert.equal(
    compareBigIntDecimalStrings('007436281940281940100', '7436281940281940100'),
    0
  );
});

test('extractTikTokOrderMeta extracts nested common.msgId and common.createTime', () => {
  const meta = extractTikTokOrderMeta(
    {
      common: {
        msgId: '7436281940281940999',
        createTime: '1762949005',
      },
      serverSeq: 42,
    },
    7
  );
  assert.equal(meta.tiktokMsgId, '7436281940281940999');
  assert.equal(meta.tiktokCreateTimeMs, 1762949005000);
  assert.equal(meta.serverSeq, 42);
  assert.equal(meta.arrivalSeq, 7);
});

test('sortAndReRankQuizWinners dynamically re-ranks out-of-order network arrivals by TikTok msgId', () => {
  // User B arrives FIRST locally (arrivalSeq=1, elapsedSec=2.1) with LARGER msgId (...500)
  // User A arrives SECOND locally 200ms later (arrivalSeq=2, elapsedSec=2.3) with SMALLER msgId (...100)
  const arrivedWinners: ClassBoardQuizWinner[] = [
    {
      username: 'User_B',
      elapsedSec: 2.1,
      isSeated: true,
      isBot: false,
      tiktokMsgId: '7436281940281940500',
      tiktokCreateTimeMs: 1762949005000,
      arrivalSeq: 1,
    },
    {
      username: 'User_A',
      elapsedSec: 2.3,
      isSeated: true,
      isBot: false,
      tiktokMsgId: '7436281940281940100',
      tiktokCreateTimeMs: 1762949005000,
      arrivalSeq: 2,
    },
  ];

  const result = sortAndReRankQuizWinners(arrivedWinners, {
    currentQuestion: { id: 'q1', vi: 'Quả táo', en: 'apple', luckyStars: 0 },
    getRankPoints: mockRankPoints,
  });

  // User_A MUST be promoted to Top 1 (10 pts), User_B becomes Top 2 (8 pts)
  assert.equal(result.classWinners.length, 2);
  assert.equal(result.classWinners[0].username, 'User_A');
  assert.equal(result.classWinners[0].points, 10);
  assert.equal(result.classWinners[1].username, 'User_B');
  assert.equal(result.classWinners[1].points, 8);
  // Displayed elapsedSec of #1 is clamped so it never looks slower than #2
  assert.ok(result.classWinners[0].elapsedSec <= result.classWinners[1].elapsedSec);
});

test('Real human commenters always outrank filler NPC bots regardless of livestream video latency', () => {
  // Bot answered at 5.4s inside engine; Real viewer saw stream 5s late and answered at 7.2s (#1 in TikTok Live chat)
  const mixed: ClassBoardQuizWinner[] = [
    {
      username: 'Bot_1',
      elapsedSec: 5.4,
      isSeated: true,
      isBot: true,
      arrivalSeq: 1,
    },
    {
      username: 'Bot_2',
      elapsedSec: 5.9,
      isSeated: true,
      isBot: true,
      arrivalSeq: 2,
    },
    {
      username: 'Real_Viewer_First_In_Chat',
      elapsedSec: 7.2,
      isSeated: true,
      isBot: false,
      tiktokMsgId: '7436281940281940888',
      arrivalSeq: 3,
    },
  ];

  const result = sortAndReRankQuizWinners(mixed, {
    currentQuestion: { id: 'q1', vi: 'Con mèo', en: 'cat', luckyStars: 1 }, // 1 star = x2
    getRankPoints: mockRankPoints,
  });

  assert.equal(result.classWinners[0].username, 'Real_Viewer_First_In_Chat');
  assert.equal(result.classWinners[0].points, 20); // Top 1 (10) * x2 star = 20
  assert.equal(result.classWinners[1].username, 'Bot_1');
  assert.equal(result.classWinners[1].points, 16); // Top 2 (8) * x2 star = 16
  assert.equal(result.classWinners[2].username, 'Bot_2');
  assert.equal(result.classWinners[2].points, 14); // Top 3 (7) * x2 star = 14
  assert.ok(compareWinnerOrder(mixed[2], mixed[0]) < 0);
});

test('Deduplication preserves earliest canonical msgId if same user comments right answer twice', () => {
  const dupes: ClassBoardQuizWinner[] = [
    {
      username: 'MinhAnh',
      elapsedSec: 3.5,
      isSeated: false,
      isBot: false,
      tiktokMsgId: '7436281940281940900',
      arrivalSeq: 2,
    },
    {
      username: 'minhanh',
      elapsedSec: 1.8,
      isSeated: false,
      isBot: false,
      tiktokMsgId: '7436281940281940120',
      arrivalSeq: 1,
    },
  ];

  const result = sortAndReRankQuizWinners(dupes, {
    currentQuestion: null,
    getRankPoints: mockRankPoints,
  });

  assert.equal(result.outsideWinners.length, 1);
  assert.equal(result.outsideWinners[0].tiktokMsgId, '7436281940281940120');
  assert.equal(result.outsideWinners[0].elapsedSec, 1.8);
  assert.equal(result.outsideWinners[0].points, 10);
});

test('pickDeterministicSlotIndex returns stable valid index across tabs', () => {
  const idx1 = pickDeterministicSlotIndex('user_a:1:3', 8);
  const idx2 = pickDeterministicSlotIndex('user_a:1:3', 8);
  assert.equal(idx1, idx2);
  assert.ok(idx1 >= 0 && idx1 < 8);
});

test('Sequential FIFO batch accumulation with synchronous ref updates preserves all winners and re-ranks Top 1..4', () => {
  const rawBatch = [
    {
      username: 'Nguoi_Thu_3',
      comment: 'FAN',
      common: { msgId: '7436281940281940950', createTime: '1762949005' },
      serverSeq: 3,
    },
    {
      username: 'Nguoi_Thu_2',
      comment: 'FAN',
      common: { msgId: '7436281940281940900', createTime: '1762949005' },
      serverSeq: 2,
    },
    {
      username: 'Nguoi_Dau_Tien',
      comment: 'FAN',
      common: { msgId: '7436281940281940100', createTime: '1762949005' },
      serverSeq: 1,
    },
  ];

  let syncRefWinners: ClassBoardQuizWinner[] = [];
  let classWinners: ClassBoardQuizWinner[] = [];

  rawBatch.forEach((raw, idx) => {
    const meta = extractTikTokOrderMeta(raw, idx + 1);
    const entry: ClassBoardQuizWinner = {
      username: raw.username,
      elapsedSec: 1.5 + idx * 0.2,
      isSeated: true,
      isBot: false,
      ...meta,
    };
    const reRanked = sortAndReRankQuizWinners([...syncRefWinners, entry], {
      currentQuestion: { id: 'q1', vi: 'Quạt', en: 'FAN' },
      getRankPoints: mockRankPoints,
    });
    syncRefWinners = reRanked.winners;
    classWinners = reRanked.classWinners;
  });

  assert.equal(classWinners.length, 3);
  assert.equal(classWinners[0].username, 'Nguoi_Dau_Tien');
  assert.equal(classWinners[0].points, 10);
  assert.equal(classWinners[1].username, 'Nguoi_Thu_2');
  assert.equal(classWinners[1].points, 8);
  assert.equal(classWinners[2].username, 'Nguoi_Thu_3');
  assert.equal(classWinners[2].points, 7);
});

test('NODE_SERVER_CODE template compiles as valid JavaScript with msgId and FIFO batch queue', () => {
  assert.doesNotThrow(() => {
    new vm.Script(NODE_SERVER_CODE, { filename: 'server.js' });
  });
  assert.ok(NODE_SERVER_CODE.includes('extractOrderFields'));
  assert.ok(NODE_SERVER_CODE.includes('flushCloudWebhookQueue'));
  assert.ok(NODE_SERVER_CODE.includes("type: 'batch'"));
});

test('isLateCorrectQuizAnswerPure detects late right answers after 2s grace and skips timely winners or bots', () => {
  assert.equal(LATE_QUIZ_ANSWER_BUBBLE_TEXT, 'Không kịp giờ rồi');
  assert.equal(doesCommentMatchQuizWord('Đáp án là apple cô ơi!', 'APPLE'), true);
  assert.equal(doesCommentMatchQuizWord('refrigerator', 'FRIDGE'), true);
  assert.equal(doesCommentMatchQuizWord('banana', 'APPLE'), false);

  const expiredSnap = {
    en: 'APPLE',
    winnerLowerSet: new Set(['ban_nhanh_nhat']),
    expiredAtMs: 1_000_000,
  };

  // 1. Trong lúc đang 'asking' (bao gồm cả 2s bù trễ sau khi đồng hồ về 0s): không bị coi là muộn
  assert.equal(
    isLateCorrectQuizAnswerPure({
      rawComment: 'apple',
      lowerUser: 'hoc_sinh_muon',
      isBot: false,
      activeEngine: 'english_quiz',
      boardPhase: 'asking',
      currentQuestionEn: 'APPLE',
    }),
    false
  );

  // 2. Ngay sau khi hết cả 2s bù trễ (chuyển sang 'answer_flash', 'result_summary', 'ranking_board'):
  // Người chưa được tính đúng gửi đáp án đúng -> báo muộn ("Không kịp giờ rồi")
  for (const postPhase of ['answer_flash', 'result_summary', 'ranking_board', 'round_end']) {
    assert.equal(
      isLateCorrectQuizAnswerPure({
        rawComment: 'apple',
        lowerUser: 'hoc_sinh_muon',
        isBot: false,
        activeEngine: 'english_quiz',
        boardPhase: postPhase,
        currentQuestionEn: 'APPLE',
        currentWinnerLowers: ['ban_nhanh_nhat'],
        lastExpiredWindow: expiredSnap,
      }),
      true,
      `Expected true in phase ${postPhase}`
    );
  }

  // 3. Người đã trả lời đúng kịp giờ rồi gõ lại từ đó -> không báo muộn
  assert.equal(
    isLateCorrectQuizAnswerPure({
      rawComment: 'apple',
      lowerUser: 'ban_nhanh_nhat',
      isBot: false,
      activeEngine: 'english_quiz',
      boardPhase: 'answer_flash',
      currentQuestionEn: 'APPLE',
      currentWinnerLowers: ['ban_nhanh_nhat'],
      lastExpiredWindow: expiredSnap,
    }),
    false
  );

  // 4. Câu trả lời sai hoặc chat thường sau khi hết giờ -> không báo muộn
  assert.equal(
    isLateCorrectQuizAnswerPure({
      rawComment: 'tiếc quá sai rồi',
      lowerUser: 'hoc_sinh_muon',
      isBot: false,
      activeEngine: 'english_quiz',
      boardPhase: 'answer_flash',
      currentQuestionEn: 'APPLE',
      lastExpiredWindow: expiredSnap,
    }),
    false
  );

  // 5. NPC bot không bị áp dụng
  assert.equal(
    isLateCorrectQuizAnswerPure({
      rawComment: 'apple',
      lowerUser: 'npc_bot_1',
      isBot: true,
      activeEngine: 'english_quiz',
      boardPhase: 'answer_flash',
      currentQuestionEn: 'APPLE',
      lastExpiredWindow: expiredSnap,
    }),
    false
  );

  // 6. Bình luận đến trễ vừa sang vài giây đầu của 'preparing' câu kế tiếp vẫn nhận diện đúng từ câu vừa hết hạn
  assert.equal(
    isLateCorrectQuizAnswerPure({
      rawComment: 'APPLE',
      lowerUser: 'hoc_sinh_mang_lag',
      isBot: false,
      activeEngine: 'english_quiz',
      boardPhase: 'preparing',
      currentQuestionEn: 'BANANA',
      lastExpiredWindow: expiredSnap,
      nowMs: 1_005_000,
    }),
    true
  );
});

