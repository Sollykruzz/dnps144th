# Security Specification: School Fee & Accounting Firestore ABAC Rules

## 1. Data Invariants

1. **Isolation by School Parent Gate**: All student records, scholarships, expenses, staff profiles, payroll dispatches, audit logs, and term schedules exist as sub-resources strictly within `/schools/{schoolId}/...`. Access and mutations are gated on valid school identifiers and authenticated access.
2. **Identity Integrity**: Read and write operations to the financial database require authenticated credentials (`request.auth != null`), and administrator email operations are verified via `request.auth.token.email_verified == true`.
3. **Immutability of Historical Audit Logs**: Documents in `/schools/{schoolId}/audit_logs/{logId}` cannot be updated or modified once written. They are append-only.
4. **Denial-of-Wallet & Volumetric Guards**: String and document ID fields must enforce strict `.size()` boundaries (e.g. `<= 128` chars for IDs, `<= 200` chars for names, `<= 1000` chars for notes) to prevent storage and memory exhaustion.
5. **Strict Typed Mutations**: Numeric fields such as `fee_amount`, `amount_paid`, `balance`, `baseSalary`, `grossPay`, `netPay`, and `amount` must be non-negative numbers.

---

## 2. The "Dirty Dozen" Payloads (Must be Denied by Rules)

1. **Unauthenticated Student Mutation**: A client sends an unauthenticated `setDoc` to `/schools/eminent-academy/students/STU-999`. Must return `PERMISSION_DENIED`.
2. **ID Poisoning / Denial-of-Wallet Attack**: An attacker sends a document ID with 50KB junk characters or path injection symbols like `../../root`. Must return `PERMISSION_DENIED` via `isValidId()`.
3. **Shadow Update on School Entity**: An attacker tries to write ghost fields (`isAdmin: true`, `role: 'superadmin'`) to `/schools/eminent-academy`. Must return `PERMISSION_DENIED`.
4. **Audit Log Tampering / Overwrite**: A user attempts to `updateDoc` on an existing `/schools/eminent-academy/audit_logs/LOG-001` entry to change financial figures. Must return `PERMISSION_DENIED`.
5. **Negative Fee Amount Injection**: A malicious payload attempts to create a student with `fee_amount: -50000` or `balance: "infinity"`. Must return `PERMISSION_DENIED`.
6. **Unverified Email Privilege Escalation**: An unverified account (`email_verified == false`) attempts to perform administrative school configuration updates. Must return `PERMISSION_DENIED`.
7. **Cross-Tenant Document Injection**: A write payload specifying `schoolId: "other-school"` written into `/schools/eminent-academy/expenses/EXP-1`. Must return `PERMISSION_DENIED`.
8. **Blanket Query Scrape**: An unauthenticated query attempting `getDocs(collectionGroup('students'))`. Must return `PERMISSION_DENIED`.
9. **Salary Mutation with String Payload**: A payload attempting to set `baseSalary: "FREE_MONEY"` or arbitrary objects on `/schools/eminent-academy/staff/STF-01`. Must return `PERMISSION_DENIED`.
10. **Scholarship 150% Discount Exploit**: A payload writing `discountPercentage: 999` on a scholarship document. Must return `PERMISSION_DENIED`.
11. **Malicious Delete of Entire School Profile**: An unauthorized user attempts `deleteDoc` on `/schools/eminent-academy`. Must return `PERMISSION_DENIED`.
12. **Payroll State Skipping / Direct Approval Without NET Pay**: An update attempting to set `paymentStatus: "paid"` while changing `netPay: 0` without matching salary calculations. Must return `PERMISSION_DENIED`.
