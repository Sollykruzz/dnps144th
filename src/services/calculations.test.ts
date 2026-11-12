import { equal, throws } from 'node:assert/strict'
import { test } from 'node:test'
import type { StudentPaymentRecord } from '../types'
import {
  calculateBalance,
  calculateScholarshipTuition,
  calculateStatus,
  computeStudentLiveFees,
  processStudentPayments,
} from './calculations'

function makeStudent(overrides: Partial<StudentPaymentRecord> = {}): StudentPaymentRecord {
  return {
    id: 'DNPS/TEST-001',
    full_name: 'Test Student',
    class: 'JSS 1',
    term: 'First Term',
    session: '2026/2027',
    fee_amount: 1000,
    amount_paid: 0,
    balance: 1000,
    status: 'unpaid',
    payment_date: '',
    is_new_admission: false,
    tuition_fee: 1000,
    tuition_paid: 0,
    admission_fee: 0,
    admission_paid: 0,
    lesson_fee: 0,
    lesson_paid: 0,
    lesson_disabled: true,
    exam_fee: 0,
    exam_paid: 0,
    additional_fees: [],
    payment_history: [],
    ...overrides,
  }
}

test('scholarship percentages preserve zero, partial, and full waivers', () => {
  equal(calculateScholarshipTuition(20_000, 0).tuitionFee, 20_000)
  equal(calculateScholarshipTuition(20_000, 50).tuitionFee, 10_000)
  equal(calculateScholarshipTuition(20_000, 100).tuitionFee, 0)
  equal(calculateScholarshipTuition(20_000, 0, true).tuitionFee, 0)
  equal(calculateScholarshipTuition(20_000, 150).scholarshipPercentage, 100)
})

test('zero-fee categories and balances resolve as settled', () => {
  equal(calculateStatus(0, 0), 'fully_paid')
  equal(calculateBalance(1000, 1250), 0)
})

test('additional fees are included in the live student total', () => {
  const student = makeStudent({
    fee_amount: 1250,
    additional_fees: [
      { feeId: 'lab', name: 'Lab levy', amount: 250, amountPaid: 0, status: 'unpaid' },
    ],
  })
  const live = computeStudentLiveFees(student)
  equal(live.totalFee, 1250)
  equal(live.balance, 1250)
})

test('multi-line payments accumulate once and share a receipt number', () => {
  const result = processStudentPayments(
    makeStudent(),
    [
      { amount: 300, feeCategory: { categoryType: 'tuition' } },
      { amount: 700, feeCategory: { categoryType: 'tuition' } },
    ],
    'Cash',
    undefined,
    { receiptNumber: 'TEST-RECEIPT-001', idempotencyKey: 'test-attempt-001' }
  )

  equal(result.updatedRecord.amount_paid, 1000)
  equal(result.updatedRecord.balance, 0)
  equal(result.updatedRecord.status, 'fully_paid')
  equal(result.receipts.length, 2)
  equal(result.receipts[0].receiptNumber, 'TEST-RECEIPT-001')
  equal(result.receipts[1].receiptNumber, 'TEST-RECEIPT-001')
  equal(result.combinedReceipt.amountPaidNow, 1000)
})

test('overpayments are rejected without changing the source student', () => {
  const student = makeStudent()
  throws(
    () =>
      processStudentPayments(
        student,
        [{ amount: 1000.01, feeCategory: { categoryType: 'tuition' } }],
        'Cash',
        undefined,
        { receiptNumber: 'TEST-RECEIPT-002' }
      ),
    /Overpayment blocked/
  )
  equal(student.amount_paid, 0)
  equal(student.balance, 1000)
})
