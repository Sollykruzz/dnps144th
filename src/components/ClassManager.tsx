import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen, Check, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import type { SchoolProfile, StudentPaymentRecord } from '../types';

export interface ClassManagerResult {
  success: boolean;
  message?: string;
}

interface ClassManagerProps {
  school?: SchoolProfile;
  students: StudentPaymentRecord[];
  onManageClasses: (
    updatedSchool: SchoolProfile,
    reassignment?: { fromClass: string; toClass: string }
  ) => Promise<ClassManagerResult>;
}

const normalizeClassName = (className: string) => className.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function ClassManager({ school, students, onManageClasses }: ClassManagerProps) {
  const [newClassName, setNewClassName] = useState('');
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingClass, setDeletingClass] = useState<string | null>(null);
  const [targetClass, setTargetClass] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const classes = useMemo(() => {
    const values = school?.classes || [];
    return Array.from(new Map(values.map((name) => [normalizeClassName(name), name.trim()])).values()).filter(Boolean);
  }, [school?.classes]);

  const classCounts = useMemo(() => {
    return students.reduce<Record<string, number>>((counts, student) => {
      const key = normalizeClassName(student.class || '');
      if (key) counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }, [students]);

  const totalAssignedStudents = Object.values(classCounts).reduce((sum, count) => sum + count, 0);
  const availableTargets = deletingClass
    ? classes.filter((className) => normalizeClassName(className) !== normalizeClassName(deletingClass))
    : [];

  useEffect(() => {
    setNewClassName('');
    setEditingClass(null);
    setDeletingClass(null);
    setNotice(null);
  }, [school?.id]);

  const applyClassChange = async (
    updatedSchool: SchoolProfile,
    reassignment?: { fromClass: string; toClass: string }
  ) => {
    setIsSaving(true);
    setNotice(null);

    try {
      const result = await onManageClasses(updatedSchool, reassignment);
      setNotice({ type: result.success ? 'success' : 'error', message: result.message || (result.success ? 'Class changes saved.' : 'Class changes were not saved.') });
      return result.success;
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'The class change could not be confirmed. No class was removed.',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!school) return;
    const cleanName = newClassName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setNotice({ type: 'error', message: 'Enter a class name first.' });
      return;
    }
    if (classes.some((className) => normalizeClassName(className) === normalizeClassName(cleanName))) {
      setNotice({ type: 'error', message: 'A class with that name already exists.' });
      return;
    }

    const success = await applyClassChange({ ...school, classes: [...classes, cleanName] });
    if (success) setNewClassName('');
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!school || !editingClass) return;
    const cleanName = editName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setNotice({ type: 'error', message: 'Enter a class name first.' });
      return;
    }
    if (normalizeClassName(cleanName) === normalizeClassName(editingClass)) {
      setEditingClass(null);
      return;
    }
    if (classes.some((className) => normalizeClassName(className) === normalizeClassName(cleanName))) {
      setNotice({ type: 'error', message: 'A class with that name already exists.' });
      return;
    }

    const classFeeSchedules = { ...(school.classFeeSchedules || {}) };
    const scheduleKey = Object.keys(classFeeSchedules).find(
      (className) => normalizeClassName(className) === normalizeClassName(editingClass)
    );
    if (scheduleKey) {
      classFeeSchedules[cleanName] = classFeeSchedules[scheduleKey];
      delete classFeeSchedules[scheduleKey];
    }

    const updatedSchool: SchoolProfile = {
      ...school,
      classes: classes.map((className) =>
        normalizeClassName(className) === normalizeClassName(editingClass) ? cleanName : className
      ),
      classFeeSchedules: Object.keys(classFeeSchedules).length ? classFeeSchedules : undefined,
    };
    const success = await applyClassChange(updatedSchool, { fromClass: editingClass, toClass: cleanName });
    if (success) setEditingClass(null);
  };

  const handleDeleteClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!school || !deletingClass) return;
    if (!targetClass) {
      setNotice({ type: 'error', message: 'Choose a destination class before continuing.' });
      return;
    }

    const classFeeSchedules = { ...(school.classFeeSchedules || {}) };
    Object.keys(classFeeSchedules).forEach((className) => {
      if (normalizeClassName(className) === normalizeClassName(deletingClass)) delete classFeeSchedules[className];
    });

    const updatedSchool: SchoolProfile = {
      ...school,
      classes: classes.filter((className) => normalizeClassName(className) !== normalizeClassName(deletingClass)),
      classFeeSchedules: Object.keys(classFeeSchedules).length ? classFeeSchedules : undefined,
    };
    const success = await applyClassChange(updatedSchool, { fromClass: deletingClass, toClass: targetClass });
    if (success) {
      setDeletingClass(null);
      setTargetClass('');
    }
  };

  const openDeleteDialog = (className: string) => {
    setNotice(null);
    setDeletingClass(className);
    setTargetClass(classes.find((target) => normalizeClassName(target) !== normalizeClassName(className)) || '');
  };

  if (!school) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">Select a school before managing classes.</div>;
  }

  return (
    <section className="space-y-5" aria-labelledby="class-manager-heading">
      <header className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 p-5 text-white shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <BookOpen aria-hidden="true" className="size-5 text-indigo-200" />
          </div>
          <div className="min-w-0">
            <h4 id="class-manager-heading" className="text-sm font-black uppercase tracking-wider">Manage classes</h4>
            <p className="mt-1 text-xs leading-relaxed text-indigo-100/80">Add, rename, or remove classes for {school.name}. Student records are checked and saved before a class is removed.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-bold">{classes.length} classes</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-bold">{totalAssignedStudents} students in roster</span>
        </div>
      </header>

      {notice && (
        <div
          className={`rounded-2xl border p-3 text-sm font-semibold ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}
          role={notice.type === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </div>
      )}

      <form onSubmit={handleAddClass} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
        <label htmlFor="new-class-name" className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-700">Add a class</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="new-class-name"
            value={newClassName}
            onChange={(event) => setNewClassName(event.target.value)}
            placeholder="For example, Primary 6 or JSS 1"
            maxLength={60}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            disabled={isSaving}
          />
          <button
            type="submit"
            disabled={isSaving || !newClassName.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white shadow-xs transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
            Add class
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h5 className="text-sm font-black text-slate-900">Configured classes</h5>
            <p className="mt-0.5 text-xs text-slate-500">Names match the class field on each student record.</p>
          </div>
          <Users aria-hidden="true" className="size-5 shrink-0 text-indigo-600" />
        </div>

        {classes.length ? (
          <ul className="divide-y divide-slate-100">
            {classes.map((className) => {
              const count = classCounts[normalizeClassName(className)] || 0;
              return (
                <li key={normalizeClassName(className)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{className}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{count} {count === 1 ? 'student' : 'students'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Edit ${className}`}
                      onClick={() => {
                        setNotice(null);
                        setEditingClass(className);
                        setEditName(className);
                      }}
                      disabled={isSaving}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Pencil aria-hidden="true" className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${className}`}
                      onClick={() => openDeleteDialog(className)}
                      disabled={isSaving || classes.length <= 1}
                      title={classes.length <= 1 ? 'At least one class must remain configured' : undefined}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" /> Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm font-medium text-slate-500">No classes are configured yet. Add the first class above.</p>
        )}
      </div>

      {editingClass && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-class-title"
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h4 id="edit-class-title" className="text-base font-black text-slate-900">Edit class name</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">Students will be moved to the new class name after Firestore confirms the updates.</p>
              </div>
              <button type="button" aria-label="Close edit class dialog" onClick={() => setEditingClass(null)} disabled={isSaving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <label htmlFor="edit-class-name" className="mb-2 block text-xs font-bold text-slate-700">Class name</label>
            <input
              id="edit-class-name"
              autoFocus
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={60}
              className="min-h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              disabled={isSaving}
            />
            {(classCounts[normalizeClassName(editingClass)] || 0) > 0 && (
              <p className="mt-2 text-xs font-semibold text-indigo-800">{classCounts[normalizeClassName(editingClass)]} students in the current roster will keep their records and move to the renamed class.</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingClass(null)} disabled={isSaving} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSaving || !editName.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white hover:bg-indigo-800 disabled:opacity-50">
                {isSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
                Save name
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingClass && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-xs sm:items-center sm:p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-class-title"
            onSubmit={handleDeleteClass}
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h4 id="remove-class-title" className="text-base font-black text-slate-900">Remove {deletingClass}?</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Choose where any students in this class should go. The full Firestore roster is checked first, students are saved to the destination, and only then is the class removed. If any step fails, the class stays configured.
                </p>
              </div>
              <button type="button" aria-label="Close remove class dialog" onClick={() => setDeletingClass(null)} disabled={isSaving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <label htmlFor="reassign-class-target" className="mb-2 block text-xs font-bold text-slate-700">Reassign students to</label>
            {availableTargets.length ? (
              <select
                id="reassign-class-target"
                value={targetClass}
                onChange={(event) => setTargetClass(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                disabled={isSaving}
              >
                <option value="" disabled>Select a destination class</option>
                {availableTargets.map((className) => <option key={normalizeClassName(className)} value={className}>{className}</option>)}
              </select>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Add another class first so any students can be reassigned safely.</p>
            )}

            <p className="mt-2 text-xs text-slate-500">
              {(classCounts[normalizeClassName(deletingClass)] || 0) > 0
                ? `${classCounts[normalizeClassName(deletingClass)]} students are listed locally; the live Firestore roster is also checked.`
                : 'No students are listed locally. The live Firestore roster is still checked before removal.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingClass(null)} disabled={isSaving} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSaving || !targetClass || !availableTargets.length} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50">
                {isSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="size-4" />}
                Reassign and remove
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
