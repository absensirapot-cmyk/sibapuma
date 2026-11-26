import React, { useState } from 'react';
import { 
  PaketUjian, 
  KontenWeb, 
  FormulirPPDB, 
  User, 
  Kelas, 
  Mapel,
  HasilUjian,
  SchoolInfo,
  JadwalPelajaran,
  JadwalUjianItem,
  AbsensiRecord,
  NilaiMapelSiswa,
  Ekskul,
  NilaiEkskulSiswa,
  AbsenMengajarRecord
} from '../types';
import { 
  Building2, 
  GraduationCap, 
  Users, 
  CalendarDays, 
  KeyRound, 
  Globe2, 
  BarChart3, 
  ShieldCheck,
  CheckCircle2,
  School,
  BookOpen,
  Award,
  Database,
  UserCheck,
  Eye,
  EyeOff,
  Save,
  FileSpreadsheet,
  Scan,
  TrendingUp,
  RefreshCw,
  Printer,
  CalendarCheck
} from 'lucide-react';

import { AdminPengaturanTab } from './admin/AdminPengaturanTab';
import { AdminGuruTab } from './admin/AdminGuruTab';
import { AdminSiswaTab } from './admin/AdminSiswaTab';
import { AdminKelasTab } from './admin/AdminKelasTab';
import { AdminMapelTab } from './admin/AdminMapelTab';
import { AdminJadwalTab } from './admin/AdminJadwalTab';
import { AdminAbsenGuruJadwalView } from './admin/AdminAbsenGuruJadwalView';
import { AdminAkunTab } from './admin/AdminAkunTab';
import { AdminCmsTab } from './admin/AdminCmsTab';
import { AdminMonitoringTab } from './admin/AdminMonitoringTab';
import { AdminEkskulTab } from './admin/AdminEkskulTab';
import { AdminDataManagementTab } from './admin/AdminDataManagementTab';
import { AdminKenaikanKelasTab } from './admin/AdminKenaikanKelasTab';
import { AdminPPDBChart } from './admin/AdminPPDBChart';
import { exportPPDBToExcel } from '../utils/exportPPDB';
import { LegerMapelView } from './LegerMapelView';
import { CetakLegerView } from './CetakLegerView';
import { AbsensiBarcodeView } from './AbsensiBarcodeView';
import { MonthlyAttendanceDashboard } from './MonthlyAttendanceDashboard';
import { GreetingBanner } from './GreetingBanner';
import { AdminMonitoringNilaiGuruTab } from './admin/AdminMonitoringNilaiGuruTab';

interface AdminDashboardViewProps {
  currentUser: User;
  schoolInfo: SchoolInfo;
  ujianList: PaketUjian[];
  kontenList: KontenWeb[];
  formulirList: FormulirPPDB[];
  usersList: User[];
  kelasList: Kelas[];
  mapelList: Mapel[];
  hasilList: HasilUjian[];
  jadwalPelajaranList?: JadwalPelajaran[];
  jadwalUjianItem?: JadwalUjianItem[];
  jadwalUjianList?: JadwalUjianItem[];
  absensiList?: AbsensiRecord[];
  onAddAbsensi?: (record: AbsensiRecord) => void;
  onBatchAddAbsensi?: (records: AbsensiRecord[]) => void;
  onUpdateAbsensi?: (record: AbsensiRecord) => void;
  onDeleteAbsensi?: (id: string) => void;
  nilaiList?: NilaiMapelSiswa[];
  ekskulList?: Ekskul[];
  nilaiEkskulList?: NilaiEkskulSiswa[];
  absenMengajarList?: AbsenMengajarRecord[];
  onSaveAbsenMengajar?: (record: AbsenMengajarRecord) => void;
  onDeleteAbsenMengajar?: (id: string) => void;
  onClearAllAbsenMengajar?: () => void;
  onUpdateSchoolInfo: (info: SchoolInfo) => void;
  onSaveKonten: (konten: KontenWeb) => void;
  onDeleteKonten: (kontenId: string) => void;
  onUpdatePPDBStatus: (formId: string, status: FormulirPPDB['statusPendaftaran'], catatan?: string) => void;
  onConfirmNewStudent: (formId: string, nomorIndukSiswaResmi: string, kelasDiterima: string, catatan?: string) => void;
  onAddUser: (user: User) => void;
  onUpdateUser?: (user: User) => void;
  onSaveUsersList?: (users: User[]) => void;
  onDeleteUser: (userId: string) => void;
  onAddMapel: (mapel: Mapel) => void;
  onUpdateMapel?: (mapel: Mapel) => void;
  onDeleteMapel?: (mapelId: string) => void;
  onAddKelas: (kelas: Kelas) => void;
  onUpdateKelas?: (kelas: Kelas) => void;
  onDeleteKelas?: (kelasId: string) => void;
  onSaveJadwalPelajaran?: (jadwal: JadwalPelajaran) => void;
  onDeleteJadwalPelajaran?: (jadwalId: string) => void;
  onSaveJadwalUjian?: (jadwal: JadwalUjianItem) => void;
  onDeleteJadwalUjian?: (jadwalId: string) => void;
  onAddEkskul?: (ekskul: Ekskul) => void;
  onUpdateEkskul?: (ekskul: Ekskul) => void;
  onDeleteEkskul?: (ekskulId: string) => void;
  onSaveNilaiEkskul?: (list: NilaiEkskulSiswa[]) => void;
  onImportUsers?: (users: User[]) => void;
  onImportMapel?: (mapel: Mapel[]) => void;
  onImportJadwal?: (jadwal: JadwalPelajaran[], mode?: 'update' | 'replace' | 'append') => void;
  onClearAllJadwalPelajaran?: () => void;
  onDeduplicateJadwalPelajaran?: () => number;
  onImportNilai?: (nilai: NilaiMapelSiswa[]) => void;
  onResetDatabase?: () => void;
  onResetNilai?: () => void;
  onResetAbsensi?: () => void;
  onResetCalonSiswa?: () => void;
  onClearTemplateCalonSiswa?: () => void;
  onClearTemplateStudents?: () => void;
  onRestoreAllData?: (data: any) => void;
  onSaveNilaiList?: (newNilaiList: NilaiMapelSiswa[]) => void;
  onDeleteCalonSiswa?: (formId: string, userId?: string) => void;
  onUpdateCalonSiswa?: (updatedForm: FormulirPPDB) => void;
  onSaveUjian?: (ujian: PaketUjian) => void;
  onDeleteUjian?: (ujianId: string) => void;
  onSyncAllToCloud?: () => Promise<{ success: boolean; count: number; error?: string }>;
  onPullAllFromCloud?: () => Promise<{ success: boolean; count: number; error?: string }>;
  onResetToDefaultMapel?: () => void;
  onSyncMapel?: () => void;
}

type AdminTabType = 
  | 'pengaturan' 
  | 'kejuruan'
  | 'profil_admin' 
  | 'cetak_leger' 
  | 'leger_raport' 
  | 'presensi_barcode' 
  | 'tren_absensi'
  | 'absen_guru_jadwal' 
  | 'naik_kelas' 
  | 'guru' 
  | 'siswa' 
  | 'kelas' 
  | 'mapel' 
  | 'jadwal' 
  | 'ekskul' 
  | 'data_management' 
  | 'akun' 
  | 'cms' 
  | 'monitoring' 
  | 'monitoring_nilai' 
  | 'grafik_ppdb';

interface AdminMenuItem {
  id: AdminTabType;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface AdminMenuGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  items: AdminMenuItem[];
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  schoolInfo,
  ujianList,
  kontenList,
  formulirList,
  usersList,
  kelasList,
  mapelList,
  hasilList,
  jadwalPelajaranList = [],
  jadwalUjianList = [],
  absensiList = [],
  nilaiList = [],
  ekskulList = [],
  nilaiEkskulList = [],
  absenMengajarList = [],
  onSaveAbsenMengajar = () => {},
  onDeleteAbsenMengajar = () => {},
  onClearAllAbsenMengajar = () => {},
  onUpdateSchoolInfo,
  onSaveKonten,
  onDeleteKonten,
  onUpdatePPDBStatus,
  onConfirmNewStudent,
  onDeleteCalonSiswa,
  onUpdateCalonSiswa,
  onSyncAllToCloud,
  onPullAllFromCloud,
  onAddUser,
  onUpdateUser = () => {},
  onDeleteUser,
  onAddMapel,
  onUpdateMapel = () => {},
  onDeleteMapel = () => {},
  onAddKelas,
  onUpdateKelas = () => {},
  onDeleteKelas = () => {},
  onSaveJadwalPelajaran = () => {},
  onDeleteJadwalPelajaran = () => {},
  onSaveJadwalUjian = () => {},
  onDeleteJadwalUjian = () => {},
  onAddEkskul = () => {},
  onUpdateEkskul = () => {},
  onDeleteEkskul = () => {},
  onSaveNilaiEkskul = () => {},
  onImportUsers = () => {},
  onImportMapel = () => {},
  onImportJadwal = () => {},
  onClearAllJadwalPelajaran = () => {},
  onDeduplicateJadwalPelajaran = () => 0,
  onImportNilai = () => {},
  onResetDatabase = () => {},
  onResetNilai = () => {},
  onResetAbsensi = () => {},
  onResetCalonSiswa = () => {},
  onClearTemplateCalonSiswa = () => {},
  onClearTemplateStudents = () => {},
  onRestoreAllData = () => {},
  onSaveNilaiList = () => {},
  onSaveUsersList,
  onAddAbsensi = () => {},
  onBatchAddAbsensi,
  onUpdateAbsensi = () => {},
  onDeleteAbsensi = () => {},
  onSaveUjian = () => {},
  onDeleteUjian = () => {},
  onResetToDefaultMapel,
  onSyncMapel,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTabType>('pengaturan');

  // Admin Personal User Profile Form State
  const [adminNama, setAdminNama] = useState(currentUser.nama || 'Super Administrator');
  const [adminUsername, setAdminUsername] = useState(currentUser.username || 'admin');
  const [adminPassword, setAdminPassword] = useState(currentUser.password || 'admin123');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminNip, setAdminNip] = useState(currentUser.nipOrNis || 'ADM-2026-001');
  const [adminEmail, setAdminEmail] = useState(currentUser.email || 'admin@smkbaktiputramandiri.sch.id');
  const [adminTelepon, setAdminTelepon] = useState(currentUser.telepon || '(021) 5978-2345');
  const [adminFoto, setAdminFoto] = useState(currentUser.fotoProfilUrl || '');
  const [adminSelectedClassId, setAdminSelectedClassId] = useState<string>('');
  const [profileSavedNotice, setProfileSavedNotice] = useState(false);

  const handleSaveAdminProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedUser: User = {
      ...currentUser,
      nama: adminNama.trim(),
      username: adminUsername.trim(),
      password: adminPassword.trim(),
      nipOrNis: adminNip.trim(),
      email: adminEmail.trim(),
      telepon: adminTelepon.trim(),
      fotoProfilUrl: adminFoto.trim(),
    };
    onUpdateUser(updatedUser);
    setProfileSavedNotice(true);
    setTimeout(() => setProfileSavedNotice(false), 4000);
  };

  // Derive students list for monitoring & leger
  const siswaList = usersList
    .filter(u => u.role === 'siswa')
    .map(u => ({
      id: u.id,
      nisn: u.nipOrNis,
      nama: u.nama,
      kelas: u.namaKelas || u.kelas || 'X Farmasi 1',
      jurusan: u.jurusan || 'Farmasi',
      jenisKelamin: (u.jenisKelamin as any) || 'Laki-laki',
      nomorAbsen: 1,
    }));

  const guruCount = usersList.filter(u => u.role === 'guru' || u.role === 'walas').length;
  const siswaCount = usersList.filter(u => u.role === 'siswa').length;
  const ppdbPendingCount = formulirList.filter(f => f.statusPendaftaran === 'Menunggu_Verifikasi').length;

  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleManualSync = async () => {
    if (!onSyncAllToCloud) return;
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const res = await onSyncAllToCloud();
      if (res.success) {
        setSyncNotice({
          text: `Sinkronisasi berhasil! ${res.count} data dikirim ke Cloud Firestore.`,
          type: 'success',
        });
      } else {
        setSyncNotice({
          text: `Sinkronisasi belum selesai: ${res.error || 'Periksa koneksi internet'}. Data lokal tetap aman.`,
          type: 'error',
        });
      }
    } catch (e: any) {
      setSyncNotice({
        text: `Koneksi cloud bermasalah: ${e.message}`,
        type: 'error',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncNotice(null), 6000);
    }
  };

  const handleManualPull = async () => {
    if (!onPullAllFromCloud) return;
    setIsPulling(true);
    setSyncNotice(null);
    try {
      const res = await onPullAllFromCloud();
      if (res.success) {
        setSyncNotice({
          text: `Berhasil mengambil data terbaru dari Cloud! ${res.count} data diperbarui di perangkat ini.`,
          type: 'success',
        });
      } else {
        setSyncNotice({
          text: `Gagal mengambil data dari cloud: ${res.error || 'Silakan coba lagi'}`,
          type: 'error',
        });
      }
    } catch (e: any) {
      setSyncNotice({
        text: `Error koneksi cloud: ${e.message}`,
        type: 'error',
      });
    } finally {
      setIsPulling(false);
      setTimeout(() => setSyncNotice(null), 6000);
    }
  };

  const menuGroups: AdminMenuGroup[] = [
    {
      id: 'lembaga',
      label: 'Lembaga & Web',
      icon: Building2,
      badgeCount: ppdbPendingCount,
      items: [
        { id: 'pengaturan' as const, label: 'Pengaturan & KOP', desc: 'Identitas sekolah, KOP surat, logo, & kejuruan', icon: Building2 },
        { id: 'profil_admin' as const, label: 'Profil Pengguna Admin', desc: 'Biodata, kontak & kata sandi administrator', icon: UserCheck },
        { id: 'cms' as const, label: 'CMS Web & Galeri', desc: 'Konten web profil, visi-misi & galeri kegiatan', icon: Globe2 },
        { id: 'akun' as const, label: 'Akun & Verifikasi SPMB', desc: 'Kelola akun pengguna & verifikasi calon siswa', icon: KeyRound, badge: ppdbPendingCount },
      ]
    },
    {
      id: 'data_induk',
      label: 'Data Induk',
      icon: Users,
      items: [
        { id: 'siswa' as const, label: 'Manajemen Siswa', desc: 'Biodata siswa, pas foto profil & kartu pelajar', icon: Users },
        { id: 'guru' as const, label: 'Manajemen Dewan Guru', desc: 'Daftar guru pengampu, NIP & kontak', icon: GraduationCap },
        { id: 'kelas' as const, label: 'Manajemen Kelas / Rombel', desc: 'Kelola ruang kelas, wali kelas & jurusan rombel', icon: School },
        { id: 'mapel' as const, label: 'Mata Pelajaran', desc: 'Kurikulum mata pelajaran, kode mapel & KKM', icon: BookOpen },
        { id: 'ekskul' as const, label: `Ekstrakurikuler (${ekskulList.length})`, desc: 'Kegiatan ekstrakurikuler & nama pembina', icon: Award, badge: ekskulList.length },
      ]
    },
    {
      id: 'akademik',
      label: 'Akademik & KBM',
      icon: CalendarDays,
      items: [
        { id: 'jadwal' as const, label: 'Jadwal KBM & Ujian', desc: 'Kelola & impor jadwal pelajaran mingguan & ujian', icon: CalendarDays },
        { id: 'absen_guru_jadwal' as const, label: 'Absen Guru Sesuai Jadwal', desc: 'Monitoring kehadiran guru sesuai jadwal jam KBM', icon: CalendarCheck },
        { id: 'presensi_barcode' as const, label: 'Presensi Barcode Siswa', desc: 'Sistem presensi scanner barcode & QR gerbang', icon: Scan },
        { id: 'tren_absensi' as const, label: 'Tren Absensi Bulanan', desc: 'Visualisasi grafik batang tren kehadiran siswa per bulan (Recharts)', icon: BarChart3 },
        { id: 'naik_kelas' as const, label: 'Kenaikan Kelas & Kelulusan', desc: 'Proses kenaikan kelas, kelulusan & arsip siswa', icon: GraduationCap },
      ]
    },
    {
      id: 'penilaian',
      label: 'Penilaian & Monitoring',
      icon: FileSpreadsheet,
      items: [
        { id: 'cetak_leger' as const, label: 'Cetak Leger Resmi', desc: 'Cetak lembar leger nilai kolektif & per mapel', icon: Printer },
        { id: 'leger_raport' as const, label: 'Buku Leger & Raport', desc: 'Pengolahan nilai rapor, capaian & asesmen', icon: FileSpreadsheet },
        { id: 'monitoring_nilai' as const, label: 'Monitoring Nilai Guru', desc: 'Pantau progres penginputan nilai dewan guru', icon: GraduationCap },
        { id: 'monitoring' as const, label: 'Monitoring KBM & CAT', desc: 'Pantau ujian online CAT & aktivitas pembelajaran', icon: BarChart3 },
      ]
    },
    {
      id: 'sistem',
      label: 'SPMB & Database',
      icon: Database,
      items: [
        { id: 'grafik_ppdb' as const, label: 'Grafik Tren & Kuota PPDB', desc: 'Statistik pendaftaran, kuota kejuruan & asal sekolah', icon: TrendingUp },
        { id: 'data_management' as const, label: 'Backup & Manajemen Data', desc: 'Sinkronisasi cloud Firestore, ekspor & pulihkan', icon: Database },
      ]
    }
  ];

  const activeGroup = menuGroups.find(g => g.items.some(i => i.id === activeTab)) || menuGroups[0];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">
      {/* Sapaan Waktu & Ucapan Ulang Tahun */}
      <GreetingBanner user={currentUser} />

      {/* Top Banner Overview */}
      <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-7 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-5 relative overflow-hidden">
        <div className="space-y-2 z-10 w-full md:w-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-200 text-xs font-bold border border-amber-400/30">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Panel Admin • Cloud Real-Time Aktif</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight">
            {schoolInfo.nama}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
            Kelola data sekolah, jadwal, nilai, presensi, dan SPMB dalam satu tempat.
          </p>
          
          {/* Quick Push & Pull Cloud Buttons */}
          <div className="pt-2 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {onSyncAllToCloud && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing || isPulling}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="truncate">{isSyncing ? 'Mengunggah...' : 'Sinkron Cloud'}</span>
              </button>
            )}

            {onPullAllFromCloud && (
              <button
                type="button"
                onClick={handleManualPull}
                disabled={isSyncing || isPulling}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isPulling ? 'animate-spin' : ''}`} />
                <span className="truncate">{isPulling ? 'Mengambil...' : 'Ambil Cloud'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('monitoring_nilai')}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Monitoring Nilai</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cetak_leger')}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Cetak Leger</span>
            </button>
          </div>

          {syncNotice && (
            <div className={`mt-2 p-3 rounded-xl text-xs font-medium border flex items-center gap-2 ${
              syncNotice.type === 'success' 
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncNotice.text}</span>
            </div>
          )}
        </div>

        {/* Quick Stats Counter */}
        <div className="grid grid-cols-3 gap-3 z-10 w-full md:w-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center border border-white/10">
            <span className="block text-xl sm:text-2xl font-black text-amber-300">{guruCount}</span>
            <span className="text-[10px] sm:text-xs text-slate-300 font-medium">Guru & Walas</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center border border-white/10">
            <span className="block text-xl sm:text-2xl font-black text-emerald-300">{siswaCount}</span>
            <span className="text-[10px] sm:text-xs text-slate-300 font-medium">Siswa Aktif</span>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center border border-white/10">
            <span className="block text-xl sm:text-2xl font-black text-rose-300">{ppdbPendingCount}</span>
            <span className="text-[10px] sm:text-xs text-slate-300 font-medium">Verifikasi SPMB</span>
          </div>
        </div>
      </div>

      {/* Menu Navigasi 2 Baris Langsung (Seluruh Menu Terlihat Jelas Tanpa Geser) */}
      <div className="space-y-2.5">
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-1.5">
          {menuGroups.map((group, idx) => {
            const isGroupActive = activeGroup.id === group.id;
            const GroupIcon = group.icon;
            const isOddLast = menuGroups.length % 2 === 1 && idx === menuGroups.length - 1;

            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  if (!isGroupActive) {
                    setActiveTab(group.items[0].id);
                  }
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between sm:justify-start gap-2 transition-all cursor-pointer text-left ${
                  isOddLast ? 'col-span-2 sm:col-span-1' : ''
                } ${
                  isGroupActive
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <GroupIcon className={`w-4 h-4 shrink-0 ${isGroupActive ? 'text-white' : 'text-amber-600'}`} />
                  <span className="leading-tight">{group.label}</span>
                </span>
                {group.badgeCount && group.badgeCount > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black shrink-0">
                    {group.badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Baris Sub-Menu Aktif */}
        <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200 space-y-1.5 sm:space-y-0">
          <div className="sm:hidden text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-1">
            Menu {activeGroup.label}:
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-1.5">
            {activeGroup.items.map((item, idx) => {
              const isItemActive = activeTab === item.id;
              const ItemIcon = item.icon;
              const isOddLast = activeGroup.items.length % 2 === 1 && idx === activeGroup.items.length - 1;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-between sm:justify-start gap-1.5 transition-all cursor-pointer text-left ${
                    isOddLast ? 'col-span-2 sm:col-span-1' : ''
                  } ${
                    isItemActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                  title={item.desc}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <ItemIcon className={`w-3.5 h-3.5 shrink-0 ${isItemActive ? 'text-amber-400' : 'text-amber-600'}`} />
                    <span className="leading-tight">{item.label}</span>
                  </span>
                  {item.badge !== undefined && Number(item.badge) > 0 ? (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 ${
                      isItemActive ? 'bg-amber-400 text-slate-950' : 'bg-rose-500 text-white'
                    }`}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      <div>
        {activeTab === 'pengaturan' && (
          <AdminPengaturanTab
            schoolInfo={schoolInfo}
            onUpdateSchoolInfo={onUpdateSchoolInfo}
          />
        )}

        {/* PROFIL AKUN PENGGUNA (ADMINISTRATOR) */}
        {activeTab === 'profil_admin' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xl overflow-hidden border border-amber-200">
                  {adminFoto ? (
                    <img src={adminFoto} alt="Foto Profil" className="w-full h-full object-cover" />
                  ) : (
                    <span>{adminNama.substring(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Akun Pengguna: {currentUser.role.toUpperCase()}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{adminNama}</h2>
                  <p className="text-xs text-slate-500">ID / NIP: {adminNip} • Username: @{adminUsername}</p>
                </div>
              </div>

              {profileSavedNotice && (
                <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Profil Akun Berhasil Diperbarui!</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveAdminProfile} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Lengkap Pengguna <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={adminNama}
                    onChange={(e) => setAdminNama(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    NIP / Nomor Identitas Pegawai <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={adminNip}
                    onChange={(e) => setAdminNip(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Username Login <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Kata Sandi / Password Baru <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Email Dinas / Resmi
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={adminTelepon}
                    onChange={(e) => setAdminTelepon(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    URL Foto Profil (Opsional)
                  </label>
                  <input
                    type="text"
                    value={adminFoto}
                    onChange={(e) => setAdminFoto(e.target.value)}
                    placeholder="https://... atau biarkan kosong untuk inisial avatar"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Perubahan Akun Pengguna</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* PUSAT CETAK LEGER RESMI SEKOLAH (SUPER ADMINISTRATOR ACCESS) */}
        {activeTab === 'cetak_leger' && (
          <CetakLegerView
            currentUser={currentUser}
            kelasList={kelasList}
            mapelList={mapelList}
            usersList={usersList}
            nilaiList={nilaiList}
            absensiList={absensiList}
            schoolInfo={schoolInfo}
            jadwalPelajaranList={jadwalPelajaranList}
            defaultClassId={adminSelectedClassId || undefined}
            onSelectClassId={setAdminSelectedClassId}
            onPullAllFromCloud={onPullAllFromCloud}
          />
        )}

        {/* BUKU LEGER & RAPORT SEKOLAH (SUPER ADMINISTRATOR ACCESS) */}
        {activeTab === 'leger_raport' && (
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
            onUpdateSchoolInfo={onUpdateSchoolInfo}
            onPullAllFromCloud={onPullAllFromCloud}
            defaultClassId={adminSelectedClassId || undefined}
            onSelectClassId={setAdminSelectedClassId}
          />
        )}

        {/* PRESENSI BARCODE PER KELAS & SCANNER MANDIRI */}
        {activeTab === 'presensi_barcode' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
            <AbsensiBarcodeView
              currentUser={currentUser}
              usersList={usersList}
              allUsersList={usersList}
              absensiList={absensiList || []}
              onAddAbsensi={onAddAbsensi}
              onBatchAddAbsensi={onBatchAddAbsensi}
              onUpdateAbsensi={onUpdateAbsensi}
              onDeleteAbsensi={onDeleteAbsensi}
              onUpdateUser={onUpdateUser}
              kelasList={kelasList}
              schoolInfo={schoolInfo}
            />
          </div>
        )}

        {/* TREN ABSENSI BULANAN MENGGUNAKAN RECHARTS */}
        {activeTab === 'tren_absensi' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
            <MonthlyAttendanceDashboard
              absensiList={absensiList || []}
              usersList={usersList}
              kelasList={kelasList}
              currentUser={currentUser}
              onNavigateToScanner={() => setActiveTab('presensi_barcode')}
            />
          </div>
        )}

        {activeTab === 'guru' && (
          <AdminGuruTab
            usersList={usersList}
            mapelList={mapelList}
            kelasList={kelasList}
            ekskulList={ekskulList}
            onAddUser={onAddUser}
            onUpdateUser={onUpdateUser}
            onDeleteUser={onDeleteUser}
            onUpdateKelas={onUpdateKelas}
            onUpdateEkskul={onUpdateEkskul}
            onUpdateMapel={onUpdateMapel}
            onSyncAllToCloud={onSyncAllToCloud}
            onPullAllFromCloud={onPullAllFromCloud}
          />
        )}

        {activeTab === 'siswa' && (
          <AdminSiswaTab
            usersList={usersList}
            kelasList={kelasList}
            schoolInfo={schoolInfo}
            onAddUser={onAddUser}
            onUpdateUser={onUpdateUser}
            onDeleteUser={onDeleteUser}
            onClearTemplateStudents={onClearTemplateStudents}
          />
        )}

        {activeTab === 'kelas' && (
          <AdminKelasTab
            kelasList={kelasList}
            usersList={usersList}
            schoolInfo={schoolInfo}
            onAddKelas={onAddKelas}
            onUpdateKelas={onUpdateKelas}
            onDeleteKelas={onDeleteKelas}
            onUpdateSchoolInfo={onUpdateSchoolInfo}
          />
        )}

        {activeTab === 'naik_kelas' && (
          <AdminKenaikanKelasTab
            usersList={usersList}
            kelasList={kelasList}
            nilaiList={nilaiList || []}
            absensiList={absensiList || []}
            schoolInfo={schoolInfo}
            onUpdateUser={onUpdateUser}
            onUpdateSchoolInfo={onUpdateSchoolInfo}
            onSaveUsersList={onSaveUsersList}
          />
        )}

        {activeTab === 'mapel' && (
          <AdminMapelTab
            mapelList={mapelList}
            jadwalPelajaranList={jadwalPelajaranList}
            usersList={usersList}
            onAddMapel={onAddMapel}
            onUpdateMapel={onUpdateMapel}
            onDeleteMapel={onDeleteMapel}
            onResetToDefaultMapel={onResetToDefaultMapel}
            onSyncMapel={onSyncMapel}
            onBatchUpdateMapel={onImportMapel}
          />
        )}

        {activeTab === 'absen_guru_jadwal' && (
          <AdminAbsenGuruJadwalView
            currentUser={currentUser}
            jadwalPelajaranList={jadwalPelajaranList}
            absenMengajarList={absenMengajarList}
            kelasList={kelasList}
            mapelList={mapelList}
            usersList={usersList}
            schoolInfo={schoolInfo}
            onSaveAbsenMengajar={onSaveAbsenMengajar}
            onDeleteAbsenMengajar={onDeleteAbsenMengajar}
            onClearAllAbsenMengajar={onClearAllAbsenMengajar}
          />
        )}

        {activeTab === 'jadwal' && (
          <AdminJadwalTab
            schoolInfo={schoolInfo}
            kelasList={kelasList}
            mapelList={mapelList}
            usersList={usersList}
            jadwalPelajaranList={jadwalPelajaranList}
            jadwalUjianList={jadwalUjianList}
            onSaveJadwalPelajaran={onSaveJadwalPelajaran}
            onDeleteJadwalPelajaran={onDeleteJadwalPelajaran}
            onSaveJadwalUjian={onSaveJadwalUjian}
            onDeleteJadwalUjian={onDeleteJadwalUjian}
            onImportJadwal={onImportJadwal}
            onClearAllJadwalPelajaran={onClearAllJadwalPelajaran}
            onDeduplicateJadwalPelajaran={onDeduplicateJadwalPelajaran}
            onOpenAbsenGuru={() => setActiveTab('absen_guru_jadwal')}
          />
        )}

        {activeTab === 'ekskul' && (
          <AdminEkskulTab
            ekskulList={ekskulList}
            usersList={usersList}
            kelasList={kelasList}
            nilaiEkskulList={nilaiEkskulList}
            onAddEkskul={onAddEkskul}
            onUpdateEkskul={onUpdateEkskul}
            onDeleteEkskul={onDeleteEkskul}
            onSaveNilaiEkskul={onSaveNilaiEkskul}
            onUpdateUser={onUpdateUser}
          />
        )}

        {activeTab === 'data_management' && (
          <AdminDataManagementTab
            usersList={usersList}
            kelasList={kelasList}
            mapelList={mapelList}
            jadwalPelajaranList={jadwalPelajaranList || []}
            jadwalUjianList={jadwalUjianList || []}
            nilaiList={nilaiList || []}
            nilaiEkskulList={nilaiEkskulList || []}
            absensiList={absensiList || []}
            formulirList={formulirList}
            ekskulList={ekskulList || []}
            ujianList={ujianList || []}
            schoolInfo={schoolInfo}
            onImportUsers={onImportUsers}
            onImportMapel={onImportMapel}
            onImportJadwal={onImportJadwal}
            onClearAllJadwalPelajaran={onClearAllJadwalPelajaran}
            onDeduplicateJadwalPelajaran={onDeduplicateJadwalPelajaran}
            onImportNilai={onImportNilai}
            onResetDatabase={onResetDatabase}
            onResetNilai={onResetNilai}
            onResetAbsensi={onResetAbsensi}
            onResetCalonSiswa={onResetCalonSiswa}
            onClearTemplateCalonSiswa={onClearTemplateCalonSiswa}
            onClearTemplateStudents={onClearTemplateStudents}
            onRestoreAllData={onRestoreAllData}
            onSyncAllToCloud={onSyncAllToCloud}
            onPullAllFromCloud={onPullAllFromCloud}
          />
        )}

        {activeTab === 'akun' && (
          <AdminAkunTab
            usersList={usersList}
            formulirList={formulirList}
            kelasList={kelasList}
            schoolInfo={schoolInfo}
            onUpdateUser={onUpdateUser}
            onUpdatePPDBStatus={onUpdatePPDBStatus}
            onConfirmNewStudent={onConfirmNewStudent}
            onDeleteCalonSiswa={onDeleteCalonSiswa}
            onUpdateCalonSiswa={onUpdateCalonSiswa}
            onClearTemplateCalonSiswa={onClearTemplateCalonSiswa}
          />
        )}

        {activeTab === 'cms' && (
          <AdminCmsTab
            kontenList={kontenList}
            schoolInfo={schoolInfo}
            onSaveKonten={onSaveKonten}
            onDeleteKonten={onDeleteKonten}
            onUpdateSchoolInfo={onUpdateSchoolInfo}
          />
        )}

        {activeTab === 'monitoring_nilai' && (
          <AdminMonitoringNilaiGuruTab
            usersList={usersList}
            mapelList={mapelList}
            kelasList={kelasList}
            nilaiList={nilaiList}
            jadwalPelajaranList={jadwalPelajaranList}
            jadwalUjianList={jadwalUjianList}
            ujianList={ujianList}
            hasilList={hasilList}
            schoolInfo={schoolInfo}
            currentUser={currentUser}
            onPullAllFromCloud={onPullAllFromCloud}
            onUpdateMapel={onUpdateMapel}
            onBatchUpdateMapel={onImportMapel}
            onSaveJadwalPelajaran={onSaveJadwalPelajaran}
            onUpdateUser={onUpdateUser}
            onSaveNilaiList={onSaveNilaiList}
          />
        )}

        {activeTab === 'monitoring' && (
          <AdminMonitoringTab
            ujianList={ujianList}
            siswaList={siswaList}
            kelasList={kelasList}
            mapelList={mapelList}
            currentUser={currentUser}
            usersList={usersList}
            absenMengajarList={absenMengajarList}
            jadwalPelajaranList={jadwalPelajaranList}
            schoolInfo={schoolInfo}
            absensiList={absensiList}
            nilaiList={nilaiList}
            onPullAllFromCloud={onPullAllFromCloud}
            onAddAbsensi={onAddAbsensi}
            onUpdateAbsensi={onUpdateAbsensi}
            onDeleteAbsensi={onDeleteAbsensi}
            onSaveUjian={onSaveUjian}
            onDeleteUjian={onDeleteUjian}
            onSaveAbsenMengajar={onSaveAbsenMengajar}
            onDeleteAbsenMengajar={onDeleteAbsenMengajar}
            onClearAllAbsenMengajar={onClearAllAbsenMengajar}
            onUpdateMapel={onUpdateMapel}
            onSaveJadwalPelajaran={onSaveJadwalPelajaran}
            onUpdateUser={onUpdateUser}
            onSaveNilaiList={onSaveNilaiList}
          />
        )}

        {activeTab === 'grafik_ppdb' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
                    <TrendingUp className="w-6 h-6" />
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900">
                    Pusat Visualisasi Tren Pendaftar & Analisis Kuota SPMB
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
                  Komponen visualisasi interaktif data real-time berbasis Recharts. Memonitor tren pendaftaran kumulatif dan harian per kejuruan serta rasio keterisian kuota siswa baru.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => exportPPDBToExcel(formulirList, schoolInfo.nama)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                  title="Unduh seluruh data pendaftar calon siswa baru ke format file Microsoft Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  <span>Unduh Data PPDB (.xlsx)</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-800 text-[10px] font-mono">
                    {formulirList.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('akun')}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>Daftar Calon Siswa & Akun</span>
                </button>
              </div>
            </div>

            <AdminPPDBChart formulirList={formulirList} schoolInfo={schoolInfo} />
          </div>
        )}
      </div>
    </div>
  );
};
