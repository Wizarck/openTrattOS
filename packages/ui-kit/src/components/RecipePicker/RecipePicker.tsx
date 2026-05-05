import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { RecipeListItem, RecipePickerProps } from './RecipePicker.types';

const DEBOUNCE_MS = 250;

/**
 * Typeahead recipe selector. ARIA combobox role; debounced onSearch (250 ms);
 * keyboard nav (Up/Down/Enter/Escape). Caller fetches the result list — the
 * component is presentational + interaction-only per design.md §Decisions.
 */
export function RecipePicker({
  recipes,
  onSearch,
  onSelect,
  loading = false,
  placeholder = 'Search recipes…',
  emptyStateCopy = 'No recipes match',
  value,
  activeOnly = false,
  className,
  'aria-label': ariaLabel = 'Recipe picker',
}: RecipePickerProps) {
  const listboxId = useId();
  const [internalValue, setInternalValue] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  const visibleRecipes = activeOnly ? recipes.filter((r) => r.isActive) : recipes;

  function handleChange(next: string) {
    setInternalValue(next);
    setOpen(true);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(next), DEBOUNCE_MS);
  }

  function commitSelection(item: RecipeListItem) {
    onSelect(item);
    setInternalValue(item.displayLabel);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(visibleRecipes.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && visibleRecipes[activeIndex]) {
        e.preventDefault();
        commitSelection(visibleRecipes[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border bg-surface px-3 py-2',
          'border-border focus-within:border-accent',
        )}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        <Search aria-hidden="true" size={16} className="text-mute" />
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && visibleRecipes[activeIndex]
              ? `${listboxId}-opt-${visibleRecipes[activeIndex].id}`
              : undefined
          }
          value={internalValue}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-mute"
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 100)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${ariaLabel} results`}
          className={cn(
            'absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto',
            'rounded-md border border-border bg-surface shadow-lg',
          )}
          style={{ borderWidth: '1px', borderStyle: 'solid' }}
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-mute" role="option" aria-selected={false}>
              Loading…
            </li>
          ) : visibleRecipes.length === 0 ? (
            <li
              className="px-3 py-2 text-sm text-mute"
              role="option"
              aria-selected={false}
              aria-disabled={true}
            >
              {emptyStateCopy}
            </li>
          ) : (
            visibleRecipes.map((item, i) => (
              <li
                key={item.id}
                id={`${listboxId}-opt-${item.id}`}
                role="option"
                aria-selected={i === activeIndex}
                aria-disabled={!item.isActive}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm',
                  i === activeIndex
                    ? 'bg-accent-soft text-ink'
                    : 'text-ink hover:bg-surface-2',
                  !item.isActive && 'opacity-60',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitSelection(item)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span>{item.displayLabel}</span>
                {!item.isActive && (
                  <span className="ml-2 text-xs text-mute">(discontinued)</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
