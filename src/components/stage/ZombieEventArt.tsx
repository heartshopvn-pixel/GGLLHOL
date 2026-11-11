import React from 'react';
import {
  CustomAssetsConfig,
  FlyingMilkTeaFX,
  OfferingGiftType,
  PaperPlaneFX,
  PaperPlaneHitBubbleFX,
  RoseHeartBurstFX,
  ZombieEntityState,
  ZombieProjectileFX,
  ZombieProjectileScalesConfig,
  ZombieSpikyDamageFX,
} from '../../types/game';
import { GoldTrophyIcon, RoseBouquetModel, SchoolGiftArt } from './SchoolGiftArt';

interface ZombieCharacterSpriteProps {
  zombie: ZombieEntityState;
  customAssets?: CustomAssetsConfig;
  scale?: number;
}

const ZombieCharacterSpriteInner: React.FC<ZombieCharacterSpriteProps> = ({
  zombie,
  customAssets,
  scale = 1.15,
}) => {
  if (!zombie.visible) return null;

  const isDying = zombie.isDying;
  const dyingProgress = Math.max(0, Math.min(1, zombie.dyingProgress || 0));
  // Khi hết máu: gục ngã nằm ngang (90 độ) rồi dần tan biến
  const rotationDeg = isDying ? Math.min(90, dyingProgress * 145) : 0;
  const opacity = isDying ? Math.max(0, 1 - Math.max(0, (dyingProgress - 0.25) / 0.75)) : 1;
  const dropY = isDying ? Math.min(26, dyingProgress * 36) : 0;

  const drawX = zombie.x + (zombie.recoilOffsetX || 0);
  const drawY = zombie.y + (zombie.recoilOffsetY || 0) + dropY;
  const isHit = Date.now() < (zombie.hitFlashUntil || 0);

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${drawX}px`,
        top: `${drawY}px`,
        zIndex: Math.max(22, Math.round(zombie.y) + 2),
        transform: `translate(-50%, -100%) scale(${scale})`,
        opacity,
        transition: isDying ? 'opacity 0.15s linear' : undefined,
      }}
    >
      {/* Hào quang độc khí quanh Zombie */}
      {!isDying && (
        <div className="absolute -inset-3 rounded-full bg-emerald-500/15 blur-md animate-pulse pointer-events-none" />
      )}

      {/* Thân Zombie (xoay ngang khi gục ngã) */}
      <div
        className={`relative origin-bottom transition-transform duration-150 ${
          zombie.isWalking && !isDying ? 'animate-bounce' : ''
        }`}
        style={{
          transform: `rotate(${rotationDeg}deg) scaleX(${zombie.facing === 'left' ? -1 : 1})`,
          filter: isHit
            ? 'brightness(2.1) saturate(2.2) drop-shadow(0 0 12px rgba(239, 68, 68, 0.95))'
            : 'drop-shadow(0 6px 10px rgba(0,0,0,0.65))',
        }}
      >
        {customAssets?.zombieSpriteUrl ? (
          <img
            src={customAssets.zombieSpriteUrl}
            alt="Zombie"
            className="w-24 h-28 object-contain"
          />
        ) : (
          <svg
            width="92"
            height="108"
            viewBox="0 0 92 108"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Tóc rối đen tím */}
            <path
              d="M24 14C24 7 33 3 46 3C59 3 68 7 68 14L72 22H20L24 14Z"
              fill="#1E1B2E"
            />
            <path d="M22 10L16 18L26 16L22 10Z" fill="#1E1B2E" />
            <path d="M70 10L76 18L66 16L70 10Z" fill="#1E1B2E" />

            {/* Đầu Zombie xanh tái */}
            <rect
              x="23"
              y="12"
              width="46"
              height="36"
              rx="8"
              fill="#65A34E"
              stroke="#1F2937"
              strokeWidth="3"
            />
            {/* Vết khâu trên trán */}
            <path
              d="M30 19H44M33 16V22M38 16V22M42 16V22"
              stroke="#1F2937"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Mắt đỏ phát sáng dữ tợn */}
            <circle cx="35" cy="29" r="6" fill="#111827" />
            <circle cx="57" cy="29" r="6" fill="#111827" />
            <circle cx="36" cy="29" r="3.5" fill="#EF4444" />
            <circle cx="58" cy="29" r="3.5" fill="#EF4444" />
            <circle cx="37" cy="28" r="1.2" fill="#FEF08A" />
            <circle cx="59" cy="28" r="1.2" fill="#FEF08A" />

            {/* Miệng gầm gừ răng nanh */}
            <rect
              x="32"
              y="38"
              width="28"
              height="7"
              rx="2"
              fill="#450A0A"
              stroke="#111827"
              strokeWidth="2"
            />
            <path d="M36 38V42M42 38V43M48 38V42M54 38V43" stroke="#F8FAFC" strokeWidth="2.2" />

            {/* Áo sơ mi học sinh rách tả tơi + cà vạt đỏ */}
            <path
              d="M24 48H68L72 80L63 77L58 82L49 77L44 82L35 77L28 82L20 79L24 48Z"
              fill="#CBD5E1"
              stroke="#1F2937"
              strokeWidth="3"
            />
            {/* Cà vạt đỏ */}
            <path d="M44 48H49L51 66L46.5 71L42 66L44 48Z" fill="#DC2626" />
            {/* Vết bẩn trên áo */}
            <circle cx="34" cy="60" r="4" fill="#4D7C0F" fillOpacity="0.6" />
            <circle cx="58" cy="66" r="5" fill="#991B1B" fillOpacity="0.55" />

            {/* Hai tay giơ thẳng phía trước kiểu Zombie */}
            <rect
              x="54"
              y="50"
              width="32"
              height="10"
              rx="4"
              fill="#65A34E"
              stroke="#1F2937"
              strokeWidth="2.5"
            />
            <rect
              x="58"
              y="62"
              width="30"
              height="10"
              rx="4"
              fill="#4D7C0F"
              stroke="#1F2937"
              strokeWidth="2.5"
            />

            {/* Quần tối màu */}
            <rect
              x="29"
              y="79"
              width="14"
              height="20"
              rx="3"
              fill="#1E293B"
              stroke="#0F172A"
              strokeWidth="2.5"
            />
            <rect
              x="49"
              y="79"
              width="14"
              height="20"
              rx="3"
              fill="#1E293B"
              stroke="#0F172A"
              strokeWidth="2.5"
            />

            {/* Giày */}
            <rect x="27" y="96" width="18" height="8" rx="3" fill="#0F172A" />
            <rect x="48" y="96" width="18" height="8" rx="3" fill="#0F172A" />
          </svg>
        )}
      </div>

      {/* Nhãn tên Zombie trên đầu */}
      {!isDying && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-red-950/90 border border-red-500/80 text-[10px] font-black text-red-200 shadow-lg font-pixel-vi">
          🧟 ZOMBIE
        </div>
      )}
    </div>
  );
};

export const ZombieCharacterSprite = React.memo(ZombieCharacterSpriteInner);

interface ZombieProjectileSpriteProps {
  proj: ZombieProjectileFX;
  customAssets?: CustomAssetsConfig;
  projectileScales?: ZombieProjectileScalesConfig;
  nameTagFontFamily?: string;
  nameTagScale?: number;
  nameTagHeight?: number;
  nameTagMaxChars?: number;
}

const clampProjScale = (val: number | undefined): number => {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.25, Math.min(3.5, n));
};

const ZombieProjectileSpriteInner: React.FC<ZombieProjectileSpriteProps> = ({
  proj,
  customAssets,
  projectileScales,
  nameTagFontFamily = '"Be Vietnam Pro", system-ui, sans-serif',
  nameTagScale = 1,
  nameTagHeight = 20,
  nameTagMaxChars = 16,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tailRef = React.useRef<HTMLDivElement>(null);
  const spinRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let rafId = 0;
    const arcHeight =
      proj.kind === 'desk_mate' || proj.kind === 'chair' ? 95 : 50;
    const totalSpin =
      proj.kind === 'desk_mate' || proj.kind === 'chair' ? 1080 : 720;
    const safeDur = Math.max(120, proj.durationMs);

    const update = () => {
      const elapsed = Date.now() - proj.createdAt;
      if (elapsed < 0) {
        if (containerRef.current && containerRef.current.style.opacity !== '0') {
          containerRef.current.style.opacity = '0';
        }
        rafId = requestAnimationFrame(update);
        return;
      }

      const p = Math.max(0, Math.min(1, elapsed / safeDur));

      const curX = proj.startX + (proj.targetX - proj.startX) * p;
      const linearY = proj.startY + (proj.targetY - proj.startY) * p;
      const curY = linearY - Math.sin(p * Math.PI) * arcHeight;

      const prevP = Math.max(0, p - 0.12);
      const tailX = proj.startX + (proj.targetX - proj.startX) * prevP;
      const tailLinearY = proj.startY + (proj.targetY - proj.startY) * prevP;
      const tailY = tailLinearY - Math.sin(prevP * Math.PI) * arcHeight;

      const dx = curX - tailX;
      const dy = curY - tailY;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const tailLen = Math.min(58, Math.hypot(dx, dy) * 1.35);
      const spinDeg = p * totalSpin;

      if (containerRef.current) {
        containerRef.current.style.opacity = p >= 1 ? '0' : '1';
        containerRef.current.style.left = `${curX.toFixed(1)}px`;
        containerRef.current.style.top = `${curY.toFixed(1)}px`;
      }
      if (tailRef.current) {
        tailRef.current.style.width = `${tailLen.toFixed(1)}px`;
        tailRef.current.style.transform = `translateY(-50%) rotate(${angleDeg.toFixed(1)}deg)`;
      }
      if (spinRef.current) {
        spinRef.current.style.transform = `translate(-50%, -50%) rotate(${spinDeg.toFixed(1)}deg)`;
      }

      if (p < 1) {
        rafId = requestAnimationFrame(update);
      }
    };
    update();
    return () => cancelAnimationFrame(rafId);
  }, [proj.createdAt, proj.durationMs, proj.kind, proj.startX, proj.startY, proj.targetX, proj.targetY]);

  const heartVariant = proj.heartVariant || 'pencil_case';

  const activeScale =
    proj.kind === 'desk_mate'
      ? clampProjScale(projectileScales?.deskMate)
      : proj.kind === 'chair'
      ? clampProjScale(projectileScales?.chair)
      : proj.kind === 'book'
      ? clampProjScale(projectileScales?.book)
      : heartVariant === 'blue_ruler'
      ? clampProjScale(projectileScales?.blueRuler)
      : heartVariant === 'casio'
      ? clampProjScale(projectileScales?.casio)
      : clampProjScale(projectileScales?.pencilCase);

  const tailColor =
    proj.kind === 'desk_mate'
      ? 'from-fuchsia-500/85 via-amber-300/60 to-transparent'
      : proj.kind === 'chair'
      ? 'from-orange-500/90 via-amber-300/65 to-transparent'
      : proj.kind === 'book'
      ? 'from-sky-400/80 via-cyan-200/40 to-transparent'
      : heartVariant === 'blue_ruler'
      ? 'from-sky-400/85 via-blue-300/50 to-transparent'
      : heartVariant === 'casio'
      ? 'from-cyan-300/80 via-slate-200/45 to-transparent'
      : 'from-yellow-300/80 via-amber-200/40 to-transparent';

  const baseTailHeight =
    proj.kind === 'desk_mate' || proj.kind === 'chair' ? 12 : 6;
  const scaledTailHeight = Math.max(
    3,
    Math.min(28, Math.round(baseTailHeight * Math.sqrt(activeScale)))
  );

  const renderUploadedImg = (url: string, alt: string, sizePx: number) => (
    <div
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      className="relative flex items-center justify-center shrink-0"
    >
      <img
        src={url}
        alt={alt}
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          maxWidth: 'none',
          maxHeight: 'none',
        }}
        className="block max-w-none object-contain select-none pointer-events-none"
      />
    </div>
  );

  const renderModel = () => {
    if (proj.kind === 'pencil_case' && !proj.giftId) {
      if (heartVariant === 'blue_ruler') {
        const rulerSizePx = Math.max(12, Math.round(36 * activeScale));
        if (customAssets?.projBlueRulerUrl) {
          return renderUploadedImg(
            customAssets.projBlueRulerUrl,
            'Thước ê-ke xanh dương',
            rulerSizePx
          );
        }
        return (
          <div
            style={{ width: `${rulerSizePx}px`, height: `${rulerSizePx}px` }}
            className="relative flex items-center justify-center shrink-0"
          >
            <svg
              width={rulerSizePx}
              height={rulerSizePx}
              viewBox="0 0 40 40"
              fill="none"
            >
              {/* Thân thước ê-ke tam giác vuông nhựa xanh dương trong */}
              <polygon
                points="5,5 5,35 35,35"
                fill="#38BDF8"
                fillOpacity="0.9"
                stroke="#075985"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              {/* Dải phản quang cạnh huyền */}
              <line
                x1="7"
                y1="8.5"
                x2="31.5"
                y2="33"
                stroke="#BAE6FD"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              {/* Lỗ tam giác rỗng ở giữa thước ê-ke */}
              <polygon
                points="11.5,18.5 11.5,29.5 22.5,29.5"
                fill="#0C4A6E"
                fillOpacity="0.55"
                stroke="#E0F2FE"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              {/* Vạch chia cm cạnh đứng */}
              <path
                d="M5 10H8.5M5 14H7.5M5 18H9M5 22H7.5M5 26H9M5 30H7.5"
                stroke="#F0F9FF"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              {/* Vạch chia cm cạnh đáy */}
              <path
                d="M10 35V31.5M14 35V32.5M18 35V31M22 35V32.5M26 35V31M30 35V32.5"
                stroke="#F0F9FF"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      }

      if (heartVariant === 'casio') {
        const casioSizePx = Math.max(12, Math.round(36 * activeScale));
        if (customAssets?.projCasioUrl) {
          return renderUploadedImg(
            customAssets.projCasioUrl,
            'Máy tính Casio',
            casioSizePx
          );
        }
        return (
          <div
            style={{ width: `${casioSizePx}px`, height: `${casioSizePx}px` }}
            className="relative flex items-center justify-center shrink-0"
          >
            <svg
              width={casioSizePx}
              height={casioSizePx}
              viewBox="0 0 40 40"
              fill="none"
            >
              {/* Thân máy tính Casio FX vỏ xám đen */}
              <rect
                x="8"
                y="3"
                width="24"
                height="34"
                rx="4"
                fill="#1E293B"
                stroke="#0F172A"
                strokeWidth="2.2"
              />
              {/* Viền mặt trong */}
              <rect
                x="10"
                y="5"
                width="20"
                height="30"
                rx="2.5"
                fill="#334155"
              />
              {/* Ô pin năng lượng mặt trời nhỏ góc phải trên */}
              <rect
                x="22"
                y="6.2"
                width="6.5"
                height="2.4"
                rx="0.6"
                fill="#78350F"
                stroke="#CBD5E1"
                strokeWidth="0.5"
              />
              <rect x="11.5" y="6.5" width="7" height="1.8" rx="0.5" fill="#E2E8F0" />
              {/* Màn hình LCD xanh bạc hà đặc trưng của Casio */}
              <rect
                x="11.2"
                y="9.8"
                width="17.6"
                height="6.8"
                rx="1.2"
                fill="#CCFBF1"
                stroke="#0F766E"
                strokeWidth="1.1"
              />
              <text
                x="27.2"
                y="15"
                textAnchor="end"
                fontSize="5.2"
                fontWeight="900"
                fill="#0F172A"
                fontFamily="monospace"
              >
                580
              </text>
              {/* Nút điều hướng tròn màu bạc ở giữa */}
              <circle
                cx="20"
                cy="19.8"
                r="2.3"
                fill="#CBD5E1"
                stroke="#0F172A"
                strokeWidth="0.8"
              />
              <rect x="11.5" y="18.6" width="4.2" height="2" rx="0.5" fill="#64748B" />
              <rect x="24.3" y="18.6" width="4.2" height="2" rx="0.5" fill="#64748B" />
              {/* Lưới phím số trắng xám + 2 nút DEL / AC màu cam đỏ thương hiệu Casio */}
              <rect x="11.5" y="23.2" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="16" y="23.2" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="20.5" y="23.2" width="3.6" height="2.4" rx="0.5" fill="#FB923C" />
              <rect x="25" y="23.2" width="3.6" height="2.4" rx="0.5" fill="#F97316" />

              <rect x="11.5" y="26.8" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="16" y="26.8" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="20.5" y="26.8" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="25" y="26.8" width="3.6" height="2.4" rx="0.5" fill="#94A3B8" />

              <rect x="11.5" y="30.4" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="16" y="30.4" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="20.5" y="30.4" width="3.6" height="2.4" rx="0.5" fill="#E2E8F0" />
              <rect x="25" y="30.4" width="3.6" height="2.4" rx="0.5" fill="#38BDF8" />
            </svg>
          </div>
        );
      }

      const pencilSizePx = Math.max(12, Math.round(32 * activeScale));
      if (customAssets?.projPencilCaseUrl) {
        return renderUploadedImg(
          customAssets.projPencilCaseUrl,
          'Hộp bút',
          pencilSizePx
        );
      }
      // Icon tượng trưng Hộp bút (Pencil Case) khi thả tim
      return (
        <div
          style={{ width: `${pencilSizePx}px`, height: `${pencilSizePx}px` }}
          className="relative flex items-center justify-center shrink-0"
        >
          <svg
            width={pencilSizePx}
            height={pencilSizePx}
            viewBox="0 0 32 32"
            fill="none"
          >
            <rect
              x="4"
              y="10"
              width="24"
              height="12"
              rx="4"
              fill="#F59E0B"
              stroke="#78350F"
              strokeWidth="2.2"
            />
            <path
              d="M6 16H26"
              stroke="#FEF3C7"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
            <rect x="12" y="13" width="8" height="6" rx="1.5" fill="#EF4444" />
          </svg>
        </div>
      );
    }

    if (proj.kind === 'book') {
      const bookSizePx = Math.max(14, Math.round(40 * activeScale));
      if (customAssets?.projBookUrl) {
        return renderUploadedImg(
          customAssets.projBookUrl,
          'Đạn quà 1 xu',
          bookSizePx
        );
      }
      return (
        <div
          style={{ width: `${bookSizePx}px`, height: `${bookSizePx}px` }}
          className="relative flex items-center justify-center shrink-0"
        >
          <SchoolGiftArt
            type={(proj.giftId || 'rose') as OfferingGiftType}
            customAssets={customAssets}
            size="md"
            className="!w-full !h-full object-contain"
          />
        </div>
      );
    }

    if (proj.kind === 'chair') {
      const chairSizePx = Math.max(16, Math.round(60 * activeScale));
      if (customAssets?.projChairUrl) {
        return renderUploadedImg(
          customAssets.projChairUrl,
          'Đạn ghế gỗ 5 xu',
          chairSizePx
        );
      }
      // Đạn hình Cái Ghế Gỗ học sinh kích thước lớn xoay vòng mạnh mẽ như ném đứa bàn bên
      return (
        <div
          style={{ width: `${chairSizePx}px`, height: `${chairSizePx}px` }}
          className="relative flex items-center justify-center shrink-0"
        >
          <svg
            width={Math.max(14, Math.round(58 * activeScale))}
            height={Math.max(14, Math.round(58 * activeScale))}
            viewBox="0 0 64 64"
            fill="none"
            className="drop-shadow-[0_4px_10px_rgba(249,115,22,0.65)]"
          >
            {/* Hai chân sau kiêm trụ tựa lưng ghế gỗ */}
            <rect
              x="14"
              y="6"
              width="6"
              height="52"
              rx="2"
              fill="#B45309"
              stroke="#451A03"
              strokeWidth="2.4"
            />
            <rect
              x="44"
              y="6"
              width="6"
              height="52"
              rx="2"
              fill="#B45309"
              stroke="#451A03"
              strokeWidth="2.4"
            />
            {/* Nan tựa lưng trên & giữa */}
            <rect
              x="16"
              y="10"
              width="32"
              height="8"
              rx="2"
              fill="#D97706"
              stroke="#451A03"
              strokeWidth="2.4"
            />
            <rect
              x="16"
              y="22"
              width="32"
              height="6"
              rx="1.5"
              fill="#F59E0B"
              stroke="#451A03"
              strokeWidth="2.2"
            />
            {/* Mặt ghế gỗ dày bản rộng */}
            <polygon
              points="10,34 54,34 58,42 6,42"
              fill="#F59E0B"
              stroke="#451A03"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            <rect
              x="8"
              y="41"
              width="48"
              height="5"
              rx="1.5"
              fill="#92400E"
              stroke="#451A03"
              strokeWidth="2.2"
            />
            {/* Hai chân ghế phía trước + thanh giằng ngang */}
            <rect
              x="10"
              y="45"
              width="6.5"
              height="15"
              rx="2"
              fill="#D97706"
              stroke="#451A03"
              strokeWidth="2.4"
            />
            <rect
              x="47.5"
              y="45"
              width="6.5"
              height="15"
              rx="2"
              fill="#D97706"
              stroke="#451A03"
              strokeWidth="2.4"
            />
            <rect
              x="15"
              y="51"
              width="34"
              height="4"
              rx="1"
              fill="#92400E"
              stroke="#451A03"
              strokeWidth="2"
            />
          </svg>
        </div>
      );
    }

    // desk_mate: Đứa bàn bên bị ném xoay vòng — dùng hình ảnh upload (projDeskMateUrl) hoặc chính icon quà tặng + gắn dính Thẻ tên bạn bàn bên xoay theo đạn
    const deskMateSizePx = Math.max(16, Math.round(56 * activeScale));
    const rawSeatmateName = (proj.seatmateName || 'Bạn cùng bàn').trim();
    const maxNameChars = Math.max(4, nameTagMaxChars || 16);
    const displaySeatmateName =
      rawSeatmateName.length > maxNameChars
        ? rawSeatmateName.slice(0, maxNameChars)
        : rawSeatmateName;

    return (
      <div
        style={{ width: `${deskMateSizePx}px`, height: `${deskMateSizePx}px` }}
        className="relative flex items-center justify-center shrink-0"
      >
        {customAssets?.projDeskMateUrl ? (
          <img
            src={customAssets.projDeskMateUrl}
            alt={rawSeatmateName}
            style={{
              width: `${deskMateSizePx}px`,
              height: `${deskMateSizePx}px`,
              maxWidth: 'none',
              maxHeight: 'none',
            }}
            className="block max-w-none object-contain select-none pointer-events-none"
          />
        ) : (
          <SchoolGiftArt
            type={(proj.giftId || 'pig') as OfferingGiftType}
            customAssets={customAssets}
            size="md"
            className="!w-full !h-full object-contain"
          />
        )}

        {/* Bản sao Thẻ Tên của bạn bàn bên gắn dính vào model đạn và xoay theo đạn */}
        <div
          style={{
            fontFamily: nameTagFontFamily,
            height: `${Math.max(12, Math.min(40, Math.round(Number(nameTagHeight ?? 20))))}px`,
            paddingTop: 0,
            paddingBottom: 0,
            transform: `translateX(-50%) scale(${(nameTagScale || 1).toFixed(2)})`,
            transformOrigin: '50% 0%',
          }}
          className={`absolute top-full left-1/2 -mt-1.5 pl-0 pr-1.5 py-0 rounded-full flex items-center gap-1 whitespace-nowrap leading-none ${
            proj.seatmateIsGolden
              ? 'bg-amber-950/95 border border-yellow-300 text-yellow-200 shadow-[0_0_10px_rgba(250,204,21,0.85)]'
              : proj.seatmateIsVip
              ? 'bg-amber-950/90 border border-amber-400/80 text-amber-200 shadow-sm'
              : 'bg-slate-950/85 border border-slate-700/80 text-slate-100 shadow-sm'
          }`}
        >
          {proj.seatmateAvatarUrl ? (
            <img
              src={proj.seatmateAvatarUrl}
              alt=""
              style={{ width: '16px', height: '16px' }}
              className="w-4 h-4 max-w-none rounded-full object-cover border border-white/40 shrink-0 -ml-px"
            />
          ) : (
            <span
              className="w-4 h-4 rounded-full shrink-0 inline-block border border-white/30 -ml-px"
              style={{
                width: '16px',
                height: '16px',
                backgroundColor: proj.seatmateAvatarColor || '#38bdf8',
              }}
            />
          )}
          <span
            className={`text-[9.5px] leading-none font-bold tracking-tight ${
              proj.seatmateIsGolden ? 'text-yellow-300 font-black' : ''
            }`}
          >
            {displaySeatmateName}
          </span>
          {(proj.seatmateIsVip || proj.seatmateIsGolden) && (
            <span className="text-[8px] leading-none font-extrabold text-yellow-300">
              {proj.seatmateIsGolden ? '👑' : '★'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="absolute w-0 h-0 pointer-events-none select-none will-change-transform"
      style={{
        left: `${proj.startX}px`,
        top: `${proj.startY}px`,
        opacity: Date.now() < proj.createdAt ? 0 : 1,
        zIndex: 22500,
      }}
    >
      {/* Đuôi đạn gắn chính xác vào tâm (0, 0) của model đạn */}
      <div
        ref={tailRef}
        className={`absolute rounded-full bg-gradient-to-l ${tailColor} blur-[1px]`}
        style={{
          right: 0,
          top: 0,
          width: '0px',
          height: `${scaledTailHeight}px`,
          transformOrigin: '100% 50%',
          transform: 'translateY(-50%) rotate(0deg)',
        }}
      />

      {/* Model đạn xoay tròn quanh tâm (0, 0) */}
      <div
        ref={spinRef}
        className="absolute left-0 top-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
        style={{
          transform: 'translate(-50%, -50%) rotate(0deg)',
        }}
      >
        {renderModel()}
      </div>
    </div>
  );
};

export const ZombieProjectileSprite = React.memo(ZombieProjectileSpriteInner);

interface ZombieSpikyDamageBubbleProps {
  fx: ZombieSpikyDamageFX;
}

const ZombieSpikyDamageBubbleInner: React.FC<ZombieSpikyDamageBubbleProps> = ({
  fx,
}) => {
  const bubbleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let rafId = 0;
    const baseScale = fx.scale || 1;
    const tick = () => {
      const elapsed = Date.now() - fx.createdAt;
      const p = Math.max(0, Math.min(1, elapsed / 900));
      const curX = fx.x + fx.vx * p;
      const curY = fx.y + fx.vy * p - Math.sin(p * Math.PI) * 18;
      const scale =
        p < 0.2 ? 0.5 + (p / 0.2) * 0.75 : 1.25 - (p - 0.2) * 0.35;
      const opacity = p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;

      if (bubbleRef.current) {
        bubbleRef.current.style.left = `${curX.toFixed(1)}px`;
        bubbleRef.current.style.top = `${curY.toFixed(1)}px`;
        bubbleRef.current.style.transform = `translate(-50%, -50%) scale(${(
          scale * baseScale
        ).toFixed(3)})`;
        bubbleRef.current.style.opacity = opacity.toFixed(2);
      }
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    tick();
    return () => cancelAnimationFrame(rafId);
  }, [fx.createdAt, fx.scale, fx.vx, fx.vy, fx.x, fx.y]);

  return (
    <div
      ref={bubbleRef}
      className="absolute pointer-events-none select-none will-change-transform"
      style={{
        left: `${fx.x}px`,
        top: `${fx.y}px`,
        zIndex: 23000,
        transform: `translate(-50%, -50%) scale(${0.5 * (fx.scale || 1)})`,
        opacity: 1,
      }}
    >
      {/* Hình vụ nổ gai nhọn màu kem vàng (Spiky Speech Bubble - viền mỏng, số to rõ dễ đọc) */}
      <div className="relative flex items-center justify-center w-22 h-22">
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
        >
          <polygon
            points="50,3 61,21 81,10 75,31 96,35 81,51 97,68 75,70 79,91 59,79 50,97 41,79 21,91 25,70 3,68 19,51 4,35 25,31 19,10 39,21"
            fill="#FEF3C7"
            stroke="#F59E0B"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="relative z-10 font-sans font-black text-red-600 text-base sm:text-lg tabular-nums tracking-tight leading-none drop-shadow-[0_1px_0_#ffffff]"
          style={{
            fontFamily: '"Be Vietnam Pro", "Inter", system-ui, -apple-system, sans-serif',
          }}
        >
          -{fx.damage.toLocaleString('vi-VN')}
        </span>
      </div>
    </div>
  );
};

export const ZombieSpikyDamageBubble = React.memo(ZombieSpikyDamageBubbleInner);

interface FlyingMilkTeaSpriteProps {
  tea: FlyingMilkTeaFX;
  customAssets?: CustomAssetsConfig;
}

const FlyingMilkTeaSpriteInner: React.FC<FlyingMilkTeaSpriteProps> = ({
  tea,
  customAssets,
}) => {
  const cupRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let rafId = 0;
    const safeDur = Math.max(300, tea.durationMs);
    const itemScale =
      tea.variant === 'gold_trophy'
        ? Math.max(0.5, (tea.scale || 1) * 0.72)
        : Math.max(0.5, tea.scale || 1);
    const tick = () => {
      const elapsed = Date.now() - tea.createdAt;
      const p = Math.max(0, Math.min(1, elapsed / safeDur));
      const curX = tea.startX + (tea.targetX - tea.startX) * p;
      const linearY = tea.startY + (tea.targetY - tea.startY) * p;
      const curY = linearY - Math.sin(p * Math.PI) * 85;
      const sc = (0.85 + Math.sin(p * Math.PI) * 0.25) * itemScale;

      if (cupRef.current) {
        cupRef.current.style.left = `${curX.toFixed(1)}px`;
        cupRef.current.style.top = `${curY.toFixed(1)}px`;
        cupRef.current.style.transform = `translate(-50%, -50%) scale(${sc.toFixed(3)})`;
      }
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    tick();
    return () => cancelAnimationFrame(rafId);
  }, [
    tea.createdAt,
    tea.durationMs,
    tea.scale,
    tea.startX,
    tea.startY,
    tea.targetX,
    tea.targetY,
    tea.variant,
  ]);

  return (
    <div
      ref={cupRef}
      className="absolute pointer-events-none select-none will-change-transform"
      style={{
        left: `${tea.startX}px`,
        top: `${tea.startY}px`,
        zIndex: 950,
        transform: 'translate(-50%, -50%) scale(0.85)',
      }}
    >
      {tea.variant === 'gold_trophy' ? (
        <div className="relative flex items-center justify-center">
          <div className="absolute w-10 h-10 rounded-full bg-yellow-300/35 blur-[4px]" />
          <GoldTrophyIcon className="relative z-10 w-10 h-11 drop-shadow-[0_4px_10px_rgba(250,204,21,0.85)]" />
        </div>
      ) : customAssets?.milkTeaCupUrl ? (
        <img src={customAssets.milkTeaCupUrl} alt="Trà sữa Matcha Latte" className="w-10 h-12 object-contain" />
      ) : (
        <div className="relative flex flex-col items-center">
          {/* Ly trà sữa Matcha Latte full topping trân châu */}
          <svg width="38" height="46" viewBox="0 0 38 46" fill="none" className="drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
            {/* Ống hút */}
            <path d="M23 2L19 14" stroke="#EC4899" strokeWidth="4" strokeLinecap="round" />
            {/* Nắp cầu kem cheese */}
            <path d="M8 15C8 9.5 13 6 19 6C25 6 30 9.5 30 15H8Z" fill="#FEFCE8" stroke="#1F2937" strokeWidth="2" />
            {/* Thân ly Matcha xanh mát */}
            <path d="M8 15H30L27 41C27 42.5 25.5 44 24 44H14C12.5 44 11 42.5 11 41L8 15Z" fill="#86EFAC" stroke="#1F2937" strokeWidth="2.2" />
            {/* Lớp kem sữa trắng phía trên */}
            <path d="M9 16H29L28.3 22H9.7L9 16Z" fill="#ECFCCB" />
            {/* Trân châu đen full topping dưới đáy */}
            <circle cx="14" cy="39" r="2.3" fill="#1F2937" />
            <circle cx="19" cy="40" r="2.3" fill="#1F2937" />
            <circle cx="24" cy="39" r="2.3" fill="#1F2937" />
            <circle cx="16.5" cy="35" r="2.2" fill="#1F2937" />
            <circle cx="21.5" cy="35" r="2.2" fill="#1F2937" />
          </svg>
        </div>
      )}
    </div>
  );
};

export const FlyingMilkTeaSprite = React.memo(FlyingMilkTeaSpriteInner);

interface PaperPlaneProjectileSpriteProps {
  plane: PaperPlaneFX;
  planeScale?: number;
  customAssets?: CustomAssetsConfig;
  roseBouquetScale?: number;
}

const PaperPlaneProjectileSpriteInner: React.FC<PaperPlaneProjectileSpriteProps> = ({
  plane,
  planeScale = 1,
  customAssets,
  roseBouquetScale = 1,
}) => {
  const isRoseBouquet = plane.projectileKind === 'rose_bouquet';
  const containerRef = React.useRef<HTMLDivElement>(null);
  const planeBodyRef = React.useRef<HTMLDivElement>(null);
  const tailGlowPathRef = React.useRef<SVGPathElement>(null);
  const tailCorePathRef = React.useRef<SVGPathElement>(null);
  const gradGlowRef = React.useRef<SVGLinearGradientElement>(null);
  const gradCoreRef = React.useRef<SVGLinearGradientElement>(null);

  const gradIdBase = React.useMemo(
    () => `pp_tail_${plane.id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [plane.id]
  );

  const effectiveScale = Math.max(
    0.25,
    Math.min(4, Number(plane.scale ?? planeScale ?? 1))
  );
  const scaledTailWidth = Math.max(3.5, 7.5 * effectiveScale);
  const scaledCoreWidth = Math.max(1.8, 3.2 * effectiveScale);

  React.useEffect(() => {
    let rafId = 0;
    const p0x = plane.startX;
    const p0y = plane.startY;
    const p1x = plane.targetX;
    const p1y = plane.targetY;
    const totalDx = p1x - p0x;
    const totalDy = p1y - p0y;
    const dist = Math.hypot(totalDx, totalDy);
    const safeDuration = Math.max(180, plane.durationMs);

    // 1 đường cong bậc 2 (Quadratic Bézier) đơn giản, mượt mà từ điểm đầu đến điểm cuối
    const arcLift = Math.max(38, Math.min(120, dist * 0.28 + 20));
    const sideOffset =
      Math.abs(totalDx) < 16 ? (p0x < 270 ? 22 : -22) : 0;
    const cx = (p0x + p1x) * 0.5 + sideOffset;
    const cy = Math.min(p0y, p1y) - arcLift;

    const evalFlightPoint = (tRaw: number): { x: number; y: number } => {
      const t = Math.max(0, Math.min(1, tRaw));
      const u = 1 - t;
      return {
        x: u * u * p0x + 2 * u * t * cx + t * t * p1x,
        y: u * u * p0y + 2 * u * t * cy + t * t * p1y,
      };
    };

    const tick = () => {
      const elapsed = Date.now() - plane.createdAt;
      if (elapsed < 0) {
        if (containerRef.current) {
          containerRef.current.style.opacity = '0';
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      const p = Math.max(0, Math.min(1, elapsed / safeDuration));
      const cur = evalFlightPoint(p);

      // Hướng mũi máy bay theo đúng tiếp tuyến mượt của đường cong đơn giản
      const u = 1 - p;
      const vx = 2 * u * (cx - p0x) + 2 * p * (p1x - cx);
      const vy = 2 * u * (cy - p0y) + 2 * p * (p1y - cy);
      const angleDeg =
        Math.hypot(vx, vy) < 0.05 ? 0 : (Math.atan2(vy, vx) * 180) / Math.PI;

      // Vẽ đuôi đạn cong mượt bám sát theo đúng cung tròn vừa bay qua
      const trailSpan = Math.min(p, 0.2);
      if (trailSpan > 0.004) {
        const steps = 6;
        let pathD = '';
        let tailTipDx = 0;
        let tailTipDy = 0;
        for (let i = 0; i <= steps; i++) {
          const ti = p - trailSpan * (1 - i / steps);
          const tp = evalFlightPoint(ti);
          const lx = tp.x - cur.x;
          const ly = tp.y - cur.y;
          if (i === 0) {
            tailTipDx = lx;
            tailTipDy = ly;
            pathD = `M ${lx.toFixed(1)} ${ly.toFixed(1)}`;
          } else {
            pathD += ` L ${lx.toFixed(1)} ${ly.toFixed(1)}`;
          }
        }
        if (tailGlowPathRef.current) {
          tailGlowPathRef.current.setAttribute('d', pathD);
        }
        if (tailCorePathRef.current) {
          tailCorePathRef.current.setAttribute('d', pathD);
        }
        if (gradGlowRef.current) {
          gradGlowRef.current.setAttribute('x1', tailTipDx.toFixed(1));
          gradGlowRef.current.setAttribute('y1', tailTipDy.toFixed(1));
        }
        if (gradCoreRef.current) {
          gradCoreRef.current.setAttribute('x1', tailTipDx.toFixed(1));
          gradCoreRef.current.setAttribute('y1', tailTipDy.toFixed(1));
        }
      } else {
        if (tailGlowPathRef.current) tailGlowPathRef.current.setAttribute('d', '');
        if (tailCorePathRef.current) tailCorePathRef.current.setAttribute('d', '');
      }

      if (containerRef.current) {
        containerRef.current.style.opacity = '1';
        containerRef.current.style.left = `${cur.x.toFixed(1)}px`;
        containerRef.current.style.top = `${cur.y.toFixed(1)}px`;
      }
      if (planeBodyRef.current) {
        const bodyRotDeg = isRoseBouquet ? angleDeg + 90 : angleDeg;
        planeBodyRef.current.style.transform = `translate(-50%, -50%) rotate(${bodyRotDeg.toFixed(
          1
        )}deg) scale(${effectiveScale.toFixed(3)})`;
      }

      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    effectiveScale,
    isRoseBouquet,
    plane.createdAt,
    plane.durationMs,
    plane.startX,
    plane.startY,
    plane.targetX,
    plane.targetY,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute w-0 h-0 pointer-events-none select-none will-change-transform"
      style={{
        left: `${plane.startX}px`,
        top: `${plane.startY}px`,
        opacity: Date.now() < plane.createdAt ? 0 : 1,
        zIndex: 24500,
      }}
    >
      {/* Đuôi đạn ánh vàng bám sát đường cong đơn giản */}
      <svg
        width="2"
        height="2"
        viewBox="-1 -1 2 2"
        className="absolute left-0 top-0 overflow-visible pointer-events-none"
      >
        <defs>
          <linearGradient
            ref={gradGlowRef}
            id={`${gradIdBase}_glow`}
            gradientUnits="userSpaceOnUse"
            x1="-40"
            y1="20"
            x2="0"
            y2="0"
          >
            {isRoseBouquet ? (
              <>
                <stop offset="0%" stopColor="#BE123C" stopOpacity="0" />
                <stop offset="55%" stopColor="#F43F5E" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#FDA4AF" stopOpacity="0.96" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0" />
                <stop offset="55%" stopColor="#FACC15" stopOpacity="0.68" />
                <stop offset="100%" stopColor="#FEF08A" stopOpacity="0.96" />
              </>
            )}
          </linearGradient>
          <linearGradient
            ref={gradCoreRef}
            id={`${gradIdBase}_core`}
            gradientUnits="userSpaceOnUse"
            x1="-40"
            y1="20"
            x2="0"
            y2="0"
          >
            {isRoseBouquet ? (
              <>
                <stop offset="0%" stopColor="#FFE4E6" stopOpacity="0" />
                <stop offset="100%" stopColor="#FFF1F2" stopOpacity="0.98" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#FEF9C3" stopOpacity="0" />
                <stop offset="100%" stopColor="#FFFBEB" stopOpacity="0.98" />
              </>
            )}
          </linearGradient>
        </defs>
        <path
          ref={tailGlowPathRef}
          d=""
          fill="none"
          stroke={`url(#${gradIdBase}_glow)`}
          strokeWidth={scaledTailWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="blur-[1px]"
        />
        <path
          ref={tailCorePathRef}
          d=""
          fill="none"
          stroke={`url(#${gradIdBase}_core)`}
          strokeWidth={scaledCoreWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Model Bó Hoa Hồng tặng bạn (dùng cùng model hoa tặng Cô) hoặc Máy Bay Giấy màu vàng */}
      <div
        ref={planeBodyRef}
        className="absolute left-0 top-0 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]"
        style={{
          transform: `translate(-50%, -50%) scale(${effectiveScale.toFixed(3)})`,
        }}
      >
        {isRoseBouquet ? (
          <RoseBouquetModel
            customUrl={
              customAssets?.roseBouquetUrl || customAssets?.offeringRoseUrl
            }
            scale={roseBouquetScale}
            className="w-8 h-8"
          />
        ) : (
          <svg width="34" height="26" viewBox="0 0 44 32" fill="none">
            {/* Cánh trên vàng sáng */}
            <path
              d="M41 16L5 4L12.5 15.5L41 16Z"
              fill="#FEF08A"
              stroke="#422006"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Nếp gấp bụng giữa vàng cam tạo chiều sâu khối 3D */}
            <path
              d="M41 16L12.5 15.5L15.5 22.5L41 16Z"
              fill="#F59E0B"
              stroke="#422006"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Cánh dưới vàng tươi */}
            <path
              d="M41 16L14 18.2L6 28L41 16Z"
              fill="#FACC15"
              stroke="#422006"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Đường sống mũi sắc nét */}
            <path
              d="M12.5 15.5L41 16"
              stroke="#B45309"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export const PaperPlaneProjectileSprite = React.memo(
  PaperPlaneProjectileSpriteInner
);

interface PaperPlaneEmptySpikyBubbleProps {
  fx: PaperPlaneHitBubbleFX;
}

const PaperPlaneEmptySpikyBubbleInner: React.FC<
  PaperPlaneEmptySpikyBubbleProps
> = ({ fx }) => {
  const bubbleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let rafId = 0;
    const baseScale = Math.max(0.4, Math.min(3, fx.scale ?? 1));
    const totalMs = 680;

    const tick = () => {
      const elapsed = Date.now() - fx.createdAt;
      const p = Math.max(0, Math.min(1, elapsed / totalMs));
      const popScale =
        p < 0.22
          ? 0.35 + (p / 0.22) * 0.82
          : p < 0.55
          ? 1.17 - ((p - 0.22) / 0.33) * 0.17
          : 1.0 - ((p - 0.55) / 0.45) * 0.15;
      const liftY = -Math.sin(p * Math.PI) * 5;
      const opacity = p > 0.68 ? Math.max(0, 1 - (p - 0.68) / 0.32) : 1;

      if (bubbleRef.current) {
        bubbleRef.current.style.top = `${(fx.y + liftY).toFixed(1)}px`;
        bubbleRef.current.style.transform = `translate(-50%, -50%) scale(${(
          popScale * baseScale
        ).toFixed(3)})`;
        bubbleRef.current.style.opacity = opacity.toFixed(2);
      }

      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [fx.createdAt, fx.scale, fx.y]);

  return (
    <div
      ref={bubbleRef}
      className="absolute pointer-events-none select-none will-change-transform"
      style={{
        left: `${fx.x}px`,
        top: `${fx.y}px`,
        zIndex: 25500,
        transform: 'translate(-50%, -50%) scale(0.4)',
      }}
    >
      {/* Bong bóng gai trống nhỏ ngay vị trí đầu bị ném trúng (không chứa chữ bên trong) */}
      <svg
        className="w-8 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
        viewBox="0 0 100 100"
        fill="none"
      >
        <polygon
          points="50,4 61,23 82,11 75,32 96,36 80,51 96,68 74,70 79,91 59,78 50,96 41,78 21,91 26,70 4,68 20,51 4,36 25,32 18,11 39,23"
          fill="#FEF9C3"
          stroke="#EA580C"
          strokeWidth="3.8"
          strokeLinejoin="round"
        />
        <polygon
          points="50,18 58,31 73,24 68,38 83,42 71,52 82,63 67,65 70,79 56,70 50,82 44,70 30,79 33,65 18,63 29,52 17,42 32,38 27,24 42,31"
          fill="#FFFFFF"
          opacity="0.72"
        />
      </svg>
    </div>
  );
};

export const PaperPlaneEmptySpikyBubble = React.memo(
  PaperPlaneEmptySpikyBubbleInner
);

export interface RoseHeartParticleVec {
  dx: number;
  dy: number;
  rot: number;
  delayMs: number;
  scale: number;
  fill: string;
}

const RED_HEART_PALETTE = [
  '#ef4444',
  '#e11d48',
  '#dc2626',
  '#f43f5e',
  '#be123c',
  '#fb7185',
];

export function buildRoseHeartBurstVectors(
  rawCount = 14,
  rawSpread = 1.0
): RoseHeartParticleVec[] {
  const count = Math.max(4, Math.min(32, Math.round(rawCount || 14)));
  const spread = Math.max(0.35, Math.min(3.0, Number(rawSpread || 1)));
  const vectors: RoseHeartParticleVec[] = [];
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const jitterAngle = ((i * 37) % 11 - 5) * 0.045;
    const angle = baseAngle + jitterAngle;
    const ringFactor = i % 3 === 0 ? 1.06 : i % 3 === 1 ? 0.78 : 0.92;
    const radius = (38 * ringFactor + (i % 2 === 0 ? 6 : 0)) * spread;
    const dx = Math.round(Math.cos(angle) * radius);
    const dy = Math.round(Math.sin(angle) * radius - 10 * spread);
    const rot = Math.round(Math.cos(angle) * 34);
    const delayMs = (i * 19) % 115;
    const scale = Number(
      (i % 3 === 0 ? 1.18 : i % 3 === 1 ? 0.88 : 1.02).toFixed(2)
    );
    const fill = RED_HEART_PALETTE[i % RED_HEART_PALETTE.length];
    vectors.push({ dx, dy, rot, delayMs, scale, fill });
  }
  return vectors;
}

export const RedHeartSvgIcon: React.FC<{
  fill?: string;
  className?: string;
}> = ({ fill = '#e11d48', className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none">
    <path
      d="M16 27.6C15.4 27.6 14.8 27.4 14.3 27C8.2 22.1 4 17.6 4 11.9C4 7.7 7.2 4.5 11.2 4.5C13.4 4.5 15.2 5.5 16 7.1C16.8 5.5 18.6 4.5 20.8 4.5C24.8 4.5 28 7.7 28 11.9C28 17.6 23.8 22.1 17.7 27C17.2 27.4 16.6 27.6 16 27.6Z"
      fill={fill}
      stroke="#881337"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9.2 9.4C10.2 8.1 11.8 7.6 13.1 8"
      stroke="#FFE4E6"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

interface RoseHeartBurstSpriteProps {
  fx: RoseHeartBurstFX;
  offsetX?: number;
  offsetY?: number;
}

const RoseHeartBurstSpriteInner: React.FC<RoseHeartBurstSpriteProps> = ({
  fx,
  offsetX = 0,
  offsetY = 0,
}) => {
  const safeScale = Math.max(0.3, Math.min(3.2, Number(fx.scale ?? 1)));
  const safeDurationMs = Math.max(
    450,
    Math.min(3000, Math.round(fx.durationMs ?? 1100))
  );
  const vectors = React.useMemo(
    () => buildRoseHeartBurstVectors(fx.count ?? 14, fx.spread ?? 1),
    [fx.count, fx.spread]
  );

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${fx.x + offsetX}px`,
        top: `${fx.y + offsetY}px`,
        transform: `translate(-50%, -50%) scale(${safeScale.toFixed(2)})`,
        zIndex: 25600,
      }}
    >
      <style>{`
        @keyframes vfxRoseHeartCoreFlash {
          0% {
            transform: translate(-50%, -50%) scale(0.25);
            opacity: 0.95;
          }
          55% {
            transform: translate(-50%, -50%) scale(1.45);
            opacity: 0.65;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.05);
            opacity: 0;
          }
        }
        @keyframes vfxRoseHeartParticleBurst {
          0% {
            transform: translate(-50%, -50%) scale(0.25) rotate(0deg);
            opacity: 0;
          }
          16% {
            opacity: 1;
          }
          72% {
            opacity: 0.96;
          }
          100% {
            transform: translate(
                calc(-50% + var(--rh-dx)),
                calc(-50% + var(--rh-dy))
              )
              scale(var(--rh-s))
              rotate(var(--rh-rot));
            opacity: 0;
          }
        }
      `}</style>

      {/* Vòng sáng tâm điểm nổ tim đỏ rực */}
      <div
        className="absolute left-0 top-0 w-10 h-10 rounded-full bg-rose-500/65 border-2 border-rose-200 blur-[1px]"
        style={{
          animation: `vfxRoseHeartCoreFlash ${Math.round(
            safeDurationMs * 0.58
          )}ms ease-out forwards`,
        }}
      />

      {/* Các trái tim đỏ bung nổ 360 độ */}
      {vectors.map((vec, idx) => (
        <div
          key={idx}
          className="absolute left-0 top-0 drop-shadow-[0_2px_4px_rgba(136,19,55,0.65)]"
          style={
            {
              '--rh-dx': `${vec.dx}px`,
              '--rh-dy': `${vec.dy}px`,
              '--rh-rot': `${vec.rot}deg`,
              '--rh-s': vec.scale,
              animation: `vfxRoseHeartParticleBurst ${safeDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1) ${vec.delayMs}ms forwards`,
              opacity: 0,
            } as React.CSSProperties
          }
        >
          <RedHeartSvgIcon fill={vec.fill} className="w-4 h-4" />
        </div>
      ))}
    </div>
  );
};

export const RoseHeartBurstSprite = React.memo(RoseHeartBurstSpriteInner);

