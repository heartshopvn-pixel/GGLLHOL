import React from 'react';
import {
  DEFAULT_BOY_STUDENT_SEATED_IMG,
  DEFAULT_BOY_STUDENT_STANDING_IMG,
  DEFAULT_GIFT_MODEL_SCALES,
  DEFAULT_GIRL_STUDENT_SEATED_IMG,
  DEFAULT_GIRL_STUDENT_STANDING_IMG,
  getCharacterDepthScale,
} from '../../config/constants';
import {
  useProcessedSingleCutout,
  useProcessedSpriteFrames,
} from '../../services/spriteProcessor';
import {
  CustomAssetsConfig,
  GiftModelScalesConfig,
  PilgrimData,
  PilgrimFrameIndex,
} from '../../types/game';
import {
  Flower10BadgeIcon,
  RoseBouquetModel,
  SchoolGiftArt,
} from './SchoolGiftArt';

const FLOWER_10_BURST_VECTORS: Array<{
  dx: number;
  dy: number;
  rot: number;
  delayMs: number;
  scale: number;
}> = [
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

interface StudentSpriteProps {
  pilgrim: PilgrimData;
  customAssets: CustomAssetsConfig;
  characterScale: number;
  useDefaultPngModels?: boolean;
  nameTagFontFamily: string;
  nameTagScale: number;
  nameTagMaxChars?: number;
  nameTagOffsetY?: number;
  streakTagFontFamily?: string;
  streakTagScale?: number;
  scoreTagScale?: number;
  scoreTagOffsetY?: number;
  scoreChangeFontSize?: number;
  scoreChangeStrokeWidth?: number;
  vfxFlower10Enabled?: boolean;
  vfxFlower10Scale?: number;
  vfxFlower10OffsetX?: number;
  vfxFlower10OffsetY?: number;
  chatBubbleFontFamily: string;
  chatBubbleScale: number;
  chatBubbleMaxChars?: number;
  chatBubbleMaxWidth?: number;
  chatBubbleMaxHeight?: number;
  chatBubbleFontSize?: number;
  chatBubbleOffsetY?: number;
  chatBubbleOffsetX?: number;
  isLeftSeatmate?: boolean;
  deskSeatY?: number;
  isSpeakingBubble?: boolean;
  giftModelScales?: GiftModelScalesConfig;
  walkWobbleIntensity?: number;
}

function getStudentFrameIndex(p: PilgrimData): PilgrimFrameIndex {
  const step = Math.floor(p.animTime * 6.5) % 2;

  if (
    p.pathWaypoints &&
    p.pathWaypoints.length > 0 &&
    p.state !== 'pray_seated' &&
    p.state !== 'throw_offering_at_burner' &&
    p.state !== 'ceremony_at_burner'
  ) {
    const wp = p.pathWaypoints[0];
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return step === 0 ? 8 : 9;
    }
    return dy >= 0 ? (step === 0 ? 0 : 1) : step === 0 ? 2 : 3;
  }

  switch (p.state) {
    case 'walk_in_up':
    case 'walk_to_teacher_gift':
    case 'walk_to_punishment_spot':
      if (p.isCarryingGift || p.coins > 0) return 7;
      return step === 0 ? 2 : 3;
    case 'throw_offering_at_burner':
    case 'throw_flower_at_teacher':
      return 7;
    case 'ceremony_at_burner':
      return 4;
    case 'walk_to_vip_check':
    case 'walk_carpet_to_slot_y':
    case 'return_to_seat_from_gift':
    case 'return_from_punishment_to_seat':
    case 'leave_down_exit':
      return step === 0 ? 0 : 1;
    case 'stand_punishment':
    case 'wait_for_vip_slot':
      return 0;
    case 'walk_side_to_slot':
    case 'leave_side_to_aisle':
      return step === 0 ? 8 : 9;
    case 'walk_vert_to_slot':
      return p.y > p.slotY ? (step === 0 ? 2 : 3) : step === 0 ? 0 : 1;
    case 'pray_seated':
      if (p.stateTimer < 1.8) {
        return Math.floor(p.stateTimer * 3.5) % 2 === 0 ? 6 : 5;
      }
      return 5;
    default:
      return 5;
  }
}

const StudentSpriteInner: React.FC<StudentSpriteProps> = ({
  pilgrim,
  customAssets,
  characterScale,
  useDefaultPngModels = true,
  nameTagFontFamily,
  nameTagScale,
  nameTagMaxChars = 16,
  nameTagOffsetY = 0,
  streakTagFontFamily,
  streakTagScale = 1.0,
  scoreTagScale = 1.0,
  scoreTagOffsetY = 0,
  scoreChangeFontSize = 14,
  scoreChangeStrokeWidth = 2.5,
  vfxFlower10Enabled = true,
  vfxFlower10Scale = 1.0,
  vfxFlower10OffsetX = 0,
  vfxFlower10OffsetY = 0,
  chatBubbleFontFamily,
  chatBubbleScale,
  chatBubbleMaxChars = 80,
  chatBubbleMaxWidth = 195,
  chatBubbleMaxHeight = 110,
  chatBubbleFontSize = 11,
  chatBubbleOffsetY = 0,
  chatBubbleOffsetX = 24,
  isLeftSeatmate = false,
  deskSeatY,
  isSpeakingBubble = false,
  giftModelScales = DEFAULT_GIFT_MODEL_SCALES,
  walkWobbleIntensity = 1.0,
}) => {
  const now = Date.now();

  const rawSheetUrl =
    pilgrim.gender === 'female'
      ? customAssets.pilgrimFemaleSpritesheetUrl
      : customAssets.pilgrimMaleSpritesheetUrl;

  const customFrames = useProcessedSpriteFrames(rawSheetUrl, 10, null);
  const frameIdx = getStudentFrameIndex(pilgrim);
  const customFrameSrc =
    rawSheetUrl && customFrames && customFrames[frameIdx]
      ? customFrames[frameIdx]
      : null;

  const isRichKidDancing = Boolean(
    pilgrim.richKidDanceUntil && now < pilgrim.richKidDanceUntil
  );

  const isPerformingGiftAction = Boolean(
    isRichKidDancing ||
      pilgrim.state === 'walk_to_teacher_gift' ||
      pilgrim.state === 'throw_flower_at_teacher' ||
      pilgrim.state === 'return_to_seat_from_gift' ||
      (pilgrim.giftActionBusyUntil && now < pilgrim.giftActionBusyUntil) ||
      (pilgrim.giftActionHighlightUntil &&
        now < pilgrim.giftActionHighlightUntil)
  );

  const isSeated = pilgrim.state === 'pray_seated' && !isRichKidDancing;
  const isAtDeskSeat =
    Boolean(pilgrim.slotId) &&
    (pilgrim.state === 'pray_seated' ||
      pilgrim.state === 'walk_side_to_slot' ||
      Math.abs(pilgrim.y - (pilgrim.slotY || pilgrim.y)) <= 8);

  const effectiveBaseY =
    isAtDeskSeat && typeof deskSeatY === 'number'
      ? deskSeatY
      : isAtDeskSeat && pilgrim.slotY
      ? pilgrim.slotY
      : pilgrim.y;

  const depthScale = getCharacterDepthScale(effectiveBaseY);
  const finalScale = depthScale * (characterScale || 1);

  const showChatBubble =
    Boolean(pilgrim.prayer && pilgrim.prayer.trim()) &&
    (isSpeakingBubble ||
      (pilgrim.chatBubbleUntil ? now < pilgrim.chatBubbleUntil : false));

  const showQuizResultBadge =
    Boolean(pilgrim.quizResultStatus) &&
    Boolean(pilgrim.quizResultUntil && now < pilgrim.quizResultUntil);

  const showScoreCard =
    Boolean(pilgrim.slotId || pilgrim.isDetachedFlowerRunner) &&
    Boolean(pilgrim.scoreCardUntil && now < pilgrim.scoreCardUntil);

  const showFloatingScore =
    !showScoreCard &&
    Boolean(pilgrim.floatingScoreText) &&
    !/^[+-]\s*\d+/.test((pilgrim.floatingScoreText || '').trim()) &&
    Boolean(pilgrim.floatingScoreUntil && now < pilgrim.floatingScoreUntil);

  const defaultModelUrl =
    pilgrim.gender === 'female'
      ? isSeated
        ? DEFAULT_GIRL_STUDENT_SEATED_IMG
        : DEFAULT_GIRL_STUDENT_STANDING_IMG
      : isSeated
      ? DEFAULT_BOY_STUDENT_SEATED_IMG
      : DEFAULT_BOY_STUDENT_STANDING_IMG;
  const processedDefaultModelSrc = useProcessedSingleCutout(defaultModelUrl);

  // Bạn bên trái cùng bàn luôn cao hơn bạn bên phải 1 mức đúng bằng chiều cao thực tế của thẻ tên (20px * scale) để thẻ tên 2 bạn không bao giờ đè lên nhau
  // Khi kích hoạt Rich Kid Dance -> đứng hẳn lên mặt bàn (-24px) và nhảy múa
  const nameTagHeightPx = Math.round(20 * (nameTagScale || 1));
  const seatmateYOffset =
    isLeftSeatmate && isAtDeskSeat ? -nameTagHeightPx : 0;
  const richKidDeskStandOffset = isRichKidDancing ? -24 : 0;
  const renderedY = effectiveBaseY + seatmateYOffset + richKidDeskStandOffset;

  const isRaisingHand =
    isRichKidDancing ||
    isSpeakingBubble ||
    showChatBubble ||
    (isSeated && pilgrim.stateTimer < 2.0);
  const isHoldingGiftUp =
    ((pilgrim.state === 'walk_in_up' ||
      pilgrim.state === 'walk_to_teacher_gift') &&
      (pilgrim.isCarryingGift || pilgrim.coins > 0)) ||
    pilgrim.state === 'throw_offering_at_burner' ||
    pilgrim.state === 'throw_flower_at_teacher';
  const isGreetingTeacher = pilgrim.state === 'ceremony_at_burner';

  const stepPhase = Math.sin(pilgrim.animTime * (isRichKidDancing ? 18 : 9));
  const isWalking =
    isRichKidDancing ||
    pilgrim.state === 'walk_in_up' ||
    pilgrim.state === 'walk_to_teacher_gift' ||
    pilgrim.state === 'return_to_seat_from_gift' ||
    pilgrim.state === 'walk_to_punishment_spot' ||
    pilgrim.state === 'return_from_punishment_to_seat' ||
    pilgrim.state === 'walk_to_vip_check' ||
    pilgrim.state === 'walk_carpet_to_slot_y' ||
    pilgrim.state === 'walk_side_to_slot' ||
    pilgrim.state === 'walk_vert_to_slot' ||
    pilgrim.state === 'leave_side_to_aisle' ||
    pilgrim.state === 'leave_down_exit';

  const safeWobble = Math.max(0, walkWobbleIntensity ?? 1);
  const isMovingWalk =
    isWalking &&
    !isSeated &&
    !isRichKidDancing &&
    pilgrim.state !== 'stand_punishment' &&
    pilgrim.state !== 'wait_for_vip_slot';
  const walkWobbleDeg =
    isMovingWalk && safeWobble > 0
      ? Math.sin(pilgrim.animTime * 10.5) * 4.2 * safeWobble
      : 0;

  const isFrontView =
    isRichKidDancing ||
    pilgrim.state === 'stand_punishment' ||
    frameIdx === 0 ||
    frameIdx === 1 ||
    pilgrim.id < 0 ||
    pilgrim.state === 'wait_for_vip_slot' ||
    pilgrim.state === 'walk_to_vip_check' ||
    pilgrim.state === 'walk_carpet_to_slot_y' ||
    pilgrim.state === 'return_to_seat_from_gift' ||
    pilgrim.state === 'return_from_punishment_to_seat' ||
    pilgrim.state === 'leave_down_exit';

  const showPunishmentBadge = Boolean(
    pilgrim.isPunishedInCurrentRound && pilgrim.punishmentMultiplier
  );

  const showComboBadge =
    (pilgrim.comboCount || 0) > 1 &&
    ((pilgrim.comboUntil && now < pilgrim.comboUntil) ||
      pilgrim.state === 'walk_to_teacher_gift' ||
      pilgrim.state === 'throw_flower_at_teacher');

  // 2.5D Depth Y-Sorting: Thân nhân vật luôn giữ nguyên zIndex theo tọa độ độ sâu Y thực tế của bàn học (effectiveBaseY)
  // (bạn ngồi bàn sau Y lớn luôn đè lên bạn ngồi bàn trước Y nhỏ; hai bạn cùng bàn có cùng tầng sâu và luôn đứng trước mặt bàn của chính mình)
  const depthY = isRichKidDancing ? effectiveBaseY + 2 : effectiveBaseY;
  const isGiftingFlowerToTeacher =
    pilgrim.state === 'walk_to_teacher_gift' ||
    pilgrim.state === 'throw_flower_at_teacher';
  const bodyZIndex = isGiftingFlowerToTeacher
    ? Math.max(600, Math.round(depthY) + 12)
    : Math.max(
        22,
        Math.round(depthY) + (isSeated || isAtDeskSeat ? 0 : 2)
      );

  // Tầng giao diện nổi (Thẻ tên, Bong bóng chat, Thẻ điểm, Huy hiệu): tách độc lập khỏi thân nhân vật
  const baseUiZIndex = 2000 + Math.max(10, Math.round(effectiveBaseY));
  const activeBubblePriority = showChatBubble
    ? 10000 + Math.floor(((pilgrim.chatBubbleUntil || 0) % 100000) / 10)
    : 0;
  const chatBubbleZIndex = isSpeakingBubble
    ? 20000
    : isPerformingGiftAction
    ? 18500
    : Math.max(baseUiZIndex + 50, activeBubblePriority);
  const nameTagZIndex = isSpeakingBubble
    ? 19990
    : isPerformingGiftAction
    ? 18490
    : showChatBubble
    ? Math.max(baseUiZIndex + 40, activeBubblePriority - 1)
    : showScoreCard
    ? 9850 + Math.round(effectiveBaseY / 10)
    : baseUiZIndex;
  const badgeUiZIndex = 9400 + Math.round(effectiveBaseY);

  const hairColors = ['#1e293b', '#0f172a', '#3f2e21', '#27272a', '#451a03'];
  const hairColor = hairColors[pilgrim.hairSeed % hairColors.length];

  // Khoảng cách cố định đồng nhất cho MỌI học sinh dựa trên characterScale trong Dev (không phụ thuộc depthScale theo hàng Y hay động tác giơ tay/cầm quà)
  // đảm bảo vị trí Thẻ tên, Bong bóng chat và Thẻ số điểm của tất cả học sinh luôn đồng nhất tuyệt đối theo đúng thông số Dev
  const uniformCharScale = characterScale || 1;
  const headTopOffsetPx = Math.round(72 * uniformCharScale) + 6;
  const quizBadgeTopOffsetPx = Math.round(72 * uniformCharScale) + 6;
  const wrongBadgeCenterOffsetPx = Math.round(40 * uniformCharScale);
  const feetBottomOffsetPx = Math.round(6 * uniformCharScale) + 2;

  const safeMaxNameChars = Math.max(
    3,
    Math.min(60, Math.round(nameTagMaxChars || 16))
  );
  const rawUsername = (pilgrim.username || '').trim();
  const displayUsername =
    rawUsername.length > safeMaxNameChars
      ? `${rawUsername.slice(0, safeMaxNameChars)}…`
      : rawUsername;

  const safeMaxBubbleChars = Math.max(
    5,
    Math.min(500, Math.round(chatBubbleMaxChars || 80))
  );
  const rawPrayer = (pilgrim.prayer || '').trim();
  const displayPrayer =
    rawPrayer.length > safeMaxBubbleChars
      ? `${rawPrayer.slice(0, safeMaxBubbleChars)}…`
      : rawPrayer;

  const safeBubbleFontSize = Math.max(
    7,
    Math.min(28, Number(chatBubbleFontSize || 11))
  );
  const safeBubbleMaxW = Math.max(
    64,
    Math.min(480, Math.round(chatBubbleMaxWidth || 195))
  );
  const safeBubbleMaxH = Math.max(
    24,
    Math.min(360, Math.round(chatBubbleMaxHeight || 110))
  );

  const isWaitingStagger = Boolean(
    pilgrim.spawnDelaySec && pilgrim.spawnDelaySec > 0
  );
  if (isWaitingStagger) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${pilgrim.x}px`,
        top: `${renderedY}px`,
      }}
    >
      {/* THẺ COMBO GẮN LÊN NGƯỜI HỌC SINH KHI TẶNG QUÀ CÓ COMBO */}
      {showComboBadge && (
        <div
          key={`combo_${pilgrim.comboPopKey || pilgrim.comboCount || 2}`}
          className="absolute left-0 pointer-events-none"
          style={{
            top: -Math.round(36 * finalScale),
            transform: 'translate(-50%, -50%)',
            zIndex: badgeUiZIndex + 30,
          }}
        >
          <div
            className="px-2 py-0.5 rounded-md bg-gradient-to-r from-rose-600 via-orange-500 to-amber-400 text-white font-mono font-black text-[10.5px] leading-none whitespace-nowrap border-2 border-yellow-200 shadow-[0_0_12px_rgba(251,146,60,0.95)] flex items-center gap-0.5 animate-pulse"
            style={{
              textShadow:
                '-1px -1px 0 #450a0a, 1px -1px 0 #450a0a, -1px 1px 0 #450a0a, 1px 1px 0 #450a0a',
            }}
          >
            <span>🔥</span>
            <span>COMBO x{pilgrim.comboCount}</span>
          </div>
        </div>
      )}

      {/* THÔNG BÁO ĐẶC BIỆT (VD: ĐỠ BẰNG KHIÊN) */}
      {showFloatingScore && (
        <div
          key={`fscore_${pilgrim.floatingScoreKey || 1}`}
          className="absolute left-0 pointer-events-none animate-bounce"
          style={{
            top: -(quizBadgeTopOffsetPx + 4),
            transform: 'translate(-50%, -100%)',
            zIndex: badgeUiZIndex + 20,
          }}
        >
          <div
            className="px-2.5 py-0.5 rounded-full font-mono font-black text-[13px] leading-none whitespace-nowrap shadow-xl"
            style={{
              backgroundColor:
                pilgrim.floatingScoreColor === 'red'
                  ? '#e11d48'
                  : pilgrim.floatingScoreColor === 'green'
                  ? '#16a34a'
                  : '#f59e0b',
              color: '#ffffff',
              border: '2px solid #451a03',
              textShadow:
                '-1px -1px 0 #451a03, 1px -1px 0 #451a03, -1px 1px 0 #451a03, 1px 1px 0 #451a03',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.75)',
            }}
          >
            {pilgrim.floatingScoreText}
          </div>
        </div>
      )}

      {showQuizResultBadge && pilgrim.quizResultStatus === 'wrong' && (
        <div
          className="absolute left-0 pointer-events-none"
          style={{
            top: -wrongBadgeCenterOffsetPx,
            transform: 'translate(-50%, -50%)',
            zIndex: badgeUiZIndex + 10,
          }}
        >
          <div
            className="w-8 h-8 rounded-full bg-rose-600/95 border-2 border-white flex items-center justify-center shadow-[0_0_14px_rgba(225,29,72,0.95)] animate-pulse"
            title="Trả lời sai - Mất chỗ ngồi"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path
                d="M6 6L18 18M18 6L6 18"
                stroke="#ffffff"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      )}

      {/* BONG BÓNG CHAT PHÁT BIỂU (Đồng nhất tâm ngang -50% với Thẻ tên, chỉ dịch ngang đúng bằng số pixel chatBubbleOffsetX trong Dev) */}
      {showChatBubble && (() => {
        const spreadPx = Number(chatBubbleOffsetX ?? 0);
        const horizontalShiftPx =
          Boolean(pilgrim.slotId) && isAtDeskSeat
            ? isLeftSeatmate
              ? -spreadPx
              : spreadPx
            : 0;

        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: horizontalShiftPx,
              top: -headTopOffsetPx + (chatBubbleOffsetY || 0),
              transform: `translate(-50%, -100%) scale(${(chatBubbleScale || 1).toFixed(2)})`,
              transformOrigin: '50% 100%',
              zIndex: chatBubbleZIndex,
            }}
          >
            <div
              style={{
                fontFamily: chatBubbleFontFamily,
                fontSize: `${safeBubbleFontSize}px`,
                maxWidth: `${safeBubbleMaxW}px`,
                minWidth: `${Math.min(72, safeBubbleMaxW)}px`,
              }}
              className={`relative px-2.5 py-1.5 rounded-xl bg-[#fffdf7]/95 text-slate-950 font-semibold leading-snug text-center break-words transition-all duration-200 ${
                isPerformingGiftAction
                  ? 'border-2 border-yellow-400 ring-2 ring-amber-300/90 shadow-[0_0_16px_rgba(250,204,21,0.95)] z-50'
                  : isSpeakingBubble
                  ? 'border-2 border-pink-400 shadow-[0_0_16px_rgba(244,114,182,0.85)] z-50 scale-105'
                  : pilgrim.isVip
                  ? 'border border-amber-400/90 shadow-lg'
                  : 'border border-sky-400/80 shadow-md'
              }`}
            >
              <div
                style={{ maxHeight: `${safeBubbleMaxH}px` }}
                className="overflow-hidden break-words"
              >
                {isSpeakingBubble && (
                  <span className="inline-block mr-1 text-pink-600 font-extrabold">
                    🔊
                  </span>
                )}
                <span>{displayPrayer}</span>
              </div>
              <div
                className={`w-2 h-2 absolute -bottom-1 bg-[#fffdf7] border-r border-b ${
                  isPerformingGiftAction
                    ? 'border-yellow-400'
                    : isSpeakingBubble
                    ? 'border-pink-400'
                    : pilgrim.isVip
                    ? 'border-amber-400/90'
                    : 'border-sky-400/80'
                }`}
                style={{
                  left: '50%',
                  transform: 'translateX(-50%) rotate(45deg)',
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* KHỐI THÂN NHÂN VẬT HỌC SINH (Phóng to / thu nhỏ 50% -> 300% quanh tâm chân 50% 88%, giữ nguyên zIndex theo độ sâu Y) */}
      <div
        className="relative pointer-events-none select-none"
        style={{
          zIndex: bodyZIndex,
          transform: `translate(-50%, ${
            isRichKidDancing
              ? `${-88 - Math.abs(Math.sin(pilgrim.animTime * 14)) * 12}%`
              : '-88%'
          }) scale(${finalScale.toFixed(3)}) ${
            isRichKidDancing
              ? `rotate(${Math.sin(pilgrim.animTime * 14) * 9}deg)`
              : walkWobbleDeg !== 0
              ? `rotate(${walkWobbleDeg.toFixed(2)}deg)`
              : ''
          }`,
          transformOrigin: '50% 88%',
        }}
      >

        {/* Quà tặng / Bó hoa hồng ôm trước ngực (giữa nhân vật) khi học sinh đang đi tặng Cô Giáo / Thầy Giám Thị */}
        {isHoldingGiftUp && pilgrim.state !== 'throw_flower_at_teacher' && (
          <div
            className={`absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none ${
              pilgrim.state === 'throw_offering_at_burner' ? 'animate-ping' : ''
            }`}
          >
            {pilgrim.state === 'walk_to_teacher_gift' ||
            pilgrim.giftActionKind === 'rose' ||
            pilgrim.giftActionKind === 'icecream' ? (
              <RoseBouquetModel
                customUrl={customAssets.roseBouquetUrl}
                scale={giftModelScales?.roseBouquet ?? 1}
              />
            ) : (
              <div className="p-1 rounded-full bg-amber-400/25 border border-amber-300/70 shadow-md">
                <SchoolGiftArt
                  type={pilgrim.offeringType}
                  customAssets={customAssets}
                  size="md"
                />
              </div>
            )}
          </div>
        )}

        {/* HÌNH NHÂN VẬT HỌC SINH CẤP 3 */}
        {customFrameSrc && !(isSeated && useDefaultPngModels) ? (
          <img
            src={customFrameSrc}
            alt={pilgrim.username}
            className="w-16 h-24 object-contain select-none pointer-events-none"
            style={{
              transform:
                (frameIdx === 8 || frameIdx === 9) && pilgrim.facingLeft
                  ? 'scaleX(-1)'
                  : undefined,
            }}
          />
        ) : useDefaultPngModels && processedDefaultModelSrc ? (
          <div
            className="w-16 h-24 relative flex items-end justify-center"
            style={{
              transform:
                !isSeated && isWalking
                  ? `translateY(${(Math.abs(stepPhase) * -2.2).toFixed(1)}px)`
                  : undefined,
            }}
          >
            <img
              src={processedDefaultModelSrc}
              alt={pilgrim.username}
              className={
                isSeated
                  ? 'w-14 h-[78px] object-contain object-bottom select-none pointer-events-none'
                  : 'w-16 h-24 object-contain object-bottom select-none pointer-events-none'
              }
            />
          </div>
        ) : (
          <div
            className="w-15 h-22 relative flex items-center justify-center"
            style={{
              transform:
                (frameIdx === 8 || frameIdx === 9) && pilgrim.facingLeft
                  ? 'scaleX(-1)'
                  : undefined,
            }}
          >
            <svg viewBox="0 0 64 88" className="w-full h-full overflow-visible">
              {/* Chân & Giày học sinh (Ẩn bớt khi đang ngồi trong hốc bàn đôi) */}
              {!isSeated ? (
                <g>
                  {/* Chân trái */}
                  <rect
                    x="23"
                    y={isWalking ? 58 + stepPhase * 2.8 : 58}
                    width="7"
                    height="19"
                    rx="3"
                    fill="#1e293b"
                  />
                  <ellipse
                    cx="26.5"
                    cy={isWalking ? 78 + stepPhase * 2.8 : 78}
                    rx="4.5"
                    ry="2.5"
                    fill="#ffffff"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  {/* Chân phải */}
                  <rect
                    x="34"
                    y={isWalking ? 58 - stepPhase * 2.8 : 58}
                    width="7"
                    height="19"
                    rx="3"
                    fill="#1e293b"
                  />
                  <ellipse
                    cx="37.5"
                    cy={isWalking ? 78 - stepPhase * 2.8 : 78}
                    rx="4.5"
                    ry="2.5"
                    fill="#ffffff"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                </g>
              ) : (
                /* Khi ngồi ở bàn đôi: phần chân thu gọn dưới ghế */
                <g>
                  <rect x="22" y="54" width="8" height="12" rx="3" fill="#1e293b" />
                  <rect x="34" y="54" width="8" height="12" rx="3" fill="#1e293b" />
                </g>
              )}

              {/* Thân áo sơ mi trắng đồng phục học sinh cấp 3 */}
              <g
                transform={
                  isGreetingTeacher ? 'translate(0, 2) rotate(4 32 50)' : undefined
                }
              >
                <rect
                  x="18"
                  y="32"
                  width="28"
                  height="26"
                  rx="7"
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="1.4"
                />

                {/* Cổ áo sơ mi & Cà vạt / Nơ cổ (nếu nhìn mặt trước) hoặc Balo / Cổ áo (nếu nhìn từ sau lưng) */}
                {isFrontView ? (
                  <g>
                    <polygon points="25,32 32,39 39,32" fill="#e2e8f0" />
                    {pilgrim.gender === 'female' ? (
                      /* Nữ sinh: Nơ cổ đỏ hồng duyên dáng + Vạt áo eo thon */
                      <g>
                        <polygon points="28,35 32,38 28,41" fill="#f43f5e" />
                        <polygon points="36,35 32,38 36,41" fill="#f43f5e" />
                        <circle cx="32" cy="38" r="1.8" fill="#be123c" />
                        <polygon points="30.8,39 33.2,39 34,49 30,49" fill="#fb7185" />
                      </g>
                    ) : (
                      /* Nam sinh: Cà vạt xanh navy mạnh mẽ */
                      <polygon
                        points="32,35.5 29.2,48 32,52.5 34.8,48"
                        fill="#1d4ed8"
                      />
                    )}
                    {/* Phù hiệu trường trên ngực trái */}
                    <rect
                      x="36"
                      y="38"
                      width="5.5"
                      height="4"
                      rx="1"
                      fill="#facc15"
                      stroke="#b45309"
                      strokeWidth="0.6"
                    />
                  </g>
                ) : (
                  <g>
                    {/* Quai cặp / Balo học sinh đeo sau lưng khi đi bộ, hoặc cổ áo khi ngồi bàn */}
                    {!isSeated ? (
                      <g>
                        <rect
                          x="21"
                          y="35"
                          width="22"
                          height="19"
                          rx="5"
                          fill={pilgrim.gender === 'female' ? '#ec4899' : '#0284c7'}
                          stroke="#0f172a"
                          strokeWidth="1"
                        />
                        <rect
                          x="24"
                          y="42"
                          width="16"
                          height="8"
                          rx="2"
                          fill={pilgrim.gender === 'female' ? '#f9a8d4' : '#38bdf8'}
                          fillOpacity="0.45"
                        />
                      </g>
                    ) : (
                      <g>
                        {/* Bờ vai áo sơ mi trắng học sinh ngồi học nghiêm túc */}
                        <path
                          d="M21 34 Q32 38 43 34"
                          stroke={pilgrim.gender === 'female' ? '#f43f5e' : '#3b82f6'}
                          strokeWidth="1.8"
                          fill="none"
                        />
                      </g>
                    )}
                  </g>
                )}

                {/* Cánh tay trái */}
                <rect
                  x="12"
                  y={isHoldingGiftUp ? 28 : 34}
                  width="6.5"
                  height="18"
                  rx="3"
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="1.2"
                />

                {/* Cánh tay phải (Giơ cao tay phát biểu ✋ khi có bình luận / đang đọc TTS!) */}
                {isRaisingHand ? (
                  <g>
                    <rect
                      x="44"
                      y="14"
                      width="6.5"
                      height="22"
                      rx="3"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1.2"
                    />
                    {/* Bàn tay giơ cao phát biểu */}
                    <circle cx="47.2" cy="12" r="4" fill="#fde68a" stroke="#d97706" strokeWidth="0.8" />
                  </g>
                ) : (
                  <rect
                    x="45.5"
                    y={isHoldingGiftUp ? 28 : 34}
                    width="6.5"
                    height="18"
                    rx="3"
                    fill="#ffffff"
                    stroke="#cbd5e1"
                    strokeWidth="1.2"
                  />
                )}

                {/* Đầu & Mái tóc học sinh cấp 3 */}
                <circle
                  cx="32"
                  cy="19"
                  r="12.5"
                  fill="#fde68a"
                  stroke="#d97706"
                  strokeWidth="1"
                />

                {isFrontView ? (
                  <g>
                    {/* Mắt & Nụ cười mặt trước */}
                    <circle cx="27.5" cy="19.5" r="1.6" fill="#0f172a" />
                    <circle cx="36.5" cy="19.5" r="1.6" fill="#0f172a" />
                    <path
                      d="M28.5 24 Q32 26.8 35.5 24"
                      stroke="#e11d48"
                      strokeWidth="1.4"
                      fill="none"
                      strokeLinecap="round"
                    />
                    {pilgrim.gender === 'female' ? (
                      /* Mái tóc Nữ sinh mặt trước: Tóc mái mềm + 2 lọn tóc dài hai bên + kẹp nơ hồng */
                      <>
                        <path
                          d="M19 18 C19 5.5 45 5.5 45 18 C42 12 36 10 32 10 C27 10 22 12 19 18 Z"
                          fill={hairColor}
                        />
                        <path
                          d="M19 16 C16 23 16 32 20 35"
                          stroke={hairColor}
                          strokeWidth="4.2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M45 16 C48 23 48 32 44 35"
                          stroke={hairColor}
                          strokeWidth="4.2"
                          strokeLinecap="round"
                        />
                        <circle cx="42" cy="11.5" r="2.6" fill="#f43f5e" />
                      </>
                    ) : (
                      /* Mái tóc Nam sinh mặt trước: Tóc ngắn cắt gọn nam tính có chỏm tóc trên đỉnh */
                      <>
                        <path
                          d="M19.5 17.5 C19.5 5 44.5 5 44.5 17.5 C42 11.5 36.5 9.5 32 9.5 C27 9.5 22 11.5 19.5 17.5 Z"
                          fill={hairColor}
                        />
                        <polygon points="29,7 32,2.5 35,7" fill={hairColor} />
                        <polygon points="34,7.5 38,3.5 39,8" fill={hairColor} />
                      </>
                    )}
                  </g>
                ) : (
                  /* Mặt sau mái tóc gọn gàng (Nữ buộc tóc đuôi gà + nơ hồng, Nam cắt gọn có chỏm tóc) */
                  <g>
                    <path
                      d="M19.5 20 C19.5 6 44.5 6 44.5 20 C44.5 26 39 29 32 29 C25 29 19.5 26 19.5 20 Z"
                      fill={hairColor}
                    />
                    {pilgrim.gender === 'female' ? (
                      <g>
                        {/* Nơ buộc tóc nữ sinh */}
                        <polygon points="27,21 32,23.5 27,26" fill="#f43f5e" />
                        <polygon points="37,21 32,23.5 37,26" fill="#f43f5e" />
                        <circle cx="32" cy="23.5" r="2.5" fill="#be123c" />
                        {/* Đuôi tóc dài */}
                        <path
                          d="M32 25 C28.5 32 29.5 39 32 42 C34.5 39 35.5 32 32 25 Z"
                          fill={hairColor}
                        />
                      </g>
                    ) : (
                      <g>
                        {/* Tóc gáy cắt gọn + chỏm tóc nam sinh */}
                        <polygon points="29,7 32,2.5 35,7" fill={hairColor} />
                        <polygon points="34,7.5 38,3.5 39,8" fill={hairColor} />
                      </g>
                    )}
                  </g>
                )}
              </g>
            </svg>
          </div>
        )}
      </div>

      {/* BẢNG TÊN HỌC SINH + HỆ THỐNG ICON BUFF & THẺ SHOW SỐ ĐIỂM PHÍA TRÊN THẺ TÊN
          Lưu ý: Thẻ tên pill được cố định tuyệt đối tại top = feetBottomOffsetPx + nameTagOffsetY.
          Các icon buff và Thẻ Show số điểm dùng position: absolute (bottom-full) phía trên thẻ tên
          để KHÔNG BAO GIỜ đẩy thẻ tên tụt xuống gây chồng lấn khi 2 bạn ngồi cùng bàn! */}
      <div
        className="absolute left-0 pointer-events-none"
        style={{
          top: feetBottomOffsetPx + (nameTagOffsetY || 0),
          transform: `translate(-50%, 0) scale(${(nameTagScale || 1).toFixed(2)})`,
          transformOrigin: '50% 0%',
          zIndex: nameTagZIndex,
        }}
      >
        <div className="relative flex flex-col items-center">
          {/* Hàng Icon Hiệu Ứng Nhỏ (Buff Khiên & Buff Combo Câu Đúng Liên Tiếp):
              Chỉ hiện khi không đang bật Thẻ Show Số Điểm (hoặc đặt lệch lên trên Thẻ Điểm) để KHÔNG làm dịch vị trí Thẻ Show Số Điểm so với Thẻ Tên */}
          {!showScoreCard &&
            (pilgrim.hasShield ||
              (Boolean(pilgrim.slotId) && (pilgrim.correctStreak || 0) >= 2)) && (
              <div className="absolute bottom-full mb-0.5 left-1/2 -translate-x-1/2 flex items-center justify-center gap-0.5 whitespace-nowrap">
                {pilgrim.hasShield && (
                  <div className="inline-flex items-center rounded bg-slate-950/90 border border-cyan-400/85 shadow-sm overflow-hidden">
                    <span className="px-0.5 py-0.2 bg-cyan-500/25 text-[8.5px] leading-none flex items-center justify-center">
                      🛡️
                    </span>
                    <span className="px-1 py-0.2 text-[7.5px] font-extrabold text-cyan-200 leading-none tracking-tight">
                      Khiên
                    </span>
                  </div>
                )}

                {Boolean(pilgrim.slotId) && (pilgrim.correctStreak || 0) >= 2 && (
                  <div
                    className="inline-flex items-center rounded bg-slate-950/90 border border-amber-400/85 shadow-sm overflow-hidden"
                    style={{
                      fontFamily: streakTagFontFamily || nameTagFontFamily,
                      transform: `scale(${Math.max(0.4, Math.min(2.6, Number(streakTagScale ?? 1))).toFixed(2)})`,
                      transformOrigin: '50% 100%',
                    }}
                  >
                    <span className="px-0.5 py-0.2 bg-amber-500/25 text-[8.5px] leading-none flex items-center justify-center">
                      🔥
                    </span>
                    <span className="px-1 py-0.2 text-[7.5px] font-extrabold text-amber-200 leading-none tracking-tight">
                      x{pilgrim.correctStreak}
                    </span>
                  </div>
                )}
              </div>
            )}

          {/* THẺ SHOW SỐ ĐIỂM + SỐ ĐIỂM CỘNG/TRỪ (MÀU XANH LÁ / ĐỎ, VIỀN ĐEN ĐẬM, KHÔNG NỀN, TEXT RUN NHẸ)
              Vị trí cố định tuyệt đối cách Thẻ tên đúng 2px + scoreTagOffsetY trong Dev cho MỌI học sinh (không bao giờ bị đẩy lệch bởi icon buff) */}
          {showScoreCard && (() => {
            const totalScore = Math.max(
              0,
              Math.round(pilgrim.currentScoreDisplay ?? 0)
            );
            const delta = Math.round(pilgrim.scoreChangeDelta ?? 0);
            const isPositive = delta >= 0;
            const formattedDelta = delta > 0 ? `+${delta}` : `${delta}`;
            const safeFontSize = Math.max(
              8,
              Math.min(36, Number(scoreChangeFontSize || 14))
            );
            const safeStrokeW = Math.max(
              0.5,
              Math.min(8, Number(scoreChangeStrokeWidth ?? 2.5))
            );
            const safeScoreCardScale = Math.max(
              0.4,
              Math.min(2.6, Number(scoreTagScale ?? 1))
            );
            const safeVfxScale = Math.max(
              0.3,
              Math.min(3.0, Number(vfxFlower10Scale ?? 1))
            );
            const vfxOffX = Number(vfxFlower10OffsetX ?? 0);
            const vfxOffY = Number(vfxFlower10OffsetY ?? 0);

            return (
              <div
                key={`scard_${pilgrim.scoreCardKey || 1}`}
                className="absolute left-1/2 flex flex-col items-center pointer-events-none select-none z-50"
                style={{
                  bottom: 'calc(100% + 2px)',
                  transform: `translate(-50%, ${scoreTagOffsetY || 0}px)`,
                }}
              >
                {/* HIỆU ỨNG VFX: HOA ĐIỂM MƯỜI BUNG NỔ RA NHIỀU BÔNG HOA NGAY VỊ TRÍ CỘNG ĐIỂM */}
                {delta > 0 && vfxFlower10Enabled !== false && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `calc(50% + ${vfxOffX}px)`,
                      top: `calc(50% + ${vfxOffY}px)`,
                      transform: `translate(-50%, -50%) scale(${safeVfxScale.toFixed(2)})`,
                      zIndex: 60,
                    }}
                  >
                    <style>{`
                      @keyframes vfxFlower10ParticleBurst {
                        0% {
                          opacity: 0;
                          transform: translate(-50%, -50%) translate(0px, 0px) scale(0.2) rotate(0deg);
                        }
                        18% {
                          opacity: 1;
                          transform: translate(-50%, -50%) translate(calc(var(--f10-dx) * 0.65), calc(var(--f10-dy) * 0.65)) scale(var(--f10-s)) rotate(calc(var(--f10-rot) * 0.5));
                        }
                        68% {
                          opacity: 0.95;
                          transform: translate(-50%, -50%) translate(var(--f10-dx), var(--f10-dy)) scale(calc(var(--f10-s) * 0.92)) rotate(var(--f10-rot));
                        }
                        100% {
                          opacity: 0;
                          transform: translate(-50%, -50%) translate(calc(var(--f10-dx) * 1.18), calc(var(--f10-dy) * 1.18 + 6px)) scale(0.35) rotate(calc(var(--f10-rot) * 1.35));
                        }
                      }
                      @keyframes vfxFlower10CoreFlash {
                        0% {
                          opacity: 0.95;
                          transform: translate(-50%, -50%) scale(0.3);
                        }
                        45% {
                          opacity: 0.65;
                          transform: translate(-50%, -50%) scale(1.45);
                        }
                        100% {
                          opacity: 0;
                          transform: translate(-50%, -50%) scale(2.1);
                        }
                      }
                    `}</style>
                    <div
                      className="absolute left-0 top-0 w-9 h-9 rounded-full bg-amber-300/60 blur-[3px]"
                      style={{
                        animation: 'vfxFlower10CoreFlash 620ms ease-out forwards',
                      }}
                    />
                    {FLOWER_10_BURST_VECTORS.map((vec, idx) => (
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

                {/* Số điểm thay đổi (+ / -): nằm cố định ngay phía trên Thẻ số điểm, không nền, chữ xanh lá / đỏ, viền đen đậm, hiệu ứng run nhẹ */}
                {delta !== 0 && (
                  <div
                    className="score-delta-vibrate font-mono font-black leading-none whitespace-nowrap mb-0.5 relative z-10"
                    style={{
                      fontSize: `${safeFontSize}px`,
                      color: isPositive ? '#4ade80' : '#f87171',
                      WebkitTextStroke: `${safeStrokeW}px #000000`,
                      paintOrder: 'stroke fill',
                      textShadow:
                        '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 2px rgba(0,0,0,0.95)',
                    }}
                  >
                    {formattedDelta}
                  </div>
                )}

                {/* Thẻ Show số điểm hiện tại của học sinh */}
                <div
                  className="px-1.5 py-0.5 rounded-md bg-slate-950/95 border border-amber-400/90 text-amber-200 font-mono font-black text-[9.5px] leading-none whitespace-nowrap shadow-[0_2px_6px_rgba(0,0,0,0.85)] flex items-center gap-0.5 relative z-10"
                  style={{
                    transform: `scale(${safeScoreCardScale.toFixed(2)})`,
                    transformOrigin: '50% 100%',
                  }}
                >
                  <span className="text-[8.5px] leading-none">🌸</span>
                  <span>{totalScore}</span>
                </div>
              </div>
            );
          })()}

          {/* Thẻ Tên Chính (cố định chiều cao 20px) */}
          <div
            style={{ fontFamily: nameTagFontFamily }}
            className={`h-[20px] pl-0 pr-1.5 py-0 rounded-full flex items-center gap-1 whitespace-nowrap transition-shadow ${
              isPerformingGiftAction
                ? 'bg-amber-950/95 border-2 border-yellow-300 ring-2 ring-amber-300/85 text-yellow-200 shadow-[0_0_14px_rgba(250,204,21,0.98)]'
                : pilgrim.isGoldenPriority || isRichKidDancing
                ? 'bg-amber-950/95 border border-yellow-300 text-yellow-200 shadow-[0_0_10px_rgba(250,204,21,0.85)]'
                : isSpeakingBubble
                ? 'bg-pink-950/95 border border-pink-400 text-pink-200 shadow-[0_0_10px_rgba(244,114,182,0.75)]'
                : showChatBubble
                ? 'bg-slate-950/95 border border-sky-400 text-sky-100 shadow-[0_0_8px_rgba(56,189,248,0.65)]'
                : pilgrim.isVip
                ? 'bg-amber-950/90 border border-amber-400/80 text-amber-200 shadow-sm'
                : 'bg-slate-950/85 border border-slate-700/80 text-slate-100 shadow-sm'
            }`}
          >
            {pilgrim.avatarUrl ? (
              <img
                src={pilgrim.avatarUrl}
                alt=""
                className="w-4 h-4 rounded-full object-cover border border-white/40 shrink-0 -ml-px"
              />
            ) : (
              <span
                className="w-4 h-4 rounded-full shrink-0 inline-block border border-white/30 -ml-px"
                style={{ backgroundColor: pilgrim.avatarColor }}
              />
            )}
            <span
              className={`text-[9.5px] font-bold tracking-tight py-0.5 ${
                pilgrim.isGoldenPriority || isRichKidDancing
                  ? 'text-yellow-300 font-black'
                  : ''
              }`}
            >
              {displayUsername}
            </span>
            {(pilgrim.isVip || pilgrim.isGoldenPriority || isRichKidDancing) && (
              <span className="text-[8px] font-extrabold text-yellow-300">
                {pilgrim.isGoldenPriority || isRichKidDancing ? '👑' : '★'}
              </span>
            )}
          </div>

          {/* THẺ BUFF NHÂN ĐIỂM KHI BỊ PHẠT ĐỨNG TRÊN BỤC (x3 / x6 / x9): Nằm dưới thẻ tên và giảm kích thước 20% (scale 0.8) */}
          {showPunishmentBadge && (
            <div
              className="absolute left-1/2 pointer-events-none whitespace-nowrap"
              style={{
                top: 'calc(100% + 2px)',
                transform: 'translate(-50%, 0) scale(0.8)',
                transformOrigin: 'top center',
              }}
            >
              <div
                className={`px-2 py-0.5 rounded-md font-mono font-black text-[12px] leading-none whitespace-nowrap border-2 shadow-lg flex items-center gap-0.5 ${
                  pilgrim.punishmentMultiplier === 9
                    ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-rose-500 text-slate-950 border-yellow-100 shadow-[0_0_12px_rgba(250,204,21,0.95)]'
                    : pilgrim.punishmentMultiplier === 6
                    ? 'bg-gradient-to-r from-orange-600 to-rose-600 text-white border-amber-200 shadow-[0_0_10px_rgba(249,115,22,0.85)]'
                    : 'bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white border-cyan-200 shadow-[0_0_10px_rgba(217,70,239,0.85)]'
                }`}
              >
                <span>⚡</span>
                <span>x{pilgrim.punishmentMultiplier}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function areStudentSpritePropsEqual(
  prev: StudentSpriteProps,
  next: StudentSpriteProps
): boolean {
  if (
    prev.isLeftSeatmate !== next.isLeftSeatmate ||
    prev.deskSeatY !== next.deskSeatY ||
    prev.isSpeakingBubble !== next.isSpeakingBubble ||
    prev.characterScale !== next.characterScale ||
    prev.useDefaultPngModels !== next.useDefaultPngModels ||
    prev.nameTagFontFamily !== next.nameTagFontFamily ||
    prev.nameTagScale !== next.nameTagScale ||
    prev.nameTagMaxChars !== next.nameTagMaxChars ||
    prev.nameTagOffsetY !== next.nameTagOffsetY ||
    prev.streakTagFontFamily !== next.streakTagFontFamily ||
    prev.streakTagScale !== next.streakTagScale ||
    prev.scoreTagScale !== next.scoreTagScale ||
    prev.scoreTagOffsetY !== next.scoreTagOffsetY ||
    prev.scoreChangeFontSize !== next.scoreChangeFontSize ||
    prev.scoreChangeStrokeWidth !== next.scoreChangeStrokeWidth ||
    prev.vfxFlower10Enabled !== next.vfxFlower10Enabled ||
    prev.vfxFlower10Scale !== next.vfxFlower10Scale ||
    prev.vfxFlower10OffsetX !== next.vfxFlower10OffsetX ||
    prev.vfxFlower10OffsetY !== next.vfxFlower10OffsetY ||
    prev.chatBubbleFontFamily !== next.chatBubbleFontFamily ||
    prev.chatBubbleScale !== next.chatBubbleScale ||
    prev.chatBubbleMaxChars !== next.chatBubbleMaxChars ||
    prev.chatBubbleMaxWidth !== next.chatBubbleMaxWidth ||
    prev.chatBubbleMaxHeight !== next.chatBubbleMaxHeight ||
    prev.chatBubbleFontSize !== next.chatBubbleFontSize ||
    prev.chatBubbleOffsetY !== next.chatBubbleOffsetY ||
    prev.chatBubbleOffsetX !== next.chatBubbleOffsetX ||
    prev.walkWobbleIntensity !== next.walkWobbleIntensity ||
    prev.customAssets !== next.customAssets ||
    prev.giftModelScales !== next.giftModelScales
  ) {
    return false;
  }

  const a = prev.pilgrim;
  const b = next.pilgrim;
  if (a === b) return true;

  if (
    a.id !== b.id ||
    a.state !== b.state ||
    a.slotId !== b.slotId ||
    Math.abs(a.x - b.x) > 0.05 ||
    Math.abs(a.y - b.y) > 0.05 ||
    a.facingLeft !== b.facingLeft ||
    Boolean((a.spawnDelaySec || 0) > 0) !== Boolean((b.spawnDelaySec || 0) > 0) ||
    a.username !== b.username ||
    a.gender !== b.gender ||
    a.avatarUrl !== b.avatarUrl ||
    a.avatarColor !== b.avatarColor ||
    a.isVip !== b.isVip ||
    a.isGoldenPriority !== b.isGoldenPriority ||
    a.isCarryingGift !== b.isCarryingGift ||
    a.prayer !== b.prayer ||
    a.chatBubbleUntil !== b.chatBubbleUntil ||
    a.quizResultStatus !== b.quizResultStatus ||
    a.quizResultUntil !== b.quizResultUntil ||
    a.scoreCardUntil !== b.scoreCardUntil ||
    a.scoreCardKey !== b.scoreCardKey ||
    a.currentScoreDisplay !== b.currentScoreDisplay ||
    a.scoreChangeDelta !== b.scoreChangeDelta ||
    a.floatingScoreText !== b.floatingScoreText ||
    a.floatingScoreUntil !== b.floatingScoreUntil ||
    a.floatingScoreKey !== b.floatingScoreKey ||
    a.comboCount !== b.comboCount ||
    a.comboUntil !== b.comboUntil ||
    a.comboPopKey !== b.comboPopKey ||
    a.richKidDanceUntil !== b.richKidDanceUntil ||
    a.giftActionBusyUntil !== b.giftActionBusyUntil ||
    a.giftActionHighlightUntil !== b.giftActionHighlightUntil ||
    a.isPunishedInCurrentRound !== b.isPunishedInCurrentRound ||
    a.punishmentMultiplier !== b.punishmentMultiplier ||
    a.hasShield !== b.hasShield ||
    a.correctStreak !== b.correctStreak
  ) {
    return false;
  }

  // Nếu học sinh đang ngồi yên ổn định (state === 'pray_seated' và đã qua 2s giơ tay chào ban đầu, không nhảy Rich Kid):
  // Bỏ qua hoàn toàn việc re-render do animTime / stateTimer / prayTimer tăng!
  const now = Date.now();
  const isDancing = Boolean(b.richKidDanceUntil && now < b.richKidDanceUntil);
  if (
    b.state === 'pray_seated' &&
    !isDancing &&
    a.stateTimer >= 2.0 &&
    b.stateTimer >= 2.0
  ) {
    return true;
  }

  return Math.abs(a.animTime - b.animTime) < 0.01;
}

export const StudentSprite = React.memo(
  StudentSpriteInner,
  areStudentSpritePropsEqual
);

