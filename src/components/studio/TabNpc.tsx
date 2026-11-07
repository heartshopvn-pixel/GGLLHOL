import React, { useState } from 'react';
import {
  Users,
  MessageSquare,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Edit3,
  Check,
  X,
  Shuffle,
  Volume2,
  ImagePlus,
  Upload,
  Gamepad2,
  Send,
} from 'lucide-react';
import {
  ClassBoardRuntimeState,
  ControlledNpcRole,
  GameConfig,
  NpcSpeechCategory,
  PilgrimData,
  QueuedPilgrimRequest,
  WaitingQueueItem,
} from '../../types/game';
import { DEFAULT_NPC_SPEECH_CATEGORIES } from '../../config/constants';
import { HostLiveTtsCard } from './HostLiveTtsCard';

interface TabNpcProps {
  config: GameConfig;
  classBoardState?: ClassBoardRuntimeState;
  pilgrims?: PilgrimData[];
  doorCrowd?: PilgrimData[];
  waitingQueue?: Array<QueuedPilgrimRequest | WaitingQueueItem>;
  npcNames: string[];
  npcPrayers: string[];
  npcAvatars: string[];
  controlledNpcRole?: ControlledNpcRole;
  onToggleControlNpc?: (role?: ControlledNpcRole) => void;
  onSetNpcManualMove?: (dir: 'w' | 'a' | 's' | 'd', active: boolean) => void;
  onSendControlledStudentComment?: (username: string, comment: string) => void;
  ttsStatus: { text: string; active: boolean };
  onSpeakHostLiveText: (
    text: string,
    options?: {
      interrupt?: boolean;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }
  ) => void;
  onPanicMute: () => void;
  onUpdateConfig: (partial: Partial<GameConfig>) => void;
  onUpdateNpcNames: (names: string[]) => void;
  onResetNpcNames: () => void;
  onUpdateNpcPrayers: (prayers: string[]) => void;
  onResetNpcPrayers: () => void;
  onUpdateNpcAvatars: (avatars: string[]) => void;
  onResetNpcAvatars: () => void;
  onRandomizeActiveNpcAvatars: () => void;
}

export const TabNpc: React.FC<TabNpcProps> = ({
  config,
  classBoardState,
  pilgrims = [],
  doorCrowd = [],
  waitingQueue = [],
  npcNames,
  npcPrayers,
  npcAvatars,
  controlledNpcRole = null,
  onToggleControlNpc,
  onSetNpcManualMove,
  onSendControlledStudentComment,
  ttsStatus,
  onSpeakHostLiveText,
  onPanicMute,
  onUpdateConfig,
  onUpdateNpcNames,
  onResetNpcNames,
  onUpdateNpcPrayers,
  onResetNpcPrayers,
  onUpdateNpcAvatars,
  onResetNpcAvatars,
  onRandomizeActiveNpcAvatars,
}) => {
  const [newNameInput, setNewNameInput] = useState('');
  const [newPrayerInput, setNewPrayerInput] = useState('');
  const [newAvatarUrlInput, setNewAvatarUrlInput] = useState('');
  const [selectedRoleTarget, setSelectedRoleTarget] =
    useState<'abbot' | 'senior_novice' | 'student'>('abbot');
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [studentCommentText, setStudentCommentText] = useState('');

  // Inline edit state for NPC Names
  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null);
  const [editingNameVal, setEditingNameVal] = useState('');

  // Inline edit state for NPC Prayers (3 nhóm: Vu vơ / Hỏi / Trả lời)
  const [activeSpeechCategory, setActiveSpeechCategory] =
    useState<NpcSpeechCategory>('idle');
  const [editingPrayerIdx, setEditingPrayerIdx] = useState<number | null>(null);
  const [editingPrayerVal, setEditingPrayerVal] = useState('');

  const speechCategories = config.npcSpeechCategories || DEFAULT_NPC_SPEECH_CATEGORIES;
  const activeCategoryList =
    speechCategories[activeSpeechCategory] ||
    DEFAULT_NPC_SPEECH_CATEGORIES[activeSpeechCategory] ||
    [];

  const updateSpeechCategoryList = (
    category: NpcSpeechCategory,
    nextList: string[]
  ) => {
    const nextCategories = {
      idle: speechCategories.idle || DEFAULT_NPC_SPEECH_CATEGORIES.idle,
      question:
        speechCategories.question || DEFAULT_NPC_SPEECH_CATEGORIES.question,
      reply: speechCategories.reply || DEFAULT_NPC_SPEECH_CATEGORIES.reply,
      [category]: nextList,
    };
    onUpdateConfig({ npcSpeechCategories: nextCategories });
    onUpdateNpcPrayers([
      ...nextCategories.idle,
      ...nextCategories.question,
      ...nextCategories.reply,
    ]);
  };

  // Name handlers
  const handleAddName = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newNameInput.trim();
    if (!val) return;
    if (!npcNames.includes(val)) {
      onUpdateNpcNames([val, ...npcNames]);
    }
    setNewNameInput('');
  };

  const handleDeleteName = (idx: number) => {
    onUpdateNpcNames(npcNames.filter((_, i) => i !== idx));
  };

  const handleSaveEditName = (idx: number) => {
    const val = editingNameVal.trim();
    if (val) {
      const next = [...npcNames];
      next[idx] = val;
      onUpdateNpcNames(next);
    }
    setEditingNameIdx(null);
  };

  // Prayer handlers (theo nhóm đang chọn: Vu vơ / Hỏi / Trả lời)
  const handleAddPrayer = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newPrayerInput.trim();
    if (!val) return;
    if (!activeCategoryList.includes(val)) {
      updateSpeechCategoryList(activeSpeechCategory, [
        val,
        ...activeCategoryList,
      ]);
    }
    setNewPrayerInput('');
  };

  const handleDeletePrayer = (idx: number) => {
    updateSpeechCategoryList(
      activeSpeechCategory,
      activeCategoryList.filter((_, i) => i !== idx)
    );
  };

  const handleSaveEditPrayer = (idx: number) => {
    const val = editingPrayerVal.trim();
    if (val) {
      const next = [...activeCategoryList];
      next[idx] = val;
      updateSpeechCategoryList(activeSpeechCategory, next);
    }
    setEditingPrayerIdx(null);
  };

  const handleUploadTxtList = (
    e: React.ChangeEvent<HTMLInputElement>,
    onApply: (lines: string[]) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const lines = reader.result
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length > 0) {
          onApply(Array.from(new Set(lines)));
        }
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const activeTargetRole = controlledNpcRole || selectedRoleTarget;
  const isControllingStaff =
    controlledNpcRole === 'abbot' || controlledNpcRole === 'senior_novice';
  const isControllingStudent = controlledNpcRole === 'student';

  // Danh sách các NPC Học Sinh đang có mặt (trong lớp, trong hàng chờ, hoặc đứng ở cửa lớp)
  const npcStudentOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      username: string;
      badge: string;
    }> = [];

    pilgrims.forEach((p) => {
      if (
        p.isBot &&
        p.state !== 'leave_side_to_aisle' &&
        p.state !== 'leave_down_exit'
      ) {
        const key = p.username.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            username: p.username,
            badge: `Trong lớp • ${p.gender === 'male' ? 'Nam' : 'Nữ'}`,
          });
        }
      }
    });

    waitingQueue.forEach((q) => {
      if (q.isBot) {
        const key = q.username.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            username: q.username,
            badge: `Hàng chờ • ${q.gender === 'male' ? 'Nam' : 'Nữ'}`,
          });
        }
      }
    });

    doorCrowd.forEach((d) => {
      const key = d.username.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          username: d.username,
          badge: `Cửa lớp • ${d.gender === 'male' ? 'Nam' : 'Nữ'}`,
        });
      }
    });

    if (list.length === 0 && npcNames.length > 0) {
      list.push({
        username: npcNames[0],
        badge: 'Ngoài lớp',
      });
    }
    return list;
  }, [pilgrims, waitingQueue, doorCrowd, npcNames]);

  const effectiveStudentName =
    selectedStudentName &&
    npcStudentOptions.some((o) => o.username === selectedStudentName)
      ? selectedStudentName
      : npcStudentOptions[0]?.username || npcNames[0] || 'Học Sinh NPC';

  const currentQuizAnswer = classBoardState?.currentQuestion?.en
    ? classBoardState.currentQuestion.en.charAt(0).toUpperCase() +
      classBoardState.currentQuestion.en.slice(1).toLowerCase()
    : 'School';

  const currentTypoQuizAnswer = React.useMemo(() => {
    const clean = currentQuizAnswer.trim();
    if (clean.length < 2) return `${clean}a`;
    const chars = clean.split('');
    for (let i = 0; i < chars.length - 1; i++) {
      if (
        /[a-zA-Z]/.test(chars[i]) &&
        /[a-zA-Z]/.test(chars[i + 1]) &&
        chars[i].toLowerCase() !== chars[i + 1].toLowerCase()
      ) {
        const tmp = chars[i];
        chars[i] = chars[i + 1];
        chars[i + 1] = tmp;
        const swapped = chars.join('');
        return swapped.charAt(0).toUpperCase() + swapped.slice(1).toLowerCase();
      }
    }
    return `${clean}e`;
  }, [currentQuizAnswer]);

  const handleSendStudentComment = (customText?: string) => {
    const text = (
      typeof customText === 'string' ? customText : studentCommentText
    ).trim();
    if (!text || !effectiveStudentName) return;
    onSendControlledStudentComment?.(effectiveStudentName, text);
    if (typeof customText !== 'string') {
      setStudentCommentText('');
    }
  };

  const bindMoveBtn = (dir: 'w' | 'a' | 's' | 'd') => ({
    onMouseDown: () => onSetNpcManualMove?.(dir, true),
    onMouseUp: () => onSetNpcManualMove?.(dir, false),
    onMouseLeave: () => onSetNpcManualMove?.(dir, false),
    onTouchStart: () => onSetNpcManualMove?.(dir, true),
    onTouchEnd: () => onSetNpcManualMove?.(dir, false),
  });

  return (
    <div className="space-y-3.5">
      {/* 0. THẺ ĐIỀU KHIỂN NPC (CÔ GIÁO / GIÁM THỊ: DI CHUYỂN WASD | NPC HỌC SINH: CHỈ COMMENT) */}
      <section className="p-2.5 rounded-xl bg-stone-900/95 border border-emerald-500/45 space-y-2 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-extrabold text-emerald-300 truncate">
              Điều Khiển NPC
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={activeTargetRole}
              onChange={(e) => {
                const nextRole = e.target.value as
                  | 'abbot'
                  | 'senior_novice'
                  | 'student';
                setSelectedRoleTarget(nextRole);
                if (controlledNpcRole) {
                  onToggleControlNpc?.(nextRole);
                }
              }}
              className="px-2 py-1 rounded-md bg-stone-950 border border-stone-700 text-[10.5px] font-bold text-amber-200 focus:outline-none"
            >
              <option value="abbot">👩‍🏫 Cô Thảo (WASD)</option>
              <option value="senior_novice">👨‍🏫 Thầy Tùng (WASD)</option>
              <option value="student">🎒 NPC Học Sinh (Chỉ Comment)</option>
            </select>

            <button
              type="button"
              onClick={() =>
                onToggleControlNpc?.(
                  controlledNpcRole ? null : selectedRoleTarget
                )
              }
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-extrabold border cursor-pointer transition ${
                controlledNpcRole
                  ? 'bg-emerald-400 text-stone-950 border-emerald-200 shadow-sm'
                  : 'bg-stone-950 hover:bg-stone-800 text-stone-200 border-stone-700'
              }`}
            >
              {controlledNpcRole
                ? isControllingStudent
                  ? 'Đang ĐK Comment'
                  : 'Đang ĐK (WASD)'
                : 'Bật điều khiển'}
            </button>
          </div>
        </div>

        {/* Chế độ điều khiển Cô Thảo hoặc Thầy Tùng (WASD) */}
        {activeTargetRole !== 'student' ? (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80">
            <span className="text-[10.5px] text-stone-400 leading-snug">
              {isControllingStaff
                ? `Nhấn W / A / S / D (hoặc mũi tên) để di chuyển ${
                    controlledNpcRole === 'abbot'
                      ? 'Cô Thảo'
                      : 'Thầy Tùng'
                  }.`
                : activeTargetRole === 'abbot'
                ? 'Tự động: Cô Thảo đi trong vùng GV, ưu tiên đứng bên phải lâu hơn.'
                : 'Tự động: Thầy Tùng đi tuần tra ngẫu nhiên trong vùng Giám Thị.'}
            </span>

            {isControllingStaff && (
              <div className="flex items-center gap-1 shrink-0 select-none">
                {(['w', 'a', 's', 'd'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    {...bindMoveBtn(k)}
                    className="w-6 h-6 rounded bg-stone-950 hover:bg-emerald-500/25 active:bg-emerald-400 active:text-stone-950 border border-emerald-500/40 text-[10px] font-mono font-extrabold text-emerald-300 uppercase flex items-center justify-center cursor-pointer"
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Chế độ điều khiển NPC Học Sinh (Không di chuyển WASD, chỉ có chức năng Comment để test) */
          <div className="pt-1.5 border-t border-stone-800/80 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-stone-400">
                Chọn NPC Học Sinh (không di chuyển WASD, vẫn tự chạy theo thuật toán lớp):
              </span>
            </div>

            <select
              value={effectiveStudentName}
              onChange={(e) => setSelectedStudentName(e.target.value)}
              className="w-full px-2 py-1 rounded-md bg-stone-950 border border-stone-700 text-[11px] font-bold text-sky-200 focus:outline-none"
            >
              {npcStudentOptions.map((opt) => (
                <option key={opt.username} value={opt.username}>
                  [{opt.badge}] {opt.username}
                </option>
              ))}
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendStudentComment();
              }}
              className="flex gap-1.5"
            >
              <input
                type="text"
                value={studentCommentText}
                onChange={(e) => setStudentCommentText(e.target.value)}
                placeholder="Nhập comment cho NPC (đáp án, 1nam, 1nu, vào lớp, chat)..."
                className="flex-1 bg-stone-950 border border-stone-700 focus:border-emerald-400 rounded-lg px-2.5 py-1 text-xs text-stone-100 focus:outline-none"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Comment</span>
              </button>
            </form>

            {/* Nút test nhanh các lệnh comment trên NPC Học Sinh đang chọn */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[9.5px] text-stone-400 mr-0.5">Test nhanh:</span>
              <button
                type="button"
                onClick={() => handleSendStudentComment(currentQuizAnswer)}
                className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-[10px] font-bold text-emerald-200 cursor-pointer"
                title="Ép NPC học sinh này comment đáp án đúng của câu hỏi hiện tại"
              >
                Đúng: {currentQuizAnswer}
              </button>
              <button
                type="button"
                onClick={() => handleSendStudentComment(currentTypoQuizAnswer)}
                className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/50 text-[10px] font-bold text-rose-200 cursor-pointer"
                title="Ép NPC học sinh này comment câu trả lời bị đảo 2 chữ cái liền nhau -> Hệ thống nhận diện là trả lời sai"
              >
                Sai (Đảo 2 chữ): {currentTypoQuizAnswer}
              </button>
              <button
                type="button"
                onClick={() => handleSendStudentComment('1nam')}
                className="px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-[10px] font-bold text-sky-200 cursor-pointer"
                title="Đổi giới tính nhân vật sang Học Sinh Nam"
              >
                1nam (Đổi Nam)
              </button>
              <button
                type="button"
                onClick={() => handleSendStudentComment('1nu')}
                className="px-1.5 py-0.5 rounded bg-pink-500/20 hover:bg-pink-500/35 border border-pink-400/50 text-[10px] font-bold text-pink-200 cursor-pointer"
                title="Đổi giới tính nhân vật sang Học Sinh Nữ"
              >
                1nu (Đổi Nữ)
              </button>
              <button
                type="button"
                onClick={() => handleSendStudentComment('vào lớp')}
                className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 text-[10px] font-bold text-cyan-200 cursor-pointer"
                title="Comment 'vào lớp' để xếp vào Hàng Chờ Vào Lớp"
              >
                vào lớp
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 0.5. THẺ ÂM THANH TEXT-TO-AUDIO GẮN NGAY PHÍA DƯỚI THẺ ĐIỀU KHIỂN NPC */}
      <HostLiveTtsCard
        config={config}
        ttsStatus={ttsStatus}
        onUpdateConfig={onUpdateConfig}
        onSpeakHostLiveText={onSpeakHostLiveText}
        onPanicMute={onPanicMute}
        defaultExpandedVoiceConfig={false}
      />

      {/* 1. MẬT ĐỘ RẢI CHAT & SĨ SỐ HỌC SINH NPC */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between border-b border-stone-800 pb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-amber-300">
              Học Sinh NPC Tự Động
            </h3>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-amber-200">
            <input
              type="checkbox"
              checked={config.autoCrowd}
              onChange={(e) => onUpdateConfig({ autoCrowd: e.target.checked })}
              className="accent-amber-500 rounded"
            />
            Bật NPC tự động
          </label>
        </div>

        {/* Mật độ rải chat của NPC (thay cho chu kỳ phát biểu cố định) */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span
              className="text-amber-200/80"
              title="NPC trong lớp và NPC trong hàng chờ sẽ phát biểu rải rác ngẫu nhiên theo mật độ này (0% = Tắt rải chat)"
            >
              Mật độ rải chat NPC (trong lớp & hàng chờ):
            </span>
            <span className="font-bold text-amber-400">
              {(config.npcScatterChatDensity ?? 50) <= 0
                ? '0% (Tắt)'
                : `${config.npcScatterChatDensity ?? 50}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={config.npcScatterChatDensity ?? 50}
            onChange={(e) =>
              onUpdateConfig({ npcScatterChatDensity: Number(e.target.value) })
            }
            className="w-full accent-amber-500"
          />
          <p className="text-[10px] text-stone-400 mt-0.5 leading-snug">
            Khi hỏi bài: NPC trả lời đúng sẽ chat đáp án như người thật; NPC sai sẽ im lặng hoặc chat đáp án bị đảo 2 chữ cái liền nhau.
          </p>
        </div>

        {/* Số NPC mới thêm vào hàng chờ mỗi khi xong 1 câu hỏi (±1,2,3) & Tỷ lệ NPC trả lời đúng */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex justify-between text-xs mb-1 gap-1">
              <span
                className="text-amber-200/80 truncate"
                title="Sau mỗi câu hỏi kết thúc, hệ thống sẽ thêm thẳng số NPC này (±1, 2, 3 ngẫu nhiên) vào hàng chờ"
              >
                NPC thêm vào hàng chờ / câu:
              </span>
              <span className="font-bold text-amber-400 shrink-0">
                {config.botTargetCrowd} (±1~3)
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={config.botTargetCrowd}
              onChange={(e) =>
                onUpdateConfig({ botTargetCrowd: Number(e.target.value) })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span
                className="text-amber-200/80"
                title="Tỷ lệ NPC (trong lớp & trong hàng chờ) trả lời đúng mỗi câu hỏi"
              >
                Tỷ lệ NPC trả lời đúng:
              </span>
              <span className="font-bold text-emerald-400">
                {config.npcCorrectAnswerPercent ?? 65}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={config.npcCorrectAnswerPercent ?? 65}
              onChange={(e) =>
                onUpdateConfig({ npcCorrectAnswerPercent: Number(e.target.value) })
              }
              className="w-full accent-emerald-500"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-xs text-amber-200/85 pt-1">
          <input
            type="checkbox"
            checked={config.npcPrayerTtsEnabled}
            onChange={(e) =>
              onUpdateConfig({ npcPrayerTtsEnabled: e.target.checked })
            }
            className="accent-amber-500"
          />
          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
          Đọc giọng nói (TTS) cho cả lời phát biểu của NPC
        </label>
      </div>

      {/* 3. DANH SÁCH LỜI PHÁT BIỂU / COMMENT CỦA NPC (TÁCH 3 NHÓM: VU VƠ • HỎI • TRẢ LỜI) */}
      <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-xs font-bold text-amber-300 truncate">
              Danh Sách Phát Biểu NPC — 3 Nhóm (
              {(speechCategories.idle?.length || 0) +
                (speechCategories.question?.length || 0) +
                (speechCategories.reply?.length || 0)}
              )
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label
              className="text-[10px] font-bold text-emerald-200 hover:text-emerald-100 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 cursor-pointer transition"
              title="Tải file .txt (mỗi dòng 1 câu) để cập nhật cho nhóm đang chọn"
            >
              <Upload className="w-3 h-3 text-emerald-400" />
              <span>Nạp .txt vào nhóm này</span>
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(e) =>
                  handleUploadTxtList(e, (lines) =>
                    updateSpeechCategoryList(activeSpeechCategory, lines)
                  )
                }
              />
            </label>
            <button
              type="button"
              onClick={() => {
                onUpdateConfig({
                  npcSpeechCategories: DEFAULT_NPC_SPEECH_CATEGORIES,
                });
                onResetNpcPrayers();
              }}
              className="text-[10px] text-amber-300/70 hover:text-amber-200 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-500/20 cursor-pointer"
              title="Khôi phục cả 3 nhóm phát biểu mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              Mặc định
            </button>
          </div>
        </div>

        {/* Bộ chọn 3 Nhóm: Vu vơ / Hỏi / Trả lời */}
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              {
                key: 'idle' as NpcSpeechCategory,
                label: '💭 1. Vu vơ',
                count: speechCategories.idle?.length || 0,
                activeClass:
                  'bg-amber-500/25 border-amber-400 text-amber-200 shadow-sm',
              },
              {
                key: 'question' as NpcSpeechCategory,
                label: '❓ 2. Hỏi',
                count: speechCategories.question?.length || 0,
                activeClass:
                  'bg-sky-500/25 border-sky-400 text-sky-200 shadow-sm',
              },
              {
                key: 'reply' as NpcSpeechCategory,
                label: '💬 3. Trả lời',
                count: speechCategories.reply?.length || 0,
                activeClass:
                  'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-sm',
              },
            ] as const
          ).map((tab) => {
            const isActive = activeSpeechCategory === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveSpeechCategory(tab.key);
                  setEditingPrayerIdx(null);
                }}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-between gap-1 cursor-pointer transition ${
                  isActive
                    ? tab.activeClass
                    : 'bg-stone-950/80 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span className="px-1.5 py-0.2 rounded bg-black/40 font-mono text-[10px]">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-stone-400 leading-snug">
          💡 Khi rải chat: Hệ thống lấy ngẫu nhiên 1 trong 3 nhóm. Nếu bạn NPC vừa chat có <b className="text-emerald-300">bạn cùng bàn bên cạnh cũng là NPC</b>, lượt chat kế tiếp sẽ tự động đẩy cho bạn cùng bàn đó đáp lại bằng câu ngẫu nhiên trong nhóm <b className="text-emerald-300">💬 3. Trả lời</b>.
        </p>

        <form onSubmit={handleAddPrayer} className="flex gap-1.5">
          <input
            type="text"
            value={newPrayerInput}
            onChange={(e) => setNewPrayerInput(e.target.value)}
            placeholder={
              activeSpeechCategory === 'idle'
                ? 'Thêm câu phát biểu vu vơ mới...'
                : activeSpeechCategory === 'question'
                ? 'Thêm câu hỏi mới...'
                : 'Thêm câu trả lời (đáp lại bạn cùng bàn) mới...'
            }
            className="flex-1 bg-black/50 border border-amber-500/30 rounded px-2.5 py-1.5 text-xs text-amber-100 placeholder:text-amber-200/35 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs flex items-center gap-1 transition shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </form>

        <div className="max-h-44 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {activeCategoryList.map((prayer, idx) => (
            <div
              key={`${activeSpeechCategory}_${idx}`}
              className="flex items-center justify-between gap-1.5 bg-black/40 border border-amber-500/15 rounded px-2.5 py-1.5 text-xs group"
            >
              {editingPrayerIdx === idx ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={editingPrayerVal}
                    onChange={(e) => setEditingPrayerVal(e.target.value)}
                    className="flex-1 bg-black/80 border border-amber-400 rounded px-2 py-0.5 text-xs text-amber-100"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEditPrayer(idx)}
                    className="p-1 text-emerald-400 hover:text-emerald-300"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPrayerIdx(null)}
                    className="p-1 text-red-400 hover:text-red-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-amber-100/90 flex-1 leading-snug">{prayer}</span>
                  <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPrayerIdx(idx);
                        setEditingPrayerVal(prayer);
                      }}
                      className="p-1 text-amber-300/70 hover:text-amber-200"
                      title="Sửa"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePrayer(idx)}
                      className="p-1 text-red-400/70 hover:text-red-300"
                      title="Xóa"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. DANH SÁCH TÊN NPC */}
      <div className="bg-[#1b120e] border border-amber-500/20 rounded-lg p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/10 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 truncate">
              Danh Sách Tên NPC ({npcNames.length})
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label
              className="text-[10px] font-bold text-emerald-200 hover:text-emerald-100 flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 cursor-pointer transition"
              title="Tải file .txt (mỗi dòng 1 tên NPC) để cập nhật danh sách tên"
            >
              <Upload className="w-3 h-3 text-emerald-400" />
              <span>Cập nhật bằng file .txt</span>
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(e) => handleUploadTxtList(e, onUpdateNpcNames)}
              />
            </label>
            <button
              type="button"
              onClick={onResetNpcNames}
              className="text-[10px] text-amber-300/70 hover:text-amber-200 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-500/20 cursor-pointer"
              title="Khôi phục danh sách tên mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              Mặc định
            </button>
          </div>
        </div>

        <form onSubmit={handleAddName} className="flex gap-1.5">
          <input
            type="text"
            value={newNameInput}
            onChange={(e) => setNewNameInput(e.target.value)}
            placeholder="Thêm tên NPC mới (VD: Phật Tử Tâm An)..."
            className="flex-1 bg-black/50 border border-amber-500/30 rounded px-2.5 py-1.5 text-xs text-amber-100 placeholder:text-amber-200/35 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs flex items-center gap-1 transition shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </form>

        <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1.5 pr-1 custom-scrollbar">
          {npcNames.map((name, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-1 bg-black/40 border border-amber-500/15 rounded px-2 py-1 text-xs group"
            >
              {editingNameIdx === idx ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <input
                    type="text"
                    value={editingNameVal}
                    onChange={(e) => setEditingNameVal(e.target.value)}
                    className="w-full bg-black/80 border border-amber-400 rounded px-1.5 py-0.5 text-[11px] text-amber-100"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEditName(idx)}
                    className="text-emerald-400 shrink-0"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingNameIdx(null)}
                    className="text-red-400 shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-amber-100/90 truncate text-[11px]" title={name}>
                    {name}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-75 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNameIdx(idx);
                        setEditingNameVal(name);
                      }}
                      className="p-0.5 text-amber-300/70 hover:text-amber-200"
                      title="Sửa tên"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteName(idx)}
                      className="p-0.5 text-red-400/70 hover:text-red-300"
                      title="Xóa tên"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 5. KHO AVATAR NPC (POOL NGẪU NHIÊN) */}
      <div className="bg-[#1b120e] border border-amber-500/20 rounded-lg p-3.5 space-y-2.5">
        <div className="flex items-center justify-between border-b border-amber-500/10 pb-2">
          <div className="flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Kho Avatar NPC — Pool Ngẫu Nhiên ({npcAvatars.length})
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRandomizeActiveNpcAvatars}
              className="text-[10px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 cursor-pointer"
              title="Đổi ngẫu nhiên avatar từ Pool cho tất cả NPC đang ở trên sân"
            >
              <Shuffle className="w-3 h-3" />
              Đổi cho NPC trên sân
            </button>
            <button
              type="button"
              onClick={onResetNpcAvatars}
              className="text-[10px] text-amber-300/70 hover:text-amber-200 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/50 border border-amber-500/20 cursor-pointer"
              title="Khôi phục kho avatar mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              Mặc định
            </button>
          </div>
        </div>

        <p className="text-[10.5px] text-amber-200/70 leading-relaxed">
          Mỗi khi NPC mới bước vào chùa, hệ thống sẽ bốc ngẫu nhiên 1 ảnh từ kho này làm Avatar bên trái tên nhân vật. Có thể tải lên nhiều ảnh cùng lúc.
        </p>

        <div className="flex items-center gap-1.5">
          <label className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer">
            <ImagePlus className="w-3.5 h-3.5" />
            <span>+ Tải Lên Nhiều Ảnh Avatar</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                Promise.all(
                  files.map(
                    (f) =>
                      new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                          resolve(String(reader.result || URL.createObjectURL(f)));
                        reader.onerror = () => resolve(URL.createObjectURL(f));
                        reader.readAsDataURL(f);
                      })
                  )
                ).then((newUrls) => {
                  onUpdateNpcAvatars([...newUrls, ...npcAvatars]);
                });
                e.target.value = '';
              }}
            />
          </label>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = newAvatarUrlInput.trim();
              if (!val) return;
              onUpdateNpcAvatars([val, ...npcAvatars]);
              setNewAvatarUrlInput('');
            }}
            className="flex gap-1 flex-1 min-w-0"
          >
            <input
              type="text"
              value={newAvatarUrlInput}
              onChange={(e) => setNewAvatarUrlInput(e.target.value)}
              placeholder="Hoặc dán link ảnh Avatar..."
              className="flex-1 min-w-0 bg-black/50 border border-amber-500/30 rounded px-2 py-1.5 text-xs text-amber-100 placeholder:text-amber-200/35 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-2.5 py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-amber-500/30 text-amber-200 font-bold text-xs shrink-0 cursor-pointer"
            >
              Thêm
            </button>
          </form>
        </div>

        <div className="max-h-40 overflow-y-auto grid grid-cols-6 gap-2 pt-1 pr-1 custom-scrollbar">
          {npcAvatars.map((url, idx) => (
            <div
              key={idx}
              className="relative group aspect-square rounded-lg bg-black/60 border border-amber-500/25 overflow-hidden flex items-center justify-center"
            >
              <img
                src={url}
                alt={`NPC Avatar ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateNpcAvatars(npcAvatars.filter((_, i) => i !== idx))
                }
                title="Xóa avatar này khỏi Pool"
                className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 hover:text-red-300 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
