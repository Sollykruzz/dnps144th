import type { SchoolProfile, StudentPaymentRecord } from '../types';
import { deriveFeeBreakdown } from './calculations';

export type SchoolBand = 'primary' | 'secondary';

export interface ClassPerformance {
  className: string;
  studentCount: number;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
}

export interface SchoolPerformanceGroup {
  band: SchoolBand;
  label: string;
  schools: SchoolProfile[];
  students: StudentPaymentRecord[];
  currencySymbol: string;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
  fullyPaidCount: number;
  partPaidCount: number;
  unpaidCount: number;
  classPerformance: ClassPerformance[];
}

const toAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

const getNormalizedClassName = (className: string) =>
  className.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

const getSchoolBandForClass = (className: string): SchoolBand | null => {
  const normalized = getNormalizedClassName(className);
  const primaryGrade = normalized.match(
    /^(?:primary|pri|pry)\s*(\d+|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth)(?:\b|$)/
  );

  if (primaryGrade) {
    const gradeWords: Record<string, number> = {
      one: 1,
      first: 1,
      two: 2,
      second: 2,
      three: 3,
      third: 3,
      four: 4,
      fourth: 4,
      five: 5,
      fifth: 5,
      six: 6,
      sixth: 6,
    };
    const grade = gradeWords[primaryGrade[1]] ?? Number(primaryGrade[1]);
    return grade >= 1 && grade <= 6 ? 'primary' : null;
  }

  if (/^(?:kg|nur|pre|kindergarten|nursery)(?:\s|\d|$)/.test(normalized)) return 'primary';
  if (/^(jss|js|sss|ss|secondary|junior secondary|senior secondary|form)(?:\s|\d|$)/.test(normalized)) return 'secondary';

  return null;
};

const isOutOfPrimaryRange = (className: string) => {
  const normalized = getNormalizedClassName(className);
  const primaryGrade = normalized.match(/^(?:primary|pri|pry)\s*(\d+|seven|eight|nine|ten|eleven|twelve)(?:\b|$)/);
  if (!primaryGrade) return false;

  const gradeWords: Record<string, number> = {
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const grade = gradeWords[primaryGrade[1]] ?? Number(primaryGrade[1]);
  return grade < 1 || grade > 6;
};

export function buildSchoolPerformanceGroups(
  schools: SchoolProfile[],
  studentsBySchool: Record<string, StudentPaymentRecord[]>
): SchoolPerformanceGroup[] {
  type StudentEntry = { student: StudentPaymentRecord; school: SchoolProfile };
  const groups: Record<SchoolBand, { schools: SchoolProfile[]; entries: StudentEntry[] }> = {
    primary: { schools: [], entries: [] },
    secondary: { schools: [], entries: [] },
  };

  const addStudent = (band: SchoolBand, school: SchoolProfile, student: StudentPaymentRecord) => {
    if (!groups[band].schools.includes(school)) groups[band].schools.push(school);
    groups[band].entries.push({ student, school });
  };

  schools.forEach((school) => {
    const students = studentsBySchool[school.id] || [];
    const defaultBand: SchoolBand | null =
      school.type === 'primary' || school.type === 'nursery'
        ? 'primary'
        : school.type === 'secondary' || school.type === 'college'
          ? 'secondary'
          : null;

    students.forEach((student) => {
      const className = student.class || '';
      const classBand = getSchoolBandForClass(className);

      if (classBand) {
        addStudent(classBand, school, student);
        return;
      }

      if (school.type === 'combined' || isOutOfPrimaryRange(className)) return;
      if (defaultBand) addStudent(defaultBand, school, student);
    });
  });

  const getCoreFees = ({ student, school }: StudentEntry) => {
    const breakdown = deriveFeeBreakdown(student, school);
    const tuitionFee = toAmount(breakdown.tuitionFee);
    const examFee = toAmount(breakdown.examFee);
    const tuitionPaid = Math.min(tuitionFee, toAmount(breakdown.tuitionPaid));
    const examPaid = Math.min(examFee, toAmount(breakdown.examPaid));

    return {
      expected: tuitionFee + examFee,
      collected: tuitionPaid + examPaid,
    };
  };

  return (['primary', 'secondary'] as const).map((band) => {
    const group = groups[band];
    const students = group.entries.map(({ student }) => student);
    const totals = group.entries.map((entry) => ({ ...entry, ...getCoreFees(entry) }));
    const expected = totals.reduce((sum, entry) => sum + entry.expected, 0);
    const collected = totals.reduce((sum, entry) => sum + entry.collected, 0);
    const outstanding = Math.max(0, expected - collected);
    const classMap = new Map<string, { studentCount: number; expected: number; collected: number }>();
    let fullyPaidCount = 0;
    let partPaidCount = 0;
    let unpaidCount = 0;

    totals.forEach(({ student, expected: studentExpected, collected: studentCollected }) => {
      const className = student.class?.trim() || 'Unassigned';
      const current = classMap.get(className) || { studentCount: 0, expected: 0, collected: 0 };
      current.studentCount += 1;
      current.expected += studentExpected;
      current.collected += studentCollected;
      classMap.set(className, current);

      if (studentExpected > 0 && studentCollected >= studentExpected) fullyPaidCount += 1;
      else if (studentCollected > 0) partPaidCount += 1;
      else unpaidCount += 1;
    });

    const classPerformance = Array.from(classMap.entries())
      .map(([className, classTotals]) => ({
        className,
        studentCount: classTotals.studentCount,
        expected: classTotals.expected,
        collected: classTotals.collected,
        outstanding: Math.max(0, classTotals.expected - classTotals.collected),
        collectionRate: classTotals.expected > 0 ? Math.min(100, (classTotals.collected / classTotals.expected) * 100) : 0,
      }))
      .sort((a, b) => a.className.localeCompare(b.className));

    return {
      band,
      label: band === 'primary' ? 'Primary school' : 'Secondary school',
      schools: group.schools,
      students,
      currencySymbol: group.schools[0]?.currencySymbol || '₦',
      expected,
      collected,
      outstanding,
      collectionRate: expected > 0 ? Math.min(100, (collected / expected) * 100) : 0,
      fullyPaidCount,
      partPaidCount,
      unpaidCount,
      classPerformance,
    };
  });
}
