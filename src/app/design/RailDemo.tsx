'use client';

import { useState } from 'react';
import { Rail } from '@/engine/Rail';
import { CHAPTER_ORDER, CHAPTER_TENSE, type ChapterId } from '@/engine/views';

/**
 * The real `Rail`, not a picture of one — so this page keeps its one useful property.
 * Its state is local and goes nowhere; selecting here switches nothing.
 */
export function RailDemo() {
  const [chapter, setChapter] = useState<ChapterId>('past');
  return (
    <Rail
      stops={CHAPTER_ORDER}
      current={chapter}
      labels={CHAPTER_TENSE}
      onSelect={setChapter}
      shortcutFor={(id) => CHAPTER_ORDER.indexOf(id) + 1}
    />
  );
}
