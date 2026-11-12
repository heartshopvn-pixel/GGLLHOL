import React from 'react';
import { CustomAssetsConfig, OfferingGiftType } from '../../types/game';

interface SchoolGiftArtProps {
  type: OfferingGiftType;
  customAssets?: CustomAssetsConfig;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Icon Hoa Điểm 10 / Hoa Sen Hồng không viền đen dùng cho Floating Text +điểm & Bảng Hoa Điểm 10
 */
export const Flower10BadgeIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 36 36"
    className={`inline-block shrink-0 ${className}`}
    fill="none"
  >
    {/* 5 cánh hoa hồng phấn / đỏ tươi mềm mại không viền đen */}
    <circle cx="18" cy="8.5" r="6.5" fill="#fb7185" />
    <circle cx="27" cy="15" r="6.5" fill="#f43f5e" />
    <circle cx="23.5" cy="25.5" r="6.5" fill="#fb7185" />
    <circle cx="12.5" cy="25.5" r="6.5" fill="#f43f5e" />
    <circle cx="9" cy="15" r="6.5" fill="#fb7185" />
    {/* Tầng cánh trong hồng sáng */}
    <circle cx="18" cy="11.5" r="4.2" fill="#fda4af" />
    <circle cx="24" cy="16" r="4.2" fill="#fda4af" />
    <circle cx="21.5" cy="22.8" r="4.2" fill="#fda4af" />
    <circle cx="14.5" cy="22.8" r="4.2" fill="#fda4af" />
    <circle cx="12" cy="16" r="4.2" fill="#fda4af" />
    {/* Nhụy vàng rực điểm 10 */}
    <circle cx="18" cy="18" r="6.2" fill="#fde047" />
    <text
      x="18"
      y="20.8"
      textAnchor="middle"
      fontSize="7.8"
      fontWeight="900"
      fill="#be123c"
      fontFamily="sans-serif"
    >
      10
    </text>
  </svg>
);

/**
 * Icon Cúp Vàng Vô Địch 2 quai ánh kim dùng cho Lễ Tuyên Dương Top 1-2-3, Floating Text, Thẻ Cúp dưới Thẻ Tên & Bảng Kỷ Lục Cúp Vàng
 */
export const GoldTrophyIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 40 44"
    className={`inline-block shrink-0 ${className}`}
    fill="none"
  >
    {/* Hai quai cúp vàng uốn cong 2 bên */}
    <path
      d="M10 10H5.5C3.8 10 2.5 11.4 2.8 13.1C3.5 17.8 6.8 21.2 11.5 21.8"
      stroke="#FACC15"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M30 10H34.5C36.2 10 37.5 11.4 37.2 13.1C36.5 17.8 33.2 21.2 28.5 21.8"
      stroke="#EAB308"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    {/* Đế cúp 2 tầng vững chãi */}
    <rect
      x="11"
      y="36"
      width="18"
      height="5"
      rx="2"
      fill="#B45309"
      stroke="#451A03"
      strokeWidth="1.5"
    />
    <rect
      x="14"
      y="32"
      width="12"
      height="4.5"
      rx="1.5"
      fill="#F59E0B"
      stroke="#78350F"
      strokeWidth="1.3"
    />
    {/* Chân trụ cúp */}
    <path
      d="M17.5 26H22.5L23.5 32.5H16.5L17.5 26Z"
      fill="#FACC15"
      stroke="#78350F"
      strokeWidth="1.3"
    />
    {/* Bầu cúp vàng ánh kim */}
    <path
      d="M9.5 6.5H30.5L28.8 17.5C28 22.8 24.4 26.5 20 26.5C15.6 26.5 12 22.8 11.2 17.5L9.5 6.5Z"
      fill="#FDE047"
      stroke="#78350F"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    {/* Miệng cúp sáng bóng */}
    <rect
      x="8.5"
      y="4.5"
      width="23"
      height="3.5"
      rx="1.75"
      fill="#FEF9C3"
      stroke="#78350F"
      strokeWidth="1.3"
    />
    {/* Vệt phản quang dọc thân cúp */}
    <path
      d="M13.5 9.5L14.6 17.5C15 19.8 16.2 21.5 17.8 22.4"
      stroke="#FEFCE8"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    {/* Ngôi sao vô địch chính giữa */}
    <polygon
      points="20,10.5 21.6,13.9 25.3,14.4 22.6,17 23.3,20.6 20,18.9 16.7,20.6 17.4,17 14.7,14.4 18.4,13.9"
      fill="#FFFBEB"
      stroke="#B45309"
      strokeWidth="0.9"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 1. Model Bó Hoa Hồng (Dùng khi học sinh cầm hoa tặng Cô / Thầy & Hoa bay)
 */
export const RoseBouquetModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  className?: string;
}> = ({ customUrl, scale = 1, className = 'w-7 h-7' }) => {
  const s = Math.max(0.3, Math.min(3, scale || 1));
  return (
    <div
      className={`inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ transform: `scale(${s})` }}
    >
      {customUrl ? (
        <img
          src={customUrl}
          alt="Bó hoa hồng"
          className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
        />
      ) : (
        <svg viewBox="0 0 48 48" className="w-full h-full overflow-visible">
          {/* Giấy gói bó hoa hình phễu hồng pastel */}
          <polygon
            points="12,20 36,20 27,43 21,43"
            fill="#fbcfe8"
            stroke="#ec4899"
            strokeWidth="1.5"
          />
          <polygon points="15,20 33,20 24,36" fill="#f9a8d4" />
          {/* Nơ ruy băng đỏ */}
          <ellipse cx="20" cy="34" rx="4.2" ry="2.4" fill="#e11d48" />
          <ellipse cx="28" cy="34" rx="4.2" ry="2.4" fill="#e11d48" />
          <circle cx="24" cy="34" r="2.2" fill="#fef08a" />
          {/* Lá xanh */}
          <ellipse cx="14" cy="18" rx="4.5" ry="2.5" transform="rotate(-25 14 18)" fill="#22c55e" />
          <ellipse cx="34" cy="18" rx="4.5" ry="2.5" transform="rotate(25 34 18)" fill="#22c55e" />
          {/* 3 bông hồng đỏ thắm rực rỡ */}
          <circle cx="17" cy="15" r="6" fill="#e11d48" />
          <circle cx="17" cy="15" r="3.5" fill="#fb7185" />
          <circle cx="31" cy="15" r="6" fill="#e11d48" />
          <circle cx="31" cy="15" r="3.5" fill="#fb7185" />
          <circle cx="24" cy="11" r="6.8" fill="#be123c" />
          <circle cx="24" cy="11" r="4.2" fill="#f43f5e" />
          <circle cx="24" cy="11" r="2" fill="#fda4af" />
        </svg>
      )}
    </div>
  );
};

/**
 * Model Cúp Vàng Danh Giá Đặt Trên Bàn Học (Khi đạt Top 1, 2, 3 — cùng kích thước đồng nhất, đặt tại vị trí con mèo)
 */
export const DeskTrophyModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  className?: string;
}> = ({ customUrl, scale = 1, className = 'w-7 h-7' }) => {
  const s = Math.max(0.3, Math.min(3, scale || 1));
  return (
    <div
      className={`inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ transform: `scale(${s})` }}
    >
      {customUrl ? (
        <img
          src={customUrl}
          alt="Cúp trên bàn"
          className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]"
        />
      ) : (
        <svg viewBox="0 0 44 46" className="w-full h-full overflow-visible">
          {/* Bóng đổ trên mặt bàn */}
          <ellipse cx="22" cy="41.5" rx="12" ry="3.2" fill="rgba(0,0,0,0.32)" />
          {/* Hai quai cúp vàng uốn cong 2 bên */}
          <path
            d="M12 11H7.5C5.8 11 4.5 12.4 4.8 14.1C5.5 18.8 8.8 22.2 13.5 22.8"
            stroke="#FACC15"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M32 11H36.5C38.2 11 39.5 12.4 39.2 14.1C38.5 18.8 35.2 22.2 30.5 22.8"
            stroke="#EAB308"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Đế cúp 2 tầng vững chãi */}
          <rect
            x="13"
            y="36.5"
            width="18"
            height="5"
            rx="2"
            fill="#B45309"
            stroke="#451A03"
            strokeWidth="1.5"
          />
          <rect
            x="16"
            y="32.5"
            width="12"
            height="4.5"
            rx="1.5"
            fill="#F59E0B"
            stroke="#78350F"
            strokeWidth="1.3"
          />
          {/* Chân trụ cúp */}
          <path
            d="M19.5 26.5H24.5L25.5 33H18.5L19.5 26.5Z"
            fill="#FACC15"
            stroke="#78350F"
            strokeWidth="1.3"
          />
          {/* Bầu cúp vàng ánh kim */}
          <path
            d="M11.5 7.5H32.5L30.8 18.5C30 23.8 26.4 27.5 22 27.5C17.6 27.5 14 23.8 13.2 18.5L11.5 7.5Z"
            fill="#FDE047"
            stroke="#78350F"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Miệng cúp sáng bóng */}
          <rect
            x="10.5"
            y="5.5"
            width="23"
            height="3.5"
            rx="1.75"
            fill="#FEF9C3"
            stroke="#78350F"
            strokeWidth="1.3"
          />
          {/* Vệt phản quang dọc thân cúp */}
          <path
            d="M15.5 10.5L16.6 18.5C17 20.8 18.2 22.5 19.8 23.4"
            stroke="#FEFCE8"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Ngôi sao vô địch chính giữa */}
          <polygon
            points="22,11.5 23.6,14.9 27.3,15.4 24.6,18 25.3,21.6 22,19.9 18.7,21.6 19.4,18 16.7,15.4 20.4,14.9"
            fill="#FFFBEB"
            stroke="#B45309"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};

/**
 * 2. Model Con Mèo Nằm Trên Bàn Học (Nuôi mèo)
 */
export const DeskCatModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  facingLeft?: boolean;
  className?: string;
}> = ({ customUrl, scale = 1, facingLeft = false, className = 'w-7 h-7' }) => {
  const s = Math.max(0.3, Math.min(3, scale || 1));
  return (
    <div
      className={`inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{
        transform: `scale(${s}) scaleX(${facingLeft ? -1 : 1})`,
      }}
    >
      {customUrl ? (
        <img
          src={customUrl}
          alt="Con mèo"
          className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
        />
      ) : (
        <svg viewBox="0 0 48 40" className="w-full h-full overflow-visible">
          {/* Bóng đổ dưới mặt bàn */}
          <ellipse cx="24" cy="34" rx="15" ry="4" fill="rgba(0,0,0,0.28)" />
          {/* Đuôi mèo cong vểnh lên */}
          <path
            d="M35 28 Q44 22 41 13"
            stroke="#f59e0b"
            strokeWidth="4.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Thân mèo cam tròn nằm cuộn */}
          <ellipse
            cx="26"
            cy="27"
            rx="12"
            ry="7.5"
            fill="#fbbf24"
            stroke="#b45309"
            strokeWidth="1.4"
          />
          {/* Vằn lưng mèo */}
          <path d="M24 20 L24 25" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
          <path d="M29 20.5 L29 25" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
          {/* Tai mèo nhọn */}
          <polygon points="10,16 12,7 17,13" fill="#fbbf24" stroke="#b45309" strokeWidth="1.2" />
          <polygon points="11.5,14.5 12.5,9.5 15.5,13" fill="#fda4af" />
          <polygon points="19,13 23,6 25,15" fill="#fbbf24" stroke="#b45309" strokeWidth="1.2" />
          <polygon points="20,13 22.5,8.5 23.8,14" fill="#fda4af" />
          {/* Đầu mèo */}
          <circle
            cx="17"
            cy="20"
            r="8.5"
            fill="#fde047"
            stroke="#b45309"
            strokeWidth="1.4"
          />
          {/* Mắt mèo long lanh */}
          <circle cx="14" cy="19" r="1.6" fill="#1e293b" />
          <circle cx="19.5" cy="19" r="1.6" fill="#1e293b" />
          {/* Mũi hồng & má hồng */}
          <polygon points="16.8,21 15.6,22.5 18,22.5" fill="#f43f5e" />
          <ellipse cx="12" cy="21.5" rx="1.8" ry="1" fill="#fb7185" fillOpacity="0.65" />
          <ellipse cx="21.5" cy="21.5" rx="1.8" ry="1" fill="#fb7185" fillOpacity="0.65" />
          {/* Chân trước trắng */}
          <ellipse cx="14" cy="32" rx="3.2" ry="2" fill="#ffffff" stroke="#b45309" strokeWidth="1" />
          <ellipse cx="21" cy="32.5" rx="3.2" ry="2" fill="#ffffff" stroke="#b45309" strokeWidth="1" />
        </svg>
      )}
    </div>
  );
};

/**
 * 3. Model Gói Snack Ăn Vụn Trên Bàn Học (GG: Ăn vụn)
 */
export const SnackBagModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  className?: string;
}> = ({ customUrl, scale = 1, className = 'w-6 h-6' }) => {
  const s = Math.max(0.3, Math.min(3, scale || 1));
  return (
    <div
      className={`inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ transform: `scale(${s})` }}
    >
      {customUrl ? (
        <img
          src={customUrl}
          alt="Gói snack"
          className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
        />
      ) : (
        <svg viewBox="0 0 44 44" className="w-full h-full overflow-visible">
          <ellipse cx="22" cy="38" rx="12" ry="3.2" fill="rgba(0,0,0,0.28)" />
          {/* Thân gói snack phồng */}
          <path
            d="M11 9 L33 9 L31 35 L13 35 Z"
            fill="#ef4444"
            stroke="#991b1b"
            strokeWidth="1.5"
          />
          {/* Viền răng cưa trên & dưới */}
          <rect x="10" y="6" width="24" height="3.5" rx="1" fill="#facc15" stroke="#b45309" strokeWidth="1" />
          <rect x="12" y="34.5" width="20" height="3" rx="1" fill="#facc15" stroke="#b45309" strokeWidth="1" />
          {/* Nhãn giữa gói snack */}
          <ellipse cx="22" cy="21" rx="8.5" ry="6" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.2" />
          <text
            x="22"
            y="23.5"
            textAnchor="middle"
            fontSize="7.2"
            fontWeight="900"
            fill="#b91c1c"
          >
            GG
          </text>
          {/* Miếng bim bim vàng giòn vương bên cạnh */}
          <circle cx="34" cy="34" r="2.6" fill="#fbbf24" stroke="#b45309" strokeWidth="0.9" />
          <circle cx="9" cy="35" r="2.1" fill="#fbbf24" stroke="#b45309" strokeWidth="0.9" />
        </svg>
      )}
    </div>
  );
};

/**
 * 4. Model Skin Bàn PC Gaming RGB (5 Xu - Bắn tim: Điện thoại reo)
 */
export const PcGamingDeskModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  width?: number;
  height?: number;
  className?: string;
}> = ({ customUrl, scale = 1, width = 94, height = 56, className = '' }) => {
  const s = Math.max(0.4, Math.min(3.5, scale || 1));
  const w = Math.round(width * s);
  const h = Math.round(height * s);

  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt="PC Gaming Desk"
        style={{ width: w, height: h }}
        className={`object-contain select-none pointer-events-none drop-shadow-[0_6px_12px_rgba(6,182,212,0.5)] ${className}`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 120 74"
      style={{ width: w, height: h }}
      className={`overflow-visible select-none pointer-events-none drop-shadow-[0_5px_12px_rgba(236,72,153,0.45)] ${className}`}
    >
      {/* Hào quang LED RGB dưới gầm bàn */}
      <ellipse cx="60" cy="64" rx="54" ry="8" fill="rgba(6,182,212,0.35)" />
      {/* Chân bàn thép Gaming chữ Z */}
      <path d="M16 38 L10 66 L22 66 L24 38 Z" fill="#1e293b" stroke="#06b6d4" strokeWidth="1.5" />
      <path d="M104 38 L110 66 L98 66 L96 38 Z" fill="#1e293b" stroke="#ec4899" strokeWidth="1.5" />
      {/* Mặt bàn Carbon đen viền LED RGB */}
      <polygon
        points="6,36 114,36 120,22 12,22"
        fill="#0f172a"
        stroke="#22d3ee"
        strokeWidth="2"
      />
      {/* Dải LED RGB chạy dọc mép trước bàn */}
      <rect x="6" y="35" width="36" height="3.5" rx="1.5" fill="#ec4899" />
      <rect x="42" y="35" width="36" height="3.5" rx="1.5" fill="#a855f7" />
      <rect x="78" y="35" width="36" height="3.5" rx="1.5" fill="#06b6d4" />

      {/* Màn hình Gaming #1 (Bên trái) */}
      <rect
        x="18"
        y="4"
        width="32"
        height="20"
        rx="2.5"
        fill="#020617"
        stroke="#ec4899"
        strokeWidth="1.8"
      />
      <polygon points="20,6 48,6 44,22 20,22" fill="#0ea5e9" fillOpacity="0.35" />
      <rect x="31" y="24" width="6" height="4" fill="#475569" />
      {/* Bàn phím RGB & chuột bên trái */}
      <rect x="20" y="28" width="20" height="4.5" rx="1" fill="#1e293b" stroke="#f43f5e" strokeWidth="1" />
      <ellipse cx="45" cy="30" rx="2.5" ry="1.8" fill="#22d3ee" />

      {/* Màn hình Gaming #2 (Bên phải) */}
      <rect
        x="56"
        y="4"
        width="32"
        height="20"
        rx="2.5"
        fill="#020617"
        stroke="#22d3ee"
        strokeWidth="1.8"
      />
      <polygon points="58,6 86,6 82,22 58,22" fill="#ec4899" fillOpacity="0.35" />
      <rect x="69" y="24" width="6" height="4" fill="#475569" />
      {/* Bàn phím RGB & chuột bên phải */}
      <rect x="58" y="28" width="20" height="4.5" rx="1" fill="#1e293b" stroke="#22d3ee" strokeWidth="1" />
      <ellipse cx="83" cy="30" rx="2.5" ry="1.8" fill="#f43f5e" />

      {/* Case PC Gaming kính cường lực fan LED RGB ở góc phải bàn */}
      <rect
        x="92"
        y="3"
        width="18"
        height="27"
        rx="2"
        fill="#0f172a"
        stroke="#a855f7"
        strokeWidth="1.6"
      />
      <circle cx="101" cy="10" r="4" fill="none" stroke="#22d3ee" strokeWidth="1.6" />
      <circle cx="101" cy="20" r="4" fill="none" stroke="#ec4899" strokeWidth="1.6" />
    </svg>
  );
};

/**
 * 5. Model Con Heo Chạy Hù Dọa (10 Xu - Heo: Thả heo hù dọa)
 */
export const RunningPigModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  facingLeft?: boolean;
  animTime?: number;
  className?: string;
}> = ({
  customUrl,
  scale = 1,
  facingLeft = false,
  animTime = 0,
  className = 'w-11 h-11',
}) => {
  const s = Math.max(0.3, Math.min(3, scale || 1));
  const bounceY = Math.abs(Math.sin(animTime * 14)) * -3.5;
  const legSwing = Math.sin(animTime * 18) * 4;

  return (
    <div
      className={`inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{
        transform: `translateY(${bounceY.toFixed(1)}px) scale(${s}) scaleX(${
          facingLeft ? -1 : 1
        })`,
      }}
    >
      {customUrl ? (
        <img
          src={customUrl}
          alt="Con heo"
          className="w-full h-full object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]"
        />
      ) : (
        <svg viewBox="0 0 56 46" className="w-full h-full overflow-visible">
          {/* Bóng dưới chân */}
          <ellipse cx="28" cy="41" rx="16" ry="4" fill="rgba(0,0,0,0.3)" />
          {/* Đuôi heo xoắn */}
          <path
            d="M11 23 Q4 19 7 15 Q10 13 8 18"
            stroke="#f472b6"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          {/* 4 chân heo chạy lon ton */}
          <rect
            x={16 + legSwing * 0.5}
            y="32"
            width="4.5"
            height="8"
            rx="2"
            fill="#f472b6"
            stroke="#be185d"
            strokeWidth="1.2"
          />
          <rect
            x={23 - legSwing * 0.5}
            y="32"
            width="4.5"
            height="8"
            rx="2"
            fill="#fb7185"
            stroke="#be185d"
            strokeWidth="1.2"
          />
          <rect
            x={32 + legSwing * 0.5}
            y="32"
            width="4.5"
            height="8"
            rx="2"
            fill="#f472b6"
            stroke="#be185d"
            strokeWidth="1.2"
          />
          <rect
            x={39 - legSwing * 0.5}
            y="32"
            width="4.5"
            height="8"
            rx="2"
            fill="#fb7185"
            stroke="#be185d"
            strokeWidth="1.2"
          />
          {/* Thân heo hồng tròn ủn ỉn */}
          <ellipse
            cx="26"
            cy="24"
            rx="16"
            ry="11.5"
            fill="#fbcfe8"
            stroke="#db2777"
            strokeWidth="1.8"
          />
          {/* Đầu heo */}
          <circle
            cx="39"
            cy="21"
            r="10"
            fill="#f9a8d4"
            stroke="#db2777"
            strokeWidth="1.8"
          />
          {/* Tai heo */}
          <polygon points="33,13 36,5 41,12" fill="#f472b6" stroke="#db2777" strokeWidth="1.4" />
          <polygon points="41,12 45,6 46,14" fill="#f472b6" stroke="#db2777" strokeWidth="1.4" />
          {/* Mõm heo hồng đậm */}
          <ellipse
            cx="47.5"
            cy="22.5"
            rx="4.8"
            ry="3.6"
            fill="#f43f5e"
            stroke="#9f1239"
            strokeWidth="1.2"
          />
          <circle cx="46.2" cy="22.5" r="1" fill="#881337" />
          <circle cx="49" cy="22.5" r="1" fill="#881337" />
          {/* Mắt heo tinh nghịch */}
          <circle cx="41.5" cy="18.5" r="1.9" fill="#0f172a" />
          <circle cx="42" cy="18" r="0.7" fill="#ffffff" />
          {/* Chân mày giận dữ hài hước */}
          <path d="M39 15.5 L44 17" stroke="#881337" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
};

/**
 * 6. Model Tờ Tiền Rơi Rich Kid (10+ VIP: Tôi là Rich Kid)
 */
export const FallingMoneyModel: React.FC<{
  customUrl?: string | null;
  scale?: number;
  className?: string;
}> = ({ customUrl, scale = 1, className = 'w-8 h-5' }) => {
  const s = Math.max(0.3, Math.min(3, scale || 1));
  return (
    <div
      className={`inline-flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ transform: `scale(${s})` }}
    >
      {customUrl ? (
        <img
          src={customUrl}
          alt="Tiền rơi"
          className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
        />
      ) : (
        <svg viewBox="0 0 48 28" className="w-full h-full overflow-visible">
          <rect
            x="2"
            y="2"
            width="44"
            height="24"
            rx="3"
            fill="#10b981"
            stroke="#fde047"
            strokeWidth="2"
          />
          <rect
            x="5"
            y="5"
            width="38"
            height="18"
            rx="1.5"
            fill="#059669"
            stroke="#a7f3d0"
            strokeWidth="1"
          />
          <circle cx="24" cy="14" r="6.5" fill="#fde047" />
          <text
            x="24"
            y="17.2"
            textAnchor="middle"
            fontSize="10"
            fontWeight="900"
            fill="#065f46"
          >
            $
          </text>
          <circle cx="10" cy="14" r="2" fill="#a7f3d0" />
          <circle cx="38" cy="14" r="2" fill="#a7f3d0" />
        </svg>
      )}
    </div>
  );
};

export const SchoolGiftArt: React.FC<SchoolGiftArtProps> = ({
  type,
  customAssets,
  size = 'md',
  className = '',
}) => {
  const dim =
    size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-11 h-11' : 'w-7 h-7';

  // Hỗ trợ 6 model sự kiện quà tặng mới nếu được gọi qua SchoolGiftArt
  if (type === 'rose') {
    const customRose =
      customAssets?.roseBouquetUrl || customAssets?.offeringRoseUrl;
    return <RoseBouquetModel customUrl={customRose} className={`${dim} ${className}`} />;
  }

  if (type === 'icecream') {
    if (customAssets?.roseBouquetUrl) {
      return (
        <RoseBouquetModel
          customUrl={customAssets.roseBouquetUrl}
          className={`${dim} ${className}`}
        />
      );
    }
    return (
      <svg
        viewBox="0 0 44 44"
        className={`${dim} select-none pointer-events-none ${className}`}
      >
        {/* Ốc quế kem dâu tặng thầy */}
        <polygon
          points="15,22 29,22 22,40"
          fill="#f59e0b"
          stroke="#b45309"
          strokeWidth="1.5"
        />
        <circle cx="18" cy="19" r="6" fill="#fda4af" />
        <circle cx="26" cy="19" r="6" fill="#38bdf8" />
        <circle cx="22" cy="13" r="6.5" fill="#fef08a" />
        <circle cx="22" cy="6.5" r="2.8" fill="#e11d48" />
      </svg>
    );
  }

  if (type === 'cat') {
    return (
      <DeskCatModel
        customUrl={customAssets?.deskCatUrl}
        className={`${dim} ${className}`}
      />
    );
  }

  if (type === 'gg') {
    return (
      <SnackBagModel
        customUrl={customAssets?.snackBagUrl}
        className={`${dim} ${className}`}
      />
    );
  }

  if (type === 'heart') {
    if (customAssets?.pcGamingDeskUrl) {
      return (
        <img
          src={customAssets.pcGamingDeskUrl}
          alt="PC Gaming"
          className={`${dim} object-contain select-none pointer-events-none ${className}`}
        />
      );
    }
    return (
      <svg
        viewBox="0 0 44 44"
        className={`${dim} select-none pointer-events-none ${className}`}
      >
        {/* Bàn phím & Màn hình PC Gaming RGB + Bắn tim */}
        <rect
          x="6"
          y="8"
          width="32"
          height="20"
          rx="3"
          fill="#0f172a"
          stroke="#22d3ee"
          strokeWidth="2"
        />
        <path
          d="M22 23 C22 23 14 17.5 14 13.5 C14 11 16 9.5 18.5 9.5 C20.2 9.5 21.4 10.5 22 11.8 C22.6 10.5 23.8 9.5 25.5 9.5 C28 9.5 30 11 30 13.5 C30 17.5 22 23 22 23 Z"
          fill="#f43f5e"
        />
        <rect x="18" y="28" width="8" height="4" fill="#64748b" />
        <rect
          x="10"
          y="33"
          width="24"
          height="5"
          rx="1.5"
          fill="#ec4899"
          stroke="#a855f7"
          strokeWidth="1.2"
        />
      </svg>
    );
  }

  if (type === 'pig') {
    return (
      <RunningPigModel
        customUrl={customAssets?.runningPigUrl}
        className={`${dim} ${className}`}
      />
    );
  }

  if (type === 'vip') {
    if (customAssets?.fallingMoneyUrl) {
      return (
        <FallingMoneyModel
          customUrl={customAssets.fallingMoneyUrl}
          className={`${dim} ${className}`}
        />
      );
    }
    return (
      <svg
        viewBox="0 0 48 48"
        className={`${dim} select-none pointer-events-none ${className}`}
      >
        {/* Vương miện Rich Kid + Đô-la vàng */}
        <polygon
          points="6,34 10,14 19,23 24,10 29,23 38,14 42,34"
          fill="#facc15"
          stroke="#b45309"
          strokeWidth="2"
        />
        <rect x="8" y="34" width="32" height="6" rx="2" fill="#eab308" stroke="#b45309" strokeWidth="1.5" />
        <circle cx="24" cy="26" r="5" fill="#10b981" />
        <text x="24" y="29" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#fef08a">
          $
        </text>
      </svg>
    );
  }

  const customUrl =
    type === 'incense'
      ? customAssets?.offeringIncenseUrl
      : type === 'lotus'
      ? customAssets?.offeringLotusUrl
      : customAssets?.offeringTrayUrl;

  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt={type}
        className={`${dim} object-contain select-none pointer-events-none ${className}`}
      />
    );
  }

  // 1. Vở Điểm 10 & Bút máy (Mặc định khi bình luận / nộp bài)
  if (type === 'incense') {
    return (
      <svg
        viewBox="0 0 40 40"
        className={`${dim} select-none pointer-events-none ${className}`}
      >
        <rect
          x="7"
          y="6"
          width="22"
          height="28"
          rx="3"
          fill="#38bdf8"
          stroke="#0284c7"
          strokeWidth="1.5"
        />
        <rect x="10" y="6" width="3" height="28" fill="#0369a1" />
        <rect
          x="15"
          y="11"
          width="11"
          height="7"
          rx="1.5"
          fill="#ffffff"
        />
        <text
          x="20.5"
          y="16.5"
          textAnchor="middle"
          fontSize="6.5"
          fontWeight="900"
          fill="#e11d48"
        >
          10đ
        </text>
        <path
          d="M27 12 L34 5 L36 7 L29 14 Z"
          fill="#facc15"
          stroke="#ca8a04"
          strokeWidth="1"
        />
      </svg>
    );
  }

  // Ly Trà Sữa Trân Châu Đường Đen
  if (type === 'lotus') {
    return (
      <svg
        viewBox="0 0 44 44"
        className={`${dim} select-none pointer-events-none ${className}`}
      >
        <path
          d="M25 4 L22 16"
          stroke="#f43f5e"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M12 16 Q22 8 32 16 Z"
          fill="#fdf2f8"
          stroke="#f472b6"
          strokeWidth="1.5"
        />
        <polygon
          points="12,16 32,16 29,38 15,38"
          fill="#fde68a"
          stroke="#d97706"
          strokeWidth="1.5"
        />
        <path
          d="M14 25 Q18 22 22 26 Q26 22 30 25 L29 37 L15 37 Z"
          fill="#fed7aa"
        />
        <circle cx="18" cy="34" r="2" fill="#451a03" />
        <circle cx="22" cy="35" r="2" fill="#451a03" />
        <circle cx="26" cy="34" r="2" fill="#451a03" />
        <circle cx="20" cy="31" r="1.8" fill="#451a03" />
        <circle cx="24" cy="31.5" r="1.8" fill="#451a03" />
      </svg>
    );
  }

  // Sổ Đầu Bài Vàng & Hộp Quà Tri Ân
  if (type === 'tray') {
    return (
      <svg
        viewBox="0 0 48 48"
        className={`${dim} select-none pointer-events-none ${className}`}
      >
        <rect
          x="8"
          y="14"
          width="32"
          height="26"
          rx="4"
          fill="#fbbf24"
          stroke="#b45309"
          strokeWidth="2"
        />
        <rect x="21" y="14" width="6" height="26" fill="#e11d48" />
        <rect x="8" y="24" width="32" height="5" fill="#e11d48" />
        <path
          d="M24 14 C16 6 12 12 21 15 C16 12 20 8 24 14 Z"
          fill="#f43f5e"
        />
        <path
          d="M24 14 C32 6 36 12 27 15 C32 12 28 8 24 14 Z"
          fill="#f43f5e"
        />
        <circle cx="24" cy="14" r="3" fill="#fef08a" />
      </svg>
    );
  }

  // Cúp Học Sinh Giỏi Quốc Gia
  return (
    <svg
      viewBox="0 0 52 52"
      className={`${dim} select-none pointer-events-none ${className}`}
    >
      <circle cx="26" cy="24" r="20" fill="#fef08a" fillOpacity="0.28" />
      <path
        d="M15 14 C8 14 8 25 16 26"
        stroke="#f59e0b"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M37 14 C44 14 44 25 36 26"
        stroke="#f59e0b"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M14 10 L38 10 L35 26 C34 32 18 32 17 26 Z"
        fill="#facc15"
        stroke="#b45309"
        strokeWidth="2"
      />
      <polygon
        points="26,14 27.8,18 32,18.4 28.8,21.2 29.8,25.4 26,23 22.2,25.4 23.2,21.2 20,18.4 24.2,18"
        fill="#e11d48"
      />
      <rect x="23" y="31" width="6" height="7" fill="#eab308" />
      <rect
        x="16"
        y="38"
        width="20"
        height="6"
        rx="2"
        fill="#78350f"
        stroke="#f59e0b"
        strokeWidth="1.2"
      />
    </svg>
  );
};
