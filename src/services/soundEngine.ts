import { CameraFocusReason, ClassroomGiftEventId, GameConfig } from '../types/game';

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
  engine?: 'google_stream' | 'node_edge';
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

  // Chế độ kể chuyện / thuyết pháp state
  private dharmaIndex = 0;
  private lastDharmaArticleId = '';
  private lastDharmaContent = '';
  private dharmaNextTimer: ReturnType<typeof setTimeout> | null = null;
  private latestConfig: GameConfig | null = null;

  private localTabMuted = (() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('obs') === '1' || p.get('view') === 'live') {
        return false; // OBS Live screen always has audio enabled
      }
    }
    return sessionStorage.getItem('chua_silent_admin_tab') === 'true';
  })();

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        try {
          if (this.ctx && this.ctx.state === 'suspended') {
            void this.ctx.resume();
          }
          if (this.bgmAudio && this.bgmAudio.paused && this.latestConfig?.bgmEnabled && !this.localTabMuted) {
            void this.bgmAudio.play().catch(() => {});
          }
        } catch {
          // Ignore
        }
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
  private readonly MAX_BLOB_CACHE = 45;

  private ttsDiagnostic: TtsVoiceDiagnosticSnapshot = {
    health: 'healthy',
    configuredEngineLabel: '#2 Google Cloud Stream',
    activeServerLabel: 'Google Stream (#2 • Sẵn sàng)',
    statusHeadline: 'Ổn định • Sẵn sàng phát giọng đọc',
    statusDetail: 'Chưa phát sinh lỗi ngắt quãng, chuyển server hay fallback',
    lastLatencyMs: null,
    lastUpdatedAt: Date.now(),
    totalFallbacks: 0,
    totalServerSwitches: 0,
    totalDisconnects: 0,
    recentIncidents: [],
  };

  private getConfiguredEngineLabel(config?: GameConfig | null): string {
    const engine = config?.ttsEngine || this.latestConfig?.ttsEngine || 'google_stream';
    if (engine === 'node_edge') return '#3 Node.js Local (Edge/GTX)';
    if (engine === 'web_speech') return '#1 Web Speech (Nội bộ)';
    return '#2 Google Cloud Stream';
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

  private getOrFetchAudioBlobUrl(url: string, timeoutMs = 2400): Promise<string | null> {
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    const p = fetch(url, { signal: controller.signal })
      .then(async (res) => {
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
          (url.includes('/api/tts') ? 'google-gtx' : 'node-local');
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
        const blobUrl = URL.createObjectURL(blob);

        const isEdgeNeuralUrl =
          url.includes('HoaiMy') ||
          url.includes('NamMinh') ||
          url.includes('Neural');
        const isFallbackVoiceSource =
          isEdgeNeuralUrl &&
          (rawSource.includes('google') || rawSource.includes('fallback'));

        // Không lưu vĩnh viễn vào RAM cache nếu yêu cầu giọng Edge AI nhưng tạm nhận giọng dự phòng Google,
        // đảm bảo các câu lặp lại như "Đáp án là" luôn gọi lại đúng giọng chính ở lượt sau!
        if (!isFallbackVoiceSource) {
          if (this.audioBlobCache.size >= this.MAX_BLOB_CACHE) {
            const oldestKey = this.audioBlobCache.keys().next().value;
            if (oldestKey) {
              const oldBlobUrl = this.audioBlobCache.get(oldestKey);
              if (oldBlobUrl) {
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
        }
        this.audioBlobMetaCache.set(url, {
          source: rawSource,
          switchedMirror,
          failReason: decodedFail,
          latencyMs,
        });
        return blobUrl;
      })
      .catch(() => {
        clearTimeout(timer);
        return null;
      })
      .finally(() => {
        this.inFlightPrefetches.delete(url);
      });

    this.inFlightPrefetches.set(url, p);
    return p;
  }

  private buildEffectiveItemConfig(
    config: GameConfig,
    isHostLive?: boolean,
    _speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none'
  ): GameConfig {
    if (isHostLive) {
      const hostEngine = config.hostTtsEngine || 'google_stream';
      const rawHostVoice =
        config.hostNodeVoice ||
        (hostEngine === 'node_edge' ? 'vi-VN-HoaiMyNeural' : 'google-vi-gtx');
      return {
        ...config,
        ttsEnabled: true,
        ttsEngine: hostEngine,
        nodeVoice: rawHostVoice,
        selectedSystemVoiceURI:
          config.hostSystemVoiceURI !== undefined
            ? config.hostSystemVoiceURI
            : config.selectedSystemVoiceURI,
        ttsRate: config.hostTtsRate ?? 1.0,
        ttsPitch: config.hostTtsPitch ?? 1.0,
        ttsVolume: config.hostTtsVolume ?? config.ttsVolume ?? 1.0,
        ttsReverb: 0,
      };
    }

    // Tôn trọng 100% giọng đọc (Nam / Nữ / Node.js / Google Stream / Web Speech) và Cao độ (Pitch) do người dùng chọn
    const resolvedVoice =
      config.nodeVoice ||
      (config.ttsEngine === 'node_edge'
        ? 'vi-VN-HoaiMyNeural'
        : 'google-vi-gtx');
    return {
      ...config,
      nodeVoice: resolvedVoice,
    };
  }

  private buildStreamUrlForEngine(
    text: string,
    config: GameConfig,
    isHostLive = false,
    lang: 'vi' | 'en' = 'vi',
    speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none'
  ): string | null {
    const eff = this.buildEffectiveItemConfig(config, isHostLive, speakerRole);
    const shortText = text.slice(0, 195);
    if (lang === 'en') {
      return `/api/tts?lang=en&voice=google-en-gtx&text=${encodeURIComponent(shortText)}`;
    }
    const voice =
      eff.ttsEngine === 'node_edge'
        ? eff.nodeVoice || 'vi-VN-HoaiMyNeural'
        : eff.nodeVoice || 'google-vi-gtx';
    if (eff.ttsEngine === 'google_stream') {
      const streamVoice =
        voice === 'vi-VN-NamMinhNeural'
          ? 'google-vi-male-deep'
          : voice === 'vi-VN-HoaiMyNeural'
          ? 'google-vi-gtx'
          : voice;
      return `/api/tts?lang=vi&voice=${encodeURIComponent(streamVoice)}&text=${encodeURIComponent(shortText)}`;
    }
    if (eff.ttsEngine === 'node_edge') {
      const candidates = this.buildNodeTtsCandidateUrls(
        shortText,
        voice,
        eff.nodeTtsEndpoint
      );
      return candidates[0] || null;
    }
    return null;
  }

  private buildNodeTtsCandidateUrls(
    shortText: string,
    voice: string,
    rawEndpoint?: string
  ): string[] {
    const isEdgeNeural =
      voice.includes('HoaiMy') ||
      voice.includes('NamMinh') ||
      voice.startsWith('vi-VN-');
    const strictParam = isEdgeNeural ? 'strictEdge=1&' : '';
    const query = `${strictParam}voice=${encodeURIComponent(
      voice
    )}&text=${encodeURIComponent(shortText)}`;
    const plainQuery = `voice=${encodeURIComponent(
      voice
    )}&text=${encodeURIComponent(shortText)}`;
    const trimmed = (rawEndpoint || '').trim();
    const isDefaultEndpoint =
      !trimmed ||
      trimmed === 'http://localhost:8080/tts' ||
      trimmed === 'http://127.0.0.1:8080/tts' ||
      trimmed === 'http://localhost:3000/tts' ||
      trimmed === '/tts';

    const urls: string[] = [];
    const addUnique = (base: string, q: string) => {
      const sep = base.includes('?') ? '&' : '?';
      const full = `${base}${sep}${q}`;
      if (!urls.includes(full)) urls.push(full);
    };

    if (isDefaultEndpoint) {
      // Ưu tiên route Node.js /tts cùng tên miền (0ms trễ IPv6/CORS, giữ kết nối WebSocket MsEdgeTTS liên tục),
      // dự phòng sang cổng Node Bridge cục bộ 127.0.0.1:8080 nếu mạng máy chủ chặn Edge
      addUnique('/tts', query);
      addUnique('http://127.0.0.1:8080/tts', plainQuery);
    } else {
      addUnique(trimmed, plainQuery);
      if (!trimmed.startsWith('/')) {
        addUnique('/tts', query);
      }
    }
    return urls;
  }

  private prefetchNextQueueItems(config: GameConfig) {
    if (this.localTabMuted || this.remoteSlaveMode) return;
    const upcoming = this.ttsQueue.slice(0, 2);
    for (const item of upcoming) {
      const streamUrl = this.buildStreamUrlForEngine(
        item.text,
        config,
        Boolean(item.isHostLive),
        item.lang || item.meta?.lang || 'vi',
        item.meta?.speakerRole
      );
      if (streamUrl) {
        void this.getOrFetchAudioBlobUrl(streamUrl, 3000);
      }
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
    sessionStorage.setItem('chua_silent_admin_tab', muted ? 'true' : 'false');
    if (muted) {
      this.stopBgmInternal();
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

    // Cập nhật tức thì tốc độ & âm lượng nếu đang phát HTMLAudioElement (Nguồn 2 & 3)
    if (this.currentAudio) {
      try {
        const isHost = Boolean(
          this.activeEventItem?.isHostLive ||
            this.activeEventItem?.meta?.isHostLive
        );
        const isEn =
          this.activeEventItem?.lang === 'en' ||
          this.activeEventItem?.meta?.lang === 'en';
        const effCfg = this.buildEffectiveItemConfig(
          config,
          isHost,
          this.activeEventItem?.meta?.speakerRole
        );
        const voice = isEn
          ? 'google-en-gtx'
          : effCfg.nodeVoice || 'google-vi-gtx';
        const { effectiveRate, preservePitch } = isEn
          ? {
              effectiveRate: Math.max(
                0.5,
                Math.min(2.0, config.englishTtsRate ?? 0.95)
              ),
              preservePitch: true,
            }
          : this.computeStreamPlaybackRateAndPitch(voice, effCfg);
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
    if (this.teacherLiveGainNode && this.ctx) {
      try {
        const nextTeacherVol = Math.max(
          0,
          Math.min(2.0, Number(config.teacherLiveVolume ?? 1.0))
        );
        this.teacherLiveGainNode.gain.setValueAtTime(
          nextTeacherVol,
          this.ctx.currentTime
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
    this.emitStatus('Sẵn sàng', false, '');
    this.emitEventQueue();
  }

  private stopBgmInternal() {
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
        this.bgmAudio = null;
      } catch {
        // Ignore
      }
    }
    this.currentBgmUrl = null;
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

    const vol = Math.max(0.05, Math.min(1, config.bgmVolume ?? 0.4));

    if (activeTrack.url) {
      // Phát file MP3 người dùng chọn
      if (this.synthBgmInterval) {
        clearInterval(this.synthBgmInterval);
        this.synthBgmInterval = null;
        this.activeSynthPreset = null;
      }
      if (this.currentBgmUrl !== activeTrack.url || !this.bgmAudio) {
        if (this.bgmAudio) {
          try {
            this.bgmAudio.pause();
          } catch {
            // Ignore
          }
        }
        const audio = new Audio(activeTrack.url);
        audio.loop = true;
        audio.volume = vol;
        this.bgmAudio = audio;
        this.currentBgmUrl = activeTrack.url;
        audio.play().catch(() => {
          // Chờ tương tác người dùng đầu tiên
        });
      } else {
        this.bgmAudio.volume = vol;
        if (this.bgmAudio.paused) {
          this.bgmAudio.play().catch(() => {});
        }
      }
    } else {
      // Phát nhạc thiền định mặc định bằng WebAudio (khi chưa nạp file MP3 ngoài)
      if (this.bgmAudio) {
        try {
          this.bgmAudio.pause();
          this.bgmAudio = null;
        } catch {
          // Ignore
        }
        this.currentBgmUrl = null;
      }
      const preset = activeTrack.presetType || 'zen_bowl';
      if (this.activeSynthPreset !== preset || !this.synthBgmInterval) {
        if (this.synthBgmInterval) clearInterval(this.synthBgmInterval);
        this.activeSynthPreset = preset;
        this.playZenAmbientNote(preset, vol);
        this.synthBgmInterval = setInterval(() => {
          if (!this.latestConfig?.bgmEnabled || this.localTabMuted) return;
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

  /**
   * Phát hiệu ứng âm thanh Vỗ Tay Chúc Mừng cả lớp (Applause + Reo hò chiến thắng) ở cuối vòng kiểm tra 15 câu.
   * Trả về thời lượng vỗ tay (ms) để sau khi tiếng vỗ tay kết thúc sẽ kết thúc vòng và sang game mới.
   */
  public playApplauseSfx(volume = 1.0, durationMs = 3400): number {
    if (this.localTabMuted) return durationMs;
    try {
      this.initCtx();
      if (!this.ctx) return durationMs;
      const now = this.ctx.currentTime;
      const safeVol = Math.max(0.05, Math.min(1, volume));
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
  }

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

    let winSize = Math.round(sr * 0.03);
    if (winSize % 2 !== 0) winSize += 1;
    const hopOut = winSize >> 1; // 50% overlap -> tổng hàm cửa sổ Hann luôn bằng 1.0 tuyệt đối
    const hopInNominal = hopOut * safeTempo;
    const searchRadius = Math.round(sr * 0.009);

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
        const stepCand = sr >= 40000 ? 4 : 2;
        const stepCorr = sr >= 40000 ? 3 : 2;

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
   * - KHÔNG xếp vào hàng chờ giọng nói (ttsQueue), KHÔNG làm trễ luồng tiết học.
   * - Hỗ trợ chỉnh đầy đủ Âm lượng (0% - 200%), Tốc độ đọc (0.5x - 2.0x) và Độ trầm giọng Thầy (Pitch).
   */
  public speakTeacherLiveIndependent(
    rawText: string,
    config: GameConfig,
    options?: TeacherLiveVoiceOptions
  ): boolean {
    this.latestConfig = config;
    const cleaned = (rawText || '')
      .replace(
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u2600-\u27BF\uFE00-\uFE0F\u200D]/gu,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return false;

    const chunks = this.splitLongLessonText(cleaned, 175);
    if (chunks.length === 0) return false;

    // Nếu Thầy đang nói câu cũ thì ngắt riêng câu cũ của Thầy để đọc ngay câu mới (không đụng tới Cô Thảo)
    const token = ++this.teacherLiveTokenSeq;
    this.stopTeacherLiveAudioNodesOnly();

    const engine = options?.engine || config.teacherLiveEngine || 'google_stream';
    const voice =
      options?.voice ||
      config.teacherLiveVoice ||
      (engine === 'node_edge' ? 'vi-VN-NamMinhNeural' : 'google-vi-male-deep');
    const desiredRate = Math.max(
      0.5,
      Math.min(2.0, Number(options?.rate ?? config.teacherLiveRate ?? 1.0))
    );
    const desiredVolume = Math.max(
      0,
      Math.min(2.0, Number(options?.volume ?? config.teacherLiveVolume ?? 1.0))
    );
    const isNativeMaleNeural = voice === 'vi-VN-NamMinhNeural';
    const isNativeFemaleVoice =
      voice === 'vi-VN-HoaiMyNeural' ||
      voice === 'google-vi-gtx' ||
      voice === 'google-vi-twob' ||
      voice === 'google-vi-bright' ||
      voice === 'google-vi-slow';
    const desiredPitch = Math.max(
      0.65,
      Math.min(
        1.25,
        Number(
          options?.pitch ??
            config.teacherLivePitch ??
            (isNativeFemaleVoice ? 1.0 : isNativeMaleNeural ? 0.96 : 0.8)
        )
      )
    );

    this.emitTeacherLiveStatus(true, cleaned);

    // Nếu tab hiện tại đang tắt tiếng cục bộ hoặc đang nhường âm thanh cho màn hình OBS Live (?obs=1),
    // chỉ hiển thị trạng thái đang phát trên bảng điều khiển mà không phát trùng âm thanh cục bộ
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

    const buildGoogleFallbackUrl = (chunkText: string): string => {
      const shortChunk = chunkText.slice(0, 195);
      const streamVoice =
        voice === 'vi-VN-NamMinhNeural'
          ? 'google-vi-male-deep'
          : voice === 'vi-VN-HoaiMyNeural'
          ? 'google-vi-gtx'
          : voice;
      return `/api/tts?lang=vi&voice=${encodeURIComponent(
        streamVoice
      )}&text=${encodeURIComponent(shortChunk)}`;
    };

    const resolveChunkBlobUrl = async (
      chunkText: string
    ): Promise<{ blobUrl: string | null; usedFallbackStream: boolean }> => {
      const shortChunk = chunkText.slice(0, 195);
      if (engine === 'node_edge') {
        const candidates = this.buildNodeTtsCandidateUrls(
          shortChunk,
          voice,
          config.nodeTtsEndpoint
        );
        for (const candUrl of candidates) {
          const found = await this.getOrFetchAudioBlobUrl(candUrl, 1600);
          if (token !== this.teacherLiveTokenSeq) {
            return { blobUrl: null, usedFallbackStream: false };
          }
          if (found) {
            return { blobUrl: found, usedFallbackStream: false };
          }
        }
        const fb = await this.getOrFetchAudioBlobUrl(
          buildGoogleFallbackUrl(chunkText),
          2200
        );
        return { blobUrl: fb, usedFallbackStream: true };
      }
      const direct = await this.getOrFetchAudioBlobUrl(
        buildGoogleFallbackUrl(chunkText),
        2200
      );
      return { blobUrl: direct, usedFallbackStream: false };
    };

    const playChunkAt = async (idx: number) => {
      if (token !== this.teacherLiveTokenSeq) return;
      if (idx >= chunks.length) {
        this.stopTeacherLiveAudioNodesOnly();
        this.emitTeacherLiveStatus(false, '');
        return;
      }

      const chunkText = chunks[idx];
      // Tải trước vế kế tiếp song song nếu câu dài
      if (idx + 1 < chunks.length) {
        const nextShort = chunks[idx + 1].slice(0, 195);
        const preloadUrl =
          engine === 'node_edge'
            ? this.buildNodeTtsCandidateUrls(
                nextShort,
                voice,
                config.nodeTtsEndpoint
              )[0]
            : buildGoogleFallbackUrl(chunks[idx + 1]);
        if (preloadUrl) {
          void this.getOrFetchAudioBlobUrl(preloadUrl, 2500);
        }
      }

      const { blobUrl, usedFallbackStream } =
        await resolveChunkBlobUrl(chunkText);
      if (token !== this.teacherLiveTokenSeq) return;

      if (!blobUrl) {
        void playChunkAt(idx + 1);
        return;
      }

      // Ưu tiên giải mã bằng WebAudio API để tách rời hoàn toàn Tốc độ đọc (WSOLA), Độ trầm/cao (Pitch) & Khuếch đại Âm lượng (0% - 200%)
      try {
        this.initCtx();
        if (this.ctx) {
          const res = await fetch(blobUrl);
          const arrBuf = await res.arrayBuffer();
          if (token !== this.teacherLiveTokenSeq) return;

          const decoded = await this.ctx.decodeAudioData(arrBuf.slice(0));
          if (token !== this.teacherLiveTokenSeq) return;

          const effectivePitch =
            isNativeFemaleVoice && !usedFallbackStream
              ? desiredPitch
              : isNativeMaleNeural && !usedFallbackStream
              ? Math.max(0.75, Math.min(1.15, desiredPitch + 0.16))
              : desiredPitch;
          const liveRate = Math.max(
            0.5,
            Math.min(
              2.0,
              Number(options?.rate ?? this.latestConfig?.teacherLiveRate ?? desiredRate)
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
            this.ctx,
            decoded,
            tempo
          );

          const source = this.ctx.createBufferSource();
          source.buffer = processedBuf;
          source.playbackRate.setValueAtTime(effectivePitch, this.ctx.currentTime);

          // Bộ lọc ấm ngực (Low-shelf 175Hz +2.5dB) giúp giọng Thầy Giáo dày ấm, rõ nét khi phát đè trên nhạc nền
          const warmthFilter = this.ctx.createBiquadFilter();
          warmthFilter.type = 'lowshelf';
          warmthFilter.frequency.setValueAtTime(175, this.ctx.currentTime);
          warmthFilter.gain.setValueAtTime(2.5, this.ctx.currentTime);

          const clarityFilter = this.ctx.createBiquadFilter();
          clarityFilter.type = 'peaking';
          clarityFilter.frequency.setValueAtTime(2700, this.ctx.currentTime);
          clarityFilter.Q.setValueAtTime(1.1, this.ctx.currentTime);
          clarityFilter.gain.setValueAtTime(1.8, this.ctx.currentTime);

          const gainNode = this.ctx.createGain();
          gainNode.gain.setValueAtTime(liveVol, this.ctx.currentTime);

          source.connect(warmthFilter);
          warmthFilter.connect(clarityFilter);
          clarityFilter.connect(gainNode);
          gainNode.connect(this.ctx.destination);

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
      } catch {
        // Fallback xuống HTMLAudioElement riêng biệt nếu trình duyệt không hỗ trợ decodeAudioData
      }

      if (token !== this.teacherLiveTokenSeq) return;
      const fallbackAudio = new Audio();
      fallbackAudio.crossOrigin = 'anonymous';
      this.teacherLiveFallbackAudio = fallbackAudio;
      fallbackAudio.src = blobUrl;
      const fallbackRate = Math.max(0.55, Math.min(2.0, desiredRate * desiredPitch));
      this.applyAudioPlaybackParams(
        fallbackAudio,
        fallbackRate,
        false,
        Math.min(1.0, desiredVolume)
      );

      let settled = false;
      const settleFallback = () => {
        if (settled || token !== this.teacherLiveTokenSeq) return;
        settled = true;
        clearTimeout(fbWatchdog);
        void playChunkAt(idx + 1);
      };
      const fbWatchdog = setTimeout(settleFallback, 12000);
      fallbackAudio.onended = settleFallback;
      fallbackAudio.onerror = settleFallback;
      fallbackAudio.play().catch(settleFallback);
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

    this.prefetchNextQueueItems(config);
    this.emitEventQueue();
    this.processQueue(config);
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
   * Tách câu dài (> 175 ký tự) theo dấu câu hoặc khoảng trắng để không bao giờ bị cắt cụt ở giới hạn 195 ký tự của stream TTS
   */
  private splitLongLessonText(rawText: string, maxLen = 175): string[] {
    const clean = (rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    if (clean.length <= maxLen) return [clean];

    const clauses = clean
      .split(/(?<=[.!?।,;:])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];
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

    for (const clause of clauses) {
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
    if (!config.ttsEnabled) return false;

    const expandedItems: Array<{
      text: string;
      lang?: 'vi' | 'en';
      lessonFlowToken?: string;
      lessonStepLabel?: string;
      speakerRole?: 'abbot' | 'senior_novice' | 'junior_novice' | 'none';
    }> = [];

    for (const rawIt of items) {
      const chunks = this.splitLongLessonText(rawIt.text, 175);
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

    // Khi chuyển luồng bảng lớp mới (Luồng 0 -> 6): Luôn ngắt câu đang phát (trừ Live Text trực tiếp của Chủ Phòng)
    // để giọng đọc của Cô Thảo trên Hàng Chờ Âm Thanh luôn khớp 100% với nội dung hiển thị trên bảng lớp!
    const isInterruptibleActive =
      this.isSpeakingDharma ||
      (this.isSpeaking && !this.activeEventItem?.isHostLive);

    if (isInterruptibleActive) {
      const interruptedItem = this.activeEventItem;
      this.stopCurrentUtteranceOnly();
      if (interruptedItem) {
        this.notifyItemFinished(interruptedItem);
      }
    }

    this.prefetchNextQueueItems(config);
    this.emitEventQueue();
    this.processQueue(config);
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

    this.prefetchNextQueueItems(config);
    this.emitEventQueue();
    this.processQueue(config);
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
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const isHostLiveItem = Boolean(
      !isDharmaLine && (nextItem?.isHostLive || nextItem?.meta?.isHostLive)
    );
    const playbackConfig = this.buildEffectiveItemConfig(
      config,
      isHostLiveItem,
      nextItem?.meta?.speakerRole
    );

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

    // Tải trước (Pre-fetch) câu kế tiếp trong hàng chờ vào RAM ngay khi bắt đầu đọc câu hiện tại (triệt tiêu độ trễ mạng giữa các câu)
    this.prefetchNextQueueItems(config);

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
      this.scheduleNextDharmaStep(isDharmaLine ? 380 : 80);
    };
    this.activeFinishCallback = finish;

    const itemLang: 'vi' | 'en' =
      (!isDharmaLine && (nextItem?.lang || nextItem?.meta?.lang)) || 'vi';

    // Nếu tab hiện tại đang tắt tiếng cục bộ (Mute Tab Admin) hoặc đang ở chế độ Remote Slave (có màn hình Live ?obs=1 đang phát),
    // tuyệt đối không gọi /api/tts để không tranh chấp băng thông với màn hình Live!
    if (this.isTabMuted()) {
      const wordCount = nextText.split(/\s+/).filter(Boolean).length;
      const effectiveMutedRate =
        itemLang === 'en'
          ? playbackConfig.englishTtsRate ?? 0.95
          : playbackConfig.ttsRate || 1;
      const simDurationMs = Math.max(
        1400,
        Math.min(
          8500,
          Math.round(
            (wordCount * 310) / Math.max(0.5, effectiveMutedRate)
          )
        )
      );
      this.mutedSimTimer = setTimeout(finish, simDurationMs);
      return;
    }

    if (itemLang === 'en') {
      // Phát âm chuẩn Tiếng Anh bản xứ (tl=en)
      this.playViaGoogleStream(nextText, playbackConfig, token, finish, false, 'en');
    } else if (playbackConfig.ttsEngine === 'node_edge') {
      this.playViaNodeEdge(nextText, playbackConfig, token, finish);
    } else if (playbackConfig.ttsEngine === 'google_stream') {
      this.playViaGoogleStream(nextText, playbackConfig, token, finish, false, 'vi');
    } else {
      this.playViaWebSpeech(nextText, playbackConfig, token, finish);
    }
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
    voice: string,
    config: GameConfig
  ): { effectiveRate: number; preservePitch: boolean } {
    const baseRate = Math.max(0.5, Math.min(2.0, config.ttsRate || 1));
    const pitch = config.ttsPitch ?? 1;

    if (voice === 'google-vi-male-deep') {
      const pitchFactor = pitch < 0.98 ? Math.max(0.72, pitch) : 0.84;
      return {
        effectiveRate: Math.max(0.6, Math.min(2.0, baseRate * pitchFactor)),
        preservePitch: false,
      };
    }
    if (voice === 'google-vi-warm') {
      const warmFactor = pitch < 0.98 ? Math.max(0.78, pitch) : 0.92;
      return {
        effectiveRate: Math.max(0.65, Math.min(2.0, baseRate * warmFactor)),
        preservePitch: false,
      };
    }
    if (voice === 'google-vi-bright') {
      const brightFactor = pitch > 1.02 ? Math.min(1.22, pitch) : 1.08;
      return {
        effectiveRate: Math.max(0.7, Math.min(2.0, baseRate * brightFactor)),
        preservePitch: false,
      };
    }
    // Nếu người dùng chủ động kéo thanh Cao độ (Pitch khác 1.0), áp dụng thay đổi cao độ thực sự
    if (Math.abs(pitch - 1.0) > 0.04) {
      const customPitch = Math.max(0.6, Math.min(1.4, pitch));
      return {
        effectiveRate: Math.max(0.55, Math.min(2.0, baseRate * customPitch)),
        preservePitch: false,
      };
    }
    return {
      effectiveRate: baseRate,
      preservePitch: true,
    };
  }

  private playViaNodeEdge(
    text: string,
    config: GameConfig,
    token: number,
    onDone: () => void
  ) {
    const shortText = text.slice(0, 195);
    const voice = config.nodeVoice || 'vi-VN-HoaiMyNeural';
    const endpoint = config.nodeTtsEndpoint || 'http://localhost:8080/tts';
    const candidateUrls = this.buildNodeTtsCandidateUrls(
      shortText,
      voice,
      endpoint
    );

    let fallbackTriggered = false;
    let hasStartedPlaying = false;
    let activeAudio: HTMLAudioElement | null = null;

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

    const fallbackOnce = (reasonText = 'Server Node.js (#3) phản hồi quá hạn (>2.6s) hoặc mất kết nối') => {
      if (fallbackTriggered || token !== this.speechTokenSeq) return;
      fallbackTriggered = true;
      clearTimeout(lagTimeout);
      cleanupAudio();
      this.recordTtsDiagnosticIncident(
        {
          type: 'fallback',
          fromSource: '#3 Node.js Local',
          toSource: '#2 Google Cloud Stream',
          reason: reasonText,
          textSample: shortText.slice(0, 48),
        },
        {
          health: 'fallback',
          activeServerLabel: 'Fallback: #2 Google Cloud Stream',
          statusHeadline: '⚠️ Đứt/Trễ #3 Node.js ➔ Đã Fallback sang #2 Google Stream',
          statusDetail: reasonText,
        }
      );
      // Ưu tiên dự phòng sang Google Cloud Stream đa máy chủ (/api/tts) trước để giữ đồng nhất màu giọng MP3 và âm lượng, nếu vẫn lỗi mới xuống WebSpeech
      this.playViaGoogleStream(text, config, token, onDone, true);
    };

    const lagTimeout = setTimeout(() => {
      if (!hasStartedPlaying) {
        fallbackOnce('Server Node.js (#3) trễ >4.8s ➔ Tự chuyển sang #2 Google Stream');
      }
    }, 4800);

    // Bộ đếm bảo hiểm chống treo sự kiện onended trên OBS Browser Source (CEF)
    const estimatedPlayMs = Math.max(
      5500,
      Math.min(20000, text.split(/\s+/).length * 460 + 3200)
    );
    let playbackWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (fallbackTriggered || token !== this.speechTokenSeq) return;
      fallbackTriggered = true;
      clearTimeout(lagTimeout);
      cleanupAudio();
      onDone();
    }, estimatedPlayMs);

    const clearNodeTimers = () => {
      clearTimeout(lagTimeout);
      if (playbackWatchdog) {
        clearTimeout(playbackWatchdog);
        playbackWatchdog = null;
      }
    };

    void (async () => {
      let blobUrl: string | null = null;
      let usedUrl = candidateUrls[0] || '';
      for (let i = 0; i < candidateUrls.length; i++) {
        const cand = candidateUrls[i];
        const found = await this.getOrFetchAudioBlobUrl(
          cand,
          i === 0 ? 3200 : 1800
        );
        if (fallbackTriggered || token !== this.speechTokenSeq) {
          clearNodeTimers();
          return;
        }
        if (found) {
          blobUrl = found;
          usedUrl = cand;
          break;
        }
      }
      if (!blobUrl) {
        clearNodeTimers();
        fallbackOnce('Không kết nối được cổng Node.js (#3) ➔ Chuyển sang #2 Google Stream');
        return;
      }
      const meta = this.audioBlobMetaCache.get(usedUrl);
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      activeAudio = audio;
      this.currentAudio = audio;
      const { effectiveRate, preservePitch } =
        this.computeStreamPlaybackRateAndPitch(voice, config);

      const refreshPlaybackWatchdogFromDuration = () => {
        if (
          Number.isFinite(audio.duration) &&
          audio.duration > 0 &&
          audio.duration < 120
        ) {
          if (playbackWatchdog) clearTimeout(playbackWatchdog);
          const exactMs =
            Math.ceil((audio.duration / Math.max(0.5, effectiveRate)) * 1000) +
            1500;
          playbackWatchdog = setTimeout(() => {
            if (fallbackTriggered || token !== this.speechTokenSeq) return;
            fallbackTriggered = true;
            clearNodeTimers();
            cleanupAudio();
            onDone();
          }, Math.max(2200, exactMs));
        }
      };

      // QUAN TRỌNG: Gán audio.src trước, sau đó mới gán defaultPlaybackRate & playbackRate
      // vì theo chuẩn HTML5, gán audio.src sẽ reset playbackRate về defaultPlaybackRate (1.0)
      audio.src = blobUrl;
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
        hasStartedPlaying = true;
        clearTimeout(lagTimeout);
        this.applyAudioPlaybackParams(
          audio,
          effectiveRate,
          preservePitch,
          config.ttsVolume
        );
        refreshPlaybackWatchdogFromDuration();
        this.ttsDiagnostic = {
          ...this.ttsDiagnostic,
          configuredEngineLabel: this.getConfiguredEngineLabel(config),
          health: 'healthy',
          activeServerLabel:
            meta?.source === 'ram-cache'
              ? 'Node.js (#3 • RAM Cache 0ms)'
              : `Node.js (#3 • ${voice})`,
          statusHeadline: 'Ổn định • Đang phát trực tiếp từ Server Node.js (#3)',
          statusDetail:
            meta?.source === 'ram-cache'
              ? 'Phát tức thì từ bộ nhớ đệm RAM (0ms)'
              : `Kết nối tốt tới ${usedUrl.split('?')[0]} (${meta?.latencyMs ?? 0}ms)`,
          lastLatencyMs: meta?.latencyMs ?? 0,
          lastUpdatedAt: Date.now(),
        };
        this.emitEventQueue();
      };

      audio.onended = () => {
        if (fallbackTriggered || token !== this.speechTokenSeq) return;
        fallbackTriggered = true;
        clearNodeTimers();
        cleanupAudio();
        onDone();
      };

      audio.onerror = () => {
        clearNodeTimers();
        fallbackOnce('Luồng âm thanh Node.js (#3) bị đứt khi đang tải');
      };

      audio.play().catch(() => {
        clearNodeTimers();
        fallbackOnce('Không thể khởi chạy Audio từ Node.js (#3)');
      });
    })();
  }

  private playViaGoogleStream(
    text: string,
    config: GameConfig,
    token: number,
    onDone: () => void,
    isFallbackFromNode = false,
    lang: 'vi' | 'en' = 'vi'
  ) {
    const shortText = text.slice(0, 195);
    const rawViVoice = config.nodeVoice || 'google-vi-gtx';
    const voice =
      lang === 'en'
        ? 'google-en-gtx'
        : rawViVoice === 'vi-VN-NamMinhNeural'
        ? 'google-vi-male-deep'
        : rawViVoice === 'vi-VN-HoaiMyNeural'
        ? 'google-vi-gtx'
        : rawViVoice;
    const proxyUrl = `/api/tts?lang=${lang}&voice=${encodeURIComponent(
      voice
    )}&text=${encodeURIComponent(shortText)}`;

    let fallbackTriggered = false;
    let hasStartedPlaying = false;
    let activeAudio: HTMLAudioElement | null = null;

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

    const fallbackOnce = (reasonText = 'Luồng Google Cloud Stream (#2) quá hạn phản hồi') => {
      if (fallbackTriggered || token !== this.speechTokenSeq) return;
      fallbackTriggered = true;
      clearTimeout(lagTimeout);
      cleanupAudio();
      this.recordTtsDiagnosticIncident(
        {
          type: 'fallback',
          fromSource: isFallbackFromNode
            ? '#3 Node & #2 Google Stream'
            : '#2 Google Cloud Stream',
          toSource: '#1 Web Speech (Nội bộ)',
          reason: reasonText,
          textSample: shortText.slice(0, 48),
        },
        {
          health: 'fallback',
          activeServerLabel: 'Fallback Khẩn: #1 Web Speech (Nội bộ)',
          statusHeadline: '🚨 Đứt luồng Stream (#2) ➔ Đang Fallback về #1 Web Speech',
          statusDetail: reasonText,
        }
      );
      this.playViaWebSpeech(
        text,
        config,
        token,
        onDone,
        lang === 'en'
          ? {
              lang: 'en-US',
              rate: Math.max(0.5, Math.min(2.0, config.englishTtsRate ?? 0.95)),
            }
          : undefined,
        true
      );
    };

    const timeoutBudget = isFallbackFromNode ? 1800 : 2300;
    const lagTimeout = setTimeout(() => {
      if (!hasStartedPlaying) {
        fallbackOnce(
          `Máy chủ Google Stream (#2) phản hồi chậm >${(timeoutBudget / 1000).toFixed(1)}s ➔ Chuyển sang #1 Web Speech`
        );
      }
    }, timeoutBudget);

    // Bộ đếm bảo hiểm chống treo sự kiện onended trên OBS Browser Source (CEF)
    const estimatedPlayMs = Math.max(
      5500,
      Math.min(20000, shortText.split(/\s+/).length * 460 + 3200)
    );
    let playbackWatchdog: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (fallbackTriggered || token !== this.speechTokenSeq) return;
      fallbackTriggered = true;
      clearTimeout(lagTimeout);
      cleanupAudio();
      onDone();
    }, estimatedPlayMs);

    const clearStreamTimers = () => {
      clearTimeout(lagTimeout);
      if (playbackWatchdog) {
        clearTimeout(playbackWatchdog);
        playbackWatchdog = null;
      }
    };

    void this.getOrFetchAudioBlobUrl(proxyUrl, timeoutBudget - 150).then(
      (blobUrl) => {
        if (fallbackTriggered || token !== this.speechTokenSeq) {
          clearStreamTimers();
          return;
        }
        if (!blobUrl) {
          clearStreamTimers();
          fallbackOnce('Cả 2 máy chủ Google GTX & TW-OB đều không phản hồi ➔ Chuyển sang #1 Web Speech');
          return;
        }
        const meta = this.audioBlobMetaCache.get(proxyUrl);
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        activeAudio = audio;
        this.currentAudio = audio;
        const { effectiveRate, preservePitch } =
          lang === 'en'
            ? {
                effectiveRate: Math.max(
                  0.5,
                  Math.min(2.0, config.englishTtsRate ?? 0.95)
                ),
                preservePitch: true,
              }
            : this.computeStreamPlaybackRateAndPitch(voice, config);

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
              if (fallbackTriggered || token !== this.speechTokenSeq) return;
              fallbackTriggered = true;
              clearStreamTimers();
              cleanupAudio();
              onDone();
            }, Math.max(2200, exactMs));
          }
        };

        // QUAN TRỌNG: Gán audio.src trước, sau đó mới gán defaultPlaybackRate & playbackRate
        // vì theo chuẩn HTML5, gán audio.src sẽ reset playbackRate về defaultPlaybackRate (1.0)
        audio.src = blobUrl;
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
          hasStartedPlaying = true;
          clearTimeout(lagTimeout);
          this.applyAudioPlaybackParams(
            audio,
            effectiveRate,
            preservePitch,
            config.ttsVolume
          );
          refreshPlaybackWatchdogFromDuration();

          const srcLabel =
            meta?.source === 'ram-cache'
              ? 'RAM Cache (0ms)'
              : meta?.source === 'google-tw-ob'
              ? 'Server TW-OB'
              : 'Server GTX';

          if (meta?.switchedMirror) {
            this.recordTtsDiagnosticIncident(
              {
                type: 'server_switch',
                fromSource:
                  voice === 'google-vi-twob' ? 'Server TW-OB' : 'Server GTX',
                toSource: srcLabel,
                reason: meta.failReason
                  ? `Máy chủ chính bị ngắt (${meta.failReason}) ➔ Tự chuyển sang ${srcLabel}`
                  : `Tự động chuyển đổi sang máy chủ dự phòng ${srcLabel}`,
                textSample: shortText.slice(0, 48),
              },
              {
                health: 'server_switched',
                activeServerLabel: `Google Stream (#2 • Dự phòng ${srcLabel})`,
                statusHeadline: `🔄 Đã tự động chuyển Server đọc sang ${srcLabel}`,
                statusDetail: meta.failReason
                  ? `Nguyên nhân: ${meta.failReason} • Độ trễ: ${meta.latencyMs}ms`
                  : `Đang phát ổn định trên máy chủ dự phòng (${meta.latencyMs}ms)`,
                lastLatencyMs: meta.latencyMs,
              }
            );
          } else if (isFallbackFromNode) {
            this.ttsDiagnostic = {
              ...this.ttsDiagnostic,
              configuredEngineLabel: this.getConfiguredEngineLabel(config),
              health: 'fallback',
              activeServerLabel: `Fallback #2 Google Stream (${srcLabel})`,
              statusHeadline: `⚠️ Đang chạy dự phòng trên #2 Google Stream (${srcLabel})`,
              statusDetail: `Do #3 Node.js Local không phản hồi • Độ trễ: ${meta?.latencyMs ?? 0}ms`,
              lastLatencyMs: meta?.latencyMs ?? 0,
              lastUpdatedAt: Date.now(),
            };
            this.emitEventQueue();
          } else {
            this.ttsDiagnostic = {
              ...this.ttsDiagnostic,
              configuredEngineLabel: this.getConfiguredEngineLabel(config),
              health: 'healthy',
              activeServerLabel: `Google Stream (#2 • ${srcLabel})`,
              statusHeadline: `Ổn định • Đang phát qua #2 Google Stream (${srcLabel})`,
              statusDetail:
                meta?.source === 'ram-cache'
                  ? 'Phát tức thì từ bộ nhớ đệm Pre-fetch RAM (0ms)'
                  : `Kết nối trực tiếp máy chủ ${srcLabel} • Phản hồi: ${meta?.latencyMs ?? 0}ms`,
              lastLatencyMs: meta?.latencyMs ?? 0,
              lastUpdatedAt: Date.now(),
            };
            this.emitEventQueue();
          }
        };

        audio.onended = () => {
          if (fallbackTriggered || token !== this.speechTokenSeq) return;
          fallbackTriggered = true;
          clearStreamTimers();
          cleanupAudio();
          onDone();
        };

        audio.onerror = () => {
          clearStreamTimers();
          fallbackOnce('File âm thanh từ Google Stream (#2) bị đứt giữa chừng');
        };

        audio.play().catch(() => {
          clearStreamTimers();
          fallbackOnce('Trình duyệt chặn hoặc lỗi giải mã luồng Google Stream (#2)');
        });
      }
    );
  }

  private playViaWebSpeech(
    text: string,
    config: GameConfig,
    token: number,
    onDone: () => void,
    override?: { rate?: number; pitch?: number; lang?: string },
    isFallbackFromStream = false
  ) {
    if (token !== this.speechTokenSeq) return;
    if (!('speechSynthesis' in window)) {
      this.recordTtsDiagnosticIncident(
        {
          type: 'disconnected',
          fromSource: '#1 Web Speech',
          toSource: 'Không hỗ trợ',
          reason: 'Trình duyệt/OBS không hỗ trợ Web Speech API nội bộ',
          textSample: text.slice(0, 48),
        },
        {
          health: 'disconnected',
          activeServerLabel: 'Không có Engine (#1 Bị khóa)',
          statusHeadline: '❌ Trình duyệt không hỗ trợ #1 Web Speech',
        }
      );
      onDone();
      return;
    }

    let settled = false;
    const settleOnce = () => {
      if (settled || token !== this.speechTokenSeq) return;
      settled = true;
      clearTimeout(safetyWatchdog);
      onDone();
    };

    // Bảo vệ trường hợp trình duyệt treo sự kiện onend của WebSpeech
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const maxExpectedMs = Math.max(4000, Math.min(18000, wordCount * 550 + 2500));
    const safetyWatchdog = setTimeout(() => {
      if (!settled && token === this.speechTokenSeq) {
        this.recordTtsDiagnosticIncident(
          {
            type: 'disconnected',
            fromSource: '#1 Web Speech',
            toSource: 'Watchdog Tự Ngắt',
            reason: `Giọng #1 Web Speech bị đứt/treo quá ${(maxExpectedMs / 1000).toFixed(1)}s ➔ Tự động giải phóng hàng chờ`,
            textSample: text.slice(0, 48),
          },
          {
            health: 'disconnected',
            activeServerLabel: '#1 Web Speech (Đã tự giải phóng treo)',
            statusHeadline: '❌ Giọng #1 Web Speech bị treo/ngắt quãng ➔ Đã tự ngắt an toàn',
          }
        );
      }
      settleOnce();
    }, maxExpectedMs);

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const targetLang = override?.lang || 'vi-VN';
      utter.lang = targetLang;
      const defaultRate = targetLang.toLowerCase().startsWith('en')
        ? config.englishTtsRate ?? 0.95
        : config.ttsRate;
      utter.rate = Math.max(0.5, Math.min(2.0, override?.rate ?? defaultRate));
      utter.pitch = override?.pitch ?? config.ttsPitch;
      utter.volume = config.ttsVolume;

      const voices = window.speechSynthesis.getVoices();
      let chosenVoiceName = 'Mặc định trình duyệt';
      if (targetLang.toLowerCase().startsWith('en')) {
        const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
        if (enVoice) {
          utter.voice = enVoice;
          chosenVoiceName = enVoice.name;
        }
      } else {
        let chosen = config.selectedSystemVoiceURI
          ? voices.find((v) => v.voiceURI === config.selectedSystemVoiceURI)
          : undefined;
        if (!chosen) {
          chosen = voices.find((v) => v.lang.toLowerCase().includes('vi'));
        }
        if (chosen) {
          utter.voice = chosen;
          chosenVoiceName = chosen.name;
        }
      }

      if (!isFallbackFromStream) {
        this.ttsDiagnostic = {
          ...this.ttsDiagnostic,
          configuredEngineLabel: this.getConfiguredEngineLabel(config),
          health: 'healthy',
          activeServerLabel: `Web Speech (#1 • ${chosenVoiceName.slice(0, 22)})`,
          statusHeadline: 'Ổn định • Đang phát qua #1 Web Speech nội bộ',
          statusDetail: `Giọng hệ thống: ${chosenVoiceName} (0ms mạng)`,
          lastLatencyMs: 0,
          lastUpdatedAt: Date.now(),
        };
        this.emitEventQueue();
      }

      utter.onend = settleOnce;
      utter.onerror = (ev) => {
        if (
          token === this.speechTokenSeq &&
          ev.error !== 'interrupted' &&
          ev.error !== 'canceled'
        ) {
          this.recordTtsDiagnosticIncident(
            {
              type: 'disconnected',
              fromSource: '#1 Web Speech',
              toSource: 'Bỏ qua câu lỗi',
              reason: `Lỗi giọng đọc trình duyệt (${ev.error || 'unknown'})`,
              textSample: text.slice(0, 48),
            },
            {
              health: 'disconnected',
              statusHeadline: `❌ Giọng #1 Web Speech báo lỗi (${ev.error || 'ngắt quãng'})`,
            }
          );
        }
        settleOnce();
      };
      window.speechSynthesis.speak(utter);
    } catch {
      settleOnce();
    }
  }
}

export const soundEngine = new TempleSoundService();
