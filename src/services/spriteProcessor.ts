import { useEffect, useState } from 'react';

const CACHE_VERSION = 'v8_auto_downscale_vram_cache';
const processedCache = new Map<string, string[]>();
const pendingPromises = new Map<string, Promise<string[]>>();

/**
 * Bộ 44 file PNG nền trong suốt đã được tách nền, khử bóng sàn & cắt chuẩn từng frame (180x260) sẵn trên đĩa.
 * Khi dùng các nhân vật mặc định, trình duyệt lấy trực tiếp URL tĩnh trong 0ms (không tốn CPU Canvas, không tạo chuỗi base64 dài),
 * giúp hàng trăm nhân vật hiển thị cùng lúc trên phiên Live vẫn mượt 60 FPS.
 */
const BAKED_STATIC_FRAMES: Record<string, string[]> = {
  // Khách Nữ (10 frames: 0..9)
  './assets/aistudio/baked/pilgrim_female_strip.png': Array.from(
    { length: 10 },
    (_, i) =>
      i === 5 || i === 6
        ? './assets/aistudio/girl_student_seated_wooden_chair.png?v=2'
        : `./assets/aistudio/baked/pilgrim_female_f${i}.png?v=2`
  ),
  '/assets/aistudio/baked/pilgrim_female_strip.png': Array.from(
    { length: 10 },
    (_, i) =>
      i === 5 || i === 6
        ? './assets/aistudio/girl_student_seated_wooden_chair.png?v=2'
        : `./assets/aistudio/baked/pilgrim_female_f${i}.png?v=2`
  ),
  './assets/aistudio/Sprite_sheet_nh_n_v_t_n__-_ng__i_v_o_ch_a_6dcec4d1.png':
    Array.from(
      { length: 10 },
      (_, i) =>
        i === 5 || i === 6
          ? './assets/aistudio/girl_student_seated_wooden_chair.png?v=2'
          : `./assets/aistudio/baked/pilgrim_female_f${i}.png?v=2`
    ),
  '/assets/aistudio/Sprite_sheet_nh_n_v_t_n__-_ng__i_v_o_ch_a_6dcec4d1.png':
    Array.from(
      { length: 10 },
      (_, i) =>
        i === 5 || i === 6
          ? './assets/aistudio/girl_student_seated_wooden_chair.png?v=2'
          : `./assets/aistudio/baked/pilgrim_female_f${i}.png?v=2`
    ),

  // Khách Nam (10 frames: 0..9)
  './assets/aistudio/baked/pilgrim_male_strip.png': Array.from(
    { length: 10 },
    (_, i) => `./assets/aistudio/baked/pilgrim_male_f${i}.png?v=6`
  ),
  '/assets/aistudio/baked/pilgrim_male_strip.png': Array.from(
    { length: 10 },
    (_, i) => `./assets/aistudio/baked/pilgrim_male_f${i}.png?v=6`
  ),
  './assets/aistudio/Sprite_sheet_nh_n_v_t_nam_-_ng__i_v_o_ch_a_554050d6.png':
    Array.from(
      { length: 10 },
      (_, i) => `./assets/aistudio/baked/pilgrim_male_f${i}.png?v=6`
    ),
  '/assets/aistudio/Sprite_sheet_nh_n_v_t_nam_-_ng__i_v_o_ch_a_554050d6.png':
    Array.from(
      { length: 10 },
      (_, i) => `./assets/aistudio/baked/pilgrim_male_f${i}.png?v=6`
    ),

  // Sư Trụ Trì (8 frames: 0..7)
  './assets/aistudio/baked/abbot_strip.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/abbot_f${i}.png?v=5`
  ),
  '/assets/aistudio/baked/abbot_strip.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/abbot_f${i}.png?v=5`
  ),
  './assets/aistudio/Sprite_sheet_nh_n_v_t_tr__tr__0c0e28e0.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/abbot_f${i}.png?v=5`
  ),
  '/assets/aistudio/Sprite_sheet_nh_n_v_t_tr__tr__0c0e28e0.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/abbot_f${i}.png?v=5`
  ),

  // Chú Tiểu Lớn (8 frames: 0..7)
  './assets/aistudio/baked/senior_novice_strip.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/senior_novice_f${i}.png?v=5`
  ),
  '/assets/aistudio/baked/senior_novice_strip.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/senior_novice_f${i}.png?v=5`
  ),
  './assets/aistudio/Sprite_sheet_nh_n_v_t_ch__ti_u_l_n_9bcfb2ed.png':
    Array.from(
      { length: 8 },
      (_, i) => `./assets/aistudio/baked/senior_novice_f${i}.png?v=5`
    ),
  '/assets/aistudio/Sprite_sheet_nh_n_v_t_ch__ti_u_l_n_9bcfb2ed.png':
    Array.from(
      { length: 8 },
      (_, i) => `./assets/aistudio/baked/senior_novice_f${i}.png?v=5`
    ),

  // Chú Tiểu Nhỏ (8 frames: 0..7)
  './assets/aistudio/baked/junior_novice_strip.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/junior_novice_f${i}.png?v=5`
  ),
  '/assets/aistudio/baked/junior_novice_strip.png': Array.from(
    { length: 8 },
    (_, i) => `./assets/aistudio/baked/junior_novice_f${i}.png?v=5`
  ),
  './assets/aistudio/Sprite_sheet_nh_n_v_t_ch__ti_u_nh__1cd03d61.png':
    Array.from(
      { length: 8 },
      (_, i) => `./assets/aistudio/baked/junior_novice_f${i}.png?v=5`
    ),
  '/assets/aistudio/Sprite_sheet_nh_n_v_t_ch__ti_u_nh__1cd03d61.png':
    Array.from(
      { length: 8 },
      (_, i) => `./assets/aistudio/baked/junior_novice_f${i}.png?v=5`
    ),
};

// Preload toàn bộ 44 frame PNG tĩnh vào bộ nhớ GPU ngay khi khởi tạo để chuyển tư thế không bao giờ bị nháy
if (typeof window !== 'undefined') {
  const preloadedSet = new Set<string>();
  Object.values(BAKED_STATIC_FRAMES).forEach((frameList) => {
    frameList.forEach((frameUrl) => {
      if (!preloadedSet.has(frameUrl)) {
        preloadedSet.add(frameUrl);
        const img = new Image();
        img.decoding = 'async';
        img.src = frameUrl;
      }
    });
  });
}

function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(canvas.toDataURL('image/png'));
      }
    }, 'image/png');
  });
}

/**
 * Xử lý ảnh Spritesheet 1 hàng ngang:
 * - Nếu là 1 trong 5 bộ ảnh mặc định: trả về ngay lập tức mảng URL file PNG trong suốt tĩnh đã bake sẵn (0ms CPU).
 * - Nếu người dùng tự upload file mới: tự động cắt nhãn Index, tách nền trắng + bóng sàn và xuất ra Blob URL siêu nhẹ.
 */
export function processHorizontalSpritesheet(
  url: string,
  expectedFrames: number
): Promise<string[]> {
  if (BAKED_STATIC_FRAMES[url] && BAKED_STATIC_FRAMES[url].length === expectedFrames) {
    return Promise.resolve(BAKED_STATIC_FRAMES[url]);
  }
  const normalizedUrl = url.startsWith('/assets/') ? `.${url}` : url;
  if (
    BAKED_STATIC_FRAMES[normalizedUrl] &&
    BAKED_STATIC_FRAMES[normalizedUrl].length === expectedFrames
  ) {
    return Promise.resolve(BAKED_STATIC_FRAMES[normalizedUrl]);
  }

  const cacheKey = `${CACHE_VERSION}::${url}::${expectedFrames}`;
  if (processedCache.has(cacheKey)) {
    return Promise.resolve(processedCache.get(cacheKey)!);
  }
  if (pendingPromises.has(cacheKey)) {
    return pendingPromises.get(cacheKey)!;
  }

  const promise = new Promise<string[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const W = img.naturalWidth || img.width;
        const H = img.naturalHeight || img.height;

        const hasBottomLabels = W / H > 2.5 && W / H < 3.5;
        const cropH = hasBottomLabels ? Math.round(H * 0.702) : H;

        const workCanvas = document.createElement('canvas');
        workCanvas.width = W;
        workCanvas.height = cropH;
        const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve([]);
          return;
        }

        ctx.drawImage(img, 0, 0, W, cropH, 0, 0, W, cropH);
        const imgData = ctx.getImageData(0, 0, W, cropH);
        const data = imgData.data;

        const cornerWhite =
          data[0] > 235 && data[1] > 235 && data[2] > 235 && data[3] > 200;

        if (cornerWhite) {
          let sumB = 0;
          let sampleCnt = 0;
          const yTorsoStart = Math.round(cropH * 0.4);
          const yTorsoEnd = Math.round(cropH * 0.63);
          for (let y = yTorsoStart; y < yTorsoEnd; y += 3) {
            for (let x = 0; x < W; x += 6) {
              const i = (y * W + x) * 4;
              if (data[i] < 220 || data[i + 1] < 220 || data[i + 2] < 220) {
                sumB += data[i + 2];
                sampleCnt++;
              }
            }
          }
          const avgTorsoB = sampleCnt > 0 ? sumB / sampleCnt : 100;
          const hasDarkRobeAndShoes = avgTorsoB < 95;
          const footZoneY = Math.round(cropH * 0.74);

          const visited = new Uint8Array(W * cropH);
          const queue = new Int32Array(W * cropH);
          let head = 0;
          let tail = 0;

          const isBgPixel = (idx4: number, y: number) => {
            const r = data[idx4];
            const g = data[idx4 + 1];
            const b = data[idx4 + 2];
            if (r > 230 && g > 230 && b > 226) return true;
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const sat = maxC - minC;
            if (r > 212 && g > 210 && b > 206 && sat <= 12) return true;
            if (y >= footZoneY) {
              if (hasDarkRobeAndShoes) {
                if (r >= 125 && g >= 120 && b >= 115 && sat <= 22) return true;
                if (r >= 190 && g >= 178 && b >= 162 && r - b <= 30) return true;
              } else {
                if (
                  y >= Math.round(cropH * 0.93) &&
                  r >= 175 &&
                  g >= 172 &&
                  b >= 168 &&
                  sat <= 14
                ) {
                  return true;
                }
              }
            }
            return false;
          };

          const pushIfBg = (x: number, y: number) => {
            const pos = y * W + x;
            if (visited[pos]) return;
            if (isBgPixel(pos * 4, y)) {
              visited[pos] = 1;
              queue[tail++] = pos;
            }
          };

          for (let x = 0; x < W; x++) {
            pushIfBg(x, 0);
            pushIfBg(x, cropH - 1);
          }
          for (let y = 0; y < cropH; y++) {
            pushIfBg(0, y);
            pushIfBg(W - 1, y);
          }

          const seedSeen = new Uint8Array(W * cropH);
          for (let y = 2; y < cropH - 2; y++) {
            for (let x = 2; x < W - 2; x++) {
              const pos = y * W + x;
              if (visited[pos] || seedSeen[pos]) continue;
              const p4 = pos * 4;
              const r0 = data[p4];
              const g0 = data[p4 + 1];
              const b0 = data[p4 + 2];

              const isSeed =
                (r0 >= 245 && g0 >= 245 && b0 >= 243) ||
                (hasDarkRobeAndShoes &&
                  y >= footZoneY &&
                  r0 >= 208 &&
                  g0 >= 204 &&
                  b0 >= 198 &&
                  r0 - b0 <= 20);

              if (isSeed) {
                const comp: number[] = [pos];
                let ci = 0;
                seedSeen[pos] = 1;
                while (ci < comp.length) {
                  const cp = comp[ci++];
                  const neighbors = [cp - 1, cp + 1, cp - W, cp + W];
                  for (const np of neighbors) {
                    if (np >= 0 && np < W * cropH && !seedSeen[np]) {
                      const np4 = np * 4;
                      const nr = data[np4];
                      const ng = data[np4 + 1];
                      const nb = data[np4 + 2];
                      const ny = Math.floor(np / W);
                      const nSeed =
                        (nr >= 242 && ng >= 242 && nb >= 240) ||
                        (hasDarkRobeAndShoes &&
                          ny >= footZoneY &&
                          nr >= 202 &&
                          ng >= 198 &&
                          nb >= 192 &&
                          nr - nb <= 20);
                      if (nSeed) {
                        seedSeen[np] = 1;
                        comp.push(np);
                      }
                    }
                  }
                }
                if (comp.length >= 8) {
                  for (const p of comp) {
                    if (!visited[p]) {
                      visited[p] = 1;
                      queue[tail++] = p;
                    }
                  }
                }
              }
            }
          }

          while (head < tail) {
            const pos = queue[head++];
            data[pos * 4 + 3] = 0;
            const x = pos % W;
            const y = (pos - x) / W;
            if (x > 0) pushIfBg(x - 1, y);
            if (x < W - 1) pushIfBg(x + 1, y);
            if (y > 0) pushIfBg(x, y - 1);
            if (y < cropH - 1) pushIfBg(x, y + 1);
          }

          if (hasDarkRobeAndShoes) {
            for (let iter = 0; iter < 3; iter++) {
              const toClear: number[] = [];
              for (let y = footZoneY; y < cropH - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                  const pos = y * W + x;
                  if (visited[pos]) continue;
                  const p4 = pos * 4;
                  const r = data[p4];
                  const g = data[p4 + 1];
                  const b = data[p4 + 2];
                  const touchesBg =
                    visited[pos - 1] ||
                    visited[pos + 1] ||
                    visited[pos - W] ||
                    visited[pos + W];
                  if (
                    touchesBg &&
                    r >= 162 &&
                    g >= 152 &&
                    b >= 142 &&
                    r - b <= 32
                  ) {
                    toClear.push(pos);
                  }
                }
              }
              for (const pos of toClear) {
                visited[pos] = 1;
                data[pos * 4 + 3] = 0;
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
        }

        const colHasPixel = new Uint8Array(W);
        for (let x = 0; x < W; x++) {
          let count = 0;
          for (let y = 4; y < cropH - 4; y++) {
            if (data[(y * W + x) * 4 + 3] > 40) {
              count++;
              if (count >= 3) {
                colHasPixel[x] = 1;
                break;
              }
            }
          }
        }

        const segments: { startX: number; endX: number }[] = [];
        let inSeg = false;
        let segStart = 0;
        for (let x = 0; x < W; x++) {
          if (colHasPixel[x] && !inSeg) {
            inSeg = true;
            segStart = x;
          } else if (!colHasPixel[x] && inSeg) {
            inSeg = false;
            if (x - segStart >= 12) {
              segments.push({ startX: segStart, endX: x - 1 });
            }
          }
        }
        if (inSeg && W - segStart >= 12) {
          segments.push({ startX: segStart, endX: W - 1 });
        }

        const mergedSegments: { startX: number; endX: number }[] = [];
        for (const seg of segments) {
          if (
            mergedSegments.length > 0 &&
            seg.startX - mergedSegments[mergedSegments.length - 1].endX < 8
          ) {
            mergedSegments[mergedSegments.length - 1].endX = seg.endX;
          } else {
            mergedSegments.push({ ...seg });
          }
        }

        const finalSegments: { startX: number; endX: number }[] =
          mergedSegments.length === expectedFrames
            ? mergedSegments
            : Array.from({ length: expectedFrames }, (_, i) => ({
                startX: Math.round((i * W) / expectedFrames),
                endX: Math.round(((i + 1) * W) / expectedFrames) - 1,
              }));

        let globalMaxY = Math.round(cropH * 0.96);
        let globalMinY = Math.round(cropH * 0.04);
        for (let y = cropH - 1; y >= 0; y--) {
          let found = false;
          for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3] > 60) {
              globalMaxY = y;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        for (let y = 0; y < cropH; y++) {
          let found = false;
          for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3] > 60) {
              globalMinY = Math.max(0, y - 4);
              found = true;
              break;
            }
          }
          if (found) break;
        }

        const charSpanH = Math.max(100, globalMaxY - globalMinY + 6);
        const outW = 180;
        const outH = 260;
        const scale = (outH - 6) / charSpanH;

        const frameCanvases = finalSegments.map((seg) => {
          const segW = seg.endX - seg.startX + 1;
          let frameMaxY = globalMaxY;
          for (let y = cropH - 1; y >= globalMinY; y--) {
            let count = 0;
            for (let x = seg.startX; x <= seg.endX; x++) {
              if (data[(y * W + x) * 4 + 3] > 80) {
                count++;
                if (count >= 2) break;
              }
            }
            if (count >= 2) {
              frameMaxY = y;
              break;
            }
          }

          const sliceH = Math.max(40, frameMaxY - globalMinY + 1);
          const fCanvas = document.createElement('canvas');
          fCanvas.width = outW;
          fCanvas.height = outH;
          const fCtx = fCanvas.getContext('2d');
          if (fCtx) {
            const drawW = segW * scale;
            const drawH = sliceH * scale;
            const dx = (outW - drawW) / 2;
            const dy = outH - 2 - drawH;
            fCtx.drawImage(
              workCanvas,
              seg.startX,
              globalMinY,
              segW,
              sliceH,
              dx,
              dy,
              drawW,
              drawH
            );
          }
          return fCanvas;
        });

        // Đảm bảo nhân vật Nam (expectedFrames === 10, áo nâu sẫm) luôn đổi chân trái - phải rõ ràng ở 2 frame mặt lưng (index 2 & 3)
        // ngay cả khi đang nạp từ dữ liệu lưu trong IndexedDB / localStorage
        if (expectedFrames === 10 && frameCanvases[2] && frameCanvases[3]) {
          const f2Canvas = frameCanvases[2];
          const f3Canvas = document.createElement('canvas');
          f3Canvas.width = outW;
          f3Canvas.height = outH;
          const f3Ctx = f3Canvas.getContext('2d');
          if (f3Ctx) {
            const splitY = Math.round(outH * 0.34);
            // Giữ nguyên phần đầu & tóc tự nhiên phía trên
            f3Ctx.drawImage(
              f2Canvas,
              0,
              0,
              outW,
              splitY,
              0,
              0,
              outW,
              splitY
            );
            // Lật ngang phần thân áo dưới & hai bước chân (trái <-> phải) để thay phiên rõ rệt với index 2
            f3Ctx.save();
            f3Ctx.translate(outW, 0);
            f3Ctx.scale(-1, 1);
            f3Ctx.drawImage(
              f2Canvas,
              0,
              splitY,
              outW,
              outH - splitY,
              0,
              splitY,
              outW,
              outH - splitY
            );
            f3Ctx.restore();
            frameCanvases[3] = f3Ctx.canvas;
          }
        }

        const frameUrls = await Promise.all(frameCanvases.map(canvasToObjectUrl));

        processedCache.set(cacheKey, frameUrls);
        pendingPromises.delete(cacheKey);
        resolve(frameUrls);
      } catch {
        pendingPromises.delete(cacheKey);
        resolve([]);
      }
    };
    img.onerror = () => {
      pendingPromises.delete(cacheKey);
      resolve([]);
    };
    img.src = url;
  });

  pendingPromises.set(cacheKey, promise);
  return promise;
}

export function getStaticBakedFrames(
  url: string | null | undefined,
  expectedFrames: number
): string[] | null {
  if (!url) return null;
  if (BAKED_STATIC_FRAMES[url] && BAKED_STATIC_FRAMES[url].length === expectedFrames) {
    return BAKED_STATIC_FRAMES[url];
  }
  const normalized = url.startsWith('/assets/') ? `.${url}` : url;
  if (
    BAKED_STATIC_FRAMES[normalized] &&
    BAKED_STATIC_FRAMES[normalized].length === expectedFrames
  ) {
    return BAKED_STATIC_FRAMES[normalized];
  }
  return null;
}

export function useProcessedSpriteFrames(
  url: string | null,
  expectedFrames: number,
  fallbackUrl?: string | null
): string[] | null {
  const defaultStatic = getStaticBakedFrames(fallbackUrl, expectedFrames);

  const [frames, setFrames] = useState<string[] | null>(() => {
    const directBaked = getStaticBakedFrames(url, expectedFrames);
    if (directBaked) return directBaked;
    if (url) {
      const cached = processedCache.get(`${CACHE_VERSION}::${url}::${expectedFrames}`);
      if (cached && cached.length === expectedFrames) return cached;
    }
    return defaultStatic;
  });

  useEffect(() => {
    const directBaked = getStaticBakedFrames(url, expectedFrames);
    if (directBaked) {
      setFrames((prev) => (prev === directBaked ? prev : directBaked));
      return;
    }
    if (!url) {
      setFrames((prev) => (prev === defaultStatic ? prev : defaultStatic));
      return;
    }
    let cancelled = false;
    processHorizontalSpritesheet(url, expectedFrames).then((res) => {
      if (cancelled) return;
      if (res && res.length === expectedFrames) {
        setFrames((prev) => (prev === res ? prev : res));
      } else if (defaultStatic) {
        setFrames((prev) => (prev === defaultStatic ? prev : defaultStatic));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, expectedFrames, defaultStatic]);

  return frames || defaultStatic;
}

const singleCutoutCache = new Map<string, string>();
const singleCutoutPromises = new Map<string, Promise<string>>();

/**
 * Tách nền trắng tự động & cắt viền thừa cho ảnh đơn (như ảnh Bàn Học Gỗ):
 * - Xóa cả vùng nền trắng bên ngoài lẫn vùng nền trắng kẹt giữa 4 chân bàn
 * - Làm mềm viền (feather alpha) để bàn gỗ tiệp hoàn hảo vào nền gạch bông lớp học
 */
export function normalizeAssetUrl(url: string): string {
  return url.startsWith('/assets/') ? `.${url}` : url;
}

export function processSingleCutoutImage(rawUrl: string): Promise<string> {
  const url = normalizeAssetUrl(rawUrl);
  const cacheKey = `${CACHE_VERSION}::single_cutout::${url}`;
  if (singleCutoutCache.has(cacheKey)) {
    return Promise.resolve(singleCutoutCache.get(cacheKey)!);
  }
  if (singleCutoutPromises.has(cacheKey)) {
    return singleCutoutPromises.get(cacheKey)!;
  }

  const promise = new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const W = img.naturalWidth || img.width;
        const H = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(url);
          return;
        }

        ctx.drawImage(img, 0, 0, W, H);
        const imgData = ctx.getImageData(0, 0, W, H);
        const data = imgData.data;

        // Kiểm tra xem 4 góc có nền trắng đặc hay đã trong suốt sẵn
        const cornerWhite =
          data[0] > 235 && data[1] > 235 && data[2] > 235 && data[3] > 200;

        if (cornerWhite) {
          const totalPixels = W * H;
          const visited = new Uint8Array(totalPixels);
          const queue = new Int32Array(totalPixels);
          let head = 0;
          let tail = 0;

          const isBgPixel = (idx4: number) => {
            const r = data[idx4];
            const g = data[idx4 + 1];
            const b = data[idx4 + 2];
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const sat = maxC - minC;
            // Nền trắng hoặc xám trắng rất nhạt (tránh ăn vào áo sơ mi xanh hoặc gỗ ấm)
            return r >= 236 && g >= 236 && b >= 234 && sat <= 14;
          };

          const pushIfBg = (x: number, y: number) => {
            const pos = y * W + x;
            if (visited[pos]) return;
            if (isBgPixel(pos * 4)) {
              visited[pos] = 1;
              queue[tail++] = pos;
            }
          };

          for (let x = 0; x < W; x++) {
            pushIfBg(x, 0);
            pushIfBg(x, H - 1);
          }
          for (let y = 0; y < H; y++) {
            pushIfBg(0, y);
            pushIfBg(W - 1, y);
          }

          // Tìm thêm các vùng lỗ nền trắng khép kín ở phần thân dưới (giữa tay/thước/chân hoặc giữa 4 chân bàn, y >= H * 0.25)
          const seedSeen = new Uint8Array(totalPixels);
          const minHoleY = Math.round(H * 0.25);
          for (let y = minHoleY; y < H - 2; y += 2) {
            for (let x = 2; x < W - 2; x += 2) {
              const pos = y * W + x;
              if (visited[pos] || seedSeen[pos]) continue;
              const p4 = pos * 4;
              if (data[p4] >= 246 && data[p4 + 1] >= 246 && data[p4 + 2] >= 244) {
                const comp: number[] = [pos];
                let ci = 0;
                seedSeen[pos] = 1;
                while (ci < comp.length) {
                  const cp = comp[ci++];
                  const cx = cp % W;
                  const cy = (cp - cx) / W;
                  if (cx > 1) {
                    const np = cp - 1;
                    if (!seedSeen[np] && isBgPixel(np * 4)) {
                      seedSeen[np] = 1;
                      comp.push(np);
                    }
                  }
                  if (cx < W - 2) {
                    const np = cp + 1;
                    if (!seedSeen[np] && isBgPixel(np * 4)) {
                      seedSeen[np] = 1;
                      comp.push(np);
                    }
                  }
                  if (cy > minHoleY) {
                    const np = cp - W;
                    if (!seedSeen[np] && isBgPixel(np * 4)) {
                      seedSeen[np] = 1;
                      comp.push(np);
                    }
                  }
                  if (cy < H - 2) {
                    const np = cp + W;
                    if (!seedSeen[np] && isBgPixel(np * 4)) {
                      seedSeen[np] = 1;
                      comp.push(np);
                    }
                  }
                }
                if (comp.length >= 60) {
                  for (const p of comp) {
                    if (!visited[p]) {
                      visited[p] = 1;
                      queue[tail++] = p;
                    }
                  }
                }
              }
            }
          }

          while (head < tail) {
            const pos = queue[head++];
            data[pos * 4 + 3] = 0;
            const x = pos % W;
            const y = (pos - x) / W;
            if (x > 0) pushIfBg(x - 1, y);
            if (x < W - 1) pushIfBg(x + 1, y);
            if (y > 0) pushIfBg(x, y - 1);
            if (y < H - 1) pushIfBg(x, y + 1);
          }

          // Khử răng cưa viền trắng ngay sát vùng nền vừa xóa
          for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
              const pos = y * W + x;
              if (visited[pos]) continue;
              const touchesBg =
                visited[pos - 1] ||
                visited[pos + 1] ||
                visited[pos - W] ||
                visited[pos + W];
              if (!touchesBg) continue;
              const idx4 = pos * 4;
              const r = data[idx4];
              const g = data[idx4 + 1];
              const b = data[idx4 + 2];
              const sat = Math.max(r, g, b) - Math.min(r, g, b);
              if (r >= 215 && g >= 215 && b >= 212 && sat <= 18) {
                const whiteness = (r + g + b) / 3;
                const alphaScale = Math.max(0, Math.min(1, (240 - whiteness) / 26));
                data[idx4 + 3] = Math.round(data[idx4 + 3] * alphaScale);
              }
            }
          }

          ctx.putImageData(imgData, 0, 0);
        }

        // Tìm bounding box vùng có hình (alpha > 16) để cắt sát mép bàn
        let minX = W;
        let minY = H;
        let maxX = 0;
        let maxY = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const a = data[(y * W + x) * 4 + 3];
            if (a > 16) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX <= minX || maxY <= minY) {
          singleCutoutCache.set(cacheKey, url);
          singleCutoutPromises.delete(cacheKey);
          resolve(url);
          return;
        }

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        // Auto-Downscale Sprite Cache: Giới hạn kích thước bitmap giải nén trong VRAM (tối đa 320px cho học sinh/vật phẩm, 420px cho bàn học/giáo viên)
        // Giúp giảm 15-20 lần dung lượng VRAM trên TikTok Live Studio mà vẫn giữ độ nét Retina 2x
        const isLargeStageProp =
          url.includes('Desk') ||
          url.includes('Teacher') ||
          url.includes('zombie');
        const maxAllowedDim = isLargeStageProp ? 420 : 320;
        const maxCropSide = Math.max(cropW, cropH);
        const downscaleRatio =
          maxCropSide > maxAllowedDim ? maxAllowedDim / maxCropSide : 1;
        const targetW = Math.max(1, Math.round(cropW * downscaleRatio));
        const targetH = Math.max(1, Math.round(cropH * downscaleRatio));

        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetW;
        outCanvas.height = targetH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          resolve(url);
          return;
        }
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(
          canvas,
          minX,
          minY,
          cropW,
          cropH,
          0,
          0,
          targetW,
          targetH
        );

        const outUrl = await canvasToObjectUrl(outCanvas);
        singleCutoutCache.set(cacheKey, outUrl);
        singleCutoutPromises.delete(cacheKey);

        // Nếu đây là ảnh học sinh nữ ngồi ghế gỗ, đồng bộ luôn Blob URL đã nén nhẹ vào BAKED_STATIC_FRAMES
        if (url.includes('girl_student_seated_wooden_chair')) {
          Object.values(BAKED_STATIC_FRAMES).forEach((frameList) => {
            if (frameList.length === 10) {
              if (frameList[5]?.includes('girl_student_seated_wooden_chair')) {
                frameList[5] = outUrl;
              }
              if (frameList[6]?.includes('girl_student_seated_wooden_chair')) {
                frameList[6] = outUrl;
              }
            }
          });
        }

        resolve(outUrl);
      } catch {
        singleCutoutPromises.delete(cacheKey);
        resolve(url);
      }
    };
    img.onerror = () => {
      singleCutoutPromises.delete(cacheKey);
      resolve(url);
    };
    img.src = url;
  });

  singleCutoutPromises.set(cacheKey, promise);
  return promise;
}

export function useProcessedSingleCutout(
  rawUrl: string | null | undefined
): string | null {
  const url = rawUrl ? normalizeAssetUrl(rawUrl) : null;
  const [processedUrl, setProcessedUrl] = useState<string | null>(() => {
    if (!url) return null;
    const cacheKey = `${CACHE_VERSION}::single_cutout::${url}`;
    return singleCutoutCache.get(cacheKey) || url;
  });

  useEffect(() => {
    if (!url) {
      setProcessedUrl((prev) => (prev === null ? prev : null));
      return;
    }
    const cacheKey = `${CACHE_VERSION}::single_cutout::${url}`;
    if (singleCutoutCache.has(cacheKey)) {
      const cached = singleCutoutCache.get(cacheKey)!;
      setProcessedUrl((prev) => (prev === cached ? prev : cached));
      return;
    }
    let cancelled = false;
    processSingleCutoutImage(url).then((res) => {
      if (!cancelled) {
        setProcessedUrl((prev) => (prev === res ? prev : res));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return processedUrl;
}

// Tự động nén trước (Pre-warm Auto-Downscale Sprite Cache) các ảnh nhân vật mặc định ngay khi khởi tạo
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const defaultSingleSprites = [
      './assets/aistudio/girl_student_seated_wooden_chair.png?v=2',
      './assets/aistudio/Girl_Student_Standing.jpg',
      './assets/aistudio/Boy_Student_Seated.jpg',
      './assets/aistudio/Boy_Student_Standing.jpg',
      './assets/aistudio/Female_Teacher.jpg',
      './assets/aistudio/Male_Teacher.jpg',
      './assets/aistudio/Wooden_School_Desk.jpg',
    ];
    defaultSingleSprites.forEach((spriteUrl) => {
      void processSingleCutoutImage(spriteUrl);
    });
  }, 120);
}

