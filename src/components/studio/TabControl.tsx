import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  BookOpen,
  Download,
  FileUp,
  Footprints,
  Heart,
  ImagePlus,
  MessageSquareQuote,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Shuffle,
  SkipForward,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import {
  ClassBoardEngineId,
  ClassBoardLetterMode,
  ClassBoardRuntimeState,
  ClassroomGiftEventId,
  CustomAssetsConfig,
  DailyRecordEntry,
  EnglishQuizItem,
  GameConfig,
  GuideTaskItem,
  HudBoxCycleConfig,
  HudLayoutConfig,
  OfferingGiftType,
  WaitingQueueItem,
} from '../../types/game';
import {
  CLASSROOM_GIFT_EVENTS_META,
  DEFAULT_GUIDE_ITEMS,
  DEFAULT_QUIZ_DECKS,
  ENGLISH_QUIZ_QUESTIONS,
  formatEnglishQuizTxt,
} from '../../config/constants';
import {
  QUIZ_DECK_SCHEMA_VERSION,
  build15MinuteTieredRoundQuestions,
  ensureTieredQuizDecksLoaded,
  getQuizLevelRewardInfo,
  normalizeQuizDeckFileName,
} from '../../config/vocabDecks';
import {
  parseLargeQuizTxtChunked,
  prepareEnqueuedQuestions,
} from '../../utils/quizDeckEngine';
import { Flower10BadgeIcon, GoldTrophyIcon, SchoolGiftArt } from '../stage/SchoolGiftArt';
import {
  TeacherLiveVoiceOptions,
  TeacherLiveVoiceStatus,
} from '../../services/soundEngine';
import { TeacherLiveVoiceCard } from './TeacherLiveVoiceCard';

interface HudCycleSettingsCardProps {
  title: string;
  cycle?: HudBoxCycleConfig;
  onChange: (nextCycle: HudBoxCycleConfig) => void;
}

const HudCycleSettingsCard: React.FC<HudCycleSettingsCardProps> = ({
  title,
  cycle,
  onChange,
}) => {
  const safeCycle: HudBoxCycleConfig = {
    enabled: Boolean(cycle?.enabled),
    hiddenSec: Math.max(0.5, Number(cycle?.hiddenSec ?? 5)),
    visibleSec: Math.max(0.5, Number(cycle?.visibleSec ?? 8)),
    mode: cycle?.mode || 'slide_right',
    animSpeedSec: Math.max(0.15, Math.min(3, Number(cycle?.animSpeedSec ?? 0.55))),
  };

  const update = (patch: Partial<HudBoxCycleConfig>) => {
    onChange({ ...safeCycle, ...patch });
  };

  return (
    <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold text-cyan-200 truncate">
          🔄 Chạy bảng theo chu kỳ ({title})
        </span>
        <button
          type="button"
          onClick={() => update({ enabled: !safeCycle.enabled })}
          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border cursor-pointer transition shrink-0 ${
            safeCycle.enabled
              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
              : 'bg-stone-900 border-stone-700 text-stone-400'
          }`}
        >
          {safeCycle.enabled ? '🟢 ĐANG CHẠY CHU KỲ' : '⚪ ĐANG TẮT'}
        </button>
      </div>

      {/* 2 chế độ chạy: Đẩy sang phải màn hình / Fade biến mất */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => update({ mode: 'slide_right' })}
          className={`py-1 px-2 rounded text-[10px] font-bold border cursor-pointer transition ${
            safeCycle.mode === 'slide_right'
              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
              : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          1. Đẩy ra cạnh phải màn hình
        </button>
        <button
          type="button"
          onClick={() => update({ mode: 'fade' })}
          className={`py-1 px-2 rounded text-[10px] font-bold border cursor-pointer transition ${
            safeCycle.mode === 'fade'
              ? 'bg-amber-500/25 border-amber-400 text-amber-200'
              : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
          }`}
        >
          2. Fade mờ biến mất
        </button>
      </div>

      {/* Thời gian ẩn x giây, thời gian hiển thị y giây, tốc độ animation */}
      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
        <div className="p-1.5 rounded bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-stone-400">Chu kỳ ẩn (x):</span>
            <span className="font-mono font-bold text-rose-300">
              {safeCycle.hiddenSec}s
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={60}
            step={0.5}
            value={safeCycle.hiddenSec}
            onChange={(e) =>
              update({ hiddenSec: Math.max(0.5, parseFloat(e.target.value) || 5) })
            }
            className="w-full accent-rose-400 h-1 bg-stone-800 rounded-lg cursor-pointer"
          />
        </div>

        <div className="p-1.5 rounded bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-stone-400">Hiển thị (y):</span>
            <span className="font-mono font-bold text-emerald-300">
              {safeCycle.visibleSec}s
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={60}
            step={0.5}
            value={safeCycle.visibleSec}
            onChange={(e) =>
              update({ visibleSec: Math.max(0.5, parseFloat(e.target.value) || 8) })
            }
            className="w-full accent-emerald-400 h-1 bg-stone-800 rounded-lg cursor-pointer"
          />
        </div>

        <div className="p-1.5 rounded bg-stone-900/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-stone-400">Tốc độ anim:</span>
            <span className="font-mono font-bold text-amber-300">
              {safeCycle.animSpeedSec.toFixed(2)}s
            </span>
          </div>
          <input
            type="range"
            min={0.15}
            max={2.5}
            step={0.05}
            value={safeCycle.animSpeedSec}
            onChange={(e) =>
              update({
                animSpeedSec: Math.max(0.15, parseFloat(e.target.value) || 0.55),
              })
            }
            className="w-full accent-amber-400 h-1 bg-stone-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

interface TabControlProps {
  config: GameConfig;
  customAssets?: CustomAssetsConfig;
  classBoardState?: ClassBoardRuntimeState;
  realCount: number;
  botCount: number;
  queueCount: number;
  waitingQueue?: WaitingQueueItem[];
  grandEventProgress: number;
  ttsStatus: { text: string; active: boolean };
  eventTtsQueue?: {
    waitingCount: number;
    isPlayingEvent: boolean;
    currentEventText: string | null;
    queueItems: string[];
  };
  onClearEventTtsQueue?: () => void;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onUpdateHudLayout: (patch: Partial<HudLayoutConfig>) => void;
  onToggleClassBoardRun?: () => void;
  onRestartClassBoardFromStart?: () => void;
  onRunNoticeBoard?: () => void;
  onNextClassBoardQuestion?: () => void;
  onSimulateQuizAnswer?: (customUsername?: string) => void;
  onEnqueueWaitingStudent?: (customUsername?: string, customComment?: string) => void;
  onRemoveWaitingQueueItem?: (username: string) => void;
  onClearWaitingQueue?: () => void;
  onClearNpcWaitingQueue?: () => void;
  onAdmitNextWaitingStudent?: () => void;
  onSpeakHostLiveText: (
    text: string,
    options?: {
      interrupt?: boolean;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }
  ) => void;
  teacherLiveStatus?: TeacherLiveVoiceStatus;
  onSpeakTeacherLiveVoice: (
    text: string,
    options?: TeacherLiveVoiceOptions & { showBubble?: boolean }
  ) => void;
  onStopTeacherLiveVoice: () => void;
  onPanicMute: () => void;
  onSpawnRandom: (isVip: boolean) => void;
  onSpawnBatch: (count: number) => void;
  onLeaveAll: () => void;
  onSpawnCustom: (
    username: string,
    prayer: string,
    isVip: boolean,
    coins?: number,
    avatarUrl?: string | null
  ) => void;
  onTriggerLike: (count: number, username?: string) => void;
  onTriggerFollow: (username?: string) => void;
  onTriggerGrandEvent: () => void;
  onTriggerGiftCombo: (
    mode: 'streak_50_roses' | 'instant_50_roses' | 'multi_user_combo_storm',
    customUsername?: string,
    customPrayer?: string,
    customAvatarUrl?: string | null
  ) => void;
  onTriggerClassroomGift?: (
    rawGiftName: string,
    coins: number,
    customUsername?: string,
    customAvatarUrl?: string | null,
    preferSeatedIfBlank?: boolean,
    comboCount?: number
  ) => void;
  dailyRecords?: DailyRecordEntry[];
  onResetDailyRecords?: () => void;
}

export const TabControl: React.FC<TabControlProps> = ({
  config,
  customAssets,
  classBoardState,
  realCount,
  botCount,
  queueCount,
  waitingQueue = [],
  grandEventProgress,
  ttsStatus,
  eventTtsQueue,
  onClearEventTtsQueue,
  onUpdateConfig,
  onUpdateHudLayout,
  onToggleClassBoardRun,
  onRestartClassBoardFromStart,
  onRunNoticeBoard,
  onNextClassBoardQuestion,
  onSimulateQuizAnswer,
  onEnqueueWaitingStudent,
  onRemoveWaitingQueueItem,
  onClearWaitingQueue,
  onClearNpcWaitingQueue,
  onAdmitNextWaitingStudent,
  onSpeakHostLiveText,
  teacherLiveStatus,
  onSpeakTeacherLiveVoice,
  onStopTeacherLiveVoice,
  onPanicMute,
  onSpawnRandom,
  onSpawnBatch,
  onLeaveAll,
  onSpawnCustom,
  onTriggerLike,
  onTriggerFollow,
  onTriggerGrandEvent,
  onTriggerGiftCombo,
  onTriggerClassroomGift,
  dailyRecords = [],
  onResetDailyRecords,
}) => {
  const [customName, setCustomName] = useState('Nguyễn Hoàng Bảo Ngọc');
  const [customPrayer, setCustomPrayer] = useState(
    'Thưa cô em xin phép phát biểu xây dựng bài ạ! ✋'
  );
  const [customVip, setCustomVip] = useState(false);
  const [customCoins, setCustomCoins] = useState(10);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [giftTestTargetMode, setGiftTestTargetMode] = useState<
    'in_class' | 'queue_or_outside'
  >('in_class');
  const [giftTestComboCount, setGiftTestComboCount] = useState<number>(1);
  const [showBoardSizeSliders, setShowBoardSizeSliders] = useState(true);
  const [showTeacherFlowScript, setShowTeacherFlowScript] = useState(false);
  const [quizImportFeedback, setQuizImportFeedback] = useState<string | null>(null);
  const [isParsingQuizTxt, setIsParsingQuizTxt] = useState(false);
  const [queueSearchQuery, setQueueSearchQuery] = useState('');
  const [selectedGuideIdx, setSelectedGuideIdx] = useState<number>(0);

  const activeQuizList =
    Array.isArray(config.customQuizQuestions) && config.customQuizQuestions.length > 0
      ? config.customQuizQuestions
      : ENGLISH_QUIZ_QUESTIONS;

  const quizDecks = useMemo(
    () =>
      ensureTieredQuizDecksLoaded(
        Array.isArray(config.quizDecks) && config.quizDecks.length > 0
          ? config.quizDecks
          : DEFAULT_QUIZ_DECKS
      ),
    [config.quizDecks]
  );

  const totalLibraryQuestions = useMemo(
    () => quizDecks.reduce((acc, d) => acc + (d.questions?.length || 0), 0),
    [quizDecks]
  );

  const selectedDeckId =
    config.activeQuizDeckId && quizDecks.some((d) => d.id === config.activeQuizDeckId)
      ? config.activeQuizDeckId
      : quizDecks[0]?.id || 'deck-tienganh-de';
  const selectedDeck = quizDecks.find((d) => d.id === selectedDeckId) || quizDecks[0];

  const visibleQueueEntries = useMemo(() => {
    const limit = config.quizQueueLimitDisplay ?? 10;
    const query = queueSearchQuery.trim().toLowerCase();
    const out: Array<{ q: EnglishQuizItem; idx: number }> = [];
    if (!query) {
      const end = Math.min(activeQuizList.length, limit);
      for (let i = 0; i < end; i++) {
        out.push({ q: activeQuizList[i], idx: i });
      }
      return out;
    }
    for (let i = 0; i < activeQuizList.length && out.length < limit; i++) {
      const item = activeQuizList[i];
      if (
        item &&
        (item.en.toLowerCase().includes(query) ||
          item.vi.toLowerCase().includes(query) ||
          String(i + 1) === query)
      ) {
        out.push({ q: item, idx: i });
      }
    }
    return out;
  }, [activeQuizList, config.quizQueueLimitDisplay, queueSearchQuery]);

  // Nạp đề vào hàng chờ cực nhanh (Single-pass O(N)): mode = 'append' (tiếp) | 'replace' (đè) | 'prepend' (đầu)
  const handleLoadDeckToQueue = (mode: 'append' | 'replace' | 'prepend') => {
    if (!selectedDeck || !selectedDeck.questions.length) {
      setQuizImportFeedback('⚠️ Bộ đề được chọn không có câu hỏi nào!');
      return;
    }
    const toLoad = prepareEnqueuedQuestions(selectedDeck.questions, {
      deckName: selectedDeck.name,
      quizLevel: selectedDeck.level,
      shuffle: config.shuffleBeforeEnqueue ?? false,
      ratio1: config.luckyStarRatio1 ?? 15,
      ratio2: config.luckyStarRatio2 ?? 10,
      ratio3: config.luckyStarRatio3 ?? 5,
    });

    let nextQueue: EnglishQuizItem[] = [];
    if (mode === 'replace') {
      nextQueue = toLoad;
      setQuizImportFeedback(
        `✅ Đã nạp đè ${toLoad.length.toLocaleString('vi-VN')} câu từ "${selectedDeck.name}"!`
      );
    } else if (mode === 'prepend') {
      nextQueue = [...toLoad, ...activeQuizList];
      setQuizImportFeedback(
        `✅ Đã nạp ${toLoad.length.toLocaleString('vi-VN')} câu lên đầu hàng chờ!`
      );
    } else {
      nextQueue = [...activeQuizList, ...toLoad];
      setQuizImportFeedback(
        `✅ Đã nạp tiếp ${toLoad.length.toLocaleString('vi-VN')} câu vào đuôi hàng chờ!`
      );
    }
    onUpdateConfig({ customQuizQuestions: nextQueue });
  };

  // Tùy chọn: Thêm sao trực tiếp vào câu hỏi ở đầu hàng chờ (0 = câu hỏi thường, 1 = x2đ, 2 = x3đ, 3 = x4đ)
  const handleSetHeadQuestionStars = (stars: 0 | 1 | 2 | 3) => {
    if (!activeQuizList.length) return;
    const nextList = [...activeQuizList];
    const targetIdx = 0; // Đầu hàng chờ
    nextList[targetIdx] = { ...nextList[targetIdx], luckyStars: stars };
    onUpdateConfig({ customQuizQuestions: nextList });
    if (stars === 0) {
      setQuizImportFeedback('✅ Đã đặt câu đầu hàng chờ về câu hỏi thường (không sao, x1 điểm)!');
    } else {
      setQuizImportFeedback(
        `⭐ Đã gán ${stars} sao may mắn (x${stars + 1} điểm) cho câu đầu hàng chờ!`
      );
    }
  };

  // Thay đổi sao cho từng câu hỏi trực tiếp trong list (click chu kỳ 0 -> 1 -> 2 -> 3 -> 0)
  const handleCycleQuestionStars = (idx: number) => {
    const nextList = [...activeQuizList];
    const currentStars = nextList[idx]?.luckyStars || 0;
    const nextStars: 0 | 1 | 2 | 3 =
      currentStars === 0 ? 1 : currentStars === 1 ? 2 : currentStars === 2 ? 3 : 0;
    nextList[idx] = { ...nextList[idx], luckyStars: nextStars };
    onUpdateConfig({ customQuizQuestions: nextList });
  };

  // Xóa 1 câu khỏi hàng chờ
  const handleDeleteQueueQuestion = (idx: number) => {
    const nextList = activeQuizList.filter((_, i) => i !== idx);
    onUpdateConfig({ customQuizQuestions: nextList });
  };

  // Xóa sạch hàng chờ
  const handleClearQuizQueue = () => {
    onUpdateConfig({ customQuizQuestions: [] });
    setQuizImportFeedback('🗑️ Đã xóa sạch hàng chờ câu hỏi!');
  };

  // Nạp 1 hoặc nhiều file .txt cùng lúc theo từng chunk bất đồng bộ (hỗ trợ mỗi file hàng nghìn - hàng chục nghìn câu không đơ UI)
  const handleUploadNewDeckFiles = async (fileList: FileList | null | undefined) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setIsParsingQuizTxt(true);
    setQuizImportFeedback(
      `⏳ Đang đọc ${files.length} file bộ đề dung lượng lớn...`
    );

    try {
      let workingDecks = [...quizDecks];
      let lastTargetDeckId = selectedDeckId;
      const summaryParts: string[] = [];

      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        const rawText = await file.text();
        const { deckName, deckKey, level } = normalizeQuizDeckFileName(file.name);
        const parsed = await parseLargeQuizTxtChunked(rawText, {
          idPrefix: `txt-${Date.now()}-${fIdx}`,
          deckName,
          quizLevel: level,
          chunkLines: 4000,
          onProgress: (count) => {
            if (count >= 4000) {
              setQuizImportFeedback(
                `⏳ Đang nạp "${deckName}": ${count.toLocaleString('vi-VN')} câu...`
              );
            }
          },
        });

        if (parsed.length === 0) {
          summaryParts.push(`"${file.name}": 0 câu hợp lệ`);
          continue;
        }

        const existingIdx = workingDecks.findIndex(
          (d) => normalizeQuizDeckFileName(d.name).deckKey === deckKey
        );

        if (existingIdx >= 0) {
          const targetDeck = workingDecks[existingIdx];
          const updatedDeck = {
            ...targetDeck,
            name: deckName,
            level,
            questions: parsed,
          };
          workingDecks = workingDecks.map((d, idx) =>
            idx === existingIdx ? updatedDeck : d
          );
          lastTargetDeckId = targetDeck.id;
          const rewardSpec = getQuizLevelRewardInfo(deckName);
          summaryParts.push(
            `♻️ Ghi đè "${deckName}" (${parsed.length.toLocaleString('vi-VN')} câu • ${rewardSpec.label})`
          );
        } else {
          const newDeckId = `deck-${Date.now()}-${fIdx}`;
          const newDeck = {
            id: newDeckId,
            name: deckName,
            level,
            questions: parsed,
          };
          workingDecks = [...workingDecks, newDeck];
          lastTargetDeckId = newDeckId;
          const rewardSpec = getQuizLevelRewardInfo(deckName);
          summaryParts.push(
            `📁 Thêm mới "${deckName}" (${parsed.length.toLocaleString('vi-VN')} câu • ${rewardSpec.label})`
          );
        }
      }

      const validUploaded = summaryParts.some((s) => s.startsWith('♻️') || s.startsWith('📁'));
      if (!validUploaded) {
        setQuizImportFeedback(
          '⚠️ File .txt chưa đúng định dạng (Nghĩa Việt | Tiếng Anh)'
        );
        return;
      }

      onUpdateConfig({
        quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
        quizDecks: workingDecks,
        activeQuizDeckId: lastTargetDeckId,
      });
      setQuizImportFeedback(summaryParts.join(' • '));
    } finally {
      setIsParsingQuizTxt(false);
    }
  };

  // Xóa bộ đề đang chọn khỏi danh sách (nút ✕)
  const handleDeleteSelectedDeck = () => {
    if (!selectedDeck) return;
    const removedName = selectedDeck.name;
    const remainingDecks = quizDecks.filter((d) => d.id !== selectedDeck.id);
    if (remainingDecks.length === 0) {
      const fallbackDecks = ensureTieredQuizDecksLoaded([], true);
      onUpdateConfig({
        quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
        quizDecks: fallbackDecks,
        activeQuizDeckId: fallbackDecks[0]?.id || 'deck-tienganh-de',
      });
      setQuizImportFeedback(
        `🗑️ Đã xóa "${removedName}" và đặt lại 4 bộ đề mặc định (tienganh-de / thuong / kho / OMG)!`
      );
      return;
    }
    onUpdateConfig({
      quizDeckSchemaVersion: QUIZ_DECK_SCHEMA_VERSION,
      quizDecks: remainingDecks,
      activeQuizDeckId: remainingDecks[0].id,
    });
    setQuizImportFeedback(
      `🗑️ Đã xóa bộ đề "${removedName}" khỏi danh sách!`
    );
  };

  const handleDownloadQuizTxt = () => {
    const content = formatEnglishQuizTxt(activeQuizList);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bo-cau-hoi-tieng-anh-${activeQuizList.length}-cau.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSpawnCustom(
      customName.trim() || 'Học Sinh Chăm Ngoan',
      customVip ? '' : customPrayer.trim() || 'Em chào Cô và các bạn lớp 12A1 ạ! 🎒',
      customVip,
      customVip ? Math.max(1, customCoins) : 0,
      customAvatarUrl
    );
  };

  const hud = config.hudLayout;
  const boardBox = hud.classBoardBox || {
    x: 56,
    y: 112,
    width: 430,
    height: 218,
  };
  const activeEngine: ClassBoardEngineId =
    hud.classBoardEngine || classBoardState?.engine || 'notice';
  const isBoardRunning = Boolean(classBoardState?.isRunning);
  const qIdx = classBoardState?.questionIndex ?? 0;
  const curQuiz =
    classBoardState?.currentQuestion ||
    activeQuizList[qIdx % activeQuizList.length] ||
    activeQuizList[0];
  const remSec = Math.ceil((classBoardState?.timeLeftMs ?? 12000) / 1000);
  const rawLetterMode = hud.classBoardLetterMode || 'default';
  const letterMode: 'default' | 'hint_2' | 'hint_3' =
    rawLetterMode === 'hint_2' || rawLetterMode === 'blank'
      ? 'hint_2'
      : rawLetterMode === 'hint_3' || rawLetterMode === 'full'
      ? 'hint_3'
      : 'default';

  const waitingTtsCount = eventTtsQueue?.waitingCount ?? 0;
  const isPlayingEventTts = eventTtsQueue?.isPlayingEvent ?? false;
  const currentEventTtsText = eventTtsQueue?.currentEventText ?? null;
  const queueTtsItems = eventTtsQueue?.queueItems ?? [];

  const boardPhase = classBoardState?.phase || 'asking';
  const lessonFlowStepText =
    boardPhase === 'lesson_start'
      ? 'Luồng 0: Bắt đầu tiết học [Nói xong → Luồng 1]'
      : boardPhase === 'preparing'
      ? `Luồng 1: Đọc "Chuẩn bị" [3s đếm ngược: ${remSec}s]`
      : boardPhase === 'asking'
      ? `Luồng 2 & 3: Đọc câu hỏi & Đợi trả lời [${remSec}s]`
      : boardPhase === 'answer_flash'
      ? 'Luồng 4: Đọc câu trả lời [Nói xong → Luồng 5]'
      : boardPhase === 'result_summary'
      ? 'Luồng 5: Đọc kết quả & Xếp chỗ [Nói xong → Luồng 6]'
      : boardPhase === 'ranking_board'
      ? 'Luồng 6: Đọc BXH Trong Lớp [Nói xong → Câu tiếp]'
      : boardPhase === 'round_end'
      ? 'Luồng Kết Thúc: Vinh danh Top 1, 2, 3 & Trao Cúp Vàng [Vỗ tay → Vòng mới]'
      : `Pha: ${boardPhase}`;

  return (
    <div className="space-y-3">
      {/* 00. LIVE TEXT-TO-VOICE ĐỘC LẬP (GIỌNG THẦY GIÁO - CHẠY SONG SONG VỚI GAME, KHÔNG VÀO HÀNG CHỜ) */}
      <TeacherLiveVoiceCard
        config={config}
        teacherLiveStatus={teacherLiveStatus}
        onUpdateConfig={onUpdateConfig}
        onSpeakTeacherLiveVoice={onSpeakTeacherLiveVoice}
        onStopTeacherLiveVoice={onStopTeacherLiveVoice}
      />

      {/* 00B. BẢNG TIN LỚP (BẢNG THÔNG BÁO) + CHẠY BẢNG THEO CHU KỲ */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-amber-500/35 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BellRing className="w-3.5 h-3.5 text-amber-400" />
            <h2 className="text-xs font-bold text-amber-200">
              Bảng Tin Lớp (Bảng Thông Báo)
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  showNoticeBoardBox: !hud.showNoticeBoardBox,
                })
              }
              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition ${
                hud.showNoticeBoardBox
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-stone-900 border-stone-700 text-stone-400'
              }`}
            >
              {hud.showNoticeBoardBox ? 'Đang Hiện' : 'Đang Ẩn'}
            </button>
            <span className="text-[10.5px] text-stone-400">Cỡ chữ:</span>
            <input
              type="range"
              min={7}
              max={22}
              step={0.5}
              value={hud.noticeBoardFontSize || 10}
              onChange={(e) =>
                onUpdateHudLayout({
                  noticeBoardFontSize: parseFloat(e.target.value),
                })
              }
              className="w-20 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-mono font-bold text-amber-300 w-9 text-right">
              {hud.noticeBoardFontSize || 10}px
            </span>
          </div>
        </div>

        <textarea
          rows={2}
          value={
            hud.noticeBoardContent ??
            'Chào mừng các bạn học sinh vào lớp 12A1! Bình luận để giơ tay phát biểu và nhận Hoa Điểm 10 🌺'
          }
          onChange={(e) =>
            onUpdateHudLayout({ noticeBoardContent: e.target.value })
          }
          placeholder="Nội dung bảng tin lớp..."
          className="w-full px-2 py-1.5 rounded bg-stone-950 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500 resize-y"
        />

        <HudCycleSettingsCard
          title="Bảng Tin Lớp"
          cycle={hud.noticeBoardCycle}
          onChange={(nextCycle) =>
            onUpdateHudLayout({ noticeBoardCycle: nextCycle })
          }
        />
      </section>

      {/* 0A. HÀNG CHỜ ĐỌC SỰ KIỆN & ĐỒNG BỘ GIỌNG ĐỌC CÔ GIÁO */}
      <section className="p-2.5 rounded-xl bg-stone-900/95 border border-amber-500/45 space-y-2 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <MessageSquareQuote className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs font-extrabold text-amber-200 truncate">
              Hàng Chờ Đọc Sự Kiện ({waitingTtsCount}/{config.maxTtsQueueSize ?? 30})
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span
              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${
                isBoardRunning
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              }`}
            >
              {isBoardRunning
                ? lessonFlowStepText
                : `⏸️ Tạm dừng (${lessonFlowStepText})`}
            </span>

            {waitingTtsCount > 0 && onClearEventTtsQueue && (
              <button
                type="button"
                onClick={onClearEventTtsQueue}
                className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-[10px] font-bold text-rose-200 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa ({waitingTtsCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Bộ đếm 3 ô */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="p-1.5 rounded-lg bg-stone-950/90 border border-amber-500/30 text-center">
            <div className="text-[9.5px] text-stone-400">Chờ đọc</div>
            <div
              className={`text-sm font-extrabold font-mono ${
                waitingTtsCount > 0 ? 'text-amber-300' : 'text-stone-400'
              }`}
            >
              {waitingTtsCount}
            </div>
          </div>

          <div className="p-1.5 rounded-lg bg-stone-950/90 border border-emerald-500/30 text-center">
            <div className="text-[9.5px] text-stone-400">Đang phát</div>
            <div
              className={`text-sm font-extrabold font-mono ${
                isPlayingEventTts ? 'text-emerald-400' : 'text-stone-400'
              }`}
            >
              {isPlayingEventTts ? 1 : 0}
            </div>
          </div>

          <div className="p-1.5 rounded-lg bg-stone-950/90 border border-sky-500/30 text-center">
            <div className="text-[9.5px] text-stone-400">Tổng sự kiện</div>
            <div
              className={`text-sm font-extrabold font-mono ${
                waitingTtsCount + (isPlayingEventTts ? 1 : 0) > 0
                  ? 'text-sky-300'
                  : 'text-stone-400'
              }`}
            >
              {waitingTtsCount + (isPlayingEventTts ? 1 : 0)}
            </div>
          </div>
        </div>

        {/* Khung cố định chiều cao cho câu đang đọc & danh sách hàng chờ sự kiện (không nhảy kích thước thẻ) */}
        <div className="p-2 rounded-lg bg-stone-950/85 border border-stone-800 h-[122px] flex flex-col justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] h-6 shrink-0 overflow-hidden">
            <span
              className={`px-1.5 py-0.5 rounded border font-bold text-[9.5px] shrink-0 ${
                isPlayingEventTts && currentEventTtsText
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-stone-900 border-stone-700 text-stone-400'
              }`}
            >
              ĐANG ĐỌC
            </span>
            {isPlayingEventTts && currentEventTtsText ? (
              <span className="text-emerald-200 truncate">
                “{currentEventTtsText}”
              </span>
            ) : (
              <span className="text-stone-500 italic text-[10px] truncate">
                Hiện không có sự kiện đang phát...
              </span>
            )}
          </div>

          <div className="h-[74px] overflow-y-auto space-y-1 pr-1 border-t border-stone-800/80 pt-1">
            {queueTtsItems.length > 0 ? (
              <>
                {queueTtsItems.map((item, idx) => (
                  <div
                    key={`${idx}-${item.slice(0, 16)}`}
                    className="text-[10px] text-stone-300 bg-stone-900/90 border border-stone-800/80 rounded px-2 py-0.5 truncate"
                  >
                    <span className="text-amber-400 font-bold mr-1">
                      #{idx + 1}:
                    </span>
                    {item}
                  </div>
                ))}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-stone-500 italic">
                Hàng chờ sự kiện đang trống (0 câu chờ đọc)
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 0. THẺ BẢNG LỚP (ĐỒNG BỘ LUỒNG 0 -> 6 & GIỌNG ĐỌC CÔ GIÁO) */}
      <section className="p-2.5 rounded-xl border border-emerald-500/45 bg-stone-900/95 space-y-2 shadow-md">
        {/* Hàng 1: Tiêu đề + Hiện/Ẩn + Kéo trên sân + Khớp bảng đen */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs font-extrabold text-emerald-300">
              Bảng Lớp
            </span>
            {activeEngine === 'english_quiz' && (
              <span className="px-1.5 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] font-mono text-amber-300 truncate">
                Câu {(classBoardState?.roundQuestionIndex ?? qIdx) + 1}/15: {curQuiz.vi} → {curQuiz.en}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  studentLevelExpEnabled: !config.studentLevelExpEnabled,
                  ieltsRankBadgeSchemaV1: true,
                })
              }
              title="Bật/tắt hiển thị thẻ Cấp độ IELTS (IEL 1.0 → 9.0 + % EXP) & Số Cúp Vàng luân phiên mỗi 10s dưới thẻ tên học sinh"
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition select-none ${
                config.studentLevelExpEnabled
                  ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                  : 'bg-stone-950 border-stone-700 text-stone-400 hover:bg-stone-800'
              }`}
            >
              <span>🎖️ Rank / Cúp: {config.studentLevelExpEnabled ? 'Bật' : 'Tắt'}</span>
            </button>

            <label
              title="Cho phép hình ảnh Cô Giáo và khung chat của cô ưu tiên nằm đè lên trên Bảng Lớp để không bị che"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-950 border border-pink-500/40 text-[10px] text-pink-200 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={config.teacherAboveClassBoard !== false}
                onChange={(e) =>
                  onUpdateConfig({ teacherAboveClassBoard: e.target.checked })
                }
                className="accent-pink-400 w-3 h-3"
              />
              <span>Cô trên bảng</span>
            </label>

            <label className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-stone-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hud.showClassBoardBox !== false}
                onChange={(e) =>
                  onUpdateHudLayout({ showClassBoardBox: e.target.checked })
                }
                className="accent-emerald-400 w-3 h-3"
              />
              <span>Hiện</span>
            </label>

            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({ editLayoutMode: !hud.editLayoutMode })
              }
              title="Bật/tắt kéo & chỉnh góc trực tiếp trên sân"
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition ${
                hud.editLayoutMode
                  ? 'bg-amber-400 text-stone-950 border-amber-300'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
              }`}
            >
              <Move className="w-2.5 h-2.5" />
              <span>Kéo</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBoardSizeSliders((v) => !v)}
              title="Ẩn/hiện thanh chỉnh kích thước & mờ nền"
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition ${
                showBoardSizeSliders
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-stone-800 text-stone-400 border-stone-700'
              }`}
            >
              <Sliders className="w-2.5 h-2.5" />
              <span>Cỡ/Mờ</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Chọn Tiết Học / Bảng Thông Báo + Nút Tạm dừng / Chạy tiếp + Chạy từ đầu (hoặc Chạy bảng thông báo) */}
        {activeEngine === 'notice' ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-12 gap-1.5 items-center">
              <div className="col-span-5">
                <select
                  value={activeEngine}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardEngine: e.target.value as ClassBoardEngineId,
                    })
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-stone-950 border border-amber-500/60 text-xs font-bold text-amber-200 focus:outline-none focus:border-emerald-400"
                >
                  <option value="english_quiz">
                    🇬🇧 {hud.classBoardLessonTitle || 'Tiết Tiếng Anh'}
                  </option>
                  <option value="result_board">🏆 Bảng Kết Quả</option>
                  <option value="notice">📋 Bảng Thông Báo</option>
                </select>
              </div>

              <div className="col-span-4">
                <button
                  type="button"
                  onClick={onRunNoticeBoard}
                  title="Bấm chạy bảng thông báo để Cô Thảo đọc dòng chữ hiện tại trong bảng thông báo"
                  className="w-full py-1.5 px-2 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition shadow-sm bg-emerald-500 hover:bg-emerald-400 text-stone-950 border border-emerald-300"
                >
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span className="truncate">Chạy thông báo</span>
                </button>
              </div>

              <div className="col-span-3">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateHudLayout({ classBoardEngine: 'english_quiz' })
                  }
                  title="Trả về tiết Tiếng Anh (ở trạng thái tạm dừng) để bấm Chạy tiếp"
                  className="w-full py-1.5 px-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/60 text-[10.5px] font-extrabold text-cyan-200 flex items-center justify-center gap-1 cursor-pointer transition"
                >
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate">Về tiết học</span>
                </button>
              </div>
            </div>

            {/* Khung nội dung Bảng Thông Báo ngay tại Bảng Lớp để chỉnh & đọc tức thì */}
            <div className="p-2 rounded-lg bg-stone-950/90 border border-amber-500/35 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-1 text-amber-200 font-bold">
                <span>
                  ⏸️ Tiết Tiếng Anh đang tạm dừng tại: <span className="text-emerald-300">{lessonFlowStepText}</span>
                </span>
              </div>
              <textarea
                rows={2}
                value={
                  hud.noticeBoardContent ??
                  'Chào mừng các bạn học sinh vào lớp 12A1! Bình luận để giơ tay phát biểu và nhận Hoa Điểm 10 🌺'
                }
                onChange={(e) =>
                  onUpdateHudLayout({ noticeBoardContent: e.target.value })
                }
                placeholder="Nhập dòng chữ hiện tại trong bảng thông báo để Cô đọc..."
                className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-amber-400 resize-y"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-1 items-center">
            <div className="col-span-4">
              <select
                value={activeEngine}
                onChange={(e) =>
                  onUpdateHudLayout({
                    classBoardEngine: e.target.value as ClassBoardEngineId,
                  })
                }
                className="w-full px-1.5 py-1.5 rounded-lg bg-stone-950 border border-stone-700 text-[11px] font-bold text-amber-200 focus:outline-none focus:border-emerald-400"
              >
                <option value="english_quiz">
                  🇬🇧 {hud.classBoardLessonTitle || 'Tiết Tiếng Anh'}
                </option>
                <option value="result_board">🏆 Bảng Kết Quả</option>
                <option value="notice">📋 Bảng Thông Báo</option>
              </select>
            </div>

            <div className="col-span-3">
              <button
                type="button"
                onClick={onToggleClassBoardRun}
                title={
                  isBoardRunning
                    ? 'Tạm dừng tiết học tại luồng hiện tại'
                    : `Tiếp tục chạy luồng đang bị dừng (${lessonFlowStepText})`
                }
                className={`w-full py-1.5 px-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition shadow-sm ${
                  isBoardRunning
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border border-rose-400'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 border border-emerald-300'
                }`}
              >
                {isBoardRunning ? (
                  <>
                    <Pause className="w-3 h-3 fill-current shrink-0" />
                    <span className="truncate">Tạm dừng</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current shrink-0" />
                    <span className="truncate">Chạy tiếp</span>
                  </>
                )}
              </button>
            </div>

            <div className="col-span-3">
              <button
                type="button"
                onClick={onRestartClassBoardFromStart}
                title="Chạy lại tiết học từ đầu (Luồng 0: Bắt đầu tiết học)"
                className="w-full py-1.5 px-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/60 text-[10.5px] font-extrabold text-amber-200 flex items-center justify-center gap-1 cursor-pointer transition shadow-sm"
              >
                <RotateCcw className="w-3 h-3 shrink-0" />
                <span className="truncate">Chạy từ đầu</span>
              </button>
            </div>

            <div className="col-span-2 flex items-center gap-1">
              <button
                type="button"
                onClick={onNextClassBoardQuestion}
                title="Qua câu hỏi tiếp theo"
                className="flex-1 py-1.5 px-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[11px] font-bold text-stone-200 flex items-center justify-center cursor-pointer transition"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSimulateQuizAnswer?.(customName)}
                title="Giả lập học sinh comment trả lời đúng câu hiện tại"
                className="flex-1 py-1.5 px-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[11px] font-bold text-amber-300 flex items-center justify-center cursor-pointer transition"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Hàng 3: Tên tiết học + Gợi ý ô chữ + NPC tham gia + Bộ câu hỏi .txt */}
        {activeEngine === 'english_quiz' && (
          <div className="space-y-1.5 pt-1 border-t border-stone-800/80 text-[10.5px]">
            {/* Cho sửa tên tiết học */}
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 shrink-0">Tên tiết học:</span>
              <input
                type="text"
                value={hud.classBoardLessonTitle ?? 'Tiết Tiếng Anh'}
                onChange={(e) =>
                  onUpdateHudLayout({ classBoardLessonTitle: e.target.value })
                }
                placeholder="Tiết Tiếng Anh"
                className="flex-1 px-2 py-1 rounded bg-stone-950 border border-stone-800 text-[11px] font-bold text-amber-200 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-stone-400">Gợi ý:</span>
                {(
                  [
                    {
                      id: 'default',
                      label: 'Mặc định',
                      title:
                        'Luôn gợi ý 1 chữ cái đầu; 5s sau thêm 1 chữ (6 ký tự), thêm 2 chữ (7-9 ký tự), thêm 3 chữ (10+ ký tự)',
                    },
                    {
                      id: 'hint_2',
                      label: 'Gợi ý 2',
                      title: 'Gợi ý 2 chữ cái random',
                    },
                    {
                      id: 'hint_3',
                      label: 'Gợi ý 3',
                      title: 'Gợi ý 2 chữ cái đầu cuối',
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.title}
                    onClick={() =>
                      onUpdateHudLayout({ classBoardLetterMode: m.id })
                    }
                    className={`px-1.5 py-0.5 rounded font-semibold cursor-pointer transition ${
                      letterMode === m.id
                        ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/60'
                        : 'bg-stone-950 text-stone-400 border border-stone-800 hover:text-stone-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <label
                  className="flex items-center gap-1 text-stone-300 cursor-pointer select-none"
                  title="Khi bật: trong thời gian hỏi bài, comment trùng đáp án đúng vẫn được chấm điểm nhưng ẩn không hiện bong bóng chat (tránh lộ đáp án). Comment khác vẫn hiện bình thường."
                >
                  <input
                    type="checkbox"
                    checked={config.filterCorrectAnswerBubble !== false}
                    onChange={(e) =>
                      onUpdateConfig({
                        filterCorrectAnswerBubble: e.target.checked,
                      })
                    }
                    className="accent-amber-400 w-3 h-3"
                  />
                  <span
                    className={
                      config.filterCorrectAnswerBubble !== false
                        ? 'text-amber-300 font-semibold'
                        : 'text-stone-400'
                    }
                  >
                    Lọc câu trả lời
                  </span>
                </label>

                <label className="flex items-center gap-1 text-stone-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hud.classBoardNpcParticipate !== false}
                    onChange={(e) =>
                      onUpdateHudLayout({
                        classBoardNpcParticipate: e.target.checked,
                      })
                    }
                    className="accent-emerald-400 w-3 h-3"
                  />
                  <span>NPC trả lời</span>
                </label>
              </div>
            </div>

            <div className="text-[9.5px] text-stone-400 bg-stone-950/80 border border-stone-800/80 rounded px-2 py-1 leading-tight">
              {letterMode === 'hint_2'
                ? '💡 Gợi ý 2: Hiện 2 chữ cái ngẫu nhiên.'
                : letterMode === 'hint_3'
                ? '💡 Gợi ý 3: Hiện 2 chữ cái đầu & cuối.'
                : '💡 Mặc định: Luôn gợi ý 1 chữ cái đầu; sau 5s thêm 1 chữ (6 ký tự), thêm 2 (7-9 ký tự), thêm 3 (10+ ký tự).'}
            </div>

            {/* QUẢN LÝ BỘ ĐỀ & HÀNG CHỜ CÂU HỎI TIẾNG ANH (THẺ CỐ ĐỊNH KÍCH THƯỚC) */}
            <div className="p-2.5 rounded-xl bg-stone-950 border border-cyan-500/35 space-y-2 text-[10.5px]">
              {/* Hàng 1: Dòng chữ đếm số hàng chờ + tổng kho đề + Nút chọn số lượng show (5/10/20/50) + Nút Xóa */}
              <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-stone-800 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="font-bold text-stone-200">
                    Hàng chờ:{' '}
                    <strong className="text-cyan-300 font-mono text-xs">
                      {activeQuizList.length.toLocaleString('vi-VN')}
                    </strong>{' '}
                    câu
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700/80 text-[9px] font-mono text-emerald-300 shrink-0"
                    title="Tổng số câu hỏi trong toàn bộ các bộ đề (lưu trữ tốc độ cao trên IndexedDB)"
                  >
                    Kho: {totalLibraryQuestions.toLocaleString('vi-VN')}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9.5px] text-stone-400">Hiện:</span>
                  {[5, 10, 20, 50].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => onUpdateConfig({ quizQueueLimitDisplay: num })}
                      className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9.5px] cursor-pointer transition ${
                        (config.quizQueueLimitDisplay ?? 10) === num
                          ? 'bg-cyan-500 text-stone-950 shadow-sm'
                          : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                  {activeQuizList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearQuizQueue}
                      className="ml-1 px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-bold text-[9px] cursor-pointer"
                      title="Xóa sạch hàng chờ câu hỏi"
                    >
                      Xóa
                    </button>
                  )}
                </div>
              </div>

              {/* Ô tìm nhanh trong hàng chờ lớn (chỉ render đúng số câu giới hạn ra DOM, không lag dù hàng chờ 10.000 câu) */}
              {activeQuizList.length > 15 && (
                <div className="relative flex items-center">
                  <Search className="w-3 h-3 text-stone-400 absolute left-2 pointer-events-none" />
                  <input
                    type="text"
                    value={queueSearchQuery}
                    onChange={(e) => setQueueSearchQuery(e.target.value)}
                    placeholder={`Tìm nhanh trong ${activeQuizList.length.toLocaleString('vi-VN')} câu hàng chờ...`}
                    aria-label="Tìm câu hỏi trong hàng chờ"
                    className="w-full pl-6 pr-6 py-1 rounded bg-stone-900 border border-stone-800 text-[10px] text-stone-200 placeholder:text-stone-500 focus:outline-none focus:border-cyan-500/60"
                  />
                  {queueSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setQueueSearchQuery('')}
                      aria-label="Xóa từ khóa tìm kiếm hàng chờ"
                      className="absolute right-1.5 text-stone-400 hover:text-stone-200 text-[10px] cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {/* Hàng 2: List hàng chờ câu hỏi - CỐ ĐỊNH KÍCH THƯỚC (h-44 overflow-y-auto) */}
              <div className="h-44 overflow-y-auto space-y-1 pr-1 border border-stone-900 rounded-lg p-1 bg-stone-900/40">
                {visibleQueueEntries.map(({ q, idx }) => {
                  const isCurrent = idx === (classBoardState?.questionIndex ?? 0);
                  const stars = q.luckyStars || 0;
                  return (
                    <div
                      key={q.id || idx}
                      className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition ${
                        isCurrent
                          ? 'bg-emerald-950/60 border-emerald-500/70 shadow-sm'
                          : 'bg-stone-900/80 border-stone-800/90 hover:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[9.5px] font-mono text-stone-400 w-7 text-right shrink-0">
                          #{idx + 1}
                        </span>
                        {isCurrent && (
                          <span className="px-1 py-0.2 rounded bg-emerald-500 text-stone-950 font-black text-[8.5px] shrink-0 animate-pulse">
                            Đang phát
                          </span>
                        )}
                        <span className="font-bold text-amber-200 truncate">
                          "{q.vi}"
                        </span>
                        <span className="text-stone-400 text-[10px]">→</span>
                        <span className="font-mono font-bold text-white truncate">
                          {q.en}
                        </span>
                        {q.deckName && (
                          <span className="px-1 py-0.2 rounded bg-stone-800 border border-stone-700 text-[8px] text-cyan-300 shrink-0">
                            {q.deckName.includes('500')
                              ? '500 Cơ bản'
                              : q.deckName.includes('300')
                              ? '300 TB'
                              : q.deckName.includes('vua_phai') ||
                                q.deckName.includes('vừa phải')
                              ? '200 Khó vừa'
                              : q.deckName.includes('nang_cao') ||
                                q.deckName.includes('nâng cao')
                              ? '200 Nâng cao'
                              : q.deckName.replace(/\.txt$/i, '')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Nút bấm đổi sao may mắn (cycle 0 -> 1 -> 2 -> 3 -> 0) */}
                        <button
                          type="button"
                          onClick={() => handleCycleQuestionStars(idx)}
                          title={
                            stars > 0
                              ? `${stars} sao may mắn, x${stars + 1} điểm. Bấm để đổi`
                              : 'Câu hỏi thường (không sao, x1 điểm). Bấm để thêm sao'
                          }
                          className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] flex items-center gap-0.5 border cursor-pointer ${
                            stars === 3
                              ? 'bg-amber-500/30 border-yellow-300 text-yellow-200'
                              : stars === 2
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                              : stars === 1
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                              : 'bg-stone-800 border-stone-700 text-stone-400'
                          }`}
                        >
                          {stars > 0 ? (
                            <>
                              <span>{'⭐'.repeat(stars)}</span>
                              <span>x{stars + 1}</span>
                            </>
                          ) : (
                            <span>Thường</span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteQueueQuestion(idx)}
                          title="Xóa câu này khỏi hàng chờ"
                          className="w-4 h-4 rounded hover:bg-rose-900/60 text-stone-400 hover:text-rose-200 flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hàng 3: Chọn bộ đề rút gọn không tràn khung + nút Tải .txt + nút ✕ xóa */}
              <div className="space-y-1.5 pt-1 border-t border-stone-800 min-w-0">
                <div className="flex items-center gap-1 w-full min-w-0">
                  <select
                    value={selectedDeckId}
                    onChange={(e) => onUpdateConfig({ activeQuizDeckId: e.target.value })}
                    aria-label="Chọn bộ đề Tiếng Anh"
                    title={
                      selectedDeck
                        ? `${selectedDeck.name} (${selectedDeck.questions.length.toLocaleString('vi-VN')} câu)`
                        : ''
                    }
                    className="w-0 min-w-0 flex-1 px-1.5 py-1 rounded bg-stone-900 border border-stone-700 text-[10px] font-bold text-cyan-200 focus:outline-none truncate"
                  >
                    {quizDecks.map((d) => {
                      const spec = getQuizLevelRewardInfo(d.name);
                      return (
                        <option key={d.id} value={d.id}>
                          📄 {d.name} ({d.questions.length.toLocaleString('vi-VN')} câu • {spec.label})
                        </option>
                      );
                    })}
                  </select>

                  <label
                    title="Tải 1 hoặc nhiều đề .txt lên cùng lúc (hỗ trợ hàng chục nghìn câu/đề; trùng tên tienganh-de / thuong / kho / OMG sẽ ghi đè)"
                    className={`px-2 py-1 rounded border text-[10px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap transition ${
                      isParsingQuizTxt
                        ? 'bg-cyan-950 border-cyan-400 text-cyan-200 cursor-wait animate-pulse'
                        : 'bg-stone-800 hover:bg-stone-700 border-cyan-500/45 text-cyan-100 cursor-pointer'
                    }`}
                  >
                    <FileUp className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>{isParsingQuizTxt ? 'Đang nạp...' : '+Tải .txt'}</span>
                    <input
                      type="file"
                      multiple
                      accept=".txt,text/plain"
                      aria-label="Tải lên file bộ đề txt"
                      disabled={isParsingQuizTxt}
                      className="hidden"
                      onChange={(e) => {
                        void handleUploadNewDeckFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleDeleteSelectedDeck}
                    title={`Xóa bộ đề "${selectedDeck?.name || ''}"`}
                    className="w-6 h-6 rounded bg-rose-950/90 hover:bg-rose-800 border border-rose-500/60 text-[11px] font-black text-rose-200 flex items-center justify-center cursor-pointer shrink-0 leading-none transition"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[9px] text-stone-400 leading-snug">
                  Quy ước tên file: <span className="text-emerald-300 font-mono">tienganh-de</span> (5/10/8/7) •{' '}
                  <span className="text-sky-300 font-mono">tienganh-thuong</span> (7/12/10/9) •{' '}
                  <span className="text-amber-300 font-mono">tienganh-kho</span> (9/15/13/12) •{' '}
                  <span className="text-rose-300 font-mono">tienganh-OMG</span> (12/20/18/16). Chọn nhiều file cùng lúc được; trùng tên ghi đè, khác tên tạo bộ đề mới.
                </div>

                {/* Nút bật/tắt xáo trộn + 3 Nút Nạp Đề Tiêu Đề Ngắn Gọn */}
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <label className="flex items-center gap-1 text-[10px] text-stone-300 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.shuffleBeforeEnqueue ?? false}
                      onChange={(e) => onUpdateConfig({ shuffleBeforeEnqueue: e.target.checked })}
                      className="accent-cyan-400 w-3 h-3"
                    />
                    <span>🔀 Xáo trộn</span>
                  </label>

                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const tiered10 = build15MinuteTieredRoundQuestions(config);
                        onUpdateConfig({
                          customQuizQuestions: tiered10,
                        });
                        setQuizImportFeedback(
                          '🎯 Đã trích ngẫu nhiên 10 câu kiểm tra 15 phút (3 câu Dễ + 4 câu Thường + 3 câu Khó)!'
                        );
                      }}
                      title="Trích ngẫu nhiên 10 câu kiểm tra 15 phút (O(k) tức thì): 3 câu đầu Dễ (tienganh-de) + 4 câu kế Thường (tienganh-thuong) + 3 câu cuối Khó (tienganh-kho)"
                      className="px-2 py-1 rounded bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-extrabold text-[10px] cursor-pointer shadow-sm transition"
                    >
                      🎯 Trích 10 câu (3+4+3)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadDeckToQueue('append')}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-extrabold text-[10px] cursor-pointer shadow-sm transition"
                    >
                      📥 Nạp tiếp
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadDeckToQueue('replace')}
                      className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold text-[10px] cursor-pointer shadow-sm transition"
                    >
                      🔄 Nạp đè
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadDeckToQueue('prepend')}
                      className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-stone-950 font-extrabold text-[10px] cursor-pointer shadow-sm transition"
                    >
                      ⬆️ Nạp đầu
                    </button>
                  </div>
                </div>
              </div>

              {/* Hàng 4: 3 Tùy chọn Tỉ lệ câu hỏi có Sao May Mắn (1★=x2đ, 2★=x3đ, 3★=x4đ; phần còn lại là câu thường không sao) */}
              <div className="pt-1.5 border-t border-stone-800 space-y-1">
                <div className="flex items-center justify-between text-stone-300 text-[10px] font-semibold">
                  <span>Tỉ lệ Sao May Mắn (Câu thường không sao):</span>
                  <span className="text-amber-300 font-mono text-[9.5px]">Ô vuông %</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="p-1 rounded bg-stone-900 border border-stone-800 flex items-center justify-between gap-1">
                    <span className="text-[9.5px] text-emerald-200">⭐ 1★ (x2đ):</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.luckyStarRatio1 ?? 15}
                      onChange={(e) => onUpdateConfig({ luckyStarRatio1: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-10 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-center font-mono font-bold text-[10px] text-emerald-300 focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-[9px] text-stone-400">%</span>
                  </div>

                  <div className="p-1 rounded bg-stone-900 border border-stone-800 flex items-center justify-between gap-1">
                    <span className="text-[9.5px] text-amber-200">⭐⭐ 2★ (x3đ):</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.luckyStarRatio2 ?? 10}
                      onChange={(e) => onUpdateConfig({ luckyStarRatio2: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-10 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-center font-mono font-bold text-[10px] text-amber-300 focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-[9px] text-stone-400">%</span>
                  </div>

                  <div className="p-1 rounded bg-stone-900 border border-stone-800 flex items-center justify-between gap-1">
                    <span className="text-[9.5px] text-yellow-300">⭐⭐⭐ 3★ (x4đ):</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.luckyStarRatio3 ?? 5}
                      onChange={(e) => onUpdateConfig({ luckyStarRatio3: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-10 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-center font-mono font-bold text-[10px] text-yellow-300 focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-[9px] text-stone-400">%</span>
                  </div>
                </div>
              </div>

              {/* Hàng 5: Tùy chọn Thêm sao trực tiếp vào câu hỏi ở đầu hàng chờ */}
              <div className="pt-1 border-t border-stone-800 flex items-center justify-between gap-1 flex-wrap">
                <span className="text-[10px] font-semibold text-stone-300">
                  Gán sao câu đầu:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSetHeadQuestionStars(0)}
                    className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-bold text-stone-300 cursor-pointer"
                  >
                    Thường
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetHeadQuestionStars(1)}
                    className="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-[9.5px] font-bold text-emerald-200 cursor-pointer"
                  >
                    ⭐ 1★ (x2)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetHeadQuestionStars(2)}
                    className="px-1.5 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-[9.5px] font-bold text-amber-200 cursor-pointer"
                  >
                    ⭐⭐ 2★ (x3)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetHeadQuestionStars(3)}
                    className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-[9.5px] cursor-pointer shadow-sm"
                  >
                    ⭐⭐⭐ 3★ (x4)
                  </button>
                </div>
              </div>

              {quizImportFeedback && (
                <div className="text-[10px] text-cyan-300 bg-stone-900/90 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center justify-between">
                  <span>{quizImportFeedback}</span>
                  <button
                    type="button"
                    onClick={() => setQuizImportFeedback(null)}
                    className="text-stone-400 hover:text-stone-200 ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hàng 4: Điều chỉnh Kích thước, Vị trí, Mờ nền & Độ nhòe (Tinh gọn) */}
        {showBoardSizeSliders && (
          <div className="pt-1.5 border-t border-stone-800/80 space-y-1.5 text-[10px]">
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>Mờ nền</span>
                  <span className="font-mono text-emerald-300">
                    {Math.round((hud.classBoardOpacity ?? 0.42) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((hud.classBoardOpacity ?? 0.42) * 100)}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardOpacity: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                />
              </label>

              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>Độ nhòe</span>
                  <span className="font-mono text-emerald-300">
                    {hud.classBoardBlur ?? 2}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={hud.classBoardBlur ?? 2}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardBlur: Number(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                />
              </label>

              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>Cỡ chữ</span>
                  <span className="font-mono text-amber-300">
                    {hud.classBoardFontSize || 13}px
                  </span>
                </div>
                <input
                  type="range"
                  min={9}
                  max={24}
                  value={hud.classBoardFontSize || 13}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardFontSize: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 h-1.5 cursor-pointer"
                />
              </label>
            </div>

            <div className="grid grid-cols-4 gap-1.5 items-center">
              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>Rộng</span>
                  <span className="font-mono text-stone-200">{boardBox.width}</span>
                </div>
                <input
                  type="range"
                  min={180}
                  max={520}
                  value={boardBox.width}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardBox: {
                        ...boardBox,
                        width: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                />
              </label>

              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>Cao</span>
                  <span className="font-mono text-stone-200">{boardBox.height}</span>
                </div>
                <input
                  type="range"
                  min={90}
                  max={360}
                  value={boardBox.height}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardBox: {
                        ...boardBox,
                        height: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-emerald-400 h-1.5 cursor-pointer"
                />
              </label>

              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>X</span>
                  <span className="font-mono text-stone-200">{boardBox.x}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={boardBox.x}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardBox: {
                        ...boardBox,
                        x: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400 h-1.5 cursor-pointer"
                />
              </label>

              <label className="space-y-0.5">
                <div className="flex justify-between text-stone-400">
                  <span>Y</span>
                  <span className="font-mono text-stone-200">{boardBox.y}</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={520}
                  value={boardBox.y}
                  onChange={(e) =>
                    onUpdateHudLayout({
                      classBoardBox: {
                        ...boardBox,
                        y: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-cyan-400 h-1.5 cursor-pointer"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  onUpdateHudLayout({
                    classBoardBox: { x: 56, y: 112, width: 430, height: 218 },
                    classBoardOpacity: 0.42,
                    classBoardBlur: 2,
                    classBoardFontSize: 13,
                  })
                }
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Khớp bảng đen mặc định</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 1. BẢNG SĨ SỐ LỚP & HÀNG CHỜ VÀO LỚP (ƯU TIÊN 1, 2, 3...) */}
      <section className="p-2.5 rounded-xl border border-amber-500/40 bg-stone-900/90 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Sĩ Số Lớp & Hàng Chờ</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <label
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-amber-200 cursor-pointer select-none"
              title="Ẩn dòng đếm số hàng chờ bên trong Bảng Sĩ Số Lớp trên màn hình"
            >
              <input
                type="checkbox"
                checked={!hud.showQueueInPilgrimCountBox}
                onChange={(e) =>
                  onUpdateHudLayout({
                    showQueueInPilgrimCountBox: !e.target.checked,
                  })
                }
                className="accent-amber-400 w-3 h-3"
              />
              <span>Ẩn hàng đếm số hàng chờ</span>
            </label>
            <label className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-cyan-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hud.showWaitingQueueBox !== false}
                onChange={(e) =>
                  onUpdateHudLayout({ showWaitingQueueBox: e.target.checked })
                }
                className="accent-cyan-400 w-3 h-3"
              />
              <span>HUD Hàng Chờ</span>
            </label>
            <span className="text-[11px] font-mono font-bold text-amber-300 bg-stone-950 px-2 py-0.5 rounded border border-stone-800">
              Ghế: {realCount + botCount}/{config.maxStageCapacity || 16}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-stone-800 rounded-lg border border-stone-800 bg-stone-950/90 py-1.5 px-1 text-center">
          <div>
            <div className="text-[10px] text-stone-400">Người thật</div>
            <div className="text-sm font-extrabold text-emerald-400 font-mono tabular-nums">
              {realCount}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-stone-400">NPC</div>
            <div className="text-sm font-extrabold text-amber-300 font-mono tabular-nums">
              {botCount}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-stone-400">Hàng chờ</div>
            <div className="text-sm font-extrabold text-cyan-300 font-mono tabular-nums">
              {queueCount}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-stone-400">Số ghế</div>
            <div className="text-sm font-extrabold text-stone-100 font-mono tabular-nums">
              {config.maxStageCapacity || 16}
            </div>
          </div>
        </div>

        {/* Điều khiển & Danh sách Hàng Chờ Vào Lớp (Top 15 Lazy Rank từ Kho O(1)) */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-cyan-500/30 space-y-1.5">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <span className="text-[10.5px] font-bold text-cyan-300">
              ⏳ Hàng Chờ Vào Lớp (Top {waitingQueue.length} / Tổng {queueCount})
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => onEnqueueWaitingStudent?.()}
                title='Giả lập 1 người thật comment "vào lớp" để xếp hàng'
                className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 text-[10px] font-bold text-cyan-200 flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>+1 Xếp hàng</span>
              </button>
              <button
                type="button"
                onClick={onAdmitNextWaitingStudent}
                disabled={queueCount === 0}
                className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 disabled:opacity-40 border border-emerald-400/50 text-[10px] font-bold text-emerald-200 cursor-pointer"
              >
                Vào lớp (1)
              </button>
              <button
                type="button"
                onClick={onClearNpcWaitingQueue}
                disabled={queueCount === 0}
                title="Xóa nhanh toàn bộ NPC trong hàng chờ để ưu tiên slot cho người thật"
                className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 disabled:opacity-40 border border-amber-400/50 text-[10px] font-bold text-amber-200 cursor-pointer"
              >
                Xóa nhanh NPC
              </button>
              {queueCount > 0 && (
                <button
                  type="button"
                  onClick={onClearWaitingQueue}
                  className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-[10px] font-bold text-rose-200 cursor-pointer"
                >
                  Xóa hết
                </button>
              )}
            </div>
          </div>

          <div className="h-32 overflow-y-auto space-y-1 pr-0.5 rounded bg-stone-950/60 border border-stone-800/80 p-1">
            {waitingQueue.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-[10px] text-stone-400 italic px-2">
                Chưa có học sinh xếp hàng. Người xem comment chứa từ &quot;vào lớp&quot;, tặng quà ngoài lớp hoặc NPC tự động sẽ vào đây.
              </div>
            ) : (
              waitingQueue.map((item, idx) => (
                <div
                  key={`${item.username}-${idx}`}
                  className={`flex items-center justify-between gap-1.5 px-2 py-0.5 rounded border text-[10.5px] ${
                    item.isGoldenPriority
                      ? 'bg-amber-950/75 border-yellow-400/80 shadow-[0_0_10px_rgba(250,204,21,0.28)]'
                      : 'bg-stone-900 border-stone-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`px-1 py-0.2 rounded font-mono font-extrabold text-[9.5px] shrink-0 border ${
                        item.isGoldenPriority
                          ? 'bg-yellow-400 text-stone-950 border-yellow-200'
                          : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                      }`}
                    >
                      #{item.rank || idx + 1}
                    </span>
                    <span className="text-stone-500 font-bold text-[10px]">-</span>
                    <span
                      className={`truncate ${
                        item.isGoldenPriority
                          ? 'font-black text-yellow-300 drop-shadow-[0_1px_4px_rgba(250,204,21,0.55)]'
                          : 'font-bold text-stone-100'
                      }`}
                    >
                      {item.username}
                    </span>
                    <span className="text-stone-500 font-bold text-[10px]">-</span>
                    <span className="px-1 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-amber-300 text-[9px] shrink-0">
                      {item.points || 0}đ
                    </span>
                    {item.prayer && (
                      <span className="text-stone-400 truncate text-[9.5px]">
                        • {item.prayer}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveWaitingQueueItem?.(item.username)}
                    className="text-stone-400 hover:text-rose-400 cursor-pointer shrink-0"
                    title="Xóa khỏi hàng chờ"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* 1B. THẺ ĐIỀU CHỈNH TỐC ĐỘ DI CHUYỂN HỌC SINH (SẮP XẾP LỚP & TẶNG HOA THẦY/CÔ) */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Footprints className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-emerald-200">Tốc Độ Di Chuyển Học Sinh</h2>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                studentSeatingSpeed: 110,
                studentGiftSpeed: 185,
              })
            }
            className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] text-stone-300 font-semibold cursor-pointer"
          >
            Mặc định
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10.5px]">
          {/* 1. Sắp xếp lớp */}
          <div className="p-2 rounded-lg bg-stone-950 border border-stone-800 space-y-1">
            <div className="flex justify-between items-center text-stone-300">
              <span className="font-semibold">Sắp xếp lớp</span>
              <span className="font-mono font-bold text-emerald-300">
                {config.studentSeatingSpeed ?? 110} px/s
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={300}
              step={5}
              value={config.studentSeatingSpeed ?? 110}
              onChange={(e) =>
                onUpdateConfig({
                  studentSeatingSpeed: parseInt(e.target.value, 10) || 110,
                })
              }
              className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* 2. Tặng hoa Thầy & Cô */}
          <div className="p-2 rounded-lg bg-stone-950 border border-stone-800 space-y-1">
            <div className="flex justify-between items-center text-stone-300">
              <span className="font-semibold">Tặng hoa Thầy & Cô</span>
              <span className="font-mono font-bold text-pink-300">
                {config.studentGiftSpeed ?? 185} px/s
              </span>
            </div>
            <input
              type="range"
              min={80}
              max={450}
              step={5}
              value={config.studentGiftSpeed ?? 185}
              onChange={(e) =>
                onUpdateConfig({
                  studentGiftSpeed: parseInt(e.target.value, 10) || 185,
                })
              }
              className="w-full accent-pink-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* 2. THAO TÁC TEST (GOM CHUNG 1 THẺ) */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-amber-200">Thao Tác Test</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSpawnBatch(15)}
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10.5px] font-semibold text-emerald-300 cursor-pointer transition"
            >
              +15 Học Sinh
            </button>
            <button
              type="button"
              onClick={onLeaveAll}
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10.5px] font-semibold text-rose-300 cursor-pointer transition"
            >
              Tan học ra chơi
            </button>
          </div>
        </div>

        {/* Nút test nhanh học sinh & 7 Món Quà Sự Kiện Lớp Học */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => onSpawnRandom(false)}
              className="py-1.5 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-semibold text-stone-100 flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <UserCheck className="w-3.5 h-3.5 text-stone-300" />
              <span>+1 Học Sinh Vào Lớp</span>
            </button>

            <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-lg border border-stone-800 flex-1">
              <button
                type="button"
                onClick={() => setGiftTestTargetMode('in_class')}
                className={`flex-1 py-1 px-1.5 rounded text-[10px] font-bold transition cursor-pointer truncate ${
                  giftTestTargetMode === 'in_class'
                    ? 'bg-emerald-500 text-stone-950 shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Chọn ngẫu nhiên 1 học sinh đang ngồi trong lớp để thực hiện hành động quà ngay"
              >
                🎯 HS Trong Lớp (Hành động ngay)
              </button>
              <button
                type="button"
                onClick={() => setGiftTestTargetMode('queue_or_outside')}
                className={`flex-1 py-1 px-1.5 rounded text-[10px] font-bold transition cursor-pointer truncate ${
                  giftTestTargetMode === 'queue_or_outside'
                    ? 'bg-yellow-400 text-stone-950 shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Giả lập người trong hàng chờ hoặc ngoài lớp tặng quà -> Đẩy lên Top đầu hàng chờ & Hóa Vàng Tên"
              >
                👑 Ngoài Lớp / Chờ (Hóa Vàng)
              </button>
            </div>
          </div>

          {/* Chọn hệ số Combo khi bấm nút test 7 món quà lớp học */}
          <div className="flex items-center justify-between gap-1.5 bg-stone-950/90 px-2 py-1 rounded-lg border border-stone-800">
            <span className="text-[10px] font-bold text-amber-200">
              🔥 Chế độ Combo Quà:
            </span>
            <div className="flex items-center gap-1">
              {[
                { val: 1, label: 'x1 (Lẻ)' },
                { val: 3, label: '🔥 Combo x3 (Ném 3 hoa)' },
                { val: 5, label: '🔥 Combo x5' },
                { val: 10, label: '🔥 Combo x10' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setGiftTestComboCount(opt.val)}
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold transition cursor-pointer ${
                    giftTestComboCount === opt.val
                      ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-stone-950 shadow'
                      : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'Rose',
                  1,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="py-1.5 px-2 rounded-lg bg-pink-950/75 hover:bg-pink-900/80 border border-pink-500/45 text-[11px] font-bold text-pink-200 flex items-center justify-between gap-1 transition cursor-pointer"
            >
              <span className="truncate">🌹 (1) Hoa hồng: Tặng cô</span>
              <span className="text-[9.5px] font-mono text-emerald-300 shrink-0">+10đ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'Ice Cream',
                  1,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="py-1.5 px-2 rounded-lg bg-cyan-950/75 hover:bg-cyan-900/80 border border-cyan-500/45 text-[11px] font-bold text-cyan-200 flex items-center justify-between gap-1 transition cursor-pointer"
            >
              <span className="truncate">🍦 (1) Kem: Tặng thầy</span>
              <span className="text-[9.5px] font-mono text-emerald-300 shrink-0">+10đ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'Đỉnh',
                  1,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="py-1.5 px-2 rounded-lg bg-amber-950/75 hover:bg-amber-900/80 border border-amber-500/45 text-[11px] font-bold text-amber-200 flex items-center justify-between gap-1 transition cursor-pointer"
              title="Quà Đỉnh (con mèo đưa tay lên like 1 coin) -> Nuôi mèo"
            >
              <span className="truncate">🐱 (1) Đỉnh: Nuôi mèo</span>
              <span className="text-[9.5px] font-mono text-emerald-300 shrink-0">+10đ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'GG',
                  1,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="py-1.5 px-2 rounded-lg bg-emerald-950/75 hover:bg-emerald-900/80 border border-emerald-500/45 text-[11px] font-bold text-emerald-200 flex items-center justify-between gap-1 transition cursor-pointer"
            >
              <span className="truncate">🍿 (1) GG: Ăn vụn</span>
              <span className="text-[9.5px] font-mono text-emerald-300 shrink-0">+10đ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'Heart Me',
                  5,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="py-1.5 px-2 rounded-lg bg-fuchsia-950/75 hover:bg-fuchsia-900/80 border border-fuchsia-500/45 text-[11px] font-bold text-fuchsia-200 flex items-center justify-between gap-1 transition cursor-pointer"
            >
              <span className="truncate">🖥️ (5) Bắn tim: ĐT reo (PC)</span>
              <span className="text-[9.5px] font-mono text-emerald-300 shrink-0">+20đ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'Chú heo may mắn',
                  10,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="py-1.5 px-2 rounded-lg bg-rose-950/80 hover:bg-rose-900/85 border border-rose-500/50 text-[11px] font-bold text-rose-200 flex items-center justify-between gap-1 transition cursor-pointer"
              title="Quà Chú heo may mắn (10 coin) -> Thêm 1 heo lên bàn (max 1) & Thả 8 heo tấn công"
            >
              <span className="truncate">🐷 (10) Chú heo may mắn: 8 heo</span>
              <span className="text-[9.5px] font-mono text-emerald-300 shrink-0">+40đ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerClassroomGift?.(
                  'VIP',
                  20,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                )
              }
              className="col-span-2 py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:brightness-105 text-xs font-extrabold text-stone-950 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>💵 (10+) VIP: Tôi là Rich Kid (+99đ, cả lớp +30đ, Nhảy bàn & Mưa tiền 5s)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const randomPrices = [1, 2, 4, 6, 9, 15];
                const pickPrice =
                  randomPrices[Math.floor(Math.random() * randomPrices.length)];
                onTriggerClassroomGift?.(
                  `Quà Lạ ${pickPrice} Xu`,
                  pickPrice,
                  giftTestTargetMode === 'in_class' ? '' : customName,
                  customAvatarUrl,
                  giftTestTargetMode === 'in_class',
                  giftTestComboCount
                );
              }}
              className="col-span-2 py-1 px-2 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-700 text-[10.5px] font-semibold text-amber-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <span>🎲 Test Quà Ngoài Danh Sách (Tự khớp món bằng hoặc gần bằng giá ngẫu nhiên)</span>
            </button>
          </div>

          {/* 5 NÚT TEST THẢ TIM NGẪU NHIÊN BẰNG NPC TRONG LỚP & HÀNG CHỜ (10 / 20 / 30 / 40 / 50 TIM ±3) */}
          <div className="p-2 rounded-lg bg-stone-950/90 border border-rose-500/40 space-y-1.5 mt-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-extrabold text-rose-200">
                ❤️ Test Thả Tim NPC Ngẫu Nhiên (Trong Lớp & Hàng Chờ • ±3 tim)
              </span>
              <span className="text-[9.5px] font-mono text-rose-300/90">
                1 tim = 1 sát thương Zombie
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[10, 20, 30, 40, 50].map((baseHearts) => (
                <button
                  key={baseHearts}
                  type="button"
                  onClick={() => {
                    const delta = Math.floor(Math.random() * 7) - 3; // ngẫu nhiên từ -3 đến +3
                    const finalHearts = Math.max(1, baseHearts + delta);
                    onTriggerLike(finalHearts, '__RANDOM_NPC__');
                  }}
                  className="py-1.5 px-1.5 rounded-lg bg-gradient-to-b from-rose-600/85 to-pink-700/85 hover:from-rose-500 hover:to-pink-600 border border-rose-400/50 text-[11px] font-black text-white flex flex-col items-center justify-center gap-0.5 shadow-sm transition cursor-pointer active:scale-95"
                  title={`Chọn ngẫu nhiên 1 NPC trong lớp hoặc hàng chờ thả ${baseHearts} tim (cộng/trừ ngẫu nhiên 3 tim)`}
                >
                  <span>❤️ {baseHearts}</span>
                  <span className="text-[8.5px] font-mono text-rose-100/90">
                    (±3 tim)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* TỰ ĐỘNG CHO NPC SỬ DỤNG QUÀ TẶNG (TÙY CHỈNH ALL LOẠI QUÀ + CÁCH BAO NHIÊU GIÂY ±1, 2, 3s NGẪU NHIÊN) */}
          <div className="p-2 rounded-lg bg-stone-950/90 border border-cyan-500/40 space-y-2 mt-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-[10.5px] font-extrabold text-cyan-200">
                  🤖 Tự Động Cho NPC Tặng Quà (Ngẫu nhiên ±1, 2, 3s)
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    npcAutoGiftEnabled: !config.npcAutoGiftEnabled,
                  })
                }
                className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold border cursor-pointer transition ${
                  config.npcAutoGiftEnabled
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                    : 'bg-stone-900 border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                {config.npcAutoGiftEnabled ? '🟢 ĐANG BẬT AUTO QUÀ NPC' : '⚪ ĐANG TẮT'}
              </button>
            </div>

            {/* Khoảng cách giây giữa mỗi lần tặng quà (±1, 2, 3s ngẫu nhiên) */}
            <div className="flex items-center justify-between gap-2 bg-stone-900/80 px-2 py-1 rounded border border-stone-800">
              <span className="text-[10px] text-stone-300 font-semibold">
                Cách mỗi (cộng/trừ ngẫu nhiên 1, 2, 3s):
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="range"
                  min={2}
                  max={60}
                  step={1}
                  value={config.npcAutoGiftIntervalSec ?? 8}
                  onChange={(e) =>
                    onUpdateConfig({
                      npcAutoGiftIntervalSec: Math.max(
                        2,
                        parseInt(e.target.value, 10) || 8
                      ),
                    })
                  }
                  className="w-20 accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
                <input
                  type="number"
                  min={2}
                  max={180}
                  value={config.npcAutoGiftIntervalSec ?? 8}
                  onChange={(e) =>
                    onUpdateConfig({
                      npcAutoGiftIntervalSec: Math.max(
                        2,
                        parseInt(e.target.value, 10) || 8
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-[10.5px] font-mono font-bold text-cyan-300 text-right"
                />
                <span className="text-[10px] font-mono text-cyan-300">
                  s (±1~3s)
                </span>
              </div>
            </div>

            {/* Tùy chỉnh các loại quà cho phép NPC tự động sử dụng (All 7 loại quà) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1 text-[9.5px]">
                <span className="text-stone-400 font-semibold">
                  Chọn loại quà cho phép NPC dùng ({(config.npcAutoGiftAllowedIds ?? ['rose', 'icecream', 'cat', 'gg', 'heart', 'pig', 'vip']).length}/7 món):
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      npcAutoGiftAllowedIds: [
                        'rose',
                        'icecream',
                        'cat',
                        'gg',
                        'heart',
                        'pig',
                        'vip',
                      ],
                    })
                  }
                  className="px-1.5 py-0.2 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 text-cyan-200 font-bold cursor-pointer"
                >
                  Chọn All (7 quà)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1">
                {CLASSROOM_GIFT_EVENTS_META.map((gMeta) => {
                  const currentAllowed: ClassroomGiftEventId[] =
                    Array.isArray(config.npcAutoGiftAllowedIds) &&
                    config.npcAutoGiftAllowedIds.length > 0
                      ? config.npcAutoGiftAllowedIds
                      : ['rose', 'icecream', 'cat', 'gg', 'heart', 'pig', 'vip'];
                  const isChecked = currentAllowed.includes(gMeta.id);

                  const toggleGiftAllowed = () => {
                    if (isChecked) {
                      if (currentAllowed.length <= 1) return; // Giữ ít nhất 1 món quà
                      onUpdateConfig({
                        npcAutoGiftAllowedIds: currentAllowed.filter(
                          (id) => id !== gMeta.id
                        ),
                      });
                    } else {
                      onUpdateConfig({
                        npcAutoGiftAllowedIds: [...currentAllowed, gMeta.id],
                      });
                    }
                  };

                  return (
                    <button
                      key={`auto-npc-gift-${gMeta.id}`}
                      type="button"
                      onClick={toggleGiftAllowed}
                      className={`px-2 py-1 rounded border text-[9.5px] font-bold flex items-center justify-between gap-1 cursor-pointer transition ${
                        isChecked
                          ? 'bg-cyan-950/75 border-cyan-400/70 text-cyan-100'
                          : 'bg-stone-900/60 border-stone-800 text-stone-500'
                      }`}
                    >
                      <span className="truncate">{gMeta.giftLabel}</span>
                      <span className="font-mono text-[8.5px] shrink-0">
                        {isChecked ? '✓ Bật' : 'Tắt'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Nút test Combo */}
        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-stone-800/80">
          <button
            type="button"
            onClick={() =>
              onTriggerGiftCombo(
                'streak_50_roses',
                customName,
                customPrayer,
                customAvatarUrl
              )
            }
            className="py-1.5 px-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/45 border border-rose-400/50 text-[11px] font-bold text-rose-100 flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <span>🌹 Combo x50</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onTriggerGiftCombo(
                'instant_50_roses',
                customName,
                customPrayer,
                customAvatarUrl
              )
            }
            className="py-1.5 px-2 rounded-lg bg-rose-900/60 hover:bg-rose-800/70 border border-rose-400/50 text-[11px] font-semibold text-rose-100 flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <span>⚡ Gộp 50 Hoa</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onTriggerGiftCombo(
                'multi_user_combo_storm',
                customName,
                customPrayer,
                customAvatarUrl
              )
            }
            className="py-1.5 px-2 rounded-lg bg-amber-900/50 hover:bg-amber-800/60 border border-amber-400/50 text-[11px] font-semibold text-amber-100 flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <span>🎆 Bão 4 Khách</span>
          </button>
        </div>

        {/* Form gửi người xem / lời cầu nguyện cụ thể */}
        <form
          onSubmit={handleCustomSubmit}
          className="pt-2 border-t border-stone-800/80 space-y-2"
        >
          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Tên học sinh..."
              className="col-span-1 px-2 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />
            <input
              type="text"
              value={customPrayer}
              onChange={(e) => setCustomPrayer(e.target.value)}
              placeholder="Lời phát biểu xây dựng bài..."
              className="col-span-2 px-2 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customVip}
                  onChange={(e) => setCustomVip(e.target.checked)}
                  className="accent-amber-500 w-3.5 h-3.5 rounded"
                />
                <span>Kèm quà</span>
              </label>
              {customVip && (
                <select
                  value={customCoins}
                  onChange={(e) => setCustomCoins(parseInt(e.target.value, 10))}
                  className="px-1.5 py-1 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono text-amber-300"
                >
                  <option value={1}>1 Xu</option>
                  <option value={5}>5 Xu</option>
                  <option value={10}>10 Xu</option>
                  <option value={25}>25 Xu</option>
                </select>
              )}

              {customAvatarUrl && (
                <img
                  src={customAvatarUrl}
                  alt="Avatar"
                  className="w-5 h-5 rounded-sm object-cover border border-amber-400"
                />
              )}
              <label className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
                <ImagePlus className="w-3 h-3" />
                <span>{customAvatarUrl ? 'Đổi ảnh' : 'Avatar'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setCustomAvatarUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                  }}
                />
              </label>
              {customAvatarUrl && (
                <button
                  type="button"
                  onClick={() => setCustomAvatarUrl(null)}
                  className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-stone-100 hover:bg-white text-stone-950 font-bold text-xs flex items-center gap-1 transition shrink-0 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Gửi</span>
            </button>
          </div>
        </form>
      </section>

      {/* 3. BẢNG "KÍCH HOẠT SỰ KIỆN" */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-pink-500/35 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <h2 className="text-xs font-bold text-pink-200">
              Bảng &quot;Kích hoạt sự kiện&quot; ({grandEventProgress}/
              {config.grandEventTarget})
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  showGrandEventBox: hud.showGrandEventBox === false,
                })
              }
              className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition ${
                hud.showGrandEventBox !== false
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-stone-950 border-stone-700 text-stone-400'
              }`}
              title="Nếu ẩn bảng này đi, hệ thống sẽ tắt đếm điểm tăng cấp và tắt cả hoa bay cho tới khi hiện lại"
            >
              {hud.showGrandEventBox !== false ? 'ĐANG HIỆN' : 'ĐANG ẨN (TẮT ĐẾM & HOA)'}
            </button>

            {[20, 50, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onUpdateConfig({ grandEventTarget: preset })}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                  config.grandEventTarget === preset
                    ? 'bg-pink-500 text-stone-950 font-bold'
                    : 'bg-stone-800 text-stone-300'
                }`}
              >
                {preset}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={100000}
              step={5}
              value={config.grandEventTarget}
              onChange={(e) =>
                onUpdateConfig({
                  grandEventTarget: Math.max(
                    1,
                    parseInt(e.target.value, 10) || 50
                  ),
                })
              }
              className="w-14 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono text-amber-300 text-right"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-stone-950/85 border border-stone-800 text-[10.5px]">
          <div className="text-stone-300 leading-snug">
            <span className="font-bold text-pink-300">+10 Hoa / Câu đúng</span> •{' '}
            <span className="text-amber-200 font-semibold">+1 điểm</span> mỗi câu trả lời đúng (HS trong lớp &amp; HS học ké). Đầy bảng tự kích hoạt sự kiện ngẫu nhiên!
          </div>
          <button
            type="button"
            onClick={onTriggerGrandEvent}
            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-[10.5px] font-extrabold text-stone-950 flex items-center gap-1 cursor-pointer shrink-0"
            title="Kích hoạt ngay 1 sự kiện lớp học ngẫu nhiên"
          >
            <Bell className="w-3 h-3" />
            <span>Kích hoạt Event</span>
          </button>
        </div>

        {/* Tùy chỉnh số hoa bay vào bảng (tượng trưng) để tránh lag máy */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-pink-200">
              🌺 Số hoa bay vào bảng tối đa (tượng trưng, chống lag)
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={0}
                max={30}
                value={config.maxFlyingLotuses ?? 5}
                onChange={(e) =>
                  onUpdateConfig({
                    maxFlyingLotuses: Math.max(
                      0,
                      Math.min(30, parseInt(e.target.value, 10) || 0)
                    ),
                  })
                }
                className="w-12 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-xs font-mono font-bold text-pink-300 text-right"
              />
              <span className="text-[11px] font-mono text-pink-300">hoa</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 shrink-0">
              {[0, 1, 3, 5, 8, 15].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => onUpdateConfig({ maxFlyingLotuses: num })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                    (config.maxFlyingLotuses ?? 5) === num
                      ? 'bg-pink-500 text-stone-950 font-bold'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                >
                  {num === 0 ? 'Tắt' : num}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={Math.min(20, Math.max(0, config.maxFlyingLotuses ?? 5))}
              onChange={(e) =>
                onUpdateConfig({
                  maxFlyingLotuses: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              className="flex-1 accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* 4.8. BẢNG NOTE 1 ("Đây là trò chơi 2D.") */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-yellow-500/35 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MessageSquareQuote className="w-3.5 h-3.5 text-yellow-400" />
            <h2 className="text-xs font-bold text-yellow-200">
              Bảng Note 1 (&quot;Đây là trò chơi 2D.&quot;)
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  showNote1Box: hud.showNote1Box === false ? true : false,
                })
              }
              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition ${
                hud.showNote1Box !== false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-stone-900 border-stone-700 text-stone-400'
              }`}
            >
              {hud.showNote1Box !== false ? 'Đang Hiện' : 'Đang Ẩn'}
            </button>
            <span className="text-[10.5px] text-stone-400">Cỡ chữ:</span>
            <input
              type="range"
              min={7}
              max={20}
              step={0.5}
              value={hud.note1FontSize || 10}
              onChange={(e) =>
                onUpdateHudLayout({
                  note1FontSize: parseFloat(e.target.value),
                })
              }
              className="w-16 accent-yellow-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-mono font-bold text-yellow-300 w-9 text-right">
              {hud.note1FontSize || 10}px
            </span>
          </div>
        </div>

        <input
          type="text"
          value={hud.note1Content ?? 'Đây là trò chơi 2D.'}
          onChange={(e) => onUpdateHudLayout({ note1Content: e.target.value })}
          placeholder="Đây là trò chơi 2D."
          className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-800 text-xs text-yellow-200 font-semibold focus:outline-none focus:border-yellow-400"
        />
      </section>

      {/* 4.8b. BẢNG CHẠY CHỮ 1 DÒNG NGANG LIÊN TỤC (THÔNG BÁO DÀI) */}
      <section className="p-3 rounded-xl bg-stone-900/85 border border-cyan-500/45 space-y-2.5 shadow-md">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <MessageSquareQuote className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <h2 className="text-xs font-extrabold text-cyan-200">
              📢 Bảng Chạy Chữ Ngang 1 Dòng (Thông Báo Dài)
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  showMarqueeBox: hud.showMarqueeBox === false ? true : false,
                })
              }
              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition ${
                hud.showMarqueeBox !== false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-stone-900 border-stone-700 text-stone-400'
              }`}
            >
              {hud.showMarqueeBox !== false ? 'Đang Hiện' : 'Đang Ẩn'}
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({ editLayoutMode: !hud.editLayoutMode })
              }
              title="Bật chế độ kéo thả vị trí và kích thước khung Bảng Chạy Chữ trên sân khấu"
              className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                hud.editLayoutMode
                  ? 'bg-amber-400 text-stone-950 border-amber-300'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
              }`}
            >
              <Move className="w-2.5 h-2.5" />
              <span>Kéo vị trí</span>
            </button>
          </div>
        </div>

        <textarea
          rows={2}
          value={
            hud.marqueeContent ??
            '📢 Chào mừng các bạn học sinh vào lớp 12A1! Gõ "vào lớp" hoặc trả lời đúng câu hỏi để ngồi vào bàn học • Ngồi trong lớp gõ @tên để ném máy bay giấy và tặng Hoa Hồng trong 10s để gửi bó hoa cho bạn nhé! ❤️'
          }
          onChange={(e) =>
            onUpdateHudLayout({ marqueeContent: e.target.value })
          }
          placeholder="Nhập nội dung thông báo dài chạy chữ liên tục trên 1 dòng ngang..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-xs text-amber-200 font-semibold focus:outline-none focus:border-cyan-400 resize-y"
        />

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {/* Cỡ chữ (Font Size) */}
          <div className="p-2 rounded-lg bg-stone-950/85 border border-stone-800 space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-stone-300 font-semibold">Cỡ chữ (Font size):</span>
              <span className="font-mono font-bold text-amber-300">
                {hud.marqueeFontSize ?? 12}px
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={32}
              step={0.5}
              value={hud.marqueeFontSize ?? 12}
              onChange={(e) =>
                onUpdateHudLayout({
                  marqueeFontSize: parseFloat(e.target.value) || 12,
                })
              }
              className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Tốc độ chạy chữ (px/s) */}
          <div className="p-2 rounded-lg bg-stone-950/85 border border-stone-800 space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-stone-300 font-semibold">Tốc độ chạy chữ:</span>
              <span className="font-mono font-bold text-cyan-300">
                {hud.marqueeSpeed ?? 65} px/s
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={5}
              value={hud.marqueeSpeed ?? 65}
              onChange={(e) =>
                onUpdateHudLayout({
                  marqueeSpeed: parseInt(e.target.value, 10) || 65,
                })
              }
              className="w-full accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Độ mờ nền & Màu chữ */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-stone-400">Màu chữ:</span>
            {[
              { color: '#fde047', label: 'Vàng' },
              { color: '#ffffff', label: 'Trắng' },
              { color: '#67e8f9', label: 'Xanh' },
              { color: '#fda4af', label: 'Hồng' },
              { color: '#86efac', label: 'Lá' },
            ].map((sw) => {
              const activeColor = (hud.marqueeTextColor || '#fde047').toLowerCase();
              const isSelected = activeColor === sw.color.toLowerCase();
              return (
                <button
                  key={sw.color}
                  type="button"
                  onClick={() =>
                    onUpdateHudLayout({ marqueeTextColor: sw.color })
                  }
                  title={`Màu chữ: ${sw.label}`}
                  className={`w-4 h-4 rounded-full border cursor-pointer transition ${
                    isSelected
                      ? 'ring-2 ring-white scale-110 border-stone-950'
                      : 'border-stone-600 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: sw.color }}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-stone-400">Độ mờ nền:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={hud.marqueeOpacity ?? 0.88}
              onChange={(e) =>
                onUpdateHudLayout({
                  marqueeOpacity: parseFloat(e.target.value),
                })
              }
              className="w-20 accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <span className="text-[10.5px] font-mono font-bold text-cyan-300 w-9 text-right">
              {Math.round((hud.marqueeOpacity ?? 0.88) * 100)}%
            </span>
          </div>
        </div>
      </section>

      {/* 4.9. BẢNG "KỶ LỤC CÚP VÀNG" (LƯU 5 BẠN NHIỀU CÚP VÀNG NHẤT TRONG NGÀY + ANIMATION + RESET) */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-yellow-500/40 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <GoldTrophyIcon className="w-3.5 h-3.5" />
            <h2 className="text-xs font-bold text-yellow-200">
              Bảng &quot;Kỷ lục cúp vàng&quot; (Top 5 cúp vàng trong ngày)
            </h2>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  showDailyRecordBox:
                    hud.showDailyRecordBox === false ? true : false,
                })
              }
              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition ${
                hud.showDailyRecordBox !== false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-stone-900 border-stone-700 text-stone-400'
              }`}
            >
              {hud.showDailyRecordBox !== false ? 'Đang Hiện' : 'Đang Ẩn'}
            </button>

            {onResetDailyRecords && (
              <button
                type="button"
                onClick={onResetDailyRecords}
                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition shadow"
                title="Reset bảng Kỷ lục cúp vàng trong ngày về 0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Cúp Ngày</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-stone-400 block mb-0.5">
              Tiêu đề bảng:
            </label>
            <input
              type="text"
              value={hud.dailyRecordTitle ?? 'Kỷ lục cúp vàng'}
              onChange={(e) =>
                onUpdateHudLayout({ dailyRecordTitle: e.target.value })
              }
              placeholder="Kỷ lục cúp vàng"
              className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-800 text-xs text-yellow-200 font-semibold focus:outline-none focus:border-yellow-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-stone-400 mb-0.5">
              <span>Cỡ chữ ({hud.dailyRecordFontSize ?? 9.5}px):</span>
              <span className="font-mono text-yellow-300 font-bold">
                Độ mờ: {Math.round((hud.dailyRecordOpacity ?? hud.hudOpacity ?? 0.9) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={7}
                max={20}
                step={0.5}
                value={hud.dailyRecordFontSize ?? 9.5}
                onChange={(e) =>
                  onUpdateHudLayout({
                    dailyRecordFontSize: parseFloat(e.target.value),
                  })
                }
                className="w-1/2 accent-yellow-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={hud.dailyRecordOpacity ?? hud.hudOpacity ?? 0.9}
                onChange={(e) =>
                  onUpdateHudLayout({
                    dailyRecordOpacity: parseFloat(e.target.value),
                  })
                }
                className="w-1/2 accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Xem nhanh 5 bạn đang giữ Kỷ lục cúp vàng trong ngày */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-stone-400 pb-0.5 border-b border-stone-800">
            <span>Danh sách Top 5 Kỷ lục cúp vàng (trong ngày):</span>
            <span className="font-mono text-yellow-300 font-bold">
              Format: Avatar / Tên / Cúp 🏆 / Top 1..5
            </span>
          </div>
          {dailyRecords.length > 0 ? (
            <div className="space-y-1">
              {dailyRecords.slice(0, 5).map((rec, idx) => (
                <div
                  key={`ctrl-rec-${idx}-${rec.username}`}
                  className="flex items-center justify-between gap-2 px-2 py-0.5 rounded bg-stone-900/90 border border-stone-800 text-[10.5px]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className="w-4 h-4 rounded-full border border-amber-300/70 overflow-hidden flex items-center justify-center shrink-0 text-[8px] font-black text-white"
                      style={{ backgroundColor: rec.avatarColor || '#334155' }}
                    >
                      {rec.avatarUrl ? (
                        <img
                          src={rec.avatarUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        rec.username.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="font-bold text-stone-100 truncate">
                      {rec.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-0.5 font-mono font-black text-yellow-300 tabular-nums">
                      <span>{rec.points.toLocaleString('vi-VN')}</span>
                      <GoldTrophyIcon className="w-3 h-3" />
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 border border-yellow-400/50 text-[9px] font-black text-yellow-200">
                      Top {idx + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-stone-500 italic text-center py-1">
              Chưa có cúp vàng trong ngày (chỉ cộng ở cuối bài kiểm tra 15 phút: Top 1 +3, Top 2 +2, Top 3 +1)
            </div>
          )}
        </div>

        <HudCycleSettingsCard
          title="Kỷ lục cúp vàng"
          cycle={hud.dailyRecordCycle}
          onChange={(nextCycle) =>
            onUpdateHudLayout({ dailyRecordCycle: nextCycle })
          }
        />
      </section>

      {/* 5. BẢNG HƯỚNG DẪN (Chỉnh vị trí dòng ↑/↓ cạnh nút thêm dòng, cỡ chữ, 10 màu chữ đồng bộ viền & chạy bảng theo chu kỳ) */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-emerald-500/35 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-xs font-bold text-emerald-200">
            Bảng Hướng Dẫn ({(hud.guideItems ?? DEFAULT_GUIDE_ITEMS).length} dòng)
          </h2>

          <div className="flex items-center gap-1 flex-wrap">
            {/* Mục tăng/giảm size chữ của Bảng Hướng Dẫn */}
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-800 mr-1">
              <span className="text-[10px] text-stone-400">Cỡ chữ:</span>
              <input
                type="range"
                min={6.5}
                max={18}
                step={0.5}
                value={hud.guideFontSize || 8.5}
                onChange={(e) =>
                  onUpdateHudLayout({
                    guideFontSize: parseFloat(e.target.value),
                  })
                }
                className="w-16 accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <span className="text-[10.5px] font-mono font-bold text-emerald-300 w-9 text-right">
                {hud.guideFontSize || 8.5}px
              </span>
            </div>

            {/* Nút Thêm dòng + Nút Mũi tên Lên (↑) và Mũi tên Xuống (↓) cạnh nút Thêm dòng */}
            <button
              type="button"
              onClick={() => {
                const currentList = hud.guideItems ?? DEFAULT_GUIDE_ITEMS;
                const nextItem: GuideTaskItem = {
                  id: `guide-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  label: 'Mục mới',
                  shortDesc: 'Nội dung hướng dẫn',
                  modelType: 'rose',
                  colorTheme: 'amber',
                };
                const nextList = [...currentList, nextItem];
                onUpdateHudLayout({ guideItems: nextList });
                setSelectedGuideIdx(nextList.length - 1);
              }}
              className="px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition"
            >
              <Plus className="w-3 h-3" />
              <span>Thêm dòng</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const currentList = [...(hud.guideItems ?? DEFAULT_GUIDE_ITEMS)];
                const safeIdx = Math.min(
                  Math.max(0, selectedGuideIdx),
                  currentList.length - 1
                );
                if (safeIdx <= 0) return;
                [currentList[safeIdx - 1], currentList[safeIdx]] = [
                  currentList[safeIdx],
                  currentList[safeIdx - 1],
                ];
                onUpdateHudLayout({ guideItems: currentList });
                setSelectedGuideIdx(safeIdx - 1);
              }}
              title="Đẩy dòng đang chọn lên trên"
              className="p-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 cursor-pointer transition"
            >
              <ArrowUp className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={() => {
                const currentList = [...(hud.guideItems ?? DEFAULT_GUIDE_ITEMS)];
                const safeIdx = Math.min(
                  Math.max(0, selectedGuideIdx),
                  currentList.length - 1
                );
                if (safeIdx < 0 || safeIdx >= currentList.length - 1) return;
                [currentList[safeIdx], currentList[safeIdx + 1]] = [
                  currentList[safeIdx + 1],
                  currentList[safeIdx],
                ];
                onUpdateHudLayout({ guideItems: currentList });
                setSelectedGuideIdx(safeIdx + 1);
              }}
              title="Đẩy dòng đang chọn xuống dưới"
              className="p-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 cursor-pointer transition"
            >
              <ArrowDown className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateHudLayout({ guideItems: DEFAULT_GUIDE_ITEMS });
                setSelectedGuideIdx(0);
              }}
              title="Khôi phục mặc định"
              className="px-1.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
          {(hud.guideItems ?? DEFAULT_GUIDE_ITEMS).map((item, idx) => {
            const currentList = hud.guideItems ?? DEFAULT_GUIDE_ITEMS;
            const isRowSelected = selectedGuideIdx === idx;
            const updateItem = (patch: Partial<GuideTaskItem>) => {
              const next = currentList.map((it, i) =>
                i === idx ? { ...it, ...patch } : it
              );
              onUpdateHudLayout({ guideItems: next });
            };
            const moveRow = (dir: -1 | 1) => {
              const targetIdx = idx + dir;
              if (targetIdx < 0 || targetIdx >= currentList.length) return;
              const next = [...currentList];
              [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
              onUpdateHudLayout({ guideItems: next });
              setSelectedGuideIdx(targetIdx);
            };
            const removeItem = () => {
              const next = currentList.filter((_, i) => i !== idx);
              onUpdateHudLayout({ guideItems: next });
              if (selectedGuideIdx >= next.length) {
                setSelectedGuideIdx(Math.max(0, next.length - 1));
              }
            };
            const hasIcon =
              Boolean(item.modelType) && item.modelType !== 'none';

            return (
              <div
                key={item.id || idx}
                onClick={() => setSelectedGuideIdx(idx)}
                className={`p-1.5 rounded-lg bg-stone-950 border flex items-center gap-1 transition cursor-pointer ${
                  isRowSelected
                    ? 'border-emerald-400/80 ring-1 ring-emerald-400/30'
                    : 'border-stone-800 hover:border-stone-700'
                }`}
              >
                {/* Nút Lên / Xuống trên từng dòng */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveRow(-1);
                    }}
                    disabled={idx === 0}
                    title="Di chuyển dòng lên"
                    className="p-0.5 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-stone-300 cursor-pointer"
                  >
                    <ArrowUp className="w-2.5 h-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveRow(1);
                    }}
                    disabled={idx === currentList.length - 1}
                    title="Di chuyển dòng xuống"
                    className="p-0.5 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-stone-300 cursor-pointer"
                  >
                    <ArrowDown className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Ô hiển thị trực quan Icon tượng trưng cho quà tặng */}
                <div
                  title={
                    hasIcon
                      ? `Icon quà tặng: ${item.modelType}`
                      : 'Không dùng icon'
                  }
                  className="w-7 h-7 rounded-md bg-stone-900 border border-amber-400/50 flex items-center justify-center shrink-0 shadow-inner"
                >
                  {hasIcon ? (
                    <SchoolGiftArt
                      type={item.modelType as OfferingGiftType}
                      customAssets={customAssets}
                      size="sm"
                      className="w-5 h-5"
                    />
                  ) : (
                    <span className="text-[9px] text-stone-500 font-mono">
                      --
                    </span>
                  )}
                </div>

                <select
                  value={item.modelType || 'none'}
                  onChange={(e) =>
                    updateItem({
                      modelType: e.target.value as GuideTaskItem['modelType'],
                    })
                  }
                  className="px-1 py-1 rounded bg-stone-900 border border-stone-700 text-[10px] text-amber-300 shrink-0 focus:outline-none"
                >
                  <option value="none">Không icon</option>
                  <option value="rose">🌹 Hoa hồng</option>
                  <option value="icecream">🍦 Kem</option>
                  <option value="cat">🐱 Con mèo</option>
                  <option value="gg">🍿 GG</option>
                  <option value="heart">🖥️ Bắn tim</option>
                  <option value="pig">🐷 Heo</option>
                  <option value="vip">💵 VIP</option>
                  <option value="lotus">🪷 Trà sữa</option>
                  <option value="tray">🎁 Hộp quà</option>
                  <option value="special_tray">🏆 Cúp vàng</option>
                  <option value="incense">📒 Vở điểm 10</option>
                </select>

                {/* Thẻ chọn 10 màu chữ nổi bật trên nền tối (đồng bộ màu viền thẻ chứa chữ) */}
                <select
                  value={item.colorTheme || 'amber'}
                  onChange={(e) =>
                    updateItem({
                      colorTheme: e.target.value as GuideTaskItem['colorTheme'],
                    })
                  }
                  title="Chọn màu chữ & màu viền đồng bộ (10 màu nổi bật)"
                  className="px-1 py-1 rounded bg-stone-900 border border-stone-700 text-[10px] font-bold text-stone-100 shrink-0 focus:outline-none"
                >
                  <option value="yellow">🟡 Vàng sáng</option>
                  <option value="amber">🟠 Vàng cam</option>
                  <option value="orange">🟧 Cam rực</option>
                  <option value="rose">🌹 Đỏ hồng</option>
                  <option value="pink">🌸 Hồng phấn</option>
                  <option value="fuchsia">💖 Hồng tím</option>
                  <option value="violet">💜 Tím sáng</option>
                  <option value="cyan">🩵 Xanh ngọc</option>
                  <option value="emerald">💚 Xanh lục</option>
                  <option value="lime">🍏 Xanh chanh</option>
                </select>

                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateItem({ label: e.target.value })}
                  placeholder="Tên mục..."
                  className="w-20 px-1.5 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] font-bold text-amber-200 focus:outline-none focus:border-amber-500 shrink-0"
                />

                <input
                  type="text"
                  value={item.shortDesc}
                  onChange={(e) => updateItem({ shortDesc: e.target.value })}
                  placeholder="Mô tả..."
                  className="flex-1 min-w-0 px-1.5 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-stone-100 focus:outline-none focus:border-amber-500"
                />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem();
                  }}
                  className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 cursor-pointer shrink-0 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Chạy bảng theo chu kỳ cho Bảng Hướng Dẫn */}
        <HudCycleSettingsCard
          title="Bảng Hướng Dẫn"
          cycle={hud.guideCycle}
          onChange={(nextCycle) => onUpdateHudLayout({ guideCycle: nextCycle })}
        />
      </section>
    </div>
  );
};
