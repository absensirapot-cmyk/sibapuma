import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, AbsensiRecord, Kelas } from '../types';
import {
  loadFaceModels,
  areFaceModelsLoaded,
  extractFaceDescriptor,
  extractFaceFromImageUrl,
  findBestFaceMatch,
  drawFaceOverlay,
  FaceBox,
} from '../utils/faceRecognition';
import {
  isRecordForStudent,
  isSameKelas,
  getLocalDateString,
  getLocalTimeString,
  isHariSekolahEfektif,
  getNamaHariIndo,
  getAlasanHariTidakEfektif,
  createDeterministicAbsensiId,
} from '../utils/academicHelpers';
import {
  ScanFace,
  Camera,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Users,
  Search,
  Sparkles,
  Upload,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Volume2,
  VolumeX,
  Image as ImageIcon,
  UserCheck,
  X,
  Loader2,
} from 'lucide-react';

interface FaceAttendanceViewProps {
  currentUser: User;
  siswaList: User[];
  kelasList: Kelas[];
  absensiList: AbsensiRecord[];
  onAddAbsensi: (record: AbsensiRecord) => void;
  onUpdateUser?: (user: User) => void;
  selectedStatus: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa';
  onChangeStatus: (status: 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isPengurusKelas?: boolean;
}

export const FaceAttendanceView: React.FC<FaceAttendanceViewProps> = ({
  currentUser,
  siswaList,
  kelasList,
  absensiList,
  onAddAbsensi,
  onUpdateUser,
  selectedStatus,
  onChangeStatus,
  soundEnabled,
  onToggleSound,
  isPengurusKelas = false,
}) => {
  const [subMode, setSubMode] = useState<'scanner' | 'enroll'>('scanner');

  // AI Models state
  const [isModelReady, setIsModelReady] = useState<boolean>(areFaceModelsLoaded());
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Camera Scanner state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveStatusText, setLiveStatusText] = useState<string>('Kamera belum aktif. Klik "Buka Kamera Wajah" untuk mulai.');
  const [liveDetectionBox, setLiveDetectionBox] = useState<FaceBox | null>(null);
  const [lastRecognized, setLastRecognized] = useState<{
    student: User;
    record: AbsensiRecord;
    confidence: number;
    thumbnailUrl?: string;
    isNew: boolean;
  } | null>(null);
  const [showThankYouOverlay, setShowThankYouOverlay] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const isDetectingRef = useRef<boolean>(false);
  const cooldownMapRef = useRef<Map<string, number>>(new Map());
  const overlayTimerRef = useRef<number | null>(null);

  // Enrollment modal & filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [enrollKelasFilter, setEnrollKelasFilter] = useState('Semua');
  const [enrollStatusFilter, setEnrollStatusFilter] = useState<'semua' | 'terdaftar' | 'belum'>('semua');
  const [enrollingStudent, setEnrollingStudent] = useState<User | null>(null);
  const [enrollNotice, setEnrollNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isEnrollCameraActive, setIsEnrollCameraActive] = useState<boolean>(false);
  const [enrollCameraFacing, setEnrollCameraFacing] = useState<'user' | 'environment'>('user');
  const [isProcessingEnroll, setIsProcessingEnroll] = useState<boolean>(false);
  const [isBulkEnrolling, setIsBulkEnrolling] = useState<boolean>(false);

  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);

  const todayStr = getLocalDateString();
  const isTodayEffective = isHariSekolahEfektif(todayStr);

  // Enrolled students pool
  const enrolledStudents = useMemo(
    () => siswaList.filter(s => Array.isArray(s.faceDescriptor) && s.faceDescriptor.length === 128),
    [siswaList]
  );

  // Today's face attendance records
  const todayFaceRecords = useMemo(() => {
    return absensiList.filter(
      a => a.tanggal === todayStr && (a.metode?.toLowerCase().includes('wajah') || a.metode?.toLowerCase().includes('face'))
    );
  }, [absensiList, todayStr]);

  // Unique classes for filter
  const availableClassNames = useMemo(() => {
    const names = new Set<string>();
    kelasList.forEach(k => { if (k.namaKelas) names.add(k.namaKelas); });
    siswaList.forEach(s => {
      const kName = (s.kelas || s.namaKelas || '').replace(/^Kelas\s+/i, '').trim();
      if (kName) names.add(kName);
    });
    return Array.from(names).sort();
  }, [kelasList, siswaList]);

  // Load AI models proactively when component mounts
  useEffect(() => {
    let cancelled = false;
    if (!areFaceModelsLoaded()) {
      setIsModelLoading(true);
      loadFaceModels()
        .then(() => {
          if (!cancelled) {
            setIsModelReady(true);
            setIsModelLoading(false);
            setModelError(null);
          }
        })
        .catch((err: any) => {
          if (!cancelled) {
            setIsModelLoading(false);
            setModelError(err?.message || 'Gagal memuat model AI wajah.');
          }
        });
    } else {
      setIsModelReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Audio feedback helpers
  const playBeep = (type: 'success' | 'warning' | 'error' = 'success') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.28, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(330, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      }
    } catch {}
  };

  const speakThankYou = (studentName: string, status: string) => {
    if (!soundEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const firstName = studentName.trim().split(/\s+/)[0] || studentName;
      window.speechSynthesis.cancel();
      const text =
        status === 'Hadir'
          ? `Terima kasih ${firstName}, absensi wajah berhasil tercatat.`
          : `Terima kasih ${firstName}, status ${status} berhasil tercatat.`;
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'id-ID';
      utt.rate = 1.05;
      window.setTimeout(() => {
        try { window.speechSynthesis.speak(utt); } catch {}
      }, 220);
    } catch {}
  };

  // Stop scanner camera
  const stopScannerCamera = () => {
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setLiveDetectionBox(null);
    drawFaceOverlay(overlayCanvasRef.current, videoRef.current, null);
  };

  const startScannerCamera = async (facing: 'user' | 'environment' = cameraFacing) => {
    stopScannerCamera();
    setCameraError(null);
    try {
      if (!isModelReady) {
        setIsModelLoading(true);
        await loadFaceModels();
        setIsModelReady(true);
        setIsModelLoading(false);
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      setIsCameraActive(true);
      setLiveStatusText(
        enrolledStudents.length > 0
          ? 'Kamera aktif — arahkan wajah siswa ke dalam bingkai.'
          : 'Kamera aktif — belum ada wajah siswa terdaftar. Silakan daftarkan wajah siswa terlebih dahulu.'
      );

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.warn);
      }
    } catch (err: any) {
      console.warn('Face camera error:', err);
      setIsModelLoading(false);
      setCameraError(
        err?.message || 'Kamera tidak dapat diakses atau izin ditolak. Pastikan izin kamera aktif pada browser.'
      );
      setIsCameraActive(false);
    }
  };

  const toggleScannerFacing = () => {
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(next);
    if (isCameraActive) {
      startScannerCamera(next);
    }
  };

  // Attach stream when video element renders
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.warn);
    }
  }, [isCameraActive]);

  // Stop cameras when switching subMode or unmounting
  useEffect(() => {
    if (subMode !== 'scanner') {
      stopScannerCamera();
    }
  }, [subMode]);

  useEffect(() => {
    return () => {
      stopScannerCamera();
      stopEnrollCamera();
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    };
  }, []);

  // Process a matched student from face recognition
  const handleRecognizedStudent = (student: User, confidence: number, thumbnailUrl?: string) => {
    const nowMs = Date.now();
    const lastCooldown = cooldownMapRef.current.get(student.id) || 0;
    if (nowMs - lastCooldown < 4000) {
      return;
    }
    cooldownMapRef.current.set(student.id, nowMs);

    const now = new Date();
    const dateStr = getLocalDateString(now);
    const timeStr = getLocalTimeString(now, true);

    if (!isHariSekolahEfektif(dateStr)) {
      playBeep('warning');
      const alasan = getAlasanHariTidakEfektif(dateStr) || 'Hari Libur';
      setLiveStatusText(`Hari ini (${getNamaHariIndo(dateStr)}) adalah ${alasan}. Absensi libur.`);
      return;
    }

    const existing = absensiList.find(a => isRecordForStudent(a, student) && a.tanggal === dateStr);
    if (existing) {
      playBeep('warning');
      setLastRecognized({
        student,
        record: existing,
        confidence,
        thumbnailUrl: thumbnailUrl || student.facePreviewUrl,
        isNew: false,
      });
      setShowThankYouOverlay(true);
      if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = window.setTimeout(() => setShowThankYouOverlay(false), 3200);
      return;
    }

    const newRecord: AbsensiRecord = {
      id: createDeterministicAbsensiId(dateStr, student),
      userId: student.id,
      nipd: student.nipd || student.nipOrNis,
      nisn: student.nisn || student.username,
      namaSiswa: student.nama,
      kelas: (student.kelas || student.namaKelas || 'XII').replace(/^Kelas\s+/i, ''),
      tanggal: dateStr,
      waktu: timeStr,
      status: selectedStatus,
      metode: 'Absen Wajah (Face ID)',
      keterangan: `Terverifikasi biometrik wajah otomatis (Kemiripan ${confidence}%)`,
      petugas: `${currentUser.nama} (${isPengurusKelas ? currentUser.jabatanKelas || 'Pengurus Kelas' : currentUser.role})`,
      fotoBukti: thumbnailUrl || student.facePreviewUrl,
    };

    onAddAbsensi(newRecord);
    playBeep(selectedStatus === 'Hadir' ? 'success' : 'warning');
    speakThankYou(student.nama, selectedStatus);

    setLastRecognized({
      student,
      record: newRecord,
      confidence,
      thumbnailUrl: thumbnailUrl || student.facePreviewUrl,
      isNew: true,
    });
    setShowThankYouOverlay(true);
    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = window.setTimeout(() => setShowThankYouOverlay(false), 3800);
  };

  // Real-time face detection loop
  useEffect(() => {
    if (!isCameraActive || !isModelReady || subMode !== 'scanner') {
      return;
    }

    let cancelled = false;

    const runDetectionTick = async () => {
      if (cancelled) return;
      const video = videoRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0 && !isDetectingRef.current) {
        isDetectingRef.current = true;
        try {
          const result = await extractFaceDescriptor(video, {
            inputSize: 320,
            scoreThreshold: 0.45,
            mirrorThumbnail: cameraFacing === 'user',
          });

          if (!cancelled) {
            if (result) {
              setLiveDetectionBox(result.box);
              if (enrolledStudents.length === 0) {
                setLiveStatusText('Wajah terdeteksi, namun belum ada data wajah siswa terdaftar.');
                drawFaceOverlay(overlayCanvasRef.current, video, result.box, {
                  label: 'Wajah Terdeteksi (Belum Terdaftar)',
                  matched: false,
                  mirrored: cameraFacing === 'user',
                });
              } else {
                const match = findBestFaceMatch(result.descriptor, enrolledStudents, 0.48);
                if (match) {
                  const firstName = match.matched.nama.split(' ')[0];
                  setLiveStatusText(`Cocok: ${match.matched.nama} (${match.confidencePercent}%)`);
                  drawFaceOverlay(overlayCanvasRef.current, video, result.box, {
                    label: `${firstName} (${match.confidencePercent}%)`,
                    matched: true,
                    mirrored: cameraFacing === 'user',
                  });
                  handleRecognizedStudent(match.matched, match.confidencePercent, result.thumbnailUrl);
                } else {
                  setLiveStatusText('Wajah terdeteksi — tidak cocok dengan wajah siswa yang terdaftar.');
                  drawFaceOverlay(overlayCanvasRef.current, video, result.box, {
                    label: 'Wajah Belum Dikenal',
                    matched: false,
                    mirrored: cameraFacing === 'user',
                  });
                }
              }
            } else {
              setLiveDetectionBox(null);
              setLiveStatusText(
                enrolledStudents.length > 0
                  ? 'Arahkan wajah siswa ke kamera dengan pencahayaan cukup...'
                  : 'Belum ada data wajah terdaftar. Buka tab "Daftarkan Wajah Siswa".'
              );
              drawFaceOverlay(overlayCanvasRef.current, video, null);
            }
          }
        } catch (err) {
          console.warn('Face tick notice:', err);
        } finally {
          isDetectingRef.current = false;
        }
      }

      if (!cancelled) {
        loopTimerRef.current = window.setTimeout(runDetectionTick, 350);
      }
    };

    loopTimerRef.current = window.setTimeout(runDetectionTick, 400);

    return () => {
      cancelled = true;
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [isCameraActive, isModelReady, subMode, enrolledStudents, cameraFacing, selectedStatus, absensiList]);

  // Upload test photo to scan face attendance
  const handleScanUploadedFacePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      setLiveStatusText('Menganalisis foto wajah...');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(String(ev.target?.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
        reader.readAsDataURL(file);
      });

      const res = await extractFaceFromImageUrl(dataUrl);
      if (!res) {
        playBeep('error');
        setLiveStatusText('Wajah tidak terdeteksi pada foto tersebut. Gunakan foto wajah yang jelas dan menghadap depan.');
        return;
      }

      if (enrolledStudents.length === 0) {
        playBeep('warning');
        setLiveStatusText('Wajah terdeteksi, namun belum ada data wajah siswa yang terdaftar.');
        return;
      }

      const match = findBestFaceMatch(res.descriptor, enrolledStudents, 0.50);
      if (match) {
        setLiveStatusText(`Cocok: ${match.matched.nama} (${match.confidencePercent}%)`);
        handleRecognizedStudent(match.matched, match.confidencePercent, res.thumbnailUrl);
      } else {
        playBeep('error');
        setLiveStatusText('Wajah tidak cocok dengan siswa yang terdaftar. Pastikan siswa sudah mendaftarkan wajah.');
      }
    } catch (err: any) {
      setLiveStatusText(err?.message || 'Gagal memproses foto wajah.');
    }
  };

  // ===================== ENROLLMENT HANDLERS =====================
  const stopEnrollCamera = () => {
    if (enrollStreamRef.current) {
      enrollStreamRef.current.getTracks().forEach(t => t.stop());
      enrollStreamRef.current = null;
    }
    setIsEnrollCameraActive(false);
  };

  const startEnrollCamera = async (facing: 'user' | 'environment' = enrollCameraFacing) => {
    stopEnrollCamera();
    setEnrollNotice(null);
    try {
      if (!isModelReady) {
        setIsModelLoading(true);
        await loadFaceModels();
        setIsModelReady(true);
        setIsModelLoading(false);
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      enrollStreamRef.current = stream;
      setIsEnrollCameraActive(true);
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = stream;
        enrollVideoRef.current.play().catch(console.warn);
      }
    } catch (err: any) {
      setIsModelLoading(false);
      setEnrollNotice({
        type: 'error',
        text: err?.message || 'Tidak dapat mengakses kamera. Anda tetap bisa mengunggah foto siswa.',
      });
    }
  };

  useEffect(() => {
    if (isEnrollCameraActive && enrollVideoRef.current && enrollStreamRef.current) {
      enrollVideoRef.current.srcObject = enrollStreamRef.current;
      enrollVideoRef.current.play().catch(console.warn);
    }
  }, [isEnrollCameraActive]);

  const saveStudentFaceBiometric = (student: User, descriptor: number[], previewUrl: string) => {
    if (!onUpdateUser) {
      setEnrollNotice({
        type: 'error',
        text: 'Fungsi penyimpanan profil belum tersedia di halaman ini.',
      });
      return;
    }

    const updated: User = {
      ...student,
      faceDescriptor: descriptor,
      facePreviewUrl: previewUrl || student.facePreviewUrl,
      faceEnrolledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdateUser(updated);
    setEnrollingStudent(updated);
    playBeep('success');
    setEnrollNotice({
      type: 'success',
      text: `Data wajah ${student.nama} berhasil disimpan dan siap digunakan untuk Absen Wajah!`,
    });
  };

  const handleCaptureEnrollFromCamera = async () => {
    if (!enrollingStudent || !enrollVideoRef.current) return;
    setIsProcessingEnroll(true);
    setEnrollNotice(null);
    try {
      const res = await extractFaceDescriptor(enrollVideoRef.current, {
        inputSize: 416,
        scoreThreshold: 0.4,
        mirrorThumbnail: enrollCameraFacing === 'user',
      });
      if (!res) {
        playBeep('error');
        setEnrollNotice({
          type: 'error',
          text: 'Wajah belum terdeteksi jelas. Pastikan wajah menghadap kamera dan pencahayaan terang.',
        });
      } else {
        saveStudentFaceBiometric(enrollingStudent, res.descriptor, res.thumbnailUrl);
        stopEnrollCamera();
      }
    } catch (err: any) {
      setEnrollNotice({ type: 'error', text: err?.message || 'Gagal mengekstrak wajah.' });
    } finally {
      setIsProcessingEnroll(false);
    }
  };

  const handleUploadEnrollPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !enrollingStudent) return;
    e.target.value = '';

    setIsProcessingEnroll(true);
    setEnrollNotice(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(String(ev.target?.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
        reader.readAsDataURL(file);
      });

      const res = await extractFaceFromImageUrl(dataUrl);
      if (!res) {
        playBeep('error');
        setEnrollNotice({
          type: 'error',
          text: 'Tidak dapat mendeteksi wajah pada foto ini. Pilih foto wajah close-up menghadap depan.',
        });
      } else {
        saveStudentFaceBiometric(enrollingStudent, res.descriptor, res.thumbnailUrl);
      }
    } catch (err: any) {
      setEnrollNotice({ type: 'error', text: err?.message || 'Gagal memproses foto wajah.' });
    } finally {
      setIsProcessingEnroll(false);
    }
  };

  const handleEnrollFromProfilePhoto = async (student: User) => {
    if (!student.fotoProfilUrl) return;
    setIsProcessingEnroll(true);
    setEnrollNotice(null);
    try {
      const res = await extractFaceFromImageUrl(student.fotoProfilUrl);
      if (!res) {
        playBeep('error');
        setEnrollNotice({
          type: 'error',
          text: 'Foto profil siswa ini belum terdeteksi wajahnya secara jelas. Gunakan kamera atau unggah foto baru.',
        });
      } else {
        saveStudentFaceBiometric(student, res.descriptor, res.thumbnailUrl);
      }
    } catch (err: any) {
      setEnrollNotice({ type: 'error', text: err?.message || 'Gagal memproses foto profil.' });
    } finally {
      setIsProcessingEnroll(false);
    }
  };

  const handleRemoveFaceData = (student: User) => {
    if (!onUpdateUser) return;
    const updated: User = {
      ...student,
      faceDescriptor: undefined,
      facePreviewUrl: undefined,
      faceEnrolledAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    onUpdateUser(updated);
    if (enrollingStudent?.id === student.id) {
      setEnrollingStudent(updated);
    }
    setEnrollNotice({
      type: 'success',
      text: `Data biometrik wajah ${student.nama} telah dihapus.`,
    });
  };

  // Bulk extract face descriptors for students who have fotoProfilUrl but no faceDescriptor yet
  const studentsWithProfilePhotoPending = useMemo(
    () =>
      siswaList.filter(
        s =>
          s.fotoProfilUrl &&
          (!Array.isArray(s.faceDescriptor) || s.faceDescriptor.length !== 128)
      ),
    [siswaList]
  );

  const handleBulkEnrollFromProfiles = async () => {
    if (!onUpdateUser || studentsWithProfilePhotoPending.length === 0) return;
    setIsBulkEnrolling(true);
    setEnrollNotice(null);
    let successCount = 0;
    try {
      await loadFaceModels();
      for (const s of studentsWithProfilePhotoPending) {
        try {
          const res = await extractFaceFromImageUrl(s.fotoProfilUrl!);
          if (res) {
            onUpdateUser({
              ...s,
              faceDescriptor: res.descriptor,
              facePreviewUrl: res.thumbnailUrl,
              faceEnrolledAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            successCount++;
          }
        } catch {}
      }
      playBeep(successCount > 0 ? 'success' : 'warning');
      setEnrollNotice({
        type: successCount > 0 ? 'success' : 'error',
        text:
          successCount > 0
            ? `Berhasil mengekstrak & mendaftarkan ${successCount} data wajah siswa dari foto profil!`
            : 'Tidak ada wajah yang dapat diekstrak dari foto profil yang tersedia.',
      });
    } finally {
      setIsBulkEnrolling(false);
    }
  };

  // Filtered list for enrollment tab
  const filteredEnrollList = useMemo(() => {
    return siswaList.filter(s => {
      if (enrollKelasFilter !== 'Semua' && !isSameKelas(s.kelas || s.namaKelas, enrollKelasFilter)) {
        return false;
      }
      const isEnrolled = Array.isArray(s.faceDescriptor) && s.faceDescriptor.length === 128;
      if (enrollStatusFilter === 'terdaftar' && !isEnrolled) return false;
      if (enrollStatusFilter === 'belum' && isEnrolled) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (s.nama || '').toLowerCase().includes(q);
        const matchNipd = (s.nipd || s.nipOrNis || '').toLowerCase().includes(q);
        if (!matchName && !matchNipd) return false;
      }
      return true;
    });
  }, [siswaList, enrollKelasFilter, enrollStatusFilter, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Header & Sub-Mode Toggle */}
      <div className="bg-gradient-to-r from-cyan-900 via-teal-900 to-emerald-900 rounded-2xl p-4 sm:p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md border border-cyan-500/30">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-cyan-500/25 border border-cyan-400/50 flex items-center justify-center shrink-0">
            <ScanFace className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm sm:text-base text-white">
                Absen Wajah Otomatis (AI Face Recognition)
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 font-black text-[9px] uppercase">
                Biometrik Real-Time
              </span>
            </div>
            <p className="text-[11px] text-cyan-100/90 mt-0.5">
              Deteksi wajah siswa langsung lewat kamera tanpa kartu fisik. Total wajah terdaftar:{' '}
              <strong className="text-white">{enrolledStudents.length} / {siswaList.length} siswa</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubMode('scanner')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              subMode === 'scanner'
                ? 'bg-white text-slate-900 shadow-md'
                : 'bg-white/10 text-cyan-100 hover:bg-white/20'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Pemindai Wajah</span>
          </button>

          {onUpdateUser && (
            <button
              type="button"
              onClick={() => setSubMode('enroll')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                subMode === 'enroll'
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'bg-white/10 text-cyan-100 hover:bg-white/20'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Daftar Wajah ({enrolledStudents.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSound}
            className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                : 'bg-white/10 border-white/20 text-slate-300'
            }`}
            title={soundEnabled ? 'Suara & Ucapan Terima Kasih Aktif' : 'Suara Nonaktif'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Model loading / error status */}
      {isModelLoading && (
        <div className="p-3.5 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-900 text-xs font-bold flex items-center gap-2.5">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-600 shrink-0" />
          <span>Sedang memuat model AI pengenalan wajah (hanya sekali di awal sesi)...</span>
        </div>
      )}

      {modelError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{modelError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setModelError(null);
              setIsModelLoading(true);
              loadFaceModels()
                .then(() => { setIsModelReady(true); setIsModelLoading(false); })
                .catch((e: any) => { setIsModelLoading(false); setModelError(e?.message || 'Gagal memuat model'); });
            }}
            className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* ==================== MODE 1: LIVE FACE SCANNER ==================== */}
      {subMode === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Camera & Controls */}
          <div className="lg:col-span-7 space-y-4">
            {/* Status Selector */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-2.5">
              <label className="text-xs font-bold text-slate-700 block">
                Status Kehadiran yang Direkam saat Wajah Cocok:
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(['Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alpa'] as const).map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onChangeStatus(status)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                      selectedStatus === status
                        ? status === 'Hadir' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' :
                          status === 'Terlambat' ? 'bg-amber-600 text-white border-amber-600 shadow-sm' :
                          status === 'Sakit' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' :
                          status === 'Izin' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' :
                          'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty enrolled warning */}
            {enrolledStudents.length === 0 && onUpdateUser && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold">Belum Ada Data Wajah Siswa Terdaftar</div>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Daftarkan minimal 1 wajah siswa terlebih dahulu (melalui kamera atau unggah foto) agar sistem dapat mengenali wajah secara otomatis.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubMode('enroll')}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 shadow-xs cursor-pointer"
                >
                  Daftarkan Wajah Sekarang
                </button>
              </div>
            )}

            {/* Camera Viewfinder */}
            <div className="bg-slate-950 rounded-3xl p-5 text-white space-y-4 border-2 border-slate-800 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isCameraActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-500'}`} />
                  <span className="text-xs font-bold text-cyan-300">
                    {isCameraActive ? 'Pemindai Wajah AI Aktif' : 'Kamera Wajah Siap'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isCameraActive && (
                    <button
                      type="button"
                      onClick={toggleScannerFacing}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 border border-slate-700 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{cameraFacing === 'user' ? 'Depan' : 'Belakang'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (isCameraActive) stopScannerCamera();
                      else startScannerCamera(cameraFacing);
                    }}
                    disabled={isModelLoading}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isCameraActive
                        ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-md'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isCameraActive ? 'Tutup Kamera' : 'Buka Kamera Wajah'}</span>
                  </button>
                </div>
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Square 1:1 Face Frame */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-64 h-64 sm:w-72 sm:h-72 aspect-square rounded-3xl overflow-hidden bg-slate-900 border-2 border-cyan-500/60 shadow-2xl flex items-center justify-center">
                  {/* Face guide oval */}
                  {!showThankYouOverlay && (
                    <div className="absolute inset-8 rounded-full border-2 border-dashed border-cyan-400/35 pointer-events-none z-10" />
                  )}

                  {isCameraActive ? (
                    <>
                      <video
                        ref={el => {
                          videoRef.current = el;
                          if (el && streamRef.current && el.srcObject !== streamRef.current) {
                            el.srcObject = streamRef.current;
                            el.play().catch(console.warn);
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                      />
                      <canvas
                        ref={overlayCanvasRef}
                        className="absolute inset-0 w-full h-full pointer-events-none z-20"
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <div className="w-20 h-20 rounded-full bg-cyan-500/10 border-2 border-dashed border-cyan-400/50 flex items-center justify-center text-cyan-400">
                        <ScanFace className="w-10 h-10 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white">Kamera Absen Wajah</div>
                        <p className="text-[10px] text-slate-400 max-w-[200px]">
                          Klik "Buka Kamera Wajah" untuk memindai wajah siswa secara otomatis dan real-time.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Celebratory Thank You Overlay when face recognized */}
                  {showThankYouOverlay && lastRecognized && (
                    <div className="absolute inset-0 z-30 bg-emerald-950/92 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
                      {lastRecognized.thumbnailUrl ? (
                        <img
                          src={lastRecognized.thumbnailUrl}
                          alt={lastRecognized.student.nama}
                          className="w-16 h-16 rounded-full object-cover border-2 border-emerald-400 shadow-lg"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase">
                          {lastRecognized.isNew ? `Cocok ${lastRecognized.confidence}%` : 'Sudah Terabsen'}
                        </span>
                        <h4 className="text-sm sm:text-base font-black text-white leading-snug">
                          Terima Kasih, {lastRecognized.student.nama.split(' ')[0]}!
                        </h4>
                        <p className="text-[11px] text-emerald-100 line-clamp-1">
                          {lastRecognized.student.nama} • {lastRecognized.record.kelas}
                        </p>
                        <p className="text-[10px] text-emerald-300 font-semibold">
                          Status: {lastRecognized.record.status} ({lastRecognized.record.waktu} WIB)
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live AI status bar */}
                <div className="mt-3 w-full max-w-md px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-center">
                  <span className={`text-[11px] font-semibold ${liveDetectionBox ? 'text-cyan-300' : 'text-slate-300'}`}>
                    {liveStatusText}
                  </span>
                </div>
              </div>

              {/* Alternative: Upload photo test */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="text-[11px] text-slate-400">
                  Tidak ada webcam? Uji/absen via unggah foto wajah siswa:
                </span>
                <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-[11px] inline-flex items-center gap-1.5 border border-slate-700">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Scan dari Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleScanUploadedFacePhoto}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Right: Last Recognized Card & Today Feed */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Hasil Deteksi Wajah Terakhir</span>
              </h4>

              {lastRecognized ? (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{lastRecognized.isNew ? 'Absen Wajah Berhasil' : 'Sudah Terabsen Hari Ini'}</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-800">
                      {lastRecognized.record.waktu} WIB
                    </span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    {lastRecognized.thumbnailUrl ? (
                      <img
                        src={lastRecognized.thumbnailUrl}
                        alt={lastRecognized.student.nama}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-400 shadow-sm shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-emerald-200 text-emerald-900 font-black text-2xl flex items-center justify-center shrink-0">
                        {lastRecognized.student.nama.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h5 className="font-black text-slate-900 text-base truncate">{lastRecognized.student.nama}</h5>
                      <div className="text-xs text-slate-600 font-mono">NIPD: {lastRecognized.record.nipd}</div>
                      <div className="text-xs text-emerald-700 font-bold mt-0.5">
                        {lastRecognized.record.kelas} • Kemiripan {lastRecognized.confidence}%
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-black">Terima Kasih, {lastRecognized.student.nama.split(' ')[0]}!</div>
                      <div className="text-[11px] text-emerald-50">
                        {lastRecognized.isNew
                          ? `Kehadiran (${lastRecognized.record.status}) telah berhasil direkam melalui Absen Wajah.`
                          : `Presensi Anda sudah tercatat sebelumnya pukul ${lastRecognized.record.waktu} WIB.`}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
                  <ScanFace className="w-10 h-10 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">Menunggu Wajah Siswa</div>
                  <p className="text-[11px] text-slate-400">
                    Saat kamera mendeteksi wajah siswa yang terdaftar, sistem otomatis mencatat kehadiran & menampilkan ucapan terima kasih.
                  </p>
                </div>
              )}
            </div>

            {/* Today's face attendance log */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  Absen Wajah Hari Ini ({todayFaceRecords.length})
                </span>
                <span className="text-[10px] font-mono text-slate-400">{todayStr}</span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {todayFaceRecords.length > 0 ? (
                  todayFaceRecords.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {r.fotoBukti ? (
                          <img src={r.fotoBukti} alt={r.namaSiswa} className="w-8 h-8 rounded-full object-cover border border-emerald-300 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center shrink-0">
                            {r.namaSiswa.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">{r.namaSiswa}</div>
                          <div className="text-[10px] text-slate-500">
                            {r.kelas} • {r.waktu} WIB
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] shrink-0">
                        {r.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-4">
                    Belum ada siswa yang absen menggunakan Face ID hari ini.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODE 2: FACE ENROLLMENT ==================== */}
      {subMode === 'enroll' && (
        <div className="space-y-4">
          {enrollNotice && (
            <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 border ${
              enrollNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}>
              <div className="flex items-center gap-2">
                {enrollNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{enrollNotice.text}</span>
              </div>
              <button type="button" onClick={() => setEnrollNotice(null)} className="text-xs px-2 py-0.5 rounded hover:bg-black/5">
                ✕
              </button>
            </div>
          )}

          {/* Enrollment Capture Panel when a student is selected */}
          {enrollingStudent && (
            <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-cyan-400 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  {enrollingStudent.facePreviewUrl || enrollingStudent.fotoProfilUrl ? (
                    <img
                      src={enrollingStudent.facePreviewUrl || enrollingStudent.fotoProfilUrl}
                      alt={enrollingStudent.nama}
                      className="w-11 h-11 rounded-full object-cover border border-cyan-300"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-cyan-100 text-cyan-800 font-black flex items-center justify-center">
                      {enrollingStudent.nama.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h4 className="font-black text-slate-900 text-sm sm:text-base">
                      Pendaftaran Wajah: {enrollingStudent.nama}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Kelas: {enrollingStudent.kelas || enrollingStudent.namaKelas} • NIPD: {enrollingStudent.nipd || enrollingStudent.nipOrNis}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopEnrollCamera();
                    setEnrollingStudent(null);
                  }}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                {/* Camera Capture Box */}
                <div className="bg-slate-950 rounded-2xl p-4 text-white space-y-3">
                  <div className="relative w-52 h-52 mx-auto rounded-2xl overflow-hidden bg-slate-900 border-2 border-cyan-500/60 flex items-center justify-center">
                    {isEnrollCameraActive ? (
                      <video
                        ref={el => {
                          enrollVideoRef.current = el;
                          if (el && enrollStreamRef.current && el.srcObject !== enrollStreamRef.current) {
                            el.srcObject = enrollStreamRef.current;
                            el.play().catch(console.warn);
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${enrollCameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                      />
                    ) : (
                      <div className="text-center p-4 space-y-2">
                        <Camera className="w-10 h-10 text-slate-500 mx-auto" />
                        <p className="text-[11px] text-slate-400">Aktifkan kamera untuk mengambil sampel wajah siswa</p>
                      </div>
                    )}
                    <div className="absolute inset-6 rounded-full border-2 border-dashed border-cyan-400/40 pointer-events-none" />
                  </div>

                  <div className="flex flex-wrap justify-center gap-2">
                    {!isEnrollCameraActive ? (
                      <button
                        type="button"
                        onClick={() => startEnrollCamera(enrollCameraFacing)}
                        className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Buka Kamera</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleCaptureEnrollFromCamera}
                          disabled={isProcessingEnroll}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          {isProcessingEnroll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>Ambil & Simpan Wajah</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = enrollCameraFacing === 'user' ? 'environment' : 'user';
                            setEnrollCameraFacing(next);
                            startEnrollCamera(next);
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Alternative Options */}
                <div className="space-y-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-800">Alternatif Unggah Foto Wajah:</div>
                    <p className="text-[11px] text-slate-500">
                      Unggah pas foto atau swafoto siswa yang jelas menghadap ke depan tanpa masker/kacamata gelap.
                    </p>
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isProcessingEnroll ? 'Memproses...' : 'Pilih Foto dari Perangkat'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadEnrollPhoto}
                        disabled={isProcessingEnroll}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {enrollingStudent.fotoProfilUrl && (
                    <div className="p-3.5 rounded-2xl bg-cyan-50 border border-cyan-200 flex items-center justify-between gap-3">
                      <div className="text-[11px] text-cyan-900">
                        <span className="font-bold block">Foto Profil Tersedia</span>
                        <span>Ekstrak biometrik wajah langsung dari foto profil siswa.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnrollFromProfilePhoto(enrollingStudent)}
                        disabled={isProcessingEnroll}
                        className="px-3 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                      >
                        Pakai Foto Profil
                      </button>
                    </div>
                  )}

                  {Array.isArray(enrollingStudent.faceDescriptor) && enrollingStudent.faceDescriptor.length === 128 && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                      <span className="text-emerald-800 font-bold text-[11px]">
                        ✓ Wajah sudah terdaftar di sistem.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFaceData(enrollingStudent)}
                        className="text-rose-600 hover:text-rose-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar & Bulk Profile Extraction */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Cari nama siswa atau NIPD..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <select
                  value={enrollKelasFilter}
                  onChange={e => setEnrollKelasFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                >
                  <option value="Semua">Semua Kelas</option>
                  {availableClassNames.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <select
                  value={enrollStatusFilter}
                  onChange={e => setEnrollStatusFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                >
                  <option value="semua">Semua Status ({siswaList.length})</option>
                  <option value="terdaftar">Sudah Daftar Wajah ({enrolledStudents.length})</option>
                  <option value="belum">Belum Daftar ({siswaList.length - enrolledStudents.length})</option>
                </select>
              </div>

              {studentsWithProfilePhotoPending.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkEnrollFromProfiles}
                  disabled={isBulkEnrolling}
                  className="px-3.5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                >
                  {isBulkEnrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  <span>Ekstrak Otomatis dari Foto Profil ({studentsWithProfilePhotoPending.length})</span>
                </button>
              )}
            </div>

            {/* Students Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1 pt-1">
              {filteredEnrollList.map(s => {
                const isEnrolled = Array.isArray(s.faceDescriptor) && s.faceDescriptor.length === 128;
                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 transition-all ${
                      isEnrolled ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {s.facePreviewUrl || s.fotoProfilUrl ? (
                        <img
                          src={s.facePreviewUrl || s.fotoProfilUrl}
                          alt={s.nama}
                          className={`w-10 h-10 rounded-full object-cover border shrink-0 ${
                            isEnrolled ? 'border-emerald-400' : 'border-slate-300'
                          }`}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0">
                          {s.nama.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs truncate">{s.nama}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {s.kelas || s.namaKelas} • {s.nipd || s.nipOrNis}
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            isEnrolled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isEnrolled ? '✓ Wajah Terdaftar' : 'Belum Terdaftar'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEnrollingStudent(s);
                        setEnrollNotice(null);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                        isEnrolled
                          ? 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs'
                      }`}
                    >
                      {isEnrolled ? 'Perbarui' : 'Daftarkan'}
                    </button>
                  </div>
                );
              })}

              {filteredEnrollList.length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-slate-400">
                  Tidak ada siswa yang sesuai dengan pencarian / filter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
