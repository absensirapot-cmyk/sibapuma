/**
 * Client-side service for Gemini AI Question Generation & Refinement
 * Communicates with server-side endpoints /api/ai/*
 */

import { SoalPG, SoalIsian } from '../types';

export interface GenerateQuestionsParams {
  prompt?: string;
  namaGuru?: string;
  namaMapel?: string;
  lingkupMateri?: string;
  bab?: string;
  targetKelas?: string[];
  jenisUjian?: 'UJIAN_AKHIR' | 'UJIAN_TENGAH_SEMESTER';
  token?: string;
  waktuUjian?: string;
  jumlahPG?: number;
  jumlahIsian?: number;
  instruksiTambahan?: string;
  modeHots?: boolean;
  includeVisuals?: boolean;
  visualTypes?: ('chart' | 'table' | 'svg' | 'case')[];
  onProgress?: (message: string) => void;
}

export interface GenerateQuestionsResult {
  success: boolean;
  soalPG?: SoalPG[];
  soalIsian?: SoalIsian[];
  text?: string;
  modelUsed?: string;
  error?: string;
}

async function safeParseJsonResponse(res: Response): Promise<any> {
  const rawText = await res.text();
  if (!rawText || !rawText.trim()) {
    throw new Error(
      res.status === 504 || res.status === 502
        ? 'Waktu koneksi ke server habis karena jumlah soal terlalu banyak sekaligus. Coba kurangi jumlah soal atau ulangi lagi.'
        : `Server mengembalikan respon kosong (Kode ${res.status}). Silakan coba lagi.`
    );
  }
  try {
    return JSON.parse(rawText);
  } catch {
    if (res.status === 404) {
      const isStaticSharedPreview =
        typeof window !== 'undefined' && window.location.hostname.startsWith('ais-pre-');
      if (isStaticSharedPreview) {
        throw new Error(
          'Anda sedang membuka tautan Shared Preview statis (ais-pre-*) yang tidak menjalankan server backend. Gunakan tautan Development App (ais-dev-*) atau deploy dengan Netlify Functions / Cloud Run.'
        );
      }
      throw new Error(
        'Endpoint AI (/api/ai) tidak ditemukan (Kode 404). Jika deploy di Netlify, pastikan folder "netlify/functions" dan file "netlify.toml" ikut ter-deploy (bukan drag-and-drop folder dist saja) serta GEMINI_API_KEY sudah diisi di Environment Variables Netlify.'
      );
    }
    throw new Error(`Respon server tidak valid (Kode ${res.status}). Pastikan server aplikasi aktif.`);
  }
}

export async function requestAIGenerateQuestions(
  params: GenerateQuestionsParams
): Promise<GenerateQuestionsResult> {
  try {
    const { onProgress, ...payload } = params;

    // Legacy raw-prompt path (single request)
    if (payload.prompt && payload.prompt.trim()) {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok) {
        return {
          success: false,
          error: data.error || `Gagal menghubungi server Gemini AI (Kode ${res.status}).`,
        };
      }
      return {
        success: true,
        soalPG: Array.isArray(data.soalPG) ? data.soalPG : undefined,
        soalIsian: Array.isArray(data.soalIsian) ? data.soalIsian : undefined,
        text: data.text,
        modelUsed: data.modelUsed,
      };
    }

    // Chunked HTTP requests (max 3 PG per HTTP call) so Netlify Functions (10s limit) & Cloud Run stay fast and never time out
    const totalPG = Math.max(0, Number(payload.jumlahPG ?? 10));
    const totalIsian = Math.max(0, Number(payload.jumlahIsian ?? 0));
    const CHUNK_SIZE = 3;

    const chunks: { pg: number; isian: number; start: number; end: number }[] = [];
    if (totalPG === 0) {
      chunks.push({ pg: 0, isian: totalIsian, start: 1, end: 0 });
    } else {
      let rem = totalPG;
      let cursor = 1;
      while (rem > 0) {
        const take = Math.min(CHUNK_SIZE, rem);
        chunks.push({ pg: take, isian: 0, start: cursor, end: cursor + take - 1 });
        cursor += take;
        rem -= take;
      }
      chunks[chunks.length - 1].isian = totalIsian;
    }

    let combinedPG: SoalPG[] = [];
    let combinedIsian: SoalIsian[] = [];
    let lastModelUsed = '';
    let combinedTextParts: string[] = [];

    const fetchChunkWithRetry = async (chunkPayload: any) => {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch('/api/ai/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chunkPayload),
          });
          const data = await safeParseJsonResponse(res);
          return { res, data };
        } catch (err: any) {
          lastErr = err;
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      throw lastErr;
    };

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (onProgress) {
        onProgress(
          chunks.length > 1
            ? `Membuat soal ${c.start}–${c.end} dari ${totalPG} PG... (${i + 1}/${chunks.length})`
            : `Menyusun ${totalPG} soal HOTS beserta grafik, tabel & ilustrasi...`
        );
      }

      const chunkPayload = {
        ...payload,
        jumlahPG: c.pg,
        jumlahIsian: c.isian,
        instruksiTambahan: [
          payload.instruksiTambahan || '',
          chunks.length > 1
            ? `Bagian ${i + 1} dari ${chunks.length}: buat skenario/kasus baru yang berbeda dari bagian sebelumnya.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      };

      const { res, data } = await fetchChunkWithRetry(chunkPayload);
      if (!res.ok) {
        if (combinedPG.length > 0 || combinedIsian.length > 0) {
          // Return partial progress cleanly rather than losing everything
          break;
        }
        return {
          success: false,
          error: data.error || `Gagal menghubungi server Gemini AI (Kode ${res.status}).`,
        };
      }

      if (Array.isArray(data.soalPG)) {
        combinedPG = [...combinedPG, ...data.soalPG];
      }
      if (Array.isArray(data.soalIsian)) {
        combinedIsian = [...combinedIsian, ...data.soalIsian];
      }
      if (data.text) combinedTextParts.push(data.text);
      if (data.modelUsed) lastModelUsed = data.modelUsed;
    }

    return {
      success: true,
      soalPG: combinedPG.map((q, idx) => ({ ...q, nomor: idx + 1 })),
      soalIsian: combinedIsian.map((q, idx) => ({ ...q, nomor: idx + 1 })),
      text: combinedTextParts.join('\n\n'),
      modelUsed: lastModelUsed,
    };
  } catch (err: any) {
    console.error('requestAIGenerateQuestions error:', err);
    return {
      success: false,
      error: err.message || 'Koneksi ke server AI terputus. Pastikan server aktif.',
    };
  }
}

export interface RefineQuestionParams {
  questionType: 'pg' | 'isian';
  question: SoalPG | SoalIsian;
  instruction?: string;
  namaMapel?: string;
  preferredStimulusType?: 'auto' | 'chart' | 'table' | 'svg' | 'case' | 'none';
}

export async function requestAIRefineQuestion(
  params: RefineQuestionParams
): Promise<{ success: boolean; question?: any; modelUsed?: string; error?: string }> {
  try {
    const res = await fetch('/api/ai/refine-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await safeParseJsonResponse(res);
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Gagal mengedit soal dengan AI (Kode ${res.status}).`,
      };
    }

    return {
      success: true,
      question: data.question,
      modelUsed: data.modelUsed,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Koneksi ke server AI terputus.',
    };
  }
}

export interface ParseDocumentResult {
  success: boolean;
  judulUjian?: string;
  soalPG?: any[];
  soalIsian?: any[];
  modelUsed?: string;
  error?: string;
}

export async function requestAIParseExamDocument(
  text: string,
  fileName?: string
): Promise<ParseDocumentResult> {
  try {
    const res = await fetch('/api/ai/parse-exam-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, fileName }),
    });

    const data = await safeParseJsonResponse(res);
    if (!res.ok) {
      return {
        success: false,
        error: data.error || `Gagal memproses dokumen dengan AI (Kode ${res.status}).`,
      };
    }

    return {
      success: true,
      judulUjian: data.judulUjian,
      soalPG: data.soalPG,
      soalIsian: data.soalIsian,
      modelUsed: data.modelUsed,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Koneksi ke server AI terputus.',
    };
  }
}
