import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PaketUjian, User, Kelas, Mapel, HasilUjian, SoalPG, SoalIsian, SchoolInfo, AbsensiRecord, NilaiMapelSiswa, Ekskul, NilaiEkskulSiswa, JadwalPelajaran, AbsenMengajarRecord } from '../types';
import { parseAikenUjian, exportToAikenText, generateTeacherPrompt, TEMPLATE_PROMPT_GURU_PAS, TEMPLATE_PROMPT_GURU_PTS } from '../utils/parserAiken';
import { copyTextToClipboard } from '../utils/clipboard';
import { getMatchingClassesForMapel, canAccessNilaiEkskul, isUserAdmin, isUserWalas, getPembinaAssignedEkskuls, isUserPembina } from '../utils/academicHelpers';
import { TemplatePromptModal } from './TemplatePromptModal';
import { LegerMapelView } from './LegerMapelView';
import { AbsensiBarcodeView } from './AbsensiBarcodeView';
import { NilaiEkskulView } from './NilaiEkskulView';
import { AbsenMengajarView } from './AbsenMengajarView';
import { EditUjianModal } from './EditUjianModal';
import { UploadSoalModal } from './UploadSoalModal';
import { RefineQuestionAIModal } from './RefineQuestionAIModal';
import { GreetingBanner } from './GreetingBanner';
import { KopSuratView } from './KopSuratView';
import { QuestionStimulusView, compressQuestionImageFile } from './QuestionStimulusView';
import { requestAIGenerateQuestions } from '../services/aiService';
import { printDocumentArea, PAPER_SIZE_DIMENSIONS, MARGIN_VALUES } from '../utils/printHelper';
import { 
  FileText, 
  Clock, 
  Key, 
  Printer, 
  Upload, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Calendar, 
  Users, 
  BarChart3, 
  HelpCircle,
  Eye,
  Trash2,
  RefreshCw,
  Sparkles,
  BookOpen,
  Bookmark,
  Scan,
  UserCheck,
  Camera,
  Edit3,
  Award
} from 'lucide-react';

interface GuruDashboardViewProps {
  currentUser: User;
  ujianList: PaketUjian[];
  kelasList: Kelas[];
  mapelList: Mapel[];
  hasilList: HasilUjian[];
  schoolInfo?: SchoolInfo;
  usersList?: User[];
  absensiList?: AbsensiRecord[];
  nilaiList?: NilaiMapelSiswa[];
  ekskulList?: Ekskul[];
  nilaiEkskulList?: NilaiEkskulSiswa[];
  jadwalPelajaranList?: JadwalPelajaran[];
  absenMengajarList?: AbsenMengajarRecord[];
  onSaveNilaiEkskul?: (list: NilaiEkskulSiswa[]) => void;
  onSaveUjian: (ujian: PaketUjian) => void;
  onDeleteUjian: (ujianId: string) => void;
  onAddAbsensi?: (record: AbsensiRecord) => void;
  onBatchAddAbsensi?: (records: AbsensiRecord[]) => void;
  onUpdateAbsensi?: (record: AbsensiRecord) => void;
  onDeleteAbsensi?: (id: string) => void;
  onSaveNilaiList?: (newNilaiList: NilaiMapelSiswa[]) => void;
  onSaveAbsenMengajar?: (record: AbsenMengajarRecord) => void;
  onDeleteAbsenMengajar?: (id: string) => void;
  onUpdateProfile?: (user: User) => void;
  onPullAllFromCloud?: () => Promise<any>;
}

export const GuruDashboardView: React.FC<GuruDashboardViewProps> = ({
  currentUser,
  ujianList,
  kelasList,
  mapelList,
  hasilList,
  schoolInfo,
  usersList = [],
  absensiList = [],
  nilaiList = [],
  ekskulList = [],
  nilaiEkskulList = [],
  jadwalPelajaranList = [],
  absenMengajarList = [],
  onSaveNilaiEkskul = () => {},
  onSaveUjian,
  onDeleteUjian,
  onAddAbsensi = () => {},
  onBatchAddAbsensi,
  onUpdateAbsensi = () => {},
  onDeleteAbsensi = () => {},
  onSaveNilaiList = () => {},
  onSaveAbsenMengajar = () => {},
  onDeleteAbsenMengajar = () => {},
  onUpdateProfile = () => {},
  onPullAllFromCloud,
}) => {
  // Filter only exams created by this teacher or in their subject area
  const teacherExams = ujianList.filter(u => 
    u.idGuru === currentUser.id || 
    (currentUser.mapelDiampu && currentUser.mapelDiampu.includes(u.idMapel)) ||
    currentUser.role === 'admin'
  );

  const isSuperAdmin = isUserAdmin(currentUser);
  const isWalas = isUserWalas(currentUser, kelasList);

  // Pembina Ekskul identification & Access Control (Hanya Pembina, Walas, dan Admin)
  const pembinaEkskuls = getPembinaAssignedEkskuls(currentUser, ekskulList);
  const isPembina = isUserPembina(currentUser, ekskulList);
  const canAccessEkskul = canAccessNilaiEkskul(currentUser, ekskulList, kelasList);

  const isPurePembina = currentUser.role === 'pembina_ekskul' || (isPembina && (!currentUser.mapelDiampu || currentUser.mapelDiampu.length === 0) && !isWalas);
  const [activeTab, setActiveTab] = useState<'jurnal' | 'daftar' | 'buat' | 'cetak' | 'nilai' | 'leger' | 'absensi' | 'ekskul' | 'profil'>(
    isPurePembina ? 'ekskul' : 'jurnal'
  );
  
  const [selectedExamForPrint, setSelectedExamForPrint] = useState<PaketUjian | null>(teacherExams[0] || null);
  const [printPaperSize, setPrintPaperSize] = useState<'A4' | 'F4' | 'Legal' | 'Letter'>('A4');
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [printMargin, setPrintMargin] = useState<'minimal' | 'sempit' | 'normal'>('sempit');
  const [printColumns, setPrintColumns] = useState<1 | 2>(1);
  const [printFontSize, setPrintFontSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [showKopSekolah, setShowKopSekolah] = useState<boolean>(true);
  const [showIdentitasSiswa, setShowIdentitasSiswa] = useState<boolean>(true);
  const [showKunciJawaban, setShowKunciJawaban] = useState<boolean>(true);
  const [isPrintingExam, setIsPrintingExam] = useState<boolean>(false);
  const printableExamRef = useRef<HTMLDivElement>(null);

  const activeExamForPrint = useMemo(() => {
    if (selectedExamForPrint) {
      return teacherExams.find(e => e.id === selectedExamForPrint.id) || selectedExamForPrint;
    }
    return teacherExams[0] || null;
  }, [selectedExamForPrint, teacherExams]);

  const [selectedExamForEdit, setSelectedExamForEdit] = useState<PaketUjian | null>(null);
  const [examToDelete, setExamToDelete] = useState<PaketUjian | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Profile Edit State
  const [guruNama, setGuruNama] = useState(currentUser.nama);
  const [guruGelar, setGuruGelar] = useState(currentUser.gelar || '');
  const [guruTelepon, setGuruTelepon] = useState(currentUser.telepon || '');
  const [guruEmail, setGuruEmail] = useState(currentUser.email || '');
  const [guruPassword, setGuruPassword] = useState(currentUser.password || 'guru123');
  const [guruFoto, setGuruFoto] = useState(currentUser.fotoProfilUrl || '');
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);

  const handleSaveGuruProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: User = {
      ...currentUser,
      nama: guruNama,
      gelar: guruGelar,
      telepon: guruTelepon,
      email: guruEmail,
      password: guruPassword,
      fotoProfilUrl: guruFoto,
    };
    onUpdateProfile(updated);
    setProfileSavedMsg(true);
    setTimeout(() => setProfileSavedMsg(false), 3000);
  };

  const handleGuruPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGuruFoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to determine whether a mapel matches the teacher's taught subjects
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
    // Match if teacher's username or name indicates subject (e.g. 'pika' -> jasmani)
    const nameLower = (currentUser.nama + ' ' + (currentUser.username || '')).toLowerCase();
    if ((nameLower.includes('pika') || nameLower.includes('penjas') || nameLower.includes('pjok')) && m.namaMapel.toLowerCase().includes('jasmani')) {
      return true;
    }
    // Match by jurusan if applicable
    if (currentUser.jurusan && currentUser.jurusan !== 'Umum') {
      if (m.jurusan.toLowerCase().includes(currentUser.jurusan.toLowerCase())) {
        return true;
      }
    }
    return false;
  };

  // Filtered Mapel that this teacher teaches (fallback to all mapel if none matched)
  const teacherMapel = useMemo(() => {
    if (currentUser.role === 'admin') return mapelList;
    const filtered = mapelList.filter(isTeacherMapel);
    return filtered.length > 0 ? filtered : mapelList;
  }, [currentUser, mapelList]);

  // Helper to dynamically get default topics & matched classes based on the teacher's subject
  const getDefaultTopicsForMapel = (mapel?: Mapel) => {
    const matched = getMatchingClassesForMapel(mapel, kelasList);
    const defaultClasses = matched.map(k => k.namaKelas);
    if (!mapel) {
      return {
        lingkupMateri: 'Kompetensi Terapan Kejuruan & HOTS',
        bab: 'Bab 1: Analisis Kasus & Penerapan Keterampilan',
        targetKelas: defaultClasses.length > 0 ? defaultClasses : ['X Kesehatan'],
      };
    }
    const name = mapel.namaMapel.toLowerCase();
    if (name.includes('jasmani') || name.includes('pjok') || name.includes('olahraga')) {
      return {
        lingkupMateri: 'Kebugaran Jasmani, Keterampilan Gerak & Pola Hidup Sehat',
        bab: 'Bab 1: Analisis Kebugaran Jasmani & Keterampilan Gerak Cabang Olahraga',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('agama') || name.includes('pai')) {
      return {
        lingkupMateri: 'Akidah Akhlak, Fikih Ibadah & Muamalah Kontemporer',
        bab: 'Bab 1: Menjaga Martabat Manusia dengan Menjauhi Pergaulan Bebas dan Zina',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('pancasila') || name.includes('ppkn')) {
      return {
        lingkupMateri: 'Harmonisasi Hak dan Kewajiban Warga Negara dalam Konstitusi',
        bab: 'Bab 1: Nilai-Nilai Pancasila dalam Praktik Penyelenggaraan Pemerintahan',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('indonesia')) {
      return {
        lingkupMateri: 'Teks Laporan Hasil Observasi & Teks Prosedur Kompleks',
        bab: 'Bab 1: Menganalisis Struktur & Kaidah Kebahasaan Teks LHO',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('inggris')) {
      return {
        lingkupMateri: 'Analytical Exposition, Formal Invitation & Job Interview Conversation',
        bab: 'Chapter 1: Writing Application Letters and Handling Professional Inquiries',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('matematika')) {
      return {
        lingkupMateri: 'Eksponen, Barisan & Deret Aritmatika serta Statistika Deskriptif',
        bab: 'Bab 1: Penyajian Data Distribusi Frekuensi & Ukuran Pemusatan Data',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('farma') || name.includes('resep') || name.includes('obat')) {
      return {
        lingkupMateri: 'Simulasi Klinis, Farmakoterapi Gangguan Sistem & Dispensing Resep',
        bab: 'Bab 3: Analisis Interaksi Obat & Dispensing Resep Klinis',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('perawat') || name.includes('kdm') || name.includes('anatomi')) {
      return {
        lingkupMateri: 'Kebutuhan Dasar Manusia (KDM) & Keterampilan Tindakan Keperawatan',
        bab: 'Bab 2: Prosedur Pengukuran Tanda-Tanda Vital (TTV) & Dokumentasi Asuhan',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('cantik') || name.includes('kulit') || name.includes('rambut') || name.includes('spa')) {
      return {
        lingkupMateri: 'Perawatan Kulit Wajah, Tata Rias Panggung & Terapi Spa Tradisional',
        bab: 'Bab 1: Analisis Morfologi Kulit Wajah & Prosedur Facial Treatment',
        targetKelas: defaultClasses,
      };
    }
    if (name.includes('hotel') || name.includes('front office') || name.includes('housekeeping')) {
      return {
        lingkupMateri: 'Front Office Reservation, Housekeeping Operasional & F&B Service',
        bab: 'Bab 2: Prosedur Check-In Tamu VIP & Manajemen Sanitasi Kamar Hotel',
        targetKelas: defaultClasses,
      };
    }
    return {
      lingkupMateri: `Materi Pokok & Capaian Pembelajaran ${mapel.namaMapel}`,
      bab: `Bab 1: Analisis Kasus & Penerapan Kompetensi ${mapel.namaMapel}`,
      targetKelas: defaultClasses,
    };
  };

  const activeDefaultMapel = teacherMapel[0] || mapelList[0];
  const initialTopics = getDefaultTopicsForMapel(activeDefaultMapel);

  // Form State for creating/editing Exam
  const [formNamaUjian, setFormNamaUjian] = useState('');
  const [formJenisUjian, setFormJenisUjian] = useState<'UJIAN_AKHIR' | 'UJIAN_TENGAH_SEMESTER'>('UJIAN_TENGAH_SEMESTER');
  const [formMapelId, setFormMapelId] = useState<string>(activeDefaultMapel?.id || '');
  const [formLingkupMateri, setFormLingkupMateri] = useState('');
  const [formBab, setFormBab] = useState('');
  const [formTargetKelas, setFormTargetKelas] = useState<string[]>(initialTopics.targetKelas);
  const [formHariTanggal, setFormHariTanggal] = useState('Senin, 21 September 2026');
  const [formJamMulai, setFormJamMulai] = useState('08:00 WIB');
  const [formDurasi, setFormDurasi] = useState(90);
  const [formToken, setFormToken] = useState('MED' + Math.floor(100 + Math.random() * 900));
  const [rawAikenText, setRawAikenText] = useState('');
  const [draftSoalPG, setDraftSoalPG] = useState<SoalPG[]>([]);
  const [draftSoalIsian, setDraftSoalIsian] = useState<SoalIsian[]>([]);
  const [buatMethod, setBuatMethod] = useState<'upload' | 'ai' | 'manual'>('upload');
  const [manualSubMode, setManualSubMode] = useState<'single' | 'paste'>('single');
  const [manualPertanyaan, setManualPertanyaan] = useState('');
  const [manualOpsiA, setManualOpsiA] = useState('');
  const [manualOpsiB, setManualOpsiB] = useState('');
  const [manualOpsiC, setManualOpsiC] = useState('');
  const [manualOpsiD, setManualOpsiD] = useState('');
  const [manualOpsiE, setManualOpsiE] = useState('');
  const [manualKunci, setManualKunci] = useState<'A' | 'B' | 'C' | 'D' | 'E'>('A');
  const [manualIsianTanya, setManualIsianTanya] = useState('');
  const [manualIsianKunci, setManualIsianKunci] = useState('');
  const [parseNotice, setParseNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Dynamic matching classes based on currently chosen mapel in Create Exam form
  const selectedFormMapel = useMemo(() => {
    return mapelList.find(m => m.id === formMapelId) || activeDefaultMapel;
  }, [mapelList, formMapelId, activeDefaultMapel]);

  const matchingTargetClasses = useMemo(() => {
    return getMatchingClassesForMapel(selectedFormMapel, kelasList);
  }, [selectedFormMapel, kelasList]);

  // Synchronize formMapelId whenever teacherMapel or currentUser changes
  useEffect(() => {
    if (teacherMapel.length > 0) {
      const exists = teacherMapel.some(m => m.id === formMapelId);
      if (!exists) {
        const nextMapel = teacherMapel[0];
        setFormMapelId(nextMapel.id);
        const nextTopics = getDefaultTopicsForMapel(nextMapel);
        setFormLingkupMateri('');
        setFormBab('');
        setFormTargetKelas(nextTopics.targetKelas);
      }
    }
  }, [currentUser, teacherMapel, formMapelId]);

  const handleGenerateRandomToken = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormToken(res);
  };

  // AI Direct Generation State
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiProgressText, setAiProgressText] = useState('');
  const [aiJumlahPG, setAiJumlahPG] = useState<number>(30);
  const [aiInstruksiTambahan, setAiInstruksiTambahan] = useState('');
  const [aiErrorMsg, setAiErrorMsg] = useState<string | null>(null);
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
      setDraftSoalPG(prev => prev.map((item, idx) => (idx === index ? refined : item)));
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
      setDraftSoalIsian(prev => prev.map((item, idx) => (idx === index ? refined : item)));
      if (editingDraftIsianId === refined.id) {
        setDraftEditIsianPertanyaan(refined.pertanyaan || '');
        setDraftEditIsianKunci(refined.kunci || refined.kunciJawaban || '');
      }
    }
    setParseNotice({
      type: 'success',
      message: `✨ Soal ${type === 'pg' ? 'PG' : 'Isian'} #${index + 1} berhasil disempurnakan dengan AI!`,
    });
    setAiRefineTarget(null);
  };

  const toggleAiVisualType = (v: 'chart' | 'table' | 'svg' | 'case') => {
    setAiVisualTypes(prev => (prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]));
  };

  // Keep aiJumlahPG synced with formJenisUjian by default
  useEffect(() => {
    setAiJumlahPG(formJenisUjian === 'UJIAN_AKHIR' ? 40 : 30);
  }, [formJenisUjian]);

  const handleGenerateQuestionsWithGemini = async () => {
    setIsGeneratingAI(true);
    setAiErrorMsg(null);
    setParseNotice(null);
    setAiProgressText('Menyusun soal HOTS lengkap dengan grafik, tabel, dan ilustrasi...');

    const selectedMapelObj = mapelList.find(m => m.id === formMapelId) || activeDefaultMapel;

    try {
      const res = await requestAIGenerateQuestions({
        namaGuru: currentUser.nama,
        namaMapel: selectedMapelObj?.namaMapel || 'Mata Pelajaran Kejuruan',
        lingkupMateri: formLingkupMateri,
        bab: formBab,
        targetKelas: formTargetKelas,
        jenisUjian: formJenisUjian,
        token: formToken,
        waktuUjian: `${formHariTanggal} | ${formJamMulai} | ${formDurasi} Menit`,
        jumlahPG: aiJumlahPG,
        jumlahIsian: 5,
        instruksiTambahan: aiInstruksiTambahan,
        modeHots: aiModeHots,
        includeVisuals: aiVisualTypes.length > 0,
        visualTypes: aiVisualTypes,
        onProgress: (msg) => setAiProgressText(msg),
      });

      if (!res.success || (!res.soalPG && !res.text)) {
        setAiErrorMsg(res.error || 'Gagal membuat soal otomatis. Silakan coba lagi.');
        return;
      }

      let addedPG: SoalPG[] = [];
      let addedIsian: SoalIsian[] = [];

      if (res.soalPG && res.soalPG.length > 0) {
        addedPG = res.soalPG;
        addedIsian = res.soalIsian || [];
      } else if (res.text) {
        const result = parseAikenUjian(res.text);
        if (result.metadata.token) setFormToken(result.metadata.token);
        if (result.metadata.lingkupMateri && !formLingkupMateri) setFormLingkupMateri(result.metadata.lingkupMateri);
        if (result.metadata.bab && !formBab) setFormBab(result.metadata.bab);
        addedPG = result.soalPG;
        addedIsian = result.soalIsian;
      }

      if (addedPG.length > 0) {
        setDraftSoalPG(prev => [
          ...prev,
          ...addedPG.map((s, idx) => ({ ...s, id: s.id || `pg-ai-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
        ]);
      }
      if (addedIsian.length > 0) {
        setDraftSoalIsian(prev => [
          ...prev,
          ...addedIsian.map((s, idx) => ({ ...s, id: s.id || `isian-ai-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
        ]);
      }

      const visualCount =
        addedPG.filter(s => Boolean(s.stimulus)).length + addedIsian.filter(s => Boolean(s.stimulus)).length;

      setParseNotice({
        type: 'success',
        message: `Berhasil! ${addedPG.length} soal PG dan ${addedIsian.length} soal Isian (${visualCount} soal bergrafik/tabel/ilustrasi/kasus) sudah masuk ke Langkah 3 di bawah.`
      });
    } catch (err: any) {
      setAiErrorMsg(err?.message || 'Terjadi kesalahan saat menghubungi layanan AI.');
    } finally {
      setIsGeneratingAI(false);
      setAiProgressText('');
    }
  };

  const handleAddSingleManualPG = () => {
    if (!manualPertanyaan.trim() || !manualOpsiA.trim() || !manualOpsiB.trim()) {
      setParseNotice({
        type: 'error',
        message: 'Isi pertanyaan serta minimal Pilihan A dan Pilihan B terlebih dahulu.'
      });
      return;
    }

    const newPG: SoalPG = {
      id: `pg-man-${Date.now()}`,
      nomor: draftSoalPG.length + 1,
      pertanyaan: manualPertanyaan.trim(),
      opsi: {
        a: manualOpsiA.trim(),
        b: manualOpsiB.trim(),
        c: manualOpsiC.trim() || '-',
        d: manualOpsiD.trim() || '-',
        e: manualOpsiE.trim() || '-',
      },
      kunci: manualKunci,
      ...(manualImageUrl ? { stimulus: { type: 'image', title: 'Gambar Pendukung Soal', imageUrl: manualImageUrl } } : {}),
    };

    setDraftSoalPG(prev => [...prev, newPG]);
    setManualPertanyaan('');
    setManualOpsiA('');
    setManualOpsiB('');
    setManualOpsiC('');
    setManualOpsiD('');
    setManualOpsiE('');
    setManualKunci('A');
    setManualImageUrl('');
    setParseNotice({
      type: 'success',
      message: `Soal nomor ${draftSoalPG.length + 1} berhasil ditambahkan ke daftar soal!`
    });
  };

  const handleAddSingleManualIsian = () => {
    if (!manualIsianTanya.trim()) {
      setParseNotice({ type: 'error', message: 'Tuliskan pertanyaan isian/esai terlebih dahulu.' });
      return;
    }
    const newIsian: SoalIsian = {
      id: `isian-man-${Date.now()}`,
      nomor: draftSoalIsian.length + 1,
      pertanyaan: manualIsianTanya.trim(),
      kunci: manualIsianKunci.trim() || '-',
      kunciJawaban: manualIsianKunci.trim() || '-',
    };
    setDraftSoalIsian(prev => [...prev, newIsian]);
    setManualIsianTanya('');
    setManualIsianKunci('');
    setParseNotice({
      type: 'success',
      message: `Soal isian nomor ${draftSoalIsian.length + 1} berhasil ditambahkan!`
    });
  };

  const handleParseAiken = () => {
    if (!rawAikenText.trim()) {
      setParseNotice({ type: 'error', message: 'Kotak teks masih kosong. Tempelkan soal Anda terlebih dahulu.' });
      return;
    }

    const result = parseAikenUjian(rawAikenText);

    if (result.metadata.token) setFormToken(result.metadata.token);
    if (result.metadata.lingkupMateri && !formLingkupMateri) setFormLingkupMateri(result.metadata.lingkupMateri);
    if (result.metadata.bab && !formBab) setFormBab(result.metadata.bab);
    if (result.metadata.sasaranKelas && result.metadata.sasaranKelas.length > 0) {
      setFormTargetKelas(result.metadata.sasaranKelas);
    }
    if (result.metadata.jenisUjian) setFormJenisUjian(result.metadata.jenisUjian);

    if (result.soalPG.length === 0 && result.soalIsian.length === 0) {
      setParseNotice({
        type: 'error',
        message: 'Teks soal belum terbaca. Pastikan setiap soal memiliki pilihan A. B. ... dan baris Kunci / ANSWER: A.'
      });
      return;
    }

    if (result.soalPG.length > 0) {
      setDraftSoalPG(prev => [
        ...prev,
        ...result.soalPG.map((s, idx) => ({ ...s, id: `pg-paste-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
      ]);
    }
    if (result.soalIsian.length > 0) {
      setDraftSoalIsian(prev => [
        ...prev,
        ...result.soalIsian.map((s, idx) => ({ ...s, id: `isian-paste-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
      ]);
    }
    setRawAikenText('');
    setParseNotice({
      type: 'success',
      message: `Berhasil memasukkan ${result.soalPG.length} soal Pilihan Ganda dan ${result.soalIsian.length} soal Isian ke daftar soal di bawah!`
    });
  };

  const handleImportFromUploadModal = (importedPG: SoalPG[], importedIsian: SoalIsian[], detectedTitle?: string) => {
    if (importedPG.length === 0 && importedIsian.length === 0) return;
    setDraftSoalPG(prev => [
      ...prev,
      ...importedPG.map((s, idx) => ({ ...s, nomor: prev.length + idx + 1 })),
    ]);
    setDraftSoalIsian(prev => [
      ...prev,
      ...importedIsian.map((s, idx) => ({ ...s, nomor: prev.length + idx + 1 })),
    ]);
    if (detectedTitle && !formNamaUjian.trim()) {
      setFormNamaUjian(detectedTitle);
    }
    setParseNotice({
      type: 'success',
      message: `Berhasil memuat ${importedPG.length} soal PG${importedIsian.length > 0 ? ` dan ${importedIsian.length} soal Isian` : ''} dari file Anda! Silakan cek daftar soal di Langkah 3 lalu klik Simpan.`
    });
    setActiveTab('buat');
    setShowUploadModal(false);
  };

  const handleSaveExamPackage = () => {
    let finalPG = draftSoalPG;
    let finalIsian = draftSoalIsian;

    if (finalPG.length === 0 && finalIsian.length === 0 && rawAikenText.trim()) {
      const parsedFallback = parseAikenUjian(rawAikenText);
      finalPG = parsedFallback.soalPG;
      finalIsian = parsedFallback.soalIsian;
    }

    if (finalPG.length === 0 && finalIsian.length === 0) {
      setParseNotice({
        type: 'error',
        message: 'Belum ada soal yang dimasukkan. Pilih salah satu cara di Langkah 2 (Upload File, Buat Otomatis AI, atau Ketik Manual) terlebih dahulu.'
      });
      return;
    }

    const selectedMapelObj = mapelList.find(m => m.id === formMapelId);
    const targetPG = formJenisUjian === 'UJIAN_AKHIR' ? 40 : 30;
    const pgCount = finalPG.length;

    let docStatus: 'BELUM_BUAT' | 'DRAFT_PROSES' | 'READY' = 'DRAFT_PROSES';
    if (pgCount >= targetPG || pgCount > 0) {
      docStatus = pgCount >= targetPG ? 'READY' : 'DRAFT_PROSES';
    } else if (finalIsian.length === 0) {
      docStatus = 'BELUM_BUAT';
    }

    const newExam: PaketUjian = {
      id: `ex-${Date.now()}`,
      namaUjian: formNamaUjian.trim() || `${formJenisUjian === 'UJIAN_AKHIR' ? 'PAS/PAT' : 'PTS'} ${selectedMapelObj?.namaMapel || 'Mapel Kejuruan'}`,
      jenisUjian: formJenisUjian,
      idGuru: currentUser.id,
      namaGuru: currentUser.nama,
      idMapel: formMapelId,
      namaMapel: selectedMapelObj?.namaMapel || 'Mapel Kejuruan',
      lingkupMateri: formLingkupMateri,
      bab: formBab,
      targetKelas: formTargetKelas.length > 0 ? formTargetKelas : matchingTargetClasses.map(k => k.namaKelas),
      hariTanggal: formHariTanggal,
      jamMulai: formJamMulai,
      durasiMenit: Number(formDurasi) || 90,
      token: formToken.trim().toUpperCase() || 'UJIAN1',
      statusDokumen: docStatus,
      soalPG: finalPG.map((s, idx) => ({ ...s, nomor: idx + 1 })),
      soalIsian: finalIsian.map((s, idx) => ({ ...s, nomor: idx + 1 })),
      passingGrade: 75,
    };

    onSaveUjian(newExam);
    setSelectedExamForPrint(newExam);
    setSaveNotice(`Paket Ujian "${newExam.namaUjian}" berhasil disimpan (${newExam.soalPG.length} PG, ${newExam.soalIsian.length} Isian) dengan Token: ${newExam.token}!`);
    setDraftSoalPG([]);
    setDraftSoalIsian([]);
    setFormNamaUjian('');
    setRawAikenText('');
    setParseNotice(null);
    setActiveTab('daftar');
  };

  const handleCopyPrompt = async (text: string) => {
    const success = await copyTextToClipboard(text);
    if (success) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } else {
      setShowPromptModal(true);
    }
  };

  // Filtered results for this teacher's subject & target classes
  const teacherResults = hasilList.filter(res => {
    const exam = ujianList.find(u => u.id === res.idUjian);
    return exam && (exam.idGuru === currentUser.id || (currentUser.mapelDiampu && currentUser.mapelDiampu.includes(exam.idMapel)));
  });

  return (
    <div className="min-h-screen bg-slate-100 py-4 sm:py-8 px-3 sm:px-6 lg:px-8 print:min-h-0 print:bg-white print:p-0">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 print:max-w-none print:space-y-0">
        {/* Sapaan Waktu & Ucapan Ulang Tahun */}
        <div className="no-print">
          <GreetingBanner user={currentUser} />
        </div>

        {/* Top Banner */}
        <div className="no-print bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Panel Pendidik & Tenaga Kependidikan</span>
              </span>

              {/* Badges for Concurrent Roles */}
              {isWalas && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 text-[11px] font-bold border border-purple-200">
                  <Award className="w-3 h-3 text-purple-600" />
                  <span>Wali Kelas: {currentUser.walasNamaKelas || 'Aktif'}</span>
                </span>
              )}

              {isPembina && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 text-[11px] font-bold border border-amber-300">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Pembina Ekskul: {pembinaEkskuls.map(e => e.nama).join(', ') || 'Aktif'}</span>
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {isPurePembina ? 'Portal Pembina Ekstrakurikuler' : 'Portal Guru & Penilaian'}
            </h1>
            <p className="text-xs text-slate-600">
              <strong className="text-slate-800">{currentUser.nama}</strong> ({currentUser.nipOrNis}) • 
              {isPembina && isWalas ? ' Guru, Wali Kelas & Pembina' : isPembina ? ' Pembina Ekskul' : isWalas ? ' Guru & Wali Kelas' : ' Guru Mapel'}
            </p>
          </div>

          <div className="grid grid-cols-2 min-[380px]:grid-cols-3 sm:flex sm:flex-wrap items-stretch sm:items-center gap-1.5 w-full sm:w-auto">
            {!isPurePembina && (
              <>
                <button
                  onClick={() => setActiveTab('jurnal')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'jurnal' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <Calendar className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${activeTab === 'jurnal' ? 'text-white' : 'text-blue-600'}`} />
                  <span>Jurnal Mengajar</span>
                </button>
                <button
                  onClick={() => setActiveTab('daftar')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'daftar' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4 sm:hidden shrink-0 opacity-80" />
                  <span>Paket Ujian ({teacherExams.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('buat')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'buat' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>Buat Soal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight transition-all cursor-pointer"
                  title="Upload naskah soal dari Word (.docx) atau PDF (.pdf)"
                >
                  <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>Upload Soal</span>
                </button>
                <button
                  onClick={() => setActiveTab('cetak')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'cetak' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Printer className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>Cetak Soal</span>
                </button>
                <button
                  onClick={() => setActiveTab('nilai')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'nilai' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>Nilai CAT</span>
                </button>
                <button
                  onClick={() => setActiveTab('leger')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'leger' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <BookOpen className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${activeTab === 'leger' ? 'text-white' : 'text-emerald-600'}`} />
                  <span>Leger Nilai</span>
                </button>
                <button
                  onClick={() => setActiveTab('absensi')}
                  className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                    activeTab === 'absensi' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Scan className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${activeTab === 'absensi' ? 'text-white' : 'text-purple-600'}`} />
                  <span>Presensi QR</span>
                </button>
              </>
            )}

            {canAccessEkskul && (
              <button
                onClick={() => setActiveTab('ekskul')}
                className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                  activeTab === 'ekskul'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Award className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${activeTab === 'ekskul' ? 'text-white' : 'text-amber-600'}`} />
                <span className="flex items-center gap-1">
                  <span>Ekskul</span>
                  {isPembina && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                      {pembinaEkskuls.length}
                    </span>
                  )}
                </span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('profil')}
              className={`min-h-[52px] sm:min-h-[38px] px-2.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition-colors flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-left gap-1 sm:gap-1.5 leading-tight cursor-pointer ${
                activeTab === 'profil' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Camera className={`w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0 ${activeTab === 'profil' ? 'text-white' : 'text-slate-600'}`} />
              <span>Profil</span>
            </button>
          </div>
        </div>

        {saveNotice && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{saveNotice}</span>
            </div>
            <button
              onClick={() => setSaveNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 0: ABSEN & JURNAL MENGAJAR GURU */}
        {activeTab === 'jurnal' && (
          <AbsenMengajarView
            currentUser={currentUser}
            kelasList={kelasList}
            mapelList={mapelList}
            jadwalPelajaranList={jadwalPelajaranList}
            absenMengajarList={absenMengajarList}
            usersList={usersList}
            schoolInfo={schoolInfo}
            onSaveAbsenMengajar={onSaveAbsenMengajar}
            onDeleteAbsenMengajar={onDeleteAbsenMengajar}
            isAdminView={currentUser.role === 'admin'}
          />
        )}

        {/* TAB 1: DAFTAR PAKET UJIAN GURU */}
        {activeTab === 'daftar' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {teacherExams.map((exam) => {
                const totalPG = exam.soalPG.length;
                const totalIsian = exam.soalIsian.length;
                const targetPG = exam.jenisUjian === 'UJIAN_AKHIR' ? 40 : 30;

                return (
                  <div 
                    key={exam.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          exam.statusDokumen === 'READY' 
                            ? 'bg-emerald-100 text-emerald-800'
                            : exam.statusDokumen === 'DRAFT_PROSES'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {exam.statusDokumen === 'READY' && '● READY (Siap Ujian)'}
                          {exam.statusDokumen === 'DRAFT_PROSES' && `● PROSES (${totalPG}/${targetPG} PG)`}
                          {exam.statusDokumen === 'BELUM_BUAT' && '● BELUM LENGKAP'}
                        </span>

                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          Token: {exam.token}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {exam.namaUjian}
                      </h3>

                      <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                        <div>Mapel: <strong>{exam.namaMapel}</strong></div>
                        {exam.lingkupMateri && (
                          <div className="text-[11px] text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                            Materi: <strong>{exam.lingkupMateri}</strong>
                          </div>
                        )}
                        {exam.bab && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                            Bab: <strong>{exam.bab}</strong>
                          </div>
                        )}
                        <div>Jadwal: {exam.hariTanggal} ({exam.jamMulai})</div>
                        <div>Durasi: {exam.durasiMenit} Menit • KKM: {exam.passingGrade}</div>
                        <div>Target Kelas: <span className="text-blue-700 font-semibold">{exam.targetKelas.join(', ')}</span></div>
                        <div>Jumlah Soal: <strong>{totalPG} PG</strong> + <strong>{totalIsian} Isian</strong></div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedExamForPrint(exam);
                            setActiveTab('cetak');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Cetak</span>
                        </button>

                        <button
                          onClick={() => setSelectedExamForEdit(exam)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 border border-indigo-200 shadow-xs"
                          title="Edit Waktu Pelaksanaan & Butir Soal"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Soal & Jadwal</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExamToDelete(exam)}
                        className="px-2.5 py-1.5 rounded-lg text-rose-600 bg-rose-50/60 hover:bg-rose-100 border border-rose-200/70 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Hapus Ujian"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: BUAT SOAL UJIAN BARU (ALUR 3 LANGKAH SEDERHANA) */}
        {activeTab === 'buat' && (
          <div className="space-y-5">
            {/* LANGKAH 1: INFO DASAR UJIAN */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">1</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">Info Dasar Ujian</h3>
                  <p className="text-[11px] text-slate-500">Tentukan mata pelajaran, kelas peserta, dan kode masuk siswa.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Judul Ujian <span className="font-normal text-slate-400">(opsional, otomatis jika kosong)</span>
                  </label>
                  <input
                    type="text"
                    placeholder={`Contoh: PTS ${selectedFormMapel?.namaMapel || 'Mata Pelajaran'}`}
                    value={formNamaUjian}
                    onChange={(e) => setFormNamaUjian(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mata Pelajaran</label>
                  <select
                    value={formMapelId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setFormMapelId(newId);
                      const targetMapel = mapelList.find(m => m.id === newId);
                      if (targetMapel) {
                        const topics = getDefaultTopicsForMapel(targetMapel);
                        setFormTargetKelas(topics.targetKelas);
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    {teacherMapel.map(m => (
                      <option key={m.id} value={m.id}>{m.namaMapel}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jenis Ujian</label>
                  <select
                    value={formJenisUjian}
                    onChange={(e) => setFormJenisUjian(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    <option value="UJIAN_TENGAH_SEMESTER">PTS / Ulangan Harian</option>
                    <option value="UJIAN_AKHIR">PAS / PAT / Ujian Akhir</option>
                  </select>
                </div>
              </div>

              {/* Pilih Kelas */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <label className="font-bold text-slate-700">
                    Kelas yang Ikut Ujian ({formTargetKelas.length} dipilih):
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormTargetKelas(matchingTargetClasses.map(k => k.namaKelas))}
                      className="text-[11px] text-blue-600 hover:underline font-bold cursor-pointer"
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
                  {matchingTargetClasses.map(k => {
                    const isChecked = formTargetKelas.includes(k.namaKelas);
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setFormTargetKelas(formTargetKelas.filter(c => c !== k.namaKelas));
                          } else {
                            setFormTargetKelas([...formTargetKelas, k.namaKelas]);
                          }
                        }}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                          isChecked
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {k.namaKelas}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Jadwal, Durasi, Kode Masuk, Materi */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Ujian</label>
                  <input
                    type="text"
                    value={formHariTanggal}
                    onChange={(e) => setFormHariTanggal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jam Mulai</label>
                  <input
                    type="text"
                    value={formJamMulai}
                    onChange={(e) => setFormJamMulai(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Durasi (Menit)</label>
                  <input
                    type="number"
                    min={10}
                    max={240}
                    value={formDurasi}
                    onChange={(e) => setFormDurasi(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-blue-900">Kode Token Siswa</label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomToken}
                      className="text-[11px] text-blue-600 font-bold hover:underline cursor-pointer"
                    >
                      Acak
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-blue-50/50 font-mono font-black text-center tracking-widest text-blue-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Topik / Materi <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: Dosis Obat & Resep Klinis"
                    value={formLingkupMateri}
                    onChange={(e) => setFormLingkupMateri(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    Bab / Pertemuan <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: Bab 1 - Bab 3"
                    value={formBab}
                    onChange={(e) => setFormBab(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* LANGKAH 2: PILIH 1 CARA MEMASUKKAN SOAL */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center shrink-0">2</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">Masukkan Soal (Pilih Salah Satu Cara)</h3>
                  <p className="text-[11px] text-slate-500">Pilih cara yang paling mudah bagi Anda — hasil soalnya langsung muncul di Langkah 3.</p>
                </div>
              </div>

              {/* 3 Clear Method Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setBuatMethod('upload')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                    buatMethod === 'upload'
                      ? 'border-emerald-600 bg-emerald-50/80 shadow-sm'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${buatMethod === 'upload' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border border-slate-200'}`}>
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900">1. Upload File Soal</div>
                    <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">Punya file Word (.docx) atau PDF? Tinggal unggah langsung jadi.</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBuatMethod('ai')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                    buatMethod === 'ai'
                      ? 'border-indigo-600 bg-indigo-50/80 shadow-sm'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${buatMethod === 'ai' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-slate-200'}`}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900">2. Buat Otomatis AI</div>
                    <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">Cukup pilih jumlah soal & topik, AI langsung buatkan soal + kunci.</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBuatMethod('manual')}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3 ${
                    buatMethod === 'manual'
                      ? 'border-blue-600 bg-blue-50/80 shadow-sm'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 ${buatMethod === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-slate-200'}`}>
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-900">3. Ketik / Tempel Teks</div>
                    <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">Tulis soal satu per satu atau copy-paste teks soal yang sudah ada.</div>
                  </div>
                </button>
              </div>

              {/* Notice Banner */}
              {parseNotice && (
                <div className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2.5 ${
                  parseNotice.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}>
                  {parseNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                  <span>{parseNotice.message}</span>
                </div>
              )}

              {/* PANEL CARA 1: UPLOAD WORD / PDF */}
              {buatMethod === 'upload' && (
                <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-emerald-950">Unggah File Word (.docx) atau PDF (.pdf)</h4>
                    <p className="text-xs text-emerald-800 leading-relaxed max-w-xl">
                      Sistem akan otomatis membaca nomor soal, pilihan A–E, dan kunci jawabannya. Anda juga bisa mengedit atau menghapus butir soal setelah diunggah.
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

              {/* PANEL CARA 2: BUAT OTOMATIS AI */}
              {buatMethod === 'ai' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">Jumlah Soal Pilihan Ganda:</label>
                      <select
                        value={aiJumlahPG}
                        onChange={(e) => setAiJumlahPG(Number(e.target.value))}
                        disabled={isGeneratingAI}
                        className="w-full px-3 py-2.5 rounded-xl border border-indigo-200 bg-white font-bold text-slate-800"
                      >
                        <option value={5}>5 Soal PG + 1 Isian (Uji Cepat)</option>
                        <option value={10}>10 Soal PG + 2 Isian (Kuis)</option>
                        <option value={20}>20 Soal PG + 3 Isian (Ulangan)</option>
                        <option value={30}>30 Soal PG + 5 Isian (PTS)</option>
                        <option value={40}>40 Soal PG + 5 Isian (PAS/PAT)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-800 mb-1">
                        Catatan Topik / Fokus Soal <span className="font-normal text-slate-500">(opsional)</span>:
                      </label>
                      <input
                        type="text"
                        value={aiInstruksiTambahan}
                        onChange={(e) => setAiInstruksiTambahan(e.target.value)}
                        disabled={isGeneratingAI}
                        placeholder="Misal: Soal cerita hitung dosis obat anak & etiket apotek"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-white"
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
                                ? 'bg-teal-600 text-white border-teal-600'
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
                      <Copy className="w-3.5 h-3.5" />
                      <span>Atau salin perintah untuk dipakai di ChatGPT luar</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateQuestionsWithGemini}
                      disabled={isGeneratingAI}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className={`w-4 h-4 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingAI ? (aiProgressText || 'Sedang membuat soal...') : 'Buatkan Soal Otomatis Sekarang'}</span>
                    </button>
                  </div>

                  {aiErrorMsg && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                      <span>{aiErrorMsg}</span>
                    </div>
                  )}
                </div>
              )}

              {/* PANEL CARA 3: KETIK MANUAL / TEMPEL TEKS */}
              {buatMethod === 'manual' && (
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
                        <label className="block font-bold text-slate-800 mb-1">
                          Pertanyaan (Soal #{draftSoalPG.length + 1}):
                        </label>
                        <textarea
                          rows={2}
                          value={manualPertanyaan}
                          onChange={(e) => setManualPertanyaan(e.target.value)}
                          placeholder="Tulis pertanyaan di sini..."
                          className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          value={manualOpsiA}
                          onChange={(e) => setManualOpsiA(e.target.value)}
                          placeholder="Pilihan A (wajib)"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300"
                        />
                        <input
                          type="text"
                          value={manualOpsiB}
                          onChange={(e) => setManualOpsiB(e.target.value)}
                          placeholder="Pilihan B (wajib)"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300"
                        />
                        <input
                          type="text"
                          value={manualOpsiC}
                          onChange={(e) => setManualOpsiC(e.target.value)}
                          placeholder="Pilihan C"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300"
                        />
                        <input
                          type="text"
                          value={manualOpsiD}
                          onChange={(e) => setManualOpsiD(e.target.value)}
                          placeholder="Pilihan D"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300"
                        />
                        <input
                          type="text"
                          value={manualOpsiE}
                          onChange={(e) => setManualOpsiE(e.target.value)}
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
                                setParseNotice({ type: 'error', message: 'Gagal membaca file gambar.' });
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
                              onClick={() => setManualKunci(opt)}
                              className={`w-9 h-9 rounded-xl font-black text-xs border transition-all cursor-pointer ${
                                manualKunci === opt
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
                          onClick={handleAddSingleManualPG}
                          className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah Soal ke Daftar</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <p className="text-slate-600 leading-relaxed">
                        Copy-paste soal dari Word/ChatGPT dengan format sederhana seperti contoh di bawah, lalu klik <strong>Masukkan Soal</strong>.
                      </p>
                      <textarea
                        rows={8}
                        placeholder={`Contoh format:\n\n1. Apa fungsi utama resep dokter?\nA. Catatan biaya pasien\nB. Instruksi tertulis dokter kepada apoteker\nC. Surat izin pulang\nD. Kartu kontrol\nE. Label harga\nANSWER: B`}
                        value={rawAikenText}
                        onChange={(e) => setRawAikenText(e.target.value)}
                        className="w-full p-3.5 rounded-xl border border-slate-300 bg-white font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleParseAiken}
                          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
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

            {/* LANGKAH 3: DAFTAR SOAL MASUK & SIMPAN */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0">3</span>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                      Periksa Daftar Soal ({draftSoalPG.length} PG{draftSoalIsian.length > 0 ? `, ${draftSoalIsian.length} Isian` : ''})
                    </h3>
                    <p className="text-[11px] text-slate-500">Cek kembali butir soal & kunci jawaban sebelum diterbitkan ke siswa.</p>
                  </div>
                </div>

                {(draftSoalPG.length > 0 || draftSoalIsian.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftSoalPG([]);
                      setDraftSoalIsian([]);
                    }}
                    className="text-xs text-rose-600 hover:underline font-bold self-start sm:self-center cursor-pointer"
                  >
                    Kosongkan Semua
                  </button>
                )}
              </div>

              {draftSoalPG.length === 0 && draftSoalIsian.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-1">
                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Belum ada soal yang masuk</p>
                  <p className="text-[11px] text-slate-400">Gunakan salah satu cara di Langkah 2 di atas (Upload File, AI, atau Ketik Manual).</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {draftSoalPG.map((s, idx) => {
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
                                setDraftSoalPG(prev => prev.map((item, i) => i === idx ? {
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
                    <div key={s.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          {s.levelKognitif && (
                            <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                              HOTS {s.levelKognitif}
                            </span>
                          )}
                          <div className="font-bold text-slate-900 leading-relaxed">
                            <span className="text-blue-700 mr-1.5">{idx + 1}.</span>
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
                            onClick={() => setDraftSoalPG(prev => prev.filter((_, i) => i !== idx).map((item, n) => ({ ...item, nomor: n + 1 })))}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
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
                            onClick={() => setDraftSoalPG(prev => prev.map((item, i) => i === idx ? { ...item, kunci: opt } : item))}
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

                  {draftSoalIsian.map((si, idx) => {
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
                                setDraftSoalIsian(prev => prev.map((item, i) => i === idx ? {
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
                          onClick={() => setDraftSoalIsian(prev => prev.filter((_, i) => i !== idx).map((item, n) => ({ ...item, nomor: n + 1 })))}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}

              {/* Optional quick manual essay */}
              {buatMethod === 'manual' && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-600 mb-2">+ Tambah Soal Isian / Esai (Opsional):</div>
                  <div className="flex flex-col sm:flex-row gap-2 text-xs">
                    <input
                      type="text"
                      value={manualIsianTanya}
                      onChange={(e) => setManualIsianTanya(e.target.value)}
                      placeholder="Pertanyaan esai / uraian..."
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300"
                    />
                    <input
                      type="text"
                      value={manualIsianKunci}
                      onChange={(e) => setManualIsianKunci(e.target.value)}
                      placeholder="Kunci jawaban (opsional)"
                      className="sm:w-52 px-3 py-2 rounded-xl border border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={handleAddSingleManualIsian}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shrink-0 cursor-pointer"
                    >
                      + Tambah Isian
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Soal otomatis tersimpan di akun Anda dan siap dikerjakan siswa dengan token <strong className="font-mono text-slate-800">{formToken}</strong>.
                </div>
                <button
                  type="button"
                  onClick={handleSaveExamPackage}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan & Terbitkan Ujian</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CETAK SOAL KERTAS (OFFLINE PRINTING ENGINE) */}
        {activeTab === 'cetak' && (() => {
          const paperDim = PAPER_SIZE_DIMENSIONS[printPaperSize];
          const previewWidth = printOrientation === 'portrait' ? paperDim.width : paperDim.height;
          const previewMinHeight = printOrientation === 'portrait' ? paperDim.height : paperDim.width;
          const previewPadding = MARGIN_VALUES[printMargin];
          const fontSizeClass =
            printFontSize === 'sm'
              ? 'text-[9.5pt] leading-[1.35]'
              : printFontSize === 'lg'
                ? 'text-[11.5pt] leading-[1.5]'
                : 'text-[10.5pt] leading-[1.42]';

          const handlePrintExam = async () => {
            if (!activeExamForPrint) return;
            setIsPrintingExam(true);
            try {
              const target = printableExamRef.current || (document.querySelector('.exam-print-root') as HTMLElement);
              if (target) {
                await printDocumentArea(target, {
                  title: `Naskah Soal - ${activeExamForPrint.namaUjian}`,
                  paperSize: printPaperSize,
                  orientation: printOrientation,
                  margin: printMargin,
                });
              } else {
                window.print();
              }
            } finally {
              setIsPrintingExam(false);
            }
          };

          return (
            <div className="space-y-5">
              {/* Control Bar & Pengaturan Kertas (NO-PRINT) */}
              <div className="no-print bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap shrink-0">
                      Paket Ujian:
                    </label>
                    <select
                      value={activeExamForPrint?.id || ''}
                      onChange={(e) => {
                        const ex = teacherExams.find(item => item.id === e.target.value);
                        setSelectedExamForPrint(ex || null);
                      }}
                      disabled={teacherExams.length === 0}
                      className="w-full sm:max-w-md px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      {teacherExams.length === 0 ? (
                        <option value="">Belum ada paket ujian tersedia</option>
                      ) : (
                        teacherExams.map(ex => (
                          <option key={ex.id} value={ex.id}>
                            {ex.namaUjian} ({ex.soalPG.length} PG{ex.soalIsian.length > 0 ? ` + ${ex.soalIsian.length} Isian` : ''})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={!activeExamForPrint || isPrintingExam}
                    onClick={handlePrintExam}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Printer className="w-4 h-4" />
                    <span>
                      {isPrintingExam
                        ? 'Menyiapkan Kertas Cetak...'
                        : `Cetak / Simpan PDF (${printPaperSize} · ${printOrientation === 'portrait' ? 'Portrait' : 'Landscape'})`}
                    </span>
                  </button>
                </div>

                {/* Pengaturan Kertas & Tata Letak */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Ukuran Kertas</label>
                    <select
                      value={printPaperSize}
                      onChange={(e) => setPrintPaperSize(e.target.value as 'A4' | 'F4' | 'Legal' | 'Letter')}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 cursor-pointer"
                    >
                      <option value="A4">A4 (210 × 297 mm)</option>
                      <option value="F4">F4 / Folio (215 × 330 mm)</option>
                      <option value="Legal">Legal (216 × 356 mm)</option>
                      <option value="Letter">Letter (216 × 279 mm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Orientasi</label>
                    <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPrintOrientation('portrait')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          printOrientation === 'portrait'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Portrait
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintOrientation('landscape')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          printOrientation === 'landscape'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Landscape
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Margin Kertas</label>
                    <select
                      value={printMargin}
                      onChange={(e) => setPrintMargin(e.target.value as 'minimal' | 'sempit' | 'normal')}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 cursor-pointer"
                    >
                      <option value="minimal">Minimal (6 / 8 mm)</option>
                      <option value="sempit">Sempit (10 / 12 mm)</option>
                      <option value="normal">Normal (14 / 15 mm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Tata Letak Soal</label>
                    <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPrintColumns(1)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          printColumns === 1
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        1 Kolom
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintColumns(2)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          printColumns === 2
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        2 Kolom
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Ukuran Huruf Soal</label>
                    <select
                      value={printFontSize}
                      onChange={(e) => setPrintFontSize(e.target.value as 'sm' | 'md' | 'lg')}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 cursor-pointer"
                    >
                      <option value="sm">Padat (9.5 pt)</option>
                      <option value="md">Standar (10.5 pt)</option>
                      <option value="lg">Besar (11.5 pt)</option>
                    </select>
                  </div>
                </div>

                {/* Opsi Kelengkapan Lembar & Ringkasan Kertas */}
                <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showKopSekolah}
                        onChange={(e) => setShowKopSekolah(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 accent-slate-900 cursor-pointer"
                      />
                      <span>Kop Resmi Sekolah</span>
                    </label>
                    <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showIdentitasSiswa}
                        onChange={(e) => setShowIdentitasSiswa(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 accent-slate-900 cursor-pointer"
                      />
                      <span>Kotak Identitas Siswa</span>
                    </label>
                    <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showKunciJawaban}
                        onChange={(e) => setShowKunciJawaban(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 accent-slate-900 cursor-pointer"
                      />
                      <span>Sertakan Lembar Kunci Jawaban (Guru)</span>
                    </label>
                  </div>

                  {activeExamForPrint && (
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      <span>{previewWidth} × {previewMinHeight}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{activeExamForPrint.soalPG.length} Pilihan Ganda</span>
                      {activeExamForPrint.soalIsian.length > 0 && (
                        <>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>{activeExamForPrint.soalIsian.length} Isian</span>
                        </>
                      )}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{showKunciJawaban ? 'Dengan Kunci Jawaban' : 'Naskah Siswa Saja'}</span>
                    </div>
                  )}
                </div>
              </div>

              {!activeExamForPrint ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-xs">
                  Belum ada paket ujian untuk dicetak. Silakan buat soal terlebih dahulu di tab <strong>Buat Soal</strong>.
                </div>
              ) : (
                /* Desk Preview Backdrop (No-print wrapper) */
                <div className="bg-slate-200/75 p-3 sm:p-6 rounded-2xl border border-slate-300 overflow-x-auto print:bg-white print:p-0 print:border-0 print:rounded-none print:overflow-visible">
                  {/* Formal Printable Offline Exam Sheet */}
                  <div
                    ref={printableExamRef}
                    style={{
                      width: previewWidth,
                      minHeight: previewMinHeight,
                      padding: previewPadding,
                    }}
                    className={`printable-document exam-print-root mx-auto bg-white text-black shadow-md border border-slate-300 ${fontSizeClass} print:!w-full print:!max-w-none print:!min-h-0 print:!p-0 print:!m-0 print:!border-0 print:!shadow-none`}
                  >
                    {/* 1. KOP RESMI SEKOLAH */}
                    {showKopSekolah && (
                      <div className="kop-surat-container mb-2">
                        <KopSuratView
                          schoolInfo={schoolInfo}
                          customTitle={`NASKAH SOAL ${activeExamForPrint.namaUjian}`}
                          customSubtitle={`TAHUN AJARAN ${schoolInfo?.tahunAjaranPembelajaran || '2026/2027'} • SEMESTER ${(schoolInfo?.semesterPembelajaran || 'GANJIL').toUpperCase()}`}
                        />
                      </div>
                    )}

                    {!showKopSekolah && (
                      <div className="kop-surat-container text-center border-b-2 border-black pb-2 mb-3">
                        <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-black">
                          NASKAH SOAL {activeExamForPrint.namaUjian}
                        </h2>
                        <p className="text-[10pt] text-slate-800 font-semibold">
                          {schoolInfo?.namaLengkap || schoolInfo?.nama || 'SMK Bakti Putra Mandiri'} • Tahun Ajaran {schoolInfo?.tahunAjaranPembelajaran || '2026/2027'} (Semester {schoolInfo?.semesterPembelajaran || 'Ganjil'})
                        </p>
                      </div>
                    )}

                    {/* 2. TABEL KETERANGAN UJIAN & IDENTITAS PESERTA */}
                    <div className="raport-identity-group mb-3 space-y-2">
                      <table className="w-full border-collapse border border-slate-800 text-[9.5pt]">
                        <tbody>
                          <tr>
                            <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50 w-[18%]">Mata Pelajaran</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-bold w-[32%]">{activeExamForPrint.namaMapel}</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50 w-[18%]">Hari / Tanggal</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-bold w-[32%]">{activeExamForPrint.hariTanggal || '-'}</td>
                          </tr>
                          <tr>
                            <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50">Kelas / Jurusan</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-bold">{activeExamForPrint.targetKelas.join(', ') || '-'}</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50">Alokasi Waktu</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-bold tabular-nums">{activeExamForPrint.durasiMenit} Menit</td>
                          </tr>
                          <tr>
                            <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50">Guru Pengampu</td>
                            <td className="border border-slate-700 px-2.5 py-1">{activeExamForPrint.namaGuru}</td>
                            <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50">Jumlah Soal</td>
                            <td className="border border-slate-700 px-2.5 py-1 tabular-nums">
                              {activeExamForPrint.soalPG.length} Pilihan Ganda
                              {activeExamForPrint.soalIsian.length > 0 ? ` + ${activeExamForPrint.soalIsian.length} Isian` : ''}
                            </td>
                          </tr>
                          {(activeExamForPrint.lingkupMateri || activeExamForPrint.bab) && (
                            <tr>
                              <td className="border border-slate-700 px-2.5 py-1 font-semibold bg-slate-50">Materi / Bab</td>
                              <td colSpan={3} className="border border-slate-700 px-2.5 py-1">
                                {[activeExamForPrint.lingkupMateri, activeExamForPrint.bab].filter(Boolean).join(' — ')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {showIdentitasSiswa && (
                        <table className="w-full border-collapse border border-slate-800 text-[9.5pt]">
                          <tbody>
                            <tr>
                              <td className="border border-slate-700 px-2.5 py-1.5 w-[44%]">
                                <span className="font-semibold">Nama Siswa:</span>{' '}
                                <span className="inline-block border-b border-dotted border-slate-600 w-[62%]">&nbsp;</span>
                              </td>
                              <td className="border border-slate-700 px-2.5 py-1.5 w-[24%]">
                                <span className="font-semibold">Kelas:</span>{' '}
                                <span className="inline-block border-b border-dotted border-slate-600 w-[55%]">&nbsp;</span>
                              </td>
                              <td className="border border-slate-700 px-2.5 py-1.5 w-[20%]">
                                <span className="font-semibold">No. Peserta:</span>{' '}
                                <span className="inline-block border-b border-dotted border-slate-600 w-[35%]">&nbsp;</span>
                              </td>
                              <td className="border border-slate-700 px-2.5 py-1.5 w-[12%] text-center font-semibold">
                                Nilai:
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}

                      {/* Petunjuk Umum */}
                      <div className="px-2.5 py-1.5 border border-slate-400 bg-slate-50/60 text-[9pt] text-slate-800 leading-snug">
                        <strong>Petunjuk Umum:</strong> Berdoalah sebelum mengerjakan soal. Tulislah identitas Anda secara lengkap. Pilihlah satu jawaban yang paling tepat (A, B, C, D, atau E) untuk soal Pilihan Ganda{activeExamForPrint.soalIsian.length > 0 ? ', dan jawablah soal Isian dengan singkat serta jelas' : ''}.
                      </div>
                    </div>

                    {/* 3. BAGIAN I: PILIHAN GANDA */}
                    {activeExamForPrint.soalPG.length > 0 && (
                      <div className="mt-3">
                        <div className="exam-section-header font-bold text-[10pt] uppercase tracking-wide text-black border-b-2 border-slate-800 pb-1 mb-3">
                          BAGIAN I. PILIHAN GANDA
                        </div>

                        <div className={printColumns === 2 ? 'exam-two-columns' : 'space-y-3'}>
                          {activeExamForPrint.soalPG.map((q, idx) => (
                            <div key={q.id} className="exam-question-item page-break-inside-avoid mb-3 text-black">
                              {q.stimulus && (
                                <div className="pl-6 mb-1.5">
                                  <QuestionStimulusView stimulus={q.stimulus} printMode compact />
                                </div>
                              )}
                              <div className="relative pl-6 leading-snug">
                                <span className="absolute left-0 top-0 font-bold tabular-nums">{idx + 1}.</span>
                                <span className="whitespace-pre-line">{q.pertanyaan}</span>
                              </div>
                              <div className="pl-6 mt-1 space-y-0.5 text-slate-900">
                                {(['a', 'b', 'c', 'd', 'e'] as const).map((optKey) => {
                                  const optText = q.opsi?.[optKey];
                                  if (!optText) return null;
                                  return (
                                    <div key={optKey} className="relative pl-5 leading-snug">
                                      <span className="absolute left-0 top-0 font-semibold uppercase">{optKey}.</span>
                                      <span>{optText}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. BAGIAN II: ISIAN SINGKAT */}
                    {activeExamForPrint.soalIsian.length > 0 && (
                      <div className="mt-5 pt-3 border-t-2 border-slate-800">
                        <div className="exam-section-header font-bold text-[10pt] uppercase tracking-wide text-black border-b border-slate-400 pb-1 mb-3">
                          BAGIAN II. ISIAN SINGKAT / URAIAN
                        </div>

                        <div className="space-y-3.5">
                          {activeExamForPrint.soalIsian.map((q, idx) => (
                            <div key={q.id} className="exam-question-item page-break-inside-avoid text-black">
                              {q.stimulus && (
                                <div className="pl-6 mb-1.5">
                                  <QuestionStimulusView stimulus={q.stimulus} printMode compact />
                                </div>
                              )}
                              <div className="relative pl-6 leading-snug">
                                <span className="absolute left-0 top-0 font-bold tabular-nums">{idx + 1}.</span>
                                <span className="whitespace-pre-line">{q.pertanyaan}</span>
                              </div>
                              <div className="pl-6 mt-2 space-y-2.5">
                                <div className="h-5 border-b border-dotted border-slate-500" />
                                <div className="h-5 border-b border-dotted border-slate-500" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 5. LEMBAR KUNCI JAWABAN KHUSUS GURU (HALAMAN TERPISAH) */}
                    {showKunciJawaban && (
                      <div className="page-break-before mt-8 pt-4 border-t-4 border-double border-slate-800 space-y-4">
                        <div className="text-center border-b border-slate-400 pb-2">
                          <div className="text-[11pt] font-black uppercase tracking-wider text-black">
                            LEMBAR KUNCI JAWABAN & PEDOMAN PENSKORAN (PEGANGAN GURU)
                          </div>
                          <p className="text-[9.5pt] text-slate-700 mt-0.5">
                            {activeExamForPrint.namaUjian} · Mapel: {activeExamForPrint.namaMapel} · KKM: {activeExamForPrint.passingGrade}
                          </p>
                        </div>

                        {activeExamForPrint.soalPG.length > 0 && (
                          <div>
                            <div className="font-bold text-[9.5pt] text-black mb-2">A. Kunci Jawaban Pilihan Ganda:</div>
                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 text-[9.5pt] font-mono tabular-nums">
                              {activeExamForPrint.soalPG.map((q, idx) => (
                                <div key={q.id} className="py-1.5 px-1 border border-slate-400 bg-slate-50 text-center">
                                  <span className="text-slate-600 text-[8.5pt]">{idx + 1}.</span>{' '}
                                  <strong className="text-black">{q.kunci}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {activeExamForPrint.soalIsian.length > 0 && (
                          <div className="pt-2">
                            <div className="font-bold text-[9.5pt] text-black mb-1.5">B. Kunci Jawaban / Rubrik Isian Singkat:</div>
                            <table className="w-full border-collapse border border-slate-700 text-[9.5pt]">
                              <thead>
                                <tr className="bg-slate-100">
                                  <th className="border border-slate-700 px-2.5 py-1 w-14 text-center">No</th>
                                  <th className="border border-slate-700 px-2.5 py-1 text-left">Kunci Jawaban / Kriteria Penilaian</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activeExamForPrint.soalIsian.map((q, idx) => (
                                  <tr key={q.id}>
                                    <td className="border border-slate-700 px-2.5 py-1 text-center font-bold tabular-nums">{idx + 1}</td>
                                    <td className="border border-slate-700 px-2.5 py-1 whitespace-pre-line">{q.kunci}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* TAB 4: DAFTAR NILAI SISWA MAPEL DIAMPU */}
        {activeTab === 'nilai' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Rekapitulasi Nilai Ujian Siswa (Mapel yang Diampu)
                </h3>
                <p className="text-xs text-slate-500">
                  Data hasil pengerjaan CAT komputer dari kelas sasaran.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                Total Riwayat: {teacherResults.length} Siswa
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2.5 px-3">No</th>
                    <th className="py-2.5 px-3">NISN</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3 text-center">Nilai PG</th>
                    <th className="py-2.5 px-3 text-center">Nilai Isian</th>
                    <th className="py-2.5 px-3 text-center">Total Nilai</th>
                    <th className="py-2.5 px-3 text-center">Status Ketuntasan</th>
                    <th className="py-2.5 px-3">Waktu Selesai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teacherResults.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono">{row.nisn}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{row.namaSiswa}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.namaKelas}</td>
                      <td className="py-2.5 px-3 text-center font-bold">{row.nilaiPG}</td>
                      <td className="py-2.5 px-3 text-center font-bold">{row.nilaiIsian}</td>
                      <td className="py-2.5 px-3 text-center font-black text-blue-700 text-sm">{row.totalNilai}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.statusLulus ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {row.statusLulus ? 'LULUS (TUNTAS)' : 'REMEDIAL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{row.waktuSelesai}</td>
                    </tr>
                  ))}
                  {teacherResults.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Belum ada siswa yang menyelesaikan ujian pada mapel ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: LEGER NILAI MATA PELAJARAN & TUJUAN PEMBELAJARAN */}
        {activeTab === 'leger' && (
          <LegerMapelView
            currentUser={currentUser}
            kelasList={kelasList}
            mapelList={mapelList}
            hasilList={hasilList}
            usersList={usersList}
            nilaiList={nilaiList}
            onSaveNilaiList={onSaveNilaiList}
            absensiList={absensiList}
            schoolInfo={schoolInfo}
            ekskulList={ekskulList}
            nilaiEkskulList={nilaiEkskulList}
            jadwalPelajaranList={jadwalPelajaranList}
            onPullAllFromCloud={onPullAllFromCloud}
          />
        )}

        {/* TAB 6: PRESENSI BARCODE HARIAN */}
        {activeTab === 'absensi' && (
          <AbsensiBarcodeView
            currentUser={currentUser}
            usersList={usersList}
            kelasList={kelasList}
            absensiList={absensiList}
            onAddAbsensi={onAddAbsensi}
            onBatchAddAbsensi={onBatchAddAbsensi}
            onUpdateAbsensi={onUpdateAbsensi}
            onDeleteAbsensi={onDeleteAbsensi}
            schoolInfo={schoolInfo}
          />
        )}

        {/* TAB 7: NILAI EKSTRAKURIKULER (HANYA PEMBINA, WALAS & ADMIN) */}
        {activeTab === 'ekskul' && canAccessEkskul && (
          <NilaiEkskulView
            currentUser={currentUser}
            ekskulList={ekskulList}
            usersList={usersList}
            kelasList={kelasList}
            nilaiEkskulList={nilaiEkskulList}
            schoolInfo={schoolInfo}
            onSaveNilaiEkskul={onSaveNilaiEkskul}
            onUpdateUser={onUpdateProfile}
          />
        )}

        {/* TAB 8: PROFIL GURU & UPLOAD FOTO */}
        {activeTab === 'profil' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Profil & Akun Guru</h3>
                <p className="text-xs text-slate-500">Perbarui foto profil, nomor kontak, dan kata sandi akun login Anda.</p>
              </div>
              {currentUser.isWalas && (
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  Wali Kelas: {currentUser.walasNamaKelas || currentUser.namaKelas}
                </span>
              )}
            </div>

            {profileSavedMsg && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Profil dan kata sandi Anda berhasil disimpan!</span>
              </div>
            )}

            <form onSubmit={handleSaveGuruProfile} className="space-y-4 text-xs max-w-xl">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Foto Profil</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-2xl font-black text-blue-600">
                    {guruFoto ? (
                      <img src={guruFoto} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      currentUser.nama.charAt(0)
                    )}
                  </div>
                  <div className="space-y-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleGuruPhotoUpload}
                      className="text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700"
                    />
                    <p className="text-[10px] text-slate-400">Format PNG/JPG/WebP, maksimal 2MB</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap & Gelar *</label>
                <input
                  type="text"
                  required
                  value={guruNama}
                  onChange={(e) => setGuruNama(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-bold focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Gelar Depan / Belakang</label>
                  <input
                    type="text"
                    value={guruGelar}
                    onChange={(e) => setGuruGelar(e.target.value)}
                    placeholder="Contoh: S.Pd. / S.Farm., Apt."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. WhatsApp</label>
                  <input
                    type="text"
                    value={guruTelepon}
                    onChange={(e) => setGuruTelepon(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Resmi Guru</label>
                <input
                  type="email"
                  value={guruEmail}
                  onChange={(e) => setGuruEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-800 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-600" />
                  Kata Sandi Akun Guru
                </label>
                <input
                  type="text"
                  required
                  value={guruPassword}
                  onChange={(e) => setGuruPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:border-blue-500 bg-white"
                />
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                Simpan Profil Saya
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Template Prompt AI Modal */}
      <TemplatePromptModal
        isOpen={showPromptModal}
        onClose={() => setShowPromptModal(false)}
        namaGuru={currentUser.nama}
        namaMapel={mapelList.find(m => m.id === formMapelId)?.namaMapel || teacherMapel[0]?.namaMapel || 'Mata Pelajaran'}
        lingkupMateri={formLingkupMateri}
        bab={formBab}
        targetKelas={formTargetKelas}
        jenisUjian={formJenisUjian}
        durasi={formDurasi}
        token={formToken}
        onApplySampleAiken={(sampleText) => {
          const parsedSample = parseAikenUjian(sampleText);
          if (parsedSample.soalPG.length > 0) {
            setDraftSoalPG(prev => [
              ...prev,
              ...parsedSample.soalPG.map((s, idx) => ({ ...s, id: `pg-sample-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
            ]);
            setDraftSoalIsian(prev => [
              ...prev,
              ...parsedSample.soalIsian.map((s, idx) => ({ ...s, id: `isian-sample-${Date.now()}-${idx}`, nomor: prev.length + idx + 1 })),
            ]);
            setParseNotice({
              type: 'success',
              message: `Contoh ${parsedSample.soalPG.length} soal berhasil dimasukkan ke Langkah 3!`
            });
          } else {
            setRawAikenText(sampleText);
            setBuatMethod('manual');
            setManualSubMode('paste');
          }
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
            setSaveNotice(`Paket ujian "${updated.namaUjian}" berhasil diperbarui!`);
            setTimeout(() => setSaveNotice(null), 5000);
          }}
          onClose={() => setSelectedExamForEdit(null)}
        />
      )}

      {/* Upload Soal Berkas Word / PDF / Teks Modal */}
      <UploadSoalModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onImportQuestions={handleImportFromUploadModal}
      />

      {/* Modal Edit Butir Soal Draft dengan AI */}
      <RefineQuestionAIModal
        target={aiRefineTarget}
        namaMapel={mapelList.find(m => m.id === formMapelId)?.namaMapel || activeDefaultMapel?.namaMapel || 'Mata Pelajaran Kejuruan'}
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
                  Paket ujian <strong>"{examToDelete.namaUjian}"</strong> ({examToDelete.namaMapel}) akan dihapus permanen beserta daftar soal di dalamnya.
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
                  if (selectedExamForPrint?.id === target.id) {
                    setSelectedExamForPrint(null);
                  }
                  setSaveNotice(`Paket ujian "${target.namaUjian}" berhasil dihapus.`);
                  setTimeout(() => setSaveNotice(null), 4000);
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
