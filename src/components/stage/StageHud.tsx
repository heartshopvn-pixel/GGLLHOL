import React, { useEffect, useState } from 'react';
import {
  BellRing,
  BookOpen,
  Clock,
  Gift,
  ListOrdered,
  Move,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import {
  CameraFocusState,
  ClassBoardQuizWinner,
  ClassBoardRuntimeState,
  CustomAssetsConfig,
  DailyRecordEntry,
  DonorEntry,
  FloatingToastItem,
  GameConfig,
  GuideTaskItem,
  HudBoxCycleConfig,
  HudLayoutConfig,
  OfferingGiftType,
  PilgrimData,
  QueuedPilgrimRequest,
  WaitingQueueItem,
  ZombieEventRuntimeState,
} from '../../types/game';
import { DEFAULT_GUIDE_ITEMS, ENGLISH_QUIZ_QUESTIONS } from '../../config/constants';
import { Flower10BadgeIcon, SchoolGiftArt } from './SchoolGiftArt';

export type HudBoxKey =
  | 'templeSign'
  | 'classBoardBox'
  | 'lotusLeaderboardBox'
  | 'dailyRecordBox'
  | 'guideBox'
  | 'toastBox'
  | 'grandEventBox'
  | 'pilgrimCountBox'
  | 'waitingQueueBox'
  | 'noticeBoardBox'
  | 'note1Box';

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface StageHudProps {
  config?: GameConfig;
  hudLayout: HudLayoutConfig;
  classBoardState?: ClassBoardRuntimeState;
  zombieEventState?: ZombieEventRuntimeState;
  cameraFocus?: CameraFocusState;
  pilgrims?: PilgrimData[];
  waitingQueue?: Array<QueuedPilgrimRequest | WaitingQueueItem>;
  queueCount?: number;
  customAssets: CustomAssetsConfig;
  lotusDonors?: DonorEntry[];
  dailyRecords?: DailyRecordEntry[];
  onResetDailyRecords?: () => void;
  floatingToasts: FloatingToastItem[];
  grandEventProgress: number;
  grandEventTarget: number;
  isGrandEventActive: boolean;
  eventBarFlashKey?: number;
  currentPilgrimCount: number;
  totalSeatCapacity: number;
  onStartDragHudBox: (
    boxKey: HudBoxKey,
    e: React.MouseEvent | React.TouchEvent
  ) => void;
  onStartResizeHudBox: (
    boxKey: HudBoxKey,
    corner: ResizeCorner,
    e: React.MouseEvent | React.TouchEvent
  ) => void;
}

interface CornerHandlesProps {
  boxKey: HudBoxKey;
  onStartResizeHudBox: (
    boxKey: HudBoxKey,
    corner: ResizeCorner,
    e: React.MouseEvent | React.TouchEvent
  ) => void;
}

const CornerResizeHandles: React.FC<CornerHandlesProps> = ({
  boxKey,
  onStartResizeHudBox,
}) => {
  const handleDown =
    (corner: ResizeCorner) => (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      onStartResizeHudBox(boxKey, corner, e);
    };

  return (
    <>
      <span
        onMouseDown={handleDown('nw')}
        onTouchStart={handleDown('nw')}
        title="Kéo góc để chỉnh kích thước bảng"
        className="pointer-events-auto absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-sm bg-emerald-400 border-2 border-stone-950 shadow cursor-nwse-resize z-50 hover:scale-125 transition-transform"
      />
      <span
        onMouseDown={handleDown('ne')}
        onTouchStart={handleDown('ne')}
        title="Kéo góc để chỉnh kích thước bảng"
        className="pointer-events-auto absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-sm bg-emerald-400 border-2 border-stone-950 shadow cursor-nesw-resize z-50 hover:scale-125 transition-transform"
      />
      <span
        onMouseDown={handleDown('sw')}
        onTouchStart={handleDown('sw')}
        title="Kéo góc để chỉnh kích thước bảng"
        className="pointer-events-auto absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-sm bg-emerald-400 border-2 border-stone-950 shadow cursor-nesw-resize z-50 hover:scale-125 transition-transform"
      />
      <span
        onMouseDown={handleDown('se')}
        onTouchStart={handleDown('se')}
        title="Kéo góc để chỉnh kích thước bảng"
        className="pointer-events-auto absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-sm bg-emerald-400 border-2 border-stone-950 shadow cursor-nwse-resize z-50 hover:scale-125 transition-transform"
      />
    </>
  );
};

function clampOpacity(val: number | undefined, fallback: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.max(0, Math.min(1, val));
}

function buildBoxSurfaceStyle(
  op: number,
  borderRgb = '251, 191, 36',
  borderMaxAlpha = 0.65,
  bgRgb = '15, 23, 42'
): React.CSSProperties {
  if (op <= 0.005) {
    return {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      boxShadow: 'none',
      backdropFilter: 'none',
      textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)',
    };
  }
  const bAlpha = (borderMaxAlpha * op).toFixed(2);
  const sAlpha = (0.55 * op).toFixed(2);
  return {
    backgroundColor: `rgba(${bgRgb}, ${op.toFixed(2)})`,
    borderColor: `rgba(${borderRgb}, ${bAlpha})`,
    boxShadow: `0 10px 25px -5px rgba(0, 0, 0, ${sAlpha})`,
    backdropFilter: op >= 0.15 ? `blur(${Math.round(op * 8)}px)` : 'none',
    textShadow: op < 0.45 ? '0 1px 3px rgba(0,0,0,0.95)' : undefined,
  };
}

function getGuideTaskColorClasses(item: GuideTaskItem): {
  borderRgb: string;
  labelClass: string;
  descClass: string;
} {
  const theme =
    item.colorTheme ||
    (item.modelType === 'rose'
      ? 'pink'
      : item.modelType === 'lotus' || item.modelType === 'tray'
      ? 'amber'
      : item.modelType === 'special_tray'
      ? 'yellow'
      : 'amber');

  switch (theme) {
    case 'yellow':
      return {
        borderRgb: '253, 224, 71',
        labelClass: 'text-yellow-300',
        descClass: 'text-yellow-200 font-semibold',
      };
    case 'amber':
      return {
        borderRgb: '251, 191, 36',
        labelClass: 'text-amber-300',
        descClass: 'text-amber-200 font-semibold',
      };
    case 'orange':
      return {
        borderRgb: '251, 146, 60',
        labelClass: 'text-orange-300',
        descClass: 'text-orange-200 font-semibold',
      };
    case 'rose':
      return {
        borderRgb: '251, 113, 133',
        labelClass: 'text-rose-300',
        descClass: 'text-rose-200 font-semibold',
      };
    case 'pink':
      return {
        borderRgb: '244, 114, 182',
        labelClass: 'text-pink-300',
        descClass: 'text-pink-200 font-semibold',
      };
    case 'fuchsia':
      return {
        borderRgb: '232, 121, 249',
        labelClass: 'text-fuchsia-300',
        descClass: 'text-fuchsia-200 font-semibold',
      };
    case 'violet':
      return {
        borderRgb: '167, 139, 250',
        labelClass: 'text-violet-300',
        descClass: 'text-violet-200 font-semibold',
      };
    case 'cyan':
      return {
        borderRgb: '34, 211, 238',
        labelClass: 'text-cyan-300',
        descClass: 'text-cyan-200 font-semibold',
      };
    case 'emerald':
      return {
        borderRgb: '52, 211, 153',
        labelClass: 'text-emerald-300',
        descClass: 'text-emerald-200 font-semibold',
      };
    case 'lime':
      return {
        borderRgb: '163, 230, 53',
        labelClass: 'text-lime-300',
        descClass: 'text-lime-200 font-semibold',
      };
    default:
      return {
        borderRgb: '251, 191, 36',
        labelClass: 'text-amber-300',
        descClass: 'text-amber-200 font-semibold',
      };
  }
}

function usePeriodicHudCycle(
  cycleCfg?: HudBoxCycleConfig,
  editLayoutMode?: boolean
): React.CSSProperties {
  const enabled = Boolean(cycleCfg?.enabled) && !editLayoutMode;
  const hiddenSec = Math.max(0.5, Number(cycleCfg?.hiddenSec ?? 5));
  const visibleSec = Math.max(0.5, Number(cycleCfg?.visibleSec ?? 8));
  const mode = cycleCfg?.mode || 'slide_right';
  const animSpeedSec = Math.max(
    0.1,
    Math.min(5, Number(cycleCfg?.animSpeedSec ?? 0.55))
  );

  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsHidden(false);
      return;
    }
    // Sau mỗi chu kỳ hiển thị y giây (visibleSec), bảng bị đẩy sang phải màn hình (hoặc fade) để ẩn trong x giây (hiddenSec), sau đó đẩy ngược lại vị trí ban đầu
    const waitMs = (isHidden ? hiddenSec : visibleSec) * 1000;
    const timer = setTimeout(() => {
      setIsHidden((prev) => !prev);
    }, waitMs);
    return () => clearTimeout(timer);
  }, [enabled, isHidden, hiddenSec, visibleSec]);

  if (!enabled) {
    return {};
  }

  if (mode === 'fade') {
    return {
      transition: `opacity ${animSpeedSec}s ease-in-out`,
      ...(isHidden ? { opacity: 0, pointerEvents: 'none' } : {}),
    };
  }

  // Chế độ 1: Đẩy sang phải ra ngoài cạnh màn hình (slide_right) rồi đẩy ngược lại vị trí ban đầu
  return {
    transition: `transform ${animSpeedSec}s cubic-bezier(0.22, 1, 0.36, 1), opacity ${animSpeedSec}s ease-in-out`,
    transform: isHidden ? 'translate3d(580px, 0, 0)' : 'translate3d(0, 0, 0)',
    ...(isHidden ? { pointerEvents: 'none' } : {}),
  };
}

export const StageHud: React.FC<StageHudProps> = ({
  config,
  hudLayout,
  classBoardState,
  zombieEventState,
  cameraFocus,
  pilgrims = [],
  waitingQueue = [],
  queueCount,
  customAssets,
  lotusDonors = [],
  dailyRecords = [],
  onResetDailyRecords,
  floatingToasts,
  grandEventProgress,
  grandEventTarget,
  isGrandEventActive,
  eventBarFlashKey,
  currentPilgrimCount,
  totalSeatCapacity,
  onStartDragHudBox,
  onStartResizeHudBox,
}) => {
  const {
    templeSign,
    classBoardBox,
    lotusLeaderboardBox,
    dailyRecordBox,
    guideBox,
    toastBox,
    grandEventBox,
    pilgrimCountBox,
    waitingQueueBox,
    noticeBoardBox,
    note1Box,
    lotusLeaderboardTitle = 'Bảng Hoa Điểm 10',
    dailyRecordTitle = 'Kỷ lục hôm nay',
    guideTitle = 'Nội Quy & Quà Tặng',
    grandEventTitle = 'Kích hoạt sự kiện',
    pilgrimCountTitle = 'Sĩ số lớp',
    waitingQueueTitle = 'Hàng Chờ Vào Lớp',
    noticeBoardTitle = 'Bảng Tin Lớp 12A1',
    noticeBoardContent = 'Chào mừng các bạn học sinh vào lớp 12A1! Bình luận để giơ tay phát biểu và nhận Hoa Điểm 10 🌺',
    noticeBoardFontSize = 10,
    note1Title = 'Note 1',
    note1Content = 'Đây là trò chơi 2D.',
    note1FontSize = 10,
    note1Opacity,
    showNote1Box = true,
    guideCycle,
    lotusLeaderboardCycle,
    dailyRecordCycle,
    noticeBoardCycle,
    classBoardFontSize = 13,
    classBoardOpacity = 0.42,
    classBoardBlur = 2,
    classBoardEngine = 'english_quiz',
    classBoardLessonTitle = 'Tiết Tiếng Anh',
    classBoardLetterMode = 'default',
    showClassBoardBox = true,
    grandEventFontSize = 10,
    lotusLeaderboardFontSize = 10,
    dailyRecordFontSize = 9.5,
    guideFontSize = 9,
    pilgrimCountFontSize = 10,
    waitingQueueFontSize = 9.5,
    toastFontSize = 10,
    showTempleSign = false,
    showGrandEventBox = true,
    showPilgrimCountBox = true,
    showQueueInPilgrimCountBox = false,
    showWaitingQueueBox = true,
    showLotusLeaderboardBox = true,
    showDailyRecordBox = true,
    showGuideBox = true,
    showNoticeBoardBox = false,
    showToastBox = true,
    lotusLeaderboardMaxRanks = 5,
    waitingQueueMaxRanks = 10,
    hudOpacity = 0.9,
    noticeBoardOpacity,
    grandEventOpacity,
    lotusLeaderboardOpacity,
    dailyRecordOpacity,
    guideOpacity,
    pilgrimCountOpacity,
    waitingQueueOpacity,
    toastOpacity,
    templeSignOpacity,
    guideItems,
    editLayoutMode,
  } = hudLayout;

  const safeClassBoardFontSize = Math.max(8, Math.min(26, classBoardFontSize || 13));
  const safeNoticeFontSize = Math.max(7, Math.min(24, noticeBoardFontSize || 10));
  const safeNote1FontSize = Math.max(7, Math.min(24, note1FontSize || 10));
  const safeGrandEventFontSize = Math.max(7, Math.min(24, grandEventFontSize || 10));
  const safeLotusLeaderboardFontSize = Math.max(7, Math.min(24, lotusLeaderboardFontSize || 10));
  const safeDailyRecordFontSize = Math.max(7, Math.min(24, dailyRecordFontSize || 9.5));
  const safeGuideFontSize = Math.max(7, Math.min(24, guideFontSize || 9));
  const safePilgrimCountFontSize = Math.max(7, Math.min(24, pilgrimCountFontSize || 10));
  const safeWaitingQueueFontSize = Math.max(7, Math.min(22, waitingQueueFontSize || 9.5));
  const safeToastFontSize = Math.max(7, Math.min(24, toastFontSize || 10));
  const safeLotusLeaderboardMaxRanks = Math.max(1, Math.min(20, lotusLeaderboardMaxRanks || 5));
  const safeWaitingQueueMaxRanks = Math.max(1, Math.min(15, waitingQueueMaxRanks || 10));

  const defaultOp = clampOpacity(hudOpacity, 0.9);
  const opClassBoard = clampOpacity(classBoardOpacity, 0.42);
  const blurClassBoard = Math.max(0, Math.min(24, Number(classBoardBlur ?? 2)));
  const opNotice = clampOpacity(noticeBoardOpacity, defaultOp);
  const opNote1 = clampOpacity(note1Opacity, defaultOp);
  const opGrandEvent = clampOpacity(grandEventOpacity, defaultOp);
  const opLotusLeaderboard = clampOpacity(lotusLeaderboardOpacity, defaultOp);
  const opDailyRecord = clampOpacity(dailyRecordOpacity, defaultOp);
  const opGuide = clampOpacity(guideOpacity, defaultOp);
  const opPilgrimCount = clampOpacity(pilgrimCountOpacity, defaultOp);
  const opWaitingQueue = clampOpacity(waitingQueueOpacity, defaultOp);
  const opToast = clampOpacity(toastOpacity, defaultOp);
  const opTempleSign = clampOpacity(templeSignOpacity, 1);

  const noticeBoardCycleStyle = usePeriodicHudCycle(
    noticeBoardCycle,
    editLayoutMode
  );
  const lotusLeaderboardCycleStyle = usePeriodicHudCycle(
    lotusLeaderboardCycle,
    editLayoutMode
  );
  const dailyRecordCycleStyle = usePeriodicHudCycle(
    dailyRecordCycle,
    editLayoutMode
  );
  const guideCycleStyle = usePeriodicHudCycle(guideCycle, editLayoutMode);

  const activeGuideItems = Array.isArray(guideItems)
    ? guideItems
    : DEFAULT_GUIDE_ITEMS;

  const topLotusDonors = [...lotusDonors]
    .sort((a, b) => b.coins - a.coins)
    .slice(0, safeLotusLeaderboardMaxRanks);
  const top5DailyRecords = [...dailyRecords]
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);
  const safeTarget = Math.max(1, grandEventTarget || 1000);
  const isEventPendingOrRunning = Boolean(
    isGrandEventActive ||
      zombieEventState?.isQueued ||
      (zombieEventState?.isActive && zombieEventState.phase !== 'idle') ||
      grandEventProgress >= safeTarget
  );
  const progressPercent = isEventPendingOrRunning
    ? 100
    : Math.min(100, Math.round((grandEventProgress / safeTarget) * 100));

  const dragringClass = editLayoutMode
    ? 'pointer-events-auto cursor-move ring-2 ring-amber-400/90 hover:ring-emerald-400'
    : 'pointer-events-none';

  const safeClassBoardBox = classBoardBox || {
    x: 56,
    y: 112,
    width: 430,
    height: 218,
  };

  const safePilgrimBox = pilgrimCountBox || {
    x: 364,
    y: 6,
    width: 166,
    height: 48,
  };

  const safeWaitingQueueBox = waitingQueueBox || {
    x: 364,
    y: 58,
    width: 166,
    height: 86,
  };

  const safeNoticeBoardBox = noticeBoardBox || {
    x: 184,
    y: 98,
    width: 172,
    height: 68,
  };

  const safeNote1Box = note1Box || {
    x: 10,
    y: 60,
    width: 166,
    height: 30,
  };

  const safeLotusLeaderboardBox = lotusLeaderboardBox || {
    x: 184,
    y: 10,
    width: 172,
    height: 84,
  };

  const safeDailyRecordBox = dailyRecordBox || {
    x: 184,
    y: 10,
    width: 172,
    height: 108,
  };

  // Trạng thái Bảng Lớp Chính (Engine: Tiết Tiếng Anh / Kết Quả / Bảng Thông Báo)
  const activeEngine = classBoardState?.engine || classBoardEngine || 'english_quiz';
  const qIdx = classBoardState?.questionIndex ?? 0;
  const totalQuizCount =
    classBoardState?.totalQuestions || ENGLISH_QUIZ_QUESTIONS.length;
  const quizItem =
    classBoardState?.currentQuestion ||
    ENGLISH_QUIZ_QUESTIONS[qIdx % ENGLISH_QUIZ_QUESTIONS.length] ||
    ENGLISH_QUIZ_QUESTIONS[0];
  const quizLetters = quizItem.en.toUpperCase().split('');
  // Chế độ Mặc định: Luôn gợi ý 1 chữ cái đầu; 5s sau thêm 1 chữ nếu 6 ký tự, thêm 2 nếu 7-9 ký tự, thêm 3 nếu >= 10 ký tự
  const defaultHintExtraIndices = React.useMemo(() => {
    const len = quizLetters.length;
    const extraCount = len >= 10 ? 3 : len >= 7 ? 2 : len === 6 ? 1 : 0;
    if (extraCount <= 0 || len <= 1) return [] as number[];
    const pool: number[] = [];
    for (let i = 1; i < len; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, Math.min(extraCount, pool.length));
  }, [quizItem.id, qIdx, quizLetters.length]);

  // Chế độ Gợi ý 2: Gợi ý 2 chữ cái ngẫu nhiên
  const hint2RandomIndices = React.useMemo(() => {
    const len = quizLetters.length;
    if (len <= 0) return [] as number[];
    const pool: number[] = [];
    for (let i = 0; i < len; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, Math.min(2, pool.length));
  }, [quizItem.id, qIdx, quizLetters.length]);
  const isBoardRunning = Boolean(classBoardState?.isRunning);
  const boardPhase = classBoardState?.phase || 'asking';
  const totalDurMs = Math.max(1000, classBoardState?.totalDurationMs || 15000);
  const remMs = Math.max(0, classBoardState?.timeLeftMs ?? totalDurMs);
  const timeRatio = isBoardRunning ? Math.max(0, Math.min(1, remMs / totalDurMs)) : 1;
  const timePercent = Math.round(timeRatio * 100);
  const remSec = Math.ceil(remMs / 1000);
  const boardWinners = classBoardState?.winners || [];
  const classWinners =
    classBoardState?.classWinners ||
    boardWinners.filter((w) => w.isSeated !== false);
  const outsideWinners =
    classBoardState?.outsideWinners ||
    boardWinners.filter((w) => w.isSeated === false);

  const isLessonStartPhase = boardPhase === 'lesson_start';
  const isPreparingPhase = boardPhase === 'preparing';
  const isAnswerFlashPhase = boardPhase === 'answer_flash';
  const isResultSummaryPhase = boardPhase === 'result_summary';
  const isRankingBoardPhase = boardPhase === 'ranking_board';
  const isRecordNoticePhase = boardPhase === 'record_notice';
  const isPunishmentNoticePhase = boardPhase === 'punishment_notice';
  const isLegacyRevealed = boardPhase === 'reveal';

  const showResultBoardView =
    activeEngine === 'result_board' ||
    (activeEngine === 'english_quiz' &&
      (isResultSummaryPhase ||
        isRankingBoardPhase ||
        (isLegacyRevealed && Boolean(classBoardState?.showResultEngine))));

  // Thời gian đã trôi qua trong pha hiện tại (ms)
  const elapsedPhaseMs = Math.max(
    0,
    classBoardState?.elapsedPhaseMs ?? Math.max(0, totalDurMs - remMs)
  );
  const showTotalScoreBoard =
    showResultBoardView &&
    (isRankingBoardPhase ||
      (activeEngine === 'result_board' && elapsedPhaseMs >= 4000) ||
      (isLegacyRevealed && elapsedPhaseMs >= 4000));

  // Tổng hợp dữ liệu Bảng Xếp Hạng chỉ tính các bạn đang ở TRONG LỚP
  const combinedTotalRankings = React.useMemo(() => {
    const donorPointsMap = new Map<string, number>();
    for (const d of lotusDonors) {
      if (!d.username) continue;
      donorPointsMap.set(d.username.trim().toLowerCase(), d.coins || 0);
    }

    const map = new Map<
      string,
      {
        username: string;
        points: number;
        avatarUrl?: string | null;
        avatarColor?: string;
      }
    >();

    // Chỉ lấy danh sách học sinh đang ở trong lớp
    for (const p of pilgrims) {
      if (
        p.state === 'leave_side_to_aisle' ||
        p.state === 'leave_down_exit' ||
        !p.username
      ) {
        continue;
      }
      const key = p.username.trim().toLowerCase();
      const pts = donorPointsMap.get(key) ?? 0;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          username: p.username,
          points: pts,
          avatarUrl: p.avatarUrl,
          avatarColor: p.avatarColor || '#10b981',
        });
      } else {
        existing.points = Math.max(existing.points, pts);
        if (!existing.avatarUrl && p.avatarUrl) existing.avatarUrl = p.avatarUrl;
        if (p.avatarColor) existing.avatarColor = p.avatarColor;
      }
    }

    // Đảm bảo học sinh trong lớp vừa trả lời đúng (classWinners) có đầy đủ thông tin điểm/avatar
    for (const w of classWinners) {
      if (!w.username) continue;
      const key = w.username.trim().toLowerCase();
      const donorPts = donorPointsMap.get(key);
      const pts = donorPts !== undefined ? donorPts : w.points || 0;
      const existing = map.get(key);
      if (existing) {
        existing.points = Math.max(existing.points, pts);
        if (!existing.avatarUrl && w.avatarUrl) existing.avatarUrl = w.avatarUrl;
        if (w.avatarColor) existing.avatarColor = w.avatarColor;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.points - a.points);
  }, [lotusDonors, pilgrims, classWinners]);

  // Ở Luồng 6 (Bảng Xếp Hạng Trong Lớp): giữ cố định danh sách 10 bạn đầu tiên (Rank 1 - Rank 10) kéo dài cho đến hết luồng, không load thêm trang khác
  const scorePageStartRank = 0;

  const renderResultWinnerCard = (
    w: ClassBoardQuizWinner | undefined,
    rankIdx: number,
    isClassCol: boolean
  ) => {
    const rankNum = rankIdx + 1;
    const defaultPts =
      rankNum === 1 ? 10 : rankNum === 2 ? 8 : rankNum === 3 ? 7 : 6;
    const pts = w?.points || defaultPts;
    const rankBadgeColors =
      rankNum === 1
        ? 'bg-yellow-400 text-stone-950 border-yellow-200'
        : rankNum === 2
        ? 'bg-slate-200 text-stone-950 border-white'
        : rankNum === 3
        ? 'bg-amber-600 text-white border-amber-300'
        : 'bg-sky-400 text-stone-950 border-sky-200';

    if (!w) {
      return (
        <div
          key={`empty-${isClassCol ? 'cls' : 'out'}-${rankNum}`}
          className="px-2 py-0.5 rounded-md bg-slate-950/45 border border-white/15 flex items-center justify-between gap-1.5 opacity-60"
          style={{ fontSize: `${Math.max(8, safeClassBoardFontSize - 3)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center border shrink-0 ${rankBadgeColors}`}
            >
              {rankNum}
            </span>
            <span className="text-stone-400 italic truncate">Chưa có</span>
          </div>
          <span className="font-mono text-stone-500 text-[8.5px] shrink-0">
            +{defaultPts}đ
          </span>
        </div>
      );
    }

    return (
      <div
        key={`win-${isClassCol ? 'cls' : 'out'}-${rankNum}-${w.username}`}
        className={`px-2 py-0.5 rounded-md border flex items-center justify-between gap-1.5 ${
          rankNum === 1
            ? 'bg-amber-500/30 border-yellow-300 top1-card-blink'
            : 'bg-slate-950/65 border-emerald-300/45'
        }`}
        style={{ fontSize: `${Math.max(8, safeClassBoardFontSize - 3)}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative shrink-0">
            {w.avatarUrl ? (
              <img
                src={w.avatarUrl}
                alt=""
                className="w-4 h-4 rounded-full object-cover border border-yellow-300"
              />
            ) : (
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-white border border-white/60"
                style={{ backgroundColor: w.avatarColor || '#059669' }}
              >
                {(w.username || 'H').charAt(0).toUpperCase()}
              </span>
            )}
            <span
              className={`absolute -top-1 -left-1 w-3 h-3 rounded-full text-[7px] font-black flex items-center justify-center border ${rankBadgeColors}`}
            >
              {rankNum}
            </span>
          </div>
          <span className="font-bold text-white truncate max-w-[92px]">
            {w.username}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 font-mono">
          <span className="px-1 py-0.1 rounded bg-emerald-500/35 border border-emerald-300/70 text-emerald-200 font-black text-[8.5px]">
            +{pts}đ
          </span>
          <span className="text-amber-200 text-[8px] font-semibold">
            ({Number(w.elapsedSec || 0).toFixed(1)}s)
          </span>
        </div>
      </div>
    );
  };

  const renderTotalScoreRankCard = (slotIdx: number) => {
    const rankNum = scorePageStartRank + slotIdx + 1;
    const entry = combinedTotalRankings[scorePageStartRank + slotIdx];

    // Chỉ highlight duy nhất bạn Top 1
    const cardToneClass =
      rankNum === 1
        ? 'bg-amber-500/30 border-yellow-300 rank-top1-blink'
        : 'bg-slate-950/65 border-white/25';

    const rankBadgeClass =
      rankNum === 1
        ? 'bg-yellow-300 text-stone-950 border-yellow-100'
        : 'bg-white text-slate-950 border-slate-200';

    const scoreFontSize = Math.max(10.5, safeClassBoardFontSize - 1);

    if (!entry) {
      return (
        <div
          key={`total-empty-rank-${rankNum}`}
          className="px-2 py-[1.5px] rounded-md bg-slate-950/40 border border-white/15 flex items-center justify-between gap-1.5 opacity-55"
          style={{ fontSize: `${Math.max(8, safeClassBoardFontSize - 3)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-800 border border-white/20 flex items-center justify-center text-[7.5px] text-stone-400 shrink-0">
              -
            </span>
            <span className="text-stone-400 italic truncate">Chưa có</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="font-mono font-bold text-stone-400 leading-none"
              style={{ fontSize: `${scoreFontSize}px` }}
            >
              0
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[7.5px] font-black border ${rankBadgeClass}`}
            >
              Rank {rankNum}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`total-rank-${rankNum}-${entry.username}`}
        className={`px-2 py-[1.5px] rounded-md border flex items-center justify-between gap-1.5 ${cardToneClass}`}
        style={{ fontSize: `${Math.max(8.5, safeClassBoardFontSize - 2.5)}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {entry.avatarUrl ? (
            <img
              src={entry.avatarUrl}
              alt=""
              className="w-3.5 h-3.5 rounded-full object-cover border border-white/80 shrink-0"
            />
          ) : (
            <span
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7.5px] font-black text-white border border-white/70 shrink-0"
              style={{ backgroundColor: entry.avatarColor || '#059669' }}
            >
              {(entry.username || 'H').charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-bold text-white truncate max-w-[78px]">
            {entry.username}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="font-mono font-black text-yellow-200 leading-none tabular-nums"
            style={{ fontSize: `${scoreFontSize}px` }}
          >
            {entry.points}
          </span>
          <span
            className={`px-1.5 py-0.2 rounded text-[7.5px] font-black border shrink-0 ${rankBadgeClass}`}
          >
            Rank {rankNum}
          </span>
        </div>
      </div>
    );
  };

  const classBoardSurfaceStyle: React.CSSProperties = {
    backgroundColor:
      opClassBoard <= 0.005
        ? 'transparent'
        : `rgba(6, 32, 24, ${opClassBoard.toFixed(2)})`,
    borderColor:
      opClassBoard <= 0.005 && blurClassBoard <= 0
        ? 'transparent'
        : `rgba(110, 231, 183, ${Math.min(0.85, Math.max(0.22, opClassBoard * 0.75)).toFixed(2)})`,
    boxShadow:
      opClassBoard > 0.05
        ? `inset 0 0 24px rgba(0, 0, 0, ${(0.45 * opClassBoard).toFixed(2)}), 0 8px 20px -4px rgba(0, 0, 0, ${(0.5 * opClassBoard).toFixed(2)})`
        : 'none',
    backdropFilter: blurClassBoard > 0 ? `blur(${blurClassBoard}px)` : 'none',
    WebkitBackdropFilter: blurClassBoard > 0 ? `blur(${blurClassBoard}px)` : 'none',
    textShadow: '0 1px 3px rgba(0,0,0,0.92), 0 0 8px rgba(0,0,0,0.65)',
  };

  const isZombieEventActive = Boolean(
    zombieEventState?.isActive && zombieEventState.phase !== 'idle'
  );

  const [, setCameraTick] = useState(0);
  const cameraLockEndMs = cameraFocus
    ? Math.max(cameraFocus.until || 0, cameraFocus.lockedUntil || 0)
    : 0;

  useEffect(() => {
    if (!cameraLockEndMs) return;
    const remainingMs = cameraLockEndMs - Date.now();
    if (remainingMs <= 0) return;
    const timer = window.setTimeout(() => {
      setCameraTick((t) => t + 1);
    }, remainingMs + 25);
    return () => window.clearTimeout(timer);
  }, [cameraLockEndMs]);

  const isCameraLocked =
    !editLayoutMode &&
    Boolean(
      cameraFocus &&
        (cameraFocus.pilgrimId || cameraFocus.focusRole) &&
        Date.now() < cameraLockEndMs
    );

  // Khi có học sinh đang đi lên hoặc đứng chịu phạt trên lớp -> tạm ẩn Bảng Tin Lớp cho tới khi hàng phạt trống hoàn toàn
  const hasPunishedStudentsOnStage =
    !editLayoutMode &&
    pilgrims.some(
      (p) =>
        p.state === 'stand_punishment' || p.state === 'walk_to_punishment_spot'
    );

  // Key định danh luồng hiển thị bên trong Bảng Lớp: chỉ kích hoạt fade nhẹ (0 -> 1 trong 0.25s) cho phần chữ/nội dung bên trong khi chuyển luồng, giữ nguyên khung nền bảng đen đứng yên
  const boardPhaseFadeKey = zombieEventState?.isActive
    ? zombieEventState.phase === 'z_flow_1_intro'
      ? 'zombie_intro'
      : zombieEventState.phase === 'z_flow_6_celebration'
      ? 'zombie_celebration'
      : 'zombie_combat'
    : activeEngine === 'english_quiz'
    ? `quiz_${classBoardState?.phase || 'asking'}_${qIdx}`
    : `engine_${activeEngine}`;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 0. BẢNG LỚP LỚN TƯƠNG TÁC CHÍNH (Nằm trên bảng đen thực tế, z-20 để Cô Giáo z-25 ưu tiên nổi trên bảng lớp) */}
      {showClassBoardBox && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('classBoardBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('classBoardBox', e)}
          className={`absolute rounded-lg border px-3 py-2 flex flex-col justify-between select-none transition-colors ${dragringClass}`}
          style={{
            left: `${safeClassBoardBox.x}px`,
            top: `${safeClassBoardBox.y}px`,
            width: `${safeClassBoardBox.width}px`,
            height: `${safeClassBoardBox.height}px`,
            zIndex: editLayoutMode ? 45 : 20,
            ...classBoardSurfaceStyle,
          }}
        >
          <div
            key={boardPhaseFadeKey}
            className="w-full h-full flex flex-col justify-between class-board-phase-fade"
          >
          {zombieEventState?.isActive ? (
            zombieEventState.phase === 'z_flow_1_intro' ? (
              /* SỰ KIỆN ZOMBIE - LUỒNG 1: Cảnh báo đỏ sáng font pixel trên bảng lớp */
              <div className="flex flex-col items-center justify-center h-full text-center px-3 py-2 gap-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-950/90 border border-red-500/80 text-red-300 font-pixel-vi font-bold text-[10px] tracking-wider uppercase animate-pulse">
                  ⚠️ SỰ KIỆN KHẨN CẤP - CẤP {zombieEventState.level} ⚠️
                </div>

                <h2
                  className="font-pixel-vi font-black uppercase tracking-wider text-red-500 animate-pulse leading-tight"
                  style={{
                    fontSize: `${Math.max(15, safeClassBoardFontSize + 5)}px`,
                    textShadow:
                      '0 0 12px rgba(239,68,68,0.95), 0 2px 0 #450a0a, 0 0 24px rgba(220,38,38,0.8)',
                  }}
                >
                  {(
                    config?.zombieFlow1Title || 'Sự kiện đẩy lùi Zombie'
                  ).replace(/\[Cấp\]/gi, String(zombieEventState.level))}
                </h2>

                <p
                  className="font-pixel-vi font-bold text-red-400 max-w-[95%] leading-snug"
                  style={{
                    fontSize: `${Math.max(10, safeClassBoardFontSize - 1)}px`,
                    textShadow: '0 0 8px rgba(239,68,68,0.75), 0 1px 2px #000',
                  }}
                >
                  {(
                    config?.zombieFlow1Subtitle ||
                    'Zombie tiến vào lớp học, hãy bảo vệ cô giáo và đẩy lùi zombie để tiếp tục tiết học'
                  ).replace(/\[Cấp\]/gi, String(zombieEventState.level))}
                </p>
              </div>
            ) : zombieEventState.phase === 'z_flow_6_celebration' ? (
              /* SỰ KIỆN ZOMBIE - LUỒNG 6: Bảng ăn mừng chiến thắng + Thưởng Top 1/2/3 + Bảng xếp hạng điểm số */
              <div className="flex flex-col h-full justify-between gap-1.5">
                <div
                  className="flex items-center justify-between gap-2 pb-1 shrink-0"
                  style={{
                    borderBottom: '1px dashed rgba(254, 240, 138, 0.45)',
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Trophy className="w-4 h-4 text-yellow-300 shrink-0 animate-bounce" />
                    <span
                      className="font-pixel-vi font-black text-yellow-300 uppercase truncate"
                      style={{ fontSize: `${Math.max(10, safeClassBoardFontSize)}px` }}
                    >
                      {(
                        config?.zombieFlow6BoardTitle ||
                        `🎉 ĐÃ ĐÁNH BẠI ZOMBIE CẤP [Cấp] - TIỆC TRÀ SỮA! 🧋`
                      ).replace(/\[Cấp\]/gi, String(zombieEventState.level))}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex gap-2 items-stretch">
                  {/* Bên trái: Vinh danh Top 1, 2, 3 nhận Hoa Điểm 10 + Trà Sữa Matcha Latte */}
                  <div className="w-[56%] flex flex-col justify-between rounded-lg bg-slate-950/60 border border-yellow-400/50 p-2 gap-1">
                    <div className="text-[10px] font-black text-amber-300 uppercase tracking-wide">
                      🎁 Phần thưởng Cô Thảo trao tặng:
                    </div>
                    <div className="flex flex-col gap-1 my-auto">
                      {[0, 1, 2].map((idx) => {
                        const d = zombieEventState.topDamagers[idx];
                        const rewardPts = idx === 0 ? 100 : idx === 1 ? 75 : 50;
                        const medal = idx === 0 ? '🥇 Top 1' : idx === 1 ? '🥈 Top 2' : '🥉 Top 3';
                        return (
                          <div
                            key={`z-reward-${idx}`}
                            className="flex items-center justify-between gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-300/40 text-[9.5px]"
                          >
                            <span className="font-bold text-white truncate">
                              {medal}:{' '}
                              <span className="text-yellow-200 font-black">
                                {d ? d.username : 'Học Sinh Giỏi'}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono font-black text-emerald-300">
                              +{rewardPts} 🌸
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-2 py-1 rounded bg-emerald-950/80 border border-emerald-400/50 text-[8.5px] font-bold text-emerald-200 leading-tight">
                      🧋 Các bạn còn lại +25 🌸 • Cả lớp & hàng chờ nhận 1 ly Trà Sữa Matcha Latte Full Topping!
                    </div>
                  </div>

                  {/* Bên phải: Bảng Xếp Hạng Điểm Số Top 1 - 10 */}
                  <div className="w-[44%] flex flex-col rounded-lg bg-slate-950/65 border border-amber-300/40 p-1.5 min-h-0">
                    <div className="text-[9px] font-black text-yellow-300 uppercase text-center pb-0.5 border-b border-white/15 shrink-0">
                      🏆 Bảng Điểm Số (Top 1-10)
                    </div>
                    <div className="flex-1 min-h-0 grid grid-cols-1 gap-0.5 overflow-y-auto pr-0.5 pt-0.5">
                      {Array.from({ length: 10 }, (_, idx) => {
                        const item = zombieEventState.topDamagers[idx];
                        return (
                          <div
                            key={`z-celeb-rank-${idx}`}
                            className="flex items-center justify-between gap-1 px-1.5 py-0.2 rounded bg-slate-900/80 border border-white/10 text-[8.5px]"
                          >
                            <span className="truncate text-stone-200 font-semibold">
                              <b className="text-yellow-300">#{idx + 1}</b>{' '}
                              {item ? item.username : '---'}
                            </span>
                            <span className="font-mono font-black text-amber-300 shrink-0">
                              {item ? item.damage.toLocaleString('vi-VN') : 0}đ
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* SỰ KIỆN ZOMBIE - LUỒNG 2, 3, 4, 5, 5b: Bảng Chiến Đấu 3 Phần (Trái: Thanh HP + Hướng dẫn tấn công | Phải: Bảng Điểm Số Top 1-10) */
              <div className="flex h-full gap-2 items-stretch">
                <style>{`
                  @keyframes zombieHpBarBorderHighlight {
                    0% {
                      border-color: #ffffff;
                      box-shadow: 0 0 14px rgba(254, 240, 138, 0.98), inset 0 0 8px rgba(254, 240, 138, 0.85);
                    }
                    45% {
                      border-color: #fde047;
                      box-shadow: 0 0 10px rgba(250, 204, 21, 0.9), inset 0 0 5px rgba(250, 204, 21, 0.6);
                    }
                    100% {
                      border-color: rgba(248, 113, 113, 0.8);
                      box-shadow: none;
                    }
                  }
                `}</style>
                {/* CỘT TRÁI (Chiếm nhiều bề ngang ~58%): Thanh HP + Hướng dẫn tấn công màu vàng */}
                <div className="w-[58%] flex flex-col justify-between gap-1.5 min-w-0">
                  {/* Phần 1: Thẻ chứa Thanh HP của Zombie (Không rung thẻ chứa, chỉ highlight viền của chính thanh HP khi bị tấn công) */}
                  <div className="rounded-lg bg-slate-950/75 border border-red-500/60 p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="font-pixel-vi font-black text-red-300 uppercase tracking-tight truncate"
                        style={{
                          fontSize: `${Math.max(9.5, safeClassBoardFontSize - 1.5)}px`,
                        }}
                      >
                        🧟 HP của Zombie - Cấp {zombieEventState.level}:
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-red-950 border border-red-500/60 text-[8.5px] font-mono font-black text-red-200 shrink-0">
                        {Math.max(
                          0,
                          Math.round(
                            (zombieEventState.hp /
                              Math.max(1, zombieEventState.maxHp)) *
                              100
                          )
                        )}
                        %
                      </span>
                    </div>

                    {/* Thanh HP màu đỏ + highlight viền của thanh HP khi bị tấn công + hiệu ứng lùi máu màu vàng kem (trailHp) */}
                    <div
                      key={`hp-bar-border-${zombieEventState.hpShakeKey}`}
                      className="relative w-full h-6 rounded-md bg-stone-950 border-2 border-red-400/80 overflow-hidden shadow-inner"
                      style={
                        zombieEventState.hpShakeKey > 0
                          ? {
                              animation:
                                'zombieHpBarBorderHighlight 0.42s ease-out',
                            }
                          : undefined
                      }
                    >
                      {/* Lớp lùi máu màu vàng kem (trailHp) */}
                      <div
                        className="absolute inset-y-0 left-0 bg-amber-200/90 transition-all duration-150"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              (zombieEventState.trailHp /
                                Math.max(1, zombieEventState.maxHp)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                      {/* Lớp máu đỏ hiện tại */}
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-700 via-red-600 to-rose-500 transition-all duration-75"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              (zombieEventState.hp /
                                Math.max(1, zombieEventState.maxHp)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                      {/* Số HP màu trắng bên trong */}
                      <div className="absolute inset-0 flex items-center justify-center z-10 font-mono font-black text-white text-[11px] tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                        {Math.max(0, Math.round(zombieEventState.hp)).toLocaleString(
                          'vi-VN'
                        )}{' '}
                        /{' '}
                        {Math.max(1, Math.round(zombieEventState.maxHp)).toLocaleString(
                          'vi-VN'
                        )}{' '}
                        HP
                      </div>
                    </div>
                  </div>

                  {/* Phần 2: Bên dưới thanh HP là những dòng hướng dẫn đẩy lùi zombie (đã rút ngắn tiêu đề & lược bỏ điểm sát thương bên cạnh) */}
                  <div className="flex-1 rounded-lg bg-slate-950/70 border border-yellow-400/50 px-2.5 py-1.5 flex flex-col justify-center gap-1">
                    <div className="text-[9.5px] font-black uppercase tracking-wider text-yellow-300 border-b border-yellow-300/25 pb-0.5">
                      Hướng dẫn đẩy lùi zombie:
                    </div>
                    <div
                      className="grid grid-cols-1 gap-0.5 font-bold text-yellow-300 leading-tight"
                      style={{
                        fontSize: `${Math.max(9, safeClassBoardFontSize - 2)}px`,
                      }}
                    >
                      <div className="truncate">❤️ Thả Tim = Ném hộp bút</div>
                      <div className="truncate">🌹 Hoa (1 xu) = Ném sách</div>
                      <div className="truncate">🪑 Quà 5 coin = Ném ghế ngồi</div>
                      <div className="truncate text-amber-200">
                        🤣 Quà 10 coin = Ném đứa bàn bên :)
                      </div>
                    </div>
                  </div>
                </div>

                {/* CỘT PHẢI (Chiếm nhiều bề dọc ~42%): Bảng Xếp Hạng Điểm Số Top 1 - 10 */}
                <div className="w-[42%] flex flex-col rounded-lg bg-slate-950/75 border border-amber-300/50 p-1.5 min-h-0">
                  <div className="flex items-center justify-between gap-1 pb-1 border-b border-white/15 shrink-0">
                    <span className="font-black text-yellow-300 uppercase text-[9px] truncate">
                      🏆 Bảng Điểm Số
                    </span>
                    <span className="px-1 py-0.1 rounded bg-amber-500/25 border border-amber-300/50 text-[8px] font-bold text-amber-200 shrink-0">
                      Top 1-10
                    </span>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col justify-between gap-0.5 pt-1 overflow-y-auto">
                    {Array.from({ length: 10 }, (_, idx) => {
                      const entry = zombieEventState.topDamagers[idx];
                      const isTop3 = idx < 3;
                      return (
                        <div
                          key={`z-top-dmg-${idx}`}
                          className={`flex items-center justify-between gap-1 px-1.5 py-0.2 rounded border text-[8.5px] leading-tight ${
                            idx === 0
                              ? 'bg-amber-500/30 border-yellow-300/80 text-yellow-100 font-black'
                              : isTop3
                              ? 'bg-slate-900/90 border-amber-400/40 text-white font-bold'
                              : 'bg-slate-950/60 border-white/10 text-stone-300'
                          }`}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className={`w-3.5 h-3.5 rounded-full text-[7.5px] font-black flex items-center justify-center shrink-0 ${
                                idx === 0
                                  ? 'bg-yellow-300 text-stone-950'
                                  : idx === 1
                                  ? 'bg-slate-200 text-stone-950'
                                  : idx === 2
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-800 text-stone-300'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <span className="truncate">
                              {entry ? entry.username : 'Chưa có'}
                            </span>
                          </div>
                          <span className="font-mono font-black text-yellow-300 shrink-0">
                            {entry ? entry.damage.toLocaleString('vi-VN') : 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          ) : showResultBoardView ? (
            /* LUỒNG 5 (Kết quả câu hỏi) & LUỒNG 6 (Bảng xếp hạng trong lớp 6 thẻ: 3s đầu Top 1-6, sau đó mỗi 2s lật trang) */
            <div className="flex flex-col h-full justify-between gap-1.5">
              {/* Hàng trên cùng: Tiêu đề (thu nhỏ 20%) */}
              <div
                className="flex items-center justify-between gap-2 pb-1 shrink-0"
                style={{
                  borderBottom: '1px dashed rgba(254, 240, 138, 0.35)',
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Trophy className="w-3 h-3 text-yellow-300 shrink-0" />
                  <span
                    className="font-black tracking-wide text-yellow-300 uppercase truncate"
                    style={{
                      fontSize: `${Math.max(7.5, Math.round((safeClassBoardFontSize + 1) * 0.8 * 10) / 10)}px`,
                    }}
                  >
                    {showTotalScoreBoard
                      ? 'Bảng xếp hạng trong lớp'
                      : 'Kết quả câu hỏi'}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="px-1 py-[1px] rounded bg-emerald-500/25 border border-emerald-300/60 text-emerald-200 font-bold text-[7.2px]">
                    {showTotalScoreBoard
                      ? 'Rank 1-10'
                      : `Đúng: ${boardWinners.length} bạn`}
                  </span>
                </div>
              </div>

              {/* Khu vực giữa: Luồng 5 là 2 cột Học ké / Trong lớp (Top 1-4); Luồng 6 là Bảng Xếp Hạng Trong Lớp 10 thẻ cố định (5 hàng) */}
              {showTotalScoreBoard ? (
                <div className="rounded-lg bg-slate-950/45 border border-amber-300/40 px-2 py-1 my-auto flex-1 min-h-0 flex flex-col justify-center">
                  <div className="grid grid-cols-2 grid-rows-5 grid-flow-col gap-1 my-auto">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((slotIdx) =>
                      renderTotalScoreRankCard(slotIdx)
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 my-auto flex-1 min-h-0 items-stretch">
                  {/* Cột Trái: Học ké trả lời đúng (Top 1-4) */}
                  <div className="rounded-lg bg-slate-950/45 border border-cyan-300/35 px-2 py-1 flex flex-col justify-between gap-0.5">
                    <div
                      className="font-extrabold text-cyan-200 flex items-center justify-between gap-1 pb-0.5 border-b border-white/15"
                      style={{ fontSize: `${Math.max(8.5, safeClassBoardFontSize - 2.5)}px` }}
                    >
                      <span className="truncate">
                        Học ké đúng: <b className="text-yellow-300">{outsideWinners.length}</b>
                      </span>
                      <span className="text-[8px] font-mono text-cyan-300/90 shrink-0">
                        Top 1-4
                      </span>
                    </div>
                    <div className="space-y-0.5 my-auto">
                      {[0, 1, 2, 3].map((idx) =>
                        renderResultWinnerCard(outsideWinners[idx], idx, false)
                      )}
                    </div>
                  </div>

                  {/* Cột Phải: Top 1, 2, 3, 4 trong lớp trả lời đúng */}
                  <div className="rounded-lg bg-slate-950/45 border border-amber-300/45 px-2 py-1 flex flex-col justify-between gap-0.5">
                    <div
                      className="font-extrabold text-amber-200 flex items-center justify-between gap-1 pb-0.5 border-b border-white/15"
                      style={{ fontSize: `${Math.max(8.5, safeClassBoardFontSize - 2.5)}px` }}
                    >
                      <span className="truncate">
                        Trong lớp đúng: <b className="text-yellow-300">{classWinners.length}/{currentPilgrimCount}</b>
                      </span>
                      <span className="text-[8px] font-mono text-yellow-300 shrink-0">
                        Top 1-4
                      </span>
                    </div>
                    <div className="space-y-0.5 my-auto">
                      {[0, 1, 2, 3].map((idx) =>
                        renderResultWinnerCard(classWinners[idx], idx, true)
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeEngine === 'english_quiz' && isRecordNoticePhase ? (
            /* LUỒNG KỶ LỤC MỚI (Sau Luồng 6): Vinh danh và khen ngợi khi Top 1 Kỷ Lục Hôm Nay thay đổi */
            <div className="flex flex-col h-full justify-between py-1.5 px-2 select-none">
              <div
                className="flex items-center justify-between gap-2 pb-1 shrink-0"
                style={{
                  borderBottom: '1px dashed rgba(251, 146, 60, 0.55)',
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Trophy className="w-3.5 h-3.5 text-amber-300 animate-bounce shrink-0" />
                  <span
                    className="font-black tracking-wide text-amber-300 uppercase truncate"
                    style={{
                      fontSize: `${Math.max(8, Math.round((safeClassBoardFontSize + 1) * 0.82 * 10) / 10)}px`,
                    }}
                  >
                    🏆 Kỷ Lục Hôm Nay Mới!
                  </span>
                </div>
                <span className="px-1.5 py-[1px] rounded bg-gradient-to-r from-amber-500 to-orange-500 text-stone-950 font-black text-[7.5px] shrink-0 shadow">
                  TOP 1 KỶ LỤC NGÀY
                </span>
              </div>

              {classBoardState?.recordBreaker && (
                <div className="mx-auto my-auto px-3 py-1.5 rounded-xl bg-slate-950/75 border-2 border-amber-400/80 shadow-[0_0_16px_rgba(251,146,60,0.45)] flex items-center gap-2.5 max-w-full">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-yellow-300 overflow-hidden flex items-center justify-center shrink-0 text-[11px] font-black text-white shadow"
                    style={{
                      backgroundColor:
                        classBoardState.recordBreaker.avatarColor || '#f59e0b',
                    }}
                  >
                    {classBoardState.recordBreaker.avatarUrl ? (
                      <img
                        src={classBoardState.recordBreaker.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (classBoardState.recordBreaker.username || 'HS')
                        .slice(0, 2)
                        .toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-white text-[12px] truncate max-w-[160px]">
                        {classBoardState.recordBreaker.username}
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 text-stone-950 font-black text-[8.5px] border border-yellow-100 shrink-0">
                        👑 Top 1
                      </span>
                    </div>
                    <div className="text-[11px] font-mono font-black text-orange-400">
                      🔥 {classBoardState.recordBreaker.points.toLocaleString('vi-VN')} điểm
                    </div>
                  </div>
                </div>
              )}

              <div
                className="font-extrabold text-yellow-200 text-center leading-snug my-auto px-2 drop-shadow-[0_2px_10px_rgba(250,204,21,0.45)]"
                style={{
                  fontSize: `${Math.max(11.5, Math.min(18, safeClassBoardFontSize + 1))}px`,
                }}
              >
                "
                {classBoardState?.recordNoticeText ||
                  'Chúc mừng bạn đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục hôm nay!'}
                "
              </div>
            </div>
          ) : activeEngine === 'english_quiz' && isPunishmentNoticePhase ? (
            /* LUỒNG THÔNG BÁO PHẠT ĐẶC BIỆT (Sau Luồng 6): Gọi các bạn tặng quà 5 / 10 / 10+ lên đứng phạt + nhận buff x3 / x6 / x9 */
            <div className="flex flex-col h-full justify-between py-1.5 px-2 select-none">
              <div
                className="flex items-center justify-between gap-2 pb-1 shrink-0"
                style={{
                  borderBottom: '1px dashed rgba(251, 113, 133, 0.45)',
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <BellRing className="w-3 h-3 text-rose-300 animate-bounce shrink-0" />
                  <span
                    className="font-black tracking-wide text-rose-300 uppercase truncate"
                    style={{
                      fontSize: `${Math.max(7.5, Math.round((safeClassBoardFontSize + 1) * 0.8 * 10) / 10)}px`,
                    }}
                  >
                    Thông Báo Phạt Đứng Bảng (1 Lượt)
                  </span>
                </div>
                <span className="px-1.5 py-[1px] rounded bg-amber-500/30 border border-amber-300 text-yellow-200 font-black text-[7.2px] shrink-0">
                  BUFF NHÂN ĐIỂM x3 / x6 / x9
                </span>
              </div>

              <div
                className="font-extrabold text-yellow-200 text-center leading-snug my-auto px-2 drop-shadow-[0_2px_10px_rgba(250,204,21,0.45)]"
                style={{
                  fontSize: `${Math.max(12.5, Math.min(20, safeClassBoardFontSize + 2))}px`,
                }}
              >
                "
                {classBoardState?.punishmentNoticeText ||
                  'Mời các bạn mới quậy trong lớp lên đây đứng 1 lượt!'}
                "
              </div>

              {Array.isArray(classBoardState?.punishedStudents) &&
                classBoardState.punishedStudents.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 shrink-0">
                    {classBoardState.punishedStudents.map((st, idx) => {
                      const mult = st.multiplier || 3;
                      const badgeColor =
                        mult === 9
                          ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 text-slate-950 border-yellow-100'
                          : mult === 6
                          ? 'bg-gradient-to-r from-fuchsia-600 via-pink-500 to-rose-500 text-white border-pink-200'
                          : 'bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 text-white border-cyan-200';
                      return (
                        <div
                          key={`punish-st-${idx}-${st.username}`}
                          className="px-2 py-0.5 rounded-full bg-slate-950/75 border border-white/35 flex items-center gap-1 shadow"
                        >
                          <span className="text-[9.5px] font-bold text-white truncate max-w-[88px]">
                            {st.username}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-black border ${badgeColor}`}
                          >
                            ⚡ x{mult}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          ) : activeEngine === 'english_quiz' && isLessonStartPhase ? (
            /* BẮT ĐẦU TIẾT HỌC: Chỉ hiển thị chữ lớn lời bắt đầu của cô giáo */
            <div className="flex flex-col h-full items-center justify-center relative select-none py-2 px-3">
              <div
                className="font-extrabold text-yellow-200 text-center leading-snug my-auto drop-shadow-[0_2px_10px_rgba(250,204,21,0.45)]"
                style={{
                  fontSize: `${Math.max(15, Math.min(28, safeClassBoardFontSize + 5))}px`,
                }}
              >
                {classBoardState?.lessonStartText ||
                  'Chào mừng các em đến với tiết học Tiếng Anh cùng cô giáo! Chúng ta cùng bắt đầu nhé!'}
              </div>
            </div>
          ) : activeEngine === 'english_quiz' && isPreparingPhase ? (
            /* BẢNG CHUẨN BỊ: Hiện chữ "CHUẨN BỊ" to + dòng chữ nhỏ "Bắt đầu sau 3, 2, 1" */
            <div className="flex flex-col h-full items-center justify-center relative select-none py-2">
              <div
                className="font-pixel-vi prepare-zoom-pulse font-black text-yellow-300 tracking-wider uppercase text-center leading-none my-auto"
                style={{
                  fontSize: `${Math.max(32, Math.min(58, safeClassBoardFontSize * 3.4))}px`,
                }}
              >
                CHUẨN BỊ
              </div>

              <div className="mt-1 px-3 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-300/60 text-emerald-100 font-mono font-bold text-[10.5px] flex items-center gap-1.5">
                <span>Bắt đầu sau</span>
                {[3, 2, 1].map((n, i) => {
                  const activeCountdown = Math.max(1, Math.min(3, remSec));
                  const isCurrentNum = activeCountdown === n;
                  return (
                    <React.Fragment key={n}>
                      <span
                        className={`font-black transition-transform ${
                          isCurrentNum
                            ? 'text-yellow-300 scale-125 underline'
                            : 'text-emerald-200/75'
                        }`}
                      >
                        {n}
                      </span>
                      {i < 2 && <span className="text-emerald-300/70">,</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ) : activeEngine === 'english_quiz' ? (
            <>
              {/* Header Bảng Lớp: Tiết Tiếng Anh + Đồng hồ (thu nhỏ 20%) */}
              <div
                className="flex items-center justify-between gap-2 pb-1 shrink-0"
                style={{
                  borderBottom: '1px dashed rgba(254, 240, 138, 0.28)',
                  fontSize: `${Math.max(6.5, Math.round((safeClassBoardFontSize - 2) * 0.8 * 10) / 10)}px`,
                }}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <BookOpen className="w-[11px] h-[11px] text-amber-300 shrink-0" />
                  <span className="font-extrabold tracking-wide text-amber-200 uppercase truncate">
                    {classBoardLessonTitle || 'Tiết Tiếng Anh'} • Câu #{qIdx + 1}/{totalQuizCount}
                  </span>
                  {Boolean(quizItem.luckyStars && quizItem.luckyStars >= 1) && (
                    <span
                      className={`px-1 py-[1px] rounded font-mono font-black text-[7.2px] leading-none border flex items-center gap-0.5 shrink-0 ${
                        quizItem.luckyStars === 3
                          ? 'bg-gradient-to-r from-amber-500 via-yellow-300 to-rose-500 text-slate-950 border-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.85)]'
                          : quizItem.luckyStars === 2
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-200'
                          : 'bg-amber-500/25 text-amber-200 border-amber-400/80'
                      }`}
                      title={`${quizItem.luckyStars} sao may mắn, x${(quizItem.luckyStars || 0) + 1} điểm`}
                    >
                      <span>{'⭐'.repeat(quizItem.luckyStars || 1)}</span>
                      <span>x{(quizItem.luckyStars || 0) + 1}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isAnswerFlashPhase || isLegacyRevealed ? (
                    <span className="px-1 py-[1px] rounded bg-emerald-500/35 border border-emerald-300 text-emerald-100 font-extrabold text-[7.6px] flex items-center gap-0.5 animate-pulse">
                      <Sparkles className="w-2 h-2 text-yellow-300" />
                      ĐÁP ÁN
                    </span>
                  ) : isBoardRunning ? (
                    <span
                      className={`px-1 py-[1px] rounded font-mono font-extrabold text-[8px] border ${
                        remSec <= 5
                          ? 'bg-rose-500/35 border-rose-300 text-rose-200 animate-pulse'
                          : 'bg-amber-500/25 border-amber-300/70 text-amber-200'
                      }`}
                    >
                      ⏱ {remSec}s
                    </span>
                  ) : (
                    <span className="px-1 py-[1px] rounded bg-slate-900/70 border border-slate-600/80 text-stone-300 font-bold text-[7.2px]">
                      TẠM DỪNG
                    </span>
                  )}
                </div>
              </div>

              {/* Nội dung trung tâm: Câu hỏi hoặc "Đáp án là:" + Các ô chữ cái tương ứng + Dòng sao may mắn bên dưới */}
              <div className="my-auto flex flex-col items-center justify-center gap-1.5 py-1">
                <div
                  className="text-center font-extrabold text-white leading-snug tracking-wide"
                  style={{ fontSize: `${safeClassBoardFontSize + 2}px` }}
                >
                  {isAnswerFlashPhase || isLegacyRevealed ? (
                    <span className="text-emerald-300 uppercase tracking-wider drop-shadow-[0_0_10px_rgba(52,211,153,0.85)]">
                      Đáp án là:
                    </span>
                  ) : (
                    <>
                      <span className="text-yellow-300">"{quizItem.vi}"</span>{' '}
                      <span>tiếng Anh là gì ?</span>
                    </>
                  )}
                </div>

                {/* Dãy ô chữ cái tương ứng với từ tiếng Anh */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 px-1">
                  {quizLetters.map((letter, idx) => {
                    const len = quizLetters.length;
                    const elapsedQuestionMs = Math.max(
                      elapsedPhaseMs,
                      totalDurMs - remMs
                    );
                    let showChar = false;
                    if (isAnswerFlashPhase || isLegacyRevealed) {
                      showChar = true;
                    } else if (
                      classBoardLetterMode === 'hint_3' ||
                      classBoardLetterMode === 'full'
                    ) {
                      // Gợi ý 3: 2 chữ cái đầu & cuối
                      showChar = idx === 0 || idx === len - 1;
                    } else if (
                      classBoardLetterMode === 'hint_2' ||
                      classBoardLetterMode === 'blank'
                    ) {
                      // Gợi ý 2: 2 chữ cái random
                      showChar = hint2RandomIndices.includes(idx);
                    } else {
                      // Mặc định ('default' / 'hint'): Luôn gợi ý 1 chữ cái đầu, 5s sau thêm 1 chữ nếu 6 ký tự, thêm 2 nếu 7-9 ký tự, thêm 3 nếu >= 10 ký tự
                      if (idx === 0) {
                        showChar = true;
                      } else if (
                        elapsedQuestionMs >= 5000 &&
                        defaultHintExtraIndices.includes(idx)
                      ) {
                        showChar = true;
                      }
                    }

                    const boxSize = Math.max(
                      20,
                      Math.min(
                        34,
                        Math.floor(
                          (safeClassBoardBox.width - 36 - (len - 1) * 6) /
                            Math.max(4, len)
                        )
                      )
                    );

                    return (
                      <div
                        key={`${quizItem.id}-char-${idx}`}
                        className={`rounded-md border-2 font-mono font-black flex items-center justify-center transition-all duration-300 ${
                          isAnswerFlashPhase || isLegacyRevealed
                            ? 'bg-emerald-500/75 border-emerald-200 text-white answer-green-flash'
                            : showChar
                            ? 'bg-amber-500/25 border-amber-300/90 text-amber-200'
                            : 'bg-slate-950/55 border-white/75 text-white/40'
                        }`}
                        style={{
                          width: `${boxSize}px`,
                          height: `${boxSize + 2}px`,
                          fontSize: `${Math.max(11, Math.min(20, Math.round(boxSize * 0.6)))}px`,
                        }}
                      >
                        {showChar ? letter : ''}
                      </div>
                    );
                  })}
                </div>

                {/* DÒNG SAO MAY MẮN MÀU VÀNG: Dời xuống phía dưới ô chữ và cách ra một khoảng trống nhỏ */}
                {Boolean(quizItem.luckyStars && quizItem.luckyStars >= 1) && (
                  <div className="mt-1.5 inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/25 via-yellow-400/30 to-amber-500/25 border border-yellow-300/90 shadow-[0_0_12px_rgba(250,204,21,0.65)]">
                    <span className="text-[10.5px] leading-none shrink-0">
                      {'⭐'.repeat(quizItem.luckyStars || 1)}
                    </span>
                    <span className="font-extrabold text-[10.5px] tracking-wide text-yellow-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                      {`${quizItem.luckyStars} sao may mắn, x${(quizItem.luckyStars || 0) + 1} điểm`}
                    </span>
                  </div>
                )}
              </div>

              {/* Thanh thời gian đếm ngược + Danh sách người chơi comment đúng */}
              <div className="space-y-1 shrink-0">
                {/* Thanh đếm ngược */}
                <div className="w-full h-2 rounded-full bg-slate-950/80 border border-white/25 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      isAnswerFlashPhase || isLegacyRevealed
                        ? 'bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400'
                        : timePercent > 50
                        ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                        : timePercent > 25
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
                        : 'bg-gradient-to-r from-rose-500 to-orange-400'
                    }`}
                    style={{
                      width: `${isAnswerFlashPhase || isLegacyRevealed ? 100 : timePercent}%`,
                    }}
                  />
                </div>

                {/* Dòng trạng thái trả lời dưới đáy bảng */}
                <div
                  className="flex items-center justify-between gap-1 text-stone-100 leading-tight truncate"
                  style={{ fontSize: `${Math.max(8, safeClassBoardFontSize - 2.5)}px` }}
                >
                  {isAnswerFlashPhase || isLegacyRevealed ? (
                    <span className="text-emerald-200 font-extrabold truncate">
                      ✨ {quizItem.vi} = {quizItem.en.toUpperCase()}{' '}
                      {quizItem.phonetic ? `(${quizItem.phonetic})` : ''}
                    </span>
                  ) : boardWinners.length > 0 ? (
                    <div className="flex items-center gap-1 min-w-0 truncate text-emerald-200 font-bold">
                      <Trophy className="w-3 h-3 text-yellow-300 shrink-0" />
                      <span className="truncate">
                        Trong lớp: {classWinners.length} đúng • Học ké: {outsideWinners.length} đúng
                      </span>
                    </div>
                  ) : (
                    <span className="text-stone-200/90 truncate">
                      💬 Comment đáp án tiếng Anh ({quizLetters.length} chữ cái) để giữ chỗ ngồi!
                    </span>
                  )}
                  {!(isAnswerFlashPhase || isLegacyRevealed) && (
                    <span className="font-mono text-amber-300/95 font-bold shrink-0">
                      Còn {String(remSec).padStart(2, '0')} giây
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Engine 2: Bảng Thông Báo Tự Do */
            <div className="flex flex-col h-full justify-between">
              <div
                className="flex items-center gap-1.5 pb-1 shrink-0"
                style={{
                  borderBottom: '1px dashed rgba(254, 240, 138, 0.3)',
                  fontSize: `${safeClassBoardFontSize}px`,
                }}
              >
                <BellRing className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="font-extrabold tracking-wide text-amber-200 truncate">
                  {noticeBoardTitle || 'Bảng Lớp 12A1'}
                </span>
              </div>
              <div
                className="my-auto text-center text-white font-bold leading-relaxed whitespace-pre-line break-words px-2"
                style={{ fontSize: `${safeClassBoardFontSize + 1}px` }}
              >
                {noticeBoardContent}
              </div>
              <div
                className="text-center text-amber-200/80 font-semibold shrink-0"
                style={{ fontSize: `${Math.max(8, safeClassBoardFontSize - 2.5)}px` }}
              >
                ★ Lớp 12A1 • Tiên Học Lễ - Hậu Học Văn ★
              </div>
            </div>
          )}
          </div>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="classBoardBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-emerald-400 text-stone-950 text-[9px] font-extrabold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> Bảng Lớp ({safeClassBoardBox.width}×{safeClassBoardBox.height})
              </span>
            </>
          )}
        </div>
      )}
      {/* 1. BIỂN TÊN LỚP HỌC (LỚP 12A1 - THPT CHUYÊN) */}
      {showTempleSign && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('templeSign', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('templeSign', e)}
          className={`absolute z-30 flex items-center justify-center select-none ${dragringClass}`}
          style={{
            left: `${templeSign.x}px`,
            top: `${templeSign.y}px`,
            width: `${templeSign.width}px`,
            height: `${templeSign.height}px`,
            opacity: opTempleSign,
          }}
        >
          {customAssets.templeSignPngUrl ? (
            <img
              src={customAssets.templeSignPngUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.85)]"
            />
          ) : (
            <svg
              className="w-full h-full drop-shadow-[0_5px_10px_rgba(0,0,0,0.65)]"
              viewBox="0 0 210 52"
              preserveAspectRatio="none"
            >
              <rect
                x="4"
                y="4"
                width="202"
                height="44"
                rx="8"
                fill="#1e3a8a"
                stroke="#facc15"
                strokeWidth="3"
              />
              <rect
                x="9"
                y="9"
                width="192"
                height="34"
                rx="5"
                fill="none"
                stroke="#93c5fd"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              <text
                x="105"
                y="26"
                textAnchor="middle"
                fill="#fef08a"
                fontSize="14"
                fontWeight="900"
                letterSpacing="1.2"
              >
                LỚP 12A1 • CHĂM NGOAN
              </text>
              <text
                x="105"
                y="38"
                textAnchor="middle"
                fill="#bae6fd"
                fontSize="8.5"
                fontWeight="700"
              >
                TRƯỜNG THPT TRỰC TUYẾN
              </text>
            </svg>
          )}

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="templeSign"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> Biển Lớp ({templeSign.width}×{templeSign.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 2. BẢNG SỰ KIỆN LỚP HỌC (KÍCH HOẠT SỰ KIỆN): Sau khi kích hoạt sẽ highlight viền chớp liên tục cho đến khi event kết thúc */}
      {showGrandEventBox && grandEventBox && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('grandEventBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('grandEventBox', e)}
          className={`absolute z-30 rounded-lg px-2.5 py-1.5 border-2 flex flex-col justify-between transition-colors ${
            isEventPendingOrRunning ? 'grand-event-activated-border-blink' : ''
          } ${dragringClass}`}
          style={{
            left: `${grandEventBox.x}px`,
            top: `${grandEventBox.y}px`,
            width: `${grandEventBox.width}px`,
            height: `${grandEventBox.height}px`,
            ...buildBoxSurfaceStyle(
              opGrandEvent,
              isEventPendingOrRunning ? '253, 224, 71' : '244, 114, 182',
              isEventPendingOrRunning ? 0.98 : 0.65,
              isEventPendingOrRunning ? '69, 26, 3' : '15, 23, 42'
            ),
          }}
        >
          <div
            className="flex items-center justify-between gap-1 pb-0.5"
            style={{
              fontSize: `${safeGrandEventFontSize}px`,
              borderBottom:
                opGrandEvent > 0.05
                  ? `1px solid rgba(244, 114, 182, ${(0.28 * opGrandEvent).toFixed(2)})`
                  : '1px solid transparent',
            }}
          >
            <span className="font-extrabold tracking-wide text-pink-200 truncate">
              {!grandEventTitle || grandEventTitle === 'Liên Hoan Trà Sữa'
                ? 'Kích hoạt sự kiện'
                : grandEventTitle}
            </span>
            <span
              className="font-bold font-mono text-amber-300 tabular-nums shrink-0"
              style={{ fontSize: `${Math.max(7, safeGrandEventFontSize - 0.5)}px` }}
            >
              {`${grandEventProgress}/${safeTarget}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 pt-1 my-auto">
            <div className="w-6 h-6 shrink-0 flex items-center justify-center pink-lotus-blink">
              <Flower10BadgeIcon className="w-6 h-6" />
            </div>

            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <div
                key={eventBarFlashKey || 0}
                className={`w-full h-2.5 rounded-full bg-slate-900/90 border border-pink-400/45 overflow-hidden p-0.5 ${
                  eventBarFlashKey ? 'event-bar-pink-flash' : ''
                }`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pink-500 via-rose-400 to-amber-300 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div
                className="flex items-center justify-start text-stone-200 leading-none"
                style={{ fontSize: `${Math.max(7, safeGrandEventFontSize - 1.5)}px` }}
              >
                <span className="truncate font-semibold text-pink-200">
                  +10 Hoa / Câu đúng
                </span>
              </div>
            </div>
          </div>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="grandEventBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" />{' '}
                {!grandEventTitle || grandEventTitle === 'Liên Hoan Trà Sữa'
                  ? 'Kích hoạt sự kiện'
                  : grandEventTitle}{' '}
                ({grandEventBox.width}×{grandEventBox.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 3. BẢNG ĐẾM SĨ SỐ LỚP HỌC (Mặc định ẩn dòng Hàng chờ, có thể bật trong Dev) */}
      {showPilgrimCountBox && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('pilgrimCountBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('pilgrimCountBox', e)}
          className={`absolute z-30 rounded-lg border px-2.5 py-1 flex flex-col justify-center gap-0.5 ${dragringClass}`}
          style={{
            left: `${safePilgrimBox.x}px`,
            top: `${safePilgrimBox.y}px`,
            width: `${safePilgrimBox.width}px`,
            height: `${safePilgrimBox.height}px`,
            fontSize: `${safePilgrimCountFontSize}px`,
            ...buildBoxSurfaceStyle(opPilgrimCount),
          }}
        >
          {/* Dòng 1: Sĩ số lớp */}
          <div className="flex items-center justify-between gap-2 leading-tight">
            <div className="flex items-center gap-1.5 min-w-0">
              <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-extrabold text-amber-200 truncate">
                {pilgrimCountTitle || 'Sĩ số lớp'}:
              </span>
            </div>
            <span
              className="font-extrabold font-mono text-emerald-400 tabular-nums shrink-0"
              style={{ fontSize: `${safePilgrimCountFontSize + 0.5}px` }}
            >
              {currentPilgrimCount}/{totalSeatCapacity}
            </span>
          </div>

          {/* Dòng 2: Hàng chờ (Mặc định ẩn, chỉ hiện khi bật trong Dev) */}
          {showQueueInPilgrimCountBox && (
            <div className="flex items-center justify-between gap-2 leading-tight pt-0.5 border-t border-white/10">
              <div className="flex items-center gap-1.5 min-w-0">
                <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                <span className="font-bold text-cyan-200 truncate">
                  Hàng chờ:
                </span>
              </div>
              <span
                className="font-extrabold font-mono text-cyan-300 tabular-nums shrink-0"
                style={{ fontSize: `${safePilgrimCountFontSize}px` }}
              >
                {typeof queueCount === 'number' ? queueCount : waitingQueue.length}
              </span>
            </div>
          )}

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="pilgrimCountBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> {pilgrimCountTitle || 'Sĩ số'} ({safePilgrimBox.width}×{safePilgrimBox.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 3.5. BẢNG HÀNG CHỜ VÀO LỚP (Ẩn trong khi sự kiện xảy ra, kết thúc hiện lên lại; chỉ hiển thị Rank - Tên - đ) */}
      {showWaitingQueueBox && !isZombieEventActive && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('waitingQueueBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('waitingQueueBox', e)}
          className={`absolute z-30 rounded-lg border px-2 py-1.5 flex flex-col justify-between ${dragringClass}`}
          style={{
            left: `${safeWaitingQueueBox.x}px`,
            top: `${safeWaitingQueueBox.y}px`,
            width: `${safeWaitingQueueBox.width}px`,
            height: `${safeWaitingQueueBox.height}px`,
            ...buildBoxSurfaceStyle(opWaitingQueue, '34, 211, 238'),
          }}
        >
          <div
            className="flex items-center justify-between gap-1 pb-0.5 mb-1 shrink-0"
            style={{
              fontSize: `${safeWaitingQueueFontSize}px`,
              borderBottom:
                opWaitingQueue > 0.05
                  ? `1px solid rgba(34, 211, 238, ${(0.3 * opWaitingQueue).toFixed(2)})`
                  : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-extrabold tracking-wide text-cyan-200 truncate">
                {waitingQueueTitle || 'Hàng Chờ Vào Lớp'}
              </span>
            </div>
            <span className="font-mono font-extrabold text-amber-300 shrink-0">
              ({typeof queueCount === 'number' ? queueCount : waitingQueue.length})
            </span>
          </div>

          <div
            className="space-y-0.5 flex-1 flex flex-col justify-start overflow-y-auto"
            style={{ fontSize: `${Math.max(7.5, safeWaitingQueueFontSize - 0.5)}px` }}
          >
            {waitingQueue.length > 0 ? (
              waitingQueue.slice(0, safeWaitingQueueMaxRanks).map((item, idx) => (
                <div
                  key={`${item.username}-${idx}`}
                  className={`flex items-center justify-between gap-1 leading-tight px-1 py-0.5 rounded ${
                    item.isGoldenPriority
                      ? 'bg-amber-500/25 border border-yellow-300/75 text-yellow-200 shadow-[0_0_8px_rgba(250,204,21,0.35)]'
                      : 'text-stone-100'
                  }`}
                >
                  <div className="flex items-center gap-1 min-w-0 truncate">
                    <b
                      className={`font-mono shrink-0 ${
                        item.isGoldenPriority ? 'text-yellow-300' : 'text-cyan-300'
                      }`}
                    >
                      {item.isGoldenPriority ? '👑' : `#${item.rank || idx + 1}`}
                    </b>
                    <span
                      className={`truncate ${
                        item.isGoldenPriority
                          ? 'text-yellow-300 font-black drop-shadow-[0_1px_4px_rgba(250,204,21,0.65)]'
                          : ''
                      }`}
                    >
                      {item.username}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-yellow-300 text-[8.5px] shrink-0">
                    {item.points || 0}đ
                  </span>
                </div>
              ))
            ) : (
              <div className="my-auto text-center text-stone-400 italic leading-tight">
                Comment &quot;vào lớp&quot; để xếp hàng
              </div>
            )}
          </div>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="waitingQueueBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 right-0 px-1.5 py-0.5 rounded bg-cyan-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> {waitingQueueTitle || 'Hàng Chờ'} ({safeWaitingQueueBox.width}×{safeWaitingQueueBox.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 4. BẢNG TIN LỚP HỌC (Tạm ẩn khi sự kiện Zombie, khi khóa Camera, hoặc khi có người đứng chịu phạt trên lớp) */}
      {showNoticeBoardBox &&
        !isZombieEventActive &&
        !isCameraLocked &&
        !hasPunishedStudentsOnStage && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('noticeBoardBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('noticeBoardBox', e)}
          className={`absolute rounded-lg border px-2.5 py-1.5 flex flex-col ${dragringClass}`}
          style={{
            left: `${safeNoticeBoardBox.x}px`,
            top: `${safeNoticeBoardBox.y}px`,
            width: `${safeNoticeBoardBox.width}px`,
            height: `${safeNoticeBoardBox.height}px`,
            zIndex: editLayoutMode ? 55 : 45,
            ...buildBoxSurfaceStyle(opNotice),
            ...noticeBoardCycleStyle,
          }}
        >
          <div
            className="flex items-center gap-1 pb-0.5 mb-1 shrink-0"
            style={{
              fontSize: `${safeNoticeFontSize}px`,
              borderBottom:
                opNotice > 0.05
                  ? `1px solid rgba(245, 158, 11, ${(0.3 * opNotice).toFixed(2)})`
                  : '1px solid transparent',
            }}
          >
            <BellRing className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="font-extrabold tracking-wide text-amber-300 truncate">
              {noticeBoardTitle || 'Bảng Tin Lớp'}
            </span>
          </div>
          <div
            className="flex-1 overflow-hidden text-stone-100 leading-snug whitespace-pre-line break-words"
            style={{
              fontSize: `${safeNoticeFontSize}px`,
            }}
          >
            {noticeBoardContent}
          </div>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="noticeBoardBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> {noticeBoardTitle || 'Bảng tin'} ({safeNoticeBoardBox.width}×{safeNoticeBoardBox.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 6. BẢNG HƯỚNG DẪN TƯƠNG TÁC LỚP HỌC / QUÀ TẶNG (Tạm ẩn khi sự kiện Zombie hoặc khi khóa Camera) */}
      {showGuideBox && !isZombieEventActive && !isCameraLocked && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('guideBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('guideBox', e)}
          className={`absolute z-30 rounded-lg border p-1.5 flex flex-col justify-between overflow-visible ${dragringClass}`}
          style={{
            left: `${guideBox.x}px`,
            top: `${guideBox.y}px`,
            width: `${guideBox.width}px`,
            height: `${guideBox.height}px`,
            ...buildBoxSurfaceStyle(opGuide),
            ...guideCycleStyle,
          }}
        >
          <div
            className="text-center pb-0.5 mb-1 shrink-0"
            style={{
              borderBottom:
                opGuide > 0.05
                  ? `1px solid rgba(245, 158, 11, ${(0.3 * opGuide).toFixed(2)})`
                  : '1px solid transparent',
            }}
          >
            <div
              className="font-extrabold tracking-wide text-amber-300 truncate"
              style={{ fontSize: `${safeGuideFontSize + 1}px` }}
            >
              {guideTitle}
            </div>
          </div>

          <div
            className="flex-1 flex flex-col justify-between gap-0.5 leading-tight text-stone-200 overflow-visible"
            style={{ fontSize: `${safeGuideFontSize}px` }}
          >
            {activeGuideItems.length > 0 ? (
              activeGuideItems.map((task) => {
                const { borderRgb, labelClass, descClass } =
                  getGuideTaskColorClasses(task);
                const hasModel =
                  Boolean(task.modelType) && task.modelType !== 'none';
                const rowBg =
                  opGuide <= 0.005
                    ? 'transparent'
                    : `rgba(30, 41, 59, ${Math.min(1, opGuide * 0.92).toFixed(2)})`;
                const rowBorder =
                  opGuide <= 0.005
                    ? 'transparent'
                    : `rgba(${borderRgb}, ${(0.45 * opGuide).toFixed(2)})`;
                const badgeBg =
                  opGuide <= 0.005
                    ? 'transparent'
                    : `rgba(15, 23, 42, ${opGuide.toFixed(2)})`;
                const badgeBorder =
                  opGuide <= 0.005
                    ? 'transparent'
                    : `rgba(251, 191, 36, ${(0.65 * opGuide).toFixed(2)})`;

                return (
                  <div
                    key={task.id}
                    className="relative px-1.5 py-0.5 rounded border flex items-center justify-between gap-1"
                    style={{
                      backgroundColor: rowBg,
                      borderColor: rowBorder,
                    }}
                  >
                    <div className="flex items-center gap-1 min-w-0 shrink-0">
                      {hasModel && (
                        <div
                          title={`Quà tặng: ${task.label} - ${task.shortDesc}`}
                          className="w-4 h-4 rounded border flex items-center justify-center shrink-0 pointer-events-none"
                          style={{
                            backgroundColor: badgeBg,
                            borderColor: badgeBorder,
                          }}
                        >
                          <SchoolGiftArt
                            type={task.modelType as OfferingGiftType}
                            customAssets={customAssets}
                            size="sm"
                            className="w-3.5 h-3.5"
                          />
                        </div>
                      )}
                      <span className={`font-bold shrink-0 ${labelClass}`}>
                        {task.label ? `${task.label}:` : ''}
                      </span>
                    </div>
                    <span className={`truncate text-right ${descClass}`}>
                      {task.shortDesc}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="my-auto text-center text-stone-400 italic">
                Chưa có dòng hướng dẫn
              </div>
            )}
          </div>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="guideBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -bottom-5 right-0 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> {guideTitle} ({guideBox.width}×{guideBox.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 7. BẢNG COMMENT (Lót dưới phần comment TikTok cho chữ hiện rõ — Xóa tiêu đề & chức năng trôi thông báo) */}
      {showToastBox && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('toastBox', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('toastBox', e)}
          className={`absolute z-30 rounded-lg border ${dragringClass}`}
          style={{
            left: `${toastBox.x}px`,
            top: `${toastBox.y}px`,
            width: `${toastBox.width}px`,
            height: `${toastBox.height}px`,
            ...buildBoxSurfaceStyle(opToast),
          }}
        >
          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="toastBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> Bảng Comment ({toastBox.width}×{toastBox.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 8. BẢNG NOTE 1 ("Đây là trò chơi 2D.") */}
      {showNote1Box && (
        <div
          onMouseDown={(e) => editLayoutMode && onStartDragHudBox('note1Box', e)}
          onTouchStart={(e) => editLayoutMode && onStartDragHudBox('note1Box', e)}
          className={`absolute z-30 rounded-lg border px-2 py-1 flex items-center justify-center text-center select-none ${dragringClass}`}
          style={{
            left: `${safeNote1Box.x}px`,
            top: `${safeNote1Box.y}px`,
            width: `${safeNote1Box.width}px`,
            height: `${safeNote1Box.height}px`,
            fontSize: `${safeNote1FontSize}px`,
            ...buildBoxSurfaceStyle(opNote1, '251, 191, 36'),
          }}
        >
          <span className="font-bold text-amber-200 leading-tight break-words">
            {note1Content || 'Đây là trò chơi 2D.'}
          </span>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="note1Box"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-amber-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> {note1Title || 'Note 1'} ({safeNote1Box.width}×{safeNote1Box.height})
              </span>
            </>
          )}
        </div>
      )}

      {/* 9. BẢNG "KỶ LỤC HÔM NAY" (Lưu 5 bạn điểm cao nhất ngày • Format: Avatar / Tên / Điểm màu cam / Thẻ Top 1,2,3,4,5 + Animation + Nút Reset — Tạm ẩn khi sự kiện Zombie xảy ra) */}
      {showDailyRecordBox && !isZombieEventActive && (
        <div
          onMouseDown={(e) =>
            editLayoutMode && onStartDragHudBox('dailyRecordBox', e)
          }
          onTouchStart={(e) =>
            editLayoutMode && onStartDragHudBox('dailyRecordBox', e)
          }
          className={`absolute z-30 rounded-lg border px-2 py-1.5 flex flex-col justify-between select-none ${dragringClass}`}
          style={{
            left: `${safeDailyRecordBox.x}px`,
            top: `${safeDailyRecordBox.y}px`,
            width: `${safeDailyRecordBox.width}px`,
            height: `${safeDailyRecordBox.height}px`,
            fontSize: `${safeDailyRecordFontSize}px`,
            ...buildBoxSurfaceStyle(opDailyRecord, '251, 146, 60'),
            ...dailyRecordCycleStyle,
          }}
        >
          <style>{`
            @keyframes dailyRecordTop1Glow {
              0%, 100% {
                box-shadow: 0 0 6px rgba(251, 146, 60, 0.35);
              }
              50% {
                box-shadow: 0 0 12px rgba(250, 204, 21, 0.75);
              }
            }
          `}</style>
          {/* Tiêu đề Bảng Kỷ Lục Hôm Nay + Nút Reset */}
          <div
            className="flex items-center justify-between gap-1 pb-0.5 mb-0.5 shrink-0"
            style={{
              borderBottom:
                opDailyRecord <= 0.005
                  ? 'none'
                  : `1px solid rgba(251, 146, 60, ${(0.38 * opDailyRecord).toFixed(2)})`,
            }}
          >
            <div className="flex items-center gap-1 min-w-0">
              <Trophy className="w-3 h-3 text-orange-400 shrink-0 animate-pulse" />
              <span className="font-extrabold tracking-wide text-amber-200 uppercase truncate">
                {dailyRecordTitle || 'Kỷ lục hôm nay'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onResetDailyRecords && editLayoutMode && (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetDailyRecords();
                  }}
                  title="Reset Kỷ lục hôm nay về 0"
                  className="pointer-events-auto px-1.5 py-0.2 rounded bg-rose-600/90 hover:bg-rose-500 border border-rose-300/70 text-[7.5px] font-black text-white shadow cursor-pointer transition-colors"
                >
                  Reset
                </button>
              )}
              <span className="px-1 py-[1px] rounded bg-orange-500/25 border border-orange-400/50 text-[7.5px] font-black text-orange-200">
                Top 5
              </span>
            </div>
          </div>

          {/* Danh sách 5 bạn điểm cao nhất ngày: Avatar / Tên / Điểm màu cam / Thẻ Top 1, 2, 3, 4, 5 */}
          <div className="flex-1 min-h-0 flex flex-col justify-between gap-0.5 overflow-hidden">
            {[0, 1, 2, 3, 4].map((idx) => {
              const rec = top5DailyRecords[idx];
              const rank = idx + 1;
              const topTagClass =
                rank === 1
                  ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 text-stone-950 border-yellow-100 shadow-[0_0_6px_rgba(250,204,21,0.75)]'
                  : rank === 2
                  ? 'bg-gradient-to-r from-slate-200 to-stone-300 text-stone-950 border-white'
                  : rank === 3
                  ? 'bg-gradient-to-r from-amber-600 to-orange-500 text-white border-amber-300'
                  : 'bg-slate-800/90 text-stone-200 border-stone-600';

              return (
                <div
                  key={`daily-rec-${rank}-${rec?.username || 'empty'}`}
                  className={`flex items-center justify-between gap-1 px-1 py-0.2 rounded border transition-all duration-300 ${
                    rank === 1 && rec
                      ? 'bg-orange-950/45 border-orange-400/60'
                      : 'bg-slate-950/45 border-white/10'
                  }`}
                  style={
                    rank === 1 && rec
                      ? { animation: 'dailyRecordTop1Glow 2.4s infinite ease-in-out' }
                      : undefined
                  }
                >
                  {/* 1. Avatar + 2. Tên */}
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <div
                      className="w-3.5 h-3.5 rounded-full border border-amber-300/70 overflow-hidden flex items-center justify-center shrink-0 text-[6.5px] font-black text-white"
                      style={{
                        backgroundColor: rec?.avatarColor || '#334155',
                      }}
                    >
                      {rec?.avatarUrl ? (
                        <img
                          src={rec.avatarUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : rec ? (
                        rec.username.slice(0, 2).toUpperCase()
                      ) : (
                        '-'
                      )}
                    </div>
                    <span
                      className={`truncate ${
                        rank === 1 && rec
                          ? 'font-black text-yellow-100'
                          : rec
                          ? 'font-bold text-stone-100'
                          : 'text-stone-500 italic'
                      }`}
                    >
                      {rec ? rec.username : 'Chưa có kỷ lục'}
                    </span>
                  </div>

                  {/* 3. Điểm màu cam + 4. Thẻ Top 1, 2, 3, 4, 5 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono font-black text-orange-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {rec ? rec.points.toLocaleString('vi-VN') : '0'}
                    </span>
                    <span
                      className={`px-1 py-[0.5px] rounded text-[7px] font-black border leading-tight shrink-0 ${topTagClass}`}
                    >
                      Top {rank}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {editLayoutMode && (
            <>
              <CornerResizeHandles
                boxKey="dailyRecordBox"
                onStartResizeHudBox={onStartResizeHudBox}
              />
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-orange-400 text-stone-950 text-[9px] font-bold flex items-center gap-0.5 whitespace-nowrap shadow">
                <Move className="w-2.5 h-2.5" /> {dailyRecordTitle || 'Kỷ lục hôm nay'} ({safeDailyRecordBox.width}×{safeDailyRecordBox.height})
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
