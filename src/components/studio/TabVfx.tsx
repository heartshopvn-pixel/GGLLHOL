import React, { useMemo, useState } from 'react';
import { Heart, Minus, Plus, RotateCcw, Send, Sparkles } from 'lucide-react';
import { GameConfig } from '../../types/game';
import { Flower10BadgeIcon, RoseBouquetModel } from '../stage/SchoolGiftArt';
import {
  buildRoseHeartBurstVectors,
  RedHeartSvgIcon,
} from '../stage/ZombieEventArt';

interface TabVfxProps {
  config: GameConfig;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
  onTestFlower10Burst?: () => void;
  onTestRoseHeartBurst?: () => void;
  onTestRoseBouquetThrow?: () => void;
}

const PREVIEW_VECTORS = [
  { dx: 0, dy: -36, rot: -18, delayMs: 0, scale: 1.15 },
  { dx: 24, dy: -28, rot: 25, delayMs: 25, scale: 1.05 },
  { dx: 36, dy: -6, rot: 42, delayMs: 45, scale: 1.1 },
  { dx: 28, dy: 20, rot: 65, delayMs: 20, scale: 0.95 },
  { dx: 11, dy: 30, rot: 30, delayMs: 60, scale: 0.9 },
  { dx: -11, dy: 30, rot: -32, delayMs: 35, scale: 0.9 },
  { dx: -28, dy: 20, rot: -60, delayMs: 55, scale: 0.95 },
  { dx: -36, dy: -6, rot: -45, delayMs: 15, scale: 1.1 },
  { dx: -24, dy: -28, rot: -22, delayMs: 40, scale: 1.05 },
  { dx: 12, dy: -18, rot: 15, delayMs: 70, scale: 0.88 },
  { dx: -12, dy: -18, rot: -15, delayMs: 80, scale: 0.88 },
];

export const TabVfx: React.FC<TabVfxProps> = ({
  config,
  onUpdateConfig,
  onTestFlower10Burst,
  onTestRoseHeartBurst,
  onTestRoseBouquetThrow,
}) => {
  const [previewKey, setPreviewKey] = useState<number>(() => Date.now());
  const [heartPreviewKey, setHeartPreviewKey] = useState<number>(() =>
    Date.now()
  );

  const enabled = config.vfxFlower10Enabled !== false;
  const scale = Number(config.vfxFlower10Scale ?? 1.0);
  const offsetX = Number(config.vfxFlower10OffsetX ?? 0);
  const offsetY = Number(config.vfxFlower10OffsetY ?? 0);

  const heartEnabled = config.vfxRoseHeartBurstEnabled !== false;
  const heartScale = Number(config.vfxRoseHeartBurstScale ?? 1.0);
  const heartCount = Math.round(Number(config.vfxRoseHeartBurstCount ?? 14));
  const heartSpread = Number(config.vfxRoseHeartBurstSpread ?? 1.0);
  const heartDurationMs = Math.round(
    Number(config.vfxRoseHeartBurstDurationMs ?? 1100)
  );
  const heartOffsetX = Number(config.vfxRoseHeartBurstOffsetX ?? 0);
  const heartOffsetY = Number(config.vfxRoseHeartBurstOffsetY ?? 0);

  const heartPreviewVectors = useMemo(
    () => buildRoseHeartBurstVectors(heartCount, heartSpread),
    [heartCount, heartSpread]
  );

  const handleTriggerPreview = () => {
    setPreviewKey(Date.now());
    onTestFlower10Burst?.();
  };

  const handleTriggerHeartPreview = () => {
    setHeartPreviewKey(Date.now());
    onTestRoseHeartBurst?.();
  };

  return (
    <div className="space-y-3 text-xs">
      {/* 1. HIỆU ỨNG HOA ĐIỂM 10 BUNG NỔ KHI CỘNG ĐIỂM */}
      <section className="p-3 rounded-xl bg-stone-900/95 border border-pink-500/45 space-y-3 shadow-md">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-stone-800">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
            <h2 className="text-xs font-extrabold text-pink-200 truncate">
              🌸 VFX Hoa Điểm 10 Bung Nổ (Khi Cộng Điểm)
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  vfxFlower10Enabled: !enabled,
                })
              }
              className={`px-2.5 py-1 rounded-lg font-extrabold text-[10.5px] border cursor-pointer transition ${
                enabled
                  ? 'bg-emerald-500 text-stone-950 border-emerald-300 shadow-sm'
                  : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200'
              }`}
            >
              {enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateConfig({
                  vfxFlower10Enabled: true,
                  vfxFlower10Scale: 1.0,
                  vfxFlower10OffsetX: 0,
                  vfxFlower10OffsetY: 0,
                });
                setPreviewKey(Date.now());
              }}
              className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-bold text-stone-300 flex items-center gap-1 cursor-pointer"
              title="Đặt về mặc định (Bật, Kích thước 100%, X=0px, Y=0px)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Mặc định</span>
            </button>
          </div>
        </div>

        <p className="text-[10.5px] text-stone-400 leading-relaxed">
          Mỗi khi học sinh được cộng điểm (lúc đọc đáp án Luồng 4, nhận thưởng quà tặng hoặc thắng sự kiện), nhiều bông <strong className="text-pink-300">Hoa Điểm 10</strong> sẽ bung nổ ngay tại vị trí cộng điểm.
        </p>

        {/* Tùy chỉnh Kích thước */}
        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-stone-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-stone-200">
              Kích thước bung nổ (Scale):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxFlower10Scale: Math.max(
                      0.3,
                      Number((scale - 0.05).toFixed(2))
                    ),
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.05}
                value={scale}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxFlower10Scale: parseFloat(e.target.value) || 1.0,
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-28 accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxFlower10Scale: Math.min(
                      2.5,
                      Number((scale + 0.05).toFixed(2))
                    ),
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-pink-500/20 hover:bg-pink-500/35 border border-pink-500/40 flex items-center justify-center text-pink-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right font-mono font-bold text-pink-300 tabular-nums">
                {Math.round(scale * 100)}%
              </span>
            </div>
          </div>

          {/* Tùy chỉnh Vị trí ngang X */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Vị trí ngang X (Trái / Phải):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxFlower10OffsetX: Math.max(-120, offsetX - 2),
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-120}
                max={120}
                step={1}
                value={offsetX}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxFlower10OffsetX: parseInt(e.target.value, 10) || 0,
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-24 accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxFlower10OffsetX: Math.min(120, offsetX + 2),
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-pink-500/20 hover:bg-pink-500/35 border border-pink-500/40 flex items-center justify-center text-pink-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({ vfxFlower10OffsetX: 0 });
                  setPreviewKey(Date.now());
                }}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-pink-300 tabular-nums">
                {offsetX > 0 ? `+${offsetX}` : offsetX}px
              </span>
            </div>
          </div>

          {/* Tùy chỉnh Vị trí dọc Y */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Vị trí dọc Y (Lên / Xuống):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxFlower10OffsetY: Math.max(-160, offsetY - 2),
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-160}
                max={120}
                step={1}
                value={offsetY}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxFlower10OffsetY: parseInt(e.target.value, 10) || 0,
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-24 accent-pink-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxFlower10OffsetY: Math.min(120, offsetY + 2),
                  });
                  setPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-pink-500/20 hover:bg-pink-500/35 border border-pink-500/40 flex items-center justify-center text-pink-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({ vfxFlower10OffsetY: 0 });
                  setPreviewKey(Date.now());
                }}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-pink-300 tabular-nums">
                {offsetY > 0 ? `+${offsetY}` : offsetY}px
              </span>
            </div>
          </div>
        </div>

        {/* Khung Xem Trước Trực Tiếp & Nút Test */}
        <div className="p-3 rounded-xl bg-stone-950 border border-pink-500/30 flex flex-col items-center justify-between gap-2">
          <div className="w-full flex items-center justify-between text-[10.5px] text-stone-400">
            <span>Khung xem trước vị trí nổ Hoa Điểm 10:</span>
            <button
              type="button"
              onClick={handleTriggerPreview}
              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-pink-500 to-amber-500 hover:from-pink-400 hover:to-amber-400 text-stone-950 font-extrabold text-[10.5px] flex items-center gap-1 cursor-pointer shadow"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test Nổ Hoa Điểm 10</span>
            </button>
          </div>

          <div className="relative w-full h-36 rounded-lg bg-slate-900/90 border border-stone-800 flex items-center justify-center overflow-hidden">
            <div className="relative flex flex-col items-center">
              {/* Thẻ điểm mẫu */}
              <div className="relative flex flex-col items-center mb-1">
                {enabled && (
                  <div
                    key={previewKey}
                    className="absolute pointer-events-none"
                    style={{
                      left: `calc(50% + ${offsetX}px)`,
                      top: `calc(50% + ${offsetY}px)`,
                      transform: `translate(-50%, -50%) scale(${scale.toFixed(2)})`,
                      zIndex: 30,
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 w-9 h-9 rounded-full bg-amber-300/60 blur-[3px]"
                      style={{
                        animation: 'vfxFlower10CoreFlash 620ms ease-out forwards',
                      }}
                    />
                    {PREVIEW_VECTORS.map((vec, idx) => (
                      <div
                        key={idx}
                        className="absolute left-0 top-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]"
                        style={
                          {
                            '--f10-dx': `${vec.dx}px`,
                            '--f10-dy': `${vec.dy}px`,
                            '--f10-rot': `${vec.rot}deg`,
                            '--f10-s': vec.scale,
                            animation: `vfxFlower10ParticleBurst 1120ms cubic-bezier(0.16, 1, 0.3, 1) ${vec.delayMs}ms forwards`,
                            opacity: 0,
                          } as React.CSSProperties
                        }
                      >
                        <Flower10BadgeIcon className="w-4 h-4" />
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="font-mono font-black leading-none whitespace-nowrap mb-0.5 relative z-10"
                  style={{
                    fontSize: `${config.scoreChangeFontSize ?? 14}px`,
                    color: '#4ade80',
                    WebkitTextStroke: `${config.scoreChangeStrokeWidth ?? 2.5}px #000000`,
                    paintOrder: 'stroke fill',
                  }}
                >
                  +10
                </div>

                <div
                  className="px-1.5 py-0.5 rounded-md bg-slate-950/95 border border-amber-400/90 text-amber-200 font-mono font-black text-[9.5px] leading-none whitespace-nowrap shadow flex items-center gap-0.5 relative z-10"
                  style={{
                    transform: `scale(${(config.scoreTagScale ?? 1).toFixed(2)})`,
                    transformOrigin: '50% 100%',
                  }}
                >
                  <span className="text-[8.5px] leading-none">🌸</span>
                  <span>120</span>
                </div>
              </div>

              {/* Thẻ tên mẫu */}
              <div
                style={{ fontFamily: config.nameTagFontFamily }}
                className="h-[20px] px-2 rounded-full bg-slate-950/90 border border-slate-700 text-slate-100 text-[9.5px] font-bold flex items-center gap-1"
              >
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 inline-block" />
                <span>Học Sinh Giỏi</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HIỆU ỨNG NỔ TIM ĐỎ KHI BỊ NÉM TRÚNG BÓ HOA HỒNG (SAU KHI NÉM MÁY BAY GIẤY 10S) */}
      <section className="p-3 rounded-xl bg-stone-900/95 border border-rose-500/50 space-y-3 shadow-md">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-stone-800">
          <div className="flex items-center gap-1.5 min-w-0">
            <Heart className="w-4 h-4 text-rose-400 fill-rose-500 shrink-0" />
            <h2 className="text-xs font-extrabold text-rose-200 truncate">
              ❤️ VFX Nổ Tim Đỏ (Khi Trúng Bó Hoa Hồng)
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onUpdateConfig({
                  vfxRoseHeartBurstEnabled: !heartEnabled,
                })
              }
              className={`px-2.5 py-1 rounded-lg font-extrabold text-[10.5px] border cursor-pointer transition ${
                heartEnabled
                  ? 'bg-emerald-500 text-stone-950 border-emerald-300 shadow-sm'
                  : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200'
              }`}
            >
              {heartEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateConfig({
                  vfxRoseHeartBurstEnabled: true,
                  vfxRoseHeartBurstScale: 1.0,
                  vfxRoseHeartBurstCount: 14,
                  vfxRoseHeartBurstSpread: 1.0,
                  vfxRoseHeartBurstDurationMs: 1100,
                  vfxRoseHeartBurstOffsetX: 0,
                  vfxRoseHeartBurstOffsetY: 0,
                });
                setHeartPreviewKey(Date.now());
              }}
              className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[10px] font-bold text-stone-300 flex items-center gap-1 cursor-pointer"
              title="Đặt lại toàn bộ thông số Nổ Tim Đỏ về mặc định"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Mặc định</span>
            </button>
          </div>
        </div>

        <p className="text-[10.5px] text-stone-400 leading-relaxed">
          Sau khi học sinh ngồi trong lớp ném máy bay giấy trúng bạn, trong <strong className="text-amber-300">10 giây tiếp theo</strong> nếu tặng <strong className="text-rose-300">Hoa Hồng</strong> thì sẽ ném <strong className="text-rose-300">Bó Hoa Hồng</strong> cho bạn đó và bung nổ <strong className="text-rose-400">Tim Đỏ</strong> ngay khi trúng!
        </p>

        <div className="p-2.5 rounded-lg bg-stone-950/85 border border-stone-800 space-y-2.5">
          {/* 2.1. Kích thước nổ tim (Scale) */}
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-stone-200">
              Kích thước nổ tim (Scale):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstScale: Math.max(
                      0.3,
                      Number((heartScale - 0.05).toFixed(2))
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0.3}
                max={3.0}
                step={0.05}
                value={heartScale}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxRoseHeartBurstScale: parseFloat(e.target.value) || 1.0,
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-28 accent-rose-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstScale: Math.min(
                      3.0,
                      Number((heartScale + 0.05).toFixed(2))
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right font-mono font-bold text-rose-300 tabular-nums">
                {Math.round(heartScale * 100)}%
              </span>
            </div>
          </div>

          {/* 2.2. Số lượng tim đỏ */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Số lượng trái tim đỏ:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstCount: Math.max(4, heartCount - 2),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={4}
                max={28}
                step={1}
                value={heartCount}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxRoseHeartBurstCount: parseInt(e.target.value, 10) || 14,
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-28 accent-rose-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstCount: Math.min(28, heartCount + 2),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right font-mono font-bold text-rose-300 tabular-nums">
                {heartCount} tim
              </span>
            </div>
          </div>

          {/* 2.3. Độ bung rộng (Spread) */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Độ bung rộng (Spread):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstSpread: Math.max(
                      0.4,
                      Number((heartSpread - 0.1).toFixed(2))
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0.4}
                max={2.5}
                step={0.05}
                value={heartSpread}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxRoseHeartBurstSpread: parseFloat(e.target.value) || 1.0,
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-28 accent-rose-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstSpread: Math.min(
                      2.5,
                      Number((heartSpread + 0.1).toFixed(2))
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right font-mono font-bold text-rose-300 tabular-nums">
                {Math.round(heartSpread * 100)}%
              </span>
            </div>
          </div>

          {/* 2.4. Thời gian hiệu ứng (Duration ms) */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Thời gian nổ (Tốc độ tan):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstDurationMs: Math.max(
                      500,
                      heartDurationMs - 100
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={500}
                max={2500}
                step={50}
                value={heartDurationMs}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxRoseHeartBurstDurationMs:
                      parseInt(e.target.value, 10) || 1100,
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-28 accent-rose-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstDurationMs: Math.min(
                      2500,
                      heartDurationMs + 100
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <span className="w-12 text-right font-mono font-bold text-rose-300 tabular-nums">
                {(heartDurationMs / 1000).toFixed(2)}s
              </span>
            </div>
          </div>

          {/* 2.5. Vị trí ngang X */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Vị trí ngang X (Trái / Phải):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstOffsetX: Math.max(
                      -120,
                      heartOffsetX - 2
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-120}
                max={120}
                step={1}
                value={heartOffsetX}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxRoseHeartBurstOffsetX: parseInt(e.target.value, 10) || 0,
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-24 accent-rose-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstOffsetX: Math.min(120, heartOffsetX + 2),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({ vfxRoseHeartBurstOffsetX: 0 });
                  setHeartPreviewKey(Date.now());
                }}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-rose-300 tabular-nums">
                {heartOffsetX > 0 ? `+${heartOffsetX}` : heartOffsetX}px
              </span>
            </div>
          </div>

          {/* 2.6. Vị trí dọc Y */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/80 text-[11px]">
            <span className="font-bold text-stone-200">
              Vị trí dọc Y (Lên / Xuống):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstOffsetY: Math.max(
                      -160,
                      heartOffsetY - 2
                    ),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center justify-center text-stone-200 cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={-160}
                max={120}
                step={1}
                value={heartOffsetY}
                onChange={(e) => {
                  onUpdateConfig({
                    vfxRoseHeartBurstOffsetY: parseInt(e.target.value, 10) || 0,
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-24 accent-rose-500 h-1.5 bg-stone-800 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({
                    vfxRoseHeartBurstOffsetY: Math.min(120, heartOffsetY + 2),
                  });
                  setHeartPreviewKey(Date.now());
                }}
                className="w-5 h-5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({ vfxRoseHeartBurstOffsetY: 0 });
                  setHeartPreviewKey(Date.now());
                }}
                className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[9px] font-mono text-stone-300 cursor-pointer"
              >
                0px
              </button>
              <span className="w-11 text-right font-mono font-bold text-rose-300 tabular-nums">
                {heartOffsetY > 0 ? `+${heartOffsetY}` : heartOffsetY}px
              </span>
            </div>
          </div>
        </div>

        {/* Khung Xem Trước Trực Tiếp & Nút Test Ném Bó Hoa + Nổ Tim Đỏ */}
        <div className="p-3 rounded-xl bg-stone-950 border border-rose-500/35 flex flex-col items-center justify-between gap-2">
          <div className="w-full flex items-center justify-between gap-1.5 flex-wrap text-[10.5px] text-stone-400">
            <span>Xem trước Nổ Tim Đỏ:</span>
            <div className="flex items-center gap-1.5">
              {onTestRoseBouquetThrow && (
                <button
                  type="button"
                  onClick={() => {
                    setHeartPreviewKey(Date.now());
                    onTestRoseBouquetThrow();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10.5px] flex items-center gap-1 cursor-pointer shadow"
                  title="Giả lập 1 học sinh đang ngồi ném Bó Hoa Hồng sang bạn học và nổ tim đỏ trên sân"
                >
                  <Send className="w-3 h-3" />
                  <span>Test Ném Bó Hoa</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleTriggerHeartPreview}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white font-extrabold text-[10.5px] flex items-center gap-1 cursor-pointer shadow"
              >
                <Heart className="w-3.5 h-3.5 fill-white" />
                <span>Test Nổ Tim Đỏ</span>
              </button>
            </div>
          </div>

          <div className="relative w-full h-40 rounded-lg bg-slate-900/90 border border-stone-800 flex items-center justify-center overflow-hidden">
            <style>{`
              @keyframes vfxRoseHeartPreviewFlash {
                0% { transform: translate(-50%, -50%) scale(0.25); opacity: 0.95; }
                55% { transform: translate(-50%, -50%) scale(1.45); opacity: 0.65; }
                100% { transform: translate(-50%, -50%) scale(2.05); opacity: 0; }
              }
              @keyframes vfxRoseHeartPreviewBurst {
                0% { transform: translate(-50%, -50%) scale(0.25) rotate(0deg); opacity: 0; }
                16% { opacity: 1; }
                72% { opacity: 0.96; }
                100% {
                  transform: translate(calc(-50% + var(--rh-dx)), calc(-50% + var(--rh-dy)))
                    scale(var(--rh-s))
                    rotate(var(--rh-rot));
                  opacity: 0;
                }
              }
            `}</style>
            <div className="relative flex flex-col items-center">
              <div className="relative flex items-center justify-center mb-2">
                {heartEnabled && (
                  <div
                    key={heartPreviewKey}
                    className="absolute pointer-events-none"
                    style={{
                      left: `calc(50% + ${heartOffsetX}px)`,
                      top: `calc(50% + ${heartOffsetY}px)`,
                      transform: `translate(-50%, -50%) scale(${heartScale.toFixed(
                        2
                      )})`,
                      zIndex: 30,
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 w-10 h-10 rounded-full bg-rose-500/65 border-2 border-rose-200 blur-[1px]"
                      style={{
                        animation: `vfxRoseHeartPreviewFlash ${Math.round(
                          heartDurationMs * 0.58
                        )}ms ease-out forwards`,
                      }}
                    />
                    {heartPreviewVectors.map((vec, idx) => (
                      <div
                        key={idx}
                        className="absolute left-0 top-0 drop-shadow-[0_2px_4px_rgba(136,19,55,0.65)]"
                        style={
                          {
                            '--rh-dx': `${vec.dx}px`,
                            '--rh-dy': `${vec.dy}px`,
                            '--rh-rot': `${vec.rot}deg`,
                            '--rh-s': vec.scale,
                            animation: `vfxRoseHeartPreviewBurst ${heartDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${vec.delayMs}ms forwards`,
                            opacity: 0,
                          } as React.CSSProperties
                        }
                      >
                        <RedHeartSvgIcon fill={vec.fill} className="w-4 h-4" />
                      </div>
                    ))}
                  </div>
                )}

                <RoseBouquetModel className="w-8 h-8 relative z-10" />
              </div>

              <div
                style={{ fontFamily: config.nameTagFontFamily }}
                className="h-[20px] px-2 rounded-full bg-slate-950/90 border border-rose-500/50 text-rose-100 text-[9.5px] font-bold flex items-center gap-1"
              >
                <span className="w-3.5 h-3.5 rounded-full bg-rose-500 inline-block" />
                <span>Bạn Được Tặng Hoa ❤️</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
