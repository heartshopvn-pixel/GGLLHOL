import React, { useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  Gamepad2,
  PanelRightClose,
  Skull,
  Sliders,
  Sparkles,
  ShieldCheck,
  MapPin,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  Tv,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CameraFocusState,
  CameraQueueItem,
  ClassBoardRuntimeState,
  ControlledNpcRole,
  CustomAssetsConfig,
  DailyRecordEntry,
  DevTabId,
  GameConfig,
  GridConfig,
  HudLayoutConfig,
  KneelSlot,
  PilgrimData,
  SafetyActionMode,
  SafetyCategory,
  SafetyLogEntry,
  WaitingQueueItem,
  ZombieEventRuntimeState,
  ZombieProjectileKind,
} from '../../types/game';
import { WsConnectionStatus } from '../../services/syncService';
import { TabControl } from './TabControl';
import { TabAudio } from './TabAudio';
import { TabNpc } from './TabNpc';
import { TabSafety } from './TabSafety';
import { TabMapEditor } from './TabMapEditor';
import { TabTikTokNode } from './TabTikTokNode';
import { TabCamera } from './TabCamera';
import { TabEvent } from './TabEvent';
import { TabVfx } from './TabVfx';

interface DevStudioProps {
  activeTab: DevTabId;
  onSelectTab: (tab: DevTabId) => void;
  onCloseStudio: () => void;
  isLocalTabMuted: boolean;
  onToggleLocalMute: () => void;
  wsStatus: WsConnectionStatus;
  peerCounts: { totalPeers: number; obsPeers: number };
  onConnectWs: (url: string) => void;
  config: GameConfig;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onUpdateGrid: (patch: Partial<GridConfig>) => void;
  onAddDesk?: (kind: 'vip' | 'normal') => void;
  onRemoveDesk?: (kind: 'vip' | 'normal', deskId?: string) => void;
  onMoveWaypointsBatch?: (
    updates: Array<{
      kind: 'vip' | 'normal';
      index: number;
      pos: { x: number; y: number };
    }>
  ) => void;
  onUpdateHudLayout: (patch: Partial<HudLayoutConfig>) => void;
  realCount: number;
  botCount: number;
  queueCount: number;
  waitingQueue?: WaitingQueueItem[];
  grandEventProgress: number;
  ttsStatus: { text: string; active: boolean };
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
  onPlayBell: () => void;
  onPlayWoodenFish: () => void;
  onPanicMute: () => void;
  onTestTTS: () => void;
  onSpeakHostLiveText: (
    text: string,
    options?: {
      interrupt?: boolean;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }
  ) => void;
  onNextDharmaArticle: () => void;
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
  pilgrims: PilgrimData[];
  doorCrowd?: PilgrimData[];
  npcNames: string[];
  npcPrayers: string[];
  npcAvatars: string[];
  controlledNpcRole?: ControlledNpcRole;
  onToggleControlNpc?: (role?: ControlledNpcRole) => void;
  onSetNpcManualMove?: (dir: 'w' | 'a' | 's' | 'd', active: boolean) => void;
  onSendControlledStudentComment?: (username: string, comment: string) => void;
  onUpdateNpcNames: (names: string[]) => void;
  onResetNpcNames: () => void;
  onUpdateNpcPrayers: (prayers: string[]) => void;
  onResetNpcPrayers: () => void;
  onUpdateNpcAvatars: (avatars: string[]) => void;
  onResetNpcAvatars: () => void;
  onRandomizeActiveNpcAvatars: () => void;
  safetyActionMode: SafetyActionMode;
  safetyCategories: SafetyCategory[];
  customWords: string[];
  safetyLogs: SafetyLogEntry[];
  onChangeSafetyMode: (mode: SafetyActionMode) => void;
  onToggleSafetyCategory: (key: string, enabled: boolean) => void;
  onAddCustomWords: (raw: string) => void;
  onRemoveCustomWord: (word: string) => void;
  onResetCustomWords: () => void;
  onClearSafetyLogs: () => void;
  onSpawnTrollTest: () => void;
  vipSlots: KneelSlot[];
  normalSlots: KneelSlot[];
  customAssets: CustomAssetsConfig;
  onUploadAsset: (key: keyof CustomAssetsConfig, file: File) => void;
  onResetAsset: (key: keyof CustomAssetsConfig) => void;
  onSaveBackupJson: () => void;
  onLoadBackupJson: (rawJsonText: string) => { ok: boolean; message: string };
  lotusDonorsCount?: number;
  onClearLotusDonors?: () => void;
  dailyRecords?: DailyRecordEntry[];
  onResetDailyRecords?: () => void;
  eventTtsQueue: {
    waitingCount: number;
    isPlayingEvent: boolean;
    currentEventText: string | null;
    queueItems: string[];
  };
  onClearEventTtsQueue: () => void;
  cameraFocus: CameraFocusState;
  cameraQueue: CameraQueueItem[];
  onSkipCameraTarget: () => void;
  onResetCameraView: () => void;
  onClearCameraQueue: () => void;
  onRemoveCameraQueueItem: (queueId: string) => void;
  onFocusPilgrimNow: (pilgrimId: number) => void;
  onPushFullSyncToLive?: () => void;
  classBoardState?: ClassBoardRuntimeState;
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
  zombieEventState?: ZombieEventRuntimeState;
  onTriggerZombieEvent?: (immediate?: boolean) => void;
  onStopZombieEvent?: () => void;
  onKillZombieImmediately?: () => void;
  onTestZombieAttack?: (
    kind:
      | 'heart_seated'
      | 'heart_queue'
      | 'book'
      | 'chair'
      | 'desk_mate'
      | 'desk_mate_10plus',
    customUsername?: string
  ) => void;
  compactRemoteStage?: boolean;
  onToggleCompactRemoteStage?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: (hideStudio?: boolean) => void;
  stretchFullViewport?: boolean;
  onToggleStretchFullViewport?: () => void;
}

export const DevStudio: React.FC<DevStudioProps> = ({
  activeTab,
  onSelectTab,
  onCloseStudio,
  isLocalTabMuted,
  onToggleLocalMute,
  wsStatus,
  peerCounts,
  onConnectWs,
  config,
  onUpdateConfig,
  onUpdateGrid,
  onAddDesk,
  onRemoveDesk,
  onMoveWaypointsBatch,
  onUpdateHudLayout,
  realCount,
  botCount,
  queueCount,
  waitingQueue = [],
  grandEventProgress,
  ttsStatus,
  onSpawnRandom,
  onSpawnBatch,
  onLeaveAll,
  onSpawnCustom,
  onPlayBell,
  onPlayWoodenFish,
  onPanicMute,
  onTestTTS,
  onSpeakHostLiveText,
  onNextDharmaArticle,
  onTriggerLike,
  onTriggerFollow,
  onTriggerGrandEvent,
  onTriggerGiftCombo,
  onTriggerClassroomGift,
  pilgrims,
  doorCrowd = [],
  npcNames,
  npcPrayers,
  npcAvatars,
  controlledNpcRole = null,
  onToggleControlNpc,
  onSetNpcManualMove,
  onSendControlledStudentComment,
  onUpdateNpcNames,
  onResetNpcNames,
  onUpdateNpcPrayers,
  onResetNpcPrayers,
  onUpdateNpcAvatars,
  onResetNpcAvatars,
  onRandomizeActiveNpcAvatars,
  safetyActionMode,
  safetyCategories,
  customWords,
  safetyLogs,
  onChangeSafetyMode,
  onToggleSafetyCategory,
  onAddCustomWords,
  onRemoveCustomWord,
  onResetCustomWords,
  onClearSafetyLogs,
  onSpawnTrollTest,
  vipSlots,
  normalSlots,
  customAssets,
  onUploadAsset,
  onResetAsset,
  onSaveBackupJson,
  onLoadBackupJson,
  lotusDonorsCount = 0,
  onClearLotusDonors,
  dailyRecords = [],
  onResetDailyRecords,
  eventTtsQueue,
  onClearEventTtsQueue,
  cameraFocus,
  cameraQueue,
  onSkipCameraTarget,
  onResetCameraView,
  onClearCameraQueue,
  onRemoveCameraQueueItem,
  onFocusPilgrimNow,
  onPushFullSyncToLive,
  classBoardState,
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
  zombieEventState,
  onTriggerZombieEvent,
  onStopZombieEvent,
  onKillZombieImmediately,
  onTestZombieAttack,
  compactRemoteStage = false,
  onToggleCompactRemoteStage,
  isFullscreen = false,
  onToggleFullscreen,
  stretchFullViewport = false,
  onToggleStretchFullViewport,
}) => {
  const [copiedObsLink, setCopiedObsLink] = useState(false);
  const [pushedLiveSync, setPushedLiveSync] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const showBackupFeedback = (ok: boolean, text: string) => {
    setBackupNotice({ ok, text });
    setTimeout(() => {
      setBackupNotice(null);
    }, 4000);
  };

  const handleTopBarSaveJson = () => {
    onSaveBackupJson();
    showBackupFeedback(true, 'Đã tải xuống file cấu hình .json!');
  };

  const handleTopBarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const res = onLoadBackupJson(reader.result);
        showBackupFeedback(res.ok, res.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getObsCleanUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('obs', '1');
    return url.toString();
  };

  const handleCopyObsLink = () => {
    navigator.clipboard.writeText(getObsCleanUrl());
    setCopiedObsLink(true);
    setTimeout(() => setCopiedObsLink(false), 2500);
  };

  return (
    <aside className="w-[465px] max-w-full shrink-0 h-full bg-stone-950 border-l border-stone-800 flex flex-col z-40">
      {/* Studio Top Bar (Compact, Structured Grid) */}
      <div className="px-3 py-2.5 border-b border-stone-800 bg-stone-900/80 space-y-2">
        {/* Row 1: Title + Status Badge on Left | Tab Audio Mute (Cách 1) + Hide F2 on Right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Tv className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <h1 className="text-xs font-extrabold text-stone-100 truncate">
              Studio Điều Khiển
            </h1>
            <span className="text-stone-600">·</span>
            <span
              className={`text-[11px] font-mono whitespace-nowrap ${
                wsStatus === 'connected' ? 'text-emerald-400 font-bold' : 'text-stone-400'
              }`}
            >
              {wsStatus === 'connected' ? 'TikTok Live' : 'Giả lập'}
            </span>
            <span className="text-stone-600">·</span>
            <span
              className={`text-[11px] font-mono tabular-nums whitespace-nowrap ${
                peerCounts.obsPeers > 0 ? 'text-emerald-400 font-semibold' : 'text-stone-400'
              }`}
            >
              {peerCounts.obsPeers > 0
                ? `${peerCounts.obsPeers} OBS`
                : `${peerCounts.totalPeers} tab`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleLocalMute}
              title="Tắt/Mở tiếng riêng trên tab điều khiển này (Cách 1: Game và luồng tiết học vẫn chạy tự động 100%)"
              className={`h-7 px-2.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 shrink-0 transition cursor-pointer whitespace-nowrap ${
                isLocalTabMuted
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700'
              }`}
            >
              {isLocalTabMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>{peerCounts.obsPeers > 0 ? 'Slave (Tắt tiếng)' : 'Đã tắt tiếng tab'}</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mở tiếng tab</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onCloseStudio}
              title="Ẩn Studio (F2)"
              className="h-7 px-2 rounded-md bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[11px] font-semibold text-stone-300 flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <PanelRightClose className="w-3 h-3" />
              <span>F2</span>
            </button>
          </div>
        </div>

        {/* Row 2: OBS & Stage Controls (3 equal columns) */}
        <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-stone-800/80">
          <button
            type="button"
            onClick={handleCopyObsLink}
            title="Sao chép link OBS (?obs=1)"
            className="h-7 px-2 rounded-md bg-amber-500 hover:bg-amber-400 text-stone-950 text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            {copiedObsLink ? (
              <>
                <Check className="w-3 h-3 shrink-0" />
                <span>Đã chép Link</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 shrink-0" />
                <span>Link OBS</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleFullscreen?.()}
            title="Kích hoạt Full Màn Hình cho cửa sổ Link OBS Live (?obs=1), không làm ẩn bảng Dev điều khiển"
            className={`h-7 px-2 rounded-md text-[11px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
              isFullscreen
                ? 'bg-emerald-500 text-stone-950 shadow-xs'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/60 shadow-xs'
            }`}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3 h-3 shrink-0" />
                <span>Thoát Full OBS</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 shrink-0" />
                <span>Full Màn OBS</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleStretchFullViewport?.()}
            title="Bung khít 100% khung hình trên Link OBS Live (?obs=1) không viền đen (Mặc định đã Bật)"
            className={`h-7 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
              stretchFullViewport
                ? 'bg-cyan-500 text-stone-950 shadow-xs'
                : 'bg-stone-800 hover:bg-stone-700 text-cyan-300 border border-cyan-500/40'
            }`}
          >
            <span>{stretchFullViewport ? '↔️ OBS Bung khít' : '↔️ OBS Tỷ lệ 9:16'}</span>
          </button>
        </div>

        {/* Row 3: Sync, 2D Stage Saver & JSON Backup (4 equal columns) */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (!onPushFullSyncToLive) return;
              onPushFullSyncToLive();
              setPushedLiveSync(true);
              setTimeout(() => setPushedLiveSync(false), 2000);
            }}
            title="Đẩy cấu hình sang màn hình Live"
            className="h-7 px-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-stone-950 text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            {pushedLiveSync ? (
              <>
                <Check className="w-3 h-3 shrink-0" />
                <span>Đã đồng bộ</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 shrink-0" />
                <span>Đồng bộ Live</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleCompactRemoteStage?.()}
            title="Thu gọn Sân Khấu 2D trên tab điều khiển để tiết kiệm 90% GPU/CPU cho TikTok Live Studio"
            className={`h-7 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
              compactRemoteStage
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40'
            }`}
          >
            <Tv className="w-3 h-3 shrink-0" />
            <span>{compactRemoteStage ? 'Hiện Sân 2D' : '⚡ Thu gọn 2D'}</span>
          </button>

          <button
            type="button"
            onClick={handleTopBarSaveJson}
            title="Lưu toàn bộ cài đặt, câu hỏi và cấp độ EXP học sinh ra file .json"
            className="h-7 px-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-[11px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3 h-3 shrink-0" />
            <span>Lưu JSON</span>
          </button>

          <label
            title="Nạp lại toàn bộ cài đặt, câu hỏi và cấp độ EXP học sinh từ file .json"
            className="h-7 px-2 rounded-md bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 text-cyan-200 text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3 h-3 text-cyan-300 shrink-0" />
            <span>Nạp JSON</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleTopBarFileChange}
            />
          </label>
        </div>

        {peerCounts.obsPeers > 0 && (
          <div className="px-2.5 py-1 rounded-md bg-emerald-950/75 border border-emerald-500/40 flex items-center justify-between gap-2 text-[10px] text-emerald-200">
            <span className="font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              📡 Chế độ Remote Master–Slave: Live ({peerCounts.obsPeers} OBS) làm chuẩn • 0ms lệch nhịp
            </span>
            <span className="text-emerald-300/90 font-mono">Debounce 70ms</span>
          </div>
        )}

        {backupNotice && (
          <div
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center justify-between ${
              backupNotice.ok
                ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
            }`}
          >
            <span>{backupNotice.text}</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs (Balanced 2-Row Grid: 5 Primary + 4 System Tabs) */}
      <div className="px-3 py-2 border-b border-stone-800 bg-stone-950">
        <div className="p-1 bg-stone-900 rounded-lg border border-stone-800/80 space-y-1">
          {/* Tab Row 1: 5 Core Gameplay & Audio Tabs */}
          <div className="grid grid-cols-5 gap-1">
            <button
              type="button"
              onClick={() => onSelectTab('control')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'control'
                  ? 'bg-stone-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Sliders className="w-3 h-3 shrink-0" />
              <span>Đ.Khiển</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('event')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'event'
                  ? 'bg-red-950/90 text-red-300 border border-red-500/50 shadow-xs'
                  : zombieEventState && zombieEventState.phase !== 'idle'
                  ? 'text-red-400 animate-pulse'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Skull className="w-3 h-3 shrink-0" />
              <span>Event</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('camera')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'camera'
                  ? 'bg-stone-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Camera className="w-3 h-3 shrink-0" />
              <span>
                Cam{cameraQueue.length > 0 ? ` (${cameraQueue.length})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('audio')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'audio'
                  ? 'bg-stone-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Volume2 className="w-3 h-3 shrink-0" />
              <span>Âm thanh</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('npc')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'npc'
                  ? 'bg-stone-800 text-cyan-300 border border-cyan-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Gamepad2 className="w-3 h-3 shrink-0" />
              <span>NPC</span>
            </button>
          </div>

          {/* Tab Row 2: 4 Environment, VFX, Safety & TikTok Tabs */}
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => onSelectTab('safety')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'safety'
                  ? 'bg-stone-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span>Lọc ({safetyLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('map')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'map'
                  ? 'bg-stone-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span>Map</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('vfx')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'vfx'
                  ? 'bg-stone-800 text-pink-300 border border-pink-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>VFX</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab('tiktok')}
              className={`h-7 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'tiktok'
                  ? 'bg-stone-800 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/40'
              }`}
            >
              <Radio className="w-3 h-3 shrink-0" />
              <span>TikTok</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'control' && (
          <TabControl
            config={config}
            customAssets={customAssets}
            realCount={realCount}
            botCount={botCount}
            queueCount={queueCount}
            waitingQueue={waitingQueue}
            grandEventProgress={grandEventProgress}
            ttsStatus={ttsStatus}
            eventTtsQueue={eventTtsQueue}
            onClearEventTtsQueue={onClearEventTtsQueue}
            onUpdateConfig={onUpdateConfig}
            onUpdateHudLayout={onUpdateHudLayout}
            onSpeakHostLiveText={onSpeakHostLiveText}
            onPanicMute={onPanicMute}
            onSpawnRandom={onSpawnRandom}
            onSpawnBatch={onSpawnBatch}
            onLeaveAll={onLeaveAll}
            onSpawnCustom={onSpawnCustom}
            onTriggerLike={onTriggerLike}
            onTriggerFollow={onTriggerFollow}
            onTriggerGrandEvent={onTriggerGrandEvent}
            onTriggerGiftCombo={onTriggerGiftCombo}
            onTriggerClassroomGift={onTriggerClassroomGift}
            classBoardState={classBoardState}
            onToggleClassBoardRun={onToggleClassBoardRun}
            onRestartClassBoardFromStart={onRestartClassBoardFromStart}
            onRunNoticeBoard={onRunNoticeBoard}
            onNextClassBoardQuestion={onNextClassBoardQuestion}
            onSimulateQuizAnswer={onSimulateQuizAnswer}
            onEnqueueWaitingStudent={onEnqueueWaitingStudent}
            onRemoveWaitingQueueItem={onRemoveWaitingQueueItem}
            onClearWaitingQueue={onClearWaitingQueue}
            onClearNpcWaitingQueue={onClearNpcWaitingQueue}
            onAdmitNextWaitingStudent={onAdmitNextWaitingStudent}
            dailyRecords={dailyRecords}
            onResetDailyRecords={onResetDailyRecords}
          />
        )}

        {activeTab === 'audio' && (
          <TabAudio
            config={config}
            ttsStatus={ttsStatus}
            eventTtsQueue={eventTtsQueue}
            onClearEventTtsQueue={onClearEventTtsQueue}
            onUpdateConfig={onUpdateConfig}
            onSpeakHostLiveText={onSpeakHostLiveText}
            onPlayBell={onPlayBell}
            onPlayWoodenFish={onPlayWoodenFish}
            onPanicMute={onPanicMute}
            onTestTTS={onTestTTS}
            onNextDharmaArticle={onNextDharmaArticle}
          />
        )}

        {activeTab === 'npc' && (
          <TabNpc
            config={config}
            classBoardState={classBoardState}
            pilgrims={pilgrims}
            doorCrowd={doorCrowd}
            waitingQueue={waitingQueue}
            npcNames={npcNames}
            npcPrayers={npcPrayers}
            npcAvatars={npcAvatars}
            controlledNpcRole={controlledNpcRole}
            onToggleControlNpc={onToggleControlNpc}
            onSetNpcManualMove={onSetNpcManualMove}
            onSendControlledStudentComment={onSendControlledStudentComment}
            ttsStatus={ttsStatus}
            onSpeakHostLiveText={onSpeakHostLiveText}
            onPanicMute={onPanicMute}
            onUpdateConfig={onUpdateConfig}
            onUpdateNpcNames={onUpdateNpcNames}
            onResetNpcNames={onResetNpcNames}
            onUpdateNpcPrayers={onUpdateNpcPrayers}
            onResetNpcPrayers={onResetNpcPrayers}
            onUpdateNpcAvatars={onUpdateNpcAvatars}
            onResetNpcAvatars={onResetNpcAvatars}
            onRandomizeActiveNpcAvatars={onRandomizeActiveNpcAvatars}
          />
        )}

        {activeTab === 'safety' && (
          <TabSafety
            actionMode={safetyActionMode}
            categories={safetyCategories}
            customWords={customWords}
            logs={safetyLogs}
            onChangeActionMode={onChangeSafetyMode}
            onToggleCategory={onToggleSafetyCategory}
            onAddCustomWords={onAddCustomWords}
            onRemoveCustomWord={onRemoveCustomWord}
            onResetCustomWords={onResetCustomWords}
            onClearLogs={onClearSafetyLogs}
            onSpawnTrollTest={onSpawnTrollTest}
          />
        )}

        {activeTab === 'map' && (
          <TabMapEditor
            config={config}
            vipSlots={vipSlots}
            normalSlots={normalSlots}
            customAssets={customAssets}
            onUpdateConfig={onUpdateConfig}
            onUpdateGrid={onUpdateGrid}
            onAddDesk={onAddDesk}
            onRemoveDesk={onRemoveDesk}
            onMoveWaypointsBatch={onMoveWaypointsBatch}
            onUpdateHudLayout={onUpdateHudLayout}
            onUploadAsset={onUploadAsset}
            onResetAsset={onResetAsset}
            lotusDonorsCount={lotusDonorsCount}
            onClearLotusDonors={onClearLotusDonors}
            dailyRecords={dailyRecords}
            onResetDailyRecords={onResetDailyRecords}
          />
        )}

        {activeTab === 'camera' && (
          <TabCamera
            config={config}
            cameraFocus={cameraFocus}
            cameraQueue={cameraQueue}
            pilgrims={pilgrims}
            onUpdateConfig={onUpdateConfig}
            onSkipCameraTarget={onSkipCameraTarget}
            onResetCameraView={onResetCameraView}
            onClearCameraQueue={onClearCameraQueue}
            onRemoveCameraQueueItem={onRemoveCameraQueueItem}
            onFocusPilgrimNow={onFocusPilgrimNow}
          />
        )}

        {activeTab === 'event' && (
          <TabEvent
            config={config}
            customAssets={customAssets}
            zombieEventState={zombieEventState}
            onUpdateConfig={onUpdateConfig}
            onUploadAsset={onUploadAsset}
            onResetAsset={onResetAsset}
            onTriggerZombieEvent={onTriggerZombieEvent}
            onStopZombieEvent={onStopZombieEvent}
            onKillZombieImmediately={onKillZombieImmediately}
            onTestZombieAttack={onTestZombieAttack}
          />
        )}

        {activeTab === 'vfx' && (
          <TabVfx
            config={config}
            onUpdateConfig={onUpdateConfig}
            onTestFlower10Burst={() => onTriggerClassroomGift?.('Hoa Hồng', 1, undefined, null, true)}
          />
        )}

        {activeTab === 'tiktok' && (
          <TabTikTokNode wsStatus={wsStatus} onConnectWs={onConnectWs} />
        )}
      </div>
    </aside>
  );
};

