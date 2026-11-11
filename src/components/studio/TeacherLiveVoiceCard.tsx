import React, { useState } from 'react';
import {
  Gauge,
  MessageSquare,
  Mic,
  Minus,
  Plus,
  Send,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GameConfig } from '../../types/game';
import { TeacherLiveVoiceOptions, TeacherLiveVoiceStatus } from '../../services/soundEngine';

interface TeacherLiveVoiceCardProps {
  config: GameConfig;
  teacherLiveStatus?: TeacherLiveVoiceStatus;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onSpeakTeacherLiveVoice: (
    text: string,
    options?: TeacherLiveVoiceOptions & { showBubble?: boolean }
  ) => void;
  onStopTeacherLiveVoice: () => void;
}

const DEFAULT_TEACHER_PHRASES = [
  'Trật tự nào mấy đứa, tập trung nhìn lên bảng trả lời câu hỏi của cô Thảo đi!',
  'Thầy giám thị đang đi tuần nha, bạn nào quậy trong lớp coi chừng lên đứng bảng đó!',
  'Chào mừng các bạn mới vào lớp, thả tim và bình luận đáp án thật nhanh nhé!',
  'Giỏi lắm, mấy bạn hàng chờ cố gắng trả lời đúng để giành ghế vào lớp nha!',
];

export const TeacherLiveVoiceCard: React.FC<TeacherLiveVoiceCardProps> = ({
  config,
  teacherLiveStatus,
  onUpdateConfig,
  onSpeakTeacherLiveVoice,
  onStopTeacherLiveVoice,
}) => {
  const [liveText, setLiveText] = useState('');
  const [newQuickPhrase, setNewQuickPhrase] = useState('');
  const [recentSentList, setRecentSentList] = useState<string[]>([]);

  const engine = config.teacherLiveEngine || 'google_stream';
  const voice =
    config.teacherLiveVoice ||
    (engine === 'node_edge' ? 'vi-VN-NamMinhNeural' : 'google-vi-male-deep');
  const volume = config.teacherLiveVolume ?? 1.0;
  const rate = config.teacherLiveRate ?? 1.0;
  const pitch = config.teacherLivePitch ?? 0.8;
  const showBubble = config.teacherLiveShowBubble !== false;

  const quickPhrases =
    Array.isArray(config.teacherLiveQuickPhrases) &&
    config.teacherLiveQuickPhrases.length > 0
      ? config.teacherLiveQuickPhrases
      : DEFAULT_TEACHER_PHRASES;

  const isSpeaking = Boolean(teacherLiveStatus?.active);

  const triggerSpeak = (textToSpeak: string) => {
    const clean = textToSpeak.trim();
    if (!clean) return;
    onSpeakTeacherLiveVoice(clean, {
      volume,
      rate,
      pitch,
      engine,
      voice,
      showBubble,
    });
    setRecentSentList((prev) => {
      const filtered = prev.filter((item) => item !== clean);
      return [clean, ...filtered].slice(0, 4);
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
      teacherLiveQuickPhrases: [clean, ...quickPhrases],
    });
    setNewQuickPhrase('');
  };

  const handleRemoveQuickPhrase = (idx: number) => {
    const next = quickPhrases.filter((_, i) => i !== idx);
    onUpdateConfig({
      teacherLiveQuickPhrases:
        next.length > 0 ? next : DEFAULT_TEACHER_PHRASES,
    });
  };

  return (
    <section className="p-2.5 rounded-xl bg-stone-900/95 border border-sky-500/50 space-y-2 shadow-md">
      {/* Header: Tên thẻ + Trạng thái phát song song + Nút Bong bóng & Dừng */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Mic
            className={`w-4 h-4 shrink-0 ${
              isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-sky-400'
            }`}
          />
          <h2 className="text-xs font-extrabold text-sky-200 truncate">
            👨‍🏫 Live Text-to-Voice (Giọng Thầy Giáo)
          </h2>
          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-[9px] font-bold text-sky-200 shrink-0">
            Độc lập • Song song
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ teacherLiveShowBubble: !showBubble })
            }
            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
              showBubble
                ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                : 'bg-stone-950 border-stone-700 text-stone-400'
            }`}
            title="Bật/tắt hiện bong bóng thoại của Thầy Tùng trên lớp khi phát giọng"
          >
            <MessageSquare className="w-2.5 h-2.5" />
            <span>{showBubble ? 'Bong bóng: Bật' : 'Bong bóng: Ẩn'}</span>
          </button>

          {isSpeaking && (
            <button
              type="button"
              onClick={onStopTeacherLiveVoice}
              className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-[10px] font-bold text-white flex items-center gap-1 cursor-pointer shadow"
              title="Chỉ dừng giọng đọc của Thầy Giáo (không ảnh hưởng giọng Cô Thảo hay hàng chờ)"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Dừng Thầy</span>
            </button>
          )}
        </div>
      </div>

      {/* Trạng thái câu Thầy đang nói song song */}
      {isSpeaking && teacherLiveStatus?.currentText && (
        <div className="px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/45 flex items-center gap-1.5 text-[10.5px]">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 font-bold text-[9px] shrink-0 animate-pulse">
            ĐANG NÓI SONG SONG
          </span>
          <span className="text-emerald-100 truncate">
            “{teacherLiveStatus.currentText}”
          </span>
        </div>
      )}

      {/* Ô nhập nội dung phát biểu trực tiếp */}
      <form onSubmit={handleSubmit} className="space-y-1.5">
        <textarea
          rows={2}
          value={liveText}
          onChange={(e) => setLiveText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập lời Thầy Giáo nói trực tiếp (Enter phát ngay song song với game, không chờ hàng đợi)..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 focus:border-sky-400 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {/* Chọn nguồn giọng Nam của Thầy */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={`${engine}::${voice}`}
              onChange={(e) => {
                const [nextEng, nextVoice] = e.target.value.split('::');
                onUpdateConfig({
                  teacherLiveEngine:
                    nextEng === 'node_edge' ? 'node_edge' : 'google_stream',
                  teacherLiveVoice: nextVoice || 'google-vi-male-deep',
                  teacherLivePitch:
                    nextEng === 'node_edge'
                      ? 0.96
                      : nextVoice === 'google-vi-warm'
                      ? 0.85
                      : 0.8,
                });
              }}
              className="px-2 py-1 rounded-md bg-stone-950 border border-stone-700 text-[10.5px] text-sky-200 font-semibold focus:outline-none"
            >
              <option value="google_stream::google-vi-male-deep">
                👨‍🏫 Giọng Thầy Trầm Ấm (Google Stream)
              </option>
              <option value="google_stream::google-vi-warm">
                🎙️ Giọng Thầy Sáng Rõ (Google Warm)
              </option>
              <option value="node_edge::vi-VN-NamMinhNeural">
                🤖 Edge AI: Nam Minh (Node Local)
              </option>
            </select>

            <button
              type="button"
              onClick={() =>
                triggerSpeak(
                  'Alo một hai ba bốn, mấy đứa trật tự tập trung làm bài kiểm tra của cô Thảo nha!'
                )
              }
              className="px-2 py-1 rounded-md bg-stone-950 hover:bg-stone-800 border border-sky-500/40 text-[10px] font-bold text-sky-200 flex items-center gap-1 cursor-pointer transition"
            >
              <Volume2 className="w-3 h-3 text-sky-400" />
              <span>Thử giọng</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!liveText.trim()}
            className="px-3 py-1 rounded-md bg-sky-400 hover:bg-sky-300 disabled:opacity-40 text-stone-950 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer transition shrink-0 shadow"
          >
            <Send className="w-3 h-3" />
            <span>Phát ngay</span>
          </button>
        </div>
      </form>

      {/* Bảng chỉnh Âm lượng, Tốc độ & Độ trầm đầy đủ ngay trên mặt thẻ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-0.5">
        {/* 1. Âm lượng (0% - 200%) */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between gap-1 text-[10px]">
            <span className="font-bold text-stone-300 flex items-center gap-1">
              {volume <= 0.01 ? (
                <VolumeX className="w-3 h-3 text-rose-400" />
              ) : (
                <Volume2 className="w-3 h-3 text-sky-400" />
              )}
              <span>Âm lượng</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onUpdateConfig({ teacherLiveVolume: 1.0 })}
                className="px-1 py-0.2 rounded bg-stone-800 hover:bg-stone-700 text-[8.5px] font-mono text-stone-300 cursor-pointer"
                title="Đặt về 100%"
              >
                100%
              </button>
              <span className="font-mono font-extrabold text-sky-300 tabular-nums">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  teacherLiveVolume: Math.max(
                    0,
                    Number((volume - 0.05).toFixed(2))
                  ),
                })
              }
              className="w-5 h-5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer shrink-0"
              title="Giảm 5% âm lượng"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <input
              type="range"
              min={0}
              max={2.0}
              step={0.05}
              value={volume}
              onChange={(e) =>
                onUpdateConfig({
                  teacherLiveVolume: parseFloat(e.target.value),
                })
              }
              className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  teacherLiveVolume: Math.min(
                    2.0,
                    Number((volume + 0.05).toFixed(2))
                  ),
                })
              }
              className="w-5 h-5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 flex items-center justify-center text-sky-200 cursor-pointer shrink-0"
              title="Tăng 5% âm lượng (tối đa 200%)"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* 2. Tốc độ đọc (0.50x - 2.00x, giữ nguyên chất giọng Nam trầm) */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between gap-1 text-[10px]">
            <span className="font-bold text-stone-300 flex items-center gap-1">
              <Gauge className="w-3 h-3 text-amber-400" />
              <span>Tốc độ</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onUpdateConfig({ teacherLiveRate: 1.0 })}
                className="px-1 py-0.2 rounded bg-stone-800 hover:bg-stone-700 text-[8.5px] font-mono text-stone-300 cursor-pointer"
                title="Đặt về 1.00x"
              >
                1.0x
              </button>
              <span className="font-mono font-extrabold text-amber-300 tabular-nums">
                {rate.toFixed(2)}x
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  teacherLiveRate: Math.max(
                    0.5,
                    Number((rate - 0.05).toFixed(2))
                  ),
                })
              }
              className="w-5 h-5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer shrink-0"
              title="Giảm tốc độ (-0.05x)"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={rate}
              onChange={(e) =>
                onUpdateConfig({
                  teacherLiveRate: parseFloat(e.target.value),
                })
              }
              className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  teacherLiveRate: Math.min(
                    2.0,
                    Number((rate + 0.05).toFixed(2))
                  ),
                })
              }
              className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 flex items-center justify-center text-amber-200 cursor-pointer shrink-0"
              title="Tăng tốc độ (+0.05x)"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* 3. Độ trầm giọng Thầy (Pitch 0.65 - 1.05) */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1">
          <div className="flex items-center justify-between gap-1 text-[10px]">
            <span className="font-bold text-stone-300">🎙️ Độ trầm (Pitch)</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    teacherLivePitch: engine === 'node_edge' ? 0.96 : 0.8,
                  })
                }
                className="px-1 py-0.2 rounded bg-stone-800 hover:bg-stone-700 text-[8.5px] font-mono text-stone-300 cursor-pointer"
                title="Đặt về độ trầm chuẩn của Thầy"
              >
                Chuẩn
              </button>
              <span className="font-mono font-extrabold text-cyan-300 tabular-nums">
                {pitch.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  teacherLivePitch: Math.max(
                    0.65,
                    Number((pitch - 0.02).toFixed(2))
                  ),
                })
              }
              className="w-5 h-5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer shrink-0"
              title="Trầm dày hơn (-0.02)"
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <input
              type="range"
              min={0.65}
              max={1.05}
              step={0.02}
              value={pitch}
              onChange={(e) =>
                onUpdateConfig({
                  teacherLivePitch: parseFloat(e.target.value),
                })
              }
              className="w-full accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  teacherLivePitch: Math.min(
                    1.05,
                    Number((pitch + 0.02).toFixed(2))
                  ),
                })
              }
              className="w-5 h-5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/40 flex items-center justify-center text-cyan-200 cursor-pointer shrink-0"
              title="Cao sáng hơn (+0.02)"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Câu nói nhanh 1-chạm của Thầy Giáo */}
      <div className="space-y-1 pt-1 border-t border-stone-800/80">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-stone-300">
            ⚡ Câu nhanh của Thầy:
          </span>
          <form
            onSubmit={handleAddQuickPhrase}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              value={newQuickPhrase}
              onChange={(e) => setNewQuickPhrase(e.target.value)}
              placeholder="+ Thêm câu nhanh..."
              className="w-32 px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-stone-200 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={!newQuickPhrase.trim()}
              className="p-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 disabled:opacity-30 border border-sky-400/40 text-sky-300 cursor-pointer"
              title="Lưu câu nói nhanh"
            >
              <Plus className="w-3 h-3" />
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-0.5">
          {quickPhrases.map((phrase, idx) => (
            <div
              key={idx}
              className="group inline-flex items-center rounded bg-stone-950/90 hover:bg-sky-950/50 border border-stone-800 hover:border-sky-500/40 transition max-w-full"
            >
              <button
                type="button"
                onClick={() => triggerSpeak(phrase)}
                className="px-1.5 py-0.5 text-left text-[10px] text-stone-200 hover:text-sky-200 truncate max-w-[310px] cursor-pointer"
              >
                🔊 {phrase}
              </button>
              {quickPhrases.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveQuickPhrase(idx)}
                  className="px-1 py-0.5 text-stone-500 hover:text-rose-400 opacity-60 group-hover:opacity-100 cursor-pointer shrink-0"
                  title="Xóa câu này"
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
                className="px-1.5 py-0.5 rounded bg-sky-950/40 hover:bg-sky-900/60 border border-sky-500/30 text-[9.5px] text-sky-200 truncate max-w-[170px] cursor-pointer"
                title="Đọc lại câu này"
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
