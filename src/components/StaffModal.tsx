/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useId } from 'react';
import {
  X,
  User,
  Briefcase,
  Building,
  CreditCard,
  Phone,
  Mail,
  GraduationCap,
  Plus,
  Minus,
  Check,
  AlertCircle,
  Save,
  Trash2,
  DollarSign
} from 'lucide-react';
import { StaffMember, StaffDepartment, StaffEmploymentType, StaffStatus } from '../types';
import { calculateStaffFinancials, formatDepartmentName } from '../services/payrollService';
import { getTodayDateString } from '../services/calculations';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (staff: StaffMember) => void;
  onDelete?: (staffId: string) => void;
  staffToEdit?: StaffMember | null;
  currencySymbol?: string;
  nextStaffNumber?: number;
}

const NIGERIAN_BANKS = [
  'Access Bank',
  'First Bank of Nigeria',
  'GTBank (Guaranty Trust)',
  'Zenith Bank',
  'United Bank for Africa (UBA)',
  'Fidelity Bank',
  'Stanbic IBTC',
  'Union Bank',
  'Sterling Bank',
  'FCMB (First City Monument Bank)',
  'Wema Bank / ALAT',
  'Polaris Bank',
  'Ecobank Nigeria',
  'OPay Digital Bank',
  'PalmPay',
  'Kuda Microfinance Bank',
  'Moniepoint MFB',
  'Other Bank / Cash'
];

export const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  staffToEdit,
  currencySymbol = '₦',
  nextStaffNumber = 1,
}) => {
  const isEditing = Boolean(staffToEdit);

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState<StaffDepartment>('academic');
  const [employmentType, setEmploymentType] = useState<StaffEmploymentType>('full_time');
  const [baseSalary, setBaseSalary] = useState<string>('50000');
  const [bankName, setBankName] = useState('First Bank of Nigeria');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [qualification, setQualification] = useState('');
  const [status, setStatus] = useState<StaffStatus>('active');
  const [joinedDate, setJoinedDate] = useState(() => getTodayDateString());
  const [notes, setNotes] = useState('');

  // Allowances
  const [transportAllowance, setTransportAllowance] = useState<string>('0');
  const [housingAllowance, setHousingAllowance] = useState<string>('0');
  const [teachingBonus, setTeachingBonus] = useState<string>('0');
  const [lessonAllowance, setLessonAllowance] = useState<string>('0');
  const [responsibilityAllowance, setResponsibilityAllowance] = useState<string>('0');
  const [otherAllowance, setOtherAllowance] = useState<string>('0');

  // Deductions
  const [pensionDeduction, setPensionDeduction] = useState<string>('0');
  const [taxDeduction, setTaxDeduction] = useState<string>('0');
  const [loanDeduction, setLoanDeduction] = useState<string>('0');
  const [cooperativeDeduction, setCooperativeDeduction] = useState<string>('0');
  const [absenceDeduction, setAbsenceDeduction] = useState<string>('0');
  const [otherDeduction, setOtherDeduction] = useState<string>('0');

  const [activeTab, setActiveTab] = useState<'profile' | 'compensation' | 'bank'>('profile');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form ID prefixes
  const formId = useId();

  useEffect(() => {
    if (staffToEdit) {
      setFullName(staffToEdit.fullName || '');
      setRole(staffToEdit.role || '');
      setDepartment(staffToEdit.department || 'academic');
      setEmploymentType(staffToEdit.employmentType || 'full_time');
      setBaseSalary(String(staffToEdit.baseSalary || 0));
      setBankName(staffToEdit.bankName || 'First Bank of Nigeria');
      setAccountNumber(staffToEdit.accountNumber || '');
      setAccountName(staffToEdit.accountName || staffToEdit.fullName || '');
      setPhone(staffToEdit.phone || '');
      setEmail(staffToEdit.email || '');
      setQualification(staffToEdit.qualification || '');
      setStatus(staffToEdit.status || 'active');
      setJoinedDate(staffToEdit.joinedDate || getTodayDateString());
      setNotes(staffToEdit.notes || '');

      const a = staffToEdit.allowances || {};
      setTransportAllowance(String(a.transport || 0));
      setHousingAllowance(String(a.housing || 0));
      setTeachingBonus(String(a.teachingBonus || 0));
      setLessonAllowance(String(a.lessonAllowance || 0));
      setResponsibilityAllowance(String(a.responsibility || 0));
      setOtherAllowance(String(a.otherAllowance || 0));

      const d = staffToEdit.deductions || {};
      setPensionDeduction(String(d.pension || 0));
      setTaxDeduction(String(d.taxPaye || 0));
      setLoanDeduction(String(d.loanRepayment || 0));
      setCooperativeDeduction(String(d.cooperative || 0));
      setAbsenceDeduction(String(d.absencePenalty || 0));
      setOtherDeduction(String(d.otherDeduction || 0));
    } else {
      setFullName('');
      setRole('');
      setDepartment('academic');
      setEmploymentType('full_time');
      setBaseSalary('50000');
      setBankName('First Bank of Nigeria');
      setAccountNumber('');
      setAccountName('');
      setPhone('');
      setEmail('');
      setQualification('');
      setStatus('active');
      setJoinedDate(getTodayDateString());
      setNotes('');
      setTransportAllowance('5000');
      setHousingAllowance('0');
      setTeachingBonus('0');
      setLessonAllowance('0');
      setResponsibilityAllowance('0');
      setOtherAllowance('0');
      setPensionDeduction('0');
      setTaxDeduction('0');
      setLoanDeduction('0');
      setCooperativeDeduction('0');
      setAbsenceDeduction('0');
      setOtherDeduction('0');
    }
    setErrorMsg(null);
    setShowDeleteConfirm(false);
    setActiveTab('profile');
  }, [staffToEdit, isOpen]);

  // Derived financial calculation for live preview
  const numBase = parseFloat(baseSalary) || 0;
  const numTransport = parseFloat(transportAllowance) || 0;
  const numHousing = parseFloat(housingAllowance) || 0;
  const numBonus = parseFloat(teachingBonus) || 0;
  const numLesson = parseFloat(lessonAllowance) || 0;
  const numResp = parseFloat(responsibilityAllowance) || 0;
  const numOtherAllow = parseFloat(otherAllowance) || 0;

  const totalAllowances = numTransport + numHousing + numBonus + numLesson + numResp + numOtherAllow;

  const numPension = parseFloat(pensionDeduction) || 0;
  const numTax = parseFloat(taxDeduction) || 0;
  const numLoan = parseFloat(loanDeduction) || 0;
  const numCoop = parseFloat(cooperativeDeduction) || 0;
  const numAbsence = parseFloat(absenceDeduction) || 0;
  const numOtherDeduct = parseFloat(otherDeduction) || 0;

  const totalDeductions = numPension + numTax + numLoan + numCoop + numAbsence + numOtherDeduct;

  const grossPay = numBase + totalAllowances;
  const netPay = Math.max(0, grossPay - totalDeductions);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Please enter the staff member full name.');
      setActiveTab('profile');
      return;
    }
    if (!role.trim()) {
      setErrorMsg('Please enter the staff role / job title (e.g. Primary 4 Teacher).');
      setActiveTab('profile');
      return;
    }

    const staffId = staffToEdit?.id || `STF-${String(nextStaffNumber).padStart(3, '0')}`;

    const staffData: StaffMember = {
      id: staffId,
      fullName: fullName.trim(),
      role: role.trim(),
      department,
      employmentType,
      baseSalary: numBase,
      bankName,
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim() || fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      qualification: qualification.trim() || undefined,
      status,
      joinedDate,
      allowances: {
        transport: numTransport > 0 ? numTransport : undefined,
        housing: numHousing > 0 ? numHousing : undefined,
        teachingBonus: numBonus > 0 ? numBonus : undefined,
        lessonAllowance: numLesson > 0 ? numLesson : undefined,
        responsibility: numResp > 0 ? numResp : undefined,
        otherAllowance: numOtherAllow > 0 ? numOtherAllow : undefined,
      },
      deductions: {
        pension: numPension > 0 ? numPension : undefined,
        taxPaye: numTax > 0 ? numTax : undefined,
        loanRepayment: numLoan > 0 ? numLoan : undefined,
        cooperative: numCoop > 0 ? numCoop : undefined,
        absencePenalty: numAbsence > 0 ? numAbsence : undefined,
        otherDeduction: numOtherDeduct > 0 ? numOtherDeduct : undefined,
      },
      notes: notes.trim() || undefined,
    };

    onSave(staffData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92dvh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isEditing ? 'Edit Staff Profile' : 'Add Staff Member'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing ? `Managing ID: ${staffToEdit.id}` : 'Enroll teacher or support staff onto payroll'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            id="close-staff-modal-btn"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Realtime Live Salary Summary Ribbon */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <span>Base: <strong>{currencySymbol}{numBase.toLocaleString()}</strong></span>
            <span>+</span>
            <span>Allowances: <strong>{currencySymbol}{totalAllowances.toLocaleString()}</strong></span>
            <span>-</span>
            <span>Deductions: <strong>{currencySymbol}{totalDeductions.toLocaleString()}</strong></span>
          </div>
          <div className="bg-slate-900 text-white font-bold px-2.5 py-1 rounded-lg text-xs">
            Net Pay: {currencySymbol}{netPay.toLocaleString()} / mo
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-5 pt-2 bg-white shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            id="staff-tab-profile"
            className={`pb-2 text-xs font-semibold border-b-2 transition-all px-2 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Personal & Role
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compensation')}
            id="staff-tab-compensation"
            className={`pb-2 text-xs font-semibold border-b-2 transition-all px-2 cursor-pointer ${
              activeTab === 'compensation'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Salary & Allowances
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bank')}
            id="staff-tab-bank"
            className={`pb-2 text-xs font-semibold border-b-2 transition-all px-2 cursor-pointer ${
              activeTab === 'bank'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            3. Bank & Payment
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: Profile & Role */}
          {activeTab === 'profile' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              <div>
                <label htmlFor={`${formId}-fullName`} className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id={`${formId}-fullName`}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Mrs. Folake Adeleke"
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-role`} className="block text-xs font-bold text-slate-700 mb-1">
                    Job Title / Role <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    id={`${formId}-role`}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Primary 4 Class Teacher"
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${formId}-department`} className="block text-xs font-bold text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    id={`${formId}-department`}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as StaffDepartment)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="academic">Academic / Teaching</option>
                    <option value="administrative">Administrative / Accounts</option>
                    <option value="management">School Leadership / Admin</option>
                    <option value="support_security">Security & Sanitation</option>
                    <option value="transport_facilities">Transport & Facilities</option>
                    <option value="other">Other Support</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-employmentType`} className="block text-xs font-bold text-slate-700 mb-1">
                    Employment Type
                  </label>
                  <select
                    id={`${formId}-employmentType`}
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as StaffEmploymentType)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="full_time">Full-Time Staff</option>
                    <option value="part_time">Part-Time / Subject Teacher</option>
                    <option value="contract">Contract / Temporary</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={`${formId}-status`} className="block text-xs font-bold text-slate-700 mb-1">
                    Status on Payroll
                  </label>
                  <select
                    id={`${formId}-status`}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StaffStatus)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="active">Active (On Payroll)</option>
                    <option value="on_leave">On Leave</option>
                    <option value="suspended">Suspended</option>
                    <option value="resigned">Resigned / Exited</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-phone`} className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id={`${formId}-phone`}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor={`${formId}-qualification`} className="block text-xs font-bold text-slate-700 mb-1">
                    Qualification
                  </label>
                  <input
                    type="text"
                    id={`${formId}-qualification`}
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="e.g. B.Ed, NCE, HND, SSCE"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-joinedDate`} className="block text-xs font-bold text-slate-700 mb-1">
                  Date Joined
                </label>
                <input
                  type="date"
                  id={`${formId}-joinedDate`}
                  value={joinedDate}
                  onChange={(e) => setJoinedDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* TAB 2: Compensation, Allowances & Deductions */}
          {activeTab === 'compensation' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Base Monthly Salary */}
              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                <label htmlFor={`${formId}-baseSalary`} className="block text-xs font-bold text-blue-950 mb-1">
                  Monthly Base Salary ({currencySymbol}) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    id={`${formId}-baseSalary`}
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    placeholder="50000"
                    min="0"
                    step="500"
                    required
                    className="w-full pl-8 pr-3 py-2 text-sm font-bold text-slate-800 rounded-xl border border-blue-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <p className="text-[11px] text-blue-700 mt-1">
                  The primary monthly contract compensation before allowances and statutory deductions.
                </p>
              </div>

              {/* Monthly Allowances (Additions) */}
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    Monthly Allowances (Bonuses & Perks)
                  </span>
                  <span className="text-xs font-bold text-emerald-700">
                    +{currencySymbol}{totalAllowances.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label htmlFor={`${formId}-transportAllowance`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Transport ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-transportAllowance`}
                      value={transportAllowance}
                      onChange={(e) => setTransportAllowance(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-housingAllowance`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Housing / Rent ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-housingAllowance`}
                      value={housingAllowance}
                      onChange={(e) => setHousingAllowance(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-teachingBonus`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Teaching Bonus ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-teachingBonus`}
                      value={teachingBonus}
                      onChange={(e) => setTeachingBonus(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-lessonAllowance`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      After-School Lesson ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-lessonAllowance`}
                      value={lessonAllowance}
                      onChange={(e) => setLessonAllowance(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-responsibilityAllowance`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      HOD / Headship ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-responsibilityAllowance`}
                      value={responsibilityAllowance}
                      onChange={(e) => setResponsibilityAllowance(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-otherAllowance`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Other Allowance ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-otherAllowance`}
                      value={otherAllowance}
                      onChange={(e) => setOtherAllowance(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Monthly Deductions (Subtractions) */}
              <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                    <Minus className="w-3.5 h-3.5 text-rose-600" />
                    Monthly Deductions (Taxes, Pension, Loan)
                  </span>
                  <span className="text-xs font-bold text-rose-700">
                    -{currencySymbol}{totalDeductions.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label htmlFor={`${formId}-pensionDeduction`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Pension ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-pensionDeduction`}
                      value={pensionDeduction}
                      onChange={(e) => setPensionDeduction(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-taxDeduction`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      PAYE Tax ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-taxDeduction`}
                      value={taxDeduction}
                      onChange={(e) => setTaxDeduction(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-loanDeduction`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Loan Repayment ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-loanDeduction`}
                      value={loanDeduction}
                      onChange={(e) => setLoanDeduction(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-cooperativeDeduction`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Staff Cooperative ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-cooperativeDeduction`}
                      value={cooperativeDeduction}
                      onChange={(e) => setCooperativeDeduction(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-absenceDeduction`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Absence / Penalty ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-absenceDeduction`}
                      value={absenceDeduction}
                      onChange={(e) => setAbsenceDeduction(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label htmlFor={`${formId}-otherDeduction`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Other Deduction ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      id={`${formId}-otherDeduction`}
                      value={otherDeduction}
                      onChange={(e) => setOtherDeduction(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Bank & Payment Details */}
          {activeTab === 'bank' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              <div>
                <label htmlFor={`${formId}-bankName`} className="block text-xs font-bold text-slate-700 mb-1">
                  Bank Name
                </label>
                <select
                  id={`${formId}-bankName`}
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  {NIGERIAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${formId}-accountNumber`} className="block text-xs font-bold text-slate-700 mb-1">
                  Account Number (NUBAN)
                </label>
                <input
                  type="text"
                  id={`${formId}-accountNumber`}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="e.g. 0123456789 (10 digits)"
                  maxLength={12}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${formId}-accountName`} className="block text-xs font-bold text-slate-700 mb-1">
                  Account Beneficiary Name
                </label>
                <input
                  type="text"
                  id={`${formId}-accountName`}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={fullName || 'e.g. Folake Adeleke'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor={`${formId}-email`} className="block text-xs font-bold text-slate-700 mb-1">
                  Email (for digital payslip)
                </label>
                <input
                  type="email"
                  id={`${formId}-email`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. staff@dominion.edu.ng"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor={`${formId}-notes`} className="block text-xs font-bold text-slate-700 mb-1">
                  Special Remarks / Notes
                </label>
                <textarea
                  id={`${formId}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Subject coordinator for Basic Science & Tech"
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
            {isEditing && onDelete && showDeleteConfirm ? (
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl animate-in fade-in">
                <span className="text-[11px] text-rose-800 font-bold">Delete permanently?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(staffToEdit!.id);
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : isEditing && onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-transparent hover:border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Profile</span>
              </button>
            ) : null}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                id="save-staff-btn"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Save Changes' : 'Enroll Staff'}</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
