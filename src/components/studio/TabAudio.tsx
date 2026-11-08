import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  Drum,
  Gift,
  MessageSquareQuote,
  Music,
  Plus,
  Repeat,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AnswerRevealSfxPreset,
  BgmTrackItem,
  ClassroomGiftEventId,
  DharmaArticleItem,
  GameConfig,
  LessonFlow5ConditionKey,
  LessonFlow6ConditionKey,
  TTSEngineType,
} from '../../types/game';
import {
  CLASSROOM_GIFT_EVENTS_META,
  DEFAULT_CONFIG,
} from '../../config/constants';
import { soundEngine } from '../../services/soundEngine';

interface TabAudioProps {
  config: GameConfig;
  ttsStatus: { text: string; active: boolean };
  eventTtsQueue?: {
    waitingCount: number;
    isPlayingEvent: boolean;
    currentEventText: string | null;
    queueItems: string[];
  };
  onClearEventTtsQueue?: () => void;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onSpeakHostLiveText: (
    text: string,
    options?: {
      interrupt?: boolean;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }
  ) => void;
  onPlayBell: () => void;
  onPlayWoodenFish: () => void;
  onPanicMute: () => void;
  onTestTTS: () => void;
  onNextDharmaArticle: () => void;
}

export const TabAudio: React.FC<TabAudioProps> = ({
  config,
  ttsStatus,
  eventTtsQueue,
  onClearEventTtsQueue,
  onUpdateConfig,
  onSpeakHostLiveText,
  onPlayBell,
  onPlayWoodenFish,
  onPanicMute,
  onTestTTS,
  onNextDharmaArticle,
}) => {
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeFlow5Cond, setActiveFlow5Cond] =
    useState<LessonFlow5ConditionKey>('normal');
  const [activeFlow6Cond, setActiveFlow6Cond] =
    useState<LessonFlow6ConditionKey>('normal');

  const [liveDiagnostic, setLiveDiagnostic] = useState(() =>
    soundEngine.getEventQueueSnapshot().diagnostic
  );

  const scanVoices = () => {
    if (!('speechSynthesis' in window)) return;
    const list = window.speechSynthesis.getVoices() || [];
    const sorted = [...list].sort((a, b) => {
      const aVi = a.lang.toLowerCase().includes('vi') ? 1 : 0;
      const bVi = b.lang.toLowerCase().includes('vi') ? 1 : 0;
      return bVi - aVi;
    });
    setSystemVoices(sorted);
  };

  useEffect(() => {
    scanVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = scanVoices;
    }
    const unsubDiag = soundEngine.subscribeEventQueue((snap) => {
      setLiveDiagnostic(snap.diagnostic);
    });
    return () => {
      unsubDiag();
    };
  }, []);

  const bgmTracks = config.bgmTracks || [];
  const activeBgmTrack =
    bgmTracks.find((t) => t.id === config.activeBgmTrackId) || bgmTracks[0];

  const handleUploadBgmMp3 = (file: File) => {
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const newTrack: BgmTrackItem = {
          id: `bgm-custom-${Date.now()}`,
          title: cleanName || 'Nhạc Thiền MP3 Mới',
          url: reader.result,
        };
        const nextTracks = [...bgmTracks, newTrack];
        onUpdateConfig({
          bgmTracks: nextTracks,
          activeBgmTrackId: newTrack.id,
          bgmEnabled: true,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRenameActiveBgm = (newTitle: string) => {
    if (!activeBgmTrack) return;
    const nextTracks = bgmTracks.map((t) =>
      t.id === activeBgmTrack.id ? { ...t, title: newTitle } : t
    );
    onUpdateConfig({ bgmTracks: nextTracks });
  };

  const handleDeleteActiveBgm = () => {
    if (!activeBgmTrack || bgmTracks.length <= 1) return;
    const nextTracks = bgmTracks.filter((t) => t.id !== activeBgmTrack.id);
    onUpdateConfig({
      bgmTracks: nextTracks,
      activeBgmTrackId: nextTracks[0].id,
    });
  };

  const dharmaArticles = config.dharmaArticles || [];
  const activeDharma =
    dharmaArticles.find((a) => a.id === config.activeDharmaId) ||
    dharmaArticles[0];

  const handleUpdateActiveDharma = (patch: Partial<DharmaArticleItem>) => {
    if (!activeDharma) return;
    const nextList = dharmaArticles.map((item) =>
      item.id === activeDharma.id ? { ...item, ...patch } : item
    );
    onUpdateConfig({ dharmaArticles: nextList });
  };

  const handleAddDharmaArticle = () => {
    const idx = dharmaArticles.length + 1;
    const newItem: DharmaArticleItem = {
      id: `dharma-${Date.now()}`,
      title: `Bài ${idx}: Ôn Tập & Đố Vui Mới`,
      content:
        'Chào mừng các em đến với tiết sinh hoạt lớp 12A1. Chúc cả lớp học tập chăm chỉ, đạt nhiều Hoa Điểm 10 và đỗ Nguyện vọng 1 đại học mơ ước.',
    };
    onUpdateConfig({
      dharmaArticles: [...dharmaArticles, newItem],
      activeDharmaId: newItem.id,
    });
  };

  const handleDeleteActiveDharma = () => {
    if (!activeDharma || dharmaArticles.length <= 1) return;
    const nextList = dharmaArticles.filter((a) => a.id !== activeDharma.id);
    onUpdateConfig({
      dharmaArticles: nextList,
      activeDharmaId: nextList[0].id,
    });
  };

  const isAutoNext = config.dharmaAutoNext ?? true;
  const waitingCount = eventTtsQueue?.waitingCount ?? 0;
  const isPlayingEvent = eventTtsQueue?.isPlayingEvent ?? false;
  const currentEventText = eventTtsQueue?.currentEventText ?? null;
  const queueItems = eventTtsQueue?.queueItems ?? [];

  return (
    <div className="space-y-3.5">
      {/* 1. HÀNG CHỜ ÂM THANH SỰ KIỆN */}
      <section className="p-3 rounded-xl bg-stone-900/85 border border-amber-500/40 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MessageSquareQuote className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs font-bold text-amber-200">
              Hàng Chờ Đọc Sự Kiện ({waitingCount}/{config.maxTtsQueueSize ?? 30})
            </h2>
          </div>

          {waitingCount > 0 && onClearEventTtsQueue && (
            <button
              type="button"
              onClick={onClearEventTtsQueue}
              className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-[10px] font-bold text-rose-200 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa chờ ({waitingCount})</span>
            </button>
          )}
        </div>

        {/* Bộ đếm */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-1.5 rounded-lg bg-stone-950/90 border border-amber-500/30 text-center">
            <div className="text-[10px] text-stone-400">Chờ đọc</div>
            <div
              className={`text-base font-extrabold font-mono ${
                waitingCount > 0 ? 'text-amber-300' : 'text-stone-400'
              }`}
            >
              {waitingCount}
            </div>
          </div>

          <div className="p-1.5 rounded-lg bg-stone-950/90 border border-emerald-500/30 text-center">
            <div className="text-[10px] text-stone-400">Đang phát</div>
            <div
              className={`text-base font-extrabold font-mono ${
                isPlayingEvent ? 'text-emerald-400' : 'text-stone-400'
              }`}
            >
              {isPlayingEvent ? 1 : 0}
            </div>
          </div>

          <div className="p-1.5 rounded-lg bg-stone-950/90 border border-sky-500/30 text-center">
            <div className="text-[10px] text-stone-400">Tổng sự kiện</div>
            <div
              className={`text-base font-extrabold font-mono ${
                waitingCount + (isPlayingEvent ? 1 : 0) > 0
                  ? 'text-sky-300'
                  : 'text-stone-400'
              }`}
            >
              {waitingCount + (isPlayingEvent ? 1 : 0)}
            </div>
          </div>
        </div>

        {/* THẺ CỐ ĐỊNH THEO DÕI TRẠNG THÁI GIỌNG ĐỌC (ĐỨT / FALLBACK / CHUYỂN SERVER) */}
        <div
          className={`p-2.5 rounded-lg border space-y-2 transition-colors ${
            liveDiagnostic.health === 'disconnected'
              ? 'bg-rose-950/75 border-rose-500/70'
              : liveDiagnostic.health === 'fallback'
              ? 'bg-amber-950/75 border-amber-500/70'
              : liveDiagnostic.health === 'server_switched'
              ? 'bg-sky-950/75 border-sky-500/70'
              : 'bg-stone-950/95 border-emerald-500/45'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  liveDiagnostic.health === 'disconnected'
                    ? 'bg-rose-400 animate-ping'
                    : liveDiagnostic.health === 'fallback'
                    ? 'bg-amber-400 animate-pulse'
                    : liveDiagnostic.health === 'server_switched'
                    ? 'bg-sky-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              <span className="text-[10.5px] font-extrabold tracking-wide uppercase text-stone-100 truncate">
                Trạng Thái Server Giọng Đọc
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase border ${
                  liveDiagnostic.health === 'disconnected'
                    ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                    : liveDiagnostic.health === 'fallback'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : liveDiagnostic.health === 'server_switched'
                    ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                    : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                }`}
              >
                {liveDiagnostic.health === 'disconnected'
                  ? '🚨 BỊ ĐỨT / LỖI'
                  : liveDiagnostic.health === 'fallback'
                  ? '⚠️ ĐÃ FALLBACK'
                  : liveDiagnostic.health === 'server_switched'
                  ? '🔄 ĐỔI SERVER'
                  : '🟢 ỔN ĐỊNH'}
              </span>

              {(liveDiagnostic.totalFallbacks > 0 ||
                liveDiagnostic.totalServerSwitches > 0 ||
                liveDiagnostic.totalDisconnects > 0) && (
                <button
                  type="button"
                  onClick={() => soundEngine.clearTtsDiagnosticHistory()}
                  className="px-1.5 py-0.5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[9px] font-bold text-stone-300 cursor-pointer"
                  title="Làm mới bộ đếm và lịch sử cảnh báo giọng đọc"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="px-2 py-1 rounded bg-stone-900/90 border border-stone-800">
              <div className="text-[9px] text-stone-400">Nguồn cài đặt:</div>
              <div className="font-bold text-stone-200 truncate">
                {liveDiagnostic.configuredEngineLabel}
              </div>
            </div>
            <div className="px-2 py-1 rounded bg-stone-900/90 border border-stone-800">
              <div className="text-[9px] text-stone-400">Server đang phát thực tế:</div>
              <div className="font-bold text-amber-300 truncate">
                {liveDiagnostic.activeServerLabel}
              </div>
            </div>
          </div>

          <div className="px-2 py-1.5 rounded bg-stone-900/95 border border-stone-800/90 space-y-0.5">
            <div className="text-[10.5px] font-bold text-white leading-snug">
              {liveDiagnostic.statusHeadline}
            </div>
            <div className="flex items-center justify-between gap-2 text-[9.5px] text-stone-400">
              <span className="truncate">{liveDiagnostic.statusDetail}</span>
              <span className="font-mono text-stone-300 shrink-0">
                {liveDiagnostic.lastLatencyMs !== null
                  ? `${liveDiagnostic.lastLatencyMs}ms • `
                  : ''}
                {new Date(liveDiagnostic.lastUpdatedAt).toLocaleTimeString(
                  'vi-VN',
                  { hour12: false }
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="px-1.5 py-1 rounded bg-stone-900/80 border border-stone-800">
              <div className="text-[9px] text-stone-400">Bị đứt / Treo</div>
              <div
                className={`text-xs font-black font-mono ${
                  liveDiagnostic.totalDisconnects > 0
                    ? 'text-rose-400'
                    : 'text-stone-400'
                }`}
              >
                {liveDiagnostic.totalDisconnects}
              </div>
            </div>
            <div className="px-1.5 py-1 rounded bg-stone-900/80 border border-stone-800">
              <div className="text-[9px] text-stone-400">Chuyển Server</div>
              <div
                className={`text-xs font-black font-mono ${
                  liveDiagnostic.totalServerSwitches > 0
                    ? 'text-sky-300'
                    : 'text-stone-400'
                }`}
              >
                {liveDiagnostic.totalServerSwitches}
              </div>
            </div>
            <div className="px-1.5 py-1 rounded bg-stone-900/80 border border-stone-800">
              <div className="text-[9px] text-stone-400">Tự Fallback</div>
              <div
                className={`text-xs font-black font-mono ${
                  liveDiagnostic.totalFallbacks > 0
                    ? 'text-amber-300'
                    : 'text-stone-400'
                }`}
              >
                {liveDiagnostic.totalFallbacks}
              </div>
            </div>
          </div>

          {liveDiagnostic.recentIncidents.length > 0 && (
            <div className="space-y-1 pt-0.5">
              <div className="text-[9.5px] font-bold text-amber-200/90">
                Nhật ký chuyển Server / Fallback gần nhất:
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5">
                {liveDiagnostic.recentIncidents.slice(0, 4).map((inc) => (
                  <div
                    key={inc.id}
                    className="px-2 py-1 rounded bg-stone-950/90 border border-stone-800 text-[9.5px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-extrabold ${
                          inc.type === 'disconnected'
                            ? 'text-rose-300'
                            : inc.type === 'fallback'
                            ? 'text-amber-300'
                            : 'text-sky-300'
                        }`}
                      >
                        {inc.type === 'disconnected'
                          ? '🚨 BỊ ĐỨT'
                          : inc.type === 'fallback'
                          ? '⚠️ FALLBACK'
                          : '🔄 ĐỔI SERVER'}
                        : {inc.fromSource} ➔ {inc.toSource}
                      </span>
                      <span className="font-mono text-[9px] text-stone-400 shrink-0">
                        {new Date(inc.timestamp).toLocaleTimeString('vi-VN', {
                          hour12: false,
                        })}
                      </span>
                    </div>
                    <div className="text-stone-300 truncate">{inc.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chi tiết câu đang đọc & danh sách chờ */}
        <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1.5">
          {isPlayingEvent && currentEventText ? (
            <div className="flex items-start gap-1.5 text-[10.5px]">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[9.5px] shrink-0">
                ĐANG ĐỌC
              </span>
              <span className="text-emerald-200 line-clamp-2">
                “{currentEventText}”
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[10px] text-stone-400">
              <span>Câu đang phát:</span>
              <span className="font-mono text-stone-300">
                {ttsStatus.active ? ttsStatus.text : 'Đang rảnh / Chờ câu mới'}
              </span>
            </div>
          )}

            {queueItems.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {queueItems.slice(0, 8).map((item, idx) => (
                  <div
                    key={`${idx}-${item.slice(0, 16)}`}
                    className="text-[10px] text-stone-300 bg-stone-900/90 border border-stone-800/80 rounded px-2 py-1 truncate"
                  >
                    <span className="text-amber-400 font-bold mr-1">
                      #{idx + 1}:
                    </span>
                    {item}
                  </div>
                ))}
                {queueItems.length > 8 && (
                  <div className="text-[9.5px] text-stone-500 italic pl-1">
                    ... +{queueItems.length - 8} câu đang chờ
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Giới hạn hàng chờ (đạt giới hạn tự xóa làm mới) & Giới hạn số chữ mỗi câu */}
        <div className="grid grid-cols-1 gap-2">
          <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-cyan-200">
                🔄 Giới hạn hàng chờ (Đạt mốc tự xóa làm mới)
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  value={config.maxTtsQueueSize ?? 30}
                  onChange={(e) =>
                    onUpdateConfig({
                      maxTtsQueueSize: Math.max(
                        1,
                        Math.min(200, parseInt(e.target.value, 10) || 30)
                      ),
                    })
                  }
                  className="w-12 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-xs font-mono font-bold text-cyan-300 text-right"
                />
                <span className="text-[10.5px] font-mono text-cyan-300">câu</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[10, 20, 30, 50].map((limit) => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => onUpdateConfig({ maxTtsQueueSize: limit })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                    (config.maxTtsQueueSize ?? 30) === limit
                      ? 'bg-cyan-400 text-stone-950 font-bold'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                >
                  {limit}
                </button>
              ))}
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.min(100, Math.max(5, config.maxTtsQueueSize ?? 30))}
                onChange={(e) =>
                  onUpdateConfig({
                    maxTtsQueueSize: Math.max(1, parseInt(e.target.value, 10) || 30),
                  })
                }
                className="flex-1 accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-amber-200">
                ✂️ Số chữ tối đa mỗi câu đọc
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={5}
                  max={60}
                  step={1}
                  value={config.maxTtsWords ?? 25}
                  onChange={(e) =>
                    onUpdateConfig({
                      maxTtsWords: Math.max(
                        5,
                        Math.min(60, parseInt(e.target.value, 10) || 25)
                      ),
                    })
                  }
                  className="w-12 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-xs font-mono font-bold text-amber-300 text-right"
                />
                <span className="text-[10.5px] font-mono text-amber-300">chữ</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[12, 18, 25, 35, 50].map((words) => (
                <button
                  key={words}
                  type="button"
                  onClick={() => onUpdateConfig({ maxTtsWords: words })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                    (config.maxTtsWords ?? 25) === words
                      ? 'bg-amber-400 text-stone-950 font-bold'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                >
                  {words}
                </button>
              ))}
              <input
                type="range"
                min={5}
                max={60}
                step={1}
                value={Math.min(60, Math.max(5, config.maxTtsWords ?? 25))}
                onChange={(e) =>
                  onUpdateConfig({
                    maxTtsWords: Math.max(5, parseInt(e.target.value, 10) || 25),
                  })
                }
                className="flex-1 accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Bật / Tắt đọc comment học sinh trong lớp */}
          <div className="p-2.5 rounded-lg bg-stone-950/90 border border-emerald-500/35 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-emerald-300">
                  💬 Đọc Comment Học Sinh Trong Lớp
                </div>
                <div className="text-[9.5px] text-stone-400">
                  Khi bật: Chỉ đọc comment của các bạn đang ngồi trong lớp (bỏ qua hàng chờ)
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const isAnyOn = Boolean(
                    config.realPrayerTtsEnabled || config.npcPrayerTtsEnabled
                  );
                  onUpdateConfig({
                    realPrayerTtsEnabled: !isAnyOn,
                    npcPrayerTtsEnabled: !isAnyOn,
                  });
                }}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold shrink-0 cursor-pointer transition ${
                  config.realPrayerTtsEnabled || config.npcPrayerTtsEnabled
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
                }`}
              >
                {config.realPrayerTtsEnabled || config.npcPrayerTtsEnabled
                  ? '🔊 Đang BẬT đọc'
                  : '🔇 Đã TẮT đọc'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <label className="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-900/90 border border-stone-800 text-[10.5px] text-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(config.realPrayerTtsEnabled)}
                  onChange={(e) =>
                    onUpdateConfig({ realPrayerTtsEnabled: e.target.checked })
                  }
                  className="accent-emerald-400 cursor-pointer"
                />
                <span>Học sinh thật trong lớp</span>
              </label>
              <label className="flex items-center gap-1.5 px-2 py-1 rounded bg-stone-900/90 border border-stone-800 text-[10.5px] text-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(config.npcPrayerTtsEnabled)}
                  onChange={(e) =>
                    onUpdateConfig({ npcPrayerTtsEnabled: e.target.checked })
                  }
                  className="accent-emerald-400 cursor-pointer"
                />
                <span>NPC trong lớp</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* 2. NHẠC NỀN, TRỐNG TRƯỜNG, GÕ THƯỚC & CÔ GIÁO */}
      <section className="p-3 rounded-xl bg-stone-900/85 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-amber-300">
              Nhạc Nền, Trống Trường & Thước Gỗ
            </h2>
            <span className="text-[10.5px] text-stone-400">
              ({ttsStatus.text})
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onTestTTS}
              className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[11px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <Volume2 className="w-3 h-3" />
              <span>Đọc thử</span>
            </button>
            <button
              type="button"
              onClick={onPanicMute}
              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
            >
              <VolumeX className="w-3 h-3" />
              <span>Ngắt đọc</span>
            </button>
          </div>
        </div>

        {/* Nhạc nền */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-stone-100">Nhạc nền</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>+ MP3</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadBgmMp3(f);
                  }}
                />
              </label>
              <label className="flex items-center gap-1 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.bgmEnabled}
                  onChange={(e) =>
                    onUpdateConfig({ bgmEnabled: e.target.checked })
                  }
                  className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>{config.bgmEnabled ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1.5 items-center">
            <select
              value={activeBgmTrack?.id || ''}
              onChange={(e) =>
                onUpdateConfig({ activeBgmTrackId: e.target.value })
              }
              className="col-span-6 px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-stone-200 focus:outline-none"
            >
              {bgmTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} {t.url ? '(MP3)' : ''}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={activeBgmTrack?.title || ''}
              onChange={(e) => handleRenameActiveBgm(e.target.value)}
              placeholder="Tên bài nhạc..."
              className="col-span-5 px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-amber-200 focus:outline-none"
            />

            <button
              type="button"
              onClick={handleDeleteActiveBgm}
              disabled={bgmTracks.length <= 1}
              className="col-span-1 h-7 rounded bg-stone-800 hover:bg-rose-950 text-stone-400 hover:text-rose-300 disabled:opacity-30 flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10.5px] text-stone-400">
            <span className="shrink-0">Âm lượng:</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={config.bgmVolume ?? 0.4}
              onChange={(e) =>
                onUpdateConfig({ bgmVolume: parseFloat(e.target.value) })
              }
              className="flex-1 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <span className="font-mono text-stone-200 w-9 text-right">
              {Math.round((config.bgmVolume ?? 0.4) * 100)}%
            </span>
          </div>
        </div>

        {/* Nhạc nền chiến đấu Sự Kiện Zombie (MP3) + Hiệu ứng lửa bùng cháy */}
        <div className="p-2.5 rounded-lg bg-gradient-to-br from-rose-950/60 via-stone-950 to-orange-950/50 border border-orange-500/40 space-y-2 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Music className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="text-xs font-black text-orange-200">
                🔥 Nhạc Nền Chiến Đấu Sự Kiện Zombie
              </span>
              <span className="text-[10px] text-amber-300 truncate">
                ({config.zombieBgmMp3Title || 'Mặc định nhịp trống trận'})
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => soundEngine.previewZombieBgm(config)}
                className="px-2 py-0.5 rounded bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/40 text-[10px] font-bold text-orange-200 cursor-pointer"
                title="Nghe thử nhạc chiến đấu Zombie (8 giây)"
              >
                Nghe thử
              </button>
              <label className="px-2 py-0.5 rounded bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/50 text-[10px] font-bold text-amber-200 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>Tải nhạc MP3</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          onUpdateConfig({
                            zombieBgmEnabled: true,
                            zombieBgmMp3Url: reader.result,
                            zombieBgmMp3Title: f.name,
                          });
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {config.zombieBgmMp3Url && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      zombieBgmMp3Url: null,
                      zombieBgmMp3Title: 'Mặc định chiến đấu',
                    })
                  }
                  className="p-1 rounded bg-stone-800 hover:bg-rose-900/60 text-stone-300 hover:text-rose-200 cursor-pointer"
                  title="Xóa nhạc MP3 Zombie đã tải lên"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <label className="flex items-center gap-1 text-xs font-bold text-orange-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.zombieBgmEnabled !== false}
                  onChange={(e) =>
                    onUpdateConfig({ zombieBgmEnabled: e.target.checked })
                  }
                  className="accent-orange-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>{config.zombieBgmEnabled !== false ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
          </div>

          <p className="text-[10px] text-stone-300 leading-relaxed">
            Tự động phát nhạc chiến đấu kết hợp hiệu ứng hạt lửa thổi bùng rực lửa trên màn hình khi sự kiện Zombie xảy ra, và tự trả về nhạc nền lớp học khi sự kiện kết thúc.
          </p>

          <div className="flex items-center gap-2 text-[10.5px] text-stone-300">
            <span className="shrink-0">Âm lượng nhạc Zombie:</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={config.zombieBgmVolume ?? 0.65}
              onChange={(e) =>
                onUpdateConfig({ zombieBgmVolume: parseFloat(e.target.value) })
              }
              className="flex-1 accent-orange-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <span className="font-mono text-orange-200 w-9 text-right">
              {Math.round((config.zombieBgmVolume ?? 0.65) * 100)}%
            </span>
          </div>
        </div>

        {/* Thầy Giáo Khích Lệ Học Sinh Chiến Đấu (Sự Kiện Zombie) */}
        <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-950/50 via-stone-950 to-red-950/40 border border-amber-500/40 space-y-2 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquareQuote className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-black text-amber-200">
                ⚔️ Thầy Giáo Khích Lệ Học Sinh Chiến Đấu (Event Zombie)
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    zombieTeacherEncourageTemplates: [
                      ...(DEFAULT_CONFIG.zombieTeacherEncourageTemplates || []),
                    ],
                  })
                }
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] font-semibold text-stone-300 flex items-center gap-1 cursor-pointer"
                title="Khôi phục danh sách câu khích lệ mặc định"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Mặc định</span>
              </button>
              <label className="flex items-center gap-1 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.zombieTeacherEncourageEnabled !== false}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieTeacherEncourageEnabled: e.target.checked,
                    })
                  }
                  className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>
                  {config.zombieTeacherEncourageEnabled !== false
                    ? 'Bật'
                    : 'Tắt'}
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[10.5px] text-stone-300">
            <span>Chu kỳ Thầy Giáo hô khích lệ:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={4}
                max={30}
                step={1}
                value={config.zombieTeacherEncourageIntervalSec ?? 9}
                onChange={(e) =>
                  onUpdateConfig({
                    zombieTeacherEncourageIntervalSec: Math.max(
                      4,
                      parseInt(e.target.value, 10) || 9
                    ),
                  })
                }
                className="w-24 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-amber-300 font-bold w-8 text-right">
                {config.zombieTeacherEncourageIntervalSec ?? 9}s
              </span>
            </div>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {(
              config.zombieTeacherEncourageTemplates ||
              DEFAULT_CONFIG.zombieTeacherEncourageTemplates ||
              []
            ).map((sentence, idx, arr) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 bg-stone-900/90 border border-stone-800 rounded px-2 py-1"
              >
                <span className="text-[10px] font-black text-amber-400 w-5 shrink-0">
                  #{idx + 1}
                </span>
                <input
                  type="text"
                  value={sentence}
                  onChange={(e) => {
                    const next = [...arr];
                    next[idx] = e.target.value;
                    onUpdateConfig({ zombieTeacherEncourageTemplates: next });
                  }}
                  placeholder="Nhập câu Thầy Giáo khích lệ học sinh chiến đấu..."
                  className="flex-1 bg-transparent text-[11px] text-stone-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    onSpeakHostLiveText(sentence, {
                      interrupt: true,
                      speakerRole: 'senior_novice',
                    })
                  }
                  className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 text-[9.5px] font-bold text-amber-200 shrink-0 cursor-pointer"
                  title="Nghe thử giọng Thầy Giáo"
                >
                  Thử
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = arr.filter((_, i) => i !== idx);
                    onUpdateConfig({ zombieTeacherEncourageTemplates: next });
                  }}
                  disabled={arr.length <= 1}
                  className="p-1 rounded bg-stone-800 hover:bg-rose-950 text-stone-400 hover:text-rose-300 disabled:opacity-30 shrink-0 cursor-pointer"
                  title="Xóa câu khích lệ này"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const current =
                config.zombieTeacherEncourageTemplates ||
                DEFAULT_CONFIG.zombieTeacherEncourageTemplates ||
                [];
              onUpdateConfig({
                zombieTeacherEncourageTemplates: [
                  ...current,
                  'Cố lên các em ơi, thả tim và ném đồ đẩy lùi Zombie bảo vệ lớp học nào!',
                ],
              });
            }}
            className="w-full py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-bold text-amber-200 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm câu khích lệ mới cho Thầy Giáo</span>
          </button>
        </div>

        {/* Tiếng trống trường */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-stone-100">Trống trường</span>
              <span className="text-[10px] text-amber-300 truncate">
                ({config.bellMp3Title || 'Mặc định'})
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onPlayBell}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] font-semibold text-amber-200 cursor-pointer"
              >
                Thử
              </button>
              <label className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>MP3</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          onUpdateConfig({
                            bellMp3Url: reader.result,
                            bellMp3Title: f.name,
                          });
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {config.bellMp3Url && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      bellMp3Url: null,
                      bellMp3Title: 'Mặc định',
                    })
                  }
                  className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <label className="flex items-center gap-1 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.bellEnabled}
                  onChange={(e) =>
                    onUpdateConfig({ bellEnabled: e.target.checked })
                  }
                  className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>{config.bellEnabled ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-stone-300">
            <span>Chu kỳ gõ tự động:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={2}
                max={180}
                step={1}
                value={config.bellIntervalSec || 25}
                onChange={(e) =>
                  onUpdateConfig({
                    bellIntervalSec: Math.max(
                      2,
                      parseInt(e.target.value, 10) || 25
                    ),
                  })
                }
                className="w-24 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={2}
                max={600}
                value={config.bellIntervalSec || 25}
                onChange={(e) =>
                  onUpdateConfig({
                    bellIntervalSec: Math.max(
                      2,
                      parseInt(e.target.value, 10) || 25
                    ),
                  })
                }
                className="w-12 px-1 py-0.5 rounded bg-stone-900 border border-stone-800 text-center font-mono text-amber-300 text-[11px]"
              />
              <span className="text-[10px] text-stone-400">s</span>
            </div>
          </div>
        </div>

        {/* Tiếng gõ thước gỗ */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Drum className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-stone-100">Thước gỗ</span>
              <span className="text-[10px] text-amber-300 truncate">
                ({config.woodenFishMp3Title || 'Mặc định'})
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onPlayWoodenFish}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] font-semibold text-amber-200 cursor-pointer"
              >
                Thử
              </button>
              <label className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>MP3</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          onUpdateConfig({
                            woodenFishMp3Url: reader.result,
                            woodenFishMp3Title: f.name,
                          });
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {config.woodenFishMp3Url && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      woodenFishMp3Url: null,
                      woodenFishMp3Title: 'Mặc định',
                    })
                  }
                  className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <label className="flex items-center gap-1 text-xs font-bold text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.woodenFishEnabled}
                  onChange={(e) =>
                    onUpdateConfig({ woodenFishEnabled: e.target.checked })
                  }
                  className="accent-amber-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>{config.woodenFishEnabled ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-stone-300">
            <span>Chu kỳ gõ tự động:</span>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0.5}
                max={30}
                step={0.5}
                value={config.woodenFishIntervalSec || 3}
                onChange={(e) =>
                  onUpdateConfig({
                    woodenFishIntervalSec: Math.max(
                      0.5,
                      parseFloat(e.target.value) || 3
                    ),
                  })
                }
                className="w-24 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <input
                type="number"
                min={0.5}
                max={120}
                step={0.5}
                value={config.woodenFishIntervalSec || 3}
                onChange={(e) =>
                  onUpdateConfig({
                    woodenFishIntervalSec: Math.max(
                      0.5,
                      parseFloat(e.target.value) || 3
                    ),
                  })
                }
                className="w-12 px-1 py-0.5 rounded bg-stone-900 border border-stone-800 text-center font-mono text-amber-300 text-[11px]"
              />
              <span className="text-[10px] text-stone-400">s</span>
            </div>
          </div>
        </div>

        {/* Âm thanh hiển thị câu trả lời 2s ("Đáp án là:") */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-emerald-500/40 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-emerald-200">
                Âm Thanh Câu Trả Lời (2s Đáp Án)
              </span>
              {config.answerRevealMp3Url && (
                <span className="text-[10px] text-amber-300 truncate max-w-[110px]">
                  ({config.answerRevealMp3Title || 'File MP3'})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  soundEngine.playAnswerRevealSfx(
                    config.ttsVolume || 1,
                    config.answerRevealSfxPreset || 'chime_sparkle',
                    config.answerRevealMp3Url,
                    true
                  )
                }
                className="px-2 py-0.5 rounded bg-emerald-600/35 hover:bg-emerald-500/45 border border-emerald-400/60 text-[10px] font-bold text-emerald-200 cursor-pointer"
              >
                Thử
              </button>
              <label className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>Upload MP3</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          onUpdateConfig({
                            answerRevealMp3Url: reader.result,
                            answerRevealMp3Title: f.name,
                            answerRevealSfxEnabled: true,
                          });
                          soundEngine.playAnswerRevealSfx(
                            config.ttsVolume || 1,
                            config.answerRevealSfxPreset || 'chime_sparkle',
                            reader.result,
                            true
                          );
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {config.answerRevealMp3Url && (
                <button
                  type="button"
                  title="Quay về dùng 3 hiệu ứng có sẵn"
                  onClick={() =>
                    onUpdateConfig({
                      answerRevealMp3Url: null,
                      answerRevealMp3Title: 'Hiệu ứng mặc định',
                    })
                  }
                  className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <label className="flex items-center gap-1 text-xs font-bold text-emerald-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.answerRevealSfxEnabled !== false}
                  onChange={(e) =>
                    onUpdateConfig({ answerRevealSfxEnabled: e.target.checked })
                  }
                  className="accent-emerald-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>
                  {config.answerRevealSfxEnabled !== false ? 'Bật' : 'Tắt'}
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[10.5px] text-stone-400 flex items-center justify-between">
              <span>Chọn 1 trong 3 hiệu ứng thiết kế sẵn:</span>
              {config.answerRevealMp3Url && (
                <span className="text-[9.5px] text-amber-300">
                  Đang ưu tiên phát file MP3 đã tải lên
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    id: 'chime_sparkle' as AnswerRevealSfxPreset,
                    label: '1. Chuông Sao ✨',
                  },
                  {
                    id: 'victory_fanfare' as AnswerRevealSfxPreset,
                    label: '2. Kèn Chiến Thắng 🎺',
                  },
                  {
                    id: 'retro_levelup' as AnswerRevealSfxPreset,
                    label: '3. Pixel Level-Up 🎮',
                  },
                ] as const
              ).map((item) => {
                const isSelected =
                  !config.answerRevealMp3Url &&
                  (config.answerRevealSfxPreset || 'chime_sparkle') === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onUpdateConfig({
                        answerRevealSfxPreset: item.id,
                        answerRevealMp3Url: null,
                        answerRevealSfxEnabled: true,
                      });
                      soundEngine.playAnswerRevealSfx(
                        config.ttsVolume || 1,
                        item.id,
                        null,
                        true
                      );
                    }}
                    className={`px-2 py-1.5 rounded-lg border text-[10.5px] font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                        : 'bg-stone-900/90 hover:bg-stone-800 border-stone-700 text-stone-300'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Âm thanh Zombie gầm gừ (Sự kiện Zombie tấn công - Luồng 2) */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-lime-500/40 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-lime-400 shrink-0" />
              <span className="text-xs font-bold text-lime-300">
                🧟 Âm Thanh Zombie Gầm Gừ (Event Luồng 2)
              </span>
              <span className="text-[10px] text-amber-300 truncate max-w-[120px]">
                ({config.zombieGrowlMp3Title || 'Mặc định'})
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => soundEngine.playZombieGrowlSfx(config, true)}
                className="px-2 py-0.5 rounded bg-lime-600/30 hover:bg-lime-500/45 border border-lime-400/50 text-[10px] font-bold text-lime-200 cursor-pointer"
              >
                Thử
              </button>
              <label className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>Upload MP3</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          const nextCfg: GameConfig = {
                            ...config,
                            zombieGrowlMp3Url: reader.result,
                            zombieGrowlMp3Title: f.name,
                          };
                          onUpdateConfig({
                            zombieGrowlMp3Url: reader.result,
                            zombieGrowlMp3Title: f.name,
                          });
                          soundEngine.playZombieGrowlSfx(nextCfg, true);
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {config.zombieGrowlMp3Url && (
                <button
                  type="button"
                  title="Khôi phục tiếng Zombie mặc định"
                  onClick={() =>
                    onUpdateConfig({
                      zombieGrowlMp3Url: null,
                      zombieGrowlMp3Title: 'Mặc định',
                    })
                  }
                  className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bong bóng chat cảm ơn quà của Cô Giáo & Thầy Giám Thị */}
        <label className="p-2 rounded-lg bg-pink-950/30 border border-pink-400/40 flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
            <MessageSquareQuote className="w-3.5 h-3.5 text-pink-400" />
            <span>
              Chatbox Phản Ứng Khi Nhận Quà ("Cảm ơn bạn A nhé /-heart")
            </span>
          </span>
          <input
            type="checkbox"
            checked={config.abbotBubbleEnabled}
            onChange={(e) =>
              onUpdateConfig({ abbotBubbleEnabled: e.target.checked })
            }
            className="accent-pink-400 w-4 h-4 rounded shrink-0 cursor-pointer"
          />
        </label>
      </section>

      {/* 2B. ÂM THANH 7 MÓN QUÀ SỰ KIỆN LỚP HỌC (NGHE THỬ, CHỈNH ÂM LƯỢNG & CHÈN FILE MP3) */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-pink-500/40 space-y-2.5 shadow-md">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Gift className="w-4 h-4 text-pink-400 shrink-0" />
            <h2 className="text-xs font-extrabold text-pink-200 truncate">
              Âm Thanh 7 Món Quà Sự Kiện (Play Sound & Chèn MP3)
            </h2>
          </div>

          <label className="flex items-center gap-1 text-xs font-bold text-pink-300 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={config.giftSoundEnabled !== false}
              onChange={(e) =>
                onUpdateConfig({ giftSoundEnabled: e.target.checked })
              }
              className="accent-pink-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span>{config.giftSoundEnabled !== false ? 'Đang Bật' : 'Đã Tắt'}</span>
          </label>
        </div>

        {/* Thanh điều chỉnh Âm Lượng Chung cho toàn bộ sự kiện tặng quà */}
        <div className="p-2 rounded-lg bg-stone-950/85 border border-pink-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <Volume2 className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            <span className="text-[11px] font-bold text-pink-200 truncate">
              Âm lượng chung sự kiện tặng quà:
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.giftSoundVolume ?? 1.0}
              onChange={(e) =>
                onUpdateConfig({
                  giftSoundVolume: Math.max(
                    0,
                    Math.min(1, parseFloat(e.target.value))
                  ),
                })
              }
              className="w-28 accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <span className="w-10 text-right text-[11px] font-mono font-bold text-pink-300 tabular-nums">
              {Math.round((config.giftSoundVolume ?? 1.0) * 100)}%
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          {CLASSROOM_GIFT_EVENTS_META.map((giftMeta) => {
            const giftId: ClassroomGiftEventId = giftMeta.id;
            const customUrl = config.giftSoundMp3Urls?.[giftId] || null;
            const customTitle =
              config.giftSoundMp3Titles?.[giftId] || 'Sound mặc định';
            const itemVol = config.giftSoundVolumes?.[giftId] ?? 1.0;

            return (
              <div
                key={giftId}
                className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-200 truncate">
                        {giftMeta.giftLabel}: {giftMeta.actionTitle}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-400/40 text-[9.5px] font-mono font-bold text-emerald-300 shrink-0">
                        +{giftMeta.bonusPoints}đ
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400 truncate">
                      Audio:{' '}
                      <span
                        className={
                          customUrl
                            ? 'text-pink-300 font-semibold'
                            : 'text-stone-400'
                        }
                      >
                        {customUrl ? `MP3: ${customTitle}` : 'Mặc định (Synth hợp lý)'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        soundEngine.playGiftEventSound(giftId, config, true)
                      }
                      className="px-2 py-1 rounded bg-pink-600/30 hover:bg-pink-500/45 border border-pink-400/50 text-[10px] font-bold text-pink-200 cursor-pointer transition"
                    >
                      Nghe thử
                    </button>

                    <label className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer transition">
                      <Upload className="w-3 h-3" />
                      <span>MP3</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                const nextUrls = {
                                  ...(config.giftSoundMp3Urls || {}),
                                  [giftId]: reader.result,
                                };
                                const nextTitles = {
                                  ...(config.giftSoundMp3Titles || {}),
                                  [giftId]: f.name,
                                };
                                const nextConfig: GameConfig = {
                                  ...config,
                                  giftSoundEnabled: true,
                                  giftSoundMp3Urls: nextUrls,
                                  giftSoundMp3Titles: nextTitles,
                                };
                                onUpdateConfig({
                                  giftSoundEnabled: true,
                                  giftSoundMp3Urls: nextUrls,
                                  giftSoundMp3Titles: nextTitles,
                                });
                                soundEngine.playGiftEventSound(
                                  giftId,
                                  nextConfig,
                                  true
                                );
                              }
                            };
                            reader.readAsDataURL(f);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {customUrl && (
                      <button
                        type="button"
                        title="Khôi phục sound mặc định"
                        onClick={() => {
                          const nextUrls = { ...(config.giftSoundMp3Urls || {}) };
                          const nextTitles = {
                            ...(config.giftSoundMp3Titles || {}),
                          };
                          delete nextUrls[giftId];
                          delete nextTitles[giftId];
                          onUpdateConfig({
                            giftSoundMp3Urls: nextUrls,
                            giftSoundMp3Titles: nextTitles,
                          });
                        }}
                        className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Thanh chỉnh âm lượng riêng cho từng sự kiện tặng quà */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-900">
                  <span className="text-[10px] text-stone-400">
                    Âm lượng play món này:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={itemVol}
                      onChange={(e) => {
                        const v = Math.max(
                          0,
                          Math.min(1, parseFloat(e.target.value))
                        );
                        onUpdateConfig({
                          giftSoundVolumes: {
                            ...(config.giftSoundVolumes || {}),
                            [giftId]: v,
                          },
                        });
                      }}
                      className="w-24 accent-pink-400 h-1 bg-stone-800 rounded-lg cursor-pointer"
                    />
                    <span className="w-9 text-right text-[10px] font-mono font-bold text-pink-300 tabular-nums">
                      {Math.round(itemVol * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. ENGINE TIẾT HỌC TIẾNG ANH (ĐIỀU CHỈNH NỘI DUNG / FORMAT CÂU NÓI & THỜI GIAN CÁC LUỒNG GIỌNG ĐỌC CỦA CÔ GIÁO) */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-emerald-500/40 space-y-2.5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-stone-800">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="text-xs font-extrabold text-emerald-300">
              Engine Tiết Học Tiếng Anh
            </h2>
          </div>
          <span className="text-[10px] text-amber-300 font-mono bg-stone-950 px-2 py-0.5 rounded border border-amber-500/30">
            Đồng bộ giọng đọc Cô Giáo (Luồng 0 → 6)
          </span>
        </div>

        {/* LUỒNG 0: BẮT ĐẦU CHẠY TIẾT HỌC */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-amber-500/35 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono font-black text-[10px]">
                Luồng 0
              </span>
              <span className="text-[11px] font-bold text-amber-200">
                Bắt đầu chạy tiết học (Chỉ nói 1 lần khi bắt đầu)
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                soundEngine.enqueueLessonFlowItems(
                  [
                    {
                      text:
                        config.lessonStartTtsText ||
                        'Chào mừng các em đến với tiết Tiếng Anh lớp 12A1! Các em hãy chú ý lên bảng và bình luận đáp án thật nhanh để giành ghế ngồi trong lớp nhé!',
                      lang: 'vi',
                    },
                  ],
                  config
                )
              }
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 cursor-pointer shrink-0"
            >
              Nghe thử
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-stone-400">
              Nội dung câu nói & hiển thị chữ lớn trên bảng (Edit được):
            </div>
            <textarea
              rows={2}
              value={
                config.lessonStartTtsText ??
                'Chào mừng các em đến với tiết Tiếng Anh lớp 12A1! Các em hãy chú ý lên bảng và bình luận đáp án thật nhanh để giành ghế ngồi trong lớp nhé!'
              }
              onChange={(e) =>
                onUpdateConfig({ lessonStartTtsText: e.target.value })
              }
              className="w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-amber-400 resize-y"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] bg-stone-900/70 px-2 py-1 rounded border border-stone-800/80">
            <span className="text-stone-400">Thời gian luồng:</span>
            <span className="font-mono font-bold text-emerald-300">
              🔒 Tự động: Nói xong chuyển sang Luồng 1
            </span>
          </div>
        </div>

        {/* LUỒNG 1: ĐỌC "CHUẨN BỊ" (CHO PHÉP THÊM NHIỀU CÂU & LẤY NGẪU NHIÊN) */}
        {(() => {
          const prepList =
            Array.isArray(config.lessonPrepareTtsTexts) &&
            config.lessonPrepareTtsTexts.length > 0
              ? config.lessonPrepareTtsTexts
              : [config.lessonPrepareTtsText ?? 'Chuẩn bị'];

          const updatePrepList = (nextList: string[]) => {
            onUpdateConfig({
              lessonPrepareTtsTexts: nextList,
              lessonPrepareTtsText: nextList[0] || 'Chuẩn bị',
            });
          };

          return (
            <div className="p-2.5 rounded-lg bg-stone-950/90 border border-emerald-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-mono font-black text-[10px]">
                    Luồng 1
                  </span>
                  <span className="text-[11px] font-bold text-emerald-200">
                    Đọc "Chuẩn bị" (Bảng Chuẩn Bị • Lấy ngẫu nhiên trong danh sách)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const valid = prepList.filter((s) => s.trim());
                    const pick =
                      valid.length > 0
                        ? valid[Math.floor(Math.random() * valid.length)]
                        : 'Chuẩn bị';
                    soundEngine.enqueueLessonFlowItems(
                      [{ text: pick, lang: 'vi' }],
                      config
                    );
                  }}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-emerald-300 cursor-pointer shrink-0"
                >
                  Nghe thử ngẫu nhiên
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span>
                    Danh sách câu nói Luồng 1 ({prepList.length} câu - Khi đọc sẽ chọn ngẫu nhiên):
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updatePrepList([
                        ...prepList,
                        'Các em chú ý lên bảng chuẩn bị câu tiếp theo nhé',
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/50 text-emerald-200 font-bold text-[10px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Thêm câu nói
                  </button>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {prepList.map((phrase, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-stone-500 w-4 text-right shrink-0">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={phrase}
                        onChange={(e) => {
                          const next = [...prepList];
                          next[idx] = e.target.value;
                          updatePrepList(next);
                        }}
                        placeholder="Nhập câu chuẩn bị..."
                        className="flex-1 px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          soundEngine.enqueueLessonFlowItems(
                            [{ text: phrase || 'Chuẩn bị', lang: 'vi' }],
                            config
                          )
                        }
                        title="Nghe thử câu này"
                        className="px-1.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] text-emerald-300 cursor-pointer shrink-0"
                      >
                        🔊
                      </button>
                      {prepList.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updatePrepList(prepList.filter((_, i) => i !== idx))
                          }
                          title="Xóa câu này"
                          className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80">
                <span className="text-[10px] text-stone-400">
                  Thời gian Luồng 1 (Mặc định 3s):
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={config.lessonPrepareDurationSec ?? 3}
                    onChange={(e) =>
                      onUpdateConfig({
                        lessonPrepareDurationSec: Math.max(
                          1,
                          Math.min(15, Number(e.target.value) || 3)
                        ),
                      })
                    }
                    className="w-16 px-2 py-1 rounded bg-stone-900 border border-emerald-500/50 text-center font-mono font-bold text-[11px] text-emerald-300 focus:outline-none"
                  />
                  <span className="text-[10px] text-stone-400 shrink-0">giây</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* LUỒNG 2: ĐỌC CÂU HỎI */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-sky-500/35 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 font-mono font-black text-[10px]">
                Luồng 2
              </span>
              <span className="text-[11px] font-bold text-sky-200">
                Đọc câu hỏi (Bảng Câu Hỏi)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.hudLayout.classBoardTtsReadQuestion ?? true}
                  onChange={(e) =>
                    onUpdateConfig({
                      hudLayout: {
                        ...config.hudLayout,
                        classBoardTtsReadQuestion: e.target.checked,
                      },
                    })
                  }
                  className="accent-emerald-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>Bật đọc</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  const preview = (
                    config.lessonQuestionTtsTemplate ||
                    'Câu hỏi số [SốCâu]: [NghĩaViệt] tiếng Anh là gì, gồm [SốChữ] chữ cái?'
                  )
                    .replace(/\[SốCâu\]|\{index\}/gi, '1')
                    .replace(/\[NghĩaViệt\]|\{vi\}/gi, 'Con mèo')
                    .replace(/\[SốChữ\]|\{len\}/gi, '3')
                    .replace(/\[ĐápÁn\]|\{en\}/gi, 'CAT');
                  soundEngine.enqueueLessonFlowItems(
                    [{ text: preview, lang: 'vi' }],
                    config
                  );
                }}
                className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-sky-300 cursor-pointer shrink-0"
              >
                Nghe thử
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-stone-400">
              <span>Format câu nói (Edit được):</span>
              <span className="font-mono text-[9.5px] text-sky-300">
                Biến: [SốCâu], [NghĩaViệt], [SốChữ]
              </span>
            </div>
            <input
              type="text"
              value={
                config.lessonQuestionTtsTemplate ??
                'Câu hỏi số [SốCâu]: [NghĩaViệt] tiếng Anh là gì, gồm [SốChữ] chữ cái?'
              }
              onChange={(e) =>
                onUpdateConfig({ lessonQuestionTtsTemplate: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-sky-400"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] bg-stone-900/70 px-2 py-1 rounded border border-stone-800/80">
            <span className="text-stone-400">Thời gian luồng:</span>
            <span className="font-mono font-bold text-amber-300">
              🔒 Tính chung thời gian với Luồng 3 ({config.hudLayout.classBoardQuestionDurationSec || 12}s)
            </span>
          </div>
        </div>

        {/* LUỒNG 3: ĐỢI TRẢ LỜI / GỢI Ý & CÂU NÓI VU VƠ CỦA CÔ */}
        {(() => {
          const idleList =
            Array.isArray(config.lessonIdleChatTexts) &&
            config.lessonIdleChatTexts.length > 0
              ? config.lessonIdleChatTexts
              : DEFAULT_CONFIG.lessonIdleChatTexts || [
                  'Câu này dễ lắm luôn đó các em ơi, nhanh tay bình luận nào!',
                ];

          const updateIdleList = (nextList: string[]) => {
            onUpdateConfig({ lessonIdleChatTexts: nextList });
          };

          return (
            <div className="p-2.5 rounded-lg bg-stone-950/90 border border-amber-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono font-black text-[10px]">
                    Luồng 3
                  </span>
                  <span className="text-[11px] font-bold text-amber-200">
                    Đợi trả lời / Gợi ý + Cô nói 1 câu vu vơ
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.lessonIdleChatEnabled !== false}
                      onChange={(e) =>
                        onUpdateConfig({
                          lessonIdleChatEnabled: e.target.checked,
                        })
                      }
                      className="accent-emerald-500 w-3.5 h-3.5 rounded cursor-pointer"
                    />
                    <span>Bật nói vu vơ</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const valid = idleList.filter((s) => s.trim());
                      const pick =
                        valid.length > 0
                          ? valid[Math.floor(Math.random() * valid.length)]
                          : 'Cố lên cả lớp ơi!';
                      soundEngine.enqueueLessonFlowItems(
                        [{ text: pick, lang: 'vi' }],
                        config
                      );
                    }}
                    className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 cursor-pointer shrink-0"
                  >
                    Nghe thử
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-2 rounded bg-stone-900/75 border border-stone-800/80">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] text-amber-200 font-semibold">
                    Trễ trước khi nói vu vơ:
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={0.5}
                      value={config.lessonIdleChatDelaySec ?? 4}
                      onChange={(e) =>
                        onUpdateConfig({
                          lessonIdleChatDelaySec: Math.max(
                            1,
                            Math.min(30, Number(e.target.value) || 4)
                          ),
                        })
                      }
                      className="w-14 px-1.5 py-0.5 rounded bg-stone-950 border border-amber-500/50 text-center font-mono font-bold text-[11px] text-amber-300 focus:outline-none"
                    />
                    <span className="text-[10px] text-stone-400">giây</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] text-amber-200 font-semibold">
                    Tổng TG Luồng 2 & 3:
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={5}
                      max={90}
                      value={
                        config.hudLayout.classBoardQuestionDurationSec || 12
                      }
                      onChange={(e) =>
                        onUpdateConfig({
                          hudLayout: {
                            ...config.hudLayout,
                            classBoardQuestionDurationSec: Math.max(
                              5,
                              Math.min(90, Number(e.target.value) || 12)
                            ),
                          },
                        })
                      }
                      className="w-14 px-1.5 py-0.5 rounded bg-stone-950 border border-amber-500/50 text-center font-mono font-bold text-[11px] text-amber-300 focus:outline-none"
                    />
                    <span className="text-[10px] text-stone-400">giây</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span>
                    Danh sách câu nói vu vơ ({idleList.length} câu - Chọn ngẫu nhiên 1 câu):
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateIdleList([
                        ...idleList,
                        'Nhanh tay bình luận đáp án đúng để nhận điểm thưởng nào các em!',
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/25 hover:bg-amber-600/40 border border-amber-400/50 text-amber-200 font-bold text-[10px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Thêm câu vu vơ
                  </button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {idleList.map((phrase, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-stone-500 w-4 text-right shrink-0">
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={phrase}
                        onChange={(e) => {
                          const next = [...idleList];
                          next[idx] = e.target.value;
                          updateIdleList(next);
                        }}
                        placeholder="Nhập câu nói vu vơ trong lúc chờ trả lời..."
                        className="flex-1 px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          soundEngine.enqueueLessonFlowItems(
                            [{ text: phrase, lang: 'vi' }],
                            config
                          )
                        }
                        title="Nghe thử câu này"
                        className="px-1.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] text-amber-300 cursor-pointer shrink-0"
                      >
                        🔊
                      </button>
                      {idleList.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateIdleList(idleList.filter((_, i) => i !== idx))
                          }
                          title="Xóa câu này"
                          className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[9.5px] bg-emerald-950/30 px-2 py-1 rounded border border-emerald-500/30 text-emerald-300">
                <span>
                  🛡️ Bộ lọc an toàn: Nếu hết giờ mà cô chưa nói xong câu vu vơ thì chờ cô đọc nốt câu mới chuyển sang Luồng 4.
                </span>
              </div>
            </div>
          );
        })()}

        {/* LUỒNG 4: ĐỌC CÂU TRẢ LỜI */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-emerald-500/35 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-mono font-black text-[10px]">
                Luồng 4
              </span>
              <span className="text-[11px] font-bold text-emerald-200">
                Đọc câu trả lời (Bảng Câu Trả Lời)
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                soundEngine.enqueueLessonFlowItems(
                  [
                    {
                      text: config.lessonAnswerTtsTemplate || 'Đáp án là',
                      lang: 'vi',
                    },
                    { text: 'Butterfly', lang: 'en' },
                  ],
                  config
                )
              }
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-emerald-300 cursor-pointer shrink-0"
            >
              Nghe thử
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-stone-400">
              <span>Lời dẫn trước khi phát âm từ Tiếng Anh (Edit được):</span>
              <span className="font-mono text-[9.5px] text-emerald-300">
                Tự động đọc kèm từ Tiếng Anh chuẩn [ĐápÁn]
              </span>
            </div>
            <input
              type="text"
              value={config.lessonAnswerTtsTemplate ?? 'Đáp án là'}
              onChange={(e) =>
                onUpdateConfig({ lessonAnswerTtsTemplate: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="p-2 rounded bg-stone-900/90 border border-emerald-500/30 space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-emerald-200 font-semibold">
                🇬🇧 Tốc độ đọc riêng khi phát âm từ Tiếng Anh:
              </span>
              <span className="font-mono font-bold text-emerald-300">
                {(config.englishTtsRate ?? 0.95).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={config.englishTtsRate ?? 0.95}
              onChange={(e) =>
                onUpdateConfig({ englishTtsRate: parseFloat(e.target.value) })
              }
              className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded bg-stone-900/90 border border-emerald-500/30 space-y-1">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-emerald-200 font-semibold">
                ⏳ Thời gian chờ sau khi đọc xong:
              </span>
              <span className="font-mono font-bold text-emerald-300">
                {(config.lessonFlow4PostTtsDelaySec ?? 1).toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={config.lessonFlow4PostTtsDelaySec ?? 1}
              onChange={(e) =>
                onUpdateConfig({
                  lessonFlow4PostTtsDelaySec: parseFloat(e.target.value),
                })
              }
              className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <div className="flex items-center justify-between gap-2 text-[9.5px] text-stone-400 pt-0.5">
              <span>Tiến trình Luồng 4:</span>
              <span className="font-mono font-bold text-emerald-300">
                Đọc xong → Chờ {(config.lessonFlow4PostTtsDelaySec ?? 1).toFixed(1)}s → Sang Luồng 5
              </span>
            </div>
          </div>
        </div>

        {/* LUỒNG 5: ĐỌC KẾT QUẢ & CẬP NHẬT CHỖ NGỒI (PHÂN NHÓM THEO ĐIỀU KIỆN) */}
        {(() => {
          const flow5Groups = {
            ...(DEFAULT_CONFIG.lessonFlow5ConditionalTemplates || {
              normal: [],
              streak_2: [],
              streak_3: [],
              streak_5_plus: [],
              streak_broken: [],
            }),
            ...(config.lessonFlow5ConditionalTemplates || {}),
          };

          const condMeta5: Array<{
            key: LessonFlow5ConditionKey;
            label: string;
            desc: string;
          }> = [
            {
              key: 'normal',
              label: 'ĐK Bình thường',
              desc: 'Khi người đạt Top 1 trả lời nhanh nhất câu này mới thắng lần 1',
            },
            {
              key: 'streak_2',
              label: 'Top 1 liên tục 2 lần',
              desc: 'Khi cùng 1 bạn đạt Top 1 trả lời nhanh nhất đúng 2 câu liên tiếp',
            },
            {
              key: 'streak_3',
              label: 'Top 1 liên tục 3 lần',
              desc: 'Khi cùng 1 bạn đạt Top 1 trả lời nhanh nhất 3-4 câu liên tiếp',
            },
            {
              key: 'streak_5_plus',
              label: 'Top 1 liên tục ≥ 5 lần',
              desc: 'Khi cùng 1 bạn đạt Top 1 trả lời nhanh nhất từ 5 câu liên tiếp trở lên',
            },
            {
              key: 'streak_broken',
              label: 'Khi combo bị phá',
              desc: 'Khi chuỗi Top 1 liên tiếp (≥ 2 lần) của bạn trước bị người khác phá vỡ',
            },
          ];

          const currentList5 =
            Array.isArray(flow5Groups[activeFlow5Cond]) &&
            flow5Groups[activeFlow5Cond].length > 0
              ? flow5Groups[activeFlow5Cond]
              : [''];

          const updateFlow5CondList = (
            condKey: LessonFlow5ConditionKey,
            nextArr: string[]
          ) => {
            const nextGroups = {
              ...flow5Groups,
              [condKey]: nextArr,
            };
            onUpdateConfig({
              lessonFlow5ConditionalTemplates: nextGroups,
              ...(condKey === 'normal' && nextArr[0]
                ? {
                    quizResultTtsTemplate: nextArr[0],
                    quizResultTtsTemplates: nextArr,
                  }
                : {}),
            });
          };

          return (
            <div className="p-2.5 rounded-lg bg-stone-950/90 border border-cyan-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 font-mono font-black text-[10px]">
                    Luồng 5
                  </span>
                  <span className="text-[11px] font-bold text-cyan-200">
                    Đọc kết quả (Bảng Kết Quả • Phân nhóm câu nói theo điều kiện)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.quizResultTtsEnabled !== false}
                      onChange={(e) =>
                        onUpdateConfig({
                          quizResultTtsEnabled: e.target.checked,
                        })
                      }
                      className="accent-emerald-500 w-3.5 h-3.5 rounded cursor-pointer"
                    />
                    <span>Bật đọc</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      const valid = currentList5.filter((s) => s.trim());
                      const raw =
                        valid.length > 0
                          ? valid[Math.floor(Math.random() * valid.length)]
                          : config.quizResultTtsTemplate ||
                            'Có [HọcKé] bạn học ké và [TrongLớp] bạn trong lớp trả lời đúng, chúc mừng bạn [Top1] trả lời nhanh nhất!';
                      const preview = raw
                        .replace(/\[HọcKé\]|\{outsideCount\}/gi, '5')
                        .replace(/\[TrongLớp\]|\{classCount\}/gi, '8')
                        .replace(/\[Top1Lớp\]|\[Top1\]|\{fastestName\}/gi, 'Bảo Ngọc')
                        .replace(/\[ChuỗiTop1\]|\[SốLầnLiênTiếp\]/gi, '5')
                        .replace(/\[Top1Cũ\]|\[NgườiBịPhá\]/gi, 'Minh Khang')
                        .replace(/\[ChuỗiCũ\]/gi, '4');
                      soundEngine.enqueueLessonFlowItems(
                        [{ text: preview, lang: 'vi' }],
                        config
                      );
                    }}
                    className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-cyan-300 cursor-pointer shrink-0"
                  >
                    Nghe thử nhóm này
                  </button>
                </div>
              </div>

              {/* Bộ nút chọn nhóm điều kiện Luồng 5 */}
              <div className="space-y-1">
                <div className="text-[10px] text-stone-400">
                  Chọn điều kiện kích hoạt câu nói (mỗi điều kiện lấy ngẫu nhiên 1 câu trong nhóm):
                </div>
                <div className="flex flex-wrap gap-1">
                  {condMeta5.map((c) => {
                    const count = (flow5Groups[c.key] || []).filter((s) =>
                      Boolean(s && s.trim())
                    ).length;
                    const isActive = activeFlow5Cond === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setActiveFlow5Cond(c.key)}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {c.label} ({count})
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9.5px] text-cyan-300/90 italic">
                  💡 {condMeta5.find((c) => c.key === activeFlow5Cond)?.desc}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-stone-400">
                  <span>
                    Biến hỗ trợ:{' '}
                    <span className="font-mono text-cyan-300">
                      [HọcKé], [TrongLớp], [Top1], [ChuỗiTop1], [Top1Cũ]
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateFlow5CondList(activeFlow5Cond, [
                        ...currentList5,
                        'Chúc mừng bạn [Top1] đã trả lời nhanh nhất câu hỏi này!',
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-600/25 hover:bg-cyan-600/40 border border-cyan-400/50 text-cyan-200 font-bold text-[10px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Thêm câu vào ĐK này
                  </button>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {currentList5.map((tpl, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-[10px] font-mono text-stone-500 w-4 text-right pt-1.5 shrink-0">
                        {idx + 1}.
                      </span>
                      <textarea
                        rows={2}
                        value={tpl}
                        onChange={(e) => {
                          const next = [...currentList5];
                          next[idx] = e.target.value;
                          updateFlow5CondList(activeFlow5Cond, next);
                        }}
                        placeholder="Nhập câu đọc kết quả cho điều kiện này..."
                        className="flex-1 px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-cyan-400 resize-y"
                      />
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const preview = (tpl || '')
                              .replace(/\[HọcKé\]|\{outsideCount\}/gi, '5')
                              .replace(/\[TrongLớp\]|\{classCount\}/gi, '8')
                              .replace(/\[Top1Lớp\]|\[Top1\]|\{fastestName\}/gi, 'Bảo Ngọc')
                              .replace(/\[ChuỗiTop1\]|\[SốLầnLiênTiếp\]/gi, '5')
                              .replace(/\[Top1Cũ\]|\[NgườiBịPhá\]/gi, 'Minh Khang')
                              .replace(/\[ChuỗiCũ\]/gi, '4');
                            soundEngine.enqueueLessonFlowItems(
                              [{ text: preview, lang: 'vi' }],
                              config
                            );
                          }}
                          title="Nghe thử câu này"
                          className="px-1.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] text-cyan-300 cursor-pointer"
                        >
                          🔊
                        </button>
                        {currentList5.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateFlow5CondList(
                                activeFlow5Cond,
                                currentList5.filter((_, i) => i !== idx)
                              )
                            }
                            title="Xóa câu này"
                            className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 cursor-pointer flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] bg-stone-900/70 px-2 py-1 rounded border border-stone-800/80">
                <span className="text-stone-400">Thời gian luồng:</span>
                <span className="font-mono font-bold text-emerald-300">
                  🔒 Tự động: Nói xong chuyển sang Luồng 6 • Đồng loạt hiện thẻ điểm học sinh trả lời đúng
                </span>
              </div>
            </div>
          );
        })()}

        {/* LUỒNG 6: ĐỌC XẾP HẠNG TRONG LỚP (PHÂN NHÓM THEO ĐIỀU KIỆN) */}
        {(() => {
          const flow6Groups = {
            ...(DEFAULT_CONFIG.lessonFlow6ConditionalTemplates || {
              normal: [],
              top1_3: [],
              top1_5: [],
              top1_10: [],
              top1_20: [],
              top1_30_plus: [],
            }),
            ...(config.lessonFlow6ConditionalTemplates || {}),
          };

          const condMeta6: Array<{
            key: LessonFlow6ConditionKey;
            label: string;
            desc: string;
          }> = [
            {
              key: 'normal',
              label: 'ĐK Bình thường',
              desc: 'Khi bạn Top 1 BXH giữ vị trí dẫn đầu 1-2 vòng thông thường',
            },
            {
              key: 'top1_3',
              label: 'Top 1 liên tục 3 lần',
              desc: 'Khi bạn Top 1 BXH giữ ngôi đầu liên tiếp 3-4 lần',
            },
            {
              key: 'top1_5',
              label: 'Top 1 liên tục 5 lần',
              desc: 'Khi bạn Top 1 BXH giữ ngôi đầu liên tiếp 5-9 lần',
            },
            {
              key: 'top1_10',
              label: 'Top 1 liên tục 10 lần',
              desc: 'Khi bạn Top 1 BXH giữ ngôi đầu liên tiếp 10-19 lần',
            },
            {
              key: 'top1_20',
              label: 'Top 1 liên tục 20 lần',
              desc: 'Khi bạn Top 1 BXH giữ ngôi đầu liên tiếp 20-29 lần',
            },
            {
              key: 'top1_30_plus',
              label: 'Top 1 từ 30 lần',
              desc: 'Khi bạn Top 1 BXH thống trị ngôi đầu từ 30 lần liên tiếp trở lên',
            },
          ];

          const currentList6 =
            Array.isArray(flow6Groups[activeFlow6Cond]) &&
            flow6Groups[activeFlow6Cond].length > 0
              ? flow6Groups[activeFlow6Cond]
              : [''];

          const updateFlow6CondList = (
            condKey: LessonFlow6ConditionKey,
            nextArr: string[]
          ) => {
            const nextGroups = {
              ...flow6Groups,
              [condKey]: nextArr,
            };
            onUpdateConfig({
              lessonFlow6ConditionalTemplates: nextGroups,
              ...(condKey === 'normal' && nextArr[0]
                ? { lessonRankingTtsTemplate: nextArr[0] }
                : {}),
            });
          };

          return (
            <div className="p-2.5 rounded-lg bg-stone-950/90 border border-purple-500/35 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-400/50 text-purple-300 font-mono font-black text-[10px]">
                    Luồng 6
                  </span>
                  <span className="text-[11px] font-bold text-purple-200">
                    Đọc xếp hạng (Bảng Xếp Hạng Trong Lớp • Phân nhóm theo ĐK)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const valid = currentList6.filter((s) => s.trim());
                    const raw =
                      valid.length > 0
                        ? valid[Math.floor(Math.random() * valid.length)]
                        : config.lessonRankingTtsTemplate ||
                          'Top 1 bảng xếp hạng là bạn [Top1Rank] với [ĐiểmTop1] điểm, chúng ta đến với câu hỏi tiếp theo nhé!';
                    const preview = raw
                      .replace(/\[Top1Rank\]|\[Top1BXH\]|\[Top1\]|\{top1Name\}/gi, 'Bảo Ngọc')
                      .replace(/\[ĐiểmTop1\]|\[Điểm\]|\{top1Points\}/gi, '120')
                      .replace(/\[ChuỗiTop1Rank\]|\[ChuỗiTop1\]/gi, '10');
                    soundEngine.enqueueLessonFlowItems(
                      [{ text: preview, lang: 'vi' }],
                      config
                    );
                  }}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-purple-300 cursor-pointer shrink-0"
                >
                  Nghe thử nhóm này
                </button>
              </div>

              {/* Bộ nút chọn nhóm điều kiện Luồng 6 */}
              <div className="space-y-1">
                <div className="text-[10px] text-stone-400">
                  Chọn điều kiện chuỗi giữ Top 1 BXH liên tiếp:
                </div>
                <div className="flex flex-wrap gap-1">
                  {condMeta6.map((c) => {
                    const count = (flow6Groups[c.key] || []).filter((s) =>
                      Boolean(s && s.trim())
                    ).length;
                    const isActive = activeFlow6Cond === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setActiveFlow6Cond(c.key)}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-purple-500/25 border-purple-400 text-purple-200 shadow-sm'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {c.label} ({count})
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9.5px] text-purple-300/90 italic">
                  💡 {condMeta6.find((c) => c.key === activeFlow6Cond)?.desc}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-stone-400">
                  <span>
                    Biến hỗ trợ:{' '}
                    <span className="font-mono text-purple-300">
                      [Top1Rank], [ĐiểmTop1], [ChuỗiTop1Rank]
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateFlow6CondList(activeFlow6Cond, [
                        ...currentList6,
                        'Top 1 bảng xếp hạng vẫn là bạn [Top1Rank] với [ĐiểmTop1] điểm!',
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600/25 hover:bg-purple-600/40 border border-purple-400/50 text-purple-200 font-bold text-[10px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Thêm câu vào ĐK này
                  </button>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {currentList6.map((tpl, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span className="text-[10px] font-mono text-stone-500 w-4 text-right pt-1.5 shrink-0">
                        {idx + 1}.
                      </span>
                      <textarea
                        rows={2}
                        value={tpl}
                        onChange={(e) => {
                          const next = [...currentList6];
                          next[idx] = e.target.value;
                          updateFlow6CondList(activeFlow6Cond, next);
                        }}
                        placeholder="Nhập câu đọc xếp hạng cho điều kiện này..."
                        className="flex-1 px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-purple-400 resize-y"
                      />
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const preview = (tpl || '')
                              .replace(/\[Top1Rank\]|\[Top1BXH\]|\[Top1\]|\{top1Name\}/gi, 'Bảo Ngọc')
                              .replace(/\[ĐiểmTop1\]|\[Điểm\]|\{top1Points\}/gi, '120')
                              .replace(/\[ChuỗiTop1Rank\]|\[ChuỗiTop1\]/gi, '10');
                            soundEngine.enqueueLessonFlowItems(
                              [{ text: preview, lang: 'vi' }],
                              config
                            );
                          }}
                          title="Nghe thử câu này"
                          className="px-1.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] text-purple-300 cursor-pointer"
                        >
                          🔊
                        </button>
                        {currentList6.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateFlow6CondList(
                                activeFlow6Cond,
                                currentList6.filter((_, i) => i !== idx)
                              )
                            }
                            title="Xóa câu này"
                            className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 cursor-pointer flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] bg-stone-900/70 px-2 py-1 rounded border border-stone-800/80">
                <span className="text-stone-400">Thời gian luồng:</span>
                <span className="font-mono font-bold text-emerald-300">
                  🔒 Tự động: Giữ nguyên danh sách Top đầu xuyên suốt luồng • Nói xong kết thúc câu hỏi
                </span>
              </div>
            </div>
          );
        })()}

        {/* LUỒNG KỶ LỤC MỚI (SAU LUỒNG 6): KHI TOP 1 BẢNG KỶ LỤC HÔM NAY THAY ĐỔI */}
        {(() => {
          const recList =
            Array.isArray(config.lessonRecordTtsTemplates) &&
            config.lessonRecordTtsTemplates.length > 0
              ? config.lessonRecordTtsTemplates
              : [
                  config.lessonRecordTtsTemplate ||
                    'Chúc mừng bạn [Top1KỷLục] đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục hôm nay với [ĐiểmKỷLục] điểm!',
                ];

          const updateRecItem = (idx: number, val: string) => {
            const next = [...recList];
            next[idx] = val;
            onUpdateConfig({
              lessonRecordTtsTemplates: next,
              lessonRecordTtsTemplate: next[0] || '',
            });
          };

          const addRecItem = () => {
            const next = [
              ...recList,
              'Quá đỉnh luôn! Bạn [Top1KỷLục] vừa xác lập kỷ lục mới cao nhất hôm nay với [ĐiểmKỷLục] điểm!',
            ];
            onUpdateConfig({
              lessonRecordTtsTemplates: next,
              lessonRecordTtsTemplate: next[0] || '',
            });
          };

          const removeRecItem = (idx: number) => {
            if (recList.length <= 1) return;
            const next = recList.filter((_, i) => i !== idx);
            onUpdateConfig({
              lessonRecordTtsTemplates: next,
              lessonRecordTtsTemplate: next[0] || '',
            });
          };

          return (
            <div className="p-2.5 rounded-lg bg-stone-950/90 border border-orange-500/45 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/25 border border-orange-400/60 text-orange-300 font-mono font-black text-[10px] shrink-0">
                    Luồng Kỷ Lục
                  </span>
                  <span className="text-[11px] font-bold text-orange-200 truncate">
                    Khi Top 1 &quot;Kỷ lục hôm nay&quot; thay đổi (Chèn luồng &amp; khen)
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const raw =
                        recList[Math.floor(Math.random() * recList.length)] ||
                        'Chúc mừng bạn [Top1KỷLục] đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục hôm nay với [ĐiểmKỷLục] điểm!';
                      const preview = raw
                        .replace(/\[Top1KỷLục\]|\[Tên\]|\[Top1\]/gi, 'Bảo Ngọc')
                        .replace(/\[ĐiểmKỷLục\]|\[Điểm\]/gi, '250')
                        .replace(/\[KỷLụcCũ\]/gi, 'Minh Khang');
                      soundEngine.enqueueLessonFlowItems(
                        [{ text: preview, lang: 'vi' }],
                        config
                      );
                    }}
                    className="px-2 py-0.5 rounded bg-orange-600/30 hover:bg-orange-500/45 border border-orange-400/50 text-[9.5px] font-bold text-orange-200 cursor-pointer"
                  >
                    Nghe thử
                  </button>

                  <button
                    type="button"
                    onClick={addRecItem}
                    className="px-2 py-0.5 rounded bg-orange-500/20 hover:bg-orange-500/35 border border-orange-400/45 text-[9.5px] font-bold text-orange-200 flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>Thêm câu</span>
                  </button>

                  <label className="flex items-center gap-1 text-[10px] font-bold text-orange-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.lessonRecordFlowEnabled !== false}
                      onChange={(e) =>
                        onUpdateConfig({
                          lessonRecordFlowEnabled: e.target.checked,
                        })
                      }
                      className="accent-orange-500 w-3.5 h-3.5 rounded cursor-pointer"
                    />
                    <span>
                      {config.lessonRecordFlowEnabled !== false ? 'Bật' : 'Tắt'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="text-[9.5px] text-stone-400">
                Biến hỗ trợ:{' '}
                <code className="text-orange-300 font-mono">[Top1KỷLục]</code>{' '}
                (hoặc <code className="text-orange-300 font-mono">[Tên]</code>),{' '}
                <code className="text-orange-300 font-mono">[ĐiểmKỷLục]</code>{' '}
                (hoặc <code className="text-orange-300 font-mono">[Điểm]</code>),{' '}
                <code className="text-orange-300 font-mono">[KỷLụcCũ]</code>
              </div>

              <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                {recList.map((txt, idx) => (
                  <div
                    key={`rec-flow-tpl-${idx}`}
                    className="flex items-center gap-1"
                  >
                    <span className="text-[9.5px] font-mono text-orange-400 w-4 shrink-0">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={txt}
                      onChange={(e) => updateRecItem(idx, e.target.value)}
                      placeholder="Nhập mẫu câu khen Top 1 Kỷ lục hôm nay..."
                      className="flex-1 px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-orange-400"
                    />
                    {recList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRecItem(idx)}
                        title="Xóa mẫu câu này"
                        className="p-1 rounded bg-stone-900 hover:bg-rose-950 border border-stone-800 text-stone-400 hover:text-rose-300 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] bg-stone-900/70 px-2 py-1 rounded border border-stone-800/80">
                <span className="text-stone-400">Thời gian luồng:</span>
                <span className="font-mono font-bold text-emerald-300">
                  🔒 Tự động: Check Top 1 kỷ lục thay đổi thì chèn luồng khen • Câu nói done thì chuyển luồng tiếp
                </span>
              </div>
            </div>
          );
        })()}

        {/* LUỒNG PHẠT ĐẶC BIỆT (SAU LUỒNG 6): KHI CÓ AI TẶNG QUÀ 5 / 10 / 10+ */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-rose-500/40 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/50 text-rose-300 font-mono font-black text-[10px]">
                Sau Luồng 6
              </span>
              <span className="text-[11px] font-bold text-rose-200">
                Luồng Thông Báo Phạt Quà 5 / 10 / 10+ (Tối đa 5 bạn/lượt • Buff x3 / x6 / x9)
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px] text-stone-400">
                <span>Khi có 1 bạn bị phạt (Biến: [Tên]):</span>
                <button
                  type="button"
                  onClick={() => {
                    const preview = (
                      config.lessonPunishmentSingleTtsTemplate ||
                      'Mời bạn [Tên] mới quậy trong lớp lên đây đứng 1 lượt!'
                    ).replace(/\[Tên\]|\[DanhSáchTên\]/gi, 'Bảo Ngọc');
                    soundEngine.enqueueLessonFlowItems(
                      [{ text: preview, lang: 'vi' }],
                      config
                    );
                  }}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-rose-300 cursor-pointer"
                >
                  Nghe thử (1 bạn)
                </button>
              </div>
              <input
                type="text"
                value={
                  config.lessonPunishmentSingleTtsTemplate ??
                  'Mời bạn [Tên] mới quậy trong lớp lên đây đứng 1 lượt!'
                }
                onChange={(e) =>
                  onUpdateConfig({
                    lessonPunishmentSingleTtsTemplate: e.target.value,
                  })
                }
                className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px] text-stone-400">
                <span>Khi có nhiều bạn bị phạt (Biến: [DanhSáchTên]):</span>
                <button
                  type="button"
                  onClick={() => {
                    const preview = (
                      config.lessonPunishmentMultiTtsTemplate ||
                      'Mời các bạn [DanhSáchTên] mới quậy trong lớp lên đây đứng 1 lượt!'
                    ).replace(
                      /\[DanhSáchTên\]|\[Tên\]/gi,
                      'Bảo Ngọc, Minh Khang, Gia Huy'
                    );
                    soundEngine.enqueueLessonFlowItems(
                      [{ text: preview, lang: 'vi' }],
                      config
                    );
                  }}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-rose-300 cursor-pointer"
                >
                  Nghe thử (Nhiều bạn)
                </button>
              </div>
              <input
                type="text"
                value={
                  config.lessonPunishmentMultiTtsTemplate ??
                  'Mời các bạn [DanhSáchTên] mới quậy trong lớp lên đây đứng 1 lượt!'
                }
                onChange={(e) =>
                  onUpdateConfig({
                    lessonPunishmentMultiTtsTemplate: e.target.value,
                  })
                }
                className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-100 focus:outline-none focus:border-rose-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] bg-stone-900/70 px-2 py-1 rounded border border-stone-800/80">
            <span className="text-stone-400">Cơ chế:</span>
            <span className="font-mono font-bold text-amber-300">
              ⚡ Đứng hàng ngang 5 chỗ • Quà 5=x3, 10=x6, 10+=x9 • Sai ra khỏi lớp luôn
            </span>
          </div>
        </div>
      </section>

      {/* 5. CẤU HÌNH GIỌNG ĐỌC THƯỜNG (HỌC SINH / COMMENT / SỰ KIỆN) */}
      <section className="p-3 rounded-xl bg-stone-900/85 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold text-amber-200">
            Giọng Đọc Thường — Học Sinh & Sự Kiện
          </h2>
          <button
            type="button"
            onClick={() => {
              const isAnyOn = Boolean(
                config.realPrayerTtsEnabled || config.npcPrayerTtsEnabled
              );
              onUpdateConfig({
                realPrayerTtsEnabled: !isAnyOn,
                npcPrayerTtsEnabled: !isAnyOn,
              });
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
              config.realPrayerTtsEnabled || config.npcPrayerTtsEnabled
                ? 'bg-emerald-500 text-stone-950'
                : 'bg-rose-950/90 border border-rose-500/40 text-rose-300'
            }`}
          >
            {config.realPrayerTtsEnabled || config.npcPrayerTtsEnabled
              ? '🔊 Đọc Comment Trong Lớp: BẬT'
              : '🔇 Đọc Comment Học Sinh: TẮT'}
          </button>
        </div>

        {/* Nguồn phát xếp theo thứ tự ổn định nhất từ trên xuống */}
        <div className="space-y-1">
          <div className="text-[10px] text-stone-400 font-medium">
            Nguồn phát giọng thường (Xếp hạng ổn định 1 → 3):
          </div>
          <select
            value={config.ttsEngine === 'monk_zen' ? 'web_speech' : config.ttsEngine}
            onChange={(e) =>
              onUpdateConfig({ ttsEngine: e.target.value as TTSEngineType })
            }
            className="w-full px-2 py-1.5 rounded-lg bg-stone-950 border border-amber-500/40 text-xs text-stone-100 font-semibold focus:outline-none focus:border-amber-400"
          >
            <option value="web_speech">
              1. [Ổn định #1 - 0ms] Web Speech Hệ Thống (Microsoft An / Google VN)
            </option>
            <option value="google_stream">
              2. [Ổn định #2 - Chuẩn OBS/TLS] Google Cloud Stream Đa Máy Chủ (GTX + Cache)
            </option>
            <option value="node_edge">
              3. [Ổn định #3 - Local Node] Node.js TTS (Google GTX / Edge AI HoaiMy, NamMinh)
            </option>
          </select>
        </div>

        {/* Lựa chọn giọng đọc chi tiết cho Google Cloud Stream */}
        {config.ttsEngine === 'google_stream' && (
          <div className="space-y-1">
            <div className="text-[10px] text-stone-400 font-medium">
              Chọn máy chủ & màu giọng Google Stream cho Học sinh / Sự kiện:
            </div>
            <select
              value={
                config.nodeVoice?.startsWith('google-')
                  ? config.nodeVoice
                  : 'google-vi-gtx'
              }
              onChange={(e) => onUpdateConfig({ nodeVoice: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-amber-200 font-medium"
            >
              <option value="google-vi-gtx">
                1. Google Cloud GTX — Nữ Chuẩn Rõ Chữ (Mặc định cho Học sinh)
              </option>
              <option value="google-vi-twob">
                2. Google Translate TW-OB — Nữ Dịu Dàng (Máy chủ độc lập #2)
              </option>
              <option value="google-vi-bright">
                3. Google Nữ Cao Trong Trẻo — Giọng Học Sinh Sáng Rõ
              </option>
              <option value="google-vi-slow">
                4. Google Nữ Trang Nghiêm — Nhịp Chậm Rõ Chữ
              </option>
              <option value="google-vi-warm">
                5. Google Trầm Ấm — Hạ Tần Số Ấm & Dày Giọng
              </option>
              <option value="google-vi-male-deep">
                6. Google Nam Trầm — Giọng Trầm Sâu
              </option>
            </select>
          </div>
        )}

        {/* Lựa chọn giọng đọc chi tiết cho Node.js Local TTS */}
        {config.ttsEngine === 'node_edge' && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-stone-400 font-medium">
              Chọn giọng Node.js cho Học sinh / Sự kiện:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <select
                value={config.nodeVoice}
                onChange={(e) => onUpdateConfig({ nodeVoice: e.target.value })}
                className="px-2 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-amber-200 font-medium"
              >
                <option value="google-vi-gtx">
                  1. Google Cloud GTX (Ổn định #1 - Nữ chuẩn)
                </option>
                <option value="google-vi-twob">
                  2. Google Translate TW-OB (Ổn định #2 - Nữ dịu)
                </option>
                <option value="google-vi-bright">
                  3. Google Nữ Cao Trong Trẻo (Sáng tiếng)
                </option>
                <option value="google-vi-slow">
                  4. Google Nữ Trang Nghiêm (Nhịp chậm)
                </option>
                <option value="google-vi-warm">
                  5. Google Trầm Ấm (Dày tiếng)
                </option>
                <option value="google-vi-male-deep">
                  6. Google Nam Trầm (Giọng trầm sâu)
                </option>
                <option value="vi-VN-HoaiMyNeural">
                  7. Edge AI - Hoài My Neural (Nữ truyền cảm)
                </option>
                <option value="vi-VN-NamMinhNeural">
                  8. Edge AI - Nam Minh Neural (Nam trầm ấm)
                </option>
              </select>
              <input
                type="text"
                value={config.nodeTtsEndpoint}
                onChange={(e) =>
                  onUpdateConfig({ nodeTtsEndpoint: e.target.value })
                }
                placeholder="http://localhost:3000/tts"
                className="px-2 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-amber-300 font-mono"
              />
            </div>
          </div>
        )}

        {/* Lựa chọn giọng hệ thống khi dùng Web Speech */}
        {(config.ttsEngine === 'web_speech' ||
          config.ttsEngine === 'monk_zen') && (
          <div className="space-y-1">
            <div className="text-[10px] text-stone-400 font-medium">
              Chọn giọng Tiếng Việt trong máy ({systemVoices.length} giọng khả dụng):
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={config.selectedSystemVoiceURI}
                onChange={(e) =>
                  onUpdateConfig({ selectedSystemVoiceURI: e.target.value })
                }
                className="flex-1 px-2 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-stone-200"
              >
                <option value="">
                  ★ Tự động chọn giọng Tiếng Việt tốt nhất (vi-VN)
                </option>
                {systemVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.lang.toLowerCase().includes('vi') ? '🇻🇳 ' : ''}
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={scanVoices}
                className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-[10.5px] font-semibold text-amber-300 shrink-0 cursor-pointer"
              >
                Quét giọng
              </button>
            </div>
          </div>
        )}

        {/* Preset Tông Giọng 1-chạm */}
        <div className="space-y-1 pt-0.5">
          <div className="text-[10px] text-stone-400 font-medium">
            Chọn nhanh Tông Giọng mẫu:
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  ttsRate: 1.05,
                  ttsPitch: 1.0,
                  ttsReverb: 0,
                })
              }
              className="px-1.5 py-1 rounded bg-stone-950 hover:bg-stone-800 border border-stone-800 text-[10px] font-semibold text-stone-200 cursor-pointer truncate"
            >
              Nữ Chuẩn
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  ttsRate: 0.95,
                  ttsPitch: 1.1,
                  ttsReverb: 0,
                })
              }
              className="px-1.5 py-1 rounded bg-stone-950 hover:bg-stone-800 border border-stone-800 text-[10px] font-semibold text-pink-300 cursor-pointer truncate"
            >
              Nữ Dịu
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  ttsRate: 0.95,
                  ttsPitch: 0.82,
                  ttsReverb: 0,
                })
              }
              className="px-1.5 py-1 rounded bg-stone-950 hover:bg-stone-800 border border-stone-800 text-[10px] font-semibold text-sky-300 cursor-pointer truncate"
            >
              Nam Trầm
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex justify-between text-[10.5px] text-stone-400">
              <span>Tốc độ Tiếng Việt</span>
              <span className="text-stone-200 font-mono">
                {config.ttsRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.7}
              max={2.0}
              step={0.05}
              value={config.ttsRate}
              onChange={(e) =>
                onUpdateConfig({ ttsRate: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/80 border border-emerald-500/35">
            <div className="flex justify-between text-[10.5px] text-emerald-200">
              <span className="font-semibold">Tốc độ từ Tiếng Anh</span>
              <span className="text-emerald-300 font-mono font-bold">
                {(config.englishTtsRate ?? 0.95).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={config.englishTtsRate ?? 0.95}
              onChange={(e) =>
                onUpdateConfig({ englishTtsRate: parseFloat(e.target.value) })
              }
              className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex justify-between text-[10.5px] text-stone-400">
              <span>Cao độ</span>
              <span className="text-stone-200 font-mono">
                {config.ttsPitch.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={config.ttsPitch}
              onChange={(e) =>
                onUpdateConfig({ ttsPitch: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex justify-between text-[10.5px] text-stone-400">
              <span>Âm lượng</span>
              <span className="text-stone-200 font-mono">
                {Math.round(config.ttsVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={config.ttsVolume}
              onChange={(e) =>
                onUpdateConfig({ ttsVolume: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
