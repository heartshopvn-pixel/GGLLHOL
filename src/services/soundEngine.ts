import { CameraFocusReason, ClassroomGiftEventId, GameConfig } from '../types/game';
import {
  buildGoogleWarmDirectMirrorUrls,
  resolveGoogleWarmWebSpeechFallbackPitch,
} from '../utils/googleWarmFallback';

export type TTSStatusListener = (
  statusText: string,
  active: boolean,
  spokenText?: string
) => void;

export interface TTSQueueItemMeta {
  pilgrimId?: number;
  chatBubbleKey?: number;
  username?: string;
  reason?: CameraFocusReason;
  isBot?: boolean;
  isHostLive?: boolean;
  speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
  lang?: 'vi' | 'en';
  lessonFlowToken?: string;
  lessonStepLabel?: string;
}

export interface TTSQueueItem {
  id: string;
  text: string;
  isPriority: boolean;
  isHostLive?: boolean;
  lang?: 'vi' | 'en';
  addedAt: number;
  meta?: TTSQueueItemMeta;
}

export interface TtsVoiceDiagnosticIncident {
  id: string;
  timestamp: number;
  type: 'fallback' | 'server_switch' | 'disconnected' | 'interrupted';
  fromSource: string;
  toSource: string;
  reason: string;
  textSample?: string;
}

export interface TtsVoiceDiagnosticSnapshot {
  health: 'healthy' | 'server_switched' | 'fallback' | 'disconnected';
  configuredEngineLabel: string;
  activeServerLabel: string;
  statusHeadline: string;
  statusDetail: string;
  lastLatencyMs: number | null;
  lastUpdatedAt: number;
  totalFallbacks: number;
  totalServerSwitches: number;
  totalDisconnects: number;
  recentIncidents: TtsVoiceDiagnosticIncident[];
}

export interface EventTtsQueueSnapshot {
  waitingCount: number;
  isPlayingEvent: boolean;
  currentEventText: string;
  queueItems: string[];
  activeItem: TTSQueueItem | null;
  detailedQueue: TTSQueueItem[];
  diagnostic: TtsVoiceDiagnosticSnapshot;
}

export type EventTtsQueueListener = (snapshot: EventTtsQueueSnapshot) => void;

export type DharmaArticleChangeListener = (nextArticleId: string) => void;

export interface TeacherLiveVoiceStatus {
  active: boolean;
  currentText: string;
}

export type TeacherLiveStatusListener = (status: TeacherLiveVoiceStatus) => void;

export interface TeacherLiveVoiceOptions {
  volume?: number;
  rate?: number;
  pitch?: number;
  engine?: 'web_speech' | 'google_stream';
  voice?: string;
}

/**
 * Làm sạch comment trước khi đưa vào TTS:
 * 1. Loại bỏ toàn bộ icon / emoji / ký tự biểu tượng để tránh TTS đọc tên icon dài dòng gây trễ camera.
 * 2. Thu gọn các từ/cụm từ bị spam lặp lại liên tiếp trong cùng 1 câu.
 * 3. Giới hạn tối đa maxWords chữ trong câu đọc.
 */
export function sanitizeAndLimitSpeechText(
  rawText: string,
  maxWords = 25
): string {
  if (!rawText) return '';
  // Bỏ emoji, pictographs, dingbats, variation selectors
  let cleaned = String(rawText)
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27BF\uFE00-\uFE0F\u200D]/gu,
      ' '
    )
    .replace(/[~`!@#$%^&*()_+={}[\]|\\:;"'<>/]+/g, ' ')
    .replace(/([.,?-])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  // Thu gọn từ hoặc cụm 2-3 từ lặp lại liên tiếp (VD: "xin lộc xin lộc xin lộc" -> "xin lộc")
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  const dedupedWords: string[] = [];
  for (let i = 0; i < rawWords.length; i++) {
    const w = rawWords[i];
    const prev1 = dedupedWords[dedupedWords.length - 1];
    const prev2 = dedupedWords[dedupedWords.length - 2];
    if (
      prev1 &&
      prev2 &&
      w.toLowerCase() === prev1.toLowerCase() &&
      w.toLowerCase() === prev2.toLowerCase()
    ) {
      continue;
    }
    dedupedWords.push(w);
  }

  // Kiểm tra lặp cụm nửa câu (VD copy-paste 2-3 lần cùng 1 mệnh đề trong 1 comment)
  let collapsed = dedupedWords.join(' ');
  collapsed = collapsed.replace(
    /\b(\S+(?:\s+\S+){1,5})(?:\s+\1\b)+/gi,
    '$1'
  );

  const finalWords = collapsed.split(/\s+/).filter(Boolean);
  const limit = Math.max(3, Math.min(100, Number(maxWords) || 25));
  if (finalWords.length > limit) {
    return finalWords.slice(0, limit).join(' ');
  }
  return finalWords.join(' ');
}

function splitDharmaIntoSentences(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];
  const parts = rawText
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [rawText.trim()];

  // Chia nhỏ thêm nếu có câu quá dài (>180 ký tự) để đọc tự nhiên và hiện bong bóng chat Trụ trì vừa vặn
  const result: string[] = [];
  for (const p of parts) {
    if (p.length <= 180) {
      result.push(p);
    } else {
      const sub = p
        .split(/(?<=[,，])\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      let acc = '';
      for (const chunk of sub) {
        if ((acc + ' ' + chunk).trim().length <= 160) {
          acc = (acc ? acc + ', ' : '') + chunk;
        } else {
          if (acc) result.push(acc);
          acc = chunk;
        }
      }
      if (acc) result.push(acc);
    }
  }
  return result.length > 0 ? result : [rawText.trim()];
}

class TempleSoundService {
  private ctx: AudioContext | null = null;
  private ttsQueue: TTSQueueItem[] = [];
  private activeEventItem: TTSQueueItem | null = null;
  private isSpeaking = false;
  private isSpeakingDharma = false;
  private currentEventText = '';
  private currentAudio: HTMLAudioElement | null = null;
  private currentTtsBufferSource: AudioBufferSourceNode | null = null;
  private speechTokenSeq = 0;
  private mutedSimTimer: ReturnType<typeof setTimeout> | null = null;
  private activeFinishCallback: (() => void) | null = null;
  private recentSpokenMap = new Map<string, number>();
  private statusListeners = new Set<TTSStatusListener>();
  private queueListeners = new Set<EventTtsQueueListener>();
  private dharmaChangeListeners = new Set<DharmaArticleChangeListener>();
  private teacherLiveListeners = new Set<TeacherLiveStatusListener>();
  private teacherLiveTokenSeq = 0;
  private teacherLiveActive = false;
  private teacherLiveCurrentText = '';
  private teacherLiveCtx: AudioContext | null = null;
  private teacherLiveSourceNode: AudioBufferSourceNode | null = null;
  private teacherLiveGainNode: GainNode | null = null;
  private teacherLiveFallbackAudio: HTMLAudioElement | null = null;
  private teacherLiveSimTimer: ReturnType<typeof setTimeout> | null = null;
  private onStartEventItemCallback: ((item: TTSQueueItem) => void) | null = null;
  private onFinishEventItemCallback: ((item: TTSQueueItem) => void) | null = null;

  public setOnStartEventItem(cb: ((item: TTSQueueItem) => void) | null) {
    this.onStartEventItemCallback = cb;
  }

  public setOnFinishEventItem(cb: ((item: TTSQueueItem) => void) | null) {
    this.onFinishEventItemCallback = cb;
  }

  private notifyItemFinished(item: TTSQueueItem | null) {
    if (!item || !this.onFinishEventItemCallback) return;
    try {
      this.onFinishEventItemCallback(item);
    } catch {
      // Ignore callback error
    }
  }

  // Nhạc nền (BGM) state
  private bgmAudio: HTMLAudioElement | null = null;
  private currentBgmUrl: string | null = null;
  private synthBgmInterval: ReturnType<typeof setInterval> | null = null;
  private activeSynthPreset: string | null = null;
  private isZombieEventActive = false;
  private previewZombieBgmAudio: HTMLAudioElement | null = null;
  private currentApplauseAudio: HTMLAudioElement | null = null;
  private currentApplauseBufferSource: AudioBufferSourceNode | null = null;
  private applauseDurationMsCache = new Map<string, number>();
  private hasPrimedSilentUnlock = false;
  private cefKeepAliveSource: AudioBufferSourceNode | null = null;

  // Chế độ kể chuyện / thuyết pháp state
  private dharmaIndex = 0;
  private lastDharmaArticleId = '';
  private lastDharmaContent = '';
  private dharmaNextTimer: ReturnType<typeof setTimeout> | null = null;
  private latestConfig: GameConfig | null = null;

  private isStreamViewUrl(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const p = new URLSearchParams(window.location.search);
      return (
        p.get('obs') === '1' ||
        p.get('view') === 'live' ||
        p.get('mode') === 'live'
      );
    } catch {
      return false;
    }
  }

  private localTabMuted = (() => {
    if (typeof window !== 'undefined') {
      try {
        const p = new URLSearchParams(window.location.search);
        if (
          p.get('obs') === '1' ||
          p.get('view') === 'live' ||
          p.get('mode') === 'live'
        ) {
          return false; // OBS / TikTok Live Studio screen always has audio enabled
        }
        return sessionStorage.getItem('chua_silent_admin_tab') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  })();

  private ensureCefAudioKeepAlive() {
    if (!this.ctx || this.cefKeepAliveSource || this.localTabMuted) return;
    if (!this.isStreamViewUrl()) return;
    try {
      // Tạo xung âm thanh siêu tĩnh (-100 dB, tai người hoàn toàn không nghe thấy) lặp vô hạn trên WebAudio:
      // Giúp nhân Chromium/CEF của TikTok Live Studio & OBS nhận diện tiến trình đang phát Media (IsAudioPlaying = true)
      // nên TUYỆT ĐỐI KHÔNG BAO GIỜ đóng băng tiến trình (Renderer Background Freeze) khi chạy ngầm!
      const sr = this.ctx.sampleRate || 44100;
      const keepBuf = this.ctx.createBuffer(1, sr, sr);
      const ch = keepBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i += 64) {
        ch[i] = (i & 64 ? 1 : -1) * 1e-5;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = keepBuf;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(0);
      this.cefKeepAliveSource = src;
    } catch {
      // Ignore
    }
  }

  public primeAudioUnlock() {
    if (typeof window === 'undefined' || this.localTabMuted) return;
    try {
      this.initCtx();
      this.initTeacherLiveCtx();
      if (this.ctx && !this.hasPrimedSilentUnlock) {
        const silentBuf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate || 44100);
        const src = this.ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(this.ctx.destination);
        src.start(0);
        this.hasPrimedSilentUnlock = true;
      }
      this.ensureCefAudioKeepAlive();
      if (
        this.bgmAudio &&
        this.bgmAudio.paused &&
        this.latestConfig?.bgmEnabled &&
        !this.localTabMuted &&
        !this.remoteSlaveMode
      ) {
        void this.bgmAudio.play().catch(() => {});
      }
    } catch {
      // Ignore
    }
  }

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.primeAudioUnlock();
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });

      // Trên TikTok Live Studio / OBS Browser Source (?obs=1), không có thao tác chuột của người dùng -> tự động kích hoạt mở khóa AudioContext & Keep-Alive ngay khi tải trang!
      if (this.isStreamViewUrl()) {
        setTimeout(() => {
          this.primeAudioUnlock();
        }, 180);
      }
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    this.ensureCefAudioKeepAlive();
  }

  private initTeacherLiveCtx(): AudioContext | null {
    if (!this.teacherLiveCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      // Dùng tần số lấy mẫu chuẩn phần cứng trên kênh AudioContext độc lập thứ 2 (tránh lỗi câm tiếng WASAPI/OBS CEF khi ép 24kHz trên thiết bị 48kHz)
      this.teacherLiveCtx = new AudioCtx();
    }
    if (this.teacherLiveCtx.state === 'suspended') {
      void this.teacherLiveCtx.resume().catch(() => {});
    }
    return this.teacherLiveCtx;
  }

  private audioBlobCache = new Map<string, string>();
  private audioBlobMetaCache = new Map<
    string,
    {
      source: string;
      switchedMirror: boolean;
      failReason?: string;
      latencyMs: number;
    }
  >();
  private inFlightPrefetches = new Map<string, Promise<string | null>>();
  private readonly MAX_BLOB_CACHE = 90;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  private ttsDiagnostic: TtsVoiceDiagnosticSnapshot = {
    health: 'healthy',
    configuredEngineLabel: 'Google Warm',
    activeServerLabel: 'Google Warm (Sẵn sàng)',
    statusHeadline: 'Ổn định • Sẵn sàng phát giọng Google Warm (Tự động Fallback)',
    statusDetail:
      'Ưu tiên Google Warm + RAM Cache 0ms • Khi nghẽn tự chuyển Mirror & Web Speech',
    lastLatencyMs: null,
    lastUpdatedAt: Date.now(),
    totalFallbacks: 0,
    totalServerSwitches: 0,
    totalDisconnects: 0,
    recentIncidents: [],
  };

  private normalizeEngineChoice(raw?: string): 'web_speech' | 'google_stream' {
    return raw === 'web_speech' ? 'web_speech' : 'google_stream';
  }

  private getConfiguredEngineLabel(config?: GameConfig | null): string {
    const engine = this.normalizeEngineChoice(
      config?.ttsEngine || this.latestConfig?.ttsEngine
    );
    if (engine === 'web_speech') return 'Web Speech Tiếng Việt';
    return 'Google Warm';
  }

  private recordTtsDiagnosticIncident(
    incident: Omit<TtsVoiceDiagnosticIncident, 'id' | 'timestamp'>,
    patch?: Partial<
      Pick<
        TtsVoiceDiagnosticSnapshot,
        | 'health'
        | 'activeServerLabel'
        | 'statusHeadline'
        | 'statusDetail'
        | 'lastLatencyMs'
      >
    >
  ) {
    const now = Date.now();
    const entry: TtsVoiceDiagnosticIncident = {
      ...incident,
      id: `tts_inc_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
    };
    this.ttsDiagnostic = {
      ...this.ttsDiagnostic,
      configuredEngineLabel: this.getConfiguredEngineLabel(this.latestConfig),
      health:
        patch?.health ||
        (incident.type === 'fallback'
          ? 'fallback'
          : incident.type === 'server_switch'
          ? 'server_switched'
          : incident.type === 'disconnected'
          ? 'disconnected'
          : this.ttsDiagnostic.health),
      activeServerLabel:
        patch?.activeServerLabel || this.ttsDiagnostic.activeServerLabel,
      statusHeadline:
        patch?.statusHeadline || incident.reason,
      statusDetail:
        patch?.statusDetail ||
        `${incident.fromSource} ➔ ${incident.toSource}`,
      lastLatencyMs:
        patch?.lastLatencyMs !== undefined
          ? patch.lastLatencyMs
          : this.ttsDiagnostic.lastLatencyMs,
      lastUpdatedAt: now,
      totalFallbacks:
        this.ttsDiagnostic.totalFallbacks +
        (incident.type === 'fallback' ? 1 : 0),
      totalServerSwitches:
        this.ttsDiagnostic.totalServerSwitches +
        (incident.type === 'server_switch' ? 1 : 0),
      totalDisconnects:
        this.ttsDiagnostic.totalDisconnects +
        (incident.type === 'disconnected' ? 1 : 0),
      recentIncidents: [entry, ...this.ttsDiagnostic.recentIncidents].slice(
        0,
        15
      ),
    };
    this.emitEventQueue();
  }

  public clearTtsDiagnosticHistory() {
    this.ttsDiagnostic = {
      health: 'healthy',
      configuredEngineLabel: this.getConfiguredEngineLabel(this.latestConfig),
      activeServerLabel: this.ttsDiagnostic.activeServerLabel,
      statusHeadline: 'Ổn định • Đã làm mới bộ đếm theo dõi giọng đọc',
      statusDetail: 'Đang giám sát kết nối máy chủ giọng đọc theo thời gian thực',
      lastLatencyMs: this.ttsDiagnostic.lastLatencyMs,
      lastUpdatedAt: Date.now(),
      totalFallbacks: 0,
      totalServerSwitches: 0,
      totalDisconnects: 0,
      recentIncidents: [],
    };
    this.emitEventQueue();
  }

  private buildDirectGoogleWarmStreamUrl(text: string): string {
    const mirrors = buildGoogleWarmDirectMirrorUrls(text, 180);
    return (
      mirrors[0]?.url ||
      `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(
        (text || '').replace(/\s+/g, ' ').trim().slice(0, 180)
      )}`
    );
  }

  private async fetchSingleAudioBlobCandidate(
    candidateUrl: string,
    timeoutMs: number
  ): Promise<{
    blob: Blob;
    rawSource: string;
    switchedMirror: boolean;
    decodedFail?: string;
    latencyMs: number;
  } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();
    try {
      const res = await fetch(candidateUrl, { signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Math.max(1, Date.now() - startMs);
      if (!res.ok) return null;
      const contentType = (
        res.headers.get('content-type') || ''
      ).toLowerCase();
      if (
        contentType.includes('text/html') ||
        contentType.includes('application/json')
      ) {
        return null;
      }
      const rawSource =
        res.headers.get('X-TTS-Source') ||
        (candidateUrl.includes('/api/tts') || candidateUrl.includes('/tts')
          ? 'google-gtx'
          : 'node-local');
      const switchedMirror = res.headers.get('X-TTS-Switched') === '1';
      const rawFail = res.headers.get('X-TTS-Fail-Reason') || '';
      let decodedFail: string | undefined;
      if (rawFail) {
        try {
          decodedFail = decodeURIComponent(rawFail);
        } catch {
          decodedFail = rawFail;
        }
      }
      const blob = await res.blob();
      if (!blob || blob.size < 128) return null;
      return { blob, rawSource, switchedMirror, decodedFail, latencyMs };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  private getOrFetchAudioBlobUrl(url: string, timeoutMs = 2800): Promise<string | null> {
    const cached = this.audioBlobCache.get(url);
    if (cached) {
      this.audioBlobCache.delete(url);
      this.audioBlobCache.set(url, cached);
      const oldMeta = this.audioBlobMetaCache.get(url);
      this.audioBlobMetaCache.set(url, {
        source: 'ram-cache',
        switchedMirror: Boolean(oldMeta?.switchedMirror),
        failReason: oldMeta?.failReason,
        latencyMs: 0,
      });
      return Promise.resolve(cached);
    }
    const existingPromise = this.inFlightPrefetches.get(url);
    if (existingPromise) return existingPromise;

    const p = (async () => {
      // 1. Thử máy chủ hiện tại (/api/tts)
      let fetched = await this.fetchSingleAudioBlobCandidate(url, timeoutMs);

      // 2. Nếu host hiện tại là static host hoặc IP cloud bị Google giới hạn 429/502 -> thử cổng local server.js (127.0.0.1:8080) trên máy người dùng (vẫn 100% cùng giọng Google Warm)
      if (
        !fetched &&
        url.startsWith('/api/tts') &&
        typeof window !== 'undefined' &&
        window.location.port !== '8080'
      ) {
        fetched = await this.fetchSingleAudioBlobCandidate(
          `http://127.0.0.1:8080${url}`,
          950
        );
      }

      if (!fetched) return null;

      const { blob, rawSource, switchedMirror, decodedFail, latencyMs } = fetched;
      const blobUrl = URL.createObjectURL(blob);

      if (this.audioBlobCache.size >= this.MAX_BLOB_CACHE) {
        const oldestKey = this.audioBlobCache.keys().next().value;
        if (oldestKey) {
          const oldBlobUrl = this.audioBlobCache.get(oldestKey);
          if (
            oldBlobUrl &&
            this.currentAudio?.src !== oldBlobUrl &&
            this.teacherLiveFallbackAudio?.src !== oldBlobUrl
          ) {
            try {
              URL.revokeObjectURL(oldBlobUrl);
            } catch {
              // Ignore
            }
          }
          this.audioBlobCache.delete(oldestKey);
          this.audioBlobMetaCache.delete(oldestKey);
        }
      }
      this.audioBlobCache.set(url, blobUrl);
      this.audioBlobMetaCache.set(url, {
        source: rawSource,
        switchedMirror,
        failReason: decodedFail,
        latencyMs,
      });
      return blobUrl;
    })().finally(() => {
      this.inFlightPrefetches.delete(url);
    });

    this.inFlightPrefetches.set(url, p);
    return p;
  }

  private normalizeEnglishVocabText(rawText: string): string {
    const trimmed = (rawText || '').trim();
    if (/^[A-Z\s'-]{2,}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return trimmed;
  }

  private buildEffectiveItemConfig(
    config: GameConfig,
    isHostLive?: boolean,
    speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none'
  ): GameConfig {
    if (isHostLive) {
      const resolvedHostEngine = this.normalizeEngineChoice(
        config.hostTtsEngine || config.ttsEngine
      );
      return {
        ...config,
        ttsEnabled: true,
        ttsEngine: resolvedHostEngine,
        nodeVoice: 'google-vi-warm',
        selectedSystemVoiceURI:
          config.hostSystemVoiceURI || config.selectedSystemVoiceURI || '',
        ttsRate: config.hostTtsRate ?? config.ttsRate ?? 1.05,
        ttsPitch: config.hostTtsPitch ?? config.ttsPitch ?? 0.88,
        ttsVolume: config.hostTtsVolume ?? config.ttsVolume ?? 1.0,
        ttsReverb: 0,
      };
    }

    // Thoại của Thầy Cá (senior_novice, ví dụ Luồng 4 Sự Kiện Zombie): bắt buộc dùng giọng Nam Google Warm trầm ấm
    if (speakerRole === 'senior_novice') {
      return {
        ...config,
        ttsEngine: 'google_stream',
        nodeVoice: 'google-vi-warm',
        ttsRate: config.teacherLiveRate ?? config.ttsRate ?? 1.05,
        ttsPitch: Math.max(
          0.68,
          Math.min(0.86, config.teacherLivePitch ?? 0.84)
        ),
        ttsVolume: config.ttsVolume ?? 1.0,
      };
    }

    const resolvedEngine = this.normalizeEngineChoice(config.ttsEngine);
    return {
      ...config,
      ttsEngine: resolvedEngine,
      nodeVoice: 'google-vi-warm',
      ttsRate: config.ttsRate ?? 1.05,
      ttsPitch: config.ttsPitch ?? 0.88,
      ttsVolume: config.ttsVolume ?? 1.0,
    };
  }

  private buildStreamUrlForEngine(
    text: string,
    config: GameConfig,
    isHostLive = false,
    lang: 'vi' | 'en' = 'vi',
    speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none'
  ): string | null {
    // Từ vựng Tiếng Anh 100% đọc bằng Web Speech nước ngoài, không bao giờ gọi /api/tts
    if (lang === 'en') return null;
    const eff = this.buildEffectiveItemConfig(config, isHostLive, speakerRole);
    if (eff.ttsEngine === 'web_speech') return null;
    const shortText = (text || '').trim().slice(0, 195);
    if (!shortText) return null;
    return `/api/tts?lang=vi&voice=google-vi-warm&text=${encodeURIComponent(
      shortText
    )}`;
  }

  private prefetchNextQueueItems(config: GameConfig) {
    if (this.localTabMuted || this.remoteSlaveMode) return;
    if (this.inFlightPrefetches.size >= 4) return;
    const nextItem = this.ttsQueue[0];
    if (!nextItem) return;
    const streamUrl = this.buildStreamUrlForEngine(
      nextItem.text,
      config,
      Boolean(nextItem.isHostLive),
      nextItem.lang || nextItem.meta?.lang || 'vi',
      nextItem.meta?.speakerRole
    );
    if (streamUrl) {
      void this.getOrFetchAudioBlobUrl(streamUrl, 3200);
    }
  }

  private remoteSlaveMode = false;
  private remoteMasterQueueSnapshot: EventTtsQueueSnapshot | null = null;

  public isRemoteSlaveMode(): boolean {
    return this.remoteSlaveMode;
  }

  public setRemoteSlaveMode(active: boolean) {
    if (this.remoteSlaveMode === active) return;
    this.remoteSlaveMode = active;
    if (active) {
      const pendingItemsToNotify: TTSQueueItem[] = [];
      if (this.activeEventItem) {
        pendingItemsToNotify.push(this.activeEventItem);
      }
      if (this.ttsQueue.length > 0) {
        pendingItemsToNotify.push(...this.ttsQueue);
      }
      this.stopBgmInternal();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (this.currentAudio) {
        try {
          this.currentAudio.onended = null;
          this.currentAudio.onerror = null;
          this.currentAudio.pause();
          this.currentAudio.removeAttribute('src');
          this.currentAudio = null;
        } catch {
          // Ignore
        }
      }
      this.stopCurrentTtsBufferSourceOnly();
      if (this.mutedSimTimer) {
        clearTimeout(this.mutedSimTimer);
        this.mutedSimTimer = null;
      }
      this.ttsQueue = [];
      this.activeEventItem = null;
      this.isSpeaking = false;
      this.isSpeakingDharma = false;
      this.currentEventText = '';
      this.stopTeacherLiveAudioNodesOnly();
      for (const item of pendingItemsToNotify) {
        this.notifyItemFinished(item);
      }
    } else {
      this.remoteMasterQueueSnapshot = null;
      if (this.latestConfig && !this.localTabMuted) {
        this.syncConfig(this.latestConfig);
      }
    }
    this.emitEventQueue();
  }

  public applyMasterQueueSnapshot(
    snapshot: EventTtsQueueSnapshot,
    status?: { text: string; active: boolean }
  ) {
    if (!snapshot) return;
    this.remoteMasterQueueSnapshot = snapshot;
    if (snapshot.diagnostic) {
      this.ttsDiagnostic = snapshot.diagnostic;
    }
    if (status) {
      this.emitStatus(
        status.text,
        status.active,
        snapshot.currentEventText || ''
      );
    }
    const snap = this.getEventQueueSnapshot();
    this.queueListeners.forEach((fn) => fn(snap));
  }

  public isTabMuted(): boolean {
    return this.localTabMuted || this.remoteSlaveMode;
  }

  public setTabMuted(muted: boolean) {
    this.localTabMuted = muted;
    try {
      sessionStorage.setItem('chua_silent_admin_tab', muted ? 'true' : 'false');
    } catch {
      // Ignore restricted CEF storage
    }
    if (muted) {
      this.stopBgmInternal();
      this.stopApplauseSfx();
      if (this.previewZombieBgmAudio) {
        try {
          this.previewZombieBgmAudio.pause();
        } catch {
          // Ignore
        }
        this.previewZombieBgmAudio = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (this.currentAudio) {
        try {
          this.currentAudio.onended = null;
          this.currentAudio.onerror = null;
          this.currentAudio.pause();
          this.currentAudio.removeAttribute('src');
          this.currentAudio = null;
        } catch {
          // Ignore
        }
      }
      this.stopCurrentTtsBufferSourceOnly();
      this.stopTeacherLiveIndependent();
      // Nếu đang đọc dở câu khi bấm Tắt tiếng tab (Cách 1), chuyển ngay sang bộ đếm giả lập để luồng tiết học không bị kẹt
      if (this.isSpeaking && this.activeFinishCallback && !this.mutedSimTimer) {
        const pendingFinish = this.activeFinishCallback;
        this.mutedSimTimer = setTimeout(() => {
          this.mutedSimTimer = null;
          pendingFinish();
        }, 650);
      }
    } else if (this.latestConfig && !this.remoteSlaveMode) {
      this.syncConfig(this.latestConfig);
    }
  }

  public subscribeStatus(fn: TTSStatusListener) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  public subscribeEventQueue(fn: EventTtsQueueListener) {
    this.queueListeners.add(fn);
    fn(this.getEventQueueSnapshot());
    return () => this.queueListeners.delete(fn);
  }

  public getEventQueueSnapshot(): EventTtsQueueSnapshot {
    if (this.remoteSlaveMode && this.remoteMasterQueueSnapshot) {
      return this.remoteMasterQueueSnapshot;
    }
    const isPlayingEvent = this.isSpeaking && !this.isSpeakingDharma;
    return {
      waitingCount: this.ttsQueue.length,
      isPlayingEvent,
      currentEventText: isPlayingEvent ? this.currentEventText : '',
      queueItems: this.ttsQueue.map((item) => item.text),
      activeItem: isPlayingEvent ? this.activeEventItem : null,
      detailedQueue: [...this.ttsQueue],
      diagnostic: {
        ...this.ttsDiagnostic,
        configuredEngineLabel: this.getConfiguredEngineLabel(this.latestConfig),
        recentIncidents: [...this.ttsDiagnostic.recentIncidents],
      },
    };
  }

  private emitEventQueue() {
    const snap = this.getEventQueueSnapshot();
    this.queueListeners.forEach((fn) => fn(snap));
  }

  public clearEventQueue() {
    const oldQueue = [...this.ttsQueue];
    const oldActive = this.activeEventItem;
    this.ttsQueue = [];
    if (this.isSpeaking && !this.isSpeakingDharma) {
      this.stopCurrentUtteranceOnly();
      if (this.latestConfig?.dharmaEnabled) {
        this.scheduleNextDharmaStep(250);
      }
    }
    this.emitEventQueue();
    if (oldActive) this.notifyItemFinished(oldActive);
    oldQueue.forEach((it) => this.notifyItemFinished(it));
  }

  public skipCurrentEvent(config?: GameConfig) {
    const cfg = config || this.latestConfig;
    const oldActive = this.activeEventItem;
    if (this.isSpeaking && !this.isSpeakingDharma) {
      this.stopCurrentUtteranceOnly();
      if (oldActive) this.notifyItemFinished(oldActive);
      if (cfg) {
        this.processQueue(cfg);
      }
    } else if (this.ttsQueue.length > 0 && cfg) {
      this.processQueue(cfg);
    } else {
      this.emitEventQueue();
    }
  }

  public removeEventQueueItemById(id: string) {
    const removed = this.ttsQueue.filter((item) => item.id === id);
    this.ttsQueue = this.ttsQueue.filter((item) => item.id !== id);
    this.emitEventQueue();
    removed.forEach((it) => this.notifyItemFinished(it));
  }

  public subscribeDharmaArticleChange(fn: DharmaArticleChangeListener) {
    this.dharmaChangeListeners.add(fn);
    return () => this.dharmaChangeListeners.delete(fn);
  }

  private emitStatus(text: string, active: boolean, spokenText?: string) {
    this.statusListeners.forEach((fn) => fn(text, active, spokenText));
  }

  private emitDharmaArticleChange(nextArticleId: string) {
    this.dharmaChangeListeners.forEach((fn) => fn(nextArticleId));
  }

  public getBusyState(): boolean {
    return this.isSpeaking || this.ttsQueue.length > 0;
  }

  /**
   * Đồng bộ cấu hình Nhạc nền & Thuyết pháp khi config thay đổi
   */
  public syncConfig(config: GameConfig) {
    const prevDharmaEnabled = this.latestConfig?.dharmaEnabled;
    const prevActiveDharmaId = this.latestConfig?.activeDharmaId;
    this.latestConfig = config;

    // Cập nhật tức thì tốc độ & âm lượng nếu đang phát HTMLAudioElement (Google Warm)
    if (this.currentAudio) {
      try {
        const isHost = Boolean(
          this.activeEventItem?.isHostLive ||
            this.activeEventItem?.meta?.isHostLive
        );
        const effCfg = this.buildEffectiveItemConfig(
          config,
          isHost,
          this.activeEventItem?.meta?.speakerRole
        );
        const { effectiveRate, preservePitch } =
          this.computeStreamPlaybackRateAndPitch('google-vi-warm', effCfg);
        this.applyAudioPlaybackParams(
          this.currentAudio,
          effectiveRate,
          preservePitch,
          effCfg.ttsVolume
        );
      } catch {
        // Ignore live audio update error
      }
    }

    // Cập nhật tức thì âm lượng Giọng Thầy Giáo độc lập nếu đang phát song song
    const activeTeacherCtx = this.teacherLiveCtx || this.ctx;
    if (this.teacherLiveGainNode && activeTeacherCtx) {
      try {
        const nextTeacherVol = Math.max(
          0,
          Math.min(2.0, Number(config.teacherLiveVolume ?? 1.0))
        );
        this.teacherLiveGainNode.gain.setValueAtTime(
          nextTeacherVol,
          activeTeacherCtx.currentTime
        );
      } catch {
        // Ignore
      }
    }
    if (this.teacherLiveFallbackAudio) {
      try {
        this.teacherLiveFallbackAudio.volume = Math.max(
          0,
          Math.min(1.0, Number(config.teacherLiveVolume ?? 1.0))
        );
      } catch {
        // Ignore
      }
    }

    this.preloadApplauseDuration(config.applauseMp3Url);
    this.syncBgm(config);

    // Nếu tắt chế độ thuyết pháp khi đang đọc thuyết pháp -> ngắt câu thuyết pháp hiện tại ngay
    if (prevDharmaEnabled && !config.dharmaEnabled) {
      if (this.dharmaNextTimer) {
        clearTimeout(this.dharmaNextTimer);
        this.dharmaNextTimer = null;
      }
      if (this.isSpeakingDharma) {
        this.stopCurrentUtteranceOnly();
      }
    } else if (config.dharmaEnabled) {
      if (prevActiveDharmaId && prevActiveDharmaId !== config.activeDharmaId) {
        this.dharmaIndex = 0;
        if (this.isSpeakingDharma) {
          this.stopCurrentUtteranceOnly();
        }
      }
      if (!this.isSpeaking && this.ttsQueue.length === 0) {
        this.scheduleNextDharmaStep(200);
      }
    }
  }

  private stopCurrentUtteranceOnly() {
    this.speechTokenSeq++;
    this.isSpeaking = false;
    this.isSpeakingDharma = false;
    this.currentEventText = '';
    this.activeEventItem = null;
    this.activeFinishCallback = null;
    if (this.mutedSimTimer) {
      clearTimeout(this.mutedSimTimer);
      this.mutedSimTimer = null;
    }
    const hadFlowUtterance = Boolean(this.currentUtterance);
    if (this.currentUtterance) {
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }
    if (
      hadFlowUtterance &&
      !this.teacherLiveUtterance &&
      'speechSynthesis' in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.removeAttribute('src');
        this.currentAudio.load();
        this.currentAudio = null;
      } catch {
        // Ignore
      }
    }
    this.stopCurrentTtsBufferSourceOnly();
    this.emitStatus('Sẵn sàng', false, '');
    this.emitEventQueue();
  }

  private stopCurrentTtsBufferSourceOnly() {
    if (!this.currentTtsBufferSource) return;
    try {
      this.currentTtsBufferSource.onended = null;
      this.currentTtsBufferSource.stop();
      this.currentTtsBufferSource.disconnect();
    } catch {
      // Ignore
    }
    this.currentTtsBufferSource = null;
  }

  /**
   * Khi Browser Source trên TikTok Live Studio / OBS chặn HTML5 <audio>.play() (NotAllowedError)
   * dù đã tải xong MP3 blobUrl hợp lệ, thử giải mã và phát qua WebAudio AudioContext trước khi fallback.
   */
  private async tryPlayBlobViaWebAudio(
    blobUrl: string,
    effectiveRate: number,
    volume: number,
    token: number,
    onStarted: (durationSec: number) => void,
    onEnded: () => void,
    maleWarmOptions?: { desiredRate: number; desiredPitch: number }
  ): Promise<boolean> {
    try {
      this.initCtx();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {
          // Ignore
        }
      }
      if (this.ctx.state !== 'running') {
        return false;
      }
      const res = await fetch(blobUrl);
      const arrBuf = await res.arrayBuffer();
      if (token !== this.speechTokenSeq) return true;

      const decoded = await this.ctx.decodeAudioData(arrBuf.slice(0));
      if (token !== this.speechTokenSeq || !this.ctx || this.ctx.state !== 'running') {
        return false;
      }

      this.stopCurrentTtsBufferSourceOnly();
      const source = this.ctx.createBufferSource();
      let playbackRateForSource = Math.max(0.5, Math.min(2.0, effectiveRate || 1));
      let bufferToPlay = decoded;
      let warmthFilter: BiquadFilterNode | null = null;
      let clarityFilter: BiquadFilterNode | null = null;

      if (maleWarmOptions) {
        const pitch = Math.max(0.68, Math.min(0.9, maleWarmOptions.desiredPitch));
        const rate = Math.max(0.6, Math.min(2.0, maleWarmOptions.desiredRate));
        const tempo = rate / pitch;
        bufferToPlay = this.wsolaTimeStretchAudioBuffer(this.ctx, decoded, tempo);
        playbackRateForSource = pitch;

        warmthFilter = this.ctx.createBiquadFilter();
        warmthFilter.type = 'lowshelf';
        warmthFilter.frequency.setValueAtTime(175, this.ctx.currentTime);
        warmthFilter.gain.setValueAtTime(2.5, this.ctx.currentTime);

        clarityFilter = this.ctx.createBiquadFilter();
        clarityFilter.type = 'peaking';
        clarityFilter.frequency.setValueAtTime(2700, this.ctx.currentTime);
        clarityFilter.Q.setValueAtTime(1.1, this.ctx.currentTime);
        clarityFilter.gain.setValueAtTime(1.8, this.ctx.currentTime);
      }

      source.buffer = bufferToPlay;
      source.playbackRate.value = playbackRateForSource;

      const gain = this.ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(2.0, volume ?? 1));
      if (warmthFilter && clarityFilter) {
        source.connect(warmthFilter);
        warmthFilter.connect(clarityFilter);
        clarityFilter.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(this.ctx.destination);

      this.currentTtsBufferSource = source;
      onStarted(bufferToPlay.duration / Math.max(0.4, playbackRateForSource));

      source.onended = () => {
        if (this.currentTtsBufferSource === source) {
          this.currentTtsBufferSource = null;
        }
        try {
          source.disconnect();
          warmthFilter?.disconnect();
          clarityFilter?.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
        if (token === this.speechTokenSeq) {
          onEnded();
        }
      };

      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  private currentBgmTrackId: string | null = null;
  private synthBgmNoteCount = 0;
  private onBgmTrackChangeCallback: ((nextTrackId: string) => void) | null = null;

  public setOnBgmTrackChange(cb: ((nextTrackId: string) => void) | null) {
    this.onBgmTrackChangeCallback = cb;
  }

  private pickNextBgmTrackId(
    tracks: NonNullable<GameConfig['bgmTracks']>,
    currentTrackId: string | null | undefined,
    mode: 'sequential' | 'loop_one' | 'shuffle'
  ): string | null {
    if (!tracks.length) return null;
    if (tracks.length === 1) return tracks[0].id;
    const curIdx = Math.max(
      0,
      tracks.findIndex((t) => t.id === currentTrackId)
    );
    if (mode === 'loop_one') {
      return tracks[curIdx]?.id || tracks[0].id;
    }
    if (mode === 'shuffle') {
      const offset = 1 + Math.floor(Math.random() * (tracks.length - 1));
      return tracks[(curIdx + offset) % tracks.length].id;
    }
    return tracks[(curIdx + 1) % tracks.length].id;
  }

  private handleBgmTrackEnded() {
    const cfg = this.latestConfig;
    if (!cfg || !cfg.bgmEnabled || this.localTabMuted || this.isZombieEventActive) {
      return;
    }
    const tracks = cfg.bgmTracks || [];
    if (!tracks.length) return;
    const mode = cfg.bgmPlayMode || 'sequential';
    if (mode === 'loop_one' || tracks.length <= 1) {
      if (this.bgmAudio) {
        this.bgmAudio.currentTime = 0;
        void this.bgmAudio.play().catch(() => {});
      }
      return;
    }
    const nextId = this.pickNextBgmTrackId(
      tracks,
      this.currentBgmTrackId || cfg.activeBgmTrackId,
      mode
    );
    if (!nextId) return;
    this.latestConfig = {
      ...cfg,
      activeBgmTrackId: nextId,
    };
    this.syncBgm(this.latestConfig);
    this.onBgmTrackChangeCallback?.(nextId);
  }

  private stopBgmInternal() {
    if (this.bgmAudio) {
      try {
        this.bgmAudio.onended = null;
        this.bgmAudio.pause();
        this.bgmAudio = null;
      } catch {
        // Ignore
      }
    }
    this.currentBgmUrl = null;
    this.currentBgmTrackId = null;
    this.synthBgmNoteCount = 0;
    if (this.synthBgmInterval) {
      clearInterval(this.synthBgmInterval);
      this.synthBgmInterval = null;
    }
    this.activeSynthPreset = null;
  }

  public setZombieEventActive(active: boolean, config?: GameConfig) {
    const next = Boolean(active);
    if (this.isZombieEventActive === next && !config) return;
    this.isZombieEventActive = next;
    const cfg = config || this.latestConfig;
    if (cfg) {
      this.syncBgm(cfg);
    } else if (!next) {
      this.stopBgmInternal();
    }
  }

  public previewZombieBgm(config: GameConfig) {
    if (this.localTabMuted) return;
    if (this.previewZombieBgmAudio) {
      try {
        this.previewZombieBgmAudio.pause();
      } catch {
        // Ignore
      }
      this.previewZombieBgmAudio = null;
      return;
    }
    const vol = Math.max(0.05, Math.min(1, config.zombieBgmVolume ?? 0.55));
    if (config.zombieBgmMp3Url) {
      try {
        const audio = new Audio(config.zombieBgmMp3Url);
        audio.volume = vol;
        this.previewZombieBgmAudio = audio;
        audio.onended = () => {
          if (this.previewZombieBgmAudio === audio) {
            this.previewZombieBgmAudio = null;
          }
        };
        audio.play().catch(() => {});
        setTimeout(() => {
          if (this.previewZombieBgmAudio === audio) {
            try {
              audio.pause();
            } catch {
              // Ignore
            }
            this.previewZombieBgmAudio = null;
          }
        }, 6000);
        return;
      } catch {
        // Fallback to synth preview
      }
    }
    this.playZombieBattleAmbientNote(vol);
    setTimeout(() => this.playZombieBattleAmbientNote(vol), 480);
    setTimeout(() => this.playZombieBattleAmbientNote(vol), 960);
  }

  public syncBgm(config: GameConfig) {
    if (this.localTabMuted) {
      this.stopBgmInternal();
      return;
    }

    // Ưu tiên phát Nhạc nền Sự Kiện Zombie khi sự kiện Zombie đang diễn ra
    if (this.isZombieEventActive) {
      if (config.zombieBgmEnabled === false) {
        this.stopBgmInternal();
        return;
      }
      const zVol = Math.max(0.05, Math.min(1, config.zombieBgmVolume ?? 0.55));
      if (config.zombieBgmMp3Url) {
        if (this.synthBgmInterval) {
          clearInterval(this.synthBgmInterval);
          this.synthBgmInterval = null;
          this.activeSynthPreset = null;
        }
        if (this.currentBgmUrl !== config.zombieBgmMp3Url || !this.bgmAudio) {
          if (this.bgmAudio) {
            try {
              this.bgmAudio.pause();
            } catch {
              // Ignore
            }
          }
          const audio = new Audio(config.zombieBgmMp3Url);
          audio.loop = true;
          audio.volume = zVol;
          this.bgmAudio = audio;
          this.currentBgmUrl = config.zombieBgmMp3Url;
          audio.play().catch(() => {});
        } else {
          this.bgmAudio.volume = zVol;
          if (this.bgmAudio.paused) {
            this.bgmAudio.play().catch(() => {});
          }
        }
      } else {
        if (this.bgmAudio) {
          try {
            this.bgmAudio.pause();
            this.bgmAudio = null;
          } catch {
            // Ignore
          }
          this.currentBgmUrl = null;
        }
        const zPreset = 'zombie_battle_synth';
        if (this.activeSynthPreset !== zPreset || !this.synthBgmInterval) {
          if (this.synthBgmInterval) clearInterval(this.synthBgmInterval);
          this.activeSynthPreset = zPreset;
          this.playZombieBattleAmbientNote(zVol);
          this.synthBgmInterval = setInterval(() => {
            if (
              !this.isZombieEventActive ||
              this.latestConfig?.zombieBgmEnabled === false ||
              this.localTabMuted
            ) {
              return;
            }
            const curVol = Math.max(
              0.05,
              Math.min(1, this.latestConfig?.zombieBgmVolume ?? 0.55)
            );
            this.playZombieBattleAmbientNote(curVol);
          }, 560);
        }
      }
      return;
    }

    if (!config.bgmEnabled) {
      this.stopBgmInternal();
      return;
    }

    const tracks = config.bgmTracks || [];
    const activeTrack =
      tracks.find((t) => t.id === config.activeBgmTrackId) || tracks[0];
    if (!activeTrack) {
      this.stopBgmInternal();
      return;
    }

    const playMode = config.bgmPlayMode || 'sequential';
    const shouldLoopSingle = playMode === 'loop_one' || tracks.length <= 1;
    const vol = Math.max(0.05, Math.min(1, config.bgmVolume ?? 0.4));

    if (activeTrack.url) {
      // Phát file MP3 người dùng chọn
      if (this.synthBgmInterval) {
        clearInterval(this.synthBgmInterval);
        this.synthBgmInterval = null;
        this.activeSynthPreset = null;
      }
      this.synthBgmNoteCount = 0;
      if (
        this.currentBgmUrl !== activeTrack.url ||
        this.currentBgmTrackId !== activeTrack.id ||
        !this.bgmAudio
      ) {
        if (this.bgmAudio) {
          try {
            this.bgmAudio.onended = null;
            this.bgmAudio.pause();
          } catch {
            // Ignore
          }
        }
        const audio = new Audio(activeTrack.url);
        audio.loop = shouldLoopSingle;
        audio.volume = vol;
        audio.onended = () => {
          this.handleBgmTrackEnded();
        };
        this.bgmAudio = audio;
        this.currentBgmUrl = activeTrack.url;
        this.currentBgmTrackId = activeTrack.id;
        audio.play().catch(() => {
          // Chờ tương tác người dùng đầu tiên
        });
      } else {
        this.bgmAudio.loop = shouldLoopSingle;
        this.bgmAudio.volume = vol;
        this.bgmAudio.onended = () => {
          this.handleBgmTrackEnded();
        };
        if (this.bgmAudio.paused) {
          this.bgmAudio.play().catch(() => {});
        }
      }
    } else {
      // Phát nhạc thiền định mặc định bằng WebAudio (khi chưa nạp file MP3 ngoài)
      if (this.bgmAudio) {
        try {
          this.bgmAudio.onended = null;
          this.bgmAudio.pause();
          this.bgmAudio = null;
        } catch {
          // Ignore
        }
        this.currentBgmUrl = null;
      }
      const preset = activeTrack.presetType || 'zen_bowl';
      if (
        this.activeSynthPreset !== preset ||
        this.currentBgmTrackId !== activeTrack.id ||
        !this.synthBgmInterval
      ) {
        if (this.synthBgmInterval) clearInterval(this.synthBgmInterval);
        this.activeSynthPreset = preset;
        this.currentBgmTrackId = activeTrack.id;
        this.synthBgmNoteCount = 0;
        this.playZenAmbientNote(preset, vol);
        this.synthBgmInterval = setInterval(() => {
          if (!this.latestConfig?.bgmEnabled || this.localTabMuted) return;
          const latestMode = this.latestConfig.bgmPlayMode || 'sequential';
          const latestTracks = this.latestConfig.bgmTracks || [];
          this.synthBgmNoteCount += 1;
          if (
            latestMode !== 'loop_one' &&
            latestTracks.length > 1 &&
            this.synthBgmNoteCount >= 16
          ) {
            this.synthBgmNoteCount = 0;
            this.handleBgmTrackEnded();
            return;
          }
          const latestVol = Math.max(
            0.05,
            Math.min(1, this.latestConfig?.bgmVolume ?? 0.4)
          );
          this.playZenAmbientNote(preset, latestVol);
        }, 2800);
      }
    }
  }

  private zombieBeatStep = 0;

  public playZombieBattleAmbientNote(volume: number) {
    if (this.localTabMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const bassNotes = [82.41, 82.41, 98.0, 110.0, 82.41, 123.47, 110.0, 98.0];
      const leadNotes = [164.81, 196.0, 220.0, 246.94, 196.0, 293.66, 246.94, 220.0];
      const step = this.zombieBeatStep++ % bassNotes.length;
      const bassFreq = bassNotes[step];
      const leadFreq = leadNotes[step];

      const bassOsc = this.ctx.createOscillator();
      const leadOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      bassOsc.type = 'sawtooth';
      leadOsc.type = 'triangle';
      bassOsc.frequency.setValueAtTime(bassFreq, now);
      leadOsc.frequency.setValueAtTime(leadFreq, now);

      const peak = 0.085 * volume;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.48);

      bassOsc.connect(gain);
      leadOsc.connect(gain);
      gain.connect(this.ctx.destination);

      bassOsc.start(now);
      leadOsc.start(now);
      bassOsc.stop(now + 0.5);
      leadOsc.stop(now + 0.5);
    } catch {
      // Ignore audio unlock errors
    }
  }

  private playZenAmbientNote(preset: string, volume: number) {
    if (this.localTabMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const pentatonic =
        preset === 'lotus_flute'
          ? [293.66, 329.63, 392.0, 440.0, 523.25, 587.33]
          : [196.0, 220.0, 261.63, 293.66, 329.63, 392.0];
      const baseFreq = pentatonic[Math.floor(Math.random() * pentatonic.length)];

      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      subOsc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      subOsc.frequency.setValueAtTime(baseFreq * 1.5, now);

      const peak = 0.08 * volume;
      gain.gain.setValueAtTime(0.0005, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 3.4);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + 3.5);
      subOsc.stop(now + 3.5);
    } catch {
      // Ignore audio unlock errors
    }
  }

  public playBell(volume = 1.0, customMp3Url?: string | null, forcePlay = false) {
    if (this.localTabMuted) return;
    const cfg = this.latestConfig;
    if (!forcePlay && cfg && !cfg.bellEnabled) return;

    const mp3Url = customMp3Url !== undefined ? customMp3Url : cfg?.bellMp3Url;
    if (mp3Url) {
      try {
        const audio = new Audio(mp3Url);
        audio.volume = Math.max(0.05, Math.min(1, volume));
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synth school drum
      }
    }

    // Tiếng Trống Trường "Tùng! Tùng!" ấm vang
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const hits = [0, 0.28];
      hits.forEach((offset, idx) => {
        if (!this.ctx) return;
        const start = now + offset;
        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        sub.type = 'triangle';
        osc.frequency.setValueAtTime(145, start);
        osc.frequency.exponentialRampToValueAtTime(62, start + 0.38);
        sub.frequency.setValueAtTime(92, start);
        sub.frequency.exponentialRampToValueAtTime(48, start + 0.42);

        const peak = (idx === 0 ? 0.36 : 0.44) * volume;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0005, start + 0.65);

        osc.connect(gain);
        sub.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        sub.start(start);
        osc.stop(start + 0.68);
        sub.stop(start + 0.68);
      });
    } catch {
      // Ignore audio unlock errors
    }
  }

  public playWoodenFish(volume = 1.0, customMp3Url?: string | null, forcePlay = false) {
    if (this.localTabMuted) return;
    const cfg = this.latestConfig;
    if (!forcePlay && cfg && !cfg.woodenFishEnabled) return;

    const mp3Url =
      customMp3Url !== undefined ? customMp3Url : cfg?.woodenFishMp3Url;
    if (mp3Url) {
      try {
        const audio = new Audio(mp3Url);
        audio.volume = Math.max(0.05, Math.min(1, volume));
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synth ruler tap
      }
    }

    // Tiếng gõ thước gỗ lên bảng / bàn giáo viên ("Cốc cốc")
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.065);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.32 * volume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore audio unlock errors
    }
  }

  public playAnswerRevealSfx(
    volume = 1.0,
    presetOverride?: 'chime_sparkle' | 'victory_fanfare' | 'retro_levelup',
    customMp3Url?: string | null,
    forcePlay = false
  ) {
    if (this.localTabMuted) return;
    const cfg = this.latestConfig;
    if (!forcePlay && cfg && cfg.answerRevealSfxEnabled === false) return;

    const mp3Url =
      customMp3Url !== undefined ? customMp3Url : cfg?.answerRevealMp3Url;
    if (mp3Url) {
      try {
        const audio = new Audio(mp3Url);
        audio.volume = Math.max(0.05, Math.min(1, volume));
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synth preset
      }
    }

    const preset =
      presetOverride || cfg?.answerRevealSfxPreset || 'chime_sparkle';

    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const safeVol = Math.max(0.05, Math.min(1, volume));

      if (preset === 'victory_fanfare') {
        // Hiệu ứng 2: Kèn Chiến Thắng (Bright Fanfare Arpeggio + Chord)
        const notes = [
          { freq: 392.0, start: 0, dur: 0.13 },
          { freq: 523.25, start: 0.11, dur: 0.13 },
          { freq: 659.25, start: 0.22, dur: 0.14 },
          { freq: 783.99, start: 0.34, dur: 0.55 },
          { freq: 523.25, start: 0.34, dur: 0.55 },
        ];
        notes.forEach((n) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const sub = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          sub.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.start);
          sub.frequency.setValueAtTime(n.freq * 2, now + n.start);

          gain.gain.setValueAtTime(0.001, now + n.start);
          gain.gain.linearRampToValueAtTime(0.28 * safeVol, now + n.start + 0.02);
          gain.gain.exponentialRampToValueAtTime(
            0.0008,
            now + n.start + n.dur
          );

          osc.connect(gain);
          sub.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + n.start);
          sub.start(now + n.start);
          osc.stop(now + n.start + n.dur + 0.02);
          sub.stop(now + n.start + n.dur + 0.02);
        });
        return;
      }

      if (preset === 'retro_levelup') {
        // Hiệu ứng 3: Pixel Level-Up 8-Bit (Năng động kiểu game Arcade)
        const steps = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
        steps.forEach((freq, idx) => {
          if (!this.ctx) return;
          const start = now + idx * 0.065;
          const dur = idx === steps.length - 1 ? 0.36 : 0.085;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.18 * safeVol, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + dur + 0.01);
        });
        return;
      }

      // Mặc định - Hiệu ứng 1: Chuông Sao Lấp Lánh (Crystal Chime Sparkle)
      const sparkleNotes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      sparkleNotes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const start = now + idx * 0.075;
        const dur = idx === sparkleNotes.length - 1 ? 0.65 : 0.28;
        const osc = this.ctx.createOscillator();
        const overtone = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        overtone.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        overtone.frequency.setValueAtTime(freq * 2, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.26 * safeVol, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0006, start + dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        overtone.start(start);
        osc.stop(start + dur + 0.02);
        overtone.stop(start + dur + 0.02);
      });
    } catch {
      // Ignore audio unlock errors
    }
  }

  /**
   * Âm thanh Chiến Thắng Lớn (Grand Victory Fanfare) mở màn hoành tráng trước khi phát âm thanh VIP 10+
   * Trả về tổng thời lượng fanfare (ms) để nối tiếp mượt mà sang file âm thanh người dùng upload.
   */
  public playGrandVictoryFanfare(volume: number): number {
    try {
      this.initCtx();
      if (!this.ctx) return 0;
      const now = this.ctx.currentTime;
      const safeVol = Math.max(0.01, Math.min(1, volume));

      // Hợp âm kèn đồng & chuông chiến thắng lớn (C5 - E5 - G5 - C6 - E6 + Hòa âm quãng 5)
      const victoryNotes: Array<{
        freq: number;
        harmony: number;
        offset: number;
        dur: number;
        gainScale: number;
      }> = [
        { freq: 523.25, harmony: 392.0, offset: 0.0, dur: 0.14, gainScale: 0.28 },
        { freq: 523.25, harmony: 392.0, offset: 0.13, dur: 0.14, gainScale: 0.3 },
        { freq: 523.25, harmony: 392.0, offset: 0.26, dur: 0.14, gainScale: 0.32 },
        { freq: 659.25, harmony: 523.25, offset: 0.4, dur: 0.26, gainScale: 0.35 },
        { freq: 783.99, harmony: 587.33, offset: 0.64, dur: 0.24, gainScale: 0.36 },
        { freq: 1046.5, harmony: 783.99, offset: 0.86, dur: 0.55, gainScale: 0.42 },
      ];

      victoryNotes.forEach((n) => {
        if (!this.ctx) return;
        const start = now + n.offset;
        const lead = this.ctx.createOscillator();
        const brass = this.ctx.createOscillator();
        const shimmer = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        lead.type = 'triangle';
        brass.type = 'sawtooth';
        shimmer.type = 'sine';

        lead.frequency.setValueAtTime(n.freq, start);
        brass.frequency.setValueAtTime(n.harmony, start);
        shimmer.frequency.setValueAtTime(n.freq * 2, start);

        const brassGain = this.ctx.createGain();
        brassGain.gain.setValueAtTime(0.35, start);
        const shimmerGain = this.ctx.createGain();
        shimmerGain.gain.setValueAtTime(0.22, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(n.gainScale * safeVol, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0008, start + n.dur);

        lead.connect(gain);
        brass.connect(brassGain);
        brassGain.connect(gain);
        shimmer.connect(shimmerGain);
        shimmerGain.connect(gain);
        gain.connect(this.ctx.destination);

        lead.start(start);
        brass.start(start);
        shimmer.start(start);
        lead.stop(start + n.dur + 0.03);
        brass.stop(start + n.dur + 0.03);
        shimmer.stop(start + n.dur + 0.03);
      });

      return 1180;
    } catch {
      return 0;
    }
  }

  private preloadApplauseDuration(mp3Url?: string | null) {
    if (!mp3Url || typeof window === 'undefined') return;
    if (this.applauseDurationMsCache.has(mp3Url)) return;
    try {
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0.2) {
          const clampedMs = Math.max(
            1200,
            Math.min(25000, Math.round(probe.duration * 1000))
          );
          this.applauseDurationMsCache.set(mp3Url, clampedMs);
        }
        probe.src = '';
      };
      probe.src = mp3Url;
    } catch {
      // Ignore metadata probe error
    }
  }

  public stopApplauseSfx() {
    if (this.currentApplauseAudio) {
      try {
        this.currentApplauseAudio.onended = null;
        this.currentApplauseAudio.onerror = null;
        this.currentApplauseAudio.pause();
        this.currentApplauseAudio.removeAttribute('src');
      } catch {
        // Ignore
      }
      this.currentApplauseAudio = null;
    }
    if (this.currentApplauseBufferSource) {
      try {
        this.currentApplauseBufferSource.onended = null;
        this.currentApplauseBufferSource.stop();
        this.currentApplauseBufferSource.disconnect();
      } catch {
        // Ignore
      }
      this.currentApplauseBufferSource = null;
    }
  }

  /**
   * Phát hiệu ứng âm thanh Vỗ Tay Chúc Mừng cả lớp (hỗ trợ file âm thanh Upload tùy chỉnh hoặc hiệu ứng vỗ tay mặc định).
   * Trả về thời lượng vỗ tay (ms) để sau khi tiếng vỗ tay kết thúc sẽ kết thúc vòng và sang game mới.
   */
  public playApplauseSfx(
    volume = 1.0,
    durationMs = 3400,
    customMp3Url?: string | null,
    customApplauseVolume?: number,
    forcePlay = false
  ): number {
    const cfg = this.latestConfig;
    const mp3Url =
      customMp3Url !== undefined ? customMp3Url : cfg?.applauseMp3Url;
    const resolvedVol = Math.max(
      0.05,
      Math.min(
        1,
        Number(customApplauseVolume ?? cfg?.applauseVolume ?? volume ?? 1)
      )
    );

    if (mp3Url) {
      const cachedDurMs = this.applauseDurationMsCache.get(mp3Url) ?? durationMs;
      if (this.localTabMuted || (!forcePlay && this.isTabMuted())) {
        return cachedDurMs;
      }

      this.stopApplauseSfx();
      try {
        const audio = new Audio(mp3Url);
        audio.volume = resolvedVol;
        this.currentApplauseAudio = audio;
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0.2) {
            this.applauseDurationMsCache.set(
              mp3Url,
              Math.max(1200, Math.min(25000, Math.round(audio.duration * 1000)))
            );
          }
        };
        audio.onended = () => {
          if (this.currentApplauseAudio === audio) {
            this.currentApplauseAudio = null;
          }
        };
        audio.play().catch(async () => {
          if (this.currentApplauseAudio === audio) {
            this.currentApplauseAudio = null;
          }
          try {
            this.initCtx();
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') {
              await this.ctx.resume().catch(() => {});
            }
            if (this.ctx.state !== 'running') return;
            const res = await fetch(mp3Url);
            const arr = await res.arrayBuffer();
            const decoded = await this.ctx.decodeAudioData(arr.slice(0));
            this.applauseDurationMsCache.set(
              mp3Url,
              Math.max(1200, Math.min(25000, Math.round(decoded.duration * 1000)))
            );
            const src = this.ctx.createBufferSource();
            src.buffer = decoded;
            const g = this.ctx.createGain();
            g.gain.value = resolvedVol;
            src.connect(g);
            g.connect(this.ctx.destination);
            this.currentApplauseBufferSource = src;
            src.onended = () => {
              if (this.currentApplauseBufferSource === src) {
                this.currentApplauseBufferSource = null;
              }
            };
            src.start(0);
          } catch {
            // Ignore custom applause decode error
          }
        });
        return cachedDurMs;
      } catch {
        return cachedDurMs;
      }
    }

    if (this.localTabMuted || (!forcePlay && this.isTabMuted())) {
      return durationMs;
    }
    this.stopApplauseSfx();
    try {
      this.initCtx();
      if (!this.ctx) return durationMs;
      const now = this.ctx.currentTime;
      const safeVol = resolvedVol;
      const totalSec = Math.max(1.8, Math.min(6.0, durationMs / 1000));

      // Mở đầu bằng hợp âm chuông chiến thắng rộn ràng
      this.playGrandVictoryFanfare(safeVol * 0.6);

      // Tạo buffer tiếng vỗ tay nhiều lớp (bandpass noise bursts mô phỏng hàng chục học sinh vỗ tay giòn giã)
      const sampleRate = this.ctx.sampleRate;
      const clapBufLen = Math.floor(sampleRate * 0.085);
      const clapBuf = this.ctx.createBuffer(1, clapBufLen, sampleRate);
      const data = clapBuf.getChannelData(0);
      for (let i = 0; i < clapBufLen; i++) {
        const t = i / clapBufLen;
        const env = Math.pow(1 - t, 2.2) * (t < 0.08 ? t / 0.08 : 1);
        data[i] = (Math.random() * 2 - 1) * env;
      }

      const totalClaps = Math.floor(totalSec * 28);
      const bandFreqs = [950, 1250, 1550, 1900, 2350];

      for (let c = 0; c < totalClaps; c++) {
        if (!this.ctx) break;
        const progress = c / totalClaps;
        // Cường độ tăng nhanh ở đầu, sôi nổi ở giữa và giảm dần ở 25% cuối
        const crowdEnvelope =
          progress < 0.12
            ? progress / 0.12
            : progress > 0.75
            ? Math.max(0.08, (1 - progress) / 0.25)
            : 1.0;

        const jitter = (Math.random() - 0.5) * 0.032;
        const startOffset = Math.max(
          0,
          Math.min(totalSec - 0.08, progress * (totalSec - 0.12) + jitter)
        );
        const startTime = now + startOffset;

        const src = this.ctx.createBufferSource();
        src.buffer = clapBuf;
        src.playbackRate.setValueAtTime(0.85 + Math.random() * 0.35, startTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(
          bandFreqs[c % bandFreqs.length] + (Math.random() - 0.5) * 220,
          startTime
        );
        filter.Q.setValueAtTime(1.8 + Math.random() * 1.4, startTime);

        const gain = this.ctx.createGain();
        const peak =
          (0.14 + Math.random() * 0.16) * safeVol * crowdEnvelope;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(peak, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.075);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        src.start(startTime);
        src.stop(startTime + 0.082);
      }

      return durationMs;
    } catch {
      return durationMs;
    }
  }

  /**
   * Phát âm thanh tương ứng với từng món quà trong lớp học (hỗ trợ chèn file MP3 riêng hoặc dùng synth mặc định hợp lý)
   */
  public playGiftEventSound(
    giftId: ClassroomGiftEventId,
    config?: GameConfig,
    forcePlay = false
  ) {
    if (this.localTabMuted) return;
    const cfg = config || this.latestConfig;
    if (!forcePlay && cfg && cfg.giftSoundEnabled === false) return;

    const masterVol = Math.max(0, Math.min(1, cfg?.giftSoundVolume ?? 1.0));
    const itemVol = Math.max(
      0,
      Math.min(1, cfg?.giftSoundVolumes?.[giftId] ?? 1.0)
    );
    const volume = masterVol * itemVol;
    if (volume <= 0.005) return;

    const customMp3 = cfg?.giftSoundMp3Urls?.[giftId];

    // Riêng quà VIP 10+: Luôn phát âm thanh Chiến Thắng Lớn mở màn trước, sau đó mới phát âm thanh người dùng upload (nếu có)
    if (giftId === 'vip') {
      const fanfareDurationMs = this.playGrandVictoryFanfare(volume);
      if (customMp3) {
        window.setTimeout(() => {
          if (this.localTabMuted) return;
          try {
            const audio = new Audio(customMp3);
            audio.volume = volume;
            audio.play().catch(() => {});
          } catch {
            // Ignore audio playback errors
          }
        }, Math.max(0, fanfareDurationMs));
      }
      return;
    }

    if (customMp3) {
      try {
        const audio = new Audio(customMp3);
        audio.volume = volume;
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synth
      }
    }

    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      if (giftId === 'rose' || giftId === 'icecream') {
        // Tiếng chuông harp lãng mạn khi tặng hoa cho Cô / Thầy
        const notes =
          giftId === 'rose'
            ? [523.25, 659.25, 783.99, 1046.5]
            : [587.33, 739.99, 880.0, 1174.66];
        notes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const start = now + idx * 0.065;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.24 * volume, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.36);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + 0.38);
        });
        return;
      }

      if (giftId === 'cat') {
        // Tiếng "Meow~" dễ thương khi thả mèo lên bàn
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.linearRampToValueAtTime(860, now + 0.14);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.42);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.28 * volume, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.46);
        return;
      }

      if (giftId === 'gg') {
        // Tiếng "Rộp rộp / Pop" giòn tan khi ăn vụng bịch snack
        const pops = [0, 0.09, 0.19];
        pops.forEach((offset, idx) => {
          if (!this.ctx) return;
          const start = now + offset;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(320 + idx * 140, start);
          osc.frequency.exponentialRampToValueAtTime(140, start + 0.07);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.2 * volume, start + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + 0.09);
        });
        return;
      }

      if (giftId === 'heart') {
        // Tiếng chuông điện thoại reo + lên đời dàn PC Gaming RGB
        const ringNotes = [880, 1174.66, 880, 1174.66, 1318.51, 1760];
        ringNotes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const start = now + idx * 0.055;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.18 * volume, start + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + 0.1);
        });
        return;
      }

      if (giftId === 'pig') {
        // Tiếng heo kêu "Éc éc / Oink oink" vui nhộn khi thả 5 con heo hù dọa
        const oinks = [0, 0.18, 0.36];
        oinks.forEach((offset, idx) => {
          if (!this.ctx) return;
          const start = now + offset;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(180 + idx * 25, start);
          osc.frequency.linearRampToValueAtTime(340 + idx * 30, start + 0.07);
          osc.frequency.exponentialRampToValueAtTime(150, start + 0.15);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.24 * volume, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + 0.17);
        });
        return;
      }
    } catch {
      // Ignore audio unlock errors
    }
  }

  /**
   * Phát hiệu ứng nổ hoa (khi hoa bay tới Cô/Thầy) hoặc nổ heo (khi heo đụng Top 5)
   */
  public playSimpleExplosionSfx(kind: 'flower' | 'pig', volume = 1.0) {
    if (this.localTabMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const safeVol = Math.max(0.05, Math.min(1, volume));

      if (kind === 'flower') {
        const sparkle = [659.25, 880, 1174.66, 1567.98];
        sparkle.forEach((freq, idx) => {
          if (!this.ctx) return;
          const start = now + idx * 0.045;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.22 * safeVol, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + 0.26);
        });
        return;
      }

      // Tiếng nổ "Bùm!" vui nhộn khi heo chạm học sinh Top 5
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      sub.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.28);
      sub.frequency.setValueAtTime(95, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.32);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.32 * safeVol, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.34);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.35);
      sub.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  /**
   * Phát âm thanh Zombie gầm gừ (Luồng 2 sự kiện Zombie tấn công):
   * Ưu tiên phát file MP3 đã upload trong Dev Âm Thanh, nếu chưa có thì phát synth gầm gừ trầm hùng rùng rợn.
   */
  public playZombieGrowlSfx(
    volumeOrConfig: number | GameConfig = 1.0,
    customMp3UrlOrForce?: string | null | boolean,
    forcePlay = false
  ) {
    if (this.localTabMuted) return;
    const isCfgObj =
      typeof volumeOrConfig === 'object' && volumeOrConfig !== null;
    const cfg = isCfgObj ? volumeOrConfig : this.latestConfig;
    const rawVol = isCfgObj ? cfg?.ttsVolume ?? 1.0 : volumeOrConfig;
    const mp3Url =
      typeof customMp3UrlOrForce === 'string' || customMp3UrlOrForce === null
        ? customMp3UrlOrForce
        : cfg?.zombieGrowlMp3Url;
    const effectiveForce =
      typeof customMp3UrlOrForce === 'boolean' ? customMp3UrlOrForce : forcePlay;
    const safeVol = Math.max(0.08, Math.min(1, rawVol));

    if (mp3Url) {
      try {
        const audio = new Audio(mp3Url);
        audio.volume = safeVol;
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synth monster growl
      }
    }

    if (!effectiveForce && cfg && !cfg.ttsEnabled && !cfg.bellEnabled) {
      // Vẫn cho phát nhẹ khi sự kiện diễn ra
    }

    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 2 đợt gầm trầm khàn (Sawtooth + Square + Lowpass modulation) kéo dài ~2.4s
      const bursts = [
        { start: 0, dur: 1.05, fStart: 92, fPeak: 128, fEnd: 54 },
        { start: 1.12, dur: 1.25, fStart: 108, fPeak: 146, fEnd: 46 },
      ];
      bursts.forEach((b) => {
        if (!this.ctx) return;
        const t0 = now + b.start;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(b.fStart, t0);
        osc1.frequency.linearRampToValueAtTime(b.fPeak, t0 + b.dur * 0.35);
        osc1.frequency.exponentialRampToValueAtTime(b.fEnd, t0 + b.dur);

        osc2.frequency.setValueAtTime(b.fStart * 0.51, t0);
        osc2.frequency.linearRampToValueAtTime(b.fPeak * 0.49, t0 + b.dur * 0.4);
        osc2.frequency.exponentialRampToValueAtTime(b.fEnd * 0.5, t0 + b.dur);

        // Rung cổ họng gầm gừ (growl guttural tremolo)
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(24, t0);
        lfoGain.gain.setValueAtTime(18, t0);
        lfo.connect(osc1.frequency);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, t0);
        filter.frequency.linearRampToValueAtTime(620, t0 + b.dur * 0.35);
        filter.frequency.exponentialRampToValueAtTime(190, t0 + b.dur);

        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.34 * safeVol, t0 + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + b.dur);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(t0);
        osc2.start(t0);
        lfo.start(t0);
        osc1.stop(t0 + b.dur + 0.03);
        osc2.stop(t0 + b.dur + 0.03);
        lfo.stop(t0 + b.dur + 0.03);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Phát hiệu ứng âm thanh gọn nhẹ khi đạn (Hộp bút, Sách, Ghế, Đứa bàn bên) đập trúng Zombie
   */
  /**
   * Âm thanh khi Zombie bị trúng đạn: Tiếng va chạm mạnh (Impact Thud/Crunch) kết hợp tiếng Zombie rên/gầm đau đớn
   */
  public playZombieHitSfx(
    kind: 'pencil_case' | 'book' | 'chair' | 'desk_mate',
    volume = 1.0
  ) {
    if (this.localTabMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const safeVol = Math.max(0.08, Math.min(1, volume));

      // 1. Tiếng va đập vật lý (Impact Thud) theo độ nặng của từng loại đạn
      const impactOsc = this.ctx.createOscillator();
      const impactGain = this.ctx.createGain();
      const crunchOsc = this.ctx.createOscillator();
      const crunchGain = this.ctx.createGain();

      if (kind === 'pencil_case') {
        impactOsc.type = 'triangle';
        impactOsc.frequency.setValueAtTime(420, now);
        impactOsc.frequency.exponentialRampToValueAtTime(95, now + 0.11);
        impactGain.gain.setValueAtTime(0.001, now);
        impactGain.gain.linearRampToValueAtTime(0.32 * safeVol, now + 0.006);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        crunchOsc.type = 'square';
        crunchOsc.frequency.setValueAtTime(780, now);
        crunchOsc.frequency.exponentialRampToValueAtTime(180, now + 0.065);
        crunchGain.gain.setValueAtTime(0.001, now);
        crunchGain.gain.linearRampToValueAtTime(0.16 * safeVol, now + 0.005);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      } else if (kind === 'book') {
        impactOsc.type = 'square';
        impactOsc.frequency.setValueAtTime(310, now);
        impactOsc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
        impactGain.gain.setValueAtTime(0.001, now);
        impactGain.gain.linearRampToValueAtTime(0.38 * safeVol, now + 0.008);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        crunchOsc.type = 'sawtooth';
        crunchOsc.frequency.setValueAtTime(520, now);
        crunchOsc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
        crunchGain.gain.setValueAtTime(0.001, now);
        crunchGain.gain.linearRampToValueAtTime(0.22 * safeVol, now + 0.006);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      } else if (kind === 'chair') {
        // Đạn cái ghế gỗ (5 xu): Tiếng đập gỗ trầm nặng + rung chấn mạnh
        impactOsc.type = 'sawtooth';
        impactOsc.frequency.setValueAtTime(260, now);
        impactOsc.frequency.exponentialRampToValueAtTime(52, now + 0.2);
        impactGain.gain.setValueAtTime(0.001, now);
        impactGain.gain.linearRampToValueAtTime(0.46 * safeVol, now + 0.01);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

        crunchOsc.type = 'square';
        crunchOsc.frequency.setValueAtTime(480, now);
        crunchOsc.frequency.exponentialRampToValueAtTime(88, now + 0.15);
        crunchGain.gain.setValueAtTime(0.001, now);
        crunchGain.gain.linearRampToValueAtTime(0.28 * safeVol, now + 0.008);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      } else {
        // 'desk_mate' (Ném đứa bàn bên): Cú nổ va chạm cực mạnh + âm bồi vui nhộn
        impactOsc.type = 'sawtooth';
        impactOsc.frequency.setValueAtTime(320, now);
        impactOsc.frequency.exponentialRampToValueAtTime(45, now + 0.24);
        impactGain.gain.setValueAtTime(0.001, now);
        impactGain.gain.linearRampToValueAtTime(0.52 * safeVol, now + 0.012);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        crunchOsc.type = 'sine';
        crunchOsc.frequency.setValueAtTime(680, now);
        crunchOsc.frequency.linearRampToValueAtTime(980, now + 0.09);
        crunchOsc.frequency.exponentialRampToValueAtTime(210, now + 0.22);
        crunchGain.gain.setValueAtTime(0.001, now);
        crunchGain.gain.linearRampToValueAtTime(0.32 * safeVol, now + 0.01);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
      }

      impactOsc.connect(impactGain);
      impactGain.connect(this.ctx.destination);
      crunchOsc.connect(crunchGain);
      crunchGain.connect(this.ctx.destination);

      impactOsc.start(now);
      crunchOsc.start(now);
      impactOsc.stop(now + 0.26);
      crunchOsc.stop(now + 0.26);

      // 2. Tiếng Zombie gầm nhẹ / trúng đòn ("Ughh!") trầm khàn nối tiếp ngay sau cú va chạm (trễ 25ms)
      const groanStart = now + 0.025;
      const groanDur = kind === 'desk_mate' || kind === 'chair' ? 0.22 : 0.15;
      const groanOsc = this.ctx.createOscillator();
      const groanSub = this.ctx.createOscillator();
      const groanFilter = this.ctx.createBiquadFilter();
      const groanGain = this.ctx.createGain();

      groanOsc.type = 'sawtooth';
      groanSub.type = 'triangle';
      const basePitch = 148 + ((Math.random() - 0.5) * 24);
      groanOsc.frequency.setValueAtTime(basePitch, groanStart);
      groanOsc.frequency.exponentialRampToValueAtTime(basePitch * 0.52, groanStart + groanDur);
      groanSub.frequency.setValueAtTime(basePitch * 0.5, groanStart);
      groanSub.frequency.exponentialRampToValueAtTime(basePitch * 0.28, groanStart + groanDur);

      groanFilter.type = 'bandpass';
      groanFilter.frequency.setValueAtTime(340, groanStart);
      groanFilter.Q.setValueAtTime(2.2, groanStart);

      const groanScale =
        kind === 'desk_mate' ? 0.38 : kind === 'chair' ? 0.32 : 0.24;
      groanGain.gain.setValueAtTime(0.001, groanStart);
      groanGain.gain.linearRampToValueAtTime(groanScale * safeVol, groanStart + 0.02);
      groanGain.gain.exponentialRampToValueAtTime(0.001, groanStart + groanDur);

      groanOsc.connect(groanFilter);
      groanSub.connect(groanFilter);
      groanFilter.connect(groanGain);
      groanGain.connect(this.ctx.destination);

      groanOsc.start(groanStart);
      groanSub.start(groanStart);
      groanOsc.stop(groanStart + groanDur + 0.02);
      groanSub.stop(groanStart + groanDur + 0.02);
    } catch {
      // Ignore
    }
  }

  public stopImmediate() {
    const oldQueue = [...this.ttsQueue];
    const oldActive = this.activeEventItem;
    this.speechTokenSeq++;
    this.ttsQueue = [];
    this.activeEventItem = null;
    this.isSpeaking = false;
    this.isSpeakingDharma = false;
    this.currentEventText = '';
    if (this.mutedSimTimer) {
      clearTimeout(this.mutedSimTimer);
      this.mutedSimTimer = null;
    }
    if (this.dharmaNextTimer) {
      clearTimeout(this.dharmaNextTimer);
      this.dharmaNextTimer = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.removeAttribute('src');
        this.currentAudio.load();
        this.currentAudio = null;
      } catch {
        // Ignore
      }
    }
    this.stopTeacherLiveIndependent();
    this.emitStatus('Đã ngắt đọc', false, '');
    this.emitEventQueue();
    if (oldActive) this.notifyItemFinished(oldActive);
    oldQueue.forEach((it) => this.notifyItemFinished(it));
  }

  public subscribeTeacherLiveStatus(fn: TeacherLiveStatusListener) {
    this.teacherLiveListeners.add(fn);
    fn(this.getTeacherLiveStatus());
    return () => this.teacherLiveListeners.delete(fn);
  }

  public getTeacherLiveStatus(): TeacherLiveVoiceStatus {
    return {
      active: this.teacherLiveActive,
      currentText: this.teacherLiveActive ? this.teacherLiveCurrentText : '',
    };
  }

  private emitTeacherLiveStatus(active: boolean, currentText = '') {
    this.teacherLiveActive = active;
    this.teacherLiveCurrentText = active ? currentText : '';
    const snap = this.getTeacherLiveStatus();
    this.teacherLiveListeners.forEach((fn) => fn(snap));
  }

  private stopTeacherLiveAudioNodesOnly() {
    if (this.teacherLiveSimTimer) {
      clearTimeout(this.teacherLiveSimTimer);
      this.teacherLiveSimTimer = null;
    }
    if (this.teacherLiveSourceNode) {
      try {
        this.teacherLiveSourceNode.onended = null;
        this.teacherLiveSourceNode.stop();
        this.teacherLiveSourceNode.disconnect();
      } catch {
        // Ignore
      }
      this.teacherLiveSourceNode = null;
    }
    if (this.teacherLiveGainNode) {
      try {
        this.teacherLiveGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.teacherLiveGainNode = null;
    }
    if (this.teacherLiveFallbackAudio) {
      try {
        this.teacherLiveFallbackAudio.onended = null;
        this.teacherLiveFallbackAudio.onerror = null;
        this.teacherLiveFallbackAudio.pause();
        this.teacherLiveFallbackAudio.removeAttribute('src');
      } catch {
        // Ignore
      }
      this.teacherLiveFallbackAudio = null;
    }
    if (this.teacherLiveUtterance) {
      this.teacherLiveUtterance.onend = null;
      this.teacherLiveUtterance.onerror = null;
      this.teacherLiveUtterance = null;
      if (!this.currentUtterance && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
    }
  }

  private teacherLiveUtterance: SpeechSynthesisUtterance | null = null;

  /**
   * Ngắt riêng giọng đọc độc lập của Thầy Giáo (tuyệt đối không chạm tới hàng chờ TTS hay giọng Cô Thảo)
   */
  public stopTeacherLiveIndependent() {
    this.teacherLiveTokenSeq++;
    this.stopTeacherLiveAudioNodesOnly();
    this.emitTeacherLiveStatus(false, '');
  }

  /**
   * WSOLA (Waveform Similarity Overlap-Add) Time-Stretch trên kênh đơn (mono):
   * Giúp thay đổi tốc độ đọc (tempo = desiredRate / pitchFactor) hoàn toàn độc lập với cao độ trầm (pitchFactor)
   * để Giọng Thầy Giáo luôn giữ nguyên màu giọng Nam Trầm ấm áp ngay cả khi kéo tốc độ lên 1.5x - 2.0x hoặc hạ xuống 0.5x!
   */
  private wsolaTimeStretchAudioBuffer(
    ctx: AudioContext,
    srcBuffer: AudioBuffer,
    tempo: number
  ): AudioBuffer {
    const safeTempo = Math.max(0.35, Math.min(3.0, tempo));
    if (Math.abs(safeTempo - 1.0) < 0.03 || srcBuffer.length < 2048) {
      return srcBuffer;
    }

    const sr = srcBuffer.sampleRate;
    const inLen = srcBuffer.length;
    const input = new Float32Array(inLen);
    if (srcBuffer.numberOfChannels === 1) {
      input.set(srcBuffer.getChannelData(0));
    } else {
      const ch0 = srcBuffer.getChannelData(0);
      const ch1 = srcBuffer.getChannelData(1);
      for (let i = 0; i < inLen; i++) {
        input[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    }

    let winSize = Math.round(sr * 0.028);
    if (winSize % 2 !== 0) winSize += 1;
    const hopOut = winSize >> 1; // 50% overlap -> tổng hàm cửa sổ Hann luôn bằng 1.0 tuyệt đối
    const hopInNominal = hopOut * safeTempo;
    const searchRadius = Math.round(sr * 0.0055);

    const outLen = Math.max(winSize + hopOut, Math.ceil(inLen / safeTempo) + winSize);
    const output = new Float32Array(outLen);
    const hann = new Float32Array(winSize);
    const twoPiOverW = (2 * Math.PI) / winSize;
    for (let i = 0; i < winSize; i++) {
      hann[i] = 0.5 * (1 - Math.cos(twoPiOverW * i));
    }

    // Frame đầu tiên
    for (let i = 0; i < winSize && i < inLen; i++) {
      output[i] += input[i] * hann[i];
    }

    let prevInPos = 0;
    let outPos = hopOut;
    let frameIdx = 1;

    while (outPos + winSize < outLen) {
      const targetInPos = Math.round(frameIdx * hopInNominal);
      if (targetInPos + winSize >= inLen) break;

      const naturalInPos = prevInPos + hopOut;
      let bestPos = targetInPos;

      if (naturalInPos + hopOut < inLen) {
        const minCand = Math.max(0, targetInPos - searchRadius);
        const maxCand = Math.min(inLen - winSize - 1, targetInPos + searchRadius);
        let bestScore = -1e30;
        const stepCand = sr >= 40000 ? 6 : 4;
        const stepCorr = sr >= 40000 ? 6 : 4;

        for (let cand = minCand; cand <= maxCand; cand += stepCand) {
          let dot = 0;
          let energy = 1e-7;
          for (let k = 0; k < hopOut; k += stepCorr) {
            const a = input[naturalInPos + k];
            const b = input[cand + k];
            dot += a * b;
            energy += b * b;
          }
          const score = dot / Math.sqrt(energy);
          if (score > bestScore) {
            bestScore = score;
            bestPos = cand;
          }
        }
      }

      for (let i = 0; i < winSize; i++) {
        output[outPos + i] += input[bestPos + i] * hann[i];
      }

      prevInPos = bestPos;
      outPos += hopOut;
      frameIdx++;
    }

    const validOutLen = Math.max(1, Math.min(outLen, outPos + hopOut));
    const stretchedBuffer = ctx.createBuffer(1, validOutLen, sr);
    stretchedBuffer.getChannelData(0).set(output.subarray(0, validOutLen));
    return stretchedBuffer;
  }

  /**
   * Phát Live Text-to-Voice (Giọng Thầy Giáo) trên kênh âm thanh ĐỘC LẬP 100%:
   * - Chạy song song cùng lúc với tiếng Cô Thảo giảng bài, học sinh trả lời, nhạc nền và mọi SFX khác.
   * - Tuyệt đối KHÔNG ngắt, KHÔNG cancel và KHÔNG đụng tới tiến trình phát của các luồng trong game.
   * - KHÔNG xếp vào hàng chờ giọng nói (ttsQueue), KHÔNG làm trễ luồng tiết học.
   */
  public speakTeacherLiveIndependent(
    rawText: string,
    config: GameConfig,
    options?: TeacherLiveVoiceOptions
  ): boolean {
    this.latestConfig = config;
    this.primeAudioUnlock();
    const cleaned = (rawText || '')
      .replace(
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27BF\uFE00-\uFE0F\u200D]/gu,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return false;

    const chunks = this.splitLongLessonText(cleaned, 115);
    if (chunks.length === 0) return false;

    const token = ++this.teacherLiveTokenSeq;
    this.stopTeacherLiveAudioNodesOnly();

    const engine = this.normalizeEngineChoice(
      options?.engine ?? config.teacherLiveEngine ?? config.ttsEngine
    );
    const desiredRate = Math.max(
      0.5,
      Math.min(2.0, Number(options?.rate ?? config.teacherLiveRate ?? 1.0))
    );
    const desiredVolume = Math.max(
      0,
      Math.min(2.0, Number(options?.volume ?? config.teacherLiveVolume ?? 1.0))
    );
    const desiredPitch = Math.max(
      0.65,
      Math.min(1.25, Number(options?.pitch ?? config.teacherLivePitch ?? 0.84))
    );

    this.emitTeacherLiveStatus(true, cleaned);

    if (this.isTabMuted() || desiredVolume <= 0.001) {
      const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
      const simMs = Math.max(
        1200,
        Math.min(15000, Math.round((wordCount * 320) / Math.max(0.5, desiredRate)))
      );
      this.teacherLiveSimTimer = setTimeout(() => {
        if (token !== this.teacherLiveTokenSeq) return;
        this.teacherLiveSimTimer = null;
        this.emitTeacherLiveStatus(false, '');
      }, simMs);
      return true;
    }

    // Lựa chọn 1: Web Speech Tiếng Việt (Không fallback — lỗi hoặc thiếu giọng tự skip)
    if (engine === 'web_speech') {
      if (!('speechSynthesis' in window)) {
        setTimeout(() => {
          if (token === this.teacherLiveTokenSeq) {
            this.emitTeacherLiveStatus(false, '');
          }
        }, 80);
        return false;
      }
      try {
        const voices = window.speechSynthesis.getVoices();
        const viVoices = voices.filter((v) =>
          v.lang.toLowerCase().includes('vi')
        );
        const preferredUri = options?.voice || config.selectedSystemVoiceURI;
        const chosen =
          (preferredUri
            ? voices.find((v) => v.voiceURI === preferredUri)
            : undefined) || viVoices[0];

        if (voices.length > 0 && !chosen) {
          setTimeout(() => {
            if (token === this.teacherLiveTokenSeq) {
              this.emitTeacherLiveStatus(false, '');
            }
          }, 80);
          return false;
        }

        const utter = new SpeechSynthesisUtterance(cleaned);
        this.teacherLiveUtterance = utter;
        utter.lang = 'vi-VN';
        utter.rate = desiredRate;
        utter.pitch = desiredPitch;
        utter.volume = Math.min(1.0, desiredVolume);
        if (chosen) utter.voice = chosen;

        const finishWebLive = () => {
          if (token !== this.teacherLiveTokenSeq) return;
          this.teacherLiveUtterance = null;
          this.emitTeacherLiveStatus(false, '');
        };
        utter.onend = finishWebLive;
        utter.onerror = finishWebLive;
        // Tuyệt đối không gọi speechSynthesis.cancel() nếu luồng game đang đọc bằng Web Speech để không bao giờ cắt tiếng luồng!
        if (!this.currentUtterance) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.speak(utter);
        return true;
      } catch {
        this.emitTeacherLiveStatus(false, '');
        return false;
      }
    }

    // Lựa chọn 2: Google Warm phát trên AudioContext độc lập 100% (Song song mượt với mọi luồng + Tự động Fallback sang Mirror & Web Speech khi nghẽn!)
    const buildGoogleWarmUrl = (chunkText: string): string => {
      const shortChunk = chunkText.slice(0, 195);
      return `/api/tts?lang=vi&voice=google-vi-warm&text=${encodeURIComponent(
        shortChunk
      )}`;
    };

    const fallbackChunkViaWebSpeech = (
      chunkText: string,
      onChunkDone: () => void
    ) => {
      if (token !== this.teacherLiveTokenSeq) return;
      if (!('speechSynthesis' in window)) {
        onChunkDone();
        return;
      }
      try {
        const voices = window.speechSynthesis.getVoices();
        const viVoices = voices.filter((v) =>
          v.lang.toLowerCase().includes('vi')
        );
        const preferredUri = options?.voice || config.selectedSystemVoiceURI;
        const chosen =
          (preferredUri
            ? voices.find((v) => v.voiceURI === preferredUri)
            : undefined) || viVoices[0];

        if (voices.length > 0 && !chosen) {
          onChunkDone();
          return;
        }

        const utter = new SpeechSynthesisUtterance(chunkText);
        this.teacherLiveUtterance = utter;
        utter.lang = 'vi-VN';
        utter.rate = desiredRate;
        utter.pitch = resolveGoogleWarmWebSpeechFallbackPitch(
          desiredPitch,
          true
        );
        utter.volume = Math.min(1.0, desiredVolume);
        if (chosen) utter.voice = chosen;

        let done = false;
        const finishChunk = () => {
          if (done || token !== this.teacherLiveTokenSeq) return;
          done = true;
          clearTimeout(wsWatchdog);
          if (this.teacherLiveUtterance === utter) {
            this.teacherLiveUtterance = null;
          }
          onChunkDone();
        };

        const words = chunkText.split(/\s+/).filter(Boolean).length;
        const maxMs = Math.max(
          4500,
          Math.min(
            18000,
            Math.ceil((words * 580 + 2800) / Math.max(0.5, desiredRate))
          )
        );
        let wsWatchdog = setTimeout(
          finishChunk,
          this.currentUtterance ? 5500 : 3200
        );

        utter.onstart = () => {
          if (!done && token === this.teacherLiveTokenSeq) {
            clearTimeout(wsWatchdog);
            wsWatchdog = setTimeout(finishChunk, maxMs);
          }
        };
        utter.onend = finishChunk;
        utter.onerror = finishChunk;

        if (!this.currentUtterance) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.speak(utter);
      } catch {
        onChunkDone();
      }
    };

    const playChunkAt = async (idx: number) => {
      if (token !== this.teacherLiveTokenSeq) return;
      if (idx >= chunks.length) {
        this.stopTeacherLiveAudioNodesOnly();
        this.emitTeacherLiveStatus(false, '');
        return;
      }

      const chunkText = chunks[idx];
      if (idx + 1 < chunks.length) {
        void this.getOrFetchAudioBlobUrl(
          buildGoogleWarmUrl(chunks[idx + 1]),
          2600
        );
      }

      const blobUrl = await this.getOrFetchAudioBlobUrl(
        buildGoogleWarmUrl(chunkText),
        2800
      );
      if (token !== this.teacherLiveTokenSeq) return;

      if (blobUrl) {
        try {
          const liveCtx = this.initTeacherLiveCtx();
          if (liveCtx) {
            if (liveCtx.state === 'suspended') {
              try {
                await liveCtx.resume();
              } catch {
                // Ignore
              }
            }
            if (liveCtx.state === 'running') {
              const res = await fetch(blobUrl);
              const arrBuf = await res.arrayBuffer();
              if (token !== this.teacherLiveTokenSeq) return;

              const decoded = await liveCtx.decodeAudioData(arrBuf.slice(0));
              if (token !== this.teacherLiveTokenSeq || liveCtx.state !== 'running') {
                return;
              }

              // Nhường 1 nhịp microtask trước khi xử lý buffer để luồng âm thanh/camera không bao giờ khựng dù chỉ 1ms
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
              if (token !== this.teacherLiveTokenSeq || liveCtx.state !== 'running') {
                return;
              }

              const effectivePitch = desiredPitch;
              const liveRate = Math.max(
                0.5,
                Math.min(
                  2.0,
                  Number(
                    options?.rate ??
                      this.latestConfig?.teacherLiveRate ??
                      desiredRate
                  )
                )
              );
              const liveVol = Math.max(
                0,
                Math.min(
                  2.0,
                  Number(
                    options?.volume ??
                      this.latestConfig?.teacherLiveVolume ??
                      desiredVolume
                  )
                )
              );

              const tempo = liveRate / effectivePitch;
              const processedBuf = this.wsolaTimeStretchAudioBuffer(
                liveCtx,
                decoded,
                tempo
              );

              const source = liveCtx.createBufferSource();
              source.buffer = processedBuf;
              source.playbackRate.setValueAtTime(
                effectivePitch,
                liveCtx.currentTime
              );

              const warmthFilter = liveCtx.createBiquadFilter();
              warmthFilter.type = 'lowshelf';
              warmthFilter.frequency.setValueAtTime(175, liveCtx.currentTime);
              warmthFilter.gain.setValueAtTime(2.5, liveCtx.currentTime);

              const clarityFilter = liveCtx.createBiquadFilter();
              clarityFilter.type = 'peaking';
              clarityFilter.frequency.setValueAtTime(2700, liveCtx.currentTime);
              clarityFilter.Q.setValueAtTime(1.1, liveCtx.currentTime);
              clarityFilter.gain.setValueAtTime(1.8, liveCtx.currentTime);

              const gainNode = liveCtx.createGain();
              gainNode.gain.setValueAtTime(liveVol, liveCtx.currentTime);

              source.connect(warmthFilter);
              warmthFilter.connect(clarityFilter);
              clarityFilter.connect(gainNode);
              gainNode.connect(liveCtx.destination);

              this.teacherLiveSourceNode = source;
              this.teacherLiveGainNode = gainNode;

              let advanced = false;
              const nextOnce = () => {
                if (advanced || token !== this.teacherLiveTokenSeq) return;
                advanced = true;
                clearTimeout(watchdog);
                void playChunkAt(idx + 1);
              };

              const expectedMs =
                Math.ceil(
                  (processedBuf.duration / Math.max(0.4, effectivePitch)) * 1000
                ) + 900;
              const watchdog = setTimeout(nextOnce, Math.max(1500, expectedMs));

              source.onended = nextOnce;
              source.start(0);
              return;
            }
          }
        } catch {
          // Nếu WebAudio chưa sẵn sàng, chuyển sang thử HTMLAudioElement các mirror Google Warm rồi tới Web Speech
        }
      }

      if (token !== this.teacherLiveTokenSeq) return;
      const directMirrors = buildGoogleWarmDirectMirrorUrls(chunkText, 180);
      const htmlCandidates = [
        ...(blobUrl ? [blobUrl] : []),
        ...directMirrors.map((m) => m.url),
      ];

      const tryHtmlCandidateAt = (candIdx: number) => {
        if (token !== this.teacherLiveTokenSeq) return;
        if (candIdx >= htmlCandidates.length) {
          fallbackChunkViaWebSpeech(chunkText, () => {
            void playChunkAt(idx + 1);
          });
          return;
        }

        const directAudio = new Audio();
        (
          directAudio as HTMLAudioElement & { referrerPolicy?: string }
        ).referrerPolicy = 'no-referrer';
        this.teacherLiveFallbackAudio = directAudio;
        directAudio.src = htmlCandidates[candIdx];
        const directRate = Math.max(
          0.55,
          Math.min(2.0, desiredRate * desiredPitch)
        );
        this.applyAudioPlaybackParams(
          directAudio,
          directRate,
          false,
          Math.min(1.0, desiredVolume)
        );

        let settled = false;
        let startedPlaying = false;

        const cleanupDirect = () => {
          directAudio.onended = null;
          directAudio.onerror = null;
          directAudio.onplaying = null;
          try {
            directAudio.pause();
            directAudio.removeAttribute('src');
          } catch {
            // Ignore
          }
          if (this.teacherLiveFallbackAudio === directAudio) {
            this.teacherLiveFallbackAudio = null;
          }
        };

        const advanceNextChunk = () => {
          if (settled || token !== this.teacherLiveTokenSeq) return;
          settled = true;
          clearTimeout(connectTimer);
          clearTimeout(directWatchdog);
          cleanupDirect();
          void playChunkAt(idx + 1);
        };

        const failToNextCandidate = () => {
          if (settled || token !== this.teacherLiveTokenSeq) return;
          settled = true;
          clearTimeout(connectTimer);
          clearTimeout(directWatchdog);
          cleanupDirect();
          tryHtmlCandidateAt(candIdx + 1);
        };

        const connectTimer = setTimeout(() => {
          if (!startedPlaying) {
            failToNextCandidate();
          }
        }, 1500);
        const directWatchdog = setTimeout(advanceNextChunk, 12000);

        directAudio.onplaying = () => {
          startedPlaying = true;
          clearTimeout(connectTimer);
        };
        directAudio.onended = advanceNextChunk;
        directAudio.onerror = failToNextCandidate;
        directAudio.play().catch(() => {
          if (settled || token !== this.teacherLiveTokenSeq) return;
          failToNextCandidate();
        });
      };

      tryHtmlCandidateAt(0);
    };

    void playChunkAt(0);
    return true;
  }

  /**
   * Định dạng mẫu câu sự kiện có chứa [Tên] / {name} và [Comment] / {prayer}
   * Tích hợp tự động lọc icon spam & giới hạn số chữ tối đa (maxWords)
   */
  public formatEventTemplate(
    template: string,
    username: string,
    comment = '',
    maxWords?: number
  ): string {
    const limit =
      maxWords ?? this.latestConfig?.maxTtsWords ?? 25;
    const cleanComment = comment
      ? sanitizeAndLimitSpeechText(comment, limit)
      : '';
    const safeTpl = (template || '').trim();
    if (!safeTpl) return `${username} ${cleanComment}`.trim();
    return safeTpl
      .replace(/\[Tên\]|\[tên\]|\[Ten\]|\[ten\]|\{name\}/g, username)
      .replace(/\[Comment\]|\[comment\]|\{prayer\}|\{comment\}/g, cleanComment)
      .replace(/\s+/g, ' ')
      .trim();
  }

  public formatPrayerSpeech(
    username: string,
    prayer: string,
    isVip: boolean,
    template: string,
    maxWords?: number
  ): string {
    const tpl = template || '[Tên] cầu nguyện: [Comment]';
    const prefix = isVip ? 'Nam mô A Di Đà Phật. ' : '';
    return prefix + this.formatEventTemplate(tpl, username, prayer, maxWords);
  }

  public enqueueTTS(
    text: string,
    isPriority: boolean,
    config: GameConfig,
    meta?: TTSQueueItemMeta
  ): boolean {
    this.latestConfig = config;
    this.primeAudioUnlock();
    if (!config.ttsEnabled) return false;
    const cleanText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return false;

    const normKey = cleanText.toLowerCase();
    const now = Date.now();
    for (const [k, t] of this.recentSpokenMap.entries()) {
      if (now - t > 6500) {
        this.recentSpokenMap.delete(k);
      }
    }

    const isGiftEvent =
      meta?.reason === 'gift' || meta?.reason === 'special_gift';

    // Nếu người chơi đang có sẵn 1 lượt đọc cảm ơn dâng lễ chờ trong hàng đợi -> cập nhật gộp luôn vào lượt đó
    if (isGiftEvent && meta?.username) {
      const lowerUser = meta.username.trim().toLowerCase();
      const existingGiftInQueue = this.ttsQueue.find(
        (item) =>
          (item.meta?.reason === 'gift' || item.meta?.reason === 'special_gift') &&
          item.meta?.username?.trim().toLowerCase() === lowerUser
      );
      if (existingGiftInQueue) {
        existingGiftInQueue.text = cleanText;
        existingGiftInQueue.meta = {
          ...existingGiftInQueue.meta,
          ...meta,
          reason:
            existingGiftInQueue.meta?.reason === 'special_gift' ||
            meta.reason === 'special_gift'
              ? 'special_gift'
              : 'gift',
        };
        this.emitEventQueue();
        return true;
      }
    }

    // Chống đọc lặp 2 lần cùng 1 câu bình luận do lag mạng hoặc sự kiện trùng lặp trong 6 giây (không chặn sự kiện dâng lễ mới)
    if (!isGiftEvent && (!meta?.reason || meta.reason !== 'manual')) {
      const lastSpokenAt = this.recentSpokenMap.get(normKey);
      if (lastSpokenAt && now - lastSpokenAt < 6000) {
        return false;
      }
      if (
        this.currentEventText.trim().toLowerCase() === normKey ||
        this.ttsQueue.some((item) => item.text.trim().toLowerCase() === normKey)
      ) {
        return false;
      }
    }
    this.recentSpokenMap.set(normKey, now);

    const queueItem: TTSQueueItem = {
      id: `tts_${now}_${Math.random().toString(36).slice(2, 7)}`,
      text: cleanText,
      isPriority,
      lang: meta?.lang || 'vi',
      addedAt: now,
      meta,
    };

    // Khi hàng chờ đạt giới hạn (mặc định 30) thì xóa các bình luận thường cũ (giữ lại các lượt Chủ Phòng, Luồng Tiết Học/Sự Kiện & dâng lễ ưu tiên đang chờ)
    const maxQueueSize = Math.max(1, Math.min(200, config.maxTtsQueueSize ?? 30));
    if (this.ttsQueue.length >= maxQueueSize) {
      this.ttsQueue = this.ttsQueue.filter(
        (item) =>
          item.isHostLive ||
          Boolean(item.meta?.lessonFlowToken) ||
          Boolean(item.meta?.lessonStepLabel) ||
          item.meta?.reason === 'gift' ||
          item.meta?.reason === 'special_gift'
      );
    }

    if (isPriority) {
      // Đẩy lên đầu hàng chờ nhưng đứng sau các câu Live Text của Chủ Phòng, các câu Luồng Tiết Học/Sự Kiện và xếp theo thứ tự giữa các câu ưu tiên
      const firstNonPriorityIdx = this.ttsQueue.findIndex(
        (q) =>
          !q.isPriority &&
          !q.meta?.lessonFlowToken &&
          !q.meta?.lessonStepLabel
      );
      if (firstNonPriorityIdx === -1) {
        this.ttsQueue.push(queueItem);
      } else {
        this.ttsQueue.splice(firstNonPriorityIdx, 0, queueItem);
      }
    } else {
      this.ttsQueue.push(queueItem);
    }

    // Nếu đang đọc bài thuyết pháp (Dharma) thì ngắt thuyết pháp ngay lập tức để nhường câu cầu nguyện/dâng lễ đọc luôn, tránh chồng âm thanh
    if (this.dharmaNextTimer) {
      clearTimeout(this.dharmaNextTimer);
      this.dharmaNextTimer = null;
    }
    if (this.isSpeakingDharma) {
      this.stopCurrentUtteranceOnly();
    }

    if (!this.isSpeaking) {
      this.processQueue(config);
    } else {
      this.prefetchNextQueueItems(config);
    }
    this.emitEventQueue();
    return true;
  }

  /**
   * Kiểm tra xem một lessonFlowToken còn đang nằm trong câu đang đọc hoặc trong hàng đợi TTS hay không
   */
  public hasPendingFlowToken(token?: string): boolean {
    if (!token) return false;
    if (this.activeEventItem?.meta?.lessonFlowToken === token) {
      return true;
    }
    return this.ttsQueue.some((q) => q.meta?.lessonFlowToken === token);
  }

  /**
   * Tách câu theo dấu kết thúc câu (. ! ?) và giới hạn độ dài an toàn (<= 115 ký tự Tiếng Việt)
   * để không bao giờ bị Google Translate TTS cắt cụt ở giới hạn ~180 byte UTF-8 hoặc bị trình duyệt ngắt giữa chừng ở câu ghép dài (Luồng 5 & 6).
   */
  private splitLongLessonText(rawText: string, maxLen = 115): string[] {
    const clean = (rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    // 1. Tách theo câu hoàn chỉnh (. ! ?) trước để tránh lỗi cắt vế sau dấu chấm than trên Google Stream / Web Speech
    const sentences = clean
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];

    const splitSingleSentence = (sentence: string) => {
      if (sentence.length <= maxLen) {
        chunks.push(sentence);
        return;
      }
      const subClauses = sentence
        .split(/(?<=[,;:])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      let current = '';
      const pushWords = (segment: string) => {
        const words = segment.split(/\s+/).filter(Boolean);
        for (const w of words) {
          const candidate = current ? `${current} ${w}` : w;
          if (candidate.length <= maxLen) {
            current = candidate;
          } else {
            if (current) chunks.push(current);
            current = w;
          }
        }
      };

      for (const clause of subClauses) {
        if (clause.length > maxLen) {
          pushWords(clause);
          continue;
        }
        const candidate = current ? `${current} ${clause}` : clause;
        if (candidate.length <= maxLen) {
          current = candidate;
        } else {
          if (current) chunks.push(current);
          current = clause;
        }
      }
      if (current) chunks.push(current);
    };

    for (const sentence of sentences) {
      splitSingleSentence(sentence);
    }

    return chunks.length > 0 ? chunks : [clean];
  }

  /**
   * Đưa câu đọc của Cô Giáo thuộc Luồng Tiết Học (Luồng 0 -> 6) vào đầu Hàng Chờ Đọc Sự Kiện:
   * - Xóa các câu luồng tiết học cũ chưa kịp đọc (nếu có) để không bao giờ bị trễ pha.
   * - Tự động tách câu dài (> 175 ký tự) thành các vế nối tiếp và gắn lessonFlowToken vào vế cuối cùng để Cô Giáo đọc trọn vẹn 100% câu vinh danh dài trước khi chuyển luồng.
   */
  public enqueueLessonFlowItems(
    items: Array<{
      text: string;
      lang?: 'vi' | 'en';
      lessonFlowToken?: string;
      lessonStepLabel?: string;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }>,
    config: GameConfig
  ): boolean {
    this.latestConfig = config;
    this.primeAudioUnlock();
    if (!config.ttsEnabled) return false;

    const expandedItems: Array<{
      text: string;
      lang?: 'vi' | 'en';
      lessonFlowToken?: string;
      lessonStepLabel?: string;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }> = [];

    for (const rawIt of items) {
      const chunks = this.splitLongLessonText(rawIt.text, 115);
      chunks.forEach((chunkText, chunkIdx) => {
        const isLastChunk = chunkIdx === chunks.length - 1;
        expandedItems.push({
          ...rawIt,
          text: chunkText,
          // Chỉ gắn lessonFlowToken ở đúng vế cuối cùng để chỉ báo hoàn tất sau khi đọc hết toàn bộ câu
          lessonFlowToken: isLastChunk ? rawIt.lessonFlowToken : undefined,
        });
      });
    }

    if (expandedItems.length === 0) return false;

    // Dọn các câu thuộc luồng tiết học cũ còn tồn trong hàng chờ
    this.ttsQueue = this.ttsQueue.filter(
      (q) => !q.meta?.lessonStepLabel && !q.meta?.lessonFlowToken
    );

    const now = Date.now();
    const queueEntries: TTSQueueItem[] = expandedItems.map((it, idx) => ({
      id: `lesson_tts_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      text: it.text,
      isPriority: true,
      lang: it.lang || 'vi',
      addedAt: now + idx,
      meta: {
        reason: 'manual',
        lang: it.lang || 'vi',
        speakerRole: it.speakerRole || 'abbot',
        lessonFlowToken: it.lessonFlowToken,
        lessonStepLabel: it.lessonStepLabel,
      },
    }));

    // Chèn ngay đầu hàng đợi (sau các câu Host Live nếu có)
    let insertIdx = 0;
    while (
      insertIdx < this.ttsQueue.length &&
      this.ttsQueue[insertIdx].isHostLive
    ) {
      insertIdx++;
    }
    this.ttsQueue.splice(insertIdx, 0, ...queueEntries);

    if (this.dharmaNextTimer) {
      clearTimeout(this.dharmaNextTimer);
      this.dharmaNextTimer = null;
    }

    // Chống cắt ngang vô lý khi đang Live:
    // Chỉ ngắt nếu câu đang phát là thuyết pháp nền (Dharma) hoặc là câu thuộc luồng bảng lớp cũ chưa đọc xong.
    // Tuyệt đối KHÔNG cắt ngang giữa chừng câu cảm ơn quà tặng, câu comment của học sinh hoặc phát biểu của Chủ Phòng đang đọc dở!
    const activeIsStaleLessonFlow = Boolean(
      this.activeEventItem &&
        !this.activeEventItem.isHostLive &&
        (this.activeEventItem.meta?.lessonStepLabel ||
          this.activeEventItem.meta?.lessonFlowToken)
    );
    const isInterruptibleActive =
      this.isSpeakingDharma || (this.isSpeaking && activeIsStaleLessonFlow);

    if (isInterruptibleActive) {
      const interruptedItem = this.activeEventItem;
      this.stopCurrentUtteranceOnly();
      if (interruptedItem) {
        this.notifyItemFinished(interruptedItem);
      }
    }

    if (!this.isSpeaking) {
      this.processQueue(config);
    } else {
      this.prefetchNextQueueItems(config);
    }
    this.emitEventQueue();
    return true;
  }

  /**
   * Tạm dừng và dọn các câu thuộc Luồng Tiết Học đang đọc dở khi người dùng bấm Tạm dừng
   * hoặc khi chuyển tiết học sang Bảng Thông Báo.
   */
  public pauseLessonFlowTts(): void {
    this.ttsQueue = this.ttsQueue.filter(
      (q) => !q.meta?.lessonStepLabel && !q.meta?.lessonFlowToken
    );

    const activeIsLessonFlow = Boolean(
      this.activeEventItem &&
        !this.activeEventItem.isHostLive &&
        (this.activeEventItem.meta?.lessonStepLabel ||
          this.activeEventItem.meta?.lessonFlowToken)
    );

    if (activeIsLessonFlow) {
      this.stopCurrentUtteranceOnly();
    }

    this.emitEventQueue();
    if (this.latestConfig && !this.isSpeaking) {
      this.processQueue(this.latestConfig);
    }
  }

  /**
   * Phát biểu ưu tiên tối đa của Chủ Phòng / Giáo Viên (Live Text-to-Audio):
   * - Dùng bộ giọng đọc riêng của Chủ Phòng (hostTtsEngine, hostNodeVoice, hostSystemVoiceURI, hostTtsRate, hostTtsPitch)
   * - Không bị giới hạn số chữ của comment thường (tự tách câu mượt nếu đoạn văn dài)
   * - Hỗ trợ đọc đè ngay lập tức (interrupt = true) hoặc chèn lên vị trí #1 đầu hàng đợi (interrupt = false)
   */
  public speakHostLiveText(
    rawText: string,
    config: GameConfig,
    options?: {
      interrupt?: boolean;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }
  ): boolean {
    this.latestConfig = config;
    this.primeAudioUnlock();
    const cleaned = String(rawText || '')
      .replace(
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27BF\uFE00-\uFE0F\u200D]/gu,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return false;

    const chunks = splitDharmaIntoSentences(cleaned);
    if (chunks.length === 0) return false;

    const now = Date.now();
    const shouldInterrupt =
      options?.interrupt ?? config.hostTtsInterrupt ?? true;
    const speakerRole =
      options?.speakerRole ?? config.hostTtsSpeakerRole ?? 'abbot';

    const hostItems: TTSQueueItem[] = chunks.map((chunk, idx) => ({
      id: `host_tts_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      text: chunk,
      isPriority: true,
      isHostLive: true,
      addedAt: now + idx,
      meta: {
        username: 'Chủ Phòng Live',
        reason: 'host_live',
        isBot: false,
        isHostLive: true,
        speakerRole,
      },
    }));

    if (this.dharmaNextTimer) {
      clearTimeout(this.dharmaNextTimer);
      this.dharmaNextTimer = null;
    }

    if (shouldInterrupt) {
      // Xóa các câu Chủ Phòng cũ còn sót nếu bấm đè liên tục và ngắt ngay câu đang phát để đọc câu mới của Chủ Phòng
      this.ttsQueue = [...hostItems, ...this.ttsQueue];
      if (this.isSpeaking) {
        this.stopCurrentUtteranceOnly();
      }
    } else {
      // Chèn lên đầu hàng đợi (ngay sau các câu Chủ Phòng đang chờ nếu có, nhưng đứng trước tất cả comment/quà của học sinh)
      let insertIdx = 0;
      while (
        insertIdx < this.ttsQueue.length &&
        this.ttsQueue[insertIdx].isHostLive
      ) {
        insertIdx++;
      }
      this.ttsQueue.splice(insertIdx, 0, ...hostItems);
      if (this.isSpeakingDharma) {
        this.stopCurrentUtteranceOnly();
      }
    }

    if (!this.isSpeaking) {
      this.processQueue(config);
    } else {
      this.prefetchNextQueueItems(config);
    }
    this.emitEventQueue();
    return true;
  }

  private scheduleNextDharmaStep(delayMs = 350) {
    if (this.dharmaNextTimer) {
      clearTimeout(this.dharmaNextTimer);
    }
    this.dharmaNextTimer = setTimeout(() => {
      this.dharmaNextTimer = null;
      if (this.latestConfig) {
        this.processQueue(this.latestConfig);
      }
    }, delayMs);
  }

  public skipToNextDharmaArticle(config: GameConfig): string | null {
    const articles = config.dharmaArticles || [];
    if (articles.length === 0) return null;
    const curIdx = articles.findIndex((a) => a.id === config.activeDharmaId);
    const nextIdx = curIdx >= 0 ? (curIdx + 1) % articles.length : 0;
    const nextArticle = articles[nextIdx];
    this.dharmaIndex = 0;
    this.lastDharmaArticleId = nextArticle.id;
    this.lastDharmaContent = nextArticle.content;
    if (this.latestConfig) {
      this.latestConfig = {
        ...this.latestConfig,
        activeDharmaId: nextArticle.id,
      };
    }
    if (this.isSpeakingDharma) {
      this.stopCurrentUtteranceOnly();
      this.scheduleNextDharmaStep(150);
    }
    this.emitDharmaArticleChange(nextArticle.id);
    return nextArticle.id;
  }

  private getNextDharmaSentence(config: GameConfig): string | null {
    if (!config.dharmaEnabled) return null;
    const articles = config.dharmaArticles || [];
    let activeIdx = articles.findIndex((a) => a.id === config.activeDharmaId);
    if (activeIdx < 0) activeIdx = 0;
    let active = articles[activeIdx];
    if (!active || !active.content.trim()) return null;

    if (
      this.lastDharmaArticleId !== active.id ||
      this.lastDharmaContent !== active.content
    ) {
      this.lastDharmaArticleId = active.id;
      this.lastDharmaContent = active.content;
      this.dharmaIndex = 0;
    }

    let sentences = splitDharmaIntoSentences(active.content);
    if (sentences.length === 0) return null;

    if (this.dharmaIndex >= sentences.length) {
      if ((config.dharmaAutoNext ?? true) && articles.length > 1) {
        const nextIdx = (activeIdx + 1) % articles.length;
        const nextArticle = articles[nextIdx];
        if (nextArticle && nextArticle.content.trim()) {
          active = nextArticle;
          this.lastDharmaArticleId = active.id;
          this.lastDharmaContent = active.content;
          this.dharmaIndex = 0;
          if (this.latestConfig) {
            this.latestConfig = {
              ...this.latestConfig,
              activeDharmaId: active.id,
            };
          }
          this.emitDharmaArticleChange(active.id);
          sentences = splitDharmaIntoSentences(active.content);
        } else {
          this.dharmaIndex = 0;
        }
      } else {
        this.dharmaIndex = 0;
      }
    }

    if (sentences.length === 0) return null;
    const line = sentences[this.dharmaIndex];
    this.dharmaIndex = this.dharmaIndex + 1;
    return line;
  }

  private processQueue(config: GameConfig) {
    if (this.isSpeaking) return;

    let nextItem: TTSQueueItem | null = null;
    let nextText: string | null = null;
    let isDharmaLine = false;

    if (this.ttsQueue.length > 0) {
      nextItem = this.ttsQueue.shift()!;
      nextText = nextItem.text;
      isDharmaLine = false;
    } else if (config.dharmaEnabled && !this.remoteSlaveMode) {
      nextText = this.getNextDharmaSentence(config);
      isDharmaLine = true;
    }

    if (!nextText) {
      this.activeEventItem = null;
      this.emitEventQueue();
      return;
    }

    const token = ++this.speechTokenSeq;
    let finishedOnce = false;

    // Dọn dẹp triệt để tiến trình phát cũ (nếu có) trước khi phát câu mới để tuyệt đối không bao giờ bị chồng 2 giọng
    if (this.dharmaNextTimer) {
      clearTimeout(this.dharmaNextTimer);
      this.dharmaNextTimer = null;
    }
    if (this.mutedSimTimer) {
      clearTimeout(this.mutedSimTimer);
      this.mutedSimTimer = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.removeAttribute('src');
        this.currentAudio = null;
      } catch {
        // Ignore
      }
    }
    this.stopCurrentTtsBufferSourceOnly();
    const isHostLiveItem = Boolean(
      !isDharmaLine && (nextItem?.isHostLive || nextItem?.meta?.isHostLive)
    );
    const effectivePlaybackConfig = this.buildEffectiveItemConfig(
      config,
      isHostLiveItem,
      nextItem?.meta?.speakerRole
    );

    const hadPrevFlowUtterance = Boolean(this.currentUtterance);
    if (this.currentUtterance) {
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }

    const itemLang: 'vi' | 'en' =
      (!isDharmaLine && (nextItem?.lang || nextItem?.meta?.lang)) || 'vi';
    const usesWebSpeech =
      itemLang === 'en' || effectivePlaybackConfig.ttsEngine === 'web_speech';

    if (
      hadPrevFlowUtterance &&
      !usesWebSpeech &&
      !this.teacherLiveUtterance &&
      'speechSynthesis' in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      window.speechSynthesis.cancel();
    }

    this.isSpeaking = true;
    this.isSpeakingDharma = isDharmaLine;
    this.activeEventItem = isDharmaLine ? null : nextItem;
    this.currentEventText = isDharmaLine ? '' : nextText;
    if (!isDharmaLine && nextItem && this.onStartEventItemCallback) {
      try {
        this.onStartEventItemCallback(nextItem);
      } catch {
        // Ignore callback error
      }
    }
    this.emitStatus(
      isHostLiveItem
        ? '🎙️ Đang đọc Live Text Chủ Phòng...'
        : isDharmaLine
        ? 'Đang giảng bài...'
        : 'Đang đọc sự kiện...',
      true,
      nextText
    );
    this.emitEventQueue();

    const finish = () => {
      if (finishedOnce || token !== this.speechTokenSeq) return;
      finishedOnce = true;
      this.activeFinishCallback = null;

      const completedItem = isDharmaLine ? null : nextItem;
      this.isSpeaking = false;
      this.isSpeakingDharma = false;
      this.currentEventText = '';
      this.activeEventItem = null;
      const latestCfg = this.latestConfig || config;
      const hasMore =
        this.ttsQueue.length > 0 || Boolean(latestCfg.dharmaEnabled);
      if (!hasMore) {
        this.emitStatus('Sẵn sàng', false, '');
      }
      this.emitEventQueue();
      if (completedItem) {
        this.notifyItemFinished(completedItem);
      }
      const nextSameStep = Boolean(
        completedItem?.meta?.lessonStepLabel &&
          this.ttsQueue[0]?.meta?.lessonStepLabel ===
            completedItem.meta.lessonStepLabel
      );
      this.scheduleNextDharmaStep(
        isDharmaLine ? 380 : nextSameStep ? 35 : 80
      );
    };
    this.activeFinishCallback = finish;

    // Nếu tab hiện tại đang tắt tiếng cục bộ hoặc nhường tiếng cho màn hình OBS Live (?obs=1)
    if (this.isTabMuted()) {
      const wordCount = nextText.split(/\s+/).filter(Boolean).length;
      const effectiveMutedRate =
        itemLang === 'en'
          ? effectivePlaybackConfig.englishTtsRate ?? 0.95
          : effectivePlaybackConfig.ttsRate || 1;
      const simDurationMs = Math.max(
        2200,
        Math.min(
          18000,
          Math.round(
            (wordCount * 460 + 1200) / Math.max(0.5, effectiveMutedRate)
          )
        )
      );
      this.mutedSimTimer = setTimeout(finish, simDurationMs);
      return;
    }

    // 1. Từ vựng Tiếng Anh: 100% luôn đọc bằng Web Speech nước ngoài (en-US), không fallback
    if (itemLang === 'en') {
      this.playViaWebSpeech(
        this.normalizeEnglishVocabText(nextText),
        effectivePlaybackConfig,
        token,
        finish,
        {
          lang: 'en-US',
          rate: Math.max(
            0.5,
            Math.min(2.0, effectivePlaybackConfig.englishTtsRate ?? 0.95)
          ),
          pitch: 1.0,
        }
      );
      return;
    }

    // 2. Tiếng Việt — Lựa chọn 1: Web Speech Tiếng Việt (không fallback, lỗi tự skip)
    if (effectivePlaybackConfig.ttsEngine === 'web_speech') {
      this.playViaWebSpeech(
        nextText,
        effectivePlaybackConfig,
        token,
        finish,
        { lang: 'vi-VN' }
      );
      return;
    }

    // 3. Tiếng Việt — Lựa chọn 2: Google Warm (Có tự động Fallback sang Mirror & Web Speech Tiếng Việt khi nghẽn)
    const isMaleTeacherRole =
      !isDharmaLine && nextItem?.meta?.speakerRole === 'senior_novice';
    this.playViaGoogleStream(
      nextText,
      effectivePlaybackConfig,
      token,
      finish,
      isMaleTeacherRole
    );
  }

  private applyAudioPlaybackParams(
    audio: HTMLAudioElement,
    effectiveRate: number,
    preservePitch: boolean,
    volume: number
  ) {
    const safeRate = Math.max(0.5, Math.min(2.0, Number(effectiveRate) || 1));
    audio.volume = Math.max(0.05, Math.min(1, Number(volume) || 1));
    audio.preservesPitch = preservePitch;
    (
      audio as HTMLAudioElement & {
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      }
    ).mozPreservesPitch = preservePitch;
    (
      audio as HTMLAudioElement & {
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      }
    ).webkitPreservesPitch = preservePitch;
    audio.defaultPlaybackRate = safeRate;
    audio.playbackRate = safeRate;
  }

  private computeStreamPlaybackRateAndPitch(
    _voice: string,
    config: GameConfig
  ): { effectiveRate: number; preservePitch: boolean } {
    const baseRate = Math.max(0.5, Math.min(2.0, config.ttsRate || 1.05));
    const warmPitch = Math.max(0.65, Math.min(1.25, config.ttsPitch ?? 0.88));

    if (Math.abs(warmPitch - 1.0) <= 0.02) {
      return {
        effectiveRate: baseRate,
        preservePitch: true,
      };
    }
    return {
      effectiveRate: Math.max(0.55, Math.min(2.0, baseRate * warmPitch)),
      preservePitch: false,
    };
  }

  private playViaGoogleStream(
    text: string,
    config: GameConfig,
    token: number,
    onDone: () => void,
    forceMaleWarmFilter = false
  ) {
    const shortText = text.trim().slice(0, 195);
    const proxyUrl = `/api/tts?lang=vi&voice=google-vi-warm&text=${encodeURIComponent(
      shortText
    )}`;
    const directMirrors = buildGoogleWarmDirectMirrorUrls(shortText, 180);

    let settled = false;
    let fallbackTriggered = false;
    let hasStartedPlaying = false;
    let activeAudio: HTMLAudioElement | null = null;
    let startLagTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupAudio = () => {
      if (!activeAudio) return;
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.onplaying = null;
      activeAudio.onloadedmetadata = null;
      try {
        activeAudio.pause();
        activeAudio.removeAttribute('src');
        activeAudio.load();
      } catch {
        // Ignore
      }
      if (this.currentAudio === activeAudio) {
        this.currentAudio = null;
      }
      activeAudio = null;
    };

    const clearStartLagTimer = () => {
      if (startLagTimer) {
        clearTimeout(startLagTimer);
        startLagTimer = null;
      }
    };

    const clearStreamTimers = () => {
      clearStartLagTimer();
      if (playbackWatchdog) {
        clearTimeout(playbackWatchdog);
        playbackWatchdog = null;
      }
    };

    // FALLBACK TỰ ĐỘNG: Khi toàn bộ luồng Google Warm (Proxy + Local :8080 + Direct Mirrors) đều nghẽn/lỗi,
    // tự động chuyển câu hiện tại sang Web Speech Tiếng Việt để lớp học không bị mất tiếng,
    // đồng thời giữ nguyên cấu hình Google Warm để câu tiếp theo tự phục hồi ngay khi mạng ổn định!
    const fallbackToWebSpeechOnce = (reasonText: string) => {
      if (settled || fallbackTriggered || token !== this.speechTokenSeq) return;
      fallbackTriggered = true;
      settled = true;
      clearStreamTimers();
      cleanupAudio();
      this.stopCurrentTtsBufferSourceOnly();

      const fromLabel = forceMaleWarmFilter
        ? 'Google Warm (Giọng Nam)'
        : 'Google Warm';
      this.recordTtsDiagnosticIncident(
        {
          type: 'fallback',
          fromSource: fromLabel,
          toSource: 'Web Speech Tiếng Việt (Fallback)',
          reason: reasonText,
          textSample: shortText.slice(0, 48),
        },
        {
          health: 'fallback',
          activeServerLabel: 'Web Speech VI (Dự phòng Google Warm)',
          statusHeadline:
            '🔄 Google Warm nghẽn ➔ Đang đọc dự phòng bằng Web Speech Tiếng Việt',
          statusDetail: `${reasonText} • Câu tiếp theo tự phục hồi lại Google Warm`,
        }
      );

      const fallbackPitch = resolveGoogleWarmWebSpeechFallbackPitch(
        config.ttsPitch,
        forceMaleWarmFilter
      );
      this.playViaWebSpeech(text, config, token, onDone, {
        lang: 'vi-VN',
        rate: config.ttsRate || 1.05,
        pitch: fallbackPitch,
        isFallbackFromGoogleWarm: true,
      });
    };

    const approxStreamRate = Math.max(0.5, Number(config.ttsRate || 1));
    const estimatedPlayMs = Math.max(
      8500,
      Math.min(
        28000,
        Math.ceil(((shortText.split(/\s+/).length * 560 + 4500) / approxStreamRate))
      )
    );
    let playbackWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (settled || token !== this.speechTokenSeq) return;
      if (!hasStartedPlaying) {
        fallbackToWebSpeechOnce(
          'Quá thời gian chờ kết nối Google Warm ➔ Chuyển sang Web Speech dự phòng'
        );
        return;
      }
      settled = true;
      clearStreamTimers();
      cleanupAudio();
      this.stopCurrentTtsBufferSourceOnly();
      onDone();
    }, estimatedPlayMs);

    const proxyFetchBudgetMs = 2800;

    void this.getOrFetchAudioBlobUrl(proxyUrl, proxyFetchBudgetMs).then(
      (blobUrl) => {
        if (settled || token !== this.speechTokenSeq) {
          clearStreamTimers();
          return;
        }
        const meta = this.audioBlobMetaCache.get(proxyUrl);

        const tryDirectMirrorAt = (mirrorIdx: number, lastReason?: string) => {
          if (settled || token !== this.speechTokenSeq) return;
          if (mirrorIdx >= directMirrors.length) {
            fallbackToWebSpeechOnce(
              lastReason ||
                'Các máy chủ Google Warm tạm nghẽn ➔ Chuyển sang Web Speech Tiếng Việt'
            );
            return;
          }
          startViaHtmlAudio(directMirrors[mirrorIdx].url, true, mirrorIdx);
        };

        const startViaHtmlAudio = (
          srcUrl: string,
          isDirectStream = false,
          directMirrorIdx = 0
        ) => {
          if (settled || token !== this.speechTokenSeq) return;
          clearStartLagTimer();
          cleanupAudio();

          const audio = new Audio();
          (
            audio as HTMLAudioElement & { referrerPolicy?: string }
          ).referrerPolicy = 'no-referrer';
          activeAudio = audio;
          this.currentAudio = audio;
          const { effectiveRate, preservePitch } =
            this.computeStreamPlaybackRateAndPitch('google-vi-warm', config);

          const refreshPlaybackWatchdogFromDuration = () => {
            if (
              Number.isFinite(audio.duration) &&
              audio.duration > 0 &&
              audio.duration < 120
            ) {
              if (playbackWatchdog) clearTimeout(playbackWatchdog);
              const exactMs =
                Math.ceil(
                  (audio.duration / Math.max(0.5, effectiveRate)) * 1000
                ) + 1500;
              playbackWatchdog = setTimeout(() => {
                if (settled || token !== this.speechTokenSeq) return;
                settled = true;
                clearStreamTimers();
                cleanupAudio();
                onDone();
              }, Math.max(2200, exactMs));
            }
          };

          let localAttemptFailed = false;
          const cleanupThisAudio = () => {
            audio.onended = null;
            audio.onerror = null;
            audio.onplaying = null;
            audio.onloadedmetadata = null;
            try {
              audio.pause();
              audio.removeAttribute('src');
            } catch {
              // Ignore
            }
            if (activeAudio === audio) {
              activeAudio = null;
            }
            if (this.currentAudio === audio) {
              this.currentAudio = null;
            }
          };

          const failCurrentAudioAttempt = (reason: string) => {
            if (localAttemptFailed || settled || token !== this.speechTokenSeq) {
              return;
            }
            localAttemptFailed = true;
            if (activeAudio === audio) {
              clearStartLagTimer();
            }
            cleanupThisAudio();
            if (!isDirectStream) {
              tryDirectMirrorAt(0, reason);
            } else {
              tryDirectMirrorAt(directMirrorIdx + 1, reason);
            }
          };

          // Mỗi lượt thử kết nối stream có 1.5s riêng để bắt đầu phát (nhanh gọn, không ăn lẹm thời gian bước trước)
          startLagTimer = setTimeout(() => {
            if (!hasStartedPlaying && activeAudio === audio) {
              failCurrentAudioAttempt(
                isDirectStream
                  ? `Stream dự phòng #${directMirrorIdx + 1} phản hồi quá 1.5s`
                  : 'Luồng âm thanh proxy phản hồi chậm quá 1.5s'
              );
            }
          }, 1500);

          audio.src = srcUrl;
          this.applyAudioPlaybackParams(
            audio,
            effectiveRate,
            preservePitch,
            config.ttsVolume
          );

          audio.onloadedmetadata = () => {
            this.applyAudioPlaybackParams(
              audio,
              effectiveRate,
              preservePitch,
              config.ttsVolume
            );
            refreshPlaybackWatchdogFromDuration();
          };

          audio.onplaying = () => {
            if (localAttemptFailed || settled || token !== this.speechTokenSeq) {
              return;
            }
            hasStartedPlaying = true;
            clearStartLagTimer();
            this.applyAudioPlaybackParams(
              audio,
              effectiveRate,
              preservePitch,
              config.ttsVolume
            );
            refreshPlaybackWatchdogFromDuration();
            this.prefetchNextQueueItems(this.latestConfig || config);

            const isRamCache = !isDirectStream && meta?.source === 'ram-cache';
            const usedBackupMirror =
              (!isDirectStream && Boolean(meta?.switchedMirror)) ||
              (isDirectStream && directMirrorIdx > 0);
            const directLabel =
              directMirrors[directMirrorIdx]?.label ||
              'Google Warm (Stream Trực Tiếp)';

            this.ttsDiagnostic = {
              ...this.ttsDiagnostic,
              configuredEngineLabel: this.getConfiguredEngineLabel(config),
              health: usedBackupMirror ? 'server_switched' : 'healthy',
              activeServerLabel: isRamCache
                ? 'Google Warm (RAM Cache 0ms)'
                : isDirectStream
                ? directLabel
                : usedBackupMirror
                ? `Google Warm (${meta?.source || 'Mirror'})`
                : 'Google Warm (Trực tiếp)',
              statusHeadline: usedBackupMirror
                ? '⚡ Đang phát Google Warm qua máy chủ Mirror dự phòng'
                : 'Ổn định • Đang phát giọng Google Warm',
              statusDetail: isRamCache
                ? 'Phát tức thì từ bộ nhớ đệm RAM (0ms)'
                : isDirectStream
                ? `Phát trực tiếp qua ${directLabel}`
                : `Phản hồi Google Warm: ${meta?.latencyMs ?? 0}ms`,
              lastLatencyMs: meta?.latencyMs ?? 0,
              lastUpdatedAt: Date.now(),
            };
            this.emitEventQueue();
          };

          audio.onended = () => {
            if (localAttemptFailed || settled || token !== this.speechTokenSeq) {
              return;
            }
            settled = true;
            clearStreamTimers();
            cleanupThisAudio();
            onDone();
          };

          audio.onerror = () => {
            failCurrentAudioAttempt(
              'Không tải/giải mã được luồng âm thanh Google Warm'
            );
          };

          audio.play().catch((err) => {
            if (localAttemptFailed || settled || token !== this.speechTokenSeq) {
              return;
            }
            if (!isDirectStream && blobUrl) {
              localAttemptFailed = true;
              clearStartLagTimer();
              cleanupThisAudio();
              void this.tryPlayBlobViaWebAudio(
                blobUrl,
                effectiveRate,
                config.ttsVolume,
                token,
                (durSec) => {
                  hasStartedPlaying = true;
                  clearStartLagTimer();
                  if (playbackWatchdog) clearTimeout(playbackWatchdog);
                  const exactMs = Math.ceil(durSec * 1000) + 1500;
                  playbackWatchdog = setTimeout(() => {
                    if (settled || token !== this.speechTokenSeq) return;
                    settled = true;
                    clearStreamTimers();
                    this.stopCurrentTtsBufferSourceOnly();
                    onDone();
                  }, Math.max(2200, exactMs));
                  this.prefetchNextQueueItems(this.latestConfig || config);
                },
                () => {
                  if (settled || token !== this.speechTokenSeq) return;
                  settled = true;
                  clearStreamTimers();
                  onDone();
                }
              ).then((playedViaCtx) => {
                if (!playedViaCtx && !settled && token === this.speechTokenSeq) {
                  const errName = String((err as Error)?.name || '');
                  tryDirectMirrorAt(
                    0,
                    errName === 'NotAllowedError'
                      ? 'Trình duyệt chặn Autoplay HTMLAudio'
                      : 'Không phát được Blob âm thanh Google Warm'
                  );
                }
              });
              return;
            }

            failCurrentAudioAttempt(
              'Không phát được luồng stream trực tiếp Google Warm'
            );
          });
        };

        // Nếu proxy /api/tts và local :8080 không phản hồi -> thử lần lượt các Mirror Stream trực tiếp trên trình duyệt rồi tới Web Speech Tiếng Việt
        if (!blobUrl) {
          tryDirectMirrorAt(
            0,
            'Proxy /api/tts không phản hồi ➔ Thử luồng Mirror trực tiếp'
          );
          return;
        }

        if (forceMaleWarmFilter) {
          void this.tryPlayBlobViaWebAudio(
            blobUrl,
            config.ttsRate || 1.05,
            config.ttsVolume,
            token,
            (actualPlaySec) => {
              hasStartedPlaying = true;
              clearStartLagTimer();
              if (playbackWatchdog) clearTimeout(playbackWatchdog);
              const exactMs = Math.ceil(actualPlaySec * 1000) + 1200;
              playbackWatchdog = setTimeout(() => {
                if (settled || token !== this.speechTokenSeq) return;
                settled = true;
                clearStreamTimers();
                this.stopCurrentTtsBufferSourceOnly();
                onDone();
              }, Math.max(2000, exactMs));
              this.prefetchNextQueueItems(this.latestConfig || config);

              const isRamCache = meta?.source === 'ram-cache';
              this.ttsDiagnostic = {
                ...this.ttsDiagnostic,
                configuredEngineLabel: 'Google Warm (Giọng Nam Thầy Cá)',
                health: meta?.switchedMirror ? 'server_switched' : 'healthy',
                activeServerLabel: isRamCache
                  ? 'Google Warm Nam (RAM Cache 0ms)'
                  : meta?.switchedMirror
                  ? `Google Warm Nam (${meta?.source || 'Mirror'})`
                  : 'Google Warm Nam (Trực tiếp)',
                statusHeadline: 'Ổn định • Đang phát giọng Nam Google Warm (Thầy Cá)',
                statusDetail: isRamCache
                  ? 'Phát tức thì từ bộ nhớ đệm RAM (0ms)'
                  : `Phản hồi Google Warm: ${meta?.latencyMs ?? 0}ms`,
                lastLatencyMs: meta?.latencyMs ?? 0,
                lastUpdatedAt: Date.now(),
              };
              this.emitEventQueue();
            },
            () => {
              if (settled || token !== this.speechTokenSeq) return;
              settled = true;
              clearStreamTimers();
              onDone();
            },
            {
              desiredRate: config.ttsRate || 1.05,
              desiredPitch: config.ttsPitch ?? 0.84,
            }
          ).then((playedMaleCtx) => {
            if (!playedMaleCtx && !settled && token === this.speechTokenSeq) {
              startViaHtmlAudio(blobUrl, false, 0);
            }
          });
          return;
        }

        startViaHtmlAudio(blobUrl, false, 0);
      }
    );
  }

  private playViaWebSpeech(
    text: string,
    config: GameConfig,
    token: number,
    onDone: () => void,
    override?: {
      rate?: number;
      pitch?: number;
      lang?: string;
      isFallbackFromGoogleWarm?: boolean;
    }
  ) {
    if (token !== this.speechTokenSeq) return;
    const targetLang = override?.lang || 'vi-VN';
    const isEnglish = targetLang.toLowerCase().startsWith('en');
    const isGoogleWarmFallback = Boolean(override?.isFallbackFromGoogleWarm);
    const defaultRate = isEnglish
      ? config.englishTtsRate ?? 0.95
      : config.ttsRate;
    const resolvedRate = Math.max(
      0.5,
      Math.min(2.0, override?.rate ?? defaultRate ?? 1.0)
    );
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    let settled = false;
    let cancelDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let voiceWaitTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupTimers = () => {
      if (cancelDelayTimer) {
        clearTimeout(cancelDelayTimer);
        cancelDelayTimer = null;
      }
      if (voiceWaitTimer) {
        clearTimeout(voiceWaitTimer);
        voiceWaitTimer = null;
      }
      clearTimeout(safetyWatchdog);
    };

    const settleOnce = () => {
      if (settled || token !== this.speechTokenSeq) return;
      settled = true;
      cleanupTimers();
      if (this.currentUtterance) {
        this.currentUtterance.onend = null;
        this.currentUtterance.onerror = null;
        this.currentUtterance = null;
      }
      onDone();
    };

    // Đọc không được hoặc thiếu giọng Web Speech tương ứng thì skip gọn (120ms) để không bao giờ treo hàng đợi
    const skipWebSpeechOnce = (reason: string) => {
      if (settled || token !== this.speechTokenSeq) return;
      this.recordTtsDiagnosticIncident(
        {
          type: 'disconnected',
          fromSource: isEnglish
            ? 'Web Speech Nước Ngoài (EN)'
            : isGoogleWarmFallback
            ? 'Web Speech Tiếng Việt (Fallback Google Warm)'
            : 'Web Speech Tiếng Việt',
          toSource: 'Skip (Không đọc được)',
          reason,
          textSample: text.slice(0, 48),
        },
        {
          health: 'disconnected',
          activeServerLabel: isEnglish
            ? 'Web Speech EN (Đã Skip)'
            : 'Web Speech VI (Đã Skip)',
          statusHeadline: `⏭️ ${reason}`,
          statusDetail: isGoogleWarmFallback
            ? 'Cả Google Warm & Web Speech dự phòng đều không khả dụng ở câu này ➔ Đã bỏ qua'
            : 'Không đọc được câu này ➔ Đã tự động bỏ qua',
        }
      );
      cancelDelayTimer = setTimeout(settleOnce, 120);
    };

    if (!('speechSynthesis' in window)) {
      const safetyWatchdog = setTimeout(settleOnce, 500);
      void safetyWatchdog;
      skipWebSpeechOnce('Trình duyệt không hỗ trợ Web Speech API ➔ Đã Skip');
      return;
    }

    const maxExpectedMs = Math.max(
      6500,
      Math.min(
        28000,
        Math.ceil(((wordCount * 580 + 3200) / Math.max(0.5, resolvedRate)))
      )
    );
    let safetyWatchdog: ReturnType<typeof setTimeout>;
    const armWatchdog = (ms: number) => {
      clearTimeout(safetyWatchdog);
      safetyWatchdog = setTimeout(() => {
        if (!settled && token === this.speechTokenSeq) {
          this.recordTtsDiagnosticIncident(
            {
              type: 'disconnected',
              fromSource: isEnglish
                ? 'Web Speech Nước Ngoài (EN)'
                : 'Web Speech Tiếng Việt',
              toSource: 'Skip Quá Hạn',
              reason: `Web Speech treo quá ${(ms / 1000).toFixed(1)}s ➔ Tự động Skip`,
              textSample: text.slice(0, 48),
            },
            {
              health: 'disconnected',
              activeServerLabel: 'Web Speech (Đã tự Skip treo)',
              statusHeadline: '⏭️ Web Speech bị treo ➔ Đã tự động Skip',
            }
          );
        }
        settleOnce();
      }, ms);
    };
    // Chống treo trên nhân CEF của TikTok Live Studio / OBS (nơi speechSynthesis.speak có thể ngâm hàng đợi vô hạn mà không bao giờ gọi onstart):
    // Trước khi onstart nổ, chỉ chờ tối đa 3.2s; ngay khi onstart xác nhận đã phát tiếng thực tế mới nới sang maxExpectedMs!
    const preStartWatchdogMs = this.teacherLiveUtterance ? 5500 : 3200;
    armWatchdog(preStartWatchdogMs);

    const startSpeakingUtterance = (retriedVoices = false) => {
      if (settled || token !== this.speechTokenSeq) return;
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0 && !retriedVoices) {
          voiceWaitTimer = setTimeout(() => startSpeakingUtterance(true), 220);
          return;
        }

        const utter = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utter;
        utter.lang = targetLang;
        utter.rate = resolvedRate;
        utter.pitch = isEnglish
          ? override?.pitch ?? 1.0
          : override?.pitch ?? config.ttsPitch ?? 1.0;
        utter.volume = config.ttsVolume;

        let chosenVoiceName = '';
        if (isEnglish) {
          const enVoices = voices.filter((v) =>
            v.lang.toLowerCase().startsWith('en')
          );
          if (voices.length > 0 && enVoices.length === 0) {
            skipWebSpeechOnce(
              'Máy không có gói giọng Web Speech Tiếng Anh (en-*) ➔ Đã Skip'
            );
            return;
          }
          const preferredEn =
            enVoices.find((v) =>
              /google us english|google uk english|samantha|alex|daniel|david|zira|aria|guy|andrew/i.test(
                v.name
              )
            ) || enVoices[0];
          if (preferredEn) {
            utter.voice = preferredEn;
            chosenVoiceName = preferredEn.name;
          }
        } else {
          const viVoices = voices.filter((v) =>
            v.lang.toLowerCase().includes('vi')
          );
          let chosen = config.selectedSystemVoiceURI
            ? voices.find((v) => v.voiceURI === config.selectedSystemVoiceURI)
            : undefined;
          if (!chosen) {
            chosen =
              viVoices.find((v) =>
                /hoaimy|namminh|an|linh|google tiếng việt|vietnam/i.test(v.name)
              ) || viVoices[0];
          }
          if (voices.length > 0 && !chosen) {
            skipWebSpeechOnce(
              'Máy không có gói giọng Web Speech Tiếng Việt (vi-VN) ➔ Đã Skip'
            );
            return;
          }
          if (chosen) {
            utter.voice = chosen;
            chosenVoiceName = chosen.name;
          }
        }

        const displayVoice = chosenVoiceName || targetLang;
        if (isGoogleWarmFallback) {
          this.ttsDiagnostic = {
            ...this.ttsDiagnostic,
            configuredEngineLabel: this.getConfiguredEngineLabel(config),
            health: 'fallback',
            activeServerLabel: `Web Speech VI (Dự phòng: ${displayVoice.slice(
              0,
              16
            )})`,
            statusHeadline:
              '🔄 Google Warm nghẽn ➔ Đang phát dự phòng qua Web Speech Tiếng Việt',
            statusDetail: `Giọng dự phòng: ${displayVoice} • Câu tiếp theo tự phục hồi lại Google Warm`,
            lastLatencyMs: 0,
            lastUpdatedAt: Date.now(),
          };
        } else {
          this.ttsDiagnostic = {
            ...this.ttsDiagnostic,
            configuredEngineLabel: this.getConfiguredEngineLabel(config),
            health: 'healthy',
            activeServerLabel: isEnglish
              ? `Web Speech EN (${displayVoice.slice(0, 22)})`
              : `Web Speech VI (${displayVoice.slice(0, 22)})`,
            statusHeadline: isEnglish
              ? 'Ổn định • Đang đọc từ Tiếng Anh bằng Web Speech Nước Ngoài'
              : 'Ổn định • Đang phát qua Web Speech Tiếng Việt',
            statusDetail: `Giọng hệ thống: ${displayVoice} (0ms mạng)`,
            lastLatencyMs: 0,
            lastUpdatedAt: Date.now(),
          };
        }
        this.emitEventQueue();

        utter.onstart = () => {
          if (!settled && token === this.speechTokenSeq) {
            armWatchdog(maxExpectedMs);
          }
        };
        utter.onend = settleOnce;
        utter.onerror = (ev) => {
          if (ev.error === 'interrupted' || ev.error === 'canceled') {
            settleOnce();
            return;
          }
          skipWebSpeechOnce(
            `Web Speech báo lỗi (${ev.error || 'không đọc được'}) ➔ Đã Skip`
          );
        };
        window.speechSynthesis.speak(utter);
      } catch {
        skipWebSpeechOnce('Không khởi chạy được Web Speech ➔ Đã Skip');
      }
    };

    try {
      const needCancel =
        !this.teacherLiveUtterance &&
        (window.speechSynthesis.speaking || window.speechSynthesis.pending);
      if (needCancel) {
        window.speechSynthesis.cancel();
        cancelDelayTimer = setTimeout(() => startSpeakingUtterance(false), 45);
      } else {
        startSpeakingUtterance(false);
      }
    } catch {
      skipWebSpeechOnce('Lỗi gọi Web Speech API ➔ Đã Skip');
    }
  }
}

export const soundEngine = new TempleSoundService();
