/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  X, 
  Check, 
  AlertCircle, 
  Coins, 
  Layers, 
  Trash2, 
  GraduationCap, 
  BookOpen, 
  Plus, 
  ShieldCheck
} from 'lucide-react';
import { SchoolProfile, SchoolFeeSchedule } from '../types';
import { 
  DEFAULT_PRIMARY_CLASSES, 
  DEFAULT_SECONDARY_CLASSES, 
  DEFAULT_PRIMARY_FEES, 
  DEFAULT_SECONDARY_FEES,
  DEFAULT_EMINENT_CLASSES
} from '../services/schoolService';

interface SchoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'edit';
  schoolToEdit?: SchoolProfile | null;
  canDelete?: boolean;
  onSave: (schoolData: Omit<SchoolProfile, 'id' | 'createdAt'>, schoolId?: string) => void;
  onDelete?: (schoolId: string) => void;
  onOpenAdditionalFees?: () => void;
}

export const SchoolModal: React.FC<SchoolModalProps> = ({
  isOpen,
  onClose,
  mode,
  schoolToEdit,
  canDelete = false,
  onSave,
  onDelete,
  onOpenAdditionalFees,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'fees' | 'classes'>('profile');

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<SchoolProfile['type']>('primary');
  const [currencySymbol, setCurrencySymbol] = useState('₦');

  // Fee Schedule
  const [tuitionFee, setTuitionFee] = useState('5000');
  const [admissionFee, setAdmissionFee] = useState('4000');
  const [examFee, setExamFee] = useState('1000');
  const [lessonFeeMonthly, setLessonFeeMonthly] = useState('2000');
  const [lessonFeeTermly, setLessonFeeTermly] = useState('6000');
  const [classFeeSchedules, setClassFeeSchedules] = useState<Record<string, SchoolFeeSchedule>>({});
  const [selectedClassOverride, setSelectedClassOverride] = useState<string>('');
  const [overrideTuition, setOverrideTuition] = useState<string>('');
  const [overrideAdmission, setOverrideAdmission] = useState<string>('');
  const [overrideExam, setOverrideExam] = useState<string>('');
  const [overrideLessonMonthly, setOverrideLessonMonthly] = useState<string>('');
  const [overrideLessonTermly, setOverrideLessonTermly] = useState<string>('');

  // Classes
  const [classes, setClasses] = useState<string[]>([...DEFAULT_PRIMARY_CLASSES]);
  const [newClassInput, setNewClassInput] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage(null);
    setIsConfirmingDelete(false);
    setActiveTab('profile');

    if (mode === 'edit' && schoolToEdit) {
      setName(schoolToEdit.name);
      setType(schoolToEdit.type);
      setCurrencySymbol(schoolToEdit.currencySymbol || '₦');
      setTuitionFee(String(schoolToEdit.feeSchedule.tuitionFee ?? 5000));
      setAdmissionFee(String(schoolToEdit.feeSchedule.admissionFee ?? 4000));
      setExamFee(String(schoolToEdit.feeSchedule.examFee ?? 1000));
      setLessonFeeMonthly(String(schoolToEdit.feeSchedule.lessonFeeMonthly ?? 2000));
      setLessonFeeTermly(String(schoolToEdit.feeSchedule.lessonFeeTermly ?? 6000));
      setClasses(schoolToEdit.classes && schoolToEdit.classes.length > 0 ? [...schoolToEdit.classes] : [...DEFAULT_PRIMARY_CLASSES]);
      setClassFeeSchedules(schoolToEdit.classFeeSchedules ? { ...schoolToEdit.classFeeSchedules } : {});
    } else {
      // Add mode defaults
      setName('');
      setType('secondary');
      setCurrencySymbol('₦');
      setTuitionFee(String(DEFAULT_SECONDARY_FEES.tuitionFee));
      setAdmissionFee(String(DEFAULT_SECONDARY_FEES.admissionFee));
      setExamFee(String(DEFAULT_SECONDARY_FEES.examFee));
      setLessonFeeMonthly(String(DEFAULT_SECONDARY_FEES.lessonFeeMonthly));
      setLessonFeeTermly(String(DEFAULT_SECONDARY_FEES.lessonFeeTermly));
      setClasses([...DEFAULT_SECONDARY_CLASSES]);
      setClassFeeSchedules({});
    }
  }, [isOpen, mode, schoolToEdit]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: SchoolProfile['type']) => {
    setType(newType);
    if (mode === 'add') {
      if (newType === 'secondary') {
        setName((prev) => (!prev || prev.includes('Primary') ? 'Dominion Secondary School' : prev));
        setTuitionFee(String(DEFAULT_SECONDARY_FEES.tuitionFee));
        setAdmissionFee(String(DEFAULT_SECONDARY_FEES.admissionFee));
        setExamFee(String(DEFAULT_SECONDARY_FEES.examFee));
        setLessonFeeMonthly(String(DEFAULT_SECONDARY_FEES.lessonFeeMonthly));
        setLessonFeeTermly(String(DEFAULT_SECONDARY_FEES.lessonFeeTermly));
        setClasses([...DEFAULT_SECONDARY_CLASSES]);
      } else if (newType === 'primary') {
        setName((prev) => (!prev || prev.includes('Secondary') ? 'Dominion Nursery & Primary School' : prev));
        setTuitionFee(String(DEFAULT_PRIMARY_FEES.tuitionFee));
        setAdmissionFee(String(DEFAULT_PRIMARY_FEES.admissionFee));
        setExamFee(String(DEFAULT_PRIMARY_FEES.examFee));
        setLessonFeeMonthly(String(DEFAULT_PRIMARY_FEES.lessonFeeMonthly));
        setLessonFeeTermly(String(DEFAULT_PRIMARY_FEES.lessonFeeTermly));
        setClasses([...DEFAULT_PRIMARY_CLASSES]);
      }
    }
  };

  const handleAddClass = () => {
    if (!newClassInput.trim()) return;
    const clean = newClassInput.trim();
    if (!classes.includes(clean)) {
      setClasses([...classes, clean]);
    }
    setNewClassInput('');
  };

  const handleRemoveClass = (classToRemove: string) => {
    if (classes.length <= 1) {
      setErrorMessage('At least one class grade is required.');
      return;
    }
    setClasses(classes.filter((c) => c !== classToRemove));
    if (classFeeSchedules[classToRemove]) {
      const updated = { ...classFeeSchedules };
      delete updated[classToRemove];
      setClassFeeSchedules(updated);
    }
  };

  const handleSelectClassOverride = (cls: string) => {
    setSelectedClassOverride(cls);
    const existing = classFeeSchedules[cls];
    if (existing) {
      setOverrideTuition(String(existing.tuitionFee ?? tuitionFee));
      setOverrideAdmission(String(existing.admissionFee ?? admissionFee));
      setOverrideExam(String(existing.examFee ?? examFee));
      setOverrideLessonMonthly(String(existing.lessonFeeMonthly ?? lessonFeeMonthly));
      setOverrideLessonTermly(String(existing.lessonFeeTermly ?? lessonFeeTermly));
    } else {
      setOverrideTuition(tuitionFee);
      setOverrideAdmission(admissionFee);
      setOverrideExam(examFee);
      setOverrideLessonMonthly(lessonFeeMonthly);
      setOverrideLessonTermly(lessonFeeTermly);
    }
  };

  const handleApplyClassOverride = () => {
    if (!selectedClassOverride) return;
    const schedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(overrideTuition) || 0),
      admissionFee: Math.max(0, Number(overrideAdmission) || 0),
      examFee: Math.max(0, Number(overrideExam) || 0),
      lessonFeeMonthly: Math.max(0, Number(overrideLessonMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(overrideLessonTermly) || 0),
    };
    setClassFeeSchedules((prev) => ({
      ...prev,
      [selectedClassOverride]: schedule,
    }));
  };

  const handleResetClassOverride = (cls: string) => {
    setClassFeeSchedules((prev) => {
      const next = { ...prev };
      delete next[cls];
      return next;
    });
    if (cls === selectedClassOverride) {
      setOverrideTuition(tuitionFee);
      setOverrideAdmission(admissionFee);
      setOverrideExam(examFee);
      setOverrideLessonMonthly(lessonFeeMonthly);
      setOverrideLessonTermly(lessonFeeTermly);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter a valid school name.');
      setActiveTab('profile');
      return;
    }

    if (classes.length === 0) {
      setErrorMessage('Please configure at least one class grade for this school.');
      setActiveTab('classes');
      return;
    }

    const feeSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    const finalClassSchedules = { ...classFeeSchedules };
    if (selectedClassOverride) {
      const parsedOverrideTuition = Math.max(0, Number(overrideTuition) || 0);
      const parsedOverrideAdmission = Math.max(0, Number(overrideAdmission) || 0);
      const parsedOverrideExam = Math.max(0, Number(overrideExam) || 0);
      const parsedOverrideLessonMonthly = Math.max(0, Number(overrideLessonMonthly) || 0);
      const parsedOverrideLessonTermly = Math.max(0, Number(overrideLessonTermly) || 0);

      if (
        parsedOverrideTuition !== feeSchedule.tuitionFee ||
        parsedOverrideAdmission !== feeSchedule.admissionFee ||
        parsedOverrideExam !== feeSchedule.examFee ||
        parsedOverrideLessonMonthly !== feeSchedule.lessonFeeMonthly ||
        parsedOverrideLessonTermly !== feeSchedule.lessonFeeTermly ||
        finalClassSchedules[selectedClassOverride]
      ) {
        finalClassSchedules[selectedClassOverride] = {
          tuitionFee: parsedOverrideTuition,
          admissionFee: parsedOverrideAdmission,
          examFee: parsedOverrideExam,
          lessonFeeMonthly: parsedOverrideLessonMonthly,
          lessonFeeTermly: parsedOverrideLessonTermly,
        };
      }
    }

    const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
      name: name.trim(),
      type,
      currencySymbol: currencySymbol.trim() || '₦',
      feeSchedule,
      classFeeSchedules: Object.keys(finalClassSchedules).length > 0 ? finalClassSchedules : undefined,
      classes,
    };

    onSave(payload, mode === 'edit' && schoolToEdit ? schoolToEdit.id : undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92dvh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                {mode === 'add' ? 'Add New School' : 'Configure School & Fees'}
              </h2>
              <p className="text-xs text-blue-200/80 font-medium">
                {mode === 'add' 
                  ? 'Set up another school with independent classes & fees' 
                  : `Customize ${schoolToEdit?.name || 'School'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 px-3 pt-2 gap-1 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-2 rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs'
                : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fees')}
            className={`px-3 py-2 rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'fees'
                ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs'
                : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span>Fee Amounts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('classes')}
            className={`px-3 py-2 rounded-t-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'classes'
                ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs'
                : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-500" />
            <span>Classes ({classes.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs font-semibold text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  School Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dominion Group Of Schools"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  School Level / Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'primary', label: 'Primary School', icon: BookOpen },
                    { id: 'secondary', label: 'Secondary / High', icon: GraduationCap },
                    { id: 'nursery', label: 'Nursery & Primary', icon: Layers },
                    { id: 'college', label: 'Senior College', icon: Building2 },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSelected = type === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTypeChange(item.id as any)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-bold ring-1 ring-blue-500'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="text-xs">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Currency Symbol
                </label>
                <div className="flex gap-2">
                  {['₦', '$', '£', '€', 'GHS'].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setCurrencySymbol(sym)}
                      className={`w-10 h-10 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                        currencySymbol === sym
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    placeholder="Custom"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-slate-50/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FEE SCHEDULE */}
          {activeTab === 'fees' && (
            <div className="space-y-4">
              <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-100 text-xs text-blue-900 leading-relaxed font-medium">
                <span className="font-bold block text-blue-950">✨ Configurable Base Fees:</span>
                Set default standard fee amounts for this school. Classes without a specific override will automatically use these base rates.
              </div>

              {/* Additional & Ancillary Fees Shortcut */}
              {onOpenAdditionalFees && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-slate-900">Ancillary & Additional Fees</p>
                      <p className="text-[10px] text-slate-600">PTA levies, uniforms, graduation & excursions</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdditionalFees();
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs"
                  >
                    <span>Manage Fees</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Tuition */}
                <div className="col-span-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    Base School Fee (Tuition)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={tuitionFee}
                      onChange={(e) => setTuitionFee(e.target.value)}
                      min="0"
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-black text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* Admission */}
                <div className="bg-purple-50/50 p-3 rounded-2xl border border-purple-100">
                  <label className="block text-xs font-bold text-purple-950 mb-1">
                    Base Admission Fee
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-purple-400 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={admissionFee}
                      onChange={(e) => setAdmissionFee(e.target.value)}
                      min="0"
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-purple-200 text-xs font-black text-purple-950 bg-white focus:ring-2 focus:ring-purple-500 font-mono"
                    />
                  </div>
                </div>

                {/* Exam */}
                <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100">
                  <label className="block text-xs font-bold text-amber-950 mb-1">
                    Base Exam Fee (Termly)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-amber-400 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={examFee}
                      onChange={(e) => setExamFee(e.target.value)}
                      min="0"
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-amber-200 text-xs font-black text-amber-950 bg-white focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                {/* Lesson Monthly */}
                <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
                  <label className="block text-xs font-bold text-emerald-950 mb-1">
                    Base Lesson Fee (1 Month)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-emerald-400 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={lessonFeeMonthly}
                      onChange={(e) => setLessonFeeMonthly(e.target.value)}
                      min="0"
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-emerald-200 text-xs font-black text-emerald-950 bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Lesson Termly */}
                <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
                  <label className="block text-xs font-bold text-emerald-950 mb-1">
                    Base Lesson Fee (Full Term)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-emerald-400 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={lessonFeeTermly}
                      onChange={(e) => setLessonFeeTermly(e.target.value)}
                      min="0"
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-emerald-200 text-xs font-black text-emerald-950 bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Class-Specific Fees Section */}
              <div className="p-3.5 rounded-2xl border border-purple-200 bg-purple-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-950">
                    Separate Fee / Class (Optional Overrides)
                  </span>
                  {Object.keys(classFeeSchedules).length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold">
                      {Object.keys(classFeeSchedules).length} Custom
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {classes.map((cls) => {
                    const hasOverride = Boolean(classFeeSchedules[cls]);
                    const isSelected = selectedClassOverride === cls;
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => handleSelectClassOverride(cls)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                            : hasOverride
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cls} {hasOverride ? '●' : ''}
                      </button>
                    );
                  })}
                </div>

                {selectedClassOverride && (
                  <div className="p-3 rounded-xl bg-white border border-purple-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        Customize Rates for: <span className="text-purple-700 font-mono">{selectedClassOverride}</span>
                      </span>
                      {classFeeSchedules[selectedClassOverride] && (
                        <button
                          type="button"
                          onClick={() => handleResetClassOverride(selectedClassOverride)}
                          className="text-[11px] text-rose-600 hover:underline font-bold cursor-pointer"
                        >
                          Remove Override
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Tuition</label>
                        <input
                          type="number"
                          value={overrideTuition}
                          onChange={(e) => setOverrideTuition(e.target.value)}
                          className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Admission</label>
                        <input
                          type="number"
                          value={overrideAdmission}
                          onChange={(e) => setOverrideAdmission(e.target.value)}
                          className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Exam</label>
                        <input
                          type="number"
                          value={overrideExam}
                          onChange={(e) => setOverrideExam(e.target.value)}
                          className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Lesson (Term)</label>
                        <input
                          type="number"
                          value={overrideLessonTermly}
                          onChange={(e) => setOverrideLessonTermly(e.target.value)}
                          className="w-full px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyClassOverride}
                      className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer"
                    >
                      Apply Custom Rates to {selectedClassOverride}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLASSES */}
          {activeTab === 'classes' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Classes & Grades ({classes.length})
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setClasses([...DEFAULT_EMINENT_CLASSES])}
                    className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md hover:bg-blue-100 cursor-pointer"
                  >
                    Kg1 – Ss3 Preset
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setClasses([...DEFAULT_PRIMARY_CLASSES])}
                    className="text-[10px] font-medium text-slate-600 hover:underline cursor-pointer"
                  >
                    Kg1–Pri5
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setClasses([...DEFAULT_SECONDARY_CLASSES])}
                    className="text-[10px] font-medium text-slate-600 hover:underline cursor-pointer"
                  >
                    Jss1–Ss3
                  </button>
                </div>
              </div>

              {/* Add Class Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newClassInput}
                  onChange={(e) => setNewClassInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddClass();
                    }
                  }}
                  placeholder="e.g. JSS 3 or Primary 6"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/50"
                />
                <button
                  type="button"
                  onClick={handleAddClass}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              {/* Class Chips */}
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                {classes.map((cls) => (
                  <span
                    key={cls}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs"
                  >
                    {cls}
                    <button
                      type="button"
                      onClick={() => handleRemoveClass(cls)}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            {mode === 'edit' && canDelete && schoolToEdit && onDelete ? (
              isConfirmingDelete ? (
                <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="text-[11px] font-bold text-rose-800 px-1">Delete school permanently?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(schoolToEdit.id);
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-2 py-1 rounded-lg text-slate-600 hover:bg-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete School</span>
                </button>
              )
            ) : (
              <div></div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{mode === 'add' ? 'Add School' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
