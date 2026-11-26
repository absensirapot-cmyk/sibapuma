import React, { useState, useEffect, useRef } from 'react';
import { User, AbsensiRecord } from '../types';
import {
  loadFaceModels,
  areFaceModelsLoaded,
  extractFaceDescriptor,
  extractFaceFromImageUrl,
  verifySelfFaceMatch,
  drawFaceOverlay,
} from '../utils/faceRecognition';
import {
  isRecordForStudent,
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
  Sparkles,
  Upload,
  Loader2,
  ShieldCheck,
  X,
  RefreshCw,
} from 'lucide-react';

interface FaceSelfAttendanceModalProps {
  currentUser: User;
  absensiList: AbsensiRecord[];
  onAddAbsensi: (record: AbsensiRecord) => void;
  onUpdateProfile: (updatedUser: User) => void;
  onClose: () => void;
}

export const FaceSelfAttendanceModal: React.FC<FaceSelfAttendanceModalProps> = ({
  currentUser,
  absensiList,
  onAddAbsensi,
  onUpdateProfile,
  onClose,
}) => {
  const hasEnrolledFace =
    Array.isArray(currentUser.faceDescriptor) && currentUser.faceDescriptor.length === 128;

  const [mode, setMode] = useState<'verify' | 'enroll'>(hasEnrolledFace ? 'verify' : 'enroll');
  const [isModelReady, setIsModelReady] = useState<boolean>(areFaceModelsLoaded());
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    hasEnrolledFace
      ? 'Arahkan wajah Anda ke kamera untuk verifikasi absensi.'
      : 'Daftarkan wajah Anda sekali agar bisa langsung absen wajah setiap hari.'
  );
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [verifiedData, setVerifiedData] = useState<{
    waktu: string;
    confidence: number;
    thumbnailUrl?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const isTickingRef = useRef<boolean>(false);
  const autoCloseRef = useRef<number | null>(null);

  const todayStr = getLocalDateString();
  const alreadyToday = absensiList.find(a => isRecordForStudent(a, currentUser) && a.tanggal === todayStr);

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  };

  const stopCamera = () => {
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    drawFaceOverlay(overlayCanvasRef.current, videoRef.current, null);
  };

  const startCamera = async (facing: 'user' | 'environment' = cameraFacing) => {
    stopCamera();
    setCameraError(null);
    try {
      if (!areFaceModelsLoaded()) {
        setIsModelLoading(true);
        await loadFaceModels();
        setIsModelReady(true);
        setIsModelLoading(false);
      } else {
        setIsModelReady(true);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.warn);
      }
    } catch (err: any) {
      setIsModelLoading(false);
      setCameraError(
        err?.message || 'Kamera tidak dapat diakses atau izin ditolak. Anda juga dapat mengunggah foto wajah di bawah.'
      );
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera('user');
    return () => {
      stopCamera();
      if (autoCloseRef.current) window.clearTimeout(autoCloseRef.current);
    };
  }, []);

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.warn);
    }
  }, [isCameraActive]);

  const recordVerifiedAttendance = (confidence: number, thumbnailUrl?: string) => {
    if (!isHariSekolahEfektif(todayStr)) {
      const alasan = getAlasanHariTidakEfektif(todayStr) || 'Hari Libur';
      setNotice({
        type: 'error',
        text: `Hari ini (${getNamaHariIndo(todayStr)}, ${todayStr}) adalah ${alasan}. Tidak ada presensi.`,
      });
      stopCamera();
      return;
    }

    if (alreadyToday) {
      setNotice({
        type: 'error',
        text: `Anda sudah tercatat presensi hari ini (${alreadyToday.status}) pukul ${alreadyToday.waktu} WIB.`,
      });
      stopCamera();
      return;
    }

    const now = new Date();
    const timeStr = getLocalTimeString(now);

    const record: AbsensiRecord = {
      id: createDeterministicAbsensiId(todayStr, currentUser),
      userId: currentUser.id,
      tanggal: todayStr,
      waktu: timeStr,
      nipd: currentUser.nipd || currentUser.nipOrNis,
      nisn: currentUser.nisn || currentUser.username,
      namaSiswa: currentUser.nama,
      kelas: (currentUser.kelas || currentUser.namaKelas || 'X Farmasi 1').replace(/^Kelas\s+/i, ''),
      status: 'Hadir',
      metode: 'Absen Wajah Mandiri',
      petugas: 'Siswa Mandiri (AI Face Recognition)',
      keterangan: `Presensi wajah mandiri terverifikasi otomatis (Kemiripan ${confidence}%)`,
      fotoBukti: thumbnailUrl || currentUser.facePreviewUrl,
    };

    onAddAbsensi(record);
    playChime();
    if (navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch {}
    }

    setVerifiedData({
      waktu: timeStr,
      confidence,
      thumbnailUrl: thumbnailUrl || currentUser.facePreviewUrl,
    });
    stopCamera();

    autoCloseRef.current = window.setTimeout(() => {
      onClose();
    }, 4500);
  };

  // Continuous live loop for verify or enroll detection box
  useEffect(() => {
    if (!isCameraActive || !isModelReady || verifiedData) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0 && !isTickingRef.current) {
        isTickingRef.current = true;
        try {
          const detected = await extractFaceDescriptor(video, {
            inputSize: 320,
            scoreThreshold: 0.45,
            mirrorThumbnail: cameraFacing === 'user',
          });

          if (!cancelled) {
            if (detected) {
              if (mode === 'enroll') {
                setStatusMessage('Wajah terdeteksi jelas! Tekan "Simpan Wajah Saya".');
                drawFaceOverlay(overlayCanvasRef.current, video, detected.box, {
                  label: 'Siap Didaftarkan',
                  matched: true,
                  mirrored: cameraFacing === 'user',
                });
              } else {
                const verify = verifySelfFaceMatch(detected.descriptor, currentUser, 0.50);
                if (verify.isMatch) {
                  setStatusMessage(`Wajah Terverifikasi (${verify.confidencePercent}%)!`);
                  drawFaceOverlay(overlayCanvasRef.current, video, detected.box, {
                    label: `Terverifikasi (${verify.confidencePercent}%)`,
                    matched: true,
                    mirrored: cameraFacing === 'user',
                  });
                  recordVerifiedAttendance(verify.confidencePercent, detected.thumbnailUrl);
                  isTickingRef.current = false;
                  return;
                } else {
                  setStatusMessage(
                    `Wajah terdeteksi (kemiripan ${verify.confidencePercent}%). Pastikan pencahayaan terang dan menghadap kamera.`
                  );
                  drawFaceOverlay(overlayCanvasRef.current, video, detected.box, {
                    label: `Mencocokkan (${verify.confidencePercent}%)`,
                    matched: false,
                    mirrored: cameraFacing === 'user',
                  });
                }
              }
            } else {
              setStatusMessage('Posisikan wajah Anda di dalam lingkaran kamera...');
              drawFaceOverlay(overlayCanvasRef.current, video, null);
            }
          }
        } catch (err) {
          console.warn('Self face tick notice:', err);
        } finally {
          isTickingRef.current = false;
        }
      }

      if (!cancelled) {
        loopTimerRef.current = window.setTimeout(tick, 380);
      }
    };

    loopTimerRef.current = window.setTimeout(tick, 400);

    return () => {
      cancelled = true;
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [isCameraActive, isModelReady, mode, verifiedData, cameraFacing, currentUser, alreadyToday]);

  const handleEnrollCapture = async () => {
    if (!videoRef.current) return;
    setIsBusy(true);
    setNotice(null);
    try {
      const res = await extractFaceDescriptor(videoRef.current, {
        inputSize: 416,
        scoreThreshold: 0.4,
        mirrorThumbnail: cameraFacing === 'user',
      });
      if (!res) {
        setNotice({
          type: 'error',
          text: 'Wajah tidak terdeteksi jelas. Posisikan wajah tepat di tengah kamera dengan cahaya terang.',
        });
      } else {
        const updatedUser: User = {
          ...currentUser,
          faceDescriptor: res.descriptor,
          facePreviewUrl: res.thumbnailUrl || currentUser.fotoProfilUrl,
          faceEnrolledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onUpdateProfile(updatedUser);
        playChime();
        setNotice({
          type: 'success',
          text: 'Wajah Anda berhasil didaftarkan! Sekarang mengarahkan ke verifikasi absensi...',
        });
        setMode('verify');
        setStatusMessage('Arahkan wajah ke kamera untuk mencatat kehadiran hari ini...');
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal mendaftarkan wajah.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleUploadSelfPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsBusy(true);
    setNotice(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(String(ev.target?.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca foto.'));
        reader.readAsDataURL(file);
      });

      const res = await extractFaceFromImageUrl(dataUrl);
      if (!res) {
        setNotice({
          type: 'error',
          text: 'Wajah tidak terdeteksi pada foto. Gunakan foto selfie yang jelas menghadap ke depan.',
        });
        setIsBusy(false);
        return;
      }

      if (mode === 'enroll') {
        const updatedUser: User = {
          ...currentUser,
          faceDescriptor: res.descriptor,
          facePreviewUrl: res.thumbnailUrl || currentUser.fotoProfilUrl,
          faceEnrolledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onUpdateProfile(updatedUser);
        playChime();
        setNotice({
          type: 'success',
          text: 'Wajah berhasil didaftarkan dari foto! Anda sekarang dapat melakukan verifikasi absen wajah.',
        });
        setMode('verify');
      } else {
        const verify = verifySelfFaceMatch(res.descriptor, currentUser, 0.50);
        if (verify.isMatch) {
          recordVerifiedAttendance(verify.confidencePercent, res.thumbnailUrl);
        } else {
          setNotice({
            type: 'error',
            text: `Wajah pada foto tidak cocok dengan data wajah terdaftar (${verify.confidencePercent}%).`,
          });
        }
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal memproses foto.' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-7 max-w-lg w-full max-h-[92dvh] overflow-y-auto shadow-2xl space-y-4 border border-slate-200 my-0 sm:my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-cyan-100 text-cyan-800">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {mode === 'enroll' ? 'Daftar Wajah Siswa (Face ID)' : 'Absen Wajah Mandiri (Face ID)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {mode === 'enroll'
                  ? 'Rekam wajah Anda sekali untuk aktivasi presensi wajah otomatis'
                  : 'Verifikasi wajah Anda secara langsung di depan kamera'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {notice && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
              notice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        {/* Success / Thank-You Screen */}
        {verifiedData ? (
          <div className="py-5 px-4 rounded-3xl bg-gradient-to-br from-emerald-50 via-cyan-50 to-white border-2 border-emerald-300 text-center space-y-4 shadow-inner">
            <div className="relative mx-auto w-20 h-20">
              {verifiedData.thumbnailUrl ? (
                <img
                  src={verifiedData.thumbnailUrl}
                  alt={currentUser.nama}
                  className="w-20 h-20 rounded-full object-cover border-4 border-emerald-500 shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg">
                  <CheckCircle2 className="w-11 h-11" />
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4" />
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold uppercase">
                Wajah Terverifikasi ({verifiedData.confidence}%)
              </div>
              <h4 className="text-xl sm:text-2xl font-black text-slate-900">
                Terima Kasih, {currentUser.nama.split(' ')[0]}!
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
                Presensi wajah Anda telah berhasil tercatat pada pukul{' '}
                <span className="font-bold text-emerald-700">{verifiedData.waktu} WIB</span>.
                Terima kasih telah hadir dan menjaga kedisiplinan hari ini!
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (autoCloseRef.current) window.clearTimeout(autoCloseRef.current);
                onClose();
              }}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-md"
            >
              Selesai & Tutup
            </button>
          </div>
        ) : (
          <>
            {alreadyToday && mode === 'verify' && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Anda sudah terabsen hari ini ({alreadyToday.status}) pukul {alreadyToday.waktu} WIB.
                </span>
              </div>
            )}

            {isModelLoading && (
              <div className="p-3 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-900 text-xs font-bold flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-600 shrink-0" />
                <span>Memuat model AI pengenalan wajah...</span>
              </div>
            )}

            {/* Camera Viewfinder */}
            <div className="bg-slate-950 rounded-2xl p-4 text-white space-y-3 border-2 border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isCameraActive ? 'bg-cyan-400 animate-ping' : 'bg-slate-500'}`} />
                  <span className="text-xs font-bold text-cyan-300">
                    {isCameraActive ? 'Kamera Face ID Aktif' : 'Kamera Nonaktif'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isCameraActive && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = cameraFacing === 'user' ? 'environment' : 'user';
                        setCameraFacing(next);
                        startCamera(next);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
                    >
                      <RotateCw className="w-3 h-3 text-cyan-400" />
                      <span>{cameraFacing === 'user' ? 'Depan' : 'Belakang'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (isCameraActive) stopCamera();
                      else startCamera(cameraFacing);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                      isCameraActive
                        ? 'bg-rose-500/80 hover:bg-rose-600 text-white'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    }`}
                  >
                    <Camera className="w-3 h-3" />
                    <span>{isCameraActive ? 'Tutup' : 'Buka Kamera'}</span>
                  </button>
                </div>
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs space-y-2">
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => startCamera(cameraFacing)}
                    className="px-3 py-1 rounded-lg bg-white text-slate-900 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Coba Lagi</span>
                  </button>
                </div>
              )}

              <div className="relative w-56 h-56 sm:w-64 sm:h-64 aspect-square mx-auto rounded-3xl overflow-hidden bg-black border-2 border-cyan-500/60 shadow-2xl flex items-center justify-center">
                <div className="absolute inset-7 rounded-full border-2 border-dashed border-cyan-400/40 pointer-events-none z-10" />

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
                  <div className="text-center p-5 space-y-2">
                    <ScanFace className="w-12 h-12 text-slate-500 mx-auto" />
                    <span className="text-xs font-bold text-slate-300 block">Kamera Tidak Aktif</span>
                  </div>
                )}
              </div>

              <div className="text-center">
                <span className="text-[11px] text-cyan-200 font-semibold">{statusMessage}</span>
              </div>

              {mode === 'enroll' && isCameraActive && (
                <button
                  type="button"
                  onClick={handleEnrollCapture}
                  disabled={isBusy || !isModelReady}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5"
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Simpan Wajah Saya</span>
                </button>
              )}
            </div>

            {/* Alternative & Mode Toggle */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs pt-1">
              <label className="cursor-pointer text-cyan-700 hover:text-cyan-800 font-bold inline-flex items-center gap-1 text-[11px]">
                <Upload className="w-3.5 h-3.5" />
                <span>{mode === 'enroll' ? 'Daftar via Unggah Foto Selfie' : 'Verifikasi via Unggah Foto'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadSelfPhoto}
                  disabled={isBusy}
                  className="hidden"
                />
              </label>

              {hasEnrolledFace && (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setMode(prev => (prev === 'verify' ? 'enroll' : 'verify'));
                  }}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline"
                >
                  {mode === 'verify' ? 'Perbarui Data Wajah' : 'Kembali ke Verifikasi Wajah'}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center gap-1 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
                <span>Verifikasi biometrik aman di perangkat</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-xs"
              >
                Tutup
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
