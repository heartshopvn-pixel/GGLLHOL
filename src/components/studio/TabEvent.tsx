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
  ZombieProjectileScalesConfig,
} from '../../types/game';
import { DEFAULT_ZOMBIE_PROJECTILE_SCALES } from '../../config/constants';
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
    kind:
      | 'heart_seated'
      | 'heart_queue'
      | 'book'
      | 'chair'
      | 'desk_mate'
      | 'desk_mate_10plus',
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

  const projScales: ZombieProjectileScalesConfig = {
    ...DEFAULT_ZOMBIE_PROJECTILE_SCALES,
    ...(config.zombieProjectileScales || {}),
  };

  const handleUpdateProjectileScale = (
    key: keyof ZombieProjectileScalesConfig,
    rawVal: number
  ) => {
    const safeVal = Math.max(
      0.25,
      Math.min(3.0, Math.round((rawVal || 1) * 100) / 100)
    );
    onUpdateConfig({
      zombieProjectileScales: {
        ...projScales,
        [key]: safeVal,
      },
    });
  };

  const projectileScaleItems: Array<{
    key: keyof ZombieProjectileScalesConfig;
    label: string;
    sub: string;
    accentClass: string;
    textClass: string;
    borderClass: string;
  }> = [
    {
      key: 'pencilCase',
      label: '✏️ Hộp Bút',
      sub: 'Đạn Tim (1/3)',
      accentClass: 'accent-amber-400',
      textClass: 'text-amber-300',
      borderClass: 'border-amber-500/35',
    },
    {
      key: 'blueRuler',
      label: '📐 Thước Ê-ke Xanh',
      sub: 'Đạn Tim (2/3)',
      accentClass: 'accent-sky-400',
      textClass: 'text-sky-300',
      borderClass: 'border-sky-500/35',
    },
    {
      key: 'casio',
      label: '🧮 Máy Tính Casio',
      sub: 'Đạn Tim (3/3)',
      accentClass: 'accent-cyan-400',
      textClass: 'text-cyan-300',
      borderClass: 'border-cyan-500/35',
    },
    {
      key: 'book',
      label: '📕 Quyển Sách / Hoa',
      sub: 'Quà 1 xu',
      accentClass: 'accent-emerald-400',
      textClass: 'text-emerald-300',
      borderClass: 'border-emerald-500/35',
    },
    {
      key: 'chair',
      label: '🪑 Cái Ghế Gỗ',
      sub: 'Quà 5 xu',
      accentClass: 'accent-orange-400',
      textClass: 'text-orange-300',
      borderClass: 'border-orange-500/40',
    },
    {
      key: 'deskMate',
      label: '😱 Đứa Bàn Bên',
      sub: 'Quà 10 & 10+ xu',
      accentClass: 'accent-purple-400',
      textClass: 'text-purple-300',
      borderClass: 'border-purple-500/40',
    },
  ];

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
      title: '✏️ Đạn Tim 1: Hộp Bút',
      subtitle: 'Random 1 trong 3 khi Thả Tim',
    },
    {
      key: 'projBlueRulerUrl',
      title: '📐 Đạn Tim 2: Thước Ê-ke Xanh Dương',
      subtitle: 'Random 1 trong 3 khi Thả Tim',
    },
    {
      key: 'projCasioUrl',
      title: '🧮 Đạn Tim 3: Máy Tính Casio',
      subtitle: 'Random 1 trong 3 khi Thả Tim',
    },
    {
      key: 'projBookUrl',
      title: '📕 Đạn Quà 1 xu: Quyển Sách / Hoa',
      subtitle: '1 xu = 50 điểm (bắn ngay)',
    },
    {
      key: 'projChairUrl',
      title: '🪑 Đạn Quà 5 xu: Cái Ghế Ngồi',
      subtitle: '5 xu = 250 điểm (bắn ngay + khóa Cam)',
    },
    {
      key: 'projDeskMateUrl',
      title: '😱 Đạn Quà 10+ xu: Đứa Bàn Bên :)',
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

            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  zombieNpcAutoAttack: config.zombieNpcAutoAttack === false,
                })
              }
              className={`col-span-2 px-3 py-2 rounded-lg text-[11px] font-extrabold border flex items-center justify-between gap-2 cursor-pointer transition shadow ${
                config.zombieNpcAutoAttack !== false
                  ? 'bg-emerald-950/90 hover:bg-emerald-900/90 border-emerald-400 text-emerald-200'
                  : 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
              }`}
              title="Cho phép các NPC trong lớp và hàng chờ tự động giả lập thả tim ném Hộp Bút xen kẽ nối đuôi nhau vào Zombie (Không tính điểm vào Bảng Chiến Công)"
            >
              <span className="flex items-center gap-1.5">
                <Heart
                  className={`w-3.5 h-3.5 ${
                    config.zombieNpcAutoAttack !== false
                      ? 'text-pink-400 fill-pink-400 animate-pulse'
                      : 'text-stone-400'
                  }`}
                />
                <span>
                  {config.zombieNpcAutoAttack !== false
                    ? '🤖 ĐANG BẬT TỰ ĐỘNG ĐÁNH: NPC Tự Giả Lập Thả Tim (Xen Kẽ Lớp ↔ Chờ)'
                    : '🤖 ĐANG TẮT TỰ ĐỘNG ĐÁNH: Bấm để NPC tự giả lập thả tim'}
                </span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-black ${
                  config.zombieNpcAutoAttack !== false
                    ? 'bg-emerald-400 text-stone-950'
                    : 'bg-stone-800 text-stone-400'
                }`}
              >
                {config.zombieNpcAutoAttack !== false ? 'AUTO ON' : 'OFF'}
              </span>
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

        {/* Điều chỉnh Tốc Độ Đạn Bay (Thời gian đạn bay từ bàn học / cửa lớp tới khi chạm Zombie) */}
        <div className="p-2.5 rounded-lg bg-stone-950/95 border border-amber-500/40 space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-1.5">
            <div>
              <div className="text-[11px] font-extrabold text-amber-300 flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Tốc Độ Đạn Bay & Cơ Chế Khóa Camera Đạn Quà (5 • 10 • 10+ xu)
                </span>
              </div>
              <p className="text-[9.5px] text-stone-400">
                Đạn xuất phát từ đúng tọa độ (x, y) bàn học • Đạn chạm Zombie mới trừ máu • Giá trị nhỏ = bay nhanh
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  zombieMaxFlyingProjectiles: 16,
                  zombieNormalProjectileDurationSec: 0.55,
                  zombieGift5ProjectileDurationSec: 1.15,
                  zombieGift10ProjectileDurationSec: 1.4,
                  zombieGift10PlusProjectileDurationSec: 1.7,
                })
              }
              className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 flex items-center gap-1 shrink-0 cursor-pointer"
              title="Khôi phục giới hạn số đạn & tốc độ bay mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Mặc định</span>
            </button>
          </div>

          {/* 0. Giới hạn số đạn bay tối đa trên sân / mỗi đợt */}
          <div className="p-2 rounded-lg bg-stone-900/90 border border-emerald-500/35 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10.5px] font-extrabold text-emerald-300">
                  🎯 Giới hạn số đạn bay tối đa (Mỗi đợt / Trên màn hình)
                </span>
                <span className="block text-[9px] text-stone-400">
                  Sát thương dư tự động gộp vào đạn đang bay (không mất máu & điểm)
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={config.zombieMaxFlyingProjectiles ?? 16}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieMaxFlyingProjectiles: Math.max(
                        1,
                        Math.min(60, parseInt(e.target.value, 10) || 16)
                      ),
                    })
                  }
                  className="w-14 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono font-bold text-emerald-300 text-right"
                />
                <span className="text-[10px] text-stone-400">viên</span>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={config.zombieMaxFlyingProjectiles ?? 16}
              onChange={(e) =>
                onUpdateConfig({
                  zombieMaxFlyingProjectiles:
                    parseInt(e.target.value, 10) || 16,
                })
              }
              className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* 1. Tốc độ đạn thường (Không áp dụng cho đạn 5, 10, 10+) */}
          <div className="p-2 rounded-lg bg-stone-900/90 border border-sky-500/35 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10.5px] font-extrabold text-sky-300">
                  ✏️ Tốc độ Đạn Thường (Thả Tim: Hộp Bút / Ê-ke / Casio & Quà 1 xu)
                </span>
                <span className="block text-[9px] text-stone-400">
                  Không áp dụng cho đạn quà 5, 10, 10+ xu
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={0.15}
                  max={3.0}
                  step={0.05}
                  value={config.zombieNormalProjectileDurationSec ?? 0.55}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieNormalProjectileDurationSec: Math.max(
                        0.15,
                        Math.min(3.0, parseFloat(e.target.value) || 0.55)
                      ),
                    })
                  }
                  className="w-14 px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono font-bold text-sky-300 text-right"
                />
                <span className="text-[10px] text-stone-400">giây</span>
              </div>
            </div>
            <input
              type="range"
              min={0.15}
              max={2.0}
              step={0.05}
              value={config.zombieNormalProjectileDurationSec ?? 0.55}
              onChange={(e) =>
                onUpdateConfig({
                  zombieNormalProjectileDurationSec:
                    parseFloat(e.target.value) || 0.55,
                })
              }
              className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* 2. Tốc độ riêng cho 3 loại Đạn Quà Tặng Khóa Camera (5, 10, 10+ xu) */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="p-2 rounded-lg bg-stone-900/90 border border-orange-500/40 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-orange-300">
                  🪑 Đạn 5 xu
                </span>
                <span className="text-[9px] font-mono text-orange-200">
                  Khóa Cam
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.25}
                  max={5.0}
                  step={0.05}
                  value={config.zombieGift5ProjectileDurationSec ?? 1.15}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieGift5ProjectileDurationSec: Math.max(
                        0.25,
                        Math.min(5.0, parseFloat(e.target.value) || 1.15)
                      ),
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono font-bold text-orange-300 text-right"
                />
                <span className="text-[9.5px] text-stone-400">s</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-stone-900/90 border border-purple-500/40 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-purple-300">
                  😱 Đạn 10 xu
                </span>
                <span className="text-[9px] font-mono text-purple-200">
                  Khóa Cam
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.25}
                  max={5.0}
                  step={0.05}
                  value={config.zombieGift10ProjectileDurationSec ?? 1.4}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieGift10ProjectileDurationSec: Math.max(
                        0.25,
                        Math.min(5.0, parseFloat(e.target.value) || 1.4)
                      ),
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono font-bold text-purple-300 text-right"
                />
                <span className="text-[9.5px] text-stone-400">s</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-stone-900/90 border border-yellow-500/40 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-yellow-300">
                  👑 Đạn 10+ xu
                </span>
                <span className="text-[9px] font-mono text-yellow-200">
                  Khóa Cam
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.25}
                  max={5.0}
                  step={0.05}
                  value={config.zombieGift10PlusProjectileDurationSec ?? 1.7}
                  onChange={(e) =>
                    onUpdateConfig({
                      zombieGift10PlusProjectileDurationSec: Math.max(
                        0.25,
                        Math.min(5.0, parseFloat(e.target.value) || 1.7)
                      ),
                    })
                  }
                  className="w-full px-1.5 py-0.5 rounded bg-stone-950 border border-stone-700 text-[11px] font-mono font-bold text-yellow-300 text-right"
                />
                <span className="text-[9.5px] text-stone-400">s</span>
              </div>
            </div>
          </div>

          <div className="text-[9.5px] text-amber-200/90 bg-amber-950/30 border border-amber-500/25 rounded px-2 py-1">
            🎥 <strong>Hàng chờ Camera Đạn Quà 5, 10, 10+ xu:</strong> Khi đang có viên đạn quà bay trên sân, lượt đạn quà mới sẽ chờ viên hiện tại chạm Zombie xong mới phóng tiếp và chuyển Camera qua viên đạn quà kế tiếp.
          </div>
        </div>

        {/* Điều chỉnh Kích Thước (Scale) cho TẤT CẢ 6 Loại Đạn */}
        <div className="p-2.5 rounded-lg bg-stone-950/95 border border-cyan-500/40 space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-1.5">
            <div>
              <div className="text-[11px] font-extrabold text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  Kích Thước Tất Cả Loại Đạn (Đạn Tim 3 Mẫu + Quà 1 • 5 • 10+ xu)
                </span>
              </div>
              <p className="text-[9.5px] text-stone-400">
                Áp dụng cho cả hình mặc định SVG lẫn hình ảnh PNG tải lên • Đạn Tim bắn random 1 trong 3: Hộp Bút / Thước Ê-ke Xanh / Casio
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  zombieProjectileScales: {
                    ...DEFAULT_ZOMBIE_PROJECTILE_SCALES,
                  },
                })
              }
              className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 flex items-center gap-1 shrink-0 cursor-pointer"
              title="Khôi phục kích thước 1.0x cho tất cả loại đạn"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Mặc định 1.0x</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {projectileScaleItems.map((item) => {
              const curScale = projScales[item.key] ?? 1.0;
              return (
                <div
                  key={item.key}
                  className={`p-2 rounded-lg bg-stone-900/90 border ${item.borderClass} space-y-1`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <span
                        className={`text-[10px] font-extrabold ${item.textClass} block truncate`}
                      >
                        {item.label}
                      </span>
                      <span className="text-[8.5px] text-stone-400 block truncate">
                        {item.sub}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <input
                        type="number"
                        min={0.25}
                        max={3.0}
                        step={0.05}
                        value={curScale}
                        onChange={(e) =>
                          handleUpdateProjectileScale(
                            item.key,
                            parseFloat(e.target.value) || 1.0
                          )
                        }
                        className={`w-12 px-1 py-0.5 rounded bg-stone-950 border border-stone-700 text-[10.5px] font-mono font-bold ${item.textClass} text-right`}
                      />
                      <span className="text-[9px] text-stone-400">x</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={3.0}
                    step={0.05}
                    value={curScale}
                    onChange={(e) =>
                      handleUpdateProjectileScale(
                        item.key,
                        parseFloat(e.target.value) || 1.0
                      )
                    }
                    className={`w-full ${item.accentClass} h-1.5 bg-stone-800 rounded-lg cursor-pointer`}
                  />
                </div>
              );
            })}
          </div>
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
                Luồng 4: Lời thoại + Chatbox Cô Thảo kêu gọi (Giọng Nữ Chính)
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

        {/* Nút Bật/Tắt Tự Động Đánh (NPC Giả Lập Thả Tim Xen Kẽ) ngay trong khu vực Test */}
        <button
          type="button"
          onClick={() =>
            onUpdateConfig({
              zombieNpcAutoAttack: config.zombieNpcAutoAttack === false,
            })
          }
          className={`w-full p-2.5 rounded-lg border flex items-center justify-between gap-2 transition cursor-pointer shadow ${
            config.zombieNpcAutoAttack !== false
              ? 'bg-emerald-950/85 hover:bg-emerald-900/85 border-emerald-400 text-emerald-100'
              : 'bg-stone-950 hover:bg-stone-800 border-stone-700 text-stone-300'
          }`}
        >
          <div className="text-left">
            <div className="text-[11px] font-extrabold flex items-center gap-1.5">
              <Heart
                className={`w-3.5 h-3.5 ${
                  config.zombieNpcAutoAttack !== false
                    ? 'text-pink-400 fill-pink-400 animate-pulse'
                    : 'text-stone-400'
                }`}
              />
              <span>
                {config.zombieNpcAutoAttack !== false
                  ? '🤖 Tự Động Đánh Đang BẬT (NPC lớp & hàng chờ tự thả tim xen kẽ)'
                  : '🤖 Bật Tự Động Đánh (Cho NPC tự giả lập thả tim xem thử)'}
              </span>
            </div>
            <div className="text-[9.5px] text-stone-400">
              Tự động phóng mưa đạn Tim (Random: Hộp Bút / Thước Ê-ke / Casio) giữa Trong Lớp ↔ Hàng Chờ
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-md text-[10.5px] font-mono font-black shrink-0 ${
              config.zombieNpcAutoAttack !== false
                ? 'bg-emerald-400 text-stone-950'
                : 'bg-stone-800 text-stone-400 border border-stone-700'
            }`}
          >
            {config.zombieNpcAutoAttack !== false ? 'ĐANG BẬT' : 'ĐANG TẮT'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={testAttackerName}
            onChange={(e) => setTestAttackerName(e.target.value)}
            placeholder="Tên người chơi test thủ công (để trống = chọn ngẫu nhiên)..."
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
              Random: Hộp Bút / Ê-ke Xanh / Casio
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
              Cửa lớp ném Hộp Bút / Ê-ke / Casio
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
              <span>🪑 Quà 5 Coin (Khóa Cam)</span>
              <span className="font-mono text-emerald-300">-500 HP</span>
            </div>
            <div className="text-[9.5px] text-stone-400">
              Ném Ghế Ngồi • Khóa Camera theo đạn
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
            className="p-2 rounded-lg bg-purple-950/60 hover:bg-purple-900/70 border border-purple-400/60 text-left transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-extrabold text-purple-200">
              <span>😱 Quà 10 Coin (Khóa Cam)</span>
              <span className="font-mono text-yellow-300">-1000 HP</span>
            </div>
            <div className="text-[9.5px] text-stone-300">
              Ném Đứa Bàn Bên • Khóa Camera riêng
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onTestZombieAttack?.(
                'desk_mate_10plus',
                testAttackerName.trim() || undefined
              )
            }
            className="p-2 rounded-lg bg-yellow-950/60 hover:bg-yellow-900/70 border border-yellow-400/70 text-left transition cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-extrabold text-yellow-200">
              <span>👑 Quà 10+ Coin (Khóa Cam)</span>
              <span className="font-mono text-amber-300">-2000 HP</span>
            </div>
            <div className="text-[9.5px] text-stone-300">
              Siêu Quà 10+ • Tốc độ riêng & Khóa Cam
            </div>
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
