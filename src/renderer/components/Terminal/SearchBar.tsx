import { useEffect, useRef, useState, useCallback } from 'react';
import { useT } from '../../hooks/useT';

const MAX_HISTORY = 50;
const searchHistory: string[] = [];

interface SearchBarProps {
  onFindNext: (text: string, useRegex?: boolean) => void;
  onFindPrevious: (text: string, useRegex?: boolean) => void;
  onClose: () => void;
}

export default function SearchBar({ onFindNext, onFindPrevious, onClose }: SearchBarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const savedQueryRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchHistory.length === 0) return;
      if (historyIdx === -1) savedQueryRef.current = query;
      const newIdx = Math.min(historyIdx + 1, searchHistory.length - 1);
      setHistoryIdx(newIdx);
      setQuery(searchHistory[searchHistory.length - 1 - newIdx]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx <= 0) {
        setHistoryIdx(-1);
        setQuery(savedQueryRef.current);
        return;
      }
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setQuery(searchHistory[searchHistory.length - 1 - newIdx]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) {
        const existing = searchHistory.indexOf(query);
        if (existing >= 0) searchHistory.splice(existing, 1);
        searchHistory.push(query);
        if (searchHistory.length > MAX_HISTORY) searchHistory.shift();
        setHistoryIdx(-1);
      }
      if (e.shiftKey) {
        onFindPrevious(query, useRegex);
      } else {
        onFindNext(query, useRegex);
      }
    }
  }, [query, useRegex, historyIdx, onFindNext, onFindPrevious]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setHistoryIdx(-1);
  }, []);

  const toggleRegex = useCallback(() => {
    setUseRegex((prev) => !prev);
  }, []);

  return (
    <div
      className="absolute top-0 right-2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-b-md shadow-lg"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-overlay)',
        borderTop: 'none',
        minWidth: '280px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search icon */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        className="shrink-0 text-[var(--text-subtle)]"
        style={{ color: 'var(--text-subtle)' }}
      >
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t('search.placeholder')}
        className="flex-1 bg-transparent outline-none text-xs"
        style={{
          color: 'var(--text-main)',
          caretColor: 'var(--accent-cursor)',
          minWidth: 0,
        }}
        spellCheck={false}
      />

      {/* Regex toggle */}
      <button
        onClick={toggleRegex}
        title={t('search.regexTooltip')}
        className="flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0"
        style={{
          background: useRegex ? 'var(--accent-yellow)' : 'transparent',
          color: useRegex ? 'var(--bg-base)' : 'var(--text-sub2)',
        }}
      >
        <span className="text-[10px] font-bold leading-none">.*</span>
      </button>

      {/* Previous (Shift+Enter) */}
      <button
        onClick={() => onFindPrevious(query, useRegex)}
        title={t('search.prevTooltip')}
        className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-[var(--bg-overlay)] text-[var(--text-sub2)] hover:text-[var(--text-main)] shrink-0"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 8L2 5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 8L5 5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Next (Enter) */}
      <button
        onClick={() => onFindNext(query, useRegex)}
        title={t('search.nextTooltip')}
        className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-[var(--bg-overlay)] text-[var(--text-sub2)] hover:text-[var(--text-main)] shrink-0"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        title={t('search.closeTooltip')}
        className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-[var(--bg-overlay)] text-[var(--text-subtle)] hover:text-[var(--accent-red)] shrink-0"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
