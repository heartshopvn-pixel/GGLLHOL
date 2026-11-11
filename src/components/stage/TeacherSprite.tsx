import React from 'react';
import {
  DEFAULT_FEMALE_TEACHER_IMG,
  DEFAULT_MALE_TEACHER_IMG,
  getCharacterDepthScale,
} from '../../config/constants';
import {
  useProcessedSingleCutout,
  useProcessedSpriteFrames,
} from '../../services/spriteProcessor';
import {
  CustomAssetsConfig,
  MonkFrameIndex,
  TempleMonkData,
} from '../../types/game';

interface TeacherSpriteProps {
  monk: TempleMonkData;
  customAssets: CustomAssetsConfig;
  characterScale: number;
  femaleTeacherScale?: number;
  maleTeacherScale?: number;
  useDefaultPngModels?: boolean;
  nameTagFontFamily: string;
  nameTagScale: number;
  chatBubbleFontFamily: string;
  chatBubbleScale: number;
  teacherBubbleScale?: number;
  supervisorBubbleScale?: number;
  isSpeakingBubble?: boolean;
  walkWobbleIntensity?: number;
}

function getTeacherFrameIndex(monk: TempleMonkData): MonkFrameIndex {
  const step = Math.floor(monk.animTime * 5.5) % 2;
  if (monk.moveAxis === 'chant_wooden_fish') {
    return Math.floor(monk.animTime * 6) % 2 === 0 ? 6 : 7;
  }
  if (monk.moveAxis === 'x') {
    return step === 0 ? 4 : 5;
  }
  if (monk.moveAxis === 'y') {
    return monk.targetY < monk.y ? (step === 0 ? 2 : 3) : step === 0 ? 0 : 1;
  }
  return 0;
}

const TeacherSpriteInner: React.FC<TeacherSpriteProps> = ({
  monk,
  customAssets,
  characterScale,
  femaleTeacherScale = 1,
  maleTeacherScale = 1,
  useDefaultPngModels = true,
  nameTagFontFamily,
  nameTagScale,
  chatBubbleFontFamily,
  chatBubbleScale,
  teacherBubbleScale,
  supervisorBubbleScale,
  isSpeakingBubble = false,
  walkWobbleIntensity = 1.0,
}) => {
  const now = Date.now();

  const rawSheetUrl =
    monk.role === 'abbot'
      ? customAssets.abbotSpritesheetUrl
      : monk.role === 'senior_novice'
      ? customAssets.seniorNoviceSpritesheetUrl
      : customAssets.juniorNoviceSpritesheetUrl;

  const customFrames = useProcessedSpriteFrames(rawSheetUrl, 8, null);
  const frameIdx = getTeacherFrameIndex(monk);
  const customFrameSrc =
    rawSheetUrl && customFrames && customFrames[frameIdx]
      ? customFrames[frameIdx]
      : null;

  const isTeacher = monk.role === 'abbot';
  const depthScale = getCharacterDepthScale(monk.y);
  const roleScale = isTeacher ? 1.08 : 1.06;
  const individualTeacherScale = isTeacher
    ? Math.max(0.4, Math.min(3.0, femaleTeacherScale || 1))
    : Math.max(0.4, Math.min(3.0, maleTeacherScale || 1));
  const finalScale =
    depthScale * roleScale * (characterScale || 1) * individualTeacherScale;
  const defaultTeacherModelUrl = isTeacher
    ? DEFAULT_FEMALE_TEACHER_IMG
    : DEFAULT_MALE_TEACHER_IMG;
  const processedDefaultTeacherSrc = useProcessedSingleCutout(
    defaultTeacherModelUrl
  );
  const effectiveBubbleScale = isTeacher
    ? teacherBubbleScale ?? chatBubbleScale ?? 1
    : supervisorBubbleScale ?? chatBubbleScale ?? 1;

  const showBubble =
    Boolean(monk.chatText && monk.chatText.trim()) &&
    (monk.chatBubbleUntil ? now < monk.chatBubbleUntil : false);

  const isTappingRuler =
    monk.moveAxis === 'chant_wooden_fish' ||
    (monk.woodenFishRippleUntil ? now < monk.woodenFishRippleUntil : false);

  const isWalking = monk.moveAxis === 'x' || monk.moveAxis === 'y';
  const stepSwing = isWalking ? Math.sin(monk.animTime * 8) * 2.5 : 0;
  const safeWobble = Math.max(0, walkWobbleIntensity ?? 1);
  const walkWobbleDeg =
    isWalking && safeWobble > 0
      ? Math.sin(monk.animTime * 9.5) * 3.8 * safeWobble
      : 0;

  const uniformTeacherScale =
    roleScale * (characterScale || 1) * individualTeacherScale;
  const headTopOffsetPx = Math.round(78 * uniformTeacherScale) + 6;
  const feetBottomOffsetPx = Math.round(9 * uniformTeacherScale) + 2;
  const teacherBodyZIndex = Math.max(20, Math.round(monk.y));
  const teacherNameTagZIndex =
    showBubble || isSpeakingBubble
      ? 20490
      : 2000 + Math.max(14, Math.round(monk.y));

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${monk.x}px`,
        top: `${monk.y}px`,
      }}
    >
      {/* CHATBOX CẢM ƠN NHẬN QUÀ CỦA CÔ GIÁO (CHỮ HỒNG, VIỀN HỒNG) & THẦY GIÁM THỊ (CHỮ XANH DƯƠNG, VIỀN XANH DƯƠNG) */}
      {showBubble && (
        <div
          className="absolute left-0 pointer-events-none"
          style={{
            top: -headTopOffsetPx,
            transform: `translate(-50%, -100%) scale(${(effectiveBubbleScale || 1).toFixed(2)})`,
            transformOrigin: '50% 100%',
            zIndex: 34000,
          }}
        >
          <div
            style={{ fontFamily: chatBubbleFontFamily }}
            className={`relative px-2.5 py-1.5 rounded-xl bg-[#fffdf7]/95 text-slate-950 border-2 text-[11px] font-bold leading-snug max-w-[230px] min-w-[115px] text-center break-words transition-all duration-200 ${
              isTeacher
                ? 'border-pink-400 shadow-[0_0_16px_rgba(244,114,182,0.85)]'
                : 'border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.85)]'
            }`}
          >
            <span>
              {(monk.chatText || '').split('/-heart').map((part, idx, arr) => (
                <React.Fragment key={idx}>
                  {part}
                  {idx < arr.length - 1 && (
                    <span className="inline-flex items-center gap-0.5 text-rose-500 font-extrabold">
                      <span>/-heart</span>
                      <span className="animate-pulse">❤️</span>
                    </span>
                  )}
                </React.Fragment>
              ))}
            </span>
            <div
              className={`w-2.5 h-2.5 rotate-45 mx-auto -mb-3 mt-0.5 bg-[#fffdf7] border-r-2 border-b-2 ${
                isTeacher ? 'border-pink-400' : 'border-sky-400'
              }`}
            />
          </div>
        </div>
      )}

      {/* KHỐI THÂN NHÂN VẬT CÔ GIÁO / THẦY GIÁM THỊ */}
      <div
        className="relative pointer-events-none select-none"
        style={{
          zIndex: teacherBodyZIndex,
          transform: `translate(-50%, -88%) scale(${finalScale.toFixed(3)}) ${
            walkWobbleDeg !== 0 ? `rotate(${walkWobbleDeg.toFixed(2)}deg)` : ''
          }`,
          transformOrigin: '50% 88%',
        }}
      >
        {/* Hiệu ứng nhịp gõ thước lên bảng */}
        {isTappingRuler && (
          <div className="absolute -top-6 right-0 px-1.5 py-0.5 rounded-full bg-amber-400/90 text-slate-950 text-[8.5px] font-extrabold shadow animate-bounce">
            📏 Cốc!
          </div>
        )}

        {/* HÌNH NHÂN VẬT CÔ GIÁO CHỦ NHIỆM / THẦY GIÁM THỊ */}
        {customFrameSrc ? (
          <img
            src={customFrameSrc}
            alt={monk.name}
            className="w-16 h-24 object-contain select-none pointer-events-none"
            style={{
              transform: monk.facingLeft ? 'scaleX(-1)' : undefined,
            }}
          />
        ) : useDefaultPngModels && processedDefaultTeacherSrc ? (
          <div className="w-16 h-24 relative flex items-end justify-center">
            <img
              src={processedDefaultTeacherSrc}
              alt={monk.name}
              className="w-16 h-24 object-contain object-bottom select-none pointer-events-none"
            />
          </div>
        ) : (
          <div
            className="w-16 h-24 relative flex items-center justify-center"
            style={{
              transform: monk.facingLeft ? 'scaleX(-1)' : undefined,
            }}
          >
            {isTeacher ? (
              /* CÔ GIÁO CHỦ NHIỆM (Áo dài hồng sen truyền thống, đeo kính hiền từ, cầm sách & thước gỗ) */
              <svg viewBox="0 0 68 92" className="w-full h-full overflow-visible">
                {/* Quần lụa trắng áo dài */}
                <rect
                  x="25"
                  y={60 + stepSwing * 0.5}
                  width="8"
                  height="24"
                  rx="2"
                  fill="#f8fafc"
                />
                <rect
                  x="35"
                  y={60 - stepSwing * 0.5}
                  width="8"
                  height="24"
                  rx="2"
                  fill="#f8fafc"
                />
                {/* Tà áo dài hồng phấn / đỏ đô thướt tha */}
                <polygon
                  points="20,34 48,34 52,78 16,78"
                  fill="#e11d48"
                  stroke="#be123c"
                  strokeWidth="1.2"
                />
                {/* Hoa văn sen vàng trên ngực áo dài */}
                <circle cx="38" cy="44" r="3" fill="#fde047" />
                <circle cx="42" cy="48" r="2" fill="#fda4af" />
                {/* Cổ áo dài cao truyền thống */}
                <rect x="29" y="30" width="10" height="5" rx="1.5" fill="#be123c" />

                {/* Tay trái ôm giáo án */}
                <rect x="13" y="36" width="7" height="19" rx="3" fill="#e11d48" />
                <rect
                  x="15"
                  y="43"
                  width="12"
                  height="15"
                  rx="1.5"
                  fill="#fef08a"
                  stroke="#b45309"
                  strokeWidth="1"
                />

                {/* Tay phải cầm thước gỗ chỉ bảng */}
                <g
                  transform={
                    isTappingRuler ? 'rotate(-28 49 38)' : 'rotate(-8 49 38)'
                  }
                >
                  <rect x="48" y="35" width="7" height="18" rx="3" fill="#e11d48" />
                  {/* Thước gỗ */}
                  <rect
                    x="53"
                    y="14"
                    width="3.5"
                    height="28"
                    rx="1"
                    fill="#f59e0b"
                    stroke="#78350f"
                    strokeWidth="0.8"
                  />
                </g>

                {/* Khuôn mặt Cô giáo hiền hậu + Kính cận */}
                <circle
                  cx="34"
                  cy="19"
                  r="12"
                  fill="#fde68a"
                  stroke="#d97706"
                  strokeWidth="1"
                />
                {/* Tóc búi gọn gàng có trâm cài */}
                <circle cx="34" cy="7" r="6" fill="#1e293b" />
                <path
                  d="M21 18 C21 6 47 6 47 18 C44 12 39 10 34 10 C29 10 24 12 21 18 Z"
                  fill="#1e293b"
                />
                {/* Gọng kính tròn */}
                <circle
                  cx="29.5"
                  cy="19.5"
                  r="3.2"
                  fill="none"
                  stroke="#78350f"
                  strokeWidth="1.1"
                />
                <circle
                  cx="38.5"
                  cy="19.5"
                  r="3.2"
                  fill="none"
                  stroke="#78350f"
                  strokeWidth="1.1"
                />
                <line
                  x1="32.7"
                  y1="19.5"
                  x2="35.3"
                  y2="19.5"
                  stroke="#78350f"
                  strokeWidth="1"
                />
                <circle cx="29.5" cy="19.5" r="1.2" fill="#0f172a" />
                <circle cx="38.5" cy="19.5" r="1.2" fill="#0f172a" />
                <path
                  d="M30.5 24.5 Q34 27 37.5 24.5"
                  stroke="#e11d48"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              /* THẦY GIÁM THỊ (Thầy giáo nam: Sơ mi xanh nhạt + Cà vạt xanh đậm + Quần tây + Kính vuông + Cầm Sổ Giám Thị) */
              <svg viewBox="0 0 68 92" className="w-full h-full overflow-visible">
                {/* Quần âu tối màu & Giày tây */}
                <rect
                  x="24"
                  y={58 + stepSwing * 0.55}
                  width="8.5"
                  height="24"
                  rx="3"
                  fill="#0f172a"
                />
                <ellipse
                  cx="28"
                  cy={83 + stepSwing * 0.55}
                  rx="5"
                  ry="2.5"
                  fill="#1e293b"
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                <rect
                  x="35.5"
                  y={58 - stepSwing * 0.55}
                  width="8.5"
                  height="24"
                  rx="3"
                  fill="#0f172a"
                />
                <ellipse
                  cx="40"
                  cy={83 - stepSwing * 0.55}
                  rx="5"
                  ry="2.5"
                  fill="#1e293b"
                  stroke="#475569"
                  strokeWidth="0.8"
                />

                {/* Áo sơ mi thầy giáo xanh da trời nhạt + Áo khoác/gile xanh navy */}
                <rect
                  x="18"
                  y="32"
                  width="32"
                  height="28"
                  rx="6"
                  fill="#e0f2fe"
                  stroke="#0284c7"
                  strokeWidth="1.3"
                />
                {/* Thắt lưng da đen có khóa vàng */}
                <rect x="19" y="57" width="30" height="3.2" fill="#0f172a" />
                <rect x="31.5" y="56.6" width="5" height="4" rx="0.8" fill="#facc15" />

                {/* Cổ áo sơ mi & Cà vạt xanh đậm của Thầy Giám Thị */}
                <polygon points="27,32 34,40 41,32" fill="#bae6fd" />
                <polygon
                  points="34,35 31,50 34,55 37,50"
                  fill="#1e3a8a"
                />
                {/* Bảng tên Giám Thị trên ngực áo */}
                <rect
                  x="38"
                  y="39"
                  width="8.5"
                  height="4.5"
                  rx="1"
                  fill="#fde047"
                  stroke="#b45309"
                  strokeWidth="0.7"
                />

                {/* Tay trái cầm Sổ Giám Thị bìa cứng */}
                <rect x="11.5" y="34" width="7" height="19" rx="3" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1" />
                <rect
                  x="13"
                  y="41"
                  width="12"
                  height="16"
                  rx="1.5"
                  fill="#1e3a8a"
                  stroke="#93c5fd"
                  strokeWidth="1"
                />
                <rect x="16" y="40" width="6" height="2.2" rx="0.6" fill="#facc15" />

                {/* Tay phải chắp sau lưng / cầm bút kiểm tra kỷ luật */}
                <rect x="49.5" y="34" width="7" height="19" rx="3" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1" />
                <circle cx="53" cy="54" r="3" fill="#fde68a" stroke="#d97706" strokeWidth="0.8" />

                {/* Khuôn mặt Thầy Giám Thị nghiêm nghị + Kính gọng vuông */}
                <circle
                  cx="34"
                  cy="19"
                  r="12"
                  fill="#fde68a"
                  stroke="#d97706"
                  strokeWidth="1"
                />
                {/* Kiểu tóc nam rẽ ngôi gọn gàng của Thầy giáo */}
                <path
                  d="M21 17 C21 4 47 4 47 17 C45 11 40 9 33 9 C27 9 23 12 21 17 Z"
                  fill="#0f172a"
                />
                <path
                  d="M22 14 L22 20 M46 14 L46 20"
                  stroke="#0f172a"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                {/* Lông mày đậm nam tính */}
                <line x1="26.5" y1="15.2" x2="31.5" y2="15.6" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="36.5" y1="15.6" x2="41.5" y2="15.2" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                {/* Kính gọng vuông của Thầy Giám Thị */}
                <rect
                  x="25.8"
                  y="16.8"
                  width="6.5"
                  height="4.8"
                  rx="1"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="1.2"
                />
                <rect
                  x="35.7"
                  y="16.8"
                  width="6.5"
                  height="4.8"
                  rx="1"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="1.2"
                />
                <line x1="32.3" y1="19" x2="35.7" y2="19" stroke="#1e293b" strokeWidth="1.1" />
                <circle cx="29" cy="19.2" r="1.2" fill="#0f172a" />
                <circle cx="39" cy="19.2" r="1.2" fill="#0f172a" />
                {/* Nụ cười điềm đạm */}
                <path
                  d="M30.5 24.5 Q34 26.2 37.5 24.5"
                  stroke="#991b1b"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* BẢNG TÊN CÔ GIÁO / THẦY GIÁM THỊ */}
      <div
        className="absolute left-0 flex flex-col items-center pointer-events-none"
        style={{
          top: feetBottomOffsetPx,
          transform: `translate(-50%, 0) scale(${(nameTagScale || 1).toFixed(2)})`,
          transformOrigin: '50% 0%',
          zIndex: teacherNameTagZIndex,
        }}
      >
        <div
          style={{ fontFamily: nameTagFontFamily }}
          className={`px-2 py-0.5 rounded-full border text-[9.5px] font-extrabold shadow whitespace-nowrap ${
            isSpeakingBubble
              ? 'bg-pink-950/95 border-pink-400 text-pink-200 shadow-[0_0_10px_rgba(244,114,182,0.75)]'
              : isTeacher
              ? 'bg-emerald-950/95 border-amber-400 text-amber-200'
              : 'bg-sky-950/95 border-sky-400 text-sky-200'
          }`}
        >
          {monk.name}
        </div>
      </div>
    </div>
  );
};

function areTeacherSpritePropsEqual(
  prev: TeacherSpriteProps,
  next: TeacherSpriteProps
): boolean {
  if (
    prev.characterScale !== next.characterScale ||
    prev.femaleTeacherScale !== next.femaleTeacherScale ||
    prev.maleTeacherScale !== next.maleTeacherScale ||
    prev.useDefaultPngModels !== next.useDefaultPngModels ||
    prev.nameTagFontFamily !== next.nameTagFontFamily ||
    prev.nameTagScale !== next.nameTagScale ||
    prev.chatBubbleFontFamily !== next.chatBubbleFontFamily ||
    prev.chatBubbleScale !== next.chatBubbleScale ||
    prev.teacherBubbleScale !== next.teacherBubbleScale ||
    prev.supervisorBubbleScale !== next.supervisorBubbleScale ||
    prev.isSpeakingBubble !== next.isSpeakingBubble ||
    prev.walkWobbleIntensity !== next.walkWobbleIntensity ||
    prev.customAssets !== next.customAssets
  ) {
    return false;
  }

  const a = prev.monk;
  const b = next.monk;
  if (a === b) return true;

  if (
    a.id !== b.id ||
    a.role !== b.role ||
    a.name !== b.name ||
    Math.abs(a.x - b.x) > 0.05 ||
    Math.abs(a.y - b.y) > 0.05 ||
    a.moveAxis !== b.moveAxis ||
    a.facingLeft !== b.facingLeft ||
    a.chatText !== b.chatText ||
    a.chatBubbleUntil !== b.chatBubbleUntil ||
    a.woodenFishRippleUntil !== b.woodenFishRippleUntil
  ) {
    return false;
  }

  // Khi Cô Thảo hoặc Thầy Tùng đang đứng yên (moveAxis === 'idle'): bỏ qua hoàn toàn việc re-render do animTime / pauseTimer tăng!
  if (b.moveAxis === 'idle') {
    return true;
  }

  return Math.abs(a.animTime - b.animTime) < 0.015;
}

export const TeacherSprite = React.memo(
  TeacherSpriteInner,
  areTeacherSpritePropsEqual
);
