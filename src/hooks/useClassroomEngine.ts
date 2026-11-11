import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_COLORS,
  buildDoubleDeskSlots,
  createSingleDoubleDeskSlots,
  DEFAULT_CONFIG,
  DEFAULT_GIFT_MODEL_SCALES,
  DEFAULT_GUIDE_ITEMS,
  DEFAULT_NPC_AVATARS,
  DEFAULT_NPC_SPEECH_CATEGORIES,
  DEFAULT_SPRITESHEETS,
  ENGLISH_QUIZ_QUESTIONS,
  groupSlotsIntoDoubleDesks,
  INITIAL_DONORS,
  INITIAL_MONKS,
  INITIAL_NORMAL_SLOTS,
  INITIAL_VIP_SLOTS,
  resolveClassroomGiftKind,
  SAMPLE_NAMES,
  SAMPLE_PRAYERS,
  SUPERVISOR_ZONE_BOUNDS,
} from '../config/constants';
import {
  QUIZ_DECK_SCHEMA_VERSION,
  build15MinuteTieredRoundQuestions,
  ensureTieredQuizDecksLoaded,
  getQuestionAskDurationSec,
  getQuizPointsForRank,
} from '../config/vocabDecks';
import { idbGet, idbSet } from '../services/browserStorage';
import {
  INITIAL_SAFETY_CATEGORIES,
  inspectUserInteraction,
  loadSavedCustomWords,
  saveCustomWordsToStorage,
   getDefaultCustomWords,
} from '../services/safetyFilter';
import {
  EventTtsQueueSnapshot,
  sanitizeAndLimitSpeechText,
  soundEngine,
  TeacherLiveVoiceOptions,
  TeacherLiveVoiceStatus,
  TTSQueueItem,
} from '../services/soundEngine';
import { syncService, WsConnectionStatus } from '../services/syncService';
import {
  BurnerLotusBurstFX,
  CameraFocusReason,
  CameraFocusState,
  CameraQueueItem,
  ClassBoardQuizWinner,
  ClassBoardRuntimeState,
  ClassroomGiftEventId,
  ControlledNpcRole,
  CustomAssetsConfig,
  DailyRecordEntry,
  DonorEntry,
  EnglishQuizItem,
  FloatingToastItem,
  FlyingFlowerFX,
  FlyingLotusFX,
  FlyingMilkTeaFX,
  GameConfig,
  GridConfig,
  HudBoxPosition,
  HudLayoutConfig,
  KneelSlot,
  OfferingGiftType,
  PilgrimData,
  Point2D,
  QueuedPilgrimRequest,
  RectBounds,
  RoamingCatAgent,
  RunningPigAgent,
  SafetyActionMode,
  SafetyCategory,
  SafetyLogEntry,
  SimpleExplosionFX,
  StudioBackupData,
  TempleMonkData,
  ZombieDamageEntry,
  ZombieEntityState,
  ZombieEventRuntimeState,
  ZombieProjectileFX,
  ZombieProjectileKind,
  ZombieSpikyDamageFX,
} from '../types/game';
import { HudBoxKey } from '../components/stage/StageHud';
import { ZoneKey } from '../components/stage/GameStage';

const STORAGE_KEY = 'lop_hoc_12a1_studio_state_v3';
const LEFT_DOOR_POS: Point2D = { x: 46, y: 500 };
const QUESTIONS_PER_ROUND = 15;

function sortRoundQuestionsByIncreasingDifficulty(
  sourceList: EnglishQuizItem[],
  excludeEnLower?: string
): EnglishQuizItem[] {
  const basePool =
    Array.isArray(sourceList) && sourceList.length > 0
      ? sourceList
      : ENGLISH_QUIZ_QUESTIONS;
  const filtered =
    excludeEnLower && basePool.length > 1
      ? basePool.filter((q) => q.en.trim().toLowerCase() !== excludeEnLower)
      : basePool;
  const workingPool = filtered.length >= QUESTIONS_PER_ROUND ? filtered : basePool;

  const shuffled = [...workingPool].sort(() => Math.random() - 0.5);
  const sortedByDifficulty = [...shuffled].sort((a, b) => {
    const lenA = a.en.replace(/[^a-zA-Z]/g, '').length;
    const lenB = b.en.replace(/[^a-zA-Z]/g, '').length;
    return lenA - lenB;
  });

  const picked: EnglishQuizItem[] = [];
  if (sortedByDifficulty.length <= QUESTIONS_PER_ROUND) {
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      const src = sortedByDifficulty[i % sortedByDifficulty.length];
      picked.push({
        ...src,
        id: `en-r15-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      });
    }
  } else {
    const step = (sortedByDifficulty.length - 1) / (QUESTIONS_PER_ROUND - 1);
    const usedIndices = new Set<number>();
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      let idx = Math.round(i * step);
      while (usedIndices.has(idx) && idx < sortedByDifficulty.length - 1) {
        idx++;
      }
      usedIndices.add(idx);
      const src = sortedByDifficulty[idx];
      picked.push({
        ...src,
        id: `en-r15-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      });
    }
  }

  return picked.sort((a, b) => {
    const lenA = a.en.replace(/[^a-zA-Z]/g, '').length;
    const lenB = b.en.replace(/[^a-zA-Z]/g, '').length;
    return lenA - lenB;
  });
}

function getActiveQuizList(cfg?: GameConfig): EnglishQuizItem[] {
  if (
    cfg &&
    Array.isArray(cfg.customQuizQuestions) &&
    cfg.customQuizQuestions.length > 0
  ) {
    return cfg.customQuizQuestions;
  }
  return build15MinuteTieredRoundQuestions(cfg);
}

function getLessonPhaseOrder(phase: ClassBoardRuntimeState['phase']): number {
  switch (phase) {
    case 'lesson_start':
      return 0;
    case 'preparing':
      return 1;
    case 'asking':
      return 2;
    case 'answer_flash':
      return 3;
    case 'result_summary':
      return 4;
    case 'ranking_board':
    case 'round_end':
    case 'reveal':
      return 5;
    case 'record_notice':
      return 6;
    case 'punishment_notice':
      return 7;
    default:
      return 0;
  }
}

function consumeCurrentAndGetNextQuizQueue(
  cfg: GameConfig,
  currentIdx: number,
  currentQuestion?: EnglishQuizItem | null,
  forceNewRound15 = false
): { nextQuizList: EnglishQuizItem[]; nextQuiz: EnglishQuizItem } {
  const currentList = getActiveQuizList(cfg);
  const safeIdx =
    currentList.length > 0 ? Math.max(0, currentIdx % currentList.length) : 0;
  let remaining = forceNewRound15 ? [] : currentList.slice(safeIdx + 1);

  const curEnLower = currentQuestion?.en?.trim().toLowerCase() || '';
  const curId = currentQuestion?.id || '';
  if (!forceNewRound15 && (curEnLower || curId)) {
    while (
      remaining.length > 0 &&
      ((curId && remaining[0].id === curId) ||
        (curEnLower && remaining[0].en.trim().toLowerCase() === curEnLower))
    ) {
      remaining = remaining.slice(1);
    }
  }

  if (remaining.length === 0) {
    remaining = build15MinuteTieredRoundQuestions(cfg, curEnLower);
  }
  return {
    nextQuizList: remaining,
    nextQuiz: remaining[0] || ENGLISH_QUIZ_QUESTIONS[0],
  };
}

function getQuizRankPoints(
  rankOneBased: number,
  itemOrDeckName?: EnglishQuizItem | string | null
): number {
  return getQuizPointsForRank(rankOneBased, itemOrDeckName);
}

// Quy ước mới: EXP = Điểm tích lũy (cứ mỗi 20 điểm EXP lên 1 cấp Rank: 0..19 = Lv.1, 20..39 = Lv.2, ...)
function getStudentLevelFromExp(exp: number): number {
  return Math.floor(Math.max(0, Math.floor(Number(exp) || 0)) / 20) + 1;
}

const STUDENT_EXP_LS_KEY = 'chua_student_exp_v1';
const STUDENT_EXP_IDB_KEY = 'classroom_student_exp_v1';

// Giải pháp 3: Chỉ lưu những người có EXP > 0 (loại bỏ hoàn toàn dữ liệu rác EXP = 0)
function serializeStudentExpMap(
  map: Map<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  map.forEach((expVal, rawKey) => {
    const cleanKey = (rawKey || '').trim().toLowerCase();
    const safeExp = Math.floor(Number(expVal) || 0);
    if (cleanKey && safeExp > 0) {
      out[cleanKey] = safeExp;
    }
  });
  return out;
}

function pickRandomLessonPrepSpeech(cfg: GameConfig): string {
  const list = Array.isArray(cfg.lessonPrepareTtsTexts)
    ? cfg.lessonPrepareTtsTexts.map((s) => (s || '').trim()).filter(Boolean)
    : [];
  if (list.length > 0) {
    return list[Math.floor(Math.random() * list.length)];
  }
  return (cfg.lessonPrepareTtsText || 'Chuẩn bị').trim() || 'Chuẩn bị';
}

function getTeacherSideGiftPos(
  teacherX: number,
  teacherY: number,
  studentRefX: number
): Point2D {
  const sideGap = 42;
  const preferLeft = studentRefX <= teacherX;
  const leftCandidate = teacherX - sideGap;
  const rightCandidate = teacherX + sideGap;
  let finalX: number;
  if (preferLeft) {
    finalX = leftCandidate >= 38 ? leftCandidate : Math.min(502, rightCandidate);
  } else {
    finalX = rightCandidate <= 502 ? rightCandidate : Math.max(38, leftCandidate);
  }
  return {
    x: Math.round(Math.max(38, Math.min(502, finalX))),
    y: Math.round(teacherY + 2),
  };
}

function formatShortQuizAnswer(word: string): string {
  const clean = (word || '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/**
 * Tạo câu trả lời sai tự nhiên của NPC bằng cách hoán đổi ngẫu nhiên vị trí 2 chữ cái liền nhau khác nhau.
 * Hệ thống chấm điểm sẽ tự động nhận diện đây là câu trả lời sai.
 */
function buildTypoQuizAnswer(word: string): string {
  const clean = formatShortQuizAnswer(word);
  if (clean.length < 2) {
    return `${clean}a`;
  }
  const chars = clean.split('');
  const validSwapPositions: number[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (
      /[a-zA-Z]/.test(chars[i]) &&
      /[a-zA-Z]/.test(chars[i + 1]) &&
      chars[i].toLowerCase() !== chars[i + 1].toLowerCase()
    ) {
      validSwapPositions.push(i);
    }
  }

  if (validSwapPositions.length > 0) {
    const idx =
      validSwapPositions[Math.floor(Math.random() * validSwapPositions.length)];
    const temp = chars[idx];
    chars[idx] = chars[idx + 1];
    chars[idx + 1] = temp;
    const swapped = chars.join('');
    return swapped.charAt(0).toUpperCase() + swapped.slice(1).toLowerCase();
  }

  return `${clean}e`;
}

function isJoinClassCommand(text: string): boolean {
  const lower = (text || '').trim().toLowerCase();
  return lower.includes('vào lớp') || lower.includes('vao lop');
}

function parseGenderCommand(text: string): 'male' | 'female' | null {
  const lower = (text || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('1nam') || /\b1\s*nam\b/i.test(lower)) {
    return 'male';
  }
  if (
    lower.includes('1nu') ||
    lower.includes('1nữ') ||
    /\b1\s*(nu|nữ)\b/i.test(lower)
  ) {
    return 'female';
  }
  return null;
}

// Offset đứng chùm ngay cửa lớp (đứng chùm lên nhau trong bán kính hẹp)
const DOOR_CLUSTER_OFFSETS: Point2D[] = [
  { x: 0, y: 0 },
  { x: 6, y: -4 },
  { x: -6, y: 4 },
  { x: 5, y: 5 },
  { x: -5, y: -5 },
  { x: 9, y: 1 },
  { x: -8, y: -1 },
  { x: 2, y: -7 },
  { x: -2, y: 7 },
  { x: 8, y: -6 },
  { x: -8, y: 6 },
  { x: 11, y: 3 },
  { x: -10, y: -3 },
  { x: 4, y: 8 },
  { x: -4, y: -8 },
  { x: 12, y: -2 },
  { x: -12, y: 2 },
  { x: 0, y: -9 },
  { x: 0, y: 9 },
  { x: 7, y: 7 },
];

function buildDoorCrowdPool(
  maxClusterCount: number,
  centerPos: Point2D,
  prevPool: PilgrimData[],
  _names: string[],
  avatars: string[],
  spread: number = 1,
  queuedEntries: QueuedPilgrimRequest[] = []
): PilgrimData[] {
  const safeMax = Math.max(0, Math.min(20, Math.round(maxClusterCount)));
  // Đồng bộ số bạn đứng trong đám đông hàng chờ với danh sách hàng chờ thực tế, giới hạn bởi số lượng tối đa trong dev nhóm học sinh đứng chùm
  const effectiveCount = Math.min(safeMax, queuedEntries.length);
  if (effectiveCount <= 0) return [];

  const safeSpread = Math.max(
    0.1,
    Math.min(4.0, Number.isFinite(spread) ? spread : 1)
  );
  const safeAvatars = avatars.length > 0 ? avatars : DEFAULT_NPC_AVATARS;
  const nextPool: PilgrimData[] = [];
  const usedIds = new Set<number>();

  for (let i = 0; i < effectiveCount; i++) {
    const qItem = queuedEntries[i];
    const qName = (qItem?.username || `Học Sinh #${i + 1}`).trim();
    const qLower = qName.toLowerCase();
    const off = DOOR_CLUSTER_OFFSETS[i % DOOR_CLUSTER_OFFSETS.length];
    const px = Math.round(centerPos.x + off.x * safeSpread);
    const py = Math.round(centerPos.y + off.y * safeSpread);

    const existingByName = prevPool.find(
      (p) => p.username.trim().toLowerCase() === qLower && !usedIds.has(p.id)
    );

    if (existingByName) {
      usedIds.add(existingByName.id);
      nextPool.push({
        ...existingByName,
        username: qName,
        gender:
          qItem?.gender ||
          existingByName.gender ||
          detectVietnameseGender(qName),
        isBot: Boolean(qItem?.isBot),
        avatarUrl: qItem?.avatarUrl ?? existingByName.avatarUrl,
        x: px,
        y: py,
        laneX: px,
        slotX: px,
        slotY: py,
      });
    } else {
      let negId = -(i + 1);
      while (usedIds.has(negId)) {
        negId -= 1;
      }
      usedIds.add(negId);
      nextPool.push({
        id: negId,
        username: qName,
        prayer: qItem?.prayer || '',
        gender: qItem?.gender || detectVietnameseGender(qName),
        isVip: false,
        isBot: Boolean(qItem?.isBot),
        coins: qItem?.coins || 0,
        offeringType: 'incense',
        slotId: null,
        x: px,
        y: py,
        laneX: px,
        slotX: px,
        slotY: py,
        speed: 0,
        state: 'wait_for_vip_slot',
        stateTimer: 2.5,
        prayTimer: 0,
        totalPrayDuration: 999999,
        animTime: i * 0.7,
        facingLeft: false,
        avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        avatarUrl:
          qItem?.avatarUrl || safeAvatars[i % safeAvatars.length] || null,
        hairSeed: i + 1,
        hasComment: false,
        chatBubbleUntil: 0,
      });
    }
  }
  return nextPool;
}

interface PendingGiftEntry {
  key: string;
  username: string;
  prayer: string;
  coins: number;
  comboCount: number;
  giftName: string;
  avatarUrl?: string | null;
  isBot: boolean;
  addedAt: number;
}

function detectVietnameseGender(name: string): 'female' | 'male' {
  const lower = (name || '').toLowerCase();
  const femaleHints = [
    'thị', 'nhi', 'linh', 'hà', 'ánh', 'duyên', 'vy', 'ngọc', 'yến', 'trang',
    'hương', 'thảo', 'mai', 'lan', 'phương', 'trâm', 'quỳnh', 'nhung', 'hạnh',
  ];
  for (const h of femaleHints) {
    if (lower.includes(h)) return 'female';
  }
  return Math.random() < 0.5 ? 'female' : 'male';
}

function getOfferingTypeFromCoins(coins: number): OfferingGiftType {
  if (coins >= 30) return 'special_tray';
  if (coins >= 10) return 'tray';
  if (coins >= 5) return 'lotus';
  if (coins >= 1) return 'rose';
  return 'incense';
}

function pickRandomTemplate(list: string[] | undefined, fallback: string): string {
  if (Array.isArray(list) && list.length > 0) {
    const valid = list.map((s) => s.trim()).filter(Boolean);
    if (valid.length > 0) {
      return valid[Math.floor(Math.random() * valid.length)];
    }
  }
  return fallback;
}

export function useClassroomEngine() {
  const [config, setConfig] = useState<GameConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.config) {
          const savedGuideItems = parsed.config.hudLayout?.guideItems;
          const hasNewGiftGuide =
            Array.isArray(savedGuideItems) &&
            savedGuideItems.some((it: { id?: string }) => it.id === 'pig' || it.id === 'vip');
          const savedCats = parsed.config.npcSpeechCategories;
          const savedStartText = parsed.config.lessonStartTtsText;
          const isOldDefaultStartText =
            !savedStartText ||
            savedStartText.includes('Chào mừng các em đến với tiết Tiếng Anh lớp 12A1');
          const needsDeckSchemaReset =
            Number(parsed.config.quizDeckSchemaVersion || 0) <
            QUIZ_DECK_SCHEMA_VERSION;
          const mergedDecks = ensureTieredQuizDecksLoaded(
            parsed.config.quizDecks,
            needsDeckSchemaReset
          );
          const mergedCfg: GameConfig = {
            ...DEFAULT_CONFIG,
            ...parsed.config,
            quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
            quizDecks: mergedDecks,
            activeQuizDeckId:
              !needsDeckSchemaReset &&
              parsed.config.activeQuizDeckId &&
              mergedDecks.some((d) => d.id === parsed.config.activeQuizDeckId)
                ? parsed.config.activeQuizDeckId
                : mergedDecks[0]?.id || 'deck-tienganh-de',
            lessonStartTtsText: isOldDefaultStartText
              ? DEFAULT_CONFIG.lessonStartTtsText
              : savedStartText,
            lessonRoundEndTtsTemplate:
              parsed.config.lessonRoundEndTtsTemplate ||
              DEFAULT_CONFIG.lessonRoundEndTtsTemplate,
            spawnPoint: LEFT_DOOR_POS,
            exitPoint: LEFT_DOOR_POS,
            npcSpeechCategories: {
              idle: Array.isArray(savedCats?.idle)
                ? savedCats.idle
                : DEFAULT_NPC_SPEECH_CATEGORIES.idle,
              question: Array.isArray(savedCats?.question)
                ? savedCats.question
                : DEFAULT_NPC_SPEECH_CATEGORIES.question,
              reply: Array.isArray(savedCats?.reply)
                ? savedCats.reply
                : DEFAULT_NPC_SPEECH_CATEGORIES.reply,
            },
            giftModelScales: {
              ...DEFAULT_GIFT_MODEL_SCALES,
              ...(parsed.config.giftModelScales || {}),
              maxDeskCats: 1,
            },
            grid: { ...DEFAULT_CONFIG.grid, ...(parsed.config.grid || {}) },
            hudLayout: {
              ...DEFAULT_CONFIG.hudLayout,
              ...(parsed.config.hudLayout || {}),
              waitingQueueTitle:
                !parsed.config.hudLayout?.waitingQueueTitle ||
                parsed.config.hudLayout?.waitingQueueTitle === 'Hàng Chờ Vào Lớp'
                  ? 'Hàng chờ học ké'
                  : parsed.config.hudLayout.waitingQueueTitle,
              waitingQueueMaxRanks: [8, 16, 20, 24, 28].includes(
                Number(parsed.config.hudLayout?.waitingQueueMaxRanks)
              )
                ? Number(parsed.config.hudLayout.waitingQueueMaxRanks)
                : 8,
              guideItems: hasNewGiftGuide
                ? savedGuideItems
                : DEFAULT_GUIDE_ITEMS,
            },
          };
          const isOld9321Queue =
            Array.isArray(mergedCfg.customQuizQuestions) &&
            mergedCfg.customQuizQuestions.length === 15 &&
            (mergedCfg.customQuizQuestions[8]?.quizLevel === 'easy' ||
              mergedCfg.customQuizQuestions[14]?.quizLevel === 'omg');
          const hasValidNewQueue =
            !needsDeckSchemaReset &&
            !isOld9321Queue &&
            Array.isArray(mergedCfg.customQuizQuestions) &&
            mergedCfg.customQuizQuestions.length > 0 &&
            mergedCfg.customQuizQuestions.some((q) => Boolean(q?.quizLevel || q?.deckName));
          if (!hasValidNewQueue) {
            mergedCfg.customQuizQuestions =
              build15MinuteTieredRoundQuestions(mergedCfg);
          }
          return mergedCfg;
        }
      }
    } catch {
      // Ignore
    }
    const initDecks = ensureTieredQuizDecksLoaded([], true);
    const baseCfg: GameConfig = {
      ...DEFAULT_CONFIG,
      quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
      quizDecks: initDecks,
      activeQuizDeckId: initDecks[0]?.id || 'deck-tienganh-de',
    };
    return {
      ...baseCfg,
      customQuizQuestions: build15MinuteTieredRoundQuestions(baseCfg),
    };
  });

  const [vipSlots, setVipSlots] = useState<KneelSlot[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.vipSlots) && parsed.vipSlots.length > 0) {
          return parsed.vipSlots.map((s: KneelSlot, idx: number) => ({
            ...s,
            id: s.id || `vip-${idx}`,
            isVip: true,
            occupiedById: null,
          }));
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [normalSlots, setNormalSlots] = useState<KneelSlot[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedNorm = Array.isArray(parsed.normalSlots) ? parsed.normalSlots : [];
        if (savedNorm.length > 0) {
          return savedNorm.map((s: KneelSlot, idx: number) => ({
            ...s,
            id: s.id || `norm-${idx}`,
            isVip: false,
            occupiedById: null,
          }));
        }
      }
    } catch {
      // Ignore
    }
    return INITIAL_NORMAL_SLOTS;
  });

  const [npcNames, setNpcNames] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.npcNames) && parsed.npcNames.length > 0) {
          return parsed.npcNames;
        }
      }
    } catch {
      // Ignore
    }
    return SAMPLE_NAMES;
  });

  const [npcPrayers, setNpcPrayers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.npcPrayers) && parsed.npcPrayers.length > 0) {
          return parsed.npcPrayers;
        }
      }
    } catch {
      // Ignore
    }
    return SAMPLE_PRAYERS;
  });

  const [npcAvatars, setNpcAvatars] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.npcAvatars) && parsed.npcAvatars.length > 0) {
          return parsed.npcAvatars;
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_NPC_AVATARS;
  });

  const [pilgrims, setPilgrims] = useState<PilgrimData[]>([]);
  const [doorCrowd, setDoorCrowd] = useState<PilgrimData[]>([]);
  const [controlledNpcRole, setControlledNpcRole] =
    useState<ControlledNpcRole>(null);
  const [monks, setMonks] = useState<TempleMonkData[]>(INITIAL_MONKS);
  const [lotusDonors, setLotusDonors] = useState<DonorEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.lotusDonors)) {
          return parsed.lotusDonors;
        }
      }
    } catch {
      // Ignore
    }
    return INITIAL_DONORS;
  });
  const [dailyRecords, setDailyRecords] = useState<DailyRecordEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.dailyRecords) && parsed.dailyRecords.length > 0) {
          return parsed.dailyRecords.slice(0, 5);
        }
      }
    } catch {
      // Ignore
    }
    return INITIAL_DONORS.slice(0, 5).map((d, idx) => ({
      username: d.username,
      points: d.coins,
      avatarUrl: DEFAULT_NPC_AVATARS[idx % DEFAULT_NPC_AVATARS.length],
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
      updatedAt: Date.now() - idx * 1000,
    }));
  });
  const [floatingToasts, setFloatingToasts] = useState<FloatingToastItem[]>([]);
  const [customAssets, setCustomAssets] = useState<CustomAssetsConfig>(DEFAULT_SPRITESHEETS);

  const [classBoardState, setClassBoardState] = useState<ClassBoardRuntimeState>(() => {
    const quizList = getActiveQuizList(config);
    const startText =
      config.lessonStartTtsText ||
      'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 15 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.';
    return {
      engine: config.hudLayout.classBoardEngine || 'english_quiz',
      isRunning: true,
      roundSeq: 1,
      roundQuestionIndex: 0,
      questionIndex: 0,
      totalQuestions: QUESTIONS_PER_ROUND,
      currentQuestion: quizList[0],
      phase: 'lesson_start',
      lessonStepNumber: 0,
      lessonStartText: startText,
      activeFlowToken: 'flow_init_0',
      ttsFinishedForPhase: false,
      elapsedPhaseMs: 0,
      timeLeftMs: 12000,
      totalDurationMs: 12000,
      winners: [],
      classWinners: [],
      outsideWinners: [],
      showResultEngine: false,
      seatUpdateTriggered: false,
    };
  });

  const [grandEventProgress, setGrandEventProgress] = useState(0);
  const [goldenLotusRainUntil, setGoldenLotusRainUntil] = useState(0);
  const [moneyRainUntil, setMoneyRainUntil] = useState(0);
  const [latestAltarOffering, setLatestAltarOffering] = useState<OfferingGiftType>('rose');
  const [burnerLotusBursts, setBurnerLotusBursts] = useState<BurnerLotusBurstFX[]>([]);
  const [flyingLotuses, setFlyingLotuses] = useState<FlyingLotusFX[]>([]);
  const [runningPigs, setRunningPigs] = useState<RunningPigAgent[]>([]);
  const [roamingCats, setRoamingCats] = useState<RoamingCatAgent[]>([]);
  const [specialFlowerRunners, setSpecialFlowerRunners] = useState<PilgrimData[]>([]);
  const [flyingFlowers, setFlyingFlowers] = useState<FlyingFlowerFX[]>([]);
  const [simpleExplosions, setSimpleExplosions] = useState<SimpleExplosionFX[]>([]);
  const [eventBarFlashKey, setEventBarFlashKey] = useState(0);

  // State Sự Kiện "Zombie tấn công" ("Sự kiện đẩy lùi Zombie")
  const [zombieEventState, setZombieEventState] = useState<ZombieEventRuntimeState>(() => ({
    isActive: false,
    isQueued: false,
    phase: 'idle',
    level: config.zombieLevel || 1,
    hp: config.zombieMaxHp || 10000,
    maxHp: config.zombieMaxHp || 10000,
    trailHp: config.zombieMaxHp || 10000,
    hpShakeKey: 0,
    topDamagers: [],
    elapsedPhaseMs: 0,
    timeLeftMs: 0,
    totalDurationMs: 0,
    ttsFinishedForPhase: false,
    resumeLessonAfterEvent: true,
  }));
  const [zombieEntity, setZombieEntity] = useState<ZombieEntityState>(() => ({
    visible: false,
    x: config.zombieSpawnPos?.x ?? 42,
    y: config.zombieSpawnPos?.y ?? 520,
    targetX: config.zombieStandPos?.x ?? 270,
    targetY: config.zombieStandPos?.y ?? 486,
    isWalking: false,
    facing: 'right',
    recoilOffsetX: 0,
    recoilOffsetY: 0,
    isDying: false,
    dyingProgress: 0,
    animTime: 0,
    hitFlashUntil: 0,
  }));
  const [zombieProjectiles, setZombieProjectiles] = useState<ZombieProjectileFX[]>([]);
  const [zombieSpikyDamages, setZombieSpikyDamages] = useState<ZombieSpikyDamageFX[]>([]);
  const [flyingMilkTeas, setFlyingMilkTeas] = useState<FlyingMilkTeaFX[]>([]);

  const [cameraFocus, setCameraFocus] = useState<CameraFocusState>({
    pilgrimId: null,
    until: 0,
  });
  const [cameraQueue, setCameraQueue] = useState<CameraQueueItem[]>([]);

  const [safetyActionMode, setSafetyActionMode] = useState<SafetyActionMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed.safetyActionMode === 'purify' ||
          parsed.safetyActionMode === 'block' ||
          parsed.safetyActionMode === 'mask'
        ) {
          return parsed.safetyActionMode;
        }
      }
    } catch {
      // Ignore
    }
    return 'purify';
  });
  const [safetyCategories, setSafetyCategories] = useState<SafetyCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.safetyCategories) && parsed.safetyCategories.length > 0) {
          const enabledMap = new Map<string, boolean>();
          parsed.safetyCategories.forEach((c: { key?: string; enabled?: boolean }) => {
            if (c && typeof c.key === 'string' && typeof c.enabled === 'boolean') {
              enabledMap.set(c.key, c.enabled);
            }
          });
          return INITIAL_SAFETY_CATEGORIES.map((cat) =>
            enabledMap.has(cat.key)
              ? { ...cat, enabled: enabledMap.get(cat.key)! }
              : cat
          );
        }
      }
    } catch {
      // Ignore
    }
    return INITIAL_SAFETY_CATEGORIES;
  });
  const [customWords, setCustomWords] = useState<string[]>(() =>
    loadSavedCustomWords()
  );
  const [safetyLogs, setSafetyLogs] = useState<SafetyLogEntry[]>([]);

  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>(() =>
    syncService.getStatus()
  );
  const [peerCounts, setPeerCounts] = useState({ totalPeers: 1, obsPeers: 0 });
  const [isLocalTabMuted, setIsLocalTabMuted] = useState(() =>
    soundEngine.isTabMuted()
  );
  const [ttsStatus, setTtsStatus] = useState<{ text: string; active: boolean }>({
    text: 'Sẵn sàng',
    active: false,
  });
  const [eventTtsQueue, setEventTtsQueue] = useState<EventTtsQueueSnapshot>(() =>
    soundEngine.getEventQueueSnapshot()
  );

  const configRef = useRef(config);
  configRef.current = config;
  const peerCountsRef = useRef(peerCounts);
  peerCountsRef.current = peerCounts;
  const classBoardStateRef = useRef(classBoardState);
  classBoardStateRef.current = classBoardState;
  const zombieEventStateRef = useRef(zombieEventState);
  zombieEventStateRef.current = zombieEventState;
  const zombieEntityRef = useRef(zombieEntity);
  zombieEntityRef.current = zombieEntity;
  const zombieDamageMapRef = useRef<Map<string, ZombieDamageEntry>>(new Map());
  const zombieHeartBatchRef = useRef<{
    seatedByUser: Map<string, number>;
    queueByUser: Map<string, number>;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    seatedByUser: new Map(),
    queueByUser: new Map(),
    timer: null,
  });
  const specialZombieGiftProjQueueRef = useRef<{
    isFlying: boolean;
    queue: Array<{
      attackerUsername: string;
      startX: number;
      startY: number;
      damage: number;
      kind: ZombieProjectileKind;
      giftId?: ClassroomGiftEventId;
      giftCoins?: number;
      isSeated: boolean;
      avatarColor?: string;
      avatarUrl?: string | null;
      isBot?: boolean;
      skipIndividualScoreRecord?: boolean;
    }>;
    nextLaunchTimer: ReturnType<typeof setTimeout> | null;
  }>({
    isFlying: false,
    queue: [],
    nextLaunchTimer: null,
  });
  const fireZombieAttackProjectileRef = useRef<
    ((opts: {
      attackerUsername: string;
      startX: number;
      startY: number;
      damage: number;
      kind: ZombieProjectileKind;
      giftId?: ClassroomGiftEventId;
      giftCoins?: number;
      isSeated: boolean;
      avatarColor?: string;
      avatarUrl?: string | null;
      isBot?: boolean;
      skipIndividualScoreRecord?: boolean;
      delayMs?: number;
      deferStateAppend?: boolean;
      bypassSpecialGiftQueue?: boolean;
    }) => ZombieProjectileFX | null) | null
  >(null);
  const vipSlotsRef = useRef(vipSlots);
  vipSlotsRef.current = vipSlots;
  const normalSlotsRef = useRef(normalSlots);
  normalSlotsRef.current = normalSlots;
  const pilgrimsRef = useRef(pilgrims);
  pilgrimsRef.current = pilgrims;

  // Lấy đúng tọa độ (x, y) của từng học sinh đang ngồi ở bàn học phía dưới lớp
  const getSeatedStudentLaunchPos = useCallback((st: PilgrimData): Point2D => {
    const allSlots = [...vipSlotsRef.current, ...normalSlotsRef.current];
    const matchedSlot = st.slotId
      ? allSlots.find((s) => s.id === st.slotId)
      : undefined;
    const slotX = matchedSlot?.x ?? st.slotX ?? st.x;
    const slotY = matchedSlot?.y ?? st.slotY ?? st.y;
    const isAtDesk =
      st.state === 'pray_seated' || Math.hypot(st.x - slotX, st.y - slotY) <= 36;
    return {
      x: isAtDesk ? st.x : slotX,
      y: (isAtDesk ? st.y : slotY) - 18,
    };
  }, []);
  const doorCrowdRef = useRef(doorCrowd);
  doorCrowdRef.current = doorCrowd;
  const doorCrowdCursorRef = useRef(0);
  // Giới hạn hiển thị chatbox của học sinh hàng chờ (doorCrowd): mỗi 3s show tối đa 10 chat mới nhất
  const doorCrowdChatWindowRef = useRef<{
    windowStart: number;
    shownCount: number;
    pendingQueue: Array<{
      username: string;
      lowerUser: string;
      comment: string;
      gender: 'female' | 'male';
      avatarUrl?: string | null;
      isBot: boolean;
      allowTTS: boolean;
    }>;
    flushTimer: ReturnType<typeof setTimeout> | null;
  }>({
    windowStart: 0,
    shownCount: 0,
    pendingQueue: [],
    flushTimer: null,
  });
  const controlledNpcRoleRef = useRef(controlledNpcRole);
  controlledNpcRoleRef.current = controlledNpcRole;
  const wasdKeysRef = useRef<{ w: boolean; a: boolean; s: boolean; d: boolean }>({
    w: false,
    a: false,
    s: false,
    d: false,
  });
  const monksRef = useRef(monks);
  monksRef.current = monks;
  const lotusDonorsRef = useRef(lotusDonors);
  lotusDonorsRef.current = lotusDonors;
  const dailyRecordsRef = useRef(dailyRecords);
  dailyRecordsRef.current = dailyRecords;
  const lastPraisedRecordTop1Ref = useRef<string>(
    dailyRecords[0]?.username?.trim().toLowerCase() || ''
  );
  const pendingRecordNoticeRef = useRef<{
    username: string;
    points: number;
    avatarUrl?: string | null;
    avatarColor?: string;
    previousTop1Username?: string;
  } | null>(null);
  const flow5CameraLockTimerRef = useRef<number | null>(null);
  const flow5LockedStudentIdRef = useRef<number | null>(null);
  const npcNamesRef = useRef(npcNames);
  npcNamesRef.current = npcNames;
  const npcPrayersRef = useRef(npcPrayers);
  npcPrayersRef.current = npcPrayers;
  const npcAvatarsRef = useRef(npcAvatars);
  npcAvatarsRef.current = npcAvatars;

  const nextIdRef = useRef(1);
  const userGenderOverridesRef = useRef<Map<string, 'female' | 'male'>>(
    new Map()
  );
  // Kho dữ liệu ngầm O(1) lưu toàn bộ học sinh trong Hàng Chờ (200-500+ người không gây lag)
  const waitingPoolRef = useRef<Map<string, QueuedPilgrimRequest>>(new Map());
  // State UI chỉ giữ Top 15 người có Rank cao nhất để hiển thị lên bảng Hàng Chờ
  const waitingQueueRef = useRef<QueuedPilgrimRequest[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<QueuedPilgrimRequest[]>([]);
  const [queueCount, setQueueCount] = useState(0);

  // Danh sách học sinh tách biệt chạy từ đám đông lên tặng hoa cho Cô/Thầy rồi quay về đám đông biến mất
  const specialFlowerRunnersRef = useRef<PilgrimData[]>([]);
  specialFlowerRunnersRef.current = specialFlowerRunners;

  // Hàng chờ học sinh tách biệt chạy tặng hoa từ đám đông cửa lớp (đảm bảo di chuyển tuần tự cho từng người)
  const pendingDetachedRunnersRef = useRef<PilgrimData[]>([]);

  // Hàng chờ hành động tặng quà tuần tự (đầy đủ 7 loại: rose, icecream, cat, gg, heart, pig, vip) cho từng người chơi
  const pendingGiftActionsByUserRef = useRef<
    Map<
      string,
      Array<{
        id: string;
        giftId: ClassroomGiftEventId;
        comment: string;
        comboCount?: number;
        isDeferredFromQueue?: boolean;
        addedAt: number;
      }>
    >
  >(new Map());

  // Theo dõi chuỗi Combo tặng quà liên tiếp của từng người chơi (tự động lên Combo x2, x3... nếu tặng liên tiếp hoặc truyền comboCount > 1)
  const userGiftComboStreakRef = useRef<
    Map<string, { count: number; lastAt: number }>
  >(new Map());

  // Hàng chờ phạt đứng trước bảng sau Luồng 6 (dành cho nhóm quà phạt đặc biệt 5 / 10 / 10+ tương ứng x3 / x6 / x9)
  const punishmentWaitingQueueRef = useRef<
    Array<{ username: string; multiplier: 3 | 6 | 9; addedAt: number }>
  >([]);

  const resolveUserGender = useCallback(
    (username: string, explicitGender?: 'female' | 'male'): 'female' | 'male' => {
      const lower = (username || '').trim().toLowerCase();
      if (explicitGender) {
        if (lower) userGenderOverridesRef.current.set(lower, explicitGender);
        return explicitGender;
      }
      if (lower && userGenderOverridesRef.current.has(lower)) {
        return userGenderOverridesRef.current.get(lower)!;
      }
      const detected = detectVietnameseGender(username);
      if (lower) userGenderOverridesRef.current.set(lower, detected);
      return detected;
    },
    []
  );

  const topStreakTrackerRef = useRef<{
    flow5LastFastestUser: string;
    flow5LastFastestDisplay: string;
    flow5Streak: number;
    flow6LastTop1User: string;
    flow6Streak: number;
  }>({
    flow5LastFastestUser: '',
    flow5LastFastestDisplay: '',
    flow5Streak: 0,
    flow6LastTop1User: '',
    flow6Streak: 0,
  });

  // Bộ lọc đảm bảo tỉ lệ Nam - Nữ gần 50-50 khi NPC vào lớp hoặc vào hàng chờ
  const resolveBalancedNpcGender = useCallback(
    (
      username: string,
      targetGroup: 'class' | 'queue' = 'class',
      explicitGender?: 'female' | 'male'
    ): 'female' | 'male' => {
      const lower = (username || '').trim().toLowerCase();
      if (explicitGender) {
        if (lower) userGenderOverridesRef.current.set(lower, explicitGender);
        return explicitGender;
      }

      let maleCount = 0;
      let femaleCount = 0;
      if (targetGroup === 'class') {
        for (const p of pilgrimsRef.current) {
          if (
            p.slotId !== null &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
          ) {
            if (p.gender === 'female') femaleCount++;
            else maleCount++;
          }
        }
      } else {
        for (const q of waitingPoolRef.current.values()) {
          if (q.gender === 'female') femaleCount++;
          else maleCount++;
        }
      }

      let chosen: 'female' | 'male';
      if (maleCount > femaleCount) {
        chosen = 'female';
      } else if (femaleCount > maleCount) {
        chosen = 'male';
      } else {
        chosen = detectVietnameseGender(username);
      }

      if (lower) userGenderOverridesRef.current.set(lower, chosen);
      return chosen;
    },
    []
  );

  // Áp dụng hiển thị tối đa 10 chat mới nhất mỗi 3 giây cho nhóm học sinh hàng chờ (doorCrowd)
  const applyDoorCrowdChatItems = useCallback(
    (
      items: Array<{
        username: string;
        lowerUser: string;
        comment: string;
        gender: 'female' | 'male';
        avatarUrl?: string | null;
        isBot: boolean;
        allowTTS: boolean;
      }>
    ) => {
      if (items.length === 0 || doorCrowdRef.current.length === 0) return;
      const now = Date.now();
      const cfg = configRef.current;
      const bubbleUntil = now + (cfg.chatBubbleDurationSec || 12) * 1000;
      let pool = [...doorCrowdRef.current];
      const poolLen = pool.length;

      items.forEach((item) => {
        // Ưu tiên 1: Học sinh trong nhóm cửa lớp đã mang tên người này
        let targetIdx = pool.findIndex(
          (s) => s.username.trim().toLowerCase() === item.lowerUser
        );

        // Ưu tiên 2: Chọn ngẫu nhiên 1 học sinh trong nhóm cửa lớp đang rảnh (đã tắt bong bóng chat)
        if (targetIdx < 0) {
          const freeIndices: number[] = [];
          for (let i = 0; i < poolLen; i++) {
            if (!pool[i].chatBubbleUntil || pool[i].chatBubbleUntil! <= now) {
              freeIndices.push(i);
            }
          }
          if (freeIndices.length > 0) {
            targetIdx =
              freeIndices[Math.floor(Math.random() * freeIndices.length)];
          }
        }

        // Ưu tiên 3: Nếu tất cả đều đang hiện bong bóng, chọn người có bong bóng sắp tắt nhất (cũ nhất)
        if (targetIdx < 0) {
          let oldestIdx = 0;
          let oldestUntil = Infinity;
          for (let i = 0; i < poolLen; i++) {
            const until = pool[i].chatBubbleUntil || 0;
            if (until < oldestUntil) {
              oldestUntil = until;
              oldestIdx = i;
            }
          }
          targetIdx = oldestIdx;
        }

        doorCrowdCursorRef.current = (targetIdx + 1) % poolLen;
        const chosenDoorStudent = pool[targetIdx];

        pool[targetIdx] = {
          ...chosenDoorStudent,
          username: item.username,
          prayer: item.comment,
          gender: item.gender,
          avatarUrl: item.avatarUrl || chosenDoorStudent.avatarUrl,
          hasComment: true,
          stateTimer: 0,
          chatBubbleUntil: bubbleUntil,
        };

        // Chỉ hiển thị bong bóng chat ngoài cửa cho Hàng Chờ, KHÔNG đọc TTS cho học sinh ngoài Hàng Chờ (chỉ đọc comment các bạn trong lớp)
      });

      doorCrowdRef.current = pool;
      setDoorCrowd(pool);
    },
    []
  );

  const enqueueDoorCrowdChat = useCallback(
    (item: {
      username: string;
      lowerUser: string;
      comment: string;
      gender: 'female' | 'male';
      avatarUrl?: string | null;
      isBot: boolean;
      allowTTS: boolean;
    }) => {
      if (doorCrowdRef.current.length === 0) return;
      const now = Date.now();
      const win = doorCrowdChatWindowRef.current;

      // Nếu đã qua chu kỳ 3 giây mới -> reset bộ đếm cửa sổ 3s
      if (now - win.windowStart >= 3000) {
        win.windowStart = now;
        win.shownCount = 0;
      }

      // Nếu trong 3s hiện tại chưa đủ 10 chat và không có hàng đợi -> hiển thị ngay lập tức
      if (win.shownCount < 10 && win.pendingQueue.length === 0) {
        win.shownCount += 1;
        applyDoorCrowdChatItems([item]);
        return;
      }

      // Nếu vượt quá 10 chat trong vòng 3s -> chỉ giữ lại tối đa 10 chat mới nhất trong hàng đợi chờ qua 3s kế tiếp
      const existingIdx = win.pendingQueue.findIndex(
        (q) => q.lowerUser === item.lowerUser
      );
      if (existingIdx >= 0) {
        win.pendingQueue.splice(existingIdx, 1);
      }
      win.pendingQueue.push(item);
      if (win.pendingQueue.length > 10) {
        win.pendingQueue = win.pendingQueue.slice(-10);
      }

      if (!win.flushTimer) {
        const waitMs = Math.max(80, 3000 - (now - win.windowStart));
        win.flushTimer = setTimeout(() => {
          const w = doorCrowdChatWindowRef.current;
          w.flushTimer = null;
          w.windowStart = Date.now();
          const batch = w.pendingQueue.slice(-10);
          w.pendingQueue = [];
          w.shownCount = batch.length;
          if (batch.length > 0) {
            applyDoorCrowdChatItems(batch);
          }
        }, waitMs);
      }
    },
    [applyDoorCrowdChatItems]
  );

  // Đồng bộ nhóm học sinh đứng chùm ở cửa lớp với danh sách hàng chờ thực tế (tuân theo giới hạn tối đa doorCrowdCount)
  useEffect(() => {
    const count = config.doorCrowdCount ?? 7;
    const pos = config.doorCrowdPos || { x: 46, y: 506 };
    const spread = config.doorCrowdSpread ?? 1;
    const queuedList =
      waitingQueue.length >= Math.min(20, count)
        ? waitingQueue
        : Array.from(waitingPoolRef.current.values());
    setDoorCrowd((prev) => {
      const next = buildDoorCrowdPool(
        count,
        pos,
        prev,
        npcNamesRef.current,
        npcAvatarsRef.current,
        spread,
        queuedList
      );
      doorCrowdRef.current = next;
      return next;
    });
  }, [
    config.doorCrowdCount,
    config.doorCrowdPos?.x,
    config.doorCrowdPos?.y,
    config.doorCrowdSpread,
    waitingQueue,
    queueCount,
  ]);

  // Lắng nghe phím WASD khi đang bật chế độ điều khiển Cô Chủ Nhiệm hoặc Thầy Giám Thị (NPC học sinh không di chuyển WASD)
  useEffect(() => {
    if (
      controlledNpcRole !== 'abbot' &&
      controlledNpcRole !== 'senior_novice'
    ) {
      wasdKeysRef.current = { w: false, a: false, s: false, d: false };
      return;
    }

    const isTypingInput = (el: EventTarget | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toUpperCase();
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInput(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') {
        wasdKeysRef.current.w = true;
        if (k === 'arrowup') e.preventDefault();
      } else if (k === 'a' || k === 'arrowleft') {
        wasdKeysRef.current.a = true;
        if (k === 'arrowleft') e.preventDefault();
      } else if (k === 's' || k === 'arrowdown') {
        wasdKeysRef.current.s = true;
        if (k === 'arrowdown') e.preventDefault();
      } else if (k === 'd' || k === 'arrowright') {
        wasdKeysRef.current.d = true;
        if (k === 'arrowright') e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') wasdKeysRef.current.w = false;
      else if (k === 'a' || k === 'arrowleft') wasdKeysRef.current.a = false;
      else if (k === 's' || k === 'arrowdown') wasdKeysRef.current.s = false;
      else if (k === 'd' || k === 'arrowright') wasdKeysRef.current.d = false;
    };

    const handleBlur = () => {
      wasdKeysRef.current = { w: false, a: false, s: false, d: false };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [controlledNpcRole]);

  // Lazy Calculation cho Hàng Chờ:
  // - Nếu finalizeQuizRound === true (chạy đúng 1 lần khi kết thúc câu hỏi):
  //   + Luật mới: Trả lời sai hoặc im lặng KHÔNG reset điểm (giữ nguyên điểm tích lũy trong suốt vòng 15 câu), chỉ hạ cờ answeredCorrectInRound = false.
  // - Nếu resetAllRoundScores === true (chạy khi kết thúc vòng 15 câu):
  //   + Reset toàn bộ điểm của tất cả học sinh trong hàng chờ về 0.
  const recomputeWaitingQueueLazy = useCallback(
    (opts?: {
      finalizeQuizRound?: boolean;
      resetAllRoundScores?: boolean;
    }): Set<string> => {
      const pool = waitingPoolRef.current;
      const resetZeroUsers = new Set<string>();

      if (opts?.resetAllRoundScores) {
        for (const [, item] of pool.entries()) {
          item.points = 0;
          item.answeredCorrectInRound = false;
          item.isGoldenPriority = false;
          item.lastElapsedSec = 999;
          item.idleRounds = 0;
        }
      } else if (opts?.finalizeQuizRound) {
        for (const [, item] of pool.entries()) {
          if (item.isGoldenPriority) {
            item.answeredCorrectInRound = false;
            item.idleRounds = 0;
            continue;
          }
          if (item.answeredCorrectInRound) {
            item.answeredCorrectInRound = false;
            item.idleRounds = 0;
          } else {
            // Luật mới: Trả lời sai không reset điểm, giữ nguyên số điểm để vẫn vô lại lớp được nếu top cao
            item.answeredCorrectInRound = false;
            item.lastElapsedSec = 999;
            item.idleRounds = (item.idleRounds || 0) + 1;
          }
        }

        // Tự động dọn bớt NPC ảo 0 điểm đã chờ quá lâu nếu hàng chờ đông (> 60), tuyệt đối giữ lại người thật (!item.isBot) và người Hóa Vàng
        if (pool.size > 60) {
          for (const [key, item] of pool.entries()) {
            if (
              item.isBot &&
              !item.isGoldenPriority &&
              (item.points || 0) === 0 &&
              (item.idleRounds || 0) >= 2
            ) {
              pool.delete(key);
              if (pool.size <= 45) break;
            }
          }
        }
        // Dự phòng nếu hàng chờ vượt quá 250 người thật im lặng >= 8 câu liên tiếp (0 điểm, không xóa người Hóa Vàng)
        if (pool.size > 250) {
          for (const [key, item] of pool.entries()) {
            if (
              !item.isGoldenPriority &&
              (item.points || 0) === 0 &&
              (item.idleRounds || 0) >= 8
            ) {
              pool.delete(key);
              if (pool.size <= 200) break;
            }
          }
        }
      }

      const allEntries = Array.from(pool.values());
      allEntries.sort((a, b) => {
        // ƯU TIÊN SỐ 1 TUYỆT ĐỐI: Những người chơi có tên Hóa Vàng trong hàng chờ luôn khóa nằm trên đầu, ưu tiên vào lớp hơn cả Top 1 hàng chờ
        if (Boolean(a.isGoldenPriority) !== Boolean(b.isGoldenPriority)) {
          return a.isGoldenPriority ? -1 : 1;
        }
        if (a.isGoldenPriority && b.isGoldenPriority) {
          const ptDiffGold = (b.points || 0) - (a.points || 0);
          if (ptDiffGold !== 0) return ptDiffGold;
          return (a.goldenPriorityAt || a.addedAt || 0) - (b.goldenPriorityAt || b.addedAt || 0);
        }
        const ptDiff = (b.points || 0) - (a.points || 0);
        if (ptDiff !== 0) return ptDiff;
        const timeDiff = (a.lastElapsedSec ?? 999) - (b.lastElapsedSec ?? 999);
        if (timeDiff !== 0) return timeDiff;
        if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
        return (a.addedAt || 0) - (b.addedAt || 0);
      });

      const rebuiltMap = new Map<string, QueuedPilgrimRequest>();
      allEntries.forEach((item, idx) => {
        item.rank = idx + 1;
        rebuiltMap.set(item.username.trim().toLowerCase(), item);
      });
      waitingPoolRef.current = rebuiltMap;

      // Bóc tách Top 40 người có Rank cao nhất để load vào bảng Hàng Chờ Học Ké UI (8/16/32/36/40) và nhóm đứng chùm cửa lớp
      const topSlice = allEntries.slice(0, 40).map((item) => ({ ...item }));
      waitingQueueRef.current = topSlice;
      setWaitingQueue(topSlice);
      setQueueCount(rebuiltMap.size);

      return resetZeroUsers;
    },
    []
  );

  const syncWaitingQueueState = useCallback(
    (nextQueue?: QueuedPilgrimRequest[]) => {
      if (Array.isArray(nextQueue)) {
        const nextMap = new Map<string, QueuedPilgrimRequest>();
        nextQueue.forEach((item, idx) => {
          const k = (item.username || '').trim().toLowerCase();
          if (k) {
            nextMap.set(k, {
              ...item,
              points: item.points || 0,
              rank: item.rank || idx + 1,
            });
          }
        });
        waitingPoolRef.current = nextMap;
      }
      recomputeWaitingQueueLazy();
    },
    [recomputeWaitingQueueLazy]
  );

  // Hàng chờ giữ học sinh tặng quà: chỉ cho bước vào lớp khi tới lượt đọc lời cảm ơn của học sinh đó
  const pendingGiftEntriesRef = useRef<Map<string, PendingGiftEntry>>(new Map());
  const activateGiftPilgrimRef = useRef<(entry: PendingGiftEntry) => void>(() => {});

  // Chống spam lặp lại cùng 1 câu bình luận
  const recentCommentsRef = useRef<Map<string, number>>(new Map());

  // Gom tim liên tục trong vài giây rồi cộng vào thanh sự kiện
  const likeBatchRef = useRef<{
    totalLikes: number;
    byUser: Map<string, number>;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    totalLikes: 0,
    byUser: new Map(),
    timer: null,
  });

  // ============================================================================
  // HỆ THỐNG CẤP ĐỘ & EXP HỌC SINH VĨNH VIỄN (4 GIẢI PHÁP ZERO-LAG + CHUNG FILE JSON)
  // 1. Bảng băm Map<string, number> trong RAM (Quét ID & cộng điểm tức thời O(1))
  // 2. Gom nhịp lưu ngầm (Auto-Save cuối câu hỏi & định kỳ mỗi 10s khi có thay đổi)
  // 3. Chỉ lưu người có EXP > 0 (Loại bỏ rác vãng lai)
  // 4. Lưu bền vững đa tầng: localStorage + IndexedDB + Server JSON + Chung file Backup JSON
  // ============================================================================
  const studentExpMapRef = useRef<Map<string, number>>(new Map());
  const studentExpDirtyRef = useRef<boolean>(false);
  const hasInitializedExpMapRef = useRef<boolean>(false);

  if (!hasInitializedExpMapRef.current) {
    hasInitializedExpMapRef.current = true;
    const initMap = new Map<string, number>();
    const ingestRecord = (rec: unknown) => {
      if (!rec || typeof rec !== 'object') return;
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        const cleanKey = (k || '').trim().toLowerCase();
        const expVal = Math.floor(Number(v) || 0);
        if (cleanKey && expVal > 0) {
          initMap.set(cleanKey, Math.max(initMap.get(cleanKey) || 0, expVal));
        }
      }
    };
    try {
      const savedStudio = localStorage.getItem(STORAGE_KEY);
      if (savedStudio) {
        const parsedStudio = JSON.parse(savedStudio);
        ingestRecord(parsedStudio?.studentExpMap);
      }
    } catch {
      // Ignore
    }
    try {
      const savedExpOnly = localStorage.getItem(STUDENT_EXP_LS_KEY);
      if (savedExpOnly) {
        ingestRecord(JSON.parse(savedExpOnly));
      }
    } catch {
      // Ignore
    }
    studentExpMapRef.current = initMap;
  }

  const getStudentExpById = useCallback((username: string): number => {
    const cleanKey = (username || '').trim().toLowerCase();
    if (!cleanKey) return 0;
    return studentExpMapRef.current.get(cleanKey) || 0;
  }, []);

  const applyExpMapToActiveStudents = useCallback(() => {
    const map = studentExpMapRef.current;
    let changedPilgrims = false;
    const nextPilgrims = pilgrimsRef.current.map((p) => {
      const lower = (p.username || '').trim().toLowerCase();
      const expVal = map.get(lower) || 0;
      const lvlVal = getStudentLevelFromExp(expVal);
      if ((p.exp || 0) !== expVal || (p.level || 1) !== lvlVal) {
        changedPilgrims = true;
        return { ...p, exp: expVal, level: lvlVal };
      }
      return p;
    });
    if (changedPilgrims) {
      pilgrimsRef.current = nextPilgrims;
      setPilgrims(nextPilgrims);
    }

    let changedCrowd = false;
    const nextCrowd = doorCrowdRef.current.map((d) => {
      const lower = (d.username || '').trim().toLowerCase();
      const expVal = map.get(lower) || 0;
      const lvlVal = getStudentLevelFromExp(expVal);
      if ((d.exp || 0) !== expVal || (d.level || 1) !== lvlVal) {
        changedCrowd = true;
        return { ...d, exp: expVal, level: lvlVal };
      }
      return d;
    });
    if (changedCrowd) {
      doorCrowdRef.current = nextCrowd;
      setDoorCrowd(nextCrowd);
    }
  }, []);

  const flushStudentExpStorage = useCallback(
    (replaceAll = false, broadcastSync = true) => {
      studentExpDirtyRef.current = false;
      const serialized = serializeStudentExpMap(studentExpMapRef.current);

      try {
        localStorage.setItem(STUDENT_EXP_LS_KEY, JSON.stringify(serialized));
        const rawFull = localStorage.getItem(STORAGE_KEY);
        if (rawFull) {
          const parsedFull = JSON.parse(rawFull);
          parsedFull.studentExpMap = serialized;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedFull));
        }
      } catch {
        // Ignore quota errors
      }

      void idbSet(STUDENT_EXP_IDB_KEY, serialized);

      fetch('/api/student-exp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentExpMap: serialized, replaceAll }),
      }).catch(() => {
        // Ignore network errors
      });

      if (broadcastSync) {
        syncService.sendCommand('SYNC_STUDENT_EXP', {
          studentExpMap: serialized,
          replaceAll,
        });
      }
    },
    []
  );

  // Giải pháp 2: Auto-save ngầm định kỳ mỗi 10s nếu có thay đổi EXP trên RAM
  useEffect(() => {
    const expTimer = setInterval(() => {
      if (studentExpDirtyRef.current) {
        flushStudentExpStorage(false, true);
      }
    }, 10000);
    return () => clearInterval(expTimer);
  }, [flushStudentExpStorage]);

  // Load saved custom assets & full studio state (including large Base64 MP3s / NPC avatars / NPC lists / Student EXP) from IndexedDB & Server
  useEffect(() => {
    const mergeExpObject = (rec: unknown): boolean => {
      if (!rec || typeof rec !== 'object') return false;
      let hasChange = false;
      const map = studentExpMapRef.current;
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        const cleanKey = (k || '').trim().toLowerCase();
        const expVal = Math.floor(Number(v) || 0);
        if (cleanKey && expVal > 0) {
          const prev = map.get(cleanKey) || 0;
          if (expVal > prev) {
            map.set(cleanKey, expVal);
            hasChange = true;
          }
        }
      }
      return hasChange;
    };

    idbGet<Record<string, number>>(STUDENT_EXP_IDB_KEY).then((savedExp) => {
      if (mergeExpObject(savedExp)) {
        applyExpMapToActiveStudents();
      }
    });

    fetch('/api/student-exp')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.studentExpMap && mergeExpObject(data.studentExpMap)) {
          applyExpMapToActiveStudents();
        }
      })
      .catch(() => {
        // Ignore
      });

    idbGet<Partial<CustomAssetsConfig>>('classroom_custom_assets_v1').then((saved) => {
      if (saved) {
        const isDataUrl = (val: unknown): val is string =>
          typeof val === 'string' && val.startsWith('data:');
        setCustomAssets((prev) => ({
          ...prev,
          ...saved,
          customBgUrl: isDataUrl(saved.customBgUrl)
            ? saved.customBgUrl
            : DEFAULT_SPRITESHEETS.customBgUrl,
          deskModelUrl: isDataUrl(saved.deskModelUrl)
            ? saved.deskModelUrl
            : DEFAULT_SPRITESHEETS.deskModelUrl,
          pilgrimFemaleSpritesheetUrl: isDataUrl(saved.pilgrimFemaleSpritesheetUrl)
            ? saved.pilgrimFemaleSpritesheetUrl
            : null,
          pilgrimMaleSpritesheetUrl: isDataUrl(saved.pilgrimMaleSpritesheetUrl)
            ? saved.pilgrimMaleSpritesheetUrl
            : null,
          abbotSpritesheetUrl: isDataUrl(saved.abbotSpritesheetUrl)
            ? saved.abbotSpritesheetUrl
            : null,
          seniorNoviceSpritesheetUrl: isDataUrl(saved.seniorNoviceSpritesheetUrl)
            ? saved.seniorNoviceSpritesheetUrl
            : null,
        }));
      }
    });

    idbGet<{
      config?: Partial<GameConfig>;
      vipSlots?: KneelSlot[];
      normalSlots?: KneelSlot[];
      npcNames?: string[];
      npcPrayers?: string[];
      npcAvatars?: string[];
      safetyActionMode?: SafetyActionMode;
      safetyCategories?: SafetyCategory[];
      lotusDonors?: DonorEntry[];
      dailyRecords?: DailyRecordEntry[];
      studentExpMap?: Record<string, number>;
    }>('classroom_full_studio_state_v1').then((savedFull) => {
      if (!savedFull) return;
      if (savedFull.studentExpMap && mergeExpObject(savedFull.studentExpMap)) {
        applyExpMapToActiveStudents();
      }
      if (savedFull.config) {
        const hasSyncLocalConfig = Boolean(localStorage.getItem(STORAGE_KEY));
        setConfig((prev) => {
          const sourceSchemaVer = hasSyncLocalConfig
            ? Number(prev.quizDeckSchemaVersion || 0)
            : Number(savedFull.config?.quizDeckSchemaVersion || 0);
          const needsSchemaReset = sourceSchemaVer < QUIZ_DECK_SCHEMA_VERSION;
          const mergedQuizDecks = ensureTieredQuizDecksLoaded(
            hasSyncLocalConfig
              ? prev.quizDecks
              : savedFull.config?.quizDecks || prev.quizDecks,
            needsSchemaReset
          );
          const nextCfg: GameConfig = {
            ...prev,
            ...(hasSyncLocalConfig
              ? {
                  bellMp3Url: prev.bellMp3Url || savedFull.config?.bellMp3Url || null,
                  woodenFishMp3Url:
                    prev.woodenFishMp3Url || savedFull.config?.woodenFishMp3Url || null,
                  answerRevealMp3Url:
                    prev.answerRevealMp3Url ||
                    savedFull.config?.answerRevealMp3Url ||
                    null,
                  zombieGrowlMp3Url:
                    prev.zombieGrowlMp3Url ||
                    savedFull.config?.zombieGrowlMp3Url ||
                    null,
                  giftSoundMp3Urls:
                    Object.keys(prev.giftSoundMp3Urls || {}).length > 0
                      ? prev.giftSoundMp3Urls
                      : savedFull.config?.giftSoundMp3Urls || {},
                  bgmTracks:
                    Array.isArray(savedFull.config?.bgmTracks) &&
                    savedFull.config!.bgmTracks!.length > 0
                      ? savedFull.config!.bgmTracks!
                      : prev.bgmTracks,
                }
              : savedFull.config),
            quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
            quizDecks: mergedQuizDecks,
            activeQuizDeckId:
              !needsSchemaReset &&
              prev.activeQuizDeckId &&
              mergedQuizDecks.some((d) => d.id === prev.activeQuizDeckId)
                ? prev.activeQuizDeckId
                : mergedQuizDecks[0]?.id || 'deck-tienganh-de',
            spawnPoint: LEFT_DOOR_POS,
            exitPoint: LEFT_DOOR_POS,
            npcSpeechCategories: {
              idle: Array.isArray(savedFull.config?.npcSpeechCategories?.idle)
                ? savedFull.config!.npcSpeechCategories!.idle
                : prev.npcSpeechCategories?.idle ?? DEFAULT_NPC_SPEECH_CATEGORIES.idle,
              question: Array.isArray(savedFull.config?.npcSpeechCategories?.question)
                ? savedFull.config!.npcSpeechCategories!.question
                : prev.npcSpeechCategories?.question ?? DEFAULT_NPC_SPEECH_CATEGORIES.question,
              reply: Array.isArray(savedFull.config?.npcSpeechCategories?.reply)
                ? savedFull.config!.npcSpeechCategories!.reply
                : prev.npcSpeechCategories?.reply ?? DEFAULT_NPC_SPEECH_CATEGORIES.reply,
            },
            giftModelScales: {
              ...DEFAULT_GIFT_MODEL_SCALES,
              ...(prev.giftModelScales || {}),
              ...(savedFull.config?.giftModelScales || {}),
              maxDeskCats: 1,
            },
            grid: {
              ...prev.grid,
              ...(hasSyncLocalConfig ? {} : savedFull.config?.grid || {}),
            },
            hudLayout: {
              ...prev.hudLayout,
              ...(hasSyncLocalConfig ? {} : savedFull.config?.hudLayout || {}),
            },
          };
          const isOld9321IdbQueue =
            Array.isArray(nextCfg.customQuizQuestions) &&
            nextCfg.customQuizQuestions.length === 15 &&
            (nextCfg.customQuizQuestions[8]?.quizLevel === 'easy' ||
              nextCfg.customQuizQuestions[14]?.quizLevel === 'omg');
          if (
            needsSchemaReset ||
            isOld9321IdbQueue ||
            !Array.isArray(nextCfg.customQuizQuestions) ||
            nextCfg.customQuizQuestions.length === 0
          ) {
            nextCfg.customQuizQuestions =
              build15MinuteTieredRoundQuestions(nextCfg);
          }
          return nextCfg;
        });
      }
      if (Array.isArray(savedFull.npcNames) && savedFull.npcNames.length > 0) {
        setNpcNames(savedFull.npcNames);
      }
      if (Array.isArray(savedFull.npcPrayers) && savedFull.npcPrayers.length > 0) {
        setNpcPrayers(savedFull.npcPrayers);
      }
      if (Array.isArray(savedFull.npcAvatars) && savedFull.npcAvatars.length > 0) {
        setNpcAvatars(savedFull.npcAvatars);
      }
      if (
        savedFull.safetyActionMode === 'purify' ||
        savedFull.safetyActionMode === 'block' ||
        savedFull.safetyActionMode === 'mask'
      ) {
        setSafetyActionMode(savedFull.safetyActionMode);
      }
      if (
        Array.isArray(savedFull.safetyCategories) &&
        savedFull.safetyCategories.length > 0
      ) {
        const enabledMap = new Map<string, boolean>();
        savedFull.safetyCategories.forEach((c) => {
          if (c && typeof c.key === 'string' && typeof c.enabled === 'boolean') {
            enabledMap.set(c.key, c.enabled);
          }
        });
        setSafetyCategories(
          INITIAL_SAFETY_CATEGORIES.map((cat) =>
            enabledMap.has(cat.key)
              ? { ...cat, enabled: enabledMap.get(cat.key)! }
              : cat
          )
        );
      }
      if (Array.isArray(savedFull.lotusDonors)) {
        setLotusDonors(savedFull.lotusDonors);
      }
      if (Array.isArray(savedFull.dailyRecords)) {
        const sliced = savedFull.dailyRecords.slice(0, 5);
        dailyRecordsRef.current = sliced;
        setDailyRecords(sliced);
        if (!lastPraisedRecordTop1Ref.current && sliced[0]?.username) {
          lastPraisedRecordTop1Ref.current = sliced[0].username.trim().toLowerCase();
        }
      }
    });
  }, []);

  // Đồng bộ ngay tên và avatar của NPC đang ở cửa lớp (doorCrowd), trong lớp (pilgrims isBot) và trong hàng chờ (waitingPoolRef isBot) khi danh sách npcNames / npcAvatars thay đổi
  useEffect(() => {
    const safeNames = npcNames.length > 0 ? npcNames : SAMPLE_NAMES;
    const safeAvatars = npcAvatars.length > 0 ? npcAvatars : DEFAULT_NPC_AVATARS;
    const validNameSet = new Set(safeNames.map((n) => n.trim().toLowerCase()));

    setDoorCrowd((prev) => {
      let changed = false;
      const next = prev.map((d, idx) => {
        if (!d.isBot) return d;
        const lower = d.username.trim().toLowerCase();
        if (!validNameSet.has(lower)) {
          changed = true;
          const nextName = safeNames[idx % safeNames.length];
          return {
            ...d,
            username: nextName,
            gender: detectVietnameseGender(nextName),
          };
        }
        return d;
      });
      if (changed) {
        doorCrowdRef.current = next;
        return next;
      }
      return prev;
    });

    setPilgrims((prev) => {
      let changed = false;
      const next = prev.map((p, idx) => {
        if (!p.isBot) return p;
        const lower = p.username.trim().toLowerCase();
        if (!validNameSet.has(lower)) {
          changed = true;
          const nextName = safeNames[idx % safeNames.length];
          return {
            ...p,
            username: nextName,
            gender: detectVietnameseGender(nextName),
          };
        }
        return p;
      });
      if (changed) {
        pilgrimsRef.current = next;
        return next;
      }
      return prev;
    });

    let changedQueueBot = false;
    const nextPool = new Map<string, QueuedPilgrimRequest>();
    let qIdx = 0;
    waitingPoolRef.current.forEach((item, key) => {
      if (item.isBot && !validNameSet.has(item.username.trim().toLowerCase())) {
        changedQueueBot = true;
        const nextName = safeNames[qIdx % safeNames.length];
        const nextLower = nextName.trim().toLowerCase();
        if (!nextPool.has(nextLower)) {
          nextPool.set(nextLower, {
            ...item,
            username: nextName,
            gender: detectVietnameseGender(nextName),
            avatarUrl: item.avatarUrl || safeAvatars[qIdx % safeAvatars.length],
          });
        }
      } else {
        nextPool.set(key, item);
      }
      qIdx++;
    });
    if (changedQueueBot) {
      waitingPoolRef.current = nextPool;
      const allQueued = Array.from(nextPool.values());
      allQueued.sort((a, b) => {
        if (Boolean(a.isGoldenPriority) !== Boolean(b.isGoldenPriority)) {
          return a.isGoldenPriority ? -1 : 1;
        }
        return (b.points || 0) - (a.points || 0);
      });
      const top15 = allQueued.slice(0, 15).map((item, i) => ({
        ...item,
        rank: i + 1,
      }));
      waitingQueueRef.current = top15;
      setWaitingQueue(top15);
      setQueueCount(nextPool.size);
    }
  }, [npcNames, npcAvatars]);

  // Save full studio state (config, desk positions, NPC lists, safety settings, scoreboard) to both IndexedDB & localStorage
  useEffect(() => {
    const cleanVip = vipSlots.map((s) => ({ ...s, occupiedById: null }));
    const cleanNorm = normalSlots.map((s) => ({ ...s, occupiedById: null }));
    const fullPayload = {
      config,
      vipSlots: cleanVip,
      normalSlots: cleanNorm,
      npcNames,
      npcPrayers,
      npcAvatars,
      safetyActionMode,
      safetyCategories,
      lotusDonors,
      dailyRecords,
      studentExpMap: serializeStudentExpMap(studentExpMapRef.current),
    };

    // 1. Lưu đầy đủ 100% (kể cả MP3 Base64 & Avatar Base64 dung lượng lớn) vào IndexedDB
    void idbSet('classroom_full_studio_state_v1', fullPayload);

    // 2. Lưu vào localStorage để khởi tạo đồng bộ tức thì khi F5 (nếu vượt quá 5MB do MP3 Base64 thì tự động lược bỏ chuỗi audio data: trong bản localStorage)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullPayload));
    } catch {
      try {
        const lightConfig: GameConfig = {
          ...config,
          bellMp3Url:
            config.bellMp3Url && config.bellMp3Url.length > 10000
              ? null
              : config.bellMp3Url,
          woodenFishMp3Url:
            config.woodenFishMp3Url && config.woodenFishMp3Url.length > 10000
              ? null
              : config.woodenFishMp3Url,
          answerRevealMp3Url:
            config.answerRevealMp3Url && config.answerRevealMp3Url.length > 10000
              ? null
              : config.answerRevealMp3Url,
          zombieGrowlMp3Url:
            config.zombieGrowlMp3Url && config.zombieGrowlMp3Url.length > 10000
              ? null
              : config.zombieGrowlMp3Url,
          giftSoundMp3Urls: {},
          bgmTracks: (config.bgmTracks || []).map((t) =>
            t.url && t.url.length > 10000 ? { ...t, url: '' } : t
          ),
        };
        const lightAvatars = npcAvatars.filter((a) => !a || a.length < 25000);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...fullPayload,
            config: lightConfig,
            npcAvatars:
              lightAvatars.length > 0 ? lightAvatars : DEFAULT_NPC_AVATARS,
          })
        );
      } catch {
        // Ignore
      }
    }
    soundEngine.syncConfig(config);
  }, [
    config,
    vipSlots,
    normalSlots,
    npcNames,
    npcPrayers,
    npcAvatars,
    safetyActionMode,
    safetyCategories,
    lotusDonors,
  ]);

  const ttsStatusRef = useRef(ttsStatus);
  ttsStatusRef.current = ttsStatus;

  const [teacherLiveStatus, setTeacherLiveStatus] =
    useState<TeacherLiveVoiceStatus>(() => soundEngine.getTeacherLiveStatus());

  // Khi mở song song Tab Điều Khiển và Màn hình Live (?obs=1), tự động chuyển Tab Điều Khiển sang chế độ Remote Slave (tắt gọi /api/tts cục bộ để nhường 100% băng thông cho Live)
  useEffect(() => {
    const isPureLiveTab =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'live' ||
        new URLSearchParams(window.location.search).get('mode') === 'live' ||
        new URLSearchParams(window.location.search).get('obs') === '1');
    const shouldBeRemoteSlave = peerCounts.obsPeers > 0 && !isPureLiveTab;
    soundEngine.setRemoteSlaveMode(shouldBeRemoteSlave);
    setIsLocalTabMuted(soundEngine.isTabMuted());
  }, [peerCounts.obsPeers]);

  // Subscribe to soundEngine statuses (Tắt hoàn toàn chatbox tự động của Cô Giáo khi đọc TTS; chatbox Cô/Thầy chỉ hiện khi cảm ơn quà)
  useEffect(() => {
    const isPureLiveTab =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'live' ||
        new URLSearchParams(window.location.search).get('mode') === 'live' ||
        new URLSearchParams(window.location.search).get('obs') === '1');

    const unsubStatus = soundEngine.subscribeStatus((text, active) => {
      const nextStatus = { text, active };
      ttsStatusRef.current = nextStatus;
      setTtsStatus(nextStatus);
      if (isPureLiveTab && peerCountsRef.current.totalPeers > 1) {
        syncService.sendCommand('SYNC_LIVE_TTS_SNAPSHOT', {
          queue: soundEngine.getEventQueueSnapshot(),
          status: nextStatus,
        });
      }
    });

    const unsubQueue = soundEngine.subscribeEventQueue((snap) => {
      setEventTtsQueue(snap);
      if (isPureLiveTab && peerCountsRef.current.totalPeers > 1) {
        syncService.sendCommand('SYNC_LIVE_TTS_SNAPSHOT', {
          queue: snap,
          status: ttsStatusRef.current,
        });
      }
      // Khi Chủ Phòng đang phát biểu Live Text-to-Audio -> Mở rộng Camera toàn cảnh lớp học & bục giảng
      if (
        snap.isPlayingEvent &&
        (snap.activeItem?.isHostLive || snap.activeItem?.meta?.reason === 'host_live')
      ) {
        setCameraFocus({ pilgrimId: null, until: 0 });
        return;
      }
      // Đồng bộ Camera theo sát câu đang đọc TTS (lấy lời đọc làm chuẩn)
      if (snap.isPlayingEvent && snap.activeItem?.meta) {
        const meta = snap.activeItem.meta;
        const cfg = configRef.current;
        const shouldFollow =
          ((meta.reason === 'gift' || meta.reason === 'special_gift') &&
            cfg.cameraPushOnGiftEnabled !== false) ||
          (cfg.cameraFollowCommentEnabled &&
            ((!meta.isBot && cfg.cameraFollowRealUser) ||
              (meta.isBot && cfg.cameraFollowNpc)));

        if (shouldFollow) {
          const lowerUser = (meta.username || '').trim().toLowerCase();
          const allCandidates = [
            ...pilgrimsRef.current,
            ...doorCrowdRef.current,
          ];
          const target =
            allCandidates.find((p) => p.id === meta.pilgrimId) ||
            allCandidates.find(
              (p) =>
                Boolean(lowerUser) &&
                p.username.trim().toLowerCase() === lowerUser &&
                p.state !== 'leave_down_exit'
            );
          if (target && !zombieEventStateRef.current.isActive) {
            setCameraFocus((prev) => {
              const nowLock = Date.now();
              if (prev.lockedUntil && nowLock < prev.lockedUntil) {
                return prev;
              }
              if (
                prev.focusRole &&
                nowLock < Math.max(prev.until || 0, prev.lockedUntil || 0)
              ) {
                return prev;
              }
              return {
                pilgrimId: target.id,
                username: target.username,
                reason: meta.reason || 'comment',
                isBot: meta.isBot,
                startedAt: nowLock,
                until: nowLock + 18000,
              };
            });
          }
        }
      } else if (!snap.isPlayingEvent) {
        if (flow5CameraLockTimerRef.current !== null) {
          window.clearTimeout(flow5CameraLockTimerRef.current);
          flow5CameraLockTimerRef.current = null;
        }
        flow5LockedStudentIdRef.current = null;
        setCameraFocus((prev) => {
          const nowCheck = Date.now();
          if (prev.lockedUntil && nowCheck < prev.lockedUntil) return prev;
          if (prev.reason === 'manual' && nowCheck < prev.until) return prev;
          if (prev.focusRole && nowCheck < prev.until) return prev;
          return { pilgrimId: null, focusRole: null, until: 0 };
        });
      }
    });

    const unsubDharma = soundEngine.subscribeDharmaArticleChange((nextId) => {
      setConfig((prev) => ({ ...prev, activeDharmaId: nextId }));
    });

    const unsubTeacherLive = soundEngine.subscribeTeacherLiveStatus((st) => {
      setTeacherLiveStatus(st);
    });

    return () => {
      unsubStatus();
      unsubQueue();
      unsubDharma();
      unsubTeacherLive();
    };
  }, []);

  const pushToast = useCallback(
    (text: string, isVip = false, replaceKey?: string) => {
      const now = Date.now();
      setFloatingToasts((prev) => {
        const filtered = prev.filter(
          (t) =>
            now - t.createdAt < 7500 &&
            (!replaceKey || t.replaceKey !== replaceKey)
        );
        return [
          ...filtered.slice(-4),
          {
            id: `toast_${now}_${Math.random().toString(36).slice(2, 6)}`,
            text,
            isVip,
            createdAt: now,
            replaceKey,
          },
        ];
      });
    },
    []
  );

  // Hiện chatbox cảm ơn nhận quà của Cô Giáo (chữ hồng, viền hồng) hoặc Thầy Giám Thị (chữ xanh dương, viền xanh dương) - KHÔNG đọc âm thanh
  const triggerTeacherGiftThankBubble = useCallback(
    (role: 'abbot' | 'senior_novice', donorUsername: string) => {
      const cleanName = (donorUsername || 'em').trim();
      const thankText = `Cảm ơn bạn ${cleanName} nhé /-heart`;
      const bubbleUntil = Date.now() + 5500;
      setMonks((prev) => {
        const next = prev.map((m) =>
          m.role === role
            ? {
                ...m,
                chatText: thankText,
                chatBubbleUntil: bubbleUntil,
              }
            : m
        );
        monksRef.current = next;
        return next;
      });
    },
    []
  );

  // Ghi nhận học sinh tặng quà nhóm phạt đặc biệt (5 -> x3, 10 -> x6, 10+ -> x9) để gọi lên đứng sau Luồng 6
  const registerStudentForPunishment = useCallback(
    (username: string, giftId: 'heart' | 'pig' | 'vip') => {
      const cleanName = (username || '').trim();
      if (!cleanName) return;
      const lower = cleanName.toLowerCase();
      const mult: 3 | 6 | 9 =
        giftId === 'vip' ? 9 : giftId === 'pig' ? 6 : 3;
      const queue = punishmentWaitingQueueRef.current;
      const existingIdx = queue.findIndex(
        (item) => item.username.trim().toLowerCase() === lower
      );
      if (existingIdx >= 0) {
        const prevMult = queue[existingIdx].multiplier;
        queue[existingIdx] = {
          ...queue[existingIdx],
          username: cleanName,
          multiplier: (Math.max(prevMult, mult) as 3 | 6 | 9),
        };
      } else {
        queue.push({
          username: cleanName,
          multiplier: mult,
          addedAt: Date.now(),
        });
      }
    },
    []
  );

  const triggerStudentScoreCardPopup = useCallback(
    (lowerName: string, newTotalScore: number, delta: number) => {
      if (!lowerName || delta === 0) return;
      const now = Date.now();
      const durationMs =
        Math.max(0.5, configRef.current.scoreTagDurationSec ?? 4) * 1000;
      const cardUntil = now + durationMs;
      const cardKey = now + Math.random();

      let changedPilgrim = false;
      const nextPilgrims = pilgrimsRef.current.map((p) => {
        if (
          p.username.trim().toLowerCase() === lowerName &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
        ) {
          changedPilgrim = true;
          return {
            ...p,
            currentScoreDisplay: newTotalScore,
            scoreChangeDelta: delta,
            expChangeDelta: 0,
            leveledUpInRound: false,
            scoreCardUntil: cardUntil,
            scoreCardKey: cardKey,
          };
        }
        return p;
      });
      if (changedPilgrim) {
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);
      }

      if (specialFlowerRunnersRef.current.length > 0) {
        let changedRunner = false;
        const nextRunners = specialFlowerRunnersRef.current.map((r) => {
          if (r.username.trim().toLowerCase() === lowerName) {
            changedRunner = true;
            return {
              ...r,
              currentScoreDisplay: newTotalScore,
              scoreChangeDelta: delta,
              expChangeDelta: 0,
              leveledUpInRound: false,
              scoreCardUntil: cardUntil,
              scoreCardKey: cardKey,
            };
          }
          return r;
        });
        if (changedRunner) {
          specialFlowerRunnersRef.current = nextRunners;
          setSpecialFlowerRunners(nextRunners);
        }
      }
    },
    []
  );

  const addLotusPointsToDonor = useCallback(
    (username: string, points: number, suppressPopup = false) => {
      if (!username || points <= 0) return;
      const cleanName = username.trim();
      const lower = cleanName.toLowerCase();
      const prevList = lotusDonorsRef.current;
      const idx = prevList.findIndex(
        (d) => d.username.trim().toLowerCase() === lower
      );
      const newTotal = idx >= 0 ? prevList[idx].coins + points : points;
      const nextList =
        idx >= 0
          ? prevList
              .map((d, i) => (i === idx ? { ...d, coins: newTotal } : d))
              .sort((a, b) => b.coins - a.coins)
          : [...prevList, { username: cleanName, coins: newTotal }].sort(
              (a, b) => b.coins - a.coins
            );
      lotusDonorsRef.current = nextList;
      setLotusDonors(nextList);

      // Cập nhật bảng "Kỷ lục hôm nay" (lưu Top 5 bạn điểm cao nhất ngày + kiểm tra Top 1 thay đổi để kích hoạt Luồng Kỷ Lục)
      const matchedPilgrim = pilgrimsRef.current.find(
        (p) => p.username.trim().toLowerCase() === lower
      );
      const matchedQueued = waitingPoolRef.current.get(lower);
      const matchedDoor = doorCrowdRef.current.find(
        (d) => d.username.trim().toLowerCase() === lower
      );
      const prevRecords = dailyRecordsRef.current;
      const existingRecIdx = prevRecords.findIndex(
        (r) => r.username.trim().toLowerCase() === lower
      );
      const hashSeed = cleanName
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const resolvedAvatarUrl =
        matchedPilgrim?.avatarUrl ||
        matchedQueued?.avatarUrl ||
        matchedDoor?.avatarUrl ||
        (existingRecIdx >= 0 ? prevRecords[existingRecIdx].avatarUrl : null) ||
        DEFAULT_NPC_AVATARS[hashSeed % DEFAULT_NPC_AVATARS.length];
      const resolvedAvatarColor =
        matchedPilgrim?.avatarColor ||
        matchedDoor?.avatarColor ||
        (existingRecIdx >= 0 ? prevRecords[existingRecIdx].avatarColor : undefined) ||
        AVATAR_COLORS[hashSeed % AVATAR_COLORS.length];

      const prevBestPoints =
        existingRecIdx >= 0 ? prevRecords[existingRecIdx].points : 0;
      const bestPoints = Math.max(prevBestPoints, newTotal);
      let nextRecords: DailyRecordEntry[];
      if (existingRecIdx >= 0) {
        nextRecords = prevRecords.map((r, i) =>
          i === existingRecIdx
            ? {
                ...r,
                username: cleanName,
                points: bestPoints,
                avatarUrl: resolvedAvatarUrl,
                avatarColor: resolvedAvatarColor,
                updatedAt: bestPoints > prevBestPoints ? Date.now() : r.updatedAt,
              }
            : r
        );
      } else {
        nextRecords = [
          ...prevRecords,
          {
            username: cleanName,
            points: bestPoints,
            avatarUrl: resolvedAvatarUrl,
            avatarColor: resolvedAvatarColor,
            updatedAt: Date.now(),
          },
        ];
      }
      nextRecords.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      });
      const top5Records = nextRecords.slice(0, 5);
      const prevTop1 = prevRecords[0];
      const nextTop1 = top5Records[0];
      dailyRecordsRef.current = top5Records;
      setDailyRecords(top5Records);

      if (nextTop1 && nextTop1.points > 0) {
        const nextTop1Lower = nextTop1.username.trim().toLowerCase();
        const prevTop1Lower = prevTop1?.username?.trim().toLowerCase() || '';
        const isTop1InClass = pilgrimsRef.current.some(
          (p) =>
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit' &&
            p.username.trim().toLowerCase() === nextTop1Lower
        );

        // Nếu chưa từng có ai giữ Top 1 trước đó -> ghi nhận người đầu tiên làm mốc (không bật luồng kỷ lục khi chưa bị người khác chiếm)
        if (!lastPraisedRecordTop1Ref.current && !prevTop1Lower) {
          lastPraisedRecordTop1Ref.current = nextTop1Lower;
        } else if (
          prevTop1Lower &&
          prevTop1Lower !== nextTop1Lower &&
          nextTop1Lower !== lastPraisedRecordTop1Ref.current &&
          isTop1InClass
        ) {
          // Điều kiện load Luồng Kỷ Lục: Chỉ tính người chơi đang ngồi TRONG LỚP và Top 1 Kỷ Lục bị người khác chiếm!
          pendingRecordNoticeRef.current = {
            username: nextTop1.username,
            points: nextTop1.points,
            avatarUrl: nextTop1.avatarUrl,
            avatarColor: nextTop1.avatarColor,
            previousTop1Username: prevTop1 ? prevTop1.username : undefined,
          };
        } else if (
          pendingRecordNoticeRef.current &&
          pendingRecordNoticeRef.current.username.trim().toLowerCase() ===
            nextTop1Lower &&
          isTop1InClass
        ) {
          pendingRecordNoticeRef.current = {
            ...pendingRecordNoticeRef.current,
            points: nextTop1.points,
          };
        } else if (nextTop1Lower === lastPraisedRecordTop1Ref.current) {
          // Nếu chủ nhân Top 1 cũ giành lại ngôi đầu trước khi luồng kỷ lục chạy -> hủy thông báo
          pendingRecordNoticeRef.current = null;
        }
      }

      if (!suppressPopup) {
        // Quy ước mới: EXP = Điểm luôn -> cộng điểm trực tiếp (quà tặng/thưởng) cũng cộng đúng bấy nhiêu EXP
        const prevExp = studentExpMapRef.current.get(lower) || 0;
        const nextExp = prevExp + points;
        studentExpMapRef.current.set(lower, nextExp);
        studentExpDirtyRef.current = true;
        const nextLvl = getStudentLevelFromExp(nextExp);
        pilgrimsRef.current = pilgrimsRef.current.map((p) =>
          p.username.trim().toLowerCase() === lower
            ? { ...p, exp: nextExp, level: nextLvl }
            : p
        );
        triggerStudentScoreCardPopup(lower, newTotal, points);
      } else {
        // Khi trả lời đúng câu hỏi trong lớp: chỉ cập nhật điểm tổng ẩn, đợi sang Luồng 5 mới hiện đồng loạt thẻ điểm + text cộng điểm
        let changed = false;
        const nextPilgrims = pilgrimsRef.current.map((p) => {
          if (p.username.trim().toLowerCase() === lower) {
            changed = true;
            return { ...p, currentScoreDisplay: newTotal };
          }
          return p;
        });
        if (changed) {
          pilgrimsRef.current = nextPilgrims;
          setPilgrims(nextPilgrims);
        }
      }
    },
    [triggerStudentScoreCardPopup]
  );

  const deductLotusPointsFromDonor = useCallback(
    (username: string, penaltyPoints: number) => {
      if (!username || penaltyPoints <= 0) return;
      const cleanName = username.trim();
      const lower = cleanName.toLowerCase();
      const prevList = lotusDonorsRef.current;
      const idx = prevList.findIndex(
        (d) => d.username.trim().toLowerCase() === lower
      );
      const prevCoins = idx >= 0 ? prevList[idx].coins : 0;
      const newTotal = Math.max(0, prevCoins - penaltyPoints);
      if (idx >= 0) {
        const nextList = prevList
          .map((d, i) => (i === idx ? { ...d, coins: newTotal } : d))
          .sort((a, b) => b.coins - a.coins);
        lotusDonorsRef.current = nextList;
        setLotusDonors(nextList);
      }
      triggerStudentScoreCardPopup(lower, newTotal, -penaltyPoints);
    },
    [triggerStudentScoreCardPopup]
  );

  const triggerRandomClassroomEventRef = useRef<() => void>(() => {});

  const addGrandEventPoints = useCallback(
    (points: number, spawnProjectilesCount = 1, customStartPos?: Point2D) => {
      if (points <= 0) return;
      // Nếu ẩn bảng "Kích hoạt sự kiện" đi -> tắt hoàn toàn chức năng đếm điểm tăng cấp và tắt cả hoa bay cho tới khi hiện lại!
      if (configRef.current.hudLayout.showGrandEventBox === false) {
        return;
      }

      setEventBarFlashKey((k) => k + 1);

      const box = configRef.current.hudLayout.grandEventBox || {
        x: 10,
        y: 6,
        width: 166,
        height: 50,
      };
      const targetX = box.x + 24;
      const targetY = box.y + box.height / 2;
      const maxFly = Math.max(
        0,
        Math.min(20, configRef.current.maxFlyingLotuses ?? 5)
      );

      if (maxFly > 0 && spawnProjectilesCount > 0) {
        const nowMs = Date.now();
        setFlyingLotuses((prev) => {
          const activePrev = prev.filter((f) => nowMs - f.createdAt < 1100);
          const availSlots = Math.max(0, maxFly - activePrev.length);
          if (availSlots <= 0) return activePrev;
          const count = Math.min(availSlots, spawnProjectilesCount);
          const newProjectiles: FlyingLotusFX[] = Array.from(
            { length: count },
            (_, i) => ({
              id: `fly_${nowMs}_${i}_${Math.random().toString(36).slice(2, 6)}`,
              startX: customStartPos
                ? customStartPos.x + (Math.random() - 0.5) * 14
                : 160 + Math.random() * 220,
              startY: customStartPos
                ? customStartPos.y + (Math.random() - 0.5) * 14
                : 640 + Math.random() * 220,
              targetX,
              targetY,
              createdAt: nowMs,
            })
          );
          return [...activePrev, ...newProjectiles];
        });
      }

      setGrandEventProgress((prev) => {
        const target = Math.max(1, configRef.current.grandEventTarget || 50);
        const next = prev + points;
        if (next >= target) {
          setGoldenLotusRainUntil(Date.now() + 3800);
          soundEngine.playBell(configRef.current.ttsVolume, null, true);
          // Khi bảng "Kích hoạt sự kiện" đầy -> tự động kích hoạt 1 sự kiện ngẫu nhiên!
          setTimeout(() => {
            triggerRandomClassroomEventRef.current();
          }, 50);
          return 0;
        }
        return next;
      });
    },
    []
  );

  // Thực thi cho học sinh tặng quà bước vào lớp ngay khi tới lượt đọc TTS cảm ơn
  const executeGiftPilgrimEntry = useCallback(
    (entry: PendingGiftEntry) => {
      const cfg = configRef.current;
      const lowerUser = entry.username.trim().toLowerCase();
      const offeringType = getOfferingTypeFromCoins(entry.coins);

      // Kiểm tra xem học sinh này đã có mặt trong lớp chưa
      const existing = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          p.state !== 'leave_down_exit'
      );

      if (existing) {
        setPilgrims((prev) =>
          prev.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  isVip: true,
                  isBot: false,
                  coins: p.coins + entry.coins,
                  pendingGiftCoins: (p.pendingGiftCoins || 0) + entry.coins,
                  offeringType,
                  isCarryingGift: true,
                  hasGoldenAura: entry.coins >= 30 || p.hasGoldenAura,
                  prayer: entry.prayer || p.prayer,
                  chatBubbleUntil: Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000,
                  laneX: 270,
                  state: 'walk_in_up',
                  stateTimer: 0,
                }
              : p
          )
        );
        if (cfg.cameraPushOnGiftEnabled !== false) {
          setCameraFocus({
            pilgrimId: existing.id,
            username: existing.username,
            reason: entry.coins >= 30 ? 'special_gift' : 'gift',
            isBot: entry.isBot,
            startedAt: Date.now(),
            until: Date.now() + 18000,
          });
        }
        return;
      }

      // Tìm ghế Bàn Đầu VIP trống (hoặc thay thế 1 NPC ở bàn VIP)
      let chosenSlot = vipSlotsRef.current.find((s) => s.occupiedById === null);
      if (!chosenSlot) {
        const botInVip = pilgrimsRef.current.find(
          (p) => p.isBot && p.isVip && p.slotId
        );
        if (botInVip) {
          chosenSlot = vipSlotsRef.current.find((s) => s.id === botInVip.slotId);
          const evictedList = pilgrimsRef.current.map((p) =>
            p.id === botInVip.id
              ? { ...p, slotId: null, state: 'leave_side_to_aisle' as const, stateTimer: 0 }
              : p
          );
          pilgrimsRef.current = evictedList;
          setPilgrims(evictedList);
        } else {
          chosenSlot =
            normalSlotsRef.current.find((s) => s.occupiedById === null) ||
            vipSlotsRef.current[0];
        }
      }

      const id = nextIdRef.current++;
      const slotX = chosenSlot ? chosenSlot.x : 248;
      const slotY = chosenSlot ? chosenSlot.y : 584;
      const laneX = chosenSlot?.aisleX ?? 270;

      if (chosenSlot) {
        if (chosenSlot.isVip) {
          const nextVip = vipSlotsRef.current.map((s) =>
            s.id === chosenSlot!.id ? { ...s, occupiedById: id } : s
          );
          vipSlotsRef.current = nextVip;
          setVipSlots(nextVip);
        } else {
          const nextNorm = normalSlotsRef.current.map((s) =>
            s.id === chosenSlot!.id ? { ...s, occupiedById: id } : s
          );
          normalSlotsRef.current = nextNorm;
          setNormalSlots(nextNorm);
        }
      }

      const giftUserExp = getStudentExpById(entry.username);
      const giftUserLevel = getStudentLevelFromExp(giftUserExp);
      const newStudent: PilgrimData = {
        id,
        username: entry.username,
        exp: giftUserExp,
        level: giftUserLevel,
        prayer:
          entry.prayer ||
          `Em xin tặng Cô ${entry.giftName || 'Hoa Điểm 10'} ạ! 🌺`,
        gender: resolveUserGender(entry.username),
        isVip: true,
        isBot: entry.isBot,
        coins: entry.coins,
        pendingGiftCoins: entry.coins,
        offeringType,
        slotId: chosenSlot ? chosenSlot.id : null,
        x: cfg.spawnPoint.x,
        y: cfg.spawnPoint.y,
        laneX,
        slotX,
        slotY,
        speed: 88,
        state: 'walk_in_up',
        stateTimer: 0,
        prayTimer: 0,
        totalPrayDuration: cfg.vipPrayDurationSec || 38,
        animTime: Math.random() * 10,
        facingLeft: slotX < 270,
        avatarColor: AVATAR_COLORS[id % AVATAR_COLORS.length],
        avatarUrl: entry.avatarUrl || null,
        hairSeed: id,
        hasGoldenAura: entry.coins >= 30,
        isCarryingGift: true,
        hasComment: true,
        comboCount: entry.comboCount,
        giftName: entry.giftName,
        chatBubbleUntil: Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000,
      };

      const updatedPilgrims = [...pilgrimsRef.current, newStudent];
      pilgrimsRef.current = updatedPilgrims;
      setPilgrims(updatedPilgrims);
      if (cfg.cameraPushOnGiftEnabled !== false) {
        setCameraFocus({
          pilgrimId: id,
          username: newStudent.username,
          reason: entry.coins >= 30 ? 'special_gift' : 'gift',
          isBot: entry.isBot,
          startedAt: Date.now(),
          until: Date.now() + 18000,
        });
      }
    },
    []
  );

  activateGiftPilgrimRef.current = executeGiftPilgrimEntry;

  const roundEndWinnersRef = useRef<
    Array<{
      rank: 1 | 2 | 3;
      username: string;
      points: number;
      pilgrimId?: number;
    }>
  >([]);
  const roundEndMilkTeaTriggeredRef = useRef<boolean>(false);
  const roundEndApplauseTimerRef = useRef<number | null>(null);
  const triggerRoundEndMilkTeaRef = useRef<() => void>(() => {});

  // Khi soundEngine bắt đầu đọc tới lượt của 1 học sinh tặng quà -> lập tức cho học sinh đó bước vào lớp!
  // Đồng thời lắng nghe khi câu đọc của Cô Giáo thuộc Luồng Tiết Học (Luồng 0, 2, 4, 5, 6, Luồng Kết Thúc) bắt đầu / vừa đọc xong -> kích hoạt camera & chuyển luồng!
  useEffect(() => {
    soundEngine.setOnStartEventItem((item: TTSQueueItem) => {
      const stepLabel = item.meta?.lessonStepLabel || '';

      // Xử lý khóa camera và phát trà sữa trong Luồng Kết Thúc (round_end)
      if (stepLabel.startsWith('Luồng Kết Thúc: Top ')) {
        const rankNum = stepLabel.includes('Top 1')
          ? 1
          : stepLabel.includes('Top 2')
          ? 2
          : 3;
        const winnerInfo = roundEndWinnersRef.current.find(
          (w) => w.rank === rankNum
        );
        const targetPilgrim =
          (winnerInfo?.pilgrimId
            ? pilgrimsRef.current.find((p) => p.id === winnerInfo.pilgrimId)
            : undefined) ||
          (winnerInfo?.username
            ? pilgrimsRef.current.find(
                (p) =>
                  p.username.trim().toLowerCase() ===
                  winnerInfo.username.trim().toLowerCase()
              )
            : undefined);

        if (targetPilgrim) {
          const nowMs = Date.now();
          setCameraFocus({
            pilgrimId: targetPilgrim.id,
            focusRole: null,
            username: targetPilgrim.username,
            reason: 'comment',
            isBot: targetPilgrim.isBot,
            startedAt: nowMs,
            until: nowMs + 4500,
            lockedUntil: nowMs + 4500,
          });
        }
        return;
      }

      if (stepLabel.startsWith('Luồng Kết Thúc: Trà Sữa')) {
        // Bỏ khóa camera vào từng cá nhân để thấy toàn cảnh Cô phát 3 ly trà sữa 200%, 150%, 100% cho 3 bạn trên bục giảng
        setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
        triggerRoundEndMilkTeaRef.current();
        return;
      }

      const uname = item.meta?.username?.trim().toLowerCase();
      if (!uname) return;
      const pending = pendingGiftEntriesRef.current.get(uname);
      if (pending) {
        pendingGiftEntriesRef.current.delete(uname);
        activateGiftPilgrimRef.current(pending);
      }
    });

    soundEngine.setOnFinishEventItem((item: TTSQueueItem) => {
      const token = item.meta?.lessonFlowToken;
      const stepLabel = item.meta?.lessonStepLabel || '';
      const curBoard = classBoardStateRef.current;

      // Khi Cô Giáo đọc xong câu hỏi ở Luồng 2 -> chuyển nhãn hiển thị sang Luồng 3 (Đợi trả lời / Gợi ý) trên cùng đồng hồ đếm ngược
      if (
        curBoard.phase === 'asking' &&
        curBoard.lessonStepNumber === 2 &&
        stepLabel.startsWith('Luồng 2')
      ) {
        const nextAsking: ClassBoardRuntimeState = {
          ...curBoard,
          lessonStepNumber: 3,
        };
        classBoardStateRef.current = nextAsking;
        setClassBoardState(nextAsking);
      }

      if (
        stepLabel.startsWith('Luồng 5') ||
        (token &&
          curBoard.activeFlowToken === token &&
          curBoard.phase === 'result_summary')
      ) {
        if (flow5CameraLockTimerRef.current !== null) {
          window.clearTimeout(flow5CameraLockTimerRef.current);
          flow5CameraLockTimerRef.current = null;
        }
        const lockedTop1Id = flow5LockedStudentIdRef.current;
        flow5LockedStudentIdRef.current = null;
        setCameraFocus((prevCam) => {
          if (prevCam.lockedUntil && Date.now() < prevCam.lockedUntil) {
            return prevCam;
          }
          if (
            (lockedTop1Id !== null && prevCam.pilgrimId === lockedTop1Id) ||
            prevCam.reason === 'comment'
          ) {
            return { pilgrimId: null, focusRole: null, until: 0 };
          }
          return prevCam;
        });
      }

      if (token && curBoard.activeFlowToken === token) {
        if (curBoard.phase === 'round_end') {
          // Đảm bảo đã phát trà sữa nếu mẫu câu tùy chỉnh không tách vế Trà Sữa riêng
          setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
          triggerRoundEndMilkTeaRef.current();

          // Cô đọc xong câu "mấy cưng ở dưới vỗ tay nào !" -> Phát âm thanh vỗ tay chúc mừng (3.4s), âm thanh vỗ tay kết thúc mới kết thúc vòng và sang game mới!
          const applauseDurMs = soundEngine.playApplauseSfx(
            configRef.current.ttsVolume || 1,
            3400
          );
          const extendBoard: ClassBoardRuntimeState = {
            ...classBoardStateRef.current,
            timeLeftMs: Math.max(
              classBoardStateRef.current.timeLeftMs,
              applauseDurMs + 400
            ),
            phaseEndAt: Date.now() + applauseDurMs + 400,
          };
          classBoardStateRef.current = extendBoard;
          setClassBoardState(extendBoard);

          if (roundEndApplauseTimerRef.current !== null) {
            window.clearTimeout(roundEndApplauseTimerRef.current);
          }
          roundEndApplauseTimerRef.current = window.setTimeout(() => {
            roundEndApplauseTimerRef.current = null;
            const latestB = classBoardStateRef.current;
            if (latestB.phase === 'round_end') {
              const finishedBoard: ClassBoardRuntimeState = {
                ...latestB,
                ttsFinishedForPhase: true,
                ttsFinishedAtElapsedMs: latestB.elapsedPhaseMs || 0,
                timeLeftMs: 0,
              };
              classBoardStateRef.current = finishedBoard;
              setClassBoardState(finishedBoard);
            }
          }, applauseDurMs);
          return;
        }

        const latestBoard = classBoardStateRef.current;
        const nextBoard: ClassBoardRuntimeState = {
          ...latestBoard,
          ttsFinishedForPhase: true,
          ttsFinishedAtElapsedMs: latestBoard.elapsedPhaseMs || 0,
        };
        classBoardStateRef.current = nextBoard;
        setClassBoardState(nextBoard);
      }

      const curZombie = zombieEventStateRef.current;
      if (token && curZombie.isActive && curZombie.activeFlowToken === token) {
        const nextZombie: ZombieEventRuntimeState = {
          ...curZombie,
          ttsFinishedForPhase: true,
          ttsFinishedAtElapsedMs: curZombie.elapsedPhaseMs || 0,
        };
        zombieEventStateRef.current = nextZombie;
        setZombieEventState(nextZombie);
      }
    });

    return () => {
      if (roundEndApplauseTimerRef.current !== null) {
        window.clearTimeout(roundEndApplauseTimerRef.current);
      }
      soundEngine.setOnStartEventItem(null);
      soundEngine.setOnFinishEventItem(null);
    };
  }, []);

  const flushPendingGiftPilgrims = useCallback(() => {
    if (pendingGiftEntriesRef.current.size === 0) return;
    const entries = Array.from(pendingGiftEntriesRef.current.values());
    pendingGiftEntriesRef.current.clear();
    entries.forEach((entry) => activateGiftPilgrimRef.current(entry));
  }, []);

  // Kiểm tra câu trả lời Tiết Tiếng Anh trên Bảng Lớp khi có học sinh bình luận
  const checkEnglishQuizAnswer = useCallback(
    (
      username: string,
      rawComment: string,
      isBot: boolean,
      avatarUrl?: string | null
    ): boolean => {
      const cfg = configRef.current;
      if (cfg.hudLayout.showClassBoardBox === false) return false;
      const bState = classBoardStateRef.current;
      const activeEngine =
        bState.engine || cfg.hudLayout.classBoardEngine || 'english_quiz';
      if (activeEngine !== 'english_quiz' && activeEngine !== 'result_board') {
        return false;
      }
      if (bState.phase !== 'asking') return false;

      const quizList = getActiveQuizList(cfg);
      const quizItem =
        bState.currentQuestion ||
        quizList[bState.questionIndex % quizList.length] ||
        quizList[0];
      if (!quizItem) return false;

      const cleanText = (rawComment || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleanText) return false;

      const targetWord = quizItem.en.toLowerCase().trim();
      const words = cleanText.split(' ');
      const isMatch =
        words.includes(targetWord) ||
        cleanText === targetWord ||
        (targetWord === 'fridge' && words.includes('refrigerator'));

      if (!isMatch) return false;

      const lowerUser = username.trim().toLowerCase();
      if (
        bState.winners.some((w) => w.username.trim().toLowerCase() === lowerUser)
      ) {
        return true;
      }

      let existingInClass = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      let existingInWaitingQueue = waitingPoolRef.current.get(lowerUser);

      let isSeated = Boolean(existingInClass);
      const punishmentMult =
        existingInClass?.isPunishedInCurrentRound &&
        existingInClass?.punishmentMultiplier
          ? existingInClass.punishmentMultiplier
          : 1;

      const rawElapsedSec =
        Math.round(((bState.totalDurationMs - bState.timeLeftMs) / 1000) * 10) /
        10;
      const elapsedSec = isBot
        ? Math.max(5.1, rawElapsedSec)
        : Math.max(0.3, rawElapsedSec);

      const prevClassCount = (
        bState.classWinners ||
        bState.winners.filter((w) => w.isSeated !== false)
      ).length;
      const prevOutsideCount = (
        bState.outsideWinners ||
        bState.winners.filter((w) => w.isSeated === false)
      ).length;

      let groupRank = isSeated ? prevClassCount + 1 : prevOutsideCount + 1;
      let baseRewardPoints = getQuizRankPoints(groupRank, quizItem);
      const rawLuckyStars = bState.currentQuestion?.luckyStars || 0;
      const luckyMult = rawLuckyStars > 0 ? rawLuckyStars + 1 : 1;
      let rewardPoints = baseRewardPoints * punishmentMult * luckyMult;

      if (existingInClass) {
        const nextPilgrims = pilgrimsRef.current.map((p) =>
          p.id === existingInClass!.id
            ? {
                ...p,
                answeredCurrentQuestion: true,
              }
            : p
        );
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);
      }

      // Nếu người chơi chưa ở trong lớp và cũng chưa ở trong Hàng Chờ nhưng trả lời ĐÚNG câu hỏi trong thời gian hỏi:
      // Bước 1: Tự động thêm vào Hàng Chờ.
      // Bước 2 (check liên tiếp): Nếu lớp đang có ghế trống thì cho vào lớp liền luôn!
      if (!isSeated) {
        if (existingInWaitingQueue) {
          existingInWaitingQueue.answeredCorrectInRound = true;
          existingInWaitingQueue.lastElapsedSec = elapsedSec;
          existingInWaitingQueue.idleRounds = 0;
          if (avatarUrl && !existingInWaitingQueue.avatarUrl) {
            existingInWaitingQueue.avatarUrl = avatarUrl;
          }
        } else {
          const pool = waitingPoolRef.current;
          const nextRank = pool.size + 1;
          const newEntry: QueuedPilgrimRequest = {
            id: `wq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            username: username.trim(),
            prayer: rawComment,
            gender: resolveUserGender(username),
            isVip: false,
            coins: 0,
            isBot: Boolean(isBot),
            avatarUrl: avatarUrl || null,
            addedAt: Date.now(),
            points: 0,
            rank: nextRank,
            answeredCorrectInRound: true,
            lastElapsedSec: elapsedSec,
            idleRounds: 0,
          };
          pool.set(lowerUser, newEntry);
          existingInWaitingQueue = newEntry;
          setQueueCount(pool.size);
          if (waitingQueueRef.current.length < 20) {
            const nextTop = [...waitingQueueRef.current, { ...newEntry }];
            waitingQueueRef.current = nextTop;
            setWaitingQueue(nextTop);
          }

          // Check liên tiếp điều kiện thứ 2: Nếu lớp hiện đang có ghế trống thì cho học sinh này từ Hàng Chờ vào lớp liền luôn!
          const activeSlotMap = new Map<string, number>();
          for (const p of pilgrimsRef.current) {
            if (
              p.slotId &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit'
            ) {
              activeSlotMap.set(p.slotId, p.id);
            }
          }
          const freeVipSlots = vipSlotsRef.current.filter(
            (s) => !activeSlotMap.has(s.id)
          );
          const freeNormSlots = normalSlotsRef.current.filter(
            (s) => !activeSlotMap.has(s.id)
          );
          const allFreeSlots = [...freeVipSlots, ...freeNormSlots];

          if (allFreeSlots.length > 0) {
            const chosenSlot =
              allFreeSlots[Math.floor(Math.random() * allFreeSlots.length)];
            pool.delete(lowerUser);
            existingInWaitingQueue = undefined;
            setQueueCount(pool.size);

            const nextTopAfterPop = waitingQueueRef.current.filter(
              (item) => item.username.trim().toLowerCase() !== lowerUser
            );
            waitingQueueRef.current = nextTopAfterPop;
            setWaitingQueue(nextTopAfterPop);

            const id = nextIdRef.current++;
            const slotX = chosenSlot.x;
            const slotY = chosenSlot.y;
            const laneX = chosenSlot.aisleX ?? 270;

            if (vipSlotsRef.current.some((s) => s.id === chosenSlot.id)) {
              const nextVip = vipSlotsRef.current.map((s) =>
                s.id === chosenSlot.id
                  ? { ...s, occupiedById: id }
                  : { ...s, occupiedById: activeSlotMap.get(s.id) ?? null }
              );
              vipSlotsRef.current = nextVip;
              setVipSlots(nextVip);
            } else {
              const nextNorm = normalSlotsRef.current.map((s) =>
                s.id === chosenSlot.id
                  ? { ...s, occupiedById: id }
                  : { ...s, occupiedById: activeSlotMap.get(s.id) ?? null }
              );
              normalSlotsRef.current = nextNorm;
              setNormalSlots(nextNorm);
            }

            const existingDonorScore =
              lotusDonorsRef.current.find(
                (d) => d.username.trim().toLowerCase() === lowerUser
              )?.coins || 0;
            const cfgNow = configRef.current;
            const cleanName = username.trim();

            const admittedExp = getStudentExpById(cleanName);
            const admittedLevel = getStudentLevelFromExp(admittedExp);
            const admittedStudent: PilgrimData = {
              id,
              username: cleanName,
              currentScoreDisplay: existingDonorScore,
              exp: admittedExp,
              level: admittedLevel,
              prayer: rawComment,
              gender: isBot
                ? resolveBalancedNpcGender(cleanName, 'class', newEntry.gender)
                : resolveUserGender(cleanName, newEntry.gender),
              isVip: false,
              isBot: Boolean(isBot),
              coins: 0,
              offeringType: 'incense',
              slotId: chosenSlot.id,
              x: LEFT_DOOR_POS.x,
              y: LEFT_DOOR_POS.y,
              laneX,
              slotX,
              slotY,
              speed: 220 + Math.random() * 18,
              state: 'walk_carpet_to_slot_y',
              stateTimer: 0,
              prayTimer: 0,
              totalPrayDuration: cfgNow.normalPrayDurationSec || 90,
              animTime: Math.random() * 10,
              facingLeft: false,
              avatarColor: AVATAR_COLORS[id % AVATAR_COLORS.length],
              avatarUrl:
                avatarUrl ||
                (isBot
                  ? npcAvatarsRef.current[id % npcAvatarsRef.current.length]
                  : null),
              hairSeed: id,
              hasComment: Boolean(rawComment.trim()),
              chatBubbleUntil: rawComment.trim()
                ? Date.now() + (cfgNow.chatBubbleDurationSec || 12) * 1000
                : 0,
              correctStreak: 0,
              answeredCurrentQuestion: true,
              quizResultStatus: null,
              quizResultUntil: 0,
            };

            const nextPilgrimsList = [...pilgrimsRef.current, admittedStudent];
            pilgrimsRef.current = nextPilgrimsList;
            setPilgrims(nextPilgrimsList);

            existingInClass = admittedStudent;
            isSeated = true;
            groupRank = prevClassCount + 1;
            baseRewardPoints = getQuizRankPoints(groupRank, quizItem);
            rewardPoints = baseRewardPoints * punishmentMult * luckyMult;
          }

          // Đồng bộ đám đông cửa lớp (doorCrowdRef) theo danh sách Hàng Chờ hiện tại
          const maxCluster = configRef.current.doorCrowdCount ?? 7;
          const nextCrowd = buildDoorCrowdPool(
            maxCluster,
            configRef.current.doorCrowdPos || { x: 46, y: 506 },
            doorCrowdRef.current,
            npcNamesRef.current,
            npcAvatarsRef.current,
            configRef.current.doorCrowdSpread ?? 1,
            Array.from(pool.values())
          );
          doorCrowdRef.current = nextCrowd;
          setDoorCrowd(nextCrowd);
        }
      }

      // +1 điểm vào bảng "Kích hoạt sự kiện" tương ứng mỗi câu trả lời đúng từ học sinh trong lớp học và học sinh học ké + hoa bay tượng trưng
      // (Điểm số của học sinh trả lời đúng sẽ được cộng vào lúc đọc câu trả lời ở Luồng 4!)
      const flowerOrigin: Point2D = existingInClass
        ? { x: existingInClass.x, y: existingInClass.y - 16 }
        : configRef.current.doorCrowdPos || LEFT_DOOR_POS;
      addGrandEventPoints(1, 1, flowerOrigin);

      pushToast(
        `🏆 ${username} (${
          isSeated
            ? punishmentMult > 1
              ? `Đứng phạt x${punishmentMult}`
              : 'Trong lớp'
            : 'Học ké'
        }) trả lời ĐÚNG "${quizItem.en}" (+${rewardPoints}đ • ${elapsedSec.toFixed(1)}s)!`,
        groupRank === 1 || punishmentMult > 1
      );

      const winnerEntry: ClassBoardQuizWinner = {
        username,
        elapsedSec,
        points: rewardPoints,
        isSeated,
        avatarUrl:
          avatarUrl ||
          existingInClass?.avatarUrl ||
          existingInWaitingQueue?.avatarUrl ||
          null,
        avatarColor:
          existingInClass?.avatarColor ||
          AVATAR_COLORS[
            Math.abs(username.length + prevClassCount + prevOutsideCount) %
              AVATAR_COLORS.length
          ],
        pilgrimId: existingInClass?.id,
        isBot,
      };

      setClassBoardState((prev) => {
        if (
          prev.winners.some((w) => w.username.trim().toLowerCase() === lowerUser)
        ) {
          return prev;
        }
        const nextWinners = [...prev.winners, winnerEntry];
        const nextClassWinners = nextWinners
          .filter((w) => w.isSeated !== false)
          .map((w, idx) => {
            const wLower = w.username.trim().toLowerCase();
            const punishedMatch = pilgrimsRef.current.find(
              (p) =>
                p.username.trim().toLowerCase() === wLower &&
                p.isPunishedInCurrentRound &&
                p.punishmentMultiplier
            );
            const mult = punishedMatch?.punishmentMultiplier || 1;
            const rawStars = prev.currentQuestion?.luckyStars || 0;
            const luckyMult = rawStars > 0 ? rawStars + 1 : 1;
            const calcPts =
              getQuizRankPoints(idx + 1, prev.currentQuestion || quizItem) *
              mult *
              luckyMult;
            return {
              ...w,
              points: calcPts,
              exp: calcPts,
            };
          });
        const nextOutsideWinners = nextWinners
          .filter((w) => w.isSeated === false)
          .map((w, idx) => {
            const rawStars = prev.currentQuestion?.luckyStars || 0;
            const luckyMult = rawStars > 0 ? rawStars + 1 : 1;
            const calcPts =
              getQuizRankPoints(idx + 1, prev.currentQuestion || quizItem) *
              luckyMult;
            return {
              ...w,
              points: calcPts,
              exp: calcPts,
            };
          });

        const liveBoard = classBoardStateRef.current;
        const liveTimeLeft =
          liveBoard.phaseEndAt && liveBoard.isRunning
            ? Math.max(0, liveBoard.phaseEndAt - Date.now())
            : liveBoard.timeLeftMs;
        const liveElapsed =
          liveBoard.phaseEndAt &&
          liveBoard.totalDurationMs &&
          liveBoard.isRunning
            ? Math.max(0, liveBoard.totalDurationMs - liveTimeLeft)
            : liveBoard.elapsedPhaseMs;

        const nextState: ClassBoardRuntimeState = {
          ...prev,
          lessonStepNumber: liveBoard.lessonStepNumber,
          idleChatTriggered: liveBoard.idleChatTriggered,
          activeFlowToken: liveBoard.activeFlowToken,
          ttsFinishedForPhase: liveBoard.ttsFinishedForPhase,
          timeLeftMs: liveTimeLeft,
          elapsedPhaseMs: liveElapsed,
          phaseEndAt: liveBoard.phaseEndAt,
          winners: nextWinners,
          classWinners: nextClassWinners,
          outsideWinners: nextOutsideWinners,
        };
        classBoardStateRef.current = nextState;
        const isPureLiveTabNow =
          typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('view') === 'live' ||
            new URLSearchParams(window.location.search).get('mode') === 'live' ||
            new URLSearchParams(window.location.search).get('obs') === '1');
        const isSlaveTabNow =
          peerCountsRef.current.obsPeers > 0 && !isPureLiveTabNow;
        if (!isBot || !isSlaveTabNow) {
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', { state: nextState });
        }
        return nextState;
      });

      return true;
    },
    [
      addGrandEventPoints,
      addLotusPointsToDonor,
      pushToast,
      resolveBalancedNpcGender,
      resolveUserGender,
    ]
  );

  // Thêm học sinh vào Kho Hàng Chờ O(1) (waitingPoolRef):
  // - Trong 15s hỏi bài, thao tác thêm mới chỉ ghi O(1) vào Map, chỉ cập nhật queueCount và nếu bảng Top 15 chưa đủ 15 người thì thêm vào UI (không sort toàn bộ).
  const enqueueStudentToWaitingQueue = useCallback(
    (req: QueuedPilgrimRequest) => {
      const cleanName = (req.username || '').trim();
      if (!cleanName) return;
      const lower = cleanName.toLowerCase();

      // Nếu đã ở trong lớp thì không cần vào hàng chờ
      const alreadyInClass = pilgrimsRef.current.some(
        (p) =>
          p.username.trim().toLowerCase() === lower &&
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      if (alreadyInClass) return;

      const pool = waitingPoolRef.current;
      const existing = pool.get(lower);
      if (existing) {
        existing.prayer = req.prayer || existing.prayer;
        existing.isVip = false;
        existing.avatarUrl = req.avatarUrl || existing.avatarUrl;
        return;
      }

      const nextRank = pool.size + 1;
      const newEntry: QueuedPilgrimRequest = {
        ...req,
        isVip: false,
        id:
          req.id ||
          `wq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        username: cleanName,
        addedAt: Date.now(),
        points: req.points || 0,
        rank: nextRank,
        answeredCorrectInRound: false,
        lastElapsedSec: 999,
        idleRounds: 0,
      };
      pool.set(lower, newEntry);
      setQueueCount(pool.size);

      // Nếu bảng UI chưa đầy 20 người thì bổ sung nhẹ vào cuối danh sách hiển thị (không chạy sort mảng lớn)
      if (waitingQueueRef.current.length < 20) {
        const nextTop = [...waitingQueueRef.current, { ...newEntry }];
        waitingQueueRef.current = nextTop;
        setWaitingQueue(nextTop);
      }

      // Đồng bộ ngay đám đông cửa lớp (doorCrowdRef) để hiển thị nhân vật vừa vào hàng chờ kèm bong bóng chat
      const maxCluster = configRef.current.doorCrowdCount ?? 7;
      if (doorCrowdRef.current.length < maxCluster) {
        const nextCrowd = buildDoorCrowdPool(
          maxCluster,
          configRef.current.doorCrowdPos || { x: 46, y: 506 },
          doorCrowdRef.current,
          npcNamesRef.current,
          npcAvatarsRef.current,
          configRef.current.doorCrowdSpread ?? 1,
          Array.from(pool.values())
        );
        doorCrowdRef.current = nextCrowd;
        setDoorCrowd(nextCrowd);
      }

      if (!req.isBot) {
        pushToast(
          `⏳ ${cleanName} đã vào Hàng Chờ Vào Lớp (Vị trí #${pool.size})`,
          false
        );
      }
    },
    [pushToast]
  );

  // Thực thi tuần tự 1 hành động tặng quà (đầy đủ 7 loại: rose, icecream, cat, gg, heart, pig, vip) cho học sinh đang ngồi trong lớp
  const executeSeatedClassroomGiftAction = useCallback(
    (
      targetPilgrimId: number,
      safeName: string,
      giftId: ClassroomGiftEventId,
      safeComment: string,
      isDeferredFromQueue = false,
      comboCount = 1
    ) => {
      const now = Date.now();
      const cfg = configRef.current;
      const giftMeta = resolveClassroomGiftKind(giftId, 1);
      const bonusPts = giftMeta.bonusPoints;
      const hasCombo = comboCount > 1;

      // Phát sound tương ứng khi bắt đầu thực hiện hành động quà tặng này
      soundEngine.playGiftEventSound(giftId, cfg);

      // Nếu thuộc nhóm quà đi bộ lên tặng hoa (rose: Cô Thảo, icecream: Thầy Tùng)
      if (giftId === 'rose' || giftId === 'icecream') {
        const isForTeacher = giftId === 'rose';
        const targetRole: 'abbot' | 'senior_novice' = isForTeacher
          ? 'abbot'
          : 'senior_novice';
        const targetNpc = monksRef.current.find((m) => m.role === targetRole);
        const studentObj = pilgrimsRef.current.find(
          (p) => p.id === targetPilgrimId
        );
        const sideGiftPos = getTeacherSideGiftPos(
          targetNpc?.x ?? (isForTeacher ? 360 : 130),
          targetNpc?.y ?? (isForTeacher ? 444 : 498),
          studentObj?.x ?? 270
        );
        const targetX = sideGiftPos.x;
        const targetY = sideGiftPos.y;

        const nextPilgrims = pilgrimsRef.current.map((p) =>
          p.id === targetPilgrimId
            ? {
                ...p,
                isVip: true,
                isCarryingGift: true,
                offeringType: 'rose' as const,
                giftActionKind: giftId,
                giftTargetRole: targetRole,
                giftTargetPos: { x: targetX, y: targetY },
                state: 'walk_to_teacher_gift' as const,
                stateTimer: 0,
                comboCount: hasCombo ? comboCount : p.comboCount,
                comboUntil: hasCombo ? now + 8500 : p.comboUntil,
                comboPopKey: hasCombo ? now : p.comboPopKey,
                totalFlowersToThrow:
                  hasCombo || (p.comboCount || 0) > 1 ? 3 : 1,
                flowersThrownCount: 0,
                flowerBurstsDoneCount: 0,
                pendingFlowerBonusPoints: bonusPts,
                flowerBonusAwarded: false,
                floatingScoreUntil: 0,
                prayer: '',
                hasComment: false,
                chatBubbleUntil: 0,
                giftActionHighlightUntil: now + 6500,
              }
            : p
        );
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);
        pushToast(
          `${isForTeacher ? '🌹' : '🍦'} ${safeName} (${giftMeta.actionTitle}${
            hasCombo ? ` • 🔥 COMBO x${comboCount} -> Ném 3 đóa hoa liên tiếp` : ''
          }): ${
            isDeferredFromQueue ? 'Bắt đầu lượt tặng tiếp theo -> ' : ''
          }Đang mang hoa lên tặng (ném trúng +${bonusPts}đ)!`,
          true
        );
        return;
      }

      // Đối với 5 món quà tại bàn (cat, gg, heart, pig, vip):
      // Cô Thảo hiện chatbox cảm ơn + khóa thời gian bận hành động (giftActionBusyUntil) để các quà tiếp theo chạy tuần tự
      triggerTeacherGiftThankBubble('abbot', safeName);
      const actionBusyMs = giftId === 'vip' ? 6000 : 2200;

      // Nếu thuộc nhóm quà phạt đặc biệt (5 / 10 / 10+) -> ghi vào danh sách phạt cuối vòng câu hỏi (sau Luồng 6)
      // Đồng thời khi ở lớp học bình thường (không tính event) sẽ khóa camera vào người tặng (riêng quà VIP chờ 1s mới zoom camera)
      if (giftId === 'heart' || giftId === 'pig' || giftId === 'vip') {
        registerStudentForPunishment(safeName, giftId);
        if (!zombieEventStateRef.current.isActive) {
          const lockDurMs = giftId === 'vip' ? 5000 : 3000;
          const gifterStudent = pilgrimsRef.current.find(
            (p) => p.id === targetPilgrimId
          );
          if (giftId === 'vip') {
            window.setTimeout(() => {
              if (zombieEventStateRef.current.isActive) return;
              const zoomNow = Date.now();
              const currentGifter = pilgrimsRef.current.find(
                (p) => p.id === targetPilgrimId
              );
              setCameraFocus({
                pilgrimId: targetPilgrimId,
                focusRole: null,
                username:
                  currentGifter?.username ||
                  gifterStudent?.username ||
                  safeName,
                reason: 'special_gift',
                isBot: currentGifter?.isBot ?? gifterStudent?.isBot,
                startedAt: zoomNow,
                until: zoomNow + lockDurMs,
                lockedUntil: zoomNow + lockDurMs,
              });
            }, 1000);
          } else {
            setCameraFocus({
              pilgrimId: targetPilgrimId,
              focusRole: null,
              username: gifterStudent?.username || safeName,
              reason: 'gift',
              isBot: gifterStudent?.isBot,
              startedAt: now,
              until: now + lockDurMs,
              lockedUntil: now + lockDurMs,
            });
          }
        }
      }

      if (giftId === 'cat') {
        const maxCats = Math.max(
          1,
          Math.min(1, cfg.giftModelScales?.maxDeskCats ?? 1)
        );
        const targetStudent = pilgrimsRef.current.find(
          (p) => p.id === targetPilgrimId
        );
        const currentStudentCats = targetStudent?.hasDeskCat
          ? Math.max(1, targetStudent.deskCatCount || 1)
          : 0;

        const isOverflowCat = currentStudentCats >= maxCats;

        const nextPilgrims = pilgrimsRef.current.map((p) =>
          p.id === targetPilgrimId
            ? {
                ...p,
                hasDeskCat: true,
                deskCatCount: isOverflowCat
                  ? Math.min(maxCats, Math.max(1, p.deskCatCount || 1))
                  : Math.min(
                      maxCats,
                      (p.hasDeskCat ? Math.max(1, p.deskCatCount || 1) : 0) + 1
                    ),
                deskCatDropAt: now,
                giftActionBusyUntil: now + actionBusyMs,
                giftActionHighlightUntil: now + 5500,
                comboCount: hasCombo ? comboCount : p.comboCount,
                comboUntil: hasCombo ? now + 8000 : p.comboUntil,
                comboPopKey: hasCombo ? now : p.comboPopKey,
                floatingScoreText: `+${bonusPts}đ`,
                floatingScoreColor: 'gold' as const,
                floatingScoreUntil: now + 3400,
                floatingScoreKey: now,
                prayer: 'Em nuôi mèo nè cô',
                hasComment: true,
                chatBubbleUntil: now + 5500,
              }
            : p
        );
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);

        if (isOverflowCat && targetStudent) {
          const jumpFromX = targetStudent.slotX || targetStudent.x;
          const jumpFromY = (targetStudent.slotY || targetStudent.y) - 8;
          const jumpToX =
            targetStudent.laneX ||
            Math.max(
              70,
              Math.min(470, jumpFromX + (jumpFromX < 270 ? -36 : 36))
            );
          const jumpToY = Math.min(
            820,
            (targetStudent.slotY || targetStudent.y) + 18
          );
          const roamWps: Point2D[] = [
            {
              x: 130 + Math.round(Math.random() * 280),
              y: 505 + Math.round(Math.random() * 95),
            },
            {
              x: 390 - Math.round(Math.random() * 250),
              y: 635 + Math.round(Math.random() * 115),
            },
            {
              x: 155 + Math.round(Math.random() * 230),
              y: 485 + Math.round(Math.random() * 85),
            },
            { x: LEFT_DOOR_POS.x + 12, y: LEFT_DOOR_POS.y },
            { x: LEFT_DOOR_POS.x - 26, y: LEFT_DOOR_POS.y + 8 },
          ];
          const newRoamingCat: RoamingCatAgent = {
            id: `roam_cat_${now}_${Math.random().toString(36).slice(2, 6)}`,
            x: jumpFromX,
            y: jumpFromY,
            jumpFromX,
            jumpFromY,
            jumpToX,
            jumpToY,
            jumpProgress: 0,
            waypoints: roamWps,
            waypointIndex: 0,
            speed: 135 + Math.round(Math.random() * 25),
            facingLeft: jumpToX < jumpFromX,
            animTime: Math.random() * 2,
          };
          setRoamingCats((prev) => [...prev, newRoamingCat]);
        }

        pushToast(
          `🐱 ${safeName} (${giftMeta.actionTitle}): ${
            isDeferredFromQueue ? 'Thực hiện lượt quà -> ' : `+${bonusPts}đ • `
          }${
            isOverflowCat
              ? `Bàn đã đủ ${maxCats} mèo -> Mèo nhảy xuống đất đi dạo quanh lớp!`
              : 'Mèo rơi xuống bàn học!'
          }`,
          true
        );
        return;
      }

      if (giftId === 'gg') {
        const nextPilgrims = pilgrimsRef.current.map((p) =>
          p.id === targetPilgrimId
            ? {
                ...p,
                hasDeskSnack: true,
                deskSnackDropAt: now,
                giftActionBusyUntil: now + actionBusyMs,
                giftActionHighlightUntil: now + 5500,
                comboCount: hasCombo ? comboCount : p.comboCount,
                comboUntil: hasCombo ? now + 8000 : p.comboUntil,
                comboPopKey: hasCombo ? now : p.comboPopKey,
                floatingScoreText: `+${bonusPts}đ`,
                floatingScoreColor: 'gold' as const,
                floatingScoreUntil: now + 3400,
                floatingScoreKey: now,
                prayer: 'Nhăm nhăm.',
                hasComment: true,
                chatBubbleUntil: now + 5500,
              }
            : p
        );
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);
        pushToast(
          `🍟 ${safeName} (${giftMeta.actionTitle}): ${
            isDeferredFromQueue ? 'Thực hiện lượt quà -> ' : `+${bonusPts}đ • `
          }Bịch snack rơi xuống bàn!`,
          true
        );
        return;
      }

      if (giftId === 'heart') {
        const nextPilgrims = pilgrimsRef.current.map((p) =>
          p.id === targetPilgrimId
            ? {
                ...p,
                hasShield: true,
                hasPcGamingDesk: true,
                pcGamingDeskAt: now,
                giftActionBusyUntil: now + actionBusyMs,
                giftActionHighlightUntil: now + 6000,
                comboCount: hasCombo ? comboCount : p.comboCount,
                comboUntil: hasCombo ? now + 8000 : p.comboUntil,
                comboPopKey: hasCombo ? now : p.comboPopKey,
                floatingScoreText: `+${bonusPts}đ`,
                floatingScoreColor: 'gold' as const,
                floatingScoreUntil: now + 3400,
                floatingScoreKey: now,
                prayer: 'Ring! Ring!',
                hasComment: true,
                chatBubbleUntil: now + 6000,
              }
            : p
        );
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);
        pushToast(
          `💖 ${safeName} (${giftMeta.actionTitle}): ${
            isDeferredFromQueue ? 'Thực hiện lượt quà -> ' : `+${bonusPts}đ • `
          }Đổi skin bàn PC Gaming + Nhận Khiên Bảo Vệ 🛡️!`,
          true
        );
        return;
      }

      if (giftId === 'pig') {
        const gifterNow = pilgrimsRef.current.find(
          (p) => p.id === targetPilgrimId
        );
        const allSeatSlots = [
          ...vipSlotsRef.current,
          ...normalSlotsRef.current,
        ];
        const gifterSlot = gifterNow?.slotId
          ? allSeatSlots.find((s) => s.id === gifterNow.slotId)
          : undefined;
        const gifterDeskId = gifterSlot?.deskId;
        const sameDeskSlotIds = new Set(
          gifterDeskId
            ? allSeatSlots
                .filter((s) => s.deskId === gifterDeskId)
                .map((s) => s.id)
            : gifterNow?.slotId
            ? [gifterNow.slotId]
            : []
        );

        const nextPilgrims = pilgrimsRef.current.map((p) => {
          if (p.id === targetPilgrimId) {
            return {
              ...p,
              hasShield: true,
              hasDeskPig: true,
              deskPigDropAt: now,
              giftActionBusyUntil: now + actionBusyMs,
              giftActionHighlightUntil: now + 6500,
              comboCount: hasCombo ? comboCount : p.comboCount,
              comboUntil: hasCombo ? now + 8000 : p.comboUntil,
              comboPopKey: hasCombo ? now : p.comboPopKey,
              floatingScoreText: `+${bonusPts}đ`,
              floatingScoreColor: 'gold' as const,
              floatingScoreUntil: now + 3600,
              floatingScoreKey: now,
              prayer: 'ột ột 😈😈😈',
              hasComment: true,
              chatBubbleUntil: now + 6500,
            };
          }
          // Đảm bảo max: 1 con heo trên bàn (nếu bạn cùng bàn đang có heo trên bàn thì nhường chỗ cho con heo mới)
          if (p.slotId && sameDeskSlotIds.has(p.slotId) && p.hasDeskPig) {
            return {
              ...p,
              hasDeskPig: false,
            };
          }
          return p;
        });
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);

        const targetSelf =
          nextPilgrims.find((p) => p.id === targetPilgrimId) || nextPilgrims[0];
        const donorPtsMap = new Map<string, number>();
        lotusDonorsRef.current.forEach((d) =>
          donorPtsMap.set(d.username.trim().toLowerCase(), d.coins || 0)
        );
        const candidates = nextPilgrims
          .filter(
            (p) =>
              p.id !== targetPilgrimId &&
              Boolean(p.slotId) &&
              !p.leaveAfterGiftAction &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit'
          )
          .sort((a, b) => {
            const pa = donorPtsMap.get(a.username.trim().toLowerCase()) || 0;
            const pb = donorPtsMap.get(b.username.trim().toLowerCase()) || 0;
            return pb - pa;
          });

        const targetPool =
          candidates.length > 0
            ? candidates.slice(0, 8)
            : targetSelf
            ? [targetSelf]
            : [];
        if (targetPool.length > 0) {
          const gifterOriginX = targetSelf
            ? targetSelf.x || targetSelf.slotX
            : LEFT_DOOR_POS.x;
          const gifterOriginY = targetSelf
            ? targetSelf.y || targetSelf.slotY
            : LEFT_DOOR_POS.y;
          const gifterLaneX = targetSelf?.laneX ?? gifterOriginX;
          const spawnedPigs: RunningPigAgent[] = Array.from(
            { length: 8 },
            (_, idx) => {
              const targetStudent = targetPool[idx % targetPool.length];
              // Triệu hồi chú heo may mắn ngay tại vị trí người tặng
              const startX = gifterOriginX + ((idx % 3) - 1) * 7;
              const startY = gifterOriginY + (Math.floor(idx / 3) - 1) * 5;
              return {
                id: `pig_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
                x: startX,
                y: startY,
                waypoints: [
                  { x: gifterLaneX, y: startY },
                  { x: targetStudent.laneX, y: targetStudent.slotY },
                  { x: targetStudent.slotX, y: targetStudent.slotY },
                ],
                waypointIndex: 0,
                targetPilgrimId: targetStudent.id,
                targetUsername: targetStudent.username,
                speed: 220 + idx * 10,
                facingLeft: targetStudent.slotX < startX,
                animTime: idx * 0.3,
              };
            }
          );
          setRunningPigs((prev) => [...prev, ...spawnedPigs]);
        }
        pushToast(
          `🐷 ${safeName} (${giftMeta.actionTitle}): ${
            isDeferredFromQueue ? 'Thực hiện lượt quà -> ' : `+${bonusPts}đ • `
          }Thêm 1 heo lên bàn (max 1) & Thả 8 heo tấn công (-20đ)!`,
          true
        );
        return;
      }

      // Mặc định 'vip': Tôi là Rich Kid (+99đ bản thân, +30đ toàn bộ học sinh trong lớp, đứng lên mặt bàn nhảy + mưa tiền, chờ 1s mới zoom camera 5s)
      setMoneyRainUntil(now + 6000);
      const otherClassUsernames: string[] = [];
      const nextPilgrims = pilgrimsRef.current.map((p) => {
        const isInClass =
          Boolean(p.slotId) &&
          !p.leaveAfterGiftAction &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit';
        if (!isInClass) return p;

        if (p.id === targetPilgrimId) {
          return {
            ...p,
            isVip: true,
            hasShield: true,
            hasGoldenAura: true,
            richKidDanceUntil: now + 6000,
            giftActionBusyUntil: now + actionBusyMs,
            giftActionHighlightUntil: now + 7200,
            comboCount: hasCombo ? comboCount : p.comboCount,
            comboUntil: hasCombo ? now + 8500 : p.comboUntil,
            comboPopKey: hasCombo ? now : p.comboPopKey,
            floatingScoreText: '+99đ',
            floatingScoreColor: 'gold' as const,
            floatingScoreUntil: now + 5200,
            floatingScoreKey: now,
            prayer: '',
            hasComment: false,
            chatBubbleUntil: 0,
          };
        }

        otherClassUsernames.push(p.username);
        return {
          ...p,
          floatingScoreText: '+30đ',
          floatingScoreColor: 'green' as const,
          floatingScoreUntil: now + 3800,
          floatingScoreKey: now + p.id,
        };
      });
      pilgrimsRef.current = nextPilgrims;
      setPilgrims(nextPilgrims);
      otherClassUsernames.forEach((uName) => {
        addLotusPointsToDonor(uName, 30);
      });
      pushToast(
        `💎 ${safeName} (Tôi là Rich Kid): ${
          isDeferredFromQueue ? 'Thực hiện lượt quà -> ' : ''
        }Bản thân +99đ, cả lớp +30đ & Mưa Tiền 5s!`,
        true
      );
    },
    [
      addLotusPointsToDonor,
      pushToast,
      registerStudentForPunishment,
      triggerTeacherGiftThankBubble,
    ]
  );

  // ============================================================================
  // HỆ THỐNG SỰ KIỆN "ZOMBIE TẤN CÔNG" (LUỒNG SỰ KIỆN 1 -> 6)
  // ============================================================================
  const recordZombieDamageContribution = useCallback(
    (
      username: string,
      addedDamage: number,
      isSeated: boolean,
      avatarColor?: string,
      avatarUrl?: string | null,
      isBot?: boolean
    ) => {
      if (!username || addedDamage <= 0 || isBot) return;
      const cleanName = username.trim();
      const lower = cleanName.toLowerCase();

      // Nếu là NPC tấn công (trong lớp hoặc trong hàng chờ) thì KHÔNG tính điểm vào Bảng Chiến Công
      const seatedMatch = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lower &&
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      if (seatedMatch?.isBot) return;

      const queueMatch = waitingPoolRef.current.get(lower);
      if (queueMatch?.isBot) return;

      const map = zombieDamageMapRef.current;
      const existing = map.get(lower);
      if (existing) {
        existing.damage += addedDamage;
        existing.isSeated = isSeated;
        if (avatarUrl) existing.avatarUrl = avatarUrl;
      } else {
        map.set(lower, {
          username: cleanName,
          damage: addedDamage,
          isSeated,
          avatarColor:
            avatarColor ||
            AVATAR_COLORS[Math.abs(cleanName.length) % AVATAR_COLORS.length],
          avatarUrl: avatarUrl || null,
        });
      }
    },
    []
  );

  const getSortedZombieTopDamagers = useCallback((): ZombieDamageEntry[] => {
    return Array.from(zombieDamageMapRef.current.values())
      .sort((a, b) => b.damage - a.damage)
      .slice(0, 10)
      .map((item) => ({ ...item }));
  }, []);

  // Bắn 1 viên đạn tấn công Zombie (Hộp bút / Sách / Ghế ngồi / Đứa bàn bên :) Meme)
  // - Đạn chạm Zombie mới trừ máu & cộng điểm Chiến Công.
  // - Đạn thường (Hộp bút & Quà 1 xu) dùng tốc độ zombieNormalProjectileDurationSec.
  // - Đạn quà 5, 10, 10+ xu có tốc độ bay riêng, khóa Camera bám sát theo đạn, và nếu có đạn quà mới khi đạn quà hiện tại còn bay thì đợi đạn hiện tại chạm Zombie xong mới bắn và chuyển Camera qua đạn quà kế tiếp.
  const fireZombieAttackProjectile = useCallback(
    (opts: {
      attackerUsername: string;
      startX: number;
      startY: number;
      damage: number;
      kind: ZombieProjectileKind;
      giftId?: ClassroomGiftEventId;
      giftCoins?: number;
      isSeated: boolean;
      avatarColor?: string;
      avatarUrl?: string | null;
      isBot?: boolean;
      skipIndividualScoreRecord?: boolean;
      contributors?: Array<{
        username: string;
        damage: number;
        isSeated: boolean;
        avatarColor?: string;
        avatarUrl?: string | null;
        isBot?: boolean;
      }>;
      delayMs?: number;
      deferStateAppend?: boolean;
      bypassSpecialGiftQueue?: boolean;
    }): ZombieProjectileFX | null => {
      const zEv = zombieEventStateRef.current;
      if (!zEv.isActive || zEv.phase !== 'z_flow_5_combat' || zEv.hp <= 0) {
        return null;
      }

      const dmg = Math.max(1, Math.round(opts.damage));
      const inferredCoins =
        opts.giftCoins ??
        (opts.kind === 'desk_mate' || opts.kind === 'chair' || opts.kind === 'book'
          ? Math.max(1, Math.round(dmg / 100))
          : 0);
      const isSpecialCameraGift =
        opts.kind === 'chair' || opts.kind === 'desk_mate';

      // Hàng chờ tuần tự cho đạn quà 5, 10, 10+ xu: Nếu đang có viên đạn quà đặc biệt bay trên sân, xếp vào hàng chờ đợi viên hiện tại bay xong (chạm Zombie) mới bắn viên kế tiếp và chuyển Camera!
      if (
        isSpecialCameraGift &&
        !opts.bypassSpecialGiftQueue &&
        specialZombieGiftProjQueueRef.current.isFlying
      ) {
        specialZombieGiftProjQueueRef.current.queue.push({
          attackerUsername: opts.attackerUsername,
          startX: opts.startX,
          startY: opts.startY,
          damage: dmg,
          kind: opts.kind,
          giftId: opts.giftId,
          giftCoins: inferredCoins,
          isSeated: opts.isSeated,
          avatarColor: opts.avatarColor,
          avatarUrl: opts.avatarUrl,
          isBot: opts.isBot,
          skipIndividualScoreRecord: opts.skipIndividualScoreRecord,
        });
        return null;
      }

      const cfgNowForSpeed = configRef.current;
      // Tốc độ đạn bay riêng biệt:
      // - Đạn thường (Hộp bút thả tim & Sách quà 1 xu): áp dụng zombieNormalProjectileDurationSec (không áp dụng cho đạn 5, 10, 10+)
      // - Đạn quà 5 xu (chair): áp dụng zombieGift5ProjectileDurationSec
      // - Đạn quà 10 xu (desk_mate, coins <= 10): áp dụng zombieGift10ProjectileDurationSec
      // - Đạn quà 10+ xu (desk_mate, coins > 10): áp dụng zombieGift10PlusProjectileDurationSec
      let durationMs: number;
      if (opts.kind === 'desk_mate') {
        const sec =
          inferredCoins > 10
            ? cfgNowForSpeed.zombieGift10PlusProjectileDurationSec ?? 1.7
            : cfgNowForSpeed.zombieGift10ProjectileDurationSec ?? 1.4;
        durationMs = Math.max(250, Math.round(sec * 1000));
      } else if (opts.kind === 'chair') {
        const sec = cfgNowForSpeed.zombieGift5ProjectileDurationSec ?? 1.15;
        durationMs = Math.max(250, Math.round(sec * 1000));
      } else {
        const sec = cfgNowForSpeed.zombieNormalProjectileDurationSec ?? 0.55;
        durationMs = Math.max(150, Math.round(sec * 1000));
      }

      const zEnt = zombieEntityRef.current;
      const targetX = zEnt.x + (Math.random() - 0.5) * 18;
      const targetY = zEnt.y - 42 + (Math.random() - 0.5) * 16;
      const now = Date.now();

      // Khi ném "Đứa bàn bên" (desk_mate - 10 xu & 10+ xu): Tìm bạn ngồi cùng bàn đôi (hoặc bạn kế bên) để copy Thẻ Tên gắn dính vào model đạn xoay theo đạn
      let seatmateName: string | undefined;
      let seatmateAvatarUrl: string | null | undefined;
      let seatmateAvatarColor: string | undefined;
      let seatmateIsVip: boolean | undefined;
      let seatmateIsGolden: boolean | undefined;

      if (opts.kind === 'desk_mate') {
        const attackerLower = (opts.attackerUsername || '').trim().toLowerCase();
        const activeSeated = pilgrimsRef.current.filter(
          (p) =>
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        const attackerSeated = activeSeated.find(
          (p) => p.username.trim().toLowerCase() === attackerLower
        );

        let seatmatePilgrim: PilgrimData | undefined;
        if (attackerSeated && attackerSeated.slotId) {
          const allDesks = [
            ...groupSlotsIntoDoubleDesks(vipSlotsRef.current, 'vip'),
            ...groupSlotsIntoDoubleDesks(normalSlotsRef.current, 'norm'),
          ];
          const desk = allDesks.find(
            (d) =>
              d.leftSlot.id === attackerSeated.slotId ||
              d.rightSlot?.id === attackerSeated.slotId
          );
          const partnerSlotId = desk
            ? desk.leftSlot.id === attackerSeated.slotId
              ? desk.rightSlot?.id
              : desk.leftSlot.id
            : undefined;
          if (partnerSlotId) {
            seatmatePilgrim = activeSeated.find(
              (p) => p.id !== attackerSeated.id && p.slotId === partnerSlotId
            );
          }
          if (!seatmatePilgrim) {
            const others = activeSeated.filter((p) => p.id !== attackerSeated.id);
            if (others.length > 0) {
              others.sort(
                (a, b) =>
                  Math.hypot(a.x - attackerSeated.x, a.y - attackerSeated.y) -
                  Math.hypot(b.x - attackerSeated.x, b.y - attackerSeated.y)
              );
              seatmatePilgrim = others[0];
            }
          }
        } else if (activeSeated.length > 0) {
          const others = activeSeated.filter(
            (p) => p.username.trim().toLowerCase() !== attackerLower
          );
          if (others.length > 0) {
            seatmatePilgrim = others[Math.floor(Math.random() * others.length)];
          }
        }

        if (seatmatePilgrim) {
          seatmateName = seatmatePilgrim.username;
          seatmateAvatarUrl = seatmatePilgrim.avatarUrl || null;
          seatmateAvatarColor = seatmatePilgrim.avatarColor;
          seatmateIsVip = Boolean(seatmatePilgrim.isVip);
          seatmateIsGolden = Boolean(
            seatmatePilgrim.isGoldenPriority ||
              (seatmatePilgrim.richKidDanceUntil &&
                seatmatePilgrim.richKidDanceUntil > now)
          );
        } else {
          const queueOthers = waitingQueueRef.current.filter(
            (q) => q.username.trim().toLowerCase() !== attackerLower
          );
          if (queueOthers.length > 0) {
            const qMate =
              queueOthers[Math.floor(Math.random() * queueOthers.length)];
            seatmateName = qMate.username;
            seatmateAvatarUrl = qMate.avatarUrl || null;
            seatmateAvatarColor = AVATAR_COLORS[0];
            seatmateIsVip = Boolean(qMate.isVip);
            seatmateIsGolden = Boolean(qMate.isGoldenPriority);
          } else {
            const namesPool =
              npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
            seatmateName =
              namesPool[Math.floor(Math.random() * namesPool.length)] ||
              'Bạn Bàn Bên';
            seatmateAvatarColor =
              AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
            seatmateIsVip = false;
            seatmateIsGolden = false;
          }
        }
      }

      const delayMs = isSpecialCameraGift
        ? 0
        : Math.max(0, Math.round(opts.delayMs || 0));
      const launchAt = now + delayMs;

      const projItem: ZombieProjectileFX = {
        id: `zproj_${launchAt}_${Math.random().toString(36).slice(2, 7)}`,
        kind: opts.kind,
        giftId: opts.giftId,
        startX: opts.startX,
        startY: opts.startY,
        targetX,
        targetY,
        damage: dmg,
        attackerUsername: opts.attackerUsername,
        createdAt: launchAt,
        durationMs,
        seatmateName,
        seatmateAvatarUrl,
        seatmateAvatarColor,
        seatmateIsVip,
        seatmateIsGolden,
      };

      if (!opts.deferStateAppend) {
        const maxActiveProj = Math.max(
          1,
          Math.min(
            60,
            Math.round(cfgNowForSpeed.zombieMaxFlyingProjectiles ?? 16)
          )
        );
        setZombieProjectiles((prev) =>
          [...prev, projItem].slice(-maxActiveProj)
        );
      }

      // Khi bắn đạn quà tặng 5, 10, hoặc 10+ xu: Khóa Camera bám sát vào viên đạn đó cho đến khi chạm Zombie!
      if (isSpecialCameraGift) {
        specialZombieGiftProjQueueRef.current.isFlying = true;
        setCameraFocus({
          pilgrimId: null,
          focusRole: 'projectile',
          projectileId: projItem.id,
          customZoom: cfgNowForSpeed.cameraZoomScale || 2.25,
          reason: 'special_gift',
          startedAt: launchAt,
          until: launchAt + durationMs + 340,
          lockedUntil: launchAt + durationMs + 240,
        });
      }

      const triggerNextSpecialGiftInQueue = () => {
        if (!isSpecialCameraGift) return;
        const qRef = specialZombieGiftProjQueueRef.current;
        const curState = zombieEventStateRef.current;
        if (
          !curState.isActive ||
          curState.phase !== 'z_flow_5_combat' ||
          curState.hp <= 0 ||
          qRef.queue.length === 0
        ) {
          qRef.isFlying = false;
          qRef.queue = [];
          return;
        }
        const nextGiftShot = qRef.queue.shift()!;
        if (qRef.nextLaunchTimer) {
          clearTimeout(qRef.nextLaunchTimer);
        }
        qRef.nextLaunchTimer = setTimeout(() => {
          qRef.nextLaunchTimer = null;
          const evCheck = zombieEventStateRef.current;
          if (
            !evCheck.isActive ||
            evCheck.phase !== 'z_flow_5_combat' ||
            evCheck.hp <= 0
          ) {
            qRef.isFlying = false;
            qRef.queue = [];
            return;
          }
          fireZombieAttackProjectileRef.current?.({
            ...nextGiftShot,
            delayMs: 0,
            deferStateAppend: false,
            bypassSpecialGiftQueue: true,
          });
        }, 110);
      };

      // CHỈ KHI ĐẠN CHẠM ZOMBIE MỚI TRỪ MÁU & CỘNG ĐIỂM CHIẾN CÔNG + NỔ GAI SÁT THƯƠNG!
      setTimeout(() => {
        const curEv = zombieEventStateRef.current;
        if (!curEv.isActive || curEv.phase !== 'z_flow_5_combat' || curEv.hp <= 0) {
          if (isSpecialCameraGift) {
            specialZombieGiftProjQueueRef.current.isFlying = false;
            specialZombieGiftProjQueueRef.current.queue = [];
          }
          return;
        }

        // Ghi nhận điểm Chiến Công ngay khoảnh khắc đạn chạm Zombie
        if (Array.isArray(opts.contributors) && opts.contributors.length > 0) {
          opts.contributors.forEach((c) => {
            if (!c.isBot) {
              recordZombieDamageContribution(
                c.username,
                c.damage,
                c.isSeated,
                c.avatarColor,
                c.avatarUrl,
                false
              );
            }
          });
        } else if (!opts.skipIndividualScoreRecord && !opts.isBot) {
          recordZombieDamageContribution(
            opts.attackerUsername,
            dmg,
            opts.isSeated,
            opts.avatarColor,
            opts.avatarUrl,
            opts.isBot
          );
        }

        const cfgNow = configRef.current;
        const hitVol = Math.max(
          0.65,
          cfgNow.giftSoundVolume ?? cfgNow.ttsVolume ?? 1
        );
        soundEngine.playZombieHitSfx(opts.kind, hitVol);

        // 1. Giật lùi (recoil) cực nhanh rồi trở về vị trí đứng ngay trong vòng lặp 60FPS
        const recoilStrength =
          opts.kind === 'desk_mate'
            ? 20
            : opts.kind === 'chair'
            ? 14
            : opts.kind === 'book'
            ? 10
            : 7;
        const recoilDirX = opts.startX < zombieEntityRef.current.x ? 1 : -1;

        setZombieEntity((prevZ) => {
          const nextZ: ZombieEntityState = {
            ...prevZ,
            recoilOffsetX: recoilDirX * recoilStrength + (Math.random() - 0.5) * 8,
            recoilOffsetY: -Math.min(12, recoilStrength * 0.6),
            hitFlashUntil: Date.now() + 170,
          };
          zombieEntityRef.current = nextZ;
          return nextZ;
        });

        // 2. Tạo vụ nổ gai nhọn màu kem vàng (Spiky Speech Bubble) kèm chữ sát thương màu đỏ -x văng ra nhiều hướng
        const angle = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
        const speed = 42 + Math.random() * 44;
        const spikyItem: ZombieSpikyDamageFX = {
          id: `zspiky_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          x: zombieEntityRef.current.x + (Math.random() - 0.5) * 24,
          y: zombieEntityRef.current.y - 54 + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 18,
          damage: dmg,
          scale:
            opts.kind === 'desk_mate'
              ? 1.28
              : opts.kind === 'chair'
              ? 1.14
              : opts.kind === 'book'
              ? 1.02
              : 0.92,
          createdAt: Date.now(),
        };
        setZombieSpikyDamages((prev) => [...prev.slice(-16), spikyItem]);

        // 3. Trừ HP Zombie khi đạn chạm đích + Rung thanh máu + Hiệu ứng lùi máu màu vàng kem (trailHp)
        const nextHp = Math.max(0, curEv.hp - dmg);
        const topList = getSortedZombieTopDamagers();

        if (nextHp <= 0) {
          if (specialZombieGiftProjQueueRef.current.nextLaunchTimer) {
            clearTimeout(specialZombieGiftProjQueueRef.current.nextLaunchTimer);
            specialZombieGiftProjQueueRef.current.nextLaunchTimer = null;
          }
          specialZombieGiftProjQueueRef.current.isFlying = false;
          specialZombieGiftProjQueueRef.current.queue = [];

          // ZOMBIE HẾT MÁU -> Dừng ngay nhạc nền sự kiện Zombie và chuyển sang pha gục ngã nằm ngang & tan biến (z_flow_5b_dying) + Khóa camera vào Zombie!
          soundEngine.setZombieEventActive(false, cfgNow);
          const dyingDurMs = Math.max(
            1000,
            Math.round((cfgNow.zombieFlow5bDyingDurationSec ?? 3.2) * 1000)
          );
          soundEngine.playZombieGrowlSfx(
            (cfgNow.ttsVolume || 1) * 0.85,
            cfgNow.zombieGrowlMp3Url,
            true
          );
          setCameraFocus({
            pilgrimId: null,
            focusRole: 'zombie',
            customZoom: cfgNow.cameraZoomScale || 2.35,
            reason: 'special_gift',
            startedAt: Date.now(),
            until: Date.now() + dyingDurMs + 1300,
            lockedUntil: Date.now() + dyingDurMs + 200,
          });
          setZombieEntity((prevZ) => {
            const dyingZ: ZombieEntityState = {
              ...prevZ,
              isWalking: false,
              isDying: true,
              dyingProgress: 0.02,
              recoilOffsetX: 0,
              recoilOffsetY: 0,
            };
            zombieEntityRef.current = dyingZ;
            return dyingZ;
          });
          const dyingState: ZombieEventRuntimeState = {
            ...curEv,
            phase: 'z_flow_5b_dying',
            hp: 0,
            hpShakeKey: curEv.hpShakeKey + 1,
            topDamagers: topList,
            elapsedPhaseMs: 0,
            timeLeftMs: dyingDurMs,
            totalDurationMs: dyingDurMs,
            ttsFinishedForPhase: false,
            activeFlowToken: undefined,
          };
          zombieEventStateRef.current = dyingState;
          setZombieEventState(dyingState);
          syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: dyingState });
          return;
        }

        const updatedCombatState: ZombieEventRuntimeState = {
          ...curEv,
          hp: nextHp,
          hpShakeKey: curEv.hpShakeKey + 1,
          topDamagers: topList,
        };
        zombieEventStateRef.current = updatedCombatState;
        setZombieEventState(updatedCombatState);

        // Nếu viên đạn vừa chạm Zombie là đạn quà đặc biệt (5, 10, 10+ xu), chuyển Camera sang viên đạn quà kế tiếp trong hàng chờ (nếu có)
        triggerNextSpecialGiftInQueue();
      }, delayMs + Math.max(80, durationMs - 20));

      return projItem;
    },
    [getSortedZombieTopDamagers, recordZombieDamageContribution]
  );
  fireZombieAttackProjectileRef.current = fireZombieAttackProjectile;

  // Bắt đầu ngay Luồng 1 của Sự kiện "Zombie tấn công"
  const startZombieEventFlowNow = useCallback(
    (wasRunningLesson?: boolean, broadcastSync = true) => {
      const cfg = configRef.current;
      if (cfg.zombieEventEnabled === false) {
        return;
      }
      quizNpcTimersRef.current.forEach((tid) => clearTimeout(tid));
      quizNpcTimersRef.current = [];

      // Tạm dừng tiết học đang chạy để nhường cho Luồng Sự Kiện
      const curBoard = classBoardStateRef.current;
      const shouldResume =
        typeof wasRunningLesson === 'boolean'
          ? wasRunningLesson
          : curBoard.isRunning;

      if (curBoard.isRunning) {
        const pausedBoard: ClassBoardRuntimeState = {
          ...curBoard,
          isRunning: false,
        };
        classBoardStateRef.current = pausedBoard;
        setClassBoardState(pausedBoard);
        if (broadcastSync) {
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', { state: pausedBoard });
        }
      }

      zombieDamageMapRef.current.clear();
      if (zombieHeartBatchRef.current.timer) {
        clearTimeout(zombieHeartBatchRef.current.timer);
        zombieHeartBatchRef.current.timer = null;
      }
      zombieHeartBatchRef.current.seatedByUser.clear();
      zombieHeartBatchRef.current.queueByUser.clear();
      if (specialZombieGiftProjQueueRef.current.nextLaunchTimer) {
        clearTimeout(specialZombieGiftProjQueueRef.current.nextLaunchTimer);
        specialZombieGiftProjQueueRef.current.nextLaunchTimer = null;
      }
      specialZombieGiftProjQueueRef.current.isFlying = false;
      specialZombieGiftProjQueueRef.current.queue = [];

      const maxHp = Math.max(100, cfg.zombieMaxHp || 10000);
      const level = Math.max(1, cfg.zombieLevel || 1);
      const spawnPos = cfg.zombieSpawnPos || { x: 42, y: 520 };
      const standPos = cfg.zombieStandPos || { x: 270, y: 486 };
      const teacherEvPos = cfg.zombieTeacherPos || { x: 392, y: 444 };
      const supervisorEvPos = cfg.zombieSupervisorPos || { x: 148, y: 498 };

      // Đặt vị trí của Cô Thảo và Thầy Tùng khi Event Zombie kích hoạt theo cấu hình Dev
      setMonks((prevMonks) => {
        const nextMonks = prevMonks.map((m) => {
          if (m.role === 'abbot') {
            return {
              ...m,
              name: 'Cô Thảo',
              x: teacherEvPos.x,
              y: teacherEvPos.y,
              targetX: teacherEvPos.x,
              targetY: teacherEvPos.y,
              moveAxis: 'idle' as const,
              facingLeft: true,
              pauseTimer: 999,
            };
          }
          if (m.role === 'senior_novice') {
            return {
              ...m,
              name: 'Thầy Tùng',
              x: supervisorEvPos.x,
              y: supervisorEvPos.y,
              targetX: supervisorEvPos.x,
              targetY: supervisorEvPos.y,
              moveAxis: 'idle' as const,
              facingLeft: false,
              pauseTimer: 999,
            };
          }
          return m;
        });
        monksRef.current = nextMonks;
        return nextMonks;
      });

      const resetZEntity: ZombieEntityState = {
        visible: false,
        x: spawnPos.x,
        y: spawnPos.y,
        targetX: standPos.x,
        targetY: standPos.y,
        isWalking: false,
        facing: standPos.x >= spawnPos.x ? 'right' : 'left',
        recoilOffsetX: 0,
        recoilOffsetY: 0,
        isDying: false,
        dyingProgress: 0,
        animTime: 0,
        hitFlashUntil: 0,
      };
      zombieEntityRef.current = resetZEntity;
      setZombieEntity(resetZEntity);
      setZombieProjectiles([]);
      setZombieSpikyDamages([]);
      setFlyingMilkTeas([]);

      // Mở camera toàn cảnh lớp học ở Luồng 1
      setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });

      // Luồng 1: Cô giáo đọc cả chữ to tiêu đề bảng lẫn dòng chữ nhỏ cảnh báo
      const introTitleSpeech = (
        cfg.zombieFlow1Title || 'Sự kiện đẩy lùi Zombie'
      )
        .replace(/\[Cấp\]/gi, String(level))
        .trim();
      const introSubSpeech = (
        cfg.zombieFlow1Subtitle ||
        'Zombie tiến vào lớp học, hãy bảo vệ cô giáo và đẩy lùi zombie để tiếp tục tiết học'
      )
        .replace(/\[Cấp\]/gi, String(level))
        .trim();
      const fullIntroSpeech = [introTitleSpeech, introSubSpeech]
        .filter(Boolean)
        .join('. ');

      const flowToken1 = `z_flow_1_${Date.now()}`;
      soundEngine.playBell((cfg.ttsVolume || 1) * 0.8, null, true);

      const enqueued1 = soundEngine.isRemoteSlaveMode()
        ? Boolean(cfg.ttsEnabled)
        : soundEngine.enqueueLessonFlowItems(
            [
              {
                text: fullIntroSpeech,
                lang: 'vi',
                speakerRole: 'abbot',
                lessonFlowToken: flowToken1,
                lessonStepLabel: 'Sự kiện Zombie - Luồng 1: Cảnh báo',
              },
            ],
            cfg
          );

      const minDur1Ms = Math.max(
        500,
        Math.round((cfg.zombieFlow1MinDurationSec ?? 2.4) * 1000)
      );
      const dur1 = enqueued1 ? Math.max(15000, minDur1Ms + 4000) : Math.max(2500, minDur1Ms + 1500);
      const nextZState: ZombieEventRuntimeState = {
        isActive: true,
        isQueued: false,
        phase: 'z_flow_1_intro',
        level,
        hp: maxHp,
        maxHp,
        trailHp: maxHp,
        hpShakeKey: 0,
        topDamagers: [],
        activeFlowToken: flowToken1,
        ttsFinishedForPhase: !enqueued1,
        elapsedPhaseMs: 0,
        timeLeftMs: dur1,
        totalDurationMs: dur1,
        resumeLessonAfterEvent: shouldResume,
      };
      zombieEventStateRef.current = nextZState;
      setZombieEventState(nextZState);
      if (broadcastSync) {
        syncService.sendCommand('TRIGGER_ZOMBIE_EVENT', {
          wasRunningLesson: shouldResume,
        });
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: nextZState });
      }
      pushToast('🧟 SỰ KIỆN ĐẨY LÙI ZOMBIE BẮT ĐẦU!', true);
    },
    [pushToast]
  );

  // Hệ thống 7 Event Quà Tặng Lớp Học & Hóa Vàng Tên trong Hàng Chờ:
  // 1. Nếu người chơi có trong lớp -> thực hiện hành động ngay lập tức + cộng điểm + floating text + play sound quà.
  // 2. Nếu người chơi trong danh sách hàng chờ hoặc chưa có trong hàng chờ:
  //    - Đẩy lên top đầu danh sách và hóa vàng tên người chơi (khóa nằm trên đầu, ưu tiên vào lớp hơn cả Top 1).
  //    - Nếu là Tặng hoa cho cô (rose) hoặc Tặng hoa cho thầy (icecream): Tạo 1 model học sinh tách biệt tại vị trí đám đông chạy lên tặng hoa (ném trúng mới hiện chatbox cảm ơn), sau đó quay về đám đông và xóa đi.
  //    - Nếu là 5 món quà còn lại (cat, gg, heart, pig, vip): Hiện chatbox cảm ơn của Cô Giáo ngay khi nhận quà, lưu hàng chờ hành động tặng quà và kích hoạt ngay sau khi học sinh vào lớp & đã ngồi vào vị trí bàn học!
  const handleTriggerClassroomGift = useCallback(
    (opts: {
      username?: string;
      prayer?: string;
      gender?: 'female' | 'male';
      giftName?: string;
      coins?: number;
      comboCount?: number;
      avatarUrl?: string | null;
      isBot?: boolean;
      preferSeatedIfBlank?: boolean;
      broadcastSync?: boolean;
    }) => {
      const cfg = configRef.current;
      const now = Date.now();
      const giftMeta = resolveClassroomGiftKind(opts.giftName, opts.coins ?? 1);
      const isZombieEventRunningNow = zombieEventStateRef.current.isActive;
      let pickedFromNpcFallback = false;

      // Xác định tên người tặng quà:
      // - Nếu có preferSeatedIfBlank === true thì ưu tiên chọn học sinh đang ngồi tại các bàn học trong lớp để đạn xuất phát đúng từ tọa độ (x, y) bàn học!
      let rawName = (opts.username || '').trim();
      if (!rawName && opts.preferSeatedIfBlank) {
        const seatedStudents = pilgrimsRef.current.filter(
          (p) =>
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        if (seatedStudents.length > 0) {
          rawName =
            seatedStudents[Math.floor(Math.random() * seatedStudents.length)]
              .username;
        }
      }
      if (!rawName) {
        const seatedSet = new Set(
          pilgrimsRef.current
            .filter(
              (p) =>
                Boolean(p.slotId) &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            )
            .map((p) => p.username.trim().toLowerCase())
        );
        const queueCandidates = Array.from(
          waitingPoolRef.current.values()
        ).filter((q) => !seatedSet.has(q.username.trim().toLowerCase()));
        if (queueCandidates.length > 0) {
          rawName =
            queueCandidates[Math.floor(Math.random() * queueCandidates.length)]
              .username;
        } else {
          pickedFromNpcFallback = true;
          const names =
            npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
          const outsideNames = names.filter(
            (n) => !seatedSet.has(n.trim().toLowerCase())
          );
          if (outsideNames.length > 0) {
            rawName =
              outsideNames[Math.floor(Math.random() * outsideNames.length)];
          }
        }
      }
      if (!rawName) {
        pickedFromNpcFallback = true;
        const names =
          npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
        rawName = names[Math.floor(Math.random() * names.length)];
      }

      const safety = inspectUserInteraction(
        rawName,
        opts.prayer || '',
        safetyActionMode,
        safetyCategories,
        customWords
      );
      const safeName = safety.safeUsername || rawName;
      const safeComment = safety.safePrayer || '';
      const lowerUser = safeName.trim().toLowerCase();

      // Kiểm tra xem người chơi hiện có trong Lớp hoặc Hàng Chờ không (và có phải NPC không)
      const existingInClass = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          Boolean(p.slotId) &&
          !p.leaveAfterGiftAction &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const pool = waitingPoolRef.current;
      const existingInQueue = pool.get(lowerUser);
      const isAttackerBot = Boolean(
        opts.isBot ||
          existingInClass?.isBot ||
          existingInQueue?.isBot ||
          pickedFromNpcFallback
      );

      // Tính toán Combo tặng quà cho người chơi:
      // - Nếu truyền trực tiếp opts.comboCount > 1 (từ TikTok repeatCount hoặc nút Test Combo)
      // - Hoặc nếu cùng 1 người chơi tặng quà liên tiếp trong vòng 14 giây / khi đang thực hiện quà trước
      const prevStreak = userGiftComboStreakRef.current.get(lowerUser);
      const isWithinStreakWindow =
        Boolean(prevStreak) && now - (prevStreak?.lastAt || 0) <= 14000;
      const rawInputCombo = Math.max(1, Math.round(opts.comboCount || 1));
      const nextStreakCount = isWithinStreakWindow
        ? Math.max(
            (prevStreak?.count || 1) + (rawInputCombo > 1 ? rawInputCombo : 1),
            rawInputCombo
          )
        : rawInputCombo;
      userGiftComboStreakRef.current.set(lowerUser, {
        count: nextStreakCount,
        lastAt: now,
      });
      const effectiveCombo = nextStreakCount;

      if (opts.broadcastSync !== false) {
        syncService.sendCommand('TRIGGER_CLASSROOM_GIFT', {
          username: safeName,
          prayer: safeComment,
          gender: opts.gender,
          giftName: opts.giftName || giftMeta.giftLabel,
          coins: opts.coins ?? giftMeta.coins,
          comboCount: effectiveCombo,
          avatarUrl: opts.avatarUrl || null,
          isBot: isAttackerBot,
        });
      }

      const rawGiftCoins = Math.max(1, Number(opts.coins ?? giftMeta.coins));
      const grantsShield = rawGiftCoins >= 5 || giftMeta.coins >= 5;

      const isFlowerGift =
        giftMeta.id === 'rose' || giftMeta.id === 'icecream';

      // TRƯỜNG HỢP 1: Người chơi ĐANG CÓ TRONG LỚP -> Xếp vào hàng chờ hành động tuần tự (nếu đang rảnh thì chạy ngay, nếu đang bận quà trước thì chờ xong mới chạy quà tiếp theo)
      if (existingInClass) {
        const bonusPts = giftMeta.bonusPoints;
        // Riêng quà tặng hoa cho Cô/Thầy: chỉ cộng điểm thưởng khi ném hoa trúng Cô/Thầy
        if (!isFlowerGift && !(isZombieEventRunningNow && isAttackerBot)) {
          addLotusPointsToDonor(safeName, bonusPts);
        }

        // Nếu tặng quà từ 5 coin trở lên -> Nhận ngay Khiên bảo vệ (không cộng dồn)
        if (grantsShield && !existingInClass.hasShield) {
          const withShield = pilgrimsRef.current.map((p) =>
            p.id === existingInClass.id ? { ...p, hasShield: true } : p
          );
          pilgrimsRef.current = withShield;
          setPilgrims(withShield);
        }

        // Nếu thuộc nhóm quà phạt đặc biệt (5 / 10 / 10+) -> chỉ ghi nhận ngay khi không ở trong Event Zombie
        if (
          !zombieEventStateRef.current.isActive &&
          (giftMeta.id === 'heart' ||
            giftMeta.id === 'pig' ||
            giftMeta.id === 'vip')
        ) {
          registerStudentForPunishment(safeName, giftMeta.id);
        }

        // Nếu đang trong Luồng 5 Chiến Đấu Zombie -> Bắn ngay 1 viên đạn quà tặng (1 coin = 100 sát thương) từ đúng tọa độ (x, y) của học sinh đang ngồi ở bàn học!
        // (Nếu là NPC tấn công thì không tính điểm vào Bảng Chiến Công)
        if (
          zombieEventStateRef.current.isActive &&
          zombieEventStateRef.current.phase === 'z_flow_5_combat'
        ) {
          const rawCoins = Math.max(1, Number(opts.coins ?? giftMeta.coins));
          const projKind: ZombieProjectileKind =
            rawCoins >= 10 ? 'desk_mate' : rawCoins >= 5 ? 'chair' : 'book';
          const launchCoords = getSeatedStudentLaunchPos(existingInClass);
          fireZombieAttackProjectile({
            attackerUsername: safeName,
            startX: launchCoords.x,
            startY: launchCoords.y,
            damage: rawCoins * 100,
            kind: projKind,
            giftId: giftMeta.id,
            giftCoins: rawCoins,
            isSeated: true,
            avatarColor: existingInClass.avatarColor,
            avatarUrl: existingInClass.avatarUrl,
            isBot: isAttackerBot,
            skipIndividualScoreRecord: isAttackerBot,
          });
        }

        if (isZombieEventRunningNow && isAttackerBot) {
          return;
        }

        const existingUserQueue =
          pendingGiftActionsByUserRef.current.get(lowerUser) || [];
        // Khi đang diễn ra Event Đẩy Lùi Zombie: tất cả các hành động quà tặng bình thường trong lớp đều đưa vào hàng chờ
        // (Đợi khi sự kiện Zombie kết thúc, bắt đầu vòng câu hỏi mới thì mới kích hoạt tuần tự), tuyệt đối không chạy trùng lúc dùng quà tấn công Zombie!
        const isZombieEventRunning = zombieEventStateRef.current.isActive;
        const isStudentIdleAtSeat =
          !isZombieEventRunning &&
          existingInClass.state === 'pray_seated' &&
          existingUserQueue.length === 0 &&
          now >= (existingInClass.giftActionBusyUntil || 0);

        if (isStudentIdleAtSeat) {
          executeSeatedClassroomGiftAction(
            existingInClass.id,
            safeName,
            giftMeta.id,
            safeComment,
            false,
            effectiveCombo
          );
          return;
        }

        // Nếu đang trong Event Zombie hoặc học sinh đang bận thực hiện hành động quà trước ->
        // Đẩy hành động vào hàng chờ tuần tự (sẽ tự động kích hoạt khi Event Zombie kết thúc và bắt đầu vòng câu hỏi mới)!
        const comboForQueued = isZombieEventRunning
          ? Math.max(1, effectiveCombo)
          : Math.max(2, effectiveCombo);
        const updatedPilgrimsWithCombo = pilgrimsRef.current.map((p) =>
          p.id === existingInClass.id
            ? {
                ...p,
                hasShield: grantsShield ? true : p.hasShield,
                comboCount:
                  comboForQueued > 1 ? comboForQueued : p.comboCount,
                comboUntil:
                  comboForQueued > 1 ? now + 9000 : p.comboUntil,
                comboPopKey:
                  comboForQueued > 1 ? now : p.comboPopKey,
                totalFlowersToThrow:
                  p.state === 'walk_to_teacher_gift' ||
                  p.state === 'throw_flower_at_teacher'
                    ? 3
                    : p.totalFlowersToThrow,
              }
            : p
        );
        pilgrimsRef.current = updatedPilgrimsWithCombo;
        setPilgrims(updatedPilgrimsWithCombo);

        const nextQueue = [
          ...existingUserQueue,
          {
            id: `pga_inclass_${now}_${Math.random().toString(36).slice(2, 6)}`,
            giftId: giftMeta.id,
            comment: safeComment,
            comboCount: comboForQueued,
            isDeferredFromQueue: true,
            addedAt: now,
          },
        ];
        pendingGiftActionsByUserRef.current.set(lowerUser, nextQueue);
        pushToast(
          isZombieEventRunning
            ? `🧟 ${safeName} dùng ${giftMeta.giftLabel} tấn công Zombie! (Hành động "${giftMeta.actionTitle}" đã xếp vào hàng chờ sau Event #${nextQueue.length})`
            : `🔥 ${safeName} tặng ${giftMeta.giftLabel} (COMBO x${comboForQueued} • +${bonusPts}đ) -> Đã xếp hàng chờ hành động tuần tự (#${nextQueue.length})!`,
          true
        );
        return;
      }

      // TRƯỜNG HỢP 2 & 3: Người chơi ĐANG TRONG HÀNG CHỜ hoặc CHƯA CÓ TRONG LỚP / HÀNG CHỜ
      const bonusPts = giftMeta.bonusPoints;
      if (!isFlowerGift && !(isZombieEventRunningNow && isAttackerBot)) {
        addLotusPointsToDonor(safeName, bonusPts);
      }

      const resolvedGender = resolveUserGender(safeName, opts.gender);
      const resolvedAvatar =
        opts.avatarUrl ||
        existingInQueue?.avatarUrl ||
        (isAttackerBot
          ? npcAvatarsRef.current[
              Math.floor(Math.random() * npcAvatarsRef.current.length)
            ]
          : null);

      if (existingInQueue) {
        if (!isAttackerBot) {
          existingInQueue.isGoldenPriority = true;
          existingInQueue.goldenPriorityAt =
            existingInQueue.goldenPriorityAt || now;
          existingInQueue.isBot = false;
        }
        if (!isFlowerGift && !(isZombieEventRunningNow && isAttackerBot)) {
          existingInQueue.points = (existingInQueue.points || 0) + bonusPts;
        }
        existingInQueue.coins = (existingInQueue.coins || 0) + giftMeta.coins;
        existingInQueue.avatarUrl = resolvedAvatar;
        if (grantsShield && !isAttackerBot) {
          existingInQueue.hasShield = true;
        }
        recomputeWaitingQueueLazy();
      } else {
        pool.set(lowerUser, {
          id: `wq_gold_${now}_${Math.random().toString(36).slice(2, 6)}`,
          username: safeName,
          prayer: safeComment || `Tặng ${giftMeta.giftLabel}`,
          gender: resolvedGender,
          isVip: !isAttackerBot,
          coins: giftMeta.coins,
          isBot: isAttackerBot,
          avatarUrl: resolvedAvatar,
          addedAt: now,
          points:
            isFlowerGift || (isZombieEventRunningNow && isAttackerBot)
              ? 0
              : bonusPts,
          rank: 1,
          answeredCorrectInRound: !isAttackerBot,
          lastElapsedSec: 0.1,
          idleRounds: 0,
          isGoldenPriority: !isAttackerBot,
          goldenPriorityAt: !isAttackerBot ? now : undefined,
          hasShield: grantsShield && !isAttackerBot,
        });
        recomputeWaitingQueueLazy();
      }

      // Đồng bộ ngay đám đông hàng chờ ngoài cửa (doorCrowdRef) để luôn có người trong hàng chờ nhận thẻ tên và ném đạn từ cửa lớp
      const crowdPos = cfg.doorCrowdPos || LEFT_DOOR_POS;
      const maxCluster = Math.max(1, cfg.doorCrowdCount ?? 7);
      let currentCrowd = [...doorCrowdRef.current];
      if (currentCrowd.length === 0) {
        currentCrowd = buildDoorCrowdPool(
          maxCluster,
          crowdPos,
          currentCrowd,
          npcNamesRef.current,
          npcAvatarsRef.current,
          cfg.doorCrowdSpread ?? 1,
          Array.from(pool.values())
        );
      }

      // Nhập thẻ tên người tặng quà vào 1 người trong hàng chờ ngoài cửa (nếu đã có tên thì chọn đúng người đó, chưa có thì nhập thẻ tên vào 1 người bất kỳ trong hàng chờ)
      let chosenCrowdIdx = currentCrowd.findIndex(
        (c) => c.username.trim().toLowerCase() === lowerUser
      );
      if (chosenCrowdIdx < 0 && currentCrowd.length > 0) {
        const activeRunnerUsers = new Set(
          specialFlowerRunnersRef.current.map((r) =>
            r.username.trim().toLowerCase()
          )
        );
        const freeIndices: number[] = [];
        for (let i = 0; i < currentCrowd.length; i++) {
          if (
            !activeRunnerUsers.has(
              currentCrowd[i].username.trim().toLowerCase()
            )
          ) {
            freeIndices.push(i);
          }
        }
        chosenCrowdIdx =
          freeIndices.length > 0
            ? freeIndices[Math.floor(Math.random() * freeIndices.length)]
            : Math.floor(Math.random() * currentCrowd.length);
      }

      let boundCrowdMember: PilgrimData | null = null;
      if (chosenCrowdIdx >= 0 && currentCrowd[chosenCrowdIdx]) {
        const targetMember = currentCrowd[chosenCrowdIdx];
        boundCrowdMember = {
          ...targetMember,
          username: safeName,
          gender: resolvedGender,
          avatarUrl: resolvedAvatar || targetMember.avatarUrl,
          isVip: !isAttackerBot ? true : targetMember.isVip,
          isBot: isAttackerBot,
          isGoldenPriority: !isAttackerBot ? true : targetMember.isGoldenPriority,
          hasShield:
            grantsShield && !isAttackerBot ? true : targetMember.hasShield,
          giftActionHighlightUntil: now + 6000,
        };
        currentCrowd[chosenCrowdIdx] = boundCrowdMember;
        doorCrowdRef.current = currentCrowd;
        setDoorCrowd(currentCrowd);
      }

      // Nếu đang trong Luồng 5 Chiến Đấu Zombie -> Bắn ngay 1 viên đạn quà tặng từ vị trí của người trong hàng chờ ngoài cửa (boundCrowdMember)!
      // (Nếu là NPC tấn công thì chỉ gây sát thương phụ trợ giết Boss, KHÔNG tính điểm vào Bảng Chiến Công!)
      if (
        zombieEventStateRef.current.isActive &&
        zombieEventStateRef.current.phase === 'z_flow_5_combat'
      ) {
        const rawCoins = Math.max(1, Number(opts.coins ?? giftMeta.coins));
        const projKind: ZombieProjectileKind =
          rawCoins >= 10 ? 'desk_mate' : rawCoins >= 5 ? 'chair' : 'book';
        const fallbackCrowdPos = cfg.doorCrowdPos || LEFT_DOOR_POS;

        fireZombieAttackProjectile({
          attackerUsername: safeName,
          startX: boundCrowdMember ? boundCrowdMember.x : fallbackCrowdPos.x,
          startY:
            (boundCrowdMember ? boundCrowdMember.y : fallbackCrowdPos.y) - 18,
          damage: rawCoins * 100,
          kind: projKind,
          giftId: giftMeta.id,
          giftCoins: rawCoins,
          isSeated: false,
          avatarUrl: resolvedAvatar,
          isBot: isAttackerBot,
          skipIndividualScoreRecord: isAttackerBot,
        });
      }

      // Nếu là NPC tấn công trong Sự kiện Zombie (phụ trợ âm thầm seeding giết Boss) -> kết thúc ngay, không xếp hàng chờ hành động sau Event
      if (isZombieEventRunningNow && isAttackerBot) {
        return;
      }

      // Nếu là Tặng hoa cho cô (rose) hoặc Tặng hoa cho thầy (icecream) khi học sinh không có trong lớp:
      // Đã thêm vào hàng chờ (nếu chưa có) + nhập thẻ tên vào 1 người trong hàng chờ (boundCrowdMember) -> cho đúng người đó chạy từ vị trí đứng trong hàng chờ lên tặng hoa rồi quay về vị trí cũ!
      if (giftMeta.id === 'rose' || giftMeta.id === 'icecream') {
        const isForTeacher = giftMeta.id === 'rose';
        const targetRole: 'abbot' | 'senior_novice' = isForTeacher
          ? 'abbot'
          : 'senior_novice';
        const targetNpc = monksRef.current.find((m) => m.role === targetRole);
        const originX = boundCrowdMember ? boundCrowdMember.x : crowdPos.x;
        const originY = boundCrowdMember ? boundCrowdMember.y : crowdPos.y;
        const sideGiftPos = getTeacherSideGiftPos(
          targetNpc?.x ?? (isForTeacher ? 360 : 130),
          targetNpc?.y ?? (isForTeacher ? 444 : 498),
          originX
        );
        const targetX = sideGiftPos.x;
        const targetY = sideGiftPos.y;
        const runnerId = boundCrowdMember
          ? boundCrowdMember.id
          : nextIdRef.current++;
        const hasCombo = effectiveCombo > 1;

        const detachedRunner: PilgrimData = {
          id: runnerId,
          username: safeName,
          prayer: '',
          gender: resolvedGender,
          isVip: true,
          isBot: Boolean(opts.isBot),
          coins: giftMeta.coins,
          offeringType: 'rose',
          slotId: null,
          x: originX,
          y: originY,
          laneX: originX,
          slotX: originX,
          slotY: originY,
          speed: 205,
          state: 'walk_to_teacher_gift',
          stateTimer: 0,
          prayTimer: 0,
          totalPrayDuration: 999,
          animTime: 0,
          facingLeft: false,
          avatarColor:
            boundCrowdMember?.avatarColor ||
            AVATAR_COLORS[Math.abs(runnerId) % AVATAR_COLORS.length],
          avatarUrl: resolvedAvatar || boundCrowdMember?.avatarUrl || null,
          hairSeed: boundCrowdMember?.hairSeed || Math.abs(runnerId) || 1,
          isCarryingGift: true,
          hasComment: false,
          chatBubbleUntil: 0,
          giftActionHighlightUntil: now + 6000,
          isGoldenPriority: true,
          giftActionKind: giftMeta.id,
          giftTargetRole: targetRole,
          giftTargetPos: { x: targetX, y: targetY },
          comboCount: hasCombo ? effectiveCombo : undefined,
          comboUntil: hasCombo ? now + 8500 : undefined,
          comboPopKey: hasCombo ? now : undefined,
          totalFlowersToThrow: hasCombo ? 3 : 1,
          flowersThrownCount: 0,
          flowerBurstsDoneCount: 0,
          pendingFlowerBonusPoints: bonusPts,
          flowerBonusAwarded: false,
          floatingScoreUntil: 0,
          isDetachedFlowerRunner: true,
        };

        const isZombieEventRunning = zombieEventStateRef.current.isActive;
        const activeRunnerForSameUser = specialFlowerRunnersRef.current.find(
          (r) => r.username.trim().toLowerCase() === lowerUser
        );

        // Nếu người này đang trên đường chạy lên tặng hoa (chưa ném xong): gộp luôn thành Combo 3 hoa vào lượt đang chạy (KHÔNG đẩy thêm bản sao thứ 2 vào hàng chờ để tránh bị play 2 lần!)
        if (
          !isZombieEventRunning &&
          activeRunnerForSameUser &&
          activeRunnerForSameUser.state === 'walk_to_teacher_gift'
        ) {
          const updatedActiveRunners = specialFlowerRunnersRef.current.map(
            (r) =>
              r.username.trim().toLowerCase() === lowerUser
                ? {
                    ...r,
                    comboCount: Math.max(2, effectiveCombo),
                    comboUntil: now + 9000,
                    comboPopKey: now,
                    totalFlowersToThrow: 3,
                  }
                : r
          );
          specialFlowerRunnersRef.current = updatedActiveRunners;
          setSpecialFlowerRunners(updatedActiveRunners);
          pushToast(
            `🔥 ${safeName} tặng ${giftMeta.giftLabel} (COMBO x${Math.max(
              2,
              effectiveCombo
            )} • +${bonusPts}đ) -> Nâng cấp ném 3 đóa hoa liên tiếp!`,
            true
          );
          return;
        }

        // Nếu đang trong Event Đẩy Lùi Zombie hoặc người chơi đã ném xong đang đi về -> xếp vào hàng chờ pendingDetachedRunnersRef (chỉ phát âm thanh khi xuất phát lượt mới)
        if (isZombieEventRunning || activeRunnerForSameUser) {
          const queuedRunner = {
            ...detachedRunner,
            comboCount: isZombieEventRunning
              ? hasCombo
                ? effectiveCombo
                : undefined
              : Math.max(2, effectiveCombo),
            comboUntil:
              !isZombieEventRunning || hasCombo ? now + 9000 : undefined,
            comboPopKey: !isZombieEventRunning || hasCombo ? now : undefined,
            totalFlowersToThrow:
              !isZombieEventRunning || hasCombo ? 3 : 1,
          };
          pendingDetachedRunnersRef.current.push(queuedRunner);
          pushToast(
            isZombieEventRunning
              ? `🧟 ${safeName} dùng ${giftMeta.giftLabel} tấn công Zombie! (Hành động chạy lên tặng hoa đã xếp vào hàng chờ sau Event)`
              : `🔥 ${safeName} tặng ${giftMeta.giftLabel} (COMBO x${Math.max(
                  2,
                  effectiveCombo
                )} • +${bonusPts}đ) -> Đã xếp hàng chờ chạy lên tặng hoa lượt tiếp theo!`,
            true
          );
          return;
        }

        soundEngine.playGiftEventSound(giftMeta.id, cfg);
        const nextRunners = [
          ...specialFlowerRunnersRef.current,
          detachedRunner,
        ];
        specialFlowerRunnersRef.current = nextRunners;
        setSpecialFlowerRunners(nextRunners);

        pushToast(
          `${isForTeacher ? '🌹' : '🍦'} ${safeName} tặng ${giftMeta.giftLabel}${
            hasCombo ? ` (🔥 COMBO x${effectiveCombo} -> Ném 3 đóa hoa)` : ''
          } (+${bonusPts}đ) -> Nhập thẻ tên vào Hàng Chờ & Chạy lên tặng hoa!`,
          true
        );
        return;
      }

      // Còn 5 hình thức quà còn lại (cat, gg, heart, pig, vip) khi học sinh đang ở ngoài lớp:
      // - Chỉ lưu vào hàng chờ hành động tặng quà tuần tự của học sinh này -> tự động phát âm thanh & kích hoạt 1 lần duy nhất sau khi vào lớp và ngồi vào bàn học (KHÔNG phát trước ở ngoài lớp để tránh bị play 2 lần)!
      const existingActionList =
        pendingGiftActionsByUserRef.current.get(lowerUser) || [];
      pendingGiftActionsByUserRef.current.set(lowerUser, [
        ...existingActionList,
        {
          id: `pga_${now}_${Math.random().toString(36).slice(2, 6)}`,
          giftId: giftMeta.id,
          comment: safeComment,
          comboCount: effectiveCombo,
          isDeferredFromQueue: true,
          addedAt: now,
        },
      ]);

      pushToast(
        zombieEventStateRef.current.isActive
          ? `🧟 ${safeName} dùng ${giftMeta.giftLabel} tấn công Zombie! (Hành động "${giftMeta.actionTitle}" đã xếp vào hàng chờ sau Event)`
          : `👑 ${safeName} tặng ${giftMeta.giftLabel} (+${bonusPts}đ) -> Hóa Vàng Đầu Hàng Chờ (Sẽ phát & kích hoạt "${giftMeta.actionTitle}" khi ngồi vào bàn)!`,
        true
      );
    },
    [
      addGrandEventPoints,
      addLotusPointsToDonor,
      customWords,
      executeSeatedClassroomGiftAction,
      fireZombieAttackProjectile,
      getSeatedStudentLaunchPos,
      pushToast,
      recomputeWaitingQueueLazy,
      registerStudentForPunishment,
      resolveUserGender,
      safetyActionMode,
      safetyCategories,
      triggerTeacherGiftThankBubble,
    ]
  );

  // Hàm chính: Tạo hoặc nâng cấp Học Sinh khi có sự kiện Bình luận / Tặng quà / NPC vào lớp
  const spawnOrPromotePilgrim = useCallback(
    (
      opts: {
        username: string;
        prayer: string;
        gender?: 'female' | 'male';
        isVip: boolean;
        coins: number;
        isBot: boolean;
        avatarUrl?: string | null;
        comboCount?: number;
        giftName?: string;
        isSimulatedTest?: boolean;
        bypassWaitingQueue?: boolean;
        allowDoorCrowdBubbleForBot?: boolean;
      },
      extraOpts?: {
        forceAdmitFromQueue?: boolean;
        skipStateCommit?: boolean;
        spawnDelaySec?: number;
      }
    ): boolean => {
      const cfg = configRef.current;
      const isAdmittingFromQueue = Boolean(extraOpts?.forceAdmitFromQueue);
      const skipStateCommit = Boolean(extraOpts?.skipStateCommit);
      const spawnDelaySec = Math.max(0, Number(extraOpts?.spawnDelaySec || 0));
      const bypassWaitingQueue = Boolean(
        opts.bypassWaitingQueue || isAdmittingFromQueue
      );

      // 1. Kiểm tra lọc từ cấm & an toàn
      const safety = inspectUserInteraction(
        opts.username,
        opts.prayer,
        safetyActionMode,
        safetyCategories,
        customWords
      );
      if (safety.logEntries.length > 0) {
        setSafetyLogs((prev) => [...safety.logEntries, ...prev].slice(0, 60));
      }
      // Nếu đang đẩy học sinh từ Hàng Chờ vào lớp (forceAdmitFromQueue), không chặn việc vào lớp vì câu comment cũ bị dính lọc từ, chỉ xóa nội dung câu chat
      if (!safety.allowed && !isAdmittingFromQueue) return false;

      const safeName = (safety.safeUsername || opts.username || '').trim();
      if (!safeName) return false;
      const safeComment = safety.allowed ? safety.safePrayer : '';
      const lowerUser = safeName.toLowerCase();

      // Kiểm tra xem người chơi hiện có trong Lớp hoặc trong Kho Hàng Chờ O(1) không (hoặc đang gõ lệnh "vào lớp")
      const existingInClassNow = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const isJoinCmd = isJoinClassCommand(safeComment);

      // Nhận diện lệnh gõ 1nam hoặc 1nu để đổi giới tính nhân vật học sinh (Nam / Nữ)
      const genderCmd = parseGenderCommand(safeComment);
      if (genderCmd) {
        userGenderOverridesRef.current.set(lowerUser, genderCmd);
        const queuedEntry = waitingPoolRef.current.get(lowerUser);
        if (queuedEntry) {
          queuedEntry.gender = genderCmd;
        }
        pushToast(
          `✨ ${safeName} đã đổi nhân vật sang Học Sinh ${
            genderCmd === 'male' ? 'Nam 👦' : 'Nữ 👧'
          }!`,
          false,
          `gender_${lowerUser}`
        );
      }

      // Nếu gõ lệnh "vào lớp" khi chưa ở trong lớp -> đưa vào Hàng Chờ trước khi chấm câu trả lời / hiện chat box
      if (
        opts.coins <= 0 &&
        !bypassWaitingQueue &&
        !existingInClassNow &&
        isJoinCmd
      ) {
        enqueueStudentToWaitingQueue({
          username: safeName,
          prayer: safeComment,
          gender: resolveUserGender(safeName, genderCmd || opts.gender),
          isVip: false,
          coins: 0,
          isBot: opts.isBot,
          avatarUrl: opts.avatarUrl,
        });
      }

      // Kiểm tra xem bình luận có trả lời đúng câu hỏi trên Bảng Lớp (Tiết Tiếng Anh) không:
      // Kể cả khi người chơi chưa ở trong lớp và chưa ở trong hàng chờ, nếu trả lời đúng trong thời gian hỏi
      // thì checkEnglishQuizAnswer sẽ tự động thêm người chơi vào Hàng Chờ kèm cộng điểm!
      let answeredQuizRight = false;
      if (safeComment.trim() && !isAdmittingFromQueue) {
        answeredQuizRight = checkEnglishQuizAnswer(
          safeName,
          safeComment,
          opts.isBot,
          opts.avatarUrl
        );
      }

      const isAlreadyInQueue = waitingPoolRef.current.has(lowerUser);

      // Nếu là bình luận thường (coins <= 0, không phải forceAdmitFromQueue):
      // Bắt buộc phải có trong Lớp, hoặc có trong Hàng Chờ, hoặc gõ "vào lớp", hoặc vừa trả lời đúng câu hỏi!
      if (
        opts.coins <= 0 &&
        !bypassWaitingQueue &&
        !existingInClassNow &&
        !isAlreadyInQueue &&
        !isJoinCmd &&
        !answeredQuizRight
      ) {
        return false;
      }

      // 3. Xử lý trường hợp TẶNG QUÀ (coins > 0) theo hệ thống 7 Event Quà Tặng Lớp Học:
      // LƯU Ý QUAN TRỌNG: Chỉ chạy khi đây là sự kiện tặng quà mới (!isAdmittingFromQueue).
      // Nếu học sinh đang được đẩy từ Hàng Chờ vào lớp (isAdmittingFromQueue === true) thì quà đã được xử lý lúc ở Hàng Chờ rồi,
      // tuyệt đối không gọi lại handleTriggerClassroomGift (tránh bị đẩy ngược lại vào Hàng Chờ gây lặp vô tận làm Sĩ Số = 0)!
      if (opts.coins > 0 && !isAdmittingFromQueue) {
        handleTriggerClassroomGift({
          username: safeName,
          prayer: safeComment,
          gender: genderCmd || opts.gender,
          giftName: opts.giftName,
          coins: opts.coins,
          comboCount: opts.comboCount,
          avatarUrl: opts.avatarUrl,
          isBot: opts.isBot,
          broadcastSync: false,
        });
        return false;
      }

      // 4. Xử lý Học Sinh đang ngồi trong lớp bình luận (coins === 0)
      // Nếu học sinh chưa có trong lớp lúc đầu nhưng vừa được cho vào lớp liền luôn do trả lời đúng khi lớp còn ghế trống:
      if (!existingInClassNow && answeredQuizRight) {
        const justAdmitted = pilgrimsRef.current.some(
          (p) =>
            p.username.trim().toLowerCase() === lowerUser &&
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        if (justAdmitted) {
          return true;
        }
      }
      const existing = existingInClassNow;

      if (existing) {
        if (safeComment.trim()) {
          const cleanSpeechComment = sanitizeAndLimitSpeechText(
            safeComment,
            cfg.maxTtsWords || 25
          );
          const nextPilgrims = pilgrimsRef.current.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  gender: genderCmd || p.gender,
                  prayer: safeComment,
                  hasComment: true,
                  prayTimer: 0,
                  chatBubbleUntil:
                    Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000,
                }
              : p
          );
          pilgrimsRef.current = nextPilgrims;
          setPilgrims(nextPilgrims);

          const shouldSpeakPrayer =
            cfg.ttsEnabled &&
            safety.allowTTS &&
            (!cfg.ttsVipOnly || existing.isVip) &&
            ((!opts.isBot && cfg.realPrayerTtsEnabled) ||
              (opts.isBot && cfg.npcPrayerTtsEnabled));

          if (shouldSpeakPrayer && cleanSpeechComment) {
            const tpl = pickRandomTemplate(
              cfg.prayerTtsTemplates,
              cfg.realPrayerTtsTemplate ||
                'Bạn [Tên] giơ tay phát biểu: [Comment]'
            );
            const speech = soundEngine.formatEventTemplate(
              tpl,
              safeName,
              cleanSpeechComment,
              cfg.maxTtsWords
            );
            soundEngine.enqueueTTS(speech, !opts.isBot, cfg, {
              pilgrimId: existing.id,
              username: safeName,
              reason: 'comment',
              isBot: existing.isBot,
            });
          }
        }
        return false;
      }

      // 5. Quy tắc khi người chơi hoặc NPC đang có mặt trong Hàng Chờ (không ngồi trong lớp) comment:
      // - Cập nhật nội dung comment mới nhất O(1) trong waitingPoolRef (không re-render mảng).
      // - Chọn 1 học sinh trong nhóm đang đứng chờ ngay cửa lớp (doorCrowd) để load tên + hiện bong bóng chat đẩy lên layer đầu.
      if (
        !bypassWaitingQueue &&
        (!opts.isBot || opts.allowDoorCrowdBubbleForBot)
      ) {
        const queuedEntry = waitingPoolRef.current.get(lowerUser);
        if (!queuedEntry) {
          return false;
        }

        if (safeComment.trim() && !isJoinCmd) {
          queuedEntry.prayer = safeComment;
          queuedEntry.gender = resolveUserGender(
            safeName,
            genderCmd || queuedEntry.gender
          );
        }

        if (safeComment.trim() && doorCrowdRef.current.length > 0) {
          const resolvedGender = resolveUserGender(
            safeName,
            genderCmd || opts.gender
          );
          enqueueDoorCrowdChat({
            username: safeName,
            lowerUser,
            comment: safeComment,
            gender: resolvedGender,
            avatarUrl: opts.avatarUrl,
            isBot: opts.isBot,
            allowTTS: safety.allowTTS,
          });
        }
        return false;
      }

      // Tìm tất cả ghế trống hiện tại trong lớp (số học sinh vào lớp = số ghế ngồi, đồng bộ ref ngay lập tức)
      const freeVipSlots = vipSlotsRef.current.filter(
        (s) => s.occupiedById === null
      );
      const freeNormSlots = normalSlotsRef.current.filter(
        (s) => s.occupiedById === null
      );
      const allFreeSlots = [...freeVipSlots, ...freeNormSlots];

      // Chọn 1 vị trí ghế trống NGẪU NHIÊN trong lớp
      let chosenSlot: KneelSlot | undefined;
      if (allFreeSlots.length > 0) {
        chosenSlot =
          allFreeSlots[Math.floor(Math.random() * allFreeSlots.length)];
      } else if (!opts.isBot && bypassWaitingQueue) {
        // Nếu người thật được gọi vào lớp từ Hàng Chờ nhưng ghế đang kín bởi NPC -> nhường ghế của 1 NPC cho người thật
        const botToReplace = pilgrimsRef.current.find(
          (p) =>
            p.isBot &&
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        if (botToReplace && botToReplace.slotId) {
          chosenSlot =
            normalSlotsRef.current.find((s) => s.id === botToReplace.slotId) ||
            vipSlotsRef.current.find((s) => s.id === botToReplace.slotId);
          const updatedAfterEvict = pilgrimsRef.current.map((p) =>
            p.id === botToReplace.id
              ? {
                  ...p,
                  slotId: null,
                  speed: 220,
                  state: 'leave_side_to_aisle' as const,
                  stateTimer: 0,
                }
              : p
          );
          pilgrimsRef.current = updatedAfterEvict;
          setPilgrims(updatedAfterEvict);
        }
      }

      if (!chosenSlot) {
        enqueueStudentToWaitingQueue({
          username: safeName,
          prayer: safeComment || 'vào lớp',
          isVip: Boolean(opts.isVip),
          coins: 0,
          isBot: opts.isBot,
          avatarUrl: opts.avatarUrl,
        });
        return false;
      }

      const id = nextIdRef.current++;
      const slotX = chosenSlot.x;
      const slotY = chosenSlot.y;
      const laneX = chosenSlot.aisleX ?? 270;

      // Đồng bộ ngay vào ref để khi đẩy hàng loạt từ Hàng Chờ không bị trùng ghế
      if (vipSlotsRef.current.some((s) => s.id === chosenSlot!.id)) {
        const nextVip = vipSlotsRef.current.map((s) =>
          s.id === chosenSlot!.id ? { ...s, occupiedById: id } : s
        );
        vipSlotsRef.current = nextVip;
        if (!skipStateCommit) {
          setVipSlots(nextVip);
        }
      } else {
        const nextNorm = normalSlotsRef.current.map((s) =>
          s.id === chosenSlot!.id ? { ...s, occupiedById: id } : s
        );
        normalSlotsRef.current = nextNorm;
        if (!skipStateCommit) {
          setNormalSlots(nextNorm);
        }
      }

      // Đi nhanh từ cửa chính bên trái (LEFT_DOOR_POS = { x: 46, y: 500 }) vào ghế trong khoảng ~3.5s (trước khi hết 7s còn lại của pha kết quả)
      // Khi chuyển từ hàng chờ vào lớp: đồng bộ số điểm qua bảng điểm lớp (lotusDonors) nhưng combo (correctStreak) reset về 0
      const queuedPts = Number((opts as { points?: number }).points || 0);
      if (isAdmittingFromQueue && queuedPts > 0) {
        const prevDonors = lotusDonorsRef.current;
        const idx = prevDonors.findIndex(
          (d) => d.username.trim().toLowerCase() === lowerUser
        );
        if (idx < 0 || prevDonors[idx].coins < queuedPts) {
          let nextDonorList: DonorEntry[];
          if (idx >= 0) {
            const updated = [...prevDonors];
            updated[idx] = { ...updated[idx], coins: queuedPts };
            nextDonorList = updated.sort((a, b) => b.coins - a.coins);
          } else {
            nextDonorList = [
              ...prevDonors,
              { username: safeName, coins: queuedPts },
            ].sort((a, b) => b.coins - a.coins);
          }
          lotusDonorsRef.current = nextDonorList;
          if (!skipStateCommit) {
            setLotusDonors(nextDonorList);
          }
        }
      }
      const existingDonorScore =
        lotusDonorsRef.current.find(
          (d) => d.username.trim().toLowerCase() === lowerUser
        )?.coins || 0;

      const existingExp = getStudentExpById(safeName);
      const existingLevel = getStudentLevelFromExp(existingExp);
      const newStudent: PilgrimData = {
        id,
        username: safeName,
        currentScoreDisplay: Math.max(queuedPts, existingDonorScore),
        exp: existingExp,
        level: existingLevel,
        prayer: safeComment,
        gender: opts.isBot
          ? resolveBalancedNpcGender(safeName, 'class', genderCmd || opts.gender)
          : resolveUserGender(safeName, genderCmd || opts.gender),
        isVip: false,
        isBot: opts.isBot,
        coins: 0,
        offeringType: 'incense',
        slotId: chosenSlot.id,
        x: LEFT_DOOR_POS.x,
        y: LEFT_DOOR_POS.y,
        laneX,
        slotX,
        slotY,
        speed:
          spawnDelaySec > 0
            ? 245 + Math.random() * 22
            : 220 + Math.random() * 18,
        state: 'walk_carpet_to_slot_y',
        stateTimer: 0,
        prayTimer: 0,
        totalPrayDuration: cfg.normalPrayDurationSec || 90,
        animTime: Math.random() * 10,
        facingLeft: false,
        avatarColor: AVATAR_COLORS[id % AVATAR_COLORS.length],
        avatarUrl:
          opts.avatarUrl ||
          (opts.isBot
            ? npcAvatarsRef.current[id % npcAvatarsRef.current.length]
            : null),
        hairSeed: id,
        hasComment: Boolean(
          safeComment.trim() && !isJoinClassCommand(safeComment)
        ),
        chatBubbleUntil:
          safeComment.trim() && !isJoinClassCommand(safeComment)
            ? Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000
            : 0,
        isSimulatedTest: opts.isSimulatedTest,
        isGoldenPriority: Boolean(
          (opts as { isGoldenPriority?: boolean }).isGoldenPriority
        ),
        hasShield: Boolean(
          (opts as { hasShield?: boolean }).hasShield || opts.coins >= 5
        ),
        correctStreak: 0,
        answeredCurrentQuestion: false,
        quizResultStatus: null,
        quizResultUntil: 0,
        spawnDelaySec: spawnDelaySec > 0 ? spawnDelaySec : undefined,
      };

      const nextPilgrimsList = [...pilgrimsRef.current, newStudent];
      pilgrimsRef.current = nextPilgrimsList;
      if (!skipStateCommit) {
        setPilgrims(nextPilgrimsList);
      }

      if (!opts.isBot && cfg.hudLayout.showNewPilgrimToast) {
        pushToast(`🎒 Học sinh ${safeName} vừa vào lớp nhận chỗ ngồi!`, false);
      }

      // Khi học sinh bước từ Hàng Chờ vào lớp nhận chỗ ngồi: chỉ đọc lời chào mừng vào lớp (nếu bật),
      // KHÔNG đọc lại comment cũ từ Hàng Chờ (chỉ đọc comment trực tiếp của các bạn đang ngồi trong lớp)
      if (cfg.ttsEnabled && safety.allowTTS) {
        const shouldReadWelcome =
          (!opts.isBot && cfg.realWelcomeTtsEnabled) ||
          (opts.isBot && cfg.npcWelcomeTtsEnabled);

        if (shouldReadWelcome) {
          const tpl = pickRandomTemplate(
            cfg.welcomeTtsTemplates,
            cfg.realWelcomeTtsTemplate || 'Chào mừng bạn [Tên] vừa vào lớp 12A1'
          );
          const speech = soundEngine.formatEventTemplate(
            tpl,
            safeName,
            '',
            cfg.maxTtsWords
          );
          soundEngine.enqueueTTS(speech, false, cfg, {
            pilgrimId: id,
            username: safeName,
            reason: 'comment',
            isBot: opts.isBot,
          });
        }
      }
      return true;
    },
    [
      checkEnglishQuizAnswer,
      customWords,
      enqueueStudentToWaitingQueue,
      executeGiftPilgrimEntry,
      pushToast,
      safetyActionMode,
      safetyCategories,
    ]
  );

  // Vòng lặp vật lý 60FPS cho Học Sinh & Giáo Viên trên bục giảng
  useEffect(() => {
    let lastMs = performance.now();
    let frameId = 0;

    const stepSimulation = (nowMs: number) => {
      const dt = Math.min(0.08, Math.max(0.001, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      const cfg = configRef.current;

      // 1. Cập nhật Cô Thảo & Thầy Tùng (chỉ setMonks khi thực sự có di chuyển hoặc đổi trạng thái để tránh re-render 60FPS khi đứng yên)
      setMonks((prevMonks) => {
        let hasMonkVisualChange = false;
        const nowMonkMs = Date.now();
        const nextMonks: TempleMonkData[] = prevMonks.map((m): TempleMonkData => {
          const expectedName = m.role === 'abbot' ? 'Cô Thảo' : 'Thầy Tùng';
          const zone =
            m.role === 'abbot'
              ? cfg.monkZone
              : cfg.supervisorZone || SUPERVISOR_ZONE_BOUNDS;
          let { x, y, targetX, targetY, moveAxis, facingLeft, pauseTimer, animTime } = m;
          animTime += dt;

          // Tự động dọn chatBubbleUntil / woodenFishRippleUntil đã hết hạn của giáo viên để giải phóng DOM
          let nextChatText = m.chatText;
          let nextChatBubbleUntil = m.chatBubbleUntil;
          if (nextChatBubbleUntil && nowMonkMs >= nextChatBubbleUntil) {
            nextChatText = undefined;
            nextChatBubbleUntil = undefined;
            hasMonkVisualChange = true;
          }
          let nextRippleUntil = m.woodenFishRippleUntil;
          if (nextRippleUntil && nowMonkMs >= nextRippleUntil) {
            nextRippleUntil = undefined;
            hasMonkVisualChange = true;
          }

          // Chế độ điều khiển thủ công bằng phím WASD cho Cô Thảo ('abbot') hoặc Thầy Tùng ('senior_novice')
          if (
            (m.role === 'abbot' && controlledNpcRoleRef.current === 'abbot') ||
            (m.role === 'senior_novice' &&
              controlledNpcRoleRef.current === 'senior_novice')
          ) {
            const keys = wasdKeysRef.current;
            const vx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
            const vy = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
            if (vx !== 0 || vy !== 0) {
              const len = Math.hypot(vx, vy) || 1;
              const moveSpeed = m.speed * 2.15;
              x = Math.max(24, Math.min(516, x + (vx / len) * moveSpeed * dt));
              y = Math.max(360, Math.min(930, y + (vy / len) * moveSpeed * dt));
              if (vx !== 0) facingLeft = vx < 0;
              moveAxis = Math.abs(vx) >= Math.abs(vy) ? 'x' : 'y';
              targetX = x + vx * 20;
              targetY = y + vy * 20;
              pauseTimer = 0;
              hasMonkVisualChange = true;
            } else {
              if (moveAxis !== 'idle') hasMonkVisualChange = true;
              moveAxis = 'idle';
              pauseTimer = 0;
            }
            if (
              !hasMonkVisualChange &&
              m.name === expectedName &&
              moveAxis === 'idle' &&
              m.x === x &&
              m.y === y &&
              m.facingLeft === facingLeft
            ) {
              m.animTime = animTime;
              m.pauseTimer = pauseTimer;
              return m;
            }
            hasMonkVisualChange = true;
            return {
              ...m,
              name: expectedName,
              x,
              y,
              targetX,
              targetY,
              moveAxis,
              facingLeft,
              pauseTimer,
              animTime,
              chatText: nextChatText,
              chatBubbleUntil: nextChatBubbleUntil,
              woodenFishRippleUntil: nextRippleUntil,
            };
          }

          // Khi Sự kiện Zombie đang diễn ra -> Khóa vị trí đứng của Cô Thảo và Thầy Tùng tại tọa độ quy định trong Dev-Event
          if (
            zombieEventStateRef.current.isActive &&
            zombieEventStateRef.current.phase !== 'idle'
          ) {
            const evPos =
              m.role === 'abbot'
                ? cfg.zombieTeacherPos || { x: 392, y: 444 }
                : cfg.zombieSupervisorPos || { x: 148, y: 498 };
            const expectedFacing = m.role === 'abbot';
            if (
              !hasMonkVisualChange &&
              m.name === expectedName &&
              m.x === evPos.x &&
              m.y === evPos.y &&
              m.moveAxis === 'idle' &&
              m.facingLeft === expectedFacing
            ) {
              m.animTime = animTime;
              m.pauseTimer = 2;
              return m;
            }
            hasMonkVisualChange = true;
            return {
              ...m,
              name: expectedName,
              x: evPos.x,
              y: evPos.y,
              targetX: evPos.x,
              targetY: evPos.y,
              moveAxis: 'idle',
              facingLeft: expectedFacing,
              pauseTimer: 2,
              animTime,
              chatText: nextChatText,
              chatBubbleUntil: nextChatBubbleUntil,
              woodenFishRippleUntil: nextRippleUntil,
            };
          }

          const zoneSpanX = Math.max(24, zone.maxX - zone.minX);
          const zoneSpanY = Math.max(8, zone.maxY - zone.minY);
          const gentleSpeed = m.role === 'abbot' ? 22 : 20;

          // Thu gọn vùng đứng thực tế bên trong khung vùng Giáo Viên / Giám Thị để thân người & chân không bị tràn ra ngoài viền vùng
          const insetX = Math.min(Math.floor(zoneSpanX * 0.42), 26);
          const insetTop = Math.min(Math.floor(zoneSpanY * 0.35), 10);
          const insetBottom = Math.min(Math.floor(zoneSpanY * 0.45), 14);
          const safeMinX = zone.minX + insetX;
          const safeMaxX = Math.max(safeMinX, zone.maxX - insetX);
          const safeMinY = zone.minY + insetTop;
          const safeMaxY = Math.max(safeMinY, zone.maxY - insetBottom);

          x = Math.max(safeMinX, Math.min(safeMaxX, x));
          y = Math.max(safeMinY, Math.min(safeMaxY, y));
          targetX = Math.max(safeMinX, Math.min(safeMaxX, targetX));
          targetY = Math.max(safeMinY, Math.min(safeMaxY, targetY));

          if (pauseTimer > 0) {
            pauseTimer -= dt;
            moveAxis = 'idle';
            if (pauseTimer <= 0) {
              pauseTimer = 0;
              // Chọn điểm đến tiếp theo nằm gọn trong vùng an toàn của Cô Thảo / Thầy Tùng
              const safeSpanX = Math.max(0, safeMaxX - safeMinX);
              const safeSpanY = Math.max(0, safeMaxY - safeMinY);
              targetX =
                safeSpanX > 2
                  ? safeMinX + Math.random() * safeSpanX
                  : (safeMinX + safeMaxX) / 2;
              targetY =
                safeSpanY > 2
                  ? safeMinY + Math.random() * safeSpanY
                  : (safeMinY + safeMaxY) / 2;
              moveAxis = 'x';
              if (Math.abs(targetX - x) > 2) {
                facingLeft = targetX < x;
              }
              hasMonkVisualChange = true;
            }
            if (
              !hasMonkVisualChange &&
              m.name === expectedName &&
              m.moveAxis === 'idle' &&
              m.x === x &&
              m.y === y &&
              m.facingLeft === facingLeft
            ) {
              m.pauseTimer = pauseTimer;
              m.animTime = animTime;
              return m;
            }
            hasMonkVisualChange = true;
            return {
              ...m,
              name: expectedName,
              x,
              y,
              targetX,
              targetY,
              moveAxis,
              facingLeft,
              pauseTimer,
              animTime,
              chatText: nextChatText,
              chatBubbleUntil: nextChatBubbleUntil,
              woodenFishRippleUntil: nextRippleUntil,
            };
          }

          if (moveAxis === 'x' || moveAxis === 'y') {
            const dx = targetX - x;
            const dy = targetY - y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 3) {
              x = targetX;
              y = targetY;
              moveAxis = 'idle';
              // Đứng vài giây (3.0s - 5.5s) rồi tiếp tục di chuyển từ từ
              pauseTimer = 3.0 + Math.random() * 2.5;
            } else {
              const step = Math.min(dist, gentleSpeed * dt);
              x += (dx / dist) * step;
              y += (dy / dist) * step;
              if (Math.abs(dx) > 1.5) {
                facingLeft = dx < 0;
              }
            }
            hasMonkVisualChange = true;
          } else {
            moveAxis = 'idle';
            pauseTimer = 2.5 + Math.random() * 2.0;
          }

          const clampedX = Math.max(safeMinX, Math.min(safeMaxX, x));
          const clampedY = Math.max(safeMinY, Math.min(safeMaxY, y));
          const clampedTargetX = Math.max(safeMinX, Math.min(safeMaxX, targetX));
          const clampedTargetY = Math.max(safeMinY, Math.min(safeMaxY, targetY));

          if (
            !hasMonkVisualChange &&
            m.name === expectedName &&
            m.x === clampedX &&
            m.y === clampedY &&
            m.moveAxis === moveAxis &&
            m.facingLeft === facingLeft
          ) {
            m.pauseTimer = pauseTimer;
            m.animTime = animTime;
            return m;
          }

          hasMonkVisualChange = true;
          return {
            ...m,
            name: expectedName,
            x: clampedX,
            y: clampedY,
            targetX: clampedTargetX,
            targetY: clampedTargetY,
            moveAxis,
            facingLeft,
            pauseTimer,
            animTime,
            chatText: nextChatText,
            chatBubbleUntil: nextChatBubbleUntil,
            woodenFishRippleUntil: nextRippleUntil,
          };
        });
        return hasMonkVisualChange ? nextMonks : prevMonks;
      });

      // 2. Cập nhật chuyển động của Học Sinh theo các lối đi giữa các dãy bàn đôi
      const freedSlotIds: string[] = [];
      const giftBurstsToSpawn: Array<{
        x: number;
        y: number;
        points: number;
        username: string;
        offeringType: OfferingGiftType;
      }> = [];
      const newlySeatedStudents: Array<{ id: number; username: string }> = [];
      const flowerThankTriggers: Array<{
        role: 'abbot' | 'senior_novice';
        username: string;
      }> = [];
      const flowerHitBonusAwards: Array<{
        username: string;
        points: number;
      }> = [];

      const prevPilgrims = pilgrimsRef.current;
      if (prevPilgrims.length > 0) {
        const nextList: PilgrimData[] = [];
        const nowEpoch = Date.now();
        let hasActivePilgrimVisualUpdate = false;

        for (const p of prevPilgrims) {
          // Hỗ trợ rải nhịp xuất phát (Phương án 3A): học sinh chờ hết spawnDelaySec mới bước qua cửa
          if (p.spawnDelaySec && p.spawnDelaySec > 0) {
            const nextDelay = Math.max(0, p.spawnDelaySec - dt);
            if (nextDelay > 0) {
              p.spawnDelaySec = nextDelay;
              nextList.push(p);
              continue;
            }
            p.spawnDelaySec = undefined;
            hasActivePilgrimVisualUpdate = true;
          }

          let {
            x,
            y,
            state,
            stateTimer,
            prayTimer,
            animTime,
            facingLeft,
            isCarryingGift,
            pendingGiftCoins,
          } = p;
          const prevState = state;
          const hasExpiredTimedUi =
            Boolean(p.chatBubbleUntil && nowEpoch >= p.chatBubbleUntil) ||
            Boolean(p.scoreCardUntil && nowEpoch >= p.scoreCardUntil) ||
            Boolean(p.quizResultUntil && nowEpoch >= p.quizResultUntil) ||
            Boolean(p.floatingScoreUntil && nowEpoch >= p.floatingScoreUntil) ||
            Boolean(p.comboUntil && nowEpoch >= p.comboUntil) ||
            Boolean(p.richKidDanceUntil && nowEpoch >= p.richKidDanceUntil) ||
            Boolean(
              p.giftActionHighlightUntil &&
                nowEpoch >= p.giftActionHighlightUntil
            );

          const wasSettledSeated =
            !hasExpiredTimedUi &&
            prevState === 'pray_seated' &&
            stateTimer >= 2.0 &&
            p.hasSatOnce &&
            x === p.slotX &&
            y === p.slotY &&
            !(p.richKidDanceUntil && nowEpoch < p.richKidDanceUntil);

          animTime += dt;
          stateTimer += dt;

          const burnerX = cfg.incenseBurner.x;
          const burnerY = cfg.incenseBurner.y;

          const seatingSpeed = cfg.studentSeatingSpeed ?? (p.speed || 110);

          if (state === 'walk_in_up') {
            // Học sinh tặng quà đi từ cửa chính bên trái (chỉ đi ngang rồi đi dọc) lên trước bàn Giáo viên
            const dx = burnerX - x;
            const dy = burnerY - y;
            if (Math.abs(dx) > 4) {
              x += Math.sign(dx) * seatingSpeed * dt;
              facingLeft = dx < 0;
            } else if (Math.abs(dy) > 4) {
              x = burnerX;
              y += Math.sign(dy) * seatingSpeed * dt;
            } else {
              x = burnerX;
              y = burnerY;
              state = 'throw_offering_at_burner';
              stateTimer = 0;
            }
          } else if (state === 'throw_offering_at_burner') {
            // Đặt quà lên bàn Giáo viên -> nổ hiệu ứng +số Hoa Điểm 10 màu hồng không viền đen
            if (stateTimer >= 0.55) {
              const giftCoins = pendingGiftCoins || p.coins || 1;
              const points = giftCoins * 150;
              giftBurstsToSpawn.push({
                x: cfg.offeringTrayPos.x,
                y: cfg.offeringTrayPos.y,
                points,
                username: p.username,
                offeringType: p.offeringType,
              });
              isCarryingGift = false;
              pendingGiftCoins = 0;
              state = 'ceremony_at_burner';
              stateTimer = 0;
            }
          } else if (state === 'ceremony_at_burner') {
            // Đứng khoanh tay chào Cô Giáo 1 giây rồi về bàn đầu VIP
            if (stateTimer >= 0.95) {
              state = 'walk_carpet_to_slot_y';
              stateTimer = 0;
            }
          } else if (state === 'walk_carpet_to_slot_y') {
            // Đi vuông góc (chỉ ngang và dọc) từ cửa chính bên trái ra lối đi dọc (laneX) rồi đi dọc tới hàng bàn (slotY)
            const dxAisle = p.laneX - x;
            const dyRow = p.slotY - y;
            if (Math.abs(dxAisle) > 4) {
              x += Math.sign(dxAisle) * seatingSpeed * dt;
              facingLeft = dxAisle < 0;
            } else if (Math.abs(dyRow) > 4) {
              x = p.laneX;
              y += Math.sign(dyRow) * seatingSpeed * dt;
            } else {
              x = p.laneX;
              y = p.slotY;
              state = 'walk_side_to_slot';
              stateTimer = 0;
            }
          } else if (state === 'walk_side_to_slot') {
            // Bước ngang vuông góc từ lối đi dọc vào đúng ghế trái/phải của bàn đôi
            y = p.slotY;
            const dx = p.slotX - x;
            if (Math.abs(dx) > 3) {
              x += Math.sign(dx) * (seatingSpeed * 0.9) * dt;
              facingLeft = dx < 0;
            } else {
              x = p.slotX;
              y = p.slotY;
              if (!p.hasSatOnce) {
                newlySeatedStudents.push({ id: p.id, username: p.username });
              }
              state = 'pray_seated';
              stateTimer = 0;
              prayTimer = 0;
            }
          } else if (state === 'pray_seated') {
            prayTimer += dt;
            // Học sinh trong lớp ngồi cố định tại bàn, tuyệt đối KHÔNG tự ý rời lớp khi tạm dừng tiết học hoặc chuyển sang Bảng Thông Báo
          } else if (state === 'walk_to_teacher_gift') {
            // Học sinh cầm hoa trước ngực đi tới vị trí bên cạnh Giáo viên (cạnh trái hoặc phải, không chạm giáo viên)
            const moveSpeed = cfg.studentGiftSpeed ?? Math.max(p.speed, 185);
            const liveTeacher =
              monksRef.current.find(
                (m) => m.role === (p.giftTargetRole || 'abbot')
              ) || monksRef.current[0];
            const targetPos = liveTeacher
              ? getTeacherSideGiftPos(
                  liveTeacher.x,
                  liveTeacher.y,
                  p.slotX || x
                )
              : p.giftTargetPos || {
                  x: cfg.incenseBurner.x,
                  y: cfg.incenseBurner.y,
                };
            const walkCorridorY =
              p.giftTargetRole === 'senior_novice' ? targetPos.y : 478;

            const isAtSeatRow =
              Math.abs(y - p.slotY) <= 5 && Math.abs(x - p.laneX) > 4;
            if (isAtSeatRow) {
              const dxLane = p.laneX - x;
              x += Math.sign(dxLane) * moveSpeed * dt;
              facingLeft = dxLane < 0;
            } else if (
              Math.abs(y - walkCorridorY) > 5 &&
              Math.abs(x - targetPos.x) > 5
            ) {
              x = p.laneX;
              const dy = walkCorridorY - y;
              y += Math.sign(dy) * moveSpeed * dt;
            } else if (Math.abs(x - targetPos.x) > 5) {
              const dx = targetPos.x - x;
              x += Math.sign(dx) * moveSpeed * dt;
              facingLeft = dx < 0;
            } else if (Math.abs(y - targetPos.y) > 5) {
              x = targetPos.x;
              const dy = targetPos.y - y;
              y += Math.sign(dy) * moveSpeed * dt;
            } else {
              x = targetPos.x;
              y = targetPos.y;
              state = 'throw_flower_at_teacher';
              stateTimer = 0;
              const totalFlowers =
                p.totalFlowersToThrow || ((p.comboCount || 1) > 1 ? 3 : 1);
              p.totalFlowersToThrow = totalFlowers;
              p.flowersThrownCount = 1;
              p.flowerBurstsDoneCount = 0;
              isCarryingGift = totalFlowers > 1;

              // Bắn model bông hoa bay từ trước ngực học sinh sang vị trí của Cô Giáo / Thầy Giám Thị
              const targetTeacher =
                monksRef.current.find(
                  (m) => m.role === (p.giftTargetRole || 'abbot')
                ) || monksRef.current[0];
              const teacherX = targetTeacher ? targetTeacher.x : targetPos.x;
              const teacherY = targetTeacher
                ? targetTeacher.y - 26
                : targetPos.y - 26;
              facingLeft = teacherX < x;

              setFlyingFlowers((prev) => [
                ...prev.slice(-12),
                {
                  id: `ff_${Date.now()}_1_${p.id}`,
                  startX: x,
                  startY: y - 26,
                  targetX: teacherX,
                  targetY: teacherY,
                  createdAt: Date.now(),
                  donorUsername: p.username,
                  targetRole: p.giftTargetRole || 'abbot',
                },
              ]);
            }
          } else if (state === 'throw_flower_at_teacher') {
            const totalFlowers =
              p.totalFlowersToThrow || ((p.comboCount || 1) > 1 ? 3 : 1);
            let thrownCount = p.flowersThrownCount || 1;
            let burstsDone = p.flowerBurstsDoneCount || 0;
            const targetRole = p.giftTargetRole || 'abbot';
            const targetTeacher =
              monksRef.current.find((m) => m.role === targetRole) ||
              monksRef.current[0];
            const teacherX = targetTeacher ? targetTeacher.x : x;
            const teacherY = targetTeacher ? targetTeacher.y - 26 : y - 26;
            facingLeft = teacherX < x;

            // Nếu có Combo (totalFlowers >= 3) -> Ném 3 đóa hoa liên tiếp (tại 0s, 0.18s, 0.36s)
            if (totalFlowers >= 3 && stateTimer >= 0.18 && thrownCount < 2) {
              thrownCount = 2;
              setFlyingFlowers((prev) => [
                ...prev.slice(-12),
                {
                  id: `ff_${Date.now()}_2_${p.id}`,
                  startX: x,
                  startY: y - 26,
                  targetX: teacherX - 6,
                  targetY: teacherY - 4,
                  createdAt: Date.now(),
                  donorUsername: p.username,
                  targetRole,
                },
              ]);
            }
            if (totalFlowers >= 3 && stateTimer >= 0.36 && thrownCount < 3) {
              thrownCount = 3;
              isCarryingGift = false;
              setFlyingFlowers((prev) => [
                ...prev.slice(-12),
                {
                  id: `ff_${Date.now()}_3_${p.id}`,
                  startX: x,
                  startY: y - 26,
                  targetX: teacherX + 6,
                  targetY: teacherY + 3,
                  createdAt: Date.now(),
                  donorUsername: p.username,
                  targetRole,
                },
              ]);
            }

            // Hiệu ứng nổ hoa & bắt đầu cộng điểm thưởng khi đóa hoa chạm đích trúng Cô Giáo / Thầy Giám Thị (0.46s, 0.64s, 0.82s)
            if (stateTimer >= 0.46 && burstsDone < 1) {
              burstsDone = 1;
              if (!p.flowerBonusAwarded) {
                p.flowerBonusAwarded = true;
                const awardPts = p.pendingFlowerBonusPoints || 10;
                const hitNow = Date.now();
                p.floatingScoreText = `+${awardPts}đ`;
                p.floatingScoreColor = 'gold';
                p.floatingScoreUntil = hitNow + 3400;
                p.floatingScoreKey = hitNow;
                flowerHitBonusAwards.push({
                  username: p.username,
                  points: awardPts,
                });
              }
              soundEngine.playSimpleExplosionSfx('flower', cfg.ttsVolume);
              setSimpleExplosions((prev) => [
                ...prev.slice(-12),
                {
                  id: `exp_flw_1_${Date.now()}_${p.id}`,
                  x: teacherX,
                  y: teacherY - 2,
                  kind: 'flower',
                  createdAt: Date.now(),
                },
              ]);
            }
            if (totalFlowers >= 3 && stateTimer >= 0.64 && burstsDone < 2) {
              burstsDone = 2;
              soundEngine.playSimpleExplosionSfx('flower', cfg.ttsVolume);
              setSimpleExplosions((prev) => [
                ...prev.slice(-12),
                {
                  id: `exp_flw_2_${Date.now()}_${p.id}`,
                  x: teacherX - 7,
                  y: teacherY - 6,
                  kind: 'flower',
                  createdAt: Date.now(),
                },
              ]);
            }
            if (totalFlowers >= 3 && stateTimer >= 0.82 && burstsDone < 3) {
              burstsDone = 3;
              soundEngine.playSimpleExplosionSfx('flower', cfg.ttsVolume);
              setSimpleExplosions((prev) => [
                ...prev.slice(-12),
                {
                  id: `exp_flw_3_${Date.now()}_${p.id}`,
                  x: teacherX + 7,
                  y: teacherY + 2,
                  kind: 'flower',
                  createdAt: Date.now(),
                },
              ]);
            }

            p.flowersThrownCount = thrownCount;
            p.flowerBurstsDoneCount = burstsDone;

            const finishThrowTime = totalFlowers >= 3 ? 0.84 : 0.48;
            if (stateTimer >= finishThrowTime) {
              isCarryingGift = false;
              flowerThankTriggers.push({
                role: targetRole,
                username: p.username,
              });

              // Nếu học sinh đã nhận lệnh rời khỏi lớp do trả lời sai trong lúc đang đi tặng hoa (leaveAfterGiftAction):
              // Kiểm tra xem còn lệnh tặng hoa (rose / icecream) nào trong hàng chờ không, nếu hết thì đi thẳng ra cửa rời lớp!
              if (p.leaveAfterGiftAction || !p.slotId) {
                const lowerU = p.username.trim().toLowerCase();
                const qList = pendingGiftActionsByUserRef.current.get(lowerU) || [];
                const nextFlowerIdx = qList.findIndex(
                  (a) => a.giftId === 'rose' || a.giftId === 'icecream'
                );
                if (nextFlowerIdx >= 0) {
                  const nextFlowerAct = qList[nextFlowerIdx];
                  const remainingQ = qList.filter((_, i) => i !== nextFlowerIdx);
                  if (remainingQ.length > 0) {
                    pendingGiftActionsByUserRef.current.set(lowerU, remainingQ);
                  } else {
                    pendingGiftActionsByUserRef.current.delete(lowerU);
                  }
                  const isForTeacherNext = nextFlowerAct.giftId === 'rose';
                  const nextRole: 'abbot' | 'senior_novice' = isForTeacherNext
                    ? 'abbot'
                    : 'senior_novice';
                  const nextNpc = monksRef.current.find((m) => m.role === nextRole);
                  const sideNextPos = getTeacherSideGiftPos(
                    nextNpc?.x ?? (isForTeacherNext ? 360 : 130),
                    nextNpc?.y ?? (isForTeacherNext ? 444 : 498),
                    p.slotX || x
                  );
                  const nextTargetX = sideNextPos.x;
                  const nextTargetY = sideNextPos.y;

                  soundEngine.playGiftEventSound(nextFlowerAct.giftId, cfg);
                  isCarryingGift = true;
                  p.giftActionKind = nextFlowerAct.giftId;
                  p.giftTargetRole = nextRole;
                  p.giftTargetPos = { x: nextTargetX, y: nextTargetY };
                  p.totalFlowersToThrow =
                    (nextFlowerAct.comboCount || 1) > 1 || (p.comboCount || 1) > 1
                      ? 3
                      : 1;
                  p.flowersThrownCount = 0;
                  p.flowerBurstsDoneCount = 0;
                  p.pendingFlowerBonusPoints = resolveClassroomGiftKind(
                    nextFlowerAct.giftId,
                    1
                  ).bonusPoints;
                  p.flowerBonusAwarded = false;
                  state = 'walk_to_teacher_gift';
                  stateTimer = 0;
                } else {
                  pendingGiftActionsByUserRef.current.delete(lowerU);
                  state = 'leave_down_exit';
                  stateTimer = 0;
                }
              } else {
                state = 'return_to_seat_from_gift';
                stateTimer = 0;
              }
            }
          } else if (state === 'return_to_seat_from_gift') {
            // Nếu đang trên đường quay về bàn mà nhận lệnh rời lớp (leaveAfterGiftAction) -> đi ra cửa rời lớp luôn
            if (p.leaveAfterGiftAction || !p.slotId) {
              state = 'leave_down_exit';
              stateTimer = 0;
            } else {
              // Đi vuông góc quay về đúng ghế bàn đôi của mình
              const returnSpeed = cfg.studentGiftSpeed ?? Math.max(p.speed, 195);
              const dxToLane = p.laneX - x;
              const dyToSlot = p.slotY - y;
              const dxToSeat = p.slotX - x;

              if (Math.abs(y - p.slotY) > 5 && Math.abs(dxToLane) > 5) {
                x += Math.sign(dxToLane) * returnSpeed * dt;
                facingLeft = dxToLane < 0;
              } else if (Math.abs(dyToSlot) > 5) {
                x = p.laneX;
                y += Math.sign(dyToSlot) * returnSpeed * dt;
              } else if (Math.abs(dxToSeat) > 4) {
                y = p.slotY;
                x += Math.sign(dxToSeat) * returnSpeed * dt;
                facingLeft = dxToSeat < 0;
              } else {
                x = p.slotX;
                y = p.slotY;
                facingLeft = p.slotX < 270;
                state = 'pray_seated';
                stateTimer = 0;
              }
            }
          } else if (state === 'walk_to_punishment_spot') {
            // Học sinh bị gọi phạt hoặc Top 1, 2, 3 bước lên bục giảng đi vuông góc từ bàn học ra lối đi -> lên hàng ngang trước bảng (P1..P5) -> đứng quay mặt xuống dưới
            const moveSpeed = Math.max(p.speed, 200);
            const linePos = cfg.punishmentLinePos || { x: 270, y: 458 };
            const spacing = Math.max(24, cfg.punishmentLineSpacing ?? 52);
            const spotIdx = p.punishmentSpotIndex ?? 2;
            const spotX = Math.max(
              36,
              Math.min(504, Math.round(linePos.x + (spotIdx - 2) * spacing))
            );
            const spotY = linePos.y;

            const isAtSeatRow =
              Math.abs(y - p.slotY) <= 5 && Math.abs(x - p.laneX) > 4;
            if (isAtSeatRow) {
              const dxLane = p.laneX - x;
              x += Math.sign(dxLane) * moveSpeed * dt;
              facingLeft = dxLane < 0;
            } else if (Math.abs(y - spotY) > 5) {
              x = p.laneX;
              const dy = spotY - y;
              y += Math.sign(dy) * moveSpeed * dt;
            } else if (Math.abs(x - spotX) > 4) {
              y = spotY;
              const dx = spotX - x;
              x += Math.sign(dx) * moveSpeed * dt;
              facingLeft = dx < 0;
            } else {
              x = spotX;
              y = spotY;
              facingLeft = false; // Quay mặt xuống dưới nhìn về phía lớp học
              state = 'stand_punishment';
              stateTimer = 0;
            }
          } else if (state === 'stand_punishment') {
            // Đứng tại vị trí phạt hàng ngang 5 chỗ (P1..P5), quay mặt xuống dưới lớp học
            const linePos = cfg.punishmentLinePos || { x: 270, y: 458 };
            const spacing = Math.max(24, cfg.punishmentLineSpacing ?? 52);
            const spotIdx = p.punishmentSpotIndex ?? 2;
            x = Math.max(
              36,
              Math.min(504, Math.round(linePos.x + (spotIdx - 2) * spacing))
            );
            y = linePos.y;
            facingLeft = false;
          } else if (state === 'return_from_punishment_to_seat') {
            // Sau khi hết vòng câu hỏi và trả lời đúng -> đi bộ từ vị trí phạt về lại vị trí bàn học cũ
            const returnSpeed = Math.max(p.speed, 210);
            const dxToLane = p.laneX - x;
            const dyToSlot = p.slotY - y;
            const dxToSeat = p.slotX - x;

            if (Math.abs(y - p.slotY) > 5 && Math.abs(dxToLane) > 5) {
              x += Math.sign(dxToLane) * returnSpeed * dt;
              facingLeft = dxToLane < 0;
            } else if (Math.abs(dyToSlot) > 5) {
              x = p.laneX;
              y += Math.sign(dyToSlot) * returnSpeed * dt;
            } else if (Math.abs(dxToSeat) > 4) {
              y = p.slotY;
              x += Math.sign(dxToSeat) * returnSpeed * dt;
              facingLeft = dxToSeat < 0;
            } else {
              x = p.slotX;
              y = p.slotY;
              facingLeft = p.slotX < 270;
              state = 'pray_seated';
              stateTimer = 0;
            }
          } else if (state === 'leave_side_to_aisle') {
            // Bước ngang nhanh từ ghế ra lối đi dọc
            const leaveSpeed = Math.max(p.speed, 220);
            const dx = p.laneX - x;
            if (Math.abs(dx) > 5) {
              x += Math.sign(dx) * leaveSpeed * dt;
              facingLeft = dx < 0;
            } else {
              x = p.laneX;
              state = 'leave_down_exit';
              stateTimer = 0;
            }
          } else if (state === 'leave_down_exit') {
            // Đi dọc nhanh về ngang tầm cửa chính bên trái (y = 500) rồi đi ngang ra cửa trái (x = 46)
            const leaveSpeed = Math.max(p.speed, 225);
            const doorY = LEFT_DOOR_POS.y;
            const doorX = LEFT_DOOR_POS.x;
            const dy = doorY - y;
            const dx = doorX - x;
            if (Math.abs(dy) > 6) {
              y += Math.sign(dy) * leaveSpeed * dt;
            } else if (Math.abs(dx) > 6) {
              y = doorY;
              x += Math.sign(dx) * leaveSpeed * dt;
              facingLeft = dx < 0;
            } else {
              continue; // Học sinh đã ra khỏi cửa chính bên trái
            }
          }

          // Nếu học sinh đang ngồi ổn định tại bàn (pray_seated): luôn bám đúng tọa độ ghế (slotX, slotY) khi chỉnh khoảng cách 2 học sinh cùng bàn hoặc kéo bàn
          if (state === 'pray_seated' && Boolean(p.slotId)) {
            x = p.slotX;
            y = p.slotY;
          }

          // Nếu học sinh đang ngồi ổn định tại bàn (pray_seated), KHÔNG ở trong Event Zombie, và đã hết thời gian bận của quà trước -> kiểm tra hàng chờ quà tặng tuần tự!
          if (
            !zombieEventStateRef.current.isActive &&
            state === 'pray_seated' &&
            Boolean(p.slotId) &&
            !p.leaveAfterGiftAction &&
            Date.now() >= (p.giftActionBusyUntil || 0)
          ) {
            const lowerU = p.username.trim().toLowerCase();
            const qList = pendingGiftActionsByUserRef.current.get(lowerU);
            if (qList && qList.length > 0) {
              newlySeatedStudents.push({ id: p.id, username: p.username });
            }
          }

          // Nếu học sinh đã ngồi ổn định tại bàn (pray_seated >= 2s, không nhảy Rich Kid, không đổi vị trí/trạng thái):
          // Giữ nguyên tham chiếu object `p` để React.memo bỏ qua hoàn toàn việc re-render!
          if (
            wasSettledSeated &&
            state === 'pray_seated' &&
            x === p.slotX &&
            y === p.slotY &&
            isCarryingGift === p.isCarryingGift &&
            pendingGiftCoins === p.pendingGiftCoins
          ) {
            p.stateTimer = stateTimer;
            p.prayTimer = prayTimer;
            p.animTime = animTime;
            nextList.push(p);
            continue;
          }

          hasActivePilgrimVisualUpdate = true;
          nextList.push({
            ...p,
            x,
            y,
            state,
            stateTimer,
            prayTimer,
            animTime,
            facingLeft,
            isCarryingGift,
            pendingGiftCoins,
            hasSatOnce: p.hasSatOnce || state === 'pray_seated',
            chatBubbleUntil:
              p.chatBubbleUntil && nowEpoch >= p.chatBubbleUntil
                ? 0
                : p.chatBubbleUntil,
            scoreCardUntil:
              p.scoreCardUntil && nowEpoch >= p.scoreCardUntil
                ? 0
                : p.scoreCardUntil,
            expChangeDelta:
              p.scoreCardUntil && nowEpoch >= p.scoreCardUntil
                ? 0
                : p.expChangeDelta,
            leveledUpInRound:
              p.scoreCardUntil && nowEpoch >= p.scoreCardUntil
                ? false
                : p.leveledUpInRound,
            quizResultUntil:
              p.quizResultUntil && nowEpoch >= p.quizResultUntil
                ? 0
                : p.quizResultUntil,
            floatingScoreUntil:
              p.floatingScoreUntil && nowEpoch >= p.floatingScoreUntil
                ? 0
                : p.floatingScoreUntil,
            comboUntil:
              p.comboUntil && nowEpoch >= p.comboUntil ? 0 : p.comboUntil,
            richKidDanceUntil:
              p.richKidDanceUntil && nowEpoch >= p.richKidDanceUntil
                ? 0
                : p.richKidDanceUntil,
            giftActionHighlightUntil:
              p.giftActionHighlightUntil &&
              nowEpoch >= p.giftActionHighlightUntil
                ? 0
                : p.giftActionHighlightUntil,
          });
        }

        if (nextList.length !== prevPilgrims.length) {
          hasActivePilgrimVisualUpdate = true;
        }

        pilgrimsRef.current = nextList;
        if (hasActivePilgrimVisualUpdate) {
          setPilgrims(nextList);
        }
      }

      // 2.5. Cập nhật học sinh trong hàng chờ (specialFlowerRunners) chạy từ vị trí đứng trong đám đông hàng chờ lên tặng hoa cho Cô/Thầy rồi quay về đúng vị trí trong hàng chờ
      if (
        specialFlowerRunnersRef.current.length > 0 ||
        (!zombieEventStateRef.current.isActive &&
          pendingDetachedRunnersRef.current.length > 0)
      ) {
        const prevRunners = specialFlowerRunnersRef.current;
        if (
          prevRunners.length > 0 ||
          (!zombieEventStateRef.current.isActive &&
            pendingDetachedRunnersRef.current.length > 0)
        ) {
          const nextRunners: PilgrimData[] = [];
          const crowdPos = cfg.doorCrowdPos || LEFT_DOOR_POS;

          for (const r of prevRunners) {
            let {
              x,
              y,
              state,
              stateTimer,
              animTime,
              facingLeft,
              isCarryingGift,
            } = r;
            animTime += dt;
            stateTimer += dt;
            const moveSpeed = cfg.studentGiftSpeed ?? Math.max(r.speed, 205);

            if (state === 'walk_to_teacher_gift') {
              const liveTeacher =
                monksRef.current.find(
                  (m) => m.role === (r.giftTargetRole || 'abbot')
                ) || monksRef.current[0];
              const targetPos = liveTeacher
                ? getTeacherSideGiftPos(
                    liveTeacher.x,
                    liveTeacher.y,
                    r.slotX || x
                  )
                : r.giftTargetPos || {
                    x: cfg.incenseBurner.x,
                    y: cfg.incenseBurner.y,
                  };
              const walkCorridorY =
                r.giftTargetRole === 'senior_novice' ? targetPos.y : 478;

              if (
                Math.abs(y - walkCorridorY) > 5 &&
                Math.abs(x - targetPos.x) > 5
              ) {
                const dy = walkCorridorY - y;
                y += Math.sign(dy) * moveSpeed * dt;
              } else if (Math.abs(x - targetPos.x) > 5) {
                const dx = targetPos.x - x;
                x += Math.sign(dx) * moveSpeed * dt;
                facingLeft = dx < 0;
              } else if (Math.abs(y - targetPos.y) > 5) {
                x = targetPos.x;
                const dy = targetPos.y - y;
                y += Math.sign(dy) * moveSpeed * dt;
              } else {
                x = targetPos.x;
                y = targetPos.y;
                state = 'throw_flower_at_teacher';
                stateTimer = 0;
                const totalFlowers =
                  r.totalFlowersToThrow || ((r.comboCount || 1) > 1 ? 3 : 1);
                r.totalFlowersToThrow = totalFlowers;
                r.flowersThrownCount = 1;
                r.flowerBurstsDoneCount = 0;
                isCarryingGift = totalFlowers > 1;

                const targetTeacher =
                  monksRef.current.find(
                    (m) => m.role === (r.giftTargetRole || 'abbot')
                  ) || monksRef.current[0];
                const teacherX = targetTeacher ? targetTeacher.x : targetPos.x;
                const teacherY = targetTeacher
                  ? targetTeacher.y - 26
                  : targetPos.y - 26;
                facingLeft = teacherX < x;

                setFlyingFlowers((prev) => [
                  ...prev.slice(-12),
                  {
                    id: `ff_det_1_${Date.now()}_${r.id}`,
                    startX: x,
                    startY: y - 26,
                    targetX: teacherX,
                    targetY: teacherY,
                    createdAt: Date.now(),
                    donorUsername: r.username,
                    targetRole: r.giftTargetRole || 'abbot',
                  },
                ]);
              }
            } else if (state === 'throw_flower_at_teacher') {
              const totalFlowers =
                r.totalFlowersToThrow || ((r.comboCount || 1) > 1 ? 3 : 1);
              let thrownCount = r.flowersThrownCount || 1;
              let burstsDone = r.flowerBurstsDoneCount || 0;
              const targetRole = r.giftTargetRole || 'abbot';
              const targetTeacher =
                monksRef.current.find((m) => m.role === targetRole) ||
                monksRef.current[0];
              const teacherX = targetTeacher ? targetTeacher.x : x;
              const teacherY = targetTeacher ? targetTeacher.y - 26 : y - 26;
              facingLeft = teacherX < x;

              if (totalFlowers >= 3 && stateTimer >= 0.18 && thrownCount < 2) {
                thrownCount = 2;
                setFlyingFlowers((prev) => [
                  ...prev.slice(-12),
                  {
                    id: `ff_det_2_${Date.now()}_${r.id}`,
                    startX: x,
                    startY: y - 26,
                    targetX: teacherX - 6,
                    targetY: teacherY - 4,
                    createdAt: Date.now(),
                    donorUsername: r.username,
                    targetRole,
                  },
                ]);
              }
              if (totalFlowers >= 3 && stateTimer >= 0.36 && thrownCount < 3) {
                thrownCount = 3;
                isCarryingGift = false;
                setFlyingFlowers((prev) => [
                  ...prev.slice(-12),
                  {
                    id: `ff_det_3_${Date.now()}_${r.id}`,
                    startX: x,
                    startY: y - 26,
                    targetX: teacherX + 6,
                    targetY: teacherY + 3,
                    createdAt: Date.now(),
                    donorUsername: r.username,
                    targetRole,
                  },
                ]);
              }

              if (stateTimer >= 0.46 && burstsDone < 1) {
                burstsDone = 1;
                if (!r.flowerBonusAwarded) {
                  r.flowerBonusAwarded = true;
                  const awardPts = r.pendingFlowerBonusPoints || 10;
                  const hitNow = Date.now();
                  r.floatingScoreText = `+${awardPts}đ`;
                  r.floatingScoreColor = 'gold';
                  r.floatingScoreUntil = hitNow + 3400;
                  r.floatingScoreKey = hitNow;
                  flowerHitBonusAwards.push({
                    username: r.username,
                    points: awardPts,
                  });
                }
                soundEngine.playSimpleExplosionSfx('flower', cfg.ttsVolume);
                setSimpleExplosions((prev) => [
                  ...prev.slice(-12),
                  {
                    id: `exp_flw_det_1_${Date.now()}_${r.id}`,
                    x: teacherX,
                    y: teacherY - 2,
                    kind: 'flower',
                    createdAt: Date.now(),
                  },
                ]);
              }
              if (totalFlowers >= 3 && stateTimer >= 0.64 && burstsDone < 2) {
                burstsDone = 2;
                soundEngine.playSimpleExplosionSfx('flower', cfg.ttsVolume);
                setSimpleExplosions((prev) => [
                  ...prev.slice(-12),
                  {
                    id: `exp_flw_det_2_${Date.now()}_${r.id}`,
                    x: teacherX - 7,
                    y: teacherY - 6,
                    kind: 'flower',
                    createdAt: Date.now(),
                  },
                ]);
              }
              if (totalFlowers >= 3 && stateTimer >= 0.82 && burstsDone < 3) {
                burstsDone = 3;
                soundEngine.playSimpleExplosionSfx('flower', cfg.ttsVolume);
                setSimpleExplosions((prev) => [
                  ...prev.slice(-12),
                  {
                    id: `exp_flw_det_3_${Date.now()}_${r.id}`,
                    x: teacherX + 7,
                    y: teacherY + 2,
                    kind: 'flower',
                    createdAt: Date.now(),
                  },
                ]);
              }

              r.flowersThrownCount = thrownCount;
              r.flowerBurstsDoneCount = burstsDone;

              const finishThrowTime = totalFlowers >= 3 ? 0.84 : 0.48;
              if (stateTimer >= finishThrowTime) {
                isCarryingGift = false;
                flowerThankTriggers.push({
                  role: targetRole,
                  username: r.username,
                });
                state = 'return_to_seat_from_gift';
                stateTimer = 0;
              }
            } else if (state === 'return_to_seat_from_gift') {
              const returnX = r.slotX || crowdPos.x;
              const returnY = r.slotY || crowdPos.y;
              const dx = returnX - x;
              const dy = returnY - y;
              if (Math.abs(dx) > 5) {
                x += Math.sign(dx) * moveSpeed * dt;
                facingLeft = dx < 0;
              } else if (Math.abs(dy) > 5) {
                x = returnX;
                y += Math.sign(dy) * moveSpeed * dt;
              } else {
                // Đã quay về đúng vị trí đứng trong đám đông hàng chờ -> kết thúc runner để nhân vật trong doorCrowd hiển thị lại tại chỗ!
                continue;
              }
            }

            nextRunners.push({
              ...r,
              x,
              y,
              state,
              stateTimer,
              animTime,
              facingLeft,
              isCarryingGift,
            });
          }

          // Nếu KHÔNG ở trong Event Zombie và có runner tặng hoa đang xếp hàng chờ tuần tự ở cửa lớp -> xuất phát lượt tiếp theo!
          if (
            !zombieEventStateRef.current.isActive &&
            pendingDetachedRunnersRef.current.length > 0
          ) {
            const activeUserSet = new Set(
              nextRunners.map((nr) => nr.username.trim().toLowerCase())
            );
            const remainingQueuedRunners: PilgrimData[] = [];
            for (const qr of pendingDetachedRunnersRef.current) {
              const qLower = qr.username.trim().toLowerCase();
              if (!activeUserSet.has(qLower)) {
                activeUserSet.add(qLower);
                soundEngine.playGiftEventSound(
                  qr.giftActionKind || 'rose',
                  cfg
                );
                nextRunners.push({
                  ...qr,
                  x: qr.slotX || crowdPos.x,
                  y: qr.slotY || crowdPos.y,
                  hasComment: false,
                  chatBubbleUntil: 0,
                  giftActionHighlightUntil: Date.now() + 6000,
                  flowerBonusAwarded: false,
                  floatingScoreUntil: 0,
                });
              } else {
                remainingQueuedRunners.push(qr);
              }
            }
            pendingDetachedRunnersRef.current = remainingQueuedRunners;
          }

          specialFlowerRunnersRef.current = nextRunners;
          setSpecialFlowerRunners(nextRunners);
        }
      }

      // Khi bó hoa vừa ném trúng người Cô Giáo / Thầy Giám Thị -> bắt đầu cộng điểm thưởng (+10đ)!
      if (flowerHitBonusAwards.length > 0) {
        let updatedQueuePoints = false;
        flowerHitBonusAwards.forEach((aw) => {
          addLotusPointsToDonor(aw.username, aw.points);
          const lowerU = aw.username.trim().toLowerCase();
          const qItem = waitingPoolRef.current.get(lowerU);
          if (qItem) {
            qItem.points = (qItem.points || 0) + aw.points;
            updatedQueuePoints = true;
          }
        });
        if (updatedQueuePoints) {
          recomputeWaitingQueueLazy();
        }
      }

      // Khi bó hoa vừa ném trúng người Cô Giáo / Thầy Giám Thị -> hiện ngay chatbox "Cảm ơn bạn A nhé /-heart"
      if (flowerThankTriggers.length > 0) {
        flowerThankTriggers.forEach((tr) => {
          triggerTeacherGiftThankBubble(tr.role, tr.username);
        });
      }

      // Thực thi TUẦN TỰ TỪNG MÓN QUÀ MỘT (pop 1 lệnh mỗi lần học sinh rảnh ở ghế) thay vì chạy cùng lúc!
      if (newlySeatedStudents.length > 0) {
        const processedUserSet = new Set<string>();
        newlySeatedStudents.forEach((st) => {
          const lower = st.username.trim().toLowerCase();
          if (processedUserSet.has(lower)) return;
          processedUserSet.add(lower);

          const curStudent = pilgrimsRef.current.find((p) => p.id === st.id);
          if (
            !curStudent ||
            curStudent.state !== 'pray_seated' ||
            curStudent.leaveAfterGiftAction ||
            Date.now() < (curStudent.giftActionBusyUntil || 0)
          ) {
            return;
          }

          const queuedActions = pendingGiftActionsByUserRef.current.get(lower);
          if (queuedActions && queuedActions.length > 0) {
            const [nextAct, ...restActions] = queuedActions;
            if (restActions.length > 0) {
              pendingGiftActionsByUserRef.current.set(lower, restActions);
            } else {
              pendingGiftActionsByUserRef.current.delete(lower);
            }
            executeSeatedClassroomGiftAction(
              st.id,
              st.username,
              nextAct.giftId,
              nextAct.comment,
              Boolean(nextAct.isDeferredFromQueue),
              nextAct.comboCount || 1
            );
          }
        });
      }

      // 3. Cập nhật đàn Heo chạy ngang dọc tới 5 bạn Top đầu của lớp rồi nổ + trừ -20đ
      setRunningPigs((prevPigs) => {
        if (prevPigs.length === 0) return prevPigs;
        const remainingPigs: RunningPigAgent[] = [];
        const hitTargets: Array<{
          pilgrimId: number;
          username: string;
          x: number;
          y: number;
        }> = [];

        for (const pig of prevPigs) {
          let { x, y, waypointIndex, facingLeft, animTime } = pig;
          animTime += dt;
          const wp = pig.waypoints[waypointIndex];
          if (!wp) {
            hitTargets.push({
              pilgrimId: pig.targetPilgrimId,
              username: pig.targetUsername,
              x,
              y,
            });
            continue;
          }

          const dx = wp.x - x;
          const dy = wp.y - y;
          if (Math.abs(dx) > 4) {
            x += Math.sign(dx) * pig.speed * dt;
            facingLeft = dx < 0;
          } else if (Math.abs(dy) > 4) {
            x = wp.x;
            y += Math.sign(dy) * pig.speed * dt;
          } else {
            x = wp.x;
            y = wp.y;
            waypointIndex += 1;
          }

          if (waypointIndex >= pig.waypoints.length) {
            hitTargets.push({
              pilgrimId: pig.targetPilgrimId,
              username: pig.targetUsername,
              x,
              y,
            });
          } else {
            remainingPigs.push({
              ...pig,
              x,
              y,
              waypointIndex,
              facingLeft,
              animTime,
            });
          }
        }

        if (hitTargets.length > 0) {
          const hitNow = Date.now();
          soundEngine.playSimpleExplosionSfx('pig', cfg.ttsVolume);
          setSimpleExplosions((prevExp) => [
            ...prevExp.slice(-12),
            ...hitTargets.map((h, i) => ({
              id: `exp_pig_${hitNow}_${h.pilgrimId}_${i}`,
              x: h.x,
              y: h.y - 10,
              kind: 'pig' as const,
              createdAt: hitNow,
            })),
          ]);

          hitTargets.forEach((h) => {
            deductLotusPointsFromDonor(h.username, 20);
          });

          const hitIds = new Set(hitTargets.map((h) => h.pilgrimId));
          const nextP = pilgrimsRef.current.map((st) =>
            hitIds.has(st.id)
              ? {
                  ...st,
                  floatingScoreText: '-20đ',
                  floatingScoreColor: 'red' as const,
                  floatingScoreUntil: hitNow + 3200,
                  floatingScoreKey: hitNow + st.id,
                }
              : st
          );
          pilgrimsRef.current = nextP;
          setPilgrims(nextP);
        }

        return remainingPigs;
      });

      // 3B. Cập nhật đàn Mèo nhảy từ bàn xuống đất đi vòng vòng lớp rồi đi ra cửa biến mất
      setRoamingCats((prevCats) => {
        if (prevCats.length === 0) return prevCats;
        const remainingCats: RoamingCatAgent[] = [];
        for (const cat of prevCats) {
          let {
            x,
            y,
            jumpProgress,
            waypointIndex,
            facingLeft,
            animTime,
          } = cat;
          animTime += dt;

          if (jumpProgress < 1) {
            jumpProgress = Math.min(1, jumpProgress + dt * 2.3);
            x = cat.jumpFromX + (cat.jumpToX - cat.jumpFromX) * jumpProgress;
            y = cat.jumpFromY + (cat.jumpToY - cat.jumpFromY) * jumpProgress;
            facingLeft = cat.jumpToX < cat.jumpFromX;
            remainingCats.push({
              ...cat,
              x,
              y,
              jumpProgress,
              facingLeft,
              animTime,
            });
            continue;
          }

          const wp = cat.waypoints[waypointIndex];
          if (!wp) continue;

          const dx = wp.x - x;
          const dy = wp.y - y;
          const dist = Math.hypot(dx, dy);
          if (dist > 5) {
            const step = Math.min(dist, cat.speed * dt);
            x += (dx / dist) * step;
            y += (dy / dist) * step;
            if (Math.abs(dx) > 1) {
              facingLeft = dx < 0;
            }
          } else {
            x = wp.x;
            y = wp.y;
            waypointIndex += 1;
          }

          if (waypointIndex < cat.waypoints.length) {
            remainingCats.push({
              ...cat,
              x,
              y,
              jumpProgress: 1,
              waypointIndex,
              facingLeft,
              animTime,
            });
          }
        }
        return remainingCats;
      });

      if (freedSlotIds.length > 0) {
        const nextVip = vipSlotsRef.current.map((s) =>
          freedSlotIds.includes(s.id) ? { ...s, occupiedById: null } : s
        );
        const nextNorm = normalSlotsRef.current.map((s) =>
          freedSlotIds.includes(s.id) ? { ...s, occupiedById: null } : s
        );
        vipSlotsRef.current = nextVip;
        normalSlotsRef.current = nextNorm;
        setVipSlots(nextVip);
        setNormalSlots(nextNorm);
      }

      if (giftBurstsToSpawn.length > 0) {
        giftBurstsToSpawn.forEach((b) => {
          setLatestAltarOffering(b.offeringType);
          addLotusPointsToDonor(b.username, b.points);
          setBurnerLotusBursts((prev) => [
            ...prev.slice(-8),
            {
              id: `burst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              x: b.x,
              y: b.y,
              lotusPoints: b.points,
              createdAt: Date.now(),
            },
          ]);
        });
      }

      // 4. Cập nhật chuyển động & hiệu ứng của Zombie (Luồng 2 đi nhanh vào vị trí đứng, Luồng 5 giật lùi recoil, Luồng 5b gục ngã tan biến)
      if (zombieEntityRef.current.visible) {
        const curZ = zombieEntityRef.current;
        let {
          x,
          y,
          targetX,
          targetY,
          isWalking,
          facing,
          recoilOffsetX,
          recoilOffsetY,
          isDying,
          dyingProgress,
          animTime,
        } = curZ;
        let changed = false;
        animTime += dt;

        // Phục hồi cực nhanh hiệu ứng giật lùi (recoil) về vị trí đứng
        if (Math.abs(recoilOffsetX) > 0.2 || Math.abs(recoilOffsetY) > 0.2) {
          const decay = Math.pow(0.0004, dt);
          recoilOffsetX *= decay;
          recoilOffsetY *= decay;
          if (Math.abs(recoilOffsetX) < 0.25) recoilOffsetX = 0;
          if (Math.abs(recoilOffsetY) < 0.25) recoilOffsetY = 0;
          changed = true;
        }

        // Luồng 2: Sau 3s khóa camera gầm gừ ở cửa, Zombie đi nhanh đến vị trí đứng quy định
        if (isWalking && !isDying) {
          const walkSpeed = 235;
          const dx = targetX - x;
          const dy = targetY - y;
          const dist = Math.hypot(dx, dy);
          if (dist > 4) {
            x += (dx / dist) * walkSpeed * dt;
            y += (dy / dist) * walkSpeed * dt;
            facing = dx >= 0 ? 'right' : 'left';
            changed = true;
          } else {
            x = targetX;
            y = targetY;
            isWalking = false;
            facing = 'right';
            changed = true;
          }
        }

        // Luồng 5b: Khi hết máu, Zombie gục ngã nằm ngang rồi dần tan biến
        if (isDying && dyingProgress < 1) {
          dyingProgress = Math.min(1, dyingProgress + dt / 2.8);
          changed = true;
        }

        if (changed) {
          const nextZ: ZombieEntityState = {
            ...curZ,
            x,
            y,
            isWalking,
            facing,
            recoilOffsetX,
            recoilOffsetY,
            dyingProgress,
            animTime,
          };
          zombieEntityRef.current = nextZ;
          setZombieEntity(nextZ);
        }
      }

      // Cập nhật thanh máu lùi màu vàng kem (trailHp) của Zombie mượt mà
      if (
        zombieEventStateRef.current.isActive &&
        zombieEventStateRef.current.trailHp > zombieEventStateRef.current.hp
      ) {
        const curEv = zombieEventStateRef.current;
        const diff = curEv.trailHp - curEv.hp;
        const step = Math.max(curEv.maxHp * 0.22 * dt, diff * 4.2 * dt);
        const nextTrail =
          diff <= 2 ? curEv.hp : Math.max(curEv.hp, curEv.trailHp - step);
        const nextEv: ZombieEventRuntimeState = {
          ...curEv,
          trailHp: nextTrail,
        };
        zombieEventStateRef.current = nextEv;
        setZombieEventState(nextEv);
      }

      frameId = requestAnimationFrame(stepSimulation);
    };

    frameId = requestAnimationFrame(stepSimulation);
    return () => cancelAnimationFrame(frameId);
  }, [
    addLotusPointsToDonor,
    deductLotusPointsFromDonor,
    executeSeatedClassroomGiftAction,
    triggerTeacherGiftThankBubble,
  ]);

  // Dọn dẹp các hiệu ứng Burst & Flying Lotus / Flowers / Explosions / Đạn Zombie đã hết hạn
  // Tối ưu: Giữ nguyên tham chiếu mảng cũ nếu mảng rỗng hoặc không có phần tử nào hết hạn để tránh re-render toàn sân khấu mỗi 500ms
  useEffect(() => {
    const pruneExpired = <T,>(prev: T[], keepPredicate: (item: T) => boolean): T[] => {
      if (prev.length === 0) return prev;
      const next = prev.filter(keepPredicate);
      return next.length === prev.length ? prev : next;
    };
    const timer = setInterval(() => {
      const now = Date.now();
      setBurnerLotusBursts((prev) =>
        pruneExpired(prev, (b) => now - b.createdAt < 1800)
      );
      setFlyingLotuses((prev) =>
        pruneExpired(prev, (f) => now - f.createdAt < 1100)
      );
      setFlyingFlowers((prev) =>
        pruneExpired(prev, (f) => now - f.createdAt < 600)
      );
      setSimpleExplosions((prev) =>
        pruneExpired(prev, (e) => now - e.createdAt < 950)
      );
      setZombieProjectiles((prev) =>
        pruneExpired(prev, (p) => now - p.createdAt < (p.durationMs || 450) + 120)
      );
      setZombieSpikyDamages((prev) =>
        pruneExpired(prev, (s) => now - s.createdAt < 950)
      );
      setFlyingMilkTeas((prev) =>
        pruneExpired(prev, (m) => now - m.createdAt < (m.durationMs || 1400) + 200)
      );
      setFloatingToasts((prev) =>
        pruneExpired(prev, (t) => now - t.createdAt < 7500)
      );
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Quy tắc sắp xếp lớp ĐÚNG ở giây thứ 18 sau khi câu hỏi bắt đầu (15s hỏi bài + 3s đầu công bố đáp án, còn 7s trước câu tiếp theo):
  // - Loại học sinh trả lời sai, giữ học sinh trả lời đúng.
  // - Nếu học sinh đang đứng ở vị trí phạt: trả lời đúng thì đi bộ về vị trí cũ (return_from_punishment_to_seat), trả lời sai thì đi thẳng ra khỏi lớp luôn khỏi về chỗ (leave_down_exit)!
  // - Xóa luôn data và bảng xếp hạng (Bảng Hoa Điểm 10) của học sinh trả lời sai.
  // - Đẩy học sinh trong Hàng Chờ (cả Người thật và NPC) đi nhanh vào lớp nhận bàn trống.
  const rotateClassroomSeatsAfterReveal = useCallback(() => {
    const currentPilgrims = pilgrimsRef.current;
    const bState = classBoardStateRef.current;
    const classWinnerSet = new Set(
      (bState.classWinners || bState.winners || []).map((w) =>
        w.username.trim().toLowerCase()
      )
    );
    const evictedSlotIds: string[] = [];
    const evictedUsernamesSet = new Set<string>();

    const donorPtsLookup = new Map<string, number>();
    for (const d of lotusDonorsRef.current) {
      if (d.username) {
        donorPtsLookup.set(d.username.trim().toLowerCase(), d.coins || 0);
      }
    }
    const evictedToWaitingQueue: Array<{
      username: string;
      gender: 'female' | 'male';
      isVip: boolean;
      isBot: boolean;
      avatarUrl?: string | null;
      points: number;
    }> = [];

    const remainingPilgrims = currentPilgrims.map((p) => {
      const isOccupyingSeat =
        p.slotId !== null &&
        p.state !== 'leave_side_to_aisle' &&
        p.state !== 'leave_down_exit';
      if (!isOccupyingSeat) return p;

      const lowerName = p.username.trim().toLowerCase();
      const answeredRight =
        Boolean(p.answeredCurrentQuestion) ||
        p.quizResultStatus === 'correct' ||
        classWinnerSet.has(lowerName);
      const savedByShield = Boolean(p.savedByShieldInCurrentRound);
      const wasPunishedStanding =
        Boolean(p.isPunishedInCurrentRound) ||
        p.state === 'stand_punishment' ||
        p.state === 'walk_to_punishment_spot';
      const hasPendingPunishment = punishmentWaitingQueueRef.current.some(
        (item) => item.username.trim().toLowerCase() === lowerName
      );

      if (
        answeredRight ||
        savedByShield ||
        (hasPendingPunishment && !wasPunishedStanding)
      ) {
        if (wasPunishedStanding) {
          return {
            ...p,
            savedByShieldInCurrentRound: false,
            isPunishedInCurrentRound: false,
            punishmentMultiplier: undefined,
            punishmentSpotPos: undefined,
            punishmentSpotIndex: undefined,
            podiumRank: undefined,
            winnerMilkTeaScale: undefined,
            state: 'return_from_punishment_to_seat' as const,
            stateTimer: 0,
          };
        }
        return {
          ...p,
          savedByShieldInCurrentRound: false,
        };
      }

      if (p.slotId) {
        evictedSlotIds.push(p.slotId);
      }
      evictedUsernamesSet.add(lowerName);

      // Luật mới: Trả lời sai KHÔNG reset điểm, mất chỗ ngồi và đẩy ra ngoài Hàng chờ học ké giữ nguyên số điểm để vẫn vô lại được nếu top cao!
      const preservedPts = Math.max(
        p.currentScoreDisplay || 0,
        donorPtsLookup.get(lowerName) || 0
      );
      evictedToWaitingQueue.push({
        username: p.username,
        gender: p.gender,
        isVip: p.isVip,
        isBot: p.isBot,
        avatarUrl: p.avatarUrl,
        points: preservedPts,
      });

      const isCurrentlyGivingFlower =
        p.state === 'walk_to_teacher_gift' ||
        p.state === 'throw_flower_at_teacher';
      const userQueuedGifts =
        pendingGiftActionsByUserRef.current.get(lowerName) || [];
      const remainingFlowerGifts = userQueuedGifts.filter(
        (a) => a.giftId === 'rose' || a.giftId === 'icecream'
      );

      if (isCurrentlyGivingFlower) {
        if (remainingFlowerGifts.length > 0) {
          pendingGiftActionsByUserRef.current.set(
            lowerName,
            remainingFlowerGifts
          );
        } else {
          pendingGiftActionsByUserRef.current.delete(lowerName);
        }
        return {
          ...p,
          slotId: null,
          leaveAfterGiftAction: true,
          coins: 0,
          pendingGiftCoins: 0,
          answeredCurrentQuestion: false,
          hasDeskCat: false,
          deskCatCount: 0,
          hasDeskPig: false,
          hasDeskSnack: false,
          hasPcGamingDesk: false,
          richKidDanceUntil: 0,
          isPunishedInCurrentRound: false,
          punishmentMultiplier: undefined,
          punishmentSpotPos: undefined,
          punishmentSpotIndex: undefined,
          podiumRank: undefined,
          winnerMilkTeaScale: undefined,
          quizResultStatus: null,
          quizResultUntil: 0,
          quizEarnedPoints: 0,
        };
      }

      if (
        p.state === 'return_to_seat_from_gift' &&
        remainingFlowerGifts.length > 0
      ) {
        const [nextFlowerAct, ...restFlowers] = remainingFlowerGifts;
        if (restFlowers.length > 0) {
          pendingGiftActionsByUserRef.current.set(lowerName, restFlowers);
        } else {
          pendingGiftActionsByUserRef.current.delete(lowerName);
        }
        const isForTeacherNext = nextFlowerAct.giftId === 'rose';
        const nextRole: 'abbot' | 'senior_novice' = isForTeacherNext
          ? 'abbot'
          : 'senior_novice';
        const nextNpc = monksRef.current.find((m) => m.role === nextRole);
        const nextTargetX = isForTeacherNext
          ? Math.max(84, Math.min(456, (nextNpc?.x ?? 270) - 26))
          : Math.max(40, Math.min(480, (nextNpc?.x ?? 46) + 26));
        const nextTargetY = isForTeacherNext
          ? (nextNpc?.y ?? 438) + 8
          : (nextNpc?.y ?? 502) + 4;

        return {
          ...p,
          slotId: null,
          leaveAfterGiftAction: true,
          isCarryingGift: true,
          giftActionKind: nextFlowerAct.giftId,
          giftTargetRole: nextRole,
          giftTargetPos: { x: nextTargetX, y: nextTargetY },
          pendingFlowerBonusPoints: resolveClassroomGiftKind(
            nextFlowerAct.giftId,
            1
          ).bonusPoints,
          flowerBonusAwarded: false,
          state: 'walk_to_teacher_gift' as const,
          stateTimer: 0,
          coins: 0,
          pendingGiftCoins: 0,
          answeredCurrentQuestion: false,
          hasDeskCat: false,
          deskCatCount: 0,
          hasDeskPig: false,
          hasDeskSnack: false,
          hasPcGamingDesk: false,
          richKidDanceUntil: 0,
          isPunishedInCurrentRound: false,
          punishmentMultiplier: undefined,
          punishmentSpotPos: undefined,
          punishmentSpotIndex: undefined,
          podiumRank: undefined,
          winnerMilkTeaScale: undefined,
          quizResultStatus: null,
          quizResultUntil: 0,
          quizEarnedPoints: 0,
        };
      }

      pendingGiftActionsByUserRef.current.delete(lowerName);

      return {
        ...p,
        slotId: null,
        leaveAfterGiftAction: false,
        coins: 0,
        pendingGiftCoins: 0,
        answeredCurrentQuestion: false,
        speed: 225,
        hasComment: false,
        chatBubbleUntil: 0,
        hasDeskCat: false,
        deskCatCount: 0,
        hasDeskPig: false,
        hasDeskSnack: false,
        hasPcGamingDesk: false,
        richKidDanceUntil: 0,
        isPunishedInCurrentRound: false,
        punishmentMultiplier: undefined,
        punishmentSpotPos: undefined,
        punishmentSpotIndex: undefined,
        podiumRank: undefined,
        winnerMilkTeaScale: undefined,
        quizResultStatus: null,
        quizResultUntil: 0,
        quizEarnedPoints: 0,
        state:
          wasPunishedStanding || p.state === 'return_to_seat_from_gift'
            ? ('leave_down_exit' as const)
            : ('leave_side_to_aisle' as const),
        stateTimer: 0,
      };
    });

    pilgrimsRef.current = remainingPilgrims;

    // Khi học sinh trả lời sai nhường ghế ra ngoài Hàng Chờ: rút khỏi danh sách đang ngồi trong lớp (lotusDonors) nhưng điểm được chuyển nguyên vẹn sang Hàng chờ học ké
    let donorsModified = false;
    if (evictedUsernamesSet.size > 0) {
      const filteredDonors = lotusDonorsRef.current.filter(
        (d) => !evictedUsernamesSet.has(d.username.trim().toLowerCase())
      );
      lotusDonorsRef.current = filteredDonors;
      donorsModified = true;
      punishmentWaitingQueueRef.current =
        punishmentWaitingQueueRef.current.filter(
          (item) => !evictedUsernamesSet.has(item.username.trim().toLowerCase())
        );
      for (const k of Array.from(recentCommentsRef.current.keys())) {
        const prefix = k.split(':')[0];
        if (evictedUsernamesSet.has(prefix)) {
          recentCommentsRef.current.delete(k);
        }
      }
      for (const uname of Array.from(pendingGiftEntriesRef.current.keys())) {
        if (evictedUsernamesSet.has(uname)) {
          pendingGiftEntriesRef.current.delete(uname);
        }
      }
    }

    const activeSlotMap = new Map<string, number>();
    for (const p of remainingPilgrims) {
      if (
        p.slotId &&
        p.state !== 'leave_side_to_aisle' &&
        p.state !== 'leave_down_exit'
      ) {
        activeSlotMap.set(p.slotId, p.id);
      }
    }

    const nextVip = vipSlotsRef.current.map((s) => ({
      ...s,
      occupiedById: activeSlotMap.get(s.id) ?? null,
    }));
    const nextNormal = normalSlotsRef.current.map((s) => ({
      ...s,
      occupiedById: activeSlotMap.get(s.id) ?? null,
    }));
    vipSlotsRef.current = nextVip;
    normalSlotsRef.current = nextNormal;

    const emptyVipCount = vipSlotsRef.current.filter((s) => !s.occupiedById).length;
    const emptyNormalCount = normalSlotsRef.current.filter((s) => !s.occupiedById).length;
    let emptySlotsAvailable = emptyVipCount + emptyNormalCount;

    // 1. Nhường chỗ cho các bạn đang đứng Top bảng Học Ké vào lớp trước
    if (waitingPoolRef.current.size > 1) {
      const sortedEntries = Array.from(waitingPoolRef.current.entries()).sort(
        (entryA, entryB) => {
          const a = entryA[1];
          const b = entryB[1];
          if (Boolean(a.isGoldenPriority) !== Boolean(b.isGoldenPriority)) {
            return a.isGoldenPriority ? -1 : 1;
          }
          if (a.isGoldenPriority && b.isGoldenPriority) {
            const ptDiffGold = (b.points || 0) - (a.points || 0);
            if (ptDiffGold !== 0) return ptDiffGold;
            return (
              (a.goldenPriorityAt || a.addedAt || 0) -
              (b.goldenPriorityAt || b.addedAt || 0)
            );
          }
          const ptDiff = (b.points || 0) - (a.points || 0);
          if (ptDiff !== 0) return ptDiff;
          const timeDiff = (a.lastElapsedSec ?? 999) - (b.lastElapsedSec ?? 999);
          if (timeDiff !== 0) return timeDiff;
          if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
          return (a.addedAt || 0) - (b.addedAt || 0);
        }
      );
      waitingPoolRef.current = new Map(sortedEntries);
    }

    let maxAttempts = waitingPoolRef.current.size;
    let admittedBatchCount = 0;
    while (
      emptySlotsAvailable > 0 &&
      waitingPoolRef.current.size > 0 &&
      maxAttempts > 0
    ) {
      maxAttempts -= 1;
      const firstKey = waitingPoolRef.current.keys().next().value;
      if (!firstKey) break;
      const nextReq = waitingPoolRef.current.get(firstKey)!;
      waitingPoolRef.current.delete(firstKey);

      const staggerDelaySec = Math.min(
        1.05,
        Math.floor(admittedBatchCount / 2) * 0.075 +
          (admittedBatchCount % 2) * 0.035
      );
      if (Number(nextReq.points || 0) > 0) {
        donorsModified = true;
      }

      const admitted = spawnOrPromotePilgrim(
        {
          ...nextReq,
          coins: 0,
        },
        {
          forceAdmitFromQueue: true,
          skipStateCommit: true,
          spawnDelaySec: staggerDelaySec,
        }
      );
      if (admitted) {
        emptySlotsAvailable -= 1;
        admittedBatchCount += 1;
      }
    }

    // 2. Đẩy các bạn vừa trả lời sai ra ngoài Hàng Chờ Học Ké và GIỮ NGUYÊN SỐ ĐIỂM (vẫn vô lại được ở câu kế tiếp nếu điểm nằm trong Top cao!)
    if (evictedToWaitingQueue.length > 0) {
      const nowReturn = Date.now();
      evictedToWaitingQueue.forEach((ev, idx) => {
        const lowerKey = ev.username.trim().toLowerCase();
        const existingInPool = waitingPoolRef.current.get(lowerKey);
        const keptPts = Math.max(
          ev.points || 0,
          existingInPool?.points || 0
        );
        waitingPoolRef.current.set(lowerKey, {
          id:
            existingInPool?.id ||
            `wq_evict_${nowReturn}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          username: ev.username,
          prayer: 'học ké',
          gender: ev.gender,
          isVip: ev.isVip,
          coins: 0,
          isBot: ev.isBot,
          avatarUrl: ev.avatarUrl || existingInPool?.avatarUrl || null,
          addedAt: nowReturn + idx,
          points: keptPts,
          rank: waitingPoolRef.current.size + 1,
          answeredCorrectInRound: false,
          lastElapsedSec: 999,
          idleRounds: 0,
        });
      });
    }

    setVipSlots([...vipSlotsRef.current]);
    setNormalSlots([...normalSlotsRef.current]);
    if (donorsModified) {
      setLotusDonors([...lotusDonorsRef.current]);
    }
    setPilgrims([...pilgrimsRef.current]);
    recomputeWaitingQueueLazy();
  }, [recomputeWaitingQueueLazy, spawnOrPromotePilgrim]);

  // Thêm thẳng số lượng NPC mới (±1, 2, 3 tự nhiên) vào Hàng Chờ Vào Lớp mỗi khi xong 1 câu hỏi
  const enqueueBatchNpcsAfterQuestion = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg.autoCrowd) return;
    const baseCount = Math.max(0, Math.round(cfg.botTargetCrowd ?? 8));
    if (baseCount <= 0) return;

    const deltas = [-3, -2, -1, 0, 1, 2, 3];
    const randomDelta = deltas[Math.floor(Math.random() * deltas.length)];
    const actualToAdd = Math.max(1, baseCount + randomDelta);

    const names =
      npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
    const avatarPool =
      npcAvatarsRef.current.length > 0
        ? npcAvatarsRef.current
        : DEFAULT_NPC_AVATARS;

    const busyNames = new Set<string>([
      ...pilgrimsRef.current
        .filter(
          (p) =>
            p.state !== 'leave_side_to_aisle' && p.state !== 'leave_down_exit'
        )
        .map((p) => p.username.trim().toLowerCase()),
      ...Array.from(waitingPoolRef.current.keys()),
    ]);

    const pool = waitingPoolRef.current;
    for (let i = 0; i < actualToAdd; i++) {
      if (pool.size >= 300) break;
      const available = names.filter(
        (n) => !busyNames.has(n.trim().toLowerCase())
      );
      const chosenName =
        available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : `${names[Math.floor(Math.random() * names.length)]} #${
              pool.size + 1
            }`;
      const lowerChosen = chosenName.trim().toLowerCase();
      busyNames.add(lowerChosen);

      const randomAvatar =
        avatarPool[Math.floor(Math.random() * avatarPool.length)] || null;

      pool.set(lowerChosen, {
        id: `wq_npc_${Date.now()}_${i}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        username: chosenName,
        prayer: 'vào lớp',
        gender: resolveBalancedNpcGender(chosenName, 'queue'),
        isVip: false,
        coins: 0,
        isBot: true,
        avatarUrl: randomAvatar,
        addedAt: Date.now() + i,
        points: 0,
        rank: pool.size + 1,
        answeredCorrectInRound: false,
        lastElapsedSec: 999,
        idleRounds: 0,
      });
    }

    recomputeWaitingQueueLazy();
  }, [recomputeWaitingQueueLazy, resolveBalancedNpcGender]);

  // Lên lịch cho TẤT CẢ học sinh NPC (cả trong lớp VÀ trong Hàng Chờ) comment trả lời câu hỏi trải đều trong 10s đầu (không đồng thanh)
  // Dựa theo tỉ lệ `npcCorrectAnswerPercent`: Trả lời đúng (từ tiếng Anh ngắn gọn) hoặc nói vẩn vơ (trích danh sách phát biểu)
  const quizNpcTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearQuizNpcTimers = useCallback(() => {
    quizNpcTimersRef.current.forEach((t) => clearTimeout(t));
    quizNpcTimersRef.current = [];
  }, []);

  const scheduleQuizNpcAnswers = useCallback(
    (questionIdx: number, askDurMs: number) => {
      clearQuizNpcTimers();
      const cfg = configRef.current;
      if (cfg.hudLayout.classBoardNpcParticipate === false) return;

      const botsInClass = pilgrimsRef.current
        .filter(
          (p) =>
            p.isBot &&
            p.slotId !== null &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        )
        .map((p) => ({
          kind: 'class' as const,
          id: p.id,
          username: p.username,
          avatarUrl: p.avatarUrl,
          gender: p.gender,
        }));

      const botsInQueue = Array.from(waitingPoolRef.current.values())
        .filter((q) => q.isBot)
        .slice(0, 30)
        .map((q) => ({
          kind: 'queue' as const,
          id: 0,
          username: q.username,
          avatarUrl: q.avatarUrl,
          gender: q.gender,
        }));

      const allParticipants = [...botsInClass, ...botsInQueue];
      if (allParticipants.length === 0) return;

      // Xáo trộn thứ tự NPC (trong lớp + hàng chờ) để mỗi câu hỏi thứ tự phát biểu khác nhau
      const shuffledBots = [...allParticipants].sort(() => Math.random() - 0.5);
      const count = shuffledBots.length;
      // Chỉ cho NPC bắt đầu trả lời sau > 5s (từ 5.2s đến gần hết giờ hỏi bài) để không cướp Top tốc độ của người chơi thật
      const minStartMs = 5200;
      const maxWindowEndMs = Math.max(
        minStartMs + 1500,
        Math.min(11500, askDurMs - 600)
      );
      const totalSpanMs = Math.max(1500, maxWindowEndMs - minStartMs);
      const stepMs = totalSpanMs / Math.max(1, count);

      shuffledBots.forEach((bot, idx) => {
        const jitter = (Math.random() - 0.5) * Math.min(350, stepMs * 0.45);
        const delayMs = Math.max(
          minStartMs,
          Math.min(
            maxWindowEndMs,
            Math.round(minStartMs + (idx + 0.5) * stepMs + jitter)
          )
        );

        const timerId = setTimeout(() => {
          const curCfg = configRef.current;
          const bState = classBoardStateRef.current;
          if (
            !bState.isRunning ||
            bState.phase !== 'asking' ||
            bState.questionIndex !== questionIdx ||
            curCfg.hudLayout.classBoardNpcParticipate === false
          ) {
            return;
          }

          const quizList = getActiveQuizList(curCfg);
          const quizItem = bState.currentQuestion || quizList[0];
          const correctRate =
            typeof curCfg.npcCorrectAnswerPercent === 'number'
              ? curCfg.npcCorrectAnswerPercent
              : 65;
          const willAnswerRight = Math.random() * 100 < correctRate;
          const shortAnswer = formatShortQuizAnswer(quizItem.en);
          const typoAnswer = buildTypoQuizAnswer(quizItem.en);

          // Khi NPC trả lời sai: Im lặng (không chat) HOẶC chat câu trả lời nhưng đảo ngẫu nhiên vị trí 2 chữ cái liền nhau -> hệ thống tự nhận diện là trả lời sai
          const scatterDensity = Math.max(
            0,
            Math.min(100, curCfg.npcScatterChatDensity ?? 50)
          );
          const wrongTypoSpeakChance =
            scatterDensity <= 0
              ? 0.35
              : Math.max(0.25, Math.min(0.85, 0.25 + (scatterDensity / 100) * 0.55));
          const shouldSpeakWrongTypo = Math.random() < wrongTypoSpeakChance;

          // Trường hợp 1: NPC đang nằm trong Hàng Chờ Vào Lớp -> chat câu trả lời đúng như người thật (hoặc im lặng / đảo 2 chữ liền nhau nếu sai)
          if (bot.kind === 'queue') {
            const lowerBotName = bot.username.trim().toLowerCase();
            const stillInQueue = waitingPoolRef.current.get(lowerBotName);
            if (
              !stillInQueue ||
              !stillInQueue.isBot ||
              stillInQueue.answeredCorrectInRound
            ) {
              return;
            }

            if (!willAnswerRight && !shouldSpeakWrongTypo) {
              // Im lặng -> hệ thống tự tính là không trả lời đúng
              return;
            }

            const chosenComment = willAnswerRight ? shortAnswer : typoAnswer;
            spawnOrPromotePilgrim({
              username: stillInQueue.username,
              prayer: chosenComment,
              gender: stillInQueue.gender,
              isVip: false,
              coins: 0,
              isBot: true,
              avatarUrl: stillInQueue.avatarUrl,
              allowDoorCrowdBubbleForBot: true,
            });
            return;
          }

          // Trường hợp 2: NPC đang ngồi trong lớp -> chat câu trả lời đúng như người thật (hoặc im lặng / đảo 2 chữ liền nhau nếu sai)
          const targetBot = pilgrimsRef.current.find(
            (p) =>
              p.id === bot.id &&
              p.isBot &&
              p.slotId !== null &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit' &&
              !p.answeredCurrentQuestion
          );
          if (!targetBot) return;

          if (!willAnswerRight && !shouldSpeakWrongTypo) {
            // Im lặng -> hết giờ hệ thống tự nhận diện là trả lời sai
            return;
          }

          const chosenClassAnswer = willAnswerRight ? shortAnswer : typoAnswer;
          spawnOrPromotePilgrim({
            username: targetBot.username,
            prayer: chosenClassAnswer,
            gender: targetBot.gender,
            isVip: false,
            coins: 0,
            isBot: true,
            avatarUrl: targetBot.avatarUrl,
          });
        }, delayMs);

        quizNpcTimersRef.current.push(timerId);
      });
    },
    [
      clearQuizNpcTimers,
      getActiveQuizList,
      spawnOrPromotePilgrim,
    ]
  );

  useEffect(() => {
    return () => clearQuizNpcTimers();
  }, [clearQuizNpcTimers]);

  // Khởi tạo nhóm học sinh NPC đầu tiên trong lớp & trong Hàng Chờ khi mới mở game
  const hasSeededInitialClassRef = useRef(false);
  useEffect(() => {
    if (hasSeededInitialClassRef.current) return;
    hasSeededInitialClassRef.current = true;
    const cfg = configRef.current;
    if (!cfg.autoCrowd) return;

    const seedTimer = setTimeout(() => {
      const currentCfg = configRef.current;
      if (!currentCfg.autoCrowd) return;
      const totalSeats =
        vipSlotsRef.current.length + normalSlotsRef.current.length;
      const targetInitial = Math.min(
        totalSeats,
        Math.max(6, Math.min(14, (currentCfg.botTargetCrowd || 8) + 2))
      );
      const names =
        npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
      const usedNames = new Set<string>();

      for (let i = 0; i < targetInitial; i++) {
        const available = names.filter((n) => !usedNames.has(n.toLowerCase()));
        const chosenName =
          available.length > 0
            ? available[Math.floor(Math.random() * available.length)]
            : `${names[i % names.length]} #${i + 1}`;
        usedNames.add(chosenName.toLowerCase());
        spawnOrPromotePilgrim(
          {
            username: chosenName,
            prayer: '',
            isVip: false,
            coins: 0,
            isBot: true,
          },
          { forceAdmitFromQueue: true }
        );
      }

      // Thêm sẵn 1 đợt NPC vào Hàng Chờ cho câu hỏi đầu tiên
      enqueueBatchNpcsAfterQuestion();
    }, 50);

    const initTimer = setTimeout(() => {
      const curBoard = classBoardStateRef.current;
      const currentCfg = configRef.current;
      if (!curBoard.isRunning) return;

      if (curBoard.phase === 'lesson_start') {
        const startSpeech =
          curBoard.lessonStartText ||
          currentCfg.lessonStartTtsText ||
          'Chào mừng các em đến với tiết Tiếng Anh lớp 12A1! Các em hãy chú ý lên bảng và bình luận đáp án thật nhanh để giành ghế ngồi trong lớp nhé!';
        const flowToken = curBoard.activeFlowToken || 'flow_init_0';

        const enqueued = soundEngine.enqueueLessonFlowItems(
          [
            {
              text: startSpeech,
              lang: 'vi',
              lessonFlowToken: flowToken,
              lessonStepLabel: 'Luồng 0: Bắt đầu tiết học',
            },
          ],
          currentCfg
        );

        if (!enqueued) {
          const fallbackState: ClassBoardRuntimeState = {
            ...classBoardStateRef.current,
            ttsFinishedForPhase: true,
            timeLeftMs: 3200,
            totalDurationMs: 3200,
          };
          classBoardStateRef.current = fallbackState;
          setClassBoardState(fallbackState);
        }
      } else if (curBoard.phase === 'asking') {
        const askDurMs =
          getQuestionAskDurationSec(currentCfg, curBoard.currentQuestion) *
          1000;
        scheduleQuizNpcAnswers(curBoard.questionIndex, askDurMs);
      }
    }, 350);
    return () => {
      clearTimeout(seedTimer);
      clearTimeout(initTimer);
    };
  }, [
    enqueueBatchNpcsAfterQuestion,
    scheduleQuizNpcAnswers,
    spawnOrPromotePilgrim,
  ]);

  // Hệ thống NPC trong lớp và NPC trong Hàng Chờ phát biểu rải rác tự nhiên theo "Mật độ rải chat" (npcScatterChatDensity: 0%..100%)
  const nextClassScatterAtRef = useRef<number>(Date.now() + 2600);
  const nextQueueScatterAtRef = useRef<number>(Date.now() + 1800);
  const pendingSeatmateReplyBotIdRef = useRef<number | null>(null);

  const pickRandomSpeechFromThreeGroups = useCallback(
    (cfg: GameConfig, fallbackList: string[]): string => {
      const cats = cfg.npcSpeechCategories ?? DEFAULT_NPC_SPEECH_CATEGORIES;
      const nonEmptyGroups = [cats.idle, cats.question, cats.reply].filter(
        (g): g is string[] => Array.isArray(g) && g.length > 0
      );
      if (nonEmptyGroups.length > 0) {
        const chosenGroup =
          nonEmptyGroups[Math.floor(Math.random() * nonEmptyGroups.length)];
        return chosenGroup[Math.floor(Math.random() * chosenGroup.length)];
      }
      const list = fallbackList.length > 0 ? fallbackList : SAMPLE_PRAYERS;
      return list[Math.floor(Math.random() * list.length)];
    },
    []
  );

  const pickRandomReplySpeech = useCallback(
    (cfg: GameConfig, fallbackList: string[]): string => {
      const cats = cfg.npcSpeechCategories ?? DEFAULT_NPC_SPEECH_CATEGORIES;
      const replyGroup =
        Array.isArray(cats.reply) && cats.reply.length > 0
          ? cats.reply
          : DEFAULT_NPC_SPEECH_CATEGORIES.reply;
      if (replyGroup.length > 0) {
        return replyGroup[Math.floor(Math.random() * replyGroup.length)];
      }
      const list = fallbackList.length > 0 ? fallbackList : SAMPLE_PRAYERS;
      return list[Math.floor(Math.random() * list.length)];
    },
    []
  );

  useEffect(() => {
    const computeScatterDelayMs = (densityPercent: number) => {
      const clamped = Math.max(1, Math.min(100, densityPercent));
      const norm = clamped / 100; // 0.01 .. 1.0
      // Mật độ 100% -> trung bình ~1.7s; Mật độ 50% -> trung bình ~4.6s; Mật độ 10% -> trung bình ~11.5s
      const baseMs = 1350 + Math.pow(1 - norm, 1.4) * 11200;
      // Dao động ngẫu nhiên rộng (0.35x .. 1.65x) để các câu chat rải rác tự nhiên, không bị đều nhịp
      return Math.round(baseMs * (0.35 + Math.random() * 1.3));
    };

    const timer = setInterval(() => {
      const cfg = configRef.current;
      if (!cfg.autoCrowd) return;

      const density = Math.max(0, Math.min(100, cfg.npcScatterChatDensity ?? 50));
      if (density <= 0) return;

      const now = Date.now();
      const prayers =
        npcPrayersRef.current.length > 0 ? npcPrayersRef.current : SAMPLE_PRAYERS;
      const bState = classBoardStateRef.current;
      const isQuizAsking =
        cfg.hudLayout.showClassBoardBox !== false &&
        (bState.engine || cfg.hudLayout.classBoardEngine || 'english_quiz') ===
          'english_quiz' &&
        bState.isRunning &&
        bState.phase === 'asking';

      // Khi đang trong thời gian trả lời câu hỏi trên bảng hoặc đang diễn ra Sự kiện Đẩy lùi Zombie, tạm dừng rải chat ngẫu nhiên của NPC
      if (isQuizAsking || zombieEventStateRef.current.isActive) {
        return;
      }

      // 1. Rải chat độc lập cho NPC trong Hàng Chờ -> chọn ngẫu nhiên 1 trong 3 nhóm (Vu vơ / Hỏi / Trả lời)
      if (now >= nextQueueScatterAtRef.current) {
        nextQueueScatterAtRef.current = now + computeScatterDelayMs(density);
        const queuedBots = waitingQueueRef.current.filter((q) => q.isBot);
        if (queuedBots.length > 0) {
          const chosenQueued =
            queuedBots[Math.floor(Math.random() * queuedBots.length)];
          const queueComment = pickRandomSpeechFromThreeGroups(cfg, prayers);
          spawnOrPromotePilgrim({
            username: chosenQueued.username,
            prayer: queueComment,
            gender: chosenQueued.gender,
            isVip: false,
            coins: 0,
            isBot: true,
            avatarUrl: chosenQueued.avatarUrl,
            allowDoorCrowdBubbleForBot: true,
          });
        }
      }

      // 2. Rải chat cho NPC đang ngồi trong lớp (kèm thuật toán ưu tiên bạn NPC ngồi cạnh cùng bàn đôi trả lời ở lượt kế tiếp)
      if (now >= nextClassScatterAtRef.current) {
        const seatedBots = pilgrimsRef.current.filter(
          (p) => p.isBot && p.state === 'pray_seated'
        );
        if (seatedBots.length === 0) {
          pendingSeatmateReplyBotIdRef.current = null;
          nextClassScatterAtRef.current = now + computeScatterDelayMs(density);
          return;
        }

        // Kiểm tra xem có bạn NPC cùng bàn đang được đẩy lên trả lời lượt kế tiếp không
        if (pendingSeatmateReplyBotIdRef.current !== null) {
          const pendingBotId = pendingSeatmateReplyBotIdRef.current;
          pendingSeatmateReplyBotIdRef.current = null;
          const replyBot = seatedBots.find((p) => p.id === pendingBotId);
          if (replyBot) {
            const replyComment = pickRandomReplySpeech(cfg, prayers);
            nextClassScatterAtRef.current = now + computeScatterDelayMs(density);
            spawnOrPromotePilgrim({
              username: replyBot.username,
              prayer: replyComment,
              gender: replyBot.gender,
              isVip: false,
              coins: 0,
              isBot: true,
              avatarUrl: replyBot.avatarUrl,
            });
            return;
          }
        }

        nextClassScatterAtRef.current = now + computeScatterDelayMs(density);

        const idleBubbleBots = seatedBots.filter(
          (p) => !p.chatBubbleUntil || p.chatBubbleUntil <= now
        );
        const pool = idleBubbleBots.length > 0 ? idleBubbleBots : seatedBots;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        const nextComment = pickRandomSpeechFromThreeGroups(cfg, prayers);

        spawnOrPromotePilgrim({
          username: chosen.username,
          prayer: nextComment,
          gender: chosen.gender,
          isVip: false,
          coins: 0,
          isBot: true,
          avatarUrl: chosen.avatarUrl,
        });

        // Kiểm tra xem ghế bên cạnh cùng bàn đôi với `chosen` có bạn NPC nào đang ngồi không
        if (chosen.slotId) {
          const allDesks = [
            ...groupSlotsIntoDoubleDesks(vipSlotsRef.current, 'vip'),
            ...groupSlotsIntoDoubleDesks(normalSlotsRef.current, 'norm'),
          ];
          const desk = allDesks.find(
            (d) =>
              d.leftSlot.id === chosen.slotId || d.rightSlot?.id === chosen.slotId
          );
          const partnerSlotId = desk
            ? desk.leftSlot.id === chosen.slotId
              ? desk.rightSlot?.id
              : desk.leftSlot.id
            : undefined;
          if (partnerSlotId) {
            const seatmateBot = seatedBots.find(
              (p) => p.id !== chosen.id && p.slotId === partnerSlotId
            );
            if (seatmateBot) {
              // Đẩy bạn NPC cùng bàn lên phát biểu ở lượt kế tiếp với câu lấy từ nhóm "Trả lời"
              pendingSeatmateReplyBotIdRef.current = seatmateBot.id;
              nextClassScatterAtRef.current =
                now + Math.min(computeScatterDelayMs(density), 2200);
            }
          }
        }
      }
    }, 350);

    return () => clearInterval(timer);
  }, [
    pickRandomReplySpeech,
    pickRandomSpeechFromThreeGroups,
    spawnOrPromotePilgrim,
  ]);

  // Đồng bộ cấu hình engine, bộ câu hỏi & thời gian câu hỏi (mặc định 12s cho Luồng 2 & 3) vào classBoardState khi người dùng chỉnh trong Studio
  // Quy tắc nguồn chuẩn duy nhất: Câu hỏi trên Bảng Lớp (currentQuestion) LUÔN LUÔN là câu đầu tiên (#1 Đang phát: quizList[0]) trong Hàng Chờ Câu Hỏi!
  useEffect(() => {
    const nextEngine = config.hudLayout.classBoardEngine || 'english_quiz';
    const quizList = getActiveQuizList(config);
    setClassBoardState((prev) => {
      const safeIdx = 0;
      const curQ = quizList[0];
      const nextDurMs = getQuestionAskDurationSec(config, curQ) * 1000;
      const engineSwitchedAwayFromLesson =
        prev.engine !== nextEngine && nextEngine !== 'english_quiz';
      const nextIsRunning = engineSwitchedAwayFromLesson ? false : prev.isRunning;

      if (engineSwitchedAwayFromLesson && prev.isRunning) {
        clearQuizNpcTimers();
        soundEngine.pauseLessonFlowTts();
      }

      const durationSettingChanged =
        prev.phase === 'asking' && prev.totalDurationMs !== nextDurMs;
      const nextTotalDurationMs =
        prev.phase === 'asking' ? nextDurMs : prev.totalDurationMs;
      // Giữ nguyên thời gian còn lại (timeLeftMs) khi tiết học đang tạm dừng để khi bấm Tiếp tục sẽ chạy tiếp đúng luồng đang dừng
      const nextTimeLeftMs =
        durationSettingChanged && !nextIsRunning
          ? nextDurMs
          : prev.timeLeftMs;

      if (
        prev.engine === nextEngine &&
        prev.isRunning === nextIsRunning &&
        prev.questionIndex === safeIdx &&
        prev.totalQuestions === quizList.length &&
        prev.currentQuestion?.id === curQ.id &&
        prev.currentQuestion?.vi === curQ.vi &&
        prev.currentQuestion?.en === curQ.en &&
        (prev.currentQuestion?.luckyStars || 0) === (curQ.luckyStars || 0) &&
        prev.totalDurationMs === nextTotalDurationMs &&
        prev.timeLeftMs === nextTimeLeftMs &&
        prev.lessonStartText === config.lessonStartTtsText
      ) {
        return prev;
      }

      const questionWordChanged =
        prev.currentQuestion?.en?.trim().toLowerCase() !==
        curQ.en.trim().toLowerCase();

      const liveBoard = classBoardStateRef.current;
      const liveTimeLeftMs =
        durationSettingChanged && !nextIsRunning
          ? nextDurMs
          : liveBoard.phaseEndAt && nextIsRunning
          ? Math.max(0, liveBoard.phaseEndAt - Date.now())
          : liveBoard.timeLeftMs;

      const nextState: ClassBoardRuntimeState = {
        ...prev,
        ...liveBoard,
        engine: nextEngine,
        isRunning: nextIsRunning,
        questionIndex: safeIdx,
        totalQuestions: quizList.length,
        currentQuestion: curQ,
        lessonStartText:
          config.lessonStartTtsText ||
          prev.lessonStartText ||
          'Chào mừng các em đến với tiết Tiếng Anh lớp 12A1! Các em hãy chú ý lên bảng và bình luận đáp án thật nhanh để giành ghế ngồi trong lớp nhé!',
        totalDurationMs: nextTotalDurationMs,
        timeLeftMs: liveTimeLeftMs,
        phaseEndAt:
          durationSettingChanged && nextIsRunning
            ? Date.now() + liveTimeLeftMs
            : liveBoard.phaseEndAt,
      };
      classBoardStateRef.current = nextState;

      if (questionWordChanged && nextIsRunning && prev.phase === 'asking') {
        scheduleQuizNpcAnswers(0, liveTimeLeftMs);
      }
      return nextState;
    });
  }, [
    clearQuizNpcTimers,
    config.hudLayout.classBoardEngine,
    config.hudLayout.classBoardQuestionDurationSec,
    config.hudLayout.classBoardQuestionDurationByLevel,
    config.lessonStartTtsText,
    config.customQuizQuestions,
    getActiveQuizList,
    scheduleQuizNpcAnswers,
  ]);

  // Theo dõi các tác vụ phụ (reset cờ trả lời ở Luồng 2, chấm điểm ở Luồng 4, và sắp xếp lớp ở Luồng 5)
  // đã được thực thi tại trình duyệt hiện tại cho từng vòng câu hỏi (roundSeq_questionIndex).
  // Đảm bảo dù chuyển luồng bằng bộ đếm cục bộ hay nhận gói đồng bộ SYNC_CLASS_BOARD_STATE từ trình duyệt khác,
  // mọi trình duyệt (Điều khiển & OBS) đều thực thi sắp xếp lớp và chấm điểm đúng 100%!
  const executedRoundSideEffectsRef = useRef<{
    askingRoundKey: string;
    answerFlashRoundKey: string;
    resultSummaryRoundKey: string;
  }>({
    askingRoundKey: '',
    answerFlashRoundKey: '',
    resultSummaryRoundKey: '',
  });

  const ensureAskingPhaseSideEffects = useCallback(
    (roundSeq: number, questionIndex: number, askDurMs: number) => {
      const roundKey = `${roundSeq || 1}_${questionIndex || 0}`;
      if (executedRoundSideEffectsRef.current.askingRoundKey === roundKey) {
        return false;
      }
      executedRoundSideEffectsRef.current.askingRoundKey = roundKey;

      const cfg = configRef.current;
      const activeSeatedCount = pilgrimsRef.current.filter(
        (p) =>
          p.slotId !== null &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      ).length;
      if (
        activeSeatedCount === 0 &&
        waitingPoolRef.current.size === 0 &&
        cfg.autoCrowd
      ) {
        enqueueBatchNpcsAfterQuestion();
      }

      const readyPilgrims = pilgrimsRef.current.map((p) => ({
        ...p,
        answeredCurrentQuestion: false,
        quizResultStatus: null,
        quizResultUntil: 0,
        quizEarnedPoints: 0,
      }));
      pilgrimsRef.current = readyPilgrims;
      setPilgrims(readyPilgrims);

      scheduleQuizNpcAnswers(questionIndex, Math.max(2500, askDurMs || 12000));
      return true;
    },
    [enqueueBatchNpcsAfterQuestion, scheduleQuizNpcAnswers]
  );

  const ensureAnswerFlashPhaseSideEffects = useCallback(
    (
      roundSeq: number,
      questionIndex: number,
      cWinners: ClassBoardQuizWinner[] = [],
      oWinners: ClassBoardQuizWinner[] = [],
      playSfx = true
    ) => {
      const roundKey = `${roundSeq || 1}_${questionIndex || 0}`;
      if (executedRoundSideEffectsRef.current.answerFlashRoundKey === roundKey) {
        return false;
      }
      executedRoundSideEffectsRef.current.answerFlashRoundKey = roundKey;

      clearQuizNpcTimers();
      const cfg = configRef.current;

      const activeQuizListNow = getActiveQuizList(cfg);
      const currentQuizQuestion =
        classBoardStateRef.current.currentQuestion ||
        activeQuizListNow[
          activeQuizListNow.length > 0
            ? Math.max(0, questionIndex % activeQuizListNow.length)
            : 0
        ];
      const baseCorrectPoints = getQuizRankPoints(4, currentQuizQuestion);

      // 1. Cộng điểm & EXP (= Điểm) câu trả lời đúng cho học sinh trong Hàng Chờ (outsideWinners) ngay khi vào Luồng 4
      const rewardedQueueKeys = new Set<string>();
      oWinners.forEach((ow, idx) => {
        if (!ow.username) return;
        const pts = ow.points || getQuizRankPoints(idx + 1, currentQuizQuestion);
        const earnedExp = pts;
        const lower = ow.username.trim().toLowerCase();
        rewardedQueueKeys.add(lower);
        const qEntry = waitingPoolRef.current.get(lower);
        if (qEntry) {
          qEntry.points = (qEntry.points || 0) + pts;
          qEntry.answeredCorrectInRound = true;
          qEntry.idleRounds = 0;
        }
        const prevExp = studentExpMapRef.current.get(lower) || 0;
        studentExpMapRef.current.set(lower, prevExp + earnedExp);
        studentExpDirtyRef.current = true;
        addLotusPointsToDonor(ow.username, pts, true);
      });

      // Đảm bảo học sinh trong Hàng Chờ cục bộ đã trả lời đúng cũng được cộng điểm & EXP (= Điểm)
      for (const [lowerKey, qEntry] of waitingPoolRef.current.entries()) {
        if (qEntry.answeredCorrectInRound && !rewardedQueueKeys.has(lowerKey)) {
          const fallbackPts = baseCorrectPoints;
          qEntry.points = (qEntry.points || 0) + fallbackPts;
          const prevExp = studentExpMapRef.current.get(lowerKey) || 0;
          studentExpMapRef.current.set(lowerKey, prevExp + fallbackPts);
          studentExpDirtyRef.current = true;
          addLotusPointsToDonor(qEntry.username, fallbackPts, true);
        }
      }

      // 2. Lazy Calculation 1 lần cho Hàng Chờ
      const resetUsers = recomputeWaitingQueueLazy({
        finalizeQuizRound: true,
      });

      // 3. Cộng điểm & EXP (= Điểm) câu trả lời đúng cho học sinh đang ngồi trong lớp (classWinners) ngay khi vào Luồng 4
      const classWinnerMap = new Map<string, number>();
      cWinners.forEach((w, idx) => {
        if (!w.username) return;
        const lower = w.username.trim().toLowerCase();
        const pts = w.points || getQuizRankPoints(idx + 1, currentQuizQuestion);
        classWinnerMap.set(lower, pts);
        addLotusPointsToDonor(w.username, pts, true);
      });

      if (playSfx && !soundEngine.isRemoteSlaveMode()) {
        soundEngine.playAnswerRevealSfx(
          cfg.ttsVolume || 1,
          cfg.answerRevealSfxPreset || 'chime_sparkle',
          cfg.answerRevealMp3Url
        );
      }

      const nowFlow4 = Date.now();
      const badgeUntil = nowFlow4 + 4800;
      const scoreCardDurMs =
        Math.max(0.5, cfg.scoreTagDurationSec ?? 4) * 1000;

      const markedPilgrims = pilgrimsRef.current.map((p) => {
        const isSeatedInClass =
          p.slotId !== null &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit';
        const lowerName = p.username.trim().toLowerCase();
        const curSavedExp = studentExpMapRef.current.get(lowerName) ?? p.exp ?? 0;
        const curSavedLevel = getStudentLevelFromExp(curSavedExp);

        if (!isSeatedInClass) {
          return {
            ...p,
            exp: curSavedExp,
            level: curSavedLevel,
          };
        }

        const earnedPts = classWinnerMap.get(lowerName);
        const isRight =
          Boolean(p.answeredCurrentQuestion) || earnedPts !== undefined;

        if (isRight) {
          const finalEarned = earnedPts || baseCorrectPoints;
          if (earnedPts === undefined) {
            addLotusPointsToDonor(p.username, finalEarned, true);
          }
          const prevExp = curSavedExp;
          const prevLevel = getStudentLevelFromExp(prevExp);
          const nextExp = prevExp + finalEarned;
          const nextLevel = getStudentLevelFromExp(nextExp);
          studentExpMapRef.current.set(lowerName, nextExp);
          studentExpDirtyRef.current = true;

          const donorItem = lotusDonorsRef.current.find(
            (d) => d.username.trim().toLowerCase() === lowerName
          );
          const totalScoreNow = donorItem
            ? donorItem.coins
            : (p.currentScoreDisplay || 0) + finalEarned;
          return {
            ...p,
            correctStreak: (p.correctStreak || 0) + 1,
            savedByShieldInCurrentRound: false,
            answeredCurrentQuestion: true,
            quizResultStatus: 'correct' as const,
            quizResultUntil: badgeUntil,
            quizEarnedPoints: finalEarned,
            currentScoreDisplay: totalScoreNow,
            scoreChangeDelta: finalEarned,
            exp: nextExp,
            level: nextLevel,
            expChangeDelta: 0,
            leveledUpInRound: nextLevel > prevLevel,
            scoreCardUntil: nowFlow4 + scoreCardDurMs,
            scoreCardKey: nowFlow4 + p.id,
          };
        }

        if (p.hasShield) {
          const nowShield = Date.now();
          return {
            ...p,
            exp: curSavedExp,
            level: curSavedLevel,
            expChangeDelta: 0,
            leveledUpInRound: false,
            hasShield: false,
            savedByShieldInCurrentRound: true,
            correctStreak: 0,
            answeredCurrentQuestion: false,
            quizResultStatus: 'wrong' as const,
            quizResultUntil: badgeUntil,
            quizEarnedPoints: 0,
            floatingScoreText: '🛡️ Đỡ bằng Khiên!',
            floatingScoreColor: 'gold' as const,
            floatingScoreUntil: nowShield + 3600,
            floatingScoreKey: nowShield,
          };
        }

        // Luật mới: Trả lời sai không reset điểm, giữ nguyên currentScoreDisplay để mang ra Hàng chờ học ké
        return {
          ...p,
          exp: curSavedExp,
          level: curSavedLevel,
          expChangeDelta: 0,
          leveledUpInRound: false,
          correctStreak: 0,
          savedByShieldInCurrentRound: false,
          coins: 0,
          pendingGiftCoins: 0,
          hasDeskCat: false,
          deskCatCount: 0,
          hasDeskPig: false,
          hasDeskSnack: false,
          hasPcGamingDesk: false,
          answeredCurrentQuestion: false,
          quizResultStatus: 'wrong' as const,
          quizResultUntil: badgeUntil,
          quizEarnedPoints: 0,
        };
      });
      pilgrimsRef.current = markedPilgrims;
      setPilgrims(markedPilgrims);

      // Đồng bộ EXP/Level mới nhất cho các bạn đứng ở đám đông cửa lớp (doorCrowd)
      if (doorCrowdRef.current.length > 0) {
        const nextCrowd = doorCrowdRef.current.map((d) => {
          const lower = d.username.trim().toLowerCase();
          const expVal = studentExpMapRef.current.get(lower) || 0;
          return {
            ...d,
            exp: expVal,
            level: getStudentLevelFromExp(expVal),
          };
        });
        doorCrowdRef.current = nextCrowd;
        setDoorCrowd(nextCrowd);
      }

      if (studentExpDirtyRef.current) {
        flushStudentExpStorage(false, true);
      }

      return true;
    },
    [
      addLotusPointsToDonor,
      clearQuizNpcTimers,
      flushStudentExpStorage,
      recomputeWaitingQueueLazy,
    ]
  );

  const ensureResultSummaryPhaseSideEffects = useCallback(
    (
      roundSeq: number,
      questionIndex: number,
      cWinners: ClassBoardQuizWinner[] = [],
      oWinners: ClassBoardQuizWinner[] = []
    ) => {
      const roundKey = `${roundSeq || 1}_${questionIndex || 0}`;
      // Đảm bảo bước chấm điểm Luồng 4 đã chạy cho vòng này trước khi lọc học sinh đúng/sai và xếp chỗ ngồi!
      ensureAnswerFlashPhaseSideEffects(
        roundSeq,
        questionIndex,
        cWinners,
        oWinners,
        false
      );

      if (executedRoundSideEffectsRef.current.resultSummaryRoundKey === roundKey) {
        return false;
      }
      executedRoundSideEffectsRef.current.resultSummaryRoundKey = roundKey;

      rotateClassroomSeatsAfterReveal();
      enqueueBatchNpcsAfterQuestion();
      return true;
    },
    [
      enqueueBatchNpcsAfterQuestion,
      ensureAnswerFlashPhaseSideEffects,
      rotateClassroomSeatsAfterReveal,
    ]
  );

  // Vòng lặp điều phối Luồng Tiết Học 0 -> 6 tự động & đồng bộ giọng đọc TTS của Cô Giáo:
  // - Luồng 0 (lesson_start): Bắt đầu chạy tiết học (chỉ nói 1 lần khi bắt đầu) - Bảng hiện text lớn lời bắt đầu của cô giáo [Nói xong chuyển luồng 1]
  // - Luồng 1 (preparing): Đọc "Chuẩn bị" - Bảng chuẩn bị + "Bắt đầu sau 3, 2, 1" [Mặc định 3s]
  // - Luồng 2 & 3 (asking): Đọc câu hỏi + Đợi trả lời / Gợi ý trên bảng câu hỏi [Tính chung, mặc định 12s]
  // - Luồng 4 (answer_flash): Đọc câu trả lời + Bảng đáp án xanh lá nhấp nháy [Nói xong chuyển luồng 5]
  // - Luồng 5 (result_summary): Cập nhật chỗ ngồi ngay khi bắt đầu luồng 5 + Bảng kết quả 2 cột + Đọc kết quả [Nói xong chuyển luồng 6]
  // - Luồng 6 (ranking_board): Bảng xếp hạng trong lớp (6 top đầu 3s, sau đó mỗi 2s load tiếp 6 top tiếp theo) + Đọc xếp hạng [Nói xong kết thúc câu hỏi -> về Luồng 1]
  // Hàm phát 3 ly trà sữa Matcha Latte full topping với kích thước 200% (Top 1), 150% (Top 2), 100% (Top 3) cho 3 bạn chiến thắng trên bục giảng
  triggerRoundEndMilkTeaRef.current = () => {
    if (roundEndMilkTeaTriggeredRef.current) return;
    roundEndMilkTeaTriggeredRef.current = true;

    const cfg = configRef.current;
    const linePos = cfg.punishmentLinePos || { x: 270, y: 458 };
    const teacher =
      monksRef.current.find((m) => m.role === 'abbot') || monksRef.current[0];
    const startX = teacher ? teacher.x : 270;
    const startY = teacher ? teacher.y - 24 : 420;
    const nowTea = Date.now();
    const winners = roundEndWinnersRef.current;

    const lineSpacing = Math.max(24, cfg.punishmentLineSpacing || 52);
    const scaleByRank: Record<1 | 2 | 3, number> = {
      1: 2.0, // 200% cho Top 1
      2: 1.5, // 150% cho Top 2
      3: 1.0, // 100% cho Top 3
    };
    const spotIdxByRank: Record<1 | 2 | 3, number> = {
      1: 2, // Đứng vị trí P3 (giữa)
      2: 0, // Đứng vị trí P1 (trái)
      3: 4, // Đứng vị trí P5 (phải)
    };

    const teasToSpawn: FlyingMilkTeaFX[] = ([1, 2, 3] as const).map(
      (rankNum, idx) => {
        const w = winners.find((item) => item.rank === rankNum);
        const livePilgrim = w?.pilgrimId
          ? pilgrimsRef.current.find((p) => p.id === w.pilgrimId)
          : undefined;
        const fallbackX = Math.max(
          36,
          Math.min(
            504,
            Math.round(linePos.x + (spotIdxByRank[rankNum] - 2) * lineSpacing)
          )
        );
        const targetX = livePilgrim ? livePilgrim.x : fallbackX;
        const targetY = (livePilgrim ? livePilgrim.y : linePos.y) - 24;
        return {
          id: `round_end_tea_${nowTea}_${rankNum}_${idx}`,
          startX,
          startY,
          targetX,
          targetY,
          createdAt: nowTea + idx * 90,
          durationMs: 1250,
          scale: scaleByRank[rankNum],
        };
      }
    );

    soundEngine.playGiftEventSound('rose', cfg, true);
    setFlyingMilkTeas((prev) => [...prev.slice(-12), ...teasToSpawn]);

    // Sau khi ly trà sữa bay tới tay (~1.1s), gắn ly trà sữa 200% / 150% / 100% lên tay 3 bạn chiến thắng trên bục giảng
    window.setTimeout(() => {
      const winnerRankByLower = new Map<string, 1 | 2 | 3>();
      roundEndWinnersRef.current.forEach((w) => {
        if (w.username) {
          winnerRankByLower.set(w.username.trim().toLowerCase(), w.rank);
        }
      });
      const updated = pilgrimsRef.current.map((p) => {
        const r =
          p.podiumRank ||
          winnerRankByLower.get(p.username.trim().toLowerCase());
        if (!r) return p;
        return {
          ...p,
          winnerMilkTeaScale: scaleByRank[r],
        };
      });
      pilgrimsRef.current = updated;
      setPilgrims(updated);
    }, 1050);
  };

  useEffect(() => {
    if (!classBoardState.isRunning) return;
    if (classBoardState.engine !== 'english_quiz') return;

    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dtMs = Math.max(20, Math.min(400, now - lastTick));
      lastTick = now;

      const prev = classBoardStateRef.current;
      if (!prev.isRunning || prev.engine !== 'english_quiz') return;

      const isPureLiveTab =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('view') === 'live' ||
          new URLSearchParams(window.location.search).get('mode') === 'live' ||
          new URLSearchParams(window.location.search).get('obs') === '1');
      const peersNow = peerCountsRef.current;
      const isPassiveFollowerTab =
        !isPureLiveTab &&
        (peersNow.obsPeers > 0 ||
          (peersNow.totalPeers > 1 && soundEngine.isTabMuted()));

      const nowWallMs = Date.now();
      const nextLeft =
        prev.phaseEndAt && prev.phaseEndAt > 0
          ? Math.max(0, prev.phaseEndAt - nowWallMs)
          : Math.max(0, prev.timeLeftMs - dtMs);
      const phaseStartedAt =
        prev.phaseEndAt && prev.phaseEndAt > 0 && prev.totalDurationMs
          ? prev.phaseEndAt - prev.totalDurationMs
          : 0;
      const nextElapsed =
        phaseStartedAt > 0
          ? Math.max(0, nowWallMs - phaseStartedAt)
          : (prev.elapsedPhaseMs || 0) + dtMs;

      const cfg = configRef.current;

      let shouldAdvance = false;
      if (prev.phase === 'lesson_start') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= 2200) ||
          nextLeft <= 0;
      } else if (prev.phase === 'preparing') {
        shouldAdvance = nextLeft <= 0;
      } else if (prev.phase === 'asking') {
        const waitingForIdleChatFinish =
          Boolean(prev.idleChatTriggered) &&
          Boolean(prev.activeFlowToken) &&
          !prev.ttsFinishedForPhase &&
          nextElapsed < prev.totalDurationMs + 9000;
        shouldAdvance = nextLeft <= 0 && !waitingForIdleChatFinish;
      } else if (prev.phase === 'answer_flash') {
        const postTtsWaitMs4 =
          Math.max(0, Number(cfg.lessonFlow4PostTtsDelaySec ?? 1)) * 1000;
        const finishedAtElapsed = prev.ttsFinishedAtElapsedMs ?? 0;
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            nextElapsed - finishedAtElapsed >= postTtsWaitMs4 &&
            nextElapsed >= 600) ||
          nextLeft <= 0;
      } else if (prev.phase === 'result_summary') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= 2800) ||
          nextLeft <= 0;
      } else if (prev.phase === 'ranking_board' || prev.phase === 'reveal') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= 3200) ||
          nextLeft <= 0;
      } else if (prev.phase === 'round_end') {
        // Luồng Kết Thúc (sau câu 15): chờ Cô đọc xong + tiếng vỗ tay kết thúc mới kết thúc vòng và sang game mới
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= 4500) ||
          nextLeft <= 0;
      } else if (prev.phase === 'record_notice') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= 2600) ||
          nextLeft <= 0;
      } else if (prev.phase === 'punishment_notice') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= 2500) ||
          nextLeft <= 0;
      }

      const followerGraceExpired =
        isPassiveFollowerTab &&
        shouldAdvance &&
        nextLeft <= 0 &&
        nextElapsed >= (prev.totalDurationMs || 3000) + 2500;

      if (!shouldAdvance || (isPassiveFollowerTab && !followerGraceExpired)) {
        const nextStepNum =
          prev.phase === 'asking' &&
          prev.lessonStepNumber === 2 &&
          nextElapsed >= 2800
            ? 3
            : prev.lessonStepNumber;

        let nextIdleTriggered = prev.idleChatTriggered;
        let nextActiveToken = prev.activeFlowToken;
        let nextTtsFinished = prev.ttsFinishedForPhase;

        const idleDelayMs =
          Math.max(1, Number(cfg.lessonIdleChatDelaySec ?? 4)) * 1000;
        const queueSnapNow = soundEngine.getEventQueueSnapshot();
        const isStillReadingQuestion2 =
          Boolean(
            queueSnapNow.activeItem?.meta?.lessonStepLabel?.includes('Luồng 2')
          ) ||
          queueSnapNow.detailedQueue.some((it) =>
            Boolean(it.meta?.lessonStepLabel?.includes('Luồng 2'))
          );
        if (
          !isPassiveFollowerTab &&
          prev.phase === 'asking' &&
          !prev.idleChatTriggered &&
          !isStillReadingQuestion2 &&
          cfg.lessonIdleChatEnabled !== false &&
          nextElapsed >= idleDelayMs &&
          nextLeft >= 900
        ) {
          const idlePool = Array.isArray(cfg.lessonIdleChatTexts)
            ? cfg.lessonIdleChatTexts.map((s) => (s || '').trim()).filter(Boolean)
            : [];
          nextIdleTriggered = true;
          if (idlePool.length > 0) {
            const randomIdleText =
              idlePool[Math.floor(Math.random() * idlePool.length)];
            const idleToken = `flow_idle3_${Date.now()}_${prev.questionIndex}`;
            const idleItems = [
              {
                text: randomIdleText,
                lang: 'vi' as const,
                lessonFlowToken: idleToken,
                lessonStepLabel: 'Luồng 3: Câu nói vu vơ',
              },
            ];
            const enqueuedIdle = soundEngine.enqueueLessonFlowItems(
              idleItems,
              cfg
            );
            if (enqueuedIdle) {
              nextActiveToken = idleToken;
              nextTtsFinished = false;
            }
          }
        }

        const tickState: ClassBoardRuntimeState = {
          ...prev,
          lessonStepNumber: nextStepNum,
          idleChatTriggered: nextIdleTriggered,
          activeFlowToken: nextActiveToken,
          ttsFinishedForPhase: nextTtsFinished,
          timeLeftMs: nextLeft,
          elapsedPhaseMs: nextElapsed,
        };
        classBoardStateRef.current = tickState;
        const crossedHintThreshold =
          (prev.elapsedPhaseMs || 0) < 5000 && nextElapsed >= 5000;
        const isActiveCountdownPhase =
          prev.phase === 'asking' || prev.phase === 'preparing';
        const shouldCommitBoardRender =
          isActiveCountdownPhase ||
          nextStepNum !== prev.lessonStepNumber ||
          nextIdleTriggered !== prev.idleChatTriggered ||
          nextActiveToken !== prev.activeFlowToken ||
          nextTtsFinished !== prev.ttsFinishedForPhase ||
          crossedHintThreshold ||
          Math.ceil(nextLeft / 250) !== Math.ceil(prev.timeLeftMs / 250);
        if (shouldCommitBoardRender) {
          setClassBoardState(tickState);
        }
        return;
      }

      const quizList = getActiveQuizList(cfg);
      const curQuiz = quizList[0];

      // ============================================================================
      // CHUYỂN TỪ LUỒNG 0 (lesson_start) -> LUỒNG 1 (preparing - mặc định 3s "Chuẩn bị")
      // ============================================================================
      if (prev.phase === 'lesson_start') {
        const prepDurMs = Math.max(1, cfg.lessonPrepareDurationSec || 3) * 1000;
        const prepSpeech = pickRandomLessonPrepSpeech(cfg);
        const prepTtsItems = [
          {
            text: prepSpeech,
            lang: 'vi' as const,
            lessonStepLabel: `Luồng 1: Chuẩn bị (${Math.round(prepDurMs / 1000)}s)`,
          },
        ];

        soundEngine.playWoodenFish(cfg.ttsVolume * 0.65);
        soundEngine.enqueueLessonFlowItems(prepTtsItems, cfg);

        const prepState: ClassBoardRuntimeState = {
          ...prev,
          roundQuestionIndex: 0,
          questionIndex: 0,
          totalQuestions: QUESTIONS_PER_ROUND,
          currentQuestion: curQuiz,
          phase: 'preparing',
          lessonStepNumber: 1,
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          idleChatTriggered: false,
          elapsedPhaseMs: 0,
          timeLeftMs: prepDurMs,
          totalDurationMs: prepDurMs,
          phaseEndAt: Date.now() + prepDurMs,
          showResultEngine: false,
          seatUpdateTriggered: false,
        };
        classBoardStateRef.current = prepState;
        setClassBoardState(prepState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: prepState,
          lessonTtsItems: prepTtsItems,
        });
        return;
      }

      // ============================================================================
      // CHUYỂN TỪ LUỒNG 1 (preparing - 3s) -> LUỒNG 2 & 3 (asking - mặc định 12s)
      // ============================================================================
      if (prev.phase === 'preparing') {
        const askDurMs = getQuestionAskDurationSec(cfg, curQuiz) * 1000;

        ensureAskingPhaseSideEffects(
          prev.roundSeq || 1,
          prev.questionIndex,
          askDurMs
        );

        const roundQuestionNumber = Math.min(
          QUESTIONS_PER_ROUND,
          (prev.roundQuestionIndex ?? 0) + 1
        );
        const questionTpl =
          cfg.lessonQuestionTtsTemplate ||
          'Câu hỏi số [SốCâu]: [NghĩaViệt] tiếng Anh là gì, gồm [SốChữ] chữ cái?';
        const questionSpeech = questionTpl
          .replace(/\[SốCâu\]|\{index\}/gi, String(roundQuestionNumber))
          .replace(/\[NghĩaViệt\]|\{vi\}/gi, curQuiz.vi)
          .replace(/\[SốChữ\]|\{len\}/gi, String(curQuiz.en.length))
          .replace(/\[ĐápÁn\]|\{en\}/gi, curQuiz.en);

        const questionTtsItems =
          cfg.hudLayout.classBoardTtsReadQuestion ?? true
            ? [
                {
                  text: questionSpeech,
                  lang: 'vi' as const,
                  lessonStepLabel: 'Luồng 2: Đọc câu hỏi',
                },
              ]
            : [];

        if (questionTtsItems.length > 0) {
          soundEngine.enqueueLessonFlowItems(questionTtsItems, cfg);
        }

        const askingState: ClassBoardRuntimeState = {
          ...prev,
          phase: 'asking',
          lessonStepNumber: 2,
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          idleChatTriggered: false,
          elapsedPhaseMs: 0,
          timeLeftMs: askDurMs,
          totalDurationMs: askDurMs,
          phaseEndAt: Date.now() + askDurMs,
          totalQuestions: QUESTIONS_PER_ROUND,
          currentQuestion: curQuiz,
          showResultEngine: false,
          seatUpdateTriggered: false,
        };
        classBoardStateRef.current = askingState;
        setClassBoardState(askingState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: askingState,
          lessonTtsItems: questionTtsItems,
        });
        return;
      }

      // ============================================================================
      // CHUYỂN TỪ LUỒNG 2 & 3 (asking) -> LUỒNG 4 (answer_flash - Đọc câu trả lời & CỘNG ĐIỂM CHO HỌC SINH)
      // ============================================================================
      if (prev.phase === 'asking') {
        const cWinners = prev.classWinners || [];
        const oWinners = prev.outsideWinners || [];

        ensureAnswerFlashPhaseSideEffects(
          prev.roundSeq || 1,
          prev.questionIndex,
          cWinners,
          oWinners,
          true
        );

        const flowToken4 = `flow_ans_${Date.now()}_${prev.questionIndex}`;
        const answerPrefix = (cfg.lessonAnswerTtsTemplate || 'Đáp án là')
          .replace(/\[ĐápÁn\]|\{en\}/gi, '')
          .replace(/\[NghĩaViệt\]|\{vi\}/gi, curQuiz.vi)
          .trim();

        const flow4TtsItems = [
          ...(answerPrefix
            ? [
                {
                  text: answerPrefix,
                  lang: 'vi' as const,
                  lessonStepLabel: 'Luồng 4: Đọc câu trả lời',
                },
              ]
            : []),
          {
            text: curQuiz.en,
            lang: 'en' as const,
            lessonFlowToken: flowToken4,
            lessonStepLabel: 'Luồng 4: Phát âm đáp án',
          },
        ];
        const enqueued4 = soundEngine.enqueueLessonFlowItems(
          flow4TtsItems,
          cfg
        );

        const postTtsWaitMs4 =
          Math.max(0, Number(cfg.lessonFlow4PostTtsDelaySec ?? 1)) * 1000;
        const fallbackDur4 = (enqueued4 ? 14000 : 1200) + postTtsWaitMs4;
        const answerFlashState: ClassBoardRuntimeState = {
          ...prev,
          phase: 'answer_flash',
          lessonStepNumber: 4,
          activeFlowToken: flowToken4,
          ttsFinishedForPhase: !enqueued4,
          ttsFinishedAtElapsedMs: !enqueued4 ? 0 : undefined,
          elapsedPhaseMs: 0,
          timeLeftMs: fallbackDur4,
          totalDurationMs: fallbackDur4,
          phaseEndAt: Date.now() + fallbackDur4,
          showResultEngine: false,
          seatUpdateTriggered: false,
          totalQuestions: quizList.length,
          currentQuestion: curQuiz,
        };
        classBoardStateRef.current = answerFlashState;
        setClassBoardState(answerFlashState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: answerFlashState,
          lessonTtsItems: flow4TtsItems,
        });
        return;
      }

      // ============================================================================
      // CHUYỂN TỪ LUỒNG 4 (answer_flash) -> LUỒNG 5 (result_summary: Đọc kết quả & Cập nhật chỗ ngồi ngay khi bắt đầu Luồng 5)
      // (Điểm số của các học sinh đã được cộng và hiển thị ở Luồng 4)
      // ============================================================================
      if (prev.phase === 'answer_flash') {
        const cWinners = prev.classWinners || [];
        const oWinners = prev.outsideWinners || [];

        // CẬP NHẬT CHỖ NGỒI NGAY KHI BẮT ĐẦU LUỒNG SỐ 5:
        // Loại học sinh trong lớp không trả lời / trả lời sai, đẩy học sinh Top Rank từ Hàng Chờ vào lớp, và thêm đợt NPC mới vào Hàng Chờ
        ensureResultSummaryPhaseSideEffects(
          prev.roundSeq || 1,
          prev.questionIndex,
          cWinners,
          oWinners
        );

        const classRightCount = cWinners.length;
        const outsideRightCount = oWinners.length;
        const fastestRawName =
          cWinners[0]?.username || oWinners[0]?.username || '';
        const fastestWinner = fastestRawName || 'chưa có bạn nào';
        const fastestLower = fastestRawName.trim().toLowerCase();

        // Xác định điều kiện câu nói Luồng 5 (normal, streak_2, streak_3, streak_5_plus, streak_broken)
        const tracker = topStreakTrackerRef.current;
        const prevFastestLower = tracker.flow5LastFastestUser;
        const prevFastestDisplay =
          tracker.flow5LastFastestDisplay || 'bạn dẫn đầu trước đó';
        const prevStreak = tracker.flow5Streak;

        let activeCond5:
          | 'normal'
          | 'streak_2'
          | 'streak_3'
          | 'streak_5_plus'
          | 'streak_broken' = 'normal';
        let currentFastestStreak = 0;

        if (fastestLower) {
          if (fastestLower === prevFastestLower) {
            currentFastestStreak = prevStreak + 1;
            tracker.flow5Streak = currentFastestStreak;
            tracker.flow5LastFastestDisplay = fastestRawName;
            if (currentFastestStreak >= 5) {
              activeCond5 = 'streak_5_plus';
            } else if (currentFastestStreak >= 3) {
              activeCond5 = 'streak_3';
            } else if (currentFastestStreak === 2) {
              activeCond5 = 'streak_2';
            } else {
              activeCond5 = 'normal';
            }
          } else {
            if (prevFastestLower && prevStreak >= 2) {
              activeCond5 = 'streak_broken';
            } else {
              activeCond5 = 'normal';
            }
            currentFastestStreak = 1;
            tracker.flow5LastFastestUser = fastestLower;
            tracker.flow5LastFastestDisplay = fastestRawName;
            tracker.flow5Streak = 1;
          }
        }

        const defaultResultTpl =
          classRightCount > 0 || outsideRightCount > 0
            ? 'Có [HọcKé] bạn học ké và [TrongLớp] bạn trong lớp trả lời đúng, chúc mừng bạn [Top1] trả lời nhanh nhất!'
            : 'Có 0 bạn học ké và 0 bạn trong lớp trả lời đúng, các em cố gắng ở câu hỏi tiếp theo nhé!';

        let chosenResultTpl = defaultResultTpl;
        if (classRightCount > 0 || outsideRightCount > 0) {
          const condGroup =
            cfg.lessonFlow5ConditionalTemplates?.[activeCond5]?.filter((s) =>
              Boolean(s && s.trim())
            ) || [];
          const normalGroup =
            cfg.lessonFlow5ConditionalTemplates?.normal?.filter((s) =>
              Boolean(s && s.trim())
            ) || [];
          const legacyPool =
            cfg.quizResultTtsTemplates?.filter((s) => Boolean(s && s.trim())) ||
            [];

          if (condGroup.length > 0) {
            chosenResultTpl =
              condGroup[Math.floor(Math.random() * condGroup.length)];
          } else if (normalGroup.length > 0) {
            chosenResultTpl =
              normalGroup[Math.floor(Math.random() * normalGroup.length)];
          } else if (legacyPool.length > 0) {
            chosenResultTpl =
              legacyPool[Math.floor(Math.random() * legacyPool.length)];
          } else {
            chosenResultTpl = cfg.quizResultTtsTemplate || defaultResultTpl;
          }
        }

        const summarySpeech = chosenResultTpl
          .replace(/\[HọcKé\]|\{outsideCount\}/gi, String(outsideRightCount))
          .replace(/\[TrongLớp\]|\{classCount\}/gi, String(classRightCount))
          .replace(
            /\[TổngĐúng\]/gi,
            String(classRightCount + outsideRightCount)
          )
          .replace(/\[Top1Lớp\]|\[Top1\]|\{fastestName\}/gi, fastestWinner)
          .replace(
            /\[Top1HọcKé\]/gi,
            oWinners[0]?.username || fastestWinner
          )
          .replace(/\[ChuỗiTop1\]|\[SốLầnLiênTiếp\]/gi, String(Math.max(1, currentFastestStreak)))
          .replace(/\[Top1Cũ\]|\[NgườiBịPhá\]/gi, prevFastestDisplay)
          .replace(/\[ChuỗiCũ\]/gi, String(Math.max(2, prevStreak)))
          .replace(/\[ĐápÁn\]|\{en\}/gi, curQuiz.en)
          .replace(/\[NghĩaViệt\]|\{vi\}/gi, curQuiz.vi);

        const flowToken5 = `flow_res_${Date.now()}_${prev.questionIndex}`;
        const flow5TtsItems =
          cfg.quizResultTtsEnabled ?? true
            ? [
                {
                  text: summarySpeech,
                  lang: 'vi' as const,
                  lessonFlowToken: flowToken5,
                  lessonStepLabel: 'Luồng 5: Đọc kết quả',
                },
              ]
            : [];
        const enqueued5 =
          flow5TtsItems.length > 0
            ? soundEngine.enqueueLessonFlowItems(flow5TtsItems, cfg)
            : false;

        const fallbackDur5 = enqueued5 ? 15000 : 3800;

        // Khóa camera vào bạn trả lời nhanh nhất TRONG LỚP trong 2s ngay khi mới vào Luồng 5
        if (flow5CameraLockTimerRef.current !== null) {
          window.clearTimeout(flow5CameraLockTimerRef.current);
          flow5CameraLockTimerRef.current = null;
        }
        flow5LockedStudentIdRef.current = null;

        const fastestClassLower = (cWinners[0]?.username || '')
          .trim()
          .toLowerCase();
        if (fastestClassLower && !zombieEventStateRef.current.isActive) {
          const fastestClassTarget = pilgrimsRef.current.find(
            (p) =>
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit' &&
              p.username.trim().toLowerCase() === fastestClassLower
          );
          if (fastestClassTarget) {
            const nowCam = Date.now();
            const zoomDurationMs = 2000;
            flow5LockedStudentIdRef.current = fastestClassTarget.id;
            setCameraFocus((prevCam) => {
              if (prevCam.lockedUntil && nowCam < prevCam.lockedUntil) {
                return prevCam;
              }
              return {
                pilgrimId: fastestClassTarget.id,
                focusRole: null,
                username: fastestClassTarget.username,
                reason: 'comment',
                isBot: fastestClassTarget.isBot,
                startedAt: nowCam,
                until: nowCam + zoomDurationMs,
                lockedUntil: undefined,
              };
            });

            flow5CameraLockTimerRef.current = window.setTimeout(() => {
              flow5CameraLockTimerRef.current = null;
              if (flow5LockedStudentIdRef.current === fastestClassTarget.id) {
                flow5LockedStudentIdRef.current = null;
              }
              setCameraFocus((prevCam) =>
                prevCam.pilgrimId === fastestClassTarget.id &&
                !prevCam.lockedUntil
                  ? { pilgrimId: null, focusRole: null, until: 0 }
                  : prevCam
              );
            }, zoomDurationMs);
          }
        }

        const resultSummaryState: ClassBoardRuntimeState = {
          ...prev,
          phase: 'result_summary',
          lessonStepNumber: 5,
          activeFlowToken: flowToken5,
          ttsFinishedForPhase: !enqueued5,
          elapsedPhaseMs: 0,
          timeLeftMs: fallbackDur5,
          totalDurationMs: fallbackDur5,
          phaseEndAt: Date.now() + fallbackDur5,
          showResultEngine: true,
          seatUpdateTriggered: true,
          totalQuestions: quizList.length,
          currentQuestion: curQuiz,
        };
        classBoardStateRef.current = resultSummaryState;
        setClassBoardState(resultSummaryState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: resultSummaryState,
          lessonTtsItems: flow5TtsItems,
        });
        return;
      }

      // ============================================================================
      // CHUYỂN TỪ LUỒNG 5 (result_summary) -> LUỒNG KẾT THÚC (round_end ở câu 15) HOẶC LUỒNG 6 (ranking_board ở câu 1..14)
      // ============================================================================
      if (prev.phase === 'result_summary') {
        if (flow5CameraLockTimerRef.current !== null) {
          window.clearTimeout(flow5CameraLockTimerRef.current);
          flow5CameraLockTimerRef.current = null;
        }
        if (flow5LockedStudentIdRef.current !== null) {
          const lockedTop1Id = flow5LockedStudentIdRef.current;
          flow5LockedStudentIdRef.current = null;
          setCameraFocus((prevCam) =>
            prevCam.pilgrimId === lockedTop1Id && !prevCam.lockedUntil
              ? { pilgrimId: null, focusRole: null, until: 0 }
              : prevCam
          );
        }

        const donorPtsMap = new Map<string, number>();
        lotusDonorsRef.current.forEach((d) => {
          if (d.username) {
            donorPtsMap.set(d.username.trim().toLowerCase(), d.coins || 0);
          }
        });

        // Tập hợp và xếp hạng toàn bộ học sinh đang ở trong lớp
        const activeClassStudents: Array<{
          pilgrimId: number;
          username: string;
          points: number;
          avatarUrl?: string | null;
          avatarColor?: string;
        }> = [];
        for (const p of pilgrimsRef.current) {
          if (
            p.state === 'leave_side_to_aisle' ||
            p.state === 'leave_down_exit' ||
            !p.username
          ) {
            continue;
          }
          const key = p.username.trim().toLowerCase();
          const pts = Math.max(
            donorPtsMap.get(key) ?? 0,
            p.currentScoreDisplay ?? 0
          );
          activeClassStudents.push({
            pilgrimId: p.id,
            username: p.username,
            points: pts,
            avatarUrl: p.avatarUrl,
            avatarColor: p.avatarColor,
          });
        }
        activeClassStudents.sort((a, b) => b.points - a.points);

        const currentRoundQuestionNum = (prev.roundQuestionIndex ?? 0) + 1;
        const isFinalQuestionOfRound =
          currentRoundQuestionNum >= QUESTIONS_PER_ROUND;

        // NẾU ĐÂY LÀ CÂU CUỐI CÙNG (CÂU 15): CHÈN "LUỒNG KẾT THÚC" (round_end) THAY CHO LUỒNG 6
        if (isFinalQuestionOfRound) {
          const top1Entry = activeClassStudents[0] || {
            pilgrimId: 0,
            username: prev.classWinners?.[0]?.username || 'Học Sinh Top 1',
            points: prev.classWinners?.[0]?.points || 10,
          };
          const top2Entry = activeClassStudents[1] || {
            pilgrimId: 0,
            username: prev.classWinners?.[1]?.username || 'Học Sinh Top 2',
            points: prev.classWinners?.[1]?.points || 8,
          };
          const top3Entry = activeClassStudents[2] || {
            pilgrimId: 0,
            username: prev.classWinners?.[2]?.username || 'Học Sinh Top 3',
            points: prev.classWinners?.[2]?.points || 7,
          };

          const podiumWinnersList: Array<{
            rank: 1 | 2 | 3;
            username: string;
            points: number;
            avatarUrl?: string | null;
            avatarColor?: string;
            pilgrimId?: number;
          }> = [
            {
              rank: 1,
              username: top1Entry.username,
              points: top1Entry.points,
              avatarUrl: top1Entry.avatarUrl,
              avatarColor: top1Entry.avatarColor,
              pilgrimId: top1Entry.pilgrimId || undefined,
            },
            {
              rank: 2,
              username: top2Entry.username,
              points: top2Entry.points,
              avatarUrl: top2Entry.avatarUrl,
              avatarColor: top2Entry.avatarColor,
              pilgrimId: top2Entry.pilgrimId || undefined,
            },
            {
              rank: 3,
              username: top3Entry.username,
              points: top3Entry.points,
              avatarUrl: top3Entry.avatarUrl,
              avatarColor: top3Entry.avatarColor,
              pilgrimId: top3Entry.pilgrimId || undefined,
            },
          ];

          roundEndWinnersRef.current = podiumWinnersList;
          roundEndMilkTeaTriggeredRef.current = false;

          // Cho 3 bạn chiến thắng bước lên bục giảng theo đúng 5 vị trí phạt (lấy vị trí P1, P3, P5: Top 2 đứng P1, Top 1 đứng P3, Top 3 đứng P5)
          const lineCenter = cfg.punishmentLinePos || { x: 270, y: 458 };
          const lineSpacing = Math.max(24, cfg.punishmentLineSpacing || 52);
          const podiumSpotByRank: Record<1 | 2 | 3, number> = {
            1: 2, // P3
            2: 0, // P1
            3: 4, // P5
          };
          const winnerRankByLower = new Map<string, 1 | 2 | 3>();
          podiumWinnersList.forEach((w) => {
            winnerRankByLower.set(w.username.trim().toLowerCase(), w.rank);
          });

          const nextPilgrimsForPodium = pilgrimsRef.current.map((p) => {
            const rank = winnerRankByLower.get(p.username.trim().toLowerCase());
            if (
              !rank ||
              p.state === 'leave_side_to_aisle' ||
              p.state === 'leave_down_exit'
            ) {
              return p;
            }
            const spotIdx = podiumSpotByRank[rank];
            const spotX = Math.max(
              36,
              Math.min(
                504,
                Math.round(lineCenter.x + (spotIdx - 2) * lineSpacing)
              )
            );
            return {
              ...p,
              state: 'walk_to_punishment_spot' as const,
              stateTimer: 0,
              podiumRank: rank,
              winnerMilkTeaScale: undefined,
              isPunishedInCurrentRound: false,
              punishmentMultiplier: undefined,
              punishmentSpotIndex: spotIdx,
              punishmentSpotPos: { x: spotX, y: lineCenter.y },
            };
          });
          pilgrimsRef.current = nextPilgrimsForPodium;
          setPilgrims(nextPilgrimsForPodium);

          const rawRoundEndTpl =
            (cfg.lessonRoundEndTtsTemplate || '').trim() ||
            'Bài kiểm tra kết thúc, cô mời các bạn chiến thắng bước lên bục giảng. Chúc mừng bạn [top1] đạt top 1 với [Điểm top 1] điểm, bạn [top2] đạt top 2 với [Điểm top 2] điểm, bạn [top3] đạt top 3 với [Điểm top 3] điểm. Tặng 3 bạn 3 ly trà sữa mat cha lat te phun tóp ping, mấy cưng ở dưới vỗ tay nào !';

          const replaceRoundEndPlaceholders = (str: string) =>
            str
              .replace(/\[top1\]|\[Top1\]|\[Top1Rank\]|\{top1\}/gi, top1Entry.username)
              .replace(
                /\[Điểm top 1\]|\[ĐiểmTop1\]|\[점top1\]|\{score1\}/gi,
                String(top1Entry.points)
              )
              .replace(/\[top2\]|\[Top2\]|\[Top2Rank\]|\{top2\}/gi, top2Entry.username)
              .replace(
                /\[Điểm top 2\]|\[ĐiểmTop2\]|\{score2\}/gi,
                String(top2Entry.points)
              )
              .replace(/\[top3\]|\[Top3\]|\[Top3Rank\]|\{top3\}/gi, top3Entry.username)
              .replace(
                /\[Điểm top 3\]|\[ĐiểmTop3\]|\{score3\}/gi,
                String(top3Entry.points)
              );

          const fullRoundEndSpeech = replaceRoundEndPlaceholders(rawRoundEndTpl);
          const flowTokenRoundEnd = `flow_round_end_${Date.now()}_${prev.roundSeq || 1}`;

          // Tách câu đọc thành các vế đồng bộ sự kiện:
          // Vế 1 (Mời lên bục) -> Vế 2 (Đọc tên Top 1: Khóa cam Top 1) -> Vế 3 (Đọc tên Top 2: Khóa cam Top 2) -> Vế 4 (Đọc tên Top 3: Khóa cam Top 3) -> Vế 5 (Tặng trà sữa 100%/150%/200% & Vỗ tay)
          const idxTop1 = rawRoundEndTpl.search(/Chúc mừng|\[top1\]|\[Top1\]/i);
          const idxTop2 = rawRoundEndTpl.search(/bạn\s*\[top2\]|\[top2\]|\[Top2\]/i);
          const idxTop3 = rawRoundEndTpl.search(/bạn\s*\[top3\]|\[top3\]|\[Top3\]/i);
          const idxMilkTea = rawRoundEndTpl.search(/Tặng|trà sữa/i);

          let roundEndTtsItems: Array<{
            text: string;
            lang: 'vi';
            lessonFlowToken?: string;
            lessonStepLabel: string;
          }> = [];

          if (
            idxTop1 > 0 &&
            idxTop2 > idxTop1 &&
            idxTop3 > idxTop2 &&
            idxMilkTea > idxTop3
          ) {
            const pIntro = replaceRoundEndPlaceholders(
              rawRoundEndTpl.slice(0, idxTop1).trim()
            );
            const pTop1 = replaceRoundEndPlaceholders(
              rawRoundEndTpl.slice(idxTop1, idxTop2).replace(/[,;]\s*$/, '').trim()
            );
            const pTop2 = replaceRoundEndPlaceholders(
              rawRoundEndTpl.slice(idxTop2, idxTop3).replace(/[,;]\s*$/, '').trim()
            );
            const pTop3 = replaceRoundEndPlaceholders(
              rawRoundEndTpl.slice(idxTop3, idxMilkTea).replace(/[,;]\s*$/, '').trim()
            );
            const pTea = replaceRoundEndPlaceholders(
              rawRoundEndTpl.slice(idxMilkTea).trim()
            );

            if (pIntro) {
              roundEndTtsItems.push({
                text: pIntro,
                lang: 'vi',
                lessonStepLabel: 'Luồng Kết Thúc: Mời lên bục giảng',
              });
            }
            if (pTop1) {
              roundEndTtsItems.push({
                text: pTop1,
                lang: 'vi',
                lessonStepLabel: 'Luồng Kết Thúc: Top 1',
              });
            }
            if (pTop2) {
              roundEndTtsItems.push({
                text: pTop2,
                lang: 'vi',
                lessonStepLabel: 'Luồng Kết Thúc: Top 2',
              });
            }
            if (pTop3) {
              roundEndTtsItems.push({
                text: pTop3,
                lang: 'vi',
                lessonStepLabel: 'Luồng Kết Thúc: Top 3',
              });
            }
            if (pTea) {
              roundEndTtsItems.push({
                text: pTea,
                lang: 'vi',
                lessonFlowToken: flowTokenRoundEnd,
                lessonStepLabel: 'Luồng Kết Thúc: Trà Sữa & Vỗ Tay',
              });
            }
          } else {
            roundEndTtsItems = [
              {
                text: fullRoundEndSpeech,
                lang: 'vi',
                lessonFlowToken: flowTokenRoundEnd,
                lessonStepLabel: 'Luồng Kết Thúc: Tổng kết 3 Top',
              },
            ];
          }

          const enqueuedRoundEnd = soundEngine.enqueueLessonFlowItems(
            roundEndTtsItems,
            cfg
          );

          // Nếu tắt tiếng TTS (hoặc dùng mẫu câu gộp 1 vế), vẫn tự động kích hoạt tuần tự khóa camera Top 1 -> Top 2 -> Top 3 -> Phát trà sữa -> Vỗ tay!
          if (!enqueuedRoundEnd || roundEndTtsItems.length === 1) {
            window.setTimeout(() => {
              const p1 = pilgrimsRef.current.find(
                (p) => p.id === top1Entry.pilgrimId
              );
              if (p1) {
                setCameraFocus({
                  pilgrimId: p1.id,
                  focusRole: null,
                  username: p1.username,
                  reason: 'comment',
                  isBot: p1.isBot,
                  startedAt: Date.now(),
                  until: Date.now() + 1800,
                  lockedUntil: Date.now() + 1800,
                });
              }
            }, 1500);
            window.setTimeout(() => {
              const p2 = pilgrimsRef.current.find(
                (p) => p.id === top2Entry.pilgrimId
              );
              if (p2) {
                setCameraFocus({
                  pilgrimId: p2.id,
                  focusRole: null,
                  username: p2.username,
                  reason: 'comment',
                  isBot: p2.isBot,
                  startedAt: Date.now(),
                  until: Date.now() + 1800,
                  lockedUntil: Date.now() + 1800,
                });
              }
            }, 3400);
            window.setTimeout(() => {
              const p3 = pilgrimsRef.current.find(
                (p) => p.id === top3Entry.pilgrimId
              );
              if (p3) {
                setCameraFocus({
                  pilgrimId: p3.id,
                  focusRole: null,
                  username: p3.username,
                  reason: 'comment',
                  isBot: p3.isBot,
                  startedAt: Date.now(),
                  until: Date.now() + 1800,
                  lockedUntil: Date.now() + 1800,
                });
              }
            }, 5200);
            window.setTimeout(() => {
              setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
              triggerRoundEndMilkTeaRef.current();
              if (!enqueuedRoundEnd) {
                soundEngine.playApplauseSfx(cfg.ttsVolume || 1, 3400);
              }
            }, 7000);
          }

          const fallbackDurRoundEnd = enqueuedRoundEnd ? 32000 : 11000;
          const roundEndState: ClassBoardRuntimeState = {
            ...prev,
            phase: 'round_end',
            lessonStepNumber: 6,
            activeFlowToken: flowTokenRoundEnd,
            ttsFinishedForPhase: !enqueuedRoundEnd,
            elapsedPhaseMs: 0,
            timeLeftMs: fallbackDurRoundEnd,
            totalDurationMs: fallbackDurRoundEnd,
            phaseEndAt: Date.now() + fallbackDurRoundEnd,
            showResultEngine: true,
            seatUpdateTriggered: true,
            roundEndNoticeText: fullRoundEndSpeech,
            podiumWinners: podiumWinnersList,
            totalQuestions: QUESTIONS_PER_ROUND,
            currentQuestion: curQuiz,
          };
          classBoardStateRef.current = roundEndState;
          setClassBoardState(roundEndState);
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
            state: roundEndState,
            lessonTtsItems: roundEndTtsItems,
          });
          return;
        }

        // CÂU 1..14: CHẠY LUỒNG 6 (ranking_board) NHƯ BÌNH THƯỜNG
        let top1Name = activeClassStudents[0]?.username || '';
        let top1Pts = activeClassStudents[0]?.points ?? -1;

        const cWinners = prev.classWinners || [];
        if (top1Pts <= 0 && cWinners.length > 0) {
          top1Name = cWinners[0].username;
          top1Pts =
            donorPtsMap.get(top1Name.trim().toLowerCase()) ||
            cWinners[0].points ||
            10;
        }

        const tracker = topStreakTrackerRef.current;
        const top1Lower = (top1Name || '').trim().toLowerCase();
        let activeCond6:
          | 'normal'
          | 'top1_3'
          | 'top1_5'
          | 'top1_10'
          | 'top1_20'
          | 'top1_30_plus' = 'normal';
        let rankStreak = 0;

        if (top1Lower && top1Pts > 0) {
          if (top1Lower === tracker.flow6LastTop1User) {
            rankStreak = tracker.flow6Streak + 1;
          } else {
            rankStreak = 1;
            tracker.flow6LastTop1User = top1Lower;
          }
          tracker.flow6Streak = rankStreak;

          if (rankStreak >= 30) {
            activeCond6 = 'top1_30_plus';
          } else if (rankStreak >= 20) {
            activeCond6 = 'top1_20';
          } else if (rankStreak >= 10) {
            activeCond6 = 'top1_10';
          } else if (rankStreak >= 5) {
            activeCond6 = 'top1_5';
          } else if (rankStreak >= 3) {
            activeCond6 = 'top1_3';
          } else {
            activeCond6 = 'normal';
          }
        }

        const defaultRankingTpl =
          cfg.lessonRankingTtsTemplate ||
          'Top 1 bảng xếp hạng là bạn [Top1Rank] với [ĐiểmTop1] điểm, chúng ta đến với câu hỏi tiếp theo nhé!';

        let chosenRankingTpl = defaultRankingTpl;
        const condGroup6 =
          cfg.lessonFlow6ConditionalTemplates?.[activeCond6]?.filter((s) =>
            Boolean(s && s.trim())
          ) || [];
        const normalGroup6 =
          cfg.lessonFlow6ConditionalTemplates?.normal?.filter((s) =>
            Boolean(s && s.trim())
          ) || [];

        if (condGroup6.length > 0) {
          chosenRankingTpl =
            condGroup6[Math.floor(Math.random() * condGroup6.length)];
        } else if (normalGroup6.length > 0) {
          chosenRankingTpl =
            normalGroup6[Math.floor(Math.random() * normalGroup6.length)];
        }

        const rankingSpeech =
          top1Name && top1Pts > 0
            ? chosenRankingTpl
                .replace(/\[Top1Rank\]|\[Top1BXH\]|\[Top1\]|\{top1Name\}/gi, top1Name)
                .replace(/\[ĐiểmTop1\]|\[Điểm\]|\{top1Points\}/gi, String(top1Pts))
                .replace(/\[ChuỗiTop1Rank\]|\[ChuỗiTop1\]/gi, String(Math.max(1, rankStreak)))
            : 'Bảng xếp hạng trong lớp đang rất gay cấn, chúng ta đến với câu hỏi tiếp theo nhé!';

        const flowToken6 = `flow_rank_${Date.now()}_${prev.questionIndex}`;
        const flow6TtsItems = [
          {
            text: rankingSpeech,
            lang: 'vi' as const,
            lessonFlowToken: flowToken6,
            lessonStepLabel: 'Luồng 6: Đọc bảng xếp hạng',
          },
        ];
        const enqueued6 = soundEngine.enqueueLessonFlowItems(
          flow6TtsItems,
          cfg
        );

        const fallbackDur6 = enqueued6 ? 16000 : 5000;
        const rankingBoardState: ClassBoardRuntimeState = {
          ...prev,
          phase: 'ranking_board',
          lessonStepNumber: 6,
          activeFlowToken: flowToken6,
          ttsFinishedForPhase: !enqueued6,
          elapsedPhaseMs: 0,
          timeLeftMs: fallbackDur6,
          totalDurationMs: fallbackDur6,
          phaseEndAt: Date.now() + fallbackDur6,
          showResultEngine: true,
          seatUpdateTriggered: true,
          totalQuestions: QUESTIONS_PER_ROUND,
          currentQuestion: curQuiz,
        };
        classBoardStateRef.current = rankingBoardState;
        setClassBoardState(rankingBoardState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: rankingBoardState,
          lessonTtsItems: flow6TtsItems,
        });
        return;
      }

      // ============================================================================
      // SAU KHI KẾT THÚC "LUỒNG KẾT THÚC" (round_end) Ở CÂU 15:
      // - Reset toàn bộ điểm của tất cả học sinh (trong lớp & ngoài hàng chờ) về 0
      // - Giữ nguyên vị trí ngồi trong lớp và ngoài lớp (3 bạn trên bục giảng đi bộ về lại ghế của mình)
      // - Khởi tạo bộ 15 câu hỏi mới với độ khó tăng dần và bắt đầu vòng mới từ Luồng 0 (lesson_start)!
      // ============================================================================
      if (prev.phase === 'round_end') {
        if (roundEndApplauseTimerRef.current !== null) {
          window.clearTimeout(roundEndApplauseTimerRef.current);
          roundEndApplauseTimerRef.current = null;
        }
        setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });

        // 1. Reset toàn bộ điểm trong lớp (lotusDonors) và ngoài Hàng Chờ (waitingPoolRef)
        lotusDonorsRef.current = [];
        setLotusDonors([]);
        recomputeWaitingQueueLazy({ resetAllRoundScores: true });

        // 2. Giữ nguyên vị trí ngồi trong lớp (cho 3 bạn trên bục giảng đi về lại ghế ngồi, xóa ly trà sữa & reset hiển thị điểm về 0)
        const resetForNewRoundPilgrims = pilgrimsRef.current.map((p) => {
          const wasOnPodium =
            Boolean(p.podiumRank) ||
            p.state === 'stand_punishment' ||
            p.state === 'walk_to_punishment_spot';
          return {
            ...p,
            currentScoreDisplay: 0,
            scoreChangeDelta: 0,
            scoreCardUntil: 0,
            correctStreak: 0,
            answeredCurrentQuestion: false,
            quizResultStatus: null,
            quizResultUntil: 0,
            quizEarnedPoints: 0,
            podiumRank: undefined,
            winnerMilkTeaScale: undefined,
            isPunishedInCurrentRound: false,
            punishmentMultiplier: undefined,
            punishmentSpotPos: undefined,
            punishmentSpotIndex: undefined,
            state:
              wasOnPodium && p.slotId
                ? ('return_from_punishment_to_seat' as const)
                : p.state,
            stateTimer: wasOnPodium ? 0 : p.stateTimer,
          };
        });
        pilgrimsRef.current = resetForNewRoundPilgrims;
        setPilgrims(resetForNewRoundPilgrims);

        // 3. Tạo bộ 15 câu hỏi mới với độ khó tăng dần và sang game mới (về Luồng 0: lesson_start)
        const { nextQuizList: newRoundQuizList, nextQuiz: firstNewQuiz } =
          consumeCurrentAndGetNextQuizQueue(
            cfg,
            prev.questionIndex,
            prev.currentQuestion,
            true
          );
        const nextRoundSeq = (prev.roundSeq || 1) + 1;
        configRef.current = {
          ...configRef.current,
          customQuizQuestions: newRoundQuizList,
        };
        setConfig((prevCfg) => ({
          ...prevCfg,
          customQuizQuestions: newRoundQuizList,
        }));

        const startSpeechNewRound =
          cfg.lessonStartTtsText ||
          'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 15 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.';
        const flowTokenStartNew = `flow_start_${Date.now()}_${nextRoundSeq}`;
        const startTtsItemsNew = [
          {
            text: startSpeechNewRound,
            lang: 'vi' as const,
            lessonFlowToken: flowTokenStartNew,
            lessonStepLabel: 'Luồng 0: Bắt đầu vòng kiểm tra 15 câu mới',
          },
        ];

        soundEngine.playBell(cfg.ttsVolume * 0.65);
        const enqueuedStartNew = soundEngine.enqueueLessonFlowItems(
          startTtsItemsNew,
          cfg
        );
        const dur0New = enqueuedStartNew ? 16000 : 3500;

        const newRoundStartState: ClassBoardRuntimeState = {
          ...prev,
          engine: 'english_quiz',
          isRunning: true,
          roundSeq: nextRoundSeq,
          roundQuestionIndex: 0,
          questionIndex: 0,
          totalQuestions: QUESTIONS_PER_ROUND,
          currentQuestion: firstNewQuiz,
          phase: 'lesson_start',
          lessonStepNumber: 0,
          lessonStartText: startSpeechNewRound,
          roundEndNoticeText: undefined,
          podiumWinners: undefined,
          activeFlowToken: flowTokenStartNew,
          ttsFinishedForPhase: !enqueuedStartNew,
          idleChatTriggered: false,
          elapsedPhaseMs: 0,
          timeLeftMs: dur0New,
          totalDurationMs: dur0New,
          phaseEndAt: Date.now() + dur0New,
          winners: [],
          classWinners: [],
          outsideWinners: [],
          showResultEngine: false,
          seatUpdateTriggered: false,
        };
        classBoardStateRef.current = newRoundStartState;
        setClassBoardState(newRoundStartState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: newRoundStartState,
          customQuizQuestions: newRoundQuizList,
          lessonTtsItems: startTtsItemsNew,
          force: true,
        });
        return;
      }

      // ============================================================================
      // SAU LUỒNG 6 (ranking_board):
      // 1. KIỂM TRA LUỒNG KỶ LỤC ('record_notice') NẾU TOP 1 KỶ LỤC HÔM NAY THAY ĐỔI
      // 2. KIỂM TRA CÓ AI TẶNG QUÀ PHẠT ĐẶC BIỆT (5 / 10 / 10+) KHÔNG ('punishment_notice')
      // ============================================================================
      if (prev.phase === 'ranking_board' || prev.phase === 'reveal') {
        ensureResultSummaryPhaseSideEffects(
          prev.roundSeq || 1,
          prev.questionIndex,
          prev.classWinners || [],
          prev.outsideWinners || []
        );

        const currentTop1Rec = dailyRecordsRef.current[0];
        const rawPending = pendingRecordNoticeRef.current;
        const pendingLower = rawPending
          ? rawPending.username.trim().toLowerCase()
          : '';
        const top1SeatedStudent = pendingLower
          ? pilgrimsRef.current.find(
              (p) =>
                Boolean(p.slotId) &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit' &&
                p.username.trim().toLowerCase() === pendingLower
            )
          : undefined;
        const isStillTop1AndChanged =
          Boolean(rawPending) &&
          Boolean(top1SeatedStudent) &&
          Boolean(currentTop1Rec) &&
          currentTop1Rec.username.trim().toLowerCase() === pendingLower &&
          pendingLower !== lastPraisedRecordTop1Ref.current;

        const pendingRec =
          isStillTop1AndChanged && rawPending
            ? {
                ...rawPending,
                points: currentTop1Rec.points,
              }
            : null;
        if (!isStillTop1AndChanged) {
          pendingRecordNoticeRef.current = null;
        }

        if (
          pendingRec &&
          top1SeatedStudent &&
          cfg.lessonRecordFlowEnabled !== false
        ) {
          pendingRecordNoticeRef.current = null;
          lastPraisedRecordTop1Ref.current = pendingRec.username
            .trim()
            .toLowerCase();

          const recTemplates = Array.isArray(cfg.lessonRecordTtsTemplates)
            ? cfg.lessonRecordTtsTemplates
                .map((s) => (s || '').trim())
                .filter(Boolean)
            : [];
          const chosenRecTpl =
            recTemplates.length > 0
              ? recTemplates[Math.floor(Math.random() * recTemplates.length)]
              : cfg.lessonRecordTtsTemplate ||
                'Chúc mừng bạn [Top1KỷLục] đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục hôm nay với [ĐiểmKỷLục] điểm!';

          const recordSpeech = chosenRecTpl
            .replace(/\[Top1KỷLục\]|\[Tên\]|\[Top1\]/gi, pendingRec.username)
            .replace(/\[ĐiểmKỷLục\]|\[Điểm\]/gi, String(pendingRec.points))
            .replace(
              /\[KỷLụcCũ\]/gi,
              pendingRec.previousTop1Username || 'bảng vàng'
            );

          setMonks((prevMonks) =>
            prevMonks.map((m) =>
              m.role === 'abbot'
                ? {
                    ...m,
                    monkBubbleText: `🏆 ${recordSpeech}`,
                    monkBubbleUntil: Date.now() + 6500,
                  }
                : m
            )
          );

          const flowTokenRecord = `flow_record_${Date.now()}_${prev.questionIndex}`;
          const recordTtsItems = [
            {
              text: recordSpeech,
              lang: 'vi' as const,
              lessonFlowToken: flowTokenRecord,
              lessonStepLabel: 'Luồng Kỷ Lục: Vinh danh Top 1 Kỷ Lục mới',
            },
          ];
          const enqueuedRecord = soundEngine.enqueueLessonFlowItems(
            recordTtsItems,
            cfg
          );

          const fallbackDurRecord = enqueuedRecord ? 15000 : 4500;
          const nowRecordMs = Date.now();
          setCameraFocus({
            pilgrimId: top1SeatedStudent.id,
            focusRole: null,
            username: top1SeatedStudent.username,
            reason: 'special_gift',
            isBot: top1SeatedStudent.isBot,
            startedAt: nowRecordMs,
            until: nowRecordMs + fallbackDurRecord,
            lockedUntil: nowRecordMs + fallbackDurRecord,
          });

          const recordNoticeState: ClassBoardRuntimeState = {
            ...prev,
            phase: 'record_notice',
            lessonStepNumber: 6,
            activeFlowToken: flowTokenRecord,
            ttsFinishedForPhase: !enqueuedRecord,
            elapsedPhaseMs: 0,
            timeLeftMs: fallbackDurRecord,
            totalDurationMs: fallbackDurRecord,
            phaseEndAt: Date.now() + fallbackDurRecord,
            showResultEngine: false,
            seatUpdateTriggered: true,
            recordNoticeText: recordSpeech,
            recordBreaker: pendingRec,
            totalQuestions: QUESTIONS_PER_ROUND,
            currentQuestion: curQuiz,
          };
          classBoardStateRef.current = recordNoticeState;
          setClassBoardState(recordNoticeState);
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
            state: recordNoticeState,
            lessonTtsItems: recordTtsItems,
          });
          return;
        }
      }

      if (
        prev.phase === 'ranking_board' ||
        prev.phase === 'reveal' ||
        prev.phase === 'record_notice'
      ) {
        const activeClassMap = new Map<string, PilgrimData>();
        for (const p of pilgrimsRef.current) {
          if (
            p.slotId &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
          ) {
            activeClassMap.set(p.username.trim().toLowerCase(), p);
          }
        }

        const inClassPunishCandidates: Array<{
          username: string;
          multiplier: 3 | 6 | 9;
          addedAt: number;
        }> = [];
        const deferredOutsideCandidates: Array<{
          username: string;
          multiplier: 3 | 6 | 9;
          addedAt: number;
        }> = [];

        for (const item of punishmentWaitingQueueRef.current) {
          const lower = item.username.trim().toLowerCase();
          const matchedPilgrim = activeClassMap.get(lower);
          if (matchedPilgrim) {
            inClassPunishCandidates.push({
              username: matchedPilgrim.username,
              multiplier: item.multiplier,
              addedAt: item.addedAt,
            });
          } else if (waitingPoolRef.current.has(lower)) {
            deferredOutsideCandidates.push(item);
          }
        }

        if (inClassPunishCandidates.length > 0) {
          const batchToPunish = inClassPunishCandidates.slice(0, 5);
          const remainingInClass = inClassPunishCandidates.slice(5);
          punishmentWaitingQueueRef.current = [
            ...remainingInClass,
            ...deferredOutsideCandidates,
          ];

          const lineCenter = cfg.punishmentLinePos || { x: 270, y: 458 };
          const lineSpacing = Math.max(24, cfg.punishmentLineSpacing || 52);
          const spotIndicesByCount: Record<number, number[]> = {
            1: [2],
            2: [1, 3],
            3: [1, 2, 3],
            4: [0, 1, 3, 4],
            5: [0, 1, 2, 3, 4],
          };
          const assignedSpotIndices =
            spotIndicesByCount[batchToPunish.length] || [0, 1, 2, 3, 4];

          const punishMap = new Map<
            string,
            { multiplier: 3 | 6 | 9; spotIdx: number; spotPos: Point2D }
          >();
          batchToPunish.forEach((item, idx) => {
            const spotIdx = assignedSpotIndices[idx] ?? idx;
            const spotX = Math.max(
              36,
              Math.min(504, Math.round(lineCenter.x + (spotIdx - 2) * lineSpacing))
            );
            const spotY = Math.max(360, Math.min(820, Math.round(lineCenter.y)));
            punishMap.set(item.username.trim().toLowerCase(), {
              multiplier: item.multiplier,
              spotIdx,
              spotPos: { x: spotX, y: spotY },
            });
          });

          const nextPilgrims = pilgrimsRef.current.map((p) => {
            const info = punishMap.get(p.username.trim().toLowerCase());
            if (
              !info ||
              !p.slotId ||
              p.state === 'leave_side_to_aisle' ||
              p.state === 'leave_down_exit'
            ) {
              return p;
            }
            return {
              ...p,
              state: 'walk_to_punishment_spot' as const,
              stateTimer: 0,
              punishmentMultiplier: info.multiplier,
              punishmentSpotIndex: info.spotIdx,
              punishmentSpotPos: info.spotPos,
              isPunishedInCurrentRound: true,
            };
          });
          pilgrimsRef.current = nextPilgrims;
          setPilgrims(nextPilgrims);

          const singleTpl =
            cfg.lessonPunishmentSingleTtsTemplate ||
            'Mời bạn [Tên] mới quậy trong lớp lên đây đứng 1 lượt!';
          const multiTpl =
            cfg.lessonPunishmentMultiTtsTemplate ||
            'Mời các bạn [DanhSáchTên] mới quậy trong lớp lên đây đứng 1 lượt!';

          const punishSpeech =
            batchToPunish.length === 1
              ? singleTpl.replace(
                  /\[Tên\]|\[DanhSáchTên\]/gi,
                  batchToPunish[0].username
                )
              : multiTpl.replace(
                  /\[DanhSáchTên\]|\[Tên\]/gi,
                  batchToPunish.map((b) => b.username).join(', ')
                );

          const flowTokenPunish = `flow_punish_${Date.now()}_${prev.questionIndex}`;
          const punishTtsItems = [
            {
              text: punishSpeech,
              lang: 'vi' as const,
              lessonFlowToken: flowTokenPunish,
              lessonStepLabel: 'Luồng Phạt: Gọi lên bảng đứng phạt',
            },
          ];
          const enqueuedPunish = soundEngine.enqueueLessonFlowItems(
            punishTtsItems,
            cfg
          );

          const fallbackDurPunish = enqueuedPunish ? 15000 : 4200;
          const punishNoticeState: ClassBoardRuntimeState = {
            ...prev,
            phase: 'punishment_notice',
            lessonStepNumber: 6,
            activeFlowToken: flowTokenPunish,
            ttsFinishedForPhase: !enqueuedPunish,
            elapsedPhaseMs: 0,
            timeLeftMs: fallbackDurPunish,
            totalDurationMs: fallbackDurPunish,
            phaseEndAt: Date.now() + fallbackDurPunish,
            showResultEngine: false,
            seatUpdateTriggered: true,
            punishmentNoticeText: punishSpeech,
            punishedStudents: batchToPunish,
            totalQuestions: QUESTIONS_PER_ROUND,
            currentQuestion: curQuiz,
          };
          classBoardStateRef.current = punishNoticeState;
          setClassBoardState(punishNoticeState);
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
            state: punishNoticeState,
            lessonTtsItems: punishTtsItems,
          });
          return;
        }
      }

      // Qua câu hỏi tiếp theo trong vòng 15 câu (Câu 2..15):
      const nextRoundQuestionIdx = Math.min(
        QUESTIONS_PER_ROUND - 1,
        (prev.roundQuestionIndex ?? 0) + 1
      );
      const { nextQuizList, nextQuiz } = consumeCurrentAndGetNextQuizQueue(
        cfg,
        prev.questionIndex,
        prev.currentQuestion
      );
      const nextIdx = 0;
      const nextRoundSeq = (prev.roundSeq || 1) + 1;
      configRef.current = {
        ...configRef.current,
        customQuizQuestions: nextQuizList,
      };
      setConfig((prevCfg) => ({
        ...prevCfg,
        customQuizQuestions: nextQuizList,
      }));
      const prepDurMs = Math.max(1, cfg.lessonPrepareDurationSec || 3) * 1000;

      const resetPilgrims = pilgrimsRef.current.map((p) => ({
        ...p,
        answeredCurrentQuestion: false,
        quizResultStatus: null,
        quizResultUntil: 0,
        quizEarnedPoints: 0,
      }));
      pilgrimsRef.current = resetPilgrims;
      setPilgrims(resetPilgrims);

      if (
        zombieEventStateRef.current.isQueued &&
        cfg.zombieEventEnabled !== false
      ) {
        const pausedForEventState: ClassBoardRuntimeState = {
          ...prev,
          isRunning: false,
          roundSeq: nextRoundSeq,
          roundQuestionIndex: nextRoundQuestionIdx,
          questionIndex: nextIdx,
          totalQuestions: QUESTIONS_PER_ROUND,
          currentQuestion: nextQuiz,
          phase: 'preparing',
          lessonStepNumber: 1,
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          elapsedPhaseMs: 0,
          timeLeftMs: prepDurMs,
          totalDurationMs: prepDurMs,
          winners: [],
          classWinners: [],
          outsideWinners: [],
          showResultEngine: false,
          seatUpdateTriggered: false,
        };
        classBoardStateRef.current = pausedForEventState;
        setClassBoardState(pausedForEventState);
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
          state: pausedForEventState,
          customQuizQuestions: nextQuizList,
        });
        startZombieEventFlowNow(true);
        return;
      }

      const prepSpeech = pickRandomLessonPrepSpeech(cfg);
      const nextPrepTtsItems = [
        {
          text: prepSpeech,
          lang: 'vi' as const,
          lessonStepLabel: `Luồng 1: Chuẩn bị (${Math.round(prepDurMs / 1000)}s)`,
        },
      ];
      soundEngine.playWoodenFish(cfg.ttsVolume * 0.65);
      soundEngine.enqueueLessonFlowItems(nextPrepTtsItems, cfg);

      const nextPrepState: ClassBoardRuntimeState = {
        ...prev,
        roundSeq: nextRoundSeq,
        roundQuestionIndex: nextRoundQuestionIdx,
        questionIndex: nextIdx,
        totalQuestions: QUESTIONS_PER_ROUND,
        currentQuestion: nextQuiz,
        phase: 'preparing',
        lessonStepNumber: 1,
        activeFlowToken: undefined,
        ttsFinishedForPhase: false,
        idleChatTriggered: false,
        elapsedPhaseMs: 0,
        timeLeftMs: prepDurMs,
        totalDurationMs: prepDurMs,
        phaseEndAt: Date.now() + prepDurMs,
        winners: [],
        classWinners: [],
        outsideWinners: [],
        showResultEngine: false,
        seatUpdateTriggered: false,
      };
      classBoardStateRef.current = nextPrepState;
      setClassBoardState(nextPrepState);
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
        state: nextPrepState,
        customQuizQuestions: nextQuizList,
        lessonTtsItems: nextPrepTtsItems,
      });
    }, 100);

    return () => clearInterval(timer);
  }, [
    classBoardState.isRunning,
    classBoardState.engine,
    clearQuizNpcTimers,
    enqueueBatchNpcsAfterQuestion,
    ensureAnswerFlashPhaseSideEffects,
    ensureAskingPhaseSideEffects,
    ensureResultSummaryPhaseSideEffects,
    getActiveQuizList,
    recomputeWaitingQueueLazy,
    rotateClassroomSeatsAfterReveal,
    scheduleQuizNpcAnswers,
    startZombieEventFlowNow,
  ]);

  // ============================================================================
  // VÒNG LẶP ĐIỀU PHỐI 6 LUỒNG SỰ KIỆN "ZOMBIE TẤN CÔNG" (z_flow_1 -> z_flow_6)
  // ============================================================================
  useEffect(() => {
    if (!zombieEventState.isActive) return;

    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dtMs = Math.max(20, Math.min(400, now - lastTick));
      lastTick = now;

      const prev = zombieEventStateRef.current;
      if (!prev.isActive) return;

      const cfg = configRef.current;
      const nextElapsed = (prev.elapsedPhaseMs || 0) + dtMs;
      const nextLeft = Math.max(0, (prev.timeLeftMs || 0) - dtMs);

      // ------------------------------------------------------------------------
      // LUỒNG 1 (z_flow_1_intro) -> Chuyển sang LUỒNG 2 (z_flow_2_spawn) khi Cô đọc xong dòng chữ nhỏ
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_1_intro') {
        const minDur1Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow1MinDurationSec ?? 2.4) * 1000)
        );
        const done1 =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= minDur1Ms) ||
          nextLeft <= 0;
        if (!done1) {
          const tick1: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick1;
          setZombieEventState(tick1);
          return;
        }

        // Bắt đầu Luồng 2: Tạo Zombie đứng ngoài cửa lớp, khóa camera vào Zombie và play âm thanh gầm gừ
        const spawnPos = cfg.zombieSpawnPos || { x: 42, y: 520 };
        const standPos = cfg.zombieStandPos || { x: 270, y: 486 };
        const lockCam2Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow2LockCameraSec ?? 3.0) * 1000)
        );
        const maxDur2Ms = Math.max(
          lockCam2Ms + 1000,
          Math.round((cfg.zombieFlow2MaxDurationSec ?? 6.5) * 1000)
        );

        const spawnedZ: ZombieEntityState = {
          visible: true,
          x: spawnPos.x,
          y: spawnPos.y,
          targetX: standPos.x,
          targetY: standPos.y,
          isWalking: false, // Đứng gầm gừ đầu luồng rồi mới đi nhanh vào vị trí đứng
          facing: standPos.x >= spawnPos.x ? 'right' : 'left',
          recoilOffsetX: 0,
          recoilOffsetY: 0,
          isDying: false,
          dyingProgress: 0,
          animTime: 0,
          hitFlashUntil: 0,
        };
        zombieEntityRef.current = spawnedZ;
        setZombieEntity(spawnedZ);

        // Khóa camera vào Zombie + phát tiếng Zombie gầm gừ
        soundEngine.playZombieGrowlSfx(
          cfg.ttsVolume || 1,
          cfg.zombieGrowlMp3Url,
          true
        );
        setCameraFocus({
          pilgrimId: null,
          focusRole: 'zombie',
          customZoom: cfg.cameraZoomScale || 2.35,
          reason: 'special_gift',
          startedAt: Date.now(),
          until: Date.now() + maxDur2Ms,
          lockedUntil: Date.now() + lockCam2Ms,
        });

        const state2: ZombieEventRuntimeState = {
          ...prev,
          phase: 'z_flow_2_spawn',
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          elapsedPhaseMs: 0,
          timeLeftMs: maxDur2Ms,
          totalDurationMs: maxDur2Ms,
        };
        zombieEventStateRef.current = state2;
        setZombieEventState(state2);
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: state2 });
        return;
      }

      // ------------------------------------------------------------------------
      // LUỒNG 2 (z_flow_2_spawn): Khóa camera đầu luồng ở cửa -> Đi nhanh tới vị trí đứng -> Chuyển sang LUỒNG 3
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_2_spawn') {
        const curZ = zombieEntityRef.current;
        const standPos = cfg.zombieStandPos || { x: 270, y: 486 };
        const lockCam2Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow2LockCameraSec ?? 3.0) * 1000)
        );

        // Sau thời gian khóa camera gầm gừ -> kích hoạt đi nhanh đến vị trí đứng quy định trong dev-event
        if (nextElapsed >= lockCam2Ms && !curZ.isWalking) {
          const distToStand = Math.hypot(
            standPos.x - curZ.x,
            standPos.y - curZ.y
          );
          if (distToStand > 5) {
            const walkingZ: ZombieEntityState = {
              ...curZ,
              targetX: standPos.x,
              targetY: standPos.y,
              isWalking: true,
            };
            zombieEntityRef.current = walkingZ;
            setZombieEntity(walkingZ);
          }
        }

        const distNow = Math.hypot(
          standPos.x - zombieEntityRef.current.x,
          standPos.y - zombieEntityRef.current.y
        );
        const arrivedAfterLock = nextElapsed >= lockCam2Ms + 200 && distNow <= 6;

        if (!arrivedAfterLock && nextLeft > 0) {
          const tick2: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick2;
          setZombieEventState(tick2);
          return;
        }

        // Đảm bảo Zombie đứng đúng vị trí quy định
        const settledZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          x: standPos.x,
          y: standPos.y,
          isWalking: false,
          facing: 'right',
        };
        zombieEntityRef.current = settledZ;
        setZombieEntity(settledZ);

        // Chuyển sang Luồng 3: Cô Thảo nói + chatbox + khóa camera zoom gần vào Cô Thảo
        const teacherLine = (
          cfg.zombieFlow3TeacherDialog || 'Ối giời ơi ! Chu mi a !'
        ).replace(/\[Cấp\]/gi, String(prev.level));
        const minDur3Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow3MinDurationSec ?? 2.0) * 1000)
        );
        const bubbleUntil3 = Date.now() + Math.max(5500, minDur3Ms + 2500);
        setMonks((prevM) => {
          const nextM = prevM.map((m) =>
            m.role === 'abbot'
              ? { ...m, chatText: teacherLine, chatBubbleUntil: bubbleUntil3 }
              : m
          );
          monksRef.current = nextM;
          return nextM;
        });

        setCameraFocus({
          pilgrimId: null,
          focusRole: 'abbot',
          customZoom: cfg.cameraZoomScale || 2.5,
          reason: 'special_gift',
          startedAt: Date.now(),
          until: Date.now() + Math.max(9000, minDur3Ms + 4000),
          lockedUntil: Date.now() + Math.max(4500, minDur3Ms + 1000),
        });

        const flowToken3 = `z_flow_3_${Date.now()}`;
        const enqueued3 = soundEngine.enqueueLessonFlowItems(
          [
            {
              text: teacherLine,
              lang: 'vi',
              speakerRole: 'abbot',
              lessonFlowToken: flowToken3,
              lessonStepLabel: 'Sự kiện Zombie - Luồng 3: Cô giáo cầu cứu',
            },
          ],
          cfg
        );
        const dur3 = enqueued3 ? Math.max(9000, minDur3Ms + 4000) : Math.max(2500, minDur3Ms + 1000);

        const state3: ZombieEventRuntimeState = {
          ...prev,
          phase: 'z_flow_3_teacher',
          activeFlowToken: flowToken3,
          ttsFinishedForPhase: !enqueued3,
          elapsedPhaseMs: 0,
          timeLeftMs: dur3,
          totalDurationMs: dur3,
        };
        zombieEventStateRef.current = state3;
        setZombieEventState(state3);
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: state3 });
        return;
      }

      // ------------------------------------------------------------------------
      // LUỒNG 3 (z_flow_3_teacher) -> Chuyển sang LUỒNG 4 (z_flow_4_supervisor)
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_3_teacher') {
        const minDur3Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow3MinDurationSec ?? 2.0) * 1000)
        );
        const done3 =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= minDur3Ms) ||
          nextLeft <= 0;
        if (!done3) {
          const tick3: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick3;
          setZombieEventState(tick3);
          return;
        }

        // Bắt đầu Luồng 4: Thầy Tùng nói (giọng nam) + chatbox + khóa camera vào Thầy Tùng
        const supervisorLine = (
          cfg.zombieFlow4SupervisorDialog ||
          'Các em hãy thả tim liên tục để đẩy lùi zombie !'
        ).replace(/\[Cấp\]/gi, String(prev.level));
        const minDur4Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow4MinDurationSec ?? 2.2) * 1000)
        );
        const bubbleUntil4 = Date.now() + Math.max(6500, minDur4Ms + 2500);
        setMonks((prevM) => {
          const nextM = prevM.map((m) =>
            m.role === 'senior_novice'
              ? {
                  ...m,
                  chatText: supervisorLine,
                  chatBubbleUntil: bubbleUntil4,
                }
              : m
          );
          monksRef.current = nextM;
          return nextM;
        });

        setCameraFocus({
          pilgrimId: null,
          focusRole: 'senior_novice',
          customZoom: cfg.cameraZoomScale || 2.4,
          reason: 'special_gift',
          startedAt: Date.now(),
          until: Date.now() + Math.max(10000, minDur4Ms + 4000),
          lockedUntil: Date.now() + Math.max(5000, minDur4Ms + 1000),
        });

        const flowToken4 = `z_flow_4_${Date.now()}`;
        const enqueued4 = soundEngine.enqueueLessonFlowItems(
          [
            {
              text: supervisorLine,
              lang: 'vi',
              speakerRole: 'senior_novice', // Giọng Nam
              lessonFlowToken: flowToken4,
              lessonStepLabel: 'Sự kiện Zombie - Luồng 4: Thầy giáo kêu gọi',
            },
          ],
          cfg
        );
        const dur4 = enqueued4 ? Math.max(11000, minDur4Ms + 4000) : Math.max(2500, minDur4Ms + 1200);

        const state4: ZombieEventRuntimeState = {
          ...prev,
          phase: 'z_flow_4_supervisor',
          activeFlowToken: flowToken4,
          ttsFinishedForPhase: !enqueued4,
          elapsedPhaseMs: 0,
          timeLeftMs: dur4,
          totalDurationMs: dur4,
        };
        zombieEventStateRef.current = state4;
        setZombieEventState(state4);
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: state4 });
        return;
      }

      // ------------------------------------------------------------------------
      // LUỒNG 4 (z_flow_4_supervisor) -> Chuyển sang LUỒNG 5 (z_flow_5_combat - Chiến đấu)
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_4_supervisor') {
        const minDur4Ms = Math.max(
          500,
          Math.round((cfg.zombieFlow4MinDurationSec ?? 2.2) * 1000)
        );
        const done4 =
          (Boolean(prev.ttsFinishedForPhase) && nextElapsed >= minDur4Ms) ||
          nextLeft <= 0;
        if (!done4) {
          const tick4: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick4;
          setZombieEventState(tick4);
          return;
        }

        // Mở camera về toàn cảnh lớp học để chiến đấu
        setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
        soundEngine.playWoodenFish((cfg.ttsVolume || 1) * 0.8);

        const state5: ZombieEventRuntimeState = {
          ...prev,
          phase: 'z_flow_5_combat',
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          elapsedPhaseMs: 0,
          timeLeftMs: 0,
          totalDurationMs: 0,
        };
        zombieEventStateRef.current = state5;
        setZombieEventState(state5);
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: state5 });
        pushToast(
          '⚔️ CHIẾN ĐẤU BẮT ĐẦU! Thả tim & tặng quà để ném đồ đẩy lùi Zombie!',
          true
        );
        return;
      }

      // ------------------------------------------------------------------------
      // LUỒNG 5 (z_flow_5_combat): Chiến đấu (kéo dài cho đến khi HP Zombie <= 0)
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_5_combat') {
        const tick5: ZombieEventRuntimeState = {
          ...prev,
          elapsedPhaseMs: nextElapsed,
        };
        zombieEventStateRef.current = tick5;
        setZombieEventState(tick5);
        return;
      }

      // ------------------------------------------------------------------------
      // PHA GỤC NGÃ (z_flow_5b_dying - 3.2s) -> Chuyển sang LUỒNG 6 (z_flow_6_celebration)
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_5b_dying') {
        if (nextLeft > 0) {
          const tick5b: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick5b;
          setZombieEventState(tick5b);
          return;
        }

        // Ẩn Zombie sau khi đã tan biến và mở camera toàn cảnh lớp học
        const hiddenZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          visible: false,
          isDying: false,
          dyingProgress: 1,
        };
        zombieEntityRef.current = hiddenZ;
        setZombieEntity(hiddenZ);
        setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });

        // Lấy Top 1, Top 2, Top 3 điểm số đánh bại Zombie
        const topList = getSortedZombieTopDamagers();
        const top1 = topList[0];
        const top2 = topList[1];
        const top3 = topList[2];

        // Cộng thưởng thực tế Hoa Điểm 10:
        // - Top 1: +100đ, Top 2: +75đ, Top 3: +50đ
        // - Tất cả các bạn còn lại (trừ 3 bạn đạt Top ra), cả trong lớp và trong hàng chờ: mỗi bạn +25đ
        const rewardEntries: Array<{ username: string; pts: number }> = [];
        if (top1) rewardEntries.push({ username: top1.username, pts: 100 });
        if (top2) rewardEntries.push({ username: top2.username, pts: 75 });
        if (top3) rewardEntries.push({ username: top3.username, pts: 50 });

        const top3LowerSet = new Set<string>(
          rewardEntries.map((r) => r.username.trim().toLowerCase())
        );

        const remainingUsersMap = new Map<string, string>();
        pilgrimsRef.current.forEach((p) => {
          if (
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
          ) {
            const clean = (p.username || '').trim();
            const lower = clean.toLowerCase();
            if (clean && !top3LowerSet.has(lower) && !remainingUsersMap.has(lower)) {
              remainingUsersMap.set(lower, clean);
            }
          }
        });
        waitingPoolRef.current.forEach((qItem) => {
          const clean = (qItem.username || '').trim();
          const lower = clean.toLowerCase();
          if (clean && !top3LowerSet.has(lower) && !remainingUsersMap.has(lower)) {
            remainingUsersMap.set(lower, clean);
          }
        });
        waitingQueueRef.current.forEach((qItem) => {
          const clean = (qItem.username || '').trim();
          const lower = clean.toLowerCase();
          if (clean && !top3LowerSet.has(lower) && !remainingUsersMap.has(lower)) {
            remainingUsersMap.set(lower, clean);
          }
        });

        remainingUsersMap.forEach((uName) => {
          rewardEntries.push({ username: uName, pts: 25 });
        });

        let updatedWaitingQueuePoints = false;
        rewardEntries.forEach((r) => {
          addLotusPointsToDonor(r.username, r.pts);
          const qItem = waitingPoolRef.current.get(
            r.username.trim().toLowerCase()
          );
          if (qItem) {
            qItem.points = (qItem.points || 0) + r.pts;
            updatedWaitingQueuePoints = true;
          }
        });
        if (updatedWaitingQueuePoints) {
          recomputeWaitingQueueLazy();
        }

        const rewardMap = new Map<string, number>();
        rewardEntries.forEach((r) =>
          rewardMap.set(r.username.trim().toLowerCase(), r.pts)
        );
        const nowMs = Date.now();
        if (rewardMap.size > 0) {
          const rewardedPilgrims = pilgrimsRef.current.map((p) => {
            const bonus = rewardMap.get(p.username.trim().toLowerCase());
            if (!bonus) return p;
            return {
              ...p,
              floatingScoreText: `+${bonus} 🌸`,
              floatingScoreColor: 'gold' as const,
              floatingScoreUntil: nowMs + 4800,
              floatingScoreKey: nowMs + p.id,
            };
          });
          pilgrimsRef.current = rewardedPilgrims;
          setPilgrims(rewardedPilgrims);
        }

        // Vẽ hàng loạt ly trà sữa Matcha Latte full topping bay từ Cô Giáo về phía TẤT CẢ các bạn ngồi trong lớp VÀ các bạn ở cửa hàng chờ!
        const abbotNpc =
          monksRef.current.find((m) => m.role === 'abbot') || monksRef.current[0];
        const startTeaX = abbotNpc ? abbotNpc.x : 270;
        const startTeaY = abbotNpc ? abbotNpc.y - 24 : 430;

        const seatedTargets = pilgrimsRef.current.filter(
          (p) =>
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        const crowdTargets = doorCrowdRef.current;
        const allTeaTargets = [...seatedTargets, ...crowdTargets];

        const milkTeaItems: FlyingMilkTeaFX[] = allTeaTargets.map((st, idx) => ({
          id: `mtea_${nowMs}_${idx}_${st.id}`,
          startX: startTeaX,
          startY: startTeaY,
          targetX: st.x,
          targetY: st.y - 18,
          createdAt: nowMs + idx * 45,
          durationMs: 1250 + (idx % 5) * 110,
        }));
        setFlyingMilkTeas(milkTeaItems);
        soundEngine.playAnswerRevealSfx(
          cfg.ttsVolume || 1,
          'victory_fanfare',
          null,
          true
        );

        const top1Name = top1?.username || 'Học Sinh Giỏi';
        const top2Name = top2?.username || 'Bạn Bàn Đầu';
        const top3Name = top3?.username || 'Bạn Chăm Ngoan';

        const formatCelebTpl = (tpl: string) =>
          tpl
            .replace(/\[Cấp\]/gi, String(prev.level))
            .replace(/\[Top1\]/gi, top1Name)
            .replace(/\[Top2\]/gi, top2Name)
            .replace(/\[Top3\]/gi, top3Name);

        const celebSpeech1 = formatCelebTpl(
          cfg.zombieFlow6Speech1Template ||
            'Chúc mừng các em đã đánh bại zombie cấp [Cấp] và cứu cô giáo, sau đây là bảng xếp hạng điểm số'
        );
        const rawSpeech2Tpl =
          cfg.zombieFlow6Speech2Template &&
          !cfg.zombieFlow6Speech2Template.includes('120 hoa điểm 10')
            ? cfg.zombieFlow6Speech2Template
            : 'Cô trọng thưởng cho ba bạn top 1: [Top1] 100 hoa điểm 10, top 2: [Top2] 75 hoa điểm 10 và top 3: [Top3] 50 hoa điểm 10, các bạn còn lại 25 hoa điểm 10. Cùng tất cả các bạn một ly trà sữa mát cha lát te phun tóp pinh, chúng ta tiếp tục học thôi nào';
        const celebSpeech2 = formatCelebTpl(rawSpeech2Tpl);

        const minDur6Ms = Math.max(
          1000,
          Math.round((cfg.zombieFlow6MinDurationSec ?? 4.5) * 1000)
        );
        const flowToken6 = `z_flow_6_${Date.now()}`;
        const enqueued6 = soundEngine.enqueueLessonFlowItems(
          [
            {
              text: celebSpeech1,
              lang: 'vi',
              speakerRole: 'abbot',
              lessonStepLabel: 'Sự kiện Zombie - Luồng 6: Chúc mừng',
            },
            {
              text: celebSpeech2,
              lang: 'vi',
              speakerRole: 'abbot',
              lessonFlowToken: flowToken6,
              lessonStepLabel: 'Sự kiện Zombie - Luồng 6: Trao thưởng Trà Sữa',
            },
          ],
          cfg
        );
        const dur6 = enqueued6
          ? Math.max(60000, minDur6Ms + 45000)
          : Math.max(5500, minDur6Ms + 2500);

        const state6: ZombieEventRuntimeState = {
          ...prev,
          phase: 'z_flow_6_celebration',
          topDamagers: topList,
          activeFlowToken: flowToken6,
          ttsFinishedForPhase: !enqueued6,
          ttsFinishedAtElapsedMs: !enqueued6 ? 0 : undefined,
          elapsedPhaseMs: 0,
          timeLeftMs: dur6,
          totalDurationMs: dur6,
        };
        zombieEventStateRef.current = state6;
        setZombieEventState(state6);
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: state6 });
        pushToast(
          `🧋 CÔ GIÁO KHAO CẢ LỚP & HÀNG CHỜ TRÀ SỮA MATCHA LATTE FULL TOPPING!`,
          true
        );
        return;
      }

      // ------------------------------------------------------------------------
      // LUỒNG 6 (z_flow_6_celebration) -> Kết thúc sự kiện & Tiếp tục tiết học đang dở
      // ------------------------------------------------------------------------
      if (prev.phase === 'z_flow_6_celebration') {
        const minDur6Ms = Math.max(
          1000,
          Math.round((cfg.zombieFlow6MinDurationSec ?? 4.5) * 1000)
        );
        const stillPendingTts6 =
          Boolean(prev.activeFlowToken) &&
          soundEngine.hasPendingFlowToken(prev.activeFlowToken);
        const postTtsElapsed6 =
          prev.ttsFinishedForPhase &&
          typeof prev.ttsFinishedAtElapsedMs === 'number'
            ? nextElapsed - prev.ttsFinishedAtElapsedMs
            : 9999;
        const done6 =
          (!stillPendingTts6 &&
            Boolean(prev.ttsFinishedForPhase) &&
            nextElapsed >= minDur6Ms &&
            postTtsElapsed6 >= 1200) ||
          nextLeft <= 0;
        if (!done6) {
          const tick6: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick6;
          setZombieEventState(tick6);
          return;
        }

        // Giữ nguyên Cấp và HP của Zombie hoàn toàn độc lập theo thiết lập của Dev (không tự động cộng tăng cấp)
        const devSetLevel = Math.max(1, cfg.zombieLevel || prev.level || 1);
        const devSetMaxHp = Math.max(100, cfg.zombieMaxHp || prev.maxHp || 10000);

        const shouldResumeLesson = prev.resumeLessonAfterEvent;
        const finishedState: ZombieEventRuntimeState = {
          ...prev,
          isActive: false,
          isQueued: false,
          phase: 'idle',
          level: devSetLevel,
          hp: devSetMaxHp,
          maxHp: devSetMaxHp,
          trailHp: devSetMaxHp,
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          elapsedPhaseMs: 0,
          timeLeftMs: 0,
          totalDurationMs: 0,
        };
        zombieEventStateRef.current = finishedState;
        setZombieEventState(finishedState);
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: finishedState,
        });

        // Tiếp tục lại tiết học đang dở ở câu hỏi kế tiếp (Luồng 1: Chuẩn bị)
        if (shouldResumeLesson) {
          const prepDurMs =
            Math.max(1, cfg.lessonPrepareDurationSec || 3) * 1000;
          const prepSpeech = pickRandomLessonPrepSpeech(cfg);
          soundEngine.playWoodenFish((cfg.ttsVolume || 1) * 0.65);
          soundEngine.enqueueLessonFlowItems(
            [
              {
                text: prepSpeech,
                lang: 'vi',
                lessonStepLabel: `Luồng 1: Chuẩn bị (${Math.round(
                  prepDurMs / 1000
                )}s)`,
              },
            ],
            cfg
          );

          const resumedBoard: ClassBoardRuntimeState = {
            ...classBoardStateRef.current,
            isRunning: true,
            phase: 'preparing',
            lessonStepNumber: 1,
            activeFlowToken: undefined,
            ttsFinishedForPhase: false,
            elapsedPhaseMs: 0,
            timeLeftMs: prepDurMs,
            totalDurationMs: prepDurMs,
            phaseEndAt: Date.now() + prepDurMs,
            winners: [],
            classWinners: [],
            outsideWinners: [],
            showResultEngine: false,
            seatUpdateTriggered: false,
          };
          classBoardStateRef.current = resumedBoard;
          setClassBoardState(resumedBoard);
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
            state: resumedBoard,
          });
        }
      }
    }, 100);

    return () => clearInterval(timer);
  }, [
    zombieEventState.isActive,
    addLotusPointsToDonor,
    getSortedZombieTopDamagers,
    pushToast,
    recomputeWaitingQueueLazy,
  ]);

  // Tự động cho NPC trong lớp và hàng chờ giả lập thả tim ném hộp bút xen kẽ nối đuôi nhau vào Zombie khi ở Luồng 5 Chiến Đấu (nếu bật zombieNpcAutoAttack - KHÔNG tính điểm vào Bảng Chiến Công)
  useEffect(() => {
    if (
      !zombieEventState.isActive ||
      zombieEventState.phase !== 'z_flow_5_combat' ||
      config.zombieNpcAutoAttack === false
    ) {
      return;
    }

    const runSimulatedNpcHeartWave = () => {
      const cfg = configRef.current;
      if (cfg.zombieNpcAutoAttack === false) return;
      const curEv = zombieEventStateRef.current;
      if (!curEv.isActive || curEv.phase !== 'z_flow_5_combat' || curEv.hp <= 0) {
        return;
      }

      const activeSeated = pilgrimsRef.current.filter(
        (p) =>
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const seatedBots = activeSeated.filter((p) => p.isBot);
      // Nếu lớp đang có NPC thì lấy NPC, nếu lớp full người thật vẫn mượn vị trí ngồi để giả lập hiệu ứng NPC thả tim (nhưng isBot=true nên tuyệt đối không cộng vào Bảng Chiến Công)
      const seatedPool = seatedBots.length > 0 ? seatedBots : activeSeated;

      const seatedSet = new Set(
        activeSeated.map((p) => p.username.trim().toLowerCase())
      );
      const queueBots = Array.from(waitingPoolRef.current.values()).filter(
        (q) => q.isBot && !seatedSet.has(q.username.trim().toLowerCase())
      );
      const crowdList = doorCrowdRef.current;
      const fallbackPos = cfg.doorCrowdPos || LEFT_DOOR_POS;

      const maxFlyingLimit = Math.max(
        1,
        Math.min(60, Math.round(cfg.zombieMaxFlyingProjectiles ?? 16))
      );

      // Chọn ngẫu nhiên học sinh trong lớp và ở cửa hàng chờ để tạo đợt bắn xen kẽ (tôn trọng giới hạn số đạn bay zombieMaxFlyingProjectiles)
      const shuffledSeated = [...seatedPool].sort(() => Math.random() - 0.5);
      const pickedSeated = shuffledSeated.slice(
        0,
        Math.min(
          seatedPool.length,
          Math.max(
            1,
            Math.min(
              Math.ceil(maxFlyingLimit / 2),
              2 + Math.floor(Math.random() * 2)
            )
          )
        )
      );

      const queueWaveCount = Math.max(
        1,
        Math.min(
          Math.max(1, maxFlyingLimit - pickedSeated.length),
          2 + Math.floor(Math.random() * 2)
        )
      );
      const pickedQueueShots: Array<{
        username: string;
        startX: number;
        startY: number;
        damage: number;
        avatarUrl?: string | null;
      }> = [];

      for (let i = 0; i < queueWaveCount; i++) {
        const qBot =
          queueBots.length > 0
            ? queueBots[(i + Math.floor(Math.random() * queueBots.length)) % queueBots.length]
            : null;
        const crowdRep =
          crowdList.length > 0
            ? crowdList[(i + Math.floor(Math.random() * crowdList.length)) % crowdList.length]
            : null;
        const jitterX = ((i % 3) - 1) * 7;
        const jitterY = ((i % 2) * 2 - 1) * 5;
        pickedQueueShots.push({
          username: qBot?.username || crowdRep?.username || `NPC Hàng Chờ ${i + 1}`,
          startX: (crowdRep ? crowdRep.x : fallbackPos.x) + jitterX,
          startY: (crowdRep ? crowdRep.y : fallbackPos.y) - 18 + jitterY,
          damage: 15 + Math.floor(Math.random() * 35),
          avatarUrl: qBot?.avatarUrl,
        });
      }

      // Hiển thị bong bóng chat "❤️ Thả X tim!" thoáng qua trên 1 NPC trong lớp và 1 NPC cửa lớp để nhìn trực quan
      const nowMs = Date.now();
      if (pickedSeated.length > 0) {
        const bubbleSeat = pickedSeated[0];
        const bubbleLikes = 20 + Math.floor(Math.random() * 30);
        const nextPilgrims = pilgrimsRef.current.map((p) =>
          p.id === bubbleSeat.id
            ? {
                ...p,
                prayer: `❤️ Thả ${bubbleLikes} tim!`,
                hasComment: true,
                chatBubbleUntil: nowMs + 1100,
              }
            : p
        );
        pilgrimsRef.current = nextPilgrims;
        setPilgrims(nextPilgrims);
      }
      if (crowdList.length > 0 && pickedQueueShots.length > 0) {
        const crowdCopy = [...crowdList];
        const cIdx = Math.floor(Math.random() * crowdCopy.length);
        crowdCopy[cIdx] = {
          ...crowdCopy[cIdx],
          prayer: `❤️ Thả ${pickedQueueShots[0].damage} tim!`,
          hasComment: true,
          chatBubbleUntil: nowMs + 1100,
        };
        doorCrowdRef.current = crowdCopy;
        setDoorCrowd(crowdCopy);
      }

      // Trộn xen kẽ 1-1: Trong Lớp 1 -> Hàng Chờ 1 -> Trong Lớp 2 -> Hàng Chờ 2...
      const interleavedWave: Array<{
        attackerUsername: string;
        startX: number;
        startY: number;
        damage: number;
        isSeated: boolean;
        avatarColor?: string;
        avatarUrl?: string | null;
      }> = [];

      const maxLen = Math.max(pickedSeated.length, pickedQueueShots.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < pickedSeated.length) {
          const st = pickedSeated[i];
          const launchCoords = getSeatedStudentLaunchPos(st);
          interleavedWave.push({
            attackerUsername: st.username,
            startX: launchCoords.x,
            startY: launchCoords.y,
            damage: 15 + Math.floor(Math.random() * 35),
            isSeated: true,
            avatarColor: st.avatarColor,
            avatarUrl: st.avatarUrl,
          });
        }
        if (i < pickedQueueShots.length) {
          const qs = pickedQueueShots[i];
          interleavedWave.push({
            attackerUsername: qs.username,
            startX: qs.startX,
            startY: qs.startY,
            damage: qs.damage,
            isSeated: false,
            avatarUrl: qs.avatarUrl,
          });
        }
      }

      const cappedWave = interleavedWave.slice(0, maxFlyingLimit);
      if (cappedWave.length === 0) return;

      const batchWindowMs = Math.max(
        400,
        cfg.zombieHeartBatchIntervalMs || 1200
      );
      const staggerStepMs = Math.max(
        95,
        Math.min(210, Math.floor((batchWindowMs - 60) / cappedWave.length))
      );

      const waveProjectiles: ZombieProjectileFX[] = [];
      cappedWave.forEach((shot, idx) => {
        const proj = fireZombieAttackProjectile({
          attackerUsername: shot.attackerUsername,
          startX: shot.startX,
          startY: shot.startY,
          damage: shot.damage,
          kind: 'pencil_case',
          isSeated: shot.isSeated,
          isBot: true,
          skipIndividualScoreRecord: true,
          avatarColor: shot.avatarColor,
          avatarUrl: shot.avatarUrl,
          delayMs: idx * staggerStepMs,
          deferStateAppend: true,
        });
        if (proj) {
          waveProjectiles.push(proj);
        }
      });

      if (waveProjectiles.length > 0) {
        setZombieProjectiles((prev) =>
          [...prev, ...waveProjectiles].slice(-maxFlyingLimit)
        );
      }
    };

    const initialTimer = setTimeout(runSimulatedNpcHeartWave, 180);
    const intervalMs = Math.max(
      450,
      config.zombieHeartBatchIntervalMs || 1200
    );
    const timer = setInterval(runSimulatedNpcHeartWave, intervalMs);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [
    zombieEventState.isActive,
    zombieEventState.phase,
    config.zombieNpcAutoAttack,
    config.zombieHeartBatchIntervalMs,
    fireZombieAttackProjectile,
    getSeatedStudentLaunchPos,
  ]);

  // Đồng bộ Nhạc nền chiến đấu Sự Kiện Zombie (tự động chuyển sang nhạc chiến đấu khi Zombie xuất hiện và kết thúc ngay khi Zombie bị giết!)
  useEffect(() => {
    const isZombieBgmPlaying =
      zombieEventState.isActive &&
      zombieEventState.phase !== 'z_flow_5b_dying' &&
      zombieEventState.phase !== 'z_flow_6_celebration' &&
      zombieEventState.hp > 0;
    soundEngine.setZombieEventActive(isZombieBgmPlaying, configRef.current);
  }, [
    zombieEventState.isActive,
    zombieEventState.phase,
    zombieEventState.hp,
    config.zombieBgmEnabled,
    config.zombieBgmMp3Url,
    config.zombieBgmVolume,
  ]);

  // Định kỳ phát âm thanh dồn dập khi đang chiến đấu Zombie nếu chưa tải file MP3 riêng
  useEffect(() => {
    if (
      !zombieEventState.isActive ||
      zombieEventState.phase !== 'z_flow_5_combat' ||
      config.zombieBgmEnabled === false ||
      Boolean(config.zombieBgmMp3Url)
    ) {
      return;
    }
    const timer = setInterval(() => {
      const cfg = configRef.current;
      if (cfg.zombieBgmEnabled === false || cfg.zombieBgmMp3Url) return;
      soundEngine.playZombieBattleAmbientNote(cfg.zombieBgmVolume ?? 0.65);
    }, 1400);
    return () => clearInterval(timer);
  }, [
    zombieEventState.isActive,
    zombieEventState.phase,
    config.zombieBgmEnabled,
    config.zombieBgmMp3Url,
    config.zombieBgmVolume,
  ]);

  // Thầy giáo (Giám thị Thầy Tùng - senior_novice) nói câu khích lệ học sinh chiến đấu khi Sự Kiện Zombie đang ở pha Chiến Đấu (z_flow_5_combat)
  useEffect(() => {
    if (
      !zombieEventState.isActive ||
      zombieEventState.phase !== 'z_flow_5_combat' ||
      config.zombieTeacherEncourageEnabled === false
    ) {
      return;
    }

    const triggerEncourageSpeech = () => {
      const cfg = configRef.current;
      const curEv = zombieEventStateRef.current;
      if (
        !curEv.isActive ||
        curEv.phase !== 'z_flow_5_combat' ||
        curEv.hp <= 0 ||
        cfg.zombieTeacherEncourageEnabled === false
      ) {
        return;
      }
      const list = Array.isArray(cfg.zombieTeacherEncourageTemplates)
        ? cfg.zombieTeacherEncourageTemplates
            .map((s) => (s || '').trim())
            .filter(Boolean)
        : [];
      if (list.length === 0) return;
      const chosen = list[Math.floor(Math.random() * list.length)];
      const formatted = chosen.replace(/\[Cấp\]/gi, String(curEv.level || 1));

      setMonks((prevMonks) =>
        prevMonks.map((m) =>
          m.role === 'senior_novice'
            ? {
                ...m,
                monkBubbleText: `🔥 ${formatted}`,
                monkBubbleUntil: Date.now() + 5200,
              }
            : m
        )
      );

      soundEngine.enqueueTTS(formatted, true, cfg, {
        speakerRole: 'senior_novice',
        reason: 'comment',
      });
    };

    const firstTimeout = setTimeout(triggerEncourageSpeech, 2200);
    const intervalMs =
      Math.max(4, config.zombieTeacherEncourageIntervalSec ?? 9) * 1000;
    const timer = setInterval(triggerEncourageSpeech, intervalMs);

    return () => {
      clearTimeout(firstTimeout);
      clearInterval(timer);
    };
  }, [
    zombieEventState.isActive,
    zombieEventState.phase,
    config.zombieTeacherEncourageEnabled,
    config.zombieTeacherEncourageIntervalSec,
  ]);

  // Định kỳ đánh trống trường / gõ thước gỗ nếu bật
  useEffect(() => {
    if (!config.bellEnabled) return;
    const timer = setInterval(() => {
      soundEngine.playBell(configRef.current.ttsVolume * 0.7);
    }, Math.max(5, config.bellIntervalSec || 45) * 1000);
    return () => clearInterval(timer);
  }, [config.bellEnabled, config.bellIntervalSec]);

  useEffect(() => {
    if (!config.woodenFishEnabled) return;
    const timer = setInterval(() => {
      soundEngine.playWoodenFish(configRef.current.ttsVolume * 0.55);
      setMonks((prev) =>
        prev.map((m) =>
          m.role === 'abbot'
            ? { ...m, woodenFishRippleUntil: Date.now() + 450 }
            : m
        )
      );
    }, Math.max(1, config.woodenFishIntervalSec || 4) * 1000);
    return () => clearInterval(timer);
  }, [config.woodenFishEnabled, config.woodenFishIntervalSec]);

  // Xử lý sự kiện Thả Tim từ TikTok Live hoặc nút Test:
  // YÊU CẦU #7: Trong tình trạng bình thường (Không có Event lớp học), KHÔNG đọc/xử lý thêm event thả tim của người chơi để tối ưu hiệu năng!
  // Chỉ khi có Event lớp học đang ở Luồng 5 Chiến Đấu mới đọc thông tin thả tim của người chơi (trong lớp hoặc trong hàng chờ).
  // Đặc biệt: Trong sự kiện Zombie, khi test thả tim (không nhập tên cụ thể hoặc bấm nút Test Thả Tim) -> nhập vào người ngẫu nhiên trong HÀNG CHỜ mà tấn công!
  // Và nếu người tấn công là NPC (isBot === true) thì KHÔNG tính điểm vào Bảng Chiến Công!
  const handleTriggerLike = useCallback(
    (count = 15, username = 'Học Sinh', broadcastSync = true) => {
      const isRandomNpcTest =
        username === '__RANDOM_NPC__' || !(username || '').trim();
      let resolvedUsername = (username || '').trim();
      const isZombieActiveNow = zombieEventStateRef.current.isActive;

      if (isRandomNpcTest) {
        const seatedSet = new Set(
          pilgrimsRef.current
            .filter(
              (p) =>
                Boolean(p.slotId) &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            )
            .map((p) => p.username.trim().toLowerCase())
        );
        const queueOutside = Array.from(waitingPoolRef.current.values()).filter(
          (q) => !seatedSet.has(q.username.trim().toLowerCase())
        );

        if (isZombieActiveNow) {
          // Trong sự kiện Zombie: bình thường lớp đã full người thật -> luôn nhập vào người ngẫu nhiên trong HÀNG CHỜ để tấn công!
          const realQueueCandidates = queueOutside.filter((q) => !q.isBot);
          const candidatePool =
            realQueueCandidates.length > 0 ? realQueueCandidates : queueOutside;

          if (candidatePool.length > 0) {
            const picked =
              candidatePool[Math.floor(Math.random() * candidatePool.length)];
            resolvedUsername = picked.username;
          } else {
            const fallbackPool =
              npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
            resolvedUsername =
              fallbackPool[Math.floor(Math.random() * fallbackPool.length)] ||
              'Bạn Hàng Chờ';
          }
        } else {
          const seatedBots = pilgrimsRef.current.filter(
            (p) =>
              p.isBot &&
              Boolean(p.slotId) &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit'
          );
          const queueBots = queueOutside.filter((q) => q.isBot);
          const allCandidates: Array<{ username: string; isSeated: boolean }> = [
            ...seatedBots.map((b) => ({ username: b.username, isSeated: true })),
            ...queueBots.map((q) => ({ username: q.username, isSeated: false })),
          ];

          if (allCandidates.length === 0) {
            const anySeated = pilgrimsRef.current.filter(
              (p) =>
                Boolean(p.slotId) &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            );
            allCandidates.push(
              ...anySeated.map((p) => ({ username: p.username, isSeated: true })),
              ...queueOutside.map((q) => ({
                username: q.username,
                isSeated: false,
              }))
            );
          }

          if (allCandidates.length > 0) {
            const picked =
              allCandidates[Math.floor(Math.random() * allCandidates.length)];
            resolvedUsername = picked.username;
          } else {
            const fallbackPool =
              npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
            resolvedUsername =
              fallbackPool[Math.floor(Math.random() * fallbackPool.length)] ||
              'NPC Học Sinh';
          }
        }
      }

      const cleanUser = resolvedUsername.trim();
      if (!cleanUser) return;
      const lowerUser = cleanUser.toLowerCase();

      const seatedMatch = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const queueMatch = waitingPoolRef.current.get(lowerUser);

      // Khi bấm nút Test Thả Tim: hiển thị hiệu ứng bong bóng thả tim trên học sinh / đám đông cửa lớp
      if (isRandomNpcTest) {
        const nowMs = Date.now();
        if (seatedMatch && !isZombieActiveNow) {
          const nextPilgrims = pilgrimsRef.current.map((p) =>
            p.id === seatedMatch.id
              ? {
                  ...p,
                  prayer: `❤️ Thả ${count} tim!`,
                  hasComment: true,
                  chatBubbleUntil: nowMs + 2600,
                }
              : p
          );
          pilgrimsRef.current = nextPilgrims;
          setPilgrims(nextPilgrims);
        } else if (doorCrowdRef.current.length > 0) {
          const crowdCopy = [...doorCrowdRef.current];
          let crowdIdx = crowdCopy.findIndex(
            (c) => c.username.trim().toLowerCase() === lowerUser
          );
          if (crowdIdx < 0) {
            crowdIdx = Math.floor(Math.random() * crowdCopy.length);
          }
          crowdCopy[crowdIdx] = {
            ...crowdCopy[crowdIdx],
            username: cleanUser,
            prayer: `❤️ Thả ${count} tim!`,
            hasComment: true,
            chatBubbleUntil: nowMs + 2800,
          };
          doorCrowdRef.current = crowdCopy;
          setDoorCrowd(crowdCopy);
        }
        if (
          !zombieEventStateRef.current.isActive ||
          zombieEventStateRef.current.phase !== 'z_flow_5_combat'
        ) {
          pushToast(
            `❤️ ${cleanUser} (${seatedMatch && !isZombieActiveNow ? 'Trong lớp' : 'Hàng chờ'}) vừa thả ${count} tim!`,
            false
          );
          if (broadcastSync) {
            syncService.sendCommand('TRIGGER_LIKE', {
              username: cleanUser,
              count,
            });
          }
          return;
        }
      }

      if (
        !zombieEventStateRef.current.isActive ||
        zombieEventStateRef.current.phase !== 'z_flow_5_combat'
      ) {
        return;
      }

      // Nếu người thả tim KHÔNG có trong lớp và KHÔNG có trong hàng chờ -> BỎ QUA!
      if (!seatedMatch && !queueMatch) {
        return;
      }

      const zBatch = zombieHeartBatchRef.current;
      // Nếu đang test thả tim trong sự kiện Zombie thì ưu tiên bắn từ Hàng Chờ (đám đông cửa lớp)
      if (seatedMatch && !isRandomNpcTest) {
        zBatch.seatedByUser.set(
          seatedMatch.username,
          (zBatch.seatedByUser.get(seatedMatch.username) || 0) + count
        );
      } else if (queueMatch) {
        zBatch.queueByUser.set(
          queueMatch.username,
          (zBatch.queueByUser.get(queueMatch.username) || 0) + count
        );
      } else if (seatedMatch) {
        zBatch.seatedByUser.set(
          seatedMatch.username,
          (zBatch.seatedByUser.get(seatedMatch.username) || 0) + count
        );
      }

      if (!zBatch.timer) {
        const batchMs = Math.max(
          300,
          configRef.current.zombieHeartBatchIntervalMs || 1200
        );
        zBatch.timer = setTimeout(() => {
          const seatedEntries = Array.from(zBatch.seatedByUser.entries());
          const queueEntries = Array.from(zBatch.queueByUser.entries());
          zBatch.seatedByUser.clear();
          zBatch.queueByUser.clear();
          zBatch.timer = null;

          if (
            !zombieEventStateRef.current.isActive ||
            zombieEventStateRef.current.phase !== 'z_flow_5_combat'
          ) {
            return;
          }

          type PendingHeartShot = {
            attackerUsername: string;
            startX: number;
            startY: number;
            damage: number;
            isSeated: boolean;
            isBot: boolean;
            avatarColor?: string;
            avatarUrl?: string | null;
            contributors: Array<{
              username: string;
              damage: number;
              isSeated: boolean;
              avatarColor?: string;
              avatarUrl?: string | null;
              isBot?: boolean;
            }>;
          };

          const seatedShots: PendingHeartShot[] = [];
          const queueShots: PendingHeartShot[] = [];

          // 1. Học sinh ngồi trong lớp: tạo danh sách bắn từ đúng tọa độ (x, y) bàn học đang ngồi (chỉ cộng điểm Chiến Công khi đạn chạm Zombie)
          seatedEntries.forEach(([uName, likesCount]) => {
            if (likesCount <= 0) return;
            const st = pilgrimsRef.current.find(
              (p) =>
                p.username.trim().toLowerCase() ===
                  uName.trim().toLowerCase() &&
                Boolean(p.slotId) &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            );
            if (!st) return;
            const isStBot = Boolean(st.isBot);
            const launchCoords = getSeatedStudentLaunchPos(st);
            seatedShots.push({
              attackerUsername: st.username,
              startX: launchCoords.x,
              startY: launchCoords.y,
              damage: likesCount,
              isSeated: true,
              isBot: isStBot,
              avatarColor: st.avatarColor,
              avatarUrl: st.avatarUrl,
              contributors: [
                {
                  username: st.username,
                  damage: likesCount,
                  isSeated: true,
                  avatarColor: st.avatarColor,
                  avatarUrl: st.avatarUrl,
                  isBot: isStBot,
                },
              ],
            });
          });

          // 2. Học sinh trong hàng chờ: tách riêng từng viên đạn bay từ cụm cửa lớp (chỉ cộng điểm Chiến Công khi đạn chạm Zombie)
          const crowdList = doorCrowdRef.current;
          const fallbackPos = configRef.current.doorCrowdPos || LEFT_DOOR_POS;

          queueEntries.forEach(([qName, qLikes], qIdx) => {
            if (qLikes <= 0) return;
            const qItem = waitingPoolRef.current.get(
              qName.trim().toLowerCase()
            );
            const isQBot = Boolean(qItem?.isBot);

            const matchedCrowd =
              crowdList.find(
                (c) =>
                  c.username.trim().toLowerCase() ===
                  qName.trim().toLowerCase()
              ) ||
              (crowdList.length > 0
                ? crowdList[qIdx % crowdList.length]
                : null);

            const jitterX = ((qIdx % 3) - 1) * 6;
            const jitterY = ((qIdx % 2) * 2 - 1) * 4;

            queueShots.push({
              attackerUsername: qName,
              startX: (matchedCrowd ? matchedCrowd.x : fallbackPos.x) + jitterX,
              startY:
                (matchedCrowd ? matchedCrowd.y : fallbackPos.y) - 18 + jitterY,
              damage: qLikes,
              isSeated: false,
              isBot: isQBot,
              avatarUrl: qItem?.avatarUrl,
              contributors: [
                {
                  username: qName,
                  damage: qLikes,
                  isSeated: false,
                  avatarUrl: qItem?.avatarUrl,
                  isBot: isQBot,
                },
              ],
            });
          });

          // 3. Sắp xếp ưu tiên sát thương cao trước và trộn đan xen 1–1 (Trong Lớp ↔ Hàng Chờ)
          seatedShots.sort((a, b) => b.damage - a.damage);
          queueShots.sort((a, b) => b.damage - a.damage);

          const interleavedShots: PendingHeartShot[] = [];
          const maxPairLen = Math.max(seatedShots.length, queueShots.length);
          for (let i = 0; i < maxPairLen; i++) {
            if (i < seatedShots.length) {
              interleavedShots.push(seatedShots[i]);
            }
            if (i < queueShots.length) {
              interleavedShots.push(queueShots[i]);
            }
          }

          if (interleavedShots.length === 0) return;

          // 4. Trần hiển thị số đạn bay tối đa theo thiết lập Dev (zombieMaxFlyingProjectiles, mặc định 16 viên) để đảm bảo 60FPS mượt tuyệt đối (100% sát thương & người đóng góp được giữ nguyên khi chạm Zombie)
          const MAX_BATCH_PROJECTILES = Math.max(
            1,
            Math.min(
              60,
              Math.round(configRef.current.zombieMaxFlyingProjectiles ?? 16)
            )
          );
          let finalShots = interleavedShots;
          if (interleavedShots.length > MAX_BATCH_PROJECTILES) {
            finalShots = interleavedShots
              .slice(0, MAX_BATCH_PROJECTILES)
              .map((s) => ({
                ...s,
                contributors: [...s.contributors],
              }));
            const overflowShots = interleavedShots.slice(MAX_BATCH_PROJECTILES);
            overflowShots.forEach((extra, idx) => {
              const targetIdx = idx % finalShots.length;
              finalShots[targetIdx].damage += extra.damage;
              finalShots[targetIdx].contributors.push(...extra.contributors);
            });
          }

          // 5. Chia khoảng cách nối đuôi tự động (85ms – 210ms) và đẩy toàn bộ đạn vào State trong 1 lần Render duy nhất
          const totalShots = finalShots.length;
          const staggerStepMs =
            totalShots <= 1
              ? 0
              : Math.max(
                  85,
                  Math.min(210, Math.floor((batchMs - 80) / totalShots))
                );

          const spawnedProjectiles: ZombieProjectileFX[] = [];
          finalShots.forEach((shot, idx) => {
            const proj = fireZombieAttackProjectile({
              attackerUsername: shot.attackerUsername,
              startX: shot.startX,
              startY: shot.startY,
              damage: shot.damage,
              kind: 'pencil_case',
              isSeated: shot.isSeated,
              isBot: shot.isBot,
              contributors: shot.contributors,
              avatarColor: shot.avatarColor,
              avatarUrl: shot.avatarUrl,
              delayMs: idx * staggerStepMs,
              deferStateAppend: true,
            });
            if (proj) {
              spawnedProjectiles.push(proj);
            }
          });

          if (spawnedProjectiles.length > 0) {
            setZombieProjectiles((prev) =>
              [...prev, ...spawnedProjectiles].slice(-MAX_BATCH_PROJECTILES)
            );
          }
        }, batchMs);
      }

      if (broadcastSync) {
        syncService.sendCommand('TRIGGER_LIKE', { username: cleanUser, count });
      }
    },
    [fireZombieAttackProjectile, getSeatedStudentLaunchPos, pushToast]
  );

  const handleTriggerFollow = useCallback(
    (username = 'Học Sinh Mới', broadcastSync = true) => {
      addLotusPointsToDonor(username, 100);
      if (broadcastSync) {
        syncService.sendCommand('TRIGGER_FOLLOW', { username });
      }
    },
    [addLotusPointsToDonor]
  );

  const remoteBoardCommandHandlersRef = useRef<(cmd: string) => void>(() => {});

  // Lắng nghe sự kiện TikTok Live thật & đồng bộ giữa Tab Admin <-> Màn hình Live (?obs=1)
  useEffect(() => {
    const unsubStatus = syncService.onStatusChange(setWsStatus);
    const unsubPeers = syncService.onPeerCountChange(setPeerCounts);

    const unsubTikTok = syncService.onTikTokEvent((ev) => {
      if (ev.type === 'chat') {
        spawnOrPromotePilgrim({
          username: ev.username || 'Học Sinh',
          prayer: ev.comment || '',
          isVip: false,
          coins: 0,
          isBot: false,
          avatarUrl: ev.avatarUrl || ev.profilePictureUrl || null,
        });
      } else if (ev.type === 'gift') {
        spawnOrPromotePilgrim({
          username: ev.username || 'Học Sinh Giỏi',
          prayer: ev.comment || `Em tặng Cô ${ev.giftName || 'Hoa Điểm 10'} ạ!`,
          isVip: true,
          coins: Math.max(1, ev.coins || 1),
          comboCount: Math.max(1, Number(ev.repeatCount || ev.comboCount || 1)),
          isBot: false,
          avatarUrl: ev.avatarUrl || ev.profilePictureUrl || null,
          giftName: ev.giftName || 'Hoa Điểm 10',
        });
      } else if (ev.type === 'like') {
        handleTriggerLike(ev.likeCount || 5, ev.username || 'Học Sinh', false);
      } else if (ev.type === 'follow') {
        handleTriggerFollow(ev.username || 'Học Sinh Mới', false);
      }
    });

    const unsubSync = syncService.onSync((packet) => {
      const p = packet.payload || {};
      switch (packet.action) {
        case 'SPAWN_PILGRIM':
          spawnOrPromotePilgrim({
            username: p.username || 'Học Sinh',
            prayer: p.prayer || '',
            isVip: Boolean(p.isVip),
            coins: Number(p.coins || 0),
            isBot: Boolean(p.isBot),
            avatarUrl: p.avatarUrl,
            comboCount: p.comboCount,
            giftName: p.giftName,
            bypassWaitingQueue: Boolean(p.bypassWaitingQueue),
          });
          break;
        case 'LEAVE_ALL':
          setPilgrims((prev) =>
            prev.map((st) => ({
              ...st,
              slotId: null,
              state: 'leave_side_to_aisle',
              stateTimer: 0,
            }))
          );
          setVipSlots((prev) => prev.map((s) => ({ ...s, occupiedById: null })));
          setNormalSlots((prev) => prev.map((s) => ({ ...s, occupiedById: null })));
          break;
        case 'UPDATE_CONFIG':
          if (p.patch) {
            configRef.current = { ...configRef.current, ...p.patch };
            setConfig((prev) => ({ ...prev, ...p.patch }));
            if (
              Array.isArray(p.patch.customQuizQuestions) &&
              p.patch.customQuizQuestions.length > 0
            ) {
              setClassBoardState((prev) => {
                const liveBoard = classBoardStateRef.current;
                const updated: ClassBoardRuntimeState = {
                  ...prev,
                  ...liveBoard,
                  totalQuestions: p.patch.customQuizQuestions.length,
                };
                classBoardStateRef.current = updated;
                return updated;
              });
            }
          }
          break;
        case 'UPDATE_HUD_LAYOUT':
          if (p.patch) {
            setConfig((prev) => ({
              ...prev,
              hudLayout: { ...prev.hudLayout, ...p.patch },
            }));
          }
          break;
        case 'UPDATE_GRID':
          if (p.grid) {
            const built = buildDoubleDeskSlots(p.grid, configRef.current.redPrayZones);
            setVipSlots(built.vipSlots);
            setNormalSlots(built.normalSlots);
            setConfig((prev) => ({
              ...prev,
              grid: p.grid,
              maxStageCapacity: built.vipSlots.length + built.normalSlots.length,
            }));
          }
          break;
        case 'UPDATE_SLOTS': {
          const movedSlotMap = new Map<string, KneelSlot>();
          if (Array.isArray(p.vipSlots)) {
            const currentOccMap = new Map<string, number | null>();
            vipSlotsRef.current.forEach((s) => currentOccMap.set(s.id, s.occupiedById));
            const mergedVip: KneelSlot[] = p.vipSlots.map((incoming: KneelSlot) => {
              const preservedOcc = currentOccMap.has(incoming.id)
                ? currentOccMap.get(incoming.id) ?? null
                : null;
              const nextSlot = { ...incoming, occupiedById: preservedOcc };
              movedSlotMap.set(nextSlot.id, nextSlot);
              return nextSlot;
            });
            vipSlotsRef.current = mergedVip;
            setVipSlots(mergedVip);
          }
          if (Array.isArray(p.normalSlots)) {
            const currentOccMap = new Map<string, number | null>();
            normalSlotsRef.current.forEach((s) => currentOccMap.set(s.id, s.occupiedById));
            const mergedNorm: KneelSlot[] = p.normalSlots.map((incoming: KneelSlot) => {
              const preservedOcc = currentOccMap.has(incoming.id)
                ? currentOccMap.get(incoming.id) ?? null
                : null;
              const nextSlot = { ...incoming, occupiedById: preservedOcc };
              movedSlotMap.set(nextSlot.id, nextSlot);
              return nextSlot;
            });
            normalSlotsRef.current = mergedNorm;
            setNormalSlots(mergedNorm);
          }
          if (movedSlotMap.size > 0) {
            const nextPilgrims = pilgrimsRef.current.map((st) => {
              if (!st.slotId) return st;
              const nextSlot = movedSlotMap.get(st.slotId);
              if (!nextSlot) return st;
              const isSeated = st.state === 'pray_seated';
              return {
                ...st,
                slotX: nextSlot.x,
                slotY: nextSlot.y,
                laneX: nextSlot.aisleX ?? st.laneX,
                x: isSeated ? nextSlot.x : st.x,
                y: isSeated ? nextSlot.y : st.y,
                facingLeft: isSeated ? nextSlot.x < 270 : st.facingLeft,
              };
            });
            pilgrimsRef.current = nextPilgrims;
            setPilgrims(nextPilgrims);
          }
          break;
        }
        case 'TRIGGER_LIKE':
          handleTriggerLike(p.count || 15, p.username || 'Học Sinh', false);
          break;
        case 'TRIGGER_FOLLOW':
          handleTriggerFollow(p.username || 'Học Sinh', false);
          break;
        case 'TRIGGER_GRAND_EVENT':
          setGoldenLotusRainUntil(Date.now() + 3800);
          soundEngine.playBell(configRef.current.ttsVolume, null, true);
          break;
        case 'PANIC_MUTE':
          soundEngine.stopImmediate();
          flushPendingGiftPilgrims();
          break;
        case 'HOST_LIVE_TTS':
          if (p.text) {
            soundEngine.speakHostLiveText(String(p.text), configRef.current, {
              interrupt: p.interrupt,
              speakerRole: p.speakerRole,
            });
          }
          break;
        case 'TEACHER_LIVE_TTS': {
          if (p.text) {
            const cleanTxt = String(p.text).trim();
            const rateVal = Number(
              p.rate ?? configRef.current.teacherLiveRate ?? 1.0
            );
            soundEngine.speakTeacherLiveIndependent(cleanTxt, configRef.current, {
              volume: p.volume,
              rate: p.rate,
              pitch: p.pitch,
              engine: p.engine,
              voice: p.voice,
            });
            if (p.showBubble !== false) {
              const wordCount = cleanTxt.split(/\s+/).filter(Boolean).length;
              const bubbleDurMs = Math.max(
                3500,
                Math.min(
                  14000,
                  Math.round((wordCount * 350) / Math.max(0.5, rateVal)) + 1200
                )
              );
              const untilMs = Date.now() + bubbleDurMs;
              setMonks((prev) => {
                const next = prev.map((m) =>
                  m.role === 'senior_novice'
                    ? { ...m, chatText: cleanTxt, chatBubbleUntil: untilMs }
                    : m
                );
                monksRef.current = next;
                return next;
              });
            }
          }
          break;
        }
        case 'STOP_TEACHER_LIVE_TTS':
          soundEngine.stopTeacherLiveIndependent();
          setMonks((prev) => {
            const next = prev.map((m) =>
              m.role === 'senior_novice' ? { ...m, chatBubbleUntil: 0 } : m
            );
            monksRef.current = next;
            return next;
          });
          break;
        case 'CLEAR_TTS_QUEUE':
          soundEngine.clearEventQueue();
          flushPendingGiftPilgrims();
          break;
        case 'CLEAR_LOTUS_DONORS':
          setLotusDonors([]);
          break;
        case 'UPDATE_DAILY_RECORDS':
          if (Array.isArray(p.dailyRecords)) {
            const sliced = p.dailyRecords.slice(0, 5);
            dailyRecordsRef.current = sliced;
            setDailyRecords(sliced);
          }
          break;
        case 'CLEAR_DAILY_RECORDS':
          dailyRecordsRef.current = [];
          setDailyRecords([]);
          lastPraisedRecordTop1Ref.current = '';
          pendingRecordNoticeRef.current = null;
          break;
        case 'UPDATE_CUSTOM_ASSETS':
          if (p.assets) {
            setCustomAssets((prev) => ({ ...prev, ...p.assets }));
          }
          break;
        case 'SYNC_LIVE_TTS_SNAPSHOT': {
          const isPureLiveTab =
            typeof window !== 'undefined' &&
            (new URLSearchParams(window.location.search).get('view') === 'live' ||
              new URLSearchParams(window.location.search).get('mode') === 'live' ||
              new URLSearchParams(window.location.search).get('obs') === '1');
          if (!isPureLiveTab && p.queue) {
            soundEngine.applyMasterQueueSnapshot(p.queue, p.status);
          }
          break;
        }
        case 'REMOTE_BOARD_COMMAND': {
          const isPureLiveTab =
            typeof window !== 'undefined' &&
            (new URLSearchParams(window.location.search).get('view') === 'live' ||
              new URLSearchParams(window.location.search).get('mode') === 'live' ||
              new URLSearchParams(window.location.search).get('obs') === '1');
          if (isPureLiveTab && p.command) {
            remoteBoardCommandHandlersRef.current(String(p.command));
          }
          break;
        }
        case 'SYNC_CLASS_BOARD_STATE':
          if (p.state) {
            const incoming = p.state as ClassBoardRuntimeState;
            const current = classBoardStateRef.current;
            const incRound = incoming.roundSeq ?? 1;
            const curRound = current.roundSeq ?? 1;
            const incOrder = getLessonPhaseOrder(incoming.phase);
            const curOrder = getLessonPhaseOrder(current.phase);

            // Chặn gói đồng bộ trễ từ tab phụ / tab nền có số vòng (roundSeq) nhỏ hơn hoặc luồng cũ hơn trong cùng vòng
            if (
              !p.force &&
              (incRound < curRound ||
                (incRound === curRound && incOrder < curOrder))
            ) {
              break;
            }

            if (Array.isArray(p.customQuizQuestions)) {
              configRef.current = {
                ...configRef.current,
                customQuizQuestions: p.customQuizQuestions,
              };
              setConfig((prevCfg) => ({
                ...prevCfg,
                customQuizQuestions: p.customQuizQuestions,
              }));
            }

            // Gộp danh sách winners của cả 2 trình duyệt nếu đang cùng vòng câu hỏi để không làm mất trạng thái trả lời đúng của học sinh tại trình duyệt hiện tại
            const isSameRound =
              incRound === curRound &&
              (incoming.questionIndex ?? 0) === (current.questionIndex ?? 0);
            const mergedWinnersMap = new Map<string, ClassBoardQuizWinner>();
            if (isSameRound && Array.isArray(current.winners)) {
              current.winners.forEach((w) => {
                if (w?.username) {
                  mergedWinnersMap.set(w.username.trim().toLowerCase(), w);
                }
              });
            }
            if (Array.isArray(incoming.winners)) {
              incoming.winners.forEach((w) => {
                if (w?.username) {
                  const k = w.username.trim().toLowerCase();
                  if (!mergedWinnersMap.has(k)) {
                    mergedWinnersMap.set(k, w);
                  }
                }
              });
            }
            const mergedWinners = Array.from(mergedWinnersMap.values());
            const mergedClassWinners =
              mergedWinners.length > 0
                ? mergedWinners.filter((w) => w.isSeated !== false)
                : incoming.classWinners || [];
            const mergedOutsideWinners =
              mergedWinners.length > 0
                ? mergedWinners.filter((w) => w.isSeated === false)
                : incoming.outsideWinners || [];

            // Đánh dấu học sinh trong lớp hoặc hàng chờ tương ứng với danh sách trả lời đúng được đồng bộ sang
            if (mergedWinners.length > 0 && incoming.phase === 'asking') {
              const winnerSet = new Set(mergedWinnersMap.keys());
              let hasPilgrimMarkChange = false;
              const nextPilgrims = pilgrimsRef.current.map((st) => {
                if (
                  st.slotId !== null &&
                  st.state !== 'leave_side_to_aisle' &&
                  st.state !== 'leave_down_exit' &&
                  !st.answeredCurrentQuestion &&
                  winnerSet.has(st.username.trim().toLowerCase())
                ) {
                  hasPilgrimMarkChange = true;
                  return { ...st, answeredCurrentQuestion: true };
                }
                return st;
              });
              if (hasPilgrimMarkChange) {
                pilgrimsRef.current = nextPilgrims;
                setPilgrims(nextPilgrims);
              }
              mergedOutsideWinners.forEach((ow) => {
                const lower = (ow.username || '').trim().toLowerCase();
                const qEntry = waitingPoolRef.current.get(lower);
                if (qEntry) {
                  qEntry.answeredCorrectInRound = true;
                  qEntry.idleRounds = 0;
                }
              });
            }

            // Thực thi đầy đủ các tác vụ phụ (reset cờ trả lời ở Luồng 2, chấm điểm ở Luồng 4, sắp xếp lớp ở Luồng 5, vinh danh 3 Top ở Luồng Kết Thúc, và reset điểm sang vòng mới)
            // ngay khi nhận gói đồng bộ chuyển luồng từ trình duyệt kia!
            if (
              incoming.phase === 'lesson_start' &&
              current.phase === 'round_end' &&
              incRound > curRound
            ) {
              // Đồng bộ kết thúc vòng 15 câu sang vòng mới: reset toàn bộ điểm trong lớp & hàng chờ nhưng giữ nguyên chỗ ngồi
              lotusDonorsRef.current = [];
              setLotusDonors([]);
              recomputeWaitingQueueLazy({ resetAllRoundScores: true });
              const resetPilgrimsNewRound = pilgrimsRef.current.map((st) => {
                const wasOnPodium =
                  Boolean(st.podiumRank) ||
                  st.state === 'stand_punishment' ||
                  st.state === 'walk_to_punishment_spot';
                return {
                  ...st,
                  currentScoreDisplay: 0,
                  scoreChangeDelta: 0,
                  scoreCardUntil: 0,
                  correctStreak: 0,
                  answeredCurrentQuestion: false,
                  quizResultStatus: null,
                  quizResultUntil: 0,
                  quizEarnedPoints: 0,
                  podiumRank: undefined,
                  winnerMilkTeaScale: undefined,
                  isPunishedInCurrentRound: false,
                  punishmentMultiplier: undefined,
                  punishmentSpotPos: undefined,
                  punishmentSpotIndex: undefined,
                  state:
                    wasOnPodium && st.slotId
                      ? ('return_from_punishment_to_seat' as const)
                      : st.state,
                  stateTimer: wasOnPodium ? 0 : st.stateTimer,
                };
              });
              pilgrimsRef.current = resetPilgrimsNewRound;
              setPilgrims(resetPilgrimsNewRound);
            } else if (incoming.phase === 'asking') {
              ensureAskingPhaseSideEffects(
                incRound,
                incoming.questionIndex || 0,
                incoming.totalDurationMs || 12000
              );
            } else if (incoming.phase === 'answer_flash') {
              ensureAnswerFlashPhaseSideEffects(
                incRound,
                incoming.questionIndex || 0,
                mergedClassWinners,
                mergedOutsideWinners,
                true
              );
            } else if (
              incoming.phase === 'result_summary' ||
              incoming.phase === 'ranking_board' ||
              incoming.phase === 'round_end' ||
              incoming.phase === 'reveal'
            ) {
              ensureResultSummaryPhaseSideEffects(
                incRound,
                incoming.questionIndex || 0,
                mergedClassWinners,
                mergedOutsideWinners
              );

              // Nếu chuyển sang Luồng Kết Thúc (round_end), đồng bộ luôn việc mời 3 bạn chiến thắng bước lên bục giảng trên tab nhận
              if (
                incoming.phase === 'round_end' &&
                current.phase !== 'round_end' &&
                Array.isArray(incoming.podiumWinners) &&
                incoming.podiumWinners.length > 0
              ) {
                roundEndWinnersRef.current = incoming.podiumWinners;
                roundEndMilkTeaTriggeredRef.current = false;
                const lineCenter = configRef.current.punishmentLinePos || {
                  x: 270,
                  y: 458,
                };
                const lineSpacing = Math.max(
                  24,
                  configRef.current.punishmentLineSpacing || 52
                );
                const podiumSpotByRank: Record<1 | 2 | 3, number> = {
                  1: 2, // P3
                  2: 0, // P1
                  3: 4, // P5
                };
                const winnerRankByLower = new Map<string, 1 | 2 | 3>();
                incoming.podiumWinners.forEach((w) => {
                  if (w?.username) {
                    winnerRankByLower.set(
                      w.username.trim().toLowerCase(),
                      w.rank
                    );
                  }
                });
                const nextPilgrimsForPodium = pilgrimsRef.current.map((st) => {
                  const rank = winnerRankByLower.get(
                    st.username.trim().toLowerCase()
                  );
                  if (
                    !rank ||
                    st.state === 'leave_side_to_aisle' ||
                    st.state === 'leave_down_exit'
                  ) {
                    return st;
                  }
                  const spotIdx = podiumSpotByRank[rank];
                  const spotX = Math.max(
                    36,
                    Math.min(
                      504,
                      Math.round(lineCenter.x + (spotIdx - 2) * lineSpacing)
                    )
                  );
                  return {
                    ...st,
                    state: 'walk_to_punishment_spot' as const,
                    stateTimer: 0,
                    podiumRank: rank,
                    winnerMilkTeaScale: undefined,
                    isPunishedInCurrentRound: false,
                    punishmentMultiplier: undefined,
                    punishmentSpotIndex: spotIdx,
                    punishmentSpotPos: { x: spotX, y: lineCenter.y },
                  };
                });
                pilgrimsRef.current = nextPilgrimsForPodium;
                setPilgrims(nextPilgrimsForPodium);
              }
            }

            const isPhaseTransition =
              Boolean(p.force) ||
              incoming.phase !== current.phase ||
              incoming.roundSeq !== current.roundSeq ||
              incoming.questionIndex !== current.questionIndex;

            if (
              !soundEngine.isRemoteSlaveMode() &&
              Array.isArray(p.lessonTtsItems) &&
              p.lessonTtsItems.length > 0 &&
              isPhaseTransition
            ) {
              soundEngine.enqueueLessonFlowItems(
                p.lessonTtsItems,
                configRef.current
              );
            } else if (!incoming.isRunning && current.isRunning) {
              soundEngine.pauseLessonFlowTts();
            }

            // Nếu chỉ là gói đồng bộ cập nhật danh sách người trả lời đúng trong cùng 1 phase & cùng roundSeq,
            // bảo toàn bộ đếm thời gian & cờ TTS của tab hiện tại để không bao giờ gây giật lùi thời gian hoặc mất trạng thái TTS!
            const syncedState: ClassBoardRuntimeState = isPhaseTransition
              ? {
                  ...incoming,
                  winners: mergedWinners,
                  classWinners: mergedClassWinners,
                  outsideWinners: mergedOutsideWinners,
                  phaseEndAt:
                    incoming.phaseEndAt ||
                    Date.now() + Math.max(0, incoming.timeLeftMs || 0),
                }
              : {
                  ...current,
                  ...incoming,
                  winners: mergedWinners,
                  classWinners: mergedClassWinners,
                  outsideWinners: mergedOutsideWinners,
                  phaseEndAt:
                    current.phaseEndAt ||
                    incoming.phaseEndAt ||
                    Date.now() + Math.max(0, current.timeLeftMs || 0),
                  timeLeftMs: current.timeLeftMs,
                  elapsedPhaseMs: current.elapsedPhaseMs,
                  activeFlowToken:
                    current.activeFlowToken || incoming.activeFlowToken,
                  ttsFinishedForPhase: Boolean(
                    current.ttsFinishedForPhase || incoming.ttsFinishedForPhase
                  ),
                  ttsFinishedAtElapsedMs:
                    current.ttsFinishedAtElapsedMs ??
                    incoming.ttsFinishedAtElapsedMs,
                  idleChatTriggered: Boolean(
                    current.idleChatTriggered || incoming.idleChatTriggered
                  ),
                };
            classBoardStateRef.current = syncedState;
            setClassBoardState(syncedState);
          }
          break;
        case 'SYNC_ZOMBIE_EVENT_STATE':
          if (p.state) {
            zombieEventStateRef.current = p.state;
            setZombieEventState(p.state);
          }
          break;
        case 'TRIGGER_ZOMBIE_EVENT':
          startZombieEventFlowNow(Boolean(p.wasRunningLesson), false);
          break;
        case 'UPDATE_NPC_LISTS':
          if (Array.isArray(p.npcNames) && p.npcNames.length > 0) {
            setNpcNames(p.npcNames);
          }
          if (Array.isArray(p.npcPrayers) && p.npcPrayers.length > 0) {
            setNpcPrayers(p.npcPrayers);
          }
          if (Array.isArray(p.npcAvatars) && p.npcAvatars.length > 0) {
            setNpcAvatars(p.npcAvatars);
          }
          break;
        case 'UPDATE_SAFETY':
          if (
            p.safetyActionMode === 'purify' ||
            p.safetyActionMode === 'block' ||
            p.safetyActionMode === 'mask'
          ) {
            setSafetyActionMode(p.safetyActionMode);
          }
          if (Array.isArray(p.safetyCategories) && p.safetyCategories.length > 0) {
            setSafetyCategories(p.safetyCategories);
          }
          if (Array.isArray(p.customWords)) {
            setCustomWords(p.customWords);
            saveCustomWordsToStorage(p.customWords);
          }
          break;
        case 'SYNC_STUDENT_EXP':
          if (p.studentExpMap && typeof p.studentExpMap === 'object') {
            if (p.replaceAll) {
              studentExpMapRef.current.clear();
            }
            for (const [k, v] of Object.entries(p.studentExpMap)) {
              const cleanKey = String(k || '').trim().toLowerCase();
              const expVal = Math.floor(Number(v) || 0);
              if (cleanKey && expVal > 0) {
                const prev = studentExpMapRef.current.get(cleanKey) || 0;
                studentExpMapRef.current.set(
                  cleanKey,
                  p.replaceAll ? expVal : Math.max(prev, expVal)
                );
              }
            }
            applyExpMapToActiveStudents();
          }
          break;
        case 'TRIGGER_CLASSROOM_GIFT':
          handleTriggerClassroomGift({
            username: p.username,
            prayer: p.prayer,
            gender: p.gender,
            giftName: p.giftName,
            coins: Number(p.coins || 1),
            comboCount: Number(p.comboCount || 1),
            avatarUrl: p.avatarUrl,
            isBot: Boolean(p.isBot),
            broadcastSync: false,
          });
          break;
        default:
          break;
      }
    });

    return () => {
      unsubStatus();
      unsubPeers();
      unsubTikTok();
      unsubSync();
    };
  }, [
    applyExpMapToActiveStudents,
    ensureAnswerFlashPhaseSideEffects,
    ensureAskingPhaseSideEffects,
    ensureResultSummaryPhaseSideEffects,
    flushPendingGiftPilgrims,
    handleTriggerClassroomGift,
    handleTriggerFollow,
    handleTriggerLike,
    spawnOrPromotePilgrim,
  ]);

  // Đồng bộ vị trí Học Sinh đang ngồi hoặc đang đi tới bàn khi bàn đôi được di chuyển hoặc chỉnh khoảng cách 2 học sinh cùng bàn
  const syncPilgrimsWithMovedSlots = useCallback((movedSlots: KneelSlot[]) => {
    if (movedSlots.length === 0) return;
    const slotMap = new Map<string, KneelSlot>();
    movedSlots.forEach((s) => slotMap.set(s.id, s));

    const nextPilgrims = pilgrimsRef.current.map((p) => {
      if (!p.slotId) return p;
      const nextSlot = slotMap.get(p.slotId);
      if (!nextSlot) return p;
      const isSeated = p.state === 'pray_seated';
      return {
        ...p,
        slotX: nextSlot.x,
        slotY: nextSlot.y,
        laneX: nextSlot.aisleX ?? p.laneX,
        x: isSeated ? nextSlot.x : p.x,
        y: isSeated ? nextSlot.y : p.y,
        facingLeft: isSeated ? nextSlot.x < 270 : p.facingLeft,
      };
    });
    pilgrimsRef.current = nextPilgrims;
    setPilgrims(nextPilgrims);
  }, []);

  // Đồng bộ khoảng cách giữa 2 học sinh ngồi cùng 1 bàn đôi (studentSeatmateGap) ngay khi kéo thanh trượt trong Dev
  useEffect(() => {
    const gap = config.studentSeatmateGap ?? 36;
    const offset = Math.max(4, Math.min(48, Math.round(gap / 2)));

    const updateSlotsForGap = (slots: KneelSlot[], prefix: string): KneelSlot[] => {
      if (slots.length === 0) return slots;
      const desks = groupSlotsIntoDoubleDesks(slots, prefix);
      const updated = [...slots];
      let hasChange = false;

      desks.forEach((desk) => {
        const leftX = Math.round(desk.centerX - offset);
        const rightX = Math.round(desk.centerX + offset);
        if (updated[desk.leftIndex].x !== leftX) {
          hasChange = true;
          updated[desk.leftIndex] = {
            ...updated[desk.leftIndex],
            x: leftX,
            side: leftX < 270 ? 'left' : 'right',
            deskCenterX: desk.centerX,
            deskCenterY: desk.centerY,
            aisleX: Math.max(20, leftX - 24),
          };
        }
        if (desk.rightSlot && updated[desk.rightIndex].x !== rightX) {
          hasChange = true;
          updated[desk.rightIndex] = {
            ...updated[desk.rightIndex],
            x: rightX,
            side: rightX < 270 ? 'left' : 'right',
            deskCenterX: desk.centerX,
            deskCenterY: desk.centerY,
            aisleX: Math.min(520, rightX + 24),
          };
        }
      });

      return hasChange ? updated : slots;
    };

    const nextVip = updateSlotsForGap(vipSlotsRef.current, 'vip');
    const nextNorm = updateSlotsForGap(normalSlotsRef.current, 'norm');
    const changedSlots: KneelSlot[] = [];

    if (nextVip !== vipSlotsRef.current) {
      vipSlotsRef.current = nextVip;
      setVipSlots(nextVip);
      changedSlots.push(...nextVip);
    }
    if (nextNorm !== normalSlotsRef.current) {
      normalSlotsRef.current = nextNorm;
      setNormalSlots(nextNorm);
      changedSlots.push(...nextNorm);
    }
    if (changedSlots.length > 0) {
      syncPilgrimsWithMovedSlots(changedSlots);
    }
  }, [config.studentSeatmateGap, syncPilgrimsWithMovedSlots]);

  // Các hàm điều khiển cho Dev Studio
  const handleUpdateConfig = useCallback((patch: Partial<GameConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      syncService.sendCommand('UPDATE_CONFIG', { patch });
      return next;
    });

    if (patch.zombieEventEnabled === false) {
      setZombieEventState((prevZ) => {
        if (!prevZ.isActive && !prevZ.isQueued) return prevZ;
        const nextZ: ZombieEventRuntimeState = {
          ...prevZ,
          isActive: false,
          isQueued: false,
          phase: 'idle',
          activeFlowToken: undefined,
          ttsFinishedForPhase: false,
          elapsedPhaseMs: 0,
          timeLeftMs: 0,
        };
        zombieEventStateRef.current = nextZ;
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: nextZ });
        return nextZ;
      });
      setZombieEntity((prevE) => {
        const nextE = {
          ...prevE,
          visible: false,
          isWalking: false,
          isDying: false,
        };
        zombieEntityRef.current = nextE;
        return nextE;
      });
    }

    // Đồng bộ độc lập Cấp (zombieLevel) và HP (zombieMaxHp) của Zombie do Dev set
    if (patch.zombieLevel !== undefined || patch.zombieMaxHp !== undefined) {
      setZombieEventState((prevZ) => {
        const nextLevel =
          patch.zombieLevel !== undefined
            ? Math.max(1, patch.zombieLevel)
            : prevZ.level;
        const nextMaxHp =
          patch.zombieMaxHp !== undefined
            ? Math.max(100, patch.zombieMaxHp)
            : prevZ.maxHp;
        const isIdle = !prevZ.isActive || prevZ.phase === 'idle';
        const nextHp =
          patch.zombieMaxHp !== undefined
            ? isIdle
              ? nextMaxHp
              : Math.min(prevZ.hp, nextMaxHp)
            : prevZ.hp;
        const updatedZ: ZombieEventRuntimeState = {
          ...prevZ,
          level: nextLevel,
          maxHp: nextMaxHp,
          hp: nextHp,
          trailHp: isIdle ? nextMaxHp : Math.min(prevZ.trailHp, nextMaxHp),
        };
        zombieEventStateRef.current = updatedZ;
        return updatedZ;
      });
    }
  }, []);

  const handleUpdateHudLayout = useCallback(
    (patch: Partial<HudLayoutConfig>) => {
      setConfig((prev) => {
        const nextHud = { ...prev.hudLayout, ...patch };
        configRef.current = { ...prev, hudLayout: nextHud };
        syncService.sendCommand('UPDATE_HUD_LAYOUT', { patch });
        return { ...prev, hudLayout: nextHud };
      });
      if (patch.classBoardEngine !== undefined) {
        const prevBoard = classBoardStateRef.current;
        const targetEngine = patch.classBoardEngine;
        // Khi chuyển tiết học qua Bảng Thông Báo (hoặc Bảng Kết Quả), Tiết Tiếng Anh tự động chuyển sang Tạm dừng và giữ nguyên luồng đang dừng
        if (targetEngine !== 'english_quiz') {
          clearQuizNpcTimers();
          soundEngine.pauseLessonFlowTts();
          const pausedState: ClassBoardRuntimeState = {
            ...prevBoard,
            engine: targetEngine,
            isRunning: false,
          };
          classBoardStateRef.current = pausedState;
          setClassBoardState(pausedState);
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
            state: pausedState,
            force: true,
          });
        } else if (prevBoard.engine !== 'english_quiz') {
          // Khi trả về Tiết Tiếng Anh, giữ nguyên trạng thái tạm dừng ở luồng đang bị dừng để người dùng bấm Tiếp tục / Chạy tiếp
          const returnedState: ClassBoardRuntimeState = {
            ...prevBoard,
            engine: 'english_quiz',
            isRunning: false,
          };
          classBoardStateRef.current = returnedState;
          setClassBoardState(returnedState);
          syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
            state: returnedState,
            force: true,
          });
        }
      }
      if (patch.showGrandEventBox === false) {
        setFlyingLotuses([]);
      }
      if (patch.waitingQueueMaxRanks !== undefined) {
        recomputeWaitingQueueLazy();
      }
    },
    [clearQuizNpcTimers, recomputeWaitingQueueLazy]
  );

  // Điều khiển Bảng Lớp Lớn - Nút 1: Tạm dừng / Chạy tiếp (Tiếp tục đúng luồng đang bị dừng)
  const handleToggleClassBoardRun = useCallback(() => {
    const isPureLiveTab =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'live' ||
        new URLSearchParams(window.location.search).get('mode') === 'live' ||
        new URLSearchParams(window.location.search).get('obs') === '1');
    if (peerCountsRef.current.obsPeers > 0 && !isPureLiveTab) {
      syncService.sendCommand('REMOTE_BOARD_COMMAND', { command: 'toggle_run' });
    }

    const cfg = configRef.current;
    const prev = classBoardStateRef.current;
    const nextRunning = !prev.isRunning;
    const quizList = getActiveQuizList(cfg);
    const safeIdx = prev.questionIndex % quizList.length;
    const curQuiz = prev.currentQuestion || quizList[safeIdx] || quizList[0];

    if (!nextRunning) {
      // TẠM DỪNG: Giữ nguyên toàn bộ luồng hiện tại (phase, timeLeftMs, winners...)
      clearQuizNpcTimers();
      soundEngine.pauseLessonFlowTts();
      const stoppedState: ClassBoardRuntimeState = {
        ...prev,
        isRunning: false,
      };
      classBoardStateRef.current = stoppedState;
      setClassBoardState(stoppedState);
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
        state: stoppedState,
        force: true,
      });
      return;
    }

    // CHẠY TIẾP (TIẾP TỤC LUỒNG ĐANG BỊ DỪNG):
    if (cfg.hudLayout.classBoardEngine !== 'english_quiz') {
      setConfig((prevCfg) => {
        const nextHud = {
          ...prevCfg.hudLayout,
          classBoardEngine: 'english_quiz' as const,
        };
        configRef.current = { ...prevCfg, hudLayout: nextHud };
        syncService.sendCommand('UPDATE_HUD_LAYOUT', {
          patch: { classBoardEngine: 'english_quiz' },
        });
        return { ...prevCfg, hudLayout: nextHud };
      });
    }

    let resumedTtsItems:
      | Array<{
          text: string;
          lang?: 'vi' | 'en';
          lessonFlowToken?: string;
          lessonStepLabel?: string;
        }>
      | undefined;

    let resumedState: ClassBoardRuntimeState = {
      ...prev,
      engine: 'english_quiz',
      isRunning: true,
      currentQuestion: curQuiz,
      totalQuestions: quizList.length,
    };

    if (prev.phase === 'lesson_start') {
      if (!prev.ttsFinishedForPhase && (prev.elapsedPhaseMs || 0) < 2500) {
        const startSpeech =
          prev.lessonStartText ||
          cfg.lessonStartTtsText ||
          'Chào mừng các em đến với tiết Tiếng Anh lớp 12A1! Các em hãy chú ý lên bảng và bình luận đáp án thật nhanh để giành ghế ngồi trong lớp nhé!';
        const flowToken0 = `flow_resume0_${Date.now()}`;
        resumedTtsItems = [
          {
            text: startSpeech,
            lang: 'vi',
            lessonFlowToken: flowToken0,
            lessonStepLabel: 'Luồng 0: Bắt đầu tiết học (Chạy tiếp)',
          },
        ];
        const enqueued0 = soundEngine.isRemoteSlaveMode()
          ? true
          : soundEngine.enqueueLessonFlowItems(resumedTtsItems, cfg);
        const remDur0 = Math.max(3200, prev.timeLeftMs || 12000);
        resumedState = {
          ...resumedState,
          activeFlowToken: flowToken0,
          ttsFinishedForPhase: !enqueued0,
          timeLeftMs: remDur0,
          phaseEndAt: Date.now() + remDur0,
        };
      } else {
        const remShort0 = Math.max(1200, Math.min(3000, prev.timeLeftMs || 2000));
        resumedState = {
          ...resumedState,
          ttsFinishedForPhase: true,
          timeLeftMs: remShort0,
          phaseEndAt: Date.now() + remShort0,
        };
      }
    } else if (prev.phase === 'preparing') {
      const remPrepMs =
        prev.timeLeftMs > 600
          ? prev.timeLeftMs
          : Math.max(1500, (cfg.lessonPrepareDurationSec || 3) * 1000);
      if ((prev.elapsedPhaseMs || 0) < 1000) {
        const prepSpeech = pickRandomLessonPrepSpeech(cfg);
        resumedTtsItems = [
          {
            text: prepSpeech,
            lang: 'vi',
            lessonStepLabel: 'Luồng 1: Chuẩn bị (Chạy tiếp)',
          },
        ];
        soundEngine.playWoodenFish(cfg.ttsVolume * 0.65);
        if (!soundEngine.isRemoteSlaveMode()) {
          soundEngine.enqueueLessonFlowItems(resumedTtsItems, cfg);
        }
      }
      resumedState = {
        ...resumedState,
        timeLeftMs: remPrepMs,
        phaseEndAt: Date.now() + remPrepMs,
      };
    } else if (prev.phase === 'asking') {
      const defaultAskMs = getQuestionAskDurationSec(cfg, curQuiz) * 1000;
      const remAskMs =
        prev.timeLeftMs > 1500
          ? prev.timeLeftMs
          : Math.min(5000, defaultAskMs);
      if (
        (prev.elapsedPhaseMs || 0) < 2500 &&
        (cfg.hudLayout.classBoardTtsReadQuestion ?? true)
      ) {
        const questionTpl =
          cfg.lessonQuestionTtsTemplate ||
          'Câu hỏi số [SốCâu]: [NghĩaViệt] tiếng Anh là gì, gồm [SốChữ] chữ cái?';
        const askSpeech = questionTpl
          .replace(/\[SốCâu\]|\{index\}/gi, String(safeIdx + 1))
          .replace(/\[NghĩaViệt\]|\{vi\}/gi, curQuiz.vi)
          .replace(/\[SốChữ\]|\{len\}/gi, String(curQuiz.en.length))
          .replace(/\[ĐápÁn\]|\{en\}/gi, curQuiz.en);
        resumedTtsItems = [
          {
            text: askSpeech,
            lang: 'vi',
            lessonStepLabel: `Luồng 2: Đọc câu hỏi "${curQuiz.vi}" (Chạy tiếp)`,
          },
        ];
        if (!soundEngine.isRemoteSlaveMode()) {
          soundEngine.enqueueLessonFlowItems(resumedTtsItems, cfg);
        }
      }
      scheduleQuizNpcAnswers(safeIdx, remAskMs);
      resumedState = {
        ...resumedState,
        activeFlowToken: undefined,
        ttsFinishedForPhase: true,
        timeLeftMs: remAskMs,
        phaseEndAt: Date.now() + remAskMs,
      };
    } else {
      // Các luồng phụ thuộc TTS (Luồng 4 answer_flash, Luồng 5 result_summary, Luồng 6 ranking_board, record_notice, punishment_notice):
      // Nếu lúc tạm dừng câu đọc bị ngắt thì đánh dấu hoàn tất TTS để luồng tiếp tục đếm nốt nhịp nghỉ rồi chuyển sang luồng kế tiếp mượt mà
      const remOtherMs = Math.max(1800, Math.min(prev.timeLeftMs || 2800, 4000));
      resumedState = {
        ...resumedState,
        ttsFinishedForPhase: true,
        ttsFinishedAtElapsedMs: prev.elapsedPhaseMs || 0,
        timeLeftMs: remOtherMs,
        phaseEndAt: Date.now() + remOtherMs,
      };
    }

    classBoardStateRef.current = resumedState;
    setClassBoardState(resumedState);
    if (peerCountsRef.current.obsPeers === 0 || isPureLiveTab) {
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
        state: resumedState,
        lessonTtsItems: resumedTtsItems,
        force: true,
      });
    }
  }, [clearQuizNpcTimers, getActiveQuizList, scheduleQuizNpcAnswers]);

  // Điều khiển Bảng Lớp Lớn - Nút 2: Chạy từ đầu (Reset về Luồng 0: Bắt đầu tiết học)
  const handleRestartClassBoardFromStart = useCallback(() => {
    const isPureLiveTab =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'live' ||
        new URLSearchParams(window.location.search).get('mode') === 'live' ||
        new URLSearchParams(window.location.search).get('obs') === '1');
    if (peerCountsRef.current.obsPeers > 0 && !isPureLiveTab) {
      syncService.sendCommand('REMOTE_BOARD_COMMAND', {
        command: 'restart_from_start',
      });
    }

    const cfg = configRef.current;
    const prev = classBoardStateRef.current;
    const quizList = build15MinuteTieredRoundQuestions(cfg);
    const safeIdx = 0;
    const curQuiz = quizList[0];

    configRef.current = {
      ...configRef.current,
      customQuizQuestions: quizList,
    };
    setConfig((prevCfg) => ({
      ...prevCfg,
      customQuizQuestions: quizList,
    }));

    clearQuizNpcTimers();
    if (cfg.hudLayout.classBoardEngine !== 'english_quiz') {
      setConfig((prevCfg) => {
        const nextHud = {
          ...prevCfg.hudLayout,
          classBoardEngine: 'english_quiz' as const,
        };
        configRef.current = { ...prevCfg, hudLayout: nextHud };
        syncService.sendCommand('UPDATE_HUD_LAYOUT', {
          patch: { classBoardEngine: 'english_quiz' },
        });
        return { ...prevCfg, hudLayout: nextHud };
      });
    }

    setPilgrims((pList) => {
      const nextList = pList.map((p) => {
        const wasOnPodium =
          Boolean(p.podiumRank) ||
          p.state === 'stand_punishment' ||
          p.state === 'walk_to_punishment_spot';
        return {
          ...p,
          state:
            wasOnPodium && p.slotId
              ? ('pray_seated' as const)
              : p.state,
          x: wasOnPodium && p.slotX !== undefined ? p.slotX : p.x,
          y: wasOnPodium && p.slotY !== undefined ? p.slotY : p.y,
          facingLeft:
            wasOnPodium && p.slotX !== undefined ? p.slotX < 270 : p.facingLeft,
          podiumRank: undefined,
          winnerMilkTeaScale: undefined,
          answeredCurrentQuestion: false,
          quizAnswerRight: false,
          quizResultStatus: null,
          quizResultUntil: 0,
          quizEarnedPoints: 0,
        };
      });
      pilgrimsRef.current = nextList;
      return nextList;
    });

    const startSpeech =
      cfg.lessonStartTtsText ||
      'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 15 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.';
    const flowToken0 = `flow_start_${Date.now()}`;
    const startTtsItems = [
      {
        text: startSpeech,
        lang: 'vi' as const,
        lessonFlowToken: flowToken0,
        lessonStepLabel: 'Luồng 0: Bắt đầu tiết học',
      },
    ];

    soundEngine.playBell(cfg.ttsVolume * 0.65);
    const enqueued0 = soundEngine.isRemoteSlaveMode()
      ? true
      : soundEngine.enqueueLessonFlowItems(startTtsItems, cfg);

    const dur0 = enqueued0 ? 14000 : 3200;
    const nextRoundSeq = (prev.roundSeq || 1) + 1;
    const nextState: ClassBoardRuntimeState = {
      ...prev,
      engine: 'english_quiz',
      isRunning: true,
      roundSeq: nextRoundSeq,
      questionIndex: safeIdx,
      roundQuestionIndex: 0,
      totalQuestions: QUESTIONS_PER_ROUND,
      currentQuestion: curQuiz,
      phase: 'lesson_start',
      lessonStepNumber: 0,
      lessonStartText: startSpeech,
      activeFlowToken: flowToken0,
      ttsFinishedForPhase: !enqueued0,
      idleChatTriggered: false,
      elapsedPhaseMs: 0,
      timeLeftMs: dur0,
      totalDurationMs: dur0,
      phaseEndAt: Date.now() + dur0,
      winners: [],
      classWinners: [],
      outsideWinners: [],
      podiumWinners: undefined,
      roundEndNoticeText: undefined,
      showResultEngine: false,
      seatUpdateTriggered: false,
    };
    classBoardStateRef.current = nextState;
    setClassBoardState(nextState);
    if (peerCountsRef.current.obsPeers === 0 || isPureLiveTab) {
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
        state: nextState,
        lessonTtsItems: startTtsItems,
        customQuizQuestions: quizList,
        force: true,
      });
    }
  }, [clearQuizNpcTimers, getActiveQuizList]);

  // Điều khiển Bảng Thông Báo: Bấm Chạy Bảng Thông Báo -> Cô Thảo đọc dòng chữ hiện tại trong bảng thông báo
  const handleRunNoticeBoard = useCallback(() => {
    const isPureLiveTab =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'live' ||
        new URLSearchParams(window.location.search).get('mode') === 'live' ||
        new URLSearchParams(window.location.search).get('obs') === '1');
    if (peerCountsRef.current.obsPeers > 0 && !isPureLiveTab) {
      syncService.sendCommand('REMOTE_BOARD_COMMAND', {
        command: 'run_notice',
      });
    }

    const cfg = configRef.current;
    const rawNotice =
      cfg.hudLayout.noticeBoardContent ??
      'Chào mừng các bạn học sinh vào lớp 12A1! Bình luận để giơ tay phát biểu và nhận Hoa Điểm 10 🌺';
    const cleanNotice = rawNotice.trim();
    if (!cleanNotice) return;

    // Đảm bảo Tiết Tiếng Anh đang ở trạng thái Tạm dừng và bảng đang ở chế độ Bảng Thông Báo
    clearQuizNpcTimers();
    const curBoard = classBoardStateRef.current;
    const noticeState: ClassBoardRuntimeState = {
      ...curBoard,
      engine: 'notice',
      isRunning: false,
    };
    classBoardStateRef.current = noticeState;
    setClassBoardState(noticeState);

    // Hiển thị bong bóng lời nói của Cô Thảo trên bục giảng
    const bubbleDurationMs = Math.max(4500, Math.min(18000, cleanNotice.length * 90));
    setMonks((prevMonks) =>
      prevMonks.map((m) =>
        m.role === 'abbot'
          ? {
              ...m,
              speechText: cleanNotice,
              speakingUntil: Date.now() + bubbleDurationMs,
            }
          : m
      )
    );

    const noticeTtsItems = [
      {
        text: cleanNotice,
        lang: 'vi' as const,
        lessonStepLabel: '📋 Bảng Thông Báo: Cô đọc thông báo',
        speakerRole: 'abbot' as const,
      },
    ];

    soundEngine.playBell(cfg.ttsVolume * 0.5);
    if (!soundEngine.isRemoteSlaveMode()) {
      soundEngine.enqueueLessonFlowItems(noticeTtsItems, cfg);
    }

    if (peerCountsRef.current.obsPeers === 0 || isPureLiveTab) {
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
        state: noticeState,
        lessonTtsItems: noticeTtsItems,
        force: true,
      });
    }
  }, [clearQuizNpcTimers]);

  // Chuyển nhanh sang câu hỏi tiếp theo trên Bảng Lớp (xóa câu hỏi cũ khỏi hàng chờ câu hỏi + vào Luồng 1: Chuẩn Bị 3s)
  const handleNextClassBoardQuestion = useCallback(() => {
    const isPureLiveTab =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'live' ||
        new URLSearchParams(window.location.search).get('mode') === 'live' ||
        new URLSearchParams(window.location.search).get('obs') === '1');
    if (peerCountsRef.current.obsPeers > 0 && !isPureLiveTab) {
      syncService.sendCommand('REMOTE_BOARD_COMMAND', {
        command: 'next_question',
      });
    }

    const cfg = configRef.current;
    const prev = classBoardStateRef.current;
    const { nextQuizList, nextQuiz } = consumeCurrentAndGetNextQuizQueue(
      cfg,
      prev.questionIndex,
      prev.currentQuestion
    );
    const nextIdx = 0;
    const nextRoundQuestionIdx =
      ((prev.roundQuestionIndex ?? 0) + 1) % QUESTIONS_PER_ROUND;
    const nextRoundSeq = (prev.roundSeq || 1) + 1;
    configRef.current = {
      ...configRef.current,
      customQuizQuestions: nextQuizList,
    };
    setConfig((prevCfg) => ({
      ...prevCfg,
      customQuizQuestions: nextQuizList,
    }));
    const askDurMs = getQuestionAskDurationSec(cfg, nextQuiz) * 1000;

    clearQuizNpcTimers();
    if (flow5CameraLockTimerRef.current !== null) {
      window.clearTimeout(flow5CameraLockTimerRef.current);
      flow5CameraLockTimerRef.current = null;
    }
    if (flow5LockedStudentIdRef.current !== null) {
      const lockedTop1Id = flow5LockedStudentIdRef.current;
      flow5LockedStudentIdRef.current = null;
      setCameraFocus((prevCam) =>
        prevCam.pilgrimId === lockedTop1Id && !prevCam.lockedUntil
          ? { pilgrimId: null, focusRole: null, until: 0 }
          : prevCam
      );
    }
    setPilgrims((pList) => {
      const nextList = pList.map((p) => ({
        ...p,
        podiumRank: undefined,
        winnerMilkTeaScale: undefined,
        answeredCurrentQuestion: false,
        quizAnswerRight: false,
        quizResultStatus: null,
        quizResultUntil: 0,
        quizEarnedPoints: 0,
      }));
      pilgrimsRef.current = nextList;
      return nextList;
    });

    const isRunning = prev.isRunning;
    const prepDurMs = 3000;
    const targetDur = isRunning ? prepDurMs : askDurMs;
    const nextState: ClassBoardRuntimeState = {
      ...prev,
      roundSeq: nextRoundSeq,
      questionIndex: nextIdx,
      roundQuestionIndex: nextRoundQuestionIdx,
      totalQuestions: QUESTIONS_PER_ROUND,
      currentQuestion: nextQuiz,
      phase: isRunning ? 'preparing' : 'asking',
      lessonStepNumber: isRunning ? 1 : 2,
      activeFlowToken: undefined,
      ttsFinishedForPhase: false,
      elapsedPhaseMs: 0,
      timeLeftMs: targetDur,
      totalDurationMs: targetDur,
      phaseEndAt: Date.now() + targetDur,
      winners: [],
      classWinners: [],
      outsideWinners: [],
      podiumWinners: undefined,
      roundEndNoticeText: undefined,
      showResultEngine: false,
      seatUpdateTriggered: false,
    };
    classBoardStateRef.current = nextState;
    setClassBoardState(nextState);
    if (peerCountsRef.current.obsPeers === 0 || isPureLiveTab) {
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
        state: nextState,
        customQuizQuestions: nextQuizList,
        force: true,
      });
    }

    enqueueBatchNpcsAfterQuestion();

    if (isRunning && !soundEngine.isRemoteSlaveMode()) {
      const prepSpeech = pickRandomLessonPrepSpeech(cfg);
      soundEngine.playWoodenFish(cfg.ttsVolume * 0.65);
      soundEngine.enqueueLessonFlowItems(
        [
          {
            text: prepSpeech,
            lang: 'vi',
            lessonStepLabel: 'Luồng 1: Chuẩn bị (3s)',
          },
        ],
        cfg
      );
    }
  }, [
    clearQuizNpcTimers,
    enqueueBatchNpcsAfterQuestion,
    getActiveQuizList,
  ]);

  remoteBoardCommandHandlersRef.current = (cmd: string) => {
    if (cmd === 'toggle_run') {
      handleToggleClassBoardRun();
    } else if (cmd === 'restart_from_start') {
      handleRestartClassBoardFromStart();
    } else if (cmd === 'run_notice') {
      handleRunNoticeBoard();
    } else if (cmd === 'next_question') {
      handleNextClassBoardQuestion();
    }
  };

  // Nút test giả lập 1 học sinh comment đúng đáp án câu hỏi hiện tại trên Bảng Lớp
  const handleSimulateQuizAnswer = useCallback(
    (customUsername?: string) => {
      const cfg = configRef.current;
      const bState = classBoardStateRef.current;
      const quizList = getActiveQuizList(cfg);
      const curQuiz = bState.currentQuestion || quizList[0];

      // Ưu tiên chọn ngẫu nhiên 1 học sinh đang ngồi trong lớp hoặc ngoài lớp để test cả 2 cột
      const seatedList = pilgrimsRef.current.filter(
        (p) => p.state === 'pray_seated' && !p.answeredCurrentQuestion
      );
      const names =
        npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
      const randomUser =
        (customUsername || '').trim() ||
        (seatedList.length > 0 && Math.random() < 0.65
          ? seatedList[Math.floor(Math.random() * seatedList.length)].username
          : names[Math.floor(Math.random() * names.length)]);
      const comment = formatShortQuizAnswer(curQuiz.en);

      spawnOrPromotePilgrim({
        username: randomUser,
        prayer: comment,
        isVip: false,
        coins: 0,
        isBot: false,
        isSimulatedTest: true,
      });
      syncService.sendCommand('SPAWN_PILGRIM', {
        username: randomUser,
        prayer: comment,
        isVip: false,
        coins: 0,
        isBot: false,
      });
    },
    [getActiveQuizList, spawnOrPromotePilgrim]
  );

  // Các hàm điều khiển Hàng Chờ Vào Lớp trên Dev Studio: Giả lập 1 người thật comment "vào lớp"
  const handleEnqueueWaitingStudent = useCallback(
    (customUsername?: string, customComment?: string) => {
      const names =
        npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
      const busyNames = new Set<string>([
        ...pilgrimsRef.current
          .filter(
            (p) =>
              p.state !== 'leave_side_to_aisle' && p.state !== 'leave_down_exit'
          )
          .map((p) => p.username.trim().toLowerCase()),
        ...Array.from(waitingPoolRef.current.keys()),
      ]);

      let chosenName = (customUsername || '').trim();
      if (!chosenName || busyNames.has(chosenName.toLowerCase())) {
        const available = names.filter(
          (n) => !busyNames.has(n.trim().toLowerCase())
        );
        if (available.length > 0) {
          chosenName = available[Math.floor(Math.random() * available.length)];
        } else {
          const base = names[Math.floor(Math.random() * names.length)] || 'Học Sinh';
          chosenName = `${base} #${waitingPoolRef.current.size + 1}`;
        }
      }

      const rawText = (customComment || '').trim();
      const comment =
        rawText && isJoinClassCommand(rawText) ? rawText : 'vào lớp';

      spawnOrPromotePilgrim({
        username: chosenName,
        prayer: comment,
        isVip: false,
        coins: 0,
        isBot: false,
        isSimulatedTest: true,
      });
      syncService.sendCommand('SPAWN_PILGRIM', {
        username: chosenName,
        prayer: comment,
        isVip: false,
        coins: 0,
        isBot: false,
      });
    },
    [spawnOrPromotePilgrim]
  );

  const handleRemoveWaitingQueueItem = useCallback(
    (username: string) => {
      waitingPoolRef.current.delete(username.trim().toLowerCase());
      recomputeWaitingQueueLazy();
    },
    [recomputeWaitingQueueLazy]
  );

  const handleClearWaitingQueue = useCallback(() => {
    waitingPoolRef.current.clear();
    recomputeWaitingQueueLazy();
  }, [recomputeWaitingQueueLazy]);

  const handleClearNpcWaitingQueue = useCallback(() => {
    for (const [key, item] of waitingPoolRef.current.entries()) {
      if (item.isBot) {
        waitingPoolRef.current.delete(key);
      }
    }
    recomputeWaitingQueueLazy();
  }, [recomputeWaitingQueueLazy]);

  const handleAdmitNextWaitingStudent = useCallback(() => {
    if (waitingPoolRef.current.size === 0) return;
    const firstKey = waitingPoolRef.current.keys().next().value;
    if (!firstKey) return;
    const nextReq = waitingPoolRef.current.get(firstKey)!;
    waitingPoolRef.current.delete(firstKey);
    recomputeWaitingQueueLazy();
    spawnOrPromotePilgrim(nextReq, { forceAdmitFromQueue: true });
  }, [recomputeWaitingQueueLazy, spawnOrPromotePilgrim]);

  // Thêm 1 Bàn Đôi (2 chỗ ngồi) mà vẫn giữ nguyên vị trí các bàn hiện có
  const handleAddDesk = useCallback((kind: 'vip' | 'normal') => {
    const cfg = configRef.current;
    if (kind === 'vip') {
      const currentDesks = groupSlotsIntoDoubleDesks(vipSlotsRef.current, 'vip');
      const [leftSeat, rightSeat] = createSingleDoubleDeskSlots(
        'vip',
        currentDesks.length,
        cfg.grid,
        cfg.redPrayZones,
        cfg.studentSeatmateGap
      );
      const nextVip = [...vipSlotsRef.current, leftSeat, rightSeat];
      const nextVipDesksCount = currentDesks.length + 1;
      setVipSlots(nextVip);
      setConfig((prev) => ({
        ...prev,
        maxStageCapacity: nextVip.length + normalSlotsRef.current.length,
        grid: {
          ...prev.grid,
          vipDesks: nextVipDesksCount,
          vipCount: nextVip.length,
        },
      }));
      syncService.sendCommand('UPDATE_SLOTS', {
        vipSlots: nextVip,
        normalSlots: normalSlotsRef.current,
      });
    } else {
      const currentDesks = groupSlotsIntoDoubleDesks(normalSlotsRef.current, 'norm');
      const [leftSeat, rightSeat] = createSingleDoubleDeskSlots(
        'normal',
        currentDesks.length,
        cfg.grid,
        cfg.redPrayZones,
        cfg.studentSeatmateGap
      );
      const nextNorm = [...normalSlotsRef.current, leftSeat, rightSeat];
      const nextNormDesksCount = currentDesks.length + 1;
      setNormalSlots(nextNorm);
      setConfig((prev) => ({
        ...prev,
        maxStageCapacity: vipSlotsRef.current.length + nextNorm.length,
        grid: {
          ...prev.grid,
          normalDesks: nextNormDesksCount,
        },
      }));
      syncService.sendCommand('UPDATE_SLOTS', {
        vipSlots: vipSlotsRef.current,
        normalSlots: nextNorm,
      });
    }
  }, []);

  // Xóa 1 Bàn Đôi (2 chỗ ngồi) cụ thể hoặc bàn cuối cùng
  const handleRemoveDesk = useCallback(
    (kind: 'vip' | 'normal', targetDeskId?: string) => {
      if (kind === 'vip') {
        const desks = groupSlotsIntoDoubleDesks(vipSlotsRef.current, 'vip');
        if (desks.length === 0) return;
        const target = targetDeskId
          ? desks.find((d) => d.deskId === targetDeskId)
          : desks[desks.length - 1];
        if (!target) return;

        const removeIds = new Set<string>([target.leftSlot.id]);
        if (target.rightSlot) removeIds.add(target.rightSlot.id);

        const nextVip = vipSlotsRef.current.filter((s) => !removeIds.has(s.id));
        const nextVipDesksCount = Math.max(0, desks.length - 1);
        setVipSlots(nextVip);
        setPilgrims((prev) =>
          prev.map((p) =>
            p.slotId && removeIds.has(p.slotId)
              ? { ...p, slotId: null, state: 'leave_side_to_aisle', stateTimer: 0 }
              : p
          )
        );
        setConfig((prev) => ({
          ...prev,
          maxStageCapacity: nextVip.length + normalSlotsRef.current.length,
          grid: {
            ...prev.grid,
            vipDesks: nextVipDesksCount,
            vipCount: nextVip.length,
          },
        }));
        syncService.sendCommand('UPDATE_SLOTS', {
          vipSlots: nextVip,
          normalSlots: normalSlotsRef.current,
        });
      } else {
        const desks = groupSlotsIntoDoubleDesks(normalSlotsRef.current, 'norm');
        if (desks.length <= 1) return; // Giữ tối thiểu 1 bàn học sinh thường
        const target = targetDeskId
          ? desks.find((d) => d.deskId === targetDeskId)
          : desks[desks.length - 1];
        if (!target) return;

        const removeIds = new Set<string>([target.leftSlot.id]);
        if (target.rightSlot) removeIds.add(target.rightSlot.id);

        const nextNorm = normalSlotsRef.current.filter((s) => !removeIds.has(s.id));
        const nextNormDesksCount = Math.max(1, desks.length - 1);
        setNormalSlots(nextNorm);
        setPilgrims((prev) =>
          prev.map((p) =>
            p.slotId && removeIds.has(p.slotId)
              ? { ...p, slotId: null, state: 'leave_side_to_aisle', stateTimer: 0 }
              : p
          )
        );
        setConfig((prev) => ({
          ...prev,
          maxStageCapacity: vipSlotsRef.current.length + nextNorm.length,
          grid: {
            ...prev.grid,
            normalDesks: nextNormDesksCount,
          },
        }));
        syncService.sendCommand('UPDATE_SLOTS', {
          vipSlots: vipSlotsRef.current,
          normalSlots: nextNorm,
        });
      }
    },
    []
  );

  // Xóa danh sách các bàn đôi đang được chọn trên sân
  const handleRemoveDesksByIds = useCallback((deskIds: string[]) => {
    if (!deskIds || deskIds.length === 0) return;
    const idSet = new Set(deskIds);

    const vipDesks = groupSlotsIntoDoubleDesks(vipSlotsRef.current, 'vip');
    const normDesks = groupSlotsIntoDoubleDesks(normalSlotsRef.current, 'norm');

    const removeSlotIds = new Set<string>();
    vipDesks.forEach((d) => {
      if (idSet.has(d.deskId)) {
        removeSlotIds.add(d.leftSlot.id);
        if (d.rightSlot) removeSlotIds.add(d.rightSlot.id);
      }
    });

    // Giữ lại ít nhất 1 bàn thường
    let remainingNormDesks = normDesks.length;
    normDesks.forEach((d) => {
      if (idSet.has(d.deskId) && remainingNormDesks > 1) {
        removeSlotIds.add(d.leftSlot.id);
        if (d.rightSlot) removeSlotIds.add(d.rightSlot.id);
        remainingNormDesks--;
      }
    });

    if (removeSlotIds.size === 0) return;

    const nextVip = vipSlotsRef.current.filter((s) => !removeSlotIds.has(s.id));
    const nextNorm = normalSlotsRef.current.filter((s) => !removeSlotIds.has(s.id));

    setVipSlots(nextVip);
    setNormalSlots(nextNorm);
    setPilgrims((prev) =>
      prev.map((p) =>
        p.slotId && removeSlotIds.has(p.slotId)
          ? { ...p, slotId: null, state: 'leave_side_to_aisle', stateTimer: 0 }
          : p
      )
    );
    setConfig((prev) => ({
      ...prev,
      maxStageCapacity: nextVip.length + nextNorm.length,
      grid: {
        ...prev.grid,
        vipDesks: Math.floor(nextVip.length / 2),
        vipCount: nextVip.length,
        normalDesks: Math.floor(nextNorm.length / 2),
      },
    }));
    syncService.sendCommand('UPDATE_SLOTS', {
      vipSlots: nextVip,
      normalSlots: nextNorm,
    });
  }, []);

  const handleUpdateGrid = useCallback(
    (patch: Partial<GridConfig>) => {
      const prev = configRef.current;
      const nextGrid: GridConfig = { ...prev.grid, ...patch };
      if (typeof patch.deskCols === 'number') {
        nextGrid.cols = patch.deskCols * 2;
      }
      if (typeof patch.rows === 'number' && typeof patch.normalDesks !== 'number') {
        const dCols =
          nextGrid.deskCols || Math.max(1, Math.floor((nextGrid.cols || 6) / 2));
        nextGrid.normalDesks = patch.rows * dCols;
      }
      if (typeof patch.vipDesks === 'number') {
        nextGrid.vipCount = patch.vipDesks * 2;
      }

      const built = buildDoubleDeskSlots(
        nextGrid,
        prev.redPrayZones,
        prev.studentSeatmateGap
      );
      vipSlotsRef.current = built.vipSlots;
      normalSlotsRef.current = built.normalSlots;
      setVipSlots(built.vipSlots);
      setNormalSlots(built.normalSlots);
      syncPilgrimsWithMovedSlots([...built.vipSlots, ...built.normalSlots]);
      setConfig((c) => ({
        ...c,
        grid: nextGrid,
        maxStageCapacity: built.vipSlots.length + built.normalSlots.length,
      }));
      syncService.sendCommand('UPDATE_GRID', { grid: nextGrid });
    },
    [syncPilgrimsWithMovedSlots]
  );

  // Di chuyển vị trí học sinh / bàn đôi / nhóm đứng chờ cửa lớp / hàng ngang 5 chỗ phạt / vị trí Zombie
  const handleMoveWaypoint = useCallback(
    (
      kind:
        | 'burner'
        | 'tray'
        | 'doorCrowd'
        | 'punishmentLine'
        | 'zombieSpawn'
        | 'zombieStand'
        | 'zombieTeacher'
        | 'zombieSupervisor'
        | 'vip'
        | 'normal',
      index: number,
      pos: Point2D
    ) => {
      if (kind === 'burner') {
        setConfig((prev) => ({
          ...prev,
          incenseBurner: pos,
          offeringTrayPos: { x: pos.x, y: pos.y - 38 },
        }));
        return;
      }
      if (kind === 'tray') {
        setConfig((prev) => ({ ...prev, offeringTrayPos: pos }));
        return;
      }
      if (kind === 'doorCrowd') {
        setConfig((prev) => {
          const next = { ...prev, doorCrowdPos: pos };
          syncService.sendCommand('UPDATE_CONFIG', {
            patch: { doorCrowdPos: pos },
          });
          return next;
        });
        return;
      }
      if (kind === 'punishmentLine') {
        setConfig((prev) => {
          const next = { ...prev, punishmentLinePos: pos };
          syncService.sendCommand('UPDATE_CONFIG', {
            patch: { punishmentLinePos: pos },
          });
          return next;
        });
        return;
      }
      if (kind === 'zombieSpawn') {
        setConfig((prev) => {
          const next = { ...prev, zombieSpawnPos: pos };
          syncService.sendCommand('UPDATE_CONFIG', {
            patch: { zombieSpawnPos: pos },
          });
          return next;
        });
        return;
      }
      if (kind === 'zombieStand') {
        setConfig((prev) => {
          const next = { ...prev, zombieStandPos: pos };
          syncService.sendCommand('UPDATE_CONFIG', {
            patch: { zombieStandPos: pos },
          });
          return next;
        });
        if (
          zombieEntityRef.current.visible &&
          !zombieEntityRef.current.isWalking
        ) {
          const movedZ: ZombieEntityState = {
            ...zombieEntityRef.current,
            x: pos.x,
            y: pos.y,
            targetX: pos.x,
            targetY: pos.y,
          };
          zombieEntityRef.current = movedZ;
          setZombieEntity(movedZ);
        }
        return;
      }
      if (kind === 'zombieTeacher') {
        setConfig((prev) => {
          const next = { ...prev, zombieTeacherPos: pos };
          syncService.sendCommand('UPDATE_CONFIG', {
            patch: { zombieTeacherPos: pos },
          });
          return next;
        });
        return;
      }
      if (kind === 'zombieSupervisor') {
        setConfig((prev) => {
          const next = { ...prev, zombieSupervisorPos: pos };
          syncService.sendCommand('UPDATE_CONFIG', {
            patch: { zombieSupervisorPos: pos },
          });
          return next;
        });
        return;
      }

      const applyDeskMove = (slots: KneelSlot[], prefix: string): KneelSlot[] => {
        const target = slots[index];
        if (!target) return slots;
        const desks = groupSlotsIntoDoubleDesks(slots, prefix);
        const desk = desks.find(
          (d) => d.leftIndex === index || d.rightIndex === index
        );
        if (!desk) {
          return slots.map((s, i) => (i === index ? { ...s, x: pos.x, y: pos.y } : s));
        }

        const dx = pos.x - target.x;
        const dy = pos.y - target.y;
        const nextCenterX = Math.max(42, Math.min(498, Math.round(desk.centerX + dx)));
        const nextCenterY = Math.max(140, Math.min(935, Math.round(desk.centerY + dy)));
        const offset = Math.max(
          4,
          Math.min(
            48,
            Math.round((configRef.current.studentSeatmateGap ?? 36) / 2)
          )
        );
        const leftX = Math.round(nextCenterX - offset);
        const rightX = Math.round(nextCenterX + offset);

        return slots.map((s, i) => {
          if (i === desk.leftIndex) {
            return {
              ...s,
              x: leftX,
              y: nextCenterY,
              side: leftX < 270 ? 'left' : 'right',
              deskCenterX: nextCenterX,
              deskCenterY: nextCenterY,
              aisleX: Math.max(20, leftX - 24),
            };
          }
          if (i === desk.rightIndex && desk.rightSlot) {
            return {
              ...s,
              x: rightX,
              y: nextCenterY,
              side: rightX < 270 ? 'left' : 'right',
              deskCenterX: nextCenterX,
              deskCenterY: nextCenterY,
              aisleX: Math.min(520, rightX + 24),
            };
          }
          return s;
        });
      };

      if (kind === 'vip') {
        const nextVip = applyDeskMove(vipSlotsRef.current, 'vip');
        setVipSlots(nextVip);
        syncPilgrimsWithMovedSlots(nextVip);
      } else if (kind === 'normal') {
        const nextNorm = applyDeskMove(normalSlotsRef.current, 'norm');
        setNormalSlots(nextNorm);
        syncPilgrimsWithMovedSlots(nextNorm);
      }
    },
    [syncPilgrimsWithMovedSlots]
  );

  // Di chuyển hàng loạt bàn đôi cùng lúc (cập nhật cả 2 ghế mỗi bàn + học sinh đang ngồi)
  const handleMoveWaypointsBatch = useCallback(
    (updates: Array<{ kind: 'vip' | 'normal'; index: number; pos: Point2D }>) => {
      const vipMap = new Map<number, Point2D>();
      const normMap = new Map<number, Point2D>();
      updates.forEach((u) => {
        if (u.kind === 'vip') vipMap.set(u.index, u.pos);
        else normMap.set(u.index, u.pos);
      });

      const applyBatchDeskMoves = (
        slots: KneelSlot[],
        moveMap: Map<number, Point2D>,
        prefix: string
      ): KneelSlot[] => {
        if (moveMap.size === 0) return slots;
        const desks = groupSlotsIntoDoubleDesks(slots, prefix);
        const updatedSlots = [...slots];

        desks.forEach((desk) => {
          const hasLeft = moveMap.has(desk.leftIndex);
          const hasRight = moveMap.has(desk.rightIndex);
          if (!hasLeft && !hasRight) return;

          const offset = Math.max(
            4,
            Math.min(
              48,
              Math.round((configRef.current.studentSeatmateGap ?? 36) / 2)
            )
          );
          let nextCenterX = desk.centerX;
          let nextCenterY = desk.centerY;

          if (hasLeft && hasRight && desk.rightSlot) {
            const lp = moveMap.get(desk.leftIndex)!;
            const rp = moveMap.get(desk.rightIndex)!;
            nextCenterX = Math.round((lp.x + rp.x) / 2);
            nextCenterY = Math.round((lp.y + rp.y) / 2);
          } else if (hasLeft) {
            const lp = moveMap.get(desk.leftIndex)!;
            const dx = lp.x - desk.leftSlot.x;
            const dy = lp.y - desk.leftSlot.y;
            nextCenterX = Math.round(desk.centerX + dx);
            nextCenterY = Math.round(desk.centerY + dy);
          } else if (hasRight && desk.rightSlot) {
            const rp = moveMap.get(desk.rightIndex)!;
            const dx = rp.x - desk.rightSlot.x;
            const dy = rp.y - desk.rightSlot.y;
            nextCenterX = Math.round(desk.centerX + dx);
            nextCenterY = Math.round(desk.centerY + dy);
          }

          nextCenterX = Math.max(42, Math.min(498, nextCenterX));
          nextCenterY = Math.max(140, Math.min(935, nextCenterY));
          const leftX = Math.round(nextCenterX - offset);
          const rightX = Math.round(nextCenterX + offset);

          updatedSlots[desk.leftIndex] = {
            ...updatedSlots[desk.leftIndex],
            x: leftX,
            y: nextCenterY,
            side: leftX < 270 ? 'left' : 'right',
            deskCenterX: nextCenterX,
            deskCenterY: nextCenterY,
            aisleX: Math.max(20, leftX - 24),
          };

          if (desk.rightSlot) {
            updatedSlots[desk.rightIndex] = {
              ...updatedSlots[desk.rightIndex],
              x: rightX,
              y: nextCenterY,
              side: rightX < 270 ? 'left' : 'right',
              deskCenterX: nextCenterX,
              deskCenterY: nextCenterY,
              aisleX: Math.min(520, rightX + 24),
            };
          }
        });

        return updatedSlots;
      };

      const changedSlots: KneelSlot[] = [];
      if (vipMap.size > 0) {
        const nextVip = applyBatchDeskMoves(vipSlotsRef.current, vipMap, 'vip');
        setVipSlots(nextVip);
        changedSlots.push(...nextVip);
      }
      if (normMap.size > 0) {
        const nextNorm = applyBatchDeskMoves(normalSlotsRef.current, normMap, 'norm');
        setNormalSlots(nextNorm);
        changedSlots.push(...nextNorm);
      }
      if (changedSlots.length > 0) {
        syncPilgrimsWithMovedSlots(changedSlots);
      }
    },
    [syncPilgrimsWithMovedSlots]
  );

  const handleUpdateHudBox = useCallback(
    (boxKey: HudBoxKey, nextBox: HudBoxPosition) => {
      handleUpdateHudLayout({ [boxKey]: nextBox });
    },
    [handleUpdateHudLayout]
  );

  const handleUpdateZoneBounds = useCallback(
    (zoneKey: ZoneKey, nextBounds: RectBounds) => {
      if (zoneKey === 'monk' || zoneKey === 'supervisor') {
        const targetRole = zoneKey === 'monk' ? 'abbot' : 'senior_novice';
        const spanX = Math.max(24, nextBounds.maxX - nextBounds.minX);
        const spanY = Math.max(8, nextBounds.maxY - nextBounds.minY);
        const insetX = Math.min(Math.floor(spanX * 0.42), 26);
        const insetTop = Math.min(Math.floor(spanY * 0.35), 10);
        const insetBottom = Math.min(Math.floor(spanY * 0.45), 14);
        const safeMinX = nextBounds.minX + insetX;
        const safeMaxX = Math.max(safeMinX, nextBounds.maxX - insetX);
        const safeMinY = nextBounds.minY + insetTop;
        const safeMaxY = Math.max(safeMinY, nextBounds.maxY - insetBottom);
        setMonks((prevMonks) =>
          prevMonks.map((m) =>
            m.role === targetRole
              ? {
                  ...m,
                  x: Math.max(safeMinX, Math.min(safeMaxX, m.x)),
                  y: Math.max(safeMinY, Math.min(safeMaxY, m.y)),
                  targetX: Math.max(safeMinX, Math.min(safeMaxX, m.targetX)),
                  targetY: Math.max(safeMinY, Math.min(safeMaxY, m.targetY)),
                }
              : m
          )
        );
        if (zoneKey === 'monk') {
          setConfig((prev) => ({ ...prev, monkZone: nextBounds }));
        } else {
          setConfig((prev) => ({ ...prev, supervisorZone: nextBounds }));
        }
        return;
      }
      const prev = configRef.current;
      const nextRedZones = {
        left: zoneKey === 'leftPray' ? nextBounds : prev.redPrayZones.left,
        right: zoneKey === 'rightPray' ? nextBounds : prev.redPrayZones.right,
      };
      const built = buildDoubleDeskSlots(
        prev.grid,
        nextRedZones,
        prev.studentSeatmateGap
      );
      vipSlotsRef.current = built.vipSlots;
      normalSlotsRef.current = built.normalSlots;
      setVipSlots(built.vipSlots);
      setNormalSlots(built.normalSlots);
      syncPilgrimsWithMovedSlots([...built.vipSlots, ...built.normalSlots]);
      setConfig((c) => ({ ...c, redPrayZones: nextRedZones }));
    },
    [syncPilgrimsWithMovedSlots]
  );

  const handleSpawnRandom = useCallback(
    (isVip = false) => {
      const names =
        npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
      const prayers =
        npcPrayersRef.current.length > 0
          ? npcPrayersRef.current
          : SAMPLE_PRAYERS;
      const username = names[Math.floor(Math.random() * names.length)];
      const prayer = pickRandomSpeechFromThreeGroups(configRef.current, prayers);
      const coins = isVip ? 5 : 0;
      spawnOrPromotePilgrim({
        username,
        prayer,
        isVip,
        coins,
        isBot: false,
        isSimulatedTest: true,
        bypassWaitingQueue: true,
      });
      syncService.sendCommand('SPAWN_PILGRIM', {
        username,
        prayer,
        isVip,
        coins,
        isBot: false,
        bypassWaitingQueue: true,
      });
    },
    [pickRandomSpeechFromThreeGroups, spawnOrPromotePilgrim]
  );

  const handleSpawnBatch = useCallback(
    (count = 5) => {
      const names = npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
      const prayers =
        npcPrayersRef.current.length > 0 ? npcPrayersRef.current : SAMPLE_PRAYERS;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const username = names[Math.floor(Math.random() * names.length)];
          const prayer = pickRandomSpeechFromThreeGroups(
            configRef.current,
            prayers
          );
          spawnOrPromotePilgrim({
            username,
            prayer,
            isVip: i === 0,
            coins: 0,
            isBot: true,
          });
        }, i * 220);
      }
    },
    [pickRandomSpeechFromThreeGroups, spawnOrPromotePilgrim]
  );

  const handleLeaveAll = useCallback(() => {
    soundEngine.playBell(configRef.current.ttsVolume, null, true);
    pushToast('🔔 Trống trường báo hết tiết! Cả lớp ra chơi!', true);
    setPilgrims((prev) =>
      prev.map((p) => ({
        ...p,
        slotId: null,
        state: 'leave_side_to_aisle',
        stateTimer: 0,
      }))
    );
    setVipSlots((prev) => prev.map((s) => ({ ...s, occupiedById: null })));
    setNormalSlots((prev) => prev.map((s) => ({ ...s, occupiedById: null })));
    syncService.sendCommand('LEAVE_ALL', {});
  }, [pushToast]);

  const handleSpawnCustom = useCallback(
    (
      username: string,
      prayer: string,
      isVip: boolean,
      coins = 0,
      avatarUrl: string | null = null,
      giftName?: string
    ) => {
      const safeUser = username.trim() || 'Học Sinh Giỏi';
      const actualCoins = isVip ? Math.max(1, coins) : 0;
      const safePrayer =
        prayer.trim() || 'Thưa cô em xin phép phát biểu xây dựng bài ạ! ✋';
      if (actualCoins > 0) {
        handleTriggerClassroomGift({
          username: safeUser,
          prayer: safePrayer,
          giftName,
          coins: actualCoins,
          avatarUrl,
          isBot: false,
          broadcastSync: true,
        });
        return;
      }
      spawnOrPromotePilgrim({
        username: safeUser,
        prayer: safePrayer,
        isVip: false,
        coins: 0,
        isBot: false,
        avatarUrl,
        isSimulatedTest: true,
        bypassWaitingQueue: false,
      });
      syncService.sendCommand('SPAWN_PILGRIM', {
        username: safeUser,
        prayer: safePrayer,
        isVip: false,
        coins: 0,
        isBot: false,
        avatarUrl,
        bypassWaitingQueue: false,
      });
    },
    [handleTriggerClassroomGift, spawnOrPromotePilgrim]
  );

  // Tự động cho NPC sử dụng quà tặng định kỳ (kèm độ trễ ngẫu nhiên ±1, 2, 3s) trong Thao Tác Test
  useEffect(() => {
    if (!config.npcAutoGiftEnabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNextNpcGift = () => {
      if (cancelled) return;
      const baseSec = Math.max(
        2,
        Number(configRef.current.npcAutoGiftIntervalSec) || 8
      );
      const jitterCandidates = [-3, -2, -1, 0, 1, 2, 3];
      const jitterSec =
        jitterCandidates[Math.floor(Math.random() * jitterCandidates.length)];
      const actualDelayMs = Math.max(1500, (baseSec + jitterSec) * 1000);

      timer = setTimeout(() => {
        if (cancelled || !configRef.current.npcAutoGiftEnabled) return;

        const allowedGifts =
          Array.isArray(configRef.current.npcAutoGiftAllowedIds) &&
          configRef.current.npcAutoGiftAllowedIds.length > 0
            ? configRef.current.npcAutoGiftAllowedIds
            : (['rose', 'icecream', 'cat', 'gg', 'heart', 'pig', 'vip'] as ClassroomGiftEventId[]);

        const chosenGiftId =
          allowedGifts[Math.floor(Math.random() * allowedGifts.length)];
        const giftMeta = resolveClassroomGiftKind(chosenGiftId, 1);

        // Khi đang diễn ra sự kiện Zombie: chọn NPC trong hàng chờ để phụ trợ âm thầm giết Boss Zombie (không tính điểm vào Bảng Chiến Công)
        // Khi bình thường: ưu tiên chọn NPC đang ngồi trong lớp để thấy hiệu ứng quà ngay lập tức
        const seatedSet = new Set(
          pilgrimsRef.current
            .filter(
              (p) =>
                Boolean(p.slotId) &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            )
            .map((p) => p.username.trim().toLowerCase())
        );
        const queueBotPilgrims = Array.from(
          waitingPoolRef.current.values()
        ).filter(
          (q) => q.isBot && !seatedSet.has(q.username.trim().toLowerCase())
        );
        const seatedBotPilgrims = pilgrimsRef.current.filter(
          (p) =>
            p.isBot &&
            Boolean(p.slotId) &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        const namesPool =
          npcNamesRef.current.length > 0 ? npcNamesRef.current : SAMPLE_NAMES;
        const avatarsPool =
          npcAvatarsRef.current.length > 0
            ? npcAvatarsRef.current
            : DEFAULT_NPC_AVATARS;

        let chosenName = '';
        let chosenAvatar: string | null = null;

        if (zombieEventStateRef.current.isActive && queueBotPilgrims.length > 0) {
          const pickedQ =
            queueBotPilgrims[Math.floor(Math.random() * queueBotPilgrims.length)];
          chosenName = pickedQ.username;
          chosenAvatar = pickedQ.avatarUrl || null;
        } else if (
          !zombieEventStateRef.current.isActive &&
          seatedBotPilgrims.length > 0
        ) {
          const picked =
            seatedBotPilgrims[
              Math.floor(Math.random() * seatedBotPilgrims.length)
            ];
          chosenName = picked.username;
          chosenAvatar = picked.avatarUrl || null;
        } else {
          const randIdx = Math.floor(Math.random() * namesPool.length);
          chosenName = namesPool[randIdx] || 'Học Sinh NPC';
          chosenAvatar = avatarsPool[randIdx % avatarsPool.length] || null;
        }

        handleTriggerClassroomGift({
          username: chosenName,
          prayer: `${giftMeta.giftLabel}: ${giftMeta.actionTitle}!`,
          giftName: giftMeta.id,
          coins: giftMeta.coins,
          avatarUrl: chosenAvatar,
          isBot: true,
          preferSeatedIfBlank: false,
          broadcastSync: true,
        });

        scheduleNextNpcGift();
      }, actualDelayMs);
    };

    scheduleNextNpcGift();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    config.npcAutoGiftEnabled,
    config.npcAutoGiftIntervalSec,
    config.npcAutoGiftAllowedIds,
    handleTriggerClassroomGift,
  ]);

  const handleTriggerGiftCombo = useCallback(
    (
      mode: 'streak_50_roses' | 'instant_50_roses' | 'multi_user_combo_storm',
      customUsername?: string,
      customPrayer?: string,
      customAvatarUrl?: string | null
    ) => {
      const targetUser =
        (customUsername || '').trim() ||
        SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];

      if (mode === 'instant_50_roses') {
        spawnOrPromotePilgrim({
          username: targetUser,
          prayer: customPrayer || 'Em tặng Cô 50 Hoa Điểm 10 chúc Cô luôn mạnh khỏe ạ! 🌺',
          isVip: true,
          coins: 50,
          isBot: false,
          avatarUrl: customAvatarUrl || null,
          comboCount: 50,
          giftName: 'Hoa Điểm 10',
          isSimulatedTest: true,
        });
        return;
      }

      if (mode === 'multi_user_combo_storm') {
        for (let i = 0; i < 4; i++) {
          const uName =
            SAMPLE_NAMES[(Math.floor(Math.random() * SAMPLE_NAMES.length) + i) % SAMPLE_NAMES.length];
          setTimeout(() => {
            spawnOrPromotePilgrim({
              username: uName,
              prayer: 'Chúc cả lớp 12A1 thi đỗ Nguyện Vọng 1 điểm cao chót vót! 🎓',
              isVip: true,
              coins: 10,
              isBot: false,
              comboCount: 10,
              giftName: 'Hộp Quà Tri Ân',
              isSimulatedTest: true,
            });
          }, i * 350);
        }
        return;
      }

      // streak_50_roses
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          spawnOrPromotePilgrim({
            username: targetUser,
            prayer: customPrayer || `Em tặng Cô Hoa Điểm 10 combo x${(i + 1) * 10} ạ!`,
            isVip: true,
            coins: 10,
            isBot: false,
            avatarUrl: customAvatarUrl || null,
            comboCount: 10,
            giftName: 'Hoa Điểm 10',
            isSimulatedTest: true,
          });
        }, i * 280);
      }
    },
    [spawnOrPromotePilgrim]
  );

  const handlePlayBell = useCallback(() => {
    soundEngine.playBell(configRef.current.ttsVolume, null, true);
    syncService.sendCommand('PLAY_BELL', {});
  }, []);

  const handlePlayWoodenFish = useCallback(() => {
    soundEngine.playWoodenFish(configRef.current.ttsVolume, null, true);
    syncService.sendCommand('PLAY_WOODEN_FISH', {});
  }, []);

  const handlePanicMute = useCallback(() => {
    soundEngine.stopImmediate();
    flushPendingGiftPilgrims();
    setCameraFocus({ pilgrimId: null, until: 0 });
    syncService.sendCommand('PANIC_MUTE', {});
  }, [flushPendingGiftPilgrims]);

  const handleTestTTS = useCallback(() => {
    soundEngine.enqueueTTS(
      'Chào mừng các em học sinh đến với lớp 12A1, chúc cả lớp học tập tốt và đạt nhiều Hoa Điểm 10',
      true,
      configRef.current,
      { reason: 'manual' }
    );
  }, []);

  const handleSpeakHostLiveText = useCallback(
    (
      rawText: string,
      options?: {
        interrupt?: boolean;
        speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
      }
    ) => {
      const clean = (rawText || '').trim();
      if (!clean) return;
      const cfg = configRef.current;
      const interrupt = options?.interrupt ?? cfg.hostTtsInterrupt ?? true;
      const speakerRole =
        options?.speakerRole ?? cfg.hostTtsSpeakerRole ?? 'abbot';
      soundEngine.speakHostLiveText(clean, cfg, { interrupt, speakerRole });
      syncService.sendCommand('HOST_LIVE_TTS', {
        text: clean,
        interrupt,
        speakerRole,
      });
    },
    []
  );

  const handleSpeakTeacherLiveVoice = useCallback(
    (
      rawText: string,
      options?: TeacherLiveVoiceOptions & { showBubble?: boolean }
    ) => {
      const clean = (rawText || '').trim();
      if (!clean) return;
      const cfg = configRef.current;
      const volume = options?.volume ?? cfg.teacherLiveVolume ?? 1.0;
      const rate = options?.rate ?? cfg.teacherLiveRate ?? 1.0;
      const pitch = options?.pitch ?? cfg.teacherLivePitch ?? 0.8;
      const engine = options?.engine ?? cfg.teacherLiveEngine ?? 'google_stream';
      const voice =
        options?.voice ??
        cfg.teacherLiveVoice ??
        (engine === 'node_edge' ? 'vi-VN-NamMinhNeural' : 'google-vi-male-deep');
      const showBubble =
        options?.showBubble ?? cfg.teacherLiveShowBubble !== false;

      soundEngine.speakTeacherLiveIndependent(clean, cfg, {
        volume,
        rate,
        pitch,
        engine,
        voice,
      });

      if (showBubble) {
        const wordCount = clean.split(/\s+/).filter(Boolean).length;
        const bubbleDurMs = Math.max(
          3500,
          Math.min(
            14000,
            Math.round((wordCount * 350) / Math.max(0.5, rate)) + 1200
          )
        );
        const untilMs = Date.now() + bubbleDurMs;
        setMonks((prev) => {
          const next = prev.map((m) =>
            m.role === 'senior_novice'
              ? { ...m, chatText: clean, chatBubbleUntil: untilMs }
              : m
          );
          monksRef.current = next;
          return next;
        });
      }

      syncService.sendCommand('TEACHER_LIVE_TTS', {
        text: clean,
        volume,
        rate,
        pitch,
        engine,
        voice,
        showBubble,
      });
    },
    []
  );

  const handleStopTeacherLiveVoice = useCallback(() => {
    soundEngine.stopTeacherLiveIndependent();
    setMonks((prev) => {
      const next = prev.map((m) =>
        m.role === 'senior_novice' ? { ...m, chatBubbleUntil: 0 } : m
      );
      monksRef.current = next;
      return next;
    });
    syncService.sendCommand('STOP_TEACHER_LIVE_TTS', {});
  }, []);

  const handleNextDharmaArticle = useCallback(() => {
    soundEngine.skipToNextDharmaArticle(configRef.current);
  }, []);

  const handleTriggerGrandEvent = useCallback(() => {
    setGoldenLotusRainUntil(Date.now() + 3800);
    soundEngine.playBell(configRef.current.ttsVolume, null, true);
    setGrandEventProgress(0);
    triggerRandomClassroomEventRef.current();
  }, []);

  const handleToggleLocalMute = useCallback(() => {
    const next = !soundEngine.isTabMuted();
    soundEngine.setTabMuted(next);
    setIsLocalTabMuted(next);
  }, []);

  const handleUploadAsset = useCallback(
    (key: keyof CustomAssetsConfig, file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const dataUrl = reader.result;
          setCustomAssets((prev) => {
            const next = { ...prev, [key]: dataUrl };
            void idbSet('classroom_custom_assets_v1', next);
            syncService.sendCommand('UPDATE_CUSTOM_ASSETS', {
              assets: { [key]: dataUrl },
            });
            return next;
          });
        }
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleResetAsset = useCallback((key: keyof CustomAssetsConfig) => {
    setCustomAssets((prev) => {
      const next = { ...prev, [key]: DEFAULT_SPRITESHEETS[key] };
      void idbSet('classroom_custom_assets_v1', next);
      syncService.sendCommand('UPDATE_CUSTOM_ASSETS', {
        assets: { [key]: DEFAULT_SPRITESHEETS[key] },
      });
      return next;
    });
  }, []);

  const handleSaveBackupJson = useCallback(() => {
    const data: StudioBackupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      config: configRef.current,
      vipSlots: vipSlotsRef.current,
      normalSlots: normalSlotsRef.current,
      npcNames: npcNamesRef.current,
      npcPrayers: npcPrayersRef.current,
      npcAvatars: npcAvatarsRef.current,
      safetyActionMode,
      safetyCategories,
      customWords,
      dailyRecords: dailyRecordsRef.current,
      studentExpMap: serializeStudentExpMap(studentExpMapRef.current),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lop-hoc-12a1-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customWords, safetyActionMode, safetyCategories]);

  const handleLoadBackupJson = useCallback(
    (rawJsonText: string): { ok: boolean; message: string } => {
      try {
        const parsed = JSON.parse(rawJsonText);
        const cfgPatch = parsed.config || parsed;
        let nextVip = vipSlotsRef.current;
        let nextNorm = normalSlotsRef.current;

        if (Array.isArray(parsed.vipSlots)) {
          nextVip = parsed.vipSlots.map((s: KneelSlot, i: number) => ({
            ...(INITIAL_VIP_SLOTS[i % Math.max(1, INITIAL_VIP_SLOTS.length)] || {}),
            ...s,
            isVip: true,
            occupiedById: null,
          }));
          vipSlotsRef.current = nextVip;
          setVipSlots(nextVip);
        }
        if (Array.isArray(parsed.normalSlots) && parsed.normalSlots.length > 0) {
          nextNorm = parsed.normalSlots.map((s: KneelSlot, i: number) => ({
            ...INITIAL_NORMAL_SLOTS[i % INITIAL_NORMAL_SLOTS.length],
            ...s,
            isVip: false,
            occupiedById: null,
          }));
          normalSlotsRef.current = nextNorm;
          setNormalSlots(nextNorm);
        }
        if (cfgPatch && typeof cfgPatch === 'object') {
          setConfig((prev) => ({
            ...prev,
            ...cfgPatch,
            maxStageCapacity: nextVip.length + nextNorm.length,
            grid: { ...prev.grid, ...(cfgPatch.grid || {}) },
            hudLayout: { ...prev.hudLayout, ...(cfgPatch.hudLayout || {}) },
          }));
        }
        if (Array.isArray(parsed.npcNames) && parsed.npcNames.length > 0) {
          setNpcNames(parsed.npcNames);
        }
        if (Array.isArray(parsed.npcPrayers) && parsed.npcPrayers.length > 0) {
          setNpcPrayers(parsed.npcPrayers);
        }
        if (Array.isArray(parsed.npcAvatars) && parsed.npcAvatars.length > 0) {
          setNpcAvatars(parsed.npcAvatars);
        }
        if (
          parsed.safetyActionMode === 'purify' ||
          parsed.safetyActionMode === 'block' ||
          parsed.safetyActionMode === 'mask'
        ) {
          setSafetyActionMode(parsed.safetyActionMode);
        }
        if (
          Array.isArray(parsed.safetyCategories) &&
          parsed.safetyCategories.length > 0
        ) {
          setSafetyCategories(parsed.safetyCategories);
        }
        if (Array.isArray(parsed.customWords) && parsed.customWords.length > 0) {
          setCustomWords(parsed.customWords);
          saveCustomWordsToStorage(parsed.customWords);
        }
        if (
          parsed.studentExpMap &&
          typeof parsed.studentExpMap === 'object'
        ) {
          const nextExpMap = new Map<string, number>();
          for (const [k, v] of Object.entries(parsed.studentExpMap)) {
            const cleanKey = String(k || '').trim().toLowerCase();
            const expVal = Math.floor(Number(v) || 0);
            if (cleanKey && expVal > 0) {
              nextExpMap.set(cleanKey, expVal);
            }
          }
          studentExpMapRef.current = nextExpMap;
          applyExpMapToActiveStudents();
          flushStudentExpStorage(true, true);
        }
        return {
          ok: true,
          message: `Đã nạp cấu hình lớp học & dữ liệu EXP (${studentExpMapRef.current.size} học sinh) thành công!`,
        };
      } catch {
        return { ok: false, message: 'Lỗi: Chuỗi JSON không hợp lệ!' };
      }
    },
    [applyExpMapToActiveStudents, flushStudentExpStorage]
  );

  const handleClearLotusDonors = useCallback(() => {
    setLotusDonors([]);
    syncService.sendCommand('CLEAR_LOTUS_DONORS', {});
  }, []);

  const handleResetDailyRecords = useCallback(() => {
    dailyRecordsRef.current = [];
    setDailyRecords([]);
    lastPraisedRecordTop1Ref.current = '';
    pendingRecordNoticeRef.current = null;
    syncService.sendCommand('CLEAR_DAILY_RECORDS', {});
    pushToast('🔄 Đã reset bảng Kỷ lục hôm nay về 0!', false);
  }, [pushToast]);

  const handleClearEventTtsQueue = useCallback(() => {
    soundEngine.clearEventQueue();
    flushPendingGiftPilgrims();
    setCameraFocus({ pilgrimId: null, until: 0 });
    syncService.sendCommand('CLEAR_TTS_QUEUE', {});
  }, [flushPendingGiftPilgrims]);

  const handleSkipCameraTarget = useCallback(() => {
    soundEngine.skipCurrentEvent(configRef.current);
  }, []);

  const handleResetCameraView = useCallback(() => {
    setCameraFocus({ pilgrimId: null, until: 0 });
    flushPendingGiftPilgrims();
  }, [flushPendingGiftPilgrims]);

  const handleClearCameraQueue = useCallback(() => {
    soundEngine.clearEventQueue();
    setCameraQueue([]);
    setCameraFocus({ pilgrimId: null, until: 0 });
    flushPendingGiftPilgrims();
  }, [flushPendingGiftPilgrims]);

  const handleRemoveCameraQueueItem = useCallback(
    (id: string) => {
      soundEngine.removeEventQueueItemById(id);
      setCameraQueue((prev) => prev.filter((item) => item.id !== id));
      flushPendingGiftPilgrims();
    },
    [flushPendingGiftPilgrims]
  );

  const handleFocusPilgrimNow = useCallback(
    (
      pilgrimId: number,
      reason: CameraFocusReason = 'manual',
      holdSec = 6
    ) => {
      const target = pilgrimsRef.current.find((p) => p.id === pilgrimId);
      if (!target) return;
      setCameraFocus({
        pilgrimId: target.id,
        username: target.username,
        reason,
        isBot: target.isBot,
        startedAt: Date.now(),
        until: Date.now() + holdSec * 1000,
      });
    },
    []
  );

  const handlePushFullSyncToLive = useCallback(() => {
    const patchToSend = { ...configRef.current };
    if (classBoardStateRef.current.isRunning) {
      delete patchToSend.customQuizQuestions;
    }
    syncService.sendCommand('UPDATE_CONFIG', { patch: patchToSend });
    syncService.sendCommand('UPDATE_HUD_LAYOUT', {
      patch: configRef.current.hudLayout,
    });
    syncService.sendCommand('UPDATE_SLOTS', {
      vipSlots: vipSlotsRef.current,
      normalSlots: normalSlotsRef.current,
    });
    syncService.sendCommand('UPDATE_NPC_LISTS', {
      npcNames: npcNamesRef.current,
      npcPrayers: npcPrayersRef.current,
      npcAvatars: npcAvatarsRef.current,
    });
    syncService.sendCommand('UPDATE_SAFETY', {
      safetyActionMode,
      safetyCategories,
      customWords,
    });
    syncService.sendCommand('UPDATE_CUSTOM_ASSETS', {
      assets: customAssets,
    });
    pushToast(
      '✅ Đã đồng bộ cấu hình Dev, HUD, hình ảnh tải lên, danh sách NPC & vị trí bàn ghế sang Live (Giữ nguyên tiến trình & bảng điểm Live)',
      false
    );
  }, [customAssets, customWords, pushToast, safetyActionMode, safetyCategories]);

  // Nút điều khiển NPC & Safety
  const handleUpdateNpcNames = useCallback((list: string[]) => {
    setNpcNames(list);
  }, []);
  const handleResetNpcNames = useCallback(() => {
    setNpcNames(SAMPLE_NAMES);
  }, []);
  const handleUpdateNpcPrayers = useCallback((list: string[]) => {
    setNpcPrayers(list);
  }, []);
  const handleResetNpcPrayers = useCallback(() => {
    setNpcPrayers(SAMPLE_PRAYERS);
    setConfig((prev) => ({
      ...prev,
      npcSpeechCategories: {
        idle: [...DEFAULT_NPC_SPEECH_CATEGORIES.idle],
        question: [...DEFAULT_NPC_SPEECH_CATEGORIES.question],
        reply: [...DEFAULT_NPC_SPEECH_CATEGORIES.reply],
      },
    }));
  }, []);
  const handleUpdateNpcAvatars = useCallback((list: string[]) => {
    setNpcAvatars(list);
  }, []);
  const handleResetNpcAvatars = useCallback(() => {
    setNpcAvatars(DEFAULT_NPC_AVATARS);
  }, []);
  const handleRandomizeActiveNpcAvatars = useCallback(() => {
    setPilgrims((prev) =>
      prev.map((p) =>
        p.isBot
          ? {
              ...p,
              avatarUrl:
                npcAvatarsRef.current[
                  Math.floor(Math.random() * npcAvatarsRef.current.length)
                ],
            }
          : p
      )
    );
  }, []);

  const handleToggleSafetyCategory = useCallback(
    (key: string, enabled?: boolean) => {
      setSafetyCategories((prev) =>
        prev.map((c) =>
          c.key === key
            ? { ...c, enabled: typeof enabled === 'boolean' ? enabled : !c.enabled }
            : c
        )
      );
    },
    []
  );

  const handleAddCustomWords = useCallback((rawInput: string) => {
    const parts = rawInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    setCustomWords((prev) => {
      const next = Array.from(new Set([...prev, ...parts]));
      saveCustomWordsToStorage(next);
      return next;
    });
  }, []);

  const handleRemoveCustomWord = useCallback((word: string) => {
    setCustomWords((prev) => {
      const next = prev.filter((w) => w !== word);
      saveCustomWordsToStorage(next);
      return next;
    });
  }, []);

  const handleResetCustomWords = useCallback(() => {
    const def = getDefaultCustomWords();
    setCustomWords(def);
    saveCustomWordsToStorage(def);
  }, []);

  const clearSafetyLogs = useCallback(() => {
    setSafetyLogs([]);
  }, []);

  const handleSpawnTrollTest = useCallback(() => {
    spawnOrPromotePilgrim({
      username: 'Học Sinh Tinh Nghịch',
      prayer: 'kéo tài xỉu zalo 0988123456',
      isVip: false,
      coins: 0,
      isBot: false,
      isSimulatedTest: true,
    });
  }, [spawnOrPromotePilgrim]);

  const activePilgrims = pilgrims.filter(
    (p) => p.state !== 'leave_side_to_aisle' && p.state !== 'leave_down_exit'
  );
  const realCount = activePilgrims.filter((p) => !p.isBot).length;
  const botCount = activePilgrims.filter((p) => p.isBot).length;

  // Map detailed TTS queue to cameraQueue for TabCamera display
  const mappedCameraQueue: CameraQueueItem[] = eventTtsQueue.detailedQueue.map(
    (item) => ({
      id: item.id,
      pilgrimId: item.meta?.pilgrimId || 0,
      username: item.meta?.username || item.text.slice(0, 28),
      reason: item.meta?.reason || 'comment',
      isBot: Boolean(item.meta?.isBot),
      holdSec: 5,
      lockSec: 3,
      addedAt: item.addedAt,
    })
  );

  const handleToggleControlNpc = useCallback((role?: ControlledNpcRole) => {
    setControlledNpcRole((prev) => {
      const next =
        typeof role !== 'undefined' ? role : prev ? null : 'abbot';
      wasdKeysRef.current = { w: false, a: false, s: false, d: false };
      return next;
    });
  }, []);

  const handleSetNpcManualMove = useCallback(
    (dir: 'w' | 'a' | 's' | 'd', active: boolean) => {
      if (
        controlledNpcRoleRef.current !== 'abbot' &&
        controlledNpcRoleRef.current !== 'senior_novice'
      ) {
        return;
      }
      wasdKeysRef.current[dir] = active;
    },
    []
  );

  // Cho phép điều khiển NPC Học Sinh gửi comment (không di chuyển WASD, vẫn chịu chi phối của mọi thuật toán bình thường)
  const handleSendControlledStudentComment = useCallback(
    (username: string, rawComment: string) => {
      const cleanUser = (username || '').trim();
      const cleanComment = (rawComment || '').trim();
      if (!cleanUser || !cleanComment) return;

      const lower = cleanUser.toLowerCase();
      const existingPilgrim = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lower &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const existingQueued = waitingQueueRef.current.find(
        (q) => q.username.trim().toLowerCase() === lower
      );
      const existingDoor = doorCrowdRef.current.find(
        (d) => d.username.trim().toLowerCase() === lower
      );

      const avatarUrl =
        existingPilgrim?.avatarUrl ||
        existingQueued?.avatarUrl ||
        existingDoor?.avatarUrl ||
        null;

      spawnOrPromotePilgrim({
        username: cleanUser,
        prayer: cleanComment,
        isVip: false,
        coins: 0,
        isBot: true,
        avatarUrl,
        isSimulatedTest: true,
        allowDoorCrowdBubbleForBot: true,
      });
    },
    [spawnOrPromotePilgrim]
  );

  // Kích hoạt sự kiện "Zombie tấn công":
  // - Nếu immediate === true hoặc tiết học đang dừng / đang ở Luồng 0/1 -> Chạy ngay Luồng Sự Kiện.
  // - Nếu đang giữa vòng câu hỏi -> Đưa vào hàng chờ Luồng Sự Kiện (isQueued = true), tự động bắt đầu ngay khi vòng câu hỏi hiện tại kết thúc!
  const handleTriggerZombieEvent = useCallback(
    (immediate = false) => {
      if (configRef.current.zombieEventEnabled === false) {
        pushToast(
          '⚠️ Sự kiện Zombie đang TẮT trong Dev Event. Hãy bật lại để kích hoạt!',
          false
        );
        return;
      }
      const curBoard = classBoardStateRef.current;
      const canStartRightAway =
        immediate ||
        !curBoard.isRunning ||
        curBoard.phase === 'lesson_start' ||
        curBoard.phase === 'preparing';

      if (canStartRightAway) {
        startZombieEventFlowNow(curBoard.isRunning);
        return;
      }

      const queuedState: ZombieEventRuntimeState = {
        ...zombieEventStateRef.current,
        isQueued: true,
      };
      zombieEventStateRef.current = queuedState;
      setZombieEventState(queuedState);
      syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: queuedState });
      pushToast(
        '🧟 Đã kích hoạt "Zombie tấn công" vào Luồng Sự Kiện — Sẽ tự động bắt đầu ngay khi kết thúc vòng câu hỏi hiện tại!',
        true
      );
    },
    [pushToast, startZombieEventFlowNow]
  );

  // Khi bảng "Kích hoạt sự kiện" đầy -> Kích hoạt ngẫu nhiên 1 sự kiện trong danh sách sự kiện lớp học
  triggerRandomClassroomEventRef.current = () => {
    if (
      configRef.current.zombieEventEnabled === false ||
      zombieEventStateRef.current.isActive ||
      zombieEventStateRef.current.isQueued
    ) {
      return;
    }
    const eventPool: Array<() => void> = [
      () => handleTriggerZombieEvent(false),
    ];
    const randomPick =
      eventPool[Math.floor(Math.random() * eventPool.length)];
    if (randomPick) randomPick();
  };

  // Dừng / Hủy sự kiện Zombie và quay lại tiết học
  const handleStopZombieEvent = useCallback(() => {
    const prevZ = zombieEventStateRef.current;
    const hiddenZ: ZombieEntityState = {
      ...zombieEntityRef.current,
      visible: false,
      isWalking: false,
      isDying: false,
    };
    zombieEntityRef.current = hiddenZ;
    setZombieEntity(hiddenZ);
    setZombieProjectiles([]);
    setZombieSpikyDamages([]);
    setFlyingMilkTeas([]);
    setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });

    const stoppedZ: ZombieEventRuntimeState = {
      ...prevZ,
      isActive: false,
      isQueued: false,
      phase: 'idle',
      activeFlowToken: undefined,
    };
    zombieEventStateRef.current = stoppedZ;
    setZombieEventState(stoppedZ);
    syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: stoppedZ });

    if (prevZ.isActive && prevZ.resumeLessonAfterEvent) {
      const cfg = configRef.current;
      const prepDurMs = Math.max(1, cfg.lessonPrepareDurationSec || 3) * 1000;
      const resumedBoard: ClassBoardRuntimeState = {
        ...classBoardStateRef.current,
        isRunning: true,
        phase: 'preparing',
        lessonStepNumber: 1,
        elapsedPhaseMs: 0,
        timeLeftMs: prepDurMs,
        totalDurationMs: prepDurMs,
        phaseEndAt: Date.now() + prepDurMs,
      };
      classBoardStateRef.current = resumedBoard;
      setClassBoardState(resumedBoard);
      syncService.sendCommand('SYNC_CLASS_BOARD_STATE', { state: resumedBoard });
    }
    if (zombieHeartBatchRef.current.timer) {
      clearTimeout(zombieHeartBatchRef.current.timer);
      zombieHeartBatchRef.current.timer = null;
    }
    zombieHeartBatchRef.current.seatedByUser.clear();
    zombieHeartBatchRef.current.queueByUser.clear();
    if (specialZombieGiftProjQueueRef.current.nextLaunchTimer) {
      clearTimeout(specialZombieGiftProjQueueRef.current.nextLaunchTimer);
      specialZombieGiftProjQueueRef.current.nextLaunchTimer = null;
    }
    specialZombieGiftProjQueueRef.current.isFlying = false;
    specialZombieGiftProjQueueRef.current.queue = [];
    pushToast('⏹️ Đã kết thúc Sự kiện Zombie, tiếp tục tiết học!', false);
  }, [pushToast]);

  // Nút Giết Zombie Ngay Lập Tức trong Dev-Event
  const handleKillZombieImmediately = useCallback(() => {
    const curEv = zombieEventStateRef.current;
    if (!curEv.isActive) {
      pushToast('⚠️ Sự kiện Zombie chưa kích hoạt!', false);
      return;
    }
    if (
      curEv.phase === 'z_flow_5b_dying' ||
      curEv.phase === 'z_flow_6_celebration'
    ) {
      pushToast('💀 Zombie đã bị tiêu diệt!', false);
      return;
    }

    const cfgNow = configRef.current;
    const standPos = cfgNow.zombieStandPos || { x: 270, y: 486 };
    const dyingDurMs = Math.max(
      1000,
      Math.round((cfgNow.zombieFlow5bDyingDurationSec ?? 3.2) * 1000)
    );

    if (zombieHeartBatchRef.current.timer) {
      clearTimeout(zombieHeartBatchRef.current.timer);
      zombieHeartBatchRef.current.timer = null;
    }
    zombieHeartBatchRef.current.seatedByUser.clear();
    zombieHeartBatchRef.current.queueByUser.clear();
    if (specialZombieGiftProjQueueRef.current.nextLaunchTimer) {
      clearTimeout(specialZombieGiftProjQueueRef.current.nextLaunchTimer);
      specialZombieGiftProjQueueRef.current.nextLaunchTimer = null;
    }
    specialZombieGiftProjQueueRef.current.isFlying = false;
    specialZombieGiftProjQueueRef.current.queue = [];

    const killDmg = Math.max(1, Math.round(curEv.hp || curEv.maxHp || 10000));
    const curZ = zombieEntityRef.current;
    const zX = curZ.visible ? curZ.x : standPos.x;
    const zY = curZ.visible ? curZ.y : standPos.y;

    const spikyKill: ZombieSpikyDamageFX = {
      id: `z_kill_${Date.now()}`,
      x: zX,
      y: zY - 38,
      vx: 0,
      vy: -42,
      damage: killDmg,
      scale: 1.38,
      createdAt: Date.now(),
    };
    setZombieSpikyDamages((prev) => [...prev.slice(-14), spikyKill]);

    soundEngine.playZombieGrowlSfx(
      (cfgNow.ttsVolume || 1) * 0.9,
      cfgNow.zombieGrowlMp3Url,
      true
    );

    setCameraFocus({
      pilgrimId: null,
      focusRole: 'zombie',
      customZoom: cfgNow.cameraZoomScale || 2.35,
      reason: 'special_gift',
      startedAt: Date.now(),
      until: Date.now() + dyingDurMs + 1300,
      lockedUntil: Date.now() + dyingDurMs + 200,
    });

    setZombieEntity((prevZ) => {
      const dyingZ: ZombieEntityState = {
        ...prevZ,
        visible: true,
        x: prevZ.visible ? prevZ.x : standPos.x,
        y: prevZ.visible ? prevZ.y : standPos.y,
        isWalking: false,
        isDying: true,
        dyingProgress: 0.02,
        recoilOffsetX: 0,
        recoilOffsetY: 0,
        hitFlashUntil: Date.now() + 260,
      };
      zombieEntityRef.current = dyingZ;
      return dyingZ;
    });

    const topList = getSortedZombieTopDamagers();
    soundEngine.setZombieEventActive(false, configRef.current);
    const dyingState: ZombieEventRuntimeState = {
      ...curEv,
      phase: 'z_flow_5b_dying',
      hp: 0,
      trailHp: 0,
      hpShakeKey: curEv.hpShakeKey + 1,
      topDamagers: topList,
      elapsedPhaseMs: 0,
      timeLeftMs: dyingDurMs,
      totalDurationMs: dyingDurMs,
      ttsFinishedForPhase: false,
      activeFlowToken: undefined,
    };
    zombieEventStateRef.current = dyingState;
    setZombieEventState(dyingState);
    syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', { state: dyingState });
    pushToast('💀 Đã giết Zombie ngay lập tức! Chuyển sang pha hạ gục & tổng kết!', true);
  }, [getSortedZombieTopDamagers, pushToast]);

  // Nút Test bắn đạn vào Zombie trong Dev-Event
  const handleTestZombieAttack = useCallback(
    (
      kind:
        | 'heart_seated'
        | 'heart_queue'
        | 'book'
        | 'chair'
        | 'desk_mate'
        | 'desk_mate_10plus',
      customUsername?: string
    ) => {
      if (
        !zombieEventStateRef.current.isActive ||
        zombieEventStateRef.current.phase !== 'z_flow_5_combat'
      ) {
        pushToast(
          '⚠️ Hãy chờ tới Luồng 5 (Chiến đấu) của Sự kiện Zombie để test đòn tấn công!',
          false
        );
        return;
      }

      const trimmedCustom = (customUsername || '').trim();
      const seatedSet = new Set(
        pilgrimsRef.current
          .filter(
            (p) =>
              Boolean(p.slotId) &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit'
          )
          .map((p) => p.username.trim().toLowerCase())
      );
      const qListOutside = Array.from(waitingPoolRef.current.values()).filter(
        (q) => !seatedSet.has(q.username.trim().toLowerCase())
      );
      const realQueueList = qListOutside.filter((q) => !q.isBot);

      if (kind === 'heart_seated' || kind === 'heart_queue') {
        if (trimmedCustom) {
          handleTriggerLike(
            kind === 'heart_seated' ? 50 : 80,
            trimmedCustom,
            true
          );
          return;
        }

        // Nếu bấm nút Test Tim (Trong lớp): chọn ngẫu nhiên 1 học sinh đang ngồi ở bàn học trong lớp để thấy đạn bay từ đúng tọa độ (x, y) bàn học
        if (kind === 'heart_seated') {
          const activeSeated = pilgrimsRef.current.filter(
            (p) =>
              Boolean(p.slotId) &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit'
          );
          const realSeated = activeSeated.filter((p) => !p.isBot);
          const seatedPool = realSeated.length > 0 ? realSeated : activeSeated;
          if (seatedPool.length > 0) {
            const chosenSeated =
              seatedPool[Math.floor(Math.random() * seatedPool.length)];
            handleTriggerLike(50, chosenSeated.username, true);
            return;
          }
        }

        // Khi test Tim (Hàng chờ) hoặc lớp trống: nhập vào người ngẫu nhiên trong HÀNG CHỜ mà tấn công!
        const pool = realQueueList.length > 0 ? realQueueList : qListOutside;
        let qUser =
          pool.length > 0
            ? pool[Math.floor(Math.random() * pool.length)].username
            : '';

        if (!qUser) {
          qUser =
            SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)] ||
            'Bạn Hàng Chờ';
          enqueueStudentToWaitingQueue({
            username: qUser,
            prayer: 'vào lớp',
            isVip: false,
            coins: 0,
            isBot: false,
          });
        }
        handleTriggerLike(kind === 'heart_seated' ? 50 : 80, '__RANDOM_NPC__', true);
        return;
      }

      const coinsMap: Record<
        'book' | 'chair' | 'desk_mate' | 'desk_mate_10plus',
        number
      > = {
        book: 1,
        chair: 5,
        desk_mate: 10,
        desk_mate_10plus: 20,
      };
      const giftNameMap: Record<
        'book' | 'chair' | 'desk_mate' | 'desk_mate_10plus',
        string
      > = {
        book: 'Hoa hồng',
        chair: 'Bắn tim',
        desk_mate: 'Thả heo',
        desk_mate_10plus: 'Siêu quà VIP',
      };
      handleTriggerClassroomGift({
        username: trimmedCustom || undefined,
        giftName: giftNameMap[kind],
        coins: coinsMap[kind],
        preferSeatedIfBlank: true,
        broadcastSync: true,
      });
    },
    [
      enqueueStudentToWaitingQueue,
      handleTriggerClassroomGift,
      handleTriggerLike,
      pushToast,
    ]
  );

  return {
    config,
    classBoardState,
    zombieEventState,
    zombieEntity,
    zombieProjectiles,
    zombieSpikyDamages,
    flyingMilkTeas,
    handleTriggerZombieEvent,
    handleStopZombieEvent,
    handleKillZombieImmediately,
    handleTestZombieAttack,
    vipSlots,
    normalSlots,
    pilgrims,
    specialFlowerRunners,
    doorCrowd,
    controlledNpcRole,
    handleToggleControlNpc,
    handleSetNpcManualMove,
    handleSendControlledStudentComment,
    monks,
    lotusDonors,
    dailyRecords,
    floatingToasts,
    customAssets,
    grandEventProgress,
    goldenLotusRainUntil,
    moneyRainUntil,
    latestAltarOffering,
    burnerLotusBursts,
    flyingLotuses,
    runningPigs,
    roamingCats,
    flyingFlowers,
    simpleExplosions,
    eventBarFlashKey,
    cameraFocus,
    cameraQueue: mappedCameraQueue,
    realCount,
    botCount,
    queueCount,
    waitingQueue,
    wsStatus,
    peerCounts,
    connectWs: (url: string) => syncService.connectWebSocket(url),
    isLocalTabMuted,
    ttsStatus,
    eventTtsQueue,
    npcNames,
    npcPrayers,
    npcAvatars,
    safetyActionMode,
    setSafetyActionMode,
    safetyCategories,
    customWords,
    safetyLogs,
    handleToggleLocalMute,
    handleUpdateConfig,
    handleUpdateGrid,
    handleAddDesk,
    handleRemoveDesk,
    handleRemoveDesksByIds,
    handleUpdateHudLayout,
    handleToggleClassBoardRun,
    handleRestartClassBoardFromStart,
    handleRunNoticeBoard,
    handleNextClassBoardQuestion,
    handleSimulateQuizAnswer,
    handleEnqueueWaitingStudent,
    handleRemoveWaitingQueueItem,
    handleClearWaitingQueue,
    handleClearNpcWaitingQueue,
    handleAdmitNextWaitingStudent,
    handleMoveWaypoint,
    handleMoveWaypointsBatch,
    handleUpdateHudBox,
    handleUpdateZoneBounds,
    handleSpawnRandom,
    handleSpawnBatch,
    handleLeaveAll,
    handleSpawnCustom,
    handleTriggerClassroomGift,
    handleTriggerGiftCombo,
    handlePlayBell,
    handlePlayWoodenFish,
    handlePanicMute,
    handleTestTTS,
    handleSpeakHostLiveText,
    teacherLiveStatus,
    handleSpeakTeacherLiveVoice,
    handleStopTeacherLiveVoice,
    handleNextDharmaArticle,
    handleTriggerLike,
    handleTriggerFollow,
    handleTriggerGrandEvent,
    handleUpdateNpcNames,
    handleResetNpcNames,
    handleUpdateNpcPrayers,
    handleResetNpcPrayers,
    handleUpdateNpcAvatars,
    handleResetNpcAvatars,
    handleRandomizeActiveNpcAvatars,
    handleToggleSafetyCategory,
    handleAddCustomWords,
    handleRemoveCustomWord,
    handleResetCustomWords,
    clearSafetyLogs,
    handleSpawnTrollTest,
    handleUploadAsset,
    handleResetAsset,
    handleSaveBackupJson,
    handleLoadBackupJson,
    handleClearLotusDonors,
    handleResetDailyRecords,
    handleClearEventTtsQueue,
    handleSkipCameraTarget,
    handleResetCameraView,
    handleClearCameraQueue,
    handleRemoveCameraQueueItem,
    handleFocusPilgrimNow,
    handlePushFullSyncToLive,
  };
}
