import React, { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { getRecordDisplayTitle } from '../utils/bnsStorage';

const BnsSearchBar = ({
  query,
  onSearch,
  results = [],
  showSuggestions = false,
  onSelectResult,
  onFocusSuggestions,
  onBlurSuggestions,
  placeholder = 'Search records...',
  emptyMessage = 'No matching records',
  className = '',
  widthClass = 'w-full',
  tone = 'admin',
  darkMode = false,
}) => {
  const inputRef = useRef(null);

  const hasQuery = Boolean(query?.trim());

  const toneStyles = {
    admin: {
      shell:
        'rounded-2xl border shadow-sm focus-within:ring-2 focus-within:ring-[#8F65FF]/30',
      shellLight: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E8DCEF',
      },
      shellDark: {
        backgroundColor: '#26263B',
        borderColor: '#333348',
      },
      input:
        'text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400',
      icon: '#8E8EA9',
      dropdown:
        'bg-white dark:bg-[#26263B] border-gray-100 dark:border-[#333348]',
    },

    field: {
      shell:
        'rounded-2xl border shadow-sm focus-within:ring-2 focus-within:ring-[#8F65FF]/25',
      shellLight: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E8DCEF',
      },
      input: 'text-sm text-[#2D2D3A] placeholder:text-[#8E8EA9]',
      icon: '#8E8EA9',
      dropdown: 'bg-white border-gray-100',
    },
  };

  const t = toneStyles[tone] || toneStyles.admin;
  const isDarkShell = tone === 'admin' && darkMode;

  // IMPORTANT:
  // Use onChange + value instead of defaultValue + onInput.
  // This keeps React and the input synchronized without manually
  // changing inputRef.current.value.
  const handleChange = (e) => {
    onSearch(e.target.value);
  };

  const handleClear = (e) => {
    e.preventDefault();

    onSearch('');

    // Restore focus after React updates the value.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const visible = showSuggestions && hasQuery;

  return (
    <div className={`relative ${widthClass} max-w-full ${className}`}>
      <style>{`
        input[type="search"]::-webkit-search-decoration,
        input[type="search"]::-webkit-search-cancel-button,
        input[type="search"]::-webkit-search-results-button,
        input[type="search"]::-webkit-search-results-decoration {
          display: none;
        }
      `}</style>

      <div
        className={`flex items-center transition-shadow ${t.shell}`}
        style={isDarkShell ? t.shellDark : t.shellLight}
      >
        <Search
          className="ml-3.5 shrink-0"
          size={18}
          style={{ color: t.icon }}
          aria-hidden
        />

        <input
          ref={inputRef}
          type="text"

          // FIX:
          // Controlled input. Do NOT use defaultValue here.
          value={query || ''}
          onChange={handleChange}

          onFocus={() => {
            if (inputRef.current?.value.trim()) {
              onFocusSuggestions?.();
            }
          }}

          onBlur={() => {
            setTimeout(() => {
              onBlurSuggestions?.();
            }, 250);
          }}

          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={placeholder}
          className={`flex-1 min-w-0 bg-transparent py-2.5 pl-2.5 pr-2 outline-none ${t.input}`}
        />

        {hasQuery && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="mr-2.5 p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600 cursor-pointer"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {visible && (
        <ul
          className={`absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 sm:max-h-72 overflow-y-auto overflow-x-hidden rounded-2xl border py-2 shadow-lg ${t.dropdown}`}
          role="listbox"
          style={{ maxWidth: '100%' }}
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">
              {emptyMessage}
            </li>
          ) : (
            <>
              <li className="px-4 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                {results.length} match
                {results.length === 1 ? '' : 'es'} · lists filter live
              </li>

              {results.map((record) => {
                const title = record.isNav
                  ? record.categoryName
                  : getRecordDisplayTitle(record.data);

                return (
                  <li
                    key={`${record.categoryId}-${record.id}`}
                    role="option"
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelectResult?.(record);
                        inputRef.current?.blur();
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition flex items-start justify-between gap-2 min-w-0 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                          {title}
                        </p>

                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {record.categoryName}
                          {record.timestamp
                            ? ` · ${String(record.timestamp).slice(0, 10)}`
                            : ''}
                        </p>
                      </div>

                      {!record.isNav && (
                        <span
                          className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            record.synced
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}
                        >
                          {record.synced ? 'Synced' : 'Pending'}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </>
          )}
        </ul>
      )}
    </div>
  );
};

export default BnsSearchBar;