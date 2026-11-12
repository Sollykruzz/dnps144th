import { ArrowUpRight, BookOpen, Users, Wallet } from 'lucide-react';
import type { SchoolProfile, StudentPaymentRecord } from '../types';
import { formatCurrency } from '../services/calculations';
import { buildSchoolPerformanceGroups } from '../services/schoolPerformance';

interface SchoolPerformanceCardsProps {
  schools: SchoolProfile[];
  studentsBySchool: Record<string, StudentPaymentRecord[]>;
}

export function SchoolPerformanceCards({ schools, studentsBySchool }: SchoolPerformanceCardsProps) {
  const groups = buildSchoolPerformanceGroups(schools, studentsBySchool);

  return (
    <section aria-labelledby="school-performance-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">School overview</p>
          <h2 id="school-performance-heading" className="text-base font-black tracking-tight text-slate-950">Performance by school</h2>
        </div>
        <span className="text-[11px] font-medium text-slate-500">Primary and secondary collection</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => {
          const isPrimary = group.band === 'primary';
          const accent = isPrimary
            ? { icon: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' }
            : { icon: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-500' };
          const Icon = isPrimary ? BookOpen : Wallet;
          const schoolNames = Array.from(new Set(group.schools.map((school) => school.name))).join(' · ');

          return (
            <article key={group.band} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${accent.icon}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-slate-950">{group.label}</h3>
                    <p className="truncate text-[11px] text-slate-500">{schoolNames || 'Class groups in combined school roster'}</p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                  <Users className="size-3" aria-hidden="true" /> {group.students.length}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Collected</p>
                  <p className="mt-0.5 text-lg font-black tracking-tight text-slate-950">{formatCurrency(group.collected, group.currencySymbol)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Collection rate</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-black text-slate-900">
                    {group.collectionRate.toFixed(1)}%
                    <ArrowUpRight className="size-3.5 text-emerald-600" aria-hidden="true" />
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <div
                  role="progressbar"
                  aria-label={`${group.label} collection rate`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(group.collectionRate)}
                  className="h-2 overflow-hidden rounded-full bg-slate-100"
                >
                  <div className={`h-full rounded-full transition-[width] duration-500 ${accent.bar}`} style={{ width: `${group.collectionRate}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-medium text-slate-500">
                  <span>{group.students.length} students</span>
                  <span>{formatCurrency(group.outstanding, group.currencySymbol)} outstanding</span>
                </div>
              </div>
              {group.students.length === 0 && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                  No student records are currently available for this school group.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
