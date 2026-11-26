import React from 'react';
import { QuestionStimulus } from '../types';
import { BarChart3, Table2, Image as ImageIcon, FileText, Shapes } from 'lucide-react';

interface QuestionStimulusViewProps {
  stimulus?: QuestionStimulus;
  compact?: boolean;
  printMode?: boolean;
}

const CHART_COLORS = ['#0d9488', '#2563eb', '#d97706', '#e11d48', '#7c3aed', '#059669'];

/**
 * Safely sanitizes AI-generated or stored SVG markup so no script, event handler,
 * external resource, or foreignObject can execute.
 */
export function sanitizeSvgMarkup(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/xlink:href\s*=\s*["']\s*http[^"']*["']/gi, '')
    .trim();

  if (!clean.toLowerCase().includes('<svg')) return '';

  // Ensure SVG scales responsively inside container
  clean = clean.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
    const hasViewBox = /viewBox=/i.test(attrs);
    const cleanedAttrs = attrs
      .replace(/\swidth\s*=\s*("[^"]*"|'[^']*')/gi, '')
      .replace(/\sheight\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return `<svg${cleanedAttrs}${hasViewBox ? '' : ' viewBox="0 0 420 220"'} class="w-full h-auto max-h-64 mx-auto block">`;
  });

  return clean;
}

/**
 * Compresses an uploaded image file to a compact JPEG/WebP data URL suitable for Firestore storage.
 */
export function compressQuestionImageFile(file: File, maxWidth = 720, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

const SvgBarOrLineChart: React.FC<{
  chartType: 'bar' | 'line';
  data: { label: string; value: number; value2?: number }[];
  unit?: string;
  series1Label?: string;
  series2Label?: string;
}> = ({ chartType, data, unit, series1Label, series2Label }) => {
  const safeData = data.slice(0, 10);
  if (safeData.length === 0) return null;

  const hasSeries2 = safeData.some(d => typeof d.value2 === 'number' && !Number.isNaN(d.value2));
  const allValues = safeData.flatMap(d => [Number(d.value) || 0, ...(hasSeries2 ? [Number(d.value2) || 0] : [])]);
  const rawMax = Math.max(...allValues, 1);
  const maxVal = rawMax <= 0 ? 10 : Math.ceil(rawMax * 1.15);

  const width = 480;
  const height = 220;
  const padLeft = 46;
  const padRight = 18;
  const padTop = hasSeries2 ? 32 : 20;
  const padBottom = 46;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const gridSteps = 4;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-64 mx-auto block select-none">
      {/* Legend for multi-series */}
      {hasSeries2 && (
        <g transform={`translate(${padLeft}, 10)`}>
          <rect x={0} y={0} width={10} height={10} rx={2} fill="#0d9488" />
          <text x={14} y={9} fontSize="10" fontWeight="600" fill="#334155">
            {series1Label || 'Data 1'}
          </text>
          <rect x={120} y={0} width={10} height={10} rx={2} fill="#2563eb" />
          <text x={134} y={9} fontSize="10" fontWeight="600" fill="#334155">
            {series2Label || 'Data 2'}
          </text>
        </g>
      )}

      {/* Unit label */}
      {unit && (
        <text x={8} y={padTop - 4} fontSize="9" fontWeight="700" fill="#64748b">
          ({unit})
        </text>
      )}

      {/* Horizontal gridlines & Y ticks */}
      {Array.from({ length: gridSteps + 1 }).map((_, idx) => {
        const ratio = idx / gridSteps;
        const y = padTop + plotH - ratio * plotH;
        const tickVal = Math.round(ratio * maxVal);
        return (
          <g key={idx}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke={idx === 0 ? '#94a3b8' : '#e2e8f0'}
              strokeWidth={idx === 0 ? 1.5 : 1}
              strokeDasharray={idx === 0 ? undefined : '3 3'}
            />
            <text x={padLeft - 6} y={y + 3} textAnchor="end" fontSize="9.5" fill="#64748b">
              {tickVal}
            </text>
          </g>
        );
      })}

      {/* Left Y Axis */}
      <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#94a3b8" strokeWidth={1.5} />

      {/* Bars */}
      {chartType === 'bar' &&
        safeData.map((d, idx) => {
          const slotW = plotW / safeData.length;
          const groupW = Math.min(44, slotW * 0.68);
          const barW = hasSeries2 ? Math.max(8, (groupW - 4) / 2) : groupW;
          const startX = padLeft + idx * slotW + (slotW - groupW) / 2;

          const val1 = Math.max(0, Number(d.value) || 0);
          const h1 = (val1 / maxVal) * plotH;
          const y1 = padTop + plotH - h1;

          const val2 = hasSeries2 ? Math.max(0, Number(d.value2) || 0) : 0;
          const h2 = hasSeries2 ? (val2 / maxVal) * plotH : 0;
          const y2 = padTop + plotH - h2;

          const shortLabel = d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label;

          return (
            <g key={idx}>
              <rect
                x={startX}
                y={y1}
                width={barW}
                height={Math.max(2, h1)}
                rx={3}
                fill={hasSeries2 ? '#0d9488' : CHART_COLORS[idx % CHART_COLORS.length]}
              />
              <text
                x={startX + barW / 2}
                y={Math.max(padTop + 9, y1 - 4)}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="700"
                fill="#0f172a"
              >
                {val1}
              </text>

              {hasSeries2 && (
                <>
                  <rect
                    x={startX + barW + 4}
                    y={y2}
                    width={barW}
                    height={Math.max(2, h2)}
                    rx={3}
                    fill="#2563eb"
                  />
                  <text
                    x={startX + barW + 4 + barW / 2}
                    y={Math.max(padTop + 9, y2 - 4)}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill="#1e40af"
                  >
                    {val2}
                  </text>
                </>
              )}

              <text
                x={padLeft + idx * slotW + slotW / 2}
                y={padTop + plotH + 15}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="#334155"
              >
                {shortLabel}
              </text>
            </g>
          );
        })}

      {/* Line Chart */}
      {chartType === 'line' && (() => {
        const stepX = safeData.length > 1 ? plotW / (safeData.length - 1) : plotW / 2;
        const pts1 = safeData.map((d, idx) => {
          const x = safeData.length > 1 ? padLeft + idx * stepX : padLeft + plotW / 2;
          const val = Math.max(0, Number(d.value) || 0);
          const y = padTop + plotH - (val / maxVal) * plotH;
          return { x, y, val, label: d.label };
        });
        const pts2 = hasSeries2
          ? safeData.map((d, idx) => {
              const x = safeData.length > 1 ? padLeft + idx * stepX : padLeft + plotW / 2;
              const val = Math.max(0, Number(d.value2) || 0);
              const y = padTop + plotH - (val / maxVal) * plotH;
              return { x, y, val };
            })
          : [];

        return (
          <g>
            <polyline
              fill="none"
              stroke="#0d9488"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pts1.map(p => `${p.x},${p.y}`).join(' ')}
            />
            {hasSeries2 && (
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth={2.5}
                strokeDasharray="5 3"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pts2.map(p => `${p.x},${p.y}`).join(' ')}
              />
            )}
            {pts1.map((p, idx) => {
              const shortLabel = p.label.length > 11 ? `${p.label.slice(0, 10)}…` : p.label;
              return (
                <g key={idx}>
                  <circle cx={p.x} cy={p.y} r={4} fill="#0d9488" stroke="#ffffff" strokeWidth={1.5} />
                  <text x={p.x} y={Math.max(padTop + 10, p.y - 8)} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#0f766e">
                    {p.val}
                  </text>
                  <text x={p.x} y={padTop + plotH + 16} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#334155">
                    {shortLabel}
                  </text>
                </g>
              );
            })}
            {pts2.map((p, idx) => (
              <g key={`s2-${idx}`}>
                <circle cx={p.x} cy={p.y} r={3.5} fill="#2563eb" stroke="#ffffff" strokeWidth={1.5} />
                <text x={p.x} y={Math.min(padTop + plotH - 4, p.y + 13)} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1d4ed8">
                  {p.val}
                </text>
              </g>
            ))}
          </g>
        );
      })()}
    </svg>
  );
};

const SvgPieChart: React.FC<{
  data: { label: string; value: number }[];
  unit?: string;
}> = ({ data, unit }) => {
  const safeData = data.filter(d => Number(d.value) > 0).slice(0, 8);
  const total = safeData.reduce((sum, d) => sum + Number(d.value), 0);
  if (safeData.length === 0 || total <= 0) return null;

  const cx = 95;
  const cy = 95;
  const r = 74;
  let currentAngle = -Math.PI / 2;

  const slices = safeData.map((d, idx) => {
    const val = Number(d.value);
    const sliceAngle = (val / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const pathD =
      safeData.length === 1
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const pct = Math.round((val / total) * 100);
    return {
      ...d,
      val,
      pct,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      pathD,
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <svg viewBox="0 0 190 190" className="w-44 h-44 shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.pathD} fill={s.color} stroke="#ffffff" strokeWidth={2} />
        ))}
        <circle cx={cx} cy={cy} r={30} fill="#ffffff" />
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#334155">
          {total}{unit ? ` ${unit}` : ''}
        </text>
      </svg>
      <div className="space-y-1.5 text-xs">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="font-semibold text-slate-800">{s.label}:</span>
            <span className="font-mono text-slate-600">
              {s.val}{unit ? ` ${unit}` : ''} ({s.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const QuestionStimulusView: React.FC<QuestionStimulusViewProps> = ({
  stimulus,
  compact = false,
  printMode = false,
}) => {
  if (!stimulus) return null;

  const wrapperClass = printMode
    ? 'my-2.5 p-3 rounded-lg border border-slate-400 bg-white break-inside-avoid'
    : `my-2.5 ${compact ? 'p-3' : 'p-4'} rounded-xl border border-slate-200 bg-white shadow-2xs space-y-2.5 break-inside-avoid`;

  const renderBadgeAndTitle = (icon: React.ReactNode, fallbackLabel: string) => (
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5">
      <span className="text-teal-700 shrink-0">{icon}</span>
      <span>{stimulus.title || fallbackLabel}</span>
    </div>
  );

  if (stimulus.type === 'chart' && stimulus.chartData && stimulus.chartData.length > 0) {
    const cType = stimulus.chartType || 'bar';
    return (
      <div className={wrapperClass}>
        {renderBadgeAndTitle(<BarChart3 className="w-3.5 h-3.5" />, 'Grafik Data Soal')}
        <div className="pt-1">
          {cType === 'pie' ? (
            <SvgPieChart data={stimulus.chartData} unit={stimulus.chartUnit} />
          ) : (
            <SvgBarOrLineChart
              chartType={cType === 'line' ? 'line' : 'bar'}
              data={stimulus.chartData}
              unit={stimulus.chartUnit}
              series1Label={stimulus.series1Label}
              series2Label={stimulus.series2Label}
            />
          )}
        </div>
        {stimulus.caption && (
          <p className="text-[11px] text-slate-500 italic text-center pt-1">{stimulus.caption}</p>
        )}
      </div>
    );
  }

  if (stimulus.type === 'table' && stimulus.tableHeaders && stimulus.tableHeaders.length > 0) {
    const normalizedRows: string[][] = (stimulus.tableRows || []).map((row: any) =>
      Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : []
    );

    return (
      <div className={wrapperClass}>
        {renderBadgeAndTitle(<Table2 className="w-3.5 h-3.5" />, 'Tabel Data Pengamatan')}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-800">
                {stimulus.tableHeaders.map((h, i) => (
                  <th key={i} className="border border-slate-300 px-2.5 py-1.5 text-left font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizedRows.map((cells, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                  {cells.map((cell, cIdx) => (
                    <td key={cIdx} className="border border-slate-300 px-2.5 py-1.5 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stimulus.caption && (
          <p className="text-[11px] text-slate-500 italic pt-1">{stimulus.caption}</p>
        )}
      </div>
    );
  }

  if (stimulus.type === 'svg' && stimulus.svgMarkup) {
    const cleanSvg = sanitizeSvgMarkup(stimulus.svgMarkup);
    if (!cleanSvg) return null;
    return (
      <div className={wrapperClass}>
        {renderBadgeAndTitle(<Shapes className="w-3.5 h-3.5" />, 'Ilustrasi / Diagram Soal')}
        <div
          className="bg-slate-50/60 rounded-lg p-2 border border-slate-100 flex items-center justify-center"
          dangerouslySetInnerHTML={{ __html: cleanSvg }}
        />
        {stimulus.caption && (
          <p className="text-[11px] text-slate-500 italic text-center pt-1">{stimulus.caption}</p>
        )}
      </div>
    );
  }

  if (stimulus.type === 'image' && stimulus.imageUrl) {
    return (
      <div className={wrapperClass}>
        {stimulus.title && renderBadgeAndTitle(<ImageIcon className="w-3.5 h-3.5" />, 'Gambar Pendukung Soal')}
        <div className="flex justify-center">
          <img
            src={stimulus.imageUrl}
            alt={stimulus.caption || stimulus.title || 'Ilustrasi soal'}
            className="max-h-72 w-auto rounded-lg border border-slate-200 object-contain"
          />
        </div>
        {stimulus.caption && (
          <p className="text-[11px] text-slate-500 italic text-center pt-1">{stimulus.caption}</p>
        )}
      </div>
    );
  }

  if (stimulus.type === 'case' && stimulus.caseText) {
    return (
      <div className={printMode ? 'my-2 p-3 border-l-4 border-slate-700 bg-slate-50 text-xs leading-relaxed break-inside-avoid' : 'my-2.5 p-3.5 rounded-xl border border-teal-200 border-l-4 border-l-teal-600 bg-teal-50/50 text-xs text-slate-800 leading-relaxed space-y-1 break-inside-avoid'}>
        <div className="font-bold text-teal-900 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
          <FileText className="w-3.5 h-3.5" />
          <span>{stimulus.title || 'Wacana / Studi Kasus'}</span>
        </div>
        <p className="whitespace-pre-line">{stimulus.caseText}</p>
        {stimulus.caption && (
          <p className="text-[11px] text-slate-500 italic pt-1">{stimulus.caption}</p>
        )}
      </div>
    );
  }

  return null;
};
