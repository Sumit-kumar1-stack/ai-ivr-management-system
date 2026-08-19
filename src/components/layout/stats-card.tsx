type Props = {
  title: string;
  value: string | number;
};

export default function StatsCard({
  title,
  value,
}: Props) {
  const isActive = title.includes("Active");
  const isSuccess = title.includes("Completed");
  const isFailed = title.includes("Unsuccessful");
  const isProcessing = title.includes("Thinking") || title.includes("Speaking");

  const accentColor =
    isActive ? "bg-blue-500" :
    isSuccess ? "bg-emerald-500" :
    isFailed ? "bg-rose-500" :
    isProcessing ? "bg-amber-500" :
    "bg-slate-400";

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm shadow-slate-100/50 hover:shadow-md transition-all duration-200 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {title}
        </p>

        <h2 className="text-2xl font-bold tracking-tight text-slate-800 mt-1.5">
          {value}
        </h2>
      </div>

      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 border border-slate-100 shadow-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${accentColor}`} />
      </div>
    </div>
  );
}