export type WindLeafTheme = 'mixed' | 'autumn' | 'green';
export type WindDirectionMode = 'left_to_right' | 'right_to_left' | 'alternate';

export interface WindBreezeSettings {
  enabled: boolean;
  intervalSec: number;
  durationSec: number;
  leafCount: number;
  leafTheme: WindLeafTheme;
  autumnRatio: number; // 0..100 (% lá thu khi chọn 'mixed')
  leafScale: number; // 0.4..2.5
  speed: number; // 0.4..2.5
  opacity: number; // 0.2..1.0
  direction: WindDirectionMode;
  showStreaks: boolean;
}

export interface WindLeafPalette {
  kind: 'autumn' | 'green';
  bladeTop: string;
  bladeBottom: string;
  vein: string;
  stem: string;
}

export interface WindLeafParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  size: number;
  shape: 'ovate' | 'maple';
  palette: WindLeafPalette;
  rot: number;
  vRot: number;
  rockAmp: number;
  rockFreq: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  flutterFreq: number;
  flutterPhase: number;
  gustPhase: number;
  ageSec: number; // bắt đầu âm (-delay) để vào sân lệch nhịp tự nhiên
  maxLifeSec: number;
  alpha: number;
}

export interface WindStreakParticle {
  headX: number;
  baseY: number;
  vx: number;
  vyDrift: number;
  dir: 1 | -1;
  length: number;
  waveAmp: number;
  waveFreq: number;
  wavePhase: number;
  hasCurl: boolean;
  warmTint: boolean;
  ageSec: number;
  maxLifeSec: number;
  peakAlpha: number;
  thickness: number;
}

export interface WindBreezeRuntime {
  leaves: WindLeafParticle[];
  streaks: WindStreakParticle[];
  gustCount: number;
  lastIntervalBucket: number | null;
  lastIntervalSec: number | null;
  lastManualTriggerKey: number;
}

const AUTUMN_PALETTES: readonly WindLeafPalette[] = [
  {
    kind: 'autumn',
    bladeTop: '#fbbf24',
    bladeBottom: '#d97706',
    vein: '#fef3c7',
    stem: '#92400e',
  },
  {
    kind: 'autumn',
    bladeTop: '#fb923c',
    bladeBottom: '#c2410c',
    vein: '#ffedd5',
    stem: '#7c2d12',
  },
  {
    kind: 'autumn',
    bladeTop: '#f87171',
    bladeBottom: '#dc2626',
    vein: '#fee2e2',
    stem: '#7f1d1d',
  },
  {
    kind: 'autumn',
    bladeTop: '#facc15',
    bladeBottom: '#ca8a04',
    vein: '#fef9c3',
    stem: '#854d0e',
  },
];

const GREEN_PALETTES: readonly WindLeafPalette[] = [
  {
    kind: 'green',
    bladeTop: '#a3e635',
    bladeBottom: '#4d7c0f',
    vein: '#ecfccb',
    stem: '#365314',
  },
  {
    kind: 'green',
    bladeTop: '#4ade80',
    bladeBottom: '#15803d',
    vein: '#dcfce7',
    stem: '#14532d',
  },
  {
    kind: 'green',
    bladeTop: '#34d399',
    bladeBottom: '#047857',
    vein: '#d1fae5',
    stem: '#064e3b',
  },
];

const MAX_ACTIVE_LEAVES = 84;
const MAX_ACTIVE_STREAKS = 14;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function normalizeWindBreezeSettings(raw: {
  vfxWindBreezeEnabled?: boolean;
  vfxWindBreezeIntervalSec?: number;
  vfxWindBreezeDurationSec?: number;
  vfxWindBreezeLeafCount?: number;
  vfxWindBreezeLeafTheme?: WindLeafTheme;
  vfxWindBreezeAutumnRatio?: number;
  vfxWindBreezeLeafScale?: number;
  vfxWindBreezeSpeed?: number;
  vfxWindBreezeOpacity?: number;
  vfxWindBreezeDirection?: WindDirectionMode;
  vfxWindBreezeShowStreaks?: boolean;
}): WindBreezeSettings {
  const intervalRaw = Number(raw.vfxWindBreezeIntervalSec ?? 25);
  const durationRaw = Number(raw.vfxWindBreezeDurationSec ?? 6.5);
  const countRaw = Number(raw.vfxWindBreezeLeafCount ?? 14);
  const ratioRaw = Number(raw.vfxWindBreezeAutumnRatio ?? 55);
  const scaleRaw = Number(raw.vfxWindBreezeLeafScale ?? 1.0);
  const speedRaw = Number(raw.vfxWindBreezeSpeed ?? 1.0);
  const opacityRaw = Number(raw.vfxWindBreezeOpacity ?? 0.88);

  const theme: WindLeafTheme =
    raw.vfxWindBreezeLeafTheme === 'autumn' ||
    raw.vfxWindBreezeLeafTheme === 'green' ||
    raw.vfxWindBreezeLeafTheme === 'mixed'
      ? raw.vfxWindBreezeLeafTheme
      : 'mixed';

  const direction: WindDirectionMode =
    raw.vfxWindBreezeDirection === 'right_to_left' ||
    raw.vfxWindBreezeDirection === 'alternate' ||
    raw.vfxWindBreezeDirection === 'left_to_right'
      ? raw.vfxWindBreezeDirection
      : 'left_to_right';

  return {
    enabled: raw.vfxWindBreezeEnabled !== false,
    intervalSec: clamp(Number.isFinite(intervalRaw) ? intervalRaw : 25, 5, 300),
    durationSec: clamp(
      Number.isFinite(durationRaw) ? durationRaw : 6.5,
      2.5,
      15
    ),
    leafCount: Math.round(clamp(Number.isFinite(countRaw) ? countRaw : 14, 1, 60)),
    leafTheme: theme,
    autumnRatio: Math.round(
      clamp(Number.isFinite(ratioRaw) ? ratioRaw : 55, 0, 100)
    ),
    leafScale: clamp(Number.isFinite(scaleRaw) ? scaleRaw : 1.0, 0.4, 2.5),
    speed: clamp(Number.isFinite(speedRaw) ? speedRaw : 1.0, 0.4, 2.5),
    opacity: clamp(Number.isFinite(opacityRaw) ? opacityRaw : 0.88, 0.2, 1.0),
    direction,
    showStreaks: raw.vfxWindBreezeShowStreaks !== false,
  };
}

export function createWindBreezeRuntime(): WindBreezeRuntime {
  return {
    leaves: [],
    streaks: [],
    gustCount: 0,
    lastIntervalBucket: null,
    lastIntervalSec: null,
    lastManualTriggerKey: 0,
  };
}

function pickLeafPalette(
  theme: WindLeafTheme,
  autumnRatio: number,
  rng: () => number
): WindLeafPalette {
  let useAutumn = false;
  if (theme === 'autumn') {
    useAutumn = true;
  } else if (theme === 'green') {
    useAutumn = false;
  } else {
    useAutumn = rng() * 100 < autumnRatio;
  }

  if (useAutumn) {
    return AUTUMN_PALETTES[Math.floor(rng() * AUTUMN_PALETTES.length)];
  }
  return GREEN_PALETTES[Math.floor(rng() * GREEN_PALETTES.length)];
}

export function resolveGustDirection(
  mode: WindDirectionMode,
  gustIndex: number
): 1 | -1 {
  if (mode === 'right_to_left') return -1;
  if (mode === 'alternate') return gustIndex % 2 === 0 ? 1 : -1;
  return 1;
}

export function spawnWindGust(
  runtime: WindBreezeRuntime,
  settings: WindBreezeSettings,
  canvasWidth: number,
  canvasHeight: number,
  rng: () => number = Math.random
): void {
  const dir = resolveGustDirection(settings.direction, runtime.gustCount);
  runtime.gustCount += 1;

  const isCompactPreview = canvasHeight < 320;
  const minY = isCompactPreview ? canvasHeight * 0.14 : canvasHeight * 0.2;
  const maxY = isCompactPreview ? canvasHeight * 0.84 : canvasHeight * 0.87;
  const bandHeight = Math.max(40, maxY - minY);

  const spawnWindowSec = settings.durationSec * 0.42;
  const baseTravelSec = Math.max(
    1.25,
    (settings.durationSec * 0.62) / settings.speed
  );
  const travelDistance = canvasWidth + (isCompactPreview ? 64 : 96);
  const baseSpeedPx = travelDistance / baseTravelSec;

  // 1. Sinh các dải lụa làn gió mờ bay lướt
  if (settings.showStreaks) {
    const streakCount = isCompactPreview
      ? 3
      : clamp(Math.round(2 + settings.leafCount / 6), 3, 5);
    for (let i = 0; i < streakCount; i++) {
      if (runtime.streaks.length >= MAX_ACTIVE_STREAKS) {
        runtime.streaks.shift();
      }
      const laneRatio = (i + 0.35 + (rng() - 0.5) * 0.35) / streakCount;
      const baseY = minY + clamp(laneRatio, 0.05, 0.95) * bandHeight;
      const streakLen =
        (isCompactPreview ? 88 : 138) +
        rng() * (isCompactPreview ? 58 : 96);
      const speedMul = 1.05 + rng() * 0.32;
      const vx = dir * baseSpeedPx * speedMul;
      const delaySec = (i / Math.max(1, streakCount)) * (spawnWindowSec * 0.72) + rng() * 0.18;
      const totalDist = canvasWidth + streakLen * 1.45 + 40;
      const lifeSec = totalDist / Math.max(35, Math.abs(vx));

      const warmTint =
        settings.leafTheme === 'autumn'
          ? true
          : settings.leafTheme === 'green'
          ? false
          : rng() * 100 < settings.autumnRatio;

      runtime.streaks.push({
        headX: dir === 1 ? -16 : canvasWidth + 16,
        baseY,
        vx,
        vyDrift: (6 + rng() * 12) * (isCompactPreview ? 0.55 : 1),
        dir,
        length: streakLen,
        waveAmp: (isCompactPreview ? 5 : 9) + rng() * (isCompactPreview ? 6 : 11),
        waveFreq: 0.022 + rng() * 0.016,
        wavePhase: rng() * Math.PI * 2,
        hasCurl: i % 2 === 0,
        warmTint,
        ageSec: -delaySec,
        maxLifeSec: lifeSec,
        peakAlpha: (0.35 + rng() * 0.16) * settings.opacity,
        thickness: isCompactPreview ? 1.4 : 1.85 + (i % 2) * 0.5,
      });
    }
  }

  // 2. Sinh đàn lá thu / lá xanh bay nhẹ qua lớp học
  const count = settings.leafCount;

  for (let i = 0; i < count; i++) {
    if (runtime.leaves.length >= MAX_ACTIVE_LEAVES) {
      runtime.leaves.shift();
    }
    const palette = pickLeafPalette(
      settings.leafTheme,
      settings.autumnRatio,
      rng
    );
    const shape: 'ovate' | 'maple' =
      palette.kind === 'autumn' && rng() < 0.55 ? 'maple' : 'ovate';

    // Phân bố đều theo dải dọc lớp học kết hợp nhiễu tự nhiên
    const stratified = (i + 0.18 + rng() * 0.64) / Math.max(1, count);
    const startY = minY + clamp(stratified, 0.02, 0.98) * bandHeight;
    const startX =
      dir === 1
        ? -22 - rng() * 26
        : canvasWidth + 22 + rng() * 26;

    const speedVariance = 0.82 + rng() * 0.38;
    const vx = dir * baseSpeedPx * speedVariance;
    const vy =
      (11 + rng() * 22) *
      (0.75 + settings.speed * 0.25) *
      (isCompactPreview ? 0.48 : 1);

    const orderRatio = count <= 1 ? 0 : i / (count - 1);
    const jitterDelay = (rng() - 0.5) * 0.32;
    const delaySec = Math.max(0, orderRatio * spawnWindowSec + jitterDelay);
    const maxLifeSec =
      (canvasWidth + 130) / Math.max(28, Math.abs(vx)) + 1.2;

    runtime.leaves.push({
      x: startX,
      y: startY,
      vx,
      vy,
      dir,
      size:
        (9.2 + rng() * 4.8) * settings.leafScale * (isCompactPreview ? 0.74 : 1),
      shape,
      palette,
      rot: (rng() - 0.5) * 1.1 + (dir === 1 ? 0.18 : -0.18),
      vRot: (rng() - 0.5) * 1.35 * (0.7 + settings.speed * 0.3),
      rockAmp: 0.28 + rng() * 0.38,
      rockFreq: 2.1 + rng() * 1.8,
      swayAmp: (isCompactPreview ? 12 : 22) + rng() * (isCompactPreview ? 10 : 20),
      swayFreq: 1.5 + rng() * 1.4,
      swayPhase: rng() * Math.PI * 2,
      flutterFreq: 2.4 + rng() * 2.2,
      flutterPhase: rng() * Math.PI * 2,
      gustPhase: rng() * Math.PI * 2,
      ageSec: -delaySec,
      maxLifeSec,
      alpha: (0.86 + rng() * 0.14) * settings.opacity,
    });
  }
}

export function drawWindStreak(
  ctx: CanvasRenderingContext2D,
  streak: WindStreakParticle,
  timeSec: number
): void {
  const progress = clamp(streak.ageSec / Math.max(0.2, streak.maxLifeSec), 0, 1);
  const envelope = Math.sin(progress * Math.PI);
  const alpha = streak.peakAlpha * envelope;
  if (alpha <= 0.01) return;

  const tailX = streak.headX - streak.dir * streak.length;
  const segments = 22;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const grad = ctx.createLinearGradient(tailX, streak.baseY, streak.headX, streak.baseY);
  const rgb = streak.warmTint ? '254, 249, 195' : '240, 253, 250';
  grad.addColorStop(0, `rgba(${rgb}, 0)`);
  grad.addColorStop(0.35, `rgba(${rgb}, ${(alpha * 0.65).toFixed(3)})`);
  grad.addColorStop(0.78, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);

  const buildPath = () => {
    ctx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const px = tailX + (streak.headX - tailX) * t;
      const waveY =
        Math.sin(px * streak.waveFreq + streak.wavePhase - timeSec * 2.2) *
        streak.waveAmp;
      const curlY =
        streak.hasCurl && t > 0.76
          ? Math.sin(((t - 0.76) / 0.24) * Math.PI * 1.35) *
            (streak.waveAmp * 0.55)
          : 0;
      const py = streak.baseY + waveY - curlY;
      if (s === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
  };

  // Lớp hào quang gió mềm bên ngoài
  ctx.strokeStyle = grad;
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = streak.thickness * 3.1;
  buildPath();
  ctx.stroke();

  // Sợi gió mảnh thanh thoát ở tâm
  ctx.globalAlpha = 1;
  ctx.lineWidth = streak.thickness;
  buildPath();
  ctx.stroke();

  ctx.restore();
}

export function drawWindLeaf(
  ctx: CanvasRenderingContext2D,
  leaf: WindLeafParticle,
  timeSec: number
): void {
  const lifeRatio = clamp(leaf.ageSec / Math.max(0.2, leaf.maxLifeSec), 0, 1);
  const fadeIn = clamp(leaf.ageSec / 0.35, 0, 1);
  const fadeOut = lifeRatio > 0.86 ? clamp((1 - lifeRatio) / 0.14, 0, 1) : 1;
  const finalAlpha = leaf.alpha * fadeIn * fadeOut;
  if (finalAlpha <= 0.01) return;

  const flutterCos = Math.cos(timeSec * leaf.flutterFreq + leaf.flutterPhase);
  const tiltScaleY = 0.38 + 0.62 * Math.abs(flutterCos);
  const curRot =
    leaf.rot +
    Math.sin(timeSec * leaf.rockFreq + leaf.swayPhase) * leaf.rockAmp;

  const r = leaf.size;

  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(curRot);
  if (leaf.dir === -1) {
    ctx.scale(-1, tiltScaleY);
  } else {
    ctx.scale(1, tiltScaleY);
  }
  ctx.globalAlpha = finalAlpha;

  // Bóng đổ cực nhẹ tạo chiều sâu lơ lửng trên nền lớp học
  ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.5;

  const grad = ctx.createLinearGradient(-r, -r * 0.6, r, r * 0.6);
  grad.addColorStop(0, leaf.palette.bladeTop);
  grad.addColorStop(1, leaf.palette.bladeBottom);

  // Cuống lá nhỏ nhắn
  ctx.strokeStyle = leaf.palette.stem;
  ctx.lineWidth = Math.max(0.85, r * 0.11);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, r * 0.14);
  ctx.quadraticCurveTo(-r * 0.82, r * 0.05, -r * 0.62, 0);
  ctx.stroke();

  if (leaf.shape === 'maple') {
    // Lá phong thu 3 thùy mềm mại
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 0);
    ctx.quadraticCurveTo(-r * 0.42, -r * 0.48, -r * 0.12, -r * 0.84);
    ctx.lineTo(r * 0.04, -r * 0.44);
    ctx.quadraticCurveTo(r * 0.52, -r * 0.56, r * 1.04, -r * 0.04);
    ctx.quadraticCurveTo(r * 0.54, r * 0.48, r * 0.02, r * 0.42);
    ctx.lineTo(-r * 0.16, r * 0.8);
    ctx.quadraticCurveTo(-r * 0.45, r * 0.44, -r * 0.62, 0);
    ctx.closePath();
    ctx.fill();

    // Gân lá sáng nhẹ
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = leaf.palette.vein;
    ctx.globalAlpha = finalAlpha * 0.72;
    ctx.lineWidth = Math.max(0.65, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r * 0.56, 0);
    ctx.lineTo(r * 0.72, -r * 0.03);
    ctx.moveTo(-r * 0.25, -r * 0.02);
    ctx.lineTo(-r * 0.12, -r * 0.56);
    ctx.moveTo(-r * 0.25, 0.02);
    ctx.lineTo(-r * 0.14, r * 0.52);
    ctx.stroke();
  } else {
    // Lá cây thon nhọn thanh thoát (lá xanh / lá bàng thu)
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-r * 0.68, 0);
    ctx.bezierCurveTo(
      -r * 0.34,
      -r * 0.68,
      r * 0.38,
      -r * 0.56,
      r * 1.05,
      -r * 0.05
    );
    ctx.bezierCurveTo(
      r * 0.38,
      r * 0.56,
      -r * 0.32,
      r * 0.62,
      -r * 0.68,
      0
    );
    ctx.closePath();
    ctx.fill();

    // Sống lá giữa & 2 cặp gân phụ
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = leaf.palette.vein;
    ctx.globalAlpha = finalAlpha * 0.75;
    ctx.lineWidth = Math.max(0.65, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 0);
    ctx.quadraticCurveTo(r * 0.15, -r * 0.04, r * 0.82, -r * 0.04);
    ctx.moveTo(-r * 0.18, -r * 0.01);
    ctx.lineTo(r * 0.08, -r * 0.26);
    ctx.moveTo(-r * 0.12, 0.01);
    ctx.lineTo(r * 0.14, r * 0.24);
    ctx.stroke();
  }

  ctx.restore();
}

export function stepAndDrawWindBreeze(
  ctx: CanvasRenderingContext2D | null,
  runtime: WindBreezeRuntime,
  settings: WindBreezeSettings,
  dt: number,
  nowMs: number,
  canvasWidth: number,
  canvasHeight: number,
  manualTriggerKey = 0,
  rng: () => number = Math.random
): void {
  if (!settings.enabled) {
    if (runtime.leaves.length > 0 || runtime.streaks.length > 0) {
      runtime.leaves.length = 0;
      runtime.streaks.length = 0;
    }
    runtime.lastManualTriggerKey = manualTriggerKey;
    runtime.lastIntervalSec = settings.intervalSec;
    runtime.lastIntervalBucket = Math.floor(
      nowMs / Math.max(1000, settings.intervalSec * 1000)
    );
    return;
  }

  const intervalMs = Math.max(5000, settings.intervalSec * 1000);
  const currentBucket = Math.floor(nowMs / intervalMs);

  // Đồng bộ mốc chu kỳ khi khởi tạo hoặc khi người dùng vừa chỉnh lại thanh trượt chu kỳ x giây
  if (
    runtime.lastIntervalBucket === null ||
    runtime.lastIntervalSec !== settings.intervalSec
  ) {
    runtime.lastIntervalSec = settings.intervalSec;
    runtime.lastIntervalBucket = currentBucket;
  } else if (currentBucket !== runtime.lastIntervalBucket) {
    runtime.lastIntervalBucket = currentBucket;
    spawnWindGust(runtime, settings, canvasWidth, canvasHeight, rng);
  }

  // Kích hoạt tức thì khi người dùng bấm nút Test Gió & Lá Bay
  if (manualTriggerKey > 0 && manualTriggerKey !== runtime.lastManualTriggerKey) {
    runtime.lastManualTriggerKey = manualTriggerKey;
    spawnWindGust(runtime, settings, canvasWidth, canvasHeight, rng);
  }

  if (runtime.streaks.length === 0 && runtime.leaves.length === 0) {
    return;
  }

  const timeSec = nowMs / 1000;

  // Cập nhật & vẽ các dải lụa làn gió trước (nằm dưới lá một chút)
  for (let i = runtime.streaks.length - 1; i >= 0; i--) {
    const st = runtime.streaks[i];
    st.ageSec += dt;
    if (st.ageSec < 0) continue;

    st.headX += st.vx * dt;
    st.baseY += st.vyDrift * dt;

    const outRight = st.dir === 1 && st.headX - st.length > canvasWidth + 32;
    const outLeft = st.dir === -1 && st.headX + st.length < -32;
    if (st.ageSec >= st.maxLifeSec || outRight || outLeft) {
      runtime.streaks.splice(i, 1);
      continue;
    }

    if (ctx) {
      drawWindStreak(ctx, st, timeSec);
    }
  }

  // Cập nhật & vẽ những chiếc lá thu / lá xanh bay nhẹ qua lớp học
  for (let i = runtime.leaves.length - 1; i >= 0; i--) {
    const lf = runtime.leaves[i];
    lf.ageSec += dt;
    if (lf.ageSec < 0) continue;

    const gustBoost = 1 + 0.26 * Math.sin(timeSec * 2.15 + lf.gustPhase);
    const liftVy =
      Math.cos(timeSec * lf.swayFreq + lf.swayPhase) * lf.swayAmp;

    lf.x += lf.vx * gustBoost * dt;
    lf.y += (lf.vy + liftVy) * dt;
    lf.rot += lf.vRot * dt;

    const margin = 56;
    const outHoriz =
      lf.dir === 1 ? lf.x > canvasWidth + margin : lf.x < -margin;
    const outVert = lf.y > canvasHeight + margin || lf.y < -margin;

    if (lf.ageSec >= lf.maxLifeSec || outHoriz || outVert) {
      runtime.leaves.splice(i, 1);
      continue;
    }

    if (ctx) {
      drawWindLeaf(ctx, lf, timeSec);
    }
  }
}
