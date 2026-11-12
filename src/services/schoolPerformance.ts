import type { SchoolProfile, StudentPaymentRecord } from '../types';

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

const getSchoolBandForClass = (className: string): SchoolBand | null => {
  const normalized = className.trim().replace(/\s+/g, ' ').toLowerCase();

  if (/^(kg|nur|pre|pri|primary|kindergarten|nursery)(?:\s|\d|$)/.test(normalized)) return 'primary';
  if (/^(jss|js|sss|ss|secondary|junior secondary|senior secondary|form)(?:\s|\d|$)/.test(normalized)) return 'secondary';

  return null;
};

export function buildSchoolPerformanceGroups(
  schools: SchoolProfile[],
  studentsBySchool: Record<string, StudentPaymentRecord[]>
): SchoolPerformanceGroup[] {
  const groups: Record<SchoolBand, { schools: SchoolProfile[]; students: StudentPaymentRecord[] }> = {
    primary: { schools: [], students: [] },
    secondary: { schools: [], students: [] },
  };

  schools.forEach((school) => {
    const students = studentsBySchool[school.id] || [];

    if (school.type === 'primary' || school.type === 'nursery') {
      groups.primary.schools.push(school);
      groups.primary.students.push(...students);
      return;
    }

    if (school.type === 'secondary' || school.type === 'college') {
      groups.secondary.schools.push(school);
      groups.secondary.students.push(...students);
      return;
    }

    if (school.type === 'combined') {
      const groupedStudents: Record<SchoolBand, StudentPaymentRecord[]> = { primary: [], secondary: [] };
      students.forEach((student) => {
        const band = getSchoolBandForClass(student.class || '');
        if (band) groupedStudents[band].push(student);
      });

      (['primary', 'secondary'] as const).forEach((band) => {
        if (groupedStudents[band].length > 0) {
          groups[band].schools.push(school);
          groups[band].students.push(...groupedStudents[band]);
        }
      });
    }
  });

  return (['primary', 'secondary'] as const).map((band) => {
    const group = groups[band];
    const expected = group.students.reduce((sum, student) => sum + toAmount(student.fee_amount), 0);
    const collected = group.students.reduce((sum, student) => sum + toAmount(student.amount_paid), 0);
    const outstanding = Math.max(0, expected - collected);
    const classMap = new Map<string, StudentPaymentRecord[]>();

    group.students.forEach((student) => {
      const className = student.class?.trim() || 'Unassigned';
      const records = classMap.get(className) || [];
      records.push(student);
      classMap.set(className, records);
    });

    const classPerformance = Array.from(classMap.entries())
      .map(([className, records]) => {
        const classExpected = records.reduce((sum, student) => sum + toAmount(student.fee_amount), 0);
        const classCollected = records.reduce((sum, student) => sum + toAmount(student.amount_paid), 0);

        return {
          className,
          studentCount: records.length,
          expected: classExpected,
          collected: classCollected,
          outstanding: Math.max(0, classExpected - classCollected),
          collectionRate: classExpected > 0 ? Math.min(100, (classCollected / classExpected) * 100) : 0,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    return {
      band,
      label: band === 'primary' ? 'Primary school' : 'Secondary school',
      schools: group.schools,
      students: group.students,
      currencySymbol: group.schools[0]?.currencySymbol || '₦',
      expected,
      collected,
      outstanding,
      collectionRate: expected > 0 ? Math.min(100, (collected / expected) * 100) : 0,
      fullyPaidCount: group.students.filter((student) => student.status === 'fully_paid').length,
      partPaidCount: group.students.filter((student) => student.status === 'part_payment').length,
      unpaidCount: group.students.filter((student) => student.status === 'unpaid').length,
      classPerformance,
    };
  });
}
