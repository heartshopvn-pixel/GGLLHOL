import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BurnerLotusBurstFX,
  CameraFocusState,
  ClassBoardRuntimeState,
  CustomAssetsConfig,
  DailyRecordEntry,
  DonorEntry,
  FloatingToastItem,
  FlyingFlowerFX,
  FlyingLotusFX,
  GameConfig,
  HudBoxPosition,
  KneelSlot,
  OfferingGiftType,
  PilgrimData,
  Point2D,
  QueuedPilgrimRequest,
  RectBounds,
  RoamingCatAgent,
  RunningPigAgent,
  SimpleExplosionFX,
  TempleMonkData,
  WaitingQueueItem,
  FlyingMilkTeaFX,
  ZombieEntityState,
  ZombieEventRuntimeState,
  ZombieProjectileFX,
  ZombieSpikyDamageFX,
} from '../../types/game';
import { ClassroomArt } from './ClassroomArt';
import { StudentSprite } from './StudentSprite';
import { TeacherSprite } from './TeacherSprite';
import { HudBoxKey, ResizeCorner, StageHud } from './StageHud';
import {
  DeskCatModel,
  FallingMoneyModel,
  Flower10BadgeIcon,
  RoseBouquetModel,
  RunningPigModel,
} from './SchoolGiftArt';
import {
  FlyingMilkTeaSprite,
  ZombieCharacterSprite,
  ZombieProjectileSprite,
  ZombieSpikyDamageBubble,
} from './ZombieEventArt';
import {
  DoubleDeskRenderGroup,
  groupSlotsIntoDoubleDesks,
  SUPERVISOR_ZONE_BOUNDS,
} from '../../config/constants';

export type ZoneKey = 'monk' | 'supervisor' | 'leftPray' | 'rightPray';
export type RectEdge = 'top' | 'bottom' | 'left' | 'right';

export type SeatNodeKey = `vip:${number}` | `normal:${number}`;

interface GameStageProps {
  config: GameConfig;
  classBoardState?: ClassBoardRuntimeState;
  vipSlots: KneelSlot[];
  normalSlots: KneelSlot[];
  pilgrims: PilgrimData[];
  specialFlowerRunners?: PilgrimData[];
  doorCrowd?: PilgrimData[];
  waitingQueue?: Array<QueuedPilgrimRequest | WaitingQueueItem>;
  queueCount?: number;
  monks: TempleMonkData[];
  lotusDonors?: DonorEntry[];
  dailyRecords?: DailyRecordEntry[];
  onResetDailyRecords?: () => void;
  floatingToasts: FloatingToastItem[];
  customAssets: CustomAssetsConfig;
  grandEventProgress: number;
  goldenLotusRainUntil: number;
  moneyRainUntil?: number;
  latestAltarOffering: OfferingGiftType;
  burnerLotusBursts: BurnerLotusBurstFX[];
  flyingLotuses: FlyingLotusFX[];
  runningPigs?: RunningPigAgent[];
  roamingCats?: RoamingCatAgent[];
  flyingFlowers?: FlyingFlowerFX[];
  simpleExplosions?: SimpleExplosionFX[];
  zombieEventState?: ZombieEventRuntimeState;
  zombieEntity?: ZombieEntityState;
  zombieProjectiles?: ZombieProjectileFX[];
  zombieSpikyDamages?: ZombieSpikyDamageFX[];
  flyingMilkTeas?: FlyingMilkTeaFX[];
  eventBarFlashKey?: number;
  cameraFocus: CameraFocusState;
  speakingMeta?: {
    pilgrimId?: number;
    username?: string;
    reason?: string;
    isBot?: boolean;
  } | null;
  isTtsSpeaking?: boolean;
  onMoveWaypoint: (
    kind:
      | 'burner'
      | 'tray'
      | 'vip'
      | 'normal'
      | 'doorCrowd'
      | 'punishmentLine'
      | 'zombieSpawn'
      | 'zombieStand'
      | 'zombieTeacher'
      | 'zombieSupervisor',
    index: number,
    pos: Point2D
  ) => void;
  onMoveWaypointsBatch?: (
    updates: Array<{ kind: 'vip' | 'normal'; index: number; pos: Point2D }>
  ) => void;
  onAddDesk?: (kind: 'vip' | 'normal') => void;
  onRemoveDesk?: (kind: 'vip' | 'normal', deskId?: string) => void;
  onRemoveDesksByIds?: (deskIds: string[]) => void;
  onUpdateHudBox: (boxKey: HudBoxKey, nextBox: HudBoxPosition) => void;
  onUpdateZoneBounds: (zoneKey: ZoneKey, nextBounds: RectBounds) => void;
}

interface FloatingDust {
  x: number;
  y: number;
  r: number;
  vy: number;
  alpha: number;
}

interface Flower10RainDrop {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  rot: number;
  vRot: number;
  swayPhase: number;
}

function drawFlower10Blossom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;

  const petalAngles = [0, 1.256, 2.513, 3.77, 5.026];
  petalAngles.forEach((ang, idx) => {
    const px = Math.cos(ang) * size * 0.52;
    const py = Math.sin(ang) * size * 0.52;
    ctx.beginPath();
    ctx.arc(px, py, size * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = idx % 2 === 0 ? '#fb7185' : '#f43f5e';
    ctx.fill();
  });

  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = '#fef08a';
  ctx.fill();

  ctx.fillStyle = '#be123c';
  ctx.font = `900 ${Math.max(6, Math.round(size * 0.55))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('10', 0, 0.5);

  ctx.restore();
}

interface EditableZoneRectProps {
  zoneKey: ZoneKey;
  bounds: RectBounds;
  label: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  handleColorClass: string;
  onStartDragEdge: (
    zoneKey: ZoneKey,
    edge: RectEdge,
    e: React.MouseEvent | React.TouchEvent
  ) => void;
}

const EditableZoneRect: React.FC<EditableZoneRectProps> = ({
  zoneKey,
  bounds,
  label,
  borderClass,
  bgClass,
  textClass,
  handleColorClass,
  onStartDragEdge,
}) => {
  const width = Math.max(24, bounds.maxX - bounds.minX);
  const height = Math.max(24, bounds.maxY - bounds.minY);

  const bindEdge =
    (edge: RectEdge) => (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      onStartDragEdge(zoneKey, edge, e);
    };

  return (
    <div
      className={`absolute border-2 border-dashed ${borderClass} ${bgClass} flex items-center justify-center text-[9px] font-bold ${textClass} select-none pointer-events-none`}
      style={{
        left: `${bounds.minX}px`,
        top: `${bounds.minY}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <span className="px-1.5 py-0.5 rounded bg-slate-950/80 text-center leading-tight">
        {label}
      </span>

      <div
        onMouseDown={bindEdge('top')}
        onTouchStart={bindEdge('top')}
        className="pointer-events-auto absolute -top-2 inset-x-0 h-4 cursor-ns-resize flex items-center justify-center group"
      >
        <span
          className={`w-8 h-1.5 rounded-full ${handleColorClass} border border-slate-950 shadow group-hover:scale-125 transition-transform`}
        />
      </div>

      <div
        onMouseDown={bindEdge('bottom')}
        onTouchStart={bindEdge('bottom')}
        className="pointer-events-auto absolute -bottom-2 inset-x-0 h-4 cursor-ns-resize flex items-center justify-center group"
      >
        <span
          className={`w-8 h-1.5 rounded-full ${handleColorClass} border border-slate-950 shadow group-hover:scale-125 transition-transform`}
        />
      </div>

      <div
        onMouseDown={bindEdge('left')}
        onTouchStart={bindEdge('left')}
        className="pointer-events-auto absolute -left-2 inset-y-0 w-4 cursor-ew-resize flex items-center justify-center group"
      >
        <span
          className={`w-1.5 h-8 rounded-full ${handleColorClass} border border-slate-950 shadow group-hover:scale-125 transition-transform`}
        />
      </div>

      <div
        onMouseDown={bindEdge('right')}
        onTouchStart={bindEdge('right')}
        className="pointer-events-auto absolute -right-2 inset-y-0 w-4 cursor-ew-resize flex items-center justify-center group"
      >
        <span
          className={`w-1.5 h-8 rounded-full ${handleColorClass} border border-slate-950 shadow group-hover:scale-125 transition-transform`}
        />
      </div>
    </div>
  );
};

export const GameStage: React.FC<GameStageProps> = ({
  config,
  classBoardState,
  vipSlots,
  normalSlots,
  pilgrims,
  specialFlowerRunners = [],
  doorCrowd = [],
  waitingQueue = [],
  queueCount,
  monks,
  lotusDonors = [],
  dailyRecords = [],
  onResetDailyRecords,
  floatingToasts,
  customAssets,
  grandEventProgress,
  goldenLotusRainUntil,
  moneyRainUntil = 0,
  latestAltarOffering,
  burnerLotusBursts,
  flyingLotuses,
  runningPigs = [],
  roamingCats = [],
  flyingFlowers = [],
  simpleExplosions = [],
  zombieEventState,
  zombieEntity,
  zombieProjectiles = [],
  zombieSpikyDamages = [],
  flyingMilkTeas = [],
  eventBarFlashKey,
  cameraFocus,
  speakingMeta,
  isTtsSpeaking = false,
  onMoveWaypoint,
  onMoveWaypointsBatch,
  onAddDesk,
  onRemoveDesk,
  onRemoveDesksByIds,
  onUpdateHudBox,
  onUpdateZoneBounds,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldCameraRef = useRef<HTMLDivElement>(null);
  const worldCameraTeacherOverlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dustCanvasRef = useRef<HTMLCanvasElement>(null);
  const rainCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);

  const vipDesks = useMemo(
    () => groupSlotsIntoDoubleDesks(vipSlots, 'vip'),
    [vipSlots]
  );
  const normalDesks = useMemo(
    () => groupSlotsIntoDoubleDesks(normalSlots, 'norm'),
    [normalSlots]
  );

  const [draggingNode, setDraggingNode] = useState<{
    kind:
      | 'burner'
      | 'tray'
      | 'vip'
      | 'normal'
      | 'doorCrowd'
      | 'punishmentLine'
      | 'zombieSpawn'
      | 'zombieStand'
      | 'zombieTeacher'
      | 'zombieSupervisor';
    index: number;
  } | null>(null);

  const [selectedSeats, setSelectedSeats] = useState<Set<SeatNodeKey>>(new Set());
  const [multiSelectDeskMode, setMultiSelectDeskMode] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const [draggingSeatGroup, setDraggingSeatGroup] = useState<{
    startX: number;
    startY: number;
    initialPositions: Array<{
      kind: 'vip' | 'normal';
      index: number;
      x: number;
      y: number;
    }>;
  } | null>(null);

  const [draggingHudBox, setDraggingHudBox] = useState<{
    boxKey: HudBoxKey;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [resizingHudBox, setResizingHudBox] = useState<{
    boxKey: HudBoxKey;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    initialBox: HudBoxPosition;
  } | null>(null);

  const [draggingZoneEdge, setDraggingZoneEdge] = useState<{
    zoneKey: ZoneKey;
    edge: RectEdge;
  } | null>(null);

  useEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const availW = wrapperRef.current.clientWidth - 16;
      const availH = wrapperRef.current.clientHeight - 16;
      const nextScale = Math.min(availW / 540, availH / 960, 1.15);
      setScale(Math.max(0.28, nextScale));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  const fxStateRef = useRef({
    incenseBurner: config.incenseBurner,
    showWaypoints: config.showWaypoints,
    vipSlots,
    normalSlots,
    goldenLotusRainUntil,
    cameraFocus,
    pilgrims,
    doorCrowd,
    monks,
    zombieEntity,
    zombieProjectiles,
    cameraZoomScale: config.cameraZoomScale ?? 2.2,
    cameraSmoothSpeed: config.cameraSmoothSpeed ?? 4.5,
    cameraFocusOffsetX: config.cameraFocusOffsetX ?? 0,
    cameraFocusOffsetY: config.cameraFocusOffsetY ?? -40,
    dustParticleCount: config.dustParticleCount ?? 16,
    dustParticleOpacity: config.dustParticleOpacity ?? 0.65,
    dustParticleSize: config.dustParticleSize ?? 1.0,
    isZombieEventActive: Boolean(
      zombieEventState?.isActive && zombieEventState.phase !== 'idle'
    ),
  });
  fxStateRef.current = {
    incenseBurner: config.incenseBurner,
    showWaypoints: config.showWaypoints,
    vipSlots,
    normalSlots,
    goldenLotusRainUntil,
    cameraFocus,
    pilgrims,
    doorCrowd,
    monks,
    zombieEntity,
    zombieProjectiles,
    cameraZoomScale: config.cameraZoomScale ?? 2.2,
    cameraSmoothSpeed: config.cameraSmoothSpeed ?? 4.5,
    cameraFocusOffsetX: config.cameraFocusOffsetX ?? 0,
    cameraFocusOffsetY: config.cameraFocusOffsetY ?? -40,
    dustParticleCount: config.dustParticleCount ?? 16,
    dustParticleOpacity: config.dustParticleOpacity ?? 0.65,
    dustParticleSize: config.dustParticleSize ?? 1.0,
    isZombieEventActive: Boolean(
      zombieEventState?.isActive && zombieEventState.phase !== 'idle'
    ),
  };

  const camRigRef = useRef({ x: 270, y: 480, zoom: 1 });
  const prevTargetRef = useRef<{ id: number | null; x: number; y: number }>({
    id: null,
    x: 270,
    y: 480,
  });
  const lastCamStepMsRef = useRef<number>(performance.now());

  const stepCameraRig = useCallback((now: number) => {
    const rawDt = (now - lastCamStepMsRef.current) / 1000;
    const dt = Math.max(0.001, Math.min(0.1, rawDt));
    lastCamStepMsRef.current = now;

    const st = fxStateRef.current;
    const isFocusTimeValid = Date.now() < st.cameraFocus.until;
    const focusRole = isFocusTimeValid ? st.cameraFocus.focusRole : null;
    const isPilgrimFocusValid =
      Boolean(st.cameraFocus.pilgrimId) && isFocusTimeValid;
    const targetPilgrim = isPilgrimFocusValid
      ? st.pilgrims.find((p) => p.id === st.cameraFocus.pilgrimId) ||
        st.doorCrowd.find((p) => p.id === st.cameraFocus.pilgrimId)
      : undefined;

    let desiredZoom = 1;
    let desiredX = 270;
    let desiredY = 480;
    let activeTargetId: number | null = null;

    const offsetX =
      typeof st.cameraFocusOffsetX === 'number' ? st.cameraFocusOffsetX : 0;
    const offsetY =
      typeof st.cameraFocusOffsetY === 'number' ? st.cameraFocusOffsetY : -44;
    const unifiedZoom = Math.max(
      1.2,
      Math.min(3.4, st.cameraZoomScale || st.cameraFocus.customZoom || 2.25)
    );

    if (focusRole === 'projectile' && st.cameraFocus.projectileId) {
      const targetProj =
        st.zombieProjectiles.find(
          (p) => p.id === st.cameraFocus.projectileId
        ) ||
        st.zombieProjectiles.find((p) => p.kind === 'desk_mate');
      if (targetProj) {
        const elapsed = Date.now() - targetProj.createdAt;
        const p = Math.max(
          0,
          Math.min(1, elapsed / Math.max(120, targetProj.durationMs))
        );
        const curX =
          targetProj.startX + (targetProj.targetX - targetProj.startX) * p;
        const linearY =
          targetProj.startY + (targetProj.targetY - targetProj.startY) * p;
        const arcHeight =
          targetProj.kind === 'desk_mate'
            ? 95
            : targetProj.kind === 'chair'
            ? 75
            : 50;
        const curY = linearY - Math.sin(p * Math.PI) * arcHeight;

        desiredZoom = unifiedZoom;
        const minX = 270 / desiredZoom;
        const maxX = 540 - 270 / desiredZoom;
        const minY = 480 / desiredZoom;
        const maxY = 960 - 480 / desiredZoom;
        desiredX = Math.max(minX, Math.min(maxX, curX + offsetX));
        desiredY = Math.max(minY, Math.min(maxY, curY + offsetY * 0.25));
        activeTargetId = -9004;
      } else if (st.zombieEntity?.visible) {
        desiredZoom = unifiedZoom;
        const minX = 270 / desiredZoom;
        const maxX = 540 - 270 / desiredZoom;
        const minY = 480 / desiredZoom;
        const maxY = 960 - 480 / desiredZoom;
        desiredX = Math.max(minX, Math.min(maxX, st.zombieEntity.x + offsetX));
        desiredY = Math.max(minY, Math.min(maxY, st.zombieEntity.y + offsetY));
        activeTargetId = -9001;
      }
    } else if (focusRole === 'zombie' && st.zombieEntity?.visible) {
      desiredZoom = unifiedZoom;
      const minX = 270 / desiredZoom;
      const maxX = 540 - 270 / desiredZoom;
      const minY = 480 / desiredZoom;
      const maxY = 960 - 480 / desiredZoom;
      desiredX = Math.max(minX, Math.min(maxX, st.zombieEntity.x + offsetX));
      desiredY = Math.max(minY, Math.min(maxY, st.zombieEntity.y + offsetY));
      activeTargetId = -9001;
    } else if (focusRole === 'abbot' || focusRole === 'senior_novice') {
      const targetMonk = st.monks.find((m) => m.role === focusRole);
      if (targetMonk) {
        desiredZoom = unifiedZoom;
        const minX = 270 / desiredZoom;
        const maxX = 540 - 270 / desiredZoom;
        const minY = 480 / desiredZoom;
        const maxY = 960 - 480 / desiredZoom;
        desiredX = Math.max(minX, Math.min(maxX, targetMonk.x + offsetX));
        desiredY = Math.max(minY, Math.min(maxY, targetMonk.y + offsetY));
        activeTargetId = focusRole === 'abbot' ? -9002 : -9003;
      }
    } else if (targetPilgrim) {
      desiredZoom = unifiedZoom;
      const minX = 270 / desiredZoom;
      const maxX = 540 - 270 / desiredZoom;
      const minY = 480 / desiredZoom;
      const maxY = 960 - 480 / desiredZoom;
      desiredX = Math.max(minX, Math.min(maxX, targetPilgrim.x + offsetX));
      desiredY = Math.max(minY, Math.min(maxY, targetPilgrim.y + offsetY));
      activeTargetId = targetPilgrim.id;
    }

    const rig = camRigRef.current;
    const smoothSpeed = Math.max(1.2, Math.min(14, st.cameraSmoothSpeed || 4.5));
    const lerpAlpha = 1 - Math.exp(-smoothSpeed * dt);

    if (activeTargetId !== null) {
      if (prevTargetRef.current.id === activeTargetId) {
        rig.x += desiredX - prevTargetRef.current.x;
        rig.y += desiredY - prevTargetRef.current.y;
      }
      prevTargetRef.current.id = activeTargetId;
      prevTargetRef.current.x = desiredX;
      prevTargetRef.current.y = desiredY;
    } else {
      prevTargetRef.current.id = null;
    }

    rig.x += (desiredX - rig.x) * lerpAlpha;
    rig.y += (desiredY - rig.y) * lerpAlpha;
    rig.zoom += (desiredZoom - rig.zoom) * lerpAlpha;

    if (
      desiredZoom === 1 &&
      Math.abs(rig.zoom - 1) < 0.001 &&
      Math.hypot(rig.x - 270, rig.y - 480) < 0.25
    ) {
      rig.zoom = 1;
      rig.x = 270;
      rig.y = 480;
    }

    const tx = 270 - rig.x;
    const ty = 480 - rig.y;
    const camTransform = `translate3d(0, 0, 0) scale(${rig.zoom.toFixed(
      4
    )}) translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    if (worldCameraRef.current) {
      worldCameraRef.current.style.transform = camTransform;
    }
    if (worldCameraTeacherOverlayRef.current) {
      worldCameraTeacherOverlayRef.current.style.transform = camTransform;
    }
    if (dustCanvasRef.current) {
      dustCanvasRef.current.style.transform = camTransform;
    }
  }, []);

  useLayoutEffect(() => {
    stepCameraRig(performance.now());
  }, [
    cameraFocus,
    config.cameraZoomScale,
    config.cameraSmoothSpeed,
    config.cameraFocusOffsetX,
    config.cameraFocusOffsetY,
    stepCameraRig,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dustCanvas = dustCanvasRef.current;
    const rainCanvas = rainCanvasRef.current;
    if (!canvas || !dustCanvas || !rainCanvas) return;
    const ctx = canvas.getContext('2d');
    const dustCtx = dustCanvas.getContext('2d');
    const rainCtx = rainCanvas.getContext('2d');
    if (!ctx || !dustCtx || !rainCtx) return;

    const floatingDust: FloatingDust[] = Array.from({ length: 80 }, () => ({
      x: 30 + Math.random() * 480,
      y: 40 + Math.random() * 580,
      r: 1.2 + Math.random() * 2,
      vy: -8 - Math.random() * 10,
      alpha: 0.45 + Math.random() * 0.55,
    }));

    const rainDrops: Flower10RainDrop[] = Array.from({ length: 46 }, (_, i) => ({
      x: (i * 11.5 + Math.random() * 25) % 540,
      y: -Math.random() * 960,
      vy: 230 + Math.random() * 170,
      vx: (Math.random() - 0.5) * 35,
      size: 9 + Math.random() * 8,
      rot: (Math.random() - 0.5) * 0.5,
      vRot: (Math.random() - 0.5) * 1.4,
      swayPhase: Math.random() * Math.PI * 2,
    }));

    const fireEmbers = Array.from({ length: 64 }, (_, i) => ({
      x: (i * 19 + Math.random() * 40) % 540,
      y: Math.random() * 960,
      vx: 38 + Math.random() * 85,
      vy: -(135 + Math.random() * 195),
      size: 2.2 + Math.random() * 4.2,
      alpha: 0.55 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      hueType: i % 3, // 0: đỏ cam, 1: cam rực, 2: vàng lửa
    }));

    let wasRaining = false;
    let wasZombieFire = false;
    let animId = 0;
    let lastTime = performance.now();

    const renderFx = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = now / 1000;

      if (now - lastCamStepMsRef.current >= 8) {
        stepCameraRig(now);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dustCtx.clearRect(0, 0, dustCanvas.width, dustCanvas.height);

      if (fxStateRef.current.showWaypoints) {
        const curVipDesks = groupSlotsIntoDoubleDesks(fxStateRef.current.vipSlots, 'vip');
        curVipDesks.forEach((d) => {
          ctx.save();
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
          ctx.fillStyle = 'rgba(37, 99, 235, 0.22)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(d.centerX - d.width / 2, d.centerY - 15, d.width, 30, 5);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        const curNormDesks = groupSlotsIntoDoubleDesks(fxStateRef.current.normalSlots, 'norm');
        curNormDesks.forEach((d) => {
          ctx.save();
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
          ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.roundRect(d.centerX - d.width / 2, d.centerY - 15, d.width, 30, 5);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }

      // Hạt bụi phấn lung linh bay lên (ưu tiên nằm trên tất cả bảng và cả người)
      const activeDustCount = Math.max(
        0,
        Math.min(
          floatingDust.length,
          Math.round(fxStateRef.current.dustParticleCount ?? 16)
        )
      );
      const dustOpacityScale = Math.max(
        0,
        Math.min(1, fxStateRef.current.dustParticleOpacity ?? 0.65)
      );
      const dustSizeScale = Math.max(
        0.2,
        Math.min(4, fxStateRef.current.dustParticleSize ?? 1.0)
      );

      if (activeDustCount > 0 && dustOpacityScale > 0.01) {
        for (let i = 0; i < activeDustCount; i++) {
          const sp = floatingDust[i];
          sp.y += sp.vy * dt;
          if (sp.y < 30) {
            sp.y = 620;
            sp.x = 30 + Math.random() * 480;
          }
          const finalAlpha = Math.max(0, Math.min(1, sp.alpha * dustOpacityScale));
          const finalRadius = Math.max(0.4, sp.r * dustSizeScale);
          dustCtx.fillStyle = `rgba(254, 249, 195, ${finalAlpha.toFixed(3)})`;
          dustCtx.beginPath();
          dustCtx.arc(sp.x, sp.y, finalRadius, 0, Math.PI * 2);
          dustCtx.fill();
        }
      }

      // Mưa Hoa Điểm 10 toàn màn hình hoặc Hiệu ứng Hạt Lửa Thổi Bùng khi Sự kiện Zombie xảy ra
      const rainRemainingMs = fxStateRef.current.goldenLotusRainUntil - Date.now();
      const isZombieFire = fxStateRef.current.isZombieEventActive;

      if (rainRemainingMs > 0 || isZombieFire) {
        rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);

        if (rainRemainingMs > 0) {
          if (!wasRaining) {
            wasRaining = true;
            rainDrops.forEach((d, idx) => {
              d.x = ((idx * 37) % 510) + 15;
              d.y = -20 - (idx / rainDrops.length) * 680;
            });
          }

          const fadeAlpha = Math.min(1, rainRemainingMs / 450);
          rainCtx.fillStyle = `rgba(254, 240, 138, ${0.08 * fadeAlpha})`;
          rainCtx.fillRect(0, 0, 540, 960);

          rainDrops.forEach((d) => {
            d.y += d.vy * dt;
            d.x += (d.vx + Math.sin(timeSec * 3 + d.swayPhase) * 28) * dt;
            d.rot += d.vRot * dt;
            if (d.y > 985) {
              d.y = -25;
              d.x = 15 + Math.random() * 510;
            }
            drawFlower10Blossom(rainCtx, d.x, d.y, d.size, d.rot, 0.94 * fadeAlpha);
          });
        } else {
          wasRaining = false;
        }

        if (isZombieFire) {
          wasZombieFire = true;
          // Ánh lửa bập bùng dưới chân màn hình
          const firePulse = 0.14 + Math.sin(timeSec * 6.5) * 0.04;
          const bottomGrad = rainCtx.createLinearGradient(0, 680, 0, 960);
          bottomGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
          bottomGrad.addColorStop(0.65, `rgba(234, 88, 12, ${(firePulse * 0.65).toFixed(3)})`);
          bottomGrad.addColorStop(1, `rgba(220, 38, 38, ${firePulse.toFixed(3)})`);
          rainCtx.fillStyle = bottomGrad;
          rainCtx.fillRect(0, 680, 540, 280);

          const gustX = Math.sin(timeSec * 2.8) * 32 + 28;
          for (let i = 0; i < fireEmbers.length; i++) {
            const em = fireEmbers[i];
            const curVx = em.vx + gustX + Math.sin(timeSec * 5.2 + em.phase) * 36;
            const curVy = em.vy - Math.cos(timeSec * 4.1 + em.phase) * 24;
            em.x += curVx * dt;
            em.y += curVy * dt;

            if (em.y < -30 || em.x > 570 || em.x < -30) {
              em.y = 950 + Math.random() * 35;
              em.x = -20 + Math.random() * 520;
            }

            const flicker = 0.65 + 0.35 * Math.sin(timeSec * 14 + em.phase);
            const alpha = Math.max(0.15, Math.min(1, em.alpha * flicker));
            const angle = Math.atan2(curVy, curVx);
            const tailLen = em.size * 3.8;

            rainCtx.save();
            rainCtx.translate(em.x, em.y);
            rainCtx.rotate(angle);

            // Đuôi tàn lửa thổi bùng
            const tailGrad = rainCtx.createLinearGradient(-tailLen, 0, em.size, 0);
            tailGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
            tailGrad.addColorStop(
              0.55,
              em.hueType === 0
                ? `rgba(239, 68, 68, ${(alpha * 0.65).toFixed(3)})`
                : `rgba(249, 115, 22, ${(alpha * 0.7).toFixed(3)})`
            );
            tailGrad.addColorStop(1, `rgba(254, 240, 138, ${alpha.toFixed(3)})`);

            rainCtx.fillStyle = tailGrad;
            rainCtx.beginPath();
            rainCtx.ellipse(
              -tailLen * 0.35,
              0,
              tailLen * 0.65,
              em.size * 0.68,
              0,
              0,
              Math.PI * 2
            );
            rainCtx.fill();

            // Nhân hạt lửa rực sáng
            rainCtx.fillStyle =
              em.hueType === 2
                ? `rgba(254, 249, 195, ${alpha.toFixed(3)})`
                : `rgba(253, 186, 116, ${alpha.toFixed(3)})`;
            rainCtx.beginPath();
            rainCtx.arc(0, 0, em.size * 0.55, 0, Math.PI * 2);
            rainCtx.fill();

            rainCtx.restore();
          }
        } else {
          wasZombieFire = false;
        }
      } else if (wasRaining || wasZombieFire) {
        wasRaining = false;
        wasZombieFire = false;
        rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
      }

      animId = requestAnimationFrame(renderFx);
    };

    animId = requestAnimationFrame(renderFx);
    return () => cancelAnimationFrame(animId);
  }, [stepCameraRig]);

  useEffect(() => {
    if (
      !draggingNode &&
      !draggingSeatGroup &&
      !marqueeBox &&
      !draggingHudBox &&
      !resizingHudBox &&
      !draggingZoneEdge
    ) {
      return;
    }

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!viewportRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const rect = viewportRef.current.getBoundingClientRect();
      const scaleX = 540 / rect.width;
      const scaleY = 960 / rect.height;
      const stageX = (clientX - rect.left) * scaleX;
      const stageY = (clientY - rect.top) * scaleY;

      if (draggingSeatGroup) {
        const dx = stageX - draggingSeatGroup.startX;
        const dy = stageY - draggingSeatGroup.startY;
        const updates = draggingSeatGroup.initialPositions.map((item) => ({
          kind: item.kind,
          index: item.index,
          pos: {
            x: Math.round(Math.max(15, Math.min(525, item.x + dx))),
            y: Math.round(Math.max(120, Math.min(945, item.y + dy))),
          },
        }));
        if (onMoveWaypointsBatch) {
          onMoveWaypointsBatch(updates);
        } else {
          updates.forEach((u) => onMoveWaypoint(u.kind, u.index, u.pos));
        }
      } else if (marqueeBox) {
        const nextBox = { ...marqueeBox, curX: stageX, curY: stageY };
        setMarqueeBox(nextBox);
        const minX = Math.min(nextBox.startX, nextBox.curX);
        const maxX = Math.max(nextBox.startX, nextBox.curX);
        const minY = Math.min(nextBox.startY, nextBox.curY);
        const maxY = Math.max(nextBox.startY, nextBox.curY);

        const hits = new Set<SeatNodeKey>();
        vipDesks.forEach((d) => {
          if (
            d.centerX >= minX &&
            d.centerX <= maxX &&
            d.centerY >= minY &&
            d.centerY <= maxY
          ) {
            hits.add(`vip:${d.leftIndex}`);
            hits.add(`vip:${d.rightIndex}`);
          }
        });
        normalDesks.forEach((d) => {
          if (
            d.centerX >= minX &&
            d.centerX <= maxX &&
            d.centerY >= minY &&
            d.centerY <= maxY
          ) {
            hits.add(`normal:${d.leftIndex}`);
            hits.add(`normal:${d.rightIndex}`);
          }
        });
        setSelectedSeats(hits);
      } else if (draggingNode) {
        const nx = Math.round(Math.max(15, Math.min(525, stageX)));
        const ny = Math.round(Math.max(120, Math.min(945, stageY)));
        onMoveWaypoint(draggingNode.kind, draggingNode.index, { x: nx, y: ny });
      } else if (draggingHudBox) {
        const box =
          config.hudLayout[draggingHudBox.boxKey] || {
            x: 12,
            y: 154,
            width: 136,
            height: 34,
          };
        const nx = Math.round(
          Math.max(0, Math.min(540 - box.width, stageX - draggingHudBox.offsetX))
        );
        const ny = Math.round(
          Math.max(0, Math.min(960 - box.height, stageY - draggingHudBox.offsetY))
        );
        onUpdateHudBox(draggingHudBox.boxKey, { ...box, x: nx, y: ny });
      } else if (resizingHudBox) {
        const { boxKey, corner, startX, startY, initialBox } = resizingHudBox;
        const dx = stageX - startX;
        const dy = stageY - startY;
        const minW = 68;
        const minH = 26;

        let nextX = initialBox.x;
        let nextY = initialBox.y;
        let nextW = initialBox.width;
        let nextH = initialBox.height;

        if (corner === 'se') {
          nextW = Math.max(minW, Math.min(540 - initialBox.x, Math.round(initialBox.width + dx)));
          nextH = Math.max(minH, Math.min(960 - initialBox.y, Math.round(initialBox.height + dy)));
        } else if (corner === 'sw') {
          const rightEdge = initialBox.x + initialBox.width;
          nextX = Math.max(0, Math.min(rightEdge - minW, Math.round(initialBox.x + dx)));
          nextW = rightEdge - nextX;
          nextH = Math.max(minH, Math.min(960 - initialBox.y, Math.round(initialBox.height + dy)));
        } else if (corner === 'ne') {
          const bottomEdge = initialBox.y + initialBox.height;
          nextW = Math.max(minW, Math.min(540 - initialBox.x, Math.round(initialBox.width + dx)));
          nextY = Math.max(0, Math.min(bottomEdge - minH, Math.round(initialBox.y + dy)));
          nextH = bottomEdge - nextY;
        } else if (corner === 'nw') {
          const rightEdge = initialBox.x + initialBox.width;
          const bottomEdge = initialBox.y + initialBox.height;
          nextX = Math.max(0, Math.min(rightEdge - minW, Math.round(initialBox.x + dx)));
          nextW = rightEdge - nextX;
          nextY = Math.max(0, Math.min(bottomEdge - minH, Math.round(initialBox.y + dy)));
          nextH = bottomEdge - nextY;
        }

        onUpdateHudBox(boxKey, {
          x: nextX,
          y: nextY,
          width: nextW,
          height: nextH,
        });
      } else if (draggingZoneEdge) {
        const { zoneKey, edge } = draggingZoneEdge;
        const currentBounds: RectBounds =
          zoneKey === 'monk'
            ? config.monkZone
            : zoneKey === 'supervisor'
            ? config.supervisorZone || SUPERVISOR_ZONE_BOUNDS
            : zoneKey === 'leftPray'
            ? config.redPrayZones.left
            : config.redPrayZones.right;

        const minSpan = 36;
        const next: RectBounds = { ...currentBounds };

        if (edge === 'top') {
          next.minY = Math.round(
            Math.max(100, Math.min(currentBounds.maxY - minSpan, stageY))
          );
        } else if (edge === 'bottom') {
          next.maxY = Math.round(
            Math.min(950, Math.max(currentBounds.minY + minSpan, stageY))
          );
        } else if (edge === 'left') {
          next.minX = Math.round(
            Math.max(4, Math.min(currentBounds.maxX - minSpan, stageX))
          );
        } else if (edge === 'right') {
          next.maxX = Math.round(
            Math.min(536, Math.max(currentBounds.minX + minSpan, stageX))
          );
        }

        onUpdateZoneBounds(zoneKey, next);
      }
    };

    const handlePointerUp = () => {
      setDraggingNode(null);
      setDraggingSeatGroup(null);
      setMarqueeBox(null);
      setDraggingHudBox(null);
      setResizingHudBox(null);
      setDraggingZoneEdge(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [
    draggingNode,
    draggingSeatGroup,
    marqueeBox,
    draggingHudBox,
    resizingHudBox,
    draggingZoneEdge,
    vipSlots,
    normalSlots,
    config.hudLayout,
    config.monkZone,
    config.supervisorZone,
    config.redPrayZones,
    onMoveWaypoint,
    onMoveWaypointsBatch,
    onUpdateHudBox,
    onUpdateZoneBounds,
  ]);

  const getStageCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!viewportRef.current) return { stageX: 0, stageY: 0 };
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = viewportRef.current.getBoundingClientRect();
    const scaleX = 540 / rect.width;
    const scaleY = 960 / rect.height;
    return {
      stageX: (clientX - rect.left) * scaleX,
      stageY: (clientY - rect.top) * scaleY,
    };
  };

  const handleStartDeskDrag = (
    kind: 'vip' | 'normal',
    desk: DoubleDeskRenderGroup,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.stopPropagation();
    const leftKey: SeatNodeKey = `${kind}:${desk.leftIndex}`;
    const rightKey: SeatNodeKey = `${kind}:${desk.rightIndex}`;
    const isShift = 'shiftKey' in e && e.shiftKey;

    if (isShift) {
      setSelectedSeats((prev) => {
        const next = new Set(prev);
        if (next.has(leftKey)) {
          next.delete(leftKey);
          next.delete(rightKey);
        } else {
          next.add(leftKey);
          next.add(rightKey);
        }
        return next;
      });
      return;
    }

    const { stageX, stageY } = getStageCoords(e);
    let activeSelection = selectedSeats;
    if (multiSelectDeskMode) {
      const next = new Set(selectedSeats);
      next.add(leftKey);
      next.add(rightKey);
      activeSelection = next;
      setSelectedSeats(next);
    } else if (!selectedSeats.has(leftKey) && !selectedSeats.has(rightKey)) {
      activeSelection = new Set([leftKey, rightKey]);
      setSelectedSeats(activeSelection);
    }

    // Luôn kéo cả bàn đôi (2 ghế cùng lúc) hoặc nhóm nhiều bàn đôi đang chọn
    const initialPositions: Array<{
      kind: 'vip' | 'normal';
      index: number;
      x: number;
      y: number;
    }> = [];
    activeSelection.forEach((seatKey) => {
      const [sKind, sIdxStr] = seatKey.split(':');
      const sIdx = Number(sIdxStr);
      if (sKind === 'vip' && vipSlots[sIdx]) {
        initialPositions.push({
          kind: 'vip',
          index: sIdx,
          x: vipSlots[sIdx].x,
          y: vipSlots[sIdx].y,
        });
      } else if (sKind === 'normal' && normalSlots[sIdx]) {
        initialPositions.push({
          kind: 'normal',
          index: sIdx,
          x: normalSlots[sIdx].x,
          y: normalSlots[sIdx].y,
        });
      }
    });

    setDraggingSeatGroup({
      startX: stageX,
      startY: stageY,
      initialPositions,
    });
  };

  const handleStartMarquee = (e: React.MouseEvent) => {
    if (!config.showWaypoints) return;
    if (e.button !== 0) return;
    const { stageX, stageY } = getStageCoords(e);
    setMarqueeBox({
      startX: stageX,
      startY: stageY,
      curX: stageX,
      curY: stageY,
    });
    if (!e.shiftKey) {
      setSelectedSeats(new Set());
    }
  };

  const handleStartDragHudBox = (
    boxKey: HudBoxKey,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.stopPropagation();
    if (!viewportRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = viewportRef.current.getBoundingClientRect();
    const scaleX = 540 / rect.width;
    const scaleY = 960 / rect.height;
    const stageX = (clientX - rect.left) * scaleX;
    const stageY = (clientY - rect.top) * scaleY;
    const box = config.hudLayout[boxKey] || {
      x: 12,
      y: 154,
      width: 136,
      height: 34,
    };
    setDraggingHudBox({
      boxKey,
      offsetX: stageX - box.x,
      offsetY: stageY - box.y,
    });
  };

  const handleStartResizeHudBox = (
    boxKey: HudBoxKey,
    corner: ResizeCorner,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.stopPropagation();
    if (!viewportRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = viewportRef.current.getBoundingClientRect();
    const scaleX = 540 / rect.width;
    const scaleY = 960 / rect.height;
    const stageX = (clientX - rect.left) * scaleX;
    const stageY = (clientY - rect.top) * scaleY;
    const box = config.hudLayout[boxKey] || {
      x: 12,
      y: 154,
      width: 136,
      height: 34,
    };
    setResizingHudBox({
      boxKey,
      corner,
      startX: stageX,
      startY: stageY,
      initialBox: { ...box },
    });
  };

  const handleStartDragZoneEdge = (
    zoneKey: ZoneKey,
    edge: RectEdge,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.stopPropagation();
    setDraggingZoneEdge({ zoneKey, edge });
  };

  const isGrandEventActive = goldenLotusRainUntil > Date.now();
  const totalSeatCapacity =
    config.maxStageCapacity || vipSlots.length + normalSlots.length;
  const activePilgrimCount = pilgrims.filter(
    (p) => p.state !== 'leave_side_to_aisle' && p.state !== 'leave_down_exit'
  ).length;

  const isCameraZoomActive =
    Boolean(cameraFocus.pilgrimId) && Date.now() < cameraFocus.until;
  const focusedPilgrim = isCameraZoomActive
    ? pilgrims.find((p) => p.id === cameraFocus.pilgrimId) ||
      doorCrowd.find((p) => p.id === cameraFocus.pilgrimId)
    : undefined;

  const speakingLowerName = (speakingMeta?.username || '').trim().toLowerCase();
  const speakingPilgrim =
    isTtsSpeaking && speakingMeta
      ? pilgrims.find(
          (p) =>
            p.id === speakingMeta.pilgrimId && p.state !== 'leave_down_exit'
        ) ||
        doorCrowd.find((p) => p.id === speakingMeta.pilgrimId) ||
        pilgrims.find(
          (p) =>
            Boolean(speakingLowerName) &&
            p.username.trim().toLowerCase() === speakingLowerName &&
            p.state !== 'leave_down_exit'
        ) ||
        doorCrowd.find(
          (p) =>
            Boolean(speakingLowerName) &&
            p.username.trim().toLowerCase() === speakingLowerName
        )
      : undefined;

  return (
    <div
      ref={wrapperRef}
      className="flex-1 min-w-[280px] h-full flex items-center justify-center p-2 relative overflow-hidden bg-slate-950"
    >
      <div
        ref={viewportRef}
        className="w-[540px] h-[960px] aspect-[9/16] relative overflow-hidden shrink-0 origin-center rounded-xl shadow-2xl border border-slate-800"
        style={{ transform: `scale(${scale})` }}
      >
        {/* World Camera Container (60fps Smooth Interpolated Pan & Zoom Rig) */}
        <div
          ref={worldCameraRef}
          className="absolute inset-0 will-change-transform"
          style={{
            transformOrigin: '270px 480px',
            transform: 'scale(1) translate(0px, 0px)',
          }}
        >
          {/* Layer 1: High School Classroom Background Artwork */}
          <ClassroomArt
            vipSlots={vipSlots}
            normalSlots={normalSlots}
            pilgrims={pilgrims}
            incenseBurner={config.incenseBurner}
            offeringTrayPos={config.offeringTrayPos}
            customAssets={customAssets}
            deskScale={config.deskScale ?? 1}
            studentDeskGap={config.studentDeskGap ?? 24}
            giftModelScales={config.giftModelScales}
            renderLayer="background"
            latestAltarOffering={
              latestAltarOffering
                ? {
                    type: latestAltarOffering,
                    username: '',
                    key: 1,
                  }
                : null
            }
          />

          {/* Layer 2: Canvas Chalk Dust & Optional Seat Waypoint Cushions */}
          <canvas
            ref={canvasRef}
            width={540}
            height={960}
            className="absolute inset-0 pointer-events-none z-10"
          />

          {/* Layer 2.8: Hiệu ứng bung tỏa Hoa Điểm 10 + Floating text +số hoa điểm 10 (màu hồng không viền đen) tại bàn Giáo viên */}
          {burnerLotusBursts.map((burst) => (
            <div
              key={burst.id}
              className="absolute pointer-events-none z-25"
              style={{
                left: `${burst.x}px`,
                top: `${burst.y}px`,
              }}
            >
              {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map(
                (deg, idx) => {
                  const rad = (deg * Math.PI) / 180;
                  const dist = idx % 2 === 0 ? 46 : 32;
                  const tx = Math.round(Math.cos(rad) * dist);
                  const ty = Math.round(Math.sin(rad) * dist - 14);
                  return (
                    <span
                      key={deg}
                      className="burner-lotus-particle absolute left-0 top-0"
                      style={
                        {
                          '--tx': `${tx}px`,
                          '--ty': `${ty}px`,
                          '--rot': `${deg - 90}deg`,
                        } as React.CSSProperties
                      }
                    >
                      <Flower10BadgeIcon className="w-4 h-4 drop-shadow-[0_0_6px_#f472b6]" />
                    </span>
                  );
                }
              )}

              {/* Floating text +số hoa điểm 10 (màu hồng không viền đen kèm icon Hoa Điểm 10 không viền) */}
              {typeof burst.lotusPoints === 'number' && burst.lotusPoints > 0 && (() => {
                const scoreFontSize = config.hudLayout.lotusFloatingScoreFontSize ?? 12;
                const iconSize = Math.max(11, Math.round(scoreFontSize * 1.25));
                return (
                  <div className="burner-lotus-float-score absolute left-0 top-0 flex items-center gap-0.5 whitespace-nowrap select-none">
                    <span
                      className="lotus-score-pink font-extrabold font-mono leading-none tracking-tight"
                      style={{ fontSize: `${scoreFontSize}px` }}
                    >
                      +{burst.lotusPoints.toLocaleString('vi-VN')}
                    </span>
                    <span
                      style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
                      className="inline-flex items-center justify-center shrink-0"
                    >
                      <Flower10BadgeIcon className="w-full h-full" />
                    </span>
                  </div>
                );
              })()}
            </div>
          ))}

          {/* Layer 3 (trong worldCameraRef): Chỉ giữ Cô Giáo nếu người dùng cố tình tắt teacherAboveClassBoard trong Dev */}
          {config.teacherAboveClassBoard === false && (
            <div className="absolute inset-0 pointer-events-none z-15">
              {monks
                .filter((m) => m.role === 'abbot')
                .map((m) => (
                  <TeacherSprite
                    key={m.id}
                    monk={m}
                    customAssets={customAssets}
                    characterScale={config.characterScale ?? 1}
                    femaleTeacherScale={config.femaleTeacherScale ?? 1}
                    maleTeacherScale={config.maleTeacherScale ?? 1}
                    useDefaultPngModels={config.useDefaultPngModels !== false}
                    nameTagFontFamily={config.nameTagFontFamily}
                    nameTagScale={config.nameTagScale ?? 1}
                    chatBubbleFontFamily={config.chatBubbleFontFamily}
                    chatBubbleScale={config.chatBubbleScale ?? 1}
                    teacherBubbleScale={config.teacherBubbleScale ?? 1}
                    supervisorBubbleScale={config.supervisorBubbleScale ?? 1}
                    isSpeakingBubble={false}
                    walkWobbleIntensity={config.walkWobbleIntensity ?? 1}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Lớp Bàn Học, Học Sinh & Giáo Viên chung một mặt phẳng xếp lớp 2.5D Depth Y-Sorting (z-25 > classBoardBox z-20) */}
        <div
          ref={worldCameraTeacherOverlayRef}
          className="absolute inset-0 pointer-events-none z-25 will-change-transform"
          style={{
            transformOrigin: '270px 480px',
            transform: 'scale(1) translate(0px, 0px)',
          }}
        >
          <ClassroomArt
            vipSlots={vipSlots}
            normalSlots={normalSlots}
            pilgrims={pilgrims}
            incenseBurner={config.incenseBurner}
            offeringTrayPos={config.offeringTrayPos}
            customAssets={customAssets}
            deskScale={config.deskScale ?? 1}
            studentDeskGap={config.studentDeskGap ?? 24}
            giftModelScales={config.giftModelScales}
            renderLayer="desks"
          />

          {monks
            .filter(
              (m) =>
                config.teacherAboveClassBoard !== false || m.role !== 'abbot'
            )
            .map((m) => (
              <TeacherSprite
                key={`overlay_${m.id}`}
                monk={m}
                customAssets={customAssets}
                characterScale={config.characterScale ?? 1}
                femaleTeacherScale={config.femaleTeacherScale ?? 1}
                maleTeacherScale={config.maleTeacherScale ?? 1}
                useDefaultPngModels={config.useDefaultPngModels !== false}
                nameTagFontFamily={config.nameTagFontFamily}
                nameTagScale={config.nameTagScale ?? 1}
                chatBubbleFontFamily={config.chatBubbleFontFamily}
                chatBubbleScale={config.chatBubbleScale ?? 1}
                teacherBubbleScale={config.teacherBubbleScale ?? 1}
                supervisorBubbleScale={config.supervisorBubbleScale ?? 1}
                isSpeakingBubble={false}
                walkWobbleIntensity={config.walkWobbleIntensity ?? 1}
              />
            ))}

          {doorCrowd.map((p) => (
            <StudentSprite
              key={p.id}
              pilgrim={p}
              customAssets={customAssets}
              characterScale={config.characterScale ?? 1}
              useDefaultPngModels={config.useDefaultPngModels !== false}
              nameTagFontFamily={config.nameTagFontFamily}
              nameTagScale={config.nameTagScale ?? 1}
              nameTagMaxChars={config.nameTagMaxChars ?? 16}
              nameTagOffsetY={config.nameTagOffsetY ?? 0}
              scoreTagOffsetY={config.scoreTagOffsetY ?? 0}
              scoreChangeFontSize={config.scoreChangeFontSize ?? 14}
              scoreChangeStrokeWidth={config.scoreChangeStrokeWidth ?? 2.5}
              chatBubbleFontFamily={config.chatBubbleFontFamily}
              chatBubbleScale={config.chatBubbleScale ?? 1}
              chatBubbleMaxChars={config.chatBubbleMaxChars ?? 80}
              chatBubbleMaxWidth={config.chatBubbleMaxWidth ?? 195}
              chatBubbleMaxHeight={config.chatBubbleMaxHeight ?? 110}
              chatBubbleFontSize={config.chatBubbleFontSize ?? 11}
              chatBubbleOffsetY={config.chatBubbleOffsetY ?? 0}
              chatBubbleOffsetX={config.chatBubbleOffsetX ?? 24}
              isLeftSeatmate={false}
              isSpeakingBubble={speakingPilgrim?.id === p.id}
              giftModelScales={config.giftModelScales}
              walkWobbleIntensity={config.walkWobbleIntensity ?? 1}
            />
          ))}

          {specialFlowerRunners.map((p) => (
            <StudentSprite
              key={p.id}
              pilgrim={p}
              customAssets={customAssets}
              characterScale={config.characterScale ?? 1}
              useDefaultPngModels={config.useDefaultPngModels !== false}
              nameTagFontFamily={config.nameTagFontFamily}
              nameTagScale={config.nameTagScale ?? 1}
              nameTagMaxChars={config.nameTagMaxChars ?? 16}
              nameTagOffsetY={config.nameTagOffsetY ?? 0}
              scoreTagOffsetY={config.scoreTagOffsetY ?? 0}
              scoreChangeFontSize={config.scoreChangeFontSize ?? 14}
              scoreChangeStrokeWidth={config.scoreChangeStrokeWidth ?? 2.5}
              chatBubbleFontFamily={config.chatBubbleFontFamily}
              chatBubbleScale={config.chatBubbleScale ?? 1}
              chatBubbleMaxChars={config.chatBubbleMaxChars ?? 80}
              chatBubbleMaxWidth={config.chatBubbleMaxWidth ?? 195}
              chatBubbleMaxHeight={config.chatBubbleMaxHeight ?? 110}
              chatBubbleFontSize={config.chatBubbleFontSize ?? 11}
              chatBubbleOffsetY={config.chatBubbleOffsetY ?? 0}
              chatBubbleOffsetX={config.chatBubbleOffsetX ?? 24}
              isLeftSeatmate={false}
              isSpeakingBubble={false}
              giftModelScales={config.giftModelScales}
              walkWobbleIntensity={config.walkWobbleIntensity ?? 1}
            />
          ))}

          {(() => {
            const leftSeatIds = new Set<string>();
            const deskYBySlotId = new Map<string, number>();
            vipDesks.forEach((d) => {
              leftSeatIds.add(d.leftSlot.id);
              deskYBySlotId.set(d.leftSlot.id, d.centerY);
              if (d.rightSlot) {
                deskYBySlotId.set(d.rightSlot.id, d.centerY);
              }
            });
            normalDesks.forEach((d) => {
              leftSeatIds.add(d.leftSlot.id);
              deskYBySlotId.set(d.leftSlot.id, d.centerY);
              if (d.rightSlot) {
                deskYBySlotId.set(d.rightSlot.id, d.centerY);
              }
            });
            return pilgrims.map((p) => (
              <StudentSprite
                key={p.id}
                pilgrim={p}
                customAssets={customAssets}
                characterScale={config.characterScale ?? 1}
                useDefaultPngModels={config.useDefaultPngModels !== false}
                nameTagFontFamily={config.nameTagFontFamily}
                nameTagScale={config.nameTagScale ?? 1}
                nameTagMaxChars={config.nameTagMaxChars ?? 16}
                nameTagOffsetY={config.nameTagOffsetY ?? 0}
                scoreTagOffsetY={config.scoreTagOffsetY ?? 0}
                scoreChangeFontSize={config.scoreChangeFontSize ?? 14}
                scoreChangeStrokeWidth={config.scoreChangeStrokeWidth ?? 2.5}
                chatBubbleFontFamily={config.chatBubbleFontFamily}
                chatBubbleScale={config.chatBubbleScale ?? 1}
                chatBubbleMaxChars={config.chatBubbleMaxChars ?? 80}
                chatBubbleMaxWidth={config.chatBubbleMaxWidth ?? 195}
                chatBubbleMaxHeight={config.chatBubbleMaxHeight ?? 110}
                chatBubbleFontSize={config.chatBubbleFontSize ?? 11}
                chatBubbleOffsetY={config.chatBubbleOffsetY ?? 0}
                chatBubbleOffsetX={config.chatBubbleOffsetX ?? 24}
                isLeftSeatmate={Boolean(
                  p.slotId && leftSeatIds.has(p.slotId)
                )}
                deskSeatY={
                  p.slotId ? deskYBySlotId.get(p.slotId) : undefined
                }
                isSpeakingBubble={speakingPilgrim?.id === p.id}
                giftModelScales={config.giftModelScales}
                walkWobbleIntensity={config.walkWobbleIntensity ?? 1}
              />
            ));
          })()}

          {/* Layer 3.1: Đàn Heo chạy hù dọa 5 bạn Top đầu */}
          {runningPigs.map((pig) => (
            <div
              key={pig.id}
              className="absolute pointer-events-none select-none"
              style={{
                left: `${pig.x}px`,
                top: `${pig.y}px`,
                transform: `translate(-50%, -80%) translateY(${
                  Math.abs(Math.sin(pig.animTime * 16)) * -4
                }px)`,
                zIndex: Math.max(25, Math.round(pig.y) + 4),
              }}
            >
              <RunningPigModel
                customUrl={customAssets.runningPigUrl}
                scale={config.giftModelScales?.runningPig ?? 1}
                facingLeft={pig.facingLeft}
              />
            </div>
          ))}

          {/* Layer 3.1b: Các chú Mèo nhảy từ bàn xuống đất đi vòng vòng lớp rồi ra cửa biến mất (khi bàn đã đủ số mèo tối đa) */}
          {roamingCats.map((cat) => {
            const isJumping = cat.jumpProgress < 1;
            const arcOffsetY = isJumping
              ? -Math.sin(cat.jumpProgress * Math.PI) * 28
              : Math.abs(Math.sin(cat.animTime * 14)) * -3.5;
            const wobbleDeg = isJumping
              ? (cat.facingLeft ? -14 : 14) * Math.sin(cat.jumpProgress * Math.PI)
              : Math.sin(cat.animTime * 12) * 4.5;
            return (
              <div
                key={cat.id}
                className="absolute pointer-events-none select-none"
                style={{
                  left: `${cat.x}px`,
                  top: `${cat.y}px`,
                  transform: `translate(-50%, -80%) translateY(${arcOffsetY.toFixed(
                    1
                  )}px) rotate(${wobbleDeg.toFixed(1)}deg) ${
                    cat.facingLeft ? 'scaleX(-1)' : ''
                  }`,
                  zIndex: Math.max(25, Math.round(cat.y) + 4),
                }}
              >
                <DeskCatModel
                  customUrl={customAssets.deskCatUrl}
                  scale={config.giftModelScales?.deskCat ?? 1}
                />
              </div>
            );
          })}

          {/* Layer 3.2: Hoa hồng bay từ vị trí học sinh sang vị trí Cô Giáo / Thầy Giám Thị */}
          {flyingFlowers.map((ff) => {
            const dx = ff.targetX - ff.startX;
            const dy = ff.targetY - ff.startY;
            return (
              <div
                key={ff.id}
                className="flying-lotus-projectile absolute pointer-events-none z-90"
                style={
                  {
                    left: `${ff.startX}px`,
                    top: `${ff.startY}px`,
                    '--dx': `${dx}px`,
                    '--dy': `${dy}px`,
                  } as React.CSSProperties
                }
              >
                <RoseBouquetModel
                  customUrl={customAssets.roseBouquetUrl}
                  scale={config.giftModelScales?.roseBouquet ?? 1}
                />
              </div>
            );
          })}

          {/* Layer 3.3: Hiệu ứng nổ hoa & nổ heo */}
          {simpleExplosions.map((exp) => (
            <div
              key={exp.id}
              className="absolute pointer-events-none z-95"
              style={{
                left: `${exp.x}px`,
                top: `${exp.y}px`,
              }}
            >
              {exp.kind === 'flower' ? (
                <div className="relative flex items-center justify-center">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => {
                    const rad = (deg * Math.PI) / 180;
                    const dist = idx % 2 === 0 ? 38 : 26;
                    const tx = Math.round(Math.cos(rad) * dist);
                    const ty = Math.round(Math.sin(rad) * dist - 10);
                    return (
                      <span
                        key={deg}
                        className="burner-lotus-particle absolute left-0 top-0 text-sm"
                        style={
                          {
                            '--tx': `${tx}px`,
                            '--ty': `${ty}px`,
                            '--rot': `${deg}deg`,
                          } as React.CSSProperties
                        }
                      >
                        {idx % 2 === 0 ? '🌹' : '💖'}
                      </span>
                    );
                  })}
                  <span className="w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-400/50 border-2 border-pink-200 animate-ping" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center">
                  {[0, 60, 120, 180, 240, 300].map((deg, idx) => {
                    const rad = (deg * Math.PI) / 180;
                    const dist = idx % 2 === 0 ? 36 : 24;
                    const tx = Math.round(Math.cos(rad) * dist);
                    const ty = Math.round(Math.sin(rad) * dist - 8);
                    return (
                      <span
                        key={deg}
                        className="burner-lotus-particle absolute left-0 top-0 text-base"
                        style={
                          {
                            '--tx': `${tx}px`,
                            '--ty': `${ty}px`,
                            '--rot': `${deg}deg`,
                          } as React.CSSProperties
                        }
                      >
                        {idx % 2 === 0 ? '💥' : '💨'}
                      </span>
                    );
                  })}
                  <span className="w-12 h-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/60 border-2 border-yellow-200 animate-ping" />
                </div>
              )}
            </div>
          ))}

          {/* Layer 3.4: Sự kiện Zombie Tấn Công */}
          {zombieEntity && zombieEntity.visible && (
            <ZombieCharacterSprite
              zombie={zombieEntity}
              customAssets={customAssets}
              scale={(config.characterScale ?? 1) * (config.zombieScale ?? 1.15)}
            />
          )}

          {zombieProjectiles.map((proj) => (
            <ZombieProjectileSprite
              key={proj.id}
              proj={proj}
              customAssets={customAssets}
              nameTagFontFamily={config.nameTagFontFamily}
              nameTagScale={config.nameTagScale}
              nameTagMaxChars={config.nameTagMaxChars}
            />
          ))}

          {zombieSpikyDamages.map((fx) => (
            <ZombieSpikyDamageBubble key={fx.id} fx={fx} />
          ))}

          {flyingMilkTeas.map((tea) => (
            <FlyingMilkTeaSprite
              key={tea.id}
              tea={tea}
              customAssets={customAssets}
            />
          ))}
        </div>

        {/* Hiệu ứng khung viền khi đang khóa Camera Zoom vào học sinh */}
        {focusedPilgrim && cameraFocus.reason === 'special_gift' && (
          <div className="absolute inset-0 pointer-events-none z-28 border-4 border-yellow-300/80 shadow-[inset_0_0_45px_rgba(250,204,21,0.55)] animate-pulse">
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-950/90 border border-yellow-300 text-[11px] font-extrabold text-yellow-200 shadow-lg whitespace-nowrap">
              🏆 Học Sinh Xuất Sắc: {focusedPilgrim.username} 🏆
            </div>
          </div>
        )}
        {focusedPilgrim && cameraFocus.reason === 'gift' && (
          <div className="absolute inset-0 pointer-events-none z-28 border-2 border-amber-400/60 shadow-[inset_0_0_25px_rgba(245,158,11,0.3)]">
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-950/90 border border-amber-400/70 text-[11px] font-bold text-amber-200 shadow-lg whitespace-nowrap">
              🎁 Tặng quà Cô Giáo: {focusedPilgrim.username}
            </div>
          </div>
        )}

        {/* Layer 3.5: Mưa Hoa Điểm 10 rơi toàn màn hình khi đầy thanh Sự Kiện Lớp Học */}
        <canvas
          ref={rainCanvasRef}
          width={540}
          height={960}
          className="absolute inset-0 pointer-events-none z-25"
        />

        {/* Layer 3.6: Hiệu ứng Tiền rơi từ trên trời rơi xuống đầy màn hình trong 5s (Event VIP: Tôi là Rich Kid) */}
        {moneyRainUntil > Date.now() && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
            {Array.from({ length: 28 }, (_, idx) => {
              const leftPct = (idx * 17 + 7) % 94;
              const delaySec = ((idx * 0.19) % 1.4).toFixed(2);
              const durSec = (1.35 + (idx % 4) * 0.22).toFixed(2);
              return (
                <div
                  key={`money_drop_${idx}`}
                  className="absolute -top-12 animate-bounce"
                  style={{
                    left: `${leftPct}%`,
                    animation: `richKidMoneyFall ${durSec}s linear ${delaySec}s infinite`,
                  }}
                >
                  <FallingMoneyModel
                    customUrl={customAssets.fallingMoneyUrl}
                    scale={config.giftModelScales?.fallingMoney ?? 1}
                  />
                </div>
              );
            })}
            <style>{`
              @keyframes richKidMoneyFall {
                0% { transform: translateY(-40px) rotate(-18deg); opacity: 0; }
                12% { opacity: 1; }
                50% { transform: translateY(480px) translateX(16px) rotate(15deg); opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translateY(990px) translateX(-12px) rotate(-22deg); opacity: 0; }
              }
            `}</style>
          </div>
        )}

        {/* Layer 3.8: Hoa Điểm 10 bay về bảng Sự Kiện Lớp Học khi người xem bấm thả tim */}
        {flyingLotuses.map((fly) => {
          const dx = fly.targetX - fly.startX;
          const dy = fly.targetY - fly.startY;
          return (
            <div
              key={fly.id}
              className="flying-lotus-projectile absolute pointer-events-none z-35"
              style={
                {
                  left: `${fly.startX}px`,
                  top: `${fly.startY}px`,
                  '--dx': `${dx}px`,
                  '--dy': `${dy}px`,
                } as React.CSSProperties
              }
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute translate-y-6 w-2 h-8 rounded-full bg-gradient-to-t from-transparent via-pink-400/75 to-pink-200 blur-[2px]" />
                <span className="absolute -inset-1.5 rounded-full bg-pink-400/50 blur-[4px]" />
                <Flower10BadgeIcon className="relative w-7 h-7 drop-shadow-[0_0_10px_#f472b6]" />
              </div>
            </div>
          );
        })}

        {/* Layer 4A: Vùng giới hạn di chuyển của Cô Thảo & Thầy Tùng */}
        {config.showZoneBounds && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            <EditableZoneRect
              zoneKey="monk"
              bounds={config.monkZone}
              label="Vùng Di Chuyển Cô Thảo (Kéo 4 cạnh)"
              borderClass="border-fuchsia-400"
              bgClass="bg-fuchsia-500/15"
              textClass="text-fuchsia-200"
              handleColorClass="bg-fuchsia-400"
              onStartDragEdge={handleStartDragZoneEdge}
            />
            <EditableZoneRect
              zoneKey="supervisor"
              bounds={config.supervisorZone || SUPERVISOR_ZONE_BOUNDS}
              label="Vùng Di Chuyển Thầy Tùng (Kéo 4 cạnh)"
              borderClass="border-sky-400"
              bgClass="bg-sky-500/15"
              textClass="text-sky-200"
              handleColorClass="bg-sky-400"
              onStartDragEdge={handleStartDragZoneEdge}
            />
          </div>
        )}

        {/* Layer 4B: Kéo thả CẢ BÀN ĐÔI (1 bàn = 2 chỗ ngồi cố định) & Thêm/Bớt Bàn */}
        {config.showWaypoints && (() => {
          const selectedDeskIds = new Set<string>();
          vipDesks.forEach((d) => {
            if (
              selectedSeats.has(`vip:${d.leftIndex}`) ||
              selectedSeats.has(`vip:${d.rightIndex}`)
            ) {
              selectedDeskIds.add(d.deskId);
            }
          });
          normalDesks.forEach((d) => {
            if (
              selectedSeats.has(`normal:${d.leftIndex}`) ||
              selectedSeats.has(`normal:${d.rightIndex}`)
            ) {
              selectedDeskIds.add(d.deskId);
            }
          });

          const unifiedDesks = [
            ...vipDesks.map((d) => ({ kind: 'vip' as const, desk: d })),
            ...normalDesks.map((d) => ({ kind: 'normal' as const, desk: d })),
          ].sort((a, b) =>
            Math.abs(a.desk.centerY - b.desk.centerY) > 14
              ? a.desk.centerY - b.desk.centerY
              : a.desk.centerX - b.desk.centerX
          );

          const selectedDeskItems = unifiedDesks.filter(({ desk }) =>
            selectedDeskIds.has(desk.deskId)
          );

          const handleAlignSelectedHorizontal = () => {
            if (selectedDeskItems.length < 2) return;
            const avgY = Math.round(
              selectedDeskItems.reduce((sum, item) => sum + item.desk.centerY, 0) /
                selectedDeskItems.length
            );
            const targetY = Math.max(120, Math.min(945, avgY));
            const updates: Array<{
              kind: 'vip' | 'normal';
              index: number;
              pos: Point2D;
            }> = [];
            selectedDeskItems.forEach(({ kind, desk }) => {
              updates.push({
                kind,
                index: desk.leftIndex,
                pos: { x: desk.leftSlot.x, y: targetY },
              });
              if (desk.rightSlot && typeof desk.rightIndex === 'number') {
                updates.push({
                  kind,
                  index: desk.rightIndex,
                  pos: { x: desk.rightSlot.x, y: targetY },
                });
              }
            });
            if (onMoveWaypointsBatch) {
              onMoveWaypointsBatch(updates);
            } else {
              updates.forEach((u) => onMoveWaypoint(u.kind, u.index, u.pos));
            }
          };

          const handleAlignSelectedVertical = () => {
            if (selectedDeskItems.length < 2) return;
            const avgCenterX = Math.round(
              selectedDeskItems.reduce((sum, item) => sum + item.desk.centerX, 0) /
                selectedDeskItems.length
            );
            const updates: Array<{
              kind: 'vip' | 'normal';
              index: number;
              pos: Point2D;
            }> = [];
            selectedDeskItems.forEach(({ kind, desk }) => {
              const rightSlot = desk.rightSlot;
              const halfSpan = rightSlot
                ? Math.max(
                    14,
                    Math.round(Math.abs(rightSlot.x - desk.leftSlot.x) / 2)
                  )
                : 0;
              const leftX = Math.max(15, Math.min(525, avgCenterX - halfSpan));
              const rightX = Math.max(15, Math.min(525, avgCenterX + halfSpan));
              updates.push({
                kind,
                index: desk.leftIndex,
                pos: { x: leftX, y: desk.leftSlot.y },
              });
              if (rightSlot && typeof desk.rightIndex === 'number') {
                updates.push({
                  kind,
                  index: desk.rightIndex,
                  pos: { x: rightX, y: rightSlot.y },
                });
              }
            });
            if (onMoveWaypointsBatch) {
              onMoveWaypointsBatch(updates);
            } else {
              updates.forEach((u) => onMoveWaypoint(u.kind, u.index, u.pos));
            }
          };

          return (
            <div
              onMouseDown={handleStartMarquee}
              className="absolute inset-0 z-45 pointer-events-auto cursor-crosshair"
            >
              {/* Thanh công cụ Thêm / Bớt / Chọn Bàn Đôi & Căn Thẳng Hàng Ngang/Dọc dưới đáy màn hình */}
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-emerald-400/60 shadow-xl text-[9.5px] text-stone-200 w-[524px] max-w-[97%]"
              >
                <span className="text-emerald-300 font-extrabold mr-1">
                  Tổng: {unifiedDesks.length} bàn ({vipSlots.length + normalSlots.length} chỗ)
                </span>

                {onAddDesk && (
                  <button
                    type="button"
                    onClick={() => onAddDesk('normal')}
                    className="px-2 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/50 text-emerald-200 font-bold cursor-pointer"
                  >
                    + Thêm Bàn Đôi
                  </button>
                )}
                {onRemoveDesk && unifiedDesks.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      onRemoveDesk(normalDesks.length > 0 ? 'normal' : 'vip')
                    }
                    className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-200 font-bold cursor-pointer"
                  >
                    - Bớt Bàn Đôi
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setMultiSelectDeskMode((v) => !v)}
                  className={`px-2 py-0.5 rounded border font-bold cursor-pointer transition-colors ${
                    multiSelectDeskMode
                      ? 'bg-cyan-500/30 border-cyan-300 text-cyan-200'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-stone-300'
                  }`}
                  title="Bật để click chọn gộp nhiều bàn liên tiếp mà không cần giữ phím Shift (hoặc kéo chuột quét vùng)"
                >
                  {multiSelectDeskMode ? '☑️ Đang chọn nhiều bàn' : '⬜ Chọn nhiều bàn'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const all = new Set<SeatNodeKey>();
                    vipSlots.forEach((_, i) => all.add(`vip:${i}`));
                    normalSlots.forEach((_, i) => all.add(`normal:${i}`));
                    setSelectedSeats(all);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-stone-200 font-semibold cursor-pointer"
                >
                  Chọn hết ({unifiedDesks.length} bàn)
                </button>

                {selectedDeskIds.size >= 2 && (
                  <>
                    <button
                      type="button"
                      onClick={handleAlignSelectedHorizontal}
                      className="px-2 py-0.5 rounded bg-amber-500/30 hover:bg-amber-500/45 border border-amber-300 text-amber-200 font-extrabold cursor-pointer shadow"
                      title="Căn tất cả các bàn đang chọn thẳng 1 hàng ngang (cùng tung độ Y)"
                    >
                      📏 Căn thẳng hàng ngang ({selectedDeskIds.size} bàn)
                    </button>
                    <button
                      type="button"
                      onClick={handleAlignSelectedVertical}
                      className="px-2 py-0.5 rounded bg-cyan-500/30 hover:bg-cyan-500/45 border border-cyan-300 text-cyan-200 font-extrabold cursor-pointer shadow"
                      title="Căn tất cả các bàn đang chọn thẳng 1 hàng dọc (cùng hoành độ X)"
                    >
                      📐 Căn thẳng hàng dọc ({selectedDeskIds.size} bàn)
                    </button>
                  </>
                )}

                {selectedDeskIds.size > 0 && (
                  <>
                    {onRemoveDesksByIds && (
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveDesksByIds(Array.from(selectedDeskIds));
                          setSelectedSeats(new Set());
                        }}
                        className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer"
                      >
                        Xóa {selectedDeskIds.size} bàn chọn
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedSeats(new Set())}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-stone-300 cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </>
                )}
              </div>

              {marqueeBox && (
                <div
                  className="absolute border-2 border-cyan-400 bg-cyan-400/15 pointer-events-none z-50"
                  style={{
                    left: `${Math.min(marqueeBox.startX, marqueeBox.curX)}px`,
                    top: `${Math.min(marqueeBox.startY, marqueeBox.curY)}px`,
                    width: `${Math.abs(marqueeBox.curX - marqueeBox.startX)}px`,
                    height: `${Math.abs(marqueeBox.curY - marqueeBox.startY)}px`,
                  }}
                />
              )}

              {/* Các BÀN ĐÔI HỌC SINH ĐỒNG NHẤT (Mỗi bàn gồm 2 chỗ ngồi đi liền nhau, đánh số 1..N) */}
              {unifiedDesks.map(({ kind, desk }, dIdx) => {
                const isSelected = selectedDeskIds.has(desk.deskId);
                const deskNumber = dIdx + 1;
                return (
                  <div
                    key={desk.deskId}
                    onMouseDown={(e) => handleStartDeskDrag(kind, desk, e)}
                    onTouchStart={(e) => handleStartDeskDrag(kind, desk, e)}
                    title={`Kéo để di chuyển cả Bàn Đôi #${deskNumber} (2 chỗ ngồi)`}
                    className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-lg flex items-center justify-between px-1.5 shadow cursor-grab active:cursor-grabbing transition-transform select-none group ${
                      isSelected
                        ? 'bg-cyan-300/95 text-slate-950 border-2 border-yellow-300 ring-2 ring-cyan-300 scale-105'
                        : 'bg-emerald-500/85 hover:bg-emerald-400/95 text-slate-950 border border-white'
                    }`}
                    style={{
                      left: `${desk.centerX}px`,
                      top: `${desk.centerY}px`,
                      width: `${Math.round(desk.width * (config.deskScale ?? 1))}px`,
                      height: `${Math.max(24, Math.round(26 * (config.deskScale ?? 1)))}px`,
                    }}
                  >
                    <span className="w-4 h-4 rounded-full bg-amber-950/90 border border-amber-300 text-amber-200 text-[8px] font-mono font-extrabold flex items-center justify-center shrink-0">
                      {deskNumber}
                    </span>
                    <span className="text-[8.5px] font-extrabold font-mono tracking-tight">
                      Bàn {deskNumber}
                    </span>
                    <span className="w-3.5 h-3.5 rounded bg-slate-950/25 text-[7.5px] font-mono font-bold flex items-center justify-center shrink-0">
                      2C
                    </span>

                    {onRemoveDesk && unifiedDesks.length > 1 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveDesk(kind, desk.deskId);
                        }}
                        title={`Xóa Bàn #${deskNumber}`}
                        className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white border border-white text-[9px] font-black flex items-center justify-center shadow cursor-pointer transition-opacity"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Tâm điểm Nhóm Học Sinh Đứng Chùm Cửa Lớp (Kéo thả vị trí) */}
              {(config.doorCrowdCount ?? 7) > 0 && (() => {
                const crowdPos = config.doorCrowdPos || { x: 46, y: 506 };
                return (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingNode({ kind: 'doorCrowd', index: 0 });
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setDraggingNode({ kind: 'doorCrowd', index: 0 });
                    }}
                    title="Kéo để di chuyển vị trí Nhóm Học Sinh đứng chùm cửa lớp"
                    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-2 py-1 rounded-full bg-sky-500/90 hover:bg-sky-400 text-slate-950 border-2 border-white shadow-lg text-[8.5px] font-extrabold font-mono whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                    style={{
                      left: `${crowdPos.x}px`,
                      top: `${crowdPos.y}px`,
                    }}
                  >
                    🚪 Nhóm Cửa ({config.doorCrowdCount ?? 7})
                  </div>
                );
              })()}

              {/* Hàng ngang 5 chỗ phạt đứng trên bục (Kéo thả vị trí trung tâm) */}
              {(() => {
                const linePos = config.punishmentLinePos || { x: 270, y: 458 };
                const spacing = Math.max(24, config.punishmentLineSpacing || 52);
                return (
                  <>
                    {[0, 1, 2, 3, 4].map((slotIdx) => {
                      const sx = Math.round(linePos.x + (slotIdx - 2) * spacing);
                      const sy = Math.round(linePos.y);
                      return (
                        <div
                          key={`punish-slot-${slotIdx}`}
                          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-dashed border-amber-300 bg-rose-600/35 flex items-center justify-center text-[8px] font-mono font-black text-yellow-200 shadow"
                          style={{
                            left: `${sx}px`,
                            top: `${sy}px`,
                          }}
                        >
                          P{slotIdx + 1}
                        </div>
                      );
                    })}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'punishmentLine', index: 0 });
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'punishmentLine', index: 0 });
                      }}
                      title="Kéo để di chuyển Hàng Ngang 5 Chỗ Phạt Đứng"
                      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full bg-rose-600/95 hover:bg-rose-500 text-white border-2 border-yellow-300 shadow-lg text-[8.5px] font-extrabold font-mono whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                      style={{
                        left: `${linePos.x}px`,
                        top: `${linePos.y - 22}px`,
                      }}
                    >
                      ⚡ Hàng Phạt 5 Chỗ (Kéo)
                    </div>
                  </>
                );
              })()}

              {/* Tâm điểm Triệu Hồi Zombie (Ngoài cửa lớp), Vị Trí Zombie Đứng, Vị Trí Cô Thảo & Thầy Tùng khi Event */}
              {(() => {
                const zSpawn = config.zombieSpawnPos || { x: 42, y: 520 };
                const zStand = config.zombieStandPos || { x: 270, y: 486 };
                const zTeacher = config.zombieTeacherPos || { x: 392, y: 444 };
                const zSupervisor = config.zombieSupervisorPos || { x: 148, y: 498 };
                return (
                  <>
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieSpawn', index: 0 });
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieSpawn', index: 0 });
                      }}
                      title="Kéo để đặt vị trí Triệu Hồi Nhân Vật Sự Kiện (Zombie ngoài cửa)"
                      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-lime-500/95 hover:bg-lime-400 text-slate-950 border-2 border-white shadow-lg text-[8.5px] font-extrabold font-mono whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                      style={{
                        left: `${zSpawn.x}px`,
                        top: `${zSpawn.y}px`,
                      }}
                    >
                      🧟 Triệu Hồi Zombie
                    </div>

                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieStand', index: 0 });
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieStand', index: 0 });
                      }}
                      title="Kéo để đặt Vị Trí Zombie Đứng Chiến Đấu"
                      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full bg-red-600/95 hover:bg-red-500 text-white border-2 border-lime-300 shadow-lg text-[8.5px] font-extrabold font-mono whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                      style={{
                        left: `${zStand.x}px`,
                        top: `${zStand.y}px`,
                      }}
                    >
                      🎯 Vị Trí Zombie Đứng
                    </div>

                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieTeacher', index: 0 });
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieTeacher', index: 0 });
                      }}
                      title="Kéo để đặt Vị Trí Cô Thảo khi Event Zombie kích hoạt"
                      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-pink-500/95 hover:bg-pink-400 text-white border-2 border-yellow-200 shadow-lg text-[8.5px] font-extrabold font-mono whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                      style={{
                        left: `${zTeacher.x}px`,
                        top: `${zTeacher.y}px`,
                      }}
                    >
                      👩‍🏫 Vị Trí Cô Thảo (Event)
                    </div>

                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieSupervisor', index: 0 });
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setDraggingNode({ kind: 'zombieSupervisor', index: 0 });
                      }}
                      title="Kéo để đặt Vị Trí Thầy Tùng khi Event Zombie kích hoạt"
                      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-sky-500/95 hover:bg-sky-400 text-white border-2 border-yellow-200 shadow-lg text-[8.5px] font-extrabold font-mono whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                      style={{
                        left: `${zSupervisor.x}px`,
                        top: `${zSupervisor.y}px`,
                      }}
                    >
                      👨‍🏫 Vị Trí Thầy Tùng (Event)
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })()}

        {/* Layer 5: Draggable & Corner-Resizable HUD Boxes */}
        <StageHud
          config={config}
          hudLayout={config.hudLayout}
          classBoardState={classBoardState}
          zombieEventState={zombieEventState}
          customAssets={customAssets}
          lotusDonors={lotusDonors}
          dailyRecords={dailyRecords}
          onResetDailyRecords={onResetDailyRecords}
          pilgrims={pilgrims}
          waitingQueue={waitingQueue}
          queueCount={queueCount}
          floatingToasts={floatingToasts}
          grandEventProgress={grandEventProgress}
          grandEventTarget={config.grandEventTarget}
          isGrandEventActive={isGrandEventActive}
          eventBarFlashKey={eventBarFlashKey}
          currentPilgrimCount={activePilgrimCount}
          totalSeatCapacity={totalSeatCapacity}
          onStartDragHudBox={handleStartDragHudBox}
          onStartResizeHudBox={handleStartResizeHudBox}
        />

        {/* Layer 6: Hạt Bụi Phấn Bay Lên (Particle ưu tiên nằm trên tất cả các bảng và cả người) */}
        <canvas
          ref={dustCanvasRef}
          width={540}
          height={960}
          className="absolute inset-0 pointer-events-none z-40 will-change-transform"
          style={{
            transformOrigin: '270px 480px',
            transform: 'scale(1) translate(0px, 0px)',
          }}
        />
      </div>
    </div>
  );
};
