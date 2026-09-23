'use client';

import { useState } from 'react';
import { Rail } from '@/engine/Rail';
import type { ViewId } from '@/engine/views';

/**
 * The real `Rail`, not a picture of one — so this page keeps its one useful property.
 * Its state is local and goes nowhere; selecting here switches nothing.
 */
export function RailDemo() {
  const [view, setView] = useState<ViewId>('valley');
  return (
    <Rail
      views={['valley', 'circle', 'city'] as const}
      current={view}
      labels={{ valley: 'The valley', circle: 'The circle', city: 'Wat Ket' }}
      onSelect={setView}
      shortcutFor={(id) => ['valley', 'circle', 'city'].indexOf(id) + 1}
    />
  );
}
