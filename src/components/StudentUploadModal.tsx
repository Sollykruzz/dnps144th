/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Link2, 
  Clipboard, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Download, 
  RefreshCw, 
  Zap, 
  Search,
  Cloud,
  Check,
  FileText,
  AlertTriangle,
  Info
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { StudentPaymentRecord, SchoolProfile, PaymentStatus } from '../types';
import { 
  calculateBalance, 
  calculateStatus, 
  getTodayDateString, 
  formatCurrency,
  getClassFeeSchedule,
  generateNextStudentId
} from '../services/calculations';
import { 
  batchSaveStudentsToFirestore, 
  recordFirebaseSyncSuccess,
  recordFirebaseSyncError 
} from '../services/firebase';
import { saveStoredStudents } from '../services/storage';

interface StudentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSchool: SchoolProfile;
  existingStudents: StudentPaymentRecord[];
  onUploadSuccess: (newStudents: StudentPaymentRecord[], message: string, isCloudSynced?: boolean) => void;
  onUploadPartialFailure?: (localStudents: StudentPaymentRecord[], errorMessage: string) => void;
}

type ImportSource = 'file' | 'sheet_link' | 'paste';

/**
 * Standardize key by removing BOM, punctuation, spaces, underscores, and lowercase
 */
function cleanKey(key: string): string {
  return String(key || '')
    .trim()
    .replace(/^[\uFEFF\uFFFE\u00EF\u00BB\u00BF]+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Clean currency string / formatted numbers into a float
 */
function cleanNum(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : Math.max(0, val);
  
  const str = String(val)
    .replace(/[\uFEFF\uFFFE\u00EF\u00BB\u00BF]/g, '')
    .replace(/₦|\$|€|£|ghs|kes|zar|,|\s/gi, '')
    .trim();

  // Handle accounting negative format (500)
  if (str.startsWith('(') && str.endsWith(')')) {
    const parsed = parseFloat(str.slice(1, -1));
    return isNaN(parsed) ? fallback : -Math.abs(parsed);
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? fallback : Math.max(0, parsed);
}

/**
 * Multi-alias search across raw row keys
 */
function findRowValue(row: Record<string, any>, aliases: string[]): any {
  const keys = Object.keys(row);
  const normalizedKeyMap = new Map<string, string>();
  for (const k of keys) {
    normalizedKeyMap.set(cleanKey(k), k);
  }

  // Exact cleaned key match
  for (const alias of aliases) {
    const cleanAlias = cleanKey(alias);
    const origKey = normalizedKeyMap.get(cleanAlias);
    if (origKey && row[origKey] !== undefined && row[origKey] !== null && String(row[origKey]).trim() !== '') {
      return row[origKey];
    }
  }

  // Partial substring match
  for (const alias of aliases) {
    const cleanAlias = cleanKey(alias);
    for (const [normK, origK] of normalizedKeyMap.entries()) {
      if ((normK.includes(cleanAlias) || cleanAlias.includes(normK)) && row[origK] !== undefined && row[origK] !== null && String(row[origK]).trim() !== '') {
        return row[origK];
      }
    }
  }

  return undefined;
}

export const StudentUploadModal: React.FC<StudentUploadModalProps> = ({
  isOpen,
  onClose,
  activeSchool,
  existingStudents,
  onUploadSuccess,
  onUploadPartialFailure,
}) => {
  const [source, setSource] = useState<ImportSource>('file');
  const [file, setFile] = useState<File | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [autoApplyFeeSchedule, setAutoApplyFeeSchedule] = useState<boolean>(true);

  // Cloud Sync Failure & Retry State
  const [cloudSyncError, setCloudSyncError] = useState<{
    message: string;
    count: number;
  } | null>(null);
  const [preparedStudentList, setPreparedStudentList] = useState<StudentPaymentRecord[] | null>(null);
  const [showDismissConfirm, setShowDismissConfirm] = useState<boolean>(false);

  // Parsing & Preview State
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsedStudents, setParsedStudents] = useState<StudentPaymentRecord[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Upload to Firebase Progress State
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number; message: string }>({
    processed: 0,
    total: 0,
    message: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered preview records
  const filteredPreview = useMemo(() => {
    if (!searchTerm.trim()) return parsedStudents;
    const q = searchTerm.toLowerCase().trim();
    return parsedStudents.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.class.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  }, [parsedStudents, searchTerm]);

  if (!isOpen) return null;

  /**
   * Ultra-robust Row Normalizer:
   * Handles single Name column, split Surname/Firstname columns, missing IDs,
   * unformatted currencies, itemized and lump sum fee schedules.
   */
  const normalizeRow = (rawRow: Record<string, any>, index: number): StudentPaymentRecord | null => {
    // 1. Detect Full Name or combine split names
    let fullName = String(
      findRowValue(rawRow, [
        'full_name',
        'fullname',
        'student_name',
        'studentname',
        'name',
        'student',
        'pupil_name',
        'pupilname',
        'learner_name',
        'learnername',
        'pupil',
        'learner',
        'candidate_name',
        'candidatename',
        'names',
        'student_full_name',
        'name_of_student',
        'name_of_pupil',
      ]) || ''
    ).trim();

    // If no single full name column, check for split Surname / First Name / Other Names
    if (!fullName) {
      const surname = String(findRowValue(rawRow, ['surname', 'last_name', 'lastname', 'family_name', 'familyname']) || '').trim();
      const firstName = String(findRowValue(rawRow, ['first_name', 'firstname', 'given_name', 'givenname']) || '').trim();
      const otherNames = String(findRowValue(rawRow, ['other_names', 'othernames', 'middle_name', 'middlename']) || '').trim();

      if (surname || firstName) {
        fullName = [surname, firstName, otherNames].filter(Boolean).join(' ').trim();
      }
    }

    // Skip blank or invalid summary rows (e.g. "Total", "Summary", empty rows)
    if (!fullName || fullName.length < 2) return null;
    const lowerName = fullName.toLowerCase();
    if (
      lowerName === 'total' ||
      lowerName === 'grand total' ||
      lowerName === 'summary' ||
      lowerName === 'average' ||
      lowerName === 'class total' ||
      lowerName === 'subtotal'
    ) {
      return null;
    }

    // 2. Detect ID or auto-generate
    let studentId = String(
      findRowValue(rawRow, [
        'id',
        'student_id',
        'studentid',
        'admission_no',
        'admissionno',
        'admission_number',
        'adm_no',
        'admno',
        'reg_no',
        'regno',
        'registration_no',
        'registrationno',
        'roll_no',
        'rollno',
        'code',
        'serial_no',
        'serialno',
        'sn',
        's_n',
        'student_number',
        'matric_no',
        'index_no',
        'no',
      ]) || ''
    ).trim();

    // 3. Detect Class
    let studentClass = String(
      findRowValue(rawRow, [
        'class',
        'grade',
        'level',
        'arm',
        'classroom',
        'standard',
        'current_class',
        'class_grade',
        'class_name',
        'year_group',
        'section',
        'form',
      ]) || ''
    ).trim();

    if (!studentClass) {
      studentClass = activeSchool.classes && activeSchool.classes.length > 0 ? activeSchool.classes[0] : 'Primary 1';
    }

    if (!studentId || studentId === '0' || studentId === '-') {
      studentId = generateNextStudentId(existingStudents.length + index, undefined, studentClass);
    }

    // 4. Term and Session
    const term = String(
      findRowValue(rawRow, ['term', 'academic_term', 'semester', 'period', 'term_session']) || 'First Term'
    ).trim();

    const session = String(
      findRowValue(rawRow, ['session', 'academic_session', 'year', 'school_year', 'academic_year']) || '2025/2026'
    ).trim();

    // 5. Granular Fee amounts
    const sched = getClassFeeSchedule(activeSchool, studentClass);

    const tuitionFeeRaw = findRowValue(rawRow, ['tuition_fee', 'tuition', 'school_fee', 'schoolfee', 'tuition_amount', 'base_fee']);
    const tuitionPaidRaw = findRowValue(rawRow, ['tuition_paid', 'school_fee_paid', 'paid_tuition', 'tuitionpaid']);

    const admissionFeeRaw = findRowValue(rawRow, ['admission_fee', 'admission', 'reg_fee', 'registration_fee', 'entry_fee', 'registration']);
    const admissionPaidRaw = findRowValue(rawRow, ['admission_paid', 'reg_paid', 'paid_admission']);

    const examFeeRaw = findRowValue(rawRow, ['exam_fee', 'exam', 'examination_fee', 'test_fee', 'assessment_fee', 'exam_amount']);
    const examPaidRaw = findRowValue(rawRow, ['exam_paid', 'examination_paid', 'paid_exam']);

    const lessonFeeRaw = findRowValue(rawRow, ['lesson_fee', 'lesson', 'extra_lesson', 'coaching', 'lesson_amount']);
    const lessonPaidRaw = findRowValue(rawRow, ['lesson_paid', 'extra_lesson_paid', 'paid_lesson']);

    const totalFeeRaw = findRowValue(rawRow, ['total_fee', 'fee_amount', 'expected_fee', 'fees', 'amount_due', 'bill', 'total_amount', 'total_fees', 'total']);
    const amountPaidRaw = findRowValue(rawRow, ['amount_paid', 'total_paid', 'paid', 'paid_amount', 'amountpaid', 'deposit', 'sum_paid', 'received', 'payment']);

    const receiptNo = String(findRowValue(rawRow, ['receipt_no', 'receipt', 'receipt_number', 'teller', 'tellerno', 'voucher', 'ref', 'reference', 'slip_no']) || '').trim();
    const paymentDate = String(findRowValue(rawRow, ['payment_date', 'date', 'paid_date', 'trans_date', 'transaction_date', 'pay_date', 'receipt_date']) || '').trim();

    // Exemption / Scholarship
    const exemptRaw = findRowValue(rawRow, ['is_exempt_from_school_fee', 'exempt', 'scholarship', 'scholarship_beneficiary', 'exempted', 'waiver']);
    const isExempt =
      exemptRaw === true ||
      String(exemptRaw).toLowerCase() === 'true' ||
      String(exemptRaw).toLowerCase() === 'yes' ||
      String(exemptRaw).toLowerCase() === '1';

    // Lesson opt-out: students who do not attend after-school lessons
    const noLessonRaw = findRowValue(rawRow, ['lesson_disabled', 'no_lesson', 'no_lessons', 'lesson_exempt', 'not_attending_lessons']);
    const noLesson =
      noLessonRaw === true ||
      ['true', 'yes', 'y', '1'].includes(String(noLessonRaw).trim().toLowerCase());

    const scholarshipNotes = String(findRowValue(rawRow, ['scholarship_notes', 'scholarship_type', 'sponsor', 'benefactor', 'sponsor_name', 'remarks']) || '').trim();

    // Numerical resolution
    let parsedTuitionFee = tuitionFeeRaw !== undefined ? cleanNum(tuitionFeeRaw) : (autoApplyFeeSchedule ? sched.tuitionFee : 0);
    let parsedAdmissionFee = admissionFeeRaw !== undefined ? cleanNum(admissionFeeRaw) : 0;
    let parsedExamFee = examFeeRaw !== undefined ? cleanNum(examFeeRaw) : (autoApplyFeeSchedule ? sched.examFee : 0);
    let parsedLessonFee = lessonFeeRaw !== undefined ? cleanNum(lessonFeeRaw) : 0;

    let explicitTotalFee = totalFeeRaw !== undefined ? cleanNum(totalFeeRaw) : (parsedTuitionFee + parsedAdmissionFee + parsedExamFee + parsedLessonFee);
    if (explicitTotalFee === 0 && autoApplyFeeSchedule) {
      explicitTotalFee = sched.tuitionFee + sched.examFee;
      parsedTuitionFee = sched.tuitionFee;
      parsedExamFee = sched.examFee;
    }

    const parsedAmountPaid = amountPaidRaw !== undefined ? cleanNum(amountPaidRaw) : 0;
    const parsedTuitionPaid = tuitionPaidRaw !== undefined ? cleanNum(tuitionPaidRaw) : (parsedAmountPaid > 0 ? Math.min(parsedAmountPaid, parsedTuitionFee) : 0);
    const parsedAdmissionPaid = admissionPaidRaw !== undefined ? cleanNum(admissionPaidRaw) : 0;
    const parsedExamPaid = examPaidRaw !== undefined ? cleanNum(examPaidRaw) : 0;
    const parsedLessonPaid = lessonPaidRaw !== undefined ? cleanNum(lessonPaidRaw) : 0;

    const balance = calculateBalance(explicitTotalFee, parsedAmountPaid);
    const status: PaymentStatus = calculateStatus(explicitTotalFee, parsedAmountPaid);

    return {
      id: studentId,
      full_name: fullName,
      class: studentClass,
      term,
      session,
      fee_amount: explicitTotalFee,
      amount_paid: parsedAmountPaid,
      balance,
      status,
      tuition_fee: parsedTuitionFee,
      tuition_paid: parsedTuitionPaid,
      tuition_status: parsedTuitionFee > 0 ? (parsedTuitionPaid >= parsedTuitionFee ? 'fully_paid' : parsedTuitionPaid > 0 ? 'part_payment' : 'unpaid') : undefined,
      admission_fee: parsedAdmissionFee > 0 ? parsedAdmissionFee : undefined,
      admission_paid: parsedAdmissionPaid > 0 ? parsedAdmissionPaid : undefined,
      admission_status: parsedAdmissionFee > 0 ? (parsedAdmissionPaid >= parsedAdmissionFee ? 'fully_paid' : parsedAdmissionPaid > 0 ? 'part_payment' : 'unpaid') : undefined,
      exam_fee: parsedExamFee > 0 ? parsedExamFee : undefined,
      exam_paid: parsedExamPaid > 0 ? parsedExamPaid : undefined,
      exam_status: parsedExamFee > 0 ? (parsedExamPaid >= parsedExamFee ? 'fully_paid' : parsedExamPaid > 0 ? 'part_payment' : 'unpaid') : undefined,
      lesson_fee: parsedLessonFee > 0 ? parsedLessonFee : undefined,
      lesson_paid: parsedLessonPaid > 0 ? parsedLessonPaid : undefined,
      lesson_status: parsedLessonFee > 0 ? (parsedLessonPaid >= parsedLessonFee ? 'fully_paid' : parsedLessonPaid > 0 ? 'part_payment' : 'unpaid') : undefined,
      lesson_disabled: noLesson && parsedLessonPaid === 0 ? true : undefined,
      receipt_no: receiptNo || undefined,
      payment_date: paymentDate || (parsedAmountPaid > 0 ? getTodayDateString() : ''),
      is_exempt_from_school_fee: isExempt,
      scholarship_notes: scholarshipNotes || undefined,
    };
  };

  /**
   * Smart Header Auto-Detection:
   * If row 0 is a title banner, scans the first 10 rows to locate the real column header row
   */
  const processRawArrayOfRows = (rawRows: any[]) => {
    if (!rawRows || rawRows.length === 0) {
      setParseErrors(['Spreadsheet contains no data rows.']);
      return;
    }

    const list: StudentPaymentRecord[] = [];
    const seenIds = new Set<string>();

    rawRows.forEach((row, idx) => {
      const student = normalizeRow(row, idx);
      if (student) {
        // Prevent duplicate IDs within the same uploaded file
        let finalId = student.id;
        if (seenIds.has(finalId.toLowerCase())) {
          finalId = `${finalId}_${idx + 1}`;
          student.id = finalId;
        }
        seenIds.add(finalId.toLowerCase());
        list.push(student);
      }
    });

    if (list.length === 0) {
      setParseErrors([
        'Could not detect student records in this file. Please ensure your CSV has column headers like "Full Name" (or "Surname" & "First Name"), "Class", and "Fee Amount".',
      ]);
    } else {
      setParsedStudents(list);
      setParseErrors([]);
      if (list.length < rawRows.length) {
        const skipped = rawRows.length - list.length;
        setParseWarnings([
          `Detected ${list.length} student records (${skipped} empty/header summary row${skipped > 1 ? 's were' : ' was'} automatically skipped).`,
        ]);
      } else {
        setParseWarnings([]);
      }
    }
  };

  // Parse direct file upload (.xlsx, .xls, .csv, .tsv)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    processFile(selected);
  };

  const processFile = async (fileToProcess: File) => {
    setIsParsing(true);
    setParseErrors([]);
    setParseWarnings([]);
    setParsedStudents([]);

    try {
      const fileName = fileToProcess.name.toLowerCase();

      if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
        Papa.parse(fileToProcess, {
          header: true,
          skipEmptyLines: 'greedy',
          delimitersToGuess: [',', '\t', '|', ';', ':'],
          transformHeader: (h) => h.trim().replace(/^[\uFEFF\uFFFE\u00EF\u00BB\u00BF]+/, ''),
          complete: (results) => {
            processRawArrayOfRows(results.data);
            setIsParsing(false);
          },
          error: (err) => {
            setParseErrors([`CSV parsing error: ${err.message}`]);
            setIsParsing(false);
          },
        });
      } else {
        // Excel (.xlsx, .xls)
        const arrayBuffer = await fileToProcess.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Find best sheet name
        const sheetName =
          workbook.SheetNames.find((s) => /feedata|student|roster|fees|class/i.test(s)) ||
          workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error('No sheets found in the Excel workbook.');
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', blankrows: false });
        processRawArrayOfRows(jsonData);
        setIsParsing(false);
      }
    } catch (err: any) {
      setParseErrors([`File read error: ${err.message || String(err)}`]);
      setIsParsing(false);
    }
  };

  // Parse pasted table text
  const handleParsePastedText = () => {
    if (!pastedText.trim()) return;
    setIsParsing(true);
    setParseErrors([]);
    setParseWarnings([]);

    try {
      Papa.parse(pastedText.trim(), {
        header: true,
        skipEmptyLines: 'greedy',
        delimitersToGuess: ['\t', ',', '|', ';'],
        transformHeader: (h) => h.trim().replace(/^[\uFEFF\uFFFE\u00EF\u00BB\u00BF]+/, ''),
        complete: (results) => {
          processRawArrayOfRows(results.data);
          setIsParsing(false);
        },
        error: (err) => {
          setParseErrors([`Text parse error: ${err.message}`]);
          setIsParsing(false);
        },
      });
    } catch (err: any) {
      setParseErrors([`Parse error: ${err.message || String(err)}`]);
      setIsParsing(false);
    }
  };

  // Parse live Google Sheet link
  const handleFetchFromSheetUrl = async () => {
    if (!sheetUrl.trim()) return;
    setIsParsing(true);
    setParseErrors([]);
    setParseWarnings([]);
    setParsedStudents([]);

    try {
      let targetUrl = sheetUrl.trim();

      // Handle published Google Sheets web links: /d/e/2PACX.../pubhtml -> /pub?output=csv
      if (targetUrl.includes('/pubhtml') || (targetUrl.includes('/pub') && !targetUrl.includes('output=csv'))) {
        targetUrl = targetUrl.replace(/\/pubhtml.*/, '/pub?output=csv').replace(/\/pub(\?.*)?$/, '/pub?output=csv');
      } else if (targetUrl.includes('docs.google.com/spreadsheets/d/')) {
        const match = targetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          const sheetId = match[1];
          const gidMatch = targetUrl.match(/gid=([0-9]+)/);
          const gid = gidMatch ? gidMatch[1] : '0';
          targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
        }
      }

      const res = await fetch(targetUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Could not fetch Google Sheet. Please check your sheet link permissions.`);
      }

      const text = await res.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        delimitersToGuess: [',', '\t', '|', ';'],
        transformHeader: (h) => h.trim().replace(/^[\uFEFF\uFFFE\u00EF\u00BB\u00BF]+/, ''),
        complete: (results) => {
          processRawArrayOfRows(results.data);
          setIsParsing(false);
        },
        error: (err) => {
          setParseErrors([`Sheet CSV parse error: ${err.message}`]);
          setIsParsing(false);
        },
      });
    } catch (err: any) {
      setParseErrors([
        `Google Sheet link fetch notice: ${err.message || String(err)}.`,
        'Tip: If your sheet has strict permissions or CORS restrictions, you can download your sheet as Excel (.xlsx) or CSV and upload via the "Upload CSV / Excel File" tab, or copy and paste the rows in "Paste Table Rows" for 100% instant import!'
      ]);
      setIsParsing(false);
    }
  };

  // Download Sample Google Sheet / CSV Template
  const handleDownloadTemplate = () => {
    const headers = [
      'Student ID',
      'Full Name',
      'Class',
      'Term',
      'Session',
      'Tuition Fee',
      'Tuition Paid',
      'Admission Fee',
      'Admission Paid',
      'Exam Fee',
      'Exam Paid',
      'Lesson Fee',
      'Lesson Paid',
      'Total Fee',
      'Amount Paid',
      'Receipt No',
      'Payment Date',
      'Scholarship'
    ];

    const sampleRow1 = [
      'STU-0001',
      'Chukwuemeka Okonkwo',
      activeSchool.classes[0] || 'Primary 1',
      'First Term',
      '2025/2026',
      '20000',
      '20000',
      '5000',
      '5000',
      '1500',
      '1500',
      '2000',
      '2000',
      '28500',
      '28500',
      'REC-1001',
      getTodayDateString(),
      'No'
    ];

    const sampleRow2 = [
      'STU-0002',
      'Amina Bello',
      activeSchool.classes[1] || 'Primary 2',
      'First Term',
      '2025/2026',
      '20000',
      '10000',
      '0',
      '0',
      '1500',
      '1500',
      '2000',
      '0',
      '23500',
      '11500',
      'REC-1002',
      getTodayDateString(),
      'No'
    ];

    const sampleRow3 = [
      'STU-0003',
      'Tunde Balogun (Exempt)',
      activeSchool.classes[0] || 'Primary 1',
      'First Term',
      '2025/2026',
      '0',
      '0',
      '0',
      '0',
      '1500',
      '1500',
      '2000',
      '2000',
      '3500',
      '3500',
      'REC-1003',
      getTodayDateString(),
      'Yes'
    ];

    const csvContent = [headers.join(','), sampleRow1.join(','), sampleRow2.join(','), sampleRow3.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Student_Upload_Template_${activeSchool.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Execute Upload to Firebase Firestore & Local Storage
  const handleCommitUploadToFirebase = async () => {
    if (parsedStudents.length === 0) return;
    setIsUploading(true);
    setCloudSyncError(null);
    setUploadProgress({
      processed: 0,
      total: parsedStudents.length,
      message: 'Processing and saving student records...',
    });

    const targetSchoolId = activeSchool.id.toLowerCase();
    let finalStudentList: StudentPaymentRecord[] = [];

    try {
      if (importMode === 'replace') {
        finalStudentList = [...parsedStudents];
      } else {
        // Merge mode: map existing with new
        const existingMap = new Map(existingStudents.map((s) => [s.id.toLowerCase().trim(), s]));
        const nameMap = new Map(existingStudents.map((s) => [s.full_name.toLowerCase().trim(), s]));

        parsedStudents.forEach((newS) => {
          const idKey = newS.id.toLowerCase().trim();
          const nameKey = newS.full_name.toLowerCase().trim();

          if (existingMap.has(idKey)) {
            const existing = existingMap.get(idKey)!;
            existingMap.set(idKey, { ...existing, ...newS });
          } else if (nameMap.has(nameKey)) {
            const existing = nameMap.get(nameKey)!;
            existingMap.set(existing.id.toLowerCase().trim(), { ...existing, ...newS });
          } else {
            existingMap.set(idKey, newS);
          }
        });

        finalStudentList = Array.from(existingMap.values());
      }

      setPreparedStudentList(finalStudentList);

      // 1. Immediately save to local storage cache (guarantees local access in current session)
      saveStoredStudents(finalStudentList, targetSchoolId);

      // 2. Batch save directly to Firebase Cloud Firestore
      setUploadProgress({
        processed: Math.floor(parsedStudents.length / 2),
        total: parsedStudents.length,
        message: 'Syncing to Cloud Firestore database...',
      });

      await batchSaveStudentsToFirestore(finalStudentList, targetSchoolId, (processed, total) => {
        setUploadProgress({
          processed,
          total,
          message: `Writing documents to Firebase Cloud Firestore (${processed}/${total})...`,
        });
      });

      recordFirebaseSyncSuccess();
      setCloudSyncError(null);
      setPreparedStudentList(null);

      onUploadSuccess(
        finalStudentList,
        `Successfully uploaded & synced ${parsedStudents.length} student records for ${activeSchool.name}!`,
        true
      );
      onClose();
    } catch (err: any) {
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Unknown cloud Firestore write failure');
      console.warn('[Upload notice]: Cloud Firestore sync failed:', err);
      recordFirebaseSyncError(errorMessage);

      setCloudSyncError({
        message: errorMessage,
        count: finalStudentList.length || parsedStudents.length,
      });

      // Explicitly inform the parent: saved locally only, cloud sync failed.
      if (onUploadPartialFailure) {
        onUploadPartialFailure(finalStudentList.length > 0 ? finalStudentList : parsedStudents, errorMessage);
      } else {
        onUploadSuccess(
          finalStudentList.length > 0 ? finalStudentList : parsedStudents,
          `Saved locally, but Cloud Firestore sync failed. Data may not be visible on other devices/sessions until retried. Error: ${errorMessage}`,
          false
        );
      }
      // DO NOT auto-close modal! Keep open so the user sees the failure and can retry.
    } finally {
      setIsUploading(false);
    }
  };

  // Retry Cloud Firestore sync without re-parsing file
  const handleRetryCloudSync = async () => {
    const listToRetry = preparedStudentList && preparedStudentList.length > 0
      ? preparedStudentList
      : parsedStudents;
    if (!listToRetry || listToRetry.length === 0) return;

    setIsUploading(true);
    setUploadProgress({
      processed: 0,
      total: listToRetry.length,
      message: 'Retrying sync to Cloud Firestore database...',
    });

    const targetSchoolId = activeSchool.id.toLowerCase();

    try {
      // Ensure local cache is updated
      saveStoredStudents(listToRetry, targetSchoolId);

      await batchSaveStudentsToFirestore(listToRetry, targetSchoolId, (processed, total) => {
        setUploadProgress({
          processed,
          total,
          message: `Writing documents to Firebase Cloud Firestore (${processed}/${total})...`,
        });
      });

      recordFirebaseSyncSuccess();
      setCloudSyncError(null);
      setPreparedStudentList(null);

      onUploadSuccess(
        listToRetry,
        `Successfully uploaded & synced ${listToRetry.length} student records for ${activeSchool.name}!`,
        true
      );
      onClose();
    } catch (err: any) {
      const errorMessage = err?.message || (typeof err === 'string' ? err : 'Unknown cloud Firestore write failure');
      console.warn('[Retry Cloud Sync notice]:', err);
      recordFirebaseSyncError(errorMessage);

      setCloudSyncError({
        message: errorMessage,
        count: listToRetry.length,
      });

      if (onUploadPartialFailure) {
        onUploadPartialFailure(listToRetry, errorMessage);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleAttemptClose = () => {
    if (cloudSyncError) {
      setShowDismissConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden my-auto relative">
        
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  Upload Student Roster & Fee Ledger
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <Zap className="w-3 h-3 text-emerald-600" />
                  Auto Column Matching
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Target School: <strong className="text-slate-800">{activeSchool.name}</strong> • CSV, Excel (.xlsx/.xls) or Google Sheets
              </p>
            </div>
          </div>
          <button
            onClick={handleAttemptClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* Source Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setSource('file')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                source === 'file'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              Upload CSV / Excel File
            </button>
            <button
              onClick={() => setSource('sheet_link')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                source === 'sheet_link'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-3.5 h-3.5 text-blue-600" />
              Google Sheet Link
            </button>
            <button
              onClick={() => setSource('paste')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                source === 'paste'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clipboard className="w-3.5 h-3.5 text-indigo-600" />
              Paste Table Rows
            </button>
          </div>

          {/* Source Input Area */}
          {source === 'file' && (
            <div className="space-y-3">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/20 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls, .tsv, .txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  {file ? file.name : 'Choose or drag & drop student CSV or Excel spreadsheet'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mb-3">
                  Supports Google Sheet CSV (<strong className="text-slate-700">.csv</strong>), Microsoft Excel (<strong className="text-slate-700">.xlsx, .xls</strong>), and TSV files.
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  Select File from Device
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Need formatting reference?</span>
                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample CSV Template
                </button>
              </div>
            </div>
          )}

          {source === 'sheet_link' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Google Sheet Share Link or CSV Export URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={handleFetchFromSheetUrl}
                    disabled={isParsing || !sheetUrl.trim()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isParsing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                    Fetch & Parse
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tip: In Google Sheets, click <strong>Share</strong> and ensure permission is set to <em>"Anyone with the link can view"</em>.
                </p>
              </div>
            </div>
          )}

          {source === 'paste' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Paste Rows directly from Google Sheets or Excel (including header row)
                  </label>
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-xs text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Template Headers
                  </button>
                </div>
                <textarea
                  rows={5}
                  placeholder={`Full Name\tClass\tFee Amount\tAmount Paid\nChukwuemeka Okonkwo\tPrimary 1\t28500\t28500\nAmina Bello\tPrimary 2\t23500\t11500`}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  onClick={handleParsePastedText}
                  disabled={isParsing || !pastedText.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isParsing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Process & Preview Pasted Data
                </button>
              </div>
            </div>
          )}

          {/* Import Settings */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800">Import Mode</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setImportMode('merge')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    importMode === 'merge'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Merge & Update Existing Records
                </button>
                <button
                  onClick={() => setImportMode('replace')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    importMode === 'replace'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Replace Entire Roster
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pt-1 sm:pt-0">
              <input
                type="checkbox"
                checked={autoApplyFeeSchedule}
                onChange={(e) => setAutoApplyFeeSchedule(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Auto-fill standard class fee if omitted in sheet</span>
            </label>
          </div>

          {/* Warnings / Notices */}
          {parseWarnings.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-800 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{parseWarnings[0]}</span>
            </div>
          )}

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-950">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Notice while processing spreadsheet</span>
              </div>
              {parseErrors.map((err, i) => (
                <p key={i} className="text-xs break-words leading-relaxed">
                  {err}
                </p>
              ))}
            </div>
          )}

          {/* Live Preview Section */}
          {parsedStudents.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Preview Data ({parsedStudents.length} Students Detected)
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Ready to Save & Sync
                  </span>
                </div>
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter preview..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl max-h-60 overflow-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 z-10 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Full Name</th>
                      <th className="py-2 px-3">Class</th>
                      <th className="py-2 px-3">Total Fee</th>
                      <th className="py-2 px-3">Amount Paid</th>
                      <th className="py-2 px-3">Balance</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {filteredPreview.map((s, idx) => (
                      <tr key={s.id || idx} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{s.id}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{s.full_name}</td>
                        <td className="py-2 px-3">{s.class}</td>
                        <td className="py-2 px-3 font-mono">{formatCurrency(s.fee_amount, activeSchool.currencySymbol)}</td>
                        <td className="py-2 px-3 font-mono text-emerald-700">{formatCurrency(s.amount_paid, activeSchool.currencySymbol)}</td>
                        <td className="py-2 px-3 font-mono text-rose-700">{formatCurrency(s.balance, activeSchool.currencySymbol)}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.status === 'fully_paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'part_payment'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {s.status === 'fully_paid' ? 'Fully Paid' : s.status === 'part_payment' ? 'Part Payment' : 'Unpaid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cloud Sync Failure Warning Banner */}
          {cloudSyncError && (
            <div className="p-4 sm:p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-rose-950 uppercase tracking-wide">
                      Cloud Firestore Sync Failed — Saved Locally Only
                    </h4>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 border border-rose-300">
                      Unsynced / Temporary Cache
                    </span>
                  </div>
                  <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                    <strong>{cloudSyncError.count} student records</strong> were written to this browser's local cache, but <strong>Cloud Firestore sync failed</strong>.
                  </p>
                  <p className="text-xs text-rose-800 mt-1.5 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-rose-200 font-mono text-[11px] break-all">
                    <strong>Error Details:</strong> {cloudSyncError.message}
                  </p>
                  <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-relaxed">
                      <strong>Critical Warning:</strong> There is no background queue to retry this upload later. If you reload this page, close this tab, or open DGOS Pay from another device before cloud sync succeeds, the cloud database will overwrite this browser's local cache, and these {cloudSyncError.count} records will be lost!
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-200/70">
                <button
                  type="button"
                  onClick={() => setShowDismissConfirm(true)}
                  disabled={isUploading}
                  className="px-3.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 rounded-xl transition-colors"
                >
                  Close Without Cloud Sync...
                </button>
                <button
                  type="button"
                  onClick={handleRetryCloudSync}
                  disabled={isUploading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUploading ? 'animate-spin' : ''}`} />
                  <span>{isUploading ? 'Retrying Sync...' : 'Retry Cloud Sync Now'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Uploading Status Progress */}
          {isUploading && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span>{uploadProgress.message}</span>
                <span>{Math.round((uploadProgress.processed / (uploadProgress.total || 1)) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${(uploadProgress.processed / (uploadProgress.total || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleAttemptClose}
            disabled={isUploading}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors"
          >
            {cloudSyncError ? 'Close Without Cloud Sync' : 'Cancel'}
          </button>

          {cloudSyncError ? (
            <button
              onClick={handleRetryCloudSync}
              disabled={isUploading}
              className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Retrying Cloud Sync...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Cloud Sync ({cloudSyncError.count} Records)</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleCommitUploadToFirebase}
              disabled={isUploading || parsedStudents.length === 0}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving to Database...</span>
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  <span>Save {parsedStudents.length} Students to Database</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Dismiss Confirmation Overlay */}
        {showDismissConfirm && (
          <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Close Without Cloud Sync?
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    <strong>{cloudSyncError?.count || parsedStudents.length} student records</strong> are currently stored in this browser only.
                  </p>
                  <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 leading-relaxed font-medium">
                    ⚠️ <strong>Data Loss Risk:</strong> Cloud Firestore was not updated. If you reload this page, log out, or open DGOS Pay from another computer, these records will disappear because Cloud Firestore will restore older records.
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDismissConfirm(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  Keep Open & Retry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDismissConfirm(false);
                    onClose();
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-colors"
                >
                  Yes, Close Anyway
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
