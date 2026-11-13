import React, { useState } from 'react';
import {
  BellRing,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  GameConfig,
  SafetyActionMode,
  SafetyCategory,
  SafetyLogEntry,
} from '../../types/game';
import { inspectUserInteraction } from '../../services/safetyFilter';
import {
  DEFAULT_REMINDER_ALERT_COOLDOWN_SEC,
  DEFAULT_REMINDER_ALERT_KEYWORDS,
  DEFAULT_REMINDER_ALERT_URL,
  parseReminderKeywordsInput,
  triggerSilentReminderUrl,
} from '../../utils/silentReminderAlert';

interface TabSafetyProps {
  config: GameConfig;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  actionMode: SafetyActionMode;
  categories: SafetyCategory[];
  customWords: string[];
  logs: SafetyLogEntry[];
  onChangeActionMode: (mode: SafetyActionMode) => void;
  onToggleCategory: (key: string, enabled: boolean) => void;
  onAddCustomWords: (rawInput: string) => void;
  onRemoveCustomWord: (word: string) => void;
  onResetCustomWords: () => void;
  onClearLogs: () => void;
  onSpawnTrollTest: () => void;
}

export const TabSafety: React.FC<TabSafetyProps> = ({
  config,
  onUpdateConfig,
  actionMode,
  categories,
  customWords,
  logs,
  onChangeActionMode,
  onToggleCategory,
  onAddCustomWords,
  onRemoveCustomWord,
  onResetCustomWords,
  onClearLogs,
  onSpawnTrollTest,
}) => {
  const [testName, setTestName] = useState('Châu Tinh Trùng');
  const [testPrayer, setTestPrayer] = useState(
    'v.c.l vào kubet đánh tài xỉu zalo 0987654321'
  );
  const [sandboxOutput, setSandboxOutput] = useState<string | null>(null);
  const [newWordInput, setNewWordInput] = useState('');
  const [newAlertKwInput, setNewAlertKwInput] = useState('');
  const [testAlertStatus, setTestAlertStatus] = useState<string | null>(null);

  const reminderEnabled = config.reminderAlertEnabled !== false;
  const reminderOnDisconnect = config.reminderAlertOnDisconnect !== false;
  const reminderOnKeyword = config.reminderAlertOnKeyword !== false;
  const reminderCooldownSec =
    config.reminderAlertCooldownSec ?? DEFAULT_REMINDER_ALERT_COOLDOWN_SEC;
  const reminderUrl = config.reminderAlertUrl ?? DEFAULT_REMINDER_ALERT_URL;
  const reminderKeywords =
    config.reminderAlertKeywords ?? DEFAULT_REMINDER_ALERT_KEYWORDS;

  const totalActivePatterns =
    customWords.length +
    categories.filter((c) => c.enabled).reduce((acc, c) => acc + c.words.length, 0);

  const handleRunSandbox = () => {
    const res = inspectUserInteraction(
      testName,
      testPrayer,
      actionMode,
      categories,
      customWords
    );
    if (res.nameViolated || res.prayerViolated) {
      setSandboxOutput(
        `Chặn từ "${res.matchedWord}" → Đổi thành: [${res.safeUsername}] ${
          res.allowed ? res.safePrayer : '(Không cho vào sân)'
        }`
      );
    } else {
      setSandboxOutput('An toàn 100% — Cho phép vào chùa & đọc TTS');
    }
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWordInput.trim()) return;
    onAddCustomWords(newWordInput);
    setNewWordInput('');
  };

  const handleAddAlertKeywords = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseReminderKeywordsInput(newAlertKwInput);
    if (parsed.length === 0) return;
    const existingLower = new Set(
      reminderKeywords.map((w) => w.trim().toLowerCase())
    );
    const merged = [...reminderKeywords];
    for (const kw of parsed) {
      if (!existingLower.has(kw.toLowerCase())) {
        existingLower.add(kw.toLowerCase());
        merged.push(kw);
      }
    }
    onUpdateConfig({ reminderAlertKeywords: merged });
    setNewAlertKwInput('');
  };

  const handleRemoveAlertKeyword = (word: string) => {
    const targetLower = word.trim().toLowerCase();
    onUpdateConfig({
      reminderAlertKeywords: reminderKeywords.filter(
        (w) => w.trim().toLowerCase() !== targetLower
      ),
    });
  };

  const handleResetAlertKeywords = () => {
    onUpdateConfig({
      reminderAlertKeywords: [...DEFAULT_REMINDER_ALERT_KEYWORDS],
      reminderAlertCooldownSec: DEFAULT_REMINDER_ALERT_COOLDOWN_SEC,
      reminderAlertUrl: DEFAULT_REMINDER_ALERT_URL,
    });
  };

  const handleTestSilentAlertNow = () => {
    const ok = triggerSilentReminderUrl(reminderUrl);
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setTestAlertStatus(
      ok
        ? `Đã mở ngầm lúc ${timeStr} (Kiểm tra Telegram)`
        : 'Link không hợp lệ (cần bắt đầu bằng https://)'
    );
    window.setTimeout(() => setTestAlertStatus(null), 5000);
  };

  return (
    <div className="space-y-5">
      {/* Section 0: Silent Reminder Alert (Telegram via Focus-Reminder) */}
      <section className="p-3 rounded-xl border border-amber-500/35 bg-amber-950/15 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs font-bold text-amber-200 truncate">
              Cảnh báo ngầm về Telegram (Treo Live)
            </h2>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-200 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) =>
                onUpdateConfig({ reminderAlertEnabled: e.target.checked })
              }
              className="accent-amber-500 w-3.5 h-3.5 rounded"
            />
            <span>{reminderEnabled ? 'Đang bật' : 'Đã tắt'}</span>
          </label>
        </div>

        <p className="text-[11px] text-stone-400 leading-relaxed">
          Tự động mở ngầm khung ẩn tới link báo động (không mở tab mới, không ảnh hưởng link game đang chạy trên Chrome hay TikTok Live Studio).
        </p>

        {/* Trigger conditions */}
        <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-stone-800 bg-stone-900/60 p-2">
          <label className="flex items-center gap-2 text-xs text-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={reminderOnDisconnect}
              disabled={!reminderEnabled}
              onChange={(e) =>
                onUpdateConfig({ reminderAlertOnDisconnect: e.target.checked })
              }
              className="accent-emerald-500 w-3.5 h-3.5 rounded"
            />
            <span>1. Khi Node.js / TikTok Live tạm đứt kết nối</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={reminderOnKeyword}
              disabled={!reminderEnabled}
              onChange={(e) =>
                onUpdateConfig({ reminderAlertOnKeyword: e.target.checked })
              }
              className="accent-emerald-500 w-3.5 h-3.5 rounded"
            />
            <span>2. Khi bình luận người xem chứa từ khóa báo lỗi</span>
          </label>
        </div>

        {/* Cooldown */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-stone-300">
              Cooldown chống spam (giữa 2 lần báo):
            </span>
            <div className="flex items-center gap-1">
              {[60, 120, 180, 300].map((presetSec) => (
                <button
                  key={presetSec}
                  type="button"
                  onClick={() =>
                    onUpdateConfig({ reminderAlertCooldownSec: presetSec })
                  }
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                    reminderCooldownSec === presetSec
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                >
                  {presetSec}s
                </button>
              ))}
              <input
                type="number"
                min={5}
                max={3600}
                value={reminderCooldownSec}
                onChange={(e) => {
                  const val = Math.max(
                    5,
                    Math.min(3600, Math.round(Number(e.target.value) || 60))
                  );
                  onUpdateConfig({ reminderAlertCooldownSec: val });
                }}
                className="w-16 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-right text-xs font-mono text-amber-300"
              />
              <span className="text-[11px] text-stone-400">giây</span>
            </div>
          </div>
        </div>

        {/* Hidden Reminder URL + Test Button */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-stone-300">
              Link mở ngầm:
            </span>
            <button
              type="button"
              onClick={handleTestSilentAlertNow}
              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-[11px] font-semibold text-amber-200 flex items-center gap-1 cursor-pointer"
            >
              <Play className="w-3 h-3" />
              <span>Test mở ngầm ngay</span>
            </button>
          </div>
          <input
            type="url"
            value={reminderUrl}
            onChange={(e) =>
              onUpdateConfig({ reminderAlertUrl: e.target.value })
            }
            placeholder={DEFAULT_REMINDER_ALERT_URL}
            className="w-full px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-[11px] font-mono text-stone-200 focus:outline-none focus:border-amber-500"
          />
          {testAlertStatus && (
            <div className="text-[11px] text-emerald-400 font-medium">
              {testAlertStatus}
            </div>
          )}
        </div>

        {/* Alert Keywords */}
        <div className="space-y-2 pt-1 border-t border-stone-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-200">
              Từ khóa bình luận kích hoạt báo động ({reminderKeywords.length})
            </span>
            <button
              type="button"
              onClick={handleResetAlertKeywords}
              className="text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Mặc định</span>
            </button>
          </div>

          <form onSubmit={handleAddAlertKeywords} className="flex gap-2">
            <input
              type="text"
              value={newAlertKwInput}
              onChange={(e) => setNewAlertKwInput(e.target.value)}
              placeholder="Thêm từ khóa (VD: game đứng, lag, mất tiếng)..."
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm</span>
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {reminderKeywords.length === 0 ? (
              <span className="text-[11px] text-stone-500">
                Chưa có từ khóa cảnh báo nào.
              </span>
            ) : (
              reminderKeywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-900 border border-amber-500/30 text-amber-200 text-[11px]"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAlertKeyword(kw)}
                    className="text-stone-500 hover:text-rose-400 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      <hr className="border-stone-800/80" />

      {/* Section 1: Action Mode Selector */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-stone-200">
            Chế độ xử lý vi phạm Tiêu chuẩn Cộng đồng
          </h2>
          <span className="text-[11px] text-emerald-400 font-mono tabular-nums">
            {totalActivePatterns} mẫu lọc
          </span>
        </div>

        <select
          value={actionMode}
          onChange={(e) => onChangeActionMode(e.target.value as SafetyActionMode)}
          className="w-full px-2.5 py-2 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-100 font-medium focus:outline-none focus:border-amber-500"
        >
          <option value="purify">
            1. Thanh hóa tâm linh (Đổi thành câu Sám Hối thiện lành - Khuyên dùng)
          </option>
          <option value="block">
            2. Chặn hoàn toàn (Không cho vào chùa + Không đọc TTS)
          </option>
          <option value="mask">
            3. Che dấu sao *** (Cho vào chùa nhưng che *** và tắt đọc TTS)
          </option>
        </select>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          Tên tài khoản chứa bẫy phát âm nhạy cảm sẽ tự động đổi thành{' '}
          <strong className="text-stone-200">Phật Tử Thiện Lành</strong> để bảo vệ luồng Live.
        </p>
      </section>

      <hr className="border-stone-800/80" />

      {/* Section 2: Sandbox Filter Tester */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-stone-200">Kiểm tra thử bộ lọc (Sandbox)</h2>
          <button
            type="button"
            onClick={onSpawnTrollTest}
            className="px-2.5 py-1 rounded-md bg-stone-900 hover:bg-stone-800 border border-stone-700 text-[11px] font-medium text-amber-300 flex items-center gap-1 cursor-pointer"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Thử thả 1 Troll vào sân</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder="Tên test..."
            className="col-span-1 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-200"
          />
          <input
            type="text"
            value={testPrayer}
            onChange={(e) => setTestPrayer(e.target.value)}
            placeholder="Câu bình luận test..."
            className="col-span-2 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-200"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleRunSandbox}
            className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-100 flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Search className="w-3 h-3" />
            <span>Quét kiểm tra</span>
          </button>
          {sandboxOutput && (
            <div className="text-[11px] text-amber-300 truncate text-right">{sandboxOutput}</div>
          )}
        </div>
      </section>

      <hr className="border-stone-800/80" />

      {/* Section 3: 6 Default Dictionary Categories */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-stone-200">6 Nhóm từ điển cấm mặc định</h2>
        <div className="divide-y divide-stone-800/70 rounded-lg border border-stone-800 bg-stone-900/40">
          {categories.map((cat) => (
            <label
              key={cat.key}
              className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-stone-900/80 transition"
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={cat.enabled}
                  onChange={(e) => onToggleCategory(cat.key, e.target.checked)}
                  className="accent-emerald-500 w-3.5 h-3.5 rounded"
                />
                <span className="text-stone-200 font-medium">{cat.name}</span>
              </div>
              <span className="text-[11px] text-stone-400 font-mono tabular-nums">
                {cat.words.length} từ
              </span>
            </label>
          ))}
        </div>
      </section>

      <hr className="border-stone-800/80" />

      {/* Section 4: Custom Banned Words */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-stone-200">Từ cấm bổ sung của riêng bạn</h2>
          <button
            type="button"
            onClick={onResetCustomWords}
            className="text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Mặc định</span>
          </button>
        </div>

        <form onSubmit={handleAddWord} className="flex gap-2">
          <input
            type="text"
            value={newWordInput}
            onChange={(e) => setNewWordInput(e.target.value)}
            placeholder="Nhập từ cấm (cách nhau dấu phẩy)..."
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-white text-stone-950 font-semibold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {customWords.length === 0 ? (
            <span className="text-[11px] text-stone-500">Chưa có từ tùy chỉnh nào.</span>
          ) : (
            customWords.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-300 text-[11px]"
              >
                <span>{word}</span>
                <button
                  type="button"
                  onClick={() => onRemoveCustomWord(word)}
                  className="text-stone-500 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </section>

      <hr className="border-stone-800/80" />

      {/* Section 5: Violation & Alert Logs */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-stone-200">
            Nhật ký đã chặn / cảnh báo ({logs.length})
          </h2>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="text-[11px] text-stone-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Xóa nhật ký</span>
            </button>
          )}
        </div>

        <div className="max-h-36 overflow-y-auto divide-y divide-stone-800/60 rounded-lg border border-stone-800 bg-stone-900/40 text-[11px]">
          {logs.length === 0 ? (
            <div className="py-4 text-center text-stone-500">
              Chưa có bình luận vi phạm hay cảnh báo nào trong phiên này.
            </div>
          ) : (
            logs.map((item) => (
              <div key={item.id} className="px-3 py-2 flex items-start justify-between gap-2">
                <div className="text-stone-300">
                  <strong className="text-amber-300 font-semibold">[{item.user}]</strong>{' '}
                  {item.detail}
                </div>
                <span className="text-stone-500 font-mono tabular-nums shrink-0">
                  {item.time}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
