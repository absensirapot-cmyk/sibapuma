import React, { useState, useEffect } from 'react';
import { Sparkles, X, AlertCircle } from 'lucide-react';
import { SoalPG, SoalIsian } from '../types';
import { requestAIRefineQuestion } from '../services/aiService';

interface RefineQuestionAIModalProps {
  target: {
    type: 'pg' | 'isian';
    index: number;
    item: SoalPG | SoalIsian;
  } | null;
  namaMapel: string;
  onClose: () => void;
  onApply: (refinedQuestion: SoalPG | SoalIsian, type: 'pg' | 'isian', index: number) => void;
}

export const RefineQuestionAIModal: React.FC<RefineQuestionAIModalProps> = ({
  target,
  namaMapel,
  onClose,
  onApply,
}) => {
  const [instruction, setInstruction] = useState('');
  const [stimulusPref, setStimulusPref] = useState<'auto' | 'chart' | 'table' | 'svg' | 'case' | 'none'>('auto');
  const [isRefining, setIsRefining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setInstruction('');
      setStimulusPref('auto');
      setErrorMsg(null);
      setIsRefining(false);
    }
  }, [target]);

  if (!target) return null;

  const handleConfirm = async () => {
    setIsRefining(true);
    setErrorMsg(null);
    try {
      const res = await requestAIRefineQuestion({
        questionType: target.type,
        question: target.item,
        instruction: instruction.trim() || undefined,
        namaMapel: namaMapel || 'Mata Pelajaran Kejuruan',
        preferredStimulusType: stimulusPref,
      });

      if (!res.success || !res.question) {
        setErrorMsg(res.error || 'Gagal memperbarui soal dengan AI.');
        return;
      }

      const refined = {
        ...target.item,
        ...res.question,
        id: target.item.id,
        nomor: target.index + 1,
      };
      onApply(refined, target.type, target.index);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menghubungi server AI.');
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-indigo-200 space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className={`w-4 h-4 ${isRefining ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h4 className="font-black text-slate-900 text-sm">
                Edit Soal {target.type === 'pg' ? 'PG' : 'Isian'} #{target.index + 1} dengan AI
              </h4>
              <p className="text-[11px] text-slate-500">
                Tingkatkan ke level HOTS, tambahkan grafik/tabel/ilustrasi, atau perbaiki kalimat soal.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isRefining}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 line-clamp-3">
          <span className="font-bold text-slate-900">Soal saat ini: </span>
          {target.item.pertanyaan}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">Pilih Aksi Cepat AI:</label>
          <div className="flex flex-wrap gap-1.5">
            {[
              {
                label: 'Tingkatkan ke HOTS + Grafik',
                instr: 'Ubah soal ini menjadi level HOTS C4-C5 dengan stimulus grafik data kuantitatif yang relevan.',
                pref: 'chart' as const,
              },
              {
                label: 'Tingkatkan ke HOTS + Tabel',
                instr: 'Ubah soal ini menjadi soal analisis HOTS berbasis tabel pengamatan atau data laboratorium.',
                pref: 'table' as const,
              },
              {
                label: 'Tambah Ilustrasi / Diagram',
                instr: 'Sempurnakan soal ini dengan menambahkan ilustrasi atau diagram SVG yang jelas untuk dianalisis siswa.',
                pref: 'svg' as const,
              },
              {
                label: 'Tambah Studi Kasus',
                instr: 'Kemas ulang soal ini dalam bentuk studi kasus kontekstual HOTS C5.',
                pref: 'case' as const,
              },
              {
                label: 'Perbaiki Pilihan Jawaban',
                instr: 'Perjelas kalimat soal, pastikan pilihan jawaban A-E setara dan pengecoh logis, serta lengkapi pembahasan.',
                pref: 'auto' as const,
              },
            ].map(preset => (
              <button
                key={preset.label}
                type="button"
                disabled={isRefining}
                onClick={() => {
                  setInstruction(preset.instr);
                  setStimulusPref(preset.pref);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-bold transition-colors cursor-pointer"
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">Jenis Stimulus Visual:</label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'auto' as const, label: 'Otomatis' },
              { id: 'chart' as const, label: 'Grafik' },
              { id: 'table' as const, label: 'Tabel' },
              { id: 'svg' as const, label: 'Ilustrasi/Diagram' },
              { id: 'case' as const, label: 'Studi Kasus' },
              { id: 'none' as const, label: 'Tanpa Stimulus' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                disabled={isRefining}
                onClick={() => setStimulusPref(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  stimulusPref === opt.id
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">
            Instruksi Tambahan ke AI <span className="font-normal text-slate-500">(bisa diketik bebas)</span>:
          </label>
          <textarea
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={isRefining}
            placeholder="Misal: Ganti angka dosis agar lebih realistis dan tingkatkan kesulitannya ke C5 evaluasi..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-indigo-600"
          />
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isRefining}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isRefining}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isRefining ? 'animate-spin' : ''}`} />
            <span>{isRefining ? 'AI Sedang Memproses...' : 'Proses dengan AI'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
