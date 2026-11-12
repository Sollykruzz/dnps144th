import React from 'react'
import { ArrowRight, GraduationCap, UserRound, X } from 'lucide-react'

type EnrollmentChoice = 'new' | 'existing'

interface EnrollmentTypeModalProps {
  isOpen: boolean
  onClose: () => void
  onChoose: (choice: EnrollmentChoice) => void
}

const choices: {
  id: EnrollmentChoice
  eyebrow: string
  title: string
  description: string
  details: string
  icon: typeof GraduationCap
}[] = [
  {
    id: 'new',
    eyebrow: 'First-time enrolment',
    title: 'New admission',
    description: 'A student joining your school for the first time.',
    details: 'Admission fee, term fees, lessons, initial payment and receipt',
    icon: GraduationCap,
  },
  {
    id: 'existing',
    eyebrow: 'Returning or transfer',
    title: 'Existing student',
    description: 'A returning student or a transfer joining this roster.',
    details: 'Class, term, session, fee adjustments, scholarship and payments',
    icon: UserRound,
  },
]

export const EnrollmentTypeModal: React.FC<EnrollmentTypeModalProps> = ({
  isOpen,
  onClose,
  onChoose,
}) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <section
        aria-labelledby="enrollment-type-title"
        aria-describedby="enrollment-type-description"
        aria-modal="true"
        autoFocus
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-7"
        role="dialog"
        tabIndex={-1}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Student enrollment</p>
            <h2 id="enrollment-type-title" className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Who are you enrolling?
            </h2>
            <p id="enrollment-type-description" className="mt-2 max-w-md text-sm leading-6 text-slate-600">
              Choose a path to open a focused form with the right fees and student details.
            </p>
          </div>
          <button
            aria-label="Close enrollment options"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {choices.map(({ id, eyebrow, title, description, details, icon: Icon }) => (
            <button
              key={id}
              className="group flex min-h-48 flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:min-h-56 sm:p-5"
              onClick={() => onChoose(id)}
              type="button"
            >
              <span className="mb-4 inline-flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white transition-colors group-hover:bg-emerald-700">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">{eyebrow}</span>
              <span className="mt-1 text-lg font-bold text-slate-950">{title}</span>
              <span className="mt-1 text-sm leading-5 text-slate-600">{description}</span>
              <span className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs font-semibold text-slate-700">
                <span className="leading-5">{details}</span>
                <ArrowRight className="size-4 shrink-0 text-emerald-700 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          Both paths keep the existing fee, session, payment and receipt options.
        </p>
      </section>
    </div>
  )
}
