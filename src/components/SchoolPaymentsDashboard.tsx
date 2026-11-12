import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BookOpen, CheckCircle2, Clock3, Users, Wallet } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SchoolProfile, StudentPaymentRecord } from '../types';
import { formatCurrency } from '../services/calculations';
import { buildSchoolPerformanceGroups, type SchoolPerformanceGroup } from '../services/schoolPerformance';

interface SchoolPaymentsDashboardProps {
  schools: SchoolProfile[];
  studentsBySchool: Record<string, StudentPaymentRecord[]>;
}

const formatCompactAmount = (value: number, currencySymbol: string) => {
  if (value >= 1_000_000) return `${currencySymbol}${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${currencySymbol}${(value / 1_000).toFixed(0)}k`;
  return `${currencySymbol}${Math.round(value).toLocaleString()}`;
};

function getMonthlyCollections(group: SchoolPerformanceGroup) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    return {
      key,
      month: date.toLocaleDateString(undefined, { month: 'short' }),
      collected: 0,
    };
  });
  const monthlyTotals = new Map(months.map((month) => [month.key, 0]));
  const includedCategories = new Set(['school_fee', 'exam']);

  group.students.forEach((student) => {
    (student.payment_history || []).forEach((receipt) => {
      const dateValue = receipt.paymentDate || receipt.timestamp;
      if (!dateValue) return;
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTotals.has(key)) return;

      const coreAmount = receipt.items?.length
        ? receipt.items.reduce((sum, item) => {
            const category = item.feeCategory || receipt.feeCategory;
            return includedCategories.has(category || '') ? sum + Math.max(0, Number(item.amount) || 0) : sum;
          }, 0)
        : includedCategories.has(receipt.feeCategory || '')
          ? Math.max(0, Number(receipt.amountPaidNow) || 0)
          : 0;

      monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + coreAmount);
    });
  });

  return months.map((month) => ({ ...month, collected: monthlyTotals.get(month.key) || 0 }));
}

const SchoolPaymentsDashboard = ({ schools, studentsBySchool }: SchoolPaymentsDashboardProps) => {
  const groups = useMemo(() => buildSchoolPerformanceGroups(schools, studentsBySchool), [schools, studentsBySchool]);
  const [activeBand, setActiveBand] = useState<'primary' | 'secondary'>('primary');
  const activeGroup = groups.find((group) => group.band === activeBand) || groups[0];
  const monthlyCollections = useMemo(() => getMonthlyCollections(activeGroup), [activeGroup]);
  const hasHistory = monthlyCollections.some((month) => month.collected > 0);
  const classRows = activeGroup.classPerformance;
  const schoolNames = Array.from(new Set(activeGroup.schools.map((school) => school.name))).join(' · ');
  const primarySelected = activeBand === 'primary';

  const metrics = [
    {
      label: 'Students',
      value: activeGroup.students.length.toLocaleString(),
      note: `${activeGroup.fullyPaidCount.toLocaleString()} fully paid`,
      icon: Users,
      tone: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Collected',
      value: formatCurrency(activeGroup.collected, activeGroup.currencySymbol),
      note: `${activeGroup.collectionRate.toFixed(1)}% of expected fees`,
      icon: Wallet,
      tone: primarySelected ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700',
    },
    {
      label: 'Outstanding',
      value: formatCurrency(activeGroup.outstanding, activeGroup.currencySymbol),
      note: `${activeGroup.unpaidCount.toLocaleString()} unpaid · ${activeGroup.partPaidCount.toLocaleString()} part-paid`,
      icon: Clock3,
      tone: 'bg-amber-100 text-amber-800',
    },
    {
      label: 'Collection rate',
      value: `${activeGroup.collectionRate.toFixed(1)}%`,
      note: `${activeGroup.classPerformance.length.toLocaleString()} classes tracked`,
      icon: CheckCircle2,
      tone: primarySelected ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700',
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Payments overview</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">School performance</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
              Compare school and exam fee collections across primary and secondary school. Lesson and other fees are excluded from these totals.
            </p>
          </div>
          <div className={`hidden size-12 place-items-center rounded-2xl sm:grid ${primarySelected ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
            {primarySelected ? <BookOpen className="size-5" aria-hidden="true" /> : <Wallet className="size-5" aria-hidden="true" />}
          </div>
        </div>

        <div role="tablist" aria-label="School payment dashboards" className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1">
          {groups.map((group) => {
            const isActive = activeBand === group.band;
            return (
              <button
                key={group.band}
                id={`${group.band}-payments-tab`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${group.band}-payments-panel`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveBand(group.band)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    const nextBand = group.band === 'primary' ? 'secondary' : 'primary';
                    setActiveBand(nextBand);
                    document.getElementById(`${nextBand}-payments-tab`)?.focus();
                  }
                }}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 sm:text-sm ${
                  isActive ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {group.band === 'primary' ? <BookOpen className="size-4" aria-hidden="true" /> : <Wallet className="size-4" aria-hidden="true" />}
                {group.label}
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${isActive ? (group.band === 'primary' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800') : 'bg-slate-200 text-slate-600'}`}>
                  {group.students.length}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <section
        role="tabpanel"
        id={`${activeBand}-payments-panel`}
        aria-labelledby={`${activeBand}-payments-tab`}
        className="space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selected school group</p>
            <h2 className="mt-0.5 truncate text-sm font-black text-slate-950">{activeGroup.label}</h2>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{schoolNames || 'Class groups from the combined school roster'}</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-700">
            {primarySelected ? <ArrowUpRight className="size-3.5 text-emerald-600" aria-hidden="true" /> : <ArrowDownRight className="size-3.5 text-indigo-600" aria-hidden="true" />}
            Live roster performance
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, note, icon: Icon, tone }) => (
            <article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="mt-2 truncate text-xl font-black tracking-tight text-slate-950">{value}</p>
                </div>
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-2 truncate text-[10px] font-medium text-slate-500">{note}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="monthly-collections-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="monthly-collections-heading" className="text-sm font-black text-slate-950">Monthly collections</h3>
                <p className="mt-1 text-[11px] text-slate-500">Recorded payment history · last six months</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{activeGroup.label}</span>
            </div>
            {hasHistory ? (
              <div className="mt-4 h-60 w-full" role="img" aria-label={`Monthly recorded collections for ${activeGroup.label}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyCollections} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`collection-fill-${activeBand}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={primarySelected ? '#059669' : '#4f46e5'} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={primarySelected ? '#059669' : '#4f46e5'} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} width={56} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(value) => formatCompactAmount(Number(value) || 0, activeGroup.currencySymbol)} />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value) || 0, activeGroup.currencySymbol)}
                      contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke={primarySelected ? '#059669' : '#4f46e5'} strokeWidth={2.5} fill={`url(#collection-fill-${activeBand})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-4 grid h-60 place-items-center rounded-xl bg-slate-50 px-6 text-center">
                <div>
                  <p className="text-xs font-bold text-slate-700">No payment history for the last six months</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Totals above still reflect the current student roster.</p>
                </div>
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="class-performance-heading">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="class-performance-heading" className="text-sm font-black text-slate-950">Class collection rates</h3>
                <p className="mt-1 text-[11px] text-slate-500">Collected fees compared with expected fees</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{classRows.length} classes</span>
            </div>
            {classRows.length > 0 ? (
              <div className="mt-4 space-y-3">
                {classRows.slice(0, 8).map((row) => (
                  <div key={row.className}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px]">
                      <span className="min-w-0 truncate font-bold text-slate-700">{row.className} <span className="font-medium text-slate-400">· {row.studentCount}</span></span>
                      <span className="shrink-0 font-black text-slate-900">{row.collectionRate.toFixed(0)}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${row.className} collection rate`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(row.collectionRate)}
                      className="h-2 overflow-hidden rounded-full bg-slate-100"
                    >
                      <div className={`h-full rounded-full ${primarySelected ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${row.collectionRate}%` }} />
                    </div>
                    <p className="mt-1 text-right text-[9px] text-slate-500">{formatCurrency(row.collected, activeGroup.currencySymbol)} collected · {formatCurrency(row.outstanding, activeGroup.currencySymbol)} due</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid min-h-52 place-items-center rounded-xl bg-slate-50 px-6 text-center text-[11px] text-slate-500">
                Add student records to see class-level collection performance.
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};

export default SchoolPaymentsDashboard;
