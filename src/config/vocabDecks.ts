import {
  EnglishQuizItem,
  GameConfig,
  QuizDifficultyLevel,
  QuizDurationCategory,
  QuizQuestionDurationByLevel,
} from '../types/game';

export const QUIZ_DECK_SCHEMA_VERSION = 2;

export const DEFAULT_QUESTION_DURATION_BY_LEVEL: QuizQuestionDurationByLevel = {
  easy: 12,
  normal: 15,
  hard: 18,
  omg: 22,
  other: 12,
};

export interface QuizLevelRewardSpec {
  level: QuizDifficultyLevel;
  canonicalDeckName: string;
  label: string;
  base: number; // Trả lời đúng (hạng 4+)
  top1: number; // Nhanh nhất
  top2: number; // Nhanh nhì
  top3: number; // Nhanh ba
}

export const QUIZ_LEVEL_REWARD_MAP: Record<
  QuizDifficultyLevel,
  QuizLevelRewardSpec
> = {
  easy: {
    level: 'easy',
    canonicalDeckName: 'tienganh-de',
    label: 'Dễ',
    base: 5,
    top1: 10,
    top2: 8,
    top3: 7,
  },
  normal: {
    level: 'normal',
    canonicalDeckName: 'tienganh-thuong',
    label: 'Thường',
    base: 7,
    top1: 12,
    top2: 10,
    top3: 9,
  },
  hard: {
    level: 'hard',
    canonicalDeckName: 'tienganh-kho',
    label: 'Khó',
    base: 9,
    top1: 15,
    top2: 13,
    top3: 12,
  },
  omg: {
    level: 'omg',
    canonicalDeckName: 'tienganh-OMG',
    label: 'OMG',
    base: 12,
    top1: 20,
    top2: 18,
    top3: 16,
  },
};

export function normalizeQuizDeckFileName(rawName: string): {
  deckName: string;
  deckKey: string;
  level: QuizDifficultyLevel;
} {
  const stripped = String(rawName || '')
    .trim()
    .replace(/\.txt$/i, '')
    .trim();
  const safeBase = stripped || `De_${Date.now()}`;
  const lower = safeBase.toLowerCase();

  if (lower === 'tienganh-de') {
    return { deckName: 'tienganh-de', deckKey: 'tienganh-de', level: 'easy' };
  }
  if (lower === 'tienganh-thuong') {
    return {
      deckName: 'tienganh-thuong',
      deckKey: 'tienganh-thuong',
      level: 'normal',
    };
  }
  if (lower === 'tienganh-kho') {
    return { deckName: 'tienganh-kho', deckKey: 'tienganh-kho', level: 'hard' };
  }
  if (lower === 'tienganh-omg') {
    return { deckName: 'tienganh-OMG', deckKey: 'tienganh-omg', level: 'omg' };
  }

  let inferredLevel: QuizDifficultyLevel = 'normal';
  if (lower.endsWith('-omg') || lower.includes('omg')) {
    inferredLevel = 'omg';
  } else if (lower.endsWith('-kho') || lower.includes('kho')) {
    inferredLevel = 'hard';
  } else if (lower.endsWith('-de')) {
    inferredLevel = 'easy';
  }

  return {
    deckName: safeBase,
    deckKey: lower,
    level: inferredLevel,
  };
}

export function resolveQuizDifficultyLevel(
  itemOrDeckName?: EnglishQuizItem | string | null
): QuizDifficultyLevel {
  if (!itemOrDeckName) return 'easy';
  if (typeof itemOrDeckName === 'string') {
    return normalizeQuizDeckFileName(itemOrDeckName).level;
  }
  if (
    itemOrDeckName.quizLevel === 'easy' ||
    itemOrDeckName.quizLevel === 'normal' ||
    itemOrDeckName.quizLevel === 'hard' ||
    itemOrDeckName.quizLevel === 'omg'
  ) {
    return itemOrDeckName.quizLevel;
  }
  if (itemOrDeckName.deckName) {
    const lowerDeck = itemOrDeckName.deckName.toLowerCase();
    if (lowerDeck === 'tienganh-omg' || lowerDeck.includes('nang_cao') || lowerDeck.includes('omg')) {
      return 'omg';
    }
    if (lowerDeck === 'tienganh-kho' || lowerDeck.includes('vua_phai') || lowerDeck.includes('-kho')) {
      return 'hard';
    }
    if (lowerDeck === 'tienganh-thuong' || lowerDeck.includes('trung_binh') || lowerDeck.includes('-thuong')) {
      return 'normal';
    }
    if (lowerDeck === 'tienganh-de' || lowerDeck.includes('500') || lowerDeck.includes('-de')) {
      return 'easy';
    }
    return normalizeQuizDeckFileName(itemOrDeckName.deckName).level;
  }
  return 'easy';
}

export function getQuizLevelRewardInfo(
  itemOrDeckName?: EnglishQuizItem | string | null
): QuizLevelRewardSpec {
  const level = resolveQuizDifficultyLevel(itemOrDeckName);
  return QUIZ_LEVEL_REWARD_MAP[level];
}

export function getQuizPointsForRank(
  rankOneBased: number,
  itemOrDeckName?: EnglishQuizItem | string | null
): number {
  const spec = getQuizLevelRewardInfo(itemOrDeckName);
  if (rankOneBased === 1) return spec.top1;
  if (rankOneBased === 2) return spec.top2;
  if (rankOneBased === 3) return spec.top3;
  return spec.base;
}

export function formatQuizLevelRewardBanner(
  itemOrDeckName?: EnglishQuizItem | string | null
): string {
  const spec = getQuizLevelRewardInfo(itemOrDeckName);
  return `Level: ${spec.label}. Đúng +${spec.base}, nhất +${spec.top1}, nhì +${spec.top2}, ba +${spec.top3}.`;
}

export function resolveQuizDurationCategory(
  itemOrDeckName?: EnglishQuizItem | string | null
): QuizDurationCategory {
  if (!itemOrDeckName) return 'easy';
  const rawDeckName =
    typeof itemOrDeckName === 'string'
      ? itemOrDeckName
      : itemOrDeckName.deckName || '';
  const cleanedKey = rawDeckName
    .trim()
    .replace(/\.txt$/i, '')
    .trim()
    .toLowerCase();

  if (cleanedKey) {
    if (cleanedKey === 'tienganh-de') return 'easy';
    if (cleanedKey === 'tienganh-thuong') return 'normal';
    if (cleanedKey === 'tienganh-kho') return 'hard';
    if (cleanedKey === 'tienganh-omg') return 'omg';
    return 'other';
  }

  if (typeof itemOrDeckName !== 'string' && itemOrDeckName.quizLevel) {
    return itemOrDeckName.quizLevel;
  }

  return 'other';
}

export function getQuestionAskDurationSec(
  cfg?: GameConfig | null,
  itemOrDeckName?: EnglishQuizItem | string | null
): number {
  const cat = resolveQuizDurationCategory(itemOrDeckName);
  const byLevel = cfg?.hudLayout?.classBoardQuestionDurationByLevel;
  const legacySec = cfg?.hudLayout?.classBoardQuestionDurationSec || 12;

  let rawSec: number;
  switch (cat) {
    case 'easy':
      rawSec = byLevel?.easy ?? legacySec;
      break;
    case 'normal':
      rawSec = byLevel?.normal ?? DEFAULT_QUESTION_DURATION_BY_LEVEL.normal;
      break;
    case 'hard':
      rawSec = byLevel?.hard ?? DEFAULT_QUESTION_DURATION_BY_LEVEL.hard;
      break;
    case 'omg':
      rawSec = byLevel?.omg ?? DEFAULT_QUESTION_DURATION_BY_LEVEL.omg;
      break;
    case 'other':
    default:
      rawSec = byLevel?.other ?? legacySec;
      break;
  }

  return Math.max(5, Math.min(120, Number(rawSec) || 12));
}

function parseCompactPairs(
  rawLines: string,
  prefix: string,
  deckName: string,
  quizLevel: QuizDifficultyLevel
): EnglishQuizItem[] {
  const out: EnglishQuizItem[] = [];
  const seen = new Set<string>();
  const rows = rawLines.split(/\r?\n/);
  let idx = 0;
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    const chunks = trimmed.split(';');
    for (const chunk of chunks) {
      const c = chunk.trim();
      if (!c) continue;
      const barIdx = c.indexOf('|');
      if (barIdx <= 0) continue;
      const vi = c.slice(0, barIdx).trim();
      const en = c
        .slice(barIdx + 1)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
      if (!vi || !en || en.length < 2) continue;
      const key = `${vi.toLowerCase()}__${en}`;
      if (seen.has(key)) continue;
      seen.add(key);
      idx++;
      out.push({
        id: `${prefix}-${idx}`,
        vi,
        en,
        deckName,
        quizLevel,
      });
    }
  }
  return out;
}

// 1. BỘ 500 TỪ VỰNG TIẾNG ANH CƠ BẢN (Trích ngẫu nhiên 5 câu đầu: Câu 1 -> 5)
const RAW_500_BASIC = `
Quả táo|APPLE;Quả chuối|BANANA;Quả cam|ORANGE;Quả nho|GRAPE;Quả xoài|MANGO;Quả chanh|LEMON;Quả đào|PEACH;Quả lê|PEAR;Quả dưa hấu|WATERMELON;Quả dâu tây|STRAWBERRY
Quả dứa|PINEAPPLE;Quả dừa|COCONUT;Quả đu đủ|PAPAYA;Quả ổi|GUAVA;Quả bơ|AVOCADO;Quả anh đào|CHERRY;Quả mận|PLUM;Quả kiwi|KIWI;Quả sung|FIG;Quả lựu|POMEGRANATE
Con mèo|CAT;Con chó|DOG;Con cá|FISH;Con chim|BIRD;Con voi|ELEPHANT;Con khỉ|MONKEY;Con thỏ|RABBIT;Con hổ|TIGER;Sư tử|LION;Con gấu|BEAR
Con ngựa|HORSE;Con cừu|SHEEP;Con gà|CHICKEN;Con vịt|DUCK;Con rắn|SNAKE;Cá heo|DOLPHIN;Cá mập|SHARK;Con heo|PIG;Con bò|COW;Con dê|GOAT
Con chuột|MOUSE;Con ếch|FROG;Con rùa|TURTLE;Con ong|BEE;Con bướm|BUTTERFLY;Con kiến|ANT;Con nhện|SPIDER;Con cua|CRAB;Con tôm|SHRIMP;Con mực|SQUID
Con hươu|DEER;Con cáo|FOX;Con sói|WOLF;Ngựa vằn|ZEBRA;Hươu cao cổ|GIRAFFE;Con gấu trúc|PANDA;Con lạc đà|CAMEL;Chim cánh cụt|PENGUIN;Con cú|OWL;Chim đại bàng|EAGLE
Ngôi trường|SCHOOL;Giáo viên|TEACHER;Học sinh|STUDENT;Quyển sách|BOOK;Bút chì|PENCIL;Cửa sổ|WINDOW;Bàn học|DESK;Cái ghế|CHAIR;Đồng hồ|CLOCK;Cặp sách|BACKPACK
Cục tẩy|ERASER;Thước kẻ|RULER;Cây bút mực|PEN;Quyển vở|NOTEBOOK;Bảng đen|BLACKBOARD;Viên phấn|CHALK;Cái kéo|SCISSORS;Hồ dán|GLUE;Bản đồ|MAP;Quả địa cầu|GLOBE
Phòng học|CLASSROOM;Thư viện|LIBRARY;Sân chơi|PLAYGROUND;Bài tập|HOMEWORK;Kỳ thi|EXAM;Điểm số|SCORE;Bằng cấp|DEGREE;Môn toán|MATH;Môn lịch sử|HISTORY;Môn âm nhạc|MUSIC
Gia đình|FAMILY;Bố|FATHER;Mẹ|MOTHER;Anh trai|BROTHER;Chị gái|SISTER;Ông nội|GRANDFATHER;Bà nội|GRANDMOTHER;Chú bác|UNCLE;Cô dì|AUNT;Anh em họ|COUSIN
Con trai|SON;Con gái|DAUGHTER;Em bé|BABY;Trẻ em|CHILD;Người lớn|ADULT;Bạn bè|FRIEND;Hàng xóm|NEIGHBOR;Khách mời|GUEST;Con người|HUMAN;Đàn ông|MAN
Phụ nữ|WOMAN;Chàng trai|BOY;Cô gái|GIRL;Chồng|HUSBAND;Vợ|WIFE;Đám cưới|WEDDING;Tình yêu|LOVE;Nụ cười|SMILE;Nước mắt|TEAR;Giấc mơ|DREAM
Ngôi nhà|HOUSE;Căn hộ|APARTMENT;Phòng khách|LIVINGROOM;Phòng ngủ|BEDROOM;Nhà bếp|KITCHEN;Phòng tắm|BATHROOM;Cánh cửa|DOOR;Mái nhà|ROOF;Bức tường|WALL;Sàn nhà|FLOOR
Cầu thang|STAIRS;Ban công|BALCONY;Khu vườn|GARDEN;Hàng rào|FENCE;Chìa khóa|KEY;Ổ khóa|LOCK;Cái giường|BED;Cái gối|PILLOW;Cái chăn|BLANKET;Tấm nệm|MATTRESS
Cái gương|MIRROR;Cái lược|COMB;Bàn chải|BRUSH;Khăn tắm|TOWEL;Xà phòng|SOAP;Dầu gội|SHAMPOO;Kem đánh răng|TOOTHPASTE;Vòi nước|FAUCET;Bồn rửa|SINK;Bồn tắm|BATHTUB
Tủ lạnh|FRIDGE;Máy tính|COMPUTER;Điện thoại|PHONE;Tivi|TELEVISION;Máy giặt|WASHER;Lò vi sóng|MICROWAVE;Bếp nấu|STOVE;Cái quạt|FAN;Đèn bàn|LAMP;Máy ảnh|CAMERA
Đài phát thanh|RADIO;Loa nghe nhạc|SPEAKER;Tai nghe|HEADPHONE;Bàn phím|KEYBOARD;Con chuột máy tính|MOUSEPAD;Màn hình|SCREEN;Cục pin|BATTERY;Dây cáp|CABLE;Ổ cắm|SOCKET;Công tắc|SWITCH
Cái nồi|POT;Cái chảo|PAN;Cái bát|BOWL;Cái đĩa|PLATE;Cái muỗng|SPOON;Cái nĩa|FORK;Con dao|KNIFE;Đôi đũa|CHOPSTICKS;Cái ly|GLASS;Cái cốc|CUP
Chai nước|BOTTLE;Bình trà|TEAPOT;Khăn ăn|NAPKIN;Thùng rác|TRASHCAN;Cây chổi|BROOM;Cây lau nhà|MOP;Cái xô|BUCKET;Cái rổ|BASKET;Cái hộp|BOX;Cái túi|BAG
Nước lọc|WATER;Sữa tươi|MILK;Bánh mì|BREAD;Cơm trắng|RICE;Mì sợi|NOODLE;Phô mai|CHEESE;Bơ sữa|BUTTER;Đường ngọt|SUGAR;Muối ăn|SALT;Hạt tiêu|PEPPER
Mật ong|HONEY;Cà phê|COFFEE;Trà xanh|TEA;Nước ép|JUICE;Bánh ngọt|CAKE;Bánh quy|COOKIE;Kẹo ngọt|CANDY;Sô cô la|CHOCOLATE;Kem lạnh|ICECREAM;Trứng gà|EGG
Thịt bò|BEEF;Thịt heo|PORK;Thịt gà|MEAT;Món súp|SOUP;Rau trộn|SALAD;Bánh pizza|PIZZA;Bánh mì kẹp|SANDWICH;Xúc xích|SAUSAGE;Khoai tây|POTATO;Cà chua|TOMATO
Cà rốt|CARROT;Dưa chuột|CUCUMBER;Hành tây|ONION;Củ tỏi|GARLIC;Bắp cải|CABBAGE;Rau xà lách|LETTUCE;Trái bắp|CORN;Đậu Hà Lan|PEA;Cây nấm|MUSHROOM;Quả bí đỏ|PUMPKIN
Xe đạp|BICYCLE;Xe máy|MOTORBIKE;Xe hơi|CAR;Xe buýt|BUS;Xe tải|TRUCK;Tàu hỏa|TRAIN;Tàu điện ngầm|SUBWAY;Máy bay|PLANE;Trực thăng|HELICOPTER;Con tàu|SHIP
Thuyền nhỏ|BOAT;Tàu ngầm|SUBMARINE;Tên lửa|ROCKET;Xe cứu thương|AMBULANCE;Xe cứu hỏa|FIRETRUCK;Xe cảnh sát|POLICECAR;Xe taxi|TAXI;Sân bay|AIRPORT;Nhà ga|STATION;Bến cảng|HARBOR
Con đường|ROAD;Đường phố|STREET;Cây cầu|BRIDGE;Đường hầm|TUNNEL;Ngã tư|CROSSROAD;Vỉa hè|SIDEWALK;Đèn giao thông|TRAFFICLIGHT;Biển báo|SIGN;Bãi đậu xe|PARKING;Tấm vé|TICKET
Bệnh viện|HOSPITAL;Khách sạn|HOTEL;Nhà hàng|RESTAURANT;Siêu thị|SUPERMARKET;Chợ truyền thống|MARKET;Ngân hàng|BANK;Bưu điện|POSTOFFICE;Bảo tàng|MUSEUM;Rạp chiếu phim|CINEMA;Công viên|PARK
Sở thú|ZOO;Nhà máy|FACTORY;Văn phòng|OFFICE;Cửa hàng|SHOP;Tiệm bánh|BAKERY;Hiệu thuốc|PHARMACY;Nhà thờ|CHURCH;Ngôi chùa|TEMPLE;Lâu đài|CASTLE;Cung điện|PALACE
Bác sĩ|DOCTOR;Y tá|NURSE;Cảnh sát|POLICE;Phi công|PILOT;Nông dân|FARMER;Đầu bếp|CHEF;Ca sĩ|SINGER;Diễn viên|ACTOR;Họa sĩ|PAINTER;Nhà văn|WRITER
Kỹ sư|ENGINEER;Tài xế|DRIVER;Lính cứu hỏa|FIREFIGHTER;Người lính|SOLDIER;Luật sư|LAWYER;Thẩm phán|JUDGE;Nhà khoa học|SCIENTIST;Thợ may|TAILOR;Thợ mộc|CARPENTER;Thợ cắt tóc|BARBER
Mặt trời|SUN;Mặt trăng|MOON;Ngôi sao|STAR;Bầu trời|SKY;Đám mây|CLOUD;Cơn mưa|RAIN;Tuyết trắng|SNOW;Cơn gió|WIND;Cơn bão|STORM;Sấm sét|THUNDER
Cầu vồng|RAINBOW;Sương mù|FOG;Ánh sáng|LIGHT;Bóng tối|SHADOW;Ngọn lửa|FIRE;Khói bụi|SMOKE;Băng đá|ICE;Hơi nước|STEAM;Không khí|AIR;Trái đất|EARTH
Ngọn núi|MOUNTAIN;Ngọn đồi|HILL;Thung lũng|VALLEY;Dòng sông|RIVER;Hồ nước|LAKE;Đại dương|OCEAN;Biển cả|SEA;Bãi biển|BEACH;Hòn đảo|ISLAND;Sa mạc|DESERT
Khu rừng|FOREST;Cây cối|TREE;Bông hoa|FLOWER;Ngọn cỏ|GRASS;Chiếc lá|LEAF;Cành cây|BRANCH;Rễ cây|ROOT;Hạt giống|SEED;Cục đá|STONE;Cát vàng|SAND
Mùa xuân|SPRING;Mùa hè|SUMMER;Mùa thu|AUTUMN;Mùa đông|WINTER;Buổi sáng|MORNING;Buổi trưa|NOON;Buổi chiều|AFTERNOON;Buổi tối|EVENING;Ban đêm|NIGHT;Hôm nay|TODAY
Ngày mai|TOMORROW;Hôm qua|YESTERDAY;Tuần lễ|WEEK;Tháng|MONTH;Năm|YEAR;Thế kỷ|CENTURY;Giờ|HOUR;Phút|MINUTE;Giây|SECOND;Lịch ngày|CALENDAR
Cơ thể|BODY;Cái đầu|HEAD;Khuôn mặt|FACE;Đôi mắt|EYE;Cái mũi|NOSE;Cái miệng|MOUTH;Đôi tai|EAR;Mái tóc|HAIR;Cái cổ|NECK;Đôi vai|SHOULDER
Cánh tay|ARM;Bàn tay|HAND;Ngón tay|FINGER;Cái lưng|BACK;Lồng ngực|CHEST;Cái bụng|STOMACH;Đôi chân|LEG;Đầu gối|KNEE;Bàn chân|FOOT;Trái tim|HEART
Máu đỏ|BLOOD;Xương cốt|BONE;Làn da|SKIN;Cái răng|TOOTH;Cái lưỡi|TONGUE;Bộ não|BRAIN;Giọng nói|VOICE;Hơi thở|BREATH;Sức khỏe|HEALTH;Thuốc uống|MEDICINE
Áo sơ mi|SHIRT;Áo thun|TSHIRT;Áo khoác|JACKET;Áo len|SWEATER;Quần dài|PANTS;Quần jean|JEANS;Quần đùi|SHORTS;Chân váy|SKIRT;Đầm dạ hội|DRESS;Bộ vest|SUIT
Đôi giày|SHOES;Đôi vớ|SOCKS;Đôi dép|SLIPPERS;Đôi bốt|BOOTS;Cái mũ|HAT;Mũ lưỡi trai|CAP;Khăn choàng|SCARF;Găng tay|GLOVES;Thắt lưng|BELT;Cà vạt|TIE
Mắt kính|GLASSES;Đồng hồ đeo tay|WATCH;Chiếc nhẫn|RING;Dây chuyền|NECKLACE;Bông tai|EARRING;Vòng tay|BRACELET;Cây dù|UMBRELLA;Ví tiền|WALLET;Túi xách|HANDBAG;Kim cương|DIAMOND
Màu đỏ|RED;Màu xanh dương|BLUE;Màu xanh lá|GREEN;Màu vàng|YELLOW;Màu cam|ORANGECOLOR;Màu tím|PURPLE;Màu hồng|PINK;Màu đen|BLACK;Màu trắng|WHITE;Màu xám|GRAY
Màu nâu|BROWN;Màu bạc|SILVER;Vàng kim|GOLD;Hình tròn|CIRCLE;Hình vuông|SQUARE;Hình tam giác|TRIANGLE;Hình chữ nhật|RECTANGLE;Đường thẳng|LINE;Điểm chấm|POINT;Hình ngôi sao|STARSHAPE
Bóng đá|FOOTBALL;Bóng rổ|BASKETBALL;Bóng chuyền|VOLLEYBALL;Quần vợt|TENNIS;Cầu lông|BADMINTON;Bơi lội|SWIMMING;Chạy bộ|RUNNING;Đạp xe|CYCLING;Trượt tuyết|SKIING;Đấm bốc|BOXING
Trò chơi|GAME;Đồ chơi|TOY;Búp bê|DOLL;Quả bóng|BALL;Con diều|KITE;Cờ vua|CHESS;Đàn guitar|GUITAR;Đàn piano|PIANO;Cái trống|DRUM;Bài hát|SONG
Bộ phim|MOVIE;Bức tranh|PICTURE;Bức ảnh|PHOTO;Câu chuyện|STORY;Thơ ca|POEM;Báo chí|NEWSPAPER;Tạp chí|MAGAZINE;Lá thư|LETTER;Món quà|GIFT;Bữa tiệc|PARTY
Tiền bạc|MONEY;Giá cả|PRICE;Hóa đơn|BILL;Đồng xu|COIN;Thẻ ngân hàng|CARD;Công việc|JOB;Tiền lương|SALARY;Thành công|SUCCESS;May mắn|LUCK;Hạnh phúc|HAPPINESS
Hòa bình|PEACE;Sự thật|TRUTH;Kiến thức|KNOWLEDGE;Sức mạnh|POWER;Năng lượng|ENERGY;Tương lai|FUTURE;Quá khứ|PAST;Hiện tại|PRESENT;Thế giới|WORLD;Đất nước|COUNTRY
Thành phố|CITY;Ngôi làng|VILLAGE;Quê hương|HOMETOWN;Ngôn ngữ|LANGUAGE;Văn hóa|CULTURE;Tự nhiên|NATURE;Khoa học|SCIENCE;Công nghệ|TECHNOLOGY;Mạng internet|INTERNET;Vũ trụ|UNIVERSE
`;

// 2. BỘ 300 TỪ VỰNG TIẾNG ANH TRUNG BÌNH (300_tu_vung_tieng_anh_trung_binh.txt) - Trích ngẫu nhiên 5 câu tiếp theo: Câu 6 -> 10
const RAW_300_MEDIUM = `
Nông nghiệp|AGRICULTURE;Kiến trúc|ARCHITECTURE;Khí quyển|ATMOSPHERE;Khán giả|AUDIENCE;Lợi ích|BENEFIT;Sinh học|BIOLOGY;Ngân sách|BUDGET;Chiến dịch|CAMPAIGN;Ứng cử viên|CANDIDATE;Sức chứa|CAPACITY
Sự nghiệp|CAREER;Danh mục|CATEGORY;Thử thách|CHALLENGE;Tính cách|CHARACTER;Hóa học|CHEMISTRY;Hoàn cảnh|CIRCUMSTANCE;Công dân|CITIZEN;Khí hậu|CLIMATE;Đồng nghiệp|COLLEAGUE;Cộng đồng|COMMUNITY
So sánh|COMPARISON;Cuộc thi|COMPETITION;Phàn nàn|COMPLAINT;Kết luận|CONCLUSION;Điều kiện|CONDITION;Hội nghị|CONFERENCE;Sự tự tin|CONFIDENCE;Xung đột|CONFLICT;Kết nối|CONNECTION;Hậu quả|CONSEQUENCE
Bảo tồn|CONSERVATION;Xây dựng|CONSTRUCTION;Người tiêu dùng|CONSUMER;Lục địa|CONTINENT;Đóng góp|CONTRIBUTION;Cuộc trò chuyện|CONVERSATION;Hợp tác|COOPERATION;Tập đoàn|CORPORATION;Sự can đảm|COURAGE;Sáng tạo|CREATIVITY
Sinh vật|CREATURE;Tội phạm|CRIMINAL;Khủng hoảng|CRISIS;Phê bình|CRITICISM;Khách hàng|CUSTOMER;Phong tục|CUSTOM;Thiệt hại|DAMAGE;Thập kỷ|DECADE;Quyết định|DECISION;Trang trí|DECORATION
Phòng thủ|DEFENSE;Định nghĩa|DEFINITION;Giao hàng|DELIVERY;Nhu cầu|DEMAND;Phòng ban|DEPARTMENT;Mô tả|DESCRIPTION;Điểm đến|DESTINATION;Phát triển|DEVELOPMENT;Thiết bị|DEVICE;Từ điển|DICTIONARY
Sự khác biệt|DIFFERENCE;Khó khăn|DIFFICULTY;Hướng đi|DIRECTION;Thảm họa|DISASTER;Kỷ luật|DISCIPLINE;Khám phá|DISCOVERY;Thảo luận|DISCUSSION;Bệnh tật|DISEASE;Khoảng cách|DISTANCE;Phân phối|DISTRIBUTION
Tài liệu|DOCUMENT;Quyên góp|DONATION;Kinh tế|ECONOMY;Giáo dục|EDUCATION;Hiệu quả|EFFICIENCY;Nỗ lực|EFFORT;Bầu cử|ELECTION;Điện năng|ELECTRICITY;Yếu tố|ELEMENT;Khẩn cấp|EMERGENCY
Cảm xúc|EMOTION;Nhân viên|EMPLOYEE;Nhà tuyển dụng|EMPLOYER;Khuyến khích|ENCOURAGEMENT;Môi trường|ENVIRONMENT;Thiết bị máy|EQUIPMENT;Bình đẳng|EQUALITY;Thiết lập|ESTABLISHMENT;Đánh giá|EVALUATION;Bằng chứng|EVIDENCE
Tiến hóa|EVOLUTION;Kiểm tra|EXAMINATION;Ví dụ|EXAMPLE;Xuất sắc|EXCELLENCE;Trao đổi|EXCHANGE;Hào hứng|EXCITEMENT;Triển lãm|EXHIBITION;Sự tồn tại|EXISTENCE;Mở rộng|EXPANSION;Kỳ vọng|EXPECTATION
Kinh nghiệm|EXPERIENCE;Thí nghiệm|EXPERIMENT;Chuyên gia|EXPERT;Giải thích|EXPLANATION;Khám phá mới|EXPLORATION;Biểu cảm|EXPRESSION;Cơ sở vật chất|FACILITY;Yếu tố chính|FACTOR;Thất bại|FAILURE;Sự nổi tiếng|FAME
Thời trang|FASHION;Đặc điểm|FEATURE;Phản hồi|FEEDBACK;Lễ hội|FESTIVAL;Tài chính|FINANCE;Linh hoạt|FLEXIBILITY;Chuyến bay|FLIGHT;Tập trung|FOCUS;Nền tảng|FOUNDATION;Tự do|FREEDOM
Tần suất|FREQUENCY;Tình bạn|FRIENDSHIP;Chức năng|FUNCTION;Đồ nội thất|FURNITURE;Thế hệ|GENERATION;Địa lý|GEOGRAPHY;Chính phủ|GOVERNMENT;Tốt nghiệp|GRADUATION;Biết ơn|GRATITUDE;Trọng lực|GRAVITY
Bảo đảm|GUARANTEE;Hướng dẫn|GUIDANCE;Thói quen|HABIT;Phần cứng|HARDWARE;Mùa gặt|HARVEST;Trụ sở|HEADQUARTERS;Di sản|HERITAGE;Cao tốc|HIGHWAY;Chân trời|HORIZON;Lòng hiếu khách|HOSPITALITY
Hộ gia đình|HOUSEHOLD;Nhân loại|HUMANITY;Bão lớn|HURRICANE;Danh tính|IDENTITY;Trí tưởng tượng|IMAGINATION;Nhập cư|IMMIGRATION;Tác động|IMPACT;Tầm quan trọng|IMPORTANCE;Ấn tượng|IMPRESSION;Cải thiện|IMPROVEMENT
Thu nhập|INCOME;Độc lập|INDEPENDENCE;Cá nhân|INDIVIDUAL;Công nghiệp|INDUSTRY;Nhiễm trùng|INFECTION;Lạm phát|INFLATION;Ảnh hưởng|INFLUENCE;Thông tin|INFORMATION;Thành phần|INGREDIENT;Sáng kiến|INITIATIVE
Chấn thương|INJURY;Đổi mới|INNOVATION;Côn trùng|INSECT;Thanh tra|INSPECTION;Cảm hứng|INSPIRATION;Học viện|INSTITUTION;Chỉ dẫn|INSTRUCTION;Nhạc cụ|INSTRUMENT;Bảo hiểm|INSURANCE;Trí thông minh|INTELLIGENCE
Ý định|INTENTION;Tương tác|INTERACTION;Lãi suất|INTEREST;Phỏng vấn|INTERVIEW;Giới thiệu|INTRODUCTION;Phát minh|INVENTION;Điều tra|INVESTIGATION;Đầu tư|INVESTMENT;Lời mời|INVITATION;Hành trình|JOURNEY
Tư pháp|JUSTICE;Bàn phím số|KEYPAD;Nhà trẻ|KINDERGARTEN;Vương quốc|KINGDOM;Phòng thí nghiệm|LABORATORY;Phong cảnh|LANDSCAPE;Văn học|LITERATURE;Vị trí|LOCATION;Hậu cần|LOGISTICS;Bảo trì|MAINTENANCE
Đa số|MAJORITY;Quản lý|MANAGEMENT;Sản xuất|MANUFACTURING;Tiếp thị|MARKETING;Hôn nhân|MARRIAGE;Vật liệu|MATERIAL;Toán học|MATHEMATICS;Đo lường|MEASUREMENT;Cơ khí|MECHANISM;Truyền thông|MEDIA
Thành viên|MEMBERSHIP;Trí nhớ|MEMORY;Tin nhắn|MESSAGE;Phương pháp|METHOD;ểu số|MINORITY;Nhiệm vụ|MISSION;Hỗn hợp|MIXTURE;Hiện đại|MODERNITY;Khoảnh khắc|MOMENT;Đài tưởng niệm|MONUMENT
Động lực|MOTIVATION;Chuyển động|MOVEMENT;Bí ẩn|MYSTERY;Quốc tịch|NATIONALITY;Đàm phán|NEGOTIATION;Mạng lưới|NETWORK;Dinh dưỡng|NUTRITION;Nghĩa vụ|OBLIGATION;Quan sát|OBSERVATION;Dịp lễ|OCCASION
Nghề nghiệp|OCCUPATION;Cơ hội|OPPORTUNITY;Đối lập|OPPOSITION;Tổ chức|ORGANIZATION;Nguồn gốc|ORIGIN;Kết quả|OUTCOME;Sở hữu|OWNERSHIP;Gói hàng|PACKAGE;Đoạn văn|PARAGRAPH;Quốc hội|PARLIAMENT
Tham gia|PARTICIPATION;Đối tác|PARTNER;Hành khách|PASSENGER;Đam mê|PASSION;Hộ chiếu|PASSPORT;Sự kiên nhẫn|PATIENCE;Bệnh nhân|PATIENT;Khuôn mẫu|PATTERN;Thanh toán|PAYMENT;Hiệu suất|PERFORMANCE
Sự cho phép|PERMISSION;Nhân cách|PERSONALITY;Quan điểm|PERSPECTIVE;Hiện tượng|PHENOMENON;Triết học|PHILOSOPHY;Nhiếp ảnh|PHOTOGRAPHY;Vật lý|PHYSICS;Ô nhiễm|POLLUTION;Dân số|POPULATION;Khả năng|POSSIBILITY
Nghèo đói|POVERTY;Thực hành|PRACTICE;Dự đoán|PREDICTION;Sở thích|PREFERENCE;Chuẩn bị|PREPARATION;Áp lực|PRESSURE;Ngăn ngừa|PREVENTION;Nguyên tắc|PRINCIPLE;Ưu tiên|PRIORITY;Quy trình|PROCEDURE
Chuyên nghiệp|PROFESSION;Giáo sư|PROFESSOR;Lợi nhuận|PROFIT;Chương trình|PROGRAM;Tiến bộ|PROGRESS;Dự án|PROJECT;Lời hứa|PROMISE;Thăng chức|PROMOTION;Tài sản|PROPERTY;Đề xuất|PROPOSAL
Bảo vệ|PROTECTION;Tâm lý học|PSYCHOLOGY;Xuất bản|PUBLICATION;Hình phạt|PUNISHMENT;Mục đích|PURPOSE;Trình độ|QUALIFICATION;Chất lượng|QUALITY;Số lượng|QUANTITY;Câu hỏi|QUESTION;Phản ứng|REACTION
Thực tế|REALITY;Nhận thức|RECOGNITION;Khuyến nghị|RECOMMENDATION;Phục hồi|RECOVERY;Giảm thiểu|REDUCTION;Tài liệu tham khảo|REFERENCE;Phản chiếu|REFLECTION;Khu vực|REGION;Đăng ký|REGISTRATION;Quy định|REGULATION
Mối quan hệ|RELATIONSHIP;Tôn giáo|RELIGION;Danh tiếng|REPUTATION;Yêu cầu|REQUIREMENT;Nghiên cứu|RESEARCH;Đặt chỗ|RESERVATION;Cư dân|RESIDENT;Tài nguyên|RESOURCE;Trách nhiệm|RESPONSIBILITY;Cách mạng|REVOLUTION
`;

// 3. BỘ 200 TỪ VỰNG TIẾNG ANH KHÓ VỪA PHẢI (200_tu_vung_tieng_anh_kho_vua_phai.txt) - Trích ngẫu nhiên 3 câu tiếp theo: Câu 11 -> 13
const RAW_200_MODERATELY_HARD = `
Bỏ rơi|ABANDON;Tuyệt đối|ABSOLUTE;Trừu tượng|ABSTRACT;Học thuật|ACADEMIC;Chấp nhận được|ACCEPTABLE;Đồng hành|ACCOMPANY;Hoàn thành|ACCOMPLISH;Chính xác|ACCURATE;Cáo buộc|ACCUSE;Đạt được|ACHIEVE
Thừa nhận|ACKNOWLEDGE;Thu nhận|ACQUIRE;Thích nghi|ADAPT;Đầy đủ|ADEQUATE;Điều chỉnh|ADJUST;Quản trị|ADMINISTRATION;Khâm phục|ADMIRE;Thừa nhận lỗi|ADMIT;Nhận nuôi|ADOPT;Tiến bộ vượt|ADVANCE
Thuận lợi|ADVANTAGE;Phiêu lưu|ADVENTURE;Quảng cáo|ADVERTISEMENT;Người ủng hộ|ADVOCATE;Thẩm mỹ|AESTHETIC;Tình cảm|AFFECTION;Đủ khả năng|AFFORD;Hung hăng|AGGRESSIVE;Liên minh|ALLIANCE;Phân bổ|ALLOCATE
Thay thế|ALTERNATIVE;Nghiệp dư|AMATEUR;Đại sứ|AMBASSADOR;Tham vọng|AMBITION;Sửa đổi|AMENDMENT;Phân tích|ANALYSIS;Tổ tiên|ANCESTOR;Kỷ niệm năm|ANNIVERSARY;Thông báo|ANNOUNCEMENT;Hàng năm|ANNUAL
Dự đoán trước|ANTICIPATE;Lo âu|ANXIETY;Xin lỗi|APOLOGIZE;Rõ ràng|APPARENT;Kháng cáo|APPEAL;Ngoại hình|APPEARANCE;Cảm kích|APPRECIATE;Tiếp cận|APPROACH;Thích hợp|APPROPRIATE;Phê duyệt|APPROVAL
Xấp xỉ|APPROXIMATELY;Kiến trúc sư|ARCHITECT;Tranh luận|ARGUMENT;Bố trí|ARRANGEMENT;Nhân tạo|ARTIFICIAL;Khía cạnh|ASPECT;Tập hợp|ASSEMBLE;Đánh giá định|ASSESSMENT;Tài sản quý|ASSET;Phân công|ASSIGNMENT
Hỗ trợ|ASSISTANCE;Liên kết|ASSOCIATION;Giả định|ASSUMPTION;Đảm bảo chắc|ASSURANCE;Đính kèm|ATTACHMENT;Đạt tới|ATTAIN;Thái độ|ATTITUDE;Hấp dẫn|ATTRACTIVE;Thuộc tính|ATTRIBUTE;Đấu giá|AUCTION
Xác thực|AUTHENTIC;Thẩm quyền|AUTHORITY;Tự động|AUTOMATIC;Sẵn có|AVAILABLE;Nhận thức rõ|AWARENESS;Nền tảng sau|BACKGROUND;Phá sản|BANKRUPT;Rào cản|BARRIER;Cơ bản|BASIC;Hành vi|BEHAVIOR
Có lợi|BENEFICIAL;Định kiến|BIAS;Đa dạng sinh học|BIODIVERSITY;Đột phá|BREAKTHROUGH;Rực rỡ|BRILLIANT;Phát sóng|BROADCAST;Quan liêu|BUREAUCRACY;Tính toán|CALCULATE;Năng lực|CAPABILITY;Chủ nghĩa tư bản|CAPITALISM
Thảm khốc|CATASTROPHE;Kỷ niệm lễ|CELEBRATION;Giấy chứng nhận|CERTIFICATE;Đặc tính|CHARACTERISTIC;Từ thiện|CHARITY;Mãn tính|CHRONIC;Lưu thông|CIRCULATION;Văn minh|CIVILIZATION;Làm rõ|CLARIFY;Phân loại|CLASSIFICATION
Cùng tồn tại|COEXIST;Nhận thức não|COGNITIVE;Sụp đổ|COLLAPSE;Đồng sự|COLLABORATION;Bộ sưu tập|COLLECTION;Thuộc địa|COLONY;Kết hợp|COMBINATION;Thoải mái|COMFORTABLE;Chỉ huy|COMMANDER;Thương mại|COMMERCIAL
Hoa hồng phí|COMMISSION;Cam kết|COMMITMENT;Ủy ban|COMMITTEE;Hàng hóa|COMMODITY;Giao tiếp|COMMUNICATION;Đồng hành cùng|COMPANION;Có thể so sánh|COMPARABLE;Lòng trắc ẩn|COMPASSION;Bồi thường|COMPENSATION;Năng lực giỏi|COMPETENCE
Cạnh tranh|COMPETITIVE;Biên soạn|COMPILE;Bổ sung|COMPLEMENT;Phức tạp|COMPLEX;Tuân thủ|COMPLIANCE;Phức tạp hóa|COMPLICATE;Thành phần cấu tạo|COMPONENT;Toàn diện|COMPREHENSIVE;Thỏa hiệp|COMPROMISE;Bắt buộc|COMPULSORY
Tập trung cao|CONCENTRATE;Khái niệm|CONCEPT;Quan tâm|CONCERN;Cụ thể|CONCRETE;Lên án|CONDEMN;Tiến hành|CONDUCT;Thú nhận|CONFESS;Bảo mật|CONFIDENTIAL;Cấu hình|CONFIGURATION;Xác nhận|CONFIRMATION
Đối đầu|CONFRONT;Nhầm lẫn|CONFUSION;Quốc hội Mỹ|CONGRESS;Lương tâm|CONSCIENCE;Có ý thức|CONSCIOUS;Đồng thuận|CONSENSUS;Đáng kể|CONSIDERABLE;Nhất quán|CONSISTENT;Âm mưu|CONSPIRACY;Hiến pháp|CONSTITUTION
Ràng buộc|CONSTRAINT;Tham khảo ý|CONSULTATION;Tiêu thụ|CONSUMPTION;Đương đại|CONTEMPORARY;Tranh cãi|CONTROVERSY;Thuận tiện|CONVENIENT;Quy ước|CONVENTION;Thuyết phục|CONVINCE;Bản quyền|COPYRIGHT;Tương quan|CORRELATION
Thư từ|CORRESPONDENCE;Tham nhũng|CORRUPTION;Hội đồng|COUNCIL;Đối tác ngang|COUNTERPART;Vô số|COUNTLESS;Đảo chính|COUP;Độ phủ|COVERAGE;Tín dụng|CREDIT;Tiêu chí|CRITERIA;Quan trọng|CRITICAL
Mùa vụ|CROP;Then chốt|CRUCIAL;Nuôi dưỡng|CULTIVATE;Tiền tệ|CURRENCY;Chương trình học|CURRICULUM;Tranh luận lớn|DEBATE;Nợ nần|DEBT;Lừa dối|DECEIVE;Tuyên bố|DECLARATION;Suy giảm|DECLINE
Cống hiến|DEDICATION;Mặc định|DEFAULT;Thiếu hụt|DEFICIENCY;Thâm hụt|DEFICIT;Cố ý|DELIBERATE;Mong manh|DELICATE;Dân chủ|DEMOCRACY;Biểu tình|DEMONSTRATION;Phủ nhận|DENIAL;Mật độ|DENSITY
Khởi hành|DEPARTURE;Phụ thuộc|DEPENDENT;Trầm cảm|DEPRESSION;Tước đoạt|DEPRIVE;Hậu duệ|DESCENDANT;Xứng đáng|DESERVE;Chỉ định|DESIGNATE;Tuyệt vọng|DESPERATE;Phá hủy|DESTRUCTION;Xác định rõ|DETERMINE
`;

// 4. BỘ 200 TỪ VỰNG TIẾNG ANH KHÓ NÂNG CAO (200_tu_vung_tieng_anh_kho_nang_cao.txt) - Trích ngẫu nhiên 2 câu cuối: Câu 14 -> 15
const RAW_200_ADVANCED_HARD = `
Bãi bỏ|ABOLISH;Đột ngột|ABRUPT;Vô lý|ABSURD;Dồi dào|ABUNDANT;Tăng tốc|ACCELERATE;Chỗ ở|ACCOMMODATION;Trách nhiệm giải trình|ACCOUNTABILITY;Tích lũy|ACCUMULATE;Thuận lợi thế|ADVANTAGEOUS;Nghịch cảnh|ADVERSITY
Vận động ủng hộ|ADVOCACY;Liên kết hội|AFFILIATION;Làm trầm trọng|AGGRAVATE;Linh hoạt nhanh|AGILITY;Xa lánh|ALIENATE;Cáo buộc chưa chứng minh|ALLEGATION;Làm dịu bớt|ALLEVIATE;Mơ hồ|AMBIGUOUS;Mâu thuẫn cảm xúc|AMBIVALENT;Cải thiện tốt hơn|AMELIORATE
Sự tương đồng|ANALOGY;Vô chính phủ|ANARCHY;Dị thường|ANOMALY;Đối kháng|ANTAGONISM;Nhân류 học|ANTHROPOLOGY;Thờ ơ|APATHY;Đỉnh cao|APEX;Xoa dịu|APPEASE;Đánh giá thẩm định|APPRAISAL;Tùy tiện|ARBITRARY
Khảo cổ học|ARCHAEOLOGY;Cổ xưa|ARCHAIC;Gian khổ|ARDUOUS;Diễn đạt lưu loát|ARTICULATE;Khát vọng lớn|ASPIRATION;Ám sát|ASSASSINATION;Đồng hóa|ASSIMILATION;Đáng kinh ngạc|ASTONISHING;Tàn bạo|ATROCITY;Làm suy yếu|ATTENUATE
Táo bạo|AUDACIOUS;Tăng cường thêm|AUGMENT;Khắc khổ|AUSTERE;Đích thực|AUTHENTICITY;Độc đoán|AUTHORITARIAN;Quyền tự trị|AUTONOMY;Ác cảm|AVERSION;Trục xoay|AXIS;Làm bối rối|BAFFLE;Hiếu chiến|BELLIGERENT
Nhân từ|BENEVOLENT;Hoang mang|BEWILDER;Tài liệu thư mục|BIBLIOGRAPHY;Song phương|BILATERAL;Sinh quyển|BIOSPHERE;Kỳ quái|BIZARRE;Trắng trợn|BLATANT;Cốt lõi|BOLSTER;Ranh giới|BOUNDARY;Vi phạm|BREACH
Ngắn gọn|BREVITY;Tàn nhẫn|BRUTALITY;Nảy chồi|BURGEON;Ngụy trang|CAMOUFLAGE;Thẳng thắn|CANDID;Đầu hàng|CAPITULATE;Thất thường|CAPRICIOUS;Chất xúc tác|CATALYST;Thảm họa lớn|CATASTROPHIC;Kiểm duyệt|CENSORSHIP
Ly tâm|CENTRIFUGAL;Sự chắc chắn|CERTAINTY;Hỗn loạn|CHAOS;Sức hút lãnh đạo|CHARISMA;Lừa bịp|CHARLATAN;Vực thẳm|CHASM;Chủ nghĩa sô vanh|CHAUVINISM;Trình tự thời gian|CHRONOLOGY;Đi đường vòng|CIRCUMVENT;Bí mật|CLANDESTINE
Liên minh đảng|COALITION;Ép buộc|COERCION;Mạch lạc|COHERENT;Trùng hợp|COINCIDENCE;Tài sản thế chấp|COLLATERAL;Thông tục|COLLOQUIAL;Thông đồng|COLLUSION;Khổng lồ|COLOSSAL;Tưởng niệm|COMMEMORATE;Tương xứng|COMMENSURATE
Bình luận chuyên sâu|COMMENTARY;Thương mại hóa|COMMERCIALIZATION;Đồng cảm|COMMISERATE;Tự mãn|COMPLACENT;Bổ trợ nhau|COMPLEMENTARY;Đồng lõa|COMPLICITY;Thấu hiểu|COMPREHENSION;Bắt buộc ép|COMPULSION;Che giấu|CONCEAL;Thừa nhận thua|CONCEDE
Hòa giải|CONCILIATORY;Ngắn gọn súc tích|CONCISE;Đồng thời|CONCURRENT;Kẻ cả bề trên|CONDESCENDING;Thuận lợi cho|CONDUCIVE;Tịch thu|CONFISCATE;Đám cháy lớn|CONFLAGRATION;Hợp lưu|CONFLUENCE;Tuân theo chuẩn|CONFORMITY;Bẩm sinh|CONGENITAL
Tập đoàn đa ngành|CONGLOMERATE;Phỏng đoán|CONJECTURE;Chuyên gia sành sỏi|CONNOISSEUR;Tận tâm|CONSCIENTIOUS;Liên tiếp|CONSECUTIVE;Hợp nhất|CONSOLIDATE;Dễ thấy|CONSPICUOUS;Hoảng sợ|CONSTERNATION;Cấu thành|CONSTITUTE;Cưỡng chế|CONSTRAIN
Truyền nhiễm|CONTAGIOUS;Làm ô nhiễm|CONTAMINATE;Suy ngẫm|CONTEMPLATE;Khinh thường|CONTEMPT;Tranh chấp|CONTENTION;Ngữ cảnh|CONTEXTUAL;Liền kề|CONTIGUOUS;Dự phòng|CONTINGENCY;Mâu thuẫn|CONTRADICTION;Ăn năn|CONTRITE
Câu đố hóc búa|CONUNDRUM;Hội tụ|CONVERGENCE;Chuyển đổi|CONVERSION;Rắc rối phức tạp|CONVOLUTED;Phong phú|COPIOUS;Chứng thực|CORROBORATE;Ăn mòn|CORROSIVE;Đa văn hóa|COSMOPOLITAN;Phản tác dụng|COUNTERPRODUCTIVE;Làm giả|COUNTERFEiting
Thèm muốn|COVET;Đáng tin cậy|CREDIBILITY;Cả tin|CREDULOUS;Đỉnh điểm|CRESCENDO;Tiêu chuẩn|CRITERION;Khó hiểu|CRYPTIC;Đỉnh cao nhất|CULMINATION;Đáng trách|CULPABLE;Cồng kềnh|CUMBERSOME;Tích lũy dần|CUMULATIVE
Lòng tham|CUPIDITY;Hời hợt|CURSORY;Cắt giảm|CURTAIL;Hoài nghi|CYNICAL;Sự khan hiếm|DEARTH;Sự suy đồi|DECADENCE;Làm suy nhược|DEBILITATE;Vạch trần|DEBUNK;Khuôn phép|DECORUM;Phỉ báng|DEFAMATION
Sự tôn kính|DEFERENCE;Chắc chắn rõ|DEFINITIVE;Suy thoái|DEGENERATION;Làm suy giảm|DEGRADATION;Có hại|DELETERIOUS;Phác thảo|DELINEATE;Ảo tưởng|DELUSION;Kẻ mị dân|DEMAGOGUE;Thái độ cử chỉ|DEMEANOR;Sụp đổ hoàn toàn|DEMISE
Nhân khẩu học|DEMOGRAPHIC;Làm nản lòng|DEMORALIZE;Khiêm nhường|DEMURE;Gièm pha|DENIGRATE;Biểu thị|DENOTE;Lên án mạnh|DENOUNCE;Cạn kiệt|DEPLETION;Đáng tiếc|DEPLORABLE;Triển khai|DEPLOYMENT;Trục xuất|DEPORTATION
Phế truất|DEPOSE;Đồi trụy|DEPRAVITY;Khấu hao|DEPRECIATION;Bỏ hoang|DERELICT;Chế giễu|DERISION;Phái sinh|DERIVATIVE;Xúc phạm|DEROGATORY;Làm khô cạn|DESICCATE;Hoang vắng|DESOLATE;Chuyên quyền|DESPOTIC
Thiếu thốn|DESTITUTE;Răn đe|DETERRENCE;Có hại lớn|DETRIMENTAL;Lệch chuẩn|DEVIATION;Khéo léo|DEXTERITY;Chẩn đoán|DIAGNOSIS;Biện chứng|DIALECTIC;Phân đôi|DICHOTOMY;Độc tài|DICTATORSHIP;Mang tính giáo huấn|DIDACTIC
`;

export const VOCAB_500_BASIC_ITEMS: EnglishQuizItem[] = parseCompactPairs(
  RAW_500_BASIC,
  'v500',
  'tienganh-de',
  'easy'
);

export const VOCAB_300_MEDIUM_ITEMS: EnglishQuizItem[] = parseCompactPairs(
  RAW_300_MEDIUM,
  'v300tb',
  'tienganh-thuong',
  'normal'
);

export const VOCAB_200_MODERATELY_HARD_ITEMS: EnglishQuizItem[] =
  parseCompactPairs(
    RAW_200_MODERATELY_HARD,
    'v200kvp',
    'tienganh-kho',
    'hard'
  );

export const VOCAB_200_ADVANCED_HARD_ITEMS: EnglishQuizItem[] =
  parseCompactPairs(
    RAW_200_ADVANCED_HARD,
    'v200knc',
    'tienganh-OMG',
    'omg'
  );

export const BUILT_IN_TIERED_QUIZ_DECKS: Array<{
  id: string;
  name: string;
  level: QuizDifficultyLevel;
  questions: EnglishQuizItem[];
}> = [
  {
    id: 'deck-tienganh-de',
    name: 'tienganh-de',
    level: 'easy',
    questions: VOCAB_500_BASIC_ITEMS,
  },
  {
    id: 'deck-tienganh-thuong',
    name: 'tienganh-thuong',
    level: 'normal',
    questions: VOCAB_300_MEDIUM_ITEMS,
  },
  {
    id: 'deck-tienganh-kho',
    name: 'tienganh-kho',
    level: 'hard',
    questions: VOCAB_200_MODERATELY_HARD_ITEMS,
  },
  {
    id: 'deck-tienganh-omg',
    name: 'tienganh-OMG',
    level: 'omg',
    questions: VOCAB_200_ADVANCED_HARD_ITEMS,
  },
];

/**
 * Chuẩn hóa danh sách bộ đề theo quy ước 4 level:
 * tienganh-de / tienganh-thuong / tienganh-kho / tienganh-OMG.
 * Nếu forceReset = true hoặc danh sách đang trống -> đặt lại sạch đúng 4 bộ đề chuẩn.
 * Nếu đã ở schema mới -> tôn trọng nguyên vẹn các bộ đề hiện có (kể cả khi user bấm ✕ xóa hoặc thêm đề riêng).
 */
export function ensureTieredQuizDecksLoaded(
  existingDecks?: Array<{
    id: string;
    name: string;
    level?: QuizDifficultyLevel;
    questions: EnglishQuizItem[];
  }>,
  forceReset = false
): Array<{
  id: string;
  name: string;
  level?: QuizDifficultyLevel;
  questions: EnglishQuizItem[];
}> {
  if (forceReset || !Array.isArray(existingDecks) || existingDecks.length === 0) {
    return BUILT_IN_TIERED_QUIZ_DECKS.map((d) => ({
      ...d,
      questions: [...d.questions],
    }));
  }

  const validDecks = existingDecks
    .filter((d) => d && Array.isArray(d.questions) && d.questions.length > 0)
    .map((d) => {
      const norm = normalizeQuizDeckFileName(d.name);
      const resolvedLevel = d.level || norm.level;
      return {
        ...d,
        name: norm.deckName,
        level: resolvedLevel,
        questions: d.questions.map((q) => ({
          ...q,
          deckName: norm.deckName,
          quizLevel: q.quizLevel || resolvedLevel,
        })),
      };
    });

  if (validDecks.length === 0) {
    return BUILT_IN_TIERED_QUIZ_DECKS.map((d) => ({
      ...d,
      questions: [...d.questions],
    }));
  }

  return validDecks;
}

function sampleRandomQuestions(
  pool: EnglishQuizItem[],
  count: number,
  usedEnLower: Set<string>,
  deckLabel: string,
  quizLevel: QuizDifficultyLevel
): EnglishQuizItem[] {
  const available = pool.filter(
    (q) => q && q.en && !usedEnLower.has(q.en.trim().toLowerCase())
  );
  const source = available.length >= count ? available : pool;
  const copy = [...source];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }

  const picked: EnglishQuizItem[] = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const item = copy[i % copy.length];
    usedEnLower.add(item.en.trim().toLowerCase());
    picked.push({
      ...item,
      deckName: deckLabel,
      quizLevel,
    });
  }
  return picked;
}

/**
 * Xây dựng bộ đề thi 15 phút (10 câu) theo phân bố độ khó tăng dần:
 * - Câu 1..6 (6 câu đầu): Level Dễ (tienganh-de)
 * - Câu 7..9 (3 câu tiếp theo): Level Thường (tienganh-thuong)
 * - Câu 10 (1 câu cuối): Level Khó (tienganh-kho)
 */
export function build15MinuteTieredRoundQuestions(
  cfg?: GameConfig,
  excludeEnLower?: string
): EnglishQuizItem[] {
  const decks = ensureTieredQuizDecksLoaded(cfg?.quizDecks);

  const deckEasy = decks.find(
    (d) =>
      d.id === 'deck-tienganh-de' ||
      normalizeQuizDeckFileName(d.name).deckKey === 'tienganh-de'
  );
  const poolEasy =
    deckEasy && deckEasy.questions.length >= 1
      ? deckEasy.questions
      : VOCAB_500_BASIC_ITEMS;

  const deckNormal = decks.find(
    (d) =>
      d.id === 'deck-tienganh-thuong' ||
      normalizeQuizDeckFileName(d.name).deckKey === 'tienganh-thuong'
  );
  const poolNormal =
    deckNormal && deckNormal.questions.length >= 1
      ? deckNormal.questions
      : VOCAB_300_MEDIUM_ITEMS;

  const deckHard = decks.find(
    (d) =>
      d.id === 'deck-tienganh-kho' ||
      normalizeQuizDeckFileName(d.name).deckKey === 'tienganh-kho'
  );
  const poolHard =
    deckHard && deckHard.questions.length >= 1
      ? deckHard.questions
      : VOCAB_200_MODERATELY_HARD_ITEMS;

  const usedEnLower = new Set<string>();
  if (excludeEnLower) {
    usedEnLower.add(excludeEnLower.trim().toLowerCase());
  }

  const tier1 = sampleRandomQuestions(
    poolEasy,
    6,
    usedEnLower,
    deckEasy?.name || 'tienganh-de',
    'easy'
  );
  const tier2 = sampleRandomQuestions(
    poolNormal,
    3,
    usedEnLower,
    deckNormal?.name || 'tienganh-thuong',
    'normal'
  );
  const tier3 = sampleRandomQuestions(
    poolHard,
    1,
    usedEnLower,
    deckHard?.name || 'tienganh-kho',
    'hard'
  );

  const combined = [...tier1, ...tier2, ...tier3];
  const r1 = Math.max(0, Math.min(100, cfg?.luckyStarRatio1 ?? 15));
  const r2 = Math.max(0, Math.min(100, cfg?.luckyStarRatio2 ?? 10));
  const r3 = Math.max(0, Math.min(100, cfg?.luckyStarRatio3 ?? 5));
  const now = Date.now();

  return combined.map((item, idx) => {
    let stars: 0 | 1 | 2 | 3 = 0;
    if (typeof item.luckyStars === 'number') {
      stars = item.luckyStars;
    } else {
      const rnd = Math.random() * 100;
      if (rnd < r3) {
        stars = 3;
      } else if (rnd < r3 + r2) {
        stars = 2;
      } else if (rnd < r3 + r2 + r1) {
        stars = 1;
      }
    }
    return {
      ...item,
      id: `en-r10-${now}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
      luckyStars: stars,
    };
  });
}
