/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Globe,
  Layers,
  Coins,
  Users,
  BookOpen,
  Shield,
  Laptop,
  Compass,
  Check,
  ToggleLeft,
  ToggleRight,
  PauseCircle,
  PlayCircle,
  Sparkles,
} from 'lucide-react';
import { SchoolProfile, AdditionalFeeItem, StudentPaymentRecord } from '../types';
import { formatCurrency } from '../services/calculations';
import {
  addAdditionalFeeToSchool,
  updateAdditionalFeeInSchool,
  deleteAdditionalFeeFromSchool,
  syncAdditionalFeesToStudents,
  isAdditionalFeeApplicable,
} from '../services/schoolService';

interface AdditionalFeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSchool: SchoolProfile;
  students: StudentPaymentRecord[];
  onUpdateSchool: (updatedSchool: SchoolProfile) => void;
  onUpdateStudents: (updatedStudents: StudentPaymentRecord[]) => void;
  currencySymbol: string;
}

// Popular Quick-Fill Fee Presets
const POPULAR_PRESETS = [
  { name: 'PTA Levy', amount: 2000, targetClass: 'all', category: 'levy' as const },
  { name: 'Uniform & Sportswear', amount: 15000, targetClass: 'all', category: 'uniform' as const },
  { name: 'Graduation & Valedictory Fee', amount: 20000, targetClass: 'Ss3', category: 'graduation' as const },
  { name: 'ICT & Computer Lab Levy', amount: 3500, targetClass: 'all', category: 'ict' as const },
  { name: 'Books & Stationery', amount: 8500, targetClass: 'all', category: 'books' as const },
  { name: 'Excursion / Field Trip', amount: 6000, targetClass: 'all', category: 'excursion' as const },
];

export const AdditionalFeesModal: React.FC<AdditionalFeesModalProps> = ({
  isOpen,
  onClose,
  activeSchool,
  students,
  onUpdateSchool,
  onUpdateStudents,
  currencySymbol,
}) => {
  // Existing additional fees list
  const existingFees: AdditionalFeeItem[] = useMemo(() => {
    return Array.isArray(activeSchool.additionalFees) ? activeSchool.additionalFees : [];
  }, [activeSchool.additionalFees]);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formTargetType, setFormTargetType] = useState<'all' | 'specific'>('all');
  const [formSpecificClass, setFormSpecificClass] = useState('Ss3');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formCategory, setFormCategory] = useState<any>('levy');

  // Feedback banner
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Available classes
  const schoolClasses = useMemo(() => {
    return Array.isArray(activeSchool.classes) && activeSchool.classes.length > 0
      ? activeSchool.classes
      : ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'];
  }, [activeSchool.classes]);

  // Quick stats
  const stats = useMemo(() => {
    const activeCount = existingFees.filter((f) => f.enabled !== false).length;
    const disabledCount = existingFees.filter((f) => f.enabled === false).length;
    return { activeCount, disabledCount, total: existingFees.length };
  }, [existingFees]);

  // Calculate live collection numbers for a specific fee across students
  const getFeeMetrics = (fee: AdditionalFeeItem) => {
    const isEnabled = fee.enabled !== false;
    let applicableStudents = 0;
    let expected = 0;
    let collected = 0;

    students.forEach((st) => {
      // Check if student's class matches
      const matches = isAdditionalFeeApplicable(
        { ...fee, enabled: true },
        st.class,
        st.term
      );
      if (matches) {
        applicableStudents++;
        const stFee = Array.isArray(st.additional_fees)
          ? st.additional_fees.find(
              (f) => f.feeId === fee.id || f.name.trim().toLowerCase() === fee.name.trim().toLowerCase()
            )
          : undefined;

        if (isEnabled) {
          expected += stFee ? Number(stFee.amount) || 0 : Number(fee.amount) || 0;
          collected += stFee ? Number(stFee.amountPaid) || 0 : 0;
        } else {
          // If disabled, check if student had made past payment
          if (stFee && Number(stFee.amountPaid) > 0) {
            expected += Number(stFee.amountPaid) || 0;
            collected += Number(stFee.amountPaid) || 0;
          }
        }
      }
    });

    const due = Math.max(0, expected - collected);
    return { applicableStudents, expected, collected, due, isEnabled };
  };

  // Reset form
  const resetForm = () => {
    setFormName('');
    setFormAmount('');
    setFormTargetType('all');
    setFormSpecificClass('Ss3');
    setFormEnabled(true);
    setFormCategory('levy');
    setEditingFeeId(null);
    setIsFormOpen(false);
    setFormError(null);
  };

  // Pre-fill form for editing
  const handleEditFee = (fee: AdditionalFeeItem) => {
    setEditingFeeId(fee.id);
    setFormName(fee.name);
    setFormAmount(String(fee.amount));
    const isAll = !fee.targetClass || fee.targetClass === 'all' || fee.targetClass === 'all classes';
    setFormTargetType(isAll ? 'all' : 'specific');
    setFormSpecificClass(isAll ? 'Ss3' : fee.targetClass);
    setFormEnabled(fee.enabled !== false);
    setFormCategory(fee.category || 'levy');
    setIsFormOpen(true);
    setFormError(null);
  };

  // Select a preset
  const handleSelectPreset = (preset: typeof POPULAR_PRESETS[0]) => {
    setFormName(preset.name);
    setFormAmount(String(preset.amount));
    setFormTargetType(preset.targetClass === 'all' ? 'all' : 'specific');
    setFormSpecificClass(preset.targetClass === 'all' ? 'Ss3' : preset.targetClass);
    setFormCategory(preset.category);
    setFormEnabled(true);
    setFormError(null);
  };

  // Save (Create or Update)
  const handleSaveFee = () => {
    if (!formName.trim()) {
      setFormError('Please enter a fee name (e.g. PTA Levy, Graduation Fee).');
      return;
    }
    const parsedAmount = Number(formAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setFormError('Please enter a valid amount (e.g. 2000).');
      return;
    }

    const targetClass = formTargetType === 'all' ? 'all' : formSpecificClass;

    try {
      let updatedSchool: SchoolProfile;

      if (editingFeeId) {
        updatedSchool = updateAdditionalFeeInSchool(activeSchool.id, editingFeeId, {
          name: formName.trim(),
          amount: parsedAmount,
          targetClass,
          enabled: formEnabled,
          category: formCategory,
        });
      } else {
        const res = addAdditionalFeeToSchool(activeSchool.id, {
          name: formName.trim(),
          amount: parsedAmount,
          targetClass,
          enabled: formEnabled,
          category: formCategory,
        });
        updatedSchool = res.updatedSchool;
      }

      onUpdateSchool(updatedSchool);

      // Automatically sync student bills
      const syncedStudents = syncAdditionalFeesToStudents(students, updatedSchool);
      onUpdateStudents(syncedStudents);

      const actionText = editingFeeId ? 'updated' : 'added';
      const statusText = formEnabled ? 'active and billed to students' : 'saved as disabled/paused';
      setFeedback({
        type: 'success',
        message: `"${formName.trim()}" ${actionText} successfully (${statusText}).`,
      });
      setTimeout(() => setFeedback(null), 4000);

      resetForm();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save fee.');
    }
  };

  // Instant 1-Click Toggle Enabled/Disabled
  const handleToggleFeeStatus = (fee: AdditionalFeeItem) => {
    const newStatus = fee.enabled === false ? true : false;
    try {
      const updatedSchool = updateAdditionalFeeInSchool(activeSchool.id, fee.id, {
        enabled: newStatus,
      });
      onUpdateSchool(updatedSchool);

      // Sync updated fee configuration to all students
      const syncedStudents = syncAdditionalFeesToStudents(students, updatedSchool);
      onUpdateStudents(syncedStudents);

      setFeedback({
        type: 'success',
        message: newStatus
          ? `"${fee.name}" is now ENABLED. Applied to eligible students and visible on the dashboard.`
          : `"${fee.name}" is now DISABLED. It is paused and will not charge students.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to toggle fee status.',
      });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Delete fee
  const handleDeleteFee = (fee: AdditionalFeeItem) => {
    if (!confirm(`Are you sure you want to permanently delete "${fee.name}"?`)) {
      return;
    }

    try {
      const updatedSchool = deleteAdditionalFeeFromSchool(activeSchool.id, fee.id);
      onUpdateSchool(updatedSchool);

      const syncedStudents = syncAdditionalFeesToStudents(students, updatedSchool);
      onUpdateStudents(syncedStudents);

      setFeedback({
        type: 'success',
        message: `"${fee.name}" removed from school fees.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to delete fee.',
      });
    }
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'graduation': return <GraduationCap className="w-4 h-4 text-purple-600" />;
      case 'uniform': return <Shield className="w-4 h-4 text-emerald-600" />;
      case 'books': return <BookOpen className="w-4 h-4 text-amber-600" />;
      case 'ict': return <Laptop className="w-4 h-4 text-cyan-600" />;
      case 'excursion': return <Compass className="w-4 h-4 text-blue-600" />;
      default: return <Layers className="w-4 h-4 text-indigo-600" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="additional-fees-modal"
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92dvh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Manage School Fees & Levies
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Add PTA, uniforms, graduation or exam fees with simple Enable / Disable switches.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Feedback Toast */}
        {feedback && (
          <div
            className={`px-5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b shrink-0 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Top Status Banner & "+ Add New Fee" Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700">Fees Configured:</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {stats.activeCount} Active (Charging)
              </span>
              {stats.disabledCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {stats.disabledCount} Disabled / Paused
                </span>
              )}
            </div>

            {!isFormOpen && (
              <button
                type="button"
                id="btn-open-add-fee"
                onClick={() => {
                  resetForm();
                  setIsFormOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs shrink-0 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add New Fee</span>
              </button>
            )}
          </div>

          {/* SIMPLIFIED ADD / EDIT FEE FORM */}
          {isFormOpen && (
            <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-blue-200/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <h4 className="text-sm font-black text-blue-950">
                    {editingFeeId ? 'Edit Fee Details' : 'Add New Fee'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Quick Preset Buttons */}
              {!editingFeeId && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Quick Suggestions (1-Click Fill)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {POPULAR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition-all ${
                          formName === preset.name
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        {preset.name} ({currencySymbol}{preset.amount.toLocaleString()})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input: Fee Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">
                  Fee Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. PTA Levy, Graduation Fee, Uniform & Sportswear"
                  className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Input: Amount & Target Scope */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">
                    Amount per Student ({currencySymbol}) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="2000"
                      min="0"
                      step="100"
                      className="w-full pl-8 pr-3.5 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Who pays this fee? */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">
                    Who pays this fee?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormTargetType('all')}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all text-center ${
                        formTargetType === 'all'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Whole School (All)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormTargetType('specific')}
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all text-center ${
                        formTargetType === 'specific'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Specific Class
                    </button>
                  </div>
                </div>
              </div>

              {/* Specific Class Dropdown if selected */}
              {formTargetType === 'specific' && (
                <div className="space-y-1 animate-in fade-in duration-150">
                  <label className="text-xs font-bold text-slate-800">
                    Select Target Class
                  </label>
                  <select
                    value={formSpecificClass}
                    onChange={(e) => setFormSpecificClass(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {schoolClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls} Only
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Switch (Enable / Disable) */}
              <div className="p-3 bg-white rounded-xl border border-blue-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {formEnabled ? 'Charge Fee Immediately (Active)' : 'Save as Disabled / Paused'}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {formEnabled
                      ? 'Fee will be billed to students and displayed on the dashboard.'
                      : 'Fee is kept as a template for the future without charging students now.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setFormEnabled(!formEnabled)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    formEnabled
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {formEnabled ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-emerald-600" />
                      <span>Active</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-slate-500" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-save-fee"
                  onClick={handleSaveFee}
                  className="px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs active:scale-95"
                >
                  {editingFeeId ? 'Save Changes' : '+ Add Fee & Apply to Students'}
                </button>
              </div>
            </div>
          )}

          {/* LIST OF CONFIGURED FEES */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Configured School Fees ({existingFees.length})
              </h4>
              <span className="text-[11px] text-slate-400">
                Click the switch to Enable / Disable any fee
              </span>
            </div>

            {existingFees.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h5 className="text-sm font-bold text-slate-700">No additional fees configured yet</h5>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-3">
                  Add PTA levies, uniform fees, graduation fees, or ICT levies that you can turn ON or OFF anytime.
                </p>
                {!isFormOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setIsFormOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
                  >
                    + Add Your First Fee
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {existingFees.map((fee) => {
                  const metrics = getFeeMetrics(fee);
                  const isEnabled = fee.enabled !== false;
                  const isSchoolWide = !fee.targetClass || fee.targetClass === 'all' || fee.targetClass === 'all classes';

                  return (
                    <div
                      key={fee.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isEnabled
                          ? 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                          : 'bg-slate-50/80 border-slate-200/70 opacity-80'
                      }`}
                    >
                      {/* Top Row: Title, Badges, and Toggle Switch */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isEnabled ? 'bg-blue-50 border border-blue-200/60' : 'bg-slate-200 border border-slate-300'
                          }`}>
                            {getCategoryIcon(fee.category)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="text-sm font-bold text-slate-900 leading-snug">
                                {fee.name}
                              </h5>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border ${
                                  isSchoolWide
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}
                              >
                                {isSchoolWide ? 'All Classes' : `${fee.targetClass} Only`}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {metrics.applicableStudents} enrolled student(s) eligible
                            </p>
                          </div>
                        </div>

                        {/* Enable / Disable Switch Button */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleFeeStatus(fee)}
                            title={isEnabled ? 'Click to disable fee' : 'Click to enable fee'}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                              isEnabled
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-300'
                            }`}
                          >
                            {isEnabled ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                                <span>Active</span>
                              </>
                            ) : (
                              <>
                                <span className="w-2 h-2 rounded-full bg-slate-400" />
                                <span>Disabled</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Middle Row: Financial Metrics (Amount, Target, Due, Collected) */}
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-medium text-slate-500 block">Amount:</span>
                          <span className="font-bold text-slate-900 font-mono">
                            {formatCurrency(fee.amount, currencySymbol)}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-medium text-slate-500 block">Target:</span>
                          <span className="font-bold text-slate-900 font-mono">
                            {isEnabled ? formatCurrency(metrics.expected, currencySymbol) : '₦0 (Paused)'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-medium text-slate-500 block">Due:</span>
                          <span className="font-bold text-amber-600 font-mono">
                            {isEnabled ? formatCurrency(metrics.due, currencySymbol) : '₦0'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-medium text-slate-500 block">Collected:</span>
                          <span className="font-bold text-emerald-600 font-mono">
                            {formatCurrency(metrics.collected, currencySymbol)}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: Notice if disabled & Action buttons */}
                      <div className="mt-2.5 pt-2 flex items-center justify-between">
                        {!isEnabled ? (
                          <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                            <PauseCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Currently disabled: Students are not charged for this fee.</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Active: Billed to all students in scope.</span>
                          </span>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditFee(fee)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit fee parameters"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFee(fee)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete this fee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <span>Changes immediately synchronize to student records & dashboard</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
