import { useRef, useEffect } from 'react';
import { BookOpen, Highlighter, StickyNote, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GhostToolbarProps {
  onHighlight: () => void;
  onNote: () => void;
  onClose: () => void;
  position: { x: number; y: number };
}

export function GhostToolbar({ onHighlight, onNote, onClose, position }: GhostToolbarProps) {
  return (
    <div
      className="fixed z-9999 flex items-center gap-1 p-1 bg-white dark:bg-zinc-950 rounded-full shadow-xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-10px)'
      }}
    >
      <button
        onClick={onHighlight}
        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-full transition-colors tooltip"
        title="Highlight"
      >
        <Highlighter className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

      <button
        onClick={onNote}
        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-full transition-colors"
        title="Add Note"
      >
        <StickyNote className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

       <button
        onClick={onClose}
        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
