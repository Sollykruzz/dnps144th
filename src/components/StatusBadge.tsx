/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { PaymentStatus } from '../types';

interface StatusBadgeProps {
  status: PaymentStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const isSm = size === 'sm';

  switch (status) {
    case 'fully_paid':
      return (
        <span
          className={`inline-flex items-center gap-1 font-black uppercase tracking-tighter rounded-lg bg-[#dcfce7] text-[#166534] ${
            isSm ? 'px-2.5 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'
          }`}
        >
          <CheckCircle2 className={isSm ? 'w-2.5 h-2.5 text-[#166534]' : 'w-3 h-3 text-[#166534]'} />
          <span>Fully Paid</span>
        </span>
      );

    case 'part_payment':
      return (
        <span
          className={`inline-flex items-center gap-1 font-black uppercase tracking-tighter rounded-lg bg-[#fef3c7] text-[#92400e] ${
            isSm ? 'px-2.5 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'
          }`}
        >
          <Clock className={isSm ? 'w-2.5 h-2.5 text-[#92400e]' : 'w-3 h-3 text-[#92400e]'} />
          <span>Part Payment</span>
        </span>
      );

    case 'unpaid':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 font-black uppercase tracking-tighter rounded-lg bg-[#fee2e2] text-[#991b1b] ${
            isSm ? 'px-2.5 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'
          }`}
        >
          <AlertCircle className={isSm ? 'w-2.5 h-2.5 text-[#991b1b]' : 'w-3 h-3 text-[#991b1b]'} />
          <span>Unpaid</span>
        </span>
      );
  }
};
