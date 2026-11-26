import { User } from '../types';

export interface ParsedAttendanceEntry {
  id: string; // unique row id
  rawLine: string;
  rawName: string;
  detectedStatus: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa' | null;
  detectedKeterangan: string;
  matchedStudent: User | null;
  matchScore: number; // 0 to 100
  matchReason: string;
  allCandidates: User[];
  resolvedStatus: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa';
  resolvedKeterangan: string;
}

/**
 * Normalizes text for comparison: lowercases, removes punctuation, trims extra spaces.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple Levenshtein distance calculation for typo tolerance.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const matrix: number[][] = [];
  for (let i = 0; i <= m; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[m][n];
}

/**
 * Intelligent student matcher by full name, nickname (nama panggilan), NIPD, or NISN.
 */
export function findBestStudentMatch(
  rawTerm: string,
  studentPool: User[],
  classFilter?: string
): {
  matched: User | null;
  score: number;
  reason: string;
  candidates: User[];
} {
  const term = normalizeText(rawTerm);
  if (!term || studentPool.length === 0) {
    return { matched: null, score: 0, reason: 'Teks kosong', candidates: [] };
  }

  const scoredStudents: { student: User; score: number; reason: string }[] = [];

  for (const s of studentPool) {
    const sName = normalizeText(s.nama || '');
    const sNipd = (s.nipd || s.nipOrNis || '').replace(/[^0-9]/g, '');
    const sNisn = (s.nisn || '').replace(/[^0-9]/g, '');
    const cleanTermDigits = rawTerm.replace(/[^0-9]/g, '');
    const sClass = (s.kelas || s.namaKelas || '').trim();

    let score = 0;
    let reason = '';

    // 1. Exact Match on NIPD or NISN
    if (cleanTermDigits.length >= 4 && (sNipd.includes(cleanTermDigits) || sNisn.includes(cleanTermDigits))) {
      score = 100;
      reason = `NIPD / NISN Cocok (${sNipd || sNisn})`;
    }
    // 2. Exact Full Name Match
    else if (sName === term) {
      score = 100;
      reason = 'Nama Lengkap Persis';
    }
    // 3. Match on Name Words (Nicknames / Panggilan)
    else {
      const nameWords = sName.split(' ').filter(w => w.length > 0);
      const termWords = term.split(' ').filter(w => w.length > 0);
      const firstWord = nameWords[0] || '';

      // Term is exact single word of student's name
      if (nameWords.includes(term)) {
        if (term === firstWord) {
          score = 96;
          reason = `Nama Panggilan Depan (${firstWord})`;
        } else {
          score = 92;
          reason = `Kata Nama Cocok (${term})`;
        }
      }
      // First word starts with term (e.g. "Adit" -> "Aditya", "Ain" -> "Ainun", "Nisa" -> "Khoirun Nisa")
      else if (firstWord.startsWith(term) && term.length >= 3) {
        score = 90;
        reason = `Awalan Nama (${firstWord})`;
      }
      // Any word in name starts with term (e.g. "Sarah" -> "Dwi Sarah", "Zahra" -> "Siti Zahra")
      else if (nameWords.some(w => w.startsWith(term) && term.length >= 3)) {
        score = 88;
        const matchedWord = nameWords.find(w => w.startsWith(term));
        reason = `Awalan Bagian Nama (${matchedWord})`;
      }
      // Any word in name contains term (e.g. "Nisa" in "Annisa" or "Khoirun Nisa")
      else if (nameWords.some(w => w.includes(term) && term.length >= 3)) {
        score = 84;
        reason = `Mengandung Kata (${term})`;
      }
      // Multi-word term matches start of student name (e.g. "Alin Putri" -> "Alin Putri Utami")
      else if (sName.startsWith(term)) {
        score = 93;
        reason = `Awalan Nama Lengkap`;
      }
      // Multi-word term matches subset of name words
      else if (termWords.length > 1 && termWords.every(tw => nameWords.some(nw => nw.includes(tw)))) {
        score = 89;
        reason = `Kombinasi Suku Kata Cocok`;
      }
      // Substring match on full name
      else if (sName.includes(term) && term.length >= 4) {
        score = 78;
        reason = `Bagian Nama Cocok`;
      }
      // Typo tolerance: Levenshtein distance on first word (e.g. "Jihan" vs "Jian", "Keisha" vs "Keizha")
      else if (term.length >= 4) {
        const distFirst = levenshteinDistance(term, firstWord);
        if (distFirst <= 1) {
          score = 82;
          reason = `Mirip Nama Depan (${firstWord})`;
        } else if (distFirst <= 2 && term.length >= 6) {
          score = 72;
          reason = `Toleransi Ejaan (${firstWord})`;
        } else {
          // Check Levenshtein on any word
          let minWordDist = 99;
          let bestW = '';
          for (const w of nameWords) {
            const d = levenshteinDistance(term, w);
            if (d < minWordDist) {
              minWordDist = d;
              bestW = w;
            }
          }
          if (minWordDist <= 1) {
            score = 76;
            reason = `Mirip Kata (${bestW})`;
          }
        }
      }
    }

    // Class Filter Bonus: If admin selected a specific class and student is in that class, give a priority boost
    if (score > 0 && classFilter && classFilter !== 'Semua') {
      const cleanFilter = classFilter.replace(/^Kelas\s+/i, '').trim().toLowerCase();
      const cleanSClass = sClass.replace(/^Kelas\s+/i, '').trim().toLowerCase();
      if (cleanSClass.includes(cleanFilter) || cleanFilter.includes(cleanSClass)) {
        score += 8;
        reason += ` • Sesuai Kelas (${sClass})`;
      }
    }

    if (score >= 65) {
      scoredStudents.push({ student: s, score, reason });
    }
  }

  // Sort descending by match score
  scoredStudents.sort((a, b) => b.score - a.score);

  if (scoredStudents.length > 0) {
    const top = scoredStudents[0];
    const candidates = scoredStudents.slice(0, 5).map(s => s.student);
    return {
      matched: top.score >= 70 ? top.student : null,
      score: top.score,
      reason: top.reason,
      candidates,
    };
  }

  return { matched: null, score: 0, reason: 'Tidak ditemukan', candidates: [] };
}

/**
 * Extracts attendance status and notes from a raw line of text.
 * Handles formats like:
 * - "Aditya - Sakit (demam tinggi)"
 * - "Bagas : Izin"
 * - "Citra (Alfa)"
 * - "Dedi Hadir"
 * - "Erlin - S"
 * - "Farhan - I (acara keluarga)"
 * - "Gita - A"
 */
export function extractStatusAndNameFromLine(line: string): {
  cleanName: string;
  detectedStatus: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa' | null;
  detectedKeterangan: string;
} {
  let text = line.trim();
  // Strip leading list numbering like "1. ", "2) ", "- ", "* ", "• "
  text = text.replace(/^[\d]+[\.\)\-]\s*/, '').replace(/^[\-\*\•]\s*/, '').trim();

  let detectedStatus: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa' | null = null;
  let detectedKeterangan = '';
  let cleanName = text;

  // Status Regexes with priority
  // 1. Sakit
  const sakitRegex = /[\-:\(\[\s]+(sakit|sick)\b[\)\]\s]*(.*)$/i;
  // 2. Izin / Ijin
  const izinRegex = /[\-:\(\[\s]+(izin|ijin|permit)\b[\)\]\s]*(.*)$/i;
  // 3. Alfa / Alpa / Alpha / Bolos
  const alfaRegex = /[\-:\(\[\s]+(alfa|alpa|alpha|bolos|absen|tanpa\s*keterangan)\b[\)\]\s]*(.*)$/i;
  // 4. Terlambat / Telat
  const terlambatRegex = /[\-:\(\[\s]+(terlambat|telat|late)\b[\)\]\s]*(.*)$/i;
  // 5. Hadir / Masuk
  const hadirRegex = /[\-:\(\[\s]+(hadir|masuk|ada|present)\b[\)\]\s]*(.*)$/i;
  // 6. Single Letter Codes with separator: "- s", ": s", "(s)", "[s]", "- i", "- a", "- h", "- t"
  const singleCodeRegex = /[\-:\(\[\s]+([sSiIaAhHtT])\b[\)\]\s]*(.*)$/;

  if (sakitRegex.test(text)) {
    const match = text.match(sakitRegex);
    if (match) {
      detectedStatus = 'Sakit';
      const extra = (match[2] || '').replace(/[\(\)\[\]\-:]/g, '').trim();
      detectedKeterangan = extra ? `Sakit: ${extra}` : 'Keterangan: Sakit';
      cleanName = text.substring(0, match.index).trim();
    }
  } else if (izinRegex.test(text)) {
    const match = text.match(izinRegex);
    if (match) {
      detectedStatus = 'Izin';
      const extra = (match[2] || '').replace(/[\(\)\[\]\-:]/g, '').trim();
      detectedKeterangan = extra ? `Izin: ${extra}` : 'Keterangan: Izin';
      cleanName = text.substring(0, match.index).trim();
    }
  } else if (alfaRegex.test(text)) {
    const match = text.match(alfaRegex);
    if (match) {
      detectedStatus = 'Alpa';
      const extra = (match[2] || '').replace(/[\(\)\[\]\-:]/g, '').trim();
      detectedKeterangan = extra ? `Alfa: ${extra}` : 'Keterangan: Alfa (Tanpa Keterangan)';
      cleanName = text.substring(0, match.index).trim();
    }
  } else if (terlambatRegex.test(text)) {
    const match = text.match(terlambatRegex);
    if (match) {
      detectedStatus = 'Terlambat';
      const extra = (match[2] || '').replace(/[\(\)\[\]\-:]/g, '').trim();
      detectedKeterangan = extra ? `Terlambat: ${extra}` : 'Presensi Terlambat';
      cleanName = text.substring(0, match.index).trim();
    }
  } else if (hadirRegex.test(text)) {
    const match = text.match(hadirRegex);
    if (match) {
      detectedStatus = 'Hadir';
      const extra = (match[2] || '').replace(/[\(\)\[\]\-:]/g, '').trim();
      detectedKeterangan = extra ? `Hadir: ${extra}` : 'Hadir Tepat Waktu';
      cleanName = text.substring(0, match.index).trim();
    }
  } else if (singleCodeRegex.test(text)) {
    const match = text.match(singleCodeRegex);
    if (match) {
      const code = match[1].toUpperCase();
      const extra = (match[2] || '').replace(/[\(\)\[\]\-:]/g, '').trim();
      if (code === 'S') {
        detectedStatus = 'Sakit';
        detectedKeterangan = extra ? `Sakit: ${extra}` : 'Keterangan: Sakit';
      } else if (code === 'I') {
        detectedStatus = 'Izin';
        detectedKeterangan = extra ? `Izin: ${extra}` : 'Keterangan: Izin';
      } else if (code === 'A') {
        detectedStatus = 'Alpa';
        detectedKeterangan = extra ? `Alfa: ${extra}` : 'Keterangan: Alfa (Tanpa Keterangan)';
      } else if (code === 'T') {
        detectedStatus = 'Terlambat';
        detectedKeterangan = extra ? `Terlambat: ${extra}` : 'Presensi Terlambat';
      } else if (code === 'H') {
        detectedStatus = 'Hadir';
        detectedKeterangan = extra ? `Hadir: ${extra}` : 'Hadir Tepat Waktu';
      }
      cleanName = text.substring(0, match.index).trim();
    }
  }

  // Cleanup cleanName: strip trailing dashes or colons
  cleanName = cleanName.replace(/[\-:,]+$/, '').trim();

  return {
    cleanName: cleanName || text,
    detectedStatus,
    detectedKeterangan,
  };
}

/**
 * Parses multi-line or comma-separated student attendance text into structured, matched entries.
 */
export function parseAttendanceInputText(
  rawText: string,
  defaultStatus: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa',
  studentPool: User[],
  classFilter?: string
): ParsedAttendanceEntry[] {
  if (!rawText || !rawText.trim()) return [];

  // Split by newlines first
  const rawLines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // If there's only 1 line, check if comma or semicolon separated
  const linesToProcess: string[] = [];
  for (const line of rawLines) {
    if (line.includes(',') && !line.includes('(')) {
      const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
      linesToProcess.push(...parts);
    } else if (line.includes(';') && !line.includes('(')) {
      const parts = line.split(';').map(p => p.trim()).filter(p => p.length > 0);
      linesToProcess.push(...parts);
    } else {
      linesToProcess.push(line);
    }
  }

  const results: ParsedAttendanceEntry[] = [];

  for (let index = 0; index < linesToProcess.length; index++) {
    const rawLine = linesToProcess[index];
    const { cleanName, detectedStatus, detectedKeterangan } = extractStatusAndNameFromLine(rawLine);

    const matchResult = findBestStudentMatch(cleanName, studentPool, classFilter);

    const resolvedStatus = detectedStatus || defaultStatus;
    const resolvedKeterangan = detectedKeterangan || (
      resolvedStatus === 'Hadir' ? 'Hadir Tepat Waktu' :
      resolvedStatus === 'Terlambat' ? 'Presensi Terlambat' :
      resolvedStatus === 'Alpa' ? 'Keterangan: Alfa (Tanpa Keterangan)' :
      `Keterangan: ${resolvedStatus}`
    );

    results.push({
      id: `entry-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      rawLine,
      rawName: cleanName,
      detectedStatus,
      detectedKeterangan,
      matchedStudent: matchResult.matched,
      matchScore: matchResult.score,
      matchReason: matchResult.reason,
      allCandidates: matchResult.candidates,
      resolvedStatus,
      resolvedKeterangan,
    });
  }

  return results;
}
