import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_COLORS,
  buildDoubleDeskSlots,
  calculateGiftBonusPoints,
  computeStudentIeltsLevelFromExp,
  createSingleDoubleDeskSlots,
  DEFAULT_CONFIG,
  DEFAULT_GIFT_MODEL_SCALES,
  DEFAULT_GUIDE_ITEMS,
  DEFAULT_NPC_AVATARS,
  DEFAULT_NPC_SPEECH_CATEGORIES,
  DEFAULT_SPRITESHEETS,
  DEFAULT_ZOMBIE_PROJECTILE_SCALES,
  ENGLISH_QUIZ_QUESTIONS,
  getCharacterDepthScale,
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
  ensureSentenceDecksSeeded,
  ensureTieredQuizDecksLoaded,
  getQuestionAskDurationSec,
  getQuizPointsForRank,
} from '../config/vocabDecks';
import {
  analyzeSentencePair,
  buildWrongScrambledNpcSentence,
  formatCleanSentenceAnswer,
  isSentenceScrambleItem,
} from '../utils/sentenceScramble';
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
  setUnthrottledInterval,
  setUnthrottledTimeout,
  subscribeAnimationLoop,
} from '../utils/liveLoopWakeup';
import {
  DEFAULT_REMINDER_ALERT_COOLDOWN_SEC,
  DEFAULT_REMINDER_ALERT_KEYWORDS,
  DEFAULT_REMINDER_ALERT_URL,
  matchReminderAlertKeyword,
  triggerSilentReminderUrl,
} from '../utils/silentReminderAlert';
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
  PaperPlaneFX,
  PaperPlaneHitBubbleFX,
  PilgrimData,
  Point2D,
  QueuedPilgrimRequest,
  RectBounds,
  RoamingCatAgent,
  RoseHeartBurstFX,
  RunningPigAgent,
  SafetyActionMode,
  SafetyCategory,
  SafetyLogEntry,
  SimpleExplosionFX,
  StudioBackupData,
  TempleMonkData,
  TikTokOrderMeta,
  ZombieDamageEntry,
  ZombieEntityState,
  ZombieEventRuntimeState,
  ZombieHeartProjectileVariant,
  ZombieProjectileFX,
  ZombieProjectileKind,
  ZombieSpikyDamageFX,
} from '../types/game';
import {
  compareWinnerOrder,
  doesCommentMatchQuizWord,
  ExpiredQuizWindowSnapshot,
  isLateCorrectQuizAnswerPure,
  LATE_QUIZ_ANSWER_BUBBLE_TEXT,
  pickDeterministicSlotIndex,
  sortAndReRankQuizWinners,
} from '../utils/commentOrder';
import {
  buildLiveSyncQueuePayload,
  mergeIncomingLiveSyncQueue,
  QUIZ_DECKS_IDB_KEY,
  QUIZ_QUEUE_IDB_KEY,
  QuizDeckRecord,
  recordRecentAskedWord,
  stripHeavyQuizDataForLocalStorage,
} from '../utils/quizDeckEngine';
import { HudBoxKey } from '../components/stage/StageHud';
import { ZoneKey } from '../components/stage/GameStage';

const STORAGE_KEY = 'lop_hoc_12a1_studio_state_v3';
const LEFT_DOOR_POS: Point2D = { x: 46, y: 500 };
const QUESTIONS_PER_ROUND = 10;
const SIMULATION_MIN_FRAME_MS = 1000 / 62;

function stepAxis(current: number, target: number, maxStep: number): number {
  const diff = target - current;
  const step = Math.max(0.01, maxStep);
  if (Math.abs(diff) <= step) {
    return target;
  }
  return current + Math.sign(diff) * step;
}

interface DeskObstacleBox {
  centerX: number;
  centerY: number;
  clearHalfW: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function computeClassroomDeskAisleData(
  vipSlots: KneelSlot[],
  normalSlots: KneelSlot[],
  cfg: GameConfig
) {
  const safeDeskScale = Math.max(0.5, Math.min(3.0, cfg.deskScale ?? 1));
  const deskGap = typeof cfg.studentDeskGap === 'number' ? cfg.studentDeskGap : 24;
  const rawDesks = [
    ...groupSlotsIntoDoubleDesks(vipSlots, 'vip'),
    ...groupSlotsIntoDoubleDesks(normalSlots, 'norm'),
  ];

  let minDeskTopY = 9999;
  const boxes: DeskObstacleBox[] = rawDesks.map((d) => {
    const deskW = Math.round(d.width * safeDeskScale);
    const deskH = Math.round(deskW * 0.56);
    const clearHalfW = Math.round(deskW / 2) + 12;
    const deskRenderY = d.centerY - deskGap;
    const topY = Math.round(deskRenderY - deskH * 0.65);
    const bottomY = Math.round(d.centerY + 6);
    if (deskRenderY - 22 < minDeskTopY) {
      minDeskTopY = deskRenderY - 22;
    }
    return {
      centerX: d.centerX,
      centerY: d.centerY,
      clearHalfW,
      minX: d.centerX - clearHalfW + 4,
      maxX: d.centerX + clearHalfW - 4,
      minY: topY,
      maxY: bottomY,
    };
  });

  const frontCorridorY =
    boxes.length > 0
      ? Math.min(LEFT_DOOR_POS.y, Math.max(456, Math.round(minDeskTopY)))
      : LEFT_DOOR_POS.y;

  const isXInsideAnyDeskAtY = (
    testX: number,
    testY: number,
    ignoreDeskCenterY?: number,
    ignoreDeskCenterX?: number
  ): boolean => {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (
        typeof ignoreDeskCenterY === 'number' &&
        typeof ignoreDeskCenterX === 'number' &&
        Math.abs(b.centerY - ignoreDeskCenterY) <= 4 &&
        Math.abs(b.centerX - ignoreDeskCenterX) <= 4
      ) {
        continue;
      }
      if (testY >= b.minY && testY <= b.maxY && testX > b.minX && testX < b.maxX) {
        return true;
      }
    }
    return false;
  };

  const isXClearAlongVerticalAisle = (testX: number, fromY: number): boolean => {
    const yStart = Math.min(fromY, frontCorridorY);
    const yEnd = Math.max(fromY, frontCorridorY);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY < yStart || b.minY > yEnd) continue;
      if (testX > b.minX && testX < b.maxX) {
        return false;
      }
    }
    return true;
  };

  const findNearestClearVerticalAisleX = (curX: number, curY: number): number => {
    if (boxes.length === 0 || isXClearAlongVerticalAisle(curX, curY)) {
      return Math.max(20, Math.min(520, Math.round(curX)));
    }
    const candidates = new Set<number>([24, 516]);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const leftEdge = Math.round(b.centerX - b.clearHalfW);
      const rightEdge = Math.round(b.centerX + b.clearHalfW);
      if (leftEdge >= 18 && leftEdge <= 522) candidates.add(leftEdge);
      if (rightEdge >= 18 && rightEdge <= 522) candidates.add(rightEdge);
      for (let j = i + 1; j < boxes.length; j++) {
        const b2 = boxes[j];
        if (Math.abs(b.centerY - b2.centerY) <= 36) {
          const mid = Math.round((b.centerX + b2.centerX) / 2);
          if (mid >= 18 && mid <= 522) candidates.add(mid);
        }
      }
    }
    let bestX = curX < 270 ? 24 : 516;
    let bestDist = Infinity;
    candidates.forEach((cand) => {
      if (isXClearAlongVerticalAisle(cand, curY)) {
        const dist = Math.abs(cand - curX);
        if (dist < bestDist) {
          bestDist = dist;
          bestX = cand;
        }
      }
    });
    if (bestDist < Infinity) return bestX;

    // Fallback nếu bàn xếp so le kín lối: thoát ngay ra mép ngoài bàn đang chặn tại curY
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (curY >= b.minY && curY <= b.maxY && curX > b.minX && curX < b.maxX) {
        const leftOut = Math.max(20, Math.round(b.centerX - b.clearHalfW));
        const rightOut = Math.min(520, Math.round(b.centerX + b.clearHalfW));
        return Math.abs(curX - leftOut) <= Math.abs(rightOut - curX)
          ? leftOut
          : rightOut;
      }
    }
    return Math.max(20, Math.min(520, Math.round(curX)));
  };

  const resolveSafeAisleX = (
    slotX: number,
    slotY: number,
    preferredLaneX?: number
  ): number => {
    if (boxes.length === 0) {
      return preferredLaneX ?? 270;
    }
    let ownDesk: DeskObstacleBox | null = null;
    let minOwnDist = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (Math.abs(b.centerY - slotY) <= 22) {
        const dx = Math.abs(b.centerX - slotX);
        if (dx < minOwnDist) {
          minOwnDist = dx;
          ownDesk = b;
        }
      }
    }
    if (!ownDesk) {
      if (
        typeof preferredLaneX === 'number' &&
        isXClearAlongVerticalAisle(preferredLaneX, slotY)
      ) {
        return preferredLaneX;
      }
      return findNearestClearVerticalAisleX(slotX, slotY);
    }

    const rowDesks = boxes
      .filter((b) => Math.abs(b.centerY - ownDesk!.centerY) <= 32)
      .sort((a, b) => a.centerX - b.centerX);
    const idx = rowDesks.indexOf(ownDesk);

    let leftAisle: number | null = null;
    if (idx > 0) {
      leftAisle = Math.round((rowDesks[idx - 1].centerX + ownDesk.centerX) / 2);
    } else if (ownDesk.centerX - ownDesk.clearHalfW >= 18) {
      leftAisle = Math.max(20, Math.round(ownDesk.centerX - ownDesk.clearHalfW));
    }

    let rightAisle: number | null = null;
    if (idx >= 0 && idx < rowDesks.length - 1) {
      rightAisle = Math.round((ownDesk.centerX + rowDesks[idx + 1].centerX) / 2);
    } else if (ownDesk.centerX + ownDesk.clearHalfW <= 522) {
      rightAisle = Math.min(520, Math.round(ownDesk.centerX + ownDesk.clearHalfW));
    }

    const preferLeft = slotX <= ownDesk.centerX;
    const primary = preferLeft ? leftAisle : rightAisle;
    const secondary = preferLeft ? rightAisle : leftAisle;

    if (primary !== null && isXClearAlongVerticalAisle(primary, slotY)) {
      return primary;
    }
    if (secondary !== null && isXClearAlongVerticalAisle(secondary, slotY)) {
      return secondary;
    }
    if (primary !== null && !isXInsideAnyDeskAtY(primary, slotY)) {
      return primary;
    }
    if (secondary !== null && !isXInsideAnyDeskAtY(secondary, slotY)) {
      return secondary;
    }
    return findNearestClearVerticalAisleX(slotX, slotY);
  };

  return {
    boxes,
    frontCorridorY,
    isXInsideAnyDeskAtY,
    isXClearAlongVerticalAisle,
    findNearestClearVerticalAisleX,
    resolveSafeAisleX,
  };
}

function normalizePaperPlaneTagText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeStudentHeadAndHandCoords(
  student: PilgrimData,
  vipSlots: KneelSlot[],
  normalSlots: KneelSlot[],
  cfg: GameConfig
): { headX: number; headY: number; handX: number; handY: number } {
  const vipDesks = groupSlotsIntoDoubleDesks(vipSlots, 'vip');
  const normalDesks = groupSlotsIntoDoubleDesks(normalSlots, 'norm');
  const leftSeatIds = new Set<string>();
  const deskYBySlotId = new Map<string, number>();

  vipDesks.forEach((d) => {
    leftSeatIds.add(d.leftSlot.id);
    deskYBySlotId.set(d.leftSlot.id, d.centerY);
    if (d.rightSlot) deskYBySlotId.set(d.rightSlot.id, d.centerY);
  });
  normalDesks.forEach((d) => {
    leftSeatIds.add(d.leftSlot.id);
    deskYBySlotId.set(d.leftSlot.id, d.centerY);
    if (d.rightSlot) deskYBySlotId.set(d.rightSlot.id, d.centerY);
  });

  const now = Date.now();
  const isRichKidDancing = Boolean(
    student.richKidDanceUntil && now < student.richKidDanceUntil
  );
  const isSeated = student.state === 'pray_seated' && !isRichKidDancing;
  const isAtDeskSeat =
    Boolean(student.slotId) &&
    (student.state === 'pray_seated' ||
      student.state === 'walk_side_to_slot' ||
      Math.abs(student.y - (student.slotY || student.y)) <= 8);

  const deskSeatY = student.slotId
    ? deskYBySlotId.get(student.slotId)
    : undefined;
  const effectiveBaseY =
    isAtDeskSeat && typeof deskSeatY === 'number'
      ? deskSeatY
      : isAtDeskSeat && student.slotY
      ? student.slotY
      : student.y;

  const depthScale = getCharacterDepthScale(effectiveBaseY);
  const finalScale = depthScale * (cfg.characterScale || 1);
  const safeNameTagHeight = Math.max(
    12,
    Math.min(40, Math.round(Number(cfg.nameTagHeight ?? 20)))
  );
  const nameTagHeightPx = Math.round(
    (safeNameTagHeight + 13) * (cfg.nameTagScale || 1)
  );
  const isLeftSeatmate = Boolean(
    student.slotId && leftSeatIds.has(student.slotId)
  );
  const seatmateYOffset =
    isLeftSeatmate && isAtDeskSeat ? -nameTagHeightPx : 0;
  const richKidDeskStandOffset = isRichKidDancing ? -24 : 0;
  const renderedY = effectiveBaseY + seatmateYOffset + richKidDeskStandOffset;

  return {
    headX: student.x,
    headY: renderedY - Math.round((isSeated ? 52 : 62) * finalScale),
    handX: student.x,
    handY: renderedY - Math.round((isSeated ? 36 : 44) * finalScale),
  };
}

function computeTeacherHeadCoords(
  teacher: TempleMonkData | undefined,
  cfg: GameConfig
): { headX: number; headY: number } {
  const tx = teacher ? teacher.x : 270;
  const ty = teacher ? teacher.y : 420;
  const isTeacher = !teacher || teacher.role === 'abbot';
  const depthScale = getCharacterDepthScale(ty);
  const roleScale = isTeacher ? 1.08 : 1.06;
  const individualScale = isTeacher
    ? Math.max(0.4, Math.min(3.0, cfg.femaleTeacherScale || 1))
    : Math.max(0.4, Math.min(3.0, cfg.maleTeacherScale || 1));
  const finalScale =
    depthScale * roleScale * (cfg.characterScale || 1) * individualScale;
  return {
    headX: tx,
    headY: ty - Math.round(64 * finalScale),
  };
}

function isTeacherPaperPlaneMention(commentText: string): boolean {
  if (!commentText || !commentText.includes('@')) return false;
  const mentionRegex = /@([^\s@]+(?:\s+[^\s@]+){0,3})/gu;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(commentText)) !== null) {
    const rawSegment = (match[1] || '').trim();
    if (!rawSegment) continue;
    const rawWords = rawSegment.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;
    const firstWordNorm = normalizePaperPlaneTagText(rawWords[0]);
    const twoWordsNorm =
      rawWords.length >= 2
        ? normalizePaperPlaneTagText(`${rawWords[0]} ${rawWords[1]}`)
        : '';
    if (
      firstWordNorm === 'cogiao' ||
      firstWordNorm === 'cothao' ||
      twoWordsNorm === 'co giao' ||
      twoWordsNorm === 'co thao'
    ) {
      return true;
    }
  }
  return false;
}

let nextChatBubbleSeq = 1;
function issueChatBubbleKey(): number {
  nextChatBubbleSeq = (nextChatBubbleSeq % 1_000_000_000) + 1;
  return nextChatBubbleSeq;
}

function resolvePaperPlaneTargetInClass(opts: {
  commentText: string;
  thrower: PilgrimData;
  allStudentsInClass: PilgrimData[];
  vipSlots: KneelSlot[];
  normalSlots: KneelSlot[];
  lotusDonors: DonorEntry[];
  nameTagMaxChars: number;
}): PilgrimData | null {
  const {
    commentText,
    thrower,
    allStudentsInClass,
    vipSlots,
    normalSlots,
    lotusDonors,
    nameTagMaxChars,
  } = opts;
  if (!commentText || !commentText.includes('@')) return null;

  const classmates = allStudentsInClass.filter((p) => p.id !== thrower.id);
  if (classmates.length === 0) return null;

  const safeMaxChars = Math.max(
    3,
    Math.min(60, Math.round(nameTagMaxChars || 16))
  );

  const pickNearestToThrower = (list: PilgrimData[]): PilgrimData => {
    return [...list].sort((a, b) => {
      const da = Math.hypot(a.x - thrower.x, a.y - thrower.y);
      const db = Math.hypot(b.x - thrower.x, b.y - thrower.y);
      return Math.abs(da - db) > 0.5 ? da - db : a.id - b.id;
    })[0];
  };

  const preparedClassmates = classmates.map((student) => {
    const rawFull = (student.username || '').trim();
    const rawDisplay = rawFull.slice(0, safeMaxChars);
    const normFull = normalizePaperPlaneTagText(rawFull);
    const normDisplay = normalizePaperPlaneTagText(rawDisplay);
    return {
      student,
      normFull,
      normDisplay,
      compactFull: normFull.replace(/\s+/g, ''),
      compactDisplay: normDisplay.replace(/\s+/g, ''),
    };
  });

  const mentionRegex = /@([^\s@]+(?:\s+[^\s@]+){0,3})/gu;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(commentText)) !== null) {
    const rawSegment = (match[1] || '').trim();
    if (!rawSegment) continue;
    const rawWords = rawSegment.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;

    const firstWordNorm = normalizePaperPlaneTagText(rawWords[0]);
    const twoWordsNorm =
      rawWords.length >= 2
        ? normalizePaperPlaneTagText(`${rawWords[0]} ${rawWords[1]}`)
        : '';

    // 1. Lệnh tắt thông minh: @bạn / @cùng bàn -> Ném bạn ngồi cùng bàn đôi (nếu ngồi 1 mình thì ném bạn gần nhất)
    if (
      twoWordsNorm === 'cung ban' ||
      twoWordsNorm === 'ban ben' ||
      firstWordNorm === 'cungban' ||
      firstWordNorm === 'ban'
    ) {
      if (thrower.slotId) {
        const allDesks = [
          ...groupSlotsIntoDoubleDesks(vipSlots, 'vip'),
          ...groupSlotsIntoDoubleDesks(normalSlots, 'norm'),
        ];
        const myDesk = allDesks.find(
          (d) =>
            d.leftSlot.id === thrower.slotId ||
            d.rightSlot?.id === thrower.slotId
        );
        const mateSlotId = myDesk
          ? myDesk.leftSlot.id === thrower.slotId
            ? myDesk.rightSlot?.id
            : myDesk.leftSlot.id
          : undefined;
        if (mateSlotId) {
          const seatmate = classmates.find((c) => c.slotId === mateSlotId);
          if (seatmate) return seatmate;
        }
      }
      return pickNearestToThrower(classmates);
    }

    // 2. Lệnh tắt @top1 / @top2 / @top3 -> Ném bạn đang giữ Top 1, 2, 3 trong lớp
    const topRankMatch =
      firstWordNorm.match(/^top([123])$/) ||
      twoWordsNorm.match(/^top\s+([123])$/);
    if (topRankMatch) {
      const desiredRank = parseInt(topRankMatch[1], 10);
      const donorScoreMap = new Map<string, number>();
      lotusDonors.forEach((d) => {
        donorScoreMap.set(d.username.trim().toLowerCase(), d.coins);
      });
      const rankedInClass = [...allStudentsInClass].sort((a, b) => {
        const sa =
          donorScoreMap.get(a.username.trim().toLowerCase()) ??
          a.currentScoreDisplay ??
          0;
        const sb =
          donorScoreMap.get(b.username.trim().toLowerCase()) ??
          b.currentScoreDisplay ??
          0;
        return sb !== sa ? sb - sa : a.id - b.id;
      });
      const exactRankTarget = rankedInClass[desiredRank - 1];
      if (exactRankTarget && exactRankTarget.id !== thrower.id) {
        return exactRankTarget;
      }
      const fallbackRival = rankedInClass.find((p) => p.id !== thrower.id);
      if (fallbackRival) return fallbackRival;
    }

    // 3. Lệnh tắt @random / @ngẫu nhiên -> Chọn ngẫu nhiên (đồng bộ tất định giữa các tab) 1 bạn trong lớp
    if (
      twoWordsNorm === 'ngau nhien' ||
      firstWordNorm === 'ngaunhien' ||
      firstWordNorm === 'random' ||
      firstWordNorm === 'rd'
    ) {
      let hash = thrower.id * 31 + commentText.length * 17;
      for (let i = 0; i < commentText.length; i++) {
        hash = (hash * 33 + commentText.charCodeAt(i)) >>> 0;
      }
      const sortedById = [...classmates].sort((a, b) => a.id - b.id);
      return sortedById[hash % sortedById.length];
    }

    // 4. Quét khớp tên 3 tầng ưu tiên (từ cụm 4 từ giảm dần xuống 1 từ để tự tách phần chat phía sau @tên)
    const maxWords = Math.min(4, rawWords.length);
    for (let wCount = maxWords; wCount >= 1; wCount--) {
      const candNorm = normalizePaperPlaneTagText(
        rawWords.slice(0, wCount).join(' ')
      );
      const candCompact = candNorm.replace(/\s+/g, '');
      if (candCompact.length < 2) continue;

      // Ưu tiên 1 (Prefix Match >= 2 ký tự): Khớp ngay từ đầu chuỗi tên hiển thị hoặc tên đầy đủ
      const prefixHits = preparedClassmates.filter(
        (item) =>
          (item.normDisplay && item.normDisplay.startsWith(candNorm)) ||
          (item.normFull && item.normFull.startsWith(candNorm)) ||
          (item.compactDisplay &&
            item.compactDisplay.startsWith(candCompact)) ||
          (item.compactFull && item.compactFull.startsWith(candCompact))
      );
      if (prefixHits.length > 0) {
        return pickNearestToThrower(prefixHits.map((h) => h.student));
      }

      // Ưu tiên 2 (Word Match >= 2 ký tự): Khớp trọn vẹn từ hoặc cụm từ trong tên (VD: @ngọc hoặc @bảo ngọc -> Trần Bảo Ngọc)
      const paddedCand = ` ${candNorm} `;
      const wordHits = preparedClassmates.filter(
        (item) =>
          (item.normDisplay && ` ${item.normDisplay} `.includes(paddedCand)) ||
          (item.normFull && ` ${item.normFull} `.includes(paddedCand))
      );
      if (wordHits.length > 0) {
        return pickNearestToThrower(wordHits.map((h) => h.student));
      }

      // Ưu tiên 3 (Substring Match >= 3 ký tự): Khớp chuỗi con liền nhau cho ID TikTok viết liền (VD: @tuan99 -> hoangtuan99)
      if (wCount <= 2 && candCompact.length >= 3) {
        const subHits = preparedClassmates.filter(
          (item) =>
            (item.compactDisplay &&
              item.compactDisplay.includes(candCompact)) ||
            (item.compactFull && item.compactFull.includes(candCompact))
        );
        if (subHits.length > 0) {
          return pickNearestToThrower(subHits.map((h) => h.student));
        }
      }
    }
  }

  return null;
}

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
        id: `en-r10-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
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
        id: `en-r10-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
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

function getZombiePhaseOrder(phase: ZombieEventRuntimeState['phase']): number {
  switch (phase) {
    case 'idle':
    case 'queued':
      return 0;
    case 'z_flow_1_intro':
      return 1;
    case 'z_flow_2_spawn':
      return 2;
    case 'z_flow_3_teacher':
      return 3;
    case 'z_flow_4_supervisor':
      return 4;
    case 'z_flow_5_combat':
      return 5;
    case 'z_flow_5b_dying':
      return 6;
    case 'z_flow_6_celebration':
      return 7;
    default:
      return 0;
  }
}

function consumeCurrentAndGetNextQuizQueue(
  cfg: GameConfig,
  currentIdx: number,
  currentQuestion?: EnglishQuizItem | null,
  forceNewRound15 = false,
  recentAskedWords?: Set<string>
): { nextQuizList: EnglishQuizItem[]; nextQuiz: EnglishQuizItem } {
  const currentList = getActiveQuizList(cfg);
  const safeIdx =
    currentList.length > 0 ? Math.max(0, currentIdx % currentList.length) : 0;
  let remaining = forceNewRound15 ? [] : currentList.slice(safeIdx + 1);

  const curEnLower = currentQuestion?.en?.trim().toLowerCase() || '';
  const curId = currentQuestion?.id || '';
  if (curEnLower && recentAskedWords) {
    recordRecentAskedWord(recentAskedWords, curEnLower);
  }
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
    remaining = build15MinuteTieredRoundQuestions(
      cfg,
      curEnLower,
      recentAskedWords
    );
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

// Hệ thống 17 Cấp độ IELTS (1 -> 17 tương ứng IEL 1.0 -> IEL 9.0): tính tự động từ tổng điểm EXP tích lũy
function getStudentLevelFromExp(exp: number): number {
  return computeStudentIeltsLevelFromExp(exp).level;
}

const STUDENT_EXP_LS_KEY = 'chua_student_exp_v1';
const STUDENT_EXP_IDB_KEY = 'classroom_student_exp_v1';
const STUDENT_TROPHY_LS_KEY = 'lop_hoc_12a1_student_trophies_v1';
const STUDENT_TROPHY_IDB_KEY = 'classroom_student_trophies_v1';
const DAILY_TROPHY_SCHEMA_LS_KEY = 'lop_hoc_12a1_daily_trophy_schema_v1';

// Giải pháp 3: Chỉ lưu những người có giá trị > 0 (loại bỏ hoàn toàn dữ liệu rác = 0)
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
  if (/\s/.test(clean)) {
    return formatCleanSentenceAnswer(clean);
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/**
 * Tạo câu trả lời sai tự nhiên của NPC:
 * - Với câu Ghép Câu: hoán đổi vị trí 2 từ liền nhau.
 * - Với Từ Vựng: hoán đổi ngẫu nhiên vị trí 2 chữ cái liền nhau khác nhau.
 */
function buildTypoQuizAnswer(word: string): string {
  if (/\s/.test((word || '').trim())) {
    return buildWrongScrambledNpcSentence(word);
  }
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

function formatQuizQuestionTtsSpeech(
  template: string | undefined,
  questionNumber: number,
  quiz: EnglishQuizItem
): string {
  const tpl =
    template ||
    'Câu hỏi số [SốCâu]: [NghĩaViệt] tiếng Anh là gì, gồm [SốChữ] chữ cái?';
  if (isSentenceScrambleItem(quiz)) {
    const parsed = analyzeSentencePair(quiz.vi, quiz.en);
    const wordCount = Math.max(1, parsed.words.length);
    const viClean = parsed.viDisplay.replace(/[?!.]+\s*$/g, '').trim() || quiz.vi;
    return tpl
      .replace(/\[SốCâu\]|\{index\}/gi, String(questionNumber))
      .replace(/\[NghĩaViệt\]|\{vi\}/gi, viClean)
      .replace(/(?:\[SốChữ\]|\{len\})\s*chữ\s*cái/gi, `${wordCount} từ`)
      .replace(/\[SốTừ\]|\{words\}/gi, String(wordCount))
      .replace(/\[SốChữ\]|\{len\}/gi, String(wordCount))
      .replace(/\[ĐápÁn\]|\{en\}/gi, parsed.enCanonical);
  }
  return tpl
    .replace(/\[SốCâu\]|\{index\}/gi, String(questionNumber))
    .replace(/\[NghĩaViệt\]|\{vi\}/gi, quiz.vi)
    .replace(/\[SốChữ\]|\{len\}/gi, String(quiz.en.length))
    .replace(/\[ĐápÁn\]|\{en\}/gi, quiz.en);
}

function isJoinClassCommand(text: string): boolean {
  const lower = (text || '').trim().toLowerCase();
  return lower.includes('vào lớp') || lower.includes('vao lop');
}

function parseGenderCommand(text: string): 'male' | 'female' | null {
  const lower = (text || '').trim().toLowerCase();
  if (!lower) return null;
  if (/(?:^|\s)\/\s*nam(?=$|[^\p{L}\p{N}])/iu.test(lower)) {
    return 'male';
  }
  if (/(?:^|\s)\/\s*(?:nu|nữ)(?=$|[^\p{L}\p{N}])/iu.test(lower)) {
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
  queuedEntries: QueuedPilgrimRequest[] = [],
  trophyMap?: Map<string, number>,
  expMap?: Map<string, number>
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
  const nowMs = Date.now();

  for (let i = 0; i < effectiveCount; i++) {
    const qItem = queuedEntries[i];
    const qName = (qItem?.username || `Học Sinh #${i + 1}`).trim();
    const qLower = qName.toLowerCase();
    const off = DOOR_CLUSTER_OFFSETS[i % DOOR_CLUSTER_OFFSETS.length];
    const px = Math.round(centerPos.x + off.x * safeSpread);
    const py = Math.round(centerPos.y + off.y * safeSpread);
    const savedTrophies = trophyMap ? trophyMap.get(qLower) : undefined;
    const savedExp = expMap ? expMap.get(qLower) : undefined;

    const existingByName = prevPool.find(
      (p) => p.username.trim().toLowerCase() === qLower && !usedIds.has(p.id)
    );

    if (existingByName) {
      usedIds.add(existingByName.id);
      const isBotMember = Boolean(qItem?.isBot);
      const isBubbleExpired = Boolean(
        existingByName.chatBubbleUntil && nowMs >= existingByName.chatBubbleUntil
      );
      const resolvedExp = savedExp ?? existingByName.exp ?? 0;
      nextPool.push({
        ...existingByName,
        username: qName,
        gender:
          qItem?.gender ||
          existingByName.gender ||
          detectVietnameseGender(qName),
        isBot: isBotMember,
        hasShield: isBotMember
          ? false
          : Boolean(qItem?.hasShield ?? existingByName.hasShield),
        exp: resolvedExp,
        level: getStudentLevelFromExp(resolvedExp),
        goldTrophies: savedTrophies ?? existingByName.goldTrophies ?? 0,
        avatarUrl: qItem?.avatarUrl ?? existingByName.avatarUrl,
        prayer: isBubbleExpired ? '' : existingByName.prayer,
        hasComment: isBubbleExpired ? false : existingByName.hasComment,
        chatBubbleUntil: isBubbleExpired ? 0 : existingByName.chatBubbleUntil,
        chatBubbleKey: isBubbleExpired ? 0 : existingByName.chatBubbleKey,
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
      const isBotMember = Boolean(qItem?.isBot);
      const resolvedExp = savedExp ?? 0;
      nextPool.push({
        id: negId,
        username: qName,
        prayer: '',
        gender: qItem?.gender || detectVietnameseGender(qName),
        isVip: false,
        isBot: isBotMember,
        hasShield: isBotMember ? false : Boolean(qItem?.hasShield),
        exp: resolvedExp,
        level: getStudentLevelFromExp(resolvedExp),
        goldTrophies: savedTrophies ?? 0,
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
        chatBubbleKey: 0,
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
          const rawMergedDecks = ensureTieredQuizDecksLoaded(
            parsed.config.quizDecks,
            needsDeckSchemaReset
          );
          const mergedDecks = parsed.config.sentenceDecksSeededV1
            ? rawMergedDecks
            : ensureSentenceDecksSeeded(rawMergedDecks);
          const savedRoundEndText = parsed.config.lessonRoundEndTtsTemplate;
          const isOldMilkTeaRoundEnd =
            !savedRoundEndText ||
            savedRoundEndText.includes('ly trà sữa mat cha lat te');
          const savedRecordText = parsed.config.lessonRecordTtsTemplate;
          const isOldScoreRecordText =
            !savedRecordText ||
            savedRecordText.includes('Kỷ lục hôm nay với [ĐiểmKỷLục] điểm');
          const rawSavedTtsEngine = String(parsed.config.ttsEngine || '');
          const wasLegacyNodeEngine =
            rawSavedTtsEngine === 'node_edge' ||
            parsed.config.nodeVoice === 'vi-VN-HoaiMyNeural' ||
            parsed.config.nodeVoice === 'vi-VN-NamMinhNeural';
          const normalizedTtsEngine: 'web_speech' | 'google_stream' =
            rawSavedTtsEngine === 'web_speech' ? 'web_speech' : 'google_stream';
          const rawSavedHostEngine = String(parsed.config.hostTtsEngine || '');
          const normalizedHostEngine: 'web_speech' | 'google_stream' =
            rawSavedHostEngine === 'web_speech' ? 'web_speech' : 'google_stream';
          const rawSavedTeacherLiveEngine = String(
            parsed.config.teacherLiveEngine || ''
          );
          const normalizedTeacherLiveEngine: 'web_speech' | 'google_stream' =
            rawSavedTeacherLiveEngine === 'web_speech'
              ? 'web_speech'
              : 'google_stream';

          const mergedCfg: GameConfig = {
            ...DEFAULT_CONFIG,
            ...parsed.config,
            studentLevelExpEnabled: parsed.config.ieltsRankBadgeSchemaV1
              ? Boolean(parsed.config.studentLevelExpEnabled)
              : true,
            ieltsRankBadgeSchemaV1: true,
            ttsEnabled: parsed.config.ttsEnabled !== false,
            nodeTtsEndpoint: '/api/tts',
            ttsEngine: normalizedTtsEngine,
            nodeVoice: 'google-vi-warm',
            ttsPitch: wasLegacyNodeEngine
              ? DEFAULT_CONFIG.ttsPitch
              : parsed.config.ttsPitch ?? DEFAULT_CONFIG.ttsPitch,
            hostTtsEngine: normalizedHostEngine,
            hostNodeVoice: 'google-vi-warm',
            hostTtsPitch: wasLegacyNodeEngine
              ? DEFAULT_CONFIG.hostTtsPitch
              : parsed.config.hostTtsPitch ?? DEFAULT_CONFIG.hostTtsPitch,
            teacherLiveEngine: normalizedTeacherLiveEngine,
            teacherLiveVoice: 'google-vi-warm',
            quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
            sentenceDecksSeededV1: true,
            quizDecks: mergedDecks,
            activeQuizDeckId:
              !needsDeckSchemaReset && parsed.config.activeQuizDeckId
                ? parsed.config.activeQuizDeckId
                : mergedDecks[0]?.id || 'deck-tienganh-de',
            lessonStartTtsText: isOldDefaultStartText
              ? DEFAULT_CONFIG.lessonStartTtsText
              : savedStartText,
            lessonRoundEndTtsTemplate: isOldMilkTeaRoundEnd
              ? DEFAULT_CONFIG.lessonRoundEndTtsTemplate
              : savedRoundEndText,
            lessonRecordTtsTemplate: isOldScoreRecordText
              ? DEFAULT_CONFIG.lessonRecordTtsTemplate
              : savedRecordText,
            lessonRecordTtsTemplates: isOldScoreRecordText
              ? DEFAULT_CONFIG.lessonRecordTtsTemplates
              : parsed.config.lessonRecordTtsTemplates ||
                DEFAULT_CONFIG.lessonRecordTtsTemplates,
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
            zombieProjectileScales: {
              ...DEFAULT_ZOMBIE_PROJECTILE_SCALES,
              ...(parsed.config.zombieProjectileScales || {}),
            },
            grid: { ...DEFAULT_CONFIG.grid, ...(parsed.config.grid || {}) },
            hudLayout: {
              ...DEFAULT_CONFIG.hudLayout,
              ...(parsed.config.hudLayout || {}),
              // Luôn khởi động game ở Bảng Thông Báo (không tự nhảy vào Tiết Tiếng Anh ngay khi mở game)
              classBoardEngine: 'notice',
              dailyRecordTitle:
                !parsed.config.hudLayout?.dailyRecordTitle ||
                parsed.config.hudLayout?.dailyRecordTitle === 'Kỷ lục hôm nay'
                  ? 'Kỷ lục cúp vàng'
                  : parsed.config.hudLayout.dailyRecordTitle,
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
          if (
            mergedCfg.lessonStartTtsText &&
            mergedCfg.lessonStartTtsText.includes(
              'Có 15 câu hỏi với độ khó tăng dần'
            )
          ) {
            mergedCfg.lessonStartTtsText = mergedCfg.lessonStartTtsText.replace(
              'Có 15 câu hỏi với độ khó tăng dần',
              'Có 10 câu hỏi với độ khó tăng dần'
            );
          }
          const isLegacy15Queue =
            Array.isArray(mergedCfg.customQuizQuestions) &&
            mergedCfg.customQuizQuestions.length === 15;
          const isLegacy343TenQueue =
            Array.isArray(mergedCfg.customQuizQuestions) &&
            mergedCfg.customQuizQuestions.length === 10 &&
            mergedCfg.customQuizQuestions[0]?.quizLevel === 'easy' &&
            mergedCfg.customQuizQuestions[3]?.quizLevel === 'normal' &&
            mergedCfg.customQuizQuestions[7]?.quizLevel === 'hard' &&
            mergedCfg.customQuizQuestions[8]?.quizLevel === 'hard' &&
            mergedCfg.customQuizQuestions[9]?.quizLevel === 'hard';
          const hasValidNewQueue =
            !needsDeckSchemaReset &&
            !isLegacy15Queue &&
            !isLegacy343TenQueue &&
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
  const didResetLegacyDailyRecordsOnBootRef = useRef<boolean>(false);
  const [dailyRecords, setDailyRecords] = useState<DailyRecordEntry[]>(() => {
    try {
      const migrated =
        localStorage.getItem(DAILY_TROPHY_SCHEMA_LS_KEY) === '1';
      if (!migrated) {
        localStorage.setItem(DAILY_TROPHY_SCHEMA_LS_KEY, '1');
        didResetLegacyDailyRecordsOnBootRef.current = true;
        return [];
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.dailyRecords)) {
          return parsed.dailyRecords.slice(0, 5);
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });
  const [floatingToasts, setFloatingToasts] = useState<FloatingToastItem[]>([]);
  const [customAssets, setCustomAssets] = useState<CustomAssetsConfig>(DEFAULT_SPRITESHEETS);

  const [classBoardState, setClassBoardState] = useState<ClassBoardRuntimeState>(() => {
    const quizList = getActiveQuizList(config);
    const startText =
      config.lessonStartTtsText ||
      'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 10 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.';
    return {
      engine: 'notice',
      isRunning: false,
      roundSeq: 1,
      roundQuestionIndex: 0,
      questionIndex: 0,
      totalQuestions: QUESTIONS_PER_ROUND,
      currentQuestion: quizList[0],
      phase: 'lesson_start',
      lessonStepNumber: 0,
      lessonStartText: startText,
      activeFlowToken: undefined,
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
  const [paperPlanes, setPaperPlanes] = useState<PaperPlaneFX[]>([]);
  const [paperPlaneHitBubbles, setPaperPlaneHitBubbles] = useState<
    PaperPlaneHitBubbleFX[]
  >([]);
  const [roseHeartBursts, setRoseHeartBursts] = useState<RoseHeartBurstFX[]>(
    []
  );
  const paperPlaneRoseTargetByThrowerRef = useRef<
    Map<
      string,
      {
        targetId: number;
        targetUsername: string;
        targetLowerName: string;
        expiresAt: number;
      }
    >
  >(new Map());

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

  const spawnRoseHeartBurstAt = useCallback(
    (x: number, y: number, broadcastSync = false) => {
      const cfgNow = configRef.current;
      if (cfgNow.vfxRoseHeartBurstEnabled === false) return;
      const durMs = Math.max(
        450,
        Math.min(
          3000,
          Math.round(Number(cfgNow.vfxRoseHeartBurstDurationMs ?? 1100))
        )
      );
      const burstId = `rhburst_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      const burstFx: RoseHeartBurstFX = {
        id: burstId,
        x,
        y,
        createdAt: Date.now(),
        durationMs: durMs,
        scale: Number(cfgNow.vfxRoseHeartBurstScale ?? 1.0),
        count: Math.round(Number(cfgNow.vfxRoseHeartBurstCount ?? 14)),
        spread: Number(cfgNow.vfxRoseHeartBurstSpread ?? 1.0),
      };
      setRoseHeartBursts((prev) => [...prev.slice(-23), burstFx]);
      if (broadcastSync) {
        syncService.sendCommand('TRIGGER_ROSE_HEART_BURST', { x, y });
      }
      setTimeout(() => {
        setRoseHeartBursts((prev) =>
          prev.filter((item) => item.id !== burstId)
        );
      }, durMs + 180);
    },
    []
  );

  const pendingUiDaTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    const timersMap = pendingUiDaTimersRef.current;
    return () => {
      timersMap.forEach((timerId) => clearTimeout(timerId));
      timersMap.clear();
    };
  }, []);

  const doorCrowdRef = useRef(doorCrowd);
  doorCrowdRef.current = doorCrowd;
  const doorCrowdCursorRef = useRef(0);

  // Phóng máy bay giấy (hoặc bó hoa hồng trong 10s sau khi trúng máy bay giấy) từ học sinh trong lớp hoặc học sinh hàng chờ ở cửa lớp tới đầu học sinh mục tiêu
  const launchPaperPlaneAtStudent = useCallback(
    (
      thrower: PilgrimData,
      target: PilgrimData,
      broadcastSync = false,
      extraOpts?: {
        projectileKind?: 'paper_plane' | 'rose_bouquet';
        onHitCallback?: () => void;
      }
    ): void => {
      const projKind = extraOpts?.projectileKind ?? 'paper_plane';

      // Cho phép ném cả khi đang ở trong lớp (ngồi bàn, đi vào ghế, đứng phạt...) lẫn khi đứng ở hàng chờ cửa lớp (slotId === null); chỉ chặn khi đang rời lớp
      if (
        thrower.state === 'leave_side_to_aisle' ||
        thrower.state === 'leave_down_exit'
      ) {
        return;
      }

      const cfg = configRef.current;
      const throwerPts = computeStudentHeadAndHandCoords(
        thrower,
        vipSlotsRef.current,
        normalSlotsRef.current,
        cfg
      );
      const targetPts = computeStudentHeadAndHandCoords(
        target,
        vipSlotsRef.current,
        normalSlotsRef.current,
        cfg
      );

      const startX =
        throwerPts.handX + (targetPts.headX >= throwerPts.handX ? 8 : -8);
      const startY = throwerPts.handY;
      const targetX = targetPts.headX;
      const targetY = targetPts.headY;

      const dist = Math.max(24, Math.hypot(targetX - startX, targetY - startY));
      const curvedArcDist = Math.max(110, dist * 1.18 + 36);
      const safeSpeed = Math.max(
        80,
        Math.min(2500, Number(cfg.paperPlaneSpeed ?? 460))
      );
      const durationMs = Math.max(
        260,
        Math.min(4800, Math.round((curvedArcDist / safeSpeed) * 1000))
      );
      const safeScale = Math.max(
        0.25,
        Math.min(4, Number(cfg.paperPlaneScale ?? 1))
      );
      const now = Date.now();
      const planeId = `${
        projKind === 'rose_bouquet' ? 'frose' : 'pplane'
      }_${now}_${thrower.id}_${target.id}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      const planeFx: PaperPlaneFX = {
        id: planeId,
        startX,
        startY,
        targetX,
        targetY,
        createdAt: now,
        durationMs,
        scale: safeScale,
        projectileKind: projKind,
        throwerUsername: thrower.username,
        targetUsername: target.username,
      };

      setPaperPlanes((prev) => [...prev.slice(-23), planeFx]);

      if (broadcastSync) {
        syncService.sendCommand('TRIGGER_PAPER_PLANE', {
          throwerUsername: thrower.username,
          targetUsername: target.username,
          projectileKind: projKind,
        });
      }

      const targetId = target.id;
      const targetLowerName = target.username.trim().toLowerCase();
      const throwerLowerName = thrower.username.trim().toLowerCase();

      setTimeout(() => {
        setPaperPlanes((prev) => prev.filter((item) => item.id !== planeId));

        const liveTargetInClass = pilgrimsRef.current.find(
          (p) =>
            (p.id === targetId ||
              p.username.trim().toLowerCase() === targetLowerName) &&
            (Boolean(p.slotId) ||
              p.state === 'stand_punishment' ||
              p.state === 'walk_to_punishment_spot') &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        const liveTargetInDoor = !liveTargetInClass
          ? doorCrowdRef.current.find(
              (p) =>
                p.id === targetId ||
                p.username.trim().toLowerCase() === targetLowerName
            )
          : undefined;
        const liveTarget = liveTargetInClass || liveTargetInDoor;
        const liveHeadPts = liveTarget
          ? computeStudentHeadAndHandCoords(
              liveTarget,
              vipSlotsRef.current,
              normalSlotsRef.current,
              configRef.current
            )
          : { headX: targetX, headY: targetY };

        if (projKind === 'rose_bouquet') {
          extraOpts?.onHitCallback?.();
          spawnRoseHeartBurstAt(liveHeadPts.headX, liveHeadPts.headY, false);
          return;
        }

        // Máy bay giấy trúng đầu mục tiêu:
        // 1) Mở khóa cửa sổ 10 giây tiếp theo: nếu người ném tặng Hoa Hồng thì sẽ ném bó hoa hồng cho đúng bạn vừa bị ném trúng!
        if (throwerLowerName) {
          paperPlaneRoseTargetByThrowerRef.current.set(throwerLowerName, {
            targetId: liveTarget ? liveTarget.id : targetId,
            targetUsername: liveTarget ? liveTarget.username : target.username,
            targetLowerName,
            expiresAt: Date.now() + 10_000,
          });
        }

        // 2) Hiện 1 bong bóng gai trống nhỏ ngay tại tọa độ đầu vừa trúng đạn
        const hitId = `pphit_${Date.now()}_${targetId}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const hitBubble: PaperPlaneHitBubbleFX = {
          id: hitId,
          x: liveHeadPts.headX,
          y: liveHeadPts.headY,
          createdAt: Date.now(),
          scale: Math.max(0.65, Math.min(2.2, safeScale * 0.95)),
        };
        setPaperPlaneHitBubbles((prev) => [...prev.slice(-23), hitBubble]);

        setTimeout(() => {
          setPaperPlaneHitBubbles((prev) =>
            prev.filter((b) => b.id !== hitId)
          );
        }, 720);

        // 3) Sau đúng 1s kể từ lúc trúng đạn vào đầu, học sinh bị trúng tự động chat "ui da":
        const targetTimerKey =
          targetLowerName || `id_${liveTarget ? liveTarget.id : targetId}`;
        const prevPendingUiDa =
          pendingUiDaTimersRef.current.get(targetTimerKey);
        if (prevPendingUiDa) {
          clearTimeout(prevPendingUiDa);
        }

        const uiDaTimer = setTimeout(() => {
          pendingUiDaTimersRef.current.delete(targetTimerKey);
          const hitStudentStillInClass = pilgrimsRef.current.find(
            (p) =>
              (p.id === targetId ||
                p.username.trim().toLowerCase() === targetLowerName) &&
              (Boolean(p.slotId) ||
                p.state === 'stand_punishment' ||
                p.state === 'walk_to_punishment_spot') &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit'
          );
          const nowUiDa = Date.now();
          const bubbleDurationMs =
            (configRef.current.chatBubbleDurationSec || 12) * 1000;
          const nextBubbleKey = issueChatBubbleKey();

          if (hitStudentStillInClass) {
            const updatedPilgrims = pilgrimsRef.current.map((p) =>
              p.id === hitStudentStillInClass.id
                ? {
                    ...p,
                    prayer: 'ui da',
                    hasComment: true,
                    prayTimer: 0,
                    chatBubbleKey: nextBubbleKey,
                    chatBubbleUntil: nowUiDa + bubbleDurationMs,
                  }
                : p
            );
            pilgrimsRef.current = updatedPilgrims;
            setPilgrims(updatedPilgrims);
            return;
          }

          const hitStudentInDoor = doorCrowdRef.current.find(
            (p) =>
              p.id === targetId ||
              p.username.trim().toLowerCase() === targetLowerName
          );
          if (hitStudentInDoor) {
            const updatedDoor = doorCrowdRef.current.map((p) =>
              p.id === hitStudentInDoor.id
                ? {
                    ...p,
                    prayer: 'ui da',
                    hasComment: true,
                    stateTimer: 0,
                    chatBubbleKey: nextBubbleKey,
                    chatBubbleUntil: nowUiDa + bubbleDurationMs,
                  }
                : p
            );
            doorCrowdRef.current = updatedDoor;
            setDoorCrowd(updatedDoor);
          }
        }, 1000);

        pendingUiDaTimersRef.current.set(targetTimerKey, uiDaTimer);
      }, durationMs);
    },
    [spawnRoseHeartBurstAt]
  );
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
      chatBubbleColor?: 'default' | 'red';
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

  // Phóng máy bay giấy vào đúng vị trí đầu Cô Giáo (lệnh @cô giáo, @cogiao, @cô thảo, @cothao)
  const launchPaperPlaneAtTeacher = useCallback(
    (
      thrower: PilgrimData,
      broadcastSync = false,
      extraOpts?: {
        projectileKind?: 'paper_plane' | 'rose_bouquet';
      }
    ): void => {
      const projKind = extraOpts?.projectileKind ?? 'paper_plane';
      if (
        thrower.state === 'leave_side_to_aisle' ||
        thrower.state === 'leave_down_exit'
      ) {
        return;
      }

      const cfg = configRef.current;
      const teacher =
        monksRef.current.find((m) => m.role === 'abbot') || monksRef.current[0];
      const throwerPts = computeStudentHeadAndHandCoords(
        thrower,
        vipSlotsRef.current,
        normalSlotsRef.current,
        cfg
      );
      const teacherPts = computeTeacherHeadCoords(teacher, cfg);

      const startX =
        throwerPts.handX + (teacherPts.headX >= throwerPts.handX ? 8 : -8);
      const startY = throwerPts.handY;
      const targetX = teacherPts.headX;
      const targetY = teacherPts.headY;

      const dist = Math.max(24, Math.hypot(targetX - startX, targetY - startY));
      const curvedArcDist = Math.max(110, dist * 1.18 + 36);
      const safeSpeed = Math.max(
        80,
        Math.min(2500, Number(cfg.paperPlaneSpeed ?? 460))
      );
      const durationMs = Math.max(
        260,
        Math.min(4800, Math.round((curvedArcDist / safeSpeed) * 1000))
      );
      const safeScale = Math.max(
        0.25,
        Math.min(4, Number(cfg.paperPlaneScale ?? 1))
      );
      const now = Date.now();
      const planeId = `${
        projKind === 'rose_bouquet' ? 'frose' : 'pplane'
      }_teacher_${now}_${thrower.id}_${Math.random().toString(36).slice(2, 6)}`;

      const planeFx: PaperPlaneFX = {
        id: planeId,
        startX,
        startY,
        targetX,
        targetY,
        createdAt: now,
        durationMs,
        scale: safeScale,
        projectileKind: projKind,
        throwerUsername: thrower.username,
        targetUsername: teacher?.name || 'Cô Thảo',
      };

      setPaperPlanes((prev) => [...prev.slice(-23), planeFx]);

      if (broadcastSync) {
        syncService.sendCommand('TRIGGER_PAPER_PLANE', {
          throwerUsername: thrower.username,
          targetUsername: '__TEACHER_ABBOT__',
          targetRole: 'abbot',
          projectileKind: projKind,
        });
      }

      setTimeout(() => {
        setPaperPlanes((prev) => prev.filter((item) => item.id !== planeId));

        const liveTeacher =
          monksRef.current.find((m) => m.role === 'abbot') ||
          monksRef.current[0];
        const liveHeadPts = computeTeacherHeadCoords(
          liveTeacher,
          configRef.current
        );

        if (projKind === 'rose_bouquet') {
          spawnRoseHeartBurstAt(liveHeadPts.headX, liveHeadPts.headY, false);
          return;
        }

        const hitId = `pphit_teacher_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const hitBubble: PaperPlaneHitBubbleFX = {
          id: hitId,
          x: liveHeadPts.headX,
          y: liveHeadPts.headY,
          createdAt: Date.now(),
          scale: Math.max(0.65, Math.min(2.2, safeScale * 0.95)),
        };
        setPaperPlaneHitBubbles((prev) => [...prev.slice(-23), hitBubble]);

        setTimeout(() => {
          setPaperPlaneHitBubbles((prev) =>
            prev.filter((b) => b.id !== hitId)
          );
        }, 720);

        const teacherTimerKey = '__teacher_abbot__';
        const prevPending = pendingUiDaTimersRef.current.get(teacherTimerKey);
        if (prevPending) {
          clearTimeout(prevPending);
        }
        const uiDaTimer = setTimeout(() => {
          pendingUiDaTimersRef.current.delete(teacherTimerKey);
          const nowUiDa = Date.now();
          setMonks((prevMonks) => {
            const nextMonks = prevMonks.map((m) => {
              if (m.role !== 'abbot') return m;
              if (m.chatBubbleUntil && nowUiDa < m.chatBubbleUntil) {
                return m;
              }
              return {
                ...m,
                chatText: 'ui da',
                chatBubbleUntil: nowUiDa + 3800,
              };
            });
            monksRef.current = nextMonks;
            return nextMonks;
          });
        }, 1000);
        pendingUiDaTimersRef.current.set(teacherTimerKey, uiDaTimer);
      }, durationMs);
    },
    [spawnRoseHeartBurstAt]
  );

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
        bonusPoints?: number;
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
        chatBubbleColor?: 'default' | 'red';
      }>
    ) => {
      if (items.length === 0 || doorCrowdRef.current.length === 0) return;
      const now = Date.now();
      const cfg = configRef.current;
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

        const itemExp = studentExpMapRef.current.get(item.lowerUser) || 0;
        const itemTrophies =
          studentTrophyMapRef.current.get(item.lowerUser) || 0;
        const freshDoorBubbleUntil =
          Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000;
        const freshDoorBubbleKey = issueChatBubbleKey();

        // Đảm bảo nếu cùng 1 người từng hiện bong bóng ở vị trí khác trong hàng chờ thì xóa ngay lập tức bong bóng cũ
        for (let i = 0; i < poolLen; i++) {
          if (
            i !== targetIdx &&
            pool[i].username.trim().toLowerCase() === item.lowerUser &&
            pool[i].chatBubbleUntil
          ) {
            pool[i] = {
              ...pool[i],
              prayer: '',
              hasComment: false,
              chatBubbleUntil: 0,
              chatBubbleKey: 0,
              chatBubbleColor: undefined,
            };
          }
        }

        pool[targetIdx] = {
          ...chosenDoorStudent,
          username: item.username,
          prayer: item.comment,
          gender: item.gender,
          avatarUrl: item.avatarUrl || chosenDoorStudent.avatarUrl,
          exp: itemExp,
          level: getStudentLevelFromExp(itemExp),
          goldTrophies: itemTrophies,
          hasComment: true,
          stateTimer: 0,
          chatBubbleKey: freshDoorBubbleKey,
          chatBubbleUntil: freshDoorBubbleUntil,
          chatBubbleColor: item.chatBubbleColor,
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
      chatBubbleColor?: 'default' | 'red';
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

  // Nhập ngẫu nhiên (hoặc giữ nguyên nếu đã có tên) vào 1 học sinh đang đứng ở hàng chờ cửa lớp để hiện tên/chat và ném máy bay giấy
  const embodyRandomDoorCrowdStudentForThrow = useCallback(
    (item: {
      username: string;
      lowerUser: string;
      comment?: string;
      gender: 'female' | 'male';
      avatarUrl?: string | null;
      showBubble?: boolean;
    }): PilgrimData | null => {
      const cfg = configRef.current;
      const crowdPos = cfg.doorCrowdPos || LEFT_DOOR_POS;
      const maxCluster = Math.max(1, cfg.doorCrowdCount ?? 7);
      let pool = [...doorCrowdRef.current];
      if (pool.length === 0) {
        pool = buildDoorCrowdPool(
          maxCluster,
          crowdPos,
          pool,
          npcNamesRef.current,
          npcAvatarsRef.current,
          cfg.doorCrowdSpread ?? 1,
          Array.from(waitingPoolRef.current.values()),
          studentTrophyMapRef.current,
          studentExpMapRef.current
        );
      }
      if (pool.length === 0) return null;

      const now = Date.now();
      let targetIdx = pool.findIndex(
        (s) => s.username.trim().toLowerCase() === item.lowerUser
      );

      if (targetIdx < 0) {
        const activeRunnerUsers = new Set(
          specialFlowerRunnersRef.current.map((r) =>
            r.username.trim().toLowerCase()
          )
        );
        const completelyFree: number[] = [];
        const nonRunnerFree: number[] = [];
        for (let i = 0; i < pool.length; i++) {
          const isRunner = activeRunnerUsers.has(
            pool[i].username.trim().toLowerCase()
          );
          if (!isRunner) {
            nonRunnerFree.push(i);
            if (!pool[i].chatBubbleUntil || pool[i].chatBubbleUntil! <= now) {
              completelyFree.push(i);
            }
          }
        }
        if (completelyFree.length > 0) {
          targetIdx =
            completelyFree[Math.floor(Math.random() * completelyFree.length)];
        } else if (nonRunnerFree.length > 0) {
          targetIdx =
            nonRunnerFree[Math.floor(Math.random() * nonRunnerFree.length)];
        } else {
          targetIdx = Math.floor(Math.random() * pool.length);
        }
      }

      const chosen = pool[targetIdx];
      const itemExp = studentExpMapRef.current.get(item.lowerUser) || 0;
      const itemTrophies =
        studentTrophyMapRef.current.get(item.lowerUser) || 0;
      const shouldShowBubble = Boolean(item.showBubble && item.comment?.trim());
      const freshBubbleKey = shouldShowBubble
        ? issueChatBubbleKey()
        : chosen.chatBubbleKey;
      const freshBubbleUntil = shouldShowBubble
        ? now + (cfg.chatBubbleDurationSec || 12) * 1000
        : chosen.chatBubbleUntil;

      for (let i = 0; i < pool.length; i++) {
        if (
          i !== targetIdx &&
          pool[i].username.trim().toLowerCase() === item.lowerUser &&
          pool[i].chatBubbleUntil
        ) {
          pool[i] = {
            ...pool[i],
            prayer: '',
            hasComment: false,
            chatBubbleUntil: 0,
            chatBubbleKey: 0,
          };
        }
      }

      const updatedThrower: PilgrimData = {
        ...chosen,
        username: item.username,
        gender: item.gender,
        avatarUrl: item.avatarUrl || chosen.avatarUrl,
        exp: itemExp,
        level: getStudentLevelFromExp(itemExp),
        goldTrophies: itemTrophies,
        prayer: shouldShowBubble ? item.comment!.trim() : chosen.prayer,
        hasComment: shouldShowBubble ? true : chosen.hasComment,
        stateTimer: 0,
        chatBubbleKey: freshBubbleKey,
        chatBubbleUntil: freshBubbleUntil,
      };

      pool[targetIdx] = updatedThrower;
      doorCrowdRef.current = pool;
      setDoorCrowd(pool);
      return updatedThrower;
    },
    []
  );

  const tryResolveAndLaunchPaperPlane = useCallback(
    (thrower: PilgrimData, commentText: string): boolean => {
      if (!commentText || !commentText.includes('@')) return false;
      if (isTeacherPaperPlaneMention(commentText)) {
        launchPaperPlaneAtTeacher(thrower, false);
        return true;
      }
      const cfg = configRef.current;
      const activeClassStudents = pilgrimsRef.current.filter(
        (p) =>
          (Boolean(p.slotId) ||
            p.state === 'stand_punishment' ||
            p.state === 'walk_to_punishment_spot') &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const throwerLower = thrower.username.trim().toLowerCase();
      const inClassCandidates = activeClassStudents.filter(
        (p) =>
          p.id !== thrower.id &&
          p.username.trim().toLowerCase() !== throwerLower
      );

      let taggedTarget = resolvePaperPlaneTargetInClass({
        commentText,
        thrower,
        allStudentsInClass: inClassCandidates,
        vipSlots: vipSlotsRef.current,
        normalSlots: normalSlotsRef.current,
        lotusDonors: lotusDonorsRef.current,
        nameTagMaxChars: cfg.nameTagMaxChars ?? 16,
      });

      if (!taggedTarget && doorCrowdRef.current.length > 0) {
        const doorCandidates = doorCrowdRef.current.filter(
          (p) =>
            p.id !== thrower.id &&
            p.username.trim().toLowerCase() !== throwerLower
        );
        taggedTarget = resolvePaperPlaneTargetInClass({
          commentText,
          thrower,
          allStudentsInClass: doorCandidates,
          vipSlots: vipSlotsRef.current,
          normalSlots: normalSlotsRef.current,
          lotusDonors: lotusDonorsRef.current,
          nameTagMaxChars: cfg.nameTagMaxChars ?? 16,
        });
      }

      if (!taggedTarget) return false;
      launchPaperPlaneAtStudent(thrower, taggedTarget, false);
      return true;
    },
    [launchPaperPlaneAtStudent, launchPaperPlaneAtTeacher]
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
        queuedList,
        studentTrophyMapRef.current,
        studentExpMapRef.current
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
          item.hasCommentedInRound = false;
          item.isGoldenPriority = false;
          item.lastElapsedSec = 999;
          item.idleRounds = 0;
        }
      } else if (opts?.finalizeQuizRound) {
        for (const [key, item] of pool.entries()) {
          if (item.isGoldenPriority) {
            item.answeredCorrectInRound = false;
            item.hasCommentedInRound = false;
            item.idleRounds = 0;
            continue;
          }
          const didCommentInRound = Boolean(
            item.hasCommentedInRound || item.answeredCorrectInRound
          );
          item.answeredCorrectInRound = false;
          item.hasCommentedInRound = false;

          if (didCommentInRound) {
            item.idleRounds = 0;
          } else {
            // Không phát sinh comment ở lượt này -> tăng đếm số lượt im lặng liên tiếp.
            // Đủ 3 lượt liên tiếp không phát sinh comment -> xóa khỏi hàng chờ và reset điểm vòng về 0 (giữ nguyên EXP tổng & Cúp Vàng tích lũy).
            item.lastElapsedSec = 999;
            item.idleRounds = (item.idleRounds || 0) + 1;
            if (item.idleRounds >= 3) {
              item.points = 0;
              pool.delete(key);
              resetZeroUsers.add(key);
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
  const studentTrophyMapRef = useRef<Map<string, number>>(new Map());
  const studentExpDirtyRef = useRef<boolean>(false);
  const hasInitializedExpMapRef = useRef<boolean>(false);

  if (!hasInitializedExpMapRef.current) {
    hasInitializedExpMapRef.current = true;
    const initMap = new Map<string, number>();
    const initTrophyMap = new Map<string, number>();
    const ingestRecord = (target: Map<string, number>, rec: unknown) => {
      if (!rec || typeof rec !== 'object') return;
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        const cleanKey = (k || '').trim().toLowerCase();
        const val = Math.floor(Number(v) || 0);
        if (cleanKey && val > 0) {
          target.set(cleanKey, Math.max(target.get(cleanKey) || 0, val));
        }
      }
    };
    try {
      const savedStudio = localStorage.getItem(STORAGE_KEY);
      if (savedStudio) {
        const parsedStudio = JSON.parse(savedStudio);
        ingestRecord(initMap, parsedStudio?.studentExpMap);
        ingestRecord(initTrophyMap, parsedStudio?.studentTrophyMap);
      }
    } catch {
      // Ignore
    }
    try {
      const savedExpOnly = localStorage.getItem(STUDENT_EXP_LS_KEY);
      if (savedExpOnly) {
        ingestRecord(initMap, JSON.parse(savedExpOnly));
      }
    } catch {
      // Ignore
    }
    try {
      const savedTrophyOnly = localStorage.getItem(STUDENT_TROPHY_LS_KEY);
      if (savedTrophyOnly) {
        ingestRecord(initTrophyMap, JSON.parse(savedTrophyOnly));
      }
    } catch {
      // Ignore
    }
    studentExpMapRef.current = initMap;
    studentTrophyMapRef.current = initTrophyMap;
  }

  const getStudentExpById = useCallback((username: string): number => {
    const cleanKey = (username || '').trim().toLowerCase();
    if (!cleanKey) return 0;
    return studentExpMapRef.current.get(cleanKey) || 0;
  }, []);

  const getStudentTrophiesById = useCallback((username: string): number => {
    const cleanKey = (username || '').trim().toLowerCase();
    if (!cleanKey) return 0;
    return studentTrophyMapRef.current.get(cleanKey) || 0;
  }, []);

  const applyExpMapToActiveStudents = useCallback(() => {
    const map = studentExpMapRef.current;
    const trophyMap = studentTrophyMapRef.current;
    let changedPilgrims = false;
    const nextPilgrims = pilgrimsRef.current.map((p) => {
      const lower = (p.username || '').trim().toLowerCase();
      const expVal = map.get(lower) || 0;
      const lvlVal = getStudentLevelFromExp(expVal);
      const trophyVal = trophyMap.get(lower) || 0;
      if (
        (p.exp || 0) !== expVal ||
        (p.level || 1) !== lvlVal ||
        (p.goldTrophies ?? 0) !== trophyVal
      ) {
        changedPilgrims = true;
        return { ...p, exp: expVal, level: lvlVal, goldTrophies: trophyVal };
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
      const trophyVal = trophyMap.get(lower) || 0;
      if (
        (d.exp || 0) !== expVal ||
        (d.level || 1) !== lvlVal ||
        (d.goldTrophies ?? 0) !== trophyVal
      ) {
        changedCrowd = true;
        return { ...d, exp: expVal, level: lvlVal, goldTrophies: trophyVal };
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
      const serializedTrophies = serializeStudentExpMap(
        studentTrophyMapRef.current
      );

      try {
        localStorage.setItem(STUDENT_EXP_LS_KEY, JSON.stringify(serialized));
        localStorage.setItem(
          STUDENT_TROPHY_LS_KEY,
          JSON.stringify(serializedTrophies)
        );
        const rawFull = localStorage.getItem(STORAGE_KEY);
        if (rawFull) {
          const parsedFull = JSON.parse(rawFull);
          parsedFull.studentExpMap = serialized;
          parsedFull.studentTrophyMap = serializedTrophies;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedFull));
        }
      } catch {
        // Ignore quota errors
      }

      void idbSet(STUDENT_EXP_IDB_KEY, serialized);
      void idbSet(STUDENT_TROPHY_IDB_KEY, serializedTrophies);

      fetch('/api/student-exp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentExpMap: serialized,
          studentTrophyMap: serializedTrophies,
          replaceAll,
        }),
      }).catch(() => {
        // Ignore network errors
      });

      if (broadcastSync) {
        syncService.sendCommand('SYNC_STUDENT_EXP', {
          studentExpMap: serialized,
          studentTrophyMap: serializedTrophies,
          replaceAll,
        });
      }
    },
    []
  );

  // Giải pháp 2: Auto-save ngầm định kỳ mỗi 10s nếu có thay đổi EXP / Cúp Vàng trên RAM
  useEffect(() => {
    const expTimer = setInterval(() => {
      if (studentExpDirtyRef.current) {
        flushStudentExpStorage(false, true);
      }
    }, 10000);
    return () => clearInterval(expTimer);
  }, [flushStudentExpStorage]);

  const recentAskedWordsRef = useRef<Set<string>>(new Set());
  const quizIdbHydratedRef = useRef(false);
  const userModifiedQuizDecksBeforeHydrateRef = useRef(false);
  const userModifiedQuizQueueBeforeHydrateRef = useRef(false);

  // Load saved custom assets & full studio state (including large Base64 MP3s / NPC avatars / NPC lists / Student EXP & Trophies / Dedicated Quiz Decks) from IndexedDB & Server
  useEffect(() => {
    const mergeMapObject = (
      targetMap: Map<string, number>,
      rec: unknown
    ): boolean => {
      if (!rec || typeof rec !== 'object') return false;
      let hasChange = false;
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
        const cleanKey = (k || '').trim().toLowerCase();
        const val = Math.floor(Number(v) || 0);
        if (cleanKey && val > 0) {
          const prev = targetMap.get(cleanKey) || 0;
          if (val > prev) {
            targetMap.set(cleanKey, val);
            hasChange = true;
          }
        }
      }
      return hasChange;
    };

    idbGet<Record<string, number>>(STUDENT_EXP_IDB_KEY).then((savedExp) => {
      if (mergeMapObject(studentExpMapRef.current, savedExp)) {
        applyExpMapToActiveStudents();
      }
    });

    idbGet<Record<string, number>>(STUDENT_TROPHY_IDB_KEY).then(
      (savedTrophies) => {
        if (mergeMapObject(studentTrophyMapRef.current, savedTrophies)) {
          applyExpMapToActiveStudents();
        }
      }
    );

    fetch('/api/student-exp')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const changedExp =
          data?.studentExpMap &&
          mergeMapObject(studentExpMapRef.current, data.studentExpMap);
        const changedTrophies =
          data?.studentTrophyMap &&
          mergeMapObject(studentTrophyMapRef.current, data.studentTrophyMap);
        if (changedExp || changedTrophies) {
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

    Promise.all([
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
        studentTrophyMap?: Record<string, number>;
      }>('classroom_full_studio_state_v1'),
      idbGet<
        | QuizDeckRecord[]
        | {
            schemaVersion?: number;
            activeQuizDeckId?: string;
            decks?: QuizDeckRecord[];
          }
      >(QUIZ_DECKS_IDB_KEY),
      idbGet<EnglishQuizItem[]>(QUIZ_QUEUE_IDB_KEY),
    ])
      .then(([savedFull, savedQuizDecksRaw, savedQuizQueue]) => {
        const dedicatedDecks = Array.isArray(savedQuizDecksRaw)
          ? savedQuizDecksRaw
          : Array.isArray(savedQuizDecksRaw?.decks)
          ? savedQuizDecksRaw.decks
          : undefined;
        const dedicatedActiveDeckId =
          !Array.isArray(savedQuizDecksRaw) &&
          typeof savedQuizDecksRaw?.activeQuizDeckId === 'string'
            ? savedQuizDecksRaw.activeQuizDeckId
            : undefined;

        if (!savedFull && !dedicatedDecks && !savedQuizQueue) return;

        if (savedFull) {
          const changedSavedExp =
            savedFull.studentExpMap &&
            mergeMapObject(studentExpMapRef.current, savedFull.studentExpMap);
          const changedSavedTrophies =
            savedFull.studentTrophyMap &&
            mergeMapObject(
              studentTrophyMapRef.current,
              savedFull.studentTrophyMap
            );
          if (changedSavedExp || changedSavedTrophies) {
            applyExpMapToActiveStudents();
          }
        }

        if (savedFull?.config || dedicatedDecks || savedQuizQueue) {
          const hasSyncLocalConfig = Boolean(localStorage.getItem(STORAGE_KEY));
          setConfig((prev) => {
            const sourceSchemaVer = hasSyncLocalConfig
              ? Number(prev.quizDeckSchemaVersion || 0)
              : Number(
                  (!Array.isArray(savedQuizDecksRaw) &&
                    savedQuizDecksRaw?.schemaVersion) ||
                    savedFull?.config?.quizDeckSchemaVersion ||
                    prev.quizDeckSchemaVersion ||
                    0
                );
            const needsSchemaReset = sourceSchemaVer < QUIZ_DECK_SCHEMA_VERSION;
            const candidateDecks = userModifiedQuizDecksBeforeHydrateRef.current
              ? prev.quizDecks
              : dedicatedDecks && dedicatedDecks.length > 0
              ? dedicatedDecks
              : savedFull?.config?.quizDecks &&
                savedFull.config.quizDecks.length > 0
              ? savedFull.config.quizDecks
              : prev.quizDecks;
            const rawMergedQuizDecks = ensureTieredQuizDecksLoaded(
              candidateDecks,
              needsSchemaReset
            );
            const alreadySeededSentenceDecks = Boolean(
              savedFull?.config?.sentenceDecksSeededV1
            );
            const mergedQuizDecks = alreadySeededSentenceDecks
              ? rawMergedQuizDecks
              : ensureSentenceDecksSeeded(rawMergedQuizDecks);
            const preferredActiveDeckId =
              prev.activeQuizDeckId ||
              dedicatedActiveDeckId ||
              savedFull?.config?.activeQuizDeckId;

            const nextCfg: GameConfig = {
              ...prev,
              ...(hasSyncLocalConfig
                ? {
                    bellMp3Url:
                      prev.bellMp3Url || savedFull?.config?.bellMp3Url || null,
                    woodenFishMp3Url:
                      prev.woodenFishMp3Url ||
                      savedFull?.config?.woodenFishMp3Url ||
                      null,
                    answerRevealMp3Url:
                      prev.answerRevealMp3Url ||
                      savedFull?.config?.answerRevealMp3Url ||
                      null,
                    applauseMp3Url:
                      prev.applauseMp3Url ||
                      savedFull?.config?.applauseMp3Url ||
                      null,
                    zombieGrowlMp3Url:
                      prev.zombieGrowlMp3Url ||
                      savedFull?.config?.zombieGrowlMp3Url ||
                      null,
                    giftSoundMp3Urls:
                      Object.keys(prev.giftSoundMp3Urls || {}).length > 0
                        ? prev.giftSoundMp3Urls
                        : savedFull?.config?.giftSoundMp3Urls || {},
                    bgmTracks:
                      Array.isArray(savedFull?.config?.bgmTracks) &&
                      savedFull!.config!.bgmTracks!.length > 0
                        ? savedFull!.config!.bgmTracks!
                        : prev.bgmTracks,
                  }
                : savedFull?.config || {}),
              quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
              sentenceDecksSeededV1: true,
              quizDecks: mergedQuizDecks,
              activeQuizDeckId:
                !needsSchemaReset &&
                preferredActiveDeckId &&
                mergedQuizDecks.some((d) => d.id === preferredActiveDeckId)
                  ? preferredActiveDeckId
                  : mergedQuizDecks[0]?.id || 'deck-tienganh-de',
              customQuizQuestions: userModifiedQuizQueueBeforeHydrateRef.current
                ? prev.customQuizQuestions
                : Array.isArray(savedQuizQueue) && savedQuizQueue.length > 0
                ? savedQuizQueue
                : prev.customQuizQuestions,
              spawnPoint: LEFT_DOOR_POS,
              exitPoint: LEFT_DOOR_POS,
            npcSpeechCategories: {
              idle: Array.isArray(savedFull?.config?.npcSpeechCategories?.idle)
                ? savedFull!.config!.npcSpeechCategories!.idle
                : prev.npcSpeechCategories?.idle ?? DEFAULT_NPC_SPEECH_CATEGORIES.idle,
              question: Array.isArray(savedFull?.config?.npcSpeechCategories?.question)
                ? savedFull!.config!.npcSpeechCategories!.question
                : prev.npcSpeechCategories?.question ?? DEFAULT_NPC_SPEECH_CATEGORIES.question,
              reply: Array.isArray(savedFull?.config?.npcSpeechCategories?.reply)
                ? savedFull!.config!.npcSpeechCategories!.reply
                : prev.npcSpeechCategories?.reply ?? DEFAULT_NPC_SPEECH_CATEGORIES.reply,
            },
            giftModelScales: {
              ...DEFAULT_GIFT_MODEL_SCALES,
              ...(prev.giftModelScales || {}),
              ...(savedFull?.config?.giftModelScales || {}),
              maxDeskCats: 1,
            },
            zombieProjectileScales: {
              ...DEFAULT_ZOMBIE_PROJECTILE_SCALES,
              ...(prev.zombieProjectileScales || {}),
              ...(hasSyncLocalConfig
                ? {}
                : savedFull?.config?.zombieProjectileScales || {}),
            },
            grid: {
              ...prev.grid,
              ...(hasSyncLocalConfig ? {} : savedFull?.config?.grid || {}),
            },
            hudLayout: {
              ...prev.hudLayout,
              ...(hasSyncLocalConfig ? {} : savedFull?.config?.hudLayout || {}),
              dailyRecordTitle:
                (!hasSyncLocalConfig &&
                  savedFull?.config?.hudLayout?.dailyRecordTitle &&
                  savedFull.config.hudLayout.dailyRecordTitle !==
                    'Kỷ lục hôm nay') ||
                prev.hudLayout.dailyRecordTitle !== 'Kỷ lục hôm nay'
                  ? prev.hudLayout.dailyRecordTitle || 'Kỷ lục cúp vàng'
                  : 'Kỷ lục cúp vàng',
            },
          };
          if (
            !nextCfg.lessonRoundEndTtsTemplate ||
            nextCfg.lessonRoundEndTtsTemplate.includes(
              'ly trà sữa mat cha lat te'
            )
          ) {
            nextCfg.lessonRoundEndTtsTemplate =
              DEFAULT_CONFIG.lessonRoundEndTtsTemplate;
          }
          if (
            !nextCfg.lessonRecordTtsTemplate ||
            nextCfg.lessonRecordTtsTemplate.includes(
              'Kỷ lục hôm nay với [ĐiểmKỷLục] điểm'
            )
          ) {
            nextCfg.lessonRecordTtsTemplate =
              DEFAULT_CONFIG.lessonRecordTtsTemplate;
            nextCfg.lessonRecordTtsTemplates =
              DEFAULT_CONFIG.lessonRecordTtsTemplates;
          }
          if (
            nextCfg.lessonStartTtsText &&
            nextCfg.lessonStartTtsText.includes(
              'Có 15 câu hỏi với độ khó tăng dần'
            )
          ) {
            nextCfg.lessonStartTtsText = nextCfg.lessonStartTtsText.replace(
              'Có 15 câu hỏi với độ khó tăng dần',
              'Có 10 câu hỏi với độ khó tăng dần'
            );
          }
          const isLegacy15IdbQueue =
            Array.isArray(nextCfg.customQuizQuestions) &&
            nextCfg.customQuizQuestions.length === 15;
          const isLegacy343IdbQueue =
            Array.isArray(nextCfg.customQuizQuestions) &&
            nextCfg.customQuizQuestions.length === 10 &&
            nextCfg.customQuizQuestions[0]?.quizLevel === 'easy' &&
            nextCfg.customQuizQuestions[3]?.quizLevel === 'normal' &&
            nextCfg.customQuizQuestions[7]?.quizLevel === 'hard' &&
            nextCfg.customQuizQuestions[8]?.quizLevel === 'hard' &&
            nextCfg.customQuizQuestions[9]?.quizLevel === 'hard';
          if (
            needsSchemaReset ||
            isLegacy15IdbQueue ||
            isLegacy343IdbQueue ||
            !Array.isArray(nextCfg.customQuizQuestions) ||
            nextCfg.customQuizQuestions.length === 0
          ) {
            nextCfg.customQuizQuestions =
              build15MinuteTieredRoundQuestions(nextCfg);
          }
          if (!nextCfg.ieltsRankBadgeSchemaV1) {
            nextCfg.studentLevelExpEnabled = true;
            nextCfg.ieltsRankBadgeSchemaV1 = true;
          }
          return nextCfg;
        });
      }
      if (!savedFull) return;
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
      if (
        !didResetLegacyDailyRecordsOnBootRef.current &&
        Array.isArray(savedFull.dailyRecords)
      ) {
        const sliced = savedFull.dailyRecords.slice(0, 5);
        dailyRecordsRef.current = sliced;
        setDailyRecords(sliced);
        if (!lastPraisedRecordTop1Ref.current && sliced[0]?.username) {
          lastPraisedRecordTop1Ref.current = sliced[0].username.trim().toLowerCase();
        }
      }
      })
      .finally(() => {
        quizIdbHydratedRef.current = true;
      });
  }, [applyExpMapToActiveStudents]);

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

  // Lưu riêng biệt kho đề (quizDecks hàng chục nghìn câu) vào IndexedDB bằng Structured Clone chỉ khi quizDecks thay đổi
  useEffect(() => {
    if (!quizIdbHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      if (Array.isArray(config.quizDecks) && config.quizDecks.length > 0) {
        void idbSet(QUIZ_DECKS_IDB_KEY, {
          schemaVersion: config.quizDeckSchemaVersion || QUIZ_DECK_SCHEMA_VERSION,
          activeQuizDeckId: config.activeQuizDeckId,
          decks: config.quizDecks,
        });
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [config.quizDecks, config.activeQuizDeckId, config.quizDeckSchemaVersion]);

  // Lưu riêng biệt hàng chờ câu hỏi đầy đủ (customQuizQuestions) vào IndexedDB chỉ khi hàng chờ thay đổi
  useEffect(() => {
    if (!quizIdbHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      if (Array.isArray(config.customQuizQuestions)) {
        void idbSet(QUIZ_QUEUE_IDB_KEY, config.customQuizQuestions);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [config.customQuizQuestions]);

  // Save lightweight studio state (tách rời kho đề lớn khỏi JSON.stringify để không bao giờ khựng luồng chính hay tràn 5MB localStorage)
  useEffect(() => {
    const cleanVip = vipSlots.map((s) => ({ ...s, occupiedById: null }));
    const cleanNorm = normalSlots.map((s) => ({ ...s, occupiedById: null }));
    const strippedConfig = stripHeavyQuizDataForLocalStorage(config);
    const fullPayload = {
      config: strippedConfig,
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
      studentTrophyMap: serializeStudentExpMap(studentTrophyMapRef.current),
    };

    // 1. Lưu cấu hình + MP3 Base64 & Avatar Base64 vào IndexedDB (kho đề đã nằm riêng ở QUIZ_DECKS_IDB_KEY)
    void idbSet('classroom_full_studio_state_v1', fullPayload);

    // 2. Lưu bản gọn vào localStorage (< 80KB) để khởi tạo tức thì khi F5 mà không bao giờ bị QuotaExceededError
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullPayload));
    } catch {
      try {
        const lightConfig: GameConfig = {
          ...strippedConfig,
          bellMp3Url:
            strippedConfig.bellMp3Url && strippedConfig.bellMp3Url.length > 10000
              ? null
              : strippedConfig.bellMp3Url,
          woodenFishMp3Url:
            strippedConfig.woodenFishMp3Url &&
            strippedConfig.woodenFishMp3Url.length > 10000
              ? null
              : strippedConfig.woodenFishMp3Url,
          answerRevealMp3Url:
            strippedConfig.answerRevealMp3Url &&
            strippedConfig.answerRevealMp3Url.length > 10000
              ? null
              : strippedConfig.answerRevealMp3Url,
          applauseMp3Url:
            strippedConfig.applauseMp3Url &&
            strippedConfig.applauseMp3Url.length > 10000
              ? null
              : strippedConfig.applauseMp3Url,
          zombieGrowlMp3Url:
            strippedConfig.zombieGrowlMp3Url &&
            strippedConfig.zombieGrowlMp3Url.length > 10000
              ? null
              : strippedConfig.zombieGrowlMp3Url,
          giftSoundMp3Urls: {},
          bgmTracks: (strippedConfig.bgmTracks || []).map((t) =>
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
    dailyRecords,
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

  // Đồng bộ bài nhạc nền khi tự động chuyển tiếp / random sang bài kế tiếp
  useEffect(() => {
    soundEngine.setOnBgmTrackChange((nextTrackId: string) => {
      if (!nextTrackId) return;
      setConfig((prev) =>
        prev.activeBgmTrackId === nextTrackId
          ? prev
          : { ...prev, activeBgmTrackId: nextTrackId }
      );
      syncService.sendCommand('SYNC_BGM_ACTIVE_TRACK', {
        activeBgmTrackId: nextTrackId,
      });
    });
    return () => {
      soundEngine.setOnBgmTrackChange(null);
    };
  }, []);

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
    (
      lowerName: string,
      newTotalScore: number,
      delta: number,
      didRankUp = false
    ) => {
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
          const hadPendingRankUp = Boolean(
            p.rankUpUntil &&
              now < p.rankUpUntil &&
              Boolean(p.rankUpStartAt && now < p.rankUpStartAt)
          );
          const shouldRankUpAfterCard = didRankUp || hadPendingRankUp;
          const delayedStartAt = cardUntil + 2000;
          return {
            ...p,
            currentScoreDisplay: newTotalScore,
            scoreChangeDelta: delta,
            expChangeDelta: 0,
            leveledUpInRound: shouldRankUpAfterCard,
            rankUpStartAt: shouldRankUpAfterCard
              ? delayedStartAt
              : p.rankUpStartAt,
            rankUpUntil: shouldRankUpAfterCard
              ? delayedStartAt + 2000
              : p.rankUpUntil,
            rankUpKey: shouldRankUpAfterCard ? cardKey : p.rankUpKey,
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
            const hadPendingRankUp = Boolean(
              r.rankUpUntil &&
                now < r.rankUpUntil &&
                Boolean(r.rankUpStartAt && now < r.rankUpStartAt)
            );
            const shouldRankUpAfterCard = didRankUp || hadPendingRankUp;
            const delayedStartAt = cardUntil + 2000;
            return {
              ...r,
              currentScoreDisplay: newTotalScore,
              scoreChangeDelta: delta,
              expChangeDelta: 0,
              leveledUpInRound: shouldRankUpAfterCard,
              rankUpStartAt: shouldRankUpAfterCard
                ? delayedStartAt
                : r.rankUpStartAt,
              rankUpUntil: shouldRankUpAfterCard
                ? delayedStartAt + 2000
                : r.rankUpUntil,
              rankUpKey: shouldRankUpAfterCard ? cardKey : r.rankUpKey,
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

      if (!suppressPopup) {
        // Quy ước mới: EXP = Điểm luôn -> cộng điểm trực tiếp (quà tặng/thưởng) cũng cộng đúng bấy nhiêu EXP
        const prevExp = studentExpMapRef.current.get(lower) || 0;
        const prevLvl = getStudentLevelFromExp(prevExp);
        const nextExp = prevExp + points;
        studentExpMapRef.current.set(lower, nextExp);
        studentExpDirtyRef.current = true;
        const nextLvl = getStudentLevelFromExp(nextExp);
        const didRankUp = nextLvl > prevLvl;
        pilgrimsRef.current = pilgrimsRef.current.map((p) =>
          p.username.trim().toLowerCase() === lower
            ? { ...p, exp: nextExp, level: nextLvl }
            : p
        );
        if (specialFlowerRunnersRef.current.length > 0) {
          specialFlowerRunnersRef.current = specialFlowerRunnersRef.current.map(
            (r) =>
              r.username.trim().toLowerCase() === lower
                ? { ...r, exp: nextExp, level: nextLvl }
                : r
          );
        }
        if (doorCrowdRef.current.length > 0) {
          const nextDoorExp = doorCrowdRef.current.map((c) =>
            c.username.trim().toLowerCase() === lower
              ? {
                  ...c,
                  exp: nextExp,
                  level: nextLvl,
                  currentScoreDisplay: newTotal,
                  scoreChangeDelta: points,
                  scoreCardUntil: Date.now() + 3200,
                  scoreCardKey: Date.now() + Math.random(),
                }
              : c
          );
          doorCrowdRef.current = nextDoorExp;
          setDoorCrowd(nextDoorExp);
        }
        triggerStudentScoreCardPopup(lower, newTotal, points, didRankUp);
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

  const roundEndTargetRoundSeqRef = useRef<number>(0);
  const awardedTrophyRoundSetRef = useRef<Set<number>>(new Set());
  const lastTrophyAwardBatchSigRef = useRef<{ sig: string; at: number }>({
    sig: '',
    at: 0,
  });

  // Cộng Cúp Vàng cuối vòng Kiểm tra 15 phút (Top 1: +3, Top 2: +2, Top 3: +1) vào:
  // 1) Tổng số cúp vàng học sinh sở hữu dài hạn (studentTrophyMapRef -> hiển thị ở thẻ nhỏ dưới thẻ tên)
  // 2) Bảng "Kỷ lục cúp vàng" trong ngày (dailyRecords -> chỉ tính số cúp đạt được trong ngày, chỉ reset thủ công khi bấm nút Reset)
  const awardStudentGoldTrophies = useCallback(
    (
      awards: Array<{
        username: string;
        trophies: number;
        avatarUrl?: string | null;
        avatarColor?: string;
      }>,
      awardRoundSeq?: number
    ) => {
      if (
        typeof awardRoundSeq === 'number' &&
        awardRoundSeq > 0 &&
        awardedTrophyRoundSetRef.current.has(awardRoundSeq)
      ) {
        return;
      }

      // Khử trùng lặp học sinh trong cùng 1 đợt trao giải (giữ mức cúp cao nhất nếu trùng tên)
      const dedupedAwardsMap = new Map<
        string,
        {
          username: string;
          trophies: number;
          avatarUrl?: string | null;
          avatarColor?: string;
        }
      >();
      awards.forEach((a) => {
        const clean = (a.username || '').trim();
        const tCount = Math.floor(Number(a.trophies) || 0);
        if (!clean || tCount <= 0) return;
        const lowerKey = clean.toLowerCase();
        const prevItem = dedupedAwardsMap.get(lowerKey);
        if (!prevItem || tCount > prevItem.trophies) {
          dedupedAwardsMap.set(lowerKey, {
            username: clean,
            trophies: tCount,
            avatarUrl: a.avatarUrl || prevItem?.avatarUrl,
            avatarColor: a.avatarColor || prevItem?.avatarColor,
          });
        }
      });

      const validAwards = Array.from(dedupedAwardsMap.values());
      if (validAwards.length === 0) return;

      const nowAward = Date.now();
      const batchSig = `${awardRoundSeq || 0}|${validAwards
        .map((a) => `${a.username.toLowerCase()}:${a.trophies}`)
        .sort()
        .join(',')}`;
      if (
        lastTrophyAwardBatchSigRef.current.sig === batchSig &&
        nowAward - lastTrophyAwardBatchSigRef.current.at < 15000
      ) {
        return;
      }
      lastTrophyAwardBatchSigRef.current = { sig: batchSig, at: nowAward };

      if (typeof awardRoundSeq === 'number' && awardRoundSeq > 0) {
        awardedTrophyRoundSetRef.current.add(awardRoundSeq);
        if (awardedTrophyRoundSetRef.current.size > 60) {
          const oldest = awardedTrophyRoundSetRef.current.values().next().value;
          if (oldest !== undefined) {
            awardedTrophyRoundSetRef.current.delete(oldest);
          }
        }
      }

      const prevRecords = dailyRecordsRef.current;
      const prevTop1 = prevRecords[0];
      let workingRecords = [...prevRecords];

      validAwards.forEach((award, idx) => {
        const cleanName = award.username.trim();
        const lower = cleanName.toLowerCase();
        const addCount = Math.max(1, Math.floor(award.trophies));

        // 1. Cộng vào kho tổng cúp vàng sở hữu dài hạn của học sinh
        const prevTotalTrophies = studentTrophyMapRef.current.get(lower) || 0;
        studentTrophyMapRef.current.set(lower, prevTotalTrophies + addCount);
        studentExpDirtyRef.current = true;

        // 2. Cộng dồn vào số cúp vàng đạt được TRONG NGÀY trên bảng Kỷ lục cúp vàng
        const matchedPilgrim = pilgrimsRef.current.find(
          (p) => p.username.trim().toLowerCase() === lower
        );
        const matchedQueued = waitingPoolRef.current.get(lower);
        const matchedDoor = doorCrowdRef.current.find(
          (d) => d.username.trim().toLowerCase() === lower
        );
        const existingRecIdx = workingRecords.findIndex(
          (r) => r.username.trim().toLowerCase() === lower
        );
        const hashSeed = cleanName
          .split('')
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const resolvedAvatarUrl =
          award.avatarUrl ||
          matchedPilgrim?.avatarUrl ||
          matchedQueued?.avatarUrl ||
          matchedDoor?.avatarUrl ||
          (existingRecIdx >= 0 ? workingRecords[existingRecIdx].avatarUrl : null) ||
          DEFAULT_NPC_AVATARS[hashSeed % DEFAULT_NPC_AVATARS.length];
        const resolvedAvatarColor =
          award.avatarColor ||
          matchedPilgrim?.avatarColor ||
          matchedDoor?.avatarColor ||
          (existingRecIdx >= 0
            ? workingRecords[existingRecIdx].avatarColor
            : undefined) ||
          AVATAR_COLORS[hashSeed % AVATAR_COLORS.length];

        if (existingRecIdx >= 0) {
          const prevDaily = Math.max(0, workingRecords[existingRecIdx].points || 0);
          workingRecords[existingRecIdx] = {
            ...workingRecords[existingRecIdx],
            username: cleanName,
            points: prevDaily + addCount,
            avatarUrl: resolvedAvatarUrl,
            avatarColor: resolvedAvatarColor,
            updatedAt: nowAward + idx,
          };
        } else {
          workingRecords.push({
            username: cleanName,
            points: addCount,
            avatarUrl: resolvedAvatarUrl,
            avatarColor: resolvedAvatarColor,
            updatedAt: nowAward + idx,
          });
        }
      });

      workingRecords.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      });
      const top5Records = workingRecords.slice(0, 5);
      const nextTop1 = top5Records[0];
      dailyRecordsRef.current = top5Records;
      setDailyRecords(top5Records);
      syncService.sendCommand('UPDATE_DAILY_RECORDS', {
        dailyRecords: top5Records,
        awardedRoundSeq: awardRoundSeq,
      });

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

        if (!lastPraisedRecordTop1Ref.current && !prevTop1Lower) {
          lastPraisedRecordTop1Ref.current = nextTop1Lower;
        } else if (
          prevTop1Lower &&
          prevTop1Lower !== nextTop1Lower &&
          nextTop1Lower !== lastPraisedRecordTop1Ref.current &&
          isTop1InClass
        ) {
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
          pendingRecordNoticeRef.current = null;
        }
      }
    },
    []
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
        const giftPrayerText =
          entry.prayer ||
          `Em xin tặng Cô ${entry.giftName || 'Hoa Điểm 10'} ạ! 🌺`;
        const giftBubbleKey = issueChatBubbleKey();
        const nextUpdated = pilgrimsRef.current.map((p) =>
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
                prayer: giftPrayerText,
                hasComment: true,
                prayTimer: 0,
                chatBubbleKey: giftBubbleKey,
                chatBubbleUntil:
                  Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000,
                state: 'walk_in_up' as const,
                stateTimer: 0,
              }
            : p
        );
        pilgrimsRef.current = nextUpdated;
        setPilgrims(nextUpdated);
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
              ? {
                  ...p,
                  slotId: null,
                  hasDeskCat: false,
                  deskCatCount: 0,
                  hasDeskTrophy: false,
                  deskTrophyDropAt: 0,
                  hasDeskPig: false,
                  hasDeskSnack: false,
                  hasPcGamingDesk: false,
                  state: 'leave_side_to_aisle' as const,
                  stateTimer: 0,
                }
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
      const giftUserTrophies = getStudentTrophiesById(entry.username);
      const newStudent: PilgrimData = {
        id,
        username: entry.username,
        exp: giftUserExp,
        level: giftUserLevel,
        goldTrophies: giftUserTrophies,
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
        chatBubbleKey: issueChatBubbleKey(),
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
  const triggerRoundEndMilkTeaRef = useRef<(fromSync?: boolean) => void>(() => {});

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

      if (
        stepLabel.startsWith('Luồng Kết Thúc: Trà Sữa') ||
        stepLabel.startsWith('Luồng Kết Thúc: Cúp Vàng')
      ) {
        // Bỏ khóa camera vào từng cá nhân để thấy toàn cảnh Cô trao 3 Cúp Vàng 200%, 150%, 100% cho 3 bạn trên bục giảng
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

          // Cô đọc xong câu "mấy cưng ở dưới vỗ tay nào !" -> Phát âm thanh vỗ tay chúc mừng (mặc định 3.4s hoặc đúng thời lượng file upload), tiếng vỗ tay kết thúc mới kết thúc vòng và sang game mới!
          const applauseDurMs = soundEngine.playApplauseSfx(
            configRef.current.ttsVolume || 1,
            3400,
            configRef.current.applauseMp3Url,
            configRef.current.applauseVolume
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
        const startedAtWallMs =
          latestBoard.phaseEndAt &&
          latestBoard.phaseEndAt > 0 &&
          latestBoard.totalDurationMs
            ? latestBoard.phaseEndAt - latestBoard.totalDurationMs
            : 0;
        const exactFinishedElapsedMs =
          startedAtWallMs > 0
            ? Math.max(0, Date.now() - startedAtWallMs)
            : latestBoard.elapsedPhaseMs || 0;
        const nextBoard: ClassBoardRuntimeState = {
          ...latestBoard,
          ttsFinishedForPhase: true,
          ttsFinishedAtElapsedMs: exactFinishedElapsedMs,
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

  const lastExpiredQuizWindowRef = useRef<ExpiredQuizWindowSnapshot | null>(
    null
  );

  // Kiểm tra xem bình luận hiện tại có trùng với đáp án đúng trong thời gian đang hỏi bài hay không
  const isCommentMatchingActiveQuizAnswer = useCallback(
    (rawComment: string): boolean => {
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

      return doesCommentMatchQuizWord(rawComment, quizItem.en);
    },
    [getActiveQuizList]
  );

  // Kiểm tra xem bình luận của người chơi có phải đáp án ĐÚNG nhưng gửi MUỘN (sau khi hết cả thời gian hỏi + 2s bù trễ) nên bị tính là sai hay không
  const isLateCorrectQuizAnswer = useCallback(
    (rawComment: string, lowerUser: string, isBot: boolean): boolean => {
      const cfg = configRef.current;
      const bState = classBoardStateRef.current;
      const activeEngine =
        bState.engine || cfg.hudLayout.classBoardEngine || 'english_quiz';
      const currentWinnerLowers: string[] = [];
      (bState.winners || []).forEach((w) => {
        if (w?.username) currentWinnerLowers.push(w.username);
      });
      (bState.classWinners || []).forEach((w) => {
        if (w?.username) currentWinnerLowers.push(w.username);
      });
      (bState.outsideWinners || []).forEach((w) => {
        if (w?.username) currentWinnerLowers.push(w.username);
      });

      return isLateCorrectQuizAnswerPure({
        rawComment,
        lowerUser,
        isBot,
        showClassBoardBox: cfg.hudLayout.showClassBoardBox,
        activeEngine,
        isZombieActive: zombieEventStateRef.current.isActive,
        boardPhase: bState.phase,
        currentQuestionEn: bState.currentQuestion?.en,
        currentWinnerLowers,
        lastExpiredWindow: lastExpiredQuizWindowRef.current,
      });
    },
    []
  );

  const quizAnswerArrivalSeqRef = useRef<number>(0);

  // Kiểm tra câu trả lời Tiết Tiếng Anh trên Bảng Lớp khi có học sinh bình luận
  const checkEnglishQuizAnswer = useCallback(
    (
      username: string,
      rawComment: string,
      isBot: boolean,
      avatarUrl?: string | null,
      orderMeta?: TikTokOrderMeta
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

      if (!doesCommentMatchQuizWord(rawComment, quizItem.en)) return false;

      const hideAnswerBubble = cfg.filterCorrectAnswerBubble !== false;
      const nowWallMs = Date.now();
      const localArrivalSeq =
        orderMeta?.arrivalSeq ?? ++quizAnswerArrivalSeqRef.current;

      const lowerUser = username.trim().toLowerCase();
      const existingWinner = bState.winners.find(
        (w) => w.username.trim().toLowerCase() === lowerUser
      );
      if (existingWinner) {
        const candidateProbe: ClassBoardQuizWinner = {
          username: username.trim(),
          elapsedSec: existingWinner.elapsedSec,
          isBot,
          tiktokMsgId: orderMeta?.tiktokMsgId,
          tiktokCreateTimeMs: orderMeta?.tiktokCreateTimeMs,
          serverSeq: orderMeta?.serverSeq,
          arrivalSeq: localArrivalSeq,
          orderTimestampMs: orderMeta?.orderTimestampMs ?? nowWallMs,
        };
        if (compareWinnerOrder(candidateProbe, existingWinner) >= 0) {
          return true;
        }
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

      const askingStartedAtMs =
        bState.phaseEndAt && bState.phaseEndAt > 0 && bState.totalDurationMs
          ? bState.phaseEndAt - bState.totalDurationMs
          : 0;
      const preciseElapsedMs =
        askingStartedAtMs > 0
          ? Math.max(0, nowWallMs - askingStartedAtMs)
          : Math.max(0, bState.totalDurationMs - bState.timeLeftMs);
      const rawElapsedSec = Math.round((preciseElapsedMs / 1000) * 10) / 10;
      const elapsedSec = isBot
        ? Math.max(6.2, rawElapsedSec)
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
          existingInWaitingQueue.hasCommentedInRound = true;
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
            prayer: hideAnswerBubble ? '' : rawComment,
            gender: resolveUserGender(username),
            isVip: false,
            coins: 0,
            isBot: Boolean(isBot),
            avatarUrl: avatarUrl || null,
            addedAt: Date.now(),
            points: 0,
            rank: nextRank,
            answeredCorrectInRound: true,
            hasCommentedInRound: true,
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
            const slotIdx = pickDeterministicSlotIndex(
              `${lowerUser}:${bState.roundSeq || 1}:${bState.questionIndex || 0}`,
              allFreeSlots.length
            );
            const chosenSlot = allFreeSlots[slotIdx];
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
            const admittedTrophies = getStudentTrophiesById(cleanName);
            const admittedStudent: PilgrimData = {
              id,
              username: cleanName,
              currentScoreDisplay: existingDonorScore,
              exp: admittedExp,
              level: admittedLevel,
              goldTrophies: admittedTrophies,
              prayer: hideAnswerBubble ? '' : rawComment,
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
              hasComment: Boolean(!hideAnswerBubble && rawComment.trim()),
              chatBubbleKey:
                !hideAnswerBubble && rawComment.trim()
                  ? issueChatBubbleKey()
                  : 0,
              chatBubbleUntil:
                !hideAnswerBubble && rawComment.trim()
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
            Array.from(pool.values()),
            studentTrophyMapRef.current,
            studentExpMapRef.current
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
        tiktokMsgId: orderMeta?.tiktokMsgId,
        tiktokCreateTimeMs: orderMeta?.tiktokCreateTimeMs,
        serverSeq: orderMeta?.serverSeq,
        arrivalSeq: localArrivalSeq,
        orderTimestampMs: orderMeta?.orderTimestampMs ?? nowWallMs,
      };

      const liveBoard = classBoardStateRef.current;
      const reRanked = sortAndReRankQuizWinners(
        [...(liveBoard.winners || []), winnerEntry],
        {
          currentQuestion: liveBoard.currentQuestion || quizItem,
          getRankPoints: getQuizRankPoints,
          getPunishmentMultiplier: (wLower) => {
            const punishedMatch = pilgrimsRef.current.find(
              (p) =>
                p.username.trim().toLowerCase() === wLower &&
                p.isPunishedInCurrentRound &&
                p.punishmentMultiplier
            );
            return punishedMatch?.punishmentMultiplier || 1;
          },
        }
      );

      const groupWinnersAfter = isSeated
        ? reRanked.classWinners
        : reRanked.outsideWinners;
      const canonicalIdx = groupWinnersAfter.findIndex(
        (w) => w.username.trim().toLowerCase() === lowerUser
      );
      if (canonicalIdx >= 0) {
        groupRank = canonicalIdx + 1;
        rewardPoints =
          groupWinnersAfter[canonicalIdx].points ?? rewardPoints;
      }

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
        ...liveBoard,
        timeLeftMs: liveTimeLeft,
        elapsedPhaseMs: liveElapsed,
        winners: reRanked.winners,
        classWinners: reRanked.classWinners,
        outsideWinners: reRanked.outsideWinners,
      };
      classBoardStateRef.current = nextState;
      setClassBoardState(nextState);

      const isPureLiveTabNow =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('view') === 'live' ||
          new URLSearchParams(window.location.search).get('mode') === 'live' ||
          new URLSearchParams(window.location.search).get('obs') === '1');
      const isSlaveTabNow =
        peerCountsRef.current.obsPeers > 0 && !isPureLiveTabNow;
      // Single Authority: Chỉ Tab Master (Tab Live khi mở song song, hoặc Tab Admin khi chạy đơn) phát gói chốt thứ tự bảng điểm
      if (!isSlaveTabNow) {
        syncService.sendCommand('SYNC_CLASS_BOARD_STATE', { state: nextState });
      }


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
        if (!req.isBot && req.prayer && req.prayer.trim()) {
          existing.hasCommentedInRound = true;
          existing.idleRounds = 0;
        }
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
        hasCommentedInRound: Boolean(!req.isBot && req.prayer && req.prayer.trim()),
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
          Array.from(pool.values()),
          studentTrophyMapRef.current,
          studentExpMapRef.current
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
      comboCount = 1,
      explicitBonusPoints?: number
    ) => {
      const now = Date.now();
      const cfg = configRef.current;
      const giftMeta = resolveClassroomGiftKind(giftId, 1);
      const bonusPts =
        explicitBonusPoints !== undefined && explicitBonusPoints > 0
          ? explicitBonusPoints
          : calculateGiftBonusPoints(giftMeta.coins);
      const hasCombo = comboCount > 1;

      // Phát sound tương ứng khi bắt đầu thực hiện hành động quà tặng này
      soundEngine.playGiftEventSound(giftId, cfg);

      // Nếu thuộc nhóm quà đi bộ lên tặng hoa (rose: Cô Thảo, icecream: Thầy Cá)
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
                flowerBonusAwarded: true,
                floatingScoreText: `+${bonusPts}đ`,
                floatingScoreColor: 'gold' as const,
                floatingScoreUntil: now + 3400,
                floatingScoreKey: now,
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
            isDeferredFromQueue ? 'Bắt đầu lượt tặng tiếp theo -> ' : `+${bonusPts}đ • `
          }Đang mang hoa lên tặng!`,
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
                prayTimer: 0,
                chatBubbleKey: issueChatBubbleKey(),
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
                prayTimer: 0,
                chatBubbleKey: issueChatBubbleKey(),
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
                prayTimer: 0,
                chatBubbleKey: issueChatBubbleKey(),
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
              prayTimer: 0,
              chatBubbleKey: issueChatBubbleKey(),
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

      // Mặc định 'vip': Tôi là Rich Kid (+5đ/xu bản thân, +30đ toàn bộ học sinh trong lớp, đứng lên mặt bàn nhảy + mưa tiền, chờ 1s mới zoom camera 5s)
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
            floatingScoreText: `+${bonusPts}đ`,
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
        }Bản thân +${bonusPts}đ, cả lớp +30đ & Mưa Tiền 5s!`,
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
      const fallbackStandPos = cfgNowForSpeed.zombieStandPos || {
        x: 270,
        y: 486,
      };
      const baseTargetX = zEnt.visible ? zEnt.x : fallbackStandPos.x;
      const baseTargetY = zEnt.visible ? zEnt.y : fallbackStandPos.y;
      const targetX = baseTargetX + (Math.random() - 0.5) * 18;
      const targetY = baseTargetY - 42 + (Math.random() - 0.5) * 16;
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

      const HEART_PROJECTILE_VARIANTS: ZombieHeartProjectileVariant[] = [
        'pencil_case',
        'blue_ruler',
        'casio',
      ];
      const heartVariant: ZombieHeartProjectileVariant | undefined =
        opts.kind === 'pencil_case'
          ? HEART_PROJECTILE_VARIANTS[
              Math.floor(Math.random() * HEART_PROJECTILE_VARIANTS.length)
            ]
          : undefined;

      const projItem: ZombieProjectileFX = {
        id: `zproj_${launchAt}_${Math.random().toString(36).slice(2, 7)}`,
        kind: opts.kind,
        heartVariant,
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
          const standPosDying = cfgNow.zombieStandPos || { x: 270, y: 486 };
          const prevZSnap = zombieEntityRef.current;
          const dyingZSnapshot: ZombieEntityState = {
            ...prevZSnap,
            visible: true,
            x: prevZSnap.visible ? prevZSnap.x : standPosDying.x,
            y: prevZSnap.visible ? prevZSnap.y : standPosDying.y,
            isWalking: false,
            isDying: true,
            dyingProgress: 0.02,
            recoilOffsetX: 0,
            recoilOffsetY: 0,
          };
          zombieEntityRef.current = dyingZSnapshot;
          setZombieEntity(dyingZSnapshot);
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
          syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
            state: dyingState,
            entity: dyingZSnapshot,
            force: true,
          });
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
    (
      wasRunningLesson?: boolean,
      broadcastSync = true,
      broadcastAuthoritativeState = false
    ) => {
      const cfg = configRef.current;
      if (cfg.zombieEventEnabled === false) {
        return;
      }
      const isPureLiveTab =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('view') === 'live' ||
          new URLSearchParams(window.location.search).get('mode') === 'live' ||
          new URLSearchParams(window.location.search).get('obs') === '1');
      const peersNow = peerCountsRef.current;
      const isPassiveZombieTab =
        !isPureLiveTab &&
        (peersNow.obsPeers > 0 ||
          (peersNow.totalPeers > 1 && soundEngine.isTabMuted()));

      quizNpcTimersRef.current.forEach((cancelFn) => cancelFn());
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

      // Đặt vị trí của Cô Thảo và Thầy Cá khi Event Zombie kích hoạt theo cấu hình Dev
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
              name: 'Thầy Cá',
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
      if (!soundEngine.isRemoteSlaveMode() && !isPassiveZombieTab) {
        soundEngine.playBell((cfg.ttsVolume || 1) * 0.8, null, true);
      }

      const enqueued1 =
        soundEngine.isRemoteSlaveMode() || isPassiveZombieTab
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
      const dur1 = enqueued1
        ? Math.max(15000, minDur1Ms + 4000)
        : Math.max(2500, minDur1Ms + 1500);
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
        if (isPassiveZombieTab) {
          // Tab Điều Khiển ủy quyền cho Tab Live (?obs=1) làm Master điều phối âm thanh & các luồng Zombie (không gửi đè SYNC_ZOMBIE_EVENT_STATE tránh lệch token)
          syncService.sendCommand('TRIGGER_ZOMBIE_EVENT', {
            wasRunningLesson: shouldResume,
          });
        } else {
          syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
            state: nextZState,
            entity: resetZEntity,
            force: true,
          });
        }
      } else if (broadcastAuthoritativeState && !isPassiveZombieTab) {
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: nextZState,
          entity: resetZEntity,
          force: true,
        });
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
      wasBlankTestTarget?: boolean;
      broadcastSync?: boolean;
    }) => {
      const cfg = configRef.current;
      const now = Date.now();
      const rawGiftCoins = Math.max(
        1,
        Math.round(Number(opts.coins ?? 0) || 0) ||
          resolveClassroomGiftKind(opts.giftName, 1).coins
      );
      const giftMeta = resolveClassroomGiftKind(opts.giftName, rawGiftCoins);
      const bonusPts = calculateGiftBonusPoints(rawGiftCoins);
      const isZombieEventRunningNow = zombieEventStateRef.current.isActive;
      let pickedFromNpcFallback = false;

      // Xác định tên người tặng quà:
      // - Nếu có preferSeatedIfBlank === true thì ưu tiên chọn học sinh đang ngồi tại các bàn học trong lớp để đạn xuất phát đúng từ tọa độ (x, y) bàn học!
      let rawName = (opts.username || '').trim();
      const hadExplicitUsername = Boolean(rawName) && !opts.wasBlankTestTarget;
      if (rawName && opts.wasBlankTestTarget && opts.preferSeatedIfBlank) {
        const existsSeatedHere = pilgrimsRef.current.some(
          (p) =>
            p.username.trim().toLowerCase() === rawName.toLowerCase() &&
            (Boolean(p.slotId) ||
              p.state === 'stand_punishment' ||
              p.state === 'walk_to_punishment_spot') &&
            !p.leaveAfterGiftAction &&
            p.state !== 'leave_side_to_aisle' &&
            p.state !== 'leave_down_exit'
        );
        if (!existsSeatedHere) {
          rawName = '';
        }
      }
      if (!rawName && opts.preferSeatedIfBlank) {
        const seatedStudents = pilgrimsRef.current.filter(
          (p) =>
            (Boolean(p.slotId) ||
              p.state === 'stand_punishment' ||
              p.state === 'walk_to_punishment_spot') &&
            !p.leaveAfterGiftAction &&
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
                (Boolean(p.slotId) ||
                  p.state === 'stand_punishment' ||
                  p.state === 'walk_to_punishment_spot') &&
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

      // Kiểm tra xem người chơi hiện có trong Lớp hoặc Hàng Chờ không (kể cả đang đứng phạt / nhận cúp trên bục giảng)
      const existingInClass = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          (Boolean(p.slotId) ||
            p.state === 'stand_punishment' ||
            p.state === 'walk_to_punishment_spot') &&
          !p.leaveAfterGiftAction &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const pool = waitingPoolRef.current;
      const existingInQueue = pool.get(lowerUser);
      const isRealExplicitUser = !opts.isBot && hadExplicitUsername;
      const isAttackerBot = isRealExplicitUser
        ? false
        : Boolean(
            opts.isBot ||
              existingInClass?.isBot ||
              existingInQueue?.isBot ||
              pickedFromNpcFallback
          );
      // Chỉ ẩn cộng điểm với bot tự động phụ trợ bắn Boss trong Event Zombie (opts.isBot === true)
      const isSilentZombieBot = Boolean(opts.isBot) && isZombieEventRunningNow;

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
          coins: rawGiftCoins,
          comboCount: effectiveCombo,
          avatarUrl: opts.avatarUrl || null,
          isBot: Boolean(opts.isBot),
          preferSeatedIfBlank: Boolean(opts.preferSeatedIfBlank),
          wasBlankTestTarget: !hadExplicitUsername,
        });
      }

      // NPC giả lập tấn công Zombie (hoặc NPC auto-gift) tuyệt đối không nhận hiệu ứng Khiên
      const grantsShield =
        (rawGiftCoins >= 5 || giftMeta.coins >= 5) &&
        !opts.isBot &&
        !isSilentZombieBot;

      // TRƯỜNG HỢP 1: Người chơi ĐANG CÓ TRONG LỚP -> Cộng ngay 5đ/xu cho mọi loại quà (kể cả hoa & combo) và xếp vào hàng chờ hành động tuần tự
      if (existingInClass) {
        if (!isSilentZombieBot) {
          addLotusPointsToDonor(safeName, bonusPts);
        }

        // Nếu người xem thật trùng tên với 1 NPC đang trong lớp hoặc tặng quà từ 5 coin trở lên -> nâng cấp thành người thật & cấp Khiên bảo vệ
        if (
          (grantsShield && !existingInClass.hasShield) ||
          (isRealExplicitUser && existingInClass.isBot)
        ) {
          const withUpgrades = pilgrimsRef.current.map((p) =>
            p.id === existingInClass.id
              ? {
                  ...p,
                  hasShield: grantsShield ? true : p.hasShield,
                  isBot: isRealExplicitUser ? false : p.isBot,
                  isVip: isRealExplicitUser ? true : p.isVip,
                }
              : p
          );
          pilgrimsRef.current = withUpgrades;
          setPilgrims(withUpgrades);
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
          const projKind: ZombieProjectileKind =
            rawGiftCoins >= 10
              ? 'desk_mate'
              : rawGiftCoins >= 5
              ? 'chair'
              : 'book';
          const launchCoords = getSeatedStudentLaunchPos(existingInClass);
          fireZombieAttackProjectile({
            attackerUsername: safeName,
            startX: launchCoords.x,
            startY: launchCoords.y,
            damage: rawGiftCoins * 100,
            kind: projKind,
            giftId: giftMeta.id,
            giftCoins: rawGiftCoins,
            isSeated: true,
            avatarColor: existingInClass.avatarColor,
            avatarUrl: existingInClass.avatarUrl,
            isBot: isSilentZombieBot,
            skipIndividualScoreRecord: isSilentZombieBot,
          });
        }

        if (isSilentZombieBot) {
          return;
        }

        // Nếu trong vòng 10 giây kể từ lúc ném máy bay giấy trúng bạn, bạn ném gửi quà Hoa Hồng ->
        // Ném thẳng Bó Hoa Hồng (cùng model hoa tặng Cô, đường đạn & tốc độ như máy bay giấy) sang cho bạn vừa bị ném đó!
        if (giftMeta.id === 'rose') {
          const roseTargetLock =
            paperPlaneRoseTargetByThrowerRef.current.get(lowerUser);
          if (roseTargetLock && now <= roseTargetLock.expiresAt) {
            const friendTarget = pilgrimsRef.current.find(
              (p) =>
                (p.id === roseTargetLock.targetId ||
                  p.username.trim().toLowerCase() ===
                    roseTargetLock.targetLowerName) &&
                (Boolean(p.slotId) ||
                  p.state === 'stand_punishment' ||
                  p.state === 'walk_to_punishment_spot') &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit' &&
                p.id !== existingInClass.id
            );
            if (friendTarget) {
              soundEngine.playGiftEventSound('rose', cfg, !opts.isBot);
              const updatedWithBouquetScore = pilgrimsRef.current.map((p) =>
                p.id === existingInClass.id
                  ? {
                      ...p,
                      comboCount:
                        effectiveCombo > 1 ? effectiveCombo : p.comboCount,
                      comboUntil:
                        effectiveCombo > 1 ? now + 9000 : p.comboUntil,
                      comboPopKey:
                        effectiveCombo > 1 ? now : p.comboPopKey,
                      floatingScoreText: `+${bonusPts}đ`,
                      floatingScoreColor: 'gold' as const,
                      floatingScoreUntil: now + 3400,
                      floatingScoreKey: now,
                    }
                  : p
              );
              pilgrimsRef.current = updatedWithBouquetScore;
              setPilgrims(updatedWithBouquetScore);
              launchPaperPlaneAtStudent(existingInClass, friendTarget, false, {
                projectileKind: 'rose_bouquet',
              });
              pushToast(
                `🌹 ${safeName} (+${bonusPts}đ) gửi bó hoa hồng bay tới ${friendTarget.username}! ❤️`,
                true
              );
              return;
            }
          }
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
            effectiveCombo,
            bonusPts
          );
          return;
        }

        // Nếu đang trong Event Zombie hoặc học sinh đang bận thực hiện hành động quà trước ->
        // Đẩy hành động vào hàng chờ tuần tự (điểm +5đ/xu đã được cộng ngay lập tức ở trên)!
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
                floatingScoreText: `+${bonusPts}đ`,
                floatingScoreColor: 'gold' as const,
                floatingScoreUntil: now + 3400,
                floatingScoreKey: now,
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
            bonusPoints: bonusPts,
            isDeferredFromQueue: true,
            addedAt: now,
          },
        ];
        pendingGiftActionsByUserRef.current.set(lowerUser, nextQueue);
        pushToast(
          isZombieEventRunning
            ? `🧟 ${safeName} dùng ${giftMeta.giftLabel} (+${bonusPts}đ) tấn công Zombie! (Hành động "${giftMeta.actionTitle}" đã xếp vào hàng chờ sau Event #${nextQueue.length})`
            : `🔥 ${safeName} tặng ${giftMeta.giftLabel} (COMBO x${comboForQueued} • +${bonusPts}đ) -> Đã cộng điểm & xếp hàng chờ hành động tuần tự (#${nextQueue.length})!`,
          true
        );
        return;
      }

      // TRƯỜNG HỢP 2 & 3: Người chơi ĐANG TRONG HÀNG CHỜ hoặc CHƯA CÓ TRONG LỚP / HÀNG CHỜ -> Cộng ngay 5đ/xu cho mọi loại quà!
      if (!isSilentZombieBot) {
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
        if (!opts.isBot) {
          existingInQueue.isGoldenPriority = true;
          existingInQueue.goldenPriorityAt =
            existingInQueue.goldenPriorityAt || now;
          existingInQueue.isBot = false;
          existingInQueue.isVip = true;
        }
        if (!isSilentZombieBot) {
          existingInQueue.points = (existingInQueue.points || 0) + bonusPts;
        }
        existingInQueue.coins = (existingInQueue.coins || 0) + rawGiftCoins;
        existingInQueue.avatarUrl = resolvedAvatar;
        existingInQueue.hasCommentedInRound = true;
        existingInQueue.idleRounds = 0;
        if (grantsShield && !opts.isBot) {
          existingInQueue.hasShield = true;
        }
        recomputeWaitingQueueLazy();
      } else {
        pool.set(lowerUser, {
          id: `wq_gold_${now}_${Math.random().toString(36).slice(2, 6)}`,
          username: safeName,
          prayer: safeComment || `Tặng ${giftMeta.giftLabel}`,
          gender: resolvedGender,
          isVip: !opts.isBot,
          coins: rawGiftCoins,
          isBot: Boolean(opts.isBot),
          avatarUrl: resolvedAvatar,
          addedAt: now,
          points: isSilentZombieBot ? 0 : bonusPts,
          rank: 1,
          answeredCorrectInRound: !opts.isBot,
          hasCommentedInRound: true,
          lastElapsedSec: 0.1,
          idleRounds: 0,
          isGoldenPriority: !opts.isBot,
          goldenPriorityAt: !opts.isBot ? now : undefined,
          hasShield: grantsShield && !opts.isBot,
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
          Array.from(pool.values()),
          studentTrophyMapRef.current,
          studentExpMapRef.current
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
        const isSameCrowdUser =
          targetMember.username.trim().toLowerCase() === lowerUser;
        const boundExp = getStudentExpById(safeName);
        const updatedQueueScore = pool.get(lowerUser)?.points || bonusPts;
        boundCrowdMember = {
          ...targetMember,
          username: safeName,
          gender: resolvedGender,
          avatarUrl: resolvedAvatar || targetMember.avatarUrl,
          isVip: !opts.isBot ? true : isSameCrowdUser ? targetMember.isVip : false,
          isBot: Boolean(opts.isBot),
          isGoldenPriority: !opts.isBot
            ? true
            : isSameCrowdUser
            ? targetMember.isGoldenPriority
            : false,
          exp: boundExp,
          level: getStudentLevelFromExp(boundExp),
          goldTrophies: getStudentTrophiesById(safeName),
          currentScoreDisplay: !isSilentZombieBot
            ? updatedQueueScore
            : targetMember.currentScoreDisplay,
          scoreChangeDelta: !isSilentZombieBot ? bonusPts : 0,
          scoreCardUntil: !isSilentZombieBot ? now + 3200 : 0,
          scoreCardKey: !isSilentZombieBot ? now + Math.random() : undefined,
          floatingScoreText: !isSilentZombieBot ? `+${bonusPts}đ` : undefined,
          floatingScoreColor: 'gold',
          floatingScoreUntil: !isSilentZombieBot ? now + 3400 : 0,
          floatingScoreKey: !isSilentZombieBot ? now : undefined,
          hasShield:
            grantsShield && !opts.isBot
              ? true
              : opts.isBot
              ? false
              : isSameCrowdUser
              ? targetMember.hasShield
              : false,
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
        const projKind: ZombieProjectileKind =
          rawGiftCoins >= 10
            ? 'desk_mate'
            : rawGiftCoins >= 5
            ? 'chair'
            : 'book';
        const fallbackCrowdPos = cfg.doorCrowdPos || LEFT_DOOR_POS;

        fireZombieAttackProjectile({
          attackerUsername: safeName,
          startX: boundCrowdMember ? boundCrowdMember.x : fallbackCrowdPos.x,
          startY:
            (boundCrowdMember ? boundCrowdMember.y : fallbackCrowdPos.y) - 18,
          damage: rawGiftCoins * 100,
          kind: projKind,
          giftId: giftMeta.id,
          giftCoins: rawGiftCoins,
          isSeated: false,
          avatarUrl: resolvedAvatar,
          isBot: isSilentZombieBot,
          skipIndividualScoreRecord: isSilentZombieBot,
        });
      }

      // Nếu là NPC tấn công trong Sự kiện Zombie (phụ trợ âm thầm seeding giết Boss) -> kết thúc ngay, không xếp hàng chờ hành động sau Event
      if (isSilentZombieBot) {
        return;
      }

      // Nếu trong vòng 10 giây sau khi ném máy bay giấy trúng bạn, học sinh ngoài hàng chờ tặng Hoa Hồng ->
      // Ném thẳng Bó Hoa Hồng từ nhân vật hàng chờ ở cửa lớp sang cho bạn vừa bị ném đó!
      if (giftMeta.id === 'rose' && boundCrowdMember) {
        const roseTargetLock =
          paperPlaneRoseTargetByThrowerRef.current.get(lowerUser);
        if (roseTargetLock && now <= roseTargetLock.expiresAt) {
          const friendTargetInClass = pilgrimsRef.current.find(
            (p) =>
              (p.id === roseTargetLock.targetId ||
                p.username.trim().toLowerCase() ===
                  roseTargetLock.targetLowerName) &&
              (Boolean(p.slotId) ||
                p.state === 'stand_punishment' ||
                p.state === 'walk_to_punishment_spot') &&
              p.state !== 'leave_side_to_aisle' &&
              p.state !== 'leave_down_exit' &&
              p.username.trim().toLowerCase() !== lowerUser
          );
          const friendTargetInDoor = !friendTargetInClass
            ? doorCrowdRef.current.find(
                (p) =>
                  (p.id === roseTargetLock.targetId ||
                    p.username.trim().toLowerCase() ===
                      roseTargetLock.targetLowerName) &&
                  p.id !== boundCrowdMember!.id &&
                  p.username.trim().toLowerCase() !== lowerUser
              )
            : undefined;
          const friendTarget = friendTargetInClass || friendTargetInDoor;
          if (friendTarget) {
            soundEngine.playGiftEventSound('rose', cfg, !opts.isBot);
            launchPaperPlaneAtStudent(boundCrowdMember, friendTarget, false, {
              projectileKind: 'rose_bouquet',
            });
            pushToast(
              `🌹 ${safeName} (hàng chờ • +${bonusPts}đ) gửi bó hoa hồng bay tới ${friendTarget.username}! ❤️`,
              true
            );
            return;
          }
        }
      }

      // Nếu là Tặng hoa cho cô (rose) hoặc Tặng hoa cho thầy (icecream) khi học sinh không có trong lớp:
      // Đã cộng điểm +5đ/xu ngay lập tức vào hàng chờ & BXH -> cho nhân vật chạy từ vị trí đứng trong hàng chờ lên tặng hoa rồi quay về vị trí cũ!
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
        const runnerExp = getStudentExpById(safeName);

        const detachedRunner: PilgrimData = {
          id: runnerId,
          username: safeName,
          prayer: '',
          gender: resolvedGender,
          isVip: true,
          isBot: Boolean(opts.isBot),
          coins: rawGiftCoins,
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
          exp: runnerExp,
          level: getStudentLevelFromExp(runnerExp),
          goldTrophies: getStudentTrophiesById(safeName),
          currentScoreDisplay: pool.get(lowerUser)?.points || bonusPts,
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
          flowerBonusAwarded: true,
          floatingScoreText: `+${bonusPts}đ`,
          floatingScoreColor: 'gold',
          floatingScoreUntil: now + 3400,
          floatingScoreKey: now,
          isDetachedFlowerRunner: true,
        };

        const isZombieEventRunning = zombieEventStateRef.current.isActive;
        const activeRunnerForSameUser = specialFlowerRunnersRef.current.find(
          (r) => r.username.trim().toLowerCase() === lowerUser
        );

        // Nếu người này đang trên đường chạy lên tặng hoa (chưa ném xong): gộp luôn thành Combo 3 hoa vào lượt đang chạy (điểm +5đ/xu đã cộng ở trên!)
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
                    pendingFlowerBonusPoints: bonusPts,
                    flowerBonusAwarded: true,
                    floatingScoreText: `+${bonusPts}đ`,
                    floatingScoreColor: 'gold' as const,
                    floatingScoreUntil: now + 3400,
                    floatingScoreKey: now,
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

        // Nếu đang trong Event Đẩy Lùi Zombie hoặc người chơi đã ném xong đang đi về -> xếp vào hàng chờ pendingDetachedRunnersRef
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
              ? `🧟 ${safeName} dùng ${giftMeta.giftLabel} (+${bonusPts}đ) tấn công Zombie! (Hành động chạy lên tặng hoa đã xếp vào hàng chờ sau Event)`
              : `🔥 ${safeName} tặng ${giftMeta.giftLabel} (COMBO x${Math.max(
                  2,
                  effectiveCombo
                )} • +${bonusPts}đ) -> Đã cộng điểm & xếp hàng chờ chạy lên tặng hoa lượt tiếp theo!`,
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
          } (+${bonusPts}đ) -> Đã cộng điểm vào Hàng Chờ & Chạy lên tặng hoa!`,
          true
        );
        return;
      }

      // Còn 5 hình thức quà còn lại (cat, gg, heart, pig, vip) khi học sinh đang ở ngoài lớp:
      // - Lưu vào hàng chờ hành động tặng quà tuần tự của học sinh này -> tự động phát âm thanh & kích hoạt sau khi vào lớp và ngồi vào bàn học!
      const existingActionList =
        pendingGiftActionsByUserRef.current.get(lowerUser) || [];
      pendingGiftActionsByUserRef.current.set(lowerUser, [
        ...existingActionList,
        {
          id: `pga_${now}_${Math.random().toString(36).slice(2, 6)}`,
          giftId: giftMeta.id,
          comment: safeComment,
          comboCount: effectiveCombo,
          bonusPoints: bonusPts,
          isDeferredFromQueue: true,
          addedAt: now,
        },
      ]);

      pushToast(
        zombieEventStateRef.current.isActive
          ? `🧟 ${safeName} dùng ${giftMeta.giftLabel} (+${bonusPts}đ) tấn công Zombie! (Hành động "${giftMeta.actionTitle}" đã xếp vào hàng chờ sau Event)`
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

  const lastReminderAlertAtRef = useRef<number>(0);
  const cancelPendingObsReminderTimerRef = useRef<(() => void) | null>(null);

  const requestSilentReminderAlert = useCallback(
    (userLabel: string, reasonDetail: string) => {
      const cfg = configRef.current;
      if (cfg.reminderAlertEnabled === false) return;
      const now = Date.now();
      const cooldownMs =
        Math.max(
          5,
          Number(cfg.reminderAlertCooldownSec ?? DEFAULT_REMINDER_ALERT_COOLDOWN_SEC)
        ) * 1000;
      if (now - lastReminderAlertAtRef.current < cooldownMs) return;

      const isObsWin =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('obs') === '1' ||
          new URLSearchParams(window.location.search).get('view') === 'live' ||
          new URLSearchParams(window.location.search).get('mode') === 'live');

      const appendAlertLog = (timeEpoch: number) => {
        const timeStr = new Date(timeEpoch).toLocaleTimeString('vi-VN', {
          hour12: false,
        });
        setSafetyLogs((prev) =>
          [
            {
              id: `alert_${timeEpoch}_${Math.random().toString(36).slice(2, 6)}`,
              time: timeStr,
              user: userLabel,
              detail: reasonDetail,
            },
            ...prev,
          ].slice(0, 60)
        );
      };

      if (!isObsWin) {
        lastReminderAlertAtRef.current = now;
        const ok = triggerSilentReminderUrl(
          cfg.reminderAlertUrl || DEFAULT_REMINDER_ALERT_URL
        );
        if (ok) {
          appendAlertLog(now);
          syncService.sendCommand('REMINDER_ALERT_SYNC', {
            firedAt: now,
            user: userLabel,
            detail: reasonDetail,
          });
        }
        return;
      }

      // Trên cửa sổ ?obs=1 (TikTok Live Studio): chờ 800ms phòng trường hợp Tab Chrome Admin đang mở đã bắn trước (tránh báo kép 2 lần).
      // Nếu treo Live chỉ mở mỗi TikTok Live Studio (đã đóng Chrome), sau 800ms tự động mở ngầm ngay trên TikTok Live Studio!
      if (cancelPendingObsReminderTimerRef.current) return;
      cancelPendingObsReminderTimerRef.current = setUnthrottledTimeout(() => {
        cancelPendingObsReminderTimerRef.current = null;
        const fireNow = Date.now();
        const latestCfg = configRef.current;
        if (latestCfg.reminderAlertEnabled === false) return;
        const latestCooldownMs =
          Math.max(
            5,
            Number(
              latestCfg.reminderAlertCooldownSec ??
                DEFAULT_REMINDER_ALERT_COOLDOWN_SEC
            )
          ) * 1000;
        if (fireNow - lastReminderAlertAtRef.current < latestCooldownMs) return;

        lastReminderAlertAtRef.current = fireNow;
        const ok = triggerSilentReminderUrl(
          latestCfg.reminderAlertUrl || DEFAULT_REMINDER_ALERT_URL
        );
        if (ok) {
          appendAlertLog(fireNow);
        }
      }, 800);
    },
    []
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
        orderMeta?: TikTokOrderMeta;
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

      // 0. Quét từ khóa cảnh báo (VD: "game đứng", "lag", "mất tiếng") trên mọi bình luận người xem thật để mở ngầm link báo Telegram
      if (
        !opts.isBot &&
        !isAdmittingFromQueue &&
        opts.coins <= 0 &&
        cfg.reminderAlertEnabled !== false &&
        cfg.reminderAlertOnKeyword !== false &&
        opts.prayer.trim()
      ) {
        const matchedKw = matchReminderAlertKeyword(
          opts.prayer,
          cfg.reminderAlertKeywords ?? DEFAULT_REMINDER_ALERT_KEYWORDS
        );
        if (matchedKw) {
          requestSilentReminderAlert(
            opts.username || 'Người xem',
            `🔔 Đã mở ngầm báo Telegram (Từ khóa "${matchedKw}": "${opts.prayer.trim().slice(0, 60)}")`
          );
        }
      }

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
      // Nếu đang đẩy học sinh từ Hàng Chờ vào lớp (forceAdmitFromQueue) hoặc là sự kiện tặng quà trả phí (coins > 0), không chặn vì câu comment dính lọc từ
      if (!safety.allowed && !isAdmittingFromQueue && opts.coins <= 0) return false;

      const safeName = (safety.safeUsername || opts.username || '').trim();
      if (!safeName) return false;
      const safeComment = safety.allowed ? safety.safePrayer : '';
      const lowerUser = safeName.toLowerCase();

      // Kiểm tra xem người chơi hiện có trong Lớp hoặc trong Kho Hàng Chờ O(1) không (hoặc đang gõ lệnh "vào lớp")
      const existingInClassNow = pilgrimsRef.current.find(
        (p) =>
          p.username.trim().toLowerCase() === lowerUser &&
          (Boolean(p.slotId) ||
            p.state === 'stand_punishment' ||
            p.state === 'walk_to_punishment_spot') &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const isJoinCmd = isJoinClassCommand(safeComment);

      // Nhận diện lệnh gõ /nam hoặc /nu để đổi giới tính nhân vật học sinh (Nam / Nữ)
      const genderCmd = parseGenderCommand(safeComment);
      if (genderCmd) {
        userGenderOverridesRef.current.set(lowerUser, genderCmd);
        const queuedEntry = waitingPoolRef.current.get(lowerUser);
        if (queuedEntry) {
          queuedEntry.gender = genderCmd;
        }
        if (
          doorCrowdRef.current.some(
            (p) =>
              p.username.trim().toLowerCase() === lowerUser &&
              p.gender !== genderCmd
          )
        ) {
          const nextDoor = doorCrowdRef.current.map((p) =>
            p.username.trim().toLowerCase() === lowerUser
              ? { ...p, gender: genderCmd }
              : p
          );
          doorCrowdRef.current = nextDoor;
          setDoorCrowd(nextDoor);
        }
        if (
          pilgrimsRef.current.some(
            (p) =>
              p.username.trim().toLowerCase() === lowerUser &&
              p.gender !== genderCmd
          )
        ) {
          const nextPilgrimsGender = pilgrimsRef.current.map((p) =>
            p.username.trim().toLowerCase() === lowerUser
              ? { ...p, gender: genderCmd }
              : p
          );
          pilgrimsRef.current = nextPilgrimsGender;
          setPilgrims(nextPilgrimsGender);
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
      if (opts.coins <= 0 && safeComment.trim() && !isAdmittingFromQueue) {
        answeredQuizRight = checkEnglishQuizAnswer(
          safeName,
          safeComment,
          opts.isBot,
          opts.avatarUrl,
          opts.orderMeta
        );
      }

      const isLateCorrectAnswer =
        !answeredQuizRight &&
        !isAdmittingFromQueue &&
        opts.coins <= 0 &&
        Boolean(safeComment.trim()) &&
        isLateCorrectQuizAnswer(safeComment, lowerUser, Boolean(opts.isBot));

      const queuedNowForActivity = waitingPoolRef.current.get(lowerUser);
      if (queuedNowForActivity && !isAdmittingFromQueue && safeComment.trim()) {
        queuedNowForActivity.hasCommentedInRound = true;
        queuedNowForActivity.idleRounds = 0;
      }
      const isAlreadyInQueue = Boolean(queuedNowForActivity);

      // Nếu là bình luận thường (coins <= 0, không phải forceAdmitFromQueue):
      // Bắt buộc phải có trong Lớp, hoặc có trong Hàng Chờ, hoặc gõ "vào lớp", hoặc vừa trả lời đúng câu hỏi, hoặc vừa trả lời đúng nhưng bị trễ giờ!
      if (
        opts.coins <= 0 &&
        !bypassWaitingQueue &&
        !existingInClassNow &&
        !isAlreadyInQueue &&
        !isJoinCmd &&
        !answeredQuizRight &&
        !isLateCorrectAnswer
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

      const hideCorrectAnswerBubble =
        cfg.filterCorrectAnswerBubble !== false &&
        (answeredQuizRight || isCommentMatchingActiveQuizAnswer(safeComment));

      if (existing) {
        if (safeComment.trim()) {
          // Nếu người chơi comment đúng đáp án nhưng đã hết thời gian trả lời (kể cả 2s bù trễ) nên bị tính sai:
          // thay thế nội dung bong bóng chat thành "Không kịp giờ rồi" chữ màu đỏ để tránh gây hiểu lầm!
          if (isLateCorrectAnswer) {
            const nowLateMs = Date.now();
            const lateBubbleKey = issueChatBubbleKey();
            const nextPilgrimsLate = pilgrimsRef.current.map((p) =>
              p.id === existing.id
                ? {
                    ...p,
                    gender: genderCmd || p.gender,
                    prayer: LATE_QUIZ_ANSWER_BUBBLE_TEXT,
                    hasComment: true,
                    prayTimer: 0,
                    chatBubbleKey: lateBubbleKey,
                    chatBubbleColor: 'red' as const,
                    chatBubbleUntil:
                      nowLateMs + (cfg.chatBubbleDurationSec || 12) * 1000,
                  }
                : p
            );
            pilgrimsRef.current = nextPilgrimsLate;
            setPilgrims(nextPilgrimsLate);
            return false;
          }

          // Nếu đang bật lọc câu trả lời và bình luận trùng đáp án đúng trong thời gian hỏi bài:
          // chấm điểm bình thường ở trên nhưng KHÔNG hiện bong bóng chat và KHÔNG đọc TTS lộ đáp án!
          if (hideCorrectAnswerBubble) {
            if (genderCmd && genderCmd !== existing.gender) {
              const nextPilgrimsGenderOnly = pilgrimsRef.current.map((p) =>
                p.id === existing.id ? { ...p, gender: genderCmd } : p
              );
              pilgrimsRef.current = nextPilgrimsGenderOnly;
              setPilgrims(nextPilgrimsGenderOnly);
            }
            return false;
          }

          const cleanSpeechComment = sanitizeAndLimitSpeechText(
            safeComment,
            cfg.maxTtsWords || 25
          );
          const nowCommentMs = Date.now();
          const commentBubbleKey = issueChatBubbleKey();
          const nextPilgrims = pilgrimsRef.current.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  gender: genderCmd || p.gender,
                  prayer: safeComment,
                  hasComment: true,
                  prayTimer: 0,
                  chatBubbleKey: commentBubbleKey,
                  chatBubbleColor: undefined,
                  chatBubbleUntil:
                    nowCommentMs + (cfg.chatBubbleDurationSec || 12) * 1000,
                }
              : p
          );
          pilgrimsRef.current = nextPilgrims;
          setPilgrims(nextPilgrims);

          // Cho phép tất cả học sinh ĐANG Ở TRONG LỚP (ngồi bàn, đang bước vào chỗ, đứng phạt...) gõ @tên để ném máy bay giấy
          if (safeComment.includes('@')) {
            const updatedThrower = nextPilgrims.find(
              (p) =>
                p.id === existing.id &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            );
            if (updatedThrower) {
              tryResolveAndLaunchPaperPlane(updatedThrower, safeComment);
            }
          }

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
              chatBubbleKey: commentBubbleKey,
              username: safeName,
              reason: 'comment',
              isBot: existing.isBot,
            });
          }
        }
        return false;
      }

      // Nếu học sinh vừa bị chấm sai (đang bước ra khỏi lớp) hoặc đang ở ngoài lớp / hàng chờ mà gửi đáp án đúng bị muộn:
      // hiển thị ngay bong bóng "Không kịp giờ rồi" chữ màu đỏ và không tự ý xếp vào ghế trống khi chưa gõ "vào lớp"!
      if (isLateCorrectAnswer) {
        const leavingInClass = pilgrimsRef.current.find(
          (p) =>
            p.username.trim().toLowerCase() === lowerUser &&
            (p.state === 'leave_side_to_aisle' || p.state === 'leave_down_exit')
        );
        if (leavingInClass) {
          const nowLeavingLateMs = Date.now();
          const leavingLateBubbleKey = issueChatBubbleKey();
          const nextLeavingPilgrims = pilgrimsRef.current.map((p) =>
            p.id === leavingInClass.id
              ? {
                  ...p,
                  gender: genderCmd || p.gender,
                  prayer: LATE_QUIZ_ANSWER_BUBBLE_TEXT,
                  hasComment: true,
                  chatBubbleKey: leavingLateBubbleKey,
                  chatBubbleColor: 'red' as const,
                  chatBubbleUntil:
                    nowLeavingLateMs + (cfg.chatBubbleDurationSec || 12) * 1000,
                }
              : p
          );
          pilgrimsRef.current = nextLeavingPilgrims;
          setPilgrims(nextLeavingPilgrims);
          return false;
        }

        if (doorCrowdRef.current.length > 0) {
          const resolvedDoorGender = resolveUserGender(
            safeName,
            genderCmd || waitingPoolRef.current.get(lowerUser)?.gender || opts.gender
          );
          enqueueDoorCrowdChat({
            username: safeName,
            lowerUser,
            comment: LATE_QUIZ_ANSWER_BUBBLE_TEXT,
            gender: resolvedDoorGender,
            avatarUrl:
              opts.avatarUrl || waitingPoolRef.current.get(lowerUser)?.avatarUrl,
            isBot: false,
            allowTTS: false,
            chatBubbleColor: 'red',
          });
        }
        return false;
      }

      // 5. Quy tắc khi người chơi hoặc NPC đang có mặt trong Hàng Chờ (không ngồi trong lớp) comment:
      // - Cập nhật nội dung comment mới nhất O(1) trong waitingPoolRef (không re-render mảng).
      // - Nếu comment có @tên: nhập ngẫu nhiên vào 1 học sinh đứng chờ cửa lớp (doorCrowd), hiện tên + bong bóng chat và ném máy bay giấy ngay!
      if (
        !bypassWaitingQueue &&
        (!opts.isBot ||
          opts.allowDoorCrowdBubbleForBot ||
          safeComment.includes('@'))
      ) {
        const queuedEntry = waitingPoolRef.current.get(lowerUser);
        if (!queuedEntry) {
          return false;
        }

        if (hideCorrectAnswerBubble) {
          if (genderCmd) {
            queuedEntry.gender = resolveUserGender(safeName, genderCmd);
          }
          return false;
        }

        const resolvedGender = resolveUserGender(
          safeName,
          genderCmd || queuedEntry.gender || opts.gender
        );

        if (safeComment.trim() && !isJoinCmd) {
          queuedEntry.prayer = safeComment;
          queuedEntry.gender = resolvedGender;
        }

        if (safeComment.includes('@')) {
          const embodiedDoorThrower = embodyRandomDoorCrowdStudentForThrow({
            username: safeName,
            lowerUser,
            comment: !isJoinCmd ? safeComment : undefined,
            gender: resolvedGender,
            avatarUrl: opts.avatarUrl || queuedEntry.avatarUrl,
            showBubble: Boolean(safeComment.trim() && !isJoinCmd),
          });
          if (embodiedDoorThrower) {
            tryResolveAndLaunchPaperPlane(embodiedDoorThrower, safeComment);
          }
          return false;
        }

        if (safeComment.trim() && doorCrowdRef.current.length > 0) {
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
                  hasDeskCat: false,
                  deskCatCount: 0,
                  hasDeskTrophy: false,
                  deskTrophyDropAt: 0,
                  hasDeskPig: false,
                  hasDeskSnack: false,
                  hasPcGamingDesk: false,
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
        if (
          !isAdmittingFromQueue &&
          !hideCorrectAnswerBubble &&
          safeComment.includes('@')
        ) {
          const resolvedGender = resolveUserGender(
            safeName,
            genderCmd || opts.gender
          );
          const embodiedDoorThrower = embodyRandomDoorCrowdStudentForThrow({
            username: safeName,
            lowerUser,
            comment: !isJoinCmd ? safeComment : undefined,
            gender: resolvedGender,
            avatarUrl: opts.avatarUrl,
            showBubble: Boolean(safeComment.trim() && !isJoinCmd),
          });
          if (embodiedDoorThrower) {
            tryResolveAndLaunchPaperPlane(embodiedDoorThrower, safeComment);
          }
        }
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
      const existingTrophies = getStudentTrophiesById(safeName);
      const initialEntryComment =
        isAdmittingFromQueue || hideCorrectAnswerBubble ? '' : safeComment;
      const shouldShowInitialEntryBubble = Boolean(
        !isAdmittingFromQueue &&
          !hideCorrectAnswerBubble &&
          initialEntryComment.trim() &&
          !isJoinClassCommand(initialEntryComment)
      );
      const newStudent: PilgrimData = {
        id,
        username: safeName,
        currentScoreDisplay: Math.max(queuedPts, existingDonorScore),
        exp: existingExp,
        level: existingLevel,
        goldTrophies: existingTrophies,
        prayer: initialEntryComment,
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
        hasComment: shouldShowInitialEntryBubble,
        chatBubbleKey: shouldShowInitialEntryBubble ? issueChatBubbleKey() : 0,
        chatBubbleUntil: shouldShowInitialEntryBubble
          ? Date.now() + (cfg.chatBubbleDurationSec || 12) * 1000
          : 0,
        isSimulatedTest: opts.isSimulatedTest,
        isGoldenPriority: Boolean(
          (opts as { isGoldenPriority?: boolean }).isGoldenPriority
        ),
        hasShield: Boolean(
          !opts.isBot &&
            ((opts as { hasShield?: boolean }).hasShield || opts.coins >= 5)
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

      if (
        !isAdmittingFromQueue &&
        !hideCorrectAnswerBubble &&
        safeComment.includes('@')
      ) {
        tryResolveAndLaunchPaperPlane(newStudent, safeComment);
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
      enqueueDoorCrowdChat,
      enqueueStudentToWaitingQueue,
      executeGiftPilgrimEntry,
      isCommentMatchingActiveQuizAnswer,
      isLateCorrectQuizAnswer,
      launchPaperPlaneAtStudent,
      pushToast,
      resolveUserGender,
      safetyActionMode,
      safetyCategories,
    ]
  );

  // Vòng lặp vật lý 60FPS cho Học Sinh & Giáo Viên trên bục giảng (có bộ đánh thức Worker chống treo trên TikTok Live Studio / OBS CEF)
  useEffect(() => {
    let lastMs = performance.now();

    const stepSimulation = (nowMs: number) => {
      if (nowMs - lastMs < SIMULATION_MIN_FRAME_MS) {
        return;
      }
      const dt = Math.min(0.08, Math.max(0.001, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      const cfg = configRef.current;

      // 1. Cập nhật Cô Thảo & Thầy Cá (chỉ setMonks khi thực sự có di chuyển hoặc đổi trạng thái để tránh re-render 60FPS khi đứng yên)
      setMonks((prevMonks) => {
        let hasMonkVisualChange = false;
        const nowMonkMs = Date.now();
        const nextMonks: TempleMonkData[] = prevMonks.map((m): TempleMonkData => {
          const expectedName = m.role === 'abbot' ? 'Cô Thảo' : 'Thầy Cá';
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

          // Chế độ điều khiển thủ công bằng phím WASD cho Cô Thảo ('abbot') hoặc Thầy Cá ('senior_novice')
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

          // Khi Sự kiện Zombie đang diễn ra -> Khóa vị trí đứng của Cô Thảo và Thầy Cá tại tọa độ quy định trong Dev-Event
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
              // Chọn điểm đến tiếp theo nằm gọn trong vùng an toàn của Cô Thảo / Thầy Cá
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
        const hasAnyMovingPilgrim = prevPilgrims.some(
          (st) => st.state !== 'pray_seated' && st.state !== 'stand_punishment'
        );
        const deskAisles = hasAnyMovingPilgrim
          ? computeClassroomDeskAisleData(
              vipSlotsRef.current,
              normalSlotsRef.current,
              cfg
            )
          : null;

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
            Boolean(p.rankUpStartAt && nowEpoch >= p.rankUpStartAt) ||
            Boolean(p.rankUpUntil && nowEpoch >= p.rankUpUntil) ||
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

          let walkSubPhase = stateTimer === 0 ? 0 : (p.walkSubPhase ?? 0);
          animTime += dt;
          stateTimer += dt;

          const burnerX = cfg.incenseBurner.x;
          const burnerY = cfg.incenseBurner.y;

          const seatingSpeed = cfg.studentSeatingSpeed ?? (p.speed || 110);
          const safeLaneX = deskAisles
            ? deskAisles.resolveSafeAisleX(
                p.slotX ?? x,
                p.slotY ?? y,
                p.laneX
              )
            : p.laneX;
          const frontCorridorY = deskAisles
            ? deskAisles.frontCorridorY
            : LEFT_DOOR_POS.y;

          if (state === 'walk_in_up') {
            // Học sinh tặng quà đi lên trước bàn Giáo viên theo 3 pha đơn điệu (0 -> 1 -> 2), không bao giờ quay ngược lại lối đi
            const step = seatingSpeed * dt;
            if (walkSubPhase === 0) {
              if (y <= frontCorridorY + 8) {
                walkSubPhase = 2;
              } else if (Math.abs(safeLaneX - x) > 0.5) {
                facingLeft = safeLaneX < x;
                x = stepAxis(x, safeLaneX, step);
              } else {
                x = safeLaneX;
                walkSubPhase = 1;
              }
            }
            if (walkSubPhase === 1) {
              x = safeLaneX;
              if (y > frontCorridorY + 0.5) {
                y = stepAxis(y, frontCorridorY, step);
              } else {
                y = Math.min(y, frontCorridorY);
                walkSubPhase = 2;
              }
            }
            if (walkSubPhase === 2) {
              if (Math.abs(burnerX - x) > 0.5) {
                facingLeft = burnerX < x;
                x = stepAxis(x, burnerX, step);
              } else if (Math.abs(burnerY - y) > 0.5) {
                x = burnerX;
                y = stepAxis(y, burnerY, step);
              } else {
                x = burnerX;
                y = burnerY;
                walkSubPhase = 0;
                state = 'throw_offering_at_burner';
                stateTimer = 0;
              }
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
            // Đi vuông góc từ cửa / hành lang đầu lớp ra lối đi dọc an toàn (safeLaneX) rồi đi dọc tới hàng bàn (slotY)
            const step = seatingSpeed * dt;
            p.laneX = safeLaneX;
            if (Math.abs(safeLaneX - x) > 0.5) {
              facingLeft = safeLaneX < x;
              x = stepAxis(x, safeLaneX, step);
            } else if (Math.abs(p.slotY - y) > 0.5) {
              x = safeLaneX;
              y = stepAxis(y, p.slotY, step);
            } else {
              x = safeLaneX;
              y = p.slotY;
              state = 'walk_side_to_slot';
              stateTimer = 0;
            }
          } else if (state === 'walk_side_to_slot') {
            // Bước ngang vuông góc mượt mà (không vượt lố gây giật) từ lối đi dọc vào đúng ghế trái/phải của bàn đôi
            y = p.slotY;
            p.laneX = safeLaneX;
            const step = seatingSpeed * 0.9 * dt;
            if (Math.abs(p.slotX - x) > 0.5) {
              facingLeft = p.slotX < x;
              x = stepAxis(x, p.slotX, step);
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
            // Học sinh cầm hoa đi tới bên cạnh Giáo viên theo 3 pha đơn điệu (0: ra lối đi -> 1: lên hành lang đầu lớp -> 2: tiếp cận Giáo viên), tuyệt đối không lặp vòng
            const moveSpeed = cfg.studentGiftSpeed ?? Math.max(p.speed, 185);
            const step = moveSpeed * dt;
            const liveTeacher =
              monksRef.current.find(
                (m) => m.role === (p.giftTargetRole || 'abbot')
              ) || monksRef.current[0];
            const sideRefX = p.giftTargetPos
              ? p.giftTargetPos.x
              : p.slotX || x;
            const targetPos = liveTeacher
              ? getTeacherSideGiftPos(liveTeacher.x, liveTeacher.y, sideRefX)
              : p.giftTargetPos || {
                  x: cfg.incenseBurner.x,
                  y: cfg.incenseBurner.y,
                };
            p.giftTargetPos = targetPos;
            p.laneX = safeLaneX;

            if (walkSubPhase === 0) {
              if (y <= frontCorridorY + 8) {
                walkSubPhase = 2;
              } else if (Math.abs(safeLaneX - x) > 0.5) {
                facingLeft = safeLaneX < x;
                x = stepAxis(x, safeLaneX, step);
              } else {
                x = safeLaneX;
                walkSubPhase = 1;
              }
            }
            if (walkSubPhase === 1) {
              x = safeLaneX;
              if (y > frontCorridorY + 0.5) {
                y = stepAxis(y, frontCorridorY, step);
              } else {
                y = Math.min(y, frontCorridorY);
                walkSubPhase = 2;
              }
            }
            if (walkSubPhase === 2) {
              const dx = targetPos.x - x;
              const dy = targetPos.y - y;
              if (Math.abs(dx) > 8 && stateTimer < 8.0) {
                facingLeft = dx < 0;
                x = stepAxis(x, targetPos.x, step);
              } else if (
                (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) &&
                stateTimer < 8.0
              ) {
                if (Math.abs(dx) > 0.5) {
                  facingLeft = dx < 0;
                }
                x = stepAxis(x, targetPos.x, step);
                y = stepAxis(y, targetPos.y, step);
              } else {
                x = targetPos.x;
                y = targetPos.y;
                walkSubPhase = 0;
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
              const awardPts =
                p.pendingFlowerBonusPoints || calculateGiftBonusPoints(1);
              const hitNow = Date.now();
              p.floatingScoreText = `+${awardPts}đ`;
              p.floatingScoreColor = 'gold';
              p.floatingScoreUntil = hitNow + 3400;
              p.floatingScoreKey = hitNow;
              if (!p.flowerBonusAwarded) {
                p.flowerBonusAwarded = true;
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
                  p.pendingFlowerBonusPoints =
                    nextFlowerAct.bonusPoints ||
                    resolveClassroomGiftKind(nextFlowerAct.giftId, 1)
                      .bonusPoints;
                  p.flowerBonusAwarded = true;
                  walkSubPhase = 0;
                  state = 'walk_to_teacher_gift';
                  stateTimer = 0;
                } else {
                  pendingGiftActionsByUserRef.current.delete(lowerU);
                  walkSubPhase = 0;
                  state = 'leave_down_exit';
                  stateTimer = 0;
                }
              } else {
                walkSubPhase = 0;
                state = 'return_to_seat_from_gift';
                stateTimer = 0;
              }
            }
          } else if (state === 'return_to_seat_from_gift') {
            // Nếu đang trên đường quay về bàn mà nhận lệnh rời lớp (leaveAfterGiftAction) -> đi ra cửa rời lớp luôn
            if (p.leaveAfterGiftAction || !p.slotId) {
              walkSubPhase = 0;
              state = 'leave_down_exit';
              stateTimer = 0;
            } else {
              // Đi vuông góc quay về đúng ghế bàn đôi theo 3 pha đơn điệu (0: ra trục lối đi dọc -> 1: đi dọc tới hàng bàn -> 2: bước ngang vào ghế)
              const returnSpeed = cfg.studentGiftSpeed ?? Math.max(p.speed, 195);
              const step = returnSpeed * dt;
              p.laneX = safeLaneX;

              if (walkSubPhase === 0) {
                if (Math.abs(p.slotY - y) <= 0.5) {
                  walkSubPhase = 2;
                } else if (Math.abs(safeLaneX - x) > 0.5) {
                  facingLeft = safeLaneX < x;
                  x = stepAxis(x, safeLaneX, step);
                } else {
                  x = safeLaneX;
                  walkSubPhase = 1;
                }
              }
              if (walkSubPhase === 1) {
                x = safeLaneX;
                if (Math.abs(p.slotY - y) > 0.5) {
                  y = stepAxis(y, p.slotY, step);
                } else {
                  y = p.slotY;
                  walkSubPhase = 2;
                }
              }
              if (walkSubPhase === 2) {
                y = p.slotY;
                if (Math.abs(p.slotX - x) > 0.5) {
                  facingLeft = p.slotX < x;
                  x = stepAxis(x, p.slotX, step);
                } else {
                  x = p.slotX;
                  y = p.slotY;
                  facingLeft = p.slotX < 270;
                  walkSubPhase = 0;
                  state = 'pray_seated';
                  stateTimer = 0;
                }
              }
            }
          } else if (state === 'walk_to_punishment_spot') {
            // Học sinh bị gọi phạt hoặc Top 1, 2, 3 bước lên bục giảng theo 3 pha đơn điệu (0: ra lối đi -> 1: lên hành lang đầu lớp -> 2: vào P1..P5)
            const moveSpeed = Math.max(p.speed, 200);
            const step = moveSpeed * dt;
            const linePos = cfg.punishmentLinePos || { x: 270, y: 458 };
            const spacing = Math.max(24, cfg.punishmentLineSpacing ?? 52);
            const spotIdx = p.punishmentSpotIndex ?? 2;
            const spotX = Math.max(
              36,
              Math.min(504, Math.round(linePos.x + (spotIdx - 2) * spacing))
            );
            const spotY = linePos.y;
            p.laneX = safeLaneX;

            if (walkSubPhase === 0) {
              if (y <= frontCorridorY + 8) {
                walkSubPhase = 2;
              } else if (Math.abs(safeLaneX - x) > 0.5) {
                facingLeft = safeLaneX < x;
                x = stepAxis(x, safeLaneX, step);
              } else {
                x = safeLaneX;
                walkSubPhase = 1;
              }
            }
            if (walkSubPhase === 1) {
              x = safeLaneX;
              if (y > frontCorridorY + 0.5) {
                y = stepAxis(y, frontCorridorY, step);
              } else {
                y = Math.min(y, frontCorridorY);
                walkSubPhase = 2;
              }
            }
            if (walkSubPhase === 2) {
              if (Math.abs(spotX - x) > 0.5) {
                facingLeft = spotX < x;
                x = stepAxis(x, spotX, step);
              } else if (Math.abs(spotY - y) > 0.5) {
                x = spotX;
                y = stepAxis(y, spotY, step);
              } else {
                x = spotX;
                y = spotY;
                facingLeft = false; // Quay mặt xuống dưới nhìn về phía lớp học
                walkSubPhase = 0;
                state = 'stand_punishment';
                stateTimer = 0;
              }
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
            // Sau khi hết vòng câu hỏi và trả lời đúng -> đi bộ vuông góc từ vị trí phạt về lại vị trí bàn học cũ theo 3 pha đơn điệu
            const returnSpeed = Math.max(p.speed, 210);
            const step = returnSpeed * dt;
            p.laneX = safeLaneX;

            if (walkSubPhase === 0) {
              if (Math.abs(p.slotY - y) <= 0.5) {
                walkSubPhase = 2;
              } else if (Math.abs(safeLaneX - x) > 0.5) {
                facingLeft = safeLaneX < x;
                x = stepAxis(x, safeLaneX, step);
              } else {
                x = safeLaneX;
                walkSubPhase = 1;
              }
            }
            if (walkSubPhase === 1) {
              x = safeLaneX;
              if (Math.abs(p.slotY - y) > 0.5) {
                y = stepAxis(y, p.slotY, step);
              } else {
                y = p.slotY;
                walkSubPhase = 2;
              }
            }
            if (walkSubPhase === 2) {
              y = p.slotY;
              if (Math.abs(p.slotX - x) > 0.5) {
                facingLeft = p.slotX < x;
                x = stepAxis(x, p.slotX, step);
              } else {
                x = p.slotX;
                y = p.slotY;
                facingLeft = p.slotX < 270;
                walkSubPhase = 0;
                state = 'pray_seated';
                stateTimer = 0;
              }
            }
          } else if (state === 'leave_side_to_aisle') {
            // Bước ngang dứt khoát từ ghế ra đúng lối đi dọc trống ngoài mép bàn (không vượt lố, không kẹt bàn)
            const leaveSpeed = Math.max(p.speed, 220);
            const step = leaveSpeed * dt;
            p.laneX = safeLaneX;
            if (Math.abs(safeLaneX - x) > 0.5 && stateTimer < 1.6) {
              facingLeft = safeLaneX < x;
              x = stepAxis(x, safeLaneX, step);
            } else {
              x = safeLaneX;
              walkSubPhase = 0;
              state = 'leave_down_exit';
              stateTimer = 0;
            }
          } else if (state === 'leave_down_exit') {
            // Đi dọc theo lối đi trống lên hành lang phía trước mọi bàn học (frontCorridorY) rồi đi ngang ra cửa trái theo 3 pha đơn điệu
            const leaveSpeed = Math.max(p.speed, 225);
            const step = leaveSpeed * dt;
            const doorX = LEFT_DOOR_POS.x;
            const doorY = LEFT_DOOR_POS.y;

            if (walkSubPhase === 0) {
              if (y <= frontCorridorY + 8) {
                walkSubPhase = 2;
              } else {
                const clearExitAisleX =
                  deskAisles && !deskAisles.isXClearAlongVerticalAisle(x, y)
                    ? deskAisles.findNearestClearVerticalAisleX(x, y)
                    : x;
                if (Math.abs(clearExitAisleX - x) > 0.5) {
                  facingLeft = clearExitAisleX < x;
                  x = stepAxis(x, clearExitAisleX, step);
                } else {
                  x = clearExitAisleX;
                  walkSubPhase = 1;
                }
              }
            }
            if (walkSubPhase === 1) {
              if (y > frontCorridorY + 0.5) {
                y = stepAxis(y, frontCorridorY, step);
              } else {
                y = Math.min(y, frontCorridorY);
                walkSubPhase = 2;
              }
            }
            if (walkSubPhase === 2) {
              if (Math.abs(doorX - x) > 0.5) {
                facingLeft = doorX < x;
                x = stepAxis(x, doorX, step);
              } else if (Math.abs(doorY - y) > 0.5) {
                x = doorX;
                y = stepAxis(y, doorY, step);
              } else {
                continue; // Học sinh đã ra khỏi cửa chính bên trái
              }
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

          if (state !== prevState) {
            walkSubPhase = 0;
          }
          hasActivePilgrimVisualUpdate = true;
          nextList.push({
            ...p,
            x,
            y,
            state,
            stateTimer,
            walkSubPhase,
            prayTimer,
            animTime,
            facingLeft,
            isCarryingGift,
            pendingGiftCoins,
            hasSatOnce: p.hasSatOnce || state === 'pray_seated',
            prayer:
              p.chatBubbleUntil && nowEpoch >= p.chatBubbleUntil
                ? ''
                : p.prayer,
            hasComment:
              p.chatBubbleUntil && nowEpoch >= p.chatBubbleUntil
                ? false
                : p.hasComment,
            chatBubbleUntil:
              p.chatBubbleUntil && nowEpoch >= p.chatBubbleUntil
                ? 0
                : p.chatBubbleUntil,
            chatBubbleColor:
              p.chatBubbleUntil && nowEpoch >= p.chatBubbleUntil
                ? undefined
                : p.chatBubbleColor,
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
            rankUpStartAt:
              (p.rankUpStartAt && nowEpoch >= p.rankUpStartAt) ||
              (p.rankUpUntil && nowEpoch >= p.rankUpUntil)
                ? 0
                : p.rankUpStartAt,
            rankUpUntil:
              p.rankUpUntil && nowEpoch >= p.rankUpUntil
                ? 0
                : p.rankUpUntil,
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

      // 2.25. Tự động tắt bong bóng chat đã hết hạn cho các học sinh đứng trong Hàng Chờ cửa lớp (doorCrowd)
      const nowCrowdEpoch = Date.now();
      if (doorCrowdRef.current.length > 0) {
        const hasExpiredDoorBubble = doorCrowdRef.current.some((d) =>
          Boolean(d.chatBubbleUntil && nowCrowdEpoch >= d.chatBubbleUntil)
        );
        if (hasExpiredDoorBubble) {
          const cleanedDoorCrowd = doorCrowdRef.current.map((d) =>
            d.chatBubbleUntil && nowCrowdEpoch >= d.chatBubbleUntil
              ? {
                  ...d,
                  prayer: '',
                  chatBubbleUntil: 0,
                  chatBubbleKey: 0,
                  chatBubbleColor: undefined,
                  hasComment: false,
                }
              : d
          );
          doorCrowdRef.current = cleanedDoorCrowd;
          setDoorCrowd(cleanedDoorCrowd);
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
            let runnerSubPhase = stateTimer === 0 ? 0 : (r.walkSubPhase ?? 0);
            const prevRunnerState = state;
            animTime += dt;
            stateTimer += dt;
            const moveSpeed = cfg.studentGiftSpeed ?? Math.max(r.speed, 205);

            if (state === 'walk_to_teacher_gift') {
              const liveTeacher =
                monksRef.current.find(
                  (m) => m.role === (r.giftTargetRole || 'abbot')
                ) || monksRef.current[0];
              const sideRefX = r.giftTargetPos
                ? r.giftTargetPos.x
                : r.slotX || x;
              const targetPos = liveTeacher
                ? getTeacherSideGiftPos(liveTeacher.x, liveTeacher.y, sideRefX)
                : r.giftTargetPos || {
                    x: cfg.incenseBurner.x,
                    y: cfg.incenseBurner.y,
                  };
              r.giftTargetPos = targetPos;
              const walkCorridorY =
                r.giftTargetRole === 'senior_novice' ? targetPos.y : 478;
              const step = moveSpeed * dt;

              if (runnerSubPhase === 0) {
                if (Math.abs(y - walkCorridorY) > 0.5) {
                  y = stepAxis(y, walkCorridorY, step);
                } else {
                  y = walkCorridorY;
                  runnerSubPhase = 1;
                }
              }
              if (runnerSubPhase === 1) {
                const dx = targetPos.x - x;
                const dy = targetPos.y - y;
                if (Math.abs(dx) > 8 && stateTimer < 8.0) {
                  facingLeft = dx < 0;
                  x = stepAxis(x, targetPos.x, step);
                } else if (
                  (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) &&
                  stateTimer < 8.0
                ) {
                  if (Math.abs(dx) > 0.5) {
                    facingLeft = dx < 0;
                  }
                  x = stepAxis(x, targetPos.x, step);
                  y = stepAxis(y, targetPos.y, step);
                } else {
                  x = targetPos.x;
                  y = targetPos.y;
                  runnerSubPhase = 0;
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
                  const teacherX = targetTeacher
                    ? targetTeacher.x
                    : targetPos.x;
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
                const awardPts =
                  r.pendingFlowerBonusPoints || calculateGiftBonusPoints(1);
                const hitNow = Date.now();
                r.floatingScoreText = `+${awardPts}đ`;
                r.floatingScoreColor = 'gold';
                r.floatingScoreUntil = hitNow + 3400;
                r.floatingScoreKey = hitNow;
                if (!r.flowerBonusAwarded) {
                  r.flowerBonusAwarded = true;
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
              const step = moveSpeed * dt;
              if (Math.abs(returnX - x) > 0.5) {
                facingLeft = returnX < x;
                x = stepAxis(x, returnX, step);
              } else if (Math.abs(returnY - y) > 0.5) {
                x = returnX;
                y = stepAxis(y, returnY, step);
              } else {
                // Đã quay về đúng vị trí đứng trong đám đông hàng chờ -> kết thúc runner để nhân vật trong doorCrowd hiển thị lại tại chỗ!
                continue;
              }
            }

            if (state !== prevRunnerState) {
              runnerSubPhase = 0;
            }
            nextRunners.push({
              ...r,
              x,
              y,
              state,
              stateTimer,
              walkSubPhase: runnerSubPhase,
              animTime,
              facingLeft,
              isCarryingGift,
              chatBubbleUntil:
                r.chatBubbleUntil && nowCrowdEpoch >= r.chatBubbleUntil
                  ? 0
                  : r.chatBubbleUntil,
              scoreCardUntil:
                r.scoreCardUntil && nowCrowdEpoch >= r.scoreCardUntil
                  ? 0
                  : r.scoreCardUntil,
              rankUpStartAt:
                (r.rankUpStartAt && nowCrowdEpoch >= r.rankUpStartAt) ||
                (r.rankUpUntil && nowCrowdEpoch >= r.rankUpUntil)
                  ? 0
                  : r.rankUpStartAt,
              rankUpUntil:
                r.rankUpUntil && nowCrowdEpoch >= r.rankUpUntil
                  ? 0
                  : r.rankUpUntil,
              floatingScoreUntil:
                r.floatingScoreUntil && nowCrowdEpoch >= r.floatingScoreUntil
                  ? 0
                  : r.floatingScoreUntil,
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
                  flowerBonusAwarded: Boolean(qr.flowerBonusAwarded ?? true),
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
              nextAct.comboCount || 1,
              nextAct.bonusPoints
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

          const step = pig.speed * dt;
          if (Math.abs(wp.x - x) > 0.5) {
            facingLeft = wp.x < x;
            x = stepAxis(x, wp.x, step);
          } else if (Math.abs(wp.y - y) > 0.5) {
            x = wp.x;
            y = stepAxis(y, wp.y, step);
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
    };

    return subscribeAnimationLoop(stepSimulation);
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
    const stopPruneTimer = setUnthrottledInterval(() => {
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
    return () => stopPruneTimer();
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
            winnerTrophyScale: undefined,
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
          hasDeskTrophy: false,
          deskTrophyDropAt: 0,
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
          winnerTrophyScale: undefined,
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
          pendingFlowerBonusPoints:
            nextFlowerAct.bonusPoints ||
            resolveClassroomGiftKind(nextFlowerAct.giftId, 1).bonusPoints,
          flowerBonusAwarded: true,
          state: 'walk_to_teacher_gift' as const,
          stateTimer: 0,
          coins: 0,
          pendingGiftCoins: 0,
          answeredCurrentQuestion: false,
          hasDeskCat: false,
          deskCatCount: 0,
          hasDeskTrophy: false,
          deskTrophyDropAt: 0,
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
          winnerTrophyScale: undefined,
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
        hasDeskTrophy: false,
        deskTrophyDropAt: 0,
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
        winnerTrophyScale: undefined,
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
          prayer: '',
          gender: ev.gender,
          isVip: ev.isVip,
          coins: 0,
          isBot: ev.isBot,
          avatarUrl: ev.avatarUrl || existingInPool?.avatarUrl || null,
          addedAt: nowReturn + idx,
          points: keptPts,
          rank: waitingPoolRef.current.size + 1,
          answeredCorrectInRound: false,
          hasCommentedInRound: false,
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

  // Thêm chính xác số lượng NPC mới vào Hàng Chờ Vào Lớp mỗi khi xong 1 câu hỏi (không cộng trừ ngẫu nhiên)
  const enqueueBatchNpcsAfterQuestion = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg.autoCrowd) return;
    const baseCount = Math.max(0, Math.round(cfg.botTargetCrowd ?? 8));
    if (baseCount <= 0) return;

    const actualToAdd = baseCount;

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
        prayer: '',
        gender: resolveBalancedNpcGender(chosenName, 'queue'),
        isVip: false,
        coins: 0,
        isBot: true,
        avatarUrl: randomAvatar,
        addedAt: Date.now() + i,
        points: 0,
        rank: pool.size + 1,
        answeredCorrectInRound: false,
        hasCommentedInRound: false,
        lastElapsedSec: 999,
        idleRounds: 0,
      });
    }

    recomputeWaitingQueueLazy();
  }, [recomputeWaitingQueueLazy, resolveBalancedNpcGender]);

  // Lên lịch cho TẤT CẢ học sinh NPC (cả trong lớp VÀ trong Hàng Chờ) comment trả lời câu hỏi trải đều trong 10s đầu (không đồng thanh)
  // Dựa theo tỉ lệ `npcCorrectAnswerPercent`: Trả lời đúng (từ tiếng Anh ngắn gọn) hoặc nói vẩn vơ (trích danh sách phát biểu)
  const quizNpcTimersRef = useRef<Array<() => void>>([]);
  const clearQuizNpcTimers = useCallback(() => {
    quizNpcTimersRef.current.forEach((cancelFn) => cancelFn());
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
      // Chỉ cho NPC bắt đầu trả lời sau > 6.5s (và luôn xếp hạng sau người chơi thật trong sortAndReRankQuizWinners) để không bao giờ cướp Top tốc độ của người xem Live
      const minStartMs = 6500;
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

        const cancelTimer = setUnthrottledTimeout(() => {
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

        quizNpcTimersRef.current.push(cancelTimer);
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

    const cancelSeedTimer = setUnthrottledTimeout(() => {
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

    const cancelInitTimer = setUnthrottledTimeout(() => {
      const curBoard = classBoardStateRef.current;
      const currentCfg = configRef.current;
      if (!curBoard.isRunning || curBoard.engine !== 'english_quiz') return;

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
      cancelSeedTimer();
      cancelInitTimer();
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

    const stopScatterTimer = setUnthrottledInterval(() => {
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

    return () => stopScatterTimer();
  }, [
    pickRandomReplySpeech,
    pickRandomSpeechFromThreeGroups,
    spawnOrPromotePilgrim,
  ]);

  // Đồng bộ cấu hình engine, bộ câu hỏi & thời gian câu hỏi (mặc định 12s cho Luồng 2 & 3) vào classBoardState khi người dùng chỉnh trong Studio
  // Quy tắc nguồn chuẩn duy nhất: Câu hỏi trên Bảng Lớp (currentQuestion) LUÔN LUÔN là câu đầu tiên (#1 Đang phát: quizList[0]) trong Hàng Chờ Câu Hỏi!
  useEffect(() => {
    const nextEngine = config.hudLayout.classBoardEngine || 'notice';
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
    config.hudLayout.classBoardSentenceQuestionDurationByLevel,
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
      lastExpiredQuizWindowRef.current = null;

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

      // Ghi nhận cửa sổ câu hỏi vừa hết giờ (sau cả 2s bù trễ) để nhận diện comment đáp án đúng nhưng bị muộn giờ
      if (currentQuizQuestion?.en) {
        const expiredWinnerSet = new Set<string>();
        cWinners.forEach((cw) => {
          if (cw?.username) {
            expiredWinnerSet.add(cw.username.trim().toLowerCase());
          }
        });
        oWinners.forEach((ow) => {
          if (ow?.username) {
            expiredWinnerSet.add(ow.username.trim().toLowerCase());
          }
        });
        for (const p of pilgrimsRef.current) {
          if (p.answeredCurrentQuestion && p.username) {
            expiredWinnerSet.add(p.username.trim().toLowerCase());
          }
        }
        for (const [k, q] of waitingPoolRef.current.entries()) {
          if (q.answeredCorrectInRound) {
            expiredWinnerSet.add(k);
          }
        }
        lastExpiredQuizWindowRef.current = {
          en: currentQuizQuestion.en,
          winnerLowerSet: expiredWinnerSet,
          expiredAtMs: Date.now(),
        };
      }

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
          qEntry.hasCommentedInRound = true;
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

      // 2. Lazy Calculation 1 lần cho Hàng Chờ (dọn các bạn trong hàng chờ không comment 3 lượt liên tiếp & reset điểm vòng của họ về 0, giữ nguyên điểm tổng EXP & Cúp Vàng)
      const resetUsers = recomputeWaitingQueueLazy({
        finalizeQuizRound: true,
      });
      if (resetUsers.size > 0) {
        const activeInClassSet = new Set(
          pilgrimsRef.current
            .filter(
              (p) =>
                (Boolean(p.slotId) ||
                  p.state === 'stand_punishment' ||
                  p.state === 'walk_to_punishment_spot') &&
                p.state !== 'leave_side_to_aisle' &&
                p.state !== 'leave_down_exit'
            )
            .map((p) => p.username.trim().toLowerCase())
        );
        const filteredRoundDonors = lotusDonorsRef.current.filter((d) => {
          const k = d.username.trim().toLowerCase();
          return !resetUsers.has(k) || activeInClassSet.has(k);
        });
        if (filteredRoundDonors.length !== lotusDonorsRef.current.length) {
          lotusDonorsRef.current = filteredRoundDonors;
          setLotusDonors(filteredRoundDonors);
        }
      }

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
        const curSavedTrophies =
          studentTrophyMapRef.current.get(lowerName) ?? p.goldTrophies ?? 0;

        if (!isSeatedInClass) {
          return {
            ...p,
            exp: curSavedExp,
            level: curSavedLevel,
            goldTrophies: curSavedTrophies,
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
          const didRankUpInQuiz = nextLevel > prevLevel;
          const cardEndAt = nowFlow4 + scoreCardDurMs;
          const delayedRankUpStartAt = cardEndAt + 2000;
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
            goldTrophies: curSavedTrophies,
            expChangeDelta: 0,
            leveledUpInRound: didRankUpInQuiz,
            rankUpStartAt: didRankUpInQuiz ? delayedRankUpStartAt : 0,
            rankUpUntil: didRankUpInQuiz ? delayedRankUpStartAt + 2000 : 0,
            rankUpKey: didRankUpInQuiz ? nowFlow4 + p.id : p.rankUpKey,
            scoreCardUntil: cardEndAt,
            scoreCardKey: nowFlow4 + p.id,
          };
        }

        if (p.hasShield) {
          const nowShield = Date.now();
          return {
            ...p,
            exp: curSavedExp,
            level: curSavedLevel,
            goldTrophies: curSavedTrophies,
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
          goldTrophies: curSavedTrophies,
          expChangeDelta: 0,
          leveledUpInRound: false,
          correctStreak: 0,
          savedByShieldInCurrentRound: false,
          coins: 0,
          pendingGiftCoins: 0,
          hasDeskCat: false,
          deskCatCount: 0,
          hasDeskTrophy: false,
          deskTrophyDropAt: 0,
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

      // Đồng bộ EXP/Level & Cúp Vàng mới nhất cho các bạn đứng ở đám đông cửa lớp (doorCrowd)
      if (doorCrowdRef.current.length > 0) {
        const nextCrowd = doorCrowdRef.current.map((d) => {
          const lower = d.username.trim().toLowerCase();
          const expVal = studentExpMapRef.current.get(lower) || 0;
          const trophyVal = studentTrophyMapRef.current.get(lower) || 0;
          return {
            ...d,
            exp: expVal,
            level: getStudentLevelFromExp(expVal),
            goldTrophies: trophyVal,
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
  // Hàm trao 3 Cúp Vàng khi kết thúc vòng kiểm tra 10 câu với kích thước 200% (Top 1: to hơn 100%, +3 cúp), 150% (Top 2: +2 cúp), 100% (Top 3: giữ nguyên, +1 cúp)
  triggerRoundEndMilkTeaRef.current = (fromSync = false) => {
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

    if (!fromSync) {
      syncService.sendCommand('SYNC_ROUND_END_TROPHIES', {
        roundSeq:
          roundEndTargetRoundSeqRef.current ||
          classBoardStateRef.current.roundSeq ||
          1,
        winners,
      });
    }

    const lineSpacing = Math.max(24, cfg.punishmentLineSpacing || 52);
    const scaleByRank: Record<1 | 2 | 3, number> = {
      1: 2.0, // Top 1: to hơn 100% (200% = gấp đôi cúp chuẩn)
      2: 1.5, // Top 2: 150% kích thước cúp chuẩn
      3: 1.0, // Top 3: giữ nguyên kích thước cúp chuẩn (100%)
    };
    const trophiesByRank: Record<1 | 2 | 3, number> = {
      1: 3, // Top 1 +3 Cúp Vàng
      2: 2, // Top 2 +2 Cúp Vàng
      3: 1, // Top 3 +1 Cúp Vàng
    };
    const spotIdxByRank: Record<1 | 2 | 3, number> = {
      1: 2, // Đứng vị trí P3 (giữa)
      2: 0, // Đứng vị trí P1 (trái)
      3: 4, // Đứng vị trí P5 (phải)
    };

    const trophiesToSpawn: FlyingMilkTeaFX[] = ([1, 2, 3] as const).map(
      (rankNum, idx) => {
        const w = winners.find((item) => item.rank === rankNum);
        const livePilgrim = w?.pilgrimId
          ? pilgrimsRef.current.find((p) => p.id === w.pilgrimId)
          : w?.username
          ? pilgrimsRef.current.find(
              (p) =>
                p.username.trim().toLowerCase() ===
                w.username.trim().toLowerCase()
            )
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
          id: `round_end_trophy_${nowTea}_${rankNum}_${idx}`,
          startX,
          startY,
          targetX,
          targetY,
          createdAt: nowTea + idx * 90,
          durationMs: 1250,
          scale: scaleByRank[rankNum],
          variant: 'gold_trophy',
        };
      }
    );

    soundEngine.playGiftEventSound('rose', cfg, true);
    setFlyingMilkTeas((prev) => [...prev.slice(-12), ...trophiesToSpawn]);

    // Sau khi Cúp Vàng bay tới tay (~1.05s):
    // 1) Cộng Cúp Vàng vào tổng cúp sở hữu học sinh + bảng Kỷ lục cúp vàng trong ngày
    // 2) Cầm Cúp Vàng theo tỷ lệ 200% / 150% / 100% trên bục trao giải, đồng thời đặt Cúp Vàng đồng nhất kích thước lên mặt bàn (vị trí con mèo) & hiện Floating Text +3 / +2 / +1!
    setUnthrottledTimeout(() => {
      const isPureLiveTabNow =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('view') === 'live' ||
          new URLSearchParams(window.location.search).get('mode') === 'live' ||
          new URLSearchParams(window.location.search).get('obs') === '1');
      const peersNow = peerCountsRef.current;
      const isPassiveTab =
        !isPureLiveTabNow &&
        (peersNow.obsPeers > 0 ||
          (peersNow.totalPeers > 1 && soundEngine.isTabMuted()));

      const winnerRankByLower = new Map<string, 1 | 2 | 3>();
      const awardsToCommit: Array<{
        username: string;
        trophies: number;
        avatarUrl?: string | null;
        avatarColor?: string;
      }> = [];

      roundEndWinnersRef.current.forEach((w) => {
        if (w.username && w.username.trim()) {
          const r = w.rank;
          winnerRankByLower.set(w.username.trim().toLowerCase(), r);
          const matchedP = pilgrimsRef.current.find(
            (p) =>
              p.username.trim().toLowerCase() === w.username.trim().toLowerCase()
          );
          awardsToCommit.push({
            username: w.username.trim(),
            trophies: trophiesByRank[r],
            avatarUrl: matchedP?.avatarUrl,
            avatarColor: matchedP?.avatarColor,
          });
        }
      });

      const targetRoundSeq =
        roundEndTargetRoundSeqRef.current ||
        classBoardStateRef.current.roundSeq ||
        1;
      if (
        !isPassiveTab &&
        awardsToCommit.length > 0 &&
        !awardedTrophyRoundSetRef.current.has(targetRoundSeq)
      ) {
        awardStudentGoldTrophies(awardsToCommit, targetRoundSeq);
        flushStudentExpStorage(false, true);
      }

      const nowLand = Date.now();
      const updated = pilgrimsRef.current.map((p) => {
        const lower = p.username.trim().toLowerCase();
        const r = p.podiumRank || winnerRankByLower.get(lower);
        const latestTotalTrophies =
          studentTrophyMapRef.current.get(lower) ?? p.goldTrophies ?? 0;
        if (!r) {
          return (p.goldTrophies ?? 0) !== latestTotalTrophies
            ? { ...p, goldTrophies: latestTotalTrophies }
            : p;
        }
        const isInClass =
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit';
        return {
          ...p,
          winnerMilkTeaScale: undefined,
          winnerTrophyScale: scaleByRank[r],
          hasDeskTrophy: isInClass ? true : false,
          deskTrophyDropAt: isInClass ? nowLand : 0,
          goldTrophies: latestTotalTrophies,
          floatingTrophyCount: trophiesByRank[r],
          floatingTrophyUntil: nowLand + 3400,
          floatingTrophyKey: nowLand + r,
        };
      });
      pilgrimsRef.current = updated;
      setPilgrims(updated);

      if (doorCrowdRef.current.length > 0) {
        const updatedCrowd = doorCrowdRef.current.map((d) => {
          const lower = d.username.trim().toLowerCase();
          const latestTrophies =
            studentTrophyMapRef.current.get(lower) ?? d.goldTrophies ?? 0;
          return (d.goldTrophies ?? 0) !== latestTrophies
            ? { ...d, goldTrophies: latestTrophies }
            : d;
        });
        doorCrowdRef.current = updatedCrowd;
        setDoorCrowd(updatedCrowd);
      }
    }, 1050);
  };

  useEffect(() => {
    if (!classBoardState.isRunning) return;
    if (classBoardState.engine !== 'english_quiz') return;

    let lastTick = performance.now();
    const stopBoardTimer = setUnthrottledInterval(() => {
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

      // Bù trễ phản hồi server 2s: Sau khi đồng hồ hiển thị đếm về 0s, vẫn giữ luồng 'asking' thêm 2000ms (2s) để nhận câu trả lời thực tế
      const ASKING_POST_ZERO_GRACE_MS = 2000;
      const stillPendingPhaseTts =
        !soundEngine.isTabMuted() &&
        Boolean(prev.activeFlowToken) &&
        soundEngine.hasPendingFlowToken(prev.activeFlowToken);
      const finishedAtElapsed = prev.ttsFinishedAtElapsedMs ?? 0;
      const postTtsGapMs = Math.max(0, nextElapsed - finishedAtElapsed);

      let shouldAdvance = false;
      if (prev.phase === 'lesson_start') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            postTtsGapMs >= 550 &&
            nextElapsed >= 2200) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 45000));
      } else if (prev.phase === 'preparing') {
        shouldAdvance = nextLeft <= 0;
      } else if (prev.phase === 'asking') {
        const realAskExpired =
          prev.phaseEndAt && prev.phaseEndAt > 0
            ? nowWallMs >= prev.phaseEndAt + ASKING_POST_ZERO_GRACE_MS
            : nextLeft <= 0 &&
              nextElapsed >=
                (prev.totalDurationMs || 0) + ASKING_POST_ZERO_GRACE_MS;
        const waitingForIdleChatFinish =
          Boolean(prev.idleChatTriggered) &&
          Boolean(prev.activeFlowToken) &&
          !prev.ttsFinishedForPhase &&
          nextElapsed <
            prev.totalDurationMs + ASKING_POST_ZERO_GRACE_MS + 9000;
        shouldAdvance = realAskExpired && !waitingForIdleChatFinish;
      } else if (prev.phase === 'answer_flash') {
        const postTtsWaitMs4 =
          Math.max(0, Number(cfg.lessonFlow4PostTtsDelaySec ?? 1)) * 1000;
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            postTtsGapMs >= postTtsWaitMs4 &&
            nextElapsed >= 600) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 40000));
      } else if (prev.phase === 'result_summary') {
        // Luồng 5: Bắt buộc đọc trọn vẹn 100% câu vinh danh kết quả + nghỉ tự nhiên 650ms sau khi kết thúc câu rồi mới chuyển sang Luồng 6
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            !stillPendingPhaseTts &&
            postTtsGapMs >= 650 &&
            nextElapsed >= 2800) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 45000));
      } else if (prev.phase === 'ranking_board' || prev.phase === 'reveal') {
        // Luồng 6: Bắt buộc đọc trọn vẹn 100% câu bảng xếp hạng + nghỉ tự nhiên 650ms sau khi kết thúc câu rồi mới sang câu hỏi tiếp theo
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            !stillPendingPhaseTts &&
            postTtsGapMs >= 650 &&
            nextElapsed >= 3200) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 45000));
      } else if (prev.phase === 'round_end') {
        // Luồng Kết Thúc: chờ Cô đọc xong toàn bộ các vế + tiếng vỗ tay kết thúc mới sang game mới
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            !stillPendingPhaseTts &&
            nextElapsed >= 4500) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 65000));
      } else if (prev.phase === 'record_notice') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            !stillPendingPhaseTts &&
            postTtsGapMs >= 650 &&
            nextElapsed >= 2600) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 45000));
      } else if (prev.phase === 'punishment_notice') {
        shouldAdvance =
          (Boolean(prev.ttsFinishedForPhase) &&
            !stillPendingPhaseTts &&
            postTtsGapMs >= 650 &&
            nextElapsed >= 2500) ||
          (nextLeft <= 0 && (!stillPendingPhaseTts || nextElapsed >= 45000));
      }

      const followerExtraGraceMs =
        prev.phase === 'asking'
          ? ASKING_POST_ZERO_GRACE_MS + 2500
          : prev.phase === 'preparing'
          ? 2500
          : 10000;
      const followerGraceExpired =
        isPassiveFollowerTab &&
        shouldAdvance &&
        nextLeft <= 0 &&
        nextElapsed >= (prev.totalDurationMs || 3000) + followerExtraGraceMs;

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
        // Chỉ phát "Luồng 3: Câu nói vu vơ" khi hàng chờ âm thanh đang thực sự rảnh (!soundEngine.getBusyState()),
        // tuyệt đối không chèn câu nhắc bài phụ khi đang đọc cảm ơn quà tặng hoặc comment của học sinh trên Live!
        if (
          !isPassiveFollowerTab &&
          prev.phase === 'asking' &&
          !prev.idleChatTriggered &&
          !isStillReadingQuestion2 &&
          !soundEngine.getBusyState() &&
          cfg.lessonIdleChatEnabled !== false &&
          nextElapsed >= idleDelayMs &&
          nextLeft >= 2200
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
          ttsFinishedAtElapsedMs: undefined,
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
        const questionSpeech = formatQuizQuestionTtsSpeech(
          cfg.lessonQuestionTtsTemplate,
          roundQuestionNumber,
          curQuiz
        );

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
          ttsFinishedAtElapsedMs: undefined,
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
        const finalRanked = sortAndReRankQuizWinners(prev.winners || [], {
          currentQuestion: prev.currentQuestion || curQuiz,
          getRankPoints: getQuizRankPoints,
          getPunishmentMultiplier: (wLower) => {
            const punishedMatch = pilgrimsRef.current.find(
              (p) =>
                p.username.trim().toLowerCase() === wLower &&
                p.isPunishedInCurrentRound &&
                p.punishmentMultiplier
            );
            return punishedMatch?.punishmentMultiplier || 1;
          },
        });
        const cWinners = finalRanked.classWinners;
        const oWinners = finalRanked.outsideWinners;

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
            text: isSentenceScrambleItem(curQuiz)
              ? analyzeSentencePair(curQuiz.vi, curQuiz.en).enCanonical
              : curQuiz.en,
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
          winners: finalRanked.winners,
          classWinners: cWinners,
          outsideWinners: oWinners,
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
        const overallWinners = prev.winners || [];

        const classRightCount = cWinners.length;
        const outsideRightCount = oWinners.length;
        // [Top1] vinh danh đúng người trả lời nhanh nhất toàn phòng Live theo thứ tự chuẩn máy chủ TikTok (dù đang trong lớp hay ngoài hàng chờ)
        const fastestRawName =
          overallWinners[0]?.username ||
          cWinners[0]?.username ||
          oWinners[0]?.username ||
          '';
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
          .replace(
            /\[Top1Lớp\]/gi,
            cWinners[0]?.username || fastestWinner
          )
          .replace(/\[Top1\]|\{fastestName\}/gi, fastestWinner)
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
        // Đưa câu đọc Luồng 5 của Cô Giáo lên phát TRƯỚC KHI thực hiện cập nhật chỗ ngồi,
        // đảm bảo lời chào học sinh vào lớp (nếu bật) luôn xếp sau câu đọc kết quả chứ không chiếm kênh trước!
        const enqueued5 =
          flow5TtsItems.length > 0
            ? soundEngine.enqueueLessonFlowItems(flow5TtsItems, cfg)
            : false;

        // CẬP NHẬT CHỖ NGỒI NGAY KHI BẮT ĐẦU LUỒNG SỐ 5:
        // Loại học sinh trong lớp không trả lời / trả lời sai, đẩy học sinh Top Rank từ Hàng Chờ vào lớp, và thêm đợt NPC mới vào Hàng Chờ
        ensureResultSummaryPhaseSideEffects(
          prev.roundSeq || 1,
          prev.questionIndex,
          cWinners,
          oWinners
        );

        const fallbackDur5 = enqueued5 ? 24000 : 3800;

        // Khóa camera vào bạn trả lời nhanh nhất (hoặc nhanh nhất trong lớp) trong 2s ngay khi mới vào Luồng 5
        if (flow5CameraLockTimerRef.current !== null) {
          window.clearTimeout(flow5CameraLockTimerRef.current);
          flow5CameraLockTimerRef.current = null;
        }
        flow5LockedStudentIdRef.current = null;

        const fastestClassLower = (cWinners[0]?.username || '')
          .trim()
          .toLowerCase();
        if ((fastestLower || fastestClassLower) && !zombieEventStateRef.current.isActive) {
          const fastestClassTarget =
            (fastestLower
              ? pilgrimsRef.current.find(
                  (p) =>
                    p.state !== 'leave_side_to_aisle' &&
                    p.state !== 'leave_down_exit' &&
                    p.username.trim().toLowerCase() === fastestLower
                )
              : undefined) ||
            (fastestClassLower
              ? pilgrimsRef.current.find(
                  (p) =>
                    p.state !== 'leave_side_to_aisle' &&
                    p.state !== 'leave_down_exit' &&
                    p.username.trim().toLowerCase() === fastestClassLower
                )
              : undefined);
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
          ttsFinishedAtElapsedMs: !enqueued5 ? 0 : undefined,
          elapsedPhaseMs: 0,
          timeLeftMs: fallbackDur5,
          totalDurationMs: fallbackDur5,
          phaseEndAt: Date.now() + fallbackDur5,
          showResultEngine: true,
          seatUpdateTriggered: true,
          totalQuestions: QUESTIONS_PER_ROUND,
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

        // Tập hợp và xếp hạng toàn bộ học sinh đang ở trong lớp (khử trùng lặp theo username để 1 học sinh không bao giờ chiếm 2 hạng bục giảng)
        const dedupedClassMap = new Map<
          string,
          {
            pilgrimId: number;
            username: string;
            points: number;
            avatarUrl?: string | null;
            avatarColor?: string;
          }
        >();
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
          const prevSt = dedupedClassMap.get(key);
          if (!prevSt || pts > prevSt.points) {
            dedupedClassMap.set(key, {
              pilgrimId: p.id,
              username: p.username,
              points: pts,
              avatarUrl: p.avatarUrl,
              avatarColor: p.avatarColor,
            });
          }
        }
        const activeClassStudents = Array.from(dedupedClassMap.values()).sort(
          (a, b) => b.points - a.points
        );

        const currentRoundQuestionNum = (prev.roundQuestionIndex ?? 0) + 1;
        const isFinalQuestionOfRound =
          currentRoundQuestionNum >= QUESTIONS_PER_ROUND;

        // NẾU ĐÂY LÀ CÂU CUỐI CÙNG: CHÈN "LUỒNG KẾT THÚC" (round_end) THAY CHO LUỒNG 6
        if (isFinalQuestionOfRound) {
          const pickedLowerSet = new Set<string>();
          const pickUniquePodiumEntry = (
            rankNum: 1 | 2 | 3,
            fallbackPts: number
          ) => {
            for (const cand of activeClassStudents) {
              const lower = cand.username.trim().toLowerCase();
              if (lower && !pickedLowerSet.has(lower)) {
                pickedLowerSet.add(lower);
                return cand;
              }
            }
            for (const cw of prev.classWinners || []) {
              const lower = (cw.username || '').trim().toLowerCase();
              if (lower && !pickedLowerSet.has(lower)) {
                pickedLowerSet.add(lower);
                return {
                  pilgrimId: cw.pilgrimId || 0,
                  username: cw.username,
                  points: cw.points || fallbackPts,
                  avatarUrl: cw.avatarUrl,
                  avatarColor: cw.avatarColor,
                };
              }
            }
            const placeholderName = `Học Sinh Top ${rankNum}`;
            pickedLowerSet.add(placeholderName.toLowerCase());
            return {
              pilgrimId: 0,
              username: placeholderName,
              points: fallbackPts,
            };
          };

          const top1Entry = pickUniquePodiumEntry(1, 10);
          const top2Entry = pickUniquePodiumEntry(2, 8);
          const top3Entry = pickUniquePodiumEntry(3, 7);

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
          roundEndTargetRoundSeqRef.current = prev.roundSeq || 1;
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
              hasDeskTrophy: Boolean(p.slotId),
              deskTrophyDropAt: p.deskTrophyDropAt || Date.now(),
              winnerMilkTeaScale: undefined,
              winnerTrophyScale: undefined,
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
            'Bài kiểm tra kết thúc, cô mời các bạn chiến thắng bước lên bục giảng. Chúc mừng bạn [top1] đạt top 1 với [Điểm top 1] điểm, bạn [top2] đạt top 2 với [Điểm top 2] điểm, bạn [top3] đạt top 3 với [Điểm top 3] điểm. Trao tặng cúp vàng danh giá cho 3 bạn xuất sắc nhất, mấy cưng ở dưới vỗ tay nào !';

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
          // Vế 1 (Mời lên bục) -> Vế 2 (Đọc tên Top 1: Khóa cam Top 1) -> Vế 3 (Đọc tên Top 2: Khóa cam Top 2) -> Vế 4 (Đọc tên Top 3: Khóa cam Top 3) -> Vế 5 (Trao Cúp Vàng 200%/150%/100% & Vỗ tay)
          const idxTop1 = rawRoundEndTpl.search(/Chúc mừng|\[top1\]|\[Top1\]/i);
          const idxTop2 = rawRoundEndTpl.search(/bạn\s*\[top2\]|\[top2\]|\[Top2\]/i);
          const idxTop3 = rawRoundEndTpl.search(/bạn\s*\[top3\]|\[top3\]|\[Top3\]/i);
          const idxMilkTea = rawRoundEndTpl.search(
            /Trao tặng|Tặng|cúp vàng|trà sữa/i
          );

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
                lessonStepLabel: 'Luồng Kết Thúc: Cúp Vàng & Vỗ Tay',
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
            setUnthrottledTimeout(() => {
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
            setUnthrottledTimeout(() => {
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
            setUnthrottledTimeout(() => {
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
            setUnthrottledTimeout(() => {
              setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
              triggerRoundEndMilkTeaRef.current();
              if (!enqueuedRoundEnd) {
                soundEngine.playApplauseSfx(
                  cfg.ttsVolume || 1,
                  3400,
                  cfg.applauseMp3Url,
                  cfg.applauseVolume
                );
              }
            }, 7000);
          }

          const fallbackDurRoundEnd = enqueuedRoundEnd ? 36000 : 11000;
          const roundEndState: ClassBoardRuntimeState = {
            ...prev,
            phase: 'round_end',
            lessonStepNumber: 6,
            activeFlowToken: flowTokenRoundEnd,
            ttsFinishedForPhase: !enqueuedRoundEnd,
            ttsFinishedAtElapsedMs: !enqueuedRoundEnd ? 0 : undefined,
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

        const fallbackDur6 = enqueued6 ? 24000 : 5000;
        const rankingBoardState: ClassBoardRuntimeState = {
          ...prev,
          phase: 'ranking_board',
          lessonStepNumber: 6,
          activeFlowToken: flowToken6,
          ttsFinishedForPhase: !enqueued6,
          ttsFinishedAtElapsedMs: !enqueued6 ? 0 : undefined,
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
          const earnedOrHadDeskTrophy =
            Boolean(p.slotId) && Boolean(p.hasDeskTrophy || p.podiumRank);
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
            hasDeskTrophy: earnedOrHadDeskTrophy,
            deskTrophyDropAt: earnedOrHadDeskTrophy
              ? p.deskTrophyDropAt || Date.now()
              : 0,
            podiumRank: undefined,
            winnerMilkTeaScale: undefined,
            winnerTrophyScale: undefined,
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
            true,
            recentAskedWordsRef.current
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
          'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 10 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.';
        const flowTokenStartNew = `flow_start_${Date.now()}_${nextRoundSeq}`;
        const startTtsItemsNew = [
          {
            text: startSpeechNewRound,
            lang: 'vi' as const,
            lessonFlowToken: flowTokenStartNew,
            lessonStepLabel: 'Luồng 0: Bắt đầu vòng kiểm tra 10 câu mới',
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
          ttsFinishedAtElapsedMs: !enqueuedStartNew ? 0 : undefined,
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
          ...buildLiveSyncQueuePayload(newRoundQuizList),
          lessonTtsItems: startTtsItemsNew,
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
                'Chúc mừng bạn [Top1KỷLục] đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục cúp vàng hôm nay với [ĐiểmKỷLục] cúp vàng!';

          const recordSpeech = chosenRecTpl
            .replace(/\[Top1KỷLục\]|\[Tên\]|\[Top1\]/gi, pendingRec.username)
            .replace(
              /\[ĐiểmKỷLục\]|\[SốCúpKỷLục\]|\[Cúp\]|\[Điểm\]/gi,
              String(pendingRec.points)
            )
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

          const fallbackDurRecord = enqueuedRecord ? 22000 : 4500;
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
            ttsFinishedAtElapsedMs: !enqueuedRecord ? 0 : undefined,
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

          const fallbackDurPunish = enqueuedPunish ? 22000 : 4200;
          const punishNoticeState: ClassBoardRuntimeState = {
            ...prev,
            phase: 'punishment_notice',
            lessonStepNumber: 6,
            activeFlowToken: flowTokenPunish,
            ttsFinishedForPhase: !enqueuedPunish,
            ttsFinishedAtElapsedMs: !enqueuedPunish ? 0 : undefined,
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
        prev.currentQuestion,
        false,
        recentAskedWordsRef.current
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
          ...buildLiveSyncQueuePayload(nextQuizList),
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
        ttsFinishedAtElapsedMs: undefined,
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
        ...buildLiveSyncQueuePayload(nextQuizList),
        lessonTtsItems: nextPrepTtsItems,
      });
    }, 100);

    return () => stopBoardTimer();
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
    const stopZombieTimer = setUnthrottledInterval(() => {
      const now = performance.now();
      const dtMs = Math.max(20, Math.min(400, now - lastTick));
      lastTick = now;

      const prev = zombieEventStateRef.current;
      if (!prev.isActive) return;

      const cfg = configRef.current;
      const isPureLiveTab =
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('view') === 'live' ||
          new URLSearchParams(window.location.search).get('mode') === 'live' ||
          new URLSearchParams(window.location.search).get('obs') === '1');
      const peersNow = peerCountsRef.current;
      const isPassiveZombieTab =
        !isPureLiveTab &&
        (peersNow.obsPeers > 0 ||
          (peersNow.totalPeers > 1 && soundEngine.isTabMuted()));

      // Tự phục hồi hiển thị Zombie tức thì nếu đồng bộ liên tab làm nhảy qua z_flow_1_intro -> z_flow_2..5b
      const shouldShowZombieEntity =
        prev.phase === 'z_flow_2_spawn' ||
        prev.phase === 'z_flow_3_teacher' ||
        prev.phase === 'z_flow_4_supervisor' ||
        prev.phase === 'z_flow_5_combat' ||
        prev.phase === 'z_flow_5b_dying';
      if (shouldShowZombieEntity && !zombieEntityRef.current.visible) {
        const spawnPosGuard = cfg.zombieSpawnPos || { x: 42, y: 520 };
        const standPosGuard = cfg.zombieStandPos || { x: 270, y: 486 };
        const isSpawnPhase = prev.phase === 'z_flow_2_spawn';
        const lockCamGuardMs = Math.max(
          500,
          Math.round((cfg.zombieFlow2LockCameraSec ?? 3.0) * 1000)
        );
        const healedZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          visible: true,
          x: isSpawnPhase ? spawnPosGuard.x : standPosGuard.x,
          y: isSpawnPhase ? spawnPosGuard.y : standPosGuard.y,
          targetX: standPosGuard.x,
          targetY: standPosGuard.y,
          isWalking:
            isSpawnPhase && (prev.elapsedPhaseMs || 0) >= lockCamGuardMs,
          facing:
            isSpawnPhase && standPosGuard.x < spawnPosGuard.x
              ? 'left'
              : 'right',
          isDying: prev.phase === 'z_flow_5b_dying',
          dyingProgress:
            prev.phase === 'z_flow_5b_dying'
              ? Math.max(0.05, zombieEntityRef.current.dyingProgress || 0.05)
              : 0,
        };
        zombieEntityRef.current = healedZ;
        setZombieEntity(healedZ);
      } else if (!shouldShowZombieEntity && zombieEntityRef.current.visible) {
        const hiddenGuardZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          visible: false,
          isWalking: false,
          isDying: false,
        };
        zombieEntityRef.current = hiddenGuardZ;
        setZombieEntity(hiddenGuardZ);
      }

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
        const stillPendingTts1 =
          !soundEngine.isTabMuted() &&
          Boolean(prev.activeFlowToken) &&
          soundEngine.hasPendingFlowToken(prev.activeFlowToken);
        const rawDone1 =
          (!stillPendingTts1 &&
            Boolean(prev.ttsFinishedForPhase) &&
            nextElapsed >= minDur1Ms) ||
          (nextLeft <= 0 && (!stillPendingTts1 || nextElapsed >= 35000));
        const followerGrace1 =
          isPassiveZombieTab &&
          nextLeft <= 0 &&
          nextElapsed >= (prev.totalDurationMs || 6000) + 6500;
        const done1 = isPassiveZombieTab ? followerGrace1 : rawDone1;
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
        if (!soundEngine.isRemoteSlaveMode() && !isPassiveZombieTab) {
          soundEngine.playZombieGrowlSfx(
            cfg.ttsVolume || 1,
            cfg.zombieGrowlMp3Url,
            true
          );
        }
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
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: state2,
          entity: spawnedZ,
        });
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
              visible: true,
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
        const rawDone2 = arrivedAfterLock || nextLeft <= 0;
        const followerGrace2 =
          isPassiveZombieTab &&
          nextLeft <= 0 &&
          nextElapsed >= (prev.totalDurationMs || 6500) + 6500;
        const done2 = isPassiveZombieTab ? followerGrace2 : rawDone2;

        if (!done2) {
          const tick2: ZombieEventRuntimeState = {
            ...prev,
            elapsedPhaseMs: nextElapsed,
            timeLeftMs: nextLeft,
          };
          zombieEventStateRef.current = tick2;
          setZombieEventState(tick2);
          return;
        }

        // Đảm bảo Zombie đứng đúng vị trí quy định và luôn hiển thị
        const settledZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          visible: true,
          x: standPos.x,
          y: standPos.y,
          targetX: standPos.x,
          targetY: standPos.y,
          isWalking: false,
          facing: 'right',
          isDying: false,
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
        const enqueued3 =
          soundEngine.isRemoteSlaveMode() || isPassiveZombieTab
            ? Boolean(cfg.ttsEnabled)
            : soundEngine.enqueueLessonFlowItems(
                [
                  {
                    text: teacherLine,
                    lang: 'vi',
                    speakerRole: 'abbot',
                    lessonFlowToken: flowToken3,
                    lessonStepLabel:
                      'Sự kiện Zombie - Luồng 3: Cô giáo cầu cứu',
                  },
                ],
                cfg
              );
        const dur3 = enqueued3
          ? Math.max(11000, minDur3Ms + 4500)
          : Math.max(2500, minDur3Ms + 1000);

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
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: state3,
          entity: settledZ,
        });
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
        const stillPendingTts3 =
          !soundEngine.isTabMuted() &&
          Boolean(prev.activeFlowToken) &&
          soundEngine.hasPendingFlowToken(prev.activeFlowToken);
        const rawDone3 =
          (!stillPendingTts3 &&
            Boolean(prev.ttsFinishedForPhase) &&
            nextElapsed >= minDur3Ms) ||
          (nextLeft <= 0 && (!stillPendingTts3 || nextElapsed >= 35000));
        const followerGrace3 =
          isPassiveZombieTab &&
          nextLeft <= 0 &&
          nextElapsed >= (prev.totalDurationMs || 6000) + 6500;
        const done3 = isPassiveZombieTab ? followerGrace3 : rawDone3;
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

        // Bắt đầu Luồng 4: Thầy Cá nói (giọng Nam Google Warm) + chatbox xanh dương + khóa camera vào Thầy Cá
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
          const nextM = prevM.map((m) => {
            if (m.role === 'senior_novice') {
              return {
                ...m,
                chatText: supervisorLine,
                chatBubbleUntil: bubbleUntil4,
              };
            }
            if (m.role === 'abbot') {
              return {
                ...m,
                chatText: undefined,
                chatBubbleUntil: undefined,
              };
            }
            return m;
          });
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
        const enqueued4 =
          soundEngine.isRemoteSlaveMode() || isPassiveZombieTab
            ? Boolean(cfg.ttsEnabled)
            : soundEngine.enqueueLessonFlowItems(
                [
                  {
                    text: supervisorLine,
                    lang: 'vi',
                    speakerRole: 'senior_novice',
                    lessonFlowToken: flowToken4,
                    lessonStepLabel:
                      'Sự kiện Zombie - Luồng 4: Thầy Cá kêu gọi',
                  },
                ],
                cfg
              );
        const dur4 = enqueued4
          ? Math.max(12000, minDur4Ms + 4500)
          : Math.max(2500, minDur4Ms + 1200);

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
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: state4,
          entity: zombieEntityRef.current,
        });
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
        const stillPendingTts4 =
          !soundEngine.isTabMuted() &&
          Boolean(prev.activeFlowToken) &&
          soundEngine.hasPendingFlowToken(prev.activeFlowToken);
        const rawDone4 =
          (!stillPendingTts4 &&
            Boolean(prev.ttsFinishedForPhase) &&
            nextElapsed >= minDur4Ms) ||
          (nextLeft <= 0 && (!stillPendingTts4 || nextElapsed >= 35000));
        const followerGrace4 =
          isPassiveZombieTab &&
          nextLeft <= 0 &&
          nextElapsed >= (prev.totalDurationMs || 6500) + 6500;
        const done4 = isPassiveZombieTab ? followerGrace4 : rawDone4;
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
        if (!soundEngine.isRemoteSlaveMode() && !isPassiveZombieTab) {
          soundEngine.playWoodenFish((cfg.ttsVolume || 1) * 0.8);
        }

        const standPos5 = cfg.zombieStandPos || { x: 270, y: 486 };
        const combatZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          visible: true,
          x: standPos5.x,
          y: standPos5.y,
          targetX: standPos5.x,
          targetY: standPos5.y,
          isWalking: false,
          facing: 'right',
          isDying: false,
        };
        zombieEntityRef.current = combatZ;
        setZombieEntity(combatZ);

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
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: state5,
          entity: combatZ,
        });
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
        const done5b = isPassiveZombieTab
          ? nextLeft <= 0 && nextElapsed >= (prev.totalDurationMs || 3200) + 4500
          : nextLeft <= 0;
        if (!done5b) {
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
          isWalking: false,
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
        if (!soundEngine.isRemoteSlaveMode() && !isPassiveZombieTab) {
          soundEngine.playAnswerRevealSfx(
            cfg.ttsVolume || 1,
            'victory_fanfare',
            null,
            true
          );
        }

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
        const enqueued6 =
          soundEngine.isRemoteSlaveMode() || isPassiveZombieTab
            ? Boolean(cfg.ttsEnabled)
            : soundEngine.enqueueLessonFlowItems(
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
                    lessonStepLabel:
                      'Sự kiện Zombie - Luồng 6: Trao thưởng Trà Sữa',
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
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: state6,
          entity: hiddenZ,
        });
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
          !soundEngine.isTabMuted() &&
          Boolean(prev.activeFlowToken) &&
          soundEngine.hasPendingFlowToken(prev.activeFlowToken);
        const postTtsElapsed6 =
          prev.ttsFinishedForPhase &&
          typeof prev.ttsFinishedAtElapsedMs === 'number'
            ? nextElapsed - prev.ttsFinishedAtElapsedMs
            : 9999;
        const rawDone6 =
          (!stillPendingTts6 &&
            Boolean(prev.ttsFinishedForPhase) &&
            nextElapsed >= minDur6Ms &&
            postTtsElapsed6 >= 1200) ||
          (nextLeft <= 0 && (!stillPendingTts6 || nextElapsed >= 75000));
        const followerGrace6 =
          isPassiveZombieTab &&
          nextLeft <= 0 &&
          nextElapsed >= (prev.totalDurationMs || 15000) + 6500;
        const done6 = isPassiveZombieTab ? followerGrace6 : rawDone6;
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

        const hiddenEndZ: ZombieEntityState = {
          ...zombieEntityRef.current,
          visible: false,
          isWalking: false,
          isDying: false,
        };
        zombieEntityRef.current = hiddenEndZ;
        setZombieEntity(hiddenEndZ);

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
          entity: hiddenEndZ,
        });

        // Tiếp tục lại tiết học đang dở ở câu hỏi kế tiếp (Luồng 1: Chuẩn bị)
        if (shouldResumeLesson) {
          const prepDurMs =
            Math.max(1, cfg.lessonPrepareDurationSec || 3) * 1000;
          const prepSpeech = pickRandomLessonPrepSpeech(cfg);
          const resumePrepItems = [
            {
              text: prepSpeech,
              lang: 'vi' as const,
              lessonStepLabel: `Luồng 1: Chuẩn bị (${Math.round(
                prepDurMs / 1000
              )}s)`,
            },
          ];
          if (!soundEngine.isRemoteSlaveMode() && !isPassiveZombieTab) {
            soundEngine.playWoodenFish((cfg.ttsVolume || 1) * 0.65);
            soundEngine.enqueueLessonFlowItems(resumePrepItems, cfg);
          }

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
            lessonTtsItems: resumePrepItems,
          });
        }
      }
    }, 100);

    return () => stopZombieTimer();
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
                prayTimer: 0,
                chatBubbleKey: issueChatBubbleKey(),
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
          chatBubbleKey: issueChatBubbleKey(),
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

    const cancelInitialWave = setUnthrottledTimeout(runSimulatedNpcHeartWave, 180);
    const intervalMs = Math.max(
      450,
      config.zombieHeartBatchIntervalMs || 1200
    );
    const stopWaveTimer = setUnthrottledInterval(runSimulatedNpcHeartWave, intervalMs);
    return () => {
      cancelInitialWave();
      stopWaveTimer();
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

  // Cô Thảo (abbot) nói câu khích lệ học sinh chiến đấu khi Sự Kiện Zombie đang ở pha Chiến Đấu (z_flow_5_combat)
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
          m.role === 'abbot'
            ? {
                ...m,
                monkBubbleText: `🔥 ${formatted}`,
                monkBubbleUntil: Date.now() + 5200,
              }
            : m
        )
      );

      soundEngine.enqueueTTS(formatted, true, cfg, {
        speakerRole: 'abbot',
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
                  prayTimer: 0,
                  chatBubbleKey: issueChatBubbleKey(),
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
            chatBubbleKey: issueChatBubbleKey(),
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
    const unsubDisconnectAlert = syncService.onDisconnectAlert((reason) => {
      const cfgNow = configRef.current;
      if (
        cfgNow.reminderAlertEnabled !== false &&
        cfgNow.reminderAlertOnDisconnect !== false
      ) {
        requestSilentReminderAlert(
          'Hệ thống Live',
          `🔔 Đã mở ngầm báo Telegram (${reason})`
        );
      }
    });

    const unsubTikTok = syncService.onTikTokEvent((ev) => {
      const orderMeta: TikTokOrderMeta = {
        tiktokMsgId: ev.tiktokMsgId,
        tiktokCreateTimeMs: ev.tiktokCreateTimeMs,
        serverSeq: ev.serverSeq,
        arrivalSeq: ev.arrivalSeq,
        orderTimestampMs: ev.orderTimestampMs,
      };
      if (ev.type === 'chat') {
        spawnOrPromotePilgrim({
          username: ev.username || 'Học Sinh',
          prayer: ev.comment || '',
          isVip: false,
          coins: 0,
          isBot: false,
          avatarUrl: ev.avatarUrl || ev.profilePictureUrl || null,
          orderMeta,
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
          orderMeta,
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
            orderMeta: p.orderMeta,
          });
          break;
        case 'TRIGGER_PAPER_PLANE': {
          const rawThrowerName = String(p.throwerUsername || '').trim();
          const tFrom = rawThrowerName.toLowerCase();
          const tTo = String(p.targetUsername || '').trim().toLowerCase();
          const pKind: 'paper_plane' | 'rose_bouquet' =
            p.projectileKind === 'rose_bouquet' ? 'rose_bouquet' : 'paper_plane';
          if (tFrom && tTo) {
            const inClassNow = pilgrimsRef.current.filter(
              (st) =>
                (Boolean(st.slotId) ||
                  st.state === 'stand_punishment' ||
                  st.state === 'walk_to_punishment_spot') &&
                st.state !== 'leave_side_to_aisle' &&
                st.state !== 'leave_down_exit'
            );
            const throwerSt =
              inClassNow.find(
                (st) => st.username.trim().toLowerCase() === tFrom
              ) ||
              embodyRandomDoorCrowdStudentForThrow({
                username: rawThrowerName,
                lowerUser: tFrom,
                gender: resolveUserGender(rawThrowerName),
                showBubble: false,
              });
            if (
              throwerSt &&
              (p.targetRole === 'abbot' || tTo === '__teacher_abbot__')
            ) {
              launchPaperPlaneAtTeacher(throwerSt, false, {
                projectileKind: pKind,
              });
              break;
            }
            const targetSt =
              inClassNow.find(
                (st) =>
                  st.username.trim().toLowerCase() === tTo &&
                  st.id !== throwerSt?.id
              ) ||
              doorCrowdRef.current.find(
                (st) =>
                  st.username.trim().toLowerCase() === tTo &&
                  st.id !== throwerSt?.id
              );
            if (throwerSt && targetSt) {
              launchPaperPlaneAtStudent(throwerSt, targetSt, false, {
                projectileKind: pKind,
              });
            }
          }
          break;
        }
        case 'SYNC_BGM_ACTIVE_TRACK': {
          const nextTrackId = String(p?.activeBgmTrackId || '').trim();
          if (nextTrackId) {
            setConfig((prev) =>
              prev.activeBgmTrackId === nextTrackId
                ? prev
                : { ...prev, activeBgmTrackId: nextTrackId }
            );
          }
          break;
        }
        case 'TRIGGER_ROSE_HEART_BURST': {
          const bx = Number(p.x);
          const by = Number(p.y);
          if (Number.isFinite(bx) && Number.isFinite(by)) {
            spawnRoseHeartBurstAt(bx, by, false);
          }
          break;
        }
        case 'LEAVE_ALL':
          setPilgrims((prev) =>
            prev.map((st) => ({
              ...st,
              slotId: null,
              hasDeskCat: false,
              deskCatCount: 0,
              hasDeskTrophy: false,
              deskTrophyDropAt: 0,
              hasDeskPig: false,
              hasDeskSnack: false,
              hasPcGamingDesk: false,
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
          if (
            typeof p.awardedRoundSeq === 'number' &&
            p.awardedRoundSeq > 0
          ) {
            awardedTrophyRoundSetRef.current.add(p.awardedRoundSeq);
          }
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
            setCustomAssets((prev) => {
              const next = { ...prev, ...p.assets };
              void idbSet('classroom_custom_assets_v1', next);
              return next;
            });
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
        case 'SYNC_ROUND_END_TROPHIES': {
          if (Array.isArray(p.winners) && p.winners.length > 0) {
            roundEndWinnersRef.current = p.winners;
          }
          if (p.roundSeq) {
            roundEndTargetRoundSeqRef.current = Number(p.roundSeq) || 1;
          }
          setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
          triggerRoundEndMilkTeaRef.current(true);
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

            // Chống cắt ngang câu đang đọc giữa chừng ở Luồng 5 / Luồng 6 do tab khác (VD: tab tắt tiếng hoặc tab chạy giả lập nhanh hơn) gửi gói tự chuyển luồng sớm:
            // Nếu tab hiện tại đang BẬT tiếng và Cô Giáo vẫn đang đọc dở câu thuộc luồng hiện tại (activeFlowToken), bỏ qua gói tự chuyển luồng sớm để đọc trọn câu 100%!
            const isAutoPhaseAdvanceFromPeer =
              !p.force &&
              incoming.isRunning &&
              current.isRunning &&
              (incoming.phase !== current.phase || incRound !== curRound);
            const isActivelySpeakingCurrentFlowLocally =
              !soundEngine.isTabMuted() &&
              Boolean(current.activeFlowToken) &&
              !current.ttsFinishedForPhase &&
              soundEngine.hasPendingFlowToken(current.activeFlowToken);
            if (
              isAutoPhaseAdvanceFromPeer &&
              isActivelySpeakingCurrentFlowLocally
            ) {
              break;
            }

            const mergedQueue = mergeIncomingLiveSyncQueue(
              configRef.current.customQuizQuestions,
              p
            );
            if (mergedQueue) {
              configRef.current = {
                ...configRef.current,
                customQuizQuestions: mergedQueue,
              };
              setConfig((prevCfg) => ({
                ...prevCfg,
                customQuizQuestions: mergedQueue,
              }));
            }

            // Gộp danh sách winners của cả 2 trình duyệt nếu đang cùng vòng câu hỏi để không làm mất trạng thái trả lời đúng của học sinh tại trình duyệt hiện tại
            const isSameRound =
              incRound === curRound &&
              (incoming.questionIndex ?? 0) === (current.questionIndex ?? 0);
            const combinedRawWinners: ClassBoardQuizWinner[] = [];
            if (isSameRound && Array.isArray(current.winners)) {
              combinedRawWinners.push(...current.winners);
            }
            if (Array.isArray(incoming.winners)) {
              combinedRawWinners.push(...incoming.winners);
            }
            const reRankedSync = sortAndReRankQuizWinners(combinedRawWinners, {
              currentQuestion: incoming.currentQuestion || current.currentQuestion,
              getRankPoints: getQuizRankPoints,
              getPunishmentMultiplier: (wLower) => {
                const punishedMatch = pilgrimsRef.current.find(
                  (st) =>
                    st.username.trim().toLowerCase() === wLower &&
                    st.isPunishedInCurrentRound &&
                    st.punishmentMultiplier
                );
                return punishedMatch?.punishmentMultiplier || 1;
              },
            });
            const mergedWinners = reRankedSync.winners;
            const mergedClassWinners =
              mergedWinners.length > 0
                ? reRankedSync.classWinners
                : incoming.classWinners || [];
            const mergedOutsideWinners =
              mergedWinners.length > 0
                ? reRankedSync.outsideWinners
                : incoming.outsideWinners || [];
            const mergedWinnersMap = new Map<string, ClassBoardQuizWinner>();
            mergedWinners.forEach((w) => {
              if (w?.username) {
                mergedWinnersMap.set(w.username.trim().toLowerCase(), w);
              }
            });

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
                  qEntry.hasCommentedInRound = true;
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
                const earnedOrHadTrophySync =
                  Boolean(st.slotId) && Boolean(st.hasDeskTrophy || st.podiumRank);
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
                  hasDeskTrophy: earnedOrHadTrophySync,
                  deskTrophyDropAt: earnedOrHadTrophySync
                    ? st.deskTrophyDropAt || Date.now()
                    : 0,
                  podiumRank: undefined,
                  winnerMilkTeaScale: undefined,
                  winnerTrophyScale: undefined,
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
                roundEndTargetRoundSeqRef.current = incoming.roundSeq || 1;
                if (
                  !awardedTrophyRoundSetRef.current.has(incoming.roundSeq || 1)
                ) {
                  roundEndMilkTeaTriggeredRef.current = false;
                }
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
                    hasDeskTrophy: Boolean(st.slotId),
                    deskTrophyDropAt: st.deskTrophyDropAt || Date.now(),
                    winnerMilkTeaScale: undefined,
                    winnerTrophyScale: undefined,
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
        case 'SYNC_ZOMBIE_EVENT_STATE': {
          if (p.state) {
            const incoming = p.state as ZombieEventRuntimeState;
            const current = zombieEventStateRef.current;
            const incOrder = getZombiePhaseOrder(incoming.phase);
            const curOrder = getZombiePhaseOrder(current.phase);

            // Chặn gói đồng bộ trễ (luồng cũ hơn) khi sự kiện đang chạy
            if (
              !p.force &&
              incoming.isActive &&
              current.isActive &&
              incOrder < curOrder
            ) {
              break;
            }

            // Chống cắt ngang câu thoại Zombie đang đọc thực tế trên tab phát âm thanh (Live)
            const isAutoPhaseAdvanceFromPeer =
              !p.force &&
              incoming.isActive &&
              current.isActive &&
              incoming.phase !== current.phase;
            const isActivelySpeakingZombieFlowLocally =
              !soundEngine.isTabMuted() &&
              Boolean(current.activeFlowToken) &&
              !current.ttsFinishedForPhase &&
              soundEngine.hasPendingFlowToken(current.activeFlowToken);
            if (
              isAutoPhaseAdvanceFromPeer &&
              isActivelySpeakingZombieFlowLocally
            ) {
              break;
            }

            const phaseChanged =
              Boolean(p.force) ||
              incoming.phase !== current.phase ||
              incoming.isActive !== current.isActive;

            if (phaseChanged) {
              const cfgSync = configRef.current;
              const spawnPosSync = cfgSync.zombieSpawnPos || { x: 42, y: 520 };
              const standPosSync = cfgSync.zombieStandPos || { x: 270, y: 486 };
              const teacherEvPosSync = cfgSync.zombieTeacherPos || {
                x: 392,
                y: 444,
              };
              const supervisorEvPosSync = cfgSync.zombieSupervisorPos || {
                x: 148,
                y: 498,
              };
              const syncedEnt = p.entity as ZombieEntityState | undefined;

              if (
                !incoming.isActive ||
                incoming.phase === 'idle' ||
                incoming.phase === 'queued'
              ) {
                const hiddenSyncZ: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: false,
                  isWalking: false,
                  isDying: false,
                };
                zombieEntityRef.current = hiddenSyncZ;
                setZombieEntity(hiddenSyncZ);
                if (!incoming.isActive && current.isActive) {
                  setZombieProjectiles([]);
                  setZombieSpikyDamages([]);
                  setFlyingMilkTeas([]);
                  setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
                }
              } else if (incoming.phase === 'z_flow_1_intro') {
                if (classBoardStateRef.current.isRunning) {
                  const pausedB: ClassBoardRuntimeState = {
                    ...classBoardStateRef.current,
                    isRunning: false,
                  };
                  classBoardStateRef.current = pausedB;
                  setClassBoardState(pausedB);
                }
                setMonks((prevMonks) => {
                  const nextMonks = prevMonks.map((m) => {
                    if (m.role === 'abbot') {
                      return {
                        ...m,
                        name: 'Cô Thảo',
                        x: teacherEvPosSync.x,
                        y: teacherEvPosSync.y,
                        targetX: teacherEvPosSync.x,
                        targetY: teacherEvPosSync.y,
                        moveAxis: 'idle' as const,
                        facingLeft: true,
                        pauseTimer: 999,
                      };
                    }
                    if (m.role === 'senior_novice') {
                      return {
                        ...m,
                        name: 'Thầy Cá',
                        x: supervisorEvPosSync.x,
                        y: supervisorEvPosSync.y,
                        targetX: supervisorEvPosSync.x,
                        targetY: supervisorEvPosSync.y,
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
                const introZ: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: false,
                  x: spawnPosSync.x,
                  y: spawnPosSync.y,
                  targetX: standPosSync.x,
                  targetY: standPosSync.y,
                  isWalking: false,
                  isDying: false,
                  dyingProgress: 0,
                };
                zombieEntityRef.current = introZ;
                setZombieEntity(introZ);
                setZombieProjectiles([]);
                setZombieSpikyDamages([]);
                setFlyingMilkTeas([]);
                setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
              } else if (incoming.phase === 'z_flow_2_spawn') {
                const lockCam2Ms = Math.max(
                  500,
                  Math.round((cfgSync.zombieFlow2LockCameraSec ?? 3.0) * 1000)
                );
                const maxDur2Ms =
                  incoming.totalDurationMs ||
                  Math.max(
                    lockCam2Ms + 1000,
                    Math.round((cfgSync.zombieFlow2MaxDurationSec ?? 6.5) * 1000)
                  );
                const spawnZSync: ZombieEntityState = syncedEnt
                  ? { ...syncedEnt, visible: true }
                  : {
                      visible: true,
                      x: spawnPosSync.x,
                      y: spawnPosSync.y,
                      targetX: standPosSync.x,
                      targetY: standPosSync.y,
                      isWalking: false,
                      facing:
                        standPosSync.x >= spawnPosSync.x ? 'right' : 'left',
                      recoilOffsetX: 0,
                      recoilOffsetY: 0,
                      isDying: false,
                      dyingProgress: 0,
                      animTime: 0,
                      hitFlashUntil: 0,
                    };
                zombieEntityRef.current = spawnZSync;
                setZombieEntity(spawnZSync);
                if (!soundEngine.isRemoteSlaveMode()) {
                  soundEngine.playZombieGrowlSfx(
                    cfgSync.ttsVolume || 1,
                    cfgSync.zombieGrowlMp3Url,
                    true
                  );
                }
                setCameraFocus({
                  pilgrimId: null,
                  focusRole: 'zombie',
                  customZoom: cfgSync.cameraZoomScale || 2.35,
                  reason: 'special_gift',
                  startedAt: Date.now(),
                  until: Date.now() + maxDur2Ms,
                  lockedUntil: Date.now() + lockCam2Ms,
                });
              } else if (incoming.phase === 'z_flow_3_teacher') {
                const standZSync: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: true,
                  x: standPosSync.x,
                  y: standPosSync.y,
                  targetX: standPosSync.x,
                  targetY: standPosSync.y,
                  isWalking: false,
                  facing: 'right',
                  isDying: false,
                };
                zombieEntityRef.current = standZSync;
                setZombieEntity(standZSync);
                const teacherLine = (
                  cfgSync.zombieFlow3TeacherDialog || 'Ối giời ơi ! Chu mi a !'
                ).replace(/\[Cấp\]/gi, String(incoming.level || 1));
                const minDur3Ms = Math.max(
                  500,
                  Math.round((cfgSync.zombieFlow3MinDurationSec ?? 2.0) * 1000)
                );
                const bubbleUntil3 =
                  Date.now() + Math.max(5500, minDur3Ms + 2500);
                setMonks((prevM) => {
                  const nextM = prevM.map((m) =>
                    m.role === 'abbot'
                      ? {
                          ...m,
                          chatText: teacherLine,
                          chatBubbleUntil: bubbleUntil3,
                        }
                      : m
                  );
                  monksRef.current = nextM;
                  return nextM;
                });
                setCameraFocus({
                  pilgrimId: null,
                  focusRole: 'abbot',
                  customZoom: cfgSync.cameraZoomScale || 2.5,
                  reason: 'special_gift',
                  startedAt: Date.now(),
                  until: Date.now() + Math.max(9000, minDur3Ms + 4000),
                  lockedUntil: Date.now() + Math.max(4500, minDur3Ms + 1000),
                });
              } else if (incoming.phase === 'z_flow_4_supervisor') {
                const standZSync4: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: true,
                  x: standPosSync.x,
                  y: standPosSync.y,
                  targetX: standPosSync.x,
                  targetY: standPosSync.y,
                  isWalking: false,
                  facing: 'right',
                  isDying: false,
                };
                zombieEntityRef.current = standZSync4;
                setZombieEntity(standZSync4);
                const supervisorLine = (
                  cfgSync.zombieFlow4SupervisorDialog ||
                  'Các em hãy thả tim liên tục để đẩy lùi zombie !'
                ).replace(/\[Cấp\]/gi, String(incoming.level || 1));
                const minDur4Ms = Math.max(
                  500,
                  Math.round((cfgSync.zombieFlow4MinDurationSec ?? 2.2) * 1000)
                );
                const bubbleUntil4 =
                  Date.now() + Math.max(6500, minDur4Ms + 2500);
                setMonks((prevM) => {
                  const nextM = prevM.map((m) => {
                    if (m.role === 'senior_novice') {
                      return {
                        ...m,
                        chatText: supervisorLine,
                        chatBubbleUntil: bubbleUntil4,
                      };
                    }
                    if (m.role === 'abbot') {
                      return {
                        ...m,
                        chatText: undefined,
                        chatBubbleUntil: undefined,
                      };
                    }
                    return m;
                  });
                  monksRef.current = nextM;
                  return nextM;
                });
                setCameraFocus({
                  pilgrimId: null,
                  focusRole: 'senior_novice',
                  customZoom: cfgSync.cameraZoomScale || 2.4,
                  reason: 'special_gift',
                  startedAt: Date.now(),
                  until: Date.now() + Math.max(10000, minDur4Ms + 4000),
                  lockedUntil: Date.now() + Math.max(5000, minDur4Ms + 1000),
                });
              } else if (incoming.phase === 'z_flow_5_combat') {
                const combatZSync: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: true,
                  x: standPosSync.x,
                  y: standPosSync.y,
                  targetX: standPosSync.x,
                  targetY: standPosSync.y,
                  isWalking: false,
                  facing: 'right',
                  isDying: false,
                };
                zombieEntityRef.current = combatZSync;
                setZombieEntity(combatZSync);
                setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
              } else if (incoming.phase === 'z_flow_5b_dying') {
                const dyingDurMsSync =
                  incoming.totalDurationMs ||
                  Math.max(
                    1000,
                    Math.round(
                      (cfgSync.zombieFlow5bDyingDurationSec ?? 3.2) * 1000
                    )
                  );
                const dyingZSync: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: true,
                  x: zombieEntityRef.current.visible
                    ? zombieEntityRef.current.x
                    : standPosSync.x,
                  y: zombieEntityRef.current.visible
                    ? zombieEntityRef.current.y
                    : standPosSync.y,
                  isWalking: false,
                  isDying: true,
                  dyingProgress: Math.max(
                    0.02,
                    syncedEnt?.dyingProgress ??
                      zombieEntityRef.current.dyingProgress ??
                      0.02
                  ),
                  recoilOffsetX: 0,
                  recoilOffsetY: 0,
                };
                zombieEntityRef.current = dyingZSync;
                setZombieEntity(dyingZSync);
                if (!soundEngine.isRemoteSlaveMode()) {
                  soundEngine.playZombieGrowlSfx(
                    (cfgSync.ttsVolume || 1) * 0.9,
                    cfgSync.zombieGrowlMp3Url,
                    true
                  );
                }
                soundEngine.setZombieEventActive(false, cfgSync);
                setCameraFocus({
                  pilgrimId: null,
                  focusRole: 'zombie',
                  customZoom: cfgSync.cameraZoomScale || 2.35,
                  reason: 'special_gift',
                  startedAt: Date.now(),
                  until: Date.now() + dyingDurMsSync + 1300,
                  lockedUntil: Date.now() + dyingDurMsSync + 200,
                });
              } else if (incoming.phase === 'z_flow_6_celebration') {
                const hiddenCelebZ: ZombieEntityState = {
                  ...(syncedEnt || zombieEntityRef.current),
                  visible: false,
                  isWalking: false,
                  isDying: false,
                  dyingProgress: 1,
                };
                zombieEntityRef.current = hiddenCelebZ;
                setZombieEntity(hiddenCelebZ);
                setCameraFocus({ pilgrimId: null, focusRole: null, until: 0 });
                const abbotNpc =
                  monksRef.current.find((m) => m.role === 'abbot') ||
                  monksRef.current[0];
                const startTeaX = abbotNpc ? abbotNpc.x : 270;
                const startTeaY = abbotNpc ? abbotNpc.y - 24 : 430;
                const seatedTargets = pilgrimsRef.current.filter(
                  (st) =>
                    Boolean(st.slotId) &&
                    st.state !== 'leave_side_to_aisle' &&
                    st.state !== 'leave_down_exit'
                );
                const allTeaTargets = [...seatedTargets, ...doorCrowdRef.current];
                const nowTeaMs = Date.now();
                setFlyingMilkTeas(
                  allTeaTargets.map((st, idx) => ({
                    id: `mtea_sync_${nowTeaMs}_${idx}_${st.id}`,
                    startX: startTeaX,
                    startY: startTeaY,
                    targetX: st.x,
                    targetY: st.y - 18,
                    createdAt: nowTeaMs + idx * 45,
                    durationMs: 1250 + (idx % 5) * 110,
                  }))
                );
              }
            }

            const mergedZombieState: ZombieEventRuntimeState = phaseChanged
              ? incoming
              : {
                  ...current,
                  ...incoming,
                  timeLeftMs: current.timeLeftMs,
                  elapsedPhaseMs: current.elapsedPhaseMs,
                  activeFlowToken:
                    current.activeFlowToken || incoming.activeFlowToken,
                  ttsFinishedForPhase: Boolean(
                    current.ttsFinishedForPhase || incoming.ttsFinishedForPhase
                  ),
                };
            zombieEventStateRef.current = mergedZombieState;
            setZombieEventState(mergedZombieState);
          }
          break;
        }
        case 'TRIGGER_ZOMBIE_EVENT': {
          const isPureLiveTab =
            typeof window !== 'undefined' &&
            (new URLSearchParams(window.location.search).get('view') === 'live' ||
              new URLSearchParams(window.location.search).get('mode') === 'live' ||
              new URLSearchParams(window.location.search).get('obs') === '1');
          const peersNow = peerCountsRef.current;
          const isPassiveZombieTab =
            !isPureLiveTab &&
            (peersNow.obsPeers > 0 ||
              (peersNow.totalPeers > 1 && soundEngine.isTabMuted()));
          if (!isPassiveZombieTab) {
            startZombieEventFlowNow(Boolean(p.wasRunningLesson), false, true);
          }
          break;
        }
        case 'REQUEST_FULL_SYNC': {
          const isPureLiveTab =
            typeof window !== 'undefined' &&
            (new URLSearchParams(window.location.search).get('view') === 'live' ||
              new URLSearchParams(window.location.search).get('mode') === 'live' ||
              new URLSearchParams(window.location.search).get('obs') === '1');
          if (!isPureLiveTab) {
            const lightweightPatch = stripHeavyQuizDataForLocalStorage(
              configRef.current
            );
            syncService.sendCommand('UPDATE_CONFIG', {
              patch: lightweightPatch,
            });
            syncService.sendCommand('SYNC_CLASS_BOARD_STATE', {
              state: classBoardStateRef.current,
            });
            if (
              zombieEventStateRef.current.isActive ||
              zombieEventStateRef.current.isQueued
            ) {
              syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
                state: zombieEventStateRef.current,
                entity: zombieEntityRef.current,
                force: true,
              });
            }
          }
          break;
        }
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
        case 'SYNC_STUDENT_EXP': {
          let changedAny = false;
          if (p.studentExpMap && typeof p.studentExpMap === 'object') {
            if (p.replaceAll) {
              studentExpMapRef.current.clear();
              changedAny = true;
            }
            for (const [k, v] of Object.entries(p.studentExpMap)) {
              const cleanKey = String(k || '').trim().toLowerCase();
              const expVal = Math.floor(Number(v) || 0);
              if (cleanKey && expVal > 0) {
                const prev = studentExpMapRef.current.get(cleanKey) || 0;
                const nextVal = p.replaceAll ? expVal : Math.max(prev, expVal);
                if (nextVal !== prev) {
                  studentExpMapRef.current.set(cleanKey, nextVal);
                  changedAny = true;
                }
              }
            }
          }
          if (p.studentTrophyMap && typeof p.studentTrophyMap === 'object') {
            if (p.replaceAll) {
              studentTrophyMapRef.current.clear();
              changedAny = true;
            }
            for (const [k, v] of Object.entries(p.studentTrophyMap)) {
              const cleanKey = String(k || '').trim().toLowerCase();
              const trophyVal = Math.floor(Number(v) || 0);
              if (cleanKey && trophyVal > 0) {
                const prev = studentTrophyMapRef.current.get(cleanKey) || 0;
                const nextVal = p.replaceAll
                  ? trophyVal
                  : Math.max(prev, trophyVal);
                if (nextVal !== prev) {
                  studentTrophyMapRef.current.set(cleanKey, nextVal);
                  changedAny = true;
                }
              }
            }
          }
          if (changedAny) {
            applyExpMapToActiveStudents();
          }
          break;
        }
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
            preferSeatedIfBlank: Boolean(p.preferSeatedIfBlank),
            wasBlankTestTarget: Boolean(p.wasBlankTestTarget),
            broadcastSync: false,
          });
          break;
        case 'REMINDER_ALERT_SYNC': {
          const firedAt = Number(p.firedAt || Date.now());
          if (firedAt > lastReminderAlertAtRef.current) {
            lastReminderAlertAtRef.current = firedAt;
          }
          if (cancelPendingObsReminderTimerRef.current) {
            cancelPendingObsReminderTimerRef.current();
            cancelPendingObsReminderTimerRef.current = null;
          }
          break;
        }
        default:
          break;
      }
    });

    return () => {
      unsubStatus();
      unsubPeers();
      unsubDisconnectAlert();
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
    requestSilentReminderAlert,
    spawnOrPromotePilgrim,
    startZombieEventFlowNow,
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

      const safeDeskScale = Math.max(0.5, Math.min(3.0, config.deskScale ?? 1));
      desks.forEach((desk) => {
        const leftX = Math.round(desk.centerX - offset);
        const rightX = Math.round(desk.centerX + offset);
        const clearHalfW = Math.round((desk.width * safeDeskScale) / 2) + 12;
        const nextLeftAisle = Math.max(20, Math.round(desk.centerX - clearHalfW));
        const nextRightAisle = Math.min(520, Math.round(desk.centerX + clearHalfW));
        if (
          updated[desk.leftIndex].x !== leftX ||
          updated[desk.leftIndex].aisleX !== nextLeftAisle
        ) {
          hasChange = true;
          updated[desk.leftIndex] = {
            ...updated[desk.leftIndex],
            x: leftX,
            side: leftX < 270 ? 'left' : 'right',
            deskCenterX: desk.centerX,
            deskCenterY: desk.centerY,
            aisleX: nextLeftAisle,
          };
        }
        if (
          desk.rightSlot &&
          (updated[desk.rightIndex].x !== rightX ||
            updated[desk.rightIndex].aisleX !== nextRightAisle)
        ) {
          hasChange = true;
          updated[desk.rightIndex] = {
            ...updated[desk.rightIndex],
            x: rightX,
            side: rightX < 270 ? 'left' : 'right',
            deskCenterX: desk.centerX,
            deskCenterY: desk.centerY,
            aisleX: nextRightAisle,
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
    if (!quizIdbHydratedRef.current) {
      if (patch.quizDecks !== undefined) {
        userModifiedQuizDecksBeforeHydrateRef.current = true;
      }
      if (patch.customQuizQuestions !== undefined) {
        userModifiedQuizQueueBeforeHydrateRef.current = true;
      }
    }
    if (patch.quizDecks !== undefined && Array.isArray(patch.quizDecks)) {
      void idbSet(QUIZ_DECKS_IDB_KEY, {
        schemaVersion:
          patch.quizDeckSchemaVersion ||
          configRef.current.quizDeckSchemaVersion ||
          QUIZ_DECK_SCHEMA_VERSION,
        activeQuizDeckId:
          patch.activeQuizDeckId ?? configRef.current.activeQuizDeckId,
        decks: patch.quizDecks,
      });
    }
    if (
      patch.customQuizQuestions !== undefined &&
      Array.isArray(patch.customQuizQuestions)
    ) {
      void idbSet(QUIZ_QUEUE_IDB_KEY, patch.customQuizQuestions);
    }
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      configRef.current = next;
      const syncPatch: Partial<GameConfig> = { ...patch };
      if (
        Array.isArray(syncPatch.customQuizQuestions) &&
        syncPatch.customQuizQuestions.length > 50
      ) {
        syncPatch.customQuizQuestions = syncPatch.customQuizQuestions.slice(
          0,
          50
        );
      }
      syncService.sendCommand('UPDATE_CONFIG', { patch: syncPatch });
      return next;
    });

    if (patch.zombieEventEnabled === false) {
      const nextDisabledEntity: ZombieEntityState = {
        ...zombieEntityRef.current,
        visible: false,
        isWalking: false,
        isDying: false,
      };
      zombieEntityRef.current = nextDisabledEntity;
      setZombieEntity(nextDisabledEntity);

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
        syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
          state: nextZ,
          entity: nextDisabledEntity,
          force: true,
        });
        return nextZ;
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
        const askSpeech = formatQuizQuestionTtsSpeech(
          cfg.lessonQuestionTtsTemplate,
          safeIdx + 1,
          curQuiz
        );
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
    const quizList = build15MinuteTieredRoundQuestions(
      cfg,
      undefined,
      recentAskedWordsRef.current
    );
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
          winnerTrophyScale: undefined,
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
      'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 10 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.';
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
        ...buildLiveSyncQueuePayload(quizList),
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
      prev.currentQuestion,
      false,
      recentAskedWordsRef.current
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
        winnerTrophyScale: undefined,
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
        ...buildLiveSyncQueuePayload(nextQuizList),
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

      const simOrderMeta: TikTokOrderMeta = {
        orderTimestampMs: Date.now(),
        arrivalSeq: ++quizAnswerArrivalSeqRef.current,
      };
      spawnOrPromotePilgrim({
        username: randomUser,
        prayer: comment,
        isVip: false,
        coins: 0,
        isBot: false,
        isSimulatedTest: true,
        orderMeta: simOrderMeta,
      });
      syncService.sendCommand('SPAWN_PILGRIM', {
        username: randomUser,
        prayer: comment,
        isVip: false,
        coins: 0,
        isBot: false,
        orderMeta: simOrderMeta,
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
              ? {
                  ...p,
                  slotId: null,
                  hasDeskCat: false,
                  deskCatCount: 0,
                  hasDeskTrophy: false,
                  deskTrophyDropAt: 0,
                  hasDeskPig: false,
                  hasDeskSnack: false,
                  hasPcGamingDesk: false,
                  state: 'leave_side_to_aisle',
                  stateTimer: 0,
                }
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
              ? {
                  ...p,
                  slotId: null,
                  hasDeskCat: false,
                  deskCatCount: 0,
                  hasDeskTrophy: false,
                  deskTrophyDropAt: 0,
                  hasDeskPig: false,
                  hasDeskSnack: false,
                  hasPcGamingDesk: false,
                  state: 'leave_side_to_aisle',
                  stateTimer: 0,
                }
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
          ? {
              ...p,
              slotId: null,
              hasDeskCat: false,
              deskCatCount: 0,
              hasDeskTrophy: false,
              deskTrophyDropAt: 0,
              hasDeskPig: false,
              hasDeskSnack: false,
              hasPcGamingDesk: false,
              state: 'leave_side_to_aisle',
              stateTimer: 0,
            }
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
        const safeDeskScale = Math.max(
          0.5,
          Math.min(3.0, configRef.current.deskScale ?? 1)
        );
        const clearHalfW = Math.round((desk.width * safeDeskScale) / 2) + 12;
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
              aisleX: Math.max(20, Math.round(nextCenterX - clearHalfW)),
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
              aisleX: Math.min(520, Math.round(nextCenterX + clearHalfW)),
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
        const safeDeskScale = Math.max(
          0.5,
          Math.min(3.0, configRef.current.deskScale ?? 1)
        );

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
          const clearHalfW = Math.round((desk.width * safeDeskScale) / 2) + 12;
          const leftX = Math.round(nextCenterX - offset);
          const rightX = Math.round(nextCenterX + offset);

          updatedSlots[desk.leftIndex] = {
            ...updatedSlots[desk.leftIndex],
            x: leftX,
            y: nextCenterY,
            side: leftX < 270 ? 'left' : 'right',
            deskCenterX: nextCenterX,
            deskCenterY: nextCenterY,
            aisleX: Math.max(20, Math.round(nextCenterX - clearHalfW)),
          };

          if (desk.rightSlot) {
            updatedSlots[desk.rightIndex] = {
              ...updatedSlots[desk.rightIndex],
              x: rightX,
              y: nextCenterY,
              side: rightX < 270 ? 'left' : 'right',
              deskCenterX: nextCenterX,
              deskCenterY: nextCenterY,
              aisleX: Math.min(520, Math.round(nextCenterX + clearHalfW)),
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
        hasDeskCat: false,
        deskCatCount: 0,
        hasDeskTrophy: false,
        deskTrophyDropAt: 0,
        hasDeskPig: false,
        hasDeskSnack: false,
        hasPcGamingDesk: false,
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
    const testText =
      'Chào mừng các em học sinh đến với lớp 12A1, chúc cả lớp học tập tốt và đạt nhiều Hoa Điểm 10';
    soundEngine.enqueueTTS(
      testText,
      true,
      { ...configRef.current, ttsEnabled: true },
      { reason: 'manual' }
    );
    if (peerCountsRef.current.obsPeers > 0) {
      syncService.sendCommand('HOST_LIVE_TTS', {
        text: testText,
        interrupt: false,
        speakerRole: 'abbot',
      });
    }
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
      const pitch = options?.pitch ?? cfg.teacherLivePitch ?? 0.84;
      const rawEngine = options?.engine ?? cfg.teacherLiveEngine ?? 'google_stream';
      const engine: 'web_speech' | 'google_stream' =
        rawEngine === 'web_speech' ? 'web_speech' : 'google_stream';
      const voice = options?.voice ?? cfg.teacherLiveVoice ?? 'google-vi-warm';
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
      studentTrophyMap: serializeStudentExpMap(studentTrophyMapRef.current),
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
        if (Array.isArray(parsed.dailyRecords)) {
          const slicedRecords = parsed.dailyRecords.slice(0, 5);
          dailyRecordsRef.current = slicedRecords;
          setDailyRecords(slicedRecords);
        }
        let updatedExpOrTrophies = false;
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
          updatedExpOrTrophies = true;
        }
        if (
          parsed.studentTrophyMap &&
          typeof parsed.studentTrophyMap === 'object'
        ) {
          const nextTrophyMap = new Map<string, number>();
          for (const [k, v] of Object.entries(parsed.studentTrophyMap)) {
            const cleanKey = String(k || '').trim().toLowerCase();
            const trophyVal = Math.floor(Number(v) || 0);
            if (cleanKey && trophyVal > 0) {
              nextTrophyMap.set(cleanKey, trophyVal);
            }
          }
          studentTrophyMapRef.current = nextTrophyMap;
          updatedExpOrTrophies = true;
        }
        if (updatedExpOrTrophies) {
          applyExpMapToActiveStudents();
          flushStudentExpStorage(true, true);
        }
        return {
          ok: true,
          message: `Đã nạp cấu hình lớp học, EXP (${studentExpMapRef.current.size} học sinh) & Cúp Vàng (${studentTrophyMapRef.current.size} học sinh) thành công!`,
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
    pushToast('🔄 Đã reset bảng Kỷ lục cúp vàng trong ngày về 0!', false);
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
    const patchToSend = stripHeavyQuizDataForLocalStorage(configRef.current);
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
      syncService.sendCommand('SPAWN_PILGRIM', {
        username: cleanUser,
        prayer: cleanComment,
        isVip: false,
        coins: 0,
        isBot: true,
        avatarUrl,
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
    syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
      state: stoppedZ,
      entity: hiddenZ,
      force: true,
    });

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

    if (!soundEngine.isRemoteSlaveMode()) {
      soundEngine.playZombieGrowlSfx(
        (cfgNow.ttsVolume || 1) * 0.9,
        cfgNow.zombieGrowlMp3Url,
        true
      );
    }

    setCameraFocus({
      pilgrimId: null,
      focusRole: 'zombie',
      customZoom: cfgNow.cameraZoomScale || 2.35,
      reason: 'special_gift',
      startedAt: Date.now(),
      until: Date.now() + dyingDurMs + 1300,
      lockedUntil: Date.now() + dyingDurMs + 200,
    });

    const dyingZSnapshot: ZombieEntityState = {
      ...curZ,
      visible: true,
      x: zX,
      y: zY,
      isWalking: false,
      isDying: true,
      dyingProgress: 0.02,
      recoilOffsetX: 0,
      recoilOffsetY: 0,
      hitFlashUntil: Date.now() + 260,
    };
    zombieEntityRef.current = dyingZSnapshot;
    setZombieEntity(dyingZSnapshot);

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
    syncService.sendCommand('SYNC_ZOMBIE_EVENT_STATE', {
      state: dyingState,
      entity: dyingZSnapshot,
      force: true,
    });
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
    paperPlanes,
    paperPlaneHitBubbles,
    roseHeartBursts,
    handleTestPaperPlaneThrow: () => {
      const inClassList = pilgrimsRef.current.filter(
        (p) =>
          (Boolean(p.slotId) ||
            p.state === 'stand_punishment' ||
            p.state === 'walk_to_punishment_spot') &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const doorList = doorCrowdRef.current;
      const allThrowers = [...inClassList, ...doorList];
      if (allThrowers.length < 1 || inClassList.length + doorList.length < 2) {
        pushToast(
          '⚠️ Cần có ít nhất 2 học sinh (trong lớp hoặc hàng chờ) để test ném máy bay giấy!',
          false
        );
        return;
      }
      const thrower =
        allThrowers[Math.floor(Math.random() * allThrowers.length)];
      const targetPool =
        inClassList.filter((p) => p.id !== thrower.id).length > 0
          ? inClassList.filter((p) => p.id !== thrower.id)
          : allThrowers.filter((p) => p.id !== thrower.id);
      const target = targetPool[Math.floor(Math.random() * targetPool.length)];
      launchPaperPlaneAtStudent(thrower, target, true);
      pushToast(
        `✈️ ${thrower.username} ném máy bay giấy tới ${target.username}! (Tặng Hoa Hồng trong 10s sau khi trúng sẽ gửi bó hoa cho bạn)`,
        false
      );
    },
    handleTestRoseBouquetThrow: () => {
      const inClassList = pilgrimsRef.current.filter(
        (p) =>
          Boolean(p.slotId) &&
          p.state !== 'leave_side_to_aisle' &&
          p.state !== 'leave_down_exit'
      );
      const seatedList = inClassList.filter((p) => p.state === 'pray_seated');
      if (seatedList.length < 1 || inClassList.length < 2) {
        const fallbackX = 270;
        const fallbackY = 640;
        spawnRoseHeartBurstAt(fallbackX, fallbackY, true);
        pushToast(
          '❤️ Đã test hiệu ứng nổ tim đỏ giữa lớp! (Thêm 2 học sinh ngồi bàn để test đường bay bó hoa)',
          false
        );
        return;
      }
      const thrower = seatedList[Math.floor(Math.random() * seatedList.length)];
      const others = inClassList.filter((p) => p.id !== thrower.id);
      const target = others[Math.floor(Math.random() * others.length)];
      soundEngine.playGiftEventSound('rose', configRef.current, true);
      launchPaperPlaneAtStudent(thrower, target, true, {
        projectileKind: 'rose_bouquet',
      });
      pushToast(
        `🌹 ${thrower.username} ném bó hoa hồng cho ${target.username}! ❤️`,
        false
      );
    },
    handleTestRoseHeartBurst: () => {
      const seatedList = pilgrimsRef.current.filter(
        (p) => Boolean(p.slotId) && p.state === 'pray_seated'
      );
      if (seatedList.length > 0) {
        const target =
          seatedList[Math.floor(Math.random() * seatedList.length)];
        const headPts = computeStudentHeadAndHandCoords(
          target,
          vipSlotsRef.current,
          normalSlotsRef.current,
          configRef.current
        );
        spawnRoseHeartBurstAt(headPts.headX, headPts.headY, true);
        pushToast(
          `❤️ Test nổ tim đỏ tại vị trí bạn ${target.username}!`,
          false
        );
      } else {
        spawnRoseHeartBurstAt(270, 640, true);
        pushToast('❤️ Test nổ tim đỏ trên sân khấu!', false);
      }
    },
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
