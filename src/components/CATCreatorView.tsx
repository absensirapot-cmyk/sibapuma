import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PaketUjian, User, HasilUjian, SchoolInfo, Kelas, Mapel, SoalPG, SoalIsian } from '../types';
import { TemplatePromptModal } from './TemplatePromptModal';
import { getMatchingClassesForMapel } from '../utils/academicHelpers';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  FileText, 
  FileCheck,
  CheckCircle2, 
  Clock, 
  Key, 
  Users, 
  Sparkles, 
  Search, 
  Download, 
  Award, 
  ShieldCheck, 
  AlertCircle,
  HelpCircle,
  BarChart3,
  Layers,
  Check,
  Edit3,
  RefreshCw,
  Upload
} from 'lucide-react';
import { EditUjianModal } from './EditUjianModal';
import { UploadSoalModal } from './UploadSoalModal';
import { RefineQuestionAIModal } from './RefineQuestionAIModal';
import { QuestionStimulusView, compressQuestionImageFile } from './QuestionStimulusView';
import { requestAIGenerateQuestions } from '../services/aiService';
import { extractTextFromFile, parseExamQuestionsFromText } from '../utils/fileExamParser';
import { parseAikenUjian } from '../utils/parserAiken';

interface CATCreatorViewProps {
  currentUser: User;
  ujianList: PaketUjian[];
  kelasList: Kelas[];
  mapelList: Mapel[];
  hasilList: HasilUjian[];
  onSaveUjian: (ujian: PaketUjian) => void;
  onDeleteUjian: (id: string) => void;
  schoolInfo?: SchoolInfo;
}

export const CATCreatorView: React.FC<CATCreatorViewProps> = ({
  currentUser,
  ujianList,
  kelasList,
  mapelList,
  hasilList,
  onSaveUjian,
  onDeleteUjian,
  schoolInfo,
}) => {
  const [activeTab, setActiveTab] = useState<'daftar' | 'buat' | 'hasil'>('daftar');
  const [selectedExamForEdit, setSelectedExamForEdit] = useState<PaketUjian | null>(null);
  const [examToDelete, setExamToDelete] = useState<PaketUjian | null>(null);

  // Filter exams based on role (Guru sees exams they made or their subjects, Admin sees all)
  const accessibleExams = currentUser.role === 'admin' 
    ? ujianList 
    : ujianList.filter(u => u.idGuru === currentUser.id || currentUser.mapelDiampu?.includes(u.idMapel));

  // Helper to identify teacher's subject
  const isTeacherMapel = (m: Mapel): boolean => {
    if (currentUser.role === 'admin') return true;
    if (currentUser.mapelDiampu && currentUser.mapelDiampu.length > 0) {
      return currentUser.mapelDiampu.some(val => {
        if (!val) return false;
        const v = val.toLowerCase().trim();
        return (
          m.id.toLowerCase() === v ||
          m.kode.toLowerCase() === v ||
          m.namaMapel.toLowerCase() === v ||
          m.namaMapel.toLowerCase().includes(v) ||
          v.includes(m.namaMapel.toLowerCase()) ||
          (v.includes('jasmani') && m.namaMapel.toLowerCase().includes('jasmani')) ||
          (v.includes('pjok') && (m.kode.toLowerCase().includes('pjok') || m.namaMapel.toLowerCase().includes('jasmani'))) ||
          (v.includes('agama') && (m.kode.toLowerCase().includes('pai') || m.namaMapel.toLowerCase().includes('agama'))) ||
          (v.includes('farmasi') && m.namaMapel.toLowerCase().includes('farmasi')) ||
          (v.includes('keperawatan') && m.namaMapel.toLowerCase().includes('keperawatan')) ||
          (v.includes('kecantikan') && m.namaMapel.toLowerCase().includes('kecantikan')) ||
          (v.includes('perhotelan') && m.namaMapel.toLowerCase().includes('perhotelan'))
        );
      });
    }
    const nameLower = (currentUser.nama + ' ' + (currentUser.username || '')).toLowerCase();
    if ((nameLower.includes('pika') || nameLower.includes('penjas') || nameLower.includes('pjok')) && m.namaMapel.toLowerCase().includes('jasmani')) {
      return true;
    }
    if (currentUser.jurusan && currentUser.jurusan !== 'Umum') {
      if (m.jurusan.toLowerCase().includes(currentUser.jurusan.toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  const teacherMapel = useMemo(() => {
    if (currentUser.role === 'admin') return mapelList;
    const filtered = mapelList.filter(isTeacherMapel);
    return filtered.length > 0 ? filtered : mapelList;
  }, [currentUser, mapelList]);

  // Form State for creating exam
  const [formJudul, setFormJudul] = useState('');
  const [formJenis, setFormJenis] = useState<'UJIAN_AKHIR' | 'UJIAN_TENGAH_SEMESTER'>('UJIAN_AKHIR');
  const [formMapelId, setFormMapelId] = useState<string>(() => {
    return teacherMapel[0]?.id || mapelList[0]?.id || 'm-f1';
  });
  const [formTargetKelas, setFormTargetKelas] = useState<string[]>([]);
  const [formDurasi, setFormDurasi] = useState(90);
  const [formToken, setFormToken] = useState(Math.random().toString(36).substring(2, 8).toUpperCase());
  const [aikenText, setAikenText] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [soalList, setSoalList] = useState<SoalPG[]>([]);
  const [soalIsianList, setSoalIsianList] = useState<SoalIsian[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiProgressText, setAiProgressText] = useState('');
  const [aiCountPG, setAiCountPG] = useState(30);
  const [aiTopicNote, setAiTopicNote] = useState('');
  const [aiModeHots, setAiModeHots] = useState(true);
  const [aiVisualTypes, setAiVisualTypes] = useState<('chart' | 'table' | 'svg' | 'case')[]>(['chart', 'table', 'svg', 'case']);
  const [manualImageUrl, setManualImageUrl] = useState('');

  // Draft Question Inline Edit & AI Refine State (Langkah 3)
  const [aiRefineTarget, setAiRefineTarget] = useState<{
    type: 'pg' | 'isian';
    index: number;
    item: SoalPG | SoalIsian;
  } | null>(null);
  const [editingDraftPgId, setEditingDraftPgId] = useState<string | null>(null);
  const [draftEditPgPertanyaan, setDraftEditPgPertanyaan] = useState('');
  const [draftEditPgOpsi, setDraftEditPgOpsi] = useState({ a: '', b: '', c: '', d: '', e: '' });
  const [draftEditPgKunci, setDraftEditPgKunci] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');
  const [editingDraftIsianId, setEditingDraftIsianId] = useState<string | null>(null);
  const [draftEditIsianPertanyaan, setDraftEditIsianPertanyaan] = useState('');
  const [draftEditIsianKunci, setDraftEditIsianKunci] = useState('');

  const handleApplyDraftRefinedAI = (refinedQuestion: SoalPG | SoalIsian, type: 'pg' | 'isian', index: number) => {
    if (type === 'pg') {
      const refined = refinedQuestion as SoalPG;
      setSoalList(prev => prev.map((item, idx) => (idx === index ? refined : item)));
      if (editingDraftPgId === refined.id) {
        setDraftEditPgPertanyaan(refined.pertanyaan || '');
        setDraftEditPgOpsi({
          a: refined.opsi?.a || '',
          b: refined.opsi?.b || '',
          c: refined.opsi?.c || '',
          d: refined.opsi?.d || '',
          e: refined.opsi?.e || '',
        });
        setDraftEditPgKunci(refined.kunci || 'A');
      }
    } else {
      const refined = refinedQuestion as SoalIsian;
      setSoalIsianList(prev => prev.map((item, idx) => (idx === index ? refined : item)));
      if (editingDraftIsianId === refined.id) {
        setDraftEditIsianPertanyaan(refined.pertanyaan || '');
        setDraftEditIsianKunci(refined.kunci || refined.kunciJawaban || '');
      }
    }
    setFormNotice({
      type: 'success',
      message: `✨ Soal ${type === 'pg' ? 'PG' : 'Isian'} #${index + 1} berhasil disempurnakan dengan AI!`,
    });
    setAiRefineTarget(null);
  };

  const toggleAiVisualType = (v: 'chart' | 'table' | 'svg' | 'case') => {
    setAiVisualTypes(prev => (prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]));
  };

  // New streamlined method state
  const [questionInputMethod, setQuestionInputMethod] = useState<'upload' | 'ai' | 'manual'>('upload');
  const [manualSubMode, setManualSubMode] = useState<'single' | 'paste'>('single');
  const [inlineFileProcessing, setInlineFileProcessing] = useState(false);
  const [inlineProcessingStatus, setInlineProcessingStatus] = useState('');
  const inlineFileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadWordTemplate = () => {
    const docContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Template Naskah Soal Ujian SMK Bakti Putra Mandiri</title>
<style>
body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; margin: 2cm; }
h3 { text-align: center; margin: 0; }
.header { border-bottom: 2px solid black; padding-bottom: 8px; margin-bottom: 16px; text-align: center; }
.section-title { font-weight: bold; margin-top: 14pt; margin-bottom: 6pt; }
p { margin: 4pt 0; }
</style>
</head>
<body>
<div class="header">
<h3>SMK BAKTI PUTRA MANDIRI</h3>
<p>PENILAIAN SUMATIF AKHIR SEMESTER (PAS) TAHUN AJARAN 2026/2027</p>
<p>Mata Pelajaran: ${selectedMapelObj?.namaMapel || 'Kompetensi Kejuruan'} | Alokasi Waktu: ${formDurasi} Menit</p>
</div>

<div class="section-title">A. SOAL PILIHAN GANDA</div>

<p>1. Seorang pasien anak usia 5 tahun dengan berat badan 20 kg memerlukan resep amoksisilin 40 mg/kgBB/hari terbagi dalam 3 dosis. Jika sediaan yang tersedia adalah sirup kering 250 mg/5 mL, berapa mL sirup yang harus diminum pasien per satu kali pemberian?</p>
<p>A. 2,3 mL</p>
<p>B. 3,5 mL</p>
<p>C. 5,3 mL</p>
<p>D. 7,0 mL</p>
<p>E. 10,6 mL</p>
<p>Kunci: C</p>
<p>Pembahasan: Dosis harian = 40 mg x 20 kg = 800 mg. Dosis sekali = 800 / 3 = 266,7 mg. Volume = (266,7 / 250) x 5 mL = 5,3 mL.</p>

<p>2. Resep dokter spesialis kulit tertulis: "R/ Acid Salicyl 2%, Sulfur Praecip 4%, Vaselin ad 50 gram". Berapa bobot Vaselin yang harus ditimbang oleh asisten farmasi?</p>
<p>A. 2 gram</p>
<p>B. 4 gram</p>
<p>C. 44 gram</p>
<p>D. 47 gram</p>
<p>E. 50 gram</p>
<p>Kunci: C</p>
<p>Pembahasan: Pengurangan bobot total sediaan dengan zat aktif.</p>

<p>3. Standar posisi tidur semi-fowler untuk pasien yang mengalami sesak napas di ruang rawat inap adalah kemiringan...</p>
<p>A. 15 - 30 derajat</p>
<p>B. 30 - 45 derajat</p>
<p>C. 60 - 90 derajat</p>
<p>D. 90 - 120 derajat</p>
<p>E. 0 derajat terlentang</p>
<p>Kunci: B</p>
<p>Pembahasan: Posisi semi-fowler menggunakan sudut 30 - 45 derajat untuk memaksimalkan ekspansi paru.</p>

<div class="section-title">B. SOAL ISIAN SINGKAT</div>

<p>1. Singkatan latin "s.d.d" pada etiket aturan pakai resep dokter memiliki arti...</p>
<p>Kunci: Sehari dua kali (semel de die)</p>

<p>2. Tiga jenis pemeriksaan tanda-tanda vital (TTV) primer pada pasien adalah...</p>
<p>Kunci: Tekanan darah, denyut nadi, dan suhu tubuh</p>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Template_Soal_SMK_Bakti_Putra_Mandiri.doc';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleProcessInlineFile = async (selectedFile: File) => {
    setInlineFileProcessing(true);
    setInlineProcessingStatus(`Membaca dokumen ${selectedFile.name}...`);
    setFormNotice(null);
    try {
      const { text } = await extractTextFromFile(selectedFile);
      if (!text || !text.trim()) {
        throw new Error('Dokumen kosong atau tidak memiliki teks yang terbaca.');
      }
      setInlineProcessingStatus('Memetakan butir soal, opsi A-E, dan kunci jawaban...');
      const parsed = parseExamQuestionsFromText(text);
      if (parsed.soalPG.length === 0 && parsed.soalIsian.length === 0) {
        throw new Error('Tidak ditemukan butir soal yang valid. Pastikan dokumen memuat nomor soal (misal: "1. ") dan opsi (misal: "A. ").');
      }
      handleImportFromDoc(parsed.soalPG, parsed.soalIsian, parsed.detectedTitle);
    } catch (err: any) {
      setFormNotice({ type: 'error', message: err?.message || 'Gagal memproses berkas soal.' });
    } finally {
      setInlineFileProcessing(false);
      setInlineProcessingStatus('');
    }
  };

  const handleImportFromDoc = (importedPG: SoalPG[], importedIsian: SoalIsian[], detectedTitle?: string) => {
    if (importedPG.length > 0) {
      setSoalList(prev => [...prev, ...importedPG.map((s, idx) => ({ ...s, nomor: prev.length + idx + 1 }))]);
    }
    if (importedIsian.length > 0) {
      setSoalIsianList(prev => [...prev, ...importedIsian.map((s, idx) => ({ ...s, nomor: prev.length + idx + 1 }))]);
    }
    if (detectedTitle && !formJudul.trim()) {
      setFormJudul(detectedTitle);
    } else if (!formJudul.trim() && selectedMapelObj?.namaMapel) {
      setFormJudul(`Ujian - ${selectedMapelObj.namaMapel}`);
    }
    setActiveTab('buat');
    setFormNotice({
      type: 'success',
      message: `Berhasil memuat ${importedPG.length} soal Pilihan Ganda${importedIsian.length > 0 ? ` dan ${importedIsian.length} soal Isian` : ''} ke Langkah 3 di bawah!`
    });
  };

  const handleGenerateAikenAI = async () => {
    setIsGeneratingAI(true);
    setAiProgressText('Menyusun soal HOTS lengkap dengan grafik, tabel, dan ilustrasi...');
    setFormNotice(null);

    try {
      const res = await requestAIGenerateQuestions({
        namaGuru: currentUser.nama,
        namaMapel: selectedMapelObj?.namaMapel || 'Mata Pelajaran',
        lingkupMateri: aiTopicNote.trim() || formJudul || selectedMapelObj?.namaMapel || 'Kompetensi Kejuruan',
        bab: 'Kompetensi Inti & Terapan',
        targetKelas: formTargetKelas.length > 0 ? formTargetKelas : matchingClassesForExam.map(k => k.namaKelas),
        jenisUjian: formJenis,
        token: formToken,
        waktuUjian: `${formDurasi} Menit`,
        jumlahPG: aiCountPG,
        jumlahIsian: 5,
        instruksiTambahan: aiTopicNote.trim(),
        modeHots: aiModeHots,
        includeVisuals: aiVisualTypes.length > 0,
        visualTypes: aiVisualTypes,
        onProgress: (msg) => setAiProgressText(msg),
      });

      if (!res.success || (!res.soalPG && !res.text)) {
        setFormNotice({ type: 'error', message: res.error || 'Gagal membuat soal otomatis dari AI.' });
        return;
      }

      let addedPG: SoalPG[] = [];
      let addedIsian: SoalIsian[] = [];

      if (res.soalPG && res.soalPG.length > 0) {
        addedPG = res.soalPG;
        addedIsian = res.soalIsian || [];
      } else if (res.text) {
        const parsedAI = parseAikenUjian(res.text);
        addedPG = parsedAI.soalPG;
        addedIsian = parsedAI.soalIsian;
      }

      if (addedPG.length > 0) {
        setSoalList(prev => [
          ...prev,
          ...addedPG.map((s, idx) => ({ ...s, id: s.id || `pg-ai-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
        ]);
      }
      if (addedIsian.length > 0) {
        setSoalIsianList(prev => [
          ...prev,
          ...addedIsian.map((s, idx) => ({ ...s, id: s.id || `isian-ai-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
        ]);
      }

      const visualCount =
        addedPG.filter(s => Boolean(s.stimulus)).length + addedIsian.filter(s => Boolean(s.stimulus)).length;

      setFormNotice({
        type: 'success',
        message: `Berhasil! ${addedPG.length} soal PG dan ${addedIsian.length} soal Isian (${visualCount} soal bergrafik/tabel/ilustrasi/kasus) sudah masuk ke Langkah 3 di bawah.`
      });
    } catch (err: any) {
      setFormNotice({ type: 'error', message: err?.message || 'Terjadi kesalahan saat menghubungi layanan AI.' });
    } finally {
      setIsGeneratingAI(false);
      setAiProgressText('');
    }
  };

  // Selected mapel object
  const selectedMapelObj = useMemo(() => {
    return mapelList.find(m => m.id === formMapelId) || teacherMapel[0] || mapelList[0];
  }, [mapelList, formMapelId, teacherMapel]);

  // Target classes dynamically matching the selected subject
  const matchingClassesForExam = useMemo(() => {
    return getMatchingClassesForMapel(selectedMapelObj, kelasList);
  }, [selectedMapelObj, kelasList]);

  // Synchronize formMapelId whenever teacherMapel changes
  useEffect(() => {
    if (teacherMapel.length > 0) {
      const exists = mapelList.some(m => m.id === formMapelId);
      if (!exists || (currentUser.role === 'guru' && !teacherMapel.some(m => m.id === formMapelId))) {
        setFormMapelId(teacherMapel[0].id);
      }
    }
  }, [currentUser, teacherMapel, formMapelId]);

  // Auto-initialize formTargetKelas to match the subject when switching mapel if empty
  useEffect(() => {
    if (formTargetKelas.length === 0 && matchingClassesForExam.length > 0) {
      setFormTargetKelas(matchingClassesForExam.map(k => k.namaKelas));
    }
  }, [matchingClassesForExam]);

  // Single question builder
  const [currentPertanyaan, setCurrentPertanyaan] = useState('');
  const [currentOpsiA, setCurrentOpsiA] = useState('');
  const [currentOpsiB, setCurrentOpsiB] = useState('');
  const [currentOpsiC, setCurrentOpsiC] = useState('');
  const [currentOpsiD, setCurrentOpsiD] = useState('');
  const [currentOpsiE, setCurrentOpsiE] = useState('');
  const [currentKunci, setCurrentKunci] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');
  const [currentPembahasan, setCurrentPembahasan] = useState('');

  // Results search & filter
  const [searchHasilQuery, setSearchHasilQuery] = useState('');
  const [filterHasilKelas, setFilterHasilKelas] = useState('Semua');

  // Toggle class selection for target
  const handleToggleKelas = (namaKelas: string) => {
    if (formTargetKelas.includes(namaKelas)) {
      setFormTargetKelas(formTargetKelas.filter(k => k !== namaKelas));
    } else {
      setFormTargetKelas([...formTargetKelas, namaKelas]);
    }
  };

  // Add individual question to draft
  const handleAddQuestion = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentPertanyaan.trim() || !currentOpsiA.trim() || !currentOpsiB.trim()) {
      setFormNotice({ type: 'error', message: 'Isi pertanyaan serta minimal Pilihan A dan Pilihan B terlebih dahulu.' });
      return;
    }

    const newSoal: SoalPG = {
      id: `soal-${Date.now()}-${soalList.length + 1}`,
      nomor: soalList.length + 1,
      pertanyaan: currentPertanyaan.trim(),
      opsi: {
        a: currentOpsiA.trim(),
        b: currentOpsiB.trim(),
        c: currentOpsiC.trim() || '-',
        d: currentOpsiD.trim() || '-',
        e: currentOpsiE.trim() || '-',
      },
      kunci: currentKunci,
      pembahasan: currentPembahasan.trim(),
      ...(manualImageUrl ? { stimulus: { type: 'image', title: 'Gambar Pendukung Soal', imageUrl: manualImageUrl } } : {}),
    };

    setSoalList([...soalList, newSoal]);
    setCurrentPertanyaan('');
    setCurrentOpsiA('');
    setCurrentOpsiB('');
    setCurrentOpsiC('');
    setCurrentOpsiD('');
    setCurrentOpsiE('');
    setCurrentPembahasan('');
    setManualImageUrl('');
    setFormNotice({ type: 'success', message: `Soal nomor ${soalList.length + 1} berhasil ditambahkan ke daftar!` });
  };

  // Parse pasted text (supports numbered & Aiken formats)
  const handleParseAiken = () => {
    if (!aikenText.trim()) {
      setFormNotice({ type: 'error', message: 'Kotak teks masih kosong. Tempelkan teks soal Anda terlebih dahulu.' });
      return;
    }

    const parsedResult = parseAikenUjian(aikenText);
    if (parsedResult.soalPG.length > 0 || parsedResult.soalIsian.length > 0) {
      if (parsedResult.soalPG.length > 0) {
        setSoalList(prev => [
          ...prev,
          ...parsedResult.soalPG.map((s, idx) => ({ ...s, id: `paste-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
        ]);
      }
      if (parsedResult.soalIsian.length > 0) {
        setSoalIsianList(prev => [
          ...prev,
          ...parsedResult.soalIsian.map((s, idx) => ({ ...s, id: `paste-is-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
        ]);
      }
      setAikenText('');
      setFormNotice({
        type: 'success',
        message: `Berhasil memasukkan ${parsedResult.soalPG.length} soal PG${parsedResult.soalIsian.length > 0 ? ` dan ${parsedResult.soalIsian.length} soal Isian` : ''} ke daftar di bawah!`
      });
    } else {
      setFormNotice({
        type: 'error',
        message: 'Teks soal belum terbaca. Pastikan setiap soal memiliki pilihan A. B. ... dan baris ANSWER: A atau Kunci: A.'
      });
    }
  };

  // Save new exam package
  const handleSaveExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (soalList.length === 0 && soalIsianList.length === 0) {
      setFormNotice({
        type: 'error',
        message: 'Belum ada soal yang dimasukkan. Pilih salah satu cara di Langkah 2 (Upload File, AI, atau Ketik Manual) terlebih dahulu.'
      });
      return;
    }

    const selectedMapel = mapelList.find(m => m.id === formMapelId) || mapelList[0];
    const finalJudul = formJudul.trim() || `${formJenis === 'UJIAN_AKHIR' ? 'PAS/PAT' : 'PTS'} ${selectedMapel.namaMapel}`;

    const newExam: PaketUjian = {
      id: `ujian-${Date.now()}`,
      namaUjian: finalJudul,
      judul: finalJudul,
      jenisUjian: formJenis,
      idGuru: currentUser.id,
      namaGuru: currentUser.nama,
      idMapel: selectedMapel.id,
      kodeMapel: selectedMapel.kode,
      namaMapel: selectedMapel.namaMapel,
      targetKelas: formTargetKelas.length > 0 ? formTargetKelas : matchingClassesForExam.map(k => k.namaKelas),
      hariTanggal: new Date().toISOString().split('T')[0],
      jamMulai: '08:00',
      durasiMenit: Number(formDurasi) || 90,
      token: formToken.toUpperCase() || 'UJIAN1',
      tokenUjian: formToken.toUpperCase() || 'UJIAN1',
      statusDokumen: 'READY',
      soalPG: soalList.map((s, idx) => ({ ...s, nomor: idx + 1 })),
      soalIsian: soalIsianList.map((s, idx) => ({ ...s, nomor: idx + 1 })),
      passingGrade: 75,
      createdAt: new Date().toISOString(),
    };

    onSaveUjian(newExam);
    setNotification(`Paket Ujian "${newExam.namaUjian}" berhasil dibuat dan siap diujikan dengan Token: ${newExam.tokenUjian}!`);
    setTimeout(() => setNotification(null), 5000);
    
    setFormJudul('');
    setSoalList([]);
    setSoalIsianList([]);
    setFormNotice(null);
    setFormToken(Math.random().toString(36).substring(2, 8).toUpperCase());
    setActiveTab('daftar');
  };

  const filteredHasil = hasilList.filter(h => {
    const matchClass = filterHasilKelas === 'Semua' || h.namaKelas === filterHasilKelas;
    const matchSearch = !searchHasilQuery || 
      h.namaSiswa.toLowerCase().includes(searchHasilQuery.toLowerCase()) ||
      h.nisn.toLowerCase().includes(searchHasilQuery.toLowerCase());
    return matchClass && matchSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner - Clarifying Creator vs Examinee */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>Mode Pembuat Soal & Pengawas CAT ({currentUser.role.toUpperCase()})</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Pusat Pembuatan & Manajemen Bank Soal CAT
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Sebagai tenaga pendidik dan pengelola sistem ({currentUser.nama}), Anda bertindak sebagai <strong>Pembuat Naskah Soal & Pengawas Ujian</strong>. Peserta didik akan mengerjakan ujian dengan token yang Anda tentukan di bawah ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-lg hover:shadow-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload File Soal (Word / PDF)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('buat');
              setFormToken(Math.random().toString(36).substring(2, 8).toUpperCase());
            }}
            className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm border border-slate-700 shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Paket Manual</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center gap-3 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{accessibleExams.length}</div>
            <div className="text-xs text-slate-500 font-medium">Paket Ujian Aktif</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {accessibleExams.reduce((sum, u) => sum + (u.soalPG?.length || 0) + (u.soalIsian?.length || 0), 0)}
            </div>
            <div className="text-xs text-slate-500 font-medium">Total Butir Soal Terbit</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{hasilList.length}</div>
            <div className="text-xs text-slate-500 font-medium">Hasil Pengerjaan Siswa</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => setActiveTab('daftar')}
          className={`min-h-[44px] sm:min-h-0 px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center sm:justify-start text-center sm:text-left leading-tight gap-1.5 sm:gap-2 transition-all cursor-pointer ${
            activeTab === 'daftar'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>Bank Soal ({accessibleExams.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('buat')}
          className={`min-h-[44px] sm:min-h-0 px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center sm:justify-start text-center sm:text-left leading-tight gap-1.5 sm:gap-2 transition-all cursor-pointer ${
            activeTab === 'buat'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Buat Ujian Baru</span>
        </button>

        <button
          onClick={() => setActiveTab('hasil')}
          className={`min-h-[44px] sm:min-h-0 px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center sm:justify-start text-center sm:text-left leading-tight gap-1.5 sm:gap-2 transition-all cursor-pointer ${
            activeTab === 'hasil'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>Hasil Nilai ({hasilList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="min-h-[44px] sm:min-h-0 sm:ml-auto px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center text-center leading-tight gap-1.5 sm:gap-2 transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer"
        >
          <Upload className="w-4 h-4 shrink-0" />
          <span>Upload Word / PDF</span>
        </button>
      </div>

      {/* TAB 1: DAFTAR PAKET UJIAN */}
      {activeTab === 'daftar' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          {/* Quick Action Banner for Uploading Questions */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl p-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold">
                <FileText className="w-3.5 h-3.5 text-emerald-200" />
                <span>Fitur Cepat & Praktis Dewan Guru</span>
              </div>
              <h3 className="text-base font-bold text-white">
                Punya Naskah Soal di Microsoft Word (.docx) atau PDF (.pdf)?
              </h3>
              <p className="text-xs text-emerald-100 max-w-2xl leading-relaxed">
                Bapak/Ibu guru tidak perlu mengetik butir soal satu per satu. Cukup upload berkas naskah soal Word atau PDF Anda, sistem akan secara otomatis membaca nomor soal, pilihan A-E, dan kunci jawaban langsung siap diujikan!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-emerald-600" />
              <span>Upload File Soal Sekarang</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Bank Paket Ujian CBT Sekolah</h2>
              <p className="text-xs text-slate-500">
                Kelola naskah soal, jadwal durasi pengerjaan, dan token rahasia untuk peserta ujian
              </p>
            </div>
            <button
              onClick={() => setActiveTab('buat')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Paket Ujian</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {accessibleExams.map(ujian => {
              const soalCount = (ujian.soalPG?.length || 0) + (ujian.soalIsian?.length || 0);
              return (
                <div
                  key={ujian.id}
                  className="bg-slate-50 hover:bg-white rounded-2xl p-5 border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                        {ujian.jenisUjian === 'UJIAN_TENGAH_SEMESTER' ? 'PTS (Tengah Semester)' : 'PAS (Akhir Semester)'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                        Token: {ujian.tokenUjian}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {ujian.namaUjian || ujian.judul}
                    </h3>
                    <p className="text-xs font-medium text-emerald-700">
                      {ujian.namaMapel || ujian.kodeMapel}
                    </p>

                    <div className="text-[11px] text-slate-500 space-y-1 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Durasi: {ujian.durasiMenit} Menit</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <span>{soalCount} Soal ({ujian.soalPG?.length || 0} PG, {ujian.soalIsian?.length || 0} Isian)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Target: {ujian.targetKelas?.join(', ') || 'Semua Kelas'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Guru Pengampu: {ujian.namaGuru}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedExamForEdit(ujian)}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 border border-indigo-200 shadow-2xs"
                      title="Edit Jadwal & Butir Soal"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Soal & Jadwal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExamToDelete(ujian)}
                      className="px-2.5 py-1.5 rounded-xl text-rose-600 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/70 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Hapus Paket Ujian"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {accessibleExams.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <BookOpen className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-sm text-slate-600">Belum ada paket ujian yang dibuat</p>
                <p className="text-xs text-slate-400 mt-1">Klik "Buat Paket Ujian Baru" untuk mulai menyusun naskah soal.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BUAT PAKET UJIAN BARU (ALUR 3 LANGKAH SEDERHANA) */}
      {activeTab === 'buat' && (
        <form onSubmit={handleSaveExam} className="space-y-5">
          {/* LANGKAH 1: INFO DASAR UJIAN */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">1</span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">Info Dasar Ujian</h2>
                <p className="text-[11px] text-slate-500">Isi judul ujian, pilih mata pelajaran, kelas peserta, dan kode masuk.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Judul Ujian <span className="font-normal text-slate-400">(opsional, otomatis dibuat jika kosong)</span>
                </label>
                <input
                  type="text"
                  value={formJudul}
                  onChange={(e) => setFormJudul(e.target.value)}
                  placeholder={`Contoh: PAS ${selectedMapelObj?.namaMapel || 'Mata Pelajaran'}`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mata Pelajaran</label>
                <select
                  value={formMapelId}
                  onChange={(e) => setFormMapelId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-medium focus:outline-none focus:border-emerald-500 bg-white"
                >
                  {currentUser.role === 'guru' && teacherMapel.length > 0 && (
                    <optgroup label="Mata Pelajaran Anda">
                      {teacherMapel.map(m => (
                        <option key={`my-${m.id}`} value={m.id}>{m.namaMapel}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Semua Mata Pelajaran">
                    {mapelList.map(m => (
                      <option key={m.id} value={m.id}>{m.namaMapel}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Jenis Ujian</label>
                <select
                  value={formJenis}
                  onChange={(e) => setFormJenis(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-medium focus:outline-none focus:border-emerald-500 bg-white"
                >
                  <option value="UJIAN_TENGAH_SEMESTER">PTS / Ulangan Harian</option>
                  <option value="UJIAN_AKHIR">PAS / PAT / Ujian Akhir</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Durasi (Menit)</label>
                <input
                  type="number"
                  value={formDurasi}
                  onChange={(e) => setFormDurasi(Number(e.target.value))}
                  min={10}
                  max={240}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-emerald-900">Kode Token Siswa</label>
                  <button
                    type="button"
                    onClick={() => setFormToken(Math.random().toString(36).substring(2, 8).toUpperCase())}
                    className="text-[11px] text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    Acak Kode
                  </button>
                </div>
                <input
                  type="text"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50/50 font-mono font-black text-center text-emerald-800 tracking-widest uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Target Kelas Selection */}
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="font-bold text-slate-700">
                  Kelas yang Ikut Ujian ({formTargetKelas.length} dipilih):
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTargetKelas(matchingClassesForExam.map(k => k.namaKelas))}
                    className="text-[11px] text-emerald-600 hover:underline font-bold cursor-pointer"
                  >
                    Pilih Semua
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setFormTargetKelas([])}
                    className="text-[11px] text-slate-500 hover:underline font-medium cursor-pointer"
                  >
                    Hapus Semua
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {matchingClassesForExam.map(k => {
                  const isSelected = formTargetKelas.includes(k.namaKelas);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => handleToggleKelas(k.namaKelas)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg font-bold transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {k.namaKelas}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* LANGKAH 2: PILIH 1 CARA MEMASUKKAN SOAL */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">2</span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">Masukkan Soal (Pilih Salah Satu Cara)</h2>
                <p className="text-[11px] text-slate-500">Pilih cara yang paling nyaman — soal langsung tampil di Langkah 3 untuk dicek.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setQuestionInputMethod('upload')}
                className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                  questionInputMethod === 'upload'
                    ? 'border-emerald-600 bg-emerald-50/80 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${questionInputMethod === 'upload' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border border-slate-200'}`}>
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-900">1. Upload File Soal</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">Unggah Word (.docx) atau PDF, langsung terbaca otomatis.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setQuestionInputMethod('ai')}
                className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                  questionInputMethod === 'ai'
                    ? 'border-indigo-600 bg-indigo-50/80 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${questionInputMethod === 'ai' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-slate-200'}`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-900">2. Buat Otomatis AI</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">Pilih jumlah & topik, AI langsung membuatkan soal + kunci.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setQuestionInputMethod('manual')}
                className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                  questionInputMethod === 'manual'
                    ? 'border-blue-600 bg-blue-50/80 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 ${questionInputMethod === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-slate-200'}`}>
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-slate-900">3. Ketik / Tempel Teks</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">Tulis satu per satu atau copy-paste teks soal yang sudah ada.</div>
                </div>
              </button>
            </div>

            {formNotice && (
              <div className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2 ${
                formNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}>
                {formNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                <span>{formNotice.message}</span>
              </div>
            )}

            {/* CARA 1: UPLOAD WORD / PDF */}
            {questionInputMethod === 'upload' && (
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-emerald-950">Unggah File Word (.docx) atau PDF (.pdf)</h3>
                  <p className="text-xs text-emerald-800 leading-relaxed max-w-xl">
                    Tidak perlu mengetik satu per satu. Pilih file soal di HP atau komputer Anda, nomor soal dan kunci jawabannya otomatis terbaca.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Pilih File Word / PDF</span>
                </button>
              </div>
            )}

            {/* CARA 2: BUAT OTOMATIS AI */}
            {questionInputMethod === 'ai' && (
              <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">Jumlah Soal PG:</label>
                    <select
                      value={aiCountPG}
                      onChange={(e) => setAiCountPG(Number(e.target.value))}
                      disabled={isGeneratingAI}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-indigo-200 font-bold text-slate-800"
                    >
                      <option value={5}>5 Soal PG + 1 Isian (Uji Cepat)</option>
                      <option value={10}>10 Soal PG + 2 Isian</option>
                      <option value={20}>20 Soal PG + 3 Isian</option>
                      <option value={30}>30 Soal PG + 5 Isian (PTS)</option>
                      <option value={40}>40 Soal PG + 5 Isian (PAS)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-800 mb-1">
                      Topik / Materi Soal <span className="font-normal text-slate-500">(opsional)</span>:
                    </label>
                    <input
                      type="text"
                      value={aiTopicNote}
                      onChange={(e) => setAiTopicNote(e.target.value)}
                      disabled={isGeneratingAI}
                      placeholder="Misal: Bab 2 tentang interaksi obat & dosis anak"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-indigo-200"
                    />
                  </div>
                </div>

                {/* Pengaturan HOTS & Stimulus Visual */}
                <div className="bg-white/90 rounded-xl p-3.5 border border-indigo-200/80 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">Kualitas & Tampilan Soal AI:</span>
                    <button
                      type="button"
                      onClick={() => setAiModeHots(v => !v)}
                      disabled={isGeneratingAI}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        aiModeHots
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {aiModeHots ? '✓ Soal HOTS Aktif (Analisa C4–C6)' : 'Mode Soal Standar'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-600 font-semibold mr-1">Sertakan Stimulus:</span>
                    {[
                      { id: 'chart' as const, label: 'Grafik Data' },
                      { id: 'table' as const, label: 'Tabel Pengamatan' },
                      { id: 'svg' as const, label: 'Ilustrasi / Diagram' },
                      { id: 'case' as const, label: 'Studi Kasus' },
                    ].map(opt => {
                      const active = aiVisualTypes.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={isGeneratingAI}
                          onClick={() => toggleAiVisualType(opt.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {active ? '✓ ' : '+ '}{opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-indigo-200/60">
                  <button
                    type="button"
                    onClick={() => setShowPromptModal(true)}
                    className="text-xs font-bold text-indigo-700 hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Atau salin perintah untuk ChatGPT luar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateAikenAI}
                    disabled={isGeneratingAI}
                    className="min-h-[46px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className={`w-4 h-4 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingAI ? (aiProgressText || 'Sedang Membuat Soal...') : 'Buatkan Soal Otomatis Sekarang'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* CARA 3: KETIK MANUAL / TEMPEL TEKS */}
            {questionInputMethod === 'manual' && (
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  <button
                    type="button"
                    onClick={() => setManualSubMode('single')}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      manualSubMode === 'single'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Ketik 1 per 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualSubMode('paste')}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      manualSubMode === 'paste'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tempel Teks Sekaligus
                  </button>
                </div>

                {manualSubMode === 'single' ? (
                  <div className="space-y-3 text-xs bg-white p-4 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Pertanyaan (Soal #{soalList.length + 1}):
                      </label>
                      <textarea
                        value={currentPertanyaan}
                        onChange={(e) => setCurrentPertanyaan(e.target.value)}
                        placeholder="Tuliskan pertanyaan di sini..."
                        rows={2}
                        className="w-full p-3 rounded-xl border border-slate-300 font-medium focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={currentOpsiA}
                        onChange={(e) => setCurrentOpsiA(e.target.value)}
                        placeholder="Pilihan A (wajib)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <input
                        type="text"
                        value={currentOpsiB}
                        onChange={(e) => setCurrentOpsiB(e.target.value)}
                        placeholder="Pilihan B (wajib)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <input
                        type="text"
                        value={currentOpsiC}
                        onChange={(e) => setCurrentOpsiC(e.target.value)}
                        placeholder="Pilihan C"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <input
                        type="text"
                        value={currentOpsiD}
                        onChange={(e) => setCurrentOpsiD(e.target.value)}
                        placeholder="Pilihan D"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                      <input
                        type="text"
                        value={currentOpsiE}
                        onChange={(e) => setCurrentOpsiE(e.target.value)}
                        placeholder="Pilihan E (opsional)"
                        className="sm:col-span-2 w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-200 cursor-pointer">
                        <span>{manualImageUrl ? 'Ganti Gambar Soal' : '+ Lampirkan Gambar (Opsional)'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            try {
                              const img = await compressQuestionImageFile(f);
                              setManualImageUrl(img);
                            } catch {
                              setFormNotice({ type: 'error', message: 'Gagal membaca file gambar.' });
                            }
                          }}
                        />
                      </label>
                      {manualImageUrl && (
                        <>
                          <img src={manualImageUrl} alt="Preview gambar soal" className="h-12 rounded-lg border border-slate-200 object-contain" />
                          <button
                            type="button"
                            onClick={() => setManualImageUrl('')}
                            className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            Hapus Gambar
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-700">Jawaban Benar:</span>
                        {(['A', 'B', 'C', 'D', 'E'] as const).map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setCurrentKunci(opt)}
                            className={`w-9 h-9 rounded-xl font-black text-xs border transition-all cursor-pointer ${
                              currentKunci === opt
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddQuestion()}
                        className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Tambah Soal ke Daftar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <p className="text-slate-600 leading-relaxed">
                      Tempelkan banyak soal sekaligus sesuai contoh singkat di bawah, lalu klik <strong>Masukkan Soal</strong>.
                    </p>
                    <textarea
                      value={aikenText}
                      onChange={(e) => setAikenText(e.target.value)}
                      placeholder={`Contoh:\n\n1. Apa fungsi utama dari resep dokter?\nA. Catatan keuangan pasien\nB. Instruksi tertulis dari dokter kepada apoteker\nC. Surat izin masuk rumah sakit\nD. Dokumen garansi obat\nE. Kartu asuransi\nANSWER: B`}
                      rows={7}
                      className="w-full p-3.5 rounded-xl border border-slate-300 text-xs font-mono bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleParseAiken}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Masukkan Soal dari Teks</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LANGKAH 3: PERIKSA DAFTAR SOAL & SIMPAN */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0">3</span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Periksa Daftar Soal ({soalList.length} PG{soalIsianList.length > 0 ? `, ${soalIsianList.length} Isian` : ''})
                  </h2>
                  <p className="text-[11px] text-slate-500">Pastikan soal dan kunci jawaban sudah benar sebelum diterbitkan.</p>
                </div>
              </div>

              {(soalList.length > 0 || soalIsianList.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSoalList([]);
                    setSoalIsianList([]);
                  }}
                  className="text-xs text-rose-600 hover:underline font-bold self-start sm:self-center cursor-pointer"
                >
                  Kosongkan Semua Soal
                </button>
              )}
            </div>

            {soalList.length === 0 && soalIsianList.length === 0 ? (
              <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-1">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">Belum ada soal yang masuk</p>
                <p className="text-[11px] text-slate-400">Pilih salah satu cara di Langkah 2 di atas untuk memasukkan soal.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {soalList.map((s, idx) => {
                  const isEditingThis = editingDraftPgId === s.id;
                  if (isEditingThis) {
                    return (
                      <div key={s.id} className="p-4 rounded-xl bg-indigo-50/70 border-2 border-indigo-400 space-y-3 text-xs">
                        <div className="flex items-center justify-between gap-2 border-b border-indigo-200 pb-2">
                          <span className="font-extrabold text-indigo-950">Edit Soal PG #{idx + 1}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setAiRefineTarget({ type: 'pg', index: idx, item: s })}
                              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Edit dgn AI</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDraftPgId(null)}
                              className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={3}
                          value={draftEditPgPertanyaan}
                          onChange={(e) => setDraftEditPgPertanyaan(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(['a', 'b', 'c', 'd', 'e'] as const).map(optKey => (
                            <input
                              key={optKey}
                              type="text"
                              value={draftEditPgOpsi[optKey]}
                              onChange={(e) => setDraftEditPgOpsi(prev => ({ ...prev, [optKey]: e.target.value }))}
                              placeholder={`Opsi ${optKey.toUpperCase()}`}
                              className={`px-3 py-1.5 rounded-lg border border-slate-300 bg-white ${optKey === 'e' ? 'sm:col-span-2' : ''}`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-700">Kunci:</span>
                            {(['A', 'B', 'C', 'D', 'E'] as const).map(k => (
                              <button
                                key={k}
                                type="button"
                                onClick={() => setDraftEditPgKunci(k)}
                                className={`w-7 h-7 rounded-lg font-bold text-[11px] cursor-pointer ${
                                  draftEditPgKunci === k ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-700'
                                }`}
                              >
                                {k}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!draftEditPgPertanyaan.trim()) return;
                              setSoalList(prev => prev.map((item, i) => i === idx ? {
                                ...item,
                                pertanyaan: draftEditPgPertanyaan.trim(),
                                opsi: {
                                  a: draftEditPgOpsi.a.trim() || '-',
                                  b: draftEditPgOpsi.b.trim() || '-',
                                  c: draftEditPgOpsi.c.trim() || '-',
                                  d: draftEditPgOpsi.d.trim() || '-',
                                  e: draftEditPgOpsi.e.trim() || '-',
                                },
                                kunci: draftEditPgKunci,
                              } : item));
                              setEditingDraftPgId(null);
                            }}
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                          >
                            Simpan Soal #{idx + 1}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div key={s.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        {s.levelKognitif && (
                          <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                            HOTS {s.levelKognitif}
                          </span>
                        )}
                        <div className="font-bold text-slate-900 leading-relaxed">
                          <span className="text-emerald-700 mr-1.5">{idx + 1}.</span>
                          {s.pertanyaan}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAiRefineTarget({ type: 'pg', index: idx, item: s })}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="Edit atau tingkatkan soal ini dengan AI"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Edit AI</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDraftPgId(s.id);
                            setDraftEditPgPertanyaan(s.pertanyaan || '');
                            setDraftEditPgOpsi({
                              a: s.opsi?.a || '',
                              b: s.opsi?.b || '',
                              c: s.opsi?.c || '',
                              d: s.opsi?.d || '',
                              e: s.opsi?.e || '',
                            });
                            setDraftEditPgKunci(s.kunci || 'A');
                          }}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="Edit manual soal ini"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSoalList(soalList.filter((_, i) => i !== idx).map((item, n) => ({ ...item, nomor: n + 1 })))}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg shrink-0 cursor-pointer"
                          title="Hapus soal ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {s.stimulus && <QuestionStimulusView stimulus={s.stimulus} compact />}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-600 pl-4">
                      {(['a', 'b', 'c', 'd', 'e'] as const).map(k => {
                        const label = k.toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
                        const text = s.opsi[k];
                        if (!text || text === '-') return null;
                        const isKey = s.kunci === label;
                        return (
                          <div key={k} className={isKey ? 'font-bold text-emerald-700' : ''}>
                            {label}. {text} {isKey && '✓'}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5 pt-1 pl-4 flex-wrap">
                      <span className="text-[11px] text-slate-500 font-semibold mr-1">Ubah Kunci:</span>
                      {(['A', 'B', 'C', 'D', 'E'] as const).map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSoalList(prev => prev.map((item, i) => i === idx ? { ...item, kunci: opt } : item))}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            s.kunci === opt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
                })}

                {soalIsianList.map((si, idx) => {
                  const isEditingIsian = editingDraftIsianId === si.id;
                  if (isEditingIsian) {
                    return (
                      <div key={si.id} className="p-3.5 rounded-xl bg-amber-50/90 border-2 border-amber-400 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-amber-950">Edit Soal Isian #{idx + 1}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setAiRefineTarget({ type: 'isian', index: idx, item: si })}
                              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Edit dgn AI</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDraftIsianId(null)}
                              className="px-2 py-1 text-[11px] font-bold text-slate-600 cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={2}
                          value={draftEditIsianPertanyaan}
                          onChange={(e) => setDraftEditIsianPertanyaan(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={draftEditIsianKunci}
                            onChange={(e) => setDraftEditIsianKunci(e.target.value)}
                            placeholder="Kunci jawaban..."
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!draftEditIsianPertanyaan.trim()) return;
                              setSoalIsianList(prev => prev.map((item, i) => i === idx ? {
                                ...item,
                                pertanyaan: draftEditIsianPertanyaan.trim(),
                                kunci: draftEditIsianKunci.trim() || '-',
                                kunciJawaban: draftEditIsianKunci.trim() || '-',
                              } : item));
                              setEditingDraftIsianId(null);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer"
                          >
                            Simpan
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div key={si.id} className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200 flex items-start justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                          Soal Isian #{idx + 1}
                        </span>
                        {si.levelKognitif && (
                          <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                            HOTS {si.levelKognitif}
                          </span>
                        )}
                      </div>
                      {si.stimulus && <QuestionStimulusView stimulus={si.stimulus} compact />}
                      <div className="font-bold text-slate-900">{si.pertanyaan}</div>
                      {si.kunci && si.kunci !== '-' && (
                        <div className="text-[11px] text-emerald-700 mt-0.5">Kunci: {si.kunci}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAiRefineTarget({ type: 'isian', index: idx, item: si })}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="Edit atau tingkatkan soal isian ini dengan AI"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Edit AI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDraftIsianId(si.id);
                          setDraftEditIsianPertanyaan(si.pertanyaan || '');
                          setDraftEditIsianKunci(si.kunci || si.kunciJawaban || '');
                        }}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-slate-700 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="Edit manual soal isian"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSoalIsianList(prev => prev.filter((_, i) => i !== idx).map((item, n) => ({ ...item, nomor: n + 1 })))}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
                })}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('daftar')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan & Terbitkan Ujian</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: MONITORING HASIL NILAI SISWA */}
      {activeTab === 'hasil' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Rekap Nilai Siswa Hasil CBT Online</h2>
              <p className="text-xs text-slate-500">
                Data real-time siswa yang telah menyelesaikan paket ujian CAT CBT
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchHasilQuery}
                  onChange={(e) => setSearchHasilQuery(e.target.value)}
                  placeholder="Cari siswa / NISN..."
                  className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={filterHasilKelas}
                onChange={(e) => setFilterHasilKelas(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white"
              >
                <option value="Semua">Semua Rombel</option>
                {kelasList.map(k => (
                  <option key={k.id} value={k.namaKelas}>{k.namaKelas}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-3 px-4 w-10 text-center">No</th>
                  <th className="py-3 px-4">Nama Siswa</th>
                  <th className="py-3 px-3">NISN</th>
                  <th className="py-3 px-4">Kelas / Rombel</th>
                  <th className="py-3 px-4">Mata Pelajaran</th>
                  <th className="py-3 px-3 text-center">Nilai PG</th>
                  <th className="py-3 px-3 text-center">Nilai Isian</th>
                  <th className="py-3 px-3 text-center font-bold text-slate-900 bg-slate-100">Total Skor</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4">Waktu Selesai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredHasil.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{item.namaSiswa}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{item.nisn}</td>
                    <td className="py-3 px-4 text-slate-700">{item.namaKelas}</td>
                    <td className="py-3 px-4 text-slate-700">{item.namaMapel || '-'}</td>
                    <td className="py-3 px-3 text-center font-bold text-blue-700">{item.nilaiPG}</td>
                    <td className="py-3 px-3 text-center font-bold text-purple-700">{item.nilaiIsian}</td>
                    <td className="py-3 px-3 text-center font-black text-sm bg-slate-50 text-emerald-700">
                      {item.totalNilai}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.statusLulus 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {item.statusLulus ? 'LULUS' : 'REMIDIAL'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{item.waktuSelesai}</td>
                  </tr>
                ))}

                {filteredHasil.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      Belum ada catatan hasil ujian siswa yang terekam.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Template Prompt AI Modal */}
      <TemplatePromptModal
        isOpen={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        namaGuru={currentUser.nama}
        namaMapel={mapelList.find(m => m.id === formMapelId)?.namaMapel || teacherMapel[0]?.namaMapel || 'Mata Pelajaran'}
        lingkupMateri={formJudul}
        targetKelas={formTargetKelas}
        jenisUjian={formJenis}
        durasi={formDurasi}
        token={formToken}
        onApplySampleAiken={(sampleText) => {
          setAikenText(sampleText);
          setNotification('Contoh soal standar Aiken berhasil dimasukkan! Silakan klik "Proses Teks Aiken".');
        }}
      />

      {/* Edit Ujian & Soal Modal */}
      {selectedExamForEdit && (
        <EditUjianModal
          ujian={selectedExamForEdit}
          currentUser={currentUser}
          kelasList={kelasList}
          mapelList={mapelList}
          onSave={(updated) => {
            onSaveUjian(updated);
            setSelectedExamForEdit(null);
            setNotification(`Paket Ujian "${updated.namaUjian}" berhasil diperbarui!`);
            setTimeout(() => setNotification(null), 5000);
          }}
          onClose={() => setSelectedExamForEdit(null)}
        />
      )}

      {/* Upload Soal Berkas Word / PDF / Teks Modal */}
      <UploadSoalModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onImportQuestions={handleImportFromDoc}
        currentPGCount={soalList.length}
        currentIsianCount={soalIsianList.length}
      />

      {/* Modal Edit Butir Soal Draft dengan AI */}
      <RefineQuestionAIModal
        target={aiRefineTarget}
        namaMapel={selectedMapelObj?.namaMapel || 'Mata Pelajaran Kejuruan'}
        onClose={() => setAiRefineTarget(null)}
        onApply={handleApplyDraftRefinedAI}
      />

      {/* Konfirmasi Hapus Paket Ujian (In-App Modal) */}
      {examToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Hapus Paket Ujian?</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Paket ujian <strong>"{examToDelete.namaUjian || examToDelete.judul}"</strong> akan dihapus permanen.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExamToDelete(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = examToDelete;
                  setExamToDelete(null);
                  onDeleteUjian(target.id);
                  setNotification(`Paket ujian "${target.namaUjian || target.judul}" berhasil dihapus.`);
                  setTimeout(() => setNotification(null), 4000);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Ya, Hapus Ujian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
