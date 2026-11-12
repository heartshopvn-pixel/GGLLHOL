import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckSquare,
  Crosshair,
  FastForward,
  Flame,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  User,
  Bot,
  Zap,
} from 'lucide-react';
import {
  CameraFocusState,
  CameraQueueItem,
  GameConfig,
  PilgrimData,
} from '../../types/game';

interface TabCameraProps {
  config: GameConfig;
  cameraFocus: CameraFocusState;
  cameraQueue: CameraQueueItem[];
  pilgrims: PilgrimData[];
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onSkipCameraTarget: () => void;
  onResetCameraView: () => void;
  onClearCameraQueue: () => void;
  onRemoveCameraQueueItem: (queueId: string) => void;
  onFocusPilgrimNow: (pilgrimId: number) => void;
}

export const TabCamera: React.FC<TabCameraProps> = ({
  config,
  cameraFocus,
  cameraQueue,
  pilgrims,
  onUpdateConfig,
  onSkipCameraTarget,
  onResetCameraView,
  onClearCameraQueue,
  onRemoveCameraQueueItem,
  onFocusPilgrimNow,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const activeTargetPilgrim =
    cameraFocus.pilgrimId !== null && nowMs < cameraFocus.until
      ? pilgrims.find((p) => p.id === cameraFocus.pilgrimId) || null
      : null;

  const activeFocusRole =
    cameraFocus.focusRole && nowMs < cameraFocus.until
      ? cameraFocus.focusRole
      : null;

  const activeFocusRoleLabel =
    activeFocusRole === 'zombie'
      ? '🧟 Zombie (Sự kiện)'
      : activeFocusRole === 'abbot'
      ? '👩‍🏫 Cô Thảo (Sự kiện)'
      : activeFocusRole === 'senior_novice'
      ? '👨‍🏫 Thầy Cá (Sự kiện)'
      : null;

  const activeStagePilgrims = pilgrims.filter(
    (p) => p.state !== 'leave_down_exit'
  );

  const getReasonBadge = (reason?: string) => {
    if (reason === 'special_gift') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/60 text-[10px] font-bold text-amber-200 flex items-center gap-1 shrink-0">
          <Sparkles className="w-2.5 h-2.5 text-amber-300" />
          Sự kiện / Đặc biệt
        </span>
      );
    }
    if (reason === 'gift') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-pink-500/25 border border-pink-400/60 text-[10px] font-bold text-pink-200 flex items-center gap-1 shrink-0">
          <Flame className="w-2.5 h-2.5 text-pink-300" />
          Tặng Quà Cô
        </span>
      );
    }
    if (reason === 'manual') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-purple-500/25 border border-purple-400/60 text-[10px] font-bold text-purple-200 flex items-center gap-1 shrink-0">
          <Crosshair className="w-2.5 h-2.5 text-purple-300" />
          Chỉ định
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/50 text-[10px] font-bold text-cyan-200 flex items-center gap-1 shrink-0">
        <MessageSquare className="w-2.5 h-2.5 text-cyan-300" />
        Comment
      </span>
    );
  };

  return (
    <div className="space-y-3.5">
      {/* 1. TRẠNG THÁI CAMERA & HÀNG CHỜ (GỘP CHUNG TINH GỌN) */}
      <section className="p-3 rounded-xl bg-stone-900/85 border border-amber-500/40 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold text-amber-200">
              Trạng Thái & Hàng Chờ Camera ({cameraQueue.length})
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {cameraQueue.length > 0 && (
              <button
                type="button"
                onClick={onClearCameraQueue}
                className="px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa chờ</span>
              </button>
            )}
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                activeTargetPilgrim || activeFocusRoleLabel
                  ? 'bg-emerald-950/80 border-emerald-400/50 text-emerald-300'
                  : 'bg-stone-950 border-stone-700 text-stone-300'
              }`}
            >
              {activeTargetPilgrim || activeFocusRoleLabel
                ? `ZOOM ${(config.cameraZoomScale ?? 2.25).toFixed(2)}x`
                : 'TOÀN CẢNH 1.0x'}
            </span>
          </div>
        </div>

        {/* Mục tiêu đang quay */}
        {activeTargetPilgrim ? (
          <div className="p-2 rounded-lg bg-stone-950/90 border border-emerald-500/40 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span className="text-xs font-extrabold text-amber-100 truncate">
                  {activeTargetPilgrim.username}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold shrink-0 ${
                    activeTargetPilgrim.isBot
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {activeTargetPilgrim.isBot ? 'NPC' : 'Người thật'}
                </span>
              </div>
              {getReasonBadge(cameraFocus.reason)}
            </div>

            {activeTargetPilgrim.prayer && (
              <div className="text-[11px] text-stone-300 italic bg-stone-900/80 px-2 py-1 rounded border border-stone-800 truncate">
                “{activeTargetPilgrim.prayer}”
              </div>
            )}
          </div>
        ) : activeFocusRoleLabel ? (
          <div className="p-2 rounded-lg bg-stone-950/90 border border-red-500/45 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping shrink-0" />
              <span className="text-xs font-extrabold text-amber-100 truncate">
                {activeFocusRoleLabel}
              </span>
            </div>
            {getReasonBadge(cameraFocus.reason)}
          </div>
        ) : (
          <div className="px-2.5 py-2 rounded-lg bg-stone-950/75 border border-stone-800 text-xs text-stone-400">
            Đang ở góc toàn cảnh mặc định (Đồng bộ trọng tâm X, Y với cả Sự kiện Zombie)
          </div>
        )}

        {/* Nút điều khiển nhanh */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSkipCameraTarget}
            disabled={!activeTargetPilgrim && cameraQueue.length === 0}
            className="py-1.5 px-2.5 rounded-lg bg-cyan-600/25 hover:bg-cyan-600/40 disabled:opacity-40 border border-cyan-400/50 text-xs font-bold text-cyan-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5 text-cyan-300" />
            <span>Skip ({cameraQueue.length})</span>
          </button>

          <button
            type="button"
            onClick={onResetCameraView}
            className="py-1.5 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-semibold text-stone-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Toàn cảnh</span>
          </button>
        </div>

        {/* Danh sách hàng chờ (nếu có) */}
        {cameraQueue.length > 0 && (
          <div className="max-h-36 overflow-y-auto space-y-1 pr-1 pt-1 border-t border-stone-800/80 custom-scrollbar">
            {cameraQueue.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-stone-950/90 border border-stone-800 text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-stone-400 shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="font-bold text-stone-100 truncate">
                    {item.username}
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded shrink-0 ${
                      item.isBot
                        ? 'bg-amber-950/60 text-amber-300'
                        : 'bg-emerald-950/60 text-emerald-300'
                    }`}
                  >
                    {item.isBot ? 'NPC' : 'Người'}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {getReasonBadge(item.reason)}
                  <button
                    type="button"
                    onClick={() => onFocusPilgrimNow(item.pilgrimId)}
                    className="px-1.5 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-500/40 border border-cyan-400/40 text-[10px] font-bold text-cyan-200 cursor-pointer"
                  >
                    Zoom
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCameraQueueItem(item.id)}
                    className="p-0.5 text-stone-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chọn nhanh Học sinh trong lớp */}
        <select
          defaultValue=""
          onChange={(e) => {
            const pid = Number(e.target.value);
            if (pid) {
              onFocusPilgrimNow(pid);
              e.target.value = '';
            }
          }}
          className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-400"
        >
          <option value="">
            🎯 Chọn học sinh trong lớp để khóa Camera ({activeStagePilgrims.length} em)...
          </option>
          {activeStagePilgrims.map((p) => (
            <option key={p.id} value={p.id}>
              {p.username} ({p.isBot ? 'NPC' : 'Người thật'}
              {p.isVip ? ' · Bàn Đầu VIP' : ''})
            </option>
          ))}
        </select>
      </section>

      {/* 2. CHẾ ĐỘ THEO DÕI LỜI ĐỌC & ƯU TIÊN DÂNG LỄ */}
      <section className="p-3 rounded-xl bg-stone-900/80 border border-cyan-500/35 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-cyan-200 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Theo Dõi Khớp Lời Đọc</span>
          </h3>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                cameraFollowCommentEnabled: !config.cameraFollowCommentEnabled,
              })
            }
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer shrink-0 ${
              config.cameraFollowCommentEnabled
                ? 'bg-emerald-500 text-stone-950'
                : 'bg-stone-800 text-stone-400 border border-stone-700'
            }`}
          >
            {config.cameraFollowCommentEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                cameraFollowRealUser: !config.cameraFollowRealUser,
              })
            }
            className={`p-2 rounded-lg border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              config.cameraFollowRealUser
                ? 'bg-emerald-950/60 border-emerald-400/60 text-emerald-200'
                : 'bg-stone-950/60 border-stone-800 text-stone-400'
            }`}
          >
            {config.cameraFollowRealUser ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-stone-500 shrink-0" />
            )}
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Người thật</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                cameraFollowNpc: !config.cameraFollowNpc,
              })
            }
            className={`p-2 rounded-lg border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              config.cameraFollowNpc
                ? 'bg-amber-950/60 border-amber-400/60 text-amber-200'
                : 'bg-stone-950/60 border-stone-800 text-stone-400'
            }`}
          >
            {config.cameraFollowNpc ? (
              <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-stone-500 shrink-0" />
            )}
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span>NPC</span>
          </button>
        </div>

        <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-200">
              Ưu Tiên Quay Học Sinh Tặng Quà
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                cameraPushOnGiftEnabled: !config.cameraPushOnGiftEnabled,
              })
            }
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer shrink-0 ${
              config.cameraPushOnGiftEnabled
                ? 'bg-amber-400 text-stone-950'
                : 'bg-stone-800 text-stone-400 border border-stone-700'
            }`}
          >
            {config.cameraPushOnGiftEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
          </button>
        </div>
      </section>

      {/* 3. ĐỘ ZOOM, TỐC ĐỘ LƯỚT & TRỌNG TÂM */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-amber-400" />
            <span>Zoom, Tốc Độ Lướt & Trọng Tâm</span>
          </h3>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                cameraFocusOffsetX: 0,
                cameraFocusOffsetY: -44,
              })
            }
            className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 cursor-pointer transition"
          >
            Mặc định (0, -44)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1">
            <div className="flex justify-between text-[11px] text-stone-300">
              <span>Độ Zoom</span>
              <span className="text-amber-300 font-mono font-bold">
                {(config.cameraZoomScale ?? 2.25).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={1.4}
              max={3.2}
              step={0.05}
              value={config.cameraZoomScale ?? 2.25}
              onChange={(e) =>
                onUpdateConfig({ cameraZoomScale: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1">
            <div className="flex justify-between text-[11px] text-stone-300">
              <span>Tốc độ lướt</span>
              <span className="text-cyan-300 font-mono font-bold">
                {(config.cameraSmoothSpeed ?? 4.5).toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={1.5}
              max={10.0}
              step={0.5}
              value={config.cameraSmoothSpeed ?? 4.5}
              onChange={(e) =>
                onUpdateConfig({ cameraSmoothSpeed: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Trục X */}
          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-stone-300 font-semibold">Ngang (X)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step={2}
                  value={config.cameraFocusOffsetX ?? 0}
                  onChange={(e) =>
                    onUpdateConfig({
                      cameraFocusOffsetX: Math.max(
                        -180,
                        Math.min(180, parseInt(e.target.value, 10) || 0)
                      ),
                    })
                  }
                  className="w-11 px-1 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10.5px] font-mono font-bold text-amber-300 text-right"
                />
                <span className="text-[10px] font-mono text-stone-400">px</span>
              </div>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={2}
              value={config.cameraFocusOffsetX ?? 0}
              onChange={(e) =>
                onUpdateConfig({
                  cameraFocusOffsetX: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Trục Y */}
          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-stone-300 font-semibold">Dọc (Y)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={-220}
                  max={140}
                  step={2}
                  value={config.cameraFocusOffsetY ?? -44}
                  onChange={(e) =>
                    onUpdateConfig({
                      cameraFocusOffsetY: Math.max(
                        -220,
                        Math.min(
                          140,
                          Number.isNaN(parseInt(e.target.value, 10))
                            ? -44
                            : parseInt(e.target.value, 10)
                        )
                      ),
                    })
                  }
                  className="w-11 px-1 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10.5px] font-mono font-bold text-cyan-300 text-right"
                />
                <span className="text-[10px] font-mono text-stone-400">px</span>
              </div>
            </div>
            <input
              type="range"
              min={-220}
              max={140}
              step={2}
              value={config.cameraFocusOffsetY ?? -44}
              onChange={(e) =>
                onUpdateConfig({
                  cameraFocusOffsetY: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-full accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
