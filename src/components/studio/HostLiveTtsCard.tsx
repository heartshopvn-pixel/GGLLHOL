import React, { useEffect, useState } from 'react';
import {
  Mic,
  Plus,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { GameConfig, TTSEngineType } from '../../types/game';

interface HostLiveTtsCardProps {
  config: GameConfig;
  ttsStatus: { text: string; active: boolean };
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onSpeakHostLiveText: (
    text: string,
    options?: {
      interrupt?: boolean;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }
  ) => void;
  onPanicMute: () => void;
  defaultExpandedVoiceConfig?: boolean;
}

const DEFAULT_QUICK_PHRASES = [
  'Chào mừng các em mới vào lớp 12A1, thả tim và comment điểm danh nhận chỗ ngồi nhé!',
  'Cả lớp thả tim nhiệt tình cho đủ mốc Liên Hoan Trà Sữa toàn trường nào!',
  'Cô cảm ơn các bạn bàn đầu VIP đã tặng Hoa Điểm 10 ủng hộ lớp nhé!',
  'Bạn nào muốn ngồi bàn đầu danh dự gần Cô thì gửi Hoa Điểm 10 hoặc Trà Sữa nha!',
];

export const HostLiveTtsCard: React.FC<HostLiveTtsCardProps> = ({
  config,
  ttsStatus,
  onUpdateConfig,
  onSpeakHostLiveText,
  onPanicMute,
  defaultExpandedVoiceConfig = false,
}) => {
  const [liveText, setLiveText] = useState('');
  const [showVoiceSettings, setShowVoiceSettings] = useState(
    defaultExpandedVoiceConfig
  );
  const [newQuickPhrase, setNewQuickPhrase] = useState('');
  const [recentSentList, setRecentSentList] = useState<string[]>([]);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

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
  }, []);

  const hostEngine: TTSEngineType =
    config.hostTtsEngine === 'web_speech' ? 'web_speech' : 'google_stream';
  const hostRate = config.hostTtsRate ?? 1.02;
  const hostPitch = config.hostTtsPitch ?? 0.88;
  const hostVolume = config.hostTtsVolume ?? 1.0;
  const hostInterrupt = config.hostTtsInterrupt ?? true;
  const hostSpeakerRole = config.hostTtsSpeakerRole ?? 'abbot';
  const quickPhrases =
    Array.isArray(config.hostQuickPhrases) && config.hostQuickPhrases.length > 0
      ? config.hostQuickPhrases
      : DEFAULT_QUICK_PHRASES;

  const triggerSpeak = (textToSpeak: string) => {
    const clean = textToSpeak.trim();
    if (!clean) return;
    onSpeakHostLiveText(clean, {
      interrupt: hostInterrupt,
      speakerRole: hostSpeakerRole,
    });
    setRecentSentList((prev) => {
      const filtered = prev.filter((item) => item !== clean);
      return [clean, ...filtered].slice(0, 5);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveText.trim()) return;
    triggerSpeak(liveText);
    setLiveText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!liveText.trim()) return;
      triggerSpeak(liveText);
      setLiveText('');
    }
  };

  const handleAddQuickPhrase = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newQuickPhrase.trim();
    if (!clean) return;
    onUpdateConfig({
      hostQuickPhrases: [clean, ...quickPhrases],
    });
    setNewQuickPhrase('');
  };

  const handleRemoveQuickPhrase = (idx: number) => {
    const next = quickPhrases.filter((_, i) => i !== idx);
    onUpdateConfig({
      hostQuickPhrases: next.length > 0 ? next : DEFAULT_QUICK_PHRASES,
    });
  };



  return (
    <section className="p-2.5 rounded-xl bg-stone-900/95 border border-cyan-500/40 space-y-2">
      {/* Header gọn */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Mic className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <h2 className="text-xs font-extrabold text-cyan-200 truncate">
            Text-to-Audio (Phát Biểu Trực Tiếp)
          </h2>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowVoiceSettings((prev) => !prev)}
            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
              showVoiceSettings
                ? 'bg-cyan-500 text-stone-950 border-cyan-300'
                : 'bg-stone-950 hover:bg-stone-800 text-cyan-200 border-cyan-500/40'
            }`}
          >
            <Sliders className="w-2.5 h-2.5" />
            <span>Giọng</span>
          </button>

          {ttsStatus.active && (
            <button
              type="button"
              onClick={onPanicMute}
              className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer"
            >
              <VolumeX className="w-2.5 h-2.5" />
              <span>Ngắt</span>
            </button>
          )}
        </div>
      </div>

      {/* Ô nhập câu nói ngắn gọn */}
      <form onSubmit={handleSubmit} className="space-y-1.5">
        <textarea
          rows={2}
          value={liveText}
          onChange={(e) => setLiveText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập câu nói (Enter để đọc ngay)..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 focus:border-cyan-400 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({ hostTtsInterrupt: !hostInterrupt })
              }
              className={`px-2 py-1 rounded-md border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                hostInterrupt
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                  : 'bg-stone-950 border-stone-700 text-stone-300'
              }`}
            >
              <Zap className="w-2.5 h-2.5 text-amber-400" />
              <span>{hostInterrupt ? 'Đọc đè' : 'Chèn #1'}</span>
            </button>

            <select
              value={hostSpeakerRole === 'junior_novice' ? 'senior_novice' : hostSpeakerRole}
              onChange={(e) =>
                onUpdateConfig({
                  hostTtsSpeakerRole: e.target
                    .value as GameConfig['hostTtsSpeakerRole'],
                })
              }
              className="px-2 py-1 rounded-md bg-stone-950 border border-stone-700 text-[10px] text-cyan-200 font-semibold focus:outline-none"
            >
              <option value="abbot">💬 Cô Thảo</option>
              <option value="senior_novice">💬 Thầy Cá</option>
              <option value="none">🔇 Ẩn bong bóng</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!liveText.trim()}
            className="px-2.5 py-1 rounded-md bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-stone-950 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer transition shrink-0"
          >
            <Send className="w-3 h-3" />
            <span>Đọc ngay</span>
          </button>
        </div>
      </form>

      {/* Cài đặt giọng gọn gàng */}
      {showVoiceSettings && (
        <div className="p-2 rounded-lg bg-stone-950/95 border border-cyan-500/35 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold text-cyan-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Tông giọng</span>
            </span>
            <button
              type="button"
              onClick={() =>
                triggerSpeak('Chào cả lớp 12A1, các em trật tự nghe cô giảng bài nhé!')
              }
              className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 text-[10px] font-bold text-cyan-200 flex items-center gap-1 cursor-pointer"
            >
              <Volume2 className="w-2.5 h-2.5" />
              <span>Thử giọng</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  hostTtsEngine: 'web_speech',
                  hostTtsPitch: 1.0,
                })
              }
              className={`px-2 py-1.5 rounded border text-[10.5px] font-bold cursor-pointer transition ${
                hostEngine === 'web_speech'
                  ? 'bg-cyan-500 text-stone-950 border-cyan-300'
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-800'
              }`}
            >
              1. 🇻🇳 Web Speech Tiếng Việt
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  hostTtsEngine: 'google_stream',
                  hostNodeVoice: 'google-vi-warm',
                  hostTtsPitch: 0.88,
                })
              }
              className={`px-2 py-1.5 rounded border text-[10.5px] font-bold cursor-pointer transition ${
                hostEngine === 'google_stream'
                  ? 'bg-cyan-500 text-stone-950 border-cyan-300'
                  : 'bg-stone-900 hover:bg-stone-800 text-amber-200 border-stone-800'
              }`}
            >
              2. 🎙️ Google Warm (Trầm Ấm)
            </button>
          </div>

          {hostEngine === 'web_speech' && (
            <select
              value={config.hostSystemVoiceURI || ''}
              onChange={(e) =>
                onUpdateConfig({ hostSystemVoiceURI: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[10.5px] text-amber-200 focus:outline-none"
            >
              <option value="">★ Tự động chọn giọng Tiếng Việt (vi-VN)</option>
              {systemVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.lang.toLowerCase().includes('vi') ? '🇻🇳 ' : ''}
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            <div className="p-1 rounded bg-stone-900/90 border border-stone-800">
              <div className="flex justify-between text-[9.5px] text-stone-400">
                <span>Tốc độ</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {hostRate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={2.0}
                step={0.05}
                value={hostRate}
                onChange={(e) =>
                  onUpdateConfig({ hostTtsRate: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-400 h-1 bg-stone-800 rounded cursor-pointer"
              />
            </div>

            <div className="p-1 rounded bg-stone-900/90 border border-stone-800">
              <div className="flex justify-between text-[9.5px] text-stone-400">
                <span>Pitch</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {hostPitch.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.4}
                step={0.04}
                value={hostPitch}
                onChange={(e) =>
                  onUpdateConfig({ hostTtsPitch: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-400 h-1 bg-stone-800 rounded cursor-pointer"
              />
            </div>

            <div className="p-1 rounded bg-stone-900/90 border border-stone-800">
              <div className="flex justify-between text-[9.5px] text-stone-400">
                <span>Âm lượng</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {Math.round(hostVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={hostVolume}
                onChange={(e) =>
                  onUpdateConfig({ hostTtsVolume: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-400 h-1 bg-stone-800 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Câu nói nhanh 1-chạm gọn gàng */}
      <div className="space-y-1 pt-1 border-t border-stone-800/80">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-stone-300">
            ⚡ Câu nhanh:
          </span>
          <form onSubmit={handleAddQuickPhrase} className="flex items-center gap-1">
            <input
              type="text"
              value={newQuickPhrase}
              onChange={(e) => setNewQuickPhrase(e.target.value)}
              placeholder="+ Thêm câu..."
              className="w-28 px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-stone-200 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!newQuickPhrase.trim()}
              className="p-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 disabled:opacity-30 border border-cyan-400/40 text-cyan-300 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-0.5">
          {quickPhrases.map((phrase, idx) => (
            <div
              key={idx}
              className="group inline-flex items-center rounded bg-stone-950/90 hover:bg-cyan-950/50 border border-stone-800 hover:border-cyan-500/40 transition max-w-full"
            >
              <button
                type="button"
                onClick={() => triggerSpeak(phrase)}
                className="px-1.5 py-0.5 text-left text-[10px] text-stone-200 hover:text-cyan-200 truncate max-w-[310px] cursor-pointer"
              >
                🔊 {phrase}
              </button>
              {quickPhrases.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveQuickPhrase(idx)}
                  className="px-1 py-0.5 text-stone-500 hover:text-rose-400 opacity-60 group-hover:opacity-100 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {recentSentList.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            {recentSentList.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => triggerSpeak(item)}
                className="px-1.5 py-0.5 rounded bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 text-[9.5px] text-cyan-200 truncate max-w-[160px] cursor-pointer"
              >
                ↻ {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
