import type * as FaceApiTypes from '@vladmandic/face-api';
import { User } from '../types';

let faceapiModule: typeof FaceApiTypes | null = null;
let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const LOCAL_MODEL_URL = '/face-models';
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

async function getFaceApi(): Promise<typeof FaceApiTypes> {
  if (!faceapiModule) {
    faceapiModule = await import('@vladmandic/face-api');
  }
  return faceapiModule;
}

/**
 * Load lightweight neural face recognition models once per session.
 * Uses local /face-models first for instant offline-capable operation, with CDN fallback.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const faceapi = await getFaceApi();
    try {
      if ((faceapi as any).tf?.ready) {
        await (faceapi as any).tf.ready();
      }
    } catch {}

    const loadFromUri = async (uri: string) => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(uri),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(uri),
        faceapi.nets.faceRecognitionNet.loadFromUri(uri),
      ]);
    };

    try {
      await loadFromUri(LOCAL_MODEL_URL);
      modelsLoaded = true;
    } catch (localErr) {
      console.warn('[FaceAPI] Local models failed, falling back to CDN:', localErr);
      try {
        await loadFromUri(CDN_MODEL_URL);
        modelsLoaded = true;
      } catch {
        loadingPromise = null;
        throw new Error('Gagal memuat model AI pengenalan wajah. Periksa koneksi atau refresh halaman.');
      }
    }
  })();

  return loadingPromise;
}

export function areFaceModelsLoaded(): boolean {
  return modelsLoaded;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFaceResult {
  descriptor: number[];
  box: FaceBox;
  score: number;
  thumbnailUrl: string;
}

/**
 * Crop a square compressed JPEG thumbnail centered around the detected face.
 * Keeps output ~6-12 KB so it stores smoothly in LocalStorage & Firestore.
 */
export function captureFaceThumbnail(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  box?: FaceBox,
  mirror: boolean = false
): string {
  try {
    const srcWidth =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source instanceof HTMLImageElement
        ? source.naturalWidth || source.width
        : source.width;
    const srcHeight =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source instanceof HTMLImageElement
        ? source.naturalHeight || source.height
        : source.height;

    if (!srcWidth || !srcHeight) return '';

    const canvas = document.createElement('canvas');
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    if (mirror) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    if (box && box.width > 0 && box.height > 0) {
      const pad = Math.max(box.width, box.height) * 0.35;
      const side = Math.max(box.width, box.height) + pad * 2;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const sx = Math.max(0, Math.min(srcWidth - side, cx - side / 2));
      const sy = Math.max(0, Math.min(srcHeight - side, cy - side / 2));
      const sw = Math.min(side, srcWidth - sx);
      const sh = Math.min(side, srcHeight - sy);
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, size, size);
    } else {
      const side = Math.min(srcWidth, srcHeight);
      const sx = (srcWidth - side) / 2;
      const sy = (srcHeight - side) / 2;
      ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
    }

    return canvas.toDataURL('image/jpeg', 0.65);
  } catch {
    return '';
  }
}

/**
 * Detect single face and compute 128-D normalized descriptor from video, image, or canvas.
 */
export async function extractFaceDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  options?: { inputSize?: number; scoreThreshold?: number; mirrorThumbnail?: boolean }
): Promise<DetectedFaceResult | null> {
  await loadFaceModels();
  const faceapi = await getFaceApi();

  const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: options?.inputSize ?? 320,
    scoreThreshold: options?.scoreThreshold ?? 0.45,
  });

  const detection = await faceapi
    .detectSingleFace(input, detectorOptions)
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) return null;

  const box: FaceBox = {
    x: detection.detection.box.x,
    y: detection.detection.box.y,
    width: detection.detection.box.width,
    height: detection.detection.box.height,
  };

  const compactDescriptor = Array.from(detection.descriptor).map(
    v => Math.round(v * 100000) / 100000
  );

  const thumbnailUrl = captureFaceThumbnail(input, box, Boolean(options?.mirrorThumbnail));

  return {
    descriptor: compactDescriptor,
    box,
    score: detection.detection.score,
    thumbnailUrl,
  };
}

/**
 * Extract 128-D face descriptor directly from an existing image URL / data URL (e.g. fotoProfilUrl).
 */
export async function extractFaceFromImageUrl(imageUrl: string): Promise<DetectedFaceResult | null> {
  if (!imageUrl) return null;
  await loadFaceModels();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Gagal memuat gambar foto siswa.'));
    el.src = imageUrl;
  });

  return extractFaceDescriptor(img, { inputSize: 416, scoreThreshold: 0.38 });
}

/**
 * Compute Euclidean distance between two 128-D face descriptors.
 */
export function computeFaceDistance(d1: number[], d2: number[]): number {
  if (!d1 || !d2 || d1.length !== d2.length || d1.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Convert Euclidean face distance (typically 0.0 - 0.6) to human-readable match confidence percentage.
 */
export function distanceToConfidencePercent(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  const raw = Math.max(0, Math.min(100, Math.round((1 - distance / 0.78) * 100)));
  return raw;
}

export interface FaceMatchCandidate {
  matched: User;
  distance: number;
  confidencePercent: number;
}

/**
 * Find the closest matching student from enrolled users list.
 */
export function findBestFaceMatch(
  queryDescriptor: number[],
  candidates: User[],
  threshold: number = 0.48
): FaceMatchCandidate | null {
  let bestUser: User | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (!Array.isArray(candidate.faceDescriptor) || candidate.faceDescriptor.length !== 128) {
      continue;
    }
    const dist = computeFaceDistance(queryDescriptor, candidate.faceDescriptor);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestUser = candidate;
    }
  }

  if (bestUser && bestDistance <= threshold) {
    return {
      matched: bestUser,
      distance: bestDistance,
      confidencePercent: distanceToConfidencePercent(bestDistance),
    };
  }

  return null;
}

/**
 * Verify if a live face descriptor matches a specific target user's enrolled face.
 */
export function verifySelfFaceMatch(
  queryDescriptor: number[],
  targetUser: User,
  threshold: number = 0.50
): { isMatch: boolean; distance: number; confidencePercent: number } {
  if (!Array.isArray(targetUser.faceDescriptor) || targetUser.faceDescriptor.length !== 128) {
    return { isMatch: false, distance: Infinity, confidencePercent: 0 };
  }
  const distance = computeFaceDistance(queryDescriptor, targetUser.faceDescriptor);
  return {
    isMatch: distance <= threshold,
    distance,
    confidencePercent: distanceToConfidencePercent(distance),
  };
}

/**
 * Draw crisp AI face tracking box + label on an overlay canvas aligned over the video element.
 */
export function drawFaceOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  box: FaceBox | null,
  options?: { label?: string; matched?: boolean; mirrored?: boolean }
): void {
  if (!canvas || !video) return;
  const displayW = video.clientWidth || video.videoWidth;
  const displayH = video.clientHeight || video.videoHeight;
  if (!displayW || !displayH || !video.videoWidth || !video.videoHeight) return;

  if (canvas.width !== displayW || canvas.height !== displayH) {
    canvas.width = displayW;
    canvas.height = displayH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!box) return;

  const scale = Math.max(displayW / video.videoWidth, displayH / video.videoHeight);
  const renderedW = video.videoWidth * scale;
  const renderedH = video.videoHeight * scale;
  const offsetX = (displayW - renderedW) / 2;
  const offsetY = (displayH - renderedH) / 2;

  let drawX = box.x * scale + offsetX;
  const drawY = box.y * scale + offsetY;
  const drawW = box.width * scale;
  const drawH = box.height * scale;

  if (options?.mirrored) {
    drawX = displayW - drawX - drawW;
  }

  const isMatched = options?.matched ?? false;
  const strokeColor = isMatched ? '#10b981' : '#38bdf8';

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(drawX, drawY, drawW, drawH);

  const corner = Math.min(20, drawW * 0.25, drawH * 0.25);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(drawX, drawY + corner);
  ctx.lineTo(drawX, drawY);
  ctx.lineTo(drawX + corner, drawY);
  ctx.moveTo(drawX + drawW - corner, drawY);
  ctx.lineTo(drawX + drawW, drawY);
  ctx.lineTo(drawX + drawW, drawY + corner);
  ctx.moveTo(drawX, drawY + drawH - corner);
  ctx.lineTo(drawX, drawY + drawH);
  ctx.lineTo(drawX + corner, drawY + drawH);
  ctx.moveTo(drawX + drawW - corner, drawY + drawH);
  ctx.lineTo(drawX + drawW, drawY + drawH);
  ctx.lineTo(drawX + drawW, drawY + drawH - corner);
  ctx.stroke();

  if (options?.label) {
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(options.label).width;
    const pillW = textWidth + 16;
    const pillH = 24;
    const pillX = Math.max(4, Math.min(displayW - pillW - 4, drawX + (drawW - pillW) / 2));
    const pillY = drawY > 30 ? drawY - 28 : drawY + drawH + 6;

    ctx.fillStyle = isMatched ? 'rgba(5, 150, 105, 0.92)' : 'rgba(15, 23, 42, 0.85)';
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.beginPath();
      (ctx as any).roundRect(pillX, pillY, pillW, pillH, 8);
      ctx.fill();
    } else {
      ctx.fillRect(pillX, pillY, pillW, pillH);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillText(options.label, pillX + 8, pillY + 16);
  }
}
