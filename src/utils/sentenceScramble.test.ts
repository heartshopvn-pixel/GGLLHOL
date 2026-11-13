import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSentencePair,
  buildWrongScrambledNpcSentence,
  doesCommentMatchSentence,
  isSentenceScrambleItem,
  scrambleSentenceWords,
} from './sentenceScramble';
import { doesCommentMatchQuizWord } from './commentOrder';
import {
  GHEPCAU_EASY_ITEMS,
  build15MinuteTieredRoundQuestions,
  getQuestionAskDurationSec,
  normalizeQuizDeckFileName,
  resolveQuizDifficultyLevel,
} from '../config/vocabDecks';
import { DEFAULT_CONFIG } from '../config/constants';
import { parseLargeQuizTxtFast } from './quizDeckEngine';

test('analyzeSentencePair extracts lowercase words and detects ? / ! punctuation accurately', () => {
  const q1 = analyzeSentencePair('Em ăn cơm chưa ?', 'Have you eaten yet ?');
  assert.deepEqual(q1.words, ['have', 'you', 'eaten', 'yet']);
  assert.equal(q1.trailingPunct, '?');
  assert.equal(q1.viDisplay, 'Em ăn cơm chưa ?');

  // Auto-detects question mark when attached txt omits ?
  const q2 = analyzeSentencePair('1. Em ăn sáng chưa', 'Have you eaten breakfast');
  assert.deepEqual(q2.words, ['have', 'you', 'eaten', 'breakfast']);
  assert.equal(q2.trailingPunct, '?');
  assert.equal(q2.viDisplay, 'Em ăn sáng chưa ?');

  // Exclamatory sentence
  const ex1 = analyzeSentencePair('Trời hôm nay đẹp quá!', 'What a beautiful day!');
  assert.deepEqual(ex1.words, ['what', 'a', 'beautiful', 'day']);
  assert.equal(ex1.trailingPunct, '!');
  assert.equal(ex1.viDisplay, 'Trời hôm nay đẹp quá !');

  // Declarative sentence has empty trailingPunct
  const st1 = analyzeSentencePair('Anh chưa ăn gì cả', 'I have not eaten anything');
  assert.deepEqual(st1.words, ['i', 'have', 'not', 'eaten', 'anything']);
  assert.equal(st1.trailingPunct, '');
});

test('scrambleSentenceWords NEVER places the first answer word at index 0 and is deterministic', () => {
  assert.ok(GHEPCAU_EASY_ITEMS.length >= 90);

  for (const item of GHEPCAU_EASY_ITEMS) {
    const { words } = analyzeSentencePair(item.vi, item.en);
    assert.ok(words.length >= 2, `Expected >=2 words for "${item.en}"`);

    for (let seedIdx = 0; seedIdx < 12; seedIdx++) {
      const seed = `${item.id}_round_${seedIdx}`;
      const scrambledA = scrambleSentenceWords(words, seed);
      const scrambledB = scrambleSentenceWords(words, seed);

      // Deterministic across tabs (Studio & OBS ?obs=1)
      assert.deepEqual(scrambledA, scrambledB);
      assert.equal(scrambledA.length, words.length);

      // Same word multiset
      assert.deepEqual([...scrambledA].sort(), [...words].sort());

      // Strict rule: first word of answer NEVER appears at position 0
      assert.notEqual(
        scrambledA[0].toLowerCase(),
        words[0].toLowerCase(),
        `First word "${words[0]}" appeared at index 0 for "${item.en}" (seed=${seed})`
      );
    }
  }
});

test('student answer matching accepts sentence with or without ? / ! (attached or spaced) and rejects wrong order', () => {
  const target = 'Have you eaten yet ?';

  // Without ?
  assert.equal(doesCommentMatchQuizWord('have you eaten yet', target), true);
  // Attached ?
  assert.equal(doesCommentMatchQuizWord('have you eaten yet?', target), true);
  // Spaced ?
  assert.equal(doesCommentMatchQuizWord('have you eaten yet ?', target), true);
  // Mixed case + exclamation or surrounding chat words
  assert.equal(doesCommentMatchQuizWord('HAVE YOU EATEN YET!', target), true);
  assert.equal(
    doesCommentMatchQuizWord('cô ơi have you eaten yet? ạ', target),
    true
  );

  // Wrong word order must be rejected
  assert.equal(doesCommentMatchQuizWord('you have eaten yet', target), false);
  assert.equal(doesCommentMatchQuizWord('have eaten you yet', target), false);
  // Incomplete sentence must be rejected
  assert.equal(doesCommentMatchQuizWord('have you eaten', target), false);

  // NPC wrong sentence helper never accidentally matches
  const wrongNpc = buildWrongScrambledNpcSentence(target);
  assert.equal(doesCommentMatchSentence(wrongNpc, target), false);
});

test('parseLargeQuizTxtFast preserves multi-word English sentences and tags sentence_scramble', () => {
  const sampleTxt = [
    '1. Em ăn cơm chưa ? | Have you eaten yet ?',
    '2. Giữ gìn sức khỏe nhé! | Take care of yourself!',
  ].join('\n');

  const items = parseLargeQuizTxtFast(sampleTxt, {
    deckName: 'ghepcau-tienganh-de',
    quizLevel: 'easy',
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].questionType, 'sentence_scramble');
  assert.equal(items[0].trailingPunct, '?');
  assert.equal(isSentenceScrambleItem(items[0]), true);
  assert.equal(items[1].trailingPunct, '!');
});

test('build15MinuteTieredRoundQuestions respects sentenceScrambleRatio and preserves exact 4-tier difficulty schedule', () => {
  const expectedSchedule = [
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
  ];

  // 0% -> 0 sentence scramble questions
  const roundZero = build15MinuteTieredRoundQuestions({
    ...DEFAULT_CONFIG,
    sentenceScrambleRatio: 0,
  });
  assert.equal(roundZero.length, 10);
  assert.equal(
    roundZero.filter((q) => isSentenceScrambleItem(q)).length,
    0
  );
  assert.deepEqual(
    roundZero.map((q) => resolveQuizDifficultyLevel(q)),
    expectedSchedule
  );

  // 100% -> all 10 replaced by sentence scramble of the exact corresponding difficulty deck
  const roundAllSentence = build15MinuteTieredRoundQuestions({
    ...DEFAULT_CONFIG,
    sentenceScrambleRatio: 100,
  });
  assert.equal(roundAllSentence.length, 10);
  assert.equal(
    roundAllSentence.filter((q) => isSentenceScrambleItem(q)).length,
    10
  );
  assert.deepEqual(
    roundAllSentence.map((q) => resolveQuizDifficultyLevel(q)),
    expectedSchedule
  );
  assert.deepEqual(
    roundAllSentence.map((q) => q.deckName),
    [
      'ghepcau-tienganh-de',
      'ghepcau-tienganh-de',
      'ghepcau-tienganh-de',
      'ghepcau-tienganh-thuong',
      'ghepcau-tienganh-thuong',
      'ghepcau-tienganh-thuong',
      'ghepcau-tienganh-thuong',
      'ghepcau-tienganh-kho',
      'ghepcau-tienganh-kho',
      'ghepcau-tienganh-thuong',
    ]
  );

  // Deck filename normalization for uploaded ghepcau files
  assert.deepEqual(normalizeQuizDeckFileName('ghepcau-tienganh-de.txt'), {
    deckName: 'ghepcau-tienganh-de',
    deckKey: 'ghepcau-tienganh-de',
    level: 'easy',
  });
  assert.deepEqual(normalizeQuizDeckFileName('ghepcau-tienganh-omg_6a390d1a.txt'), {
    deckName: 'ghepcau-tienganh-OMG',
    deckKey: 'ghepcau-tienganh-omg',
    level: 'omg',
  });
});

test('getQuestionAskDurationSec separates Vocab vs Sentence Scramble durations across easy, normal, hard, omg, other', () => {
  const customCfg = {
    ...DEFAULT_CONFIG,
    hudLayout: {
      ...DEFAULT_CONFIG.hudLayout,
      classBoardQuestionDurationByLevel: {
        easy: 11,
        normal: 14,
        hard: 17,
        omg: 21,
        other: 13,
      },
      classBoardSentenceQuestionDurationByLevel: {
        easy: 24,
        normal: 28,
        hard: 33,
        omg: 40,
        other: 26,
      },
    },
  };

  // Vocab items use classBoardQuestionDurationByLevel
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 'v1',
      vi: 'Quả táo',
      en: 'APPLE',
      deckName: 'tienganh-de',
      questionType: 'vocab',
    }),
    11
  );
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 'v2',
      vi: 'Từ khác',
      en: 'CUSTOM',
      deckName: 'de-tu-vung-rieng',
      questionType: 'vocab',
    }),
    13
  );

  // Sentence Scramble items use classBoardSentenceQuestionDurationByLevel across all 5 categories
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 's1',
      vi: 'Em ăn cơm chưa ?',
      en: 'Have you eaten yet ?',
      deckName: 'ghepcau-tienganh-de',
      questionType: 'sentence_scramble',
    }),
    24
  );
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 's2',
      vi: 'Hôm nay trời đẹp',
      en: 'Today is nice',
      deckName: 'ghepcau-tienganh-thuong',
      questionType: 'sentence_scramble',
    }),
    28
  );
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 's3',
      vi: 'Câu khó',
      en: 'Please send me the report',
      deckName: 'ghepcau-tienganh-kho',
      questionType: 'sentence_scramble',
    }),
    33
  );
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 's4',
      vi: 'Câu OMG',
      en: 'What have you been doing lately',
      deckName: 'ghepcau-tienganh-OMG',
      questionType: 'sentence_scramble',
    }),
    40
  );
  assert.equal(
    getQuestionAskDurationSec(customCfg, {
      id: 's5',
      vi: 'Bộ câu riêng',
      en: 'See you tomorrow morning',
      deckName: 'bo-cau-rieng',
      questionType: 'sentence_scramble',
    }),
    26
  );
});

