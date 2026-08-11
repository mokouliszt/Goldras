import { scoreColor } from "@/lib/fmt";

/** 総合スコアの円弧ゲージ。数字が主役なので装飾は最小限にする。 */
export function ScoreDial({
  score, size = 132, label, sub,
}: { score: number; size?: number; label?: string; sub?: string }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const sweep = 0.74; // 上部を開けた円弧
  const arc = c * sweep;
  const filled = arc * Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[223deg]">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--line)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          style={{ transition: "stroke-dasharray .7s cubic-bezier(.2,.7,.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="fig text-[34px] font-semibold leading-none" style={{ color }}>
          {Math.round(score)}
        </span>
        {label && <span className="mt-1.5 text-[12px]" style={{ color }}>{label}</span>}
        {sub && <span className="mt-0.5 text-[10.5px] text-ore">{sub}</span>}
      </div>
    </div>
  );
}

/** 内訳の横棒。重み付きなので、幅ではなく重みをラベルで示す。 */
export function PartBar({
  label, value, weight,
}: { label: string; value: number; weight?: number }) {
  return (
    <div className="flex items-center gap-2.5 py-[5px]">
      <span className="w-[62px] shrink-0 whitespace-nowrap text-[11px] text-ore">{label}</span>
      <div className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-vein">
        <div
          className="fill absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: scoreColor(value) }}
        />
      </div>
      <span className="fig w-[26px] shrink-0 text-right text-[11.5px] text-ink">{Math.round(value)}</span>
      {weight != null && (
        <span className="fig w-[26px] shrink-0 text-right text-[10px] text-ore">
          {Math.round(weight * 100)}%
        </span>
      )}
    </div>
  );
}

/** 終値の推移。目盛は出さず、傾きだけ伝える。 */
/**
 * 終値列を1本の線にする。
 *
 * 色は「隣に出している変化率」と必ず一致させたいので、trend で受け取る。
 * 線の始点と終点を比べて決めると、切り出した範囲の基準日が変化率の基準日と
 * 1日ずれるため、過去2年の実データで1割強の日に
 * 「+2.77% なのに線は赤」といった矛盾が出る。
 * trend が無いときだけ、やむを得ず線の形から推定する。
 */
export function Spark({
  data, width = 84, height = 26, color, trend,
}: { data?: number[]; width?: number; height?: number; color?: string; trend?: number }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 3) - 1.5).toFixed(1)}`);
  const rising = Number.isFinite(trend as number)
    ? (trend as number) >= 0
    : data[data.length - 1] >= data[0];
  const stroke = color ?? (rising ? "var(--assay)" : "var(--slag)");
  const id = `g${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.4"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 期間の異なる変化率を並べる。桁が揃うよう等幅で。 */
export function ChangeRow({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="flex gap-4">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <span className="eyebrow">{it.label}</span>
          <span
            className={`fig text-[13px] ${
              !Number.isFinite(it.value) ? "text-ore" : it.value >= 0 ? "text-assay" : "text-slag"
            }`}
          >
            {Number.isFinite(it.value) ? `${it.value >= 0 ? "+" : ""}${it.value.toFixed(1)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
