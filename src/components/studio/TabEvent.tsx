import React, { useState } from 'react';
import {
  Crosshair,
  Flame,
  Heart,
  Image as ImageIcon,
  MapPin,
  Play,
  RotateCcw,
  Skull,
  Sparkles,
  Square,
  Swords,
  Trophy,
  Upload,
  Zap,
} from 'lucide-react';
import {
  CustomAssetsConfig,
  GameConfig,
  ZombieEventRuntimeState,
  ZombieProjectileKind,
} from '../../types/game';
import { soundEngine } from '../../services/soundEngine';

interface TabEventProps {
  config: GameConfig;
  customAssets: CustomAssetsConfig;
  zombieEventState?: ZombieEventRuntimeState;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onUploadAsset: (key: keyof CustomAssetsConfig, file: File) => void;
  onResetAsset: (key: keyof CustomAssetsConfig) => void;
  onTriggerZombieEvent?: (immediate?: boolean) => void;
  onStopZombieEvent?: () => void;
  onKillZombieImmediately?: () => void;
  onTestZombieAttack?: (
    kind: 'heart_seated' | 'heart_queue' | 'book' | 'chair' | 'desk_mate',
    customUsername?: string
  ) => void;
}

const PHASE_LABEL_MAP: Record<string, string> = {
  idle: 'Đang nghỉ (Chưa kích hoạt)',
  z_flow_1_intro: 'Luồng 1: Giới thiệu sự kiện trên bảng',
  z_flow_2_spawn: 'Luồng 2: Triệu hồi Zombie & Gầm gừ -> Đi vào lớp',
  z_flow_3_teacher: 'Luồng 3: Cô Thảo kêu cứu + khóa camera',
  z_flow_4_supervisor: 'Luồng 4: Thầy Tùng hô hào thả tim đẩy lùi Zombie',
  z_flow_5_combat: 'Luồng 5: Chiến đấu đẩy lùi Zombie!',
  z_flow_5b_dying: 'Pha Hạ Gục: Zombie ngã ngang & tan biến',
  z_flow_6_celebration: 'Luồng 6: Tổng kết Top 1-2-3 & Thưởng Matcha Latte',
};

export const TabEvent: React.FC<TabEventProps> = ({
  config,
  customAssets,
  zombieEventState,
  onUpdateConfig,
  onUploadAsset,
  onResetAsset,
  onTriggerZombieEvent,
  onStopZombieEvent,
  onKillZombieImmediately,
  onTestZombieAttack,
}) => {
  const [testAttackerName, setTestAttackerName] = useState('');

  const phase = zombieEventState?.phase || 'idle';
  const isQueued = Boolean(zombieEventState?.isQueued);
  const isActive = phase !== 'idle';
  const hp = zombieEventState?.hp ?? (config.zombieMaxHp || 10000);
  const maxHp = zombieEventState?.maxHp ?? (config.zombieMaxHp || 10000);
  const level = zombieEventState?.level ?? (config.zombieLevel || 1);
  const leaderboard = zombieEventState?.topDamagers || [];

  const spawnPos = config.zombieSpawnPos || { x: 42, y: 520 };
  const standPos = config.zombieStandPos || { x: 270, y: 486 };
  const teacherPos = config.zombieTeacherPos || { x: 392, y: 444 };
  const supervisorPos = config.zombieSupervisorPos || { x: 148, y: 498 };

  const customAssetItems: Array<{
    key: keyof CustomAssetsConfig;
    title: string;
    subtitle: string;
  }> = [
    {
      key: 'zombieSpriteUrl',
      title: '🧟 Nhân Vật Zombie',
      subtitle: 'Sprite / PNG Zombie tiến vào lớp học',
    },
    {
      key: 'projPencilCaseUrl',
      title: '✏️ Đạn 1: Hộp Bút (Thả Tim)',
      subtitle: '1 Tim = 1 điểm (gom nhịp bắn)',
    },
    {
      key: 'projBookUrl',
      title: '📕 Đạn 2: Quyển Sách (Quà 1 xu / Hoa)',
      subtitle: '1 xu = 50 điểm (bắn ngay)',
    },
    {
      key: 'projChairUrl',
      title: '🪑 Đạn 3: Ghế Ngồi (Quà 5 xu)',
      subtitle: '5 xu = 250 điểm (bắn ngay)',
    },
    {
      key: 'projDeskMateUrl',
      title: '😱 Đạn 4: Đứa Bàn Bên :) (Quà 10+ xu)',
      subtitle: '10 xu = 500 điểm (Meme ném bạn học)',
    },
    {
      key: 'milkTeaCupUrl',
      title: '🍵 Ly Trà Sữa Matcha Latte',
      subtitle: 'Bay từ Cô Giáo khao cả lớp & hàng chờ ở Luồng 6',
    },
  ];

  return (
    <div className="space-y-3.5">
      {/* 1. BẢNG KÍCH HOẠT SỰ KIỆN "ZOMBIE TẤN CÔNG" */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-red-500/50 space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Skull className="w-4 h-4 text-red-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-extrabold text-red-300 truncate">
                Sự Kiện 1: Zombie Tấn Công (Đẩy Lùi Zombie)
              </h2>
              <p className="text-[10px] text-stone-400 truncate">
                Tự động chèn vào luồng thời gian khi kết thúc câu hỏi hiện tại
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  zombieEventEnabled: config.zombieEventEnabled === false,
                })
              }
              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold border transition cursor-pointer flex items-center gap-1 shadow ${
                config.zombieEventEnabled !== false
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 hover:bg-emerald-500/35'
                  : 'bg-rose-950/90 border-rose-500/60 text-rose-300 hover:bg-rose-900'
              }`}
              title="Bật hoặc tắt hoàn toàn Sự kiện Zombie"
            >
              <span>
                {config.zombieEventEnabled !== false
                  ? '🟢 BẬT EVENT'
                  : '🔴 ĐÃ TẮT EVENT'}
              </span>
            </button>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono shrink-0 border ${
                config.zombieEventEnabled === false
                  ? 'bg-stone-900 border-stone-700 text-stone-500'
                  : isActive
                  ? 'bg-red-500/25 border-red-400 text-red-200 animate-pulse'
                  : isQueued
                  ? 'bg-amber-500/25 border-amber-400 text-amber-200 animate-pulse'
                  : 'bg-stone-800 border-stone-700 text-stone-400'
              }`}
            >
              {config.zombieEventEnabled === false
                ? 'ĐANG TẮT'
                : isActive
                ? 'ĐANG DIỄN RA'
                : isQueued
                ? 'CHỜ HẾT VÒNG CÂU HỎI'
                : 'SẴN SÀNG'}
            </span>
          </div>
        </div>

        {/* Trạng thái Luồng hiện tại */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-stone-800 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-stone-400 font-semibold">Luồng sự kiện:</span>
            <span className="font-bold text-amber-300 text-right">
              {config.zombieEventEnabled === false
                ? '⏸️ Sự kiện Zombie đang tắt'
                : isQueued && !isActive
                ? '⏳ Đã xếp hàng: Chờ xong vòng câu hỏi sẽ tạm dừng tiết & chạy Event'
                : PHASE_LABEL_MAP[phase] || phase}
            </span>
          </div>

          {/* Thanh máu Zombie trực quan trong Dev */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10.5px] font-mono">
              <span className="text-red-300 font-bold">
                HP của Zombie (Cấp {level}):
              </span>
              <span className="text-white font-extrabold">
                {Math.max(0, Math.round(hp)).toLocaleString('vi-VN')} /{' '}
                {Math.max(1, Math.round(maxHp)).toLocaleString('vi-VN')} HP
              </span>
            </div>
            <div className="w-full h-3.5 rounded-md bg-stone-900 border border-red-500/50 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-red-700 via-red-500 to-rose-400 transition-all duration-150"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (hp / Math.max(1, maxHp)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Cụm nút [Kích hoạt] / Chạy Ngay / Giết Zombie Ngay / Dừng */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onTriggerZombieEvent?.(false)}
              disabled={config.zombieEventEnabled === false}
              className="px-2.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow cursor-pointer transition"
              title="Nếu đang trong vòng câu hỏi sẽ đợi kết thúc vòng câu hỏi rồi tạm dừng tiết học và bắt đầu Event"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>[Kích hoạt]</span>
            </button>

            <button
              type="button"
              onClick={() => onTriggerZombieEvent?.(true)}
              disabled={config.zombieEventEnabled === false}
              className="px-2.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow cursor-pointer transition"
              title="Tạm dừng tiết học ngay lập tức và vào Luồng 1 Sự Kiện Zombie"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Chạy Ngay</span>
            </button>

            <button
              type="button"
              onClick={() => onKillZombieImmediately?.()}
              disabled={
                !isActive ||
                phase === 'z_flow_5b_dying' ||
                phase === 'z_flow_6_celebration'
              }
              className="px-2.5 py-2 rounded-lg bg-rose-950/90 hover:bg-rose-800 disabled:opacity-40 border border-rose-400/70 text-rose-100 text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow cursor-pointer transition"
              title="Hạ gục Zombie ngay lập tức (HP về 0, chuyển sang pha ngã ngang & trao thưởng Luồng 6)"
            >
              <Skull className="w-3.5 h-3.5 text-rose-300" />
              <span>Giết Zombie Ngay Lập Tức</span>
            </button>

            <button
              type="button"
              onClick={() => onStopZombieEvent?.()}
              disabled={!isActive && !isQueued}
              className="px-2.5 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 border border-stone-700 text-stone-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Dừng / Tiếp tục tiết</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. THÔNG SỐ CẤP & HP ĐỘC LẬP + SET VỊ TRÍ ZOMBIE, CÔ THẢO VÀ THẦY TÙNG KHI EVENT KÍCH HOẠT */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-4 h-4 text-lime-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-lime-300 truncate">
                Set Cấp, HP Zombie (Độc Lập) & Vị Trí Zombie, Cô Thảo, Thầy Tùng
              </h3>
              <p className="text-[10px] text-stone-400 truncate">
                2 chỉ số Cấp và HP set hoàn toàn độc lập do Dev chỉnh
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ showWaypoints: !config.showWaypoints })
            }
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-extrabold border flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
              config.showWaypoints
                ? 'bg-amber-400 text-stone-950 border-amber-200 shadow'
                : 'bg-stone-950 hover:bg-stone-800 text-amber-300 border-amber-500/50'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>
              {config.showWaypoints
                ? 'Đang bật kéo vị trí trên sân'
                : 'Set vị trí trên sân'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-stone-950 border border-red-500/35 space-y-1">
            <label className="text-[10px] text-red-300 font-bold block">
              HP của Zombie (Độc lập)
            </label>
            <input
              type="number"
              min={100}
              max={10000000}
              step={500}
              value={config.zombieMaxHp ?? 10000}
              onChange={(e) =>
                onUpdateConfig({
                  zombieMaxHp: Math.max(
                    100,
                    parseInt(e.target.value, 10) || 10000
                  ),
                })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-xs font-mono font-bold text-red-300"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950 border border-amber-500/35 space-y-1">
            <label className="text-[10px] text-amber-300 font-bold block">
              Cấp Zombie (Độc lập)
            </label>
            <input
              type="number"
              min={1}
              max={9999}
              step={1}
              value={config.zombieLevel ?? 1}
              onChange={(e) =>
                onUpdateConfig({
                  zombieLevel: Math.max(1, parseInt(e.target.value, 10) || 1),
                })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-700 text-xs font-mono font-bold text-amber-300"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950 border border-stone-800 space-y-1">
            <label className="text-[10px] text-stone-400 block">
              Kích cỡ Zombie ({(config.zombieScale ?? 1.15).toFixed(2)}x)
            </label>
            <input
              type="range"
              min={0.7}
              max={2.2}
              step={0.05}
              value={config.zombieScale ?? 1.15}
              onChange={(e) =>
                onUpdateConfig({
                  zombieScale: parseFloat(e.target.value) || 1.15,
                })
              }
              className="w-full accent-lime-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer mt-2"
            />
          </div>
        </div>

        {/* Vị trí Zombie (Triệu hồi & Đứng chiến đấu) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-stone-950/90 border border-lime-500/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-lime-300">
                🧟 Vị trí Triệu Hồi Zombie
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ zombieSpawnPos: { x: 42, y: 520 } })
                }
                className="text-[9.5px] text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                Mặc định
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">X:</span>
                <input
                  type="number"
                  min={0}
                  max={540}
                  value={spawnPos.x}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieSpawnPos: {
                        ...spawnPos,
                        x: Math.max(
                          0,
                          Math.min(540, parseInt(e.target.value, 10) || 0)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-lime-200"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">Y:</span>
                <input
                  type="number"
                  min={100}
                  max={950}
                  value={spawnPos.y}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieSpawnPos: {
                        ...spawnPos,
                        y: Math.max(
                          100,
                          Math.min(950, parseInt(e.target.value, 10) || 520)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-lime-200"
                />
              </div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-stone-950/90 border border-red-500/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-red-300">
                🎯 Vị trí Zombie Đứng
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ zombieStandPos: { x: 270, y: 486 } })
                }
                className="text-[9.5px] text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                Mặc định
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">X:</span>
                <input
                  type="number"
                  min={20}
                  max={520}
                  value={standPos.x}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieStandPos: {
                        ...standPos,
                        x: Math.max(
                          20,
                          Math.min(520, parseInt(e.target.value, 10) || 270)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-red-200"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">Y:</span>
                <input
                  type="number"
                  min={140}
                  max={920}
                  value={standPos.y}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieStandPos: {
                        ...standPos,
                        y: Math.max(
                          140,
                          Math.min(920, parseInt(e.target.value, 10) || 486)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-red-200"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Vị trí Cô Thảo và Thầy Tùng khi Event kích hoạt */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-stone-950/90 border border-pink-500/35 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-pink-300">
                👩‍🏫 Vị trí Cô Thảo (Khi Event)
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ zombieTeacherPos: { x: 392, y: 444 } })
                }
                className="text-[9.5px] text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                Mặc định
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">X:</span>
                <input
                  type="number"
                  min={20}
                  max={520}
                  value={teacherPos.x}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieTeacherPos: {
                        ...teacherPos,
                        x: Math.max(
                          20,
                          Math.min(520, parseInt(e.target.value, 10) || 392)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-pink-200"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">Y:</span>
                <input
                  type="number"
                  min={140}
                  max={920}
                  value={teacherPos.y}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieTeacherPos: {
                        ...teacherPos,
                        y: Math.max(
                          140,
                          Math.min(920, parseInt(e.target.value, 10) || 444)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-pink-200"
                />
              </div>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-stone-950/90 border border-sky-500/35 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold text-sky-300">
                👨‍🏫 Vị trí Thầy Tùng (Khi Event)
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({ zombieSupervisorPos: { x: 148, y: 498 } })
                }
                className="text-[9.5px] text-stone-400 hover:text-stone-200 cursor-pointer"
              >
                Mặc định
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">X:</span>
                <input
                  type="number"
                  min={20}
                  max={520}
                  value={supervisorPos.x}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieSupervisorPos: {
                        ...supervisorPos,
                        x: Math.max(
                          20,
                          Math.min(520, parseInt(e.target.value, 10) || 148)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-sky-200"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono text-stone-400">Y:</span>
                <input
                  type="number"
                  min={140}
                  max={920}
                  value={supervisorPos.y}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieSupervisorPos: {
                        ...supervisorPos,
                        y: Math.max(
                          140,
                          Math.min(920, parseInt(e.target.value, 10) || 498)
                        ),
                      },
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-sky-200"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Nhịp gom tim & NPC hỗ trợ bắn */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-stone-300 font-semibold">
              Chu kỳ gom Tim bắn:
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={300}
                max={5000}
                step={100}
                value={config.zombieHeartBatchIntervalMs ?? 1200}
                onChange={(e) =>
                  onUpdateConfig({
                    zombieHeartBatchIntervalMs: Math.max(
                      300,
                      parseInt(e.target.value, 10) || 1200
                    ),
                  })
                }
                className="w-16 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[11px] font-mono text-amber-300 text-right"
              />
              <span className="text-[10px] text-stone-400">ms</span>
            </div>
          </div>

          <label className="p-2 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-[10.5px] text-stone-300 font-semibold">
              NPC phụ ném hộp bút:
            </span>
            <input
              type="checkbox"
              checked={config.zombieNpcAutoAttack !== false}
              onChange={(e) =>
                onUpdateConfig({ zombieNpcAutoAttack: e.target.checked })
              }
              className="accent-emerald-400 w-4 h-4 rounded cursor-pointer"
            />
          </label>
        </div>
      </section>

      {/* 2B. THẺ CẤU HÌNH SỰ KIỆN ZOMBIE: ĐIỀU CHỈNH FORMAT LỜI THOẠI & THỜI GIAN CÁC LUỒNG (1 -> 6) */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-purple-500/40 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-purple-200 truncate">
                Cấu Hình Sự Kiện Zombie (Format Lời Thoại & Thời Gian Luồng 1 → 6)
              </h3>
              <p className="text-[10px] text-stone-400 truncate">
                Hỗ trợ biến tự động: <code className="text-amber-300">[Cấp]</code>,{' '}
                <code className="text-amber-300">[Top1]</code>,{' '}
                <code className="text-amber-300">[Top2]</code>,{' '}
                <code className="text-amber-300">[Top3]</code>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                zombieFlow1Title: 'Sự kiện đẩy lùi Zombie',
                zombieFlow1Subtitle:
                  'Zombie tiến vào lớp học, hãy bảo vệ cô giáo và đẩy lùi zombie để tiếp tục tiết học',
                zombieFlow1MinDurationSec: 2.4,
                zombieFlow2LockCameraSec: 3.0,
                zombieFlow2MaxDurationSec: 6.5,
                zombieFlow3TeacherDialog: 'Ối giời ơi ! Chu mi a !',
                zombieFlow3MinDurationSec: 2.0,
                zombieFlow4SupervisorDialog:
                  'Các em hãy thả tim liên tục để đẩy lùi zombie !',
                zombieFlow4MinDurationSec: 2.2,
                zombieFlow5bDyingDurationSec: 3.2,
                zombieFlow6BoardTitle:
                  'Chúc mừng cả lớp đã đẩy lùi zombie Cấp [Cấp]:',
                zombieFlow6Speech1Template:
                  'Chúc mừng các em đã đánh bại zombie cấp [Cấp] và cứu cô giáo, sau đây là bảng xếp hạng điểm số',
                zombieFlow6Speech2Template:
                  'Cô trọng thưởng cho ba bạn top 1: [Top1] 100 hoa điểm 10, top 2: [Top2] 75 hoa điểm 10 và top 3: [Top3] 50 hoa điểm 10, các bạn còn lại 25 hoa điểm 10. Cùng tất cả các bạn một ly trà sữa mát cha lát te phun tóp pinh, chúng ta tiếp tục học thôi nào',
                zombieFlow6MinDurationSec: 4.5,
              })
            }
            className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-stone-300 flex items-center gap-1 shrink-0 cursor-pointer"
            title="Khôi phục mặc định lời thoại & thời gian các luồng"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Mặc định</span>
          </button>
        </div>

        {/* LUỒNG 1: Cảnh báo trên bảng */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-red-500/30 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-red-300">
              Luồng 1: Hiện cảnh báo trên bảng & Cô Thảo đọc tiêu đề + nội dung
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-stone-400">T.gian tối thiểu:</span>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.2}
                value={config.zombieFlow1MinDurationSec ?? 2.4}
                onChange={(e) =>
                  onUpdateConfig({
                    zombieFlow1MinDurationSec: Math.max(
                      0.5,
                      parseFloat(e.target.value) || 2.4
                    ),
                  })
                }
                className="w-14 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10.5px] font-mono text-amber-300 text-right"
              />
              <span className="text-[10px] text-stone-400">s</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-stone-400 block">
              Chữ to tiêu đề trên bảng (Cô Thảo đọc mở đầu Luồng 1):
            </label>
            <input
              type="text"
              value={config.zombieFlow1Title ?? 'Sự kiện đẩy lùi Zombie'}
              onChange={(e) =>
                onUpdateConfig({ zombieFlow1Title: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-red-200 font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-stone-400 block">
              Chữ nhỏ trên bảng + Lời đọc tiếp theo của Cô Thảo:
            </label>
            <textarea
              rows={2}
              value={
                config.zombieFlow1Subtitle ??
                'Zombie tiến vào lớp học, hãy bảo vệ cô giáo và đẩy lùi zombie để tiếp tục tiết học'
              }
              onChange={(e) =>
                onUpdateConfig({ zombieFlow1Subtitle: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-stone-200 resize-none"
            />
          </div>
        </div>

        {/* LUỒNG 2: Triệu hồi Zombie, khóa camera & đi vào vị trí */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-lime-500/30 space-y-1.5">
          <div className="text-[11px] font-extrabold text-lime-300">
            Luồng 2: Triệu hồi Zombie gầm gừ ngoài cửa & đi vào vị trí đứng
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-1 bg-stone-900/90 px-2 py-1 rounded border border-stone-800">
              <span className="text-[10px] text-stone-300">
                Khóa Cam gầm gừ:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.5}
                  max={15}
                  step={0.5}
                  value={config.zombieFlow2LockCameraSec ?? 3.0}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieFlow2LockCameraSec: Math.max(
                        0.5,
                        parseFloat(e.target.value) || 3.0
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-[10.5px] font-mono text-lime-300 text-right"
                />
                <span className="text-[10px] text-stone-400">s</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1 bg-stone-900/90 px-2 py-1 rounded border border-stone-800">
              <span className="text-[10px] text-stone-300">
                Tổng T.gian Luồng 2:
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={2.0}
                  max={25}
                  step={0.5}
                  value={config.zombieFlow2MaxDurationSec ?? 6.5}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieFlow2MaxDurationSec: Math.max(
                        2.0,
                        parseFloat(e.target.value) || 6.5
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-[10.5px] font-mono text-lime-300 text-right"
                />
                <span className="text-[10px] text-stone-400">s</span>
              </div>
            </div>
          </div>
        </div>

        {/* LUỒNG 3 & LUỒNG 4: Lời thoại + Chatbox Cô Thảo & Thầy Tùng */}
        <div className="grid grid-cols-1 gap-2">
          <div className="p-2.5 rounded-lg bg-stone-950/90 border border-pink-500/30 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-pink-300">
                Luồng 3: Lời thoại + Chatbox Cô Thảo (Zoom Cam)
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-stone-400">T.gian tối thiểu:</span>
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.2}
                  value={config.zombieFlow3MinDurationSec ?? 2.0}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieFlow3MinDurationSec: Math.max(
                        0.5,
                        parseFloat(e.target.value) || 2.0
                      ),
                    })
                  }
                  className="w-14 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10.5px] font-mono text-pink-300 text-right"
                />
                <span className="text-[10px] text-stone-400">s</span>
              </div>
            </div>
            <input
              type="text"
              value={
                config.zombieFlow3TeacherDialog ?? 'Ối giời ơi ! Chu mi a !'
              }
              onChange={(e) =>
                onUpdateConfig({ zombieFlow3TeacherDialog: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-pink-100"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-stone-950/90 border border-sky-500/30 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-sky-300">
                Luồng 4: Lời thoại + Chatbox Thầy Tùng (Giọng Nam)
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-stone-400">T.gian tối thiểu:</span>
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.2}
                  value={config.zombieFlow4MinDurationSec ?? 2.2}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieFlow4MinDurationSec: Math.max(
                        0.5,
                        parseFloat(e.target.value) || 2.2
                      ),
                    })
                  }
                  className="w-14 px-1.5 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10.5px] font-mono text-sky-300 text-right"
                />
                <span className="text-[10px] text-stone-400">s</span>
              </div>
            </div>
            <input
              type="text"
              value={
                config.zombieFlow4SupervisorDialog ??
                'Các em hãy thả tim liên tục để đẩy lùi zombie !'
              }
              onChange={(e) =>
                onUpdateConfig({ zombieFlow4SupervisorDialog: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-sky-100"
            />
          </div>
        </div>

        {/* PHA HẠ GỤC (5B) & LUỒNG 6: Tổng kết Top 1-2-3 & Thưởng Trà Sữa */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-amber-500/35 space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-1.5">
            <span className="text-[11px] font-extrabold text-amber-300">
              Pha Hạ Gục & Luồng 6: Vinh Danh Top 1-2-3 + Trà Sữa
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[9.5px] text-stone-400">Ngã ngang:</span>
                <input
                  type="number"
                  min={1.0}
                  max={15}
                  step={0.2}
                  value={config.zombieFlow5bDyingDurationSec ?? 3.2}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieFlow5bDyingDurationSec: Math.max(
                        1.0,
                        parseFloat(e.target.value) || 3.2
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10px] font-mono text-rose-300 text-right"
                />
                <span className="text-[9.5px] text-stone-400">s</span>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[9.5px] text-stone-400">Giữ bảng L6:</span>
                <input
                  type="number"
                  min={1.0}
                  max={30}
                  step={0.5}
                  value={config.zombieFlow6MinDurationSec ?? 4.5}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieFlow6MinDurationSec: Math.max(
                        1.0,
                        parseFloat(e.target.value) || 4.5
                      ),
                    })
                  }
                  className="w-12 px-1 py-0.5 rounded bg-stone-900 border border-stone-700 text-[10px] font-mono text-amber-300 text-right"
                />
                <span className="text-[9.5px] text-stone-400">s</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-stone-400 block">
              Tiêu đề bảng tổng kết Luồng 6 (<code className="text-amber-300">[Cấp]</code>):
            </label>
            <input
              type="text"
              value={
                config.zombieFlow6BoardTitle ??
                'Chúc mừng cả lớp đã đẩy lùi zombie Cấp [Cấp]:'
              }
              onChange={(e) =>
                onUpdateConfig({ zombieFlow6BoardTitle: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-emerald-200 font-bold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-stone-400 block">
              Lời thoại 1 Cô Thảo chúc mừng (<code className="text-amber-300">[Cấp]</code>):
            </label>
            <textarea
              rows={2}
              value={
                config.zombieFlow6Speech1Template ??
                'Chúc mừng các em đã đánh bại zombie cấp [Cấp] và cứu cô giáo, sau đây là bảng xếp hạng điểm số'
              }
              onChange={(e) =>
                onUpdateConfig({ zombieFlow6Speech1Template: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-stone-200 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-stone-400 block">
              Lời thoại 2 Cô Thảo trao thưởng (<code className="text-amber-300">[Top1]</code>,{' '}
              <code className="text-amber-300">[Top2]</code>,{' '}
              <code className="text-amber-300">[Top3]</code>):
            </label>
            <textarea
              rows={3}
              value={
                config.zombieFlow6Speech2Template ??
                'Cô trọng thưởng cho ba bạn top 1: [Top1] 100 hoa điểm 10, top 2: [Top2] 75 hoa điểm 10 và top 3: [Top3] 50 hoa điểm 10, các bạn còn lại 25 hoa điểm 10. Cùng tất cả các bạn một ly trà sữa mát cha lát te phun tóp pinh, chúng ta tiếp tục học thôi nào'
              }
              onChange={(e) =>
                onUpdateConfig({ zombieFlow6Speech2Template: e.target.value })
              }
              className="w-full px-2 py-1 rounded bg-stone-900 border border-stone-800 text-[11px] text-stone-200 resize-none"
            />
          </div>
        </div>
      </section>

      {/* 3. TEST ĐẤU TRƯỜNG LUỒNG 5 (BẮN THỬ 4 LOẠI ĐẠN & HÀNG CHỜ) */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-amber-500/40 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-1.5">
            <Swords className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-extrabold text-amber-200">
              Giả Lập Tấn Công Zombie (Test 4 Model Đạn & Bảng Điểm Số)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-amber-300">
            1 xu = 100 sát thương
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={testAttackerName}
            onChange={(e) => setTestAttackerName(e.target.value)}
            placeholder="Tên người chơi test (để trống = chọn ngẫu nhiên)..."
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-200 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() =>
              onTestZombieAttack?.(
                'heart_seated',
                testAttackerName.trim() || undefined
              )
            }
            className="p-2 rounded-lg bg-pink-950/50 hover:bg-pink-900/60 border border-pink-400/50 text-left transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-pink-200">
              <span>❤️ Trong lớp Thả Tim</span>
              <span className="font-mono text-emerald-300">+15đ</span>
            </div>
            <div className="text-[9.5px] text-stone-400">
              Từ vị trí ngồi ném Hộp Bút
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onTestZombieAttack?.(
                'heart_queue',
                testAttackerName.trim() || undefined
              )
            }
            className="p-2 rounded-lg bg-sky-950/50 hover:bg-sky-900/60 border border-sky-400/50 text-left transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-sky-200">
              <span>🚪 Hàng chờ Thả Tim</span>
              <span className="font-mono text-emerald-300">+25đ</span>
            </div>
            <div className="text-[9.5px] text-stone-400">
              1 đại diện cửa lớp ném Hộp Bút
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onTestZombieAttack?.(
                'book',
                testAttackerName.trim() || undefined
              )
            }
            className="p-2 rounded-lg bg-amber-950/50 hover:bg-amber-900/60 border border-amber-400/50 text-left transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-200">
              <span>🌹 Tặng Hoa (1 xu)</span>
              <span className="font-mono text-emerald-300">+100đ</span>
            </div>
            <div className="text-[9.5px] text-stone-400">
              Ném Quyển Sách / Icon Quà
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onTestZombieAttack?.(
                'chair',
                testAttackerName.trim() || undefined
              )
            }
            className="p-2 rounded-lg bg-orange-950/50 hover:bg-orange-900/60 border border-orange-400/50 text-left transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-bold text-orange-200">
              <span>🪑 Quà 5 Coin</span>
              <span className="font-mono text-emerald-300">+500đ</span>
            </div>
            <div className="text-[9.5px] text-stone-400">
              Ném Ghế Ngồi / Icon Quà
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onTestZombieAttack?.(
                'desk_mate',
                testAttackerName.trim() || undefined
              )
            }
            className="col-span-2 p-2 rounded-lg bg-purple-950/60 hover:bg-purple-900/70 border border-purple-400/60 flex items-center justify-between transition cursor-pointer"
          >
            <div>
              <div className="text-[11px] font-extrabold text-purple-200">
                😱 Quà 10 Coin: Ném Đứa Bàn Bên :) (Meme)
              </div>
              <div className="text-[9.5px] text-stone-300">
                10 coin = 1000 sát thương • Gắn thẻ tên xoay & Khóa Camera
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-purple-500/30 border border-purple-300/50 font-mono text-xs font-black text-yellow-300">
              -1000 HP
            </span>
          </button>
        </div>

        {/* Bảng Xếp Hạng Điểm Số hiện tại trong sự kiện */}
        {leaderboard.length > 0 && (
          <div className="p-2 rounded-lg bg-stone-950 border border-stone-800 space-y-1">
            <div className="flex items-center justify-between text-[10.5px] font-bold text-amber-300">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <span>Top Điểm Số Đẩy Lùi Zombie ({leaderboard.length})</span>
              </span>
              <span className="text-[9.5px] text-stone-400">
                Top 1: +120 • Top 2: +100 • Top 3: +80 • Còn lại: +25
              </span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              {leaderboard.slice(0, 10).map((item, idx) => (
                <div
                  key={item.username}
                  className="flex items-center justify-between text-[10.5px] px-2 py-0.5 rounded bg-stone-900/90 border border-stone-800"
                >
                  <span className="truncate font-semibold text-stone-200">
                    <strong className="text-amber-400 mr-1.5">
                      #{idx + 1}
                    </strong>
                    {item.username}
                  </span>
                  <span className="font-mono font-bold text-emerald-300">
                    {item.damage.toLocaleString('vi-VN')} điểm
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. ÂM THANH ZOMBIE GẦM GỪ & UPLOAD HÌNH ẢNH NHÂN VẬT / 4 MODEL ĐẠN / LY MATCHA LATTE */}
      <section className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-extrabold text-cyan-200">
              Tùy Chỉnh Hình Ảnh Zombie, 4 Model Đạn & Âm Thanh Gầm Gừ
            </h3>
          </div>
        </div>

        {/* Upload file âm thanh Zombie ngay trong tab Event (đồng bộ với tab Âm thanh) */}
        <div className="p-2 rounded-lg bg-stone-950 border border-lime-500/40 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-lime-300">
              🔊 Âm thanh Zombie gầm gừ (Luồng 2 - 3s)
            </div>
            <div className="text-[10px] text-stone-400 truncate">
              Đang dùng: {config.zombieGrowlMp3Title || 'Mặc định (Synth Gầm Gừ)'}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => soundEngine.playZombieGrowlSfx(config, true)}
              className="px-2 py-1 rounded bg-lime-600/30 hover:bg-lime-500/40 border border-lime-400/50 text-[10px] font-bold text-lime-200 cursor-pointer"
            >
              Nghe thử
            </button>
            <label className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer">
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
                          zombieGrowlMp3Url: reader.result,
                          zombieGrowlMp3Title: f.name,
                        });
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

        {/* Danh sách thay hình ảnh Zombie + 4 Model Đạn + Trà sữa Matcha Latte */}
        <div className="space-y-1.5">
          {customAssetItems.map((item) => {
            const currentUrl = customAssets[item.key];
            return (
              <div
                key={item.key}
                className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {currentUrl ? (
                    <img
                      src={currentUrl}
                      alt={item.title}
                      className="w-8 h-8 rounded bg-stone-900 border border-stone-700 object-contain shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-stone-900 border border-stone-800 flex items-center justify-center text-[10px] text-stone-500 shrink-0">
                      SVG
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-stone-200 truncate">
                      {item.title}
                    </div>
                    <div className="text-[9.5px] text-stone-400 truncate">
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <label className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-cyan-300 flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>Thay hình</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadAsset(item.key, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {currentUrl && (
                    <button
                      type="button"
                      onClick={() => onResetAsset(item.key)}
                      title="Khôi phục mặc định"
                      className="p-1 rounded bg-stone-800 hover:bg-rose-950 text-stone-300 hover:text-rose-300 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
