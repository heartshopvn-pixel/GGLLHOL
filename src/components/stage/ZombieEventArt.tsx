import React from 'react';
import {
  CustomAssetsConfig,
  FlyingMilkTeaFX,
  OfferingGiftType,
  ZombieEntityState,
  ZombieProjectileFX,
  ZombieSpikyDamageFX,
} from '../../types/game';
import { SchoolGiftArt } from './SchoolGiftArt';

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
  nameTagFontFamily?: string;
  nameTagScale?: number;
  nameTagMaxChars?: number;
}

const ZombieProjectileSpriteInner: React.FC<ZombieProjectileSpriteProps> = ({
  proj,
  customAssets,
  nameTagFontFamily = '"Be Vietnam Pro", system-ui, sans-serif',
  nameTagScale = 1,
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

  const tailColor =
    proj.kind === 'desk_mate'
      ? 'from-fuchsia-500/85 via-amber-300/60 to-transparent'
      : proj.kind === 'chair'
      ? 'from-orange-500/90 via-amber-300/65 to-transparent'
      : proj.kind === 'book'
      ? 'from-sky-400/80 via-cyan-200/40 to-transparent'
      : 'from-yellow-300/80 via-amber-200/40 to-transparent';

  const renderModel = () => {
    if (proj.kind === 'pencil_case' && !proj.giftId) {
      if (customAssets?.projPencilCaseUrl) {
        return (
          <img
            src={customAssets.projPencilCaseUrl}
            alt="Hộp bút"
            className="w-8 h-8 object-contain"
          />
        );
      }
      // Icon tượng trưng Hộp bút (Pencil Case) khi thả tim
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
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
          <path d="M6 16H26" stroke="#FEF3C7" strokeWidth="2" strokeDasharray="3 2" />
          <rect x="12" y="13" width="8" height="6" rx="1.5" fill="#EF4444" />
        </svg>
      );
    }

    if (proj.kind === 'book') {
      if (customAssets?.projBookUrl) {
        return (
          <img
            src={customAssets.projBookUrl}
            alt="Đạn quà 1 xu"
            className="w-10 h-10 object-contain"
          />
        );
      }
      return (
        <SchoolGiftArt
          type={(proj.giftId || 'rose') as OfferingGiftType}
          customAssets={customAssets}
          size="md"
          className="w-10 h-10 object-contain"
        />
      );
    }

    if (proj.kind === 'chair') {
      if (customAssets?.projChairUrl) {
        return (
          <img
            src={customAssets.projChairUrl}
            alt="Đạn ghế gỗ 5 xu"
            className="w-15 h-15 object-contain"
          />
        );
      }
      // Đạn hình Cái Ghế Gỗ học sinh kích thước lớn (60x60px) xoay vòng mạnh mẽ như ném đứa bàn bên
      return (
        <div className="relative w-15 h-15 flex items-center justify-center">
          <svg
            width="58"
            height="58"
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
    const rawSeatmateName = (proj.seatmateName || 'Bạn cùng bàn').trim();
    const maxNameChars = Math.max(4, nameTagMaxChars || 16);
    const displaySeatmateName =
      rawSeatmateName.length > maxNameChars
        ? `${rawSeatmateName.slice(0, maxNameChars)}…`
        : rawSeatmateName;

    return (
      <div className="relative w-14 h-14 flex items-center justify-center">
        {customAssets?.projDeskMateUrl ? (
          <img
            src={customAssets.projDeskMateUrl}
            alt={rawSeatmateName}
            className="w-14 h-14 object-contain"
          />
        ) : (
          <SchoolGiftArt
            type={(proj.giftId || 'pig') as OfferingGiftType}
            customAssets={customAssets}
            size="md"
            className="w-13 h-13 object-contain"
          />
        )}

        {/* Bản sao Thẻ Tên của bạn bàn bên gắn dính vào model đạn và xoay theo đạn */}
        <div
          style={{
            fontFamily: nameTagFontFamily,
            transform: `translateX(-50%) scale(${(nameTagScale || 1).toFixed(2)})`,
            transformOrigin: '50% 0%',
          }}
          className={`absolute top-full left-1/2 -mt-1.5 h-[20px] pl-0 pr-1.5 py-0 rounded-full flex items-center gap-1 whitespace-nowrap ${
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
              className="w-4 h-4 rounded-full object-cover border border-white/40 shrink-0 -ml-px"
            />
          ) : (
            <span
              className="w-4 h-4 rounded-full shrink-0 inline-block border border-white/30 -ml-px"
              style={{ backgroundColor: proj.seatmateAvatarColor || '#38bdf8' }}
            />
          )}
          <span
            className={`text-[9.5px] font-bold tracking-tight py-0.5 ${
              proj.seatmateIsGolden ? 'text-yellow-300 font-black' : ''
            }`}
          >
            {displaySeatmateName}
          </span>
          {(proj.seatmateIsVip || proj.seatmateIsGolden) && (
            <span className="text-[8px] font-extrabold text-yellow-300">
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
          height:
            proj.kind === 'desk_mate' || proj.kind === 'chair' ? '12px' : '6px',
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
    const tick = () => {
      const elapsed = Date.now() - tea.createdAt;
      const p = Math.max(0, Math.min(1, elapsed / safeDur));
      const curX = tea.startX + (tea.targetX - tea.startX) * p;
      const linearY = tea.startY + (tea.targetY - tea.startY) * p;
      const curY = linearY - Math.sin(p * Math.PI) * 85;
      const sc = 0.85 + Math.sin(p * Math.PI) * 0.25;

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
  }, [tea.createdAt, tea.durationMs, tea.startX, tea.startY, tea.targetX, tea.targetY]);

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
      {customAssets?.milkTeaCupUrl ? (
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
