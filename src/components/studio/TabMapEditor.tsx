import React, { useMemo, useState } from 'react';
import {
  Crosshair,
  Gift,
  ImagePlus,
  Maximize2,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  CustomAssetsConfig,
  DailyRecordEntry,
  GameConfig,
  GridConfig,
  HudLayoutConfig,
  KneelSlot,
} from '../../types/game';
import {
  DEFAULT_DESK_IMAGE,
  DEFAULT_GIFT_MODEL_SCALES,
  FONT_FAMILY_OPTIONS,
  groupSlotsIntoDoubleDesks,
} from '../../config/constants';
import {
  DeskCatModel,
  FallingMoneyModel,
  PcGamingDeskModel,
  RoseBouquetModel,
  RunningPigModel,
  SchoolGiftArt,
  SnackBagModel,
} from '../stage/SchoolGiftArt';
import { GiftModelScalesConfig } from '../../types/game';

interface TabMapEditorProps {
  config: GameConfig;
  vipSlots: KneelSlot[];
  normalSlots: KneelSlot[];
  customAssets: CustomAssetsConfig;
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
  onUploadAsset: (key: keyof CustomAssetsConfig, file: File) => void;
  onResetAsset: (key: keyof CustomAssetsConfig) => void;
  lotusDonorsCount?: number;
  onClearLotusDonors?: () => void;
  dailyRecords?: DailyRecordEntry[];
  onResetDailyRecords?: () => void;
  onTestPaperPlaneThrow?: () => void;
}

export const TabMapEditor: React.FC<TabMapEditorProps> = React.memo(({
  config,
  vipSlots,
  normalSlots,
  customAssets,
  onUpdateConfig,
  onUpdateGrid,
  onAddDesk,
  onRemoveDesk,
  onMoveWaypointsBatch,
  onUpdateHudLayout,
  onUploadAsset,
  onResetAsset,
  lotusDonorsCount = 0,
  onClearLotusDonors,
  dailyRecords = [],
  onResetDailyRecords,
  onTestPaperPlaneThrow,
}) => {
  const [selectedDevDeskIds, setSelectedDevDeskIds] = useState<string[]>([]);

  const vipDesksList = useMemo(
    () => groupSlotsIntoDoubleDesks(vipSlots, 'vip'),
    [vipSlots]
  );
  const normalDesksList = useMemo(
    () => groupSlotsIntoDoubleDesks(normalSlots, 'norm'),
    [normalSlots]
  );
  const vipDesksCount = vipDesksList.length;
  const normalDesksCount = normalDesksList.length;

  const unifiedDesksList = useMemo(
    () =>
      [
        ...vipDesksList.map((d) => ({ kind: 'vip' as const, desk: d })),
        ...normalDesksList.map((d) => ({ kind: 'normal' as const, desk: d })),
      ].sort((a, b) =>
        Math.abs(a.desk.centerY - b.desk.centerY) > 14
          ? a.desk.centerY - b.desk.centerY
          : a.desk.centerX - b.desk.centerX
      ),
    [vipDesksList, normalDesksList]
  );

  const deskCols = useMemo(
    () =>
      config.grid.deskCols ||
      Math.max(1, Math.floor((config.grid.cols || 6) / 2)),
    [config.grid.deskCols, config.grid.cols]
  );

  const hud = config.hudLayout;

  return (
    <div className="space-y-4">
      {/* 1. Chỉnh Sửa Trực Tiếp Trên Màn Hình */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2">
        <h2 className="text-xs font-bold text-stone-200">
          Chỉnh Sửa Trực Tiếp Trên Sân
        </h2>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdateHudLayout({ editLayoutMode: !config.hudLayout.editLayoutMode })
            }
            className={`py-2 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              config.hudLayout.editLayoutMode
                ? 'bg-amber-400 text-stone-950'
                : 'bg-stone-950 hover:bg-stone-800 text-stone-200 border border-stone-800'
            }`}
          >
            <Move className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {config.hudLayout.editLayoutMode ? 'Đang sửa Bảng' : 'Sửa Bảng'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateConfig({ showZoneBounds: !config.showZoneBounds })
            }
            className={`py-2 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              config.showZoneBounds
                ? 'bg-fuchsia-400 text-stone-950'
                : 'bg-stone-950 hover:bg-stone-800 text-stone-200 border border-stone-800'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {config.showZoneBounds ? 'Đang hiện Vùng' : 'Vùng GV & Giám Thị'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onUpdateConfig({ showWaypoints: !config.showWaypoints })}
            className={`py-2 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
              config.showWaypoints
                ? 'bg-emerald-400 text-stone-950'
                : 'bg-stone-950 hover:bg-stone-800 text-stone-200 border border-stone-800'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {config.showWaypoints ? 'Đang sửa Bàn' : 'Sửa Bàn Đôi'}
            </span>
          </button>
        </div>
      </section>

      {/* 1.5. Hạt Bụi Particle Bay Lên (Độ thưa, Độ mờ & Kích thước - Ưu tiên trên tất cả bảng và người) */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-amber-500/35 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <h2 className="text-xs font-bold text-amber-200">
              Hạt Bụi Particle Bay Lên
            </h2>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                dustParticleCount: 16,
                dustParticleOpacity: 0.65,
                dustParticleSize: 1.0,
              })
            }
            className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-bold text-stone-300 flex items-center gap-1 cursor-pointer transition shrink-0"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Mặc định</span>
          </button>
        </div>

        {/* Độ thưa / Mật độ hạt bụi */}
        <div className="p-2 rounded-lg bg-stone-950/85 border border-stone-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-stone-300 font-medium">
              Độ thưa / Mật độ hạt:
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  { label: 'Tắt', val: 0 },
                  { label: 'Rất thưa', val: 6 },
                  { label: 'Vừa', val: 16 },
                  { label: 'Dày', val: 40 },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    onUpdateConfig({ dustParticleCount: preset.val })
                  }
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono cursor-pointer transition ${
                    (config.dustParticleCount ?? 16) === preset.val
                      ? 'bg-amber-400 text-stone-950 font-bold'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <span className="w-11 text-right font-mono font-bold text-amber-300 tabular-nums">
                {config.dustParticleCount ?? 16} hạt
              </span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={80}
            step={1}
            value={config.dustParticleCount ?? 16}
            onChange={(e) =>
              onUpdateConfig({
                dustParticleCount: Math.max(
                  0,
                  Math.min(80, parseInt(e.target.value, 10) || 0)
                ),
              })
            }
            className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Độ mờ & Kích thước hạt bụi */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-stone-950/85 border border-stone-800">
            <div className="flex justify-between text-[11px] text-stone-300 mb-1">
              <span>Độ mờ ( Hiển thị )</span>
              <span className="text-amber-300 font-mono tabular-nums font-bold">
                {Math.round((config.dustParticleOpacity ?? 0.65) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.dustParticleOpacity ?? 0.65}
              onChange={(e) =>
                onUpdateConfig({
                  dustParticleOpacity: parseFloat(e.target.value),
                })
              }
              className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/85 border border-stone-800">
            <div className="flex justify-between text-[11px] text-stone-300 mb-1">
              <span>Kích thước hạt</span>
              <span className="text-amber-300 font-mono tabular-nums font-bold">
                {Math.round((config.dustParticleSize ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.3}
              max={3.0}
              step={0.1}
              value={config.dustParticleSize ?? 1}
              onChange={(e) =>
                onUpdateConfig({
                  dustParticleSize: parseFloat(e.target.value) || 1,
                })
              }
              className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* 2. Cỡ chữ Floating Text +Số Hoa Điểm 10 khi tặng quà & Làm mới điểm */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-pink-500/35 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-300 font-medium">
            Size chữ +Hoa Điểm 10 tặng quà:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  lotusFloatingScoreFontSize: Math.max(
                    8,
                    (hud.lotusFloatingScoreFontSize ?? 12) - 1
                  ),
                })
              }
              className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              -
            </button>
            <input
              type="range"
              min={8}
              max={24}
              step={1}
              value={hud.lotusFloatingScoreFontSize ?? 12}
              onChange={(e) =>
                onUpdateHudLayout({
                  lotusFloatingScoreFontSize: Math.max(
                    8,
                    Math.min(24, parseInt(e.target.value, 10) || 12)
                  ),
                })
              }
              className="w-20 accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() =>
                onUpdateHudLayout({
                  lotusFloatingScoreFontSize: Math.min(
                    24,
                    (hud.lotusFloatingScoreFontSize ?? 12) + 1
                  ),
                })
              }
              className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              +
            </button>
            <span className="text-[11px] font-mono font-bold text-pink-300 w-9 text-right">
              {hud.lotusFloatingScoreFontSize ?? 12}px
            </span>
          </div>
        </div>
      </section>

      {/* 3. Ẩn / Hiện, Cỡ Chữ, Độ Mờ Nền & Tiêu Đề Các Bảng */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-stone-200">
            Hiển Thị, Cỡ Chữ & Độ Mờ Nền Bảng
          </h2>
          <span className="text-[10px] text-amber-300 font-mono">0% = Mất nền</span>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          {(
            [
              {
                visKey: 'showClassBoardBox',
                fontKey: 'classBoardFontSize',
                opKey: 'classBoardOpacity',
                defaultFont: 15,
                defaultOp: 0.72,
                label: 'Bảng Lớp Chính (Bảng Đen)',
              },
              {
                visKey: 'showWaitingQueueBox',
                fontKey: 'waitingQueueFontSize',
                opKey: 'waitingQueueOpacity',
                defaultFont: 10,
                defaultOp: config.hudLayout.hudOpacity ?? 0.88,
                label: 'Bảng Hàng Chờ Học Ké (Avatar 4 cột)',
              },
              {
                visKey: 'showDailyRecordBox',
                fontKey: 'dailyRecordFontSize',
                opKey: 'dailyRecordOpacity',
                defaultFont: 9.5,
                defaultOp: config.hudLayout.hudOpacity ?? 0.9,
                label: 'Bảng Kỷ Lục Cúp Vàng (Top 1-5)',
              },
              {
                visKey: 'showNoticeBoardBox',
                fontKey: 'noticeBoardFontSize',
                opKey: 'noticeBoardOpacity',
                defaultFont: 10,
                defaultOp: config.hudLayout.hudOpacity ?? 0.88,
                label: 'Bảng Tin Lớp Học',
              },
              {
                visKey: 'showGrandEventBox',
                fontKey: 'grandEventFontSize',
                opKey: 'grandEventOpacity',
                defaultFont: 10,
                defaultOp: config.hudLayout.hudOpacity ?? 0.88,
                label: 'Bảng Kích Hoạt Sự Kiện',
              },
              {
                visKey: 'showGuideBox',
                fontKey: 'guideFontSize',
                opKey: 'guideOpacity',
                defaultFont: 9,
                defaultOp: config.hudLayout.hudOpacity ?? 0.88,
                label: 'Nội Quy & Quà Tặng',
              },
              {
                visKey: 'showPilgrimCountBox',
                fontKey: 'pilgrimCountFontSize',
                opKey: 'pilgrimCountOpacity',
                defaultFont: 10,
                defaultOp: config.hudLayout.hudOpacity ?? 0.88,
                label: 'Bảng Sĩ Số Lớp',
              },
              {
                visKey: 'showToastBox',
                fontKey: 'toastFontSize',
                opKey: 'toastOpacity',
                defaultFont: 10,
                defaultOp: config.hudLayout.hudOpacity ?? 0.88,
                label: 'Bảng Comment',
              },
              {
                visKey: 'showNote1Box',
                fontKey: 'note1FontSize',
                opKey: 'note1Opacity',
                defaultFont: 10,
                defaultOp: config.hudLayout.hudOpacity ?? 0.9,
                label: 'Bảng Note 1 (Đây là trò chơi 2D.)',
              },
              {
                visKey: 'showMarqueeBox',
                fontKey: 'marqueeFontSize',
                opKey: 'marqueeOpacity',
                defaultFont: 12,
                defaultOp: 0.88,
                label: 'Bảng Chạy Chữ 1 Dòng Ngang (Thông Báo Dài)',
              },
              {
                visKey: 'showTempleSign',
                fontKey: null,
                opKey: 'templeSignOpacity',
                defaultFont: 10,
                defaultOp: 1,
                label: 'Biển Tên Lớp Học',
              },
            ] as const
          ).map(({ visKey, fontKey, opKey, defaultFont, defaultOp, label }) => {
            const visible = config.hudLayout[visKey] !== false;
            const currentSize = fontKey
              ? (config.hudLayout[fontKey] ?? defaultFont)
              : defaultFont;
            const curOp =
              typeof config.hudLayout[opKey] === 'number'
                ? (config.hudLayout[opKey] as number)
                : defaultOp;
            const opPercent = Math.round(curOp * 100);

            return (
              <div
                key={visKey}
                className={`px-2.5 py-2 rounded-lg border space-y-1.5 transition ${
                  visible
                    ? 'bg-stone-950/85 border-emerald-500/35'
                    : 'bg-stone-950/40 border-stone-800/80 opacity-65'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateHudLayout({ [visKey]: !visible })}
                    className={`px-2 py-1 rounded-md border text-[10.5px] font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                      visible
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                        : 'bg-stone-900 border-stone-700 text-stone-400'
                    }`}
                  >
                    <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-stone-950/80">
                      {visible ? 'HIỆN' : 'ẨN'}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>

                  {fontKey ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-stone-400">Cỡ:</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateHudLayout({
                            [fontKey]: Math.max(7, currentSize - 1),
                          })
                        }
                        className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="range"
                        min={7}
                        max={visKey === 'showMarqueeBox' ? 32 : 24}
                        step={1}
                        value={currentSize}
                        onChange={(e) =>
                          onUpdateHudLayout({
                            [fontKey]: parseInt(e.target.value, 10) || defaultFont,
                          })
                        }
                        className="w-16 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateHudLayout({
                            [fontKey]: Math.min(
                              visKey === 'showMarqueeBox' ? 32 : 24,
                              currentSize + 1
                            ),
                          })
                        }
                        className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-right text-[10.5px] font-mono font-bold text-amber-300 tabular-nums">
                        {currentSize}px
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-stone-500 italic">PNG</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/70">
                  <span className="text-[10px] text-stone-400">Độ mờ nền:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateHudLayout({ [opKey]: 0 })}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono cursor-pointer transition ${
                        opPercent === 0
                          ? 'bg-amber-400 text-stone-950 font-bold'
                          : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                      }`}
                    >
                      0%
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={curOp}
                      onChange={(e) =>
                        onUpdateHudLayout({
                          [opKey]: parseFloat(e.target.value),
                        })
                      }
                      className="w-24 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                    />
                    <span className="w-9 text-right text-[10.5px] font-mono font-bold text-amber-300 tabular-nums">
                      {opPercent}%
                    </span>
                  </div>
                </div>

                {visKey === 'showWaitingQueueBox' && (
                  <div className="space-y-1.5 pt-1.5 border-t border-stone-800/70">
                    {/* Hàng 1: Số người hiển thị (8/16/20/24/28) */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-cyan-300 font-semibold">
                        Số người hiển thị (8/16/20/24/28):
                      </span>
                      <div className="flex items-center gap-1">
                        {([8, 16, 20, 24, 28] as const).map((rankPreset) => {
                          const activeMaxRank =
                            config.hudLayout.waitingQueueMaxRanks ?? 8;
                          const isSelected = activeMaxRank === rankPreset;
                          return (
                            <button
                              key={rankPreset}
                              type="button"
                              onClick={() =>
                                onUpdateHudLayout({
                                  waitingQueueMaxRanks: rankPreset,
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                                isSelected
                                  ? 'bg-cyan-400 text-stone-950 font-extrabold shadow'
                                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
                              }`}
                            >
                              {rankPreset}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hàng 2: Màu nền bảng (Trắng / Đen / Nâu / Xám) */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-cyan-300 font-semibold">
                        Màu nền bảng (Nền trắng → Tiêu đề đen):
                      </span>
                      <div className="flex items-center gap-1">
                        {(
                          [
                            { id: 'white', label: 'Trắng', dot: 'bg-white border-stone-400' },
                            { id: 'black', label: 'Đen', dot: 'bg-slate-950 border-cyan-400' },
                            { id: 'brown', label: 'Nâu', dot: 'bg-amber-950 border-amber-400' },
                            { id: 'gray', label: 'Xám', dot: 'bg-slate-600 border-slate-300' },
                          ] as const
                        ).map((bgOpt) => {
                          const curBg = config.hudLayout.waitingQueueBgColor || 'black';
                          const isSelected = curBg === bgOpt.id;
                          return (
                            <button
                              key={bgOpt.id}
                              type="button"
                              onClick={() =>
                                onUpdateHudLayout({
                                  waitingQueueBgColor: bgOpt.id,
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition border ${
                                isSelected
                                  ? 'bg-cyan-400 text-stone-950 border-cyan-300 shadow'
                                  : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
                              }`}
                            >
                              <span
                                className={`w-2.5 h-2.5 rounded-full border shrink-0 ${bgOpt.dot}`}
                              />
                              <span>{bgOpt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hàng 3: Chỉnh kích thước Avatar trong hàng chờ */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-cyan-300 font-semibold">
                        Kích thước Avatar hàng chờ:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHudLayout({
                              waitingQueueAvatarScale: Math.max(
                                0.5,
                                Number(
                                  (
                                    (config.hudLayout.waitingQueueAvatarScale ?? 1) -
                                    0.05
                                  ).toFixed(2)
                                )
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-stone-200 flex items-center justify-center cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={0.5}
                          max={1.8}
                          step={0.05}
                          value={config.hudLayout.waitingQueueAvatarScale ?? 1}
                          onChange={(e) =>
                            onUpdateHudLayout({
                              waitingQueueAvatarScale:
                                parseFloat(e.target.value) || 1,
                            })
                          }
                          className="w-24 accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHudLayout({
                              waitingQueueAvatarScale: Math.min(
                                1.8,
                                Number(
                                  (
                                    (config.hudLayout.waitingQueueAvatarScale ?? 1) +
                                    0.05
                                  ).toFixed(2)
                                )
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-stone-200 flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                        <span className="w-10 text-right text-[10.5px] font-mono font-bold text-cyan-300 tabular-nums">
                          {Math.round(
                            (config.hudLayout.waitingQueueAvatarScale ?? 1) * 100
                          )}
                          %
                        </span>
                      </div>
                    </div>

                    {/* Hàng 4: Chỉnh kích thước Số điểm & Thẻ điểm scale theo */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-amber-300 font-semibold">
                        Cỡ số điểm &amp; Thẻ điểm (Scale):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHudLayout({
                              waitingQueueScoreScale: Math.max(
                                0.5,
                                Number(
                                  (
                                    (config.hudLayout.waitingQueueScoreScale ?? 1) -
                                    0.05
                                  ).toFixed(2)
                                )
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-stone-200 flex items-center justify-center cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={0.5}
                          max={1.8}
                          step={0.05}
                          value={config.hudLayout.waitingQueueScoreScale ?? 1}
                          onChange={(e) =>
                            onUpdateHudLayout({
                              waitingQueueScoreScale:
                                parseFloat(e.target.value) || 1,
                            })
                          }
                          className="w-24 accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHudLayout({
                              waitingQueueScoreScale: Math.min(
                                1.8,
                                Number(
                                  (
                                    (config.hudLayout.waitingQueueScoreScale ?? 1) +
                                    0.05
                                  ).toFixed(2)
                                )
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-stone-200 flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                        <span className="w-10 text-right text-[10.5px] font-mono font-bold text-amber-300 tabular-nums">
                          {Math.round(
                            (config.hudLayout.waitingQueueScoreScale ?? 1) * 100
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {visKey === 'showMarqueeBox' && (
                  <div className="space-y-1.5 pt-1.5 border-t border-stone-800/70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-cyan-300 font-semibold">
                        Tốc độ chạy chữ (px/s):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHudLayout({
                              marqueeSpeed: Math.max(
                                10,
                                (config.hudLayout.marqueeSpeed ?? 65) - 5
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-stone-200 flex items-center justify-center cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={10}
                          max={300}
                          step={5}
                          value={config.hudLayout.marqueeSpeed ?? 65}
                          onChange={(e) =>
                            onUpdateHudLayout({
                              marqueeSpeed: parseInt(e.target.value, 10) || 65,
                            })
                          }
                          className="w-24 accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateHudLayout({
                              marqueeSpeed: Math.min(
                                300,
                                (config.hudLayout.marqueeSpeed ?? 65) + 5
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-xs font-bold text-stone-200 flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                        <span className="w-12 text-right text-[10.5px] font-mono font-bold text-cyan-300 tabular-nums">
                          {config.hudLayout.marqueeSpeed ?? 65}px/s
                        </span>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={
                        config.hudLayout.marqueeContent ??
                        '📢 Chào mừng các bạn học sinh vào lớp 12A1!'
                      }
                      onChange={(e) =>
                        onUpdateHudLayout({ marqueeContent: e.target.value })
                      }
                      placeholder="Nhập thông báo dài chạy ngang liên tục..."
                      className="w-full px-2 py-1 rounded bg-stone-950 border border-stone-800 text-[11px] text-amber-200 font-semibold focus:outline-none focus:border-cyan-400 resize-y"
                    />
                  </div>
                )}

                {visKey === 'showPilgrimCountBox' && (
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-stone-800/70">
                    <span className="text-[10px] text-amber-300 font-semibold">
                      Ẩn hàng đếm số hàng chờ:
                    </span>
                    <label className="flex items-center gap-1.5 text-[10px] text-stone-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!config.hudLayout.showQueueInPilgrimCountBox}
                        onChange={(e) =>
                          onUpdateHudLayout({
                            showQueueInPilgrimCountBox: !e.target.checked,
                          })
                        }
                        className="accent-amber-400 w-3.5 h-3.5 rounded"
                      />
                      <span>
                        {!config.hudLayout.showQueueInPilgrimCountBox
                          ? 'Đang ẩn dòng Hàng chờ'
                          : 'Đang hiện dòng Hàng chờ'}
                      </span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pop-up người mới vào */}
        <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-stone-200">
            Pop-up: Người mới vào
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdateHudLayout({
                showNewPilgrimToast:
                  config.hudLayout.showNewPilgrimToast === false,
              })
            }
            className={`px-2.5 py-1 rounded border text-[10.5px] font-bold cursor-pointer transition shrink-0 ${
              config.hudLayout.showNewPilgrimToast !== false
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-stone-900 border-stone-700 text-stone-400'
            }`}
          >
            {config.hudLayout.showNewPilgrimToast !== false ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
          </button>
        </div>

        {/* Đổi tên tiêu đề các bảng */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="text-[10.5px] text-stone-400 block mb-1">
              Tiêu đề Bảng Kích hoạt sự kiện:
            </label>
            <input
              type="text"
              value={config.hudLayout.grandEventTitle || 'Kích hoạt sự kiện'}
              onChange={(e) =>
                onUpdateHudLayout({ grandEventTitle: e.target.value })
              }
              className="w-full px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[10.5px] text-stone-400 block mb-1">
              Tiêu đề Sĩ số lớp:
            </label>
            <input
              type="text"
              value={config.hudLayout.pilgrimCountTitle || 'Sĩ số lớp'}
              onChange={(e) =>
                onUpdateHudLayout({ pilgrimCountTitle: e.target.value })
              }
              className="w-full px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[10.5px] text-stone-400 block mb-1">
              Tên tiết học (Bảng lớp):
            </label>
            <input
              type="text"
              value={config.hudLayout.classBoardLessonTitle ?? 'Tiết Tiếng Anh'}
              onChange={(e) =>
                onUpdateHudLayout({ classBoardLessonTitle: e.target.value })
              }
              className="w-full px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-amber-200 font-semibold focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[10.5px] text-stone-400 block mb-1">
              Tiêu đề Nội Quy & Quà:
            </label>
            <input
              type="text"
              value={config.hudLayout.guideTitle}
              onChange={(e) => onUpdateHudLayout({ guideTitle: e.target.value })}
              className="w-full px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10.5px] text-yellow-300 font-semibold block mb-1">
                Tiêu đề Bảng Kỷ lục cúp vàng ({dailyRecords.length}/5 kỷ lục trong ngày):
              </label>
              <input
                type="text"
                value={config.hudLayout.dailyRecordTitle ?? 'Kỷ lục cúp vàng'}
                onChange={(e) =>
                  onUpdateHudLayout({ dailyRecordTitle: e.target.value })
                }
                className="w-full px-2 py-1 rounded-lg bg-stone-950 border border-stone-800 text-xs text-yellow-200 font-semibold focus:outline-none focus:border-yellow-400"
              />
            </div>
            {onResetDailyRecords && (
              <button
                type="button"
                onClick={onResetDailyRecords}
                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer shrink-0 transition shadow"
                title="Reset bảng Kỷ lục cúp vàng về 0"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Cúp Ngày</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4. Dãy Bàn Đôi 2 Chỗ, Nhân Vật & Bong Bóng Chat */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold text-stone-200">
            Bàn Đôi 2 Chỗ, Học Sinh & Bong Bóng Chat
          </h2>
          <span className="text-[10.5px] font-mono font-bold text-emerald-400">
            {vipDesksCount + normalDesksCount} bàn đôi ({vipSlots.length + normalSlots.length} chỗ ngồi)
          </span>
        </div>

        {/* Thêm / Bớt từng Bàn Đôi (1 bàn = 2 học sinh ngồi) */}
        <div className="grid grid-cols-3 gap-2">
          <StepperCard
            label="Tổng Số Bàn Đôi (2 chỗ/bàn)"
            value={vipDesksCount + normalDesksCount}
            min={1}
            onChange={(val) => {
              const totalNow = vipDesksCount + normalDesksCount;
              if (val === totalNow + 1 && onAddDesk) {
                onAddDesk('normal');
              } else if (val === totalNow - 1 && onRemoveDesk) {
                onRemoveDesk(normalDesksCount > 0 ? 'normal' : 'vip');
              } else {
                onUpdateGrid({
                  vipDesks: 0,
                  vipCount: 0,
                  normalDesks: Math.max(1, val),
                });
              }
            }}
          />

          <StepperCard
            label="Số dãy bàn ngang / hàng"
            value={deskCols}
            min={1}
            onChange={(val) =>
              onUpdateGrid({
                deskCols: Math.min(5, val),
                cols: Math.min(5, val) * 2,
                vipDesks: 0,
                vipCount: 0,
              })
            }
          />

          <StepperCard
            label="Số hàng bàn dọc"
            value={config.grid.rows}
            min={1}
            onChange={(val) =>
              onUpdateGrid({
                rows: val,
                vipDesks: 0,
                vipCount: 0,
                normalDesks: val * deskCols,
              })
            }
          />
        </div>

        {/* Nút thao tác nhanh Thêm/Bớt Bàn Đôi & Xếp đều đội hình bàn */}
        <div className="grid grid-cols-3 gap-1.5">
          {onAddDesk && (
            <button
              type="button"
              onClick={() => onAddDesk('normal')}
              className="py-1.5 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-[10.5px] font-bold text-emerald-200 flex items-center justify-center gap-1 cursor-pointer transition"
            >
              <Plus className="w-3 h-3" />
              <span>Thêm Bàn Đôi</span>
            </button>
          )}
          {onRemoveDesk && (
            <button
              type="button"
              onClick={() =>
                onRemoveDesk(normalDesksCount > 0 ? 'normal' : 'vip')
              }
              className="py-1.5 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-[10.5px] font-bold text-rose-200 flex items-center justify-center gap-1 cursor-pointer transition"
            >
              <Minus className="w-3 h-3" />
              <span>Bớt Bàn Đôi</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onUpdateGrid({
                deskCols,
                cols: deskCols * 2,
                vipDesks: 0,
                vipCount: 0,
                normalDesks: Math.max(1, vipDesksCount + normalDesksCount),
              })
            }
            className="py-1.5 px-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10.5px] font-semibold text-amber-200 flex items-center justify-center gap-1 cursor-pointer transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Xếp đều các bàn</span>
          </button>
        </div>

        {/* Căn Thẳng Hàng Ngang / Dọc Khi Chọn Nhiều Bàn */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-cyan-500/40 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-cyan-200">
              📏 Căn Thẳng Hàng Ngang / Dọc Khi Chọn Nhiều Bàn
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setSelectedDevDeskIds(
                    unifiedDesksList.map((item) => item.desk.deskId)
                  )
                }
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-200 cursor-pointer"
              >
                Chọn hết ({unifiedDesksList.length})
              </button>
              {selectedDevDeskIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDevDeskIds([])}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-400 cursor-pointer"
                >
                  Bỏ chọn
                </button>
              )}
            </div>
          </div>

          <p className="text-[9.5px] text-stone-400 leading-tight">
            Chọn từ 2 bàn trở lên bên dưới (hoặc quét chọn / bật &quot;Chọn nhiều bàn&quot; trực tiếp trên sân khấu) rồi bấm căn thẳng hàng ngang hoặc dọc:
          </p>

          <div className="flex flex-wrap gap-1">
            {unifiedDesksList.map(({ desk }, idx) => {
              const deskNum = idx + 1;
              const isSelected = selectedDevDeskIds.includes(desk.deskId);
              return (
                <button
                  key={desk.deskId}
                  type="button"
                  onClick={() =>
                    setSelectedDevDeskIds((prev) =>
                      prev.includes(desk.deskId)
                        ? prev.filter((id) => id !== desk.deskId)
                        : [...prev, desk.deskId]
                    )
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border cursor-pointer transition ${
                    isSelected
                      ? 'bg-cyan-500/30 border-cyan-300 text-cyan-200 shadow'
                      : 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
                  }`}
                >
                  Bàn {deskNum}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={selectedDevDeskIds.length < 2 || !onMoveWaypointsBatch}
              onClick={() => {
                if (!onMoveWaypointsBatch) return;
                const picked = unifiedDesksList.filter(({ desk }) =>
                  selectedDevDeskIds.includes(desk.deskId)
                );
                if (picked.length < 2) return;
                const avgY = Math.round(
                  picked.reduce((s, it) => s + it.desk.centerY, 0) / picked.length
                );
                const targetY = Math.max(120, Math.min(945, avgY));
                const updates: Array<{
                  kind: 'vip' | 'normal';
                  index: number;
                  pos: { x: number; y: number };
                }> = [];
                picked.forEach(({ kind, desk }) => {
                  updates.push({
                    kind,
                    index: desk.leftIndex,
                    pos: { x: desk.leftSlot.x, y: targetY },
                  });
                  if (desk.rightSlot && typeof desk.rightIndex === 'number') {
                    updates.push({
                      kind,
                      index: desk.rightIndex,
                      pos: { x: desk.rightSlot.x, y: targetY },
                    });
                  }
                });
                onMoveWaypointsBatch(updates);
              }}
              className={`py-1.5 px-2 rounded-lg border text-[10.5px] font-bold flex items-center justify-center gap-1 transition ${
                selectedDevDeskIds.length >= 2
                  ? 'bg-amber-500/25 hover:bg-amber-500/40 border-amber-400/60 text-amber-200 cursor-pointer'
                  : 'bg-stone-900 border-stone-800 text-stone-500 cursor-not-allowed'
              }`}
            >
              <span>📏 Căn thẳng hàng ngang ({selectedDevDeskIds.length} bàn)</span>
            </button>

            <button
              type="button"
              disabled={selectedDevDeskIds.length < 2 || !onMoveWaypointsBatch}
              onClick={() => {
                if (!onMoveWaypointsBatch) return;
                const picked = unifiedDesksList.filter(({ desk }) =>
                  selectedDevDeskIds.includes(desk.deskId)
                );
                if (picked.length < 2) return;
                const avgCenterX = Math.round(
                  picked.reduce((s, it) => s + it.desk.centerX, 0) / picked.length
                );
                const updates: Array<{
                  kind: 'vip' | 'normal';
                  index: number;
                  pos: { x: number; y: number };
                }> = [];
                picked.forEach(({ kind, desk }) => {
                  const rightSlot = desk.rightSlot;
                  const halfSpan = rightSlot
                    ? Math.max(
                        4,
                        Math.round(Math.abs(rightSlot.x - desk.leftSlot.x) / 2)
                      )
                    : 0;
                  const leftX = Math.max(15, Math.min(525, avgCenterX - halfSpan));
                  const rightX = Math.max(15, Math.min(525, avgCenterX + halfSpan));
                  updates.push({
                    kind,
                    index: desk.leftIndex,
                    pos: { x: leftX, y: desk.leftSlot.y },
                  });
                  if (rightSlot && typeof desk.rightIndex === 'number') {
                    updates.push({
                      kind,
                      index: desk.rightIndex,
                      pos: { x: rightX, y: rightSlot.y },
                    });
                  }
                });
                onMoveWaypointsBatch(updates);
              }}
              className={`py-1.5 px-2 rounded-lg border text-[10.5px] font-bold flex items-center justify-center gap-1 transition ${
                selectedDevDeskIds.length >= 2
                  ? 'bg-cyan-500/25 hover:bg-cyan-500/40 border-cyan-400/60 text-cyan-200 cursor-pointer'
                  : 'bg-stone-900 border-stone-800 text-stone-500 cursor-not-allowed'
              }`}
            >
              <span>📐 Căn thẳng hàng dọc ({selectedDevDeskIds.length} bàn)</span>
            </button>
          </div>
        </div>

        {/* Thẻ Bàn Học: Model Ảnh Bàn Học, Size Bàn Học, Khoảng Cách Học Sinh & Bàn Học, Khoảng Cách 2 Học Sinh Cùng Bàn */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-amber-500/45 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-amber-200">
              🪑 Thẻ Bàn Học (Model, Kích Thước & Khoảng Cách Chỗ Ngồi)
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  deskScale: 1.0,
                  studentDeskGap: 24,
                  studentSeatmateGap: 36,
                })
              }
              className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer shrink-0"
            >
              Reset Bàn Mặc Định
            </button>
          </div>

          {/* Model Ảnh Bàn Học */}
          <div className="flex items-center gap-2">
            <div className="w-11 h-8 rounded-lg bg-stone-900 border border-amber-400/50 flex items-center justify-center shrink-0 p-1 overflow-hidden">
              <img
                src={customAssets.deskModelUrl || DEFAULT_DESK_IMAGE}
                alt="Model Bàn Học"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <AssetUploadRow
                label="Model Ảnh Bàn Học"
                hasCustom={
                  Boolean(customAssets.deskModelUrl) &&
                  customAssets.deskModelUrl !== DEFAULT_DESK_IMAGE
                }
                onSelectFile={(f) => onUploadAsset('deskModelUrl', f)}
                onReset={() => onResetAsset('deskModelUrl')}
              />
            </div>
          </div>

          {/* Size bàn học */}
          <div className="p-2 rounded-lg bg-stone-900/80 border border-stone-800 space-y-1">
            <div className="flex justify-between text-[11px] text-stone-200">
              <span className="font-semibold text-amber-200">🪑 Size bàn học</span>
              <span className="text-amber-300 font-mono tabular-nums font-bold">
                {Math.round((config.deskScale ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.05}
              value={config.deskScale ?? 1}
              onChange={(e) =>
                onUpdateConfig({ deskScale: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Khoảng cách giữa Học Sinh và Bàn Học */}
          <div className="p-2 rounded-lg bg-stone-900/80 border border-emerald-500/35 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-emerald-200">
                ↕️ Khoảng cách giữa học sinh & bàn học
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      studentDeskGap: Math.max(
                        -40,
                        (config.studentDeskGap ?? 24) - 2
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                  title="Giảm khoảng cách"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-11 text-center font-mono font-bold text-emerald-300 tabular-nums">
                  {config.studentDeskGap ?? 24}px
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      studentDeskGap: Math.min(
                        80,
                        (config.studentDeskGap ?? 24) + 2
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 flex items-center justify-center text-emerald-300 cursor-pointer"
                  title="Tăng khoảng cách"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ studentDeskGap: 24 })}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer"
                  title="Đặt về mặc định (24px)"
                >
                  Mặc định
                </button>
              </div>
            </div>
            <input
              type="range"
              min={-40}
              max={80}
              step={1}
              value={config.studentDeskGap ?? 24}
              onChange={(e) =>
                onUpdateConfig({
                  studentDeskGap: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Khoảng cách ngang giữa 2 học sinh ngồi cùng bàn đôi */}
          <div className="p-2 rounded-lg bg-stone-900/80 border border-cyan-500/35 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] text-stone-200">
              <span className="font-bold text-cyan-200">
                👥 Khoảng cách 2 học sinh cùng bàn
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      studentSeatmateGap: Math.max(
                        10,
                        (config.studentSeatmateGap ?? 36) - 2
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                  title="Thu hẹp khoảng cách 2 học sinh cùng bàn"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-11 text-center font-mono font-bold text-cyan-300 tabular-nums">
                  {config.studentSeatmateGap ?? 36}px
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      studentSeatmateGap: Math.min(
                        96,
                        (config.studentSeatmateGap ?? 36) + 2
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-500/40 flex items-center justify-center text-cyan-300 cursor-pointer"
                  title="Tăng khoảng cách 2 học sinh cùng bàn"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ studentSeatmateGap: 36 })}
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer"
                  title="Đặt về mặc định (36px)"
                >
                  Mặc định
                </button>
              </div>
            </div>
            <input
              type="range"
              min={10}
              max={96}
              step={2}
              value={config.studentSeatmateGap ?? 36}
              onChange={(e) =>
                onUpdateConfig({
                  studentSeatmateGap: parseInt(e.target.value, 10) || 36,
                })
              }
              className="w-full accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Kích thước Toàn Nhân Vật / Học Sinh & Kích thước riêng Cô Thảo / Thầy Tùng (Tối đa 300%) */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800">
            <div className="flex justify-between text-[11px] text-stone-300 mb-1">
              <span>Size học sinh</span>
              <span className="text-amber-300 font-mono tabular-nums font-bold">
                {Math.round((config.characterScale ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.05}
              value={config.characterScale ?? 1}
              onChange={(e) =>
                onUpdateConfig({ characterScale: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/80 border border-pink-500/35">
            <div className="flex justify-between text-[11px] text-pink-200 mb-1">
              <span>👩‍🏫 Size Cô Thảo</span>
              <span className="text-pink-300 font-mono tabular-nums font-bold">
                {Math.round((config.femaleTeacherScale ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.05}
              value={config.femaleTeacherScale ?? 1}
              onChange={(e) =>
                onUpdateConfig({
                  femaleTeacherScale: parseFloat(e.target.value),
                })
              }
              className="w-full accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="p-2 rounded-lg bg-stone-950/80 border border-sky-500/35">
            <div className="flex justify-between text-[11px] text-sky-200 mb-1">
              <span>👨‍🏫 Size Thầy Tùng</span>
              <span className="text-sky-300 font-mono tabular-nums font-bold">
                {Math.round((config.maleTeacherScale ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.05}
              value={config.maleTeacherScale ?? 1}
              onChange={(e) =>
                onUpdateConfig({
                  maleTeacherScale: parseFloat(e.target.value),
                })
              }
              className="w-full accent-sky-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Hiệu ứng lắc lư nhẹ dễ thương khi các nhân vật di chuyển (0 = Tắt) */}
        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-amber-500/35 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-amber-200">
              🐥 Độ lắc lư dễ thương khi di chuyển (0 = Tắt)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateConfig({ walkWobbleIntensity: 0 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-rose-300 cursor-pointer"
              >
                Tắt (0)
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ walkWobbleIntensity: 1.0 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer"
              >
                Mặc định (100%)
              </button>
              <span className="w-12 text-right font-mono font-bold text-amber-300 tabular-nums">
                {(config.walkWobbleIntensity ?? 1) <= 0
                  ? 'Tắt'
                  : `${Math.round((config.walkWobbleIntensity ?? 1) * 100)}%`}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={3.0}
            step={0.05}
            value={config.walkWobbleIntensity ?? 1}
            onChange={(e) =>
              onUpdateConfig({
                walkWobbleIntensity: Math.max(
                  0,
                  parseFloat(e.target.value) || 0
                ),
              })
            }
            className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Cấu hình Máy Bay Giấy ném bạn trong lớp (@tên): Size, Tốc Độ Bay & Nút Test */}
        <div className="p-2.5 rounded-lg bg-stone-950/90 border border-sky-500/45 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-sky-200 flex items-center gap-1.5">
              <span>✈️ Máy Bay Giấy Ném Bạn (@tên)</span>
            </span>
            <div className="flex items-center gap-1.5">
              {onTestPaperPlaneThrow && (
                <button
                  type="button"
                  onClick={onTestPaperPlaneThrow}
                  className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/60 text-[9.5px] font-bold text-sky-200 cursor-pointer shrink-0 transition"
                >
                  ✈️ Test Ném
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    paperPlaneScale: 1.0,
                    paperPlaneSpeed: 460,
                  })
                }
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer shrink-0"
              >
                Mặc định
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Kích thước Máy Bay Giấy */}
            <div className="p-2 rounded-lg bg-stone-900/80 border border-stone-800 space-y-1">
              <div className="flex items-center justify-between text-[10.5px] text-stone-300">
                <span>Kích thước (Size)</span>
                <span className="font-mono font-bold text-sky-300 tabular-nums">
                  {Math.round((config.paperPlaneScale ?? 1) * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      paperPlaneScale: Math.max(
                        0.4,
                        Number(((config.paperPlaneScale ?? 1) - 0.1).toFixed(2))
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
                >
                  -
                </button>
                <input
                  type="range"
                  min={0.4}
                  max={3.0}
                  step={0.05}
                  value={config.paperPlaneScale ?? 1}
                  onChange={(e) =>
                    onUpdateConfig({
                      paperPlaneScale: Math.max(
                        0.4,
                        Math.min(3.0, parseFloat(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      paperPlaneScale: Math.min(
                        3.0,
                        Number(((config.paperPlaneScale ?? 1) + 0.1).toFixed(2))
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </div>

            {/* Tốc độ bay Máy Bay Giấy */}
            <div className="p-2 rounded-lg bg-stone-900/80 border border-stone-800 space-y-1">
              <div className="flex items-center justify-between text-[10.5px] text-stone-300">
                <span>Tốc độ bay</span>
                <span className="font-mono font-bold text-amber-300 tabular-nums">
                  {Math.round(config.paperPlaneSpeed ?? 460)} px/s
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      paperPlaneSpeed: Math.max(
                        120,
                        Math.round((config.paperPlaneSpeed ?? 460) - 40)
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
                >
                  -
                </button>
                <input
                  type="range"
                  min={120}
                  max={1400}
                  step={20}
                  value={config.paperPlaneSpeed ?? 460}
                  onChange={(e) =>
                    onUpdateConfig({
                      paperPlaneSpeed: Math.max(
                        120,
                        Math.min(1400, parseInt(e.target.value, 10) || 460)
                      ),
                    })
                  }
                  className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      paperPlaneSpeed: Math.min(
                        1400,
                        Math.round((config.paperPlaneSpeed ?? 460) + 40)
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <p className="text-[9.5px] text-stone-400 leading-snug">
            Học sinh đang ngồi trong lớp chat <span className="text-sky-300 font-semibold">@tên</span> (chỉ cần gõ từ đầu/tên chính không dấu), hoặc <span className="text-sky-300 font-semibold">@bạn</span> (cùng bàn), <span className="text-sky-300 font-semibold">@top1..3</span>, <span className="text-sky-300 font-semibold">@random</span> để ném máy bay giấy trúng đầu + nổ bong bóng gai trống & tự chat &quot;ui da&quot; sau 1s.
          </p>
        </div>

        {/* Thẻ mới: Chỉnh kích thước & vị trí trên bàn của các Model (Bó hoa, Con mèo, Bịch bánh, Con heo) */}
        {(() => {
          const gm = config.giftModelScales || DEFAULT_GIFT_MODEL_SCALES;
          const patchGm = (patch: Partial<GiftModelScalesConfig>) => {
            onUpdateConfig({
              giftModelScales: {
                ...gm,
                ...patch,
              },
            });
          };
          return (
            <div className="p-2.5 rounded-lg bg-stone-950/90 border border-pink-500/45 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-pink-200 flex items-center gap-1.5">
                  <span>🎁 Kích Thước & Vị Trí Model: Hoa • Mèo • Bánh • Heo • Bàn PC Gaming</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    patchGm({
                      roseBouquet: 1.0,
                      deskCat: 1.0,
                      snackBag: 1.0,
                      runningPig: 1.0,
                      pcGamingDesk: 1.25,
                      deskCatOffsetX: 0,
                      deskCatOffsetY: 0,
                      snackBagOffsetX: 0,
                      snackBagOffsetY: 0,
                    })
                  }
                  className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer shrink-0"
                >
                  Reset Mặc Định
                </button>
              </div>

              {/* 5 thanh chỉnh kích thước (Bó hoa, Con mèo, Bịch bánh, Con heo, Skin Bàn PC Gaming) */}
              <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                <div className="p-2 rounded bg-stone-900/90 border border-stone-800">
                  <div className="flex justify-between text-pink-200 mb-0.5">
                    <span className="font-semibold">🌹 Size Bó Hoa</span>
                    <span className="font-mono font-bold text-pink-300">
                      {Math.round((gm.roseBouquet ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.5}
                    step={0.05}
                    value={gm.roseBouquet ?? 1}
                    onChange={(e) =>
                      patchGm({ roseBouquet: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full accent-pink-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="p-2 rounded bg-stone-900/90 border border-stone-800">
                  <div className="flex justify-between text-amber-200 mb-0.5">
                    <span className="font-semibold">🐱 Size Con Mèo</span>
                    <span className="font-mono font-bold text-amber-300">
                      {Math.round((gm.deskCat ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.5}
                    step={0.05}
                    value={gm.deskCat ?? 1}
                    onChange={(e) =>
                      patchGm({ deskCat: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="p-2 rounded bg-stone-900/90 border border-stone-800">
                  <div className="flex justify-between text-emerald-200 mb-0.5">
                    <span className="font-semibold">🥨 Size Bịch Bánh</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {Math.round((gm.snackBag ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.5}
                    step={0.05}
                    value={gm.snackBag ?? 1}
                    onChange={(e) =>
                      patchGm({ snackBag: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="p-2 rounded bg-stone-900/90 border border-stone-800">
                  <div className="flex justify-between text-orange-200 mb-0.5">
                    <span className="font-semibold">🐷 Size Con Heo</span>
                    <span className="font-mono font-bold text-orange-300">
                      {Math.round((gm.runningPig ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.5}
                    step={0.05}
                    value={gm.runningPig ?? 1}
                    onChange={(e) =>
                      patchGm({ runningPig: parseFloat(e.target.value) || 1 })
                    }
                    className="w-full accent-orange-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="col-span-2 p-2 rounded bg-cyan-950/25 border border-cyan-500/40">
                  <div className="flex justify-between text-cyan-200 mb-0.5">
                    <span className="font-semibold">💻 Size Skin Bàn PC Gaming (Đổi Skin Bàn)</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {Math.round((gm.pcGamingDesk ?? 1.25) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={3.0}
                    step={0.05}
                    value={gm.pcGamingDesk ?? 1.25}
                    onChange={(e) =>
                      patchGm({ pcGamingDesk: parseFloat(e.target.value) || 1.25 })
                    }
                    className="w-full accent-cyan-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Tùy chọn số lượng mèo nuôi tối đa trên bàn (1 - 5 con) */}
              <div className="p-2 rounded bg-amber-950/25 border border-amber-500/40 flex items-center justify-between gap-2 text-[10.5px]">
                <div className="min-w-0">
                  <div className="font-bold text-amber-200">
                    🐱 Số mèo nuôi tối đa / học sinh (Mặc định: 1 con)
                  </div>
                  <div className="text-[9.5px] text-stone-400 leading-tight">
                    Mỗi học sinh nuôi tối đa 1 con mèo trên bàn, những con mèo tiếp theo sẽ nhảy xuống đất đi vòng vòng lớp rồi đi mất
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {[1].map((num) => {
                    const activeMax = gm.maxDeskCats ?? 1;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => patchGm({ maxDeskCats: num })}
                        className={`px-2 h-6 rounded font-mono font-extrabold text-[10.5px] cursor-pointer transition ${
                          activeMax === num
                            ? 'bg-amber-400 text-stone-950 shadow'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
                        }`}
                      >
                        Tối đa {num} con
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Điều chỉnh vị trí ngang (X) & dọc (Y) trên bàn cho Con Mèo, Bịch Bánh và Con Heo */}
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-stone-800/80 text-[10px]">
                {/* Vị trí Con Mèo trên bàn */}
                <div className="p-2 rounded bg-amber-950/20 border border-amber-500/35 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-amber-200">
                    <span>🐱 Vị trí Con Mèo trên bàn</span>
                    <button
                      type="button"
                      onClick={() =>
                        patchGm({ deskCatOffsetX: 0, deskCatOffsetY: 0 })
                      }
                      className="px-1 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[8.5px] font-mono text-stone-300 cursor-pointer"
                    >
                      0, 0
                    </button>
                  </div>
                  <div>
                    <div className="flex justify-between text-stone-300 mb-0.5">
                      <span>Ngang (X):</span>
                      <span className="font-mono font-bold text-amber-300">
                        {(gm.deskCatOffsetX ?? 0) > 0
                          ? `+${gm.deskCatOffsetX}`
                          : gm.deskCatOffsetX ?? 0}
                        px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      step={1}
                      value={gm.deskCatOffsetX ?? 0}
                      onChange={(e) =>
                        patchGm({
                          deskCatOffsetX: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-stone-300 mb-0.5">
                      <span>Dọc (Y):</span>
                      <span className="font-mono font-bold text-amber-300">
                        {(gm.deskCatOffsetY ?? 0) > 0
                          ? `+${gm.deskCatOffsetY}`
                          : gm.deskCatOffsetY ?? 0}
                        px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      step={1}
                      value={gm.deskCatOffsetY ?? 0}
                      onChange={(e) =>
                        patchGm({
                          deskCatOffsetY: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Vị trí Bịch Bánh trên bàn */}
                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/35 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-emerald-200">
                    <span>🥨 Vị trí Bịch Bánh trên bàn</span>
                    <button
                      type="button"
                      onClick={() =>
                        patchGm({ snackBagOffsetX: 0, snackBagOffsetY: 0 })
                      }
                      className="px-1 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[8.5px] font-mono text-stone-300 cursor-pointer"
                    >
                      0, 0
                    </button>
                  </div>
                  <div>
                    <div className="flex justify-between text-stone-300 mb-0.5">
                      <span>Ngang (X):</span>
                      <span className="font-mono font-bold text-emerald-300">
                        {(gm.snackBagOffsetX ?? 0) > 0
                          ? `+${gm.snackBagOffsetX}`
                          : gm.snackBagOffsetX ?? 0}
                        px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      step={1}
                      value={gm.snackBagOffsetX ?? 0}
                      onChange={(e) =>
                        patchGm({
                          snackBagOffsetX: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-stone-300 mb-0.5">
                      <span>Dọc (Y):</span>
                      <span className="font-mono font-bold text-emerald-300">
                        {(gm.snackBagOffsetY ?? 0) > 0
                          ? `+${gm.snackBagOffsetY}`
                          : gm.snackBagOffsetY ?? 0}
                        px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      step={1}
                      value={gm.snackBagOffsetY ?? 0}
                      onChange={(e) =>
                        patchGm({
                          snackBagOffsetY: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Vị trí Con Heo trên bàn */}
                <div className="col-span-2 p-2 rounded bg-pink-950/25 border border-pink-500/40 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-pink-200">
                    <span>🐷 Vị trí Con Heo trên bàn (Đối xứng 2 chỗ ngồi)</span>
                    <button
                      type="button"
                      onClick={() =>
                        patchGm({ deskPigOffsetX: 0, deskPigOffsetY: 0 })
                      }
                      className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[8.5px] font-mono text-stone-300 cursor-pointer"
                    >
                      0, 0
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex justify-between text-stone-300 mb-0.5">
                        <span>Ngang (X):</span>
                        <span className="font-mono font-bold text-pink-300">
                          {(gm.deskPigOffsetX ?? 0) > 0
                            ? `+${gm.deskPigOffsetX}`
                            : gm.deskPigOffsetX ?? 0}
                          px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        step={1}
                        value={gm.deskPigOffsetX ?? 0}
                        onChange={(e) =>
                          patchGm({
                            deskPigOffsetX: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-full accent-pink-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-stone-300 mb-0.5">
                        <span>Dọc (Y):</span>
                        <span className="font-mono font-bold text-pink-300">
                          {(gm.deskPigOffsetY ?? 0) > 0
                            ? `+${gm.deskPigOffsetY}`
                            : gm.deskPigOffsetY ?? 0}
                          px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        step={1}
                        value={gm.deskPigOffsetY ?? 0}
                        onChange={(e) =>
                          patchGm({
                            deskPigOffsetY: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-full accent-pink-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Ưu tiên Cô Giáo & Textbox nổi trên Bảng Lớp */}
        <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-stone-950/85 border border-pink-500/40 cursor-pointer select-none">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-pink-200">
              👩‍🏫 Ưu tiên hình ảnh Cô Thảo & Textbox nằm trên Bảng Lớp
            </span>
            <span className="text-[9.5px] text-stone-400">
              Tránh việc Cô Thảo và khung thoại của cô bị Bảng Lớp che khuất khi đứng giảng bài
            </span>
          </div>
          <input
            type="checkbox"
            checked={config.teacherAboveClassBoard !== false}
            onChange={(e) =>
              onUpdateConfig({ teacherAboveClassBoard: e.target.checked })
            }
            className="accent-pink-500 w-4 h-4 shrink-0"
          />
        </label>

        {/* Nhóm Học Sinh Đứng Chùm Cửa Lớp (Số lượng 5-10, Phân bố giãn cách & Vị trí X, Y) */}
        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-sky-500/40 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-sky-200">
              🚪 Nhóm Học Sinh Đứng Chùm Cửa Lớp
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  doorCrowdCount: 7,
                  doorCrowdSpread: 1.0,
                  doorCrowdPos: { x: 46, y: 506 },
                })
              }
              className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer"
              title="Đặt lại mặc định (7 học sinh, giãn cách 100% tại cửa lớp X=46, Y=506)"
            >
              Mặc định (7 HS)
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-stone-300">Số lượng đứng chờ tối đa:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    doorCrowdCount: Math.max(0, (config.doorCrowdCount ?? 7) - 1),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={config.doorCrowdCount ?? 7}
                onChange={(e) =>
                  onUpdateConfig({
                    doorCrowdCount: Math.max(
                      0,
                      Math.min(20, parseInt(e.target.value, 10) || 0)
                    ),
                  })
                }
                className="w-24 accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    doorCrowdCount: Math.min(20, (config.doorCrowdCount ?? 7) + 1),
                  })
                }
                className="w-5 h-5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 flex items-center justify-center text-sky-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-10 text-right font-mono font-bold text-sky-300 tabular-nums">
                {config.doorCrowdCount ?? 7} HS
              </span>
            </div>
          </div>

          {/* Phân bố (giãn cách) giữa các học sinh để thu hẹp / mở rộng đám đông */}
          <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-stone-800/80">
            <span className="text-stone-300">Phân bố (giãn cách đám đông):</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    doorCrowdSpread: Math.max(
                      0.2,
                      Number(((config.doorCrowdSpread ?? 1) - 0.1).toFixed(2))
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                title="Thu hẹp khoảng cách đám đông"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0.2}
                max={3.5}
                step={0.05}
                value={config.doorCrowdSpread ?? 1}
                onChange={(e) =>
                  onUpdateConfig({
                    doorCrowdSpread: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-24 accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    doorCrowdSpread: Math.min(
                      3.5,
                      Number(((config.doorCrowdSpread ?? 1) + 0.1).toFixed(2))
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 flex items-center justify-center text-sky-300 cursor-pointer"
                title="Mở rộng khoảng cách đám đông"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-10 text-right font-mono font-bold text-sky-300 tabular-nums">
                {Math.round((config.doorCrowdSpread ?? 1) * 100)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <div>
              <div className="flex justify-between text-stone-400 mb-0.5">
                <span>Vị trí ngang (X)</span>
                <span className="font-mono font-bold text-sky-300">
                  {Math.round(config.doorCrowdPos?.x ?? 46)}px
                </span>
              </div>
              <input
                type="range"
                min={16}
                max={520}
                step={1}
                value={Math.round(config.doorCrowdPos?.x ?? 46)}
                onChange={(e) =>
                  onUpdateConfig({
                    doorCrowdPos: {
                      x: parseInt(e.target.value, 10) || 46,
                      y: config.doorCrowdPos?.y ?? 506,
                    },
                  })
                }
                className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-400 mb-0.5">
                <span>Vị trí dọc (Y)</span>
                <span className="font-mono font-bold text-sky-300">
                  {Math.round(config.doorCrowdPos?.y ?? 506)}px
                </span>
              </div>
              <input
                type="range"
                min={380}
                max={930}
                step={1}
                value={Math.round(config.doorCrowdPos?.y ?? 506)}
                onChange={(e) =>
                  onUpdateConfig({
                    doorCrowdPos: {
                      x: config.doorCrowdPos?.x ?? 46,
                      y: parseInt(e.target.value, 10) || 506,
                    },
                  })
                }
                className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Hàng Ngang 5 Chỗ Phạt Đứng Trên Bục (Sau Luồng 6 - Buff x3 / x6 / x9) */}
        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-rose-500/45 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-rose-200">
              ⚡ Hàng Ngang 5 Chỗ Phạt Đứng (Buff x3 / x6 / x9)
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  punishmentLinePos: { x: 270, y: 458 },
                  punishmentLineSpacing: 52,
                })
              }
              className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9.5px] font-semibold text-stone-300 cursor-pointer"
              title="Đặt lại vị trí hàng ngang 5 chỗ phạt mặc định (X=270, Y=458, Cách=52px)"
            >
              Mặc định (5 chỗ)
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10.5px]">
            <div>
              <div className="flex justify-between text-stone-400 mb-0.5">
                <span>Tâm ngang (X)</span>
                <span className="font-mono font-bold text-rose-300">
                  {Math.round(config.punishmentLinePos?.x ?? 270)}px
                </span>
              </div>
              <input
                type="range"
                min={80}
                max={460}
                step={1}
                value={Math.round(config.punishmentLinePos?.x ?? 270)}
                onChange={(e) =>
                  onUpdateConfig({
                    punishmentLinePos: {
                      x: parseInt(e.target.value, 10) || 270,
                      y: config.punishmentLinePos?.y ?? 458,
                    },
                  })
                }
                className="w-full accent-rose-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-400 mb-0.5">
                <span>Tâm dọc (Y)</span>
                <span className="font-mono font-bold text-rose-300">
                  {Math.round(config.punishmentLinePos?.y ?? 458)}px
                </span>
              </div>
              <input
                type="range"
                min={360}
                max={820}
                step={1}
                value={Math.round(config.punishmentLinePos?.y ?? 458)}
                onChange={(e) =>
                  onUpdateConfig({
                    punishmentLinePos: {
                      x: config.punishmentLinePos?.x ?? 270,
                      y: parseInt(e.target.value, 10) || 458,
                    },
                  })
                }
                className="w-full accent-rose-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-400 mb-0.5">
                <span>Cách nhau</span>
                <span className="font-mono font-bold text-rose-300">
                  {Math.round(config.punishmentLineSpacing ?? 52)}px
                </span>
              </div>
              <input
                type="range"
                min={24}
                max={96}
                step={2}
                value={Math.round(config.punishmentLineSpacing ?? 52)}
                onChange={(e) =>
                  onUpdateConfig({
                    punishmentLineSpacing: parseInt(e.target.value, 10) || 52,
                  })
                }
                className="w-full accent-rose-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
          <div className="text-[9.5px] text-stone-400">
            💡 Bật nút <b className="text-emerald-300">Sửa Bàn Đôi</b> ở trên cùng để thấy 5 vị trí <b className="text-yellow-300">P1..P5</b> và kéo thả trực tiếp trên sân.
          </div>
        </div>

        {/* Thẻ Tên Học Sinh */}
        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-amber-500/35 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-stone-200">
            <span className="font-bold text-amber-200">🏷️ Thẻ tên học sinh</span>
            <span className="text-amber-300 font-mono font-bold">
              Scale: {Math.round((config.nameTagScale ?? 1) * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 items-center">
            <select
              value={config.nameTagFontFamily || '"Be Vietnam Pro", system-ui, sans-serif'}
              onChange={(e) =>
                onUpdateConfig({ nameTagFontFamily: e.target.value })
              }
              className="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200 focus:outline-none"
            >
              {FONT_FAMILY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={0.6}
              max={2.0}
              step={0.05}
              value={config.nameTagScale ?? 1}
              onChange={(e) =>
                onUpdateConfig({ nameTagScale: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Điều chỉnh chiều cao Thẻ Tên (không đổi kích thước Avatar & cỡ chữ tên, không có lề trong) */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <div className="flex flex-col">
              <span className="text-stone-200 font-semibold">
                Chiều cao thẻ tên:
              </span>
              <span className="text-[9px] text-stone-400">
                Giữ nguyên cỡ Avatar &amp; Font tên (không lề trong)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    nameTagHeight: Math.max(
                      12,
                      (config.nameTagHeight ?? 20) - 1
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={12}
                max={36}
                step={1}
                value={config.nameTagHeight ?? 20}
                onChange={(e) =>
                  onUpdateConfig({
                    nameTagHeight: Math.max(
                      12,
                      Math.min(36, parseInt(e.target.value, 10) || 20)
                    ),
                  })
                }
                className="w-20 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    nameTagHeight: Math.min(
                      36,
                      (config.nameTagHeight ?? 20) + 1
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ nameTagHeight: 20 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                20px
              </button>
              <span className="w-10 text-right font-mono font-bold text-amber-300 tabular-nums">
                {config.nameTagHeight ?? 20}px
              </span>
            </div>
          </div>

          {/* Giới hạn ký tự hiển thị tối đa trong Thẻ tên */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <span className="text-stone-300">Giới hạn ký tự tối đa:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    nameTagMaxChars: Math.max(
                      4,
                      (config.nameTagMaxChars ?? 16) - 1
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={4}
                max={40}
                step={1}
                value={config.nameTagMaxChars ?? 16}
                onChange={(e) =>
                  onUpdateConfig({
                    nameTagMaxChars: Math.max(
                      4,
                      Math.min(40, parseInt(e.target.value, 10) || 16)
                    ),
                  })
                }
                className="w-24 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    nameTagMaxChars: Math.min(
                      40,
                      (config.nameTagMaxChars ?? 16) + 1
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right font-mono font-bold text-amber-300 tabular-nums">
                {config.nameTagMaxChars ?? 16} KT
              </span>
            </div>
          </div>

          {/* Điều chỉnh vị trí Thẻ tên theo chiều dọc (Lên tới -200px / Xuống +80px) */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <span className="text-stone-300">Vị trí dọc (Lên / Xuống):</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    nameTagOffsetY: Math.max(
                      -200,
                      (config.nameTagOffsetY ?? 0) - 2
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                title="Đẩy thẻ tên lên trên (tối đa -200px)"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-200}
                max={80}
                step={1}
                value={config.nameTagOffsetY ?? 0}
                onChange={(e) =>
                  onUpdateConfig({
                    nameTagOffsetY: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-20 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    nameTagOffsetY: Math.min(
                      80,
                      (config.nameTagOffsetY ?? 0) + 2
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
                title="Đẩy thẻ tên xuống dưới"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ nameTagOffsetY: 0 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-amber-300 tabular-nums">
                {(config.nameTagOffsetY ?? 0) > 0
                  ? `+${config.nameTagOffsetY}`
                  : config.nameTagOffsetY ?? 0}
                px
              </span>
            </div>
          </div>

          {/* Cỡ chữ ký tự dùng chung cho Thẻ Rank (IEL) & Thẻ Cúp Vàng (luân phiên Rank 10s • Cúp 4s) */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-stone-800/80 text-[10.5px]">
            <div className="flex flex-col">
              <span className="font-bold text-yellow-200">
                🏅 Cỡ chữ Thẻ Rank &amp; Cúp:
              </span>
              <span className="text-[9px] text-stone-400">
                Thẻ Rank = Thẻ Cúp (Rank 10s • Cúp 4s)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    rankTrophyBadgeFontSize: Math.max(
                      5,
                      Math.round(((config.rankTrophyBadgeFontSize ?? 8) - 0.5) * 10) /
                        10
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                title="Giảm cỡ chữ Thẻ Rank & Cúp (-0.5px)"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={5}
                max={18}
                step={0.5}
                value={config.rankTrophyBadgeFontSize ?? 8}
                onChange={(e) =>
                  onUpdateConfig({
                    rankTrophyBadgeFontSize: Math.max(
                      5,
                      Math.min(18, parseFloat(e.target.value) || 8)
                    ),
                  })
                }
                className="w-20 accent-yellow-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    rankTrophyBadgeFontSize: Math.min(
                      18,
                      Math.round(((config.rankTrophyBadgeFontSize ?? 8) + 0.5) * 10) /
                        10
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-yellow-500/20 hover:bg-yellow-500/35 border border-yellow-400/40 flex items-center justify-center text-yellow-300 cursor-pointer"
                title="Tăng cỡ chữ Thẻ Rank & Cúp (+0.5px)"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ rankTrophyBadgeFontSize: 8 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
                title="Đặt về mặc định (8px)"
              >
                8px
              </button>
              <span className="w-10 text-right font-mono font-bold text-yellow-300 tabular-nums">
                {config.rankTrophyBadgeFontSize ?? 8}px
              </span>
            </div>
          </div>

          {/* Điều chỉnh vị trí dọc của Vương Miện Top 1 trên đầu học sinh (Lên / Xuống) */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-500/25 text-[10.5px]">
            <span className="font-bold text-yellow-300">
              👑 Vị trí dọc Vương miện Top 1:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    top1CrownOffsetY: Math.max(
                      -60,
                      (config.top1CrownOffsetY ?? 0) - 1
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                title="Nâng vương miện lên cao (-1px)"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-60}
                max={60}
                step={1}
                value={config.top1CrownOffsetY ?? 0}
                onChange={(e) =>
                  onUpdateConfig({
                    top1CrownOffsetY: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-20 accent-yellow-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    top1CrownOffsetY: Math.min(
                      60,
                      (config.top1CrownOffsetY ?? 0) + 1
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-yellow-500/20 hover:bg-yellow-500/35 border border-yellow-400/40 flex items-center justify-center text-yellow-300 cursor-pointer"
                title="Hạ vương miện xuống thấp (+1px)"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ top1CrownOffsetY: 0 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
                title="Đặt về mặc định (0px)"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-yellow-300 tabular-nums">
                {(config.top1CrownOffsetY ?? 0) > 0
                  ? `+${config.top1CrownOffsetY}`
                  : config.top1CrownOffsetY ?? 0}
                px
              </span>
            </div>
          </div>

          {/* THẺ SHOW SỐ ĐIỂM & HIỆU ỨNG CHỮ SỐ CỘNG/TRỪ TRÊN BẢNG TÊN */}
          <div className="pt-2 border-t border-amber-500/25 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="font-bold text-amber-300">
                ⭐ Thẻ Show Số Điểm & Chữ Cộng/Trừ
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    scoreTagScale: 1.0,
                    scoreTagOffsetY: 0,
                    scoreTagDurationSec: 4,
                    scoreChangeFontSize: 14,
                    scoreChangeStrokeWidth: 2.5,
                  })
                }
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9px] font-semibold text-stone-300 cursor-pointer"
                title="Đặt về mặc định (Kích thước 100%, Vị trí 0px, tồn tại 4s, chữ 14px, viền 2.5px)"
              >
                Mặc định (4s)
              </button>
            </div>

            {/* Điều chỉnh kích thước Thẻ Show Điểm Số học sinh (🌸 Điểm) */}
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-stone-300">Kích thước Thẻ điểm (🌸):</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      scoreTagScale: Math.max(
                        0.5,
                        Number(((config.scoreTagScale ?? 1) - 0.05).toFixed(2))
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="range"
                  min={0.5}
                  max={2.2}
                  step={0.05}
                  value={config.scoreTagScale ?? 1}
                  onChange={(e) =>
                    onUpdateConfig({
                      scoreTagScale: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="w-20 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      scoreTagScale: Math.min(
                        2.2,
                        Number(((config.scoreTagScale ?? 1) + 0.05).toFixed(2))
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="w-11 text-right font-mono font-bold text-amber-300 tabular-nums">
                  {Math.round((config.scoreTagScale ?? 1) * 100)}%
                </span>
              </div>
            </div>

            {/* Vị trí dọc của Thẻ Show Số Điểm so với bảng tên */}
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-stone-300">Vị trí dọc Thẻ điểm:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      scoreTagOffsetY: Math.max(
                        -160,
                        (config.scoreTagOffsetY ?? 0) - 2
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                  title="Đẩy thẻ điểm lên cao"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="range"
                  min={-160}
                  max={80}
                  step={1}
                  value={config.scoreTagOffsetY ?? 0}
                  onChange={(e) =>
                    onUpdateConfig({
                      scoreTagOffsetY: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-20 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      scoreTagOffsetY: Math.min(
                        80,
                        (config.scoreTagOffsetY ?? 0) + 2
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
                  title="Hạ thẻ điểm xuống"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="w-11 text-right font-mono font-bold text-amber-300 tabular-nums">
                  {(config.scoreTagOffsetY ?? 0) > 0
                    ? `+${config.scoreTagOffsetY}`
                    : config.scoreTagOffsetY ?? 0}
                  px
                </span>
              </div>
            </div>

            {/* Thời gian tồn tại của Thẻ Show Số Điểm (mặc định 4s) */}
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-stone-300">Thời gian tồn tại:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      scoreTagDurationSec: Math.max(
                        1,
                        Number(((config.scoreTagDurationSec ?? 4) - 0.5).toFixed(1))
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={config.scoreTagDurationSec ?? 4}
                  onChange={(e) =>
                    onUpdateConfig({
                      scoreTagDurationSec: parseFloat(e.target.value) || 4,
                    })
                  }
                  className="w-20 accent-amber-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      scoreTagDurationSec: Math.min(
                        15,
                        Number(((config.scoreTagDurationSec ?? 4) + 0.5).toFixed(1))
                      ),
                    })
                  }
                  className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="w-11 text-right font-mono font-bold text-amber-300 tabular-nums">
                  {config.scoreTagDurationSec ?? 4}s
                </span>
              </div>
            </div>

            {/* Kích thước chữ & kích thước viền đen của số điểm cộng/trừ (+ / -) */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-800/70 text-[10.5px]">
              <div>
                <div className="flex justify-between text-stone-400 mb-0.5">
                  <span>Cỡ chữ số (+/-)</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {config.scoreChangeFontSize ?? 14}px
                  </span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={32}
                  step={1}
                  value={config.scoreChangeFontSize ?? 14}
                  onChange={(e) =>
                    onUpdateConfig({
                      scoreChangeFontSize: parseInt(e.target.value, 10) || 14,
                    })
                  }
                  className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-stone-400 mb-0.5">
                  <span>Viền đen chữ (+/-)</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {config.scoreChangeStrokeWidth ?? 2.5}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={config.scoreChangeStrokeWidth ?? 2.5}
                  onChange={(e) =>
                    onUpdateConfig({
                      scoreChangeStrokeWidth: parseFloat(e.target.value) || 2.5,
                    })
                  }
                  className="w-full accent-emerald-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bong Bóng Chat */}
        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-sky-500/35 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-stone-200">
            <span className="font-bold text-sky-200">💬 Bong bóng chat</span>
            <span className="text-sky-300 font-mono font-bold">
              Scale: {Math.round((config.chatBubbleScale ?? 1) * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 items-center">
            <select
              value={config.chatBubbleFontFamily || '"Be Vietnam Pro", system-ui, sans-serif'}
              onChange={(e) =>
                onUpdateConfig({ chatBubbleFontFamily: e.target.value })
              }
              className="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200 focus:outline-none"
            >
              {FONT_FAMILY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={0.6}
              max={2.0}
              step={0.05}
              value={config.chatBubbleScale ?? 1}
              onChange={(e) =>
                onUpdateConfig({ chatBubbleScale: parseFloat(e.target.value) })
              }
              className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Cỡ chữ Font & Giới hạn ký tự trong Bong bóng chat */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <div>
              <div className="flex justify-between text-stone-300 mb-0.5">
                <span>Cỡ chữ (Font size)</span>
                <span className="font-mono font-bold text-sky-300">
                  {config.chatBubbleFontSize ?? 11}px
                </span>
              </div>
              <input
                type="range"
                min={7}
                max={26}
                step={0.5}
                value={config.chatBubbleFontSize ?? 11}
                onChange={(e) =>
                  onUpdateConfig({
                    chatBubbleFontSize: parseFloat(e.target.value) || 11,
                  })
                }
                className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-0.5">
                <span>Giới hạn ký tự</span>
                <span className="font-mono font-bold text-sky-300">
                  {config.chatBubbleMaxChars ?? 80} KT
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={300}
                step={5}
                value={config.chatBubbleMaxChars ?? 80}
                onChange={(e) =>
                  onUpdateConfig({
                    chatBubbleMaxChars: parseInt(e.target.value, 10) || 80,
                  })
                }
                className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Chiều dài tối đa (Max Width) & Chiều cao tối đa (Max Height) của Bong bóng chat */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <div>
              <div className="flex justify-between text-stone-300 mb-0.5">
                <span>Chiều dài tối đa</span>
                <span className="font-mono font-bold text-sky-300">
                  {config.chatBubbleMaxWidth ?? 195}px
                </span>
              </div>
              <input
                type="range"
                min={80}
                max={420}
                step={5}
                value={config.chatBubbleMaxWidth ?? 195}
                onChange={(e) =>
                  onUpdateConfig({
                    chatBubbleMaxWidth: parseInt(e.target.value, 10) || 195,
                  })
                }
                className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-300 mb-0.5">
                <span>Chiều cao tối đa</span>
                <span className="font-mono font-bold text-sky-300">
                  {config.chatBubbleMaxHeight ?? 110}px
                </span>
              </div>
              <input
                type="range"
                min={32}
                max={300}
                step={4}
                value={config.chatBubbleMaxHeight ?? 110}
                onChange={(e) =>
                  onUpdateConfig({
                    chatBubbleMaxHeight: parseInt(e.target.value, 10) || 110,
                  })
                }
                className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Điều chỉnh vị trí Bong bóng chat theo chiều dọc (Lên / Xuống) */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <span className="text-stone-300">Vị trí dọc (Lên / Xuống):</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    chatBubbleOffsetY: Math.max(
                      -120,
                      (config.chatBubbleOffsetY ?? 0) - 2
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                title="Đẩy bong bóng chat lên trên"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-120}
                max={120}
                step={1}
                value={config.chatBubbleOffsetY ?? 0}
                onChange={(e) =>
                  onUpdateConfig({
                    chatBubbleOffsetY: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-20 accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    chatBubbleOffsetY: Math.min(
                      120,
                      (config.chatBubbleOffsetY ?? 0) + 2
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 flex items-center justify-center text-sky-300 cursor-pointer"
                title="Đẩy bong bóng chat xuống dưới"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ chatBubbleOffsetY: 0 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-sky-300 tabular-nums">
                {(config.chatBubbleOffsetY ?? 0) > 0
                  ? `+${config.chatBubbleOffsetY}`
                  : config.chatBubbleOffsetY ?? 0}
                px
              </span>
            </div>
          </div>

          {/* Điều chỉnh vị trí Bong bóng chat theo chiều ngang (Độ lệch ngang: Tự nhận diện học sinh ngồi bên phải đẩy sang phải, ngồi bên trái đẩy sang trái) */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-800/80 text-[10.5px]">
            <span
              className="text-stone-300"
              title="Chỉ cần chỉnh 1 chiều: Tự nhận diện học sinh ngồi bên phải thì đẩy bong bóng sang phải, ngồi bên trái thì đẩy sang trái, không đè lên người nhau"
            >
              Vị trí ngang (Tự tách 2 bên):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    chatBubbleOffsetX: Math.max(
                      0,
                      (config.chatBubbleOffsetX ?? 24) - 2
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
                title="Giảm độ lệch ngang"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0}
                max={120}
                step={1}
                value={config.chatBubbleOffsetX ?? 24}
                onChange={(e) =>
                  onUpdateConfig({
                    chatBubbleOffsetX: Math.max(0, parseInt(e.target.value, 10) || 0),
                  })
                }
                className="w-20 accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    chatBubbleOffsetX: Math.min(
                      120,
                      (config.chatBubbleOffsetX ?? 24) + 2
                    ),
                  })
                }
                className="w-5 h-5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-500/40 flex items-center justify-center text-sky-300 cursor-pointer"
                title="Tăng độ lệch ngang"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateConfig({ chatBubbleOffsetX: 24 })}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                24px
              </button>
              <span className="w-11 text-right font-mono font-bold text-sky-300 tabular-nums">
                {config.chatBubbleOffsetX ?? 24}px
              </span>
            </div>
          </div>

          {/* Thời gian hiện bong bóng chat */}
          <div className="pt-1 border-t border-stone-800/80">
            <div className="flex justify-between text-[10.5px] text-stone-300 mb-0.5">
              <span>Thời gian hiện bong bóng chat</span>
              <span className="text-sky-300 font-mono tabular-nums font-bold">
                {(config.chatBubbleDurationSec ?? 12) >= 60
                  ? 'Luôn hiện'
                  : `${config.chatBubbleDurationSec ?? 12}s`}
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={60}
              step={1}
              value={config.chatBubbleDurationSec ?? 12}
              onChange={(e) =>
                onUpdateConfig({
                  chatBubbleDurationSec: parseInt(e.target.value, 10) || 12,
                })
              }
              className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Điều chỉnh riêng Size Chatbox Cô Giáo (Chữ Hồng, Viền Hồng) & Thầy Giám Thị (Chữ Xanh Dương, Viền Xanh Dương) */}
          <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="font-bold text-pink-300">
                💖 Size Chatbox riêng: Cô Thảo (Hồng) &amp; Thầy Tùng (Xanh Dương)
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateConfig({
                    teacherBubbleScale: 1,
                    supervisorBubbleScale: 1,
                  })
                }
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                Mặc định 100%
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10.5px]">
              <div className="p-2 rounded bg-pink-950/25 border border-pink-400/40">
                <div className="flex justify-between text-pink-200 mb-0.5">
                  <span className="font-semibold">Chatbox Cô Thảo</span>
                  <span className="font-mono font-bold text-pink-300">
                    {Math.round((config.teacherBubbleScale ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={config.teacherBubbleScale ?? 1}
                  onChange={(e) =>
                    onUpdateConfig({
                      teacherBubbleScale: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="w-full accent-pink-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="p-2 rounded bg-sky-950/25 border border-sky-400/40">
                <div className="flex justify-between text-sky-200 mb-0.5">
                  <span className="font-semibold">Chatbox Thầy Tùng</span>
                  <span className="font-mono font-bold text-sky-300">
                    {Math.round((config.supervisorBubbleScale ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={config.supervisorBubbleScale ?? 1}
                  onChange={(e) =>
                    onUpdateConfig({
                      supervisorBubbleScale: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="w-full accent-sky-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Model Sự Kiện Tặng Quà (Upload File Ảnh & Điều Chỉnh Size Model) */}
      <section className="p-3 rounded-xl bg-stone-900/85 border border-amber-500/45 space-y-2.5 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-amber-400" />
            <span>Model Sự Kiện Quà Tặng (Upload Ảnh & Chỉnh Size)</span>
          </h2>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                giftModelScales: { ...DEFAULT_GIFT_MODEL_SCALES },
              })
            }
            className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-semibold text-stone-300 flex items-center gap-1 cursor-pointer transition shrink-0"
            title="Đặt lại size mặc định 100% cho toàn bộ model quà tặng"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Size Mặc Định (100%)</span>
          </button>
        </div>

        <div className="space-y-2">
          {(
            [
              {
                scaleKey: 'roseBouquet' as keyof GiftModelScalesConfig,
                assetKey: 'roseBouquetUrl' as keyof CustomAssetsConfig,
                label: '1. Bó Hoa Hồng (Tặng Cô & Thầy - 1 Xu)',
                preview: (
                  <RoseBouquetModel
                    customUrl={customAssets.roseBouquetUrl}
                    scale={0.85}
                  />
                ),
              },
              {
                scaleKey: 'deskCat' as keyof GiftModelScalesConfig,
                assetKey: 'deskCatUrl' as keyof CustomAssetsConfig,
                label: '2. Con Mèo Trên Bàn (Nuôi Mèo - 1 Xu)',
                preview: (
                  <DeskCatModel
                    customUrl={customAssets.deskCatUrl}
                    scale={0.85}
                  />
                ),
              },
              {
                scaleKey: 'snackBag' as keyof GiftModelScalesConfig,
                assetKey: 'snackBagUrl' as keyof CustomAssetsConfig,
                label: '3. Gói Snack Trên Bàn (Ăn Vụn - 1 Xu)',
                preview: (
                  <SnackBagModel
                    customUrl={customAssets.snackBagUrl}
                    scale={0.85}
                  />
                ),
              },
              {
                scaleKey: 'pcGamingDesk' as keyof GiftModelScalesConfig,
                assetKey: 'pcGamingDeskUrl' as keyof CustomAssetsConfig,
                label: '4. Skin Bàn PC Gaming (Điện Thoại Reo - 5 Xu)',
                preview: (
                  <div className="w-10 h-6 flex items-center justify-center overflow-hidden">
                    <PcGamingDeskModel
                      customUrl={customAssets.pcGamingDeskUrl}
                      scale={1}
                      className="w-10 h-6"
                    />
                  </div>
                ),
              },
              {
                scaleKey: 'runningPig' as keyof GiftModelScalesConfig,
                assetKey: 'runningPigUrl' as keyof CustomAssetsConfig,
                label: '5. Con Heo Chạy Hù Dọa (Thả 5 Heo - 10 Xu)',
                preview: (
                  <RunningPigModel
                    customUrl={customAssets.runningPigUrl}
                    scale={0.75}
                  />
                ),
              },
              {
                scaleKey: 'fallingMoney' as keyof GiftModelScalesConfig,
                assetKey: 'fallingMoneyUrl' as keyof CustomAssetsConfig,
                label: '6. Tiền Rơi Rich Kid (Mưa Tiền 5s - 10+ Xu)',
                preview: (
                  <FallingMoneyModel
                    customUrl={customAssets.fallingMoneyUrl}
                    scale={0.85}
                  />
                ),
              },
            ] as const
          ).map((item) => {
            const currentScales =
              config.giftModelScales || DEFAULT_GIFT_MODEL_SCALES;
            const scaleVal = currentScales[item.scaleKey] ?? 1;
            const hasCustom = Boolean(customAssets[item.assetKey]);
            return (
              <div
                key={item.scaleKey}
                className="p-2 rounded-lg bg-stone-950/90 border border-stone-800 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-stone-900 border border-amber-400/50 flex items-center justify-center shrink-0 overflow-hidden p-0.5">
                    {item.preview}
                  </div>
                  <div className="flex-1 min-w-0">
                    <AssetUploadRow
                      label={item.label}
                      hasCustom={hasCustom}
                      onSelectFile={(f) => onUploadAsset(item.assetKey, f)}
                      onReset={() => onResetAsset(item.assetKey)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pl-12 pr-1 text-[10.5px]">
                  <span className="text-stone-400">Size model trên sân:</span>
                  <div className="flex items-center gap-1.5 flex-1 max-w-[230px]">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConfig({
                          giftModelScales: {
                            ...currentScales,
                            [item.scaleKey]: Math.max(
                              0.4,
                              Number((scaleVal - 0.1).toFixed(2))
                            ),
                          },
                        })
                      }
                      className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer shrink-0"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min={0.4}
                      max={3.0}
                      step={0.05}
                      value={scaleVal}
                      onChange={(e) =>
                        onUpdateConfig({
                          giftModelScales: {
                            ...currentScales,
                            [item.scaleKey]: parseFloat(e.target.value) || 1,
                          },
                        })
                      }
                      className="flex-1 accent-amber-400 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConfig({
                          giftModelScales: {
                            ...currentScales,
                            [item.scaleKey]: Math.min(
                              3.0,
                              Number((scaleVal + 0.1).toFixed(2))
                            ),
                          },
                        })
                      }
                      className="w-5 h-5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="w-11 text-right font-mono font-bold text-amber-300 tabular-nums shrink-0">
                      {Math.round(scaleVal * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Các icon quà phụ khác */}
        <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
          <div className="text-[10.5px] font-bold text-stone-400">
            Icon Bảng Quà Tặng Phụ (Vở Điểm 10 / Hoa Điểm 10 / Trà Sữa / Hộp Quà):
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-stone-950 border border-amber-400/50 flex items-center justify-center shrink-0">
                <SchoolGiftArt
                  type="incense"
                  customAssets={customAssets}
                  className="w-6 h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <AssetUploadRow
                  label="Vở Điểm 10 (Phát biểu)"
                  hasCustom={Boolean(customAssets.offeringIncenseUrl)}
                  onSelectFile={(f) => onUploadAsset('offeringIncenseUrl', f)}
                  onReset={() => onResetAsset('offeringIncenseUrl')}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-stone-950 border border-amber-400/50 flex items-center justify-center shrink-0">
                <SchoolGiftArt
                  type="rose"
                  customAssets={customAssets}
                  className="w-6 h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <AssetUploadRow
                  label="Icon Hoa Điểm 10 (1 Xu)"
                  hasCustom={Boolean(customAssets.offeringRoseUrl)}
                  onSelectFile={(f) => onUploadAsset('offeringRoseUrl', f)}
                  onReset={() => onResetAsset('offeringRoseUrl')}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-stone-950 border border-amber-400/50 flex items-center justify-center shrink-0">
                <SchoolGiftArt
                  type="lotus"
                  customAssets={customAssets}
                  className="w-6 h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <AssetUploadRow
                  label="Icon Trà Sữa / Bắn Tim (5 Xu)"
                  hasCustom={Boolean(customAssets.offeringLotusUrl)}
                  onSelectFile={(f) => onUploadAsset('offeringLotusUrl', f)}
                  onReset={() => onResetAsset('offeringLotusUrl')}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-stone-950 border border-amber-400/50 flex items-center justify-center shrink-0">
                <SchoolGiftArt
                  type="tray"
                  customAssets={customAssets}
                  className="w-6 h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <AssetUploadRow
                  label="Icon Hộp Quà Tri Ân (10+ Xu)"
                  hasCustom={Boolean(customAssets.offeringTrayUrl)}
                  onSelectFile={(f) => onUploadAsset('offeringTrayUrl', f)}
                  onReset={() => onResetAsset('offeringTrayUrl')}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Ảnh PNG & Spritesheet */}
      <section className="p-3 rounded-xl bg-stone-900/75 border border-stone-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Ảnh PNG & Spritesheet</span>
          </h2>
          <button
            type="button"
            onClick={() =>
              onUpdateConfig({
                useDefaultPngModels: config.useDefaultPngModels === false,
              })
            }
            className={`px-2 py-1 rounded-lg border text-[10px] font-extrabold cursor-pointer transition ${
              config.useDefaultPngModels !== false
                ? 'bg-emerald-500/25 border-emerald-400/70 text-emerald-200 shadow'
                : 'bg-amber-500/25 border-amber-400/70 text-amber-200 shadow'
            }`}
          >
            {config.useDefaultPngModels !== false
              ? '🖼️ Đang BẬT Ảnh Mặc Định (PNG)'
              : '🎨 Đang TẮT Ảnh Mặc Định (Model 2D Cũ)'}
          </button>
        </div>

        {/* Nút gạt chi tiết Bật / Tắt dùng ảnh mặc định vs model 2D tượng trưng */}
        <div className="p-2 rounded-lg bg-stone-950/90 border border-amber-500/35 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-amber-200">
              Dùng bộ ảnh PNG nhân vật mặc định
            </div>
            <div className="text-[9.5px] text-stone-400 leading-tight">
              {config.useDefaultPngModels !== false
                ? 'Đang dùng 6 ảnh PNG mặc định (Nam/Nữ sinh đứng & ngồi ghế, Cô Thảo, Thầy Tùng). Tắt để chuyển về model nhân vật vẽ 2D tượng trưng.'
                : 'Đang dùng model nhân vật vẽ 2D tượng trưng (cử động tay chân, giơ tay phát biểu, gõ thước). Bật để dùng lại bộ ảnh PNG.'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.useDefaultPngModels !== false}
            onChange={(e) =>
              onUpdateConfig({ useDefaultPngModels: e.target.checked })
            }
            className="accent-emerald-400 w-4 h-4 shrink-0 cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <AssetUploadRow
            label="1. Biển tên lớp học (PNG)"
            hasCustom={Boolean(customAssets.templeSignPngUrl)}
            onSelectFile={(f) => onUploadAsset('templeSignPngUrl', f)}
            onReset={() => onResetAsset('templeSignPngUrl')}
          />

          <AssetUploadRow
            label="2a. Spritesheet Học Sinh Nữ (10 frames)"
            hasCustom={Boolean(customAssets.pilgrimFemaleSpritesheetUrl)}
            onSelectFile={(f) => onUploadAsset('pilgrimFemaleSpritesheetUrl', f)}
            onReset={() => onResetAsset('pilgrimFemaleSpritesheetUrl')}
          />

          <AssetUploadRow
            label="2b. Spritesheet Học Sinh Nam (10 frames)"
            hasCustom={Boolean(customAssets.pilgrimMaleSpritesheetUrl)}
            onSelectFile={(f) => onUploadAsset('pilgrimMaleSpritesheetUrl', f)}
            onReset={() => onResetAsset('pilgrimMaleSpritesheetUrl')}
          />

          <AssetUploadRow
            label="3. Spritesheet Cô Thảo (8 frames)"
            hasCustom={Boolean(customAssets.abbotSpritesheetUrl)}
            onSelectFile={(f) => onUploadAsset('abbotSpritesheetUrl', f)}
            onReset={() => onResetAsset('abbotSpritesheetUrl')}
          />

          <AssetUploadRow
            label="4. Spritesheet Thầy Tùng (8 frames)"
            hasCustom={Boolean(customAssets.seniorNoviceSpritesheetUrl)}
            onSelectFile={(f) => onUploadAsset('seniorNoviceSpritesheetUrl', f)}
            onReset={() => onResetAsset('seniorNoviceSpritesheetUrl')}
          />

          <AssetUploadRow
            label="5. Ảnh nền Lớp Học 12A1 (9:16)"
            hasCustom={Boolean(customAssets.customBgUrl)}
            onSelectFile={(f) => onUploadAsset('customBgUrl', f)}
            onReset={() => onResetAsset('customBgUrl')}
          />
        </div>
      </section>
    </div>
  );
});

interface StepperCardProps {
  label: string;
  value: number;
  min: number;
  onChange: (nextVal: number) => void;
}

const StepperCard: React.FC<StepperCardProps> = ({
  label,
  value,
  min,
  onChange,
}) => (
  <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 flex items-center justify-between gap-2">
    <span className="text-[11px] font-bold text-stone-200 truncate">
      {label}
    </span>

    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-6 h-6 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer transition"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          onChange(Number.isNaN(parsed) ? min : Math.max(min, parsed));
        }}
        className="w-10 text-center bg-stone-900 border border-stone-800 rounded py-0.5 text-xs font-mono font-bold text-amber-300 focus:outline-none"
      />

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-6 h-6 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 flex items-center justify-center text-amber-300 cursor-pointer transition"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  </div>
);

interface AssetUploadRowProps {
  label: string;
  hasCustom: boolean;
  onSelectFile: (file: File) => void;
  onReset: () => void;
}

const AssetUploadRow: React.FC<AssetUploadRowProps> = ({
  label,
  hasCustom,
  onSelectFile,
  onReset,
}) => (
  <div className="p-2 rounded-lg bg-stone-950/80 border border-stone-800 flex items-center justify-between gap-2">
    <span className="text-[11px] text-stone-200 font-medium truncate">{label}</span>
    <div className="flex items-center gap-1.5 shrink-0">
      <label className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10.5px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer transition">
        <ImagePlus className="w-3 h-3" />
        <span>Chọn PNG</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelectFile(file);
          }}
        />
      </label>
      {hasCustom && (
        <button
          type="button"
          onClick={onReset}
          className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  </div>
);
