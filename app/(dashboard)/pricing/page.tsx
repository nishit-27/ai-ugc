'use client';

import PricingDashboard from '@/components/pricing/PricingDashboard';
import PageTransition from '@/components/ui/PageTransition';

export default function PricingPage() {
  return (
    <PageTransition>
      <PricingDashboard />
    </PageTransition>
  );
}
