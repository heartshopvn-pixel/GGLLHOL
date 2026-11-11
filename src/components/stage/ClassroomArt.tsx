import React, { useMemo } from 'react';
import {
  CustomAssetsConfig,
  GiftModelScalesConfig,
  KneelSlot,
  OfferingGiftType,
  PilgrimData,
  Point2D,
} from '../../types/game';
import {
  DEFAULT_DESK_IMAGE,
  DEFAULT_GIFT_MODEL_SCALES,
  groupSlotsIntoDoubleDesks,
} from '../../config/constants';
import { useProcessedSingleCutout } from '../../services/spriteProcessor';
import {
  DeskCatModel,
  PcGamingDeskModel,
  RunningPigModel,
  SnackBagModel,
} from './SchoolGiftArt';

interface ClassroomArtProps {
  vipSlots: KneelSlot[];
  normalSlots: KneelSlot[];
  pilgrims?: PilgrimData[];
  incenseBurner: Point2D;
  offeringTrayPos: Point2D;
  customAssets: CustomAssetsConfig;
  deskScale?: number;
  studentDeskGap?: number;
  giftModelScales?: GiftModelScalesConfig;
  renderLayer?: 'all' | 'background' | 'desks';
  latestAltarOffering?: {
    type: OfferingGiftType;
    username: string;
    giftName?: string;
    comboCount?: number;
    key: number;
  } | null;
}

interface DeskItemProps {
  deskId: string;
  deskNumber: number;
  centerX: number;
  centerY: number;
  width: number;
  deskScale: number;
  studentDeskGap: number;
  processedDeskUrl: string | null;
  customAssets: CustomAssetsConfig;
  giftModelScales: GiftModelScalesConfig;
  isPcGamingSkin: boolean;
  leftCatCount: number;
  leftCatDropAt: number;
  rightCatCount: number;
  rightCatDropAt: number;
  leftHasSnack: boolean;
  leftSnackDropAt: number;
  rightHasSnack: boolean;
  rightSnackDropAt: number;
  leftHasPig: boolean;
  leftPigDropAt: number;
  rightHasPig: boolean;
  rightPigDropAt: number;
}

const DeskItem = React.memo<DeskItemProps>(
  ({
    deskNumber,
    centerX,
    centerY,
    width,
    deskScale,
    studentDeskGap,
    processedDeskUrl,
    customAssets,
    giftModelScales,
    isPcGamingSkin,
    leftCatCount,
    leftCatDropAt,
    rightCatCount,
    rightCatDropAt,
    leftHasSnack,
    leftSnackDropAt,
    rightHasSnack,
    rightSnackDropAt,
    leftHasPig,
    leftPigDropAt,
    rightHasPig,
    rightPigDropAt,
  }) => {
    const safeDeskScale = Math.max(0.5, Math.min(3.0, deskScale || 1));
    const baseDeskW = width;
    const baseDeskH = Math.round(baseDeskW * 0.56);
    const deskW = Math.round(baseDeskW * safeDeskScale);
    const deskH = Math.round(baseDeskH * safeDeskScale);
    const gapY = typeof studentDeskGap === 'number' ? studentDeskGap : 24;
    const deskRenderY = centerY - gapY;
    const zIdx = Math.max(20, Math.round(Math.min(deskRenderY, centerY - 25)));

    const pcScale = Math.max(
      0.4,
      Math.min(3.5, giftModelScales?.pcGamingDesk ?? 1.25)
    );
    const catScale = Math.max(
      0.4,
      Math.min(2.5, giftModelScales?.deskCat ?? 1)
    );
    const snackScale = Math.max(
      0.4,
      Math.min(2.5, giftModelScales?.snackBag ?? 1)
    );
    const catOffsetX = giftModelScales?.deskCatOffsetX ?? 0;
    const catOffsetY = giftModelScales?.deskCatOffsetY ?? 0;
    const snackOffsetX = giftModelScales?.snackBagOffsetX ?? 0;
    const snackOffsetY = giftModelScales?.snackBagOffsetY ?? 0;
    const pigOffsetX = giftModelScales?.deskPigOffsetX ?? 0;
    const pigOffsetY = giftModelScales?.deskPigOffsetY ?? 0;
    const maxCats = Math.max(
      1,
      Math.min(1, giftModelScales?.maxDeskCats ?? 1)
    );
    const effectiveLeftCats = Math.min(maxCats, leftCatCount);
    const effectiveRightCats = Math.min(maxCats, rightCatCount);
    const leftStepPct =
      effectiveLeftCats <= 1
        ? 0
        : Math.min(8.5, 32 / (effectiveLeftCats - 1));
    const rightStepPct =
      effectiveRightCats <= 1
        ? 0
        : Math.min(8.5, 32 / (effectiveRightCats - 1));

    return (
      <div
        className="absolute pointer-events-none select-none"
        style={{
          left: `${centerX}px`,
          top: `${deskRenderY}px`,
          width: `${deskW}px`,
          height: `${deskH}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: zIdx,
        }}
      >
        {isPcGamingSkin ? (
          <div
            className="relative w-full h-full flex items-center justify-center"
            style={{
              transform: `scale(${pcScale})`,
            }}
          >
            <PcGamingDeskModel
              customUrl={customAssets.pcGamingDeskUrl}
              scale={1}
              width={deskW}
              height={deskH}
              className="w-full h-full"
            />
            <span
              className="absolute top-[10%] left-[6%] w-4 h-4 rounded-full bg-fuchsia-950/95 border border-cyan-300 text-cyan-200 font-mono font-extrabold text-[8.5px] leading-none flex items-center justify-center shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              style={{
                transform: `scale(${Math.max(
                  0.85,
                  Math.min(1.3, safeDeskScale)
                )})`,
              }}
            >
              {deskNumber}
            </span>
          </div>
        ) : processedDeskUrl ? (
          <div className="relative w-full h-full">
            <img
              src={processedDeskUrl}
              alt={`Bàn học ${deskNumber}`}
              className="w-full h-full object-fill select-none pointer-events-none drop-shadow-[0_3px_4px_rgba(15,23,42,0.45)]"
            />
            <span
              className="absolute top-[14%] left-[7%] w-4 h-4 rounded-full bg-amber-950/90 border border-amber-300/90 text-amber-200 font-mono font-extrabold text-[8.5px] leading-none flex items-center justify-center shadow-sm"
              style={{
                transform: `scale(${Math.max(
                  0.85,
                  Math.min(1.3, safeDeskScale)
                )})`,
              }}
            >
              {deskNumber}
            </span>
          </div>
        ) : (
          <div className="relative w-full h-full">
            <svg
              viewBox="0 0 100 46"
              className="w-full h-full overflow-visible drop-shadow-sm"
            >
              <rect
                x="6"
                y="26"
                width="88"
                height="9"
                rx="2.5"
                fill="#78350f"
                stroke="#451a03"
                strokeWidth="1.2"
              />
              <rect
                x="10"
                y="34"
                width="4"
                height="8"
                rx="1"
                fill="#292524"
              />
              <rect
                x="86"
                y="34"
                width="4"
                height="8"
                rx="1"
                fill="#292524"
              />
              <rect
                x="4"
                y="18"
                width="4.5"
                height="22"
                rx="1"
                fill="#334155"
              />
              <rect
                x="91.5"
                y="18"
                width="4.5"
                height="22"
                rx="1"
                fill="#334155"
              />
              <rect
                x="5"
                y="13"
                width="90"
                height="11"
                rx="1.5"
                fill="#92400e"
                stroke="#451a03"
                strokeWidth="1.2"
              />
              <polygon
                points="2,14 98,14 93,2 7,2"
                fill="#d97706"
                stroke="#78350f"
                strokeWidth="1.5"
              />
            </svg>
            <span
              className="absolute top-[6%] left-[7%] w-4 h-4 rounded-full bg-amber-950/90 border border-amber-300/90 text-amber-200 font-mono font-extrabold text-[8.5px] leading-none flex items-center justify-center shadow-sm"
              style={{
                transform: `scale(${Math.max(
                  0.85,
                  Math.min(1.3, safeDeskScale)
                )})`,
              }}
            >
              {deskNumber}
            </span>
          </div>
        )}

        {Array.from({ length: effectiveLeftCats }, (_, idx) => (
          <div
            key={`cat_left_${idx}_${
              idx === effectiveLeftCats - 1 ? leftCatDropAt || 1 : idx
            }`}
            className="absolute z-20"
            style={{
              left: `${6 + idx * leftStepPct}%`,
              top: `${idx % 2 === 0 ? -6 : -11}%`,
              transform: `translate(${catOffsetX}px, ${catOffsetY}px)`,
            }}
          >
            <div
              className="animate-bounce"
              style={{ animationIterationCount: 2 }}
            >
              <DeskCatModel
                customUrl={customAssets.deskCatUrl}
                scale={catScale}
              />
            </div>
          </div>
        ))}
        {Array.from({ length: effectiveRightCats }, (_, idx) => (
          <div
            key={`cat_right_${idx}_${
              idx === effectiveRightCats - 1 ? rightCatDropAt || 1 : idx
            }`}
            className="absolute z-20"
            style={{
              right: `${6 + idx * rightStepPct}%`,
              top: `${idx % 2 === 0 ? -6 : -11}%`,
              transform: `translate(${-catOffsetX}px, ${catOffsetY}px) scaleX(-1)`,
            }}
          >
            <div
              className="animate-bounce"
              style={{ animationIterationCount: 2 }}
            >
              <DeskCatModel
                customUrl={customAssets.deskCatUrl}
                scale={catScale}
              />
            </div>
          </div>
        ))}

        {leftHasSnack && (
          <div
            key={`snack_left_${leftSnackDropAt || 1}`}
            className="absolute left-[16%] top-[4%] z-20"
            style={{
              transform: `translate(-50%, 0) translate(${snackOffsetX}px, ${snackOffsetY}px)`,
            }}
          >
            <div
              className="animate-bounce"
              style={{ animationIterationCount: 2 }}
            >
              <SnackBagModel
                customUrl={customAssets.snackBagUrl}
                scale={snackScale}
              />
            </div>
          </div>
        )}

        {rightHasSnack && (
          <div
            key={`snack_right_${rightSnackDropAt || 1}`}
            className="absolute right-[16%] top-[4%] z-20"
            style={{
              transform: `translate(50%, 0) translate(${-snackOffsetX}px, ${snackOffsetY}px) scaleX(-1)`,
            }}
          >
            <div
              className="animate-bounce"
              style={{ animationIterationCount: 2 }}
            >
              <SnackBagModel
                customUrl={customAssets.snackBagUrl}
                scale={snackScale}
              />
            </div>
          </div>
        )}

        {leftHasPig && (
          <div
            key={`pig_desk_left_${leftPigDropAt || 1}`}
            className="absolute left-[28%] top-[-6%] z-20"
            style={{
              transform: `translate(-50%, 0) translate(${pigOffsetX}px, ${pigOffsetY}px)`,
            }}
          >
            <div
              className="animate-bounce"
              style={{ animationIterationCount: 2 }}
            >
              <RunningPigModel
                customUrl={customAssets.runningPigUrl}
                facingLeft={false}
                scale={Math.max(
                  0.4,
                  Math.min(2.5, (giftModelScales?.runningPig ?? 1) * 0.82)
                )}
              />
            </div>
          </div>
        )}

        {rightHasPig && (
          <div
            key={`pig_desk_right_${rightPigDropAt || 1}`}
            className="absolute right-[28%] top-[-6%] z-20"
            style={{
              transform: `translate(50%, 0) translate(${-pigOffsetX}px, ${pigOffsetY}px)`,
            }}
          >
            <div
              className="animate-bounce"
              style={{ animationIterationCount: 2 }}
            >
              <RunningPigModel
                customUrl={customAssets.runningPigUrl}
                facingLeft={true}
                scale={Math.max(
                  0.4,
                  Math.min(2.5, (giftModelScales?.runningPig ?? 1) * 0.82)
                )}
              />
            </div>
          </div>
        )}
      </div>
    );
  }
);

const ClassroomArtInner: React.FC<ClassroomArtProps> = ({
  vipSlots,
  normalSlots,
  pilgrims = [],
  customAssets,
  deskScale = 1,
  studentDeskGap = 24,
  giftModelScales = DEFAULT_GIFT_MODEL_SCALES,
  renderLayer = 'all',
}) => {
  const activeDeskUrl = customAssets.deskModelUrl || DEFAULT_DESK_IMAGE;
  const processedDeskUrl = useProcessedSingleCutout(activeDeskUrl);

  const vipDesks = useMemo(
    () => groupSlotsIntoDoubleDesks(vipSlots, 'vip'),
    [vipSlots]
  );
  const normalDesks = useMemo(
    () => groupSlotsIntoDoubleDesks(normalSlots, 'norm'),
    [normalSlots]
  );
  const allDesks = useMemo(
    () => [...vipDesks, ...normalDesks].sort((a, b) => a.centerY - b.centerY),
    [vipDesks, normalDesks]
  );

  const showBackground = renderLayer !== 'desks';
  const showDesks = renderLayer !== 'background';

  const occupantBySlotId = useMemo(() => {
    if (!showDesks) return new Map<string, PilgrimData>();
    const map = new Map<string, PilgrimData>();
    for (const p of pilgrims) {
      if (
        p.slotId &&
        p.state !== 'leave_side_to_aisle' &&
        p.state !== 'leave_down_exit'
      ) {
        map.set(p.slotId, p);
      }
    }
    return map;
  }, [pilgrims, showDesks]);

  return (
    <>
      {showBackground && (
        <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
          {/* 1. NỀN LỚP HỌC CẤP 3 VIỆT NAM (Tường vàng kem, cửa sổ nắng & hoa phượng, bảng phấn xanh, sàn gạch bông) */}
          {customAssets.customBgUrl ? (
            <img
              src={
                customAssets.customBgUrl.startsWith('/assets/')
                  ? `.${customAssets.customBgUrl}`
                  : customAssets.customBgUrl
              }
              alt="Classroom Background"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <svg
              viewBox="0 0 540 960"
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Màu tường lớp học cấp 3 vàng kem ấm áp */}
                <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fef3c7" />
                  <stop offset="65%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#fcd34d" />
                </linearGradient>

                {/* Màu bảng xanh viết phấn */}
                <linearGradient id="chalkboardGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#064e3b" />
                  <stop offset="55%" stopColor="#065f46" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>

                {/* Màu sàn lớp học gạch bông kem sáng */}
                <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e7e5e4" />
                  <stop offset="40%" stopColor="#f5f5f4" />
                  <stop offset="100%" stopColor="#d6d3d1" />
                </linearGradient>

                {/* Họa tiết gạch lát sàn lớp học */}
                <pattern
                  id="classroomTiles"
                  width="54"
                  height="45"
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width="54"
                    height="45"
                    fill="none"
                    stroke="#a8a29e"
                    strokeWidth="0.8"
                    strokeOpacity="0.38"
                  />
                  <line
                    x1="27"
                    y1="0"
                    x2="27"
                    y2="45"
                    stroke="#a8a29e"
                    strokeWidth="0.4"
                    strokeOpacity="0.25"
                  />
                </pattern>

                {/* Ánh nắng chiếu xiên qua cửa sổ lớp học */}
                <linearGradient id="sunbeamGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Tường phía trên (y: 0 -> 455) */}
              <rect x="0" y="0" width="540" height="455" fill="url(#wallGrad)" />

              {/* Chân tường ốp gỗ nâu cổ điển (y: 385 -> 455) */}
              <rect
                x="0"
                y="385"
                width="540"
                height="70"
                fill="#92400e"
                stroke="#78350f"
                strokeWidth="2"
              />
              {Array.from({ length: 18 }).map((_, i) => (
                <line
                  key={`wainscot-${i}`}
                  x1={i * 30}
                  y1="385"
                  x2={i * 30}
                  y2="455"
                  stroke="#78350f"
                  strokeWidth="1.2"
                  strokeOpacity="0.5"
                />
              ))}

              {/* Cửa sổ bên trái nhìn ra hàng phượng vĩ đỏ rực & bầu trời xanh */}
              <g transform="translate(8, 125)">
                <rect
                  x="0"
                  y="0"
                  width="48"
                  height="210"
                  rx="4"
                  fill="#bae6fd"
                  stroke="#78350f"
                  strokeWidth="4"
                />
                <circle cx="18" cy="52" r="22" fill="#16a34a" fillOpacity="0.85" />
                <circle cx="34" cy="76" r="18" fill="#15803d" fillOpacity="0.85" />
                <circle cx="16" cy="44" r="6" fill="#ef4444" />
                <circle cx="28" cy="58" r="5" fill="#f43f5e" />
                <circle cx="14" cy="68" r="5.5" fill="#dc2626" />
                <circle cx="32" cy="40" r="4.5" fill="#ef4444" />
                <line x1="0" y1="70" x2="48" y2="70" stroke="#78350f" strokeWidth="3.5" />
                <line x1="0" y1="140" x2="48" y2="140" stroke="#78350f" strokeWidth="3.5" />
                <line x1="24" y1="0" x2="24" y2="210" stroke="#78350f" strokeWidth="2.5" />
              </g>

              {/* Cửa sổ bên phải */}
              <g transform="translate(484, 125)">
                <rect
                  x="0"
                  y="0"
                  width="48"
                  height="210"
                  rx="4"
                  fill="#bae6fd"
                  stroke="#78350f"
                  strokeWidth="4"
                />
                <circle cx="30" cy="56" r="20" fill="#16a34a" fillOpacity="0.85" />
                <circle cx="16" cy="82" r="17" fill="#15803d" fillOpacity="0.85" />
                <circle cx="28" cy="48" r="6" fill="#ef4444" />
                <circle cx="18" cy="66" r="5" fill="#f43f5e" />
                <line x1="0" y1="70" x2="48" y2="70" stroke="#78350f" strokeWidth="3.5" />
                <line x1="0" y1="140" x2="48" y2="140" stroke="#78350f" strokeWidth="3.5" />
                <line x1="24" y1="0" x2="24" y2="210" stroke="#78350f" strokeWidth="2.5" />
              </g>

              {/* 2 Quạt trần xanh cổ điển trên trần lớp */}
              {[145, 395].map((cx, idx) => (
                <g key={`fan-${idx}`} transform={`translate(${cx}, 42)`}>
                  <line x1="0" y1="-42" x2="0" y2="0" stroke="#0f766e" strokeWidth="3" />
                  <ellipse cx="-34" cy="2" rx="26" ry="4.5" fill="#14b8a6" stroke="#0f766e" strokeWidth="1" />
                  <ellipse cx="34" cy="2" rx="26" ry="4.5" fill="#14b8a6" stroke="#0f766e" strokeWidth="1" />
                  <ellipse cx="0" cy="10" rx="8" ry="14" fill="#2dd4bf" stroke="#0f766e" strokeWidth="1" />
                  <circle cx="0" cy="0" r="8" fill="#0d9488" stroke="#115e59" strokeWidth="1.5" />
                </g>
              ))}

              {/* Khẩu hiệu đỏ trên bảng: TIÊN HỌC LỄ - HẬU HỌC VĂN */}
              <g transform="translate(82, 68)">
                <rect
                  x="0"
                  y="0"
                  width="376"
                  height="26"
                  rx="4"
                  fill="#b91c1c"
                  stroke="#facc15"
                  strokeWidth="2"
                />
                <text
                  x="188"
                  y="17.5"
                  textAnchor="middle"
                  fill="#fef08a"
                  fontSize="12.5"
                  fontWeight="900"
                  letterSpacing="1.8"
                >
                  TIÊN HỌC LỄ • HẬU HỌC VĂN
                </text>
              </g>

              {/* BẢNG PHẤN XANH LỚN (Chalkboard) (y: 102 -> 352) */}
              <g transform="translate(68, 102)">
                <rect
                  x="-6"
                  y="-6"
                  width="416"
                  height="258"
                  rx="6"
                  fill="#78350f"
                  stroke="#451a03"
                  strokeWidth="2"
                />
                <rect
                  x="0"
                  y="0"
                  width="404"
                  height="246"
                  rx="2"
                  fill="url(#chalkboardGrad)"
                />
                {Array.from({ length: 7 }).map((_, i) => (
                  <line
                    key={`chalk-line-${i}`}
                    x1="12"
                    y1={34 * (i + 1)}
                    x2="392"
                    y2={34 * (i + 1)}
                    stroke="#ffffff"
                    strokeOpacity="0.07"
                    strokeWidth="1"
                  />
                ))}

                <text
                  x="18"
                  y="26"
                  fill="#fef9c3"
                  fillOpacity="0.9"
                  fontSize="11"
                  fontWeight="700"
                >
                  Thứ Hai, Ngày Mới • Lớp 12A1 (Sĩ số: Đủ)
                </text>
                <text
                  x="202"
                  y="52"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="14.5"
                  fontWeight="800"
                  letterSpacing="0.8"
                >
                  TIẾT HỌC TƯƠNG TÁC TRỰC TUYẾN
                </text>
                <line
                  x1="100"
                  y1="60"
                  x2="304"
                  y2="60"
                  stroke="#fde047"
                  strokeWidth="1.5"
                  strokeOpacity="0.75"
                />

                <text
                  x="202"
                  y="88"
                  textAnchor="middle"
                  fill="#a7f3d0"
                  fontSize="11.5"
                  fontWeight="700"
                >
                  ★ Chủ đề: Ôn Tập Kiến Thức & Đố Vui Nhận Hoa Điểm 10 ★
                </text>
                <text
                  x="202"
                  y="114"
                  textAnchor="middle"
                  fill="#ffffff"
                  fillOpacity="0.88"
                  fontSize="10.5"
                >
                  1. Bình luận trả lời câu hỏi → Giơ tay phát biểu trên lớp
                </text>
                <text
                  x="202"
                  y="138"
                  textAnchor="middle"
                  fill="#ffffff"
                  fillOpacity="0.88"
                  fontSize="10.5"
                >
                  2. Tặng Quà Cô Giáo → Lên bục giảng + Ngồi Bàn Đầu VIP
                </text>
                <text
                  x="202"
                  y="162"
                  textAnchor="middle"
                  fill="#fde047"
                  fillOpacity="0.92"
                  fontSize="10.5"
                  fontWeight="700"
                >
                  3. Thả Tim & Follow → Tích điểm Mở Tiệc Trà Sữa Cả Lớp!
                </text>

                <g transform="translate(145, 178)">
                  <rect
                    x="0"
                    y="0"
                    width="114"
                    height="48"
                    rx="6"
                    fill="#022c22"
                    fillOpacity="0.45"
                    stroke="#6ee7b7"
                    strokeOpacity="0.4"
                    strokeDasharray="3 2"
                  />
                  <text
                    x="57"
                    y="20"
                    textAnchor="middle"
                    fill="#fde047"
                    fontSize="11"
                    fontWeight="800"
                  >
                    ∫ f(x)dx = Điểm 10
                  </text>
                  <text
                    x="57"
                    y="38"
                    textAnchor="middle"
                    fill="#fda4af"
                    fontSize="10"
                    fontWeight="700"
                  >
                    1 Xu = +150 Hoa Điểm 10
                  </text>
                </g>

                <rect
                  x="0"
                  y="244"
                  width="404"
                  height="8"
                  fill="#57534e"
                  stroke="#292524"
                  strokeWidth="1"
                />
                <rect x="85" y="239" width="24" height="6" rx="1.5" fill="#f59e0b" />
                <rect x="118" y="241" width="12" height="3.5" rx="1" fill="#ffffff" />
                <rect x="134" y="241" width="12" height="3.5" rx="1" fill="#fda4af" />
                <rect x="150" y="241" width="12" height="3.5" rx="1" fill="#fde047" />
              </g>

              {/* SÀN LỚP HỌC (y: 455 -> 960) */}
              <rect x="0" y="455" width="540" height="505" fill="url(#floorGrad)" />
              <rect
                x="0"
                y="455"
                width="540"
                height="505"
                fill="url(#classroomTiles)"
              />

              {/* BỤC GIẢNG GỖ (y: 446 -> 532) */}
              <g>
                <polygon
                  points="46,448 494,448 512,528 28,528"
                  fill="#b45309"
                  stroke="#78350f"
                  strokeWidth="2.5"
                />
                <polygon
                  points="52,452 488,452 504,520 36,520"
                  fill="#d97706"
                  fillOpacity="0.65"
                />
                <rect
                  x="28"
                  y="526"
                  width="484"
                  height="10"
                  rx="2"
                  fill="#78350f"
                />
              </g>

              {/* Thảm lối đi trung tâm & Thảm chào trước bàn Giáo viên */}
              <rect
                x="246"
                y="536"
                width="48"
                height="424"
                fill="#cbd5e1"
                fillOpacity="0.35"
              />

              {/* Ánh nắng chiếu nhẹ trên sàn lớp */}
              <polygon points="0,335 190,480 140,680 0,520" fill="url(#sunbeamGrad)" />

              {/* CỬA RA VÀO LỚP HỌC Ở CUỐI LỚP (y: 936 -> 960) */}
              <g transform="translate(215, 938)">
                <rect
                  x="0"
                  y="0"
                  width="110"
                  height="22"
                  rx="4"
                  fill="#78350f"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <text
                  x="55"
                  y="14"
                  textAnchor="middle"
                  fill="#fef3c7"
                  fontSize="9.5"
                  fontWeight="800"
                  letterSpacing="1"
                >
                  CỬA LỚP 12A1
                </text>
              </g>
            </svg>
          )}
        </div>
      )}

      {/* 3. HỆ THỐNG BÀN ĐÔI 2 CHỖ NGỒI ĐỒNG NHẤT (Memoized từng bàn: không re-render khi học sinh chạy ngoài hành lang) */}
      {showDesks &&
        allDesks.map((desk, deskIdx) => {
          const leftOccupant = occupantBySlotId.get(desk.leftSlot.id);
          const rightOccupant = desk.rightSlot
            ? occupantBySlotId.get(desk.rightSlot.id)
            : undefined;

          return (
            <DeskItem
              key={desk.deskId}
              deskId={desk.deskId}
              deskNumber={deskIdx + 1}
              centerX={desk.centerX}
              centerY={desk.centerY}
              width={desk.width}
              deskScale={deskScale}
              studentDeskGap={studentDeskGap}
              processedDeskUrl={processedDeskUrl}
              customAssets={customAssets}
              giftModelScales={giftModelScales}
              isPcGamingSkin={Boolean(
                leftOccupant?.hasPcGamingDesk || rightOccupant?.hasPcGamingDesk
              )}
              leftCatCount={
                leftOccupant?.hasDeskCat
                  ? Math.max(1, leftOccupant.deskCatCount || 1)
                  : 0
              }
              leftCatDropAt={leftOccupant?.deskCatDropAt || 0}
              rightCatCount={
                rightOccupant?.hasDeskCat
                  ? Math.max(1, rightOccupant.deskCatCount || 1)
                  : 0
              }
              rightCatDropAt={rightOccupant?.deskCatDropAt || 0}
              leftHasSnack={Boolean(leftOccupant?.hasDeskSnack)}
              leftSnackDropAt={leftOccupant?.deskSnackDropAt || 0}
              rightHasSnack={Boolean(rightOccupant?.hasDeskSnack)}
              rightSnackDropAt={rightOccupant?.deskSnackDropAt || 0}
              leftHasPig={Boolean(leftOccupant?.hasDeskPig)}
              leftPigDropAt={leftOccupant?.deskPigDropAt || 0}
              rightHasPig={Boolean(rightOccupant?.hasDeskPig)}
              rightPigDropAt={rightOccupant?.deskPigDropAt || 0}
            />
          );
        })}
    </>
  );
};

function areDeskOccupantsEqual(
  prevPilgrims: PilgrimData[] | undefined,
  nextPilgrims: PilgrimData[] | undefined
): boolean {
  if (prevPilgrims === nextPilgrims) return true;
  const a = prevPilgrims || [];
  const b = nextPilgrims || [];

  // Chỉ quan tâm tới học sinh đang ngồi/chiếm ghế có vật phẩm đặt trên mặt bàn
  let countA = 0;
  const mapA = new Map<string, PilgrimData>();
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    if (
      p.slotId &&
      p.state !== 'leave_side_to_aisle' &&
      p.state !== 'leave_down_exit' &&
      (p.hasPcGamingDesk || p.hasDeskCat || p.hasDeskSnack || p.hasDeskPig)
    ) {
      countA++;
      mapA.set(p.slotId, p);
    }
  }

  let countB = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (
      p.slotId &&
      p.state !== 'leave_side_to_aisle' &&
      p.state !== 'leave_down_exit' &&
      (p.hasPcGamingDesk || p.hasDeskCat || p.hasDeskSnack || p.hasDeskPig)
    ) {
      countB++;
      const prevP = mapA.get(p.slotId);
      if (
        !prevP ||
        Boolean(prevP.hasPcGamingDesk) !== Boolean(p.hasPcGamingDesk) ||
        Boolean(prevP.hasDeskCat) !== Boolean(p.hasDeskCat) ||
        (prevP.deskCatCount || 0) !== (p.deskCatCount || 0) ||
        (prevP.deskCatDropAt || 0) !== (p.deskCatDropAt || 0) ||
        Boolean(prevP.hasDeskSnack) !== Boolean(p.hasDeskSnack) ||
        (prevP.deskSnackDropAt || 0) !== (p.deskSnackDropAt || 0) ||
        Boolean(prevP.hasDeskPig) !== Boolean(p.hasDeskPig) ||
        (prevP.deskPigDropAt || 0) !== (p.deskPigDropAt || 0)
      ) {
        return false;
      }
    }
  }

  return countA === countB;
}

function areClassroomArtPropsEqual(
  prev: ClassroomArtProps,
  next: ClassroomArtProps
): boolean {
  if (prev.renderLayer !== next.renderLayer) return false;

  // Tầng nền SVG phòng học chỉ phụ thuộc vào ảnh nền tùy chỉnh (customBgUrl)
  if (next.renderLayer === 'background') {
    return prev.customAssets?.customBgUrl === next.customAssets?.customBgUrl;
  }

  if (
    prev.vipSlots !== next.vipSlots ||
    prev.normalSlots !== next.normalSlots ||
    prev.deskScale !== next.deskScale ||
    prev.studentDeskGap !== next.studentDeskGap ||
    prev.customAssets !== next.customAssets ||
    prev.giftModelScales !== next.giftModelScales
  ) {
    return false;
  }

  return areDeskOccupantsEqual(prev.pilgrims, next.pilgrims);
}

export const ClassroomArt = React.memo(
  ClassroomArtInner,
  areClassroomArtPropsEqual
);
