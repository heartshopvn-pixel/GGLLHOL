import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  applyEulerSignConfig,
  classifyTikTokError,
  computeTikTokReconnectPlan,
} from './src/utils/tiktokReconnectPolicy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STUDENT_EXP_JSON_PATH = path.join(__dirname, 'classroom-student-exp.json');

function resolveServerEulerApiKey(): string {
  const fromEnv = String(
    process.env.EULER_API_KEY || process.env.SIGN_API_KEY || ''
  ).trim();
  if (fromEnv) return fromEnv;

  try {
    const keyTxtPath = path.join(__dirname, 'euler_key.txt');
    if (fs.existsSync(keyTxtPath)) {
      const txt = fs.readFileSync(keyTxtPath, 'utf-8').trim();
      if (txt && !txt.startsWith('#')) return txt;
    }
  } catch {
    // Ignore
  }

  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^(?:EULER_API_KEY|SIGN_API_KEY)\s*=\s*(.*)$/);
        if (match) {
          const val = match[1].trim().replace(/^['"]|['"]$/g, '');
          if (val) return val;
        }
      }
    }
  } catch {
    // Ignore
  }

  return '';
}

process.on('uncaughtException', (err) => {
  console.error('⚠️ [UNCAUGHT EXCEPTION]:', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️ [UNHANDLED REJECTION]:', reason?.message || reason);
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  app.use((err: any, _req: Request, res: Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      res.status(413).json({ ok: false, error: 'Payload too large' });
      return;
    }
    next(err);
  });

  // Persistent JSON storage for Student EXP & Gold Trophies ({ [userId]: exp/trophies } with value > 0)
  let serverStudentExpMap: Record<string, number> = {};
  let serverStudentTrophyMap: Record<string, number> = {};
  try {
    if (fs.existsSync(STUDENT_EXP_JSON_PATH)) {
      const raw = fs.readFileSync(STUDENT_EXP_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      const mapCandidate = parsed?.studentExpMap || (!parsed?.studentTrophyMap ? parsed : null);
      if (mapCandidate && typeof mapCandidate === 'object') {
        for (const [k, v] of Object.entries(mapCandidate)) {
          const expVal = Math.floor(Number(v) || 0);
          if (k && expVal > 0) {
            serverStudentExpMap[k.trim().toLowerCase()] = expVal;
          }
        }
      }
      const trophyCandidate = parsed?.studentTrophyMap;
      if (trophyCandidate && typeof trophyCandidate === 'object') {
        for (const [k, v] of Object.entries(trophyCandidate)) {
          const trophyVal = Math.floor(Number(v) || 0);
          if (k && trophyVal > 0) {
            serverStudentTrophyMap[k.trim().toLowerCase()] = trophyVal;
          }
        }
      }
    }
  } catch {
    // Ignore read error
  }

  let expDiskFlushTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleFlushExpToDisk = () => {
    if (expDiskFlushTimer) return;
    expDiskFlushTimer = setTimeout(() => {
      expDiskFlushTimer = null;
      fs.promises
        .writeFile(
          STUDENT_EXP_JSON_PATH,
          JSON.stringify(
            {
              studentExpMap: serverStudentExpMap,
              studentTrophyMap: serverStudentTrophyMap,
            },
            null,
            2
          ),
          'utf-8'
        )
        .catch(() => {
          // Ignore disk write error
        });
    }, 1500);
  };

  app.get('/api/student-exp', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      studentExpMap: serverStudentExpMap,
      studentTrophyMap: serverStudentTrophyMap,
    });
  });

  app.post('/api/student-exp', (req: Request, res: Response) => {
    const incoming = req.body?.studentExpMap;
    const incomingTrophies = req.body?.studentTrophyMap;
    const replaceAll = Boolean(req.body?.replaceAll);
    let mutated = false;

    if (incoming && typeof incoming === 'object') {
      if (replaceAll) {
        serverStudentExpMap = {};
      }
      for (const [k, v] of Object.entries(incoming)) {
        const cleanKey = String(k || '').trim().toLowerCase();
        const expVal = Math.floor(Number(v) || 0);
        if (cleanKey && expVal > 0) {
          const prev = serverStudentExpMap[cleanKey] || 0;
          serverStudentExpMap[cleanKey] = replaceAll ? expVal : Math.max(prev, expVal);
        }
      }
      mutated = true;
    }

    if (incomingTrophies && typeof incomingTrophies === 'object') {
      if (replaceAll) {
        serverStudentTrophyMap = {};
      }
      for (const [k, v] of Object.entries(incomingTrophies)) {
        const cleanKey = String(k || '').trim().toLowerCase();
        const trophyVal = Math.floor(Number(v) || 0);
        if (cleanKey && trophyVal > 0) {
          const prev = serverStudentTrophyMap[cleanKey] || 0;
          serverStudentTrophyMap[cleanKey] = replaceAll
            ? trophyVal
            : Math.max(prev, trophyVal);
        }
      }
      mutated = true;
    }

    if (mutated) {
      scheduleFlushExpToDisk();
    }
    res.json({
      ok: true,
      count: Object.keys(serverStudentExpMap).length,
      trophyCount: Object.keys(serverStudentTrophyMap).length,
    });
  });

  // Connected SSE clients (Admin Tabs + OBS Browser Source Windows)
  const clients = new Set<{ id: string; role: string; res: Response }>();

  const broadcastPeerCount = () => {
    const obsCount = Array.from(clients).filter((c) => c.role === 'obs').length;
    const totalCount = clients.size;
    const msg = `data: ${JSON.stringify({
      type: 'PEER_STATUS',
      totalPeers: totalCount,
      obsPeers: obsCount,
    })}\n\n`;
    clients.forEach((c) => {
      try {
        c.res.write(msg);
      } catch {
        // Ignore write error
      }
    });
  };

  // Real-time SSE Stream for syncing Admin Tab -> OBS Browser Source (?obs=1)
  app.get('/api/sync-stream', (req: Request, res: Response) => {
    const clientId = String(req.query.clientId || Math.random());
    const role = String(req.query.role || 'admin');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientObj = { id: clientId, role, res };
    clients.add(clientObj);
    broadcastPeerCount();

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        // Ignore
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(clientObj);
      broadcastPeerCount();
    });
  });

  // Receive command from Admin Tab and broadcast to all OBS / Live screens
  app.post('/api/sync-command', (req: Request, res: Response) => {
    const { senderId, packet } = req.body || {};
    if (!packet) {
      res.status(400).json({ ok: false });
      return;
    }

    const payloadStr = `data: ${JSON.stringify(packet)}\n\n`;
    clients.forEach((c) => {
      if (c.id !== senderId) {
        try {
          c.res.write(payloadStr);
        } catch {
          // Ignore
        }
      }
    });

    res.json({ ok: true, deliveredTo: Math.max(0, clients.size - 1) });
  });

  // CORS middleware for local Node server.js -> Cloud Webhook relay
  app.use('/api/tiktok-webhook', (req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const broadcastSSE = (payload: Record<string, any>) => {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((c) => {
      try {
        c.res.write(msg);
      } catch {
        // Ignore write error
      }
    });
  };

  let serverTikTokSeq = 0;

  const parseServerInt64Str = (val: any): string | undefined => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'bigint') return val > 0n ? val.toString(10) : undefined;
    if (typeof val === 'number') {
      return Number.isFinite(val) && val > 0 ? Math.trunc(val).toString(10) : undefined;
    }
    if (typeof val === 'string') {
      const s = val.trim();
      if (/^\d+$/.test(s)) {
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
  };

  const normalizeServerCreateTimeMs = (val: any): number | undefined => {
    const str = parseServerInt64Str(val);
    if (!str) return undefined;
    const n = Number(str);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (n >= 1_000_000_000 && n < 100_000_000_000) return Math.trunc(n * 1000);
    if (n >= 100_000_000_000 && n < 100_000_000_000_000) return Math.trunc(n);
    if (n >= 100_000_000_000_000 && n < 100_000_000_000_000_000) return Math.trunc(n / 1000);
    return undefined;
  };

  const extractServerTikTokOrderFields = (data: any) => {
    const seq = ++serverTikTokSeq;
    const nowMs = Date.now();
    const tiktokMsgId = parseServerInt64Str(
      data?.tiktokMsgId ??
        data?.common?.msgId ??
        data?.msgId ??
        data?.messageId ??
        data?.common?.messageId
    );
    const tiktokCreateTimeMs = normalizeServerCreateTimeMs(
      data?.tiktokCreateTimeMs ??
        data?.common?.createTime ??
        data?.createTime ??
        data?.timestamp
    );
    const incomingSeq = Number(data?.serverSeq);
    return {
      tiktokMsgId,
      tiktokCreateTimeMs,
      serverSeq: Number.isFinite(incomingSeq) && incomingSeq > 0 ? Math.trunc(incomingSeq) : seq,
      serverReceivedAtMs:
        Number.isFinite(Number(data?.serverReceivedAtMs)) && Number(data?.serverReceivedAtMs) > 0
          ? Math.trunc(Number(data.serverReceivedAtMs))
          : nowMs,
    };
  };

  const forwardWebhookSingleItem = (item: any) => {
    if (!item || typeof item !== 'object') return;
    if (item.type === 'status') {
      broadcastSSE({
        type: 'TIKTOK_LIVE_STATUS',
        status: item.status || 'connected',
        username: item.username || '',
        roomId: item.roomId || '',
        message: item.message || '',
        eulerKeyConfigured:
          typeof item.eulerKeyConfigured === 'boolean'
            ? item.eulerKeyConfigured
            : Boolean(resolveServerEulerApiKey()),
      });
      return;
    }
    if (
      item.type === 'chat' ||
      item.type === 'comment' ||
      item.type === 'gift' ||
      item.type === 'like' ||
      item.type === 'follow'
    ) {
      const orderFields = extractServerTikTokOrderFields(item);
      broadcastSSE({
        type: 'TIKTOK_LIVE_EVENT',
        event: {
          ...item,
          ...orderFields,
          type: item.type === 'comment' ? 'chat' : item.type,
        },
      });
    }
  };

  // Receive TikTok Live events (single or sequential FIFO batch) forwarded from user's local server.js
  app.post('/api/tiktok-webhook', (req: Request, res: Response) => {
    const body = req.body || {};
    if (body.type === 'batch' && Array.isArray(body.events)) {
      for (const ev of body.events) {
        forwardWebhookSingleItem(ev);
      }
      res.json({ ok: true, count: body.events.length });
      return;
    }
    forwardWebhookSingleItem(body);
    res.json({ ok: true });
  });

  // Built-in Backend TikTok Live Connector (with 4 Quota-Protection Locks & EulerStream Key support)
  let activeTikTokConn: any = null;
  let activeTikTokUsername = '';
  let activeTikTokStatus: 'idle' | 'connecting' | 'connected' | 'error' = 'idle';
  let activeTikTokRoomId = '';
  let tiktokReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let tiktokReconnectAttempt = 0;
  let isConnectingTikTok = false;
  let lastManualConnectAt = 0;
  let manualDisconnected = false;

  const extractTikTokUsername = (data: any): string => {
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
  };

  const extractTikTokAvatar = (data: any): string | null => {
    const u = data?.user || data?.userDetails || data || {};
    const candidates = [
      u.profilePictureUrl,
      u.avatarUrl,
      u.avatarLarge?.url?.[0],
      u.avatarLarge?. urls?.[0],
      u.avatarLarge?.urlList?.[0],
      u.avatarThumb?.url?.[0],
      u.avatarThumb?.urls?.[0],
      u.avatarThumb?.urlList?.[0],
      u.profilePicture?.url?.[0],
      u.profilePicture?.urls?.[0],
      u.profilePicture?.urlList?.[0],
      data?.profilePictureUrl,
      data?.avatarUrl,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.startsWith('http')) return c;
    }
    return null;
  };

  const extractTikTokComment = (data: any): string => {
    return String(
      data?.comment ||
        data?.content ||
        data?.text ||
        data?.message ||
        data?.common?.displayText?.defaultPattern ||
        ''
    ).trim();
  };

  app.get('/api/tiktok/status', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      status: activeTikTokStatus,
      username: activeTikTokUsername,
      roomId: activeTikTokRoomId,
      eulerKeyConfigured: Boolean(resolveServerEulerApiKey()),
    });
  });

  app.post('/api/tiktok/disconnect', async (_req: Request, res: Response) => {
    manualDisconnected = true;
    tiktokReconnectAttempt = 0;
    if (tiktokReconnectTimer) {
      clearTimeout(tiktokReconnectTimer);
      tiktokReconnectTimer = null;
    }
    if (activeTikTokConn) {
      try {
        activeTikTokConn.removeAllListeners?.();
        await activeTikTokConn.disconnect?.();
      } catch {
        // Ignore
      }
      activeTikTokConn = null;
    }
    activeTikTokStatus = 'idle';
    activeTikTokRoomId = '';
    broadcastSSE({
      type: 'TIKTOK_LIVE_STATUS',
      status: 'simulated',
      username: activeTikTokUsername,
      message: '⏹️ Đã ngắt kết nối phiên Live (Đã dừng hoàn toàn tự động kết nối lại)',
      eulerKeyConfigured: Boolean(resolveServerEulerApiKey()),
    });
    res.json({ ok: true });
  });

  const startManagedTikTokConnection = async (
    rawUser: string,
    isAutoRetry: boolean
  ): Promise<{ ok: boolean; roomId?: string; error?: string }> => {
    if (isConnectingTikTok) {
      return {
        ok: false,
        error: '⏳ Hệ thống đang trong quá trình kết nối, vui lòng chờ giây lát...',
      };
    }

    if (!isAutoRetry) {
      const now = Date.now();
      if (now - lastManualConnectAt < 2200) {
        return {
          ok: false,
          error: '⏳ Vui lòng chờ 2 giây giữa các lần bấm Kết nối để tránh tốn lượt EulerStream!',
        };
      }
      lastManualConnectAt = now;
      manualDisconnected = false;
      tiktokReconnectAttempt = 0;
    }

    if (tiktokReconnectTimer) {
      clearTimeout(tiktokReconnectTimer);
      tiktokReconnectTimer = null;
    }

    if (activeTikTokConn) {
      try {
        activeTikTokConn.removeAllListeners?.();
        await activeTikTokConn.disconnect?.();
      } catch {
        // Ignore
      }
      activeTikTokConn = null;
    }

    isConnectingTikTok = true;
    activeTikTokUsername = rawUser;
    activeTikTokStatus = 'connecting';
    const eulerKey = resolveServerEulerApiKey();
    const hasEulerKey = Boolean(eulerKey);

    broadcastSSE({
      type: 'TIKTOK_LIVE_STATUS',
      status: 'connecting',
      username: rawUser,
      eulerKeyConfigured: hasEulerKey,
      message: isAutoRetry
        ? `🔄 Đang tự kết nối lại @${rawUser} (Lần ${tiktokReconnectAttempt}/4)...`
        : `⏳ Đang kết nối tới phòng Live @${rawUser}${hasEulerKey ? ' [Euler Key]' : ''}...`,
    });

    try {
      const tiktokPkg: any = await import('tiktok-live-connector');
      if (tiktokPkg.RoomIdRouteConfig) {
        tiktokPkg.RoomIdRouteConfig.skipFetchRoomInfoFromHtmlRoute = true;
      } else if (tiktokPkg.default?.RoomIdRouteConfig) {
        tiktokPkg.default.RoomIdRouteConfig.skipFetchRoomInfoFromHtmlRoute = true;
      }

      applyEulerSignConfig(tiktokPkg, eulerKey);

      const ConnectorClass =
        tiktokPkg.TikTokLiveConnection ||
        tiktokPkg.default?.TikTokLiveConnection ||
        tiktokPkg.WebcastPushConnection ||
        tiktokPkg.default?.WebcastPushConnection;

      const conn = new ConnectorClass(rawUser, {
        processInitialData: false,
        enableExtendedGiftInfo: false,
        fetchRoomInfoOnConnect: false,
        ...(eulerKey ? { signApiKey: eulerKey } : {}),
      });
      if (typeof conn.fetchAvailableGifts === 'function') {
        conn.fetchAvailableGifts = async () => [];
      }
      activeTikTokConn = conn;

      let streamEndedByHost = false;
      let fatalStreamError: unknown = undefined;

      const GIFT_ID_FALLBACK: Record<number, { name: string; coins: number }> = {
        5655: { name: 'Rose', coins: 1 },
        5827: { name: 'Ice Cream Cone', coins: 1 },
        5269: { name: 'TikTok', coins: 1 },
        7934: { name: 'GG', coins: 1 },
        5487: { name: 'Finger Heart', coins: 5 },
        5658: { name: 'Perfume', coins: 20 },
        5660: { name: 'Doughnut', coins: 30 },
      };

      const onChat = (data: any) => {
        const username = extractTikTokUsername(data);
        const comment = extractTikTokComment(data);
        if (!comment) return;
        const avatarUrl = extractTikTokAvatar(data);
        const orderFields = extractServerTikTokOrderFields(data);
        console.log(
          `💬 [TIKTOK CHAT #${orderFields.serverSeq}${orderFields.tiktokMsgId ? ` msg:${orderFields.tiktokMsgId}` : ''}] ${username}: ${comment}`
        );
        broadcastSSE({
          type: 'TIKTOK_LIVE_EVENT',
          event: { type: 'chat', username, avatarUrl, comment, ...orderFields },
        });
      };

      const giftStreakMap = new Map<string, { count: number; at: number }>();

      const onGift = (data: any) => {
        const username = extractTikTokUsername(data);
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
          Number(
            data?.repeatCount ?? data?.comboCount ?? data?.gift?.repeat_count ?? 1
          ) || 1
        );
        const groupId = String(
          data?.groupId || data?.giftId || data?.gift?.id || 'default'
        );
        const nowGiftMs = Date.now();
        for (const [gk, gv] of giftStreakMap.entries()) {
          if (nowGiftMs - gv.at > 45000) giftStreakMap.delete(gk);
        }

        let effectiveUnits = rawRepeatCount;
        if (isComboGift) {
          const streakKey = `${username.toLowerCase()}:${groupId}`;
          const prevStreak = giftStreakMap.get(streakKey);
          const prevCount = prevStreak ? prevStreak.count : 0;
          if (rawRepeatCount <= prevCount) {
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
          'Quà tặng';
        const coins = Math.max(1, diamondCount * effectiveUnits);
        const avatarUrl = extractTikTokAvatar(data);
        const orderFields = extractServerTikTokOrderFields(data);
        console.log(
          `🎁 [TIKTOK GIFT] ${username} tặng ${giftName} +${effectiveUnits} (combo x${rawRepeatCount} • +${coins} xu)`
        );
        broadcastSSE({
          type: 'TIKTOK_LIVE_EVENT',
          event: {
            type: 'gift',
            username,
            avatarUrl,
            giftName,
            coins,
            repeatCount: effectiveUnits,
            comboCount: rawRepeatCount,
            groupId,
            ...orderFields,
          },
        });
      };

      const onLike = (data: any) => {
        const username = extractTikTokUsername(data);
        const likeCount = Math.max(
          1,
          Number(data?.likeCount ?? data?.count ?? data?.unmergedLikeCount ?? 1) || 1
        );
        const avatarUrl = extractTikTokAvatar(data);
        const orderFields = extractServerTikTokOrderFields(data);
        console.log(`❤️ [TIKTOK LIKE] ${username} thả ${likeCount} tim`);
        broadcastSSE({
          type: 'TIKTOK_LIVE_EVENT',
          event: { type: 'like', username, avatarUrl, likeCount, ...orderFields },
        });
      };

      const onFollow = (data: any) => {
        const username = extractTikTokUsername(data);
        const avatarUrl = extractTikTokAvatar(data);
        const orderFields = extractServerTikTokOrderFields(data);
        console.log(`➕ [TIKTOK FOLLOW] ${username} đã follow`);
        broadcastSSE({
          type: 'TIKTOK_LIVE_EVENT',
          event: { type: 'follow', username, avatarUrl, ...orderFields },
        });
      };

      conn.on('chat', onChat);
      conn.on('gift', onGift);
      conn.on('like', onLike);
      conn.on('follow', onFollow);
      conn.on('social', (data: any) => {
        const key = String(
          data?.displayType || data?.common?.displayText?.key || ''
        ).toLowerCase();
        if (key.includes('follow')) onFollow(data);
      });
      conn.on('error', (err: any) => {
        const check = classifyTikTokError(err);
        if (!check.shouldAutoReconnect) {
          fatalStreamError = err;
        }
        console.warn('⚠️ [TIKTOK ERROR]:', err?.message || err?.info || err);
      });

      // Chốt 1: Khi chủ kênh tắt phiên Live (streamEnd) -> Dừng hẳn, không tự gọi lại!
      conn.on('streamEnd', () => {
        if (activeTikTokConn !== conn) return;
        streamEndedByHost = true;
        if (tiktokReconnectTimer) {
          clearTimeout(tiktokReconnectTimer);
          tiktokReconnectTimer = null;
        }
        activeTikTokConn = null;
        activeTikTokStatus = 'idle';
        activeTikTokRoomId = '';
        const msg = `⏹️ Phiên Live @${rawUser} đã kết thúc (streamEnd) — Tự động dừng kết nối lại để bảo vệ lượt miễn phí.`;
        console.log(msg);
        broadcastSSE({
          type: 'TIKTOK_LIVE_STATUS',
          status: 'simulated',
          username: rawUser,
          eulerKeyConfigured: Boolean(resolveServerEulerApiKey()),
          message: msg,
        });
      });

      // Chốt 3: Đang Live thật sự mà rớt mạng giữa chừng -> Giãn nhịp 8s -> 20s -> 45s -> 90s (tối đa 4 lần)
      conn.on('disconnected', () => {
        if (activeTikTokConn !== conn) return;
        const plan = computeTikTokReconnectPlan({
          currentAttempt: tiktokReconnectAttempt,
          manualDisconnect: manualDisconnected,
          streamEndedByHost,
          error: fatalStreamError,
        });
        console.warn(`🔄 [TIKTOK DISCONNECTED] ${plan.reasonVi}`);
        if (!plan.shouldReconnect) {
          activeTikTokStatus = 'idle';
          activeTikTokRoomId = '';
          broadcastSSE({
            type: 'TIKTOK_LIVE_STATUS',
            status: 'simulated',
            username: rawUser,
            eulerKeyConfigured: Boolean(resolveServerEulerApiKey()),
            message: plan.reasonVi,
          });
          return;
        }
        tiktokReconnectAttempt = plan.nextAttempt;
        broadcastSSE({
          type: 'TIKTOK_LIVE_STATUS',
          status: 'connecting',
          username: rawUser,
          eulerKeyConfigured: Boolean(resolveServerEulerApiKey()),
          message: plan.reasonVi,
        });
        tiktokReconnectTimer = setTimeout(() => {
          void startManagedTikTokConnection(rawUser, true);
        }, plan.delayMs);
      });

      const state = await conn.connect();
      isConnectingTikTok = false;
      tiktokReconnectAttempt = 0; // Reset bộ đếm ngay khi vào phòng thành công!
      activeTikTokStatus = 'connected';
      activeTikTokRoomId = String(state?.roomId || '');
      console.log(
        `✅ [TIKTOK LIVE] Đã kết nối phòng @${rawUser} (Room ID: ${activeTikTokRoomId})${hasEulerKey ? ' [Euler API Key Active]' : ''}`
      );
      broadcastSSE({
        type: 'TIKTOK_LIVE_STATUS',
        status: 'connected',
        username: rawUser,
        roomId: activeTikTokRoomId,
        eulerKeyConfigured: hasEulerKey,
        message: `Đã kết nối phòng Live @${rawUser} (Room: ${activeTikTokRoomId})${hasEulerKey ? ' • 🔑 Euler Key' : ''}`,
      });
      return { ok: true, roomId: activeTikTokRoomId };
    } catch (err: any) {
      isConnectingTikTok = false;
      activeTikTokConn = null;
      activeTikTokStatus = 'error';
      const classified = classifyTikTokError(err);
      const displayMsg =
        classified.category === 'transient_error'
          ? err?.message || 'Không thể kết nối phòng Live'
          : classified.userMessageVi;
      console.error('❌ [TIKTOK CONNECT ERROR]:', displayMsg);

      // Chỉ tiếp tục giãn nhịp nếu đây là nhịp tự nối lại khi rớt mạng giữa chừng VÀ không vi phạm Chốt 1 / Chốt 2
      if (isAutoRetry && classified.shouldAutoReconnect) {
        const plan = computeTikTokReconnectPlan({
          currentAttempt: tiktokReconnectAttempt,
          manualDisconnect: manualDisconnected,
          error: err,
        });
        if (plan.shouldReconnect) {
          tiktokReconnectAttempt = plan.nextAttempt;
          broadcastSSE({
            type: 'TIKTOK_LIVE_STATUS',
            status: 'connecting',
            username: rawUser,
            eulerKeyConfigured: hasEulerKey,
            message: `${displayMsg} • ${plan.reasonVi}`,
          });
          tiktokReconnectTimer = setTimeout(() => {
            void startManagedTikTokConnection(rawUser, true);
          }, plan.delayMs);
          return { ok: false, error: displayMsg };
        }
        broadcastSSE({
          type: 'TIKTOK_LIVE_STATUS',
          status: 'error',
          username: rawUser,
          eulerKeyConfigured: hasEulerKey,
          message: plan.reasonVi,
        });
        return { ok: false, error: plan.reasonVi };
      }

      broadcastSSE({
        type: 'TIKTOK_LIVE_STATUS',
        status: 'error',
        username: rawUser,
        eulerKeyConfigured: hasEulerKey,
        message: displayMsg,
      });
      return { ok: false, error: displayMsg };
    }
  };

  app.post('/api/tiktok/connect', async (req: Request, res: Response) => {
    const rawUser = String(req.body?.username || '')
      .trim()
      .replace(/^@+/, '');
    if (!rawUser) {
      res.status(400).json({ ok: false, error: 'Vui lòng nhập ID TikTok' });
      return;
    }
    const result = await startManagedTikTokConnection(rawUser, false);
    if (result.ok) {
      res.json({ ok: true, roomId: result.roomId, username: rawUser });
    } else {
      res.status(500).json({ ok: false, error: result.error });
    }
  });

  // In-memory LRU cache for Google Warm TTS MP3 buffers (0ms repeat playback)
  const ttsBufferCache = new Map<string, Buffer>();
  const inFlightGoogleTts = new Map<string, Promise<Buffer>>();
  const MAX_TTS_CACHE_ITEMS = 240;

  function splitServerViTtsChunks(rawText: string, maxChars = 150): string[] {
    const clean = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    if (clean.length <= maxChars) return [clean];
    const parts: string[] = [];
    const words = clean.split(' ');
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length <= maxChars) {
        cur = next;
      } else {
        if (cur) parts.push(cur);
        cur = w.slice(0, maxChars);
      }
    }
    if (cur) parts.push(cur);
    return parts;
  }

  async function fetchSoundOfTextRelayMp3(segment: string): Promise<Buffer> {
    const createCtrl = new AbortController();
    const createTimer = setTimeout(() => createCtrl.abort(), 2200);
    try {
      const createRes = await fetch('https://api.soundoftext.com/sounds', {
        method: 'POST',
        signal: createCtrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'Google',
          data: { text: segment, voice: 'vi-VN' },
        }),
      });
      clearTimeout(createTimer);
      if (!createRes.ok) {
        throw new Error(`Relay create HTTP ${createRes.status}`);
      }
      const createJson = (await createRes.json()) as {
        success?: boolean;
        id?: string;
      };
      if (!createJson?.id) {
        throw new Error('Relay missing sound id');
      }

      let mp3Location = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const pollCtrl = new AbortController();
        const pollTimer = setTimeout(() => pollCtrl.abort(), 1500);
        try {
          const pollRes = await fetch(
            `https://api.soundoftext.com/sounds/${createJson.id}`,
            { signal: pollCtrl.signal }
          );
          clearTimeout(pollTimer);
          if (pollRes.ok) {
            const pollJson = (await pollRes.json()) as {
              status?: string;
              location?: string;
            };
            if (pollJson.status === 'Done' && pollJson.location) {
              mp3Location = pollJson.location;
              break;
            }
          }
        } catch {
          clearTimeout(pollTimer);
        }
        await new Promise((r) => setTimeout(r, 180));
      }

      if (!mp3Location) {
        throw new Error('Relay audio not ready');
      }

      const dlCtrl = new AbortController();
      const dlTimer = setTimeout(() => dlCtrl.abort(), 2200);
      try {
        const dlRes = await fetch(mp3Location, { signal: dlCtrl.signal });
        clearTimeout(dlTimer);
        if (!dlRes.ok) {
          throw new Error(`Relay download HTTP ${dlRes.status}`);
        }
        const buf = Buffer.from(await dlRes.arrayBuffer());
        if (buf.length < 128) {
          throw new Error('Empty relay MP3 buffer');
        }
        return buf;
      } catch (err) {
        clearTimeout(dlTimer);
        throw err;
      }
    } catch (err) {
      clearTimeout(createTimer);
      throw err;
    }
  }

  async function fetchSingleGoogleWarmViSegment(segment: string): Promise<{
    buf: Buffer;
    source: string;
    switched: boolean;
  }> {
    const encoded = encodeURIComponent(segment);
    const mirrors: Array<{ id: string; url: string; switched: boolean }> = [
      {
        id: 'google-gtx',
        url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&ttsspeed=1&q=${encoded}`,
        switched: false,
      },
      {
        id: 'google-clients5',
        url: `https://clients5.google.com/translate_tts?ie=UTF-8&tl=vi&client=dict-chrome-ex&q=${encoded}`,
        switched: true,
      },
      {
        id: 'google-tw-ob',
        url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`,
        switched: true,
      },
      {
        id: 'google-vn',
        url: `https://translate.google.com.vn/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`,
        switched: true,
      },
    ];
    let lastErr: unknown = new Error('Google TTS unavailable');
    for (const mirror of mirrors) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      try {
        const response = await fetch(mirror.url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://translate.google.com/',
          },
        });
        clearTimeout(timeout);
        if (!response.ok) {
          lastErr = new Error(`HTTP ${response.status}`);
          continue;
        }
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) {
          lastErr = new Error(`Unexpected content-type ${ct}`);
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        if (buf.length < 128) {
          lastErr = new Error('Empty Google TTS buffer');
          continue;
        }
        return { buf, source: mirror.id, switched: mirror.switched };
      } catch (err) {
        clearTimeout(timeout);
        lastErr = err;
      }
    }

    // Fallback tầng cuối trên Server: gọi qua Relay độc lập (vẫn lấy đúng giọng Google vi-VN khi IP hiện tại bị giới hạn 429)
    try {
      const relayBuf = await fetchSoundOfTextRelayMp3(segment);
      return { buf: relayBuf, source: 'google-relay', switched: true };
    } catch {
      throw lastErr;
    }
  }

  const ttsSourceMetaCache = new Map<
    string,
    { source: string; switched: boolean }
  >();

  async function fetchGoogleWarmViBuffer(text: string): Promise<{
    buf: Buffer;
    source: string;
    switched: boolean;
  }> {
    const cacheKey = `vi:${text}`;
    const cached = ttsBufferCache.get(cacheKey);
    if (cached) {
      ttsBufferCache.delete(cacheKey);
      ttsBufferCache.set(cacheKey, cached);
      const prevMeta = ttsSourceMetaCache.get(cacheKey);
      return {
        buf: cached,
        source: 'ram-cache',
        switched: Boolean(prevMeta?.switched),
      };
    }

    const existing = inFlightGoogleTts.get(cacheKey);
    if (existing) {
      const buf = await existing;
      const meta = ttsSourceMetaCache.get(cacheKey);
      return {
        buf,
        source: meta?.source || 'google-gtx',
        switched: Boolean(meta?.switched),
      };
    }

    const task = (async () => {
      const segments = splitServerViTtsChunks(text, 150);
      if (segments.length === 0) {
        throw new Error('Empty TTS text');
      }
      const buffers: Buffer[] = [];
      let chosenSource = 'google-gtx';
      let anySwitched = false;
      for (const seg of segments) {
        const resSeg = await fetchSingleGoogleWarmViSegment(seg);
        buffers.push(resSeg.buf);
        if (resSeg.switched) {
          anySwitched = true;
          chosenSource = resSeg.source;
        }
      }
      const combined = buffers.length === 1 ? buffers[0] : Buffer.concat(buffers);
      if (ttsBufferCache.size >= MAX_TTS_CACHE_ITEMS) {
        const oldestKey = ttsBufferCache.keys().next().value;
        if (oldestKey) {
          ttsBufferCache.delete(oldestKey);
          ttsSourceMetaCache.delete(oldestKey);
        }
      }
      ttsBufferCache.set(cacheKey, combined);
      ttsSourceMetaCache.set(cacheKey, {
        source: chosenSource,
        switched: anySwitched,
      });
      return combined;
    })();

    inFlightGoogleTts.set(cacheKey, task);
    try {
      const buf = await task;
      const meta = ttsSourceMetaCache.get(cacheKey);
      return {
        buf,
        source: meta?.source || 'google-gtx',
        switched: Boolean(meta?.switched),
      };
    } finally {
      inFlightGoogleTts.delete(cacheKey);
    }
  }

  const handleTtsHttpRequest = async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    try {
      const text = String(req.query.text || '').trim().slice(0, 360);
      if (!text) {
        res.status(400).end();
        return;
      }
      const result = await fetchGoogleWarmViBuffer(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-TTS-Source', result.source);
      res.setHeader('X-TTS-Switched', result.switched ? '1' : '0');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-TTS-Source, X-TTS-Switched'
      );
      res.send(result.buf);
    } catch {
      res.status(502).end();
    }
  };

  // Built-in Google Warm TTS proxy routes (/api/tts & /tts) with multi-mirror + relay fallback
  app.get('/api/tts', handleTtsHttpRequest);
  app.get('/tts', handleTtsHttpRequest);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('⚠️ [SERVER LISTEN ERROR]:', err);
  });
}

startServer().catch((err) => {
  console.error('❌ [FATAL STARTUP ERROR]:', err);
});
