import {
  BgmTrackItem,
  ClassroomGiftEventId,
  CustomAssetsConfig,
  DharmaArticleItem,
  DonorEntry,
  EnglishQuizItem,
  GameConfig,
  GiftModelScalesConfig,
  GridConfig,
  GuideTaskItem,
  KneelSlot,
  NpcSpeechCategoriesConfig,
  OfferingGiftType,
  RectBounds,
  TempleMonkData,
  ZombieProjectileScalesConfig,
} from '../types/game';
import { BUILT_IN_TIERED_QUIZ_DECKS } from './vocabDecks';
import { parseLargeQuizTxtFast, ParseQuizTxtOptions } from '../utils/quizDeckEngine';
import {
  DEFAULT_REMINDER_ALERT_COOLDOWN_SEC,
  DEFAULT_REMINDER_ALERT_KEYWORDS,
  DEFAULT_REMINDER_ALERT_URL,
} from '../utils/silentReminderAlert';

export const DEFAULT_BG_IMAGE =
  './assets/aistudio/a5c97e27-3fbf-4c87-b5fa-36b9fd61be24_37000eba.jpg';

export const DEFAULT_DESK_IMAGE =
  './assets/aistudio/Worn_Wooden_School_Desk_Cutout_7c1da1e1.png';

export const DEFAULT_GIRL_STUDENT_STANDING_IMG =
  './assets/aistudio/girl_student_2281d561.png';

export const DEFAULT_GIRL_STUDENT_SEATED_IMG =
  './assets/aistudio/girl_student_seated_wooden_chair.png?v=2';

export const DEFAULT_BOY_STUDENT_STANDING_IMG =
  './assets/aistudio/boy_student_3dde846e.png';

export const DEFAULT_BOY_STUDENT_SEATED_IMG =
  './assets/aistudio/boy_student_Seated_on_Wooden_Chair_47ed896b.png';

export const DEFAULT_FEMALE_TEACHER_IMG =
  './assets/aistudio/Girl_Teacher_29eb2706.png';

export const DEFAULT_MALE_TEACHER_IMG =
  './assets/aistudio/Male_Teacher.jpg';

export const DEFAULT_SPRITESHEETS: CustomAssetsConfig = {
  customBgUrl: DEFAULT_BG_IMAGE,
  deskModelUrl: DEFAULT_DESK_IMAGE,
  templeSignPngUrl: null,
  pilgrimFemaleSpritesheetUrl: null,
  pilgrimMaleSpritesheetUrl: null,
  abbotSpritesheetUrl: null,
  seniorNoviceSpritesheetUrl: null,
  juniorNoviceSpritesheetUrl: null,
  offeringIncenseUrl: null,
  offeringRoseUrl: null,
  offeringLotusUrl: null,
  offeringTrayUrl: null,
  roseBouquetUrl: null,
  deskCatUrl: null,
  deskTrophyUrl: null,
  snackBagUrl: null,
  pcGamingDeskUrl: null,
  runningPigUrl: null,
  fallingMoneyUrl: null,
  zombieSpriteUrl: null,
  projPencilCaseUrl: null,
  projBlueRulerUrl: null,
  projCasioUrl: null,
  projBookUrl: null,
  projChairUrl: null,
  projDeskMateUrl: null,
  milkTeaCupUrl: null,
};

export const DEFAULT_ZOMBIE_PROJECTILE_SCALES: ZombieProjectileScalesConfig = {
  pencilCase: 1.0,
  blueRuler: 1.0,
  casio: 1.0,
  book: 1.0,
  chair: 1.0,
  deskMate: 1.0,
};

export const DEFAULT_GIFT_MODEL_SCALES: GiftModelScalesConfig = {
  roseBouquet: 1.0,
  deskCat: 1.0,
  deskTrophy: 1.0,
  previewDeskTrophy: false,
  snackBag: 1.0,
  pcGamingDesk: 1.25,
  runningPig: 1.0,
  fallingMoney: 1.0,
  deskCatOffsetX: 0,
  deskCatOffsetY: 0,
  snackBagOffsetX: 0,
  snackBagOffsetY: 0,
  deskPigOffsetX: 0,
  deskPigOffsetY: 0,
  maxDeskCats: 1,
};

export interface ClassroomGiftEventMeta {
  id: ClassroomGiftEventId;
  coins: number;
  priceBadge: string;
  giftLabel: string;
  actionTitle: string;
  bonusPoints: number;
  offeringType: OfferingGiftType;
  colorTheme: GuideTaskItem['colorTheme'];
  description: string;
}

export const GIFT_POINTS_PER_COIN = 5;

export function calculateGiftBonusPoints(coins: number): number {
  const safeCoins = Math.max(1, Math.round(Number(coins) || 1));
  return safeCoins * GIFT_POINTS_PER_COIN;
}

export const CLASSROOM_GIFT_EVENTS_META: ClassroomGiftEventMeta[] = [
  {
    id: 'rose',
    coins: 1,
    priceBadge: '(1)',
    giftLabel: '(1) Hoa hồng',
    actionTitle: 'Tặng hoa cho cô',
    bonusPoints: 5,
    offeringType: 'rose',
    colorTheme: 'pink',
    description: '+5đ (1 xu = +5đ) • Cầm bó hoa hồng đi đến cạnh Cô Giáo tặng hoa + nổ hoa rồi về chỗ',
  },
  {
    id: 'icecream',
    coins: 1,
    priceBadge: '(1)',
    giftLabel: '(1) Kem',
    actionTitle: 'Tặng hoa cho thầy',
    bonusPoints: 5,
    offeringType: 'icecream',
    colorTheme: 'cyan',
    description: '+5đ (1 xu = +5đ) • Cầm hoa đi đến cạnh Thầy Giám Thị tặng hoa + nổ hoa rồi về chỗ',
  },
  {
    id: 'cat',
    coins: 1,
    priceBadge: '(1)',
    giftLabel: '(1) Đỉnh (Con mèo)',
    actionTitle: 'Nuôi mèo',
    bonusPoints: 5,
    offeringType: 'cat',
    colorTheme: 'amber',
    description: '+5đ (1 xu = +5đ) • Quà Đỉnh (con mèo đưa tay lên like 1 coin) • Mèo rơi xuống bàn học (tối đa 1 con trên bàn)',
  },
  {
    id: 'gg',
    coins: 1,
    priceBadge: '(1)',
    giftLabel: '(1) GG',
    actionTitle: 'Ăn vụn',
    bonusPoints: 5,
    offeringType: 'gg',
    colorTheme: 'emerald',
    description: '+5đ (1 xu = +5đ) • Bịch snack rơi xuống bàn học (sát mép trái/phải theo chỗ ngồi, mất khi sai/không trả lời)',
  },
  {
    id: 'heart',
    coins: 5,
    priceBadge: '(5)',
    giftLabel: '(5) Bắn tim',
    actionTitle: 'Điện thoại reo',
    bonusPoints: 25,
    offeringType: 'heart',
    colorTheme: 'pink',
    description: '+25đ (1 xu = +5đ) • Đổi skin bàn thành Bàn PC Gaming RGB (mất skin khi trả lời sai/không trả lời)',
  },
  {
    id: 'pig',
    coins: 10,
    priceBadge: '(10)',
    giftLabel: '(10) Chú heo may mắn',
    actionTitle: 'Thả heo hù dọa',
    bonusPoints: 50,
    offeringType: 'pig',
    colorTheme: 'amber',
    description: '+50đ (1 xu = +5đ) • Quà Chú heo may mắn (10 coin) • Thêm 1 heo lên bàn (max 1) & Thả 8 con heo tấn công (-20đ mỗi người)',
  },
  {
    id: 'vip',
    coins: 20,
    priceBadge: '(10+)',
    giftLabel: '(10+) VIP',
    actionTitle: 'Tôi là Rich Kid',
    bonusPoints: 100,
    offeringType: 'vip',
    colorTheme: 'yellow',
    description: 'Bản thân +5đ/xu (+100đ với 20 xu), cả lớp +30đ • Đứng lên mặt bàn nhảy 5s + Mưa tiền rơi đầy màn hình 5s',
  },
];

/**
 * Phân giải món quà TikTok / Test thành 1 trong 7 sự kiện quà tặng lớp học.
 * Nếu món quà không có trong danh sách thì chọn ngẫu nhiên món bằng giá hoặc gần bằng giá nhất để kích hoạt.
 */
export function resolveClassroomGiftKind(
  rawGiftName?: string,
  rawCoins?: number
): ClassroomGiftEventMeta {
  const name = (rawGiftName || '').trim().toLowerCase();
  const coins = Math.max(1, Number(rawCoins) || 1);

  if (name) {
    if (
      name.includes('hoa hồng') ||
      name.includes('hoa hong') ||
      name === 'rose' ||
      name.includes('tặng hoa cho cô')
    ) {
      return CLASSROOM_GIFT_EVENTS_META[0]; // rose
    }
    if (
      name.includes('kem') ||
      name.includes('ice cream') ||
      name.includes('icecream') ||
      name.includes('cone') ||
      name.includes('tặng hoa cho thầy')
    ) {
      return CLASSROOM_GIFT_EVENTS_META[1]; // icecream
    }
    if (
      name === 'đỉnh' ||
      name === 'dinh' ||
      name.includes('đỉnh') ||
      name.includes('đưa tay lên like') ||
      name.includes('dua tay len like') ||
      name.includes('mèo') ||
      name.includes('meo') ||
      name.includes('cat') ||
      name.includes('kitten') ||
      name.includes('thumbs up') ||
      name.includes('awesome') ||
      name.includes('nuôi mèo')
    ) {
      return CLASSROOM_GIFT_EVENTS_META[2]; // cat - Đỉnh (quà con mèo đưa tay lên like 1 coin)
    }
    if (
      name === 'gg' ||
      name.includes('ăn vụn') ||
      name.includes('an vun') ||
      name.includes('snack') ||
      name.includes('good game')
    ) {
      return CLASSROOM_GIFT_EVENTS_META[3]; // gg
    }
    if (
      name.includes('bắn tim') ||
      name.includes('ban tim') ||
      name.includes('finger heart') ||
      name.includes('heart me') ||
      name.includes('điện thoại reo') ||
      name.includes('pc gaming') ||
      name === 'heart'
    ) {
      return CLASSROOM_GIFT_EVENTS_META[4]; // heart (5 xu)
    }
    if (
      name.includes('chú heo may mắn') ||
      name.includes('chu heo may man') ||
      name.includes('heo may mắn') ||
      name.includes('heo may man') ||
      name.includes('lucky pig') ||
      name.includes('piggy') ||
      name.includes('heo') ||
      name.includes('pig') ||
      name.includes('lợn') ||
      name.includes('thả heo')
    ) {
      return CLASSROOM_GIFT_EVENTS_META[5]; // pig (10 xu - Chú heo may mắn)
    }
    if (
      name.includes('vip') ||
      name.includes('rich kid') ||
      name.includes('richkid') ||
      name.includes('cúp') ||
      name.includes('quà lớn')
    ) {
      return CLASSROOM_GIFT_EVENTS_META[6]; // vip (10+)
    }
  }

  // Fallback theo giá hoặc gần bằng giá ngẫu nhiên cho các món quà không có trong danh sách:
  // - Nhóm 1 xu (1..2 xu): chọn ngẫu nhiên 1 trong 4 món 1 xu (Hoa hồng, Kem, Con mèo, GG)
  if (coins <= 2) {
    const oneCoinPool = CLASSROOM_GIFT_EVENTS_META.slice(0, 4);
    return oneCoinPool[Math.floor(Math.random() * oneCoinPool.length)];
  }
  // - Nhóm gần 5 xu (3..7 xu): chọn Bắn tim (5 xu)
  if (coins <= 7) {
    return CLASSROOM_GIFT_EVENTS_META[4]; // heart (5 xu)
  }
  // - Nhóm gần 10 xu (8..14 xu): chọn Heo (10 xu)
  if (coins <= 14) {
    return CLASSROOM_GIFT_EVENTS_META[5]; // pig (10 xu)
  }
  // - Nhóm > 10 xu (15+ xu): chọn VIP Rich Kid (10+)
  return CLASSROOM_GIFT_EVENTS_META[6];
}

/**
 * Khu vực bục giảng lát gạch thực tế dành cho Giáo viên chủ nhiệm & Cán bộ lớp:
 * Khớp chính xác mặt bục giảng trong ảnh nền mới (x: 68..472, y: 426..460)
 */
export const MONK_ZONE_BOUNDS: RectBounds = {
  minX: 68,
  maxX: 472,
  minY: 426,
  maxY: 460,
};

/**
 * Khu vực di chuyển tuần tra của Thầy Giám Thị (hành lang đầu lớp & gần cửa lớp):
 */
export const SUPERVISOR_ZONE_BOUNDS: RectBounds = {
  minX: 64,
  maxX: 300,
  minY: 474,
  maxY: 522,
};

/**
 * Khu vực các dãy bàn đôi học sinh ngồi trên nền gạch bông vàng thực tế:
 */
export const RED_PRAY_ZONES = {
  left: { minX: 38, maxX: 252, minY: 594, maxY: 912 },
  right: { minX: 288, maxX: 502, minY: 594, maxY: 912 },
};

/**
 * Tỉ lệ phối cảnh chiều sâu (depthScale) cho nhân vật trong lớp học:
 * - Bục giảng phía trên (y = 450) -> 0.72
 * - Hàng bàn cuối lớp gần cửa (y = 950) -> 1.00
 */
export function getCharacterDepthScale(y: number): number {
  const minY = 450;
  const maxY = 950;
  const t = Math.max(0, Math.min(1, (y - minY) / (maxY - minY)));
  return 0.72 + t * 0.28;
}

export interface DoubleDeskRenderGroup {
  deskId: string;
  centerX: number;
  centerY: number;
  width: number;
  seatOffset: number;
  isVip: boolean;
  leftSlot: KneelSlot;
  rightSlot?: KneelSlot;
  leftIndex: number;
  rightIndex: number;
}

/**
 * Gom các chỗ ngồi thành từng BÀN ĐÔI 2 CHỖ (trái + phải) để vẽ & kéo thả cả bàn đôi
 */
export function groupSlotsIntoDoubleDesks(
  slots: KneelSlot[],
  prefix: string
): DoubleDeskRenderGroup[] {
  const byDeskId = new Map<string, Array<{ slot: KneelSlot; index: number }>>();
  const ungrouped: Array<{ slot: KneelSlot; index: number }> = [];

  slots.forEach((s, index) => {
    if (s.deskId) {
      const list = byDeskId.get(s.deskId) || [];
      list.push({ slot: s, index });
      byDeskId.set(s.deskId, list);
    } else {
      ungrouped.push({ slot: s, index });
    }
  });

  // Nếu có các slot cũ không có deskId, tự động ghép từng cặp 2 chỗ gần nhau
  if (ungrouped.length > 0) {
    const sorted = [...ungrouped].sort((a, b) =>
      Math.abs(a.slot.y - b.slot.y) > 14 ? a.slot.y - b.slot.y : a.slot.x - b.slot.x
    );
    for (let i = 0; i < sorted.length; i += 2) {
      const s1 = sorted[i];
      const s2 = sorted[i + 1];
      const id = `${prefix}-pair-${i / 2}`;
      if (s2) {
        byDeskId.set(id, [s1, s2]);
      } else {
        byDeskId.set(id, [s1]);
      }
    }
  }

  const desks: DoubleDeskRenderGroup[] = [];
  byDeskId.forEach((pair, deskId) => {
    const sortedPair = [...pair].sort((a, b) => a.slot.x - b.slot.x);
    const leftEntry = sortedPair[0];
    const rightEntry = sortedPair[1];
    const leftSlot = leftEntry.slot;
    const rightSlot = rightEntry?.slot;
    const centerX = rightSlot
      ? Math.round((leftSlot.x + rightSlot.x) / 2)
      : leftSlot.deskCenterX ?? leftSlot.x;
    const centerY = rightSlot
      ? Math.round((leftSlot.y + rightSlot.y) / 2)
      : leftSlot.deskCenterY ?? leftSlot.y;
    const span = rightSlot ? Math.abs(rightSlot.x - leftSlot.x) : 36;
    const seatOffset = Math.max(4, Math.min(48, Math.round(span / 2) || 18));
    // Giữ kích thước gốc của bàn cố định (80px), chỉ thay đổi khi chỉnh "Size bàn học" (deskScale),
    // không bị phình/thu bàn khi chỉnh "Khoảng cách 2 học sinh cùng bàn" (studentSeatmateGap)
    const width = 80;

    desks.push({
      deskId,
      centerX,
      centerY,
      width,
      seatOffset,
      isVip: leftSlot.isVip,
      leftSlot,
      rightSlot,
      leftIndex: leftEntry.index,
      rightIndex: rightEntry ? rightEntry.index : leftEntry.index,
    });
  });

  return desks;
}

/**
 * Tính thông số hình học của các dãy bàn đôi trong lớp
 */
function getClassroomDeskLayoutMetrics(
  grid: GridConfig,
  zones?: { left: RectBounds; right: RectBounds },
  seatmateGap?: number
) {
  const deskCols = Math.max(
    1,
    Math.min(
      5,
      Math.round(grid.deskCols || Math.floor((grid.cols || 6) / 2) || 3)
    )
  );
  const rows = Math.max(1, Math.min(12, Math.round(grid.rows || 5)));

  const minX = zones ? Math.min(zones.left.minX, 46) : 48;
  const maxX = zones ? Math.max(zones.right.maxX, 494) : 492;
  const yTop = zones
    ? Math.min(zones.left.minY, zones.right.minY)
    : grid.yTop || 642;
  const yBottom = zones
    ? Math.max(zones.left.maxY, zones.right.maxY)
    : grid.yBottom || 905;

  const usableW = Math.max(300, maxX - minX);
  const colBandW = usableW / deskCols;
  const defaultOffset = Math.round(Math.min(22, Math.max(16, colBandW * 0.16)));
  const seatOffset =
    typeof seatmateGap === 'number' && Number.isFinite(seatmateGap)
      ? Math.max(4, Math.min(48, Math.round(seatmateGap / 2)))
      : defaultOffset;

  const getDeskColGeometry = (dCol: number) => {
    const safeCol = ((dCol % deskCols) + deskCols) % deskCols;
    const deskCenterX = Math.round(minX + (safeCol + 0.5) * colBandW);
    const leftSeatX = Math.round(deskCenterX - seatOffset);
    const rightSeatX = Math.round(deskCenterX + seatOffset);
    const leftAisleX = Math.round(minX + safeCol * colBandW);
    const rightAisleX = Math.round(minX + (safeCol + 1) * colBandW);
    return { deskCenterX, leftSeatX, rightSeatX, leftAisleX, rightAisleX };
  };

  return {
    deskCols,
    rows,
    minX,
    maxX,
    yTop,
    yBottom,
    seatOffset,
    getDeskColGeometry,
  };
}

/**
 * Tạo 1 BÀN ĐÔI 2 CHỖ NGỒI mới tại vị trí bàn thứ `deskIndex`
 */
export function createSingleDoubleDeskSlots(
  kind: 'vip' | 'normal',
  deskIndex: number,
  grid: GridConfig,
  zones?: { left: RectBounds; right: RectBounds },
  seatmateGap?: number
): [KneelSlot, KneelSlot] {
  const { deskCols, rows, yTop, yBottom, getDeskColGeometry } =
    getClassroomDeskLayoutMetrics(grid, zones, seatmateGap);

  const dCol = deskIndex % deskCols;
  const r = Math.floor(deskIndex / deskCols);
  const { deskCenterX, leftSeatX, rightSeatX, leftAisleX, rightAisleX } =
    getDeskColGeometry(dCol);

  const uniqueSuffix = `${deskIndex}-${Date.now().toString(36).slice(-4)}`;

  if (kind === 'vip') {
    const vipY = Math.round(540 + r * 42);
    const deskId = `vip-desk-${uniqueSuffix}`;
    return [
      {
        id: `vip-${uniqueSuffix}-L`,
        x: leftSeatX,
        y: vipY,
        side: leftSeatX < 270 ? 'left' : 'right',
        deskId,
        seatSide: 'left',
        deskCenterX,
        deskCenterY: vipY,
        aisleX: leftAisleX,
        row: r,
        col: dCol * 2,
        deskCol: dCol,
        isVip: true,
        occupiedById: null,
      },
      {
        id: `vip-${uniqueSuffix}-R`,
        x: rightSeatX,
        y: vipY,
        side: rightSeatX < 270 ? 'left' : 'right',
        deskId,
        seatSide: 'right',
        deskCenterX,
        deskCenterY: vipY,
        aisleX: rightAisleX,
        row: r,
        col: dCol * 2 + 1,
        deskCol: dCol,
        isVip: true,
        occupiedById: null,
      },
    ];
  }

  const effectiveRows = Math.max(rows, r + 1);
  const rowStep =
    effectiveRows > 1 ? (yBottom - yTop) / Math.max(1, effectiveRows - 1) : 52;
  const rowY = Math.round(Math.min(922, yTop + r * Math.min(62, Math.max(38, rowStep))));
  const deskId = `norm-desk-${uniqueSuffix}`;

  return [
    {
      id: `norm-${uniqueSuffix}-L`,
      x: leftSeatX,
      y: rowY,
      side: leftSeatX < 270 ? 'left' : 'right',
      deskId,
      seatSide: 'left',
      deskCenterX,
      deskCenterY: rowY,
      aisleX: leftAisleX,
      row: r,
      col: dCol * 2,
      deskCol: dCol,
      isVip: false,
      occupiedById: null,
    },
    {
      id: `norm-${uniqueSuffix}-R`,
      x: rightSeatX,
      y: rowY,
      side: rightSeatX < 270 ? 'left' : 'right',
      deskId,
      seatSide: 'right',
      deskCenterX,
      deskCenterY: rowY,
      aisleX: rightAisleX,
      row: r,
      col: dCol * 2 + 1,
      deskCol: dCol,
      isVip: false,
      occupiedById: null,
    },
  ];
}

/**
 * Tạo danh sách chỗ ngồi theo từng BÀN ĐÔI 2 CHỖ (nhiều dãy bàn ngang & nhiều hàng dọc)
 */
export function buildDoubleDeskSlots(
  grid: GridConfig,
  zones?: { left: RectBounds; right: RectBounds },
  seatmateGap?: number
): { vipSlots: KneelSlot[]; normalSlots: KneelSlot[] } {
  const { deskCols, rows, yTop, yBottom, getDeskColGeometry } =
    getClassroomDeskLayoutMetrics(grid, zones, seatmateGap);

  const normalDesksCount =
    typeof grid.normalDesks === 'number'
      ? Math.max(1, Math.min(60, Math.round(grid.normalDesks)))
      : Math.max(1, rows * deskCols);

  const vipSlots: KneelSlot[] = [];

  // Tạo thống nhất tất cả BÀN ĐÔI HỌC SINH trong lớp (mỗi bàn đôi = 2 chỗ ngồi cố định, không phân biệt bàn VIP/thường)
  const normalSlots: KneelSlot[] = [];
  let normSeatIdx = 0;
  const totalNormRows = Math.max(1, Math.ceil(normalDesksCount / deskCols));
  const effectiveYTop = Math.min(yTop, 556);
  const rowStep =
    totalNormRows > 1 ? (yBottom - effectiveYTop) / (totalNormRows - 1) : 0;

  for (let nDesk = 0; nDesk < normalDesksCount; nDesk++) {
    const r = Math.floor(nDesk / deskCols);
    const dCol = nDesk % deskCols;
    const rowY = Math.round(effectiveYTop + r * rowStep);
    const { deskCenterX, leftSeatX, rightSeatX, leftAisleX, rightAisleX } =
      getDeskColGeometry(dCol);
    const deskId = `norm-desk-${nDesk}`;

    normalSlots.push({
      id: `norm-${normSeatIdx++}`,
      x: leftSeatX,
      y: rowY,
      side: leftSeatX < 270 ? 'left' : 'right',
      deskId,
      seatSide: 'left',
      deskCenterX,
      deskCenterY: rowY,
      aisleX: leftAisleX,
      row: r,
      col: dCol * 2,
      deskCol: dCol,
      isVip: false,
      occupiedById: null,
    });

    normalSlots.push({
      id: `norm-${normSeatIdx++}`,
      x: rightSeatX,
      y: rowY,
      side: rightSeatX < 270 ? 'left' : 'right',
      deskId,
      seatSide: 'right',
      deskCenterX,
      deskCenterY: rowY,
      aisleX: rightAisleX,
      row: r,
      col: dCol * 2 + 1,
      deskCol: dCol,
      isVip: false,
      occupiedById: null,
    });
  }

  return { vipSlots, normalSlots };
}

export const INITIAL_MONKS: TempleMonkData[] = [
  {
    id: 'monk-abbot',
    role: 'abbot',
    name: 'Cô Thảo',
    x: 360,
    y: 444,
    targetX: 430,
    targetY: 444,
    moveAxis: 'x',
    facingLeft: true,
    pauseTimer: 0,
    animTime: 0,
    speed: 36,
  },
  {
    id: 'monk-senior-novice',
    role: 'senior_novice',
    name: 'Thầy Cá',
    x: 130,
    y: 498,
    targetX: 220,
    targetY: 498,
    moveAxis: 'x',
    facingLeft: false,
    pauseTimer: 0,
    animTime: 0.4,
    speed: 40,
  },
];

export const DEFAULT_BGM_TRACKS: BgmTrackItem[] = [
  {
    id: 'bgm-school-1',
    title: 'Giai Điệu Sân Trường Mùa Hạ (Mặc định)',
    url: null,
    presetType: 'zen_bowl',
  },
  {
    id: 'bgm-school-2',
    title: 'Tiếng Dương Cầm Kỷ Niệm Áo Trắng',
    url: null,
    presetType: 'lotus_flute',
  },
];

export const DEFAULT_DHARMA_ARTICLES: DharmaArticleItem[] = [
  {
    id: 'lesson-1',
    title: 'Tiết 1: Ôn Tập Văn Học & Đạo Đức Học Đường',
    content:
      'Chào cả lớp! Hôm nay cô trò mình cùng ôn lại bài học về lòng biết ơn và tinh thần đoàn kết dưới mái trường cấp 3. Tuổi học trò dưới hàng phượng vĩ là quãng thời gian đẹp nhất của cuộc đời. Các em hãy bình luận câu hỏi hoặc phát biểu xây dựng bài để nhận Hoa Điểm 10 nhé!',
  },
  {
    id: 'lesson-2',
    title: 'Tiết 2: Đố Vui Kiến Thức Tổng Hợp THPT',
    content:
      'Câu hỏi đố vui dành cho cả lớp: Ai là tác giả của bài thơ Tây Tiến và bài thơ Sóng trong chương trình Ngữ Văn lớp 12? Bạn nào giơ tay trả lời đúng và nhanh nhất dưới phần bình luận sẽ được Cô Thảo tuyên dương trước lớp!',
  },
  {
    id: 'lesson-3',
    title: 'Tiết 3: Bí Quyết Đạt Điểm 10 Kỳ Thi THPT Quốc Gia',
    content:
      'Để đạt kết quả cao trong kỳ thi sắp tới, các em nhớ phân bổ thời gian hợp lý, nắm chắc kiến thức cơ bản trong sách giáo khoa và giữ tinh thần thoải mái. Cô chúc tất cả học sinh lớp 12A1 của chúng ta đều đỗ nguyện vọng 1 rực rỡ!',
  },
];

export const DEFAULT_GUIDE_ITEMS: GuideTaskItem[] = [
  {
    id: 'rose',
    modelType: 'rose',
    label: '(1) Hoa hồng',
    shortDesc: 'Tặng hoa cho cô',
    colorTheme: 'pink',
  },
  {
    id: 'icecream',
    modelType: 'icecream',
    label: '(1) Kem',
    shortDesc: 'Tặng hoa cho thầy',
    colorTheme: 'cyan',
  },
  {
    id: 'cat',
    modelType: 'cat',
    label: '(1) Con mèo',
    shortDesc: 'Nuôi mèo',
    colorTheme: 'amber',
  },
  {
    id: 'gg',
    modelType: 'gg',
    label: '(1) GG',
    shortDesc: 'Ăn vụn',
    colorTheme: 'emerald',
  },
  {
    id: 'heart',
    modelType: 'heart',
    label: '(5) Bắn tim',
    shortDesc: 'Điện thoại reo',
    colorTheme: 'pink',
  },
  {
    id: 'pig',
    modelType: 'pig',
    label: '(10) Heo',
    shortDesc: 'Thả heo hù dọa',
    colorTheme: 'amber',
  },
  {
    id: 'vip',
    modelType: 'vip',
    label: '(10+) VIP',
    shortDesc: 'Tôi là Rich Kid',
    colorTheme: 'yellow',
  },
];

const DEFAULT_GRID: GridConfig = {
  rows: 6,
  cols: 6, // 3 dãy bàn đôi × 2 chỗ ngồi = 6 chỗ mỗi hàng
  vipCount: 0,
  vipRows: 0,
  deskCols: 3, // 3 dãy bàn đôi ngang
  vipDesks: 0,
  normalDesks: 18, // 18 bàn đôi học sinh thống nhất (36 chỗ)
  yTop: 556,
  yBottom: 902,
  topWidth: 444,
  bottomWidth: 468,
};

const BUILT_INITIAL_SLOTS = buildDoubleDeskSlots(DEFAULT_GRID, RED_PRAY_ZONES);

export const INITIAL_VIP_SLOTS: KneelSlot[] = BUILT_INITIAL_SLOTS.vipSlots;

export const INITIAL_NORMAL_SLOTS: KneelSlot[] = BUILT_INITIAL_SLOTS.normalSlots;

export const DEFAULT_NPC_SPEECH_CATEGORIES: NpcSpeechCategoriesConfig = {
  idle: [
    'Chúc cả lớp 12A1 kỳ thi THPT Quốc gia đạt toàn điểm 10!',
    'Ước gì đề thi học kỳ năm nay trúng tủ 100% luôn!',
    'Cô giảng bài dễ hiểu quá, em hiểu hết công thức rồi ạ ❤️',
    'Cả lớp cố lên, sắp tới giờ ra chơi liên hoan trà sữa rồi!',
    'Em xin tặng cô bông Hoa Điểm 10 tươi thắm nhất ạ 🌺',
    'Hôm nay trời đẹp quá, ngồi học mà cứ ngắm hoa phượng ngoài sân!',
  ],
  question: [
    'Cô ơi tiết sau lớp mình có kiểm tra 15 phút không ạ?',
    'Bạn ơi câu này chọn đáp án nào thế, chỉ mình với?',
    'Cậu có mang dư cây bút bi nào không cho tớ mượn với?',
    'Ra chơi có ai đi uống trà sữa trân châu đường đen cùng mình không?',
    'Bài tập về nhà trang mấy thế cậu ơi?',
    'Cậu hiểu công thức cô vừa viết trên bảng chưa?',
  ],
  reply: [
    'Mình chọn đáp án A nha, chắc chắn đúng luôn!',
    'Đợi xíu mình chỉ cho, câu này dễ lắm!',
    'Có nè, lấy bút trong hộp bút của mình mà dùng đi!',
    'Ok luôn, hết tiết ra căng tin mình bao trà sữa nhé!',
    'Suỵt trật tự nghe cô Thảo giảng bài đi cậu ơi 😄',
    'Mình làm xong hết rồi, lát ra chơi mình giảng lại cho!',
  ],
};

export const DEFAULT_CONFIG: GameConfig = {
  ttsEnabled: true,
  ttsVipOnly: false,
  ttsEngine: 'google_stream',
  nodeVoice: 'google-vi-warm',
  nodeTtsEndpoint: '/api/tts',
  selectedSystemVoiceURI: '',
  ttsRate: 1.05,
  englishTtsRate: 0.95,
  ttsPitch: 0.88,
  ttsVolume: 1.0,
  ttsReverb: 0,
  ttsTemplate: 'Học sinh {name} phát biểu: {prayer}',
  maxTtsWords: 25,
  maxTtsQueueSize: 30,

  // Nhạc nền, Trống trường & Gõ thước
  bgmEnabled: false,
  bgmVolume: 0.35,
  bgmTracks: DEFAULT_BGM_TRACKS,
  activeBgmTrackId: 'bgm-school-1',
  bgmPlayMode: 'sequential',

  bellEnabled: true,
  bellMp3Url: null,
  bellMp3Title: 'Trống Trường Báo Tiết (Mặc định)',
  bellIntervalSec: 45,

  woodenFishEnabled: true,
  woodenFishMp3Url: null,
  woodenFishMp3Title: 'Tiếng Gõ Thước Gỗ (Mặc định)',
  woodenFishIntervalSec: 4,

  answerRevealSfxEnabled: true,
  answerRevealSfxPreset: 'chime_sparkle',
  answerRevealMp3Url: null,
  answerRevealMp3Title: 'Hiệu ứng mặc định',

  applauseMp3Url: null,
  applauseMp3Title: 'Mặc định',
  applauseVolume: 1.0,

  giftSoundEnabled: true,
  giftSoundVolume: 1.0,
  giftSoundVolumes: {},
  giftSoundMp3Urls: {},
  giftSoundMp3Titles: {},
  giftModelScales: { ...DEFAULT_GIFT_MODEL_SCALES },

  // Giảng bài tự động
  dharmaEnabled: false,
  dharmaAutoNext: true,
  dharmaArticles: DEFAULT_DHARMA_ARTICLES,
  activeDharmaId: 'lesson-1',

  // Mẫu câu đọc sự kiện lớp học
  realWelcomeTtsEnabled: false,
  realWelcomeTtsTemplate: 'Chào mừng bạn [Tên] vừa vào lớp 12A1',
  npcWelcomeTtsEnabled: false,
  npcWelcomeTtsTemplate: 'Chào mừng bạn [Tên] vừa vào lớp 12A1',
  welcomeTtsTemplates: [
    'Chào mừng học sinh [Tên] vừa bước vào lớp 12A1',
    'Cô chào em [Tên], mời em về bàn đôi ổn định chỗ ngồi nhé',
    'Hoan nghênh bạn [Tên] đã có mặt đúng giờ trong tiết học hôm nay',
  ],

  realGiftTtsEnabled: true,
  realGiftTtsTemplate:
    'Cô cảm ơn em [Tên] đã tặng quà tri ân, chúc em đạt Hoa Điểm 10 xuất sắc',
  npcGiftTtsEnabled: false,
  npcGiftTtsTemplate:
    'Cô cảm ơn em [Tên] đã tặng quà tri ân, chúc em đạt Hoa Điểm 10 xuất sắc',
  giftTtsTemplates: [
    'Cô cảm ơn em [Tên] đã tặng quà tri ân, chúc em học giỏi và đạt toàn điểm 10',
    'Tuyên dương học sinh giỏi [Tên] trước toàn trường, cộng điểm thi đua xuất sắc cho em',
    'Cảm ơn món quà tuyệt vời của bạn [Tên], chúc em luôn chăm ngoan học giỏi',
  ],

  realPrayerTtsEnabled: true,
  realPrayerTtsTemplate: 'Bạn [Tên] giơ tay phát biểu: [Comment]',
  npcPrayerTtsEnabled: false,
  npcPrayerTtsTemplate: 'Bạn [Tên] giơ tay phát biểu: [Comment]',
  prayerTtsTemplates: [
    'Bạn [Tên] giơ tay phát biểu: [Comment]',
    'Học sinh [Tên] trả lời câu hỏi: [Comment]',
    'Ý kiến của bạn [Tên] trước lớp: [Comment]',
  ],

  lessonStartTtsText:
    'Chào mừng mấy cưng đến với lớp cô Thảo ! Bắt đầu kiểm tra 15 phút. Có 10 câu hỏi với độ khó tăng dần, đáp nhanh sẽ được thêm điểm, trả lời sai sẽ nhường chỗ cho các bạn top bảng học ké. Cố gắng vào lớp để được xếp hạng.',
  lessonPrepareTtsText: 'Chuẩn bị',
  lessonPrepareTtsTexts: [
    'Chuẩn bị',
    'Các em chú ý lên bảng chuẩn bị câu tiếp theo nhé',
    'Sẵn sàng chưa cả lớp ơi, chuẩn bị nào',
  ],
  lessonPrepareDurationSec: 3,
  lessonQuestionTtsTemplate:
    'Câu hỏi số [SốCâu]: [NghĩaViệt] tiếng Anh là gì, gồm [SốChữ] chữ cái?',
  lessonIdleChatEnabled: true,
  lessonIdleChatDelaySec: 4,
  lessonIdleChatTexts: [
    'Câu này dễ lắm luôn đó các em ơi, nhanh tay bình luận nào!',
    'Cô thấy có nhiều bạn sắp đoán ra đáp án rồi kìa!',
    'Cố lên cả lớp ơi, nhìn kỹ chữ cái gợi ý trên bảng nhé!',
    'Bạn nào trả lời nhanh nhất câu này sẽ được cộng nhiều điểm lắm nha!',
  ],
  lessonAnswerTtsTemplate: 'Đáp án là',
  lessonFlow4PostTtsDelaySec: 1,
  quizResultTtsEnabled: true,
  quizResultTtsTemplate:
    'Có [HọcKé] bạn học ké và [TrongLớp] bạn trong lớp trả lời đúng, chúc mừng bạn [Top1] trả lời nhanh nhất!',
  quizResultTtsTemplates: [
    'Có [HọcKé] bạn học ké và [TrongLớp] bạn trong lớp trả lời đúng, chúc mừng bạn [Top1] trả lời nhanh nhất!',
  ],
  lessonFlow5ConditionalTemplates: {
    normal: [
      'Có [HọcKé] bạn học ké và [TrongLớp] bạn trong lớp trả lời đúng, chúc mừng bạn [Top1] trả lời nhanh nhất!',
      'Chúc mừng bạn [Top1] đã xuất sắc giật giải nhanh nhất câu này cùng [TrongLớp] bạn trong lớp trả lời đúng!',
    ],
    streak_2: [
      'Quá giỏi! Bạn [Top1] đã trả lời nhanh nhất 2 câu liên tiếp rồi đó cả lớp ơi!',
      'Hai lần liên tiếp đạt Top 1 tốc độ gọi tên bạn [Top1], phong độ quá đỉnh!',
    ],
    streak_3: [
      'Không thể tin nổi! Bạn [Top1] lập hat-trick 3 lần liên tiếp trả lời nhanh nhất lớp!',
      'Ba câu liên tục đứng đầu tốc độ! Cả lớp cho bạn [Top1] một tràng pháo tay nào!',
    ],
    streak_5_plus: [
      'Siêu cấp học bá! Bạn [Top1] đã thống trị chuỗi [ChuỗiTop1] câu trả lời nhanh nhất liên tiếp, ai cản nổi bạn đây!',
      'Kỷ lục xuất thần! [ChuỗiTop1] lần liên tiếp trả lời nhanh nhất đều thuộc về bạn [Top1]!',
    ],
    streak_broken: [
      'Bất ngờ lớn! Bạn [Top1] đã chính thức chấm dứt chuỗi thắng liên tiếp của bạn [Top1Cũ] để vươn lên dẫn đầu câu này!',
      'Chuỗi bất bại của [Top1Cũ] đã bị phá vỡ! Chúc mừng bạn [Top1] vươn lên trả lời nhanh nhất!',
    ],
  },
  lessonRankingTtsTemplate:
    'Top 1 bảng xếp hạng là bạn [Top1Rank] với [ĐiểmTop1] điểm, chúng ta đến với câu hỏi tiếp theo nhé!',
  lessonFlow6ConditionalTemplates: {
    normal: [
      'Top 1 bảng xếp hạng là bạn [Top1Rank] với [ĐiểmTop1] điểm, chúng ta đến với câu hỏi tiếp theo nhé!',
      'Hiện tại bạn [Top1Rank] đang dẫn đầu lớp với [ĐiểmTop1] điểm, các bạn khác cố gắng bám đuổi nha!',
    ],
    top1_3: [
      'Bạn [Top1Rank] đã giữ vững ngôi đầu bảng xếp hạng 3 vòng liên tiếp với [ĐiểmTop1] điểm!',
    ],
    top1_5: [
      '5 vòng liên tiếp thống trị bảng xếp hạng! Bạn [Top1Rank] đang rất vững vàng ở vị trí Top 1 với [ĐiểmTop1] điểm!',
    ],
    top1_10: [
      'Quá xuất sắc! 10 vòng liên tục không ai vượt qua được bạn [Top1Rank] với [ĐiểmTop1] điểm!',
    ],
    top1_20: [
      'Thống trị tuyệt đối 20 vòng liên tiếp! Ngôi vương lớp 12A1 vẫn thuộc về bạn [Top1Rank] với [ĐiểmTop1] điểm!',
    ],
    top1_30_plus: [
      'Huyền thoại của lớp! Hơn 30 vòng liên tiếp giữ vững Top 1 bảng xếp hạng gọi tên [Top1Rank] với [ĐiểmTop1] điểm!',
    ],
  },
  lessonRoundEndTtsTemplate:
    'Bài kiểm tra kết thúc, cô mời các bạn chiến thắng bước lên bục giảng. Chúc mừng bạn [top1] đạt top 1 với [Điểm top 1] điểm, bạn [top2] đạt top 2 với [Điểm top 2] điểm, bạn [top3] đạt top 3 với [Điểm top 3] điểm. Trao tặng 3 bạn những chiếc cúp vàng danh giá, mấy cưng ở dưới vỗ tay nào !',
  lessonRecordFlowEnabled: true,
  lessonRecordTtsTemplate:
    'Chúc mừng bạn [Top1KỷLục] đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục cúp vàng hôm nay với [ĐiểmKỷLục] cúp vàng! Cả lớp cho một tràng pháo tay thật lớn nào!',
  lessonRecordTtsTemplates: [
    'Chúc mừng bạn [Top1KỷLục] đã xuất sắc vươn lên dẫn đầu bảng Kỷ lục cúp vàng hôm nay với [ĐiểmKỷLục] cúp vàng! Cả lớp cho một tràng pháo tay thật lớn nào!',
    'Kỷ lục mới đã được xác lập! Bạn [Top1KỷLục] vừa chiếm lĩnh vị trí Top 1 Kỷ lục cúp vàng hôm nay với [ĐiểmKỷLục] cúp vàng, quá giỏi luôn!',
    'Tuyệt vời quá! Ngôi vương Kỷ lục cúp vàng hôm nay chính thức gọi tên bạn [Top1KỷLục] với thành tích [ĐiểmKỷLục] cúp vàng!',
  ],
  lessonPunishmentSingleTtsTemplate:
    'Mời bạn [Tên] mới quậy trong lớp lên đây đứng 1 lượt!',
  lessonPunishmentMultiTtsTemplate:
    'Mời các bạn [DanhSáchTên] mới quậy trong lớp lên đây đứng 1 lượt!',
  customQuizQuestions: [],
  quizDeckSchemaVersion: 2,
  quizDecks: [],
  activeQuizDeckId: 'deck-tienganh-de',
  quizQueueLimitDisplay: 10,
  shuffleBeforeEnqueue: false,
  sentenceScrambleRatio: 30,
  sentenceDecksSeededV1: true,
  luckyStarRatio1: 15,
  luckyStarRatio2: 10,
  luckyStarRatio3: 5,

  studentSeatingSpeed: 110,
  studentGiftSpeed: 185,

  abbotBubbleEnabled: true,
  teacherBubbleScale: 1.0,
  supervisorBubbleScale: 1.0,

  filterCorrectAnswerBubble: true,

  // Live Text-to-Audio (Giọng đọc riêng ưu tiên của Chủ Phòng / Giáo Viên)
  hostTtsEngine: 'google_stream',
  hostNodeVoice: 'google-vi-warm',
  hostSystemVoiceURI: '',
  hostTtsRate: 1.02,
  hostTtsPitch: 0.88,
  hostTtsVolume: 1.0,
  hostTtsReverb: 0,
  hostTtsInterrupt: true,
  hostTtsSpeakerRole: 'abbot',
  hostQuickPhrases: [
    'Chào mừng các em mới vào lớp 12A1, thả tim và comment điểm danh nhận chỗ ngồi nhé!',
    'Cả lớp trả lời câu hỏi nhiệt tình cho đủ mốc Kích hoạt sự kiện nào!',
    'Cô cảm ơn các bạn đã tặng Hoa Điểm 10 ủng hộ lớp nhé!',
    'Bạn nào muốn vào lớp ngồi bàn học thì comment vào lớp nha!',
  ],

  // Live Text-to-Voice (Hỗ trợ 2 lựa chọn: Web Speech Tiếng Việt & Google Warm)
  teacherLiveEngine: 'google_stream',
  teacherLiveVoice: 'google-vi-warm',
  teacherLiveVolume: 1.0,
  teacherLiveRate: 1.0,
  teacherLivePitch: 0.84,
  teacherLiveShowBubble: true,
  teacherLiveQuickPhrases: [
    'Trật tự nào mấy đứa, tập trung nhìn lên bảng trả lời câu hỏi của cô Thảo đi!',
    'Thầy giám thị đang đi tuần nha, bạn nào quậy trong lớp coi chừng lên đứng bảng đó!',
    'Chào mừng các bạn mới vào lớp, thả tim và bình luận đáp án thật nhanh nhé!',
    'Giỏi lắm, mấy bạn hàng chờ cố gắng trả lời đúng để giành ghế vào lớp nha!',
  ],

  showWaypoints: false,
  showZoneBounds: false,
  maxStageCapacity: 36,
  autoCrowd: true,
  botTargetCrowd: 8,
  botVipPercent: 0,
  npcCorrectAnswerPercent: 65,
  npcScatterChatDensity: 50,
  npcSpeechCategories: DEFAULT_NPC_SPEECH_CATEGORIES,
  npcAutoGiftEnabled: false,
  npcAutoGiftIntervalSec: 12,
  npcAutoGiftAllowedIds: [
    'rose',
    'icecream',
    'cat',
    'gg',
    'heart',
    'pig',
    'vip',
  ],
  npcSpawnIntervalSec: 2.5,
  npcPrayIntervalSec: 6.5,
  prayDurationSec: 24,
  vipPrayDurationSec: 38,
  normalPrayDurationSec: 24,

  // Camera thông minh bám theo lời đọc
  cameraFollowCommentEnabled: true,
  cameraFollowRealUser: true,
  cameraFollowNpc: false,
  cameraHoldDurationSec: 5,
  cameraPushOnGiftEnabled: true,
  cameraSpecialGiftLockSec: 3,
  cameraZoomScale: 2.2,
  cameraSmoothSpeed: 4.5,
  cameraFocusOffsetX: 0,
  cameraFocusOffsetY: -40,

  deskScale: 1.0,
  studentDeskGap: 24,
  studentSeatmateGap: 36,
  characterScale: 1.0,
  paperPlaneScale: 1.0,
  paperPlaneSpeed: 460,
  femaleTeacherScale: 1.0,
  maleTeacherScale: 1.0,
  walkWobbleIntensity: 1.0,
  useDefaultPngModels: true,
  teacherAboveClassBoard: true,
  dustParticleCount: 16,
  dustParticleOpacity: 0.65,
  dustParticleSize: 1.0,
  nameTagFontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
  nameTagScale: 1.0,
  nameTagHeight: 20,
  nameTagMaxChars: 16,
  nameTagOffsetY: 0,
  rankTrophyBadgeFontSize: 8,
  top1CrownOffsetY: 0,
  streakTagFontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
  streakTagScale: 1.0,
  scoreTagScale: 1.0,
  scoreTagOffsetY: 0,
  scoreTagDurationSec: 4,
  scoreChangeFontSize: 14,
  scoreChangeStrokeWidth: 2.5,
  studentLevelExpEnabled: true,
  ieltsRankBadgeSchemaV1: true,
  vfxFlower10Enabled: true,
  vfxFlower10Scale: 1.0,
  vfxFlower10OffsetX: 0,
  vfxFlower10OffsetY: 0,
  vfxRoseHeartBurstEnabled: true,
  vfxRoseHeartBurstScale: 1.0,
  vfxRoseHeartBurstCount: 14,
  vfxRoseHeartBurstSpread: 1.0,
  vfxRoseHeartBurstDurationMs: 1100,
  vfxRoseHeartBurstOffsetX: 0,
  vfxRoseHeartBurstOffsetY: 0,
  vfxWindBreezeEnabled: true,
  vfxWindBreezeIntervalSec: 25,
  vfxWindBreezeDurationSec: 6.5,
  vfxWindBreezeLeafCount: 14,
  vfxWindBreezeLeafTheme: 'mixed',
  vfxWindBreezeAutumnRatio: 55,
  vfxWindBreezeLeafScale: 1.0,
  vfxWindBreezeSpeed: 1.0,
  vfxWindBreezeOpacity: 0.88,
  vfxWindBreezeDirection: 'left_to_right',
  vfxWindBreezeShowStreaks: true,
  chatBubbleFontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
  chatBubbleScale: 1.0,
  chatBubbleDurationSec: 12,
  chatBubbleMaxChars: 80,
  chatBubbleMaxWidth: 195,
  chatBubbleMaxHeight: 110,
  chatBubbleFontSize: 11,
  chatBubbleOffsetY: 0,
  chatBubbleOffsetX: 24,
  grandEventTarget: 50,
  maxFlyingLotuses: 5,
  spawnPoint: { x: 16, y: 472 },
  exitPoint: { x: 16, y: 468 },
  doorCrowdPos: { x: 46, y: 506 },
  doorCrowdCount: 7,
  doorCrowdSpread: 1.0,
  punishmentLinePos: { x: 270, y: 458 },
  punishmentLineSpacing: 52,
  zombieEventEnabled: true,
  zombieMaxHp: 10000,
  zombieLevel: 1,
  zombieScale: 1.15,
  zombieSpawnPos: { x: 42, y: 520 },
  zombieStandPos: { x: 270, y: 486 },
  zombieTeacherPos: { x: 392, y: 444 },
  zombieSupervisorPos: { x: 148, y: 498 },
  zombieHeartBatchIntervalMs: 1200,
  zombieNpcAutoAttack: true,
  zombieMaxFlyingProjectiles: 16,
  zombieNormalProjectileDurationSec: 0.55,
  zombieGift5ProjectileDurationSec: 1.15,
  zombieGift10ProjectileDurationSec: 1.4,
  zombieGift10PlusProjectileDurationSec: 1.7,
  zombieProjectileScales: { ...DEFAULT_ZOMBIE_PROJECTILE_SCALES },
  zombieGrowlMp3Url: null,
  zombieGrowlMp3Title: 'Mặc định (Tiếng Zombie gầm gừ)',
  zombieBgmEnabled: true,
  zombieBgmMp3Url: null,
  zombieBgmMp3Title: 'Mặc định (Nhạc chiến đấu Zombie)',
  zombieBgmVolume: 0.55,
  zombieTeacherEncourageEnabled: true,
  zombieTeacherEncourageIntervalSec: 9,
  zombieTeacherEncourageTemplates: [
    'Cố lên các em ơi, thả tim và tặng quà đẩy lùi zombie nào!',
    'Đừng để zombie tiến lại gần cô nhé, bắn mạnh tay lên cả lớp ơi!',
    'Lớp 12A1 đoàn kết lại nào, sắp hạ gục được zombie rồi!',
    'Nhanh tay thả tim ném hộp bút liên tục bảo vệ lớp học nào các em!',
    'Tuyệt vời lắm các em, giữ vững nhịp độ tấn công dồn dập vào!',
  ],
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
  zombieFlow6BoardTitle: 'Chúc mừng đẩy lùi zombie thành công',
  zombieFlow6Speech1Template:
    'Chúc mừng các em đã đánh bại zombie cấp [Cấp] và cứu cô giáo, sau đây là bảng xếp hạng điểm số',
  zombieFlow6Speech2Template:
    'Cô trọng thưởng cho ba bạn top 1: [Top1] 100 hoa điểm 10, top 2: [Top2] 75 hoa điểm 10 và top 3: [Top3] 50 hoa điểm 10, các bạn còn lại 25 hoa điểm 10. Cùng tất cả các bạn một ly trà sữa mát cha lát te phun tóp pinh, chúng ta tiếp tục học thôi nào',
  zombieFlow6MinDurationSec: 4.5,
  reminderAlertEnabled: true,
  reminderAlertUrl: DEFAULT_REMINDER_ALERT_URL,
  reminderAlertCooldownSec: DEFAULT_REMINDER_ALERT_COOLDOWN_SEC,
  reminderAlertOnDisconnect: true,
  reminderAlertOnKeyword: true,
  reminderAlertKeywords: [...DEFAULT_REMINDER_ALERT_KEYWORDS],
  incenseBurner: { x: 438, y: 492 },
  offeringTrayPos: { x: 438, y: 434 },
  monkZone: { ...MONK_ZONE_BOUNDS },
  supervisorZone: { ...SUPERVISOR_ZONE_BOUNDS },
  redPrayZones: {
    left: { ...RED_PRAY_ZONES.left },
    right: { ...RED_PRAY_ZONES.right },
  },
  grid: { ...DEFAULT_GRID },
  hudLayout: {
    templeSign: { x: 175, y: 6, width: 190, height: 34 },
    classBoardBox: { x: 56, y: 112, width: 430, height: 218 },
    lotusLeaderboardBox: { x: 184, y: 342, width: 172, height: 76 },
    dailyRecordBox: { x: 184, y: 6, width: 172, height: 100 },
    guideBox: { x: 364, y: 342, width: 166, height: 76 },
    grandEventBox: { x: 10, y: 6, width: 166, height: 50 },
    pilgrimCountBox: { x: 364, y: 6, width: 166, height: 48 },
    waitingQueueBox: { x: 364, y: 58, width: 166, height: 106 },
    toastBox: { x: 10, y: 342, width: 166, height: 76 },
    noticeBoardBox: { x: 184, y: 6, width: 172, height: 50 },
    note1Box: { x: 10, y: 60, width: 166, height: 30 },
    marqueeBox: { x: 10, y: 924, width: 520, height: 28 },
    lotusLeaderboardTitle: 'Bảng Hoa Điểm 10',
    dailyRecordTitle: 'Kỷ lục cúp vàng',
    guideTitle: 'Nội Quy & Quà Tặng',
    grandEventTitle: 'Kích hoạt sự kiện',
    pilgrimCountTitle: 'Sĩ số lớp',
    waitingQueueTitle: 'Hàng chờ học ké',
    noticeBoardTitle: 'Bảng Tin Lớp 12A1',
    noticeBoardContent:
      'Chào mừng các bạn học sinh vào lớp 12A1! Bình luận để giơ tay phát biểu và nhận Hoa Điểm 10 🌺',
    noticeBoardFontSize: 10,
    note1Title: 'Note 1',
    note1Content: 'Đây là trò chơi 2D.',
    note1FontSize: 10,
    note1Opacity: 0.9,
    showNote1Box: true,
    showMarqueeBox: true,
    marqueeContent:
      '📢 Chào mừng các bạn học sinh vào lớp 12A1! Gõ "vào lớp" hoặc trả lời đúng câu hỏi để ngồi vào bàn học • Ngồi trong lớp gõ @tên để ném máy bay giấy và tặng Hoa Hồng trong 10s để gửi bó hoa cho bạn nhé! ❤️',
    marqueeFontSize: 12,
    marqueeSpeed: 65,
    marqueeOpacity: 0.88,
    marqueeTextColor: '#fde047',
    guideCycle: {
      enabled: false,
      hiddenSec: 5,
      visibleSec: 10,
      mode: 'slide_right',
      animSpeedSec: 0.65,
    },
    lotusLeaderboardCycle: {
      enabled: false,
      hiddenSec: 5,
      visibleSec: 10,
      mode: 'slide_right',
      animSpeedSec: 0.65,
    },
    dailyRecordCycle: {
      enabled: false,
      hiddenSec: 5,
      visibleSec: 10,
      mode: 'slide_right',
      animSpeedSec: 0.65,
    },
    noticeBoardCycle: {
      enabled: false,
      hiddenSec: 5,
      visibleSec: 10,
      mode: 'slide_right',
      animSpeedSec: 0.65,
    },
    classBoardFontSize: 13,
    classBoardOpacity: 0.42,
    classBoardBlur: 2,
    classBoardEngine: 'notice',
    classBoardLessonTitle: 'Tiết Tiếng Anh',
    classBoardLetterMode: 'default',
    classBoardQuestionDurationSec: 12,
    classBoardQuestionDurationByLevel: {
      easy: 12,
      normal: 15,
      hard: 18,
      omg: 22,
      other: 12,
    },
    classBoardSentenceQuestionDurationByLevel: {
      easy: 18,
      normal: 22,
      hard: 26,
      omg: 30,
      other: 20,
    },
    classBoardRevealDurationSec: 10,
    classBoardNpcParticipate: true,
    classBoardTtsReadQuestion: true,
    showClassBoardBox: true,
    grandEventFontSize: 10,
    lotusLeaderboardFontSize: 10,
    dailyRecordFontSize: 9.5,
    guideFontSize: 9,
    pilgrimCountFontSize: 10,
    waitingQueueFontSize: 9.5,
    toastFontSize: 10,
    showTempleSign: false,
    showGrandEventBox: true,
    showPilgrimCountBox: true,
    showQueueInPilgrimCountBox: false,
    showWaitingQueueBox: true,
    showLotusLeaderboardBox: false,
    showDailyRecordBox: true,
    showGuideBox: true,
    showNoticeBoardBox: false,
    showToastBox: true,
    showNewPilgrimToast: true,
    lotusLeaderboardMaxRanks: 5,
    waitingQueueMaxRanks: 8,
    waitingQueueBgColor: 'black',
    waitingQueueAvatarScale: 1.0,
    waitingQueueScoreScale: 1.0,
    lotusFloatingScoreFontSize: 12,
    hudOpacity: 0.9,
    noticeBoardOpacity: 0.9,
    grandEventOpacity: 0.9,
    lotusLeaderboardOpacity: 0.9,
    dailyRecordOpacity: 0.9,
    guideOpacity: 0.9,
    pilgrimCountOpacity: 0.9,
    waitingQueueOpacity: 0.9,
    toastOpacity: 0.9,
    templeSignOpacity: 1.0,
    guideItems: DEFAULT_GUIDE_ITEMS,
    editLayoutMode: false,
  },
};

export const ENGLISH_QUIZ_QUESTIONS: EnglishQuizItem[] = [
  { id: 'en-1', vi: 'Tủ lạnh', en: 'FRIDGE', phonetic: '/frɪdʒ/' },
  { id: 'en-2', vi: 'Máy tính', en: 'COMPUTER', phonetic: '/kəmˈpjuː.tər/' },
  { id: 'en-3', vi: 'Quả táo', en: 'APPLE', phonetic: '/ˈæp.əl/' },
  { id: 'en-4', vi: 'Ngôi trường', en: 'SCHOOL', phonetic: '/skuːl/' },
  { id: 'en-5', vi: 'Giáo viên', en: 'TEACHER', phonetic: '/ˈtiː.tʃər/' },
  { id: 'en-6', vi: 'Học sinh', en: 'STUDENT', phonetic: '/ˈstjuː.dənt/' },
  { id: 'en-7', vi: 'Quyển sách', en: 'BOOK', phonetic: '/bʊk/' },
  { id: 'en-8', vi: 'Bút chì', en: 'PENCIL', phonetic: '/ˈpen.səl/' },
  { id: 'en-9', vi: 'Cửa sổ', en: 'WINDOW', phonetic: '/ˈwɪn.dəʊ/' },
  { id: 'en-10', vi: 'Bàn học', en: 'DESK', phonetic: '/desk/' },
  { id: 'en-11', vi: 'Cái ghế', en: 'CHAIR', phonetic: '/tʃeər/' },
  { id: 'en-12', vi: 'Đồng hồ', en: 'CLOCK', phonetic: '/klɒk/' },
  { id: 'en-13', vi: 'Xe đạp', en: 'BICYCLE', phonetic: '/ˈbaɪ.sɪ.kəl/' },
  { id: 'en-14', vi: 'Điện thoại', en: 'PHONE', phonetic: '/fəʊn/' },
  { id: 'en-15', vi: 'Bông hoa', en: 'FLOWER', phonetic: '/ˈflaʊ.ər/' },
  { id: 'en-16', vi: 'Mặt trời', en: 'SUN', phonetic: '/sʌn/' },
  { id: 'en-17', vi: 'Mặt trăng', en: 'MOON', phonetic: '/muːn/' },
  { id: 'en-18', vi: 'Ngôi sao', en: 'STAR', phonetic: '/stɑːr/' },
  { id: 'en-19', vi: 'Con mèo', en: 'CAT', phonetic: '/kæt/' },
  { id: 'en-20', vi: 'Con chó', en: 'DOG', phonetic: '/dɒɡ/' },
  { id: 'en-21', vi: 'Con cá', en: 'FISH', phonetic: '/fɪʃ/' },
  { id: 'en-22', vi: 'Con chim', en: 'BIRD', phonetic: '/bɜːd/' },
  { id: 'en-23', vi: 'Con voi', en: 'ELEPHANT', phonetic: '/ˈel.ɪ.fənt/' },
  { id: 'en-24', vi: 'Con khỉ', en: 'MONKEY', phonetic: '/ˈmʌŋ.ki/' },
  { id: 'en-25', vi: 'Con thỏ', en: 'RABBIT', phonetic: '/ˈræb.ɪt/' },
  { id: 'en-26', vi: 'Cặp sách', en: 'BACKPACK', phonetic: '/ˈbæk.pæk/' },
  { id: 'en-27', vi: 'Cục tẩy', en: 'ERASER', phonetic: '/ɪˈreɪ.zər/' },
  { id: 'en-28', vi: 'Thước kẻ', en: 'RULER', phonetic: '/ˈruː.lər/' },
  { id: 'en-29', vi: 'Bệnh viện', en: 'HOSPITAL', phonetic: '/ˈhɒs.pɪ.təl/' },
  { id: 'en-30', vi: 'Thư viện', en: 'LIBRARY', phonetic: '/ˈlaɪ.brər.i/' },
  { id: 'en-31', vi: 'Sân bay', en: 'AIRPORT', phonetic: '/ˈeə.pɔːt/' },
  { id: 'en-32', vi: 'Khách sạn', en: 'HOTEL', phonetic: '/həʊˈtel/' },
  { id: 'en-33', vi: 'Gia đình', en: 'FAMILY', phonetic: '/ˈfæm.əl.i/' },
  { id: 'en-34', vi: 'Bạn bè', en: 'FRIEND', phonetic: '/frend/' },
  { id: 'en-35', vi: 'Mùa hè', en: 'SUMMER', phonetic: '/ˈsʌm.ər/' },
  { id: 'en-36', vi: 'Mùa đông', en: 'WINTER', phonetic: '/ˈwɪn.tər/' },
  { id: 'en-37', vi: 'Cầu vồng', en: 'RAINBOW', phonetic: '/ˈreɪn.bəʊ/' },
  { id: 'en-38', vi: 'Trái tim', en: 'HEART', phonetic: '/hɑːt/' },
  { id: 'en-39', vi: 'Âm nhạc', en: 'MUSIC', phonetic: '/ˈmjuː.zɪk/' },
  { id: 'en-40', vi: 'Bóng đá', en: 'FOOTBALL', phonetic: '/ˈfʊt.bɔːl/' },
  { id: 'en-41', vi: 'Quả chuối', en: 'BANANA', phonetic: '/bəˈnɑː.nə/' },
  { id: 'en-42', vi: 'Quả cam', en: 'ORANGE', phonetic: '/ˈɒr.ɪndʒ/' },
  { id: 'en-43', vi: 'Nước lọc', en: 'WATER', phonetic: '/ˈwɔː.tər/' },
  { id: 'en-44', vi: 'Sữa tươi', en: 'MILK', phonetic: '/mɪlk/' },
  { id: 'en-45', vi: 'Bánh mì', en: 'BREAD', phonetic: '/bred/' },
  { id: 'en-46', vi: 'Bác sĩ', en: 'DOCTOR', phonetic: '/ˈdɒk.tər/' },
  { id: 'en-47', vi: 'Y tá', en: 'NURSE', phonetic: '/nɜːs/' },
  { id: 'en-48', vi: 'Cảnh sát', en: 'POLICE', phonetic: '/pəˈliːs/' },
  { id: 'en-49', vi: 'Phi công', en: 'PILOT', phonetic: '/ˈpaɪ.lət/' },
  { id: 'en-50', vi: 'Nông dân', en: 'FARMER', phonetic: '/ˈfɑː.mər/' },
  { id: 'en-51', vi: 'Con hổ', en: 'TIGER', phonetic: '/ˈtaɪ.ɡər/' },
  { id: 'en-52', vi: 'Sư tử', en: 'LION', phonetic: '/ˈlaɪ.ən/' },
  { id: 'en-53', vi: 'Con gấu', en: 'BEAR', phonetic: '/beər/' },
  { id: 'en-54', vi: 'Con ngựa', en: 'HORSE', phonetic: '/hɔːs/' },
  { id: 'en-55', vi: 'Con cừu', en: 'SHEEP', phonetic: '/ʃiːp/' },
  { id: 'en-56', vi: 'Con gà', en: 'CHICKEN', phonetic: '/ˈtʃɪk.ɪn/' },
  { id: 'en-57', vi: 'Con vịt', en: 'DUCK', phonetic: '/dʌk/' },
  { id: 'en-58', vi: 'Con rắn', en: 'SNAKE', phonetic: '/sneɪk/' },
  { id: 'en-59', vi: 'Cá heo', en: 'DOLPHIN', phonetic: '/ˈdɒl.fɪn/' },
  { id: 'en-60', vi: 'Cá mập', en: 'SHARK', phonetic: '/ʃɑːk/' },
  { id: 'en-61', vi: 'Quả nho', en: 'GRAPE', phonetic: '/ɡreɪp/' },
  { id: 'en-62', vi: 'Quả xoài', en: 'MANGO', phonetic: '/ˈmæŋ.ɡəʊ/' },
  { id: 'en-63', vi: 'Quả chanh', en: 'LEMON', phonetic: '/ˈlem.ən/' },
  { id: 'en-64', vi: 'Quả đào', en: 'PEACH', phonetic: '/piːtʃ/' },
  { id: 'en-65', vi: 'Dưa chuột', en: 'CUCUMBER', phonetic: '/ˈkjuː.kʌm.bər/' },
  { id: 'en-66', vi: 'Cà chua', en: 'TOMATO', phonetic: '/təˈmɑː.təʊ/' },
  { id: 'en-67', vi: 'Khoai tây', en: 'POTATO', phonetic: '/pəˈteɪ.təʊ/' },
  { id: 'en-68', vi: 'Cà rốt', en: 'CARROT', phonetic: '/ˈkær.ət/' },
  { id: 'en-69', vi: 'Bánh ngọt', en: 'CAKE', phonetic: '/keɪk/' },
  { id: 'en-70', vi: 'Phô mai', en: 'CHEESE', phonetic: '/tʃiːz/' },
  { id: 'en-71', vi: 'Cà phê', en: 'COFFEE', phonetic: '/ˈkɒf.i/' },
  { id: 'en-72', vi: 'Đường ngọt', en: 'SUGAR', phonetic: '/ˈʃʊɡ.ər/' },
  { id: 'en-73', vi: ' Bơ sữa', en: 'BUTTER', phonetic: '/ˈbʌt.ər/' },
  { id: 'en-74', vi: 'Mật ong', en: 'HONEY', phonetic: '/ˈhʌn.i/' },
  { id: 'en-75', vi: 'Mì sợi', en: 'NOODLE', phonetic: '/ˈnuː.dəl/' },
  { id: 'en-76', vi: 'Tàu hỏa', en: 'TRAIN', phonetic: '/treɪn/' },
  { id: 'en-77', vi: 'Máy bay', en: 'PLANE', phonetic: '/pleɪn/' },
  { id: 'en-78', vi: 'Con tàu', en: 'SHIP', phonetic: '/ʃɪp/' },
  { id: 'en-79', vi: 'Xe tải', en: 'TRUCK', phonetic: '/trʌk/' },
  { id: 'en-80', vi: 'Tàu điện ngầm', en: 'SUBWAY', phonetic: '/ˈsʌb.weɪ/' },
  { id: 'en-81', vi: 'Mùa xuân', en: 'SPRING', phonetic: '/sprɪŋ/' },
  { id: 'en-82', vi: 'Mùa thu', en: 'AUTUMN', phonetic: '/ˈɔː.təm/' },
  { id: 'en-83', vi: 'Đám mây', en: 'CLOUD', phonetic: '/klaʊd/' },
  { id: 'en-84', vi: 'Cơn mưa', en: 'RAIN', phonetic: '/reɪn/' },
  { id: 'en-85', vi: 'Tuyết trắng', en: 'SNOW', phonetic: '/snəʊ/' },
  { id: 'en-86', vi: 'Cơn gió', en: 'WIND', phonetic: '/wɪnd/' },
  { id: 'en-87', vi: 'Ngọn núi', en: 'MOUNTAIN', phonetic: '/ˈmaʊn.tɪn/' },
  { id: 'en-88', vi: 'Dòng sông', en: 'RIVER', phonetic: '/ˈrɪv.ər/' },
  { id: 'en-89', vi: 'Đại dương', en: 'OCEAN', phonetic: '/ˈəʊ.ʃən/' },
  { id: 'en-90', vi: 'Khu rừng', en: 'FOREST', phonetic: '/ˈfɒr.ɪst/' },
  { id: 'en-91', vi: 'Hòn đảo', en: 'ISLAND', phonetic: '/ˈaɪ.lənd/' },
  { id: 'en-92', vi: 'Cây cầu', en: 'BRIDGE', phonetic: '/brɪdʒ/' },
  { id: 'en-93', vi: 'Khu vườn', en: 'GARDEN', phonetic: '/ˈɡɑː.dən/' },
  { id: 'en-94', vi: 'Nhà bếp', en: 'KITCHEN', phonetic: '/ˈkɪtʃ.ən/' },
  { id: 'en-95', vi: 'Phòng ngủ', en: 'BEDROOM', phonetic: '/ˈbed.ruːm/' },
  { id: 'en-96', vi: 'Cái gương', en: 'MIRROR', phonetic: '/ˈmɪr.ər/' },
  { id: 'en-97', vi: 'Cái gối', en: 'PILLOW', phonetic: '/ˈpɪl.əʊ/' },
  { id: 'en-98', vi: 'Cái chăn', en: 'BLANKET', phonetic: '/ˈblæŋ.kɪt/' },
  { id: 'en-99', vi: 'Cây dù', en: 'UMBRELLA', phonetic: '/ʌmˈbrel.ə/' },
  { id: 'en-100', vi: 'Kim cương', en: 'DIAMOND', phonetic: '/ˈdaɪ.ə.mənd/' },
];

/**
 * Đọc nội dung file .txt thành danh sách câu hỏi Tiết Tiếng Anh.
 * Hỗ trợ linh hoạt mọi định dạng trên từng dòng:
 * - Tủ lạnh | FRIDGE | /frɪdʒ/
 * - Tủ lạnh : FRIDGE
 * - Tủ lạnh - FRIDGE
 * - Tủ lạnh = FRIDGE
 * - Tủ lạnh, FRIDGE
 * - Tủ lạnh; FRIDGE
 */
export function parseEnglishQuizTxt(
  rawText: string,
  options?: ParseQuizTxtOptions
): EnglishQuizItem[] {
  return parseLargeQuizTxtFast(rawText, options);
}

export function formatEnglishQuizTxt(items: EnglishQuizItem[]): string {
  return items
    .map((q) => (q.phonetic ? `${q.vi} | ${q.en} | ${q.phonetic}` : `${q.vi} | ${q.en}`))
    .join('\n');
}

export const DEFAULT_QUIZ_DECKS: Array<{
  id: string;
  name: string;
  questions: EnglishQuizItem[];
}> = BUILT_IN_TIERED_QUIZ_DECKS;

export const INITIAL_DONORS: DonorEntry[] = [];

export const AVATAR_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#dc2626',
];

function makeStudentSvgAvatar(
  bg: string,
  shirt: string,
  accent: string,
  gender: 'female' | 'male'
): string {
  const inner =
    gender === 'female'
      ? `<circle cx="32" cy="24" r="11" fill="#fde68a"/><path d="M19 24 C19 10 45 10 45 24 C43 17 37 14 32 14 C27 14 21 17 19 24 Z" fill="#1e293b"/><path d="M15 56 C15 41 49 41 49 56 Z" fill="${shirt}"/><polygon points="32,41 28,50 32,54 36,50" fill="${accent}"/>`
      : `<circle cx="32" cy="24" r="11" fill="#fcd34d"/><path d="M20 21 C20 11 44 11 44 21 C41 15 23 15 20 21 Z" fill="#0f172a"/><path d="M14 56 C14 41 50 41 50 56 Z" fill="${shirt}"/><polygon points="32,41 29,52 32,55 35,52" fill="${accent}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/>${inner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_NPC_AVATARS: string[] = [
  makeStudentSvgAvatar('#1e3a8a', '#ffffff', '#ef4444', 'female'),
  makeStudentSvgAvatar('#065f46', '#ffffff', '#2563eb', 'male'),
  makeStudentSvgAvatar('#831843', '#ffffff', '#f43f5e', 'female'),
  makeStudentSvgAvatar('#312e81', '#ffffff', '#0ea5e9', 'male'),
  makeStudentSvgAvatar('#78350f', '#ffffff', '#f59e0b', 'female'),
  makeStudentSvgAvatar('#134e4a', '#ffffff', '#10b981', 'male'),
];

export const FONT_FAMILY_OPTIONS = [
  { label: 'Mặc định (Be Vietnam Pro)', value: '"Be Vietnam Pro", system-ui, sans-serif' },
  { label: 'Sách Giáo Khoa (Serif)', value: 'Georgia, Cambria, "Times New Roman", serif' },
  { label: 'Bảng Phấn Mềm Mại (Rounded)', value: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, sans-serif' },
  { label: 'Đậm Nét Hiện Đại (Arial Black)', value: '"Arial Black", Gadget, sans-serif' },
  { label: 'Kỹ Thuật Số (Monospace)', value: '"JetBrains Mono", ui-monospace, monospace' },
] as const;

export const SAMPLE_NAMES = [
  'Nguyễn Thị Yến Nhi',
  'Trần Minh Khang',
  'Lê Hoàng Bảo',
  'Phạm Thu Hà',
  'Vũ Đức Đạt',
  'Phương Ngọc Ánh',
  'Hoàng Gia Huy',
  'Đặng Khánh Linh',
  'Bùi Thanh Tùng',
  'Ngô Mỹ Duyên',
  'Đỗ Quang Minh',
  'Hồ Thảo Vy',
  'Lý Hải Đăng',
  'Trương Bảo Ngọc',
  'Phan Tuấn Kiệt',
  'Võ Hoàng Yến',
];

export const SAMPLE_PRAYERS = [
  ...DEFAULT_NPC_SPEECH_CATEGORIES.idle,
  ...DEFAULT_NPC_SPEECH_CATEGORIES.question,
  ...DEFAULT_NPC_SPEECH_CATEGORIES.reply,
];

export const NODE_SERVER_CODE = `// File: server.js (Bridge TikTok Live + 4 Chốt Chống Đốt Lượt EulerStream + Giọng đọc AI cho Lớp Học Live)
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

// Chặn mọi lỗi ngầm không làm sập cửa sổ CMD
process.on('uncaughtException', err => {
  console.warn('⚠️ [BỎ QUA LỖI NGẦM]:', err?.message || err);
});
process.on('unhandledRejection', err => {
  console.warn('⚠️ [BỎ QUA PROMISE LỖI]:', err?.message || err);
});

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(cors());
app.use(express.json());

// ================= CẤU HÌNH KẾT NỐI TIKTOK LIVE & EULER KEY =================
// 1. ID kênh TikTok: tự điền sẵn từ Web Game hoặc truyền qua lệnh: node server.js @id_kenh
let TIKTOK_USERNAME = (process.argv[2] || "ten_id_tiktok_cua_ban").replace(/^@+/, '').trim();
// 2. Khóa EulerStream miễn phí (tùy chọn):
//    - Cách khuyên dùng: Tạo file .env (ghi EULER_API_KEY=mã_key) HOẶC file euler_key.txt cùng thư mục với server.js
//    - Hoặc dán trực tiếp mã key vào giữa cặp dấu nháy kép ở dòng EULER_API_KEY_INLINE ngay bên dưới:
const EULER_API_KEY_INLINE = "";
const CLOUD_RELAY_URL = "__CLOUD_RELAY_URL__";

function resolveEulerApiKey() {
  const direct = String(
    process.env.EULER_API_KEY ||
    process.env.SIGN_API_KEY ||
    process.argv[3] ||
    EULER_API_KEY_INLINE ||
    ''
  ).trim();
  if (direct) return direct;

  try {
    const keyFile = path.join(__dirname, 'euler_key.txt');
    if (fs.existsSync(keyFile)) {
      const txt = fs.readFileSync(keyFile, 'utf8').trim();
      if (txt && !txt.startsWith('#')) return txt;
    }
  } catch (e) {}

  try {
    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf8').split(/\\r?\\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^(?:EULER_API_KEY|SIGN_API_KEY)\\s*=\\s*(.*)$/);
        if (m) {
          const val = m[1].trim().replace(/^['"]|['"]$/g, '');
          if (val) return val;
        }
      }
    }
  } catch (e) {}

  return '';
}

let lastStatusPayload = {
  type: 'status',
  status: 'idle',
  username: TIKTOK_USERNAME !== 'ten_id_tiktok_cua_ban' ? TIKTOK_USERNAME : '',
  roomId: '',
  eulerKeyConfigured: Boolean(resolveEulerApiKey()),
  message: 'Chờ kết nối phòng Live (Đã bật 4 chốt chống đốt lượt EulerStream)...'
};

const sseClients = new Set();
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  sseClients.add(res);
  try {
    res.write(\`data: \${JSON.stringify({ ...lastStatusPayload, eulerKeyConfigured: Boolean(resolveEulerApiKey()) })}\\n\\n\`);
  } catch (e) {}
  req.on('close', () => sseClients.delete(res));
});

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    ...lastStatusPayload,
    eulerKeyConfigured: Boolean(resolveEulerApiKey())
  });
});

app.post('/connect', async (req, res) => {
  const user = String(req.body?.username || req.query?.username || '').replace(/^@+/, '').trim();
  if (!user) return res.status(400).json({ ok: false, error: 'Thiếu ID TikTok' });
  const result = await connectTikTok(user, false);
  if (result.ok) {
    res.json({ ok: true, roomId: result.roomId, username: user, eulerKeyConfigured: Boolean(resolveEulerApiKey()) });
  } else {
    res.status(500).json({ ok: false, error: result.error || 'Không kết nối được phòng Live' });
  }
});

app.get('/connect', async (req, res) => {
  const user = String(req.query?.username || '').replace(/^@+/, '').trim();
  if (!user) return res.status(400).json({ ok: false, error: 'Thiếu ID TikTok' });
  const result = await connectTikTok(user, false);
  res.json(result);
});

app.post('/disconnect', async (req, res) => {
  manualDisconnected = true;
  reconnectAttempt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeTiktok) {
    try {
      activeTiktok.removeAllListeners?.();
      await activeTiktok.disconnect?.();
    } catch (e) {}
    activeTiktok = null;
  }
  lastStatusPayload = {
    type: 'status',
    status: 'simulated',
    username: TIKTOK_USERNAME,
    roomId: '',
    eulerKeyConfigured: Boolean(resolveEulerApiKey()),
    message: '⏹️ Đã ngắt kết nối phiên Live (Đã dừng hoàn toàn tự động kết nối lại)'
  };
  broadcast(lastStatusPayload);
  res.json({ ok: true });
});

const localTtsCache = new Map();
async function handleLocalGoogleWarmTts(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  try {
    const text = String(req.query?.text || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
    if (!text) return res.status(400).end();
    const cacheKey = 'vi:' + text;
    if (localTtsCache.has(cacheKey)) {
      const cached = localTtsCache.get(cacheKey);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('X-TTS-Source', 'ram-cache');
      return res.send(cached);
    }
    const enc = encodeURIComponent(text);
    const urls = [
      'https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&ttsspeed=1&q=' + enc,
      'https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' + enc,
      'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' + enc,
    ];
    let audioBuf = null;
    for (const u of urls) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2800);
      try {
        const r = await fetch(u, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://translate.google.com/',
          },
        });
        clearTimeout(t);
        if (!r.ok) continue;
        const ct = String(r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) continue;
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length >= 128) {
          audioBuf = b;
          break;
        }
      } catch (e) {
        clearTimeout(t);
      }
    }
    if (!audioBuf) return res.status(502).end();
    if (localTtsCache.size >= 200) {
      const firstKey = localTtsCache.keys().next().value;
      if (firstKey) localTtsCache.delete(firstKey);
    }
    localTtsCache.set(cacheKey, audioBuf);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-TTS-Source', 'google-gtx');
    res.send(audioBuf);
  } catch (e) {
    res.status(502).end();
  }
}
app.get('/api/tts', handleLocalGoogleWarmTts);
app.get('/tts', handleLocalGoogleWarmTts);

// Gộp cả WebSocket (ws://localhost:8080 & ws://127.0.0.1:8080) và HTTP vào cổng 8080 để không bao giờ bị đụng cổng 3000
const httpServer8080 = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer8080, maxPayload: 100 * 1024 * 1024 });

httpServer8080.listen(8080, '0.0.0.0', () => {
  const hasKey = Boolean(resolveEulerApiKey());
  console.log('==========================================================');
  console.log('🚀 Bridge WebSocket TikTok Live: ws://localhost:8080 (hoặc ws://127.0.0.1:8080)');
  console.log('🔊 Server TTS Lớp Học:           http://localhost:8080/tts');
  console.log('🛡️ Chống Đốt Lượt EulerStream:   ĐÃ BẬT (Dừng khi Offline/streamEnd/429 • Backoff 8s->90s)');
  console.log(hasKey
    ? '🔑 EulerStream API Key:          ĐÃ NHẬN KEY RIÊNG (.env / euler_key.txt / server.js)'
    : '🔑 EulerStream API Key:          Đang chạy chế độ miễn phí theo IP (Có thể thêm key vào .env hoặc euler_key.txt)');
  console.log('==========================================================');
});

// Mở thêm cổng 3000 dự phòng cho TTS (nếu cổng 3000 đang bận bởi Web Game thì tự động bỏ qua, không báo lỗi)
const ttsServer3000 = http.createServer(app);
ttsServer3000.on('error', () => {});
ttsServer3000.listen(3000, '0.0.0.0');

let localTikTokSeq = 0;
let webhookPendingQueue = [];
let webhookFlushTimer = null;
let isFlushingWebhook = false;

function parseProtoInt64Str(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'bigint') return val > 0n ? val.toString(10) : undefined;
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? Math.trunc(val).toString(10) : undefined;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\\d+$/.test(s)) {
      const stripped = s.replace(/^0+/, '');
      return stripped || undefined;
    }
    return undefined;
  }
  if (typeof val === 'object' && typeof val.low === 'number' && typeof val.high === 'number') {
    const low = BigInt(val.low >>> 0);
    const high = val.unsigned === false ? BigInt(val.high | 0) : BigInt(val.high >>> 0);
    const combined = (high << 32n) | low;
    return combined > 0n ? combined.toString(10) : undefined;
  }
  return undefined;
}

function normalizeCreateTimeMs(val) {
  const s = parseProtoInt64Str(val);
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n >= 1e9 && n < 1e11) return Math.trunc(n * 1000);
  if (n >= 1e11 && n < 1e14) return Math.trunc(n);
  if (n >= 1e14 && n < 1e17) return Math.trunc(n / 1000);
  return undefined;
}

function extractOrderFields(data) {
  const serverSeq = ++localTikTokSeq;
  const serverReceivedAtMs = Date.now();
  const tiktokMsgId = parseProtoInt64Str(
    data?.common?.msgId ?? data?.msgId ?? data?.messageId ?? data?.common?.messageId
  );
  const tiktokCreateTimeMs = normalizeCreateTimeMs(
    data?.common?.createTime ?? data?.createTime ?? data?.timestamp
  );
  return { tiktokMsgId, tiktokCreateTimeMs, serverSeq, serverReceivedAtMs };
}

async function flushCloudWebhookQueue() {
  if (isFlushingWebhook || webhookPendingQueue.length === 0) return;
  if (!CLOUD_RELAY_URL || !CLOUD_RELAY_URL.startsWith('http')) {
    webhookPendingQueue = [];
    return;
  }
  isFlushingWebhook = true;
  try {
    while (webhookPendingQueue.length > 0) {
      const batch = webhookPendingQueue.splice(0, 50);
      await fetch(\`\${CLOUD_RELAY_URL}/api/tiktok-webhook\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'batch', events: batch }),
      }).catch(() => {});
    }
  } finally {
    isFlushingWebhook = false;
    if (webhookPendingQueue.length > 0) {
      if (!webhookFlushTimer) {
        webhookFlushTimer = setTimeout(() => {
          webhookFlushTimer = null;
          flushCloudWebhookQueue();
        }, 40);
      }
    }
  }
}

function enqueueCloudWebhookEvent(data) {
  if (!CLOUD_RELAY_URL || !CLOUD_RELAY_URL.startsWith('http')) return;
  if (!data || data.type === 'ADMIN_SYNC') return;
  webhookPendingQueue.push(data);
  if (data.type === 'status') {
    if (webhookFlushTimer) {
      clearTimeout(webhookFlushTimer);
      webhookFlushTimer = null;
    }
    flushCloudWebhookQueue();
    return;
  }
  if (!webhookFlushTimer) {
    webhookFlushTimer = setTimeout(() => {
      webhookFlushTimer = null;
      flushCloudWebhookQueue();
    }, 40);
  }
}

function broadcast(data, excludeWs = null) {
  if (data && data.type === 'status') {
    lastStatusPayload = data;
  }
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === 1) {
      try { client.send(json); } catch (e) {}
    }
  });
  sseClients.forEach(res => {
    try { res.write(\`data: \${json}\\n\\n\`); } catch (e) {}
  });
  enqueueCloudWebhookEvent(data);
}

function getUserName(data) {
  const u = data?.user || data?.userDetails || data || {};
  return (
    u.nickname ||
    u.displayId ||
    u.uniqueId ||
    data?.nickname ||
    data?.displayId ||
    data?.uniqueId ||
    'Học Sinh'
  );
}

function getCommentText(data) {
  return (
    data?.content ||
    data?.comment ||
    data?.text ||
    data?.message ||
    data?.common?.displayText?.defaultPattern ||
    ''
  );
}

function getUserAvatar(data) {
  const u = data?.user || data?.userDetails || data || {};
  const candidates = [
    u.profilePictureUrl,
    u.avatarUrl,
    u.avatarThumb?.urlList?.[0],
    u.avatarThumb?.url?.[0],
    u.avatarThumb?.urls?.[0],
    u.avatarLarge?.urlList?.[0],
    u.avatarLarge?.url?.[0],
    u.avatarLarge?.urls?.[0],
    u.profilePicture?.urlList?.[0],
    u.profilePicture?.url?.[0],
    u.profilePicture?.urls?.[0],
    data?.profilePictureUrl,
    data?.avatarUrl,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

let activeTiktok = null;
let reconnectTimer = null;
let isConnectingNow = false;
let reconnectAttempt = 0;
let manualDisconnected = false;
let lastManualConnectAt = 0;

// Lịch giãn nhịp thông minh khi rớt mạng giữa phiên Live: 8s -> 20s -> 45s -> 90s (tối đa 4 lần thử, vào lại được phòng sẽ reset về 0)
const BACKOFF_SCHEDULE_MS = [8000, 20000, 45000, 90000];

function extractRawErrorText(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const parts = [
    err.name,
    err.constructor?.name,
    err.code,
    err.status,
    err.statusCode,
    err.response?.status,
    err.message,
    err.info,
    err.exception?.message,
    Array.isArray(err.errors) ? err.errors.map(x => x?.message || String(x)).join(' | ') : ''
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : String(err);
}

function classifyTikTokFailure(err) {
  const raw = extractRawErrorText(err);
  const lower = raw.toLowerCase();

  // Chốt 2A: Chạm trần lượt kết nối (429 / Rate Limit / Quota) -> NGẮT NGAY
  if (
    lower.includes('signatureratelimiterror') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('ratelimit') ||
    lower.includes('too many requests') ||
    /\\b429\\b/.test(lower) ||
    lower.includes('quota') ||
    lower.includes('limit reached') ||
    lower.includes('daily limit') ||
    lower.includes('hourly limit') ||
    lower.includes('max requests')
  ) {
    return {
      shouldAutoReconnect: false,
      message: '🛑 Đã chạm giới hạn lượt kết nối EulerStream (429 Rate Limit). ĐÃ DỪNG tự kết nối lại để bảo vệ IP/Key!'
    };
  }

  // Chốt 2B: Lỗi khóa Euler API Key (401 / 403) -> NGẮT NGAY
  if (
    lower.includes('invalid api key') ||
    lower.includes('api key is invalid') ||
    lower.includes('unauthorized') ||
    /\\b401\\b/.test(lower) ||
    (lower.includes('signapierror') && /\\b403\\b/.test(lower))
  ) {
    return {
      shouldAutoReconnect: false,
      message: '🔑 Mã EULER_API_KEY không hợp lệ hoặc hết hạn (401/403). Đã dừng tự động thử lại!'
    };
  }

  // Chốt 1: Kênh chưa bật Live (Offline), tắt Live, hoặc sai ID -> NGẮT NGAY
  if (
    lower.includes('userofflineerror') ||
    lower.includes('invaliduniqueiderror') ||
    lower.includes('offline') ||
    lower.includes('not live') ||
    lower.includes("isn't live") ||
    lower.includes('is not currently live') ||
    lower.includes('live has ended') ||
    lower.includes('stream has ended') ||
    lower.includes('room_not_found') ||
    lower.includes('user_not_found') ||
    lower.includes('failed to retrieve room_id') ||
    lower.includes('not found')
  ) {
    return {
      shouldAutoReconnect: false,
      message: '⏹️ Kênh hiện chưa bật Live (Offline) hoặc sai ID — Tự dừng chờ để KHÔNG tốn lượt kết nối miễn phí!'
    };
  }

  return {
    shouldAutoReconnect: true,
    message: raw || 'Gián đoạn kết nối mạng tạm thời'
  };
}

async function loadTikTokConnectorPkg() {
  try {
    return require('tiktok-live-connector');
  } catch (e) {
    return await import('tiktok-live-connector');
  }
}

async function connectTikTok(customUser, isAutoRetry = false) {
  if (customUser) {
    TIKTOK_USERNAME = String(customUser).replace(/^@+/, '').trim();
  }
  if (!TIKTOK_USERNAME || TIKTOK_USERNAME === 'ten_id_tiktok_cua_ban') {
    console.log('ℹ️ [CHỜ ID TIKTOK] Nhập ID TikTok đang phát Live trên Web Game rồi bấm "Kết nối Live"!');
    return { ok: false, error: 'Chưa nhập ID TikTok' };
  }

  if (isConnectingNow) {
    return { ok: false, error: '⏳ Hệ thống đang trong quá trình kết nối, vui lòng chờ giây lát...' };
  }

  if (!isAutoRetry) {
    const now = Date.now();
    if (now - lastManualConnectAt < 2200) {
      return { ok: false, error: '⏳ Vui lòng chờ 2 giây giữa các lần bấm Kết nối để tránh tốn lượt!' };
    }
    lastManualConnectAt = now;
    manualDisconnected = false;
    reconnectAttempt = 0;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeTiktok) {
    try {
      activeTiktok.removeAllListeners?.();
      await activeTiktok.disconnect?.();
    } catch (e) {}
    activeTiktok = null;
  }

  isConnectingNow = true;
  const targetUser = TIKTOK_USERNAME;
  const eulerKey = resolveEulerApiKey();
  const hasEulerKey = Boolean(eulerKey);

  try {
    const pkg = await loadTikTokConnectorPkg();
    // Bỏ qua bước cào HTML SIGI_STATE cũ để kết nối nhanh gấp đôi
    if (pkg.RoomIdRouteConfig) {
      pkg.RoomIdRouteConfig.skipFetchRoomInfoFromHtmlRoute = true;
    } else if (pkg.default?.RoomIdRouteConfig) {
      pkg.default.RoomIdRouteConfig.skipFetchRoomInfoFromHtmlRoute = true;
    }

    // Chốt 4: Gắn EulerStream API Key vào SignConfig và làm mới cachedInstance ngay lập tức
    const signCfg = pkg.SignConfig || pkg.default?.SignConfig;
    if (signCfg && typeof signCfg === 'object') {
      const nextKey = eulerKey || undefined;
      if (signCfg.apiKey !== nextKey) {
        signCfg.apiKey = nextKey;
        if ('cachedInstance' in signCfg) {
          signCfg.cachedInstance = undefined;
        }
      }
    }

    // Ưu tiên tuyệt đối TikTokLiveConnection (v2.x) để không bao giờ bị lỗi .map() của bản legacy
    const TikTokConnector =
      pkg.TikTokLiveConnection ||
      pkg.default?.TikTokLiveConnection ||
      pkg.WebcastPushConnection ||
      pkg.default?.WebcastPushConnection;

    console.log(\`⏳ [ĐANG KẾT NỐI] @\${targetUser}\${hasEulerKey ? ' (🔑 Đang dùng Euler API Key riêng)' : ' (Chế độ miễn phí theo IP)'}...\`);
    broadcast({
      type: 'status',
      status: 'connecting',
      username: targetUser,
      roomId: '',
      eulerKeyConfigured: hasEulerKey,
      message: isAutoRetry
        ? \`🔄 Tự kết nối lại @\${targetUser} (Lần \${reconnectAttempt}/\${BACKOFF_SCHEDULE_MS.length})...\`
        : \`Đang kết nối @\${targetUser}\${hasEulerKey ? ' [Euler Key]' : ''}...\`
    });

    const tiktok = new TikTokConnector(targetUser, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      fetchRoomInfoOnConnect: false,
      ...(eulerKey ? { signApiKey: eulerKey } : {}),
    });

    // Chặn gọi API lấy danh sách quà trả phí của EulerStream
    if (typeof tiktok.fetchAvailableGifts === 'function') {
      tiktok.fetchAvailableGifts = async () => [];
    }

    // Bọc an toàn hàm giải mã gói tin để không bao giờ bị văng lỗi .map() nếu dùng thư viện cũ
    if (typeof tiktok.processProtoMessageFetchResult === 'function') {
      const origProcess = tiktok.processProtoMessageFetchResult.bind(tiktok);
      tiktok.processProtoMessageFetchResult = async function (fetchResult) {
        try {
          if (fetchResult && Array.isArray(fetchResult.messages)) {
            for (const m of fetchResult.messages) {
              const d = m?.decodedData?.data;
              if (d && typeof d === 'object') {
                if (!Array.isArray(d.ranksList)) d.ranksList = [];
                if (!Array.isArray(d.emotes)) d.emotes = [];
                if (!Array.isArray(d.emoteList)) d.emoteList = [];
                if (d.user && !Array.isArray(d.user.badgeList)) d.user.badgeList = [];
              }
            }
          }
          return await origProcess(fetchResult);
        } catch (err) {
          // Bỏ qua gói tin lỗi định dạng, giữ nguyên kết nối
        }
      };
    }

    activeTiktok = tiktok;

    const GIFT_ID_FALLBACK = {
      5655: { name: 'Rose', coins: 1 },
      5827: { name: 'Ice Cream Cone', coins: 1 },
      5269: { name: 'TikTok', coins: 1 },
      7934: { name: 'GG', coins: 1 },
      5487: { name: 'Finger Heart', coins: 5 },
      5658: { name: 'Perfume', coins: 20 },
      5660: { name: 'Doughnut', coins: 30 },
    };

    tiktok.on('chat', data => {
      try {
        const username = getUserName(data);
        const comment = String(getCommentText(data) || '').trim();
        if (!comment) return;
        const orderFields = extractOrderFields(data);
        console.log(\`💬 [COMMENT #\${orderFields.serverSeq}] \${username}: \${comment}\`);
        broadcast({
          type: 'chat',
          username,
          avatarUrl: getUserAvatar(data),
          comment,
          ...orderFields,
        });
      } catch (e) {}
    });

    const giftStreakMap = new Map();

    tiktok.on('gift', data => {
      try {
        const username = getUserName(data);
        const giftType = Number(
          data?.gift?.type ??
          data?.giftType ??
          data?.gift?.giftType ??
          data?.giftDetails?.giftType ??
          (data?.gift?.combo ? 1 : 0)
        );
        const isComboGift = giftType === 1 || Boolean(data?.gift?.combo);
        const rawRepeatCount = Math.max(
          1,
          Number(data?.repeatCount ?? data?.comboCount ?? data?.gift?.repeat_count ?? 1) || 1
        );
        const groupId = String(data?.groupId || data?.giftId || data?.gift?.id || 'default');
        const nowGiftMs = Date.now();
        for (const [gk, gv] of giftStreakMap.entries()) {
          if (nowGiftMs - gv.at > 45000) giftStreakMap.delete(gk);
        }

        let effectiveUnits = rawRepeatCount;
        if (isComboGift) {
          const streakKey = \`\${username.toLowerCase()}:\${groupId}\`;
          const prevStreak = giftStreakMap.get(streakKey);
          const prevCount = prevStreak ? prevStreak.count : 0;
          if (rawRepeatCount <= prevCount) {
            // Gói chốt repeatEnd lặp lại cùng repeatCount đã cộng trước đó -> bỏ qua để không cộng trùng
            return;
          }
          effectiveUnits = rawRepeatCount - prevCount;
          giftStreakMap.set(streakKey, { count: rawRepeatCount, at: nowGiftMs });
        }

        const fallbackGift = GIFT_ID_FALLBACK[Number(data?.giftId)] || null;
        const diamondCount = Math.max(
          1,
          Number(
            data?.gift?.diamondCount ??
            data?.giftDetails?.diamondCount ??
            data?.extendedGiftInfo?.diamond_count ??
            data?.diamondCount ??
            fallbackGift?.coins ??
            1
          ) || 1
        );
        const giftName =
          data?.gift?.name ||
          data?.giftDetails?.giftName ||
          data?.extendedGiftInfo?.name ||
          data?.giftName ||
          fallbackGift?.name ||
          (typeof data?.describe === 'string' ? data.describe.replace(/^sent\\s+/i, '').trim() : '') ||
          'Quà tặng';
        const coins = Math.max(1, diamondCount * effectiveUnits);
        const orderFields = extractOrderFields(data);
        console.log(\`🎁 [QUÀ TẶNG] \${username} tặng \${giftName} +\${effectiveUnits} (combo x\${rawRepeatCount} • +\${coins} xu)\`);
        broadcast({
          type: 'gift',
          username,
          avatarUrl: getUserAvatar(data),
          giftName,
          coins,
          repeatCount: effectiveUnits,
          comboCount: rawRepeatCount,
          groupId,
          ...orderFields,
        });
      } catch (e) {}
    });

    tiktok.on('like', data => {
      try {
        const username = getUserName(data);
        const likeCount = Math.max(1, Number(data?.count ?? data?.likeCount ?? data?.unmergedLikeCount ?? 1) || 1);
        const orderFields = extractOrderFields(data);
        console.log(\`❤️ [THẢ TIM] \${username} thả \${likeCount} tim\`);
        broadcast({ type: 'like', username, avatarUrl: getUserAvatar(data), likeCount, ...orderFields });
      } catch (e) {}
    });

    const handleFollow = data => {
      try {
        const username = getUserName(data);
        const orderFields = extractOrderFields(data);
        console.log(\`➕ [FOLLOW] \${username} vừa follow kênh\`);
        broadcast({ type: 'follow', username, avatarUrl: getUserAvatar(data), ...orderFields });
      } catch (e) {}
    };

    tiktok.on('follow', handleFollow);
    tiktok.on('social', data => {
      try {
        const key = String(data?.displayType || data?.common?.displayText?.key || '').toLowerCase();
        if (key.includes('follow')) handleFollow(data);
      } catch (e) {}
    });

    tiktok.on('member', data => {
      try {
        const username = getUserName(data);
        console.log(\`👋 [VÀO PHÒNG] \${username} vừa vào xem Live\`);
      } catch (e) {}
    });

    let streamEndedByHost = false;
    let fatalStreamError = null;

    tiktok.on('error', err => {
      const check = classifyTikTokFailure(err);
      if (!check.shouldAutoReconnect) {
        fatalStreamError = err;
      }
      const msg = err?.exception?.message || err?.message || err?.info || String(err);
      console.warn('⚠️ [CẢNH BÁO TIKTOK]:', msg);
    });

    // Chốt 1: Chủ kênh tắt Live (streamEnd) -> Dừng hoàn toàn, KHÔNG kết nối lại!
    tiktok.on('streamEnd', () => {
      if (activeTiktok !== tiktok) return;
      streamEndedByHost = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      activeTiktok = null;
      const endMsg = \`⏹️ Phiên Live @\${targetUser} đã kết thúc (streamEnd) — Đã dừng tự động kết nối lại để bảo vệ lượt miễn phí.\`;
      console.log(endMsg);
      broadcast({
        type: 'status',
        status: 'simulated',
        username: targetUser,
        roomId: '',
        eulerKeyConfigured: Boolean(resolveEulerApiKey()),
        message: endMsg
      });
    });

    // Chốt 3: Đang Live thật sự mà rớt mạng -> Giãn nhịp 8s -> 20s -> 45s -> 90s (tối đa 4 lần thử)
    tiktok.on('disconnected', () => {
      if (activeTiktok !== tiktok) return;
      if (manualDisconnected || streamEndedByHost) return;

      if (fatalStreamError) {
        const fatalCheck = classifyTikTokFailure(fatalStreamError);
        console.error('🛑 [DỪNG TỰ NỐI LẠI]:', fatalCheck.message);
        broadcast({
          type: 'status',
          status: 'error',
          username: targetUser,
          roomId: '',
          eulerKeyConfigured: Boolean(resolveEulerApiKey()),
          message: fatalCheck.message
        });
        return;
      }

      if (reconnectAttempt >= BACKOFF_SCHEDULE_MS.length) {
        const stopMsg = \`🛑 Đã thử kết nối lại tối đa \${BACKOFF_SCHEDULE_MS.length} lần không thành công — Tạm dừng tự động để bảo vệ hạn mức EulerStream!\`;
        console.warn(stopMsg);
        broadcast({
          type: 'status',
          status: 'error',
          username: targetUser,
          roomId: '',
          eulerKeyConfigured: Boolean(resolveEulerApiKey()),
          message: stopMsg
        });
        return;
      }

      const waitMs = BACKOFF_SCHEDULE_MS[reconnectAttempt];
      reconnectAttempt += 1;
      const retryMsg = \`🔄 Mất kết nối tạm thời — Tự thử lại lần \${reconnectAttempt}/\${BACKOFF_SCHEDULE_MS.length} sau \${Math.round(waitMs / 1000)} giây...\`;
      console.warn(retryMsg);
      broadcast({
        type: 'status',
        status: 'connecting',
        username: targetUser,
        roomId: '',
        eulerKeyConfigured: Boolean(resolveEulerApiKey()),
        message: retryMsg
      });
      reconnectTimer = setTimeout(() => connectTikTok(null, true), waitMs);
    });

    const state = await tiktok.connect();
    isConnectingNow = false;
    reconnectAttempt = 0; // Reset bộ đếm ngay khi vào phòng thành công!
    const roomIdStr = String(state?.roomId || tiktok.roomId || 'OK');
    console.log(\`✅ [THÀNH CÔNG] Đã kết nối phòng Live @\${targetUser} (Room ID: \${roomIdStr})\${hasEulerKey ? ' [🔑 Euler Key]' : ''} - Đang lắng nghe Comment & Quà...\`);
    broadcast({
      type: 'status',
      status: 'connected',
      username: targetUser,
      roomId: roomIdStr,
      eulerKeyConfigured: hasEulerKey,
      message: \`Đã kết nối @\${targetUser} (Room: \${roomIdStr})\${hasEulerKey ? ' • 🔑 Euler Key' : ''}\`
    });
    return { ok: true, roomId: roomIdStr };
  } catch (err) {
    isConnectingNow = false;
    activeTiktok = null;
    const classified = classifyTikTokFailure(err);
    console.error(\`❌ [LỖI KẾT NỐI @\${targetUser}]:\`, classified.message);

    // Chỉ giãn nhịp tiếp nếu đây là nhịp tự động nối lại khi rớt mạng VÀ không vi phạm Chốt 1 (Offline) hay Chốt 2 (429 Rate Limit / Key)
    if (isAutoRetry && classified.shouldAutoReconnect && !manualDisconnected) {
      if (reconnectAttempt < BACKOFF_SCHEDULE_MS.length) {
        const waitMs = BACKOFF_SCHEDULE_MS[reconnectAttempt];
        reconnectAttempt += 1;
        const retryMsg = \`\${classified.message} • Thử lại lần \${reconnectAttempt}/\${BACKOFF_SCHEDULE_MS.length} sau \${Math.round(waitMs / 1000)}s...\`;
        console.log('🔄', retryMsg);
        broadcast({
          type: 'status',
          status: 'connecting',
          username: targetUser,
          roomId: '',
          eulerKeyConfigured: hasEulerKey,
          message: retryMsg
        });
        reconnectTimer = setTimeout(() => connectTikTok(null, true), waitMs);
        return { ok: false, error: classified.message };
      }
    }

    console.log('🛡️ [CHỐNG ĐỐT LƯỢT] Đã giữ trạng thái nghỉ an toàn — Bấm "Kết nối Live" khi kênh đã lên sóng!');
    broadcast({
      type: 'status',
      status: 'error',
      username: targetUser,
      roomId: '',
      eulerKeyConfigured: hasEulerKey,
      message: classified.message
    });
    return { ok: false, error: classified.message };
  }
}

const wsPeerRoles = new Map();
function broadcastWsPeerCounts() {
  let obsPeers = 0;
  wsPeerRoles.forEach(role => { if (role === 'obs') obsPeers++; });
  broadcast({ type: 'PEER_STATUS', totalPeers: wss.clients.size, obsPeers });
}

wss.on('connection', ws => {
  wsPeerRoles.set(ws, 'admin');
  console.log(\`🔌 [WEBSOCKET] Trình duyệt Game đã kết nối thành công! (Đang mở: \${wss.clients.size} tab)\`);
  try {
    ws.send(JSON.stringify({ ...lastStatusPayload, eulerKeyConfigured: Boolean(resolveEulerApiKey()) }));
  } catch (e) {}
  broadcastWsPeerCounts();
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'REGISTER_PEER_ROLE') {
        wsPeerRoles.set(ws, msg.role === 'obs' ? 'obs' : 'admin');
        broadcastWsPeerCounts();
      } else if (msg.type === 'OBS_HEARTBEAT' || msg.type === 'OBS_CLOSING') {
        broadcast(msg, ws);
      } else if (msg.type === 'ADMIN_SYNC') {
        broadcast(msg, ws);
      } else if (msg.type === 'CONNECT_TIKTOK' && msg.username) {
        connectTikTok(msg.username, false);
      }
    } catch (e) {}
  });
  ws.on('close', () => {
    wsPeerRoles.delete(ws);
    broadcastWsPeerCounts();
  });
});

// Chỉ kết nối ngay khi mở CMD nếu người dùng truyền trực tiếp ID kênh qua lệnh: node server.js @id_kenh
if (process.argv[2] && TIKTOK_USERNAME && TIKTOK_USERNAME !== 'ten_id_tiktok_cua_ban') {
  connectTikTok(TIKTOK_USERNAME, false);
} else {
  console.log('ℹ️ [SẴN SÀNG] Đang chờ lệnh "Kết nối Live" từ giao diện Web Game (không tự động gọi ngầm để tiết kiệm 100% lượt kết nối)!');
}`;

/**
 * Hệ thống 17 Cấp độ IELTS (Cấp 1 -> Cấp 17, tương ứng IEL 1.0 -> IEL 9.0, bước nhảy 0.5).
 * Mốc tổng điểm tích lũy (EXP) để đạt từng cấp:
 * Lv1: 0 | Lv2: 20 | Lv3: 60 | Lv4: 130 | Lv5: 250 | Lv6: 430 | Lv7: 700 | Lv8: 1080 |
 * Lv9: 1600 | Lv10: 2300 | Lv11: 3000 | Lv12: 4000 | Lv13: 5150 | Lv14: 6350 | Lv15: 7350 | Lv16: 8500 | Lv17: 10000
 */
export const STUDENT_LEVEL_CUMULATIVE_EXP: readonly number[] = [
  0,
  20,
  60,
  130,
  250,
  430,
  700,
  1080,
  1600,
  2300,
  3000,
  4000,
  5150,
  6350,
  7350,
  8500,
  10000,
];

export interface ComputedStudentIeltsLevelInfo {
  level: number; // 1..17
  ieltsBand: string; // '1.0' .. '9.0'
  ieltsLabel: string; // 'IEL 1.0' .. 'IEL 9.0'
  expPercent: number; // 0..99 khi đang lên cấp tiếp theo, 100 khi đạt cấp tối đa 17 (IEL 9.0)
  totalExp: number;
  currentLevelStartExp: number;
  nextLevelTargetExp: number | null;
}

export function computeStudentIeltsLevelFromExp(
  rawExp: number | undefined | null
): ComputedStudentIeltsLevelInfo {
  const totalExp = Math.max(0, Math.floor(Number(rawExp) || 0));
  let lvlIdx = 0;
  for (let i = STUDENT_LEVEL_CUMULATIVE_EXP.length - 1; i >= 0; i--) {
    if (totalExp >= STUDENT_LEVEL_CUMULATIVE_EXP[i]) {
      lvlIdx = i;
      break;
    }
  }
  const level = lvlIdx + 1;
  const ieltsBand = (1.0 + lvlIdx * 0.5).toFixed(1);
  const ieltsLabel = `IEL ${ieltsBand}`;
  const currentLevelStartExp = STUDENT_LEVEL_CUMULATIVE_EXP[lvlIdx];

  if (lvlIdx >= STUDENT_LEVEL_CUMULATIVE_EXP.length - 1) {
    return {
      level,
      ieltsBand,
      ieltsLabel,
      expPercent: 100,
      totalExp,
      currentLevelStartExp,
      nextLevelTargetExp: null,
    };
  }

  const nextLevelTargetExp = STUDENT_LEVEL_CUMULATIVE_EXP[lvlIdx + 1];
  const span = Math.max(1, nextLevelTargetExp - currentLevelStartExp);
  const gainedInLevel = Math.max(0, totalExp - currentLevelStartExp);
  const expPercent = Math.min(
    99,
    Math.max(0, Math.floor((gainedInLevel / span) * 100))
  );

  return {
    level,
    ieltsBand,
    ieltsLabel,
    expPercent,
    totalExp,
    currentLevelStartExp,
    nextLevelTargetExp,
  };
}

