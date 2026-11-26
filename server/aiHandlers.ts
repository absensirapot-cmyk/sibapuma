import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

export interface HandlerResponse {
  status: number;
  data: Record<string, any>;
}

const TEXT_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

function getGeminiClient(): { ai: GoogleGenAI | null; apiKey: string } {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  if (!apiKey) return { ai: null, apiKey: '' };
  return {
    apiKey,
    ai: new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
  };
}

function getFastThinkingConfig(modelName: string) {
  return modelName === 'gemini-4-hydrogen'
    ? { thinkingLevel: ThinkingLevel.LOW }
    : { thinkingLevel: ThinkingLevel.MINIMAL };
}

export function formatGeminiError(err: any): { status: number; message: string } {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: 'Kunci API Gemini (GEMINI_API_KEY) tidak valid atau belum memiliki izin. Periksa pengaturan Secrets / Environment Variables.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Kuota permintaan AI sedang penuh sementara. Tunggu beberapa saat lalu coba lagi.',
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      status: 503,
      message: 'Server model Gemini AI sedang mengalami lonjakan permintaan sementara. Silakan klik proses ulang dalam beberapa detik.',
    };
  }
  return {
    status: 500,
    message: raw || 'Terjadi kendala saat menghubungi server Gemini AI.',
  };
}

async function generateWithModelFallback(
  contents: string,
  extraConfig: Record<string, any> = {}
): Promise<{ text: string; modelUsed: string }> {
  const { ai } = getGeminiClient();
  if (!ai) {
    throw new Error('Kunci API Gemini (GEMINI_API_KEY) belum terpasang di Environment Variables server / Secrets aplikasi.');
  }

  let lastError: any = null;
  for (const modelName of TEXT_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            thinkingConfig: getFastThinkingConfig(modelName),
            ...extraConfig,
          },
        });
        if (response.text && response.text.trim()) {
          return { text: response.text, modelUsed: modelName };
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '').toLowerCase();
        const isTransient =
          msg.includes('503') ||
          msg.includes('unavailable') ||
          msg.includes('429') ||
          msg.includes('timeout');
        console.warn(`[AI] Model ${modelName} (attempt ${attempt + 1}) error:`, err?.message || err);
        if (isTransient && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          continue;
        }
        break;
      }
    }
  }
  throw lastError || new Error('Semua model AI sedang sibuk.');
}

function safeExtractJson(raw: string): any {
  const cleaned = raw
    .replace(/^```[a-zA-Z]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Format respon AI tidak dapat dibaca.');
  }
}

function sanitizeSvgServer(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
  if (!cleaned.toLowerCase().includes('<svg')) return undefined;
  return cleaned;
}

function normalizeStimulus(raw: any): any | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = String(raw.type || '').toLowerCase();
  if (!['chart', 'table', 'svg', 'case'].includes(type)) return undefined;

  const base: any = { type };
  if (typeof raw.title === 'string' && raw.title.trim()) base.title = raw.title.trim();
  if (typeof raw.caption === 'string' && raw.caption.trim()) base.caption = raw.caption.trim();

  if (type === 'chart') {
    const chartData = Array.isArray(raw.chartData)
      ? raw.chartData
          .filter((d: any) => d && typeof d.label === 'string' && !Number.isNaN(Number(d.value)))
          .map((d: any) => {
            const point: any = { label: String(d.label).trim(), value: Number(d.value) };
            if (d.value2 !== undefined && d.value2 !== null && !Number.isNaN(Number(d.value2))) {
              point.value2 = Number(d.value2);
            }
            return point;
          })
      : [];
    if (chartData.length === 0) return undefined;
    base.chartType = ['bar', 'line', 'pie'].includes(String(raw.chartType)) ? raw.chartType : 'bar';
    if (typeof raw.chartUnit === 'string' && raw.chartUnit.trim()) base.chartUnit = raw.chartUnit.trim();
    if (typeof raw.series1Label === 'string' && raw.series1Label.trim()) base.series1Label = raw.series1Label.trim();
    if (typeof raw.series2Label === 'string' && raw.series2Label.trim()) base.series2Label = raw.series2Label.trim();
    base.chartData = chartData;
    return base;
  }

  if (type === 'table') {
    const headers = Array.isArray(raw.tableHeaders)
      ? raw.tableHeaders.map((h: any) => String(h ?? '').trim()).filter(Boolean)
      : [];
    const rowsRaw = Array.isArray(raw.tableRows) ? raw.tableRows : [];
    const tableRows = rowsRaw
      .map((r: any) => {
        const cells = Array.isArray(r) ? r : Array.isArray(r?.cells) ? r.cells : [];
        return { cells: cells.map((c: any) => String(c ?? '-').trim()) };
      })
      .filter((r: any) => r.cells.length > 0);
    if (headers.length === 0 || tableRows.length === 0) return undefined;
    base.tableHeaders = headers;
    base.tableRows = tableRows;
    return base;
  }

  if (type === 'svg') {
    const svg = sanitizeSvgServer(raw.svgMarkup);
    if (!svg) return undefined;
    base.svgMarkup = svg;
    return base;
  }

  if (type === 'case') {
    const txt = typeof raw.caseText === 'string' ? raw.caseText.trim() : '';
    if (!txt) return undefined;
    base.caseText = txt;
    return base;
  }

  return undefined;
}

function normalizeStructuredPG(list: any[], startNomor = 1) {
  return (Array.isArray(list) ? list : [])
    .filter((q: any) => q && typeof q.pertanyaan === 'string' && q.pertanyaan.trim())
    .map((q: any, idx: number) => {
      const rawKey = String(q.kunci || 'A').trim().toUpperCase().charAt(0);
      const validKey = (['A', 'B', 'C', 'D', 'E'].includes(rawKey) ? rawKey : 'A') as 'A' | 'B' | 'C' | 'D' | 'E';
      const opsi = q.opsi || {};
      const item: any = {
        id: `pg-ai-${Date.now()}-${startNomor + idx}-${Math.random().toString(36).slice(2, 6)}`,
        nomor: startNomor + idx,
        pertanyaan: String(q.pertanyaan).replace(/^\s*\d+[\.\)]\s*/, '').trim(),
        opsi: {
          a: String(opsi.a || 'Pilihan A').trim(),
          b: String(opsi.b || 'Pilihan B').trim(),
          c: String(opsi.c || 'Pilihan C').trim(),
          d: String(opsi.d || 'Pilihan D').trim(),
          e: String(opsi.e || 'Pilihan E').trim(),
        },
        kunci: validKey,
        pembahasan: typeof q.pembahasan === 'string' ? q.pembahasan.trim() : '',
        levelKognitif: typeof q.levelKognitif === 'string' && q.levelKognitif.trim() ? q.levelKognitif.trim().toUpperCase() : 'C4',
      };
      const stim = normalizeStimulus(q.stimulus);
      if (stim) item.stimulus = stim;
      return item;
    });
}

function normalizeStructuredIsian(list: any[], startNomor = 1) {
  return (Array.isArray(list) ? list : [])
    .filter((q: any) => q && typeof q.pertanyaan === 'string' && q.pertanyaan.trim())
    .map((q: any, idx: number) => {
      const kunciVal = String(q.kunci || q.kunciJawaban || '-').trim();
      const item: any = {
        id: `isian-ai-${Date.now()}-${startNomor + idx}-${Math.random().toString(36).slice(2, 6)}`,
        nomor: startNomor + idx,
        pertanyaan: String(q.pertanyaan).replace(/^\s*\d+[\.\)]\s*/, '').trim(),
        kunci: kunciVal,
        kunciJawaban: kunciVal,
        levelKognitif: typeof q.levelKognitif === 'string' && q.levelKognitif.trim() ? q.levelKognitif.trim().toUpperCase() : 'C5',
      };
      const stim = normalizeStimulus(q.stimulus);
      if (stim) item.stimulus = stim;
      return item;
    });
}

function buildAikenFallbackText(soalPG: any[], soalIsian: any[], meta: Record<string, string>) {
  const header = Object.entries(meta)
    .map(([k, v]) => `[${k}] = ${v}`)
    .join('\n');
  const pgText = soalPG
    .map((q) => {
      const stimLabel = q.stimulus?.title ? `[Stimulus: ${q.stimulus.title}]\n` : '';
      return `${stimLabel}${q.pertanyaan}\nA. ${q.opsi.a}\nB. ${q.opsi.b}\nC. ${q.opsi.c}\nD. ${q.opsi.d}\nE. ${q.opsi.e}\nANSWER: ${q.kunci}`;
    })
    .join('\n\n');
  const isianText =
    soalIsian.length > 0
      ? `\n\n=== BAGIAN SOAL ISIAN ===\n\n` +
        soalIsian.map((q) => `${q.pertanyaan}\nANSWER_KEY: ${q.kunci}`).join('\n\n')
      : '';
  return `${header}\n---\n${pgText}${isianText}`;
}

const stimulusSchema = {
  type: Type.OBJECT,
  nullable: true,
  description: 'Stimulus visual atau data untuk soal HOTS (grafik, tabel, diagram SVG, atau studi kasus). Gunakan salah satu tipe saja yang paling relevan.',
  properties: {
    type: {
      type: Type.STRING,
      description: 'Wajib salah satu dari: "chart", "table", "svg", atau "case".',
    },
    title: { type: Type.STRING, description: 'Judul singkat grafik/tabel/diagram/wacana.' },
    caption: { type: Type.STRING, description: 'Keterangan sumber atau catatan singkat di bawah visual.' },
    chartType: { type: Type.STRING, description: 'Untuk type="chart": "bar", "line", atau "pie".' },
    chartUnit: { type: Type.STRING, description: 'Satuan angka pada grafik, misal: "mg/dL", "%", "orang", "Rp".' },
    series1Label: { type: Type.STRING, description: 'Nama seri data pertama jika ada 2 seri.' },
    series2Label: { type: Type.STRING, description: 'Nama seri data kedua jika membandingkan 2 kelompok.' },
    chartData: {
      type: Type.ARRAY,
      description: '3 sampai 6 titik data untuk grafik.',
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.NUMBER },
          value2: { type: Type.NUMBER, nullable: true },
        },
        required: ['label', 'value'],
      },
    },
    tableHeaders: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Judul kolom tabel untuk type="table".',
    },
    tableRows: {
      type: Type.ARRAY,
      description: 'Baris isi tabel untuk type="table".',
      items: {
        type: Type.OBJECT,
        properties: {
          cells: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['cells'],
      },
    },
    svgMarkup: {
      type: Type.STRING,
      description: 'Untuk type="svg": kode <svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">...</svg> yang bersih, rapi, dan berlabel bahasa Indonesia jelas.',
    },
    caseText: {
      type: Type.STRING,
      description: 'Untuk type="case": naskah studi kasus / skenario klinis / wacana kontekstual 3-5 kalimat.',
    },
  },
  required: ['type', 'title'],
};

const examBatchSchema = {
  type: Type.OBJECT,
  properties: {
    soalPG: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pertanyaan: { type: Type.STRING },
          levelKognitif: { type: Type.STRING, description: 'Level taksonomi Bloom HOTS: C4, C5, atau C6.' },
          stimulus: stimulusSchema,
          opsi: {
            type: Type.OBJECT,
            properties: {
              a: { type: Type.STRING },
              b: { type: Type.STRING },
              c: { type: Type.STRING },
              d: { type: Type.STRING },
              e: { type: Type.STRING },
            },
            required: ['a', 'b', 'c', 'd', 'e'],
          },
          kunci: { type: Type.STRING, description: 'Huruf A, B, C, D, atau E.' },
          pembahasan: { type: Type.STRING, description: 'Alasan analisis singkat mengapa jawaban benar.' },
        },
        required: ['pertanyaan', 'levelKognitif', 'opsi', 'kunci', 'pembahasan'],
      },
    },
    soalIsian: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pertanyaan: { type: Type.STRING },
          levelKognitif: { type: Type.STRING, description: 'C4, C5, atau C6.' },
          stimulus: stimulusSchema,
          kunciJawaban: { type: Type.STRING },
        },
        required: ['pertanyaan', 'levelKognitif', 'kunciJawaban'],
      },
    },
  },
  required: ['soalPG', 'soalIsian'],
};

const refinePgSchema = {
  type: Type.OBJECT,
  properties: {
    pertanyaan: { type: Type.STRING },
    levelKognitif: { type: Type.STRING },
    stimulus: stimulusSchema,
    opsi: {
      type: Type.OBJECT,
      properties: {
        a: { type: Type.STRING },
        b: { type: Type.STRING },
        c: { type: Type.STRING },
        d: { type: Type.STRING },
        e: { type: Type.STRING },
      },
      required: ['a', 'b', 'c', 'd', 'e'],
    },
    kunci: { type: Type.STRING },
    pembahasan: { type: Type.STRING },
  },
  required: ['pertanyaan', 'levelKognitif', 'opsi', 'kunci', 'pembahasan'],
};

const refineIsianSchema = {
  type: Type.OBJECT,
  properties: {
    pertanyaan: { type: Type.STRING },
    levelKognitif: { type: Type.STRING },
    stimulus: stimulusSchema,
    kunciJawaban: { type: Type.STRING },
  },
  required: ['pertanyaan', 'levelKognitif', 'kunciJawaban'],
};

export function handleAiStatus(): HandlerResponse {
  const { apiKey } = getGeminiClient();
  return {
    status: 200,
    data: {
      status: 'ok',
      hasApiKey: !!apiKey,
      model: 'gemini-4-hydrogen',
    },
  };
}

export async function handleGenerateQuestions(body: any): Promise<HandlerResponse> {
  try {
    const {
      prompt,
      namaGuru = 'Guru Pengampu',
      namaMapel = 'Mata Pelajaran Kejuruan',
      lingkupMateri = '',
      bab = '',
      targetKelas = [],
      jenisUjian = 'UJIAN_TENGAH_SEMESTER',
      token = 'MED2026',
      waktuUjian = '90 Menit',
      jumlahPG,
      jumlahIsian = 5,
      instruksiTambahan = '',
      modeHots = true,
      includeVisuals = true,
      visualTypes = ['chart', 'table', 'svg', 'case'],
    } = body || {};

    const { ai } = getGeminiClient();
    if (!ai) {
      return {
        status: 503,
        data: {
          error: 'Kunci API Gemini (GEMINI_API_KEY) belum terpasang di Environment Variables server / Secrets aplikasi.',
        },
      };
    }

    const isPAS = jenisUjian === 'UJIAN_AKHIR';
    const targetCountPG = Math.min(50, Math.max(0, Number(jumlahPG ?? (isPAS ? 40 : 30))));
    const targetCountIsian = Math.min(15, Math.max(0, Number(jumlahIsian ?? 5)));

    if (prompt && typeof prompt === 'string' && prompt.trim()) {
      const { text: generatedText, modelUsed: successModel } = await generateWithModelFallback(prompt);
      const cleanedText = generatedText.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '').trim();
      return {
        status: 200,
        data: { text: cleanedText, modelUsed: successModel, targetPG: targetCountPG, targetIsian: targetCountIsian },
      };
    }

    const mapelLower = (namaMapel || '').toLowerCase();
    const isPenjas = mapelLower.includes('jasmani') || mapelLower.includes('pjok');
    const isAgama = mapelLower.includes('agama') || mapelLower.includes('pai');
    const isFarmasi = mapelLower.includes('farmasi') || mapelLower.includes('obat') || mapelLower.includes('resep');
    const isPerawatan = mapelLower.includes('keperawatan') || mapelLower.includes('klinis') || mapelLower.includes('anatomi');
    const isKecantikan = mapelLower.includes('kecantikan') || mapelLower.includes('spa') || mapelLower.includes('kulit');
    const isPerhotelan = mapelLower.includes('hotel') || mapelLower.includes('tata') || mapelLower.includes('front office');

    const roleText = isPenjas
      ? 'Guru PJOK SMK sekaligus Penyusun Soal AKM & HOTS'
      : isAgama
      ? 'Guru Pendidikan Agama Islam SMK sekaligus Penyusun Soal Kontekstual HOTS'
      : `Guru Kejuruan Produktif ${namaMapel} SMK sekaligus Pakar Evaluasi HOTS (C4–C6)`;

    const domainExamples = isPenjas
      ? 'grafik denyut nadi latihan/VO2max, tabel hasil tes kebugaran siswa, diagram SVG lapangan/formasi strategi atau lintasan gerak, dan studi kasus cedera olahraga'
      : isAgama
      ? 'tabel perbandingan kasus muamalah/zakat, grafik tren perilaku sosial/filantropi, diagram alur (flowchart SVG) tata cara ibadah/pembagian waris, dan studi kasus etika remaja'
      : isFarmasi
      ? 'grafik kadar obat dalam darah/stabilitas suhu penyimpanan, tabel hasil pengamatan resep/dosis pediatrik & interaksi obat, diagram SVG etiket/alat peracikan atau alur dispensing apotek, dan studi kasus pasien'
      : isPerawatan
      ? 'grafik tanda vital pasien (suhu, nadi, tekanan darah) selama 24 jam, tabel hasil lab/pemeriksaan fisik, diagram SVG alur triase/anatomi organ atau posisi pasien, dan studi kasus asuhan keperawatan'
      : isKecantikan
      ? 'tabel analisis kondisi kulit/rambut klien dan bahan aktif kosmetik, grafik kepuasan layanan/pH produk, diagram SVG anatomi lapisan kulit/pola pemangkasan/kontur wajah, dan studi kasus komplain klien'
      : isPerhotelan
      ? 'grafik tingkat hunian kamar (occupancy/ADR), tabel tarif & reservasi tamu atau jadwal housekeeping, diagram SVG denah tata letak kamar/table set-up/alur check-in, dan studi kasus komplain tamu'
      : 'grafik data analisis/perbandingan, tabel pengamatan eksperimen/kasus, diagram alur atau ilustrasi SVG berlabel jelas, dan studi kasus pemecahan masalah nyata';

    const activeVisuals = Array.isArray(visualTypes) && visualTypes.length > 0
      ? visualTypes.filter((v: string) => ['chart', 'table', 'svg', 'case'].includes(v))
      : ['chart', 'table', 'svg', 'case'];

    const visualInstructions = includeVisuals && activeVisuals.length > 0
      ? `STIMULUS VISUAL & DATA (WAJIB DIPATUHI):
- Sertakan stimulus pada sekitar 45% hingga 60% dari total butir soal dalam paket ini menggunakan tipe yang diizinkan: [${activeVisuals.join(', ')}].
- Bagikan secara bervariasi agar tidak monoton:
  ${activeVisuals.includes('chart') ? '1) type="chart": gunakan "bar", "line", atau "pie" dengan data numerik realistis (3-6 item) + satuan (chartUnit). Pertanyaan WAJIB meminta siswa menganalisis/menghitung/membandingkan angka pada grafik tersebut!\n  ' : ''}${activeVisuals.includes('table') ? '2) type="table": gunakan tableHeaders (3-5 kolom) & tableRows ({ cells: [...] }, 3-5 baris) berisi data hasil pengamatan, dosis, gejala, tarif, atau hasil uji. Pertanyaan WAJIB menuntut analisis silang antar baris/kolom tabel!\n  ' : ''}${activeVisuals.includes('svg') ? '3) type="svg": buat svgMarkup berupa diagram alur (flowchart), skema alat/proses, grafik kurva berlabel, denah, atau ilustrasi edukatif vektor (<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">...</svg>). Gunakan elemen sederhana (<rect>, <circle>, <line>, <polygon>, <path>, <text>) dengan warna kontras rapi, font-size 11-13, dan SEMUA label teks terbaca jelas tanpa saling bertumpuk!\n  ' : ''}${activeVisuals.includes('case') ? '4) type="case": berikan caseText berupa wacana/skenario kasus nyata 3-5 kalimat berisi data atau dilema profesional untuk dievaluasi siswa.' : ''}
- KONSISTENSI MUTLAK: Angka, label, dan fakta pada stimulus HARUS 100% cocok dengan pertanyaan dan kunci jawaban.`
      : 'Jika relevan, boleh menyertakan stimulus wacana/studi kasus singkat (`type="case"`).';

    const hotsInstructions = modeHots
      ? `ATURAN KETAT SOAL HOTS (WAJIB LEVEL KOGNITIF C4, C5, ATAU C6):
- DILARANG keras membuat soal hafalan dangkal seperti "Apa pengertian...", "Kepanjangan dari...", atau "Sebutkan definisi...".
- Setiap soal HARUS menguji penalaran tingkat tinggi:
  * C4 (Menganalisis): membandingkan data, menemukan pola/anomali, mengidentifikasi penyebab masalah dari skenario/grafik/tabel.
  * C5 (Mengevaluasi): menilai ketepatan prosedur/tindakan, memilih keputusan terbaik berdasarkan beberapa kriteria/syarat.
  * C6 (Merancang/Memecahkan): menentukan langkah perbaikan, menyusun urutan tindakan darurat, atau merancang solusi baru.
- Gunakan kalimat pertanyaan yang tajam seperti: "Berdasarkan grafik/tabel di atas, tindakan paling tepat...", "Mengapa kondisi X terjadi berdasarkan diagram...", "Evaluasilah kesalahan prosedur pada kasus tersebut...".
- Opsi pengecoh (A–E) harus masuk akal, setara panjangnya, dan homogen.`
      : 'Buat soal berkualitas sesuai kompetensi materi dengan variasi pemahaman dan penerapan kasus.';

    const BATCH_LIMIT = 15;
    const batches: { pgCount: number; isianCount: number; batchIdx: number; totalBatches: number }[] = [];
    let remainingPG = targetCountPG;
    while (remainingPG > 0) {
      const count = Math.min(BATCH_LIMIT, remainingPG);
      batches.push({ pgCount: count, isianCount: 0, batchIdx: batches.length + 1, totalBatches: 1 });
      remainingPG -= count;
    }
    if (batches.length === 0) {
      batches.push({ pgCount: 0, isianCount: targetCountIsian, batchIdx: 1, totalBatches: 1 });
    } else {
      batches[batches.length - 1].isianCount = targetCountIsian;
    }
    batches.forEach(b => { b.totalBatches = batches.length; });

    let allPG: any[] = [];
    let allIsian: any[] = [];
    let successModel = '';

    for (const batch of batches) {
      const batchPrompt = `Bertindaklah sebagai ${roleText} di SMK Bakti Putra Mandiri.
Buatkan bagian ${batch.batchIdx} dari ${batch.totalBatches} paket soal ${isPAS ? 'UJIAN AKHIR (PAS/PAT)' : 'PENILAIAN TENGAH SEMESTER (PTS)'}.

IDENTITAS MATERI:
- Mata Pelajaran: ${namaMapel}
- Lingkup Materi: ${lingkupMateri || namaMapel}
- Bab / Pokok Bahasan: ${bab || 'Kompetensi Kejuruan Terapan'}
- Sasaran Kelas: ${Array.isArray(targetKelas) && targetKelas.length > 0 ? targetKelas.join(', ') : 'Semua Kelas'}
- Konteks Referensi Visual Mapel: ${domainExamples}
- Alokasi Waktu: ${waktuUjian}
${instruksiTambahan ? `- Catatan Khusus Guru: ${instruksiTambahan}` : ''}

JUMLAH SOAL YANG HARUS DIHASILKAN PADA BAGIAN INI:
- Tepat ${batch.pgCount} soal Pilihan Ganda (opsi A, B, C, D, E).
- Tepat ${batch.isianCount} soal Isian Singkat.
${batch.batchIdx > 1 ? '- Pastikan topik/skenario soal berbeda dan tidak mengulang soal bagian sebelumnya.' : ''}

${hotsInstructions}

${visualInstructions}

Jangan beri awalan nomor ("1.", "Soal 1:") pada teks pertanyaan. Kembalikan HANYA JSON sesuai skema.`;

      const { text: rawBatchText, modelUsed: batchModel } = await generateWithModelFallback(batchPrompt, {
        responseMimeType: 'application/json',
        responseSchema: examBatchSchema,
      });
      const parsedBatch = safeExtractJson(rawBatchText);
      successModel = batchModel;

      const normalizedPG = normalizeStructuredPG(parsedBatch.soalPG, allPG.length + 1);
      const normalizedIsian = normalizeStructuredIsian(parsedBatch.soalIsian, allIsian.length + 1);
      allPG = [...allPG, ...normalizedPG];
      allIsian = [...allIsian, ...normalizedIsian];
    }

    const fallbackText = buildAikenFallbackText(allPG, allIsian, {
      ID_GURU_LOGIN: namaGuru,
      MAPEL_DIAMPU: namaMapel,
      LINGKUP_MATERI: lingkupMateri || namaMapel,
      BAB: bab || 'Kompetensi Inti',
      TOKEN_SAYA: token,
    });

    return {
      status: 200,
      data: {
        success: true,
        soalPG: allPG,
        soalIsian: allIsian,
        text: fallbackText,
        modelUsed: successModel,
        targetPG: targetCountPG,
        targetIsian: targetCountIsian,
      },
    };
  } catch (error: any) {
    console.error('Error in generate-questions:', error);
    const formatted = formatGeminiError(error);
    return {
      status: formatted.status,
      data: { error: formatted.message },
    };
  }
}

export async function handleRefineQuestion(body: any): Promise<HandlerResponse> {
  try {
    const {
      questionType = 'pg',
      question,
      instruction = 'Tingkatkan menjadi soal HOTS (C4-C5) lengkap dengan stimulus visual yang relevan.',
      namaMapel = 'Mata Pelajaran Kejuruan',
      preferredStimulusType = 'auto',
    } = body || {};

    const { ai } = getGeminiClient();
    if (!ai) {
      return {
        status: 503,
        data: { error: 'Kunci API Gemini (GEMINI_API_KEY) belum terpasang di Environment Variables server / Secrets aplikasi.' },
      };
    }

    if (!question || typeof question !== 'object') {
      return {
        status: 400,
        data: { error: 'Data soal tidak ditemukan.' },
      };
    }

    const visualRule =
      preferredStimulusType === 'none'
        ? 'Jangan gunakan stimulus grafik/tabel baru kecuali dibutuhkan.'
        : preferredStimulusType === 'chart'
        ? 'WAJIB sertakan stimulus type="chart" ("bar", "line", atau "pie") beserta chartData & chartUnit yang konsisten dengan pertanyaan dan kunci jawaban.'
        : preferredStimulusType === 'table'
        ? 'WAJIB sertakan stimulus type="table" beserta tableHeaders & tableRows ({ cells }) yang konsisten dengan pertanyaan dan kunci jawaban.'
        : preferredStimulusType === 'svg'
        ? 'WAJIB sertakan stimulus type="svg" berupa diagram/ilustrasi SVG rapi (<svg viewBox="0 0 420 220" xmlns="http://www.w3.org/2000/svg">...</svg>) berlabel bahasa Indonesia jelas.'
        : preferredStimulusType === 'case'
        ? 'WAJIB sertakan stimulus type="case" berisi wacana/studi kasus kontekstual 3-5 kalimat.'
        : 'Jika cocok, sertakan stimulus visual terbaik ("chart", "table", "svg", atau "case") agar soal menjadi HOTS C4-C6 yang kuat.';

    const promptText = `Anda adalah Pakar Pembuat Soal HOTS SMK untuk mata pelajaran ${namaMapel}.
Berikut adalah 1 butir soal (${questionType === 'isian' ? 'Isian Singkat' : 'Pilihan Ganda'}) yang ingin diperbaiki/diubah oleh guru:
${JSON.stringify(question, null, 2)}

INSTRUKSI GURU: ${instruction}
${visualRule}

Pastikan teks pertanyaan bersih tanpa awalan nomor, opsi A-E jelas dan homogen (untuk PG), kunci jawaban 100% akurat dan cocok dengan stimulus, serta levelKognitif C4/C5/C6. Kembalikan HANYA JSON sesuai skema.`;

    const { text: rawRefineText, modelUsed: usedModel } = await generateWithModelFallback(promptText, {
      responseMimeType: 'application/json',
      responseSchema: questionType === 'isian' ? refineIsianSchema : refinePgSchema,
    });
    const parsed = safeExtractJson(rawRefineText);

    if (questionType === 'isian') {
      const [normalized] = normalizeStructuredIsian([parsed], Number(question.nomor) || 1);
      if (!normalized) throw new Error('Hasil perbaikan AI kosong.');
      return {
        status: 200,
        data: {
          success: true,
          modelUsed: usedModel,
          question: { ...normalized, id: question.id || normalized.id, nomor: question.nomor || 1 },
        },
      };
    }

    const [normalized] = normalizeStructuredPG([parsed], Number(question.nomor) || 1);
    if (!normalized) throw new Error('Hasil perbaikan AI kosong.');
    return {
      status: 200,
      data: {
        success: true,
        modelUsed: usedModel,
        question: { ...normalized, id: question.id || normalized.id, nomor: question.nomor || 1 },
      },
    };
  } catch (error: any) {
    console.error('Error in refine-question:', error);
    const formatted = formatGeminiError(error);
    return {
      status: formatted.status,
      data: { error: formatted.message },
    };
  }
}

export async function handleParseExamDocument(body: any): Promise<HandlerResponse> {
  try {
    const { text, fileName } = body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return {
        status: 400,
        data: { error: 'Teks dokumen kosong atau tidak terbaca.' },
      };
    }

    const { ai } = getGeminiClient();
    if (!ai) {
      return {
        status: 503,
        data: { error: 'Kunci API Gemini belum dikonfigurasi. Mode parsing lokal otomatis tetap aktif.' },
      };
    }

    const truncatedText = text.slice(0, 35000);
    const parsePrompt = `Anda adalah asisten cerdas ekstraksi naskah soal ujian kurikulum SMK.
Berikut adalah teks mentah yang diekstrak dari berkas soal (${fileName || 'Dokumen Soal'}):

--- AWAL TEKS ---
${truncatedText}
--- AKHIR TEKS ---

TUGAS ANDA:
1. Ekstraksi secara akurat SEMUA butir Soal Pilihan Ganda (PG) dan Soal Isian/Essay yang ada dalam teks.
2. Identifikasi pertanyaan, opsi A, B, C, D, E, kunci jawaban yang benar (A, B, C, D, atau E), dan pembahasan singkat.
3. Jika kunci jawaban berada di bagian akhir dokumen (seperti "KUNCI JAWABAN: 1. A, 2. C..."), hubungkan secara akurat ke nomor soal yang sesuai.
4. Pastikan teks pertanyaan bersih dari nomor soal (nomor soal disimpan di atribut "nomor").
5. Format balasan HARUS HANYA JSON MURNI (tanpa tanda kutip tiga markdown \`\`\`json) dengan skema:
{
  "judulUjian": "Judul atau nama ujian jika tertera",
  "soalPG": [
    {
      "nomor": 1,
      "pertanyaan": "Isi pertanyaan lengkap",
      "opsi": {
        "a": "Opsi A",
        "b": "Opsi B",
        "c": "Opsi C",
        "d": "Opsi D",
        "e": "Opsi E"
      },
      "kunci": "A",
      "pembahasan": "Pembahasan atau referensi singkat"
    }
  ],
  "soalIsian": [
    {
      "nomor": 1,
      "pertanyaan": "Isi pertanyaan isian",
      "kunciJawaban": "Kunci jawaban isian"
    }
  ]
}`;

    const { text: aiResponseText, modelUsed } = await generateWithModelFallback(parsePrompt);
    const parsedData = safeExtractJson(aiResponseText);
    return {
      status: 200,
      data: {
        success: true,
        modelUsed,
        judulUjian: parsedData.judulUjian || '',
        soalPG: parsedData.soalPG || [],
        soalIsian: parsedData.soalIsian || [],
      },
    };
  } catch (err: any) {
    console.error('Error in parse-exam-document:', err);
    const formatted = formatGeminiError(err);
    return {
      status: formatted.status,
      data: { error: formatted.message },
    };
  }
}
