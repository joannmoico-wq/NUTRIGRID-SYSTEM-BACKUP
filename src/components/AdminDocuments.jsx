import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, FileText, Folder, Image, Trash2, UploadCloud, X } from 'lucide-react';

const DATABASE_NAME = 'nutrigrid-admin-documents';
const STORE_NAME = 'documents';
const RECORD_CATEGORY_FOLDERS = [
  'Residents',
  'Environmental Sanitation',
  'Infant Feeding',
  'Lactating Woman',
  'Pregnant Woman',
  'Monthly Natality',
];

function getDocumentSearchTerms(document) {
  const extension = document.name.includes('.') ? document.name.split('.').pop().toLowerCase() : '';
  return [
    document.name,
    document.path,
    document.type,
    extension,
    ...(extension === 'doc' || extension === 'docx' ? ['docs', 'word document'] : []),
  ];
}

function openDocumentDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('Could not open document storage.'));
    request.onblocked = () => reject(new Error('Document storage is busy in another tab. Close other NutriGrid tabs and retry.'));
  });
}

async function withDocumentStore(mode, action) {
  const database = await openDocumentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };
    try {
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => fail(request.error || new Error('Document storage request failed.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        database.close();
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error || new Error('Document storage transaction failed.'));
      transaction.onabort = () => fail(transaction.error || new Error('Document storage transaction was aborted.'));
    } catch (error) {
      fail(error);
    }
  });
}

function getFileType(file) {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop().toLowerCase();
  return ({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
  })[extension] || 'application/octet-stream';
}

function createDocumentId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocumentMonth(document) {
  if (document.monthKey) return document.monthKey;
  if (!document.addedAt) return '';
  const date = new Date(document.addedAt);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDocumentTimestamp(document) {
  const dateValue = document.recordDate || document.addedAt;
  if (!dateValue) return 0;
  const dateOnly = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getDocumentFolderName(document) {
  const category = document.categoryLabel || document.category;
  return RECORD_CATEGORY_FOLDERS.includes(category) ? category : 'Other Documents';
}

function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDocumentDate(value) {
  if (!value) return '';
  if (typeof value === 'number' && value <= 0) return '';
  const dateString = String(value);
  const dateOnly = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AdminDocuments({
  darkMode = false,
  searchQuery = '',
  onSearchResultsChange,
  pwaPhotos = [],
  onDeletePwaPhoto,
}) {
  const [documents, setDocuments] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [openedFolder, setOpenedFolder] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewDocument, setPreviewDocument] = useState(null);
  const fileInput = useRef(null);
  const cardClass = darkMode ? 'border-slate-700 bg-[#26263B] text-white' : 'border-[#E8C4F0] bg-white text-gray-900';
  const allDocuments = useMemo(() => [...pwaPhotos, ...documents], [pwaPhotos, documents]);
  const documentUrls = useMemo(() => allDocuments.map((document) => {
    if (document.url) return { id: document.id, url: document.url, revoke: false };
    if (document.blob || document.file) {
      return {
        id: document.id,
        url: URL.createObjectURL(document.blob || document.file),
        revoke: true,
      };
    }
    return null;
  }).filter(Boolean), [allDocuments]);
  const monthOptions = useMemo(
    () => Array.from(new Set(allDocuments.map(getDocumentMonth).filter(Boolean))).sort().reverse(),
    [allDocuments]
  );
  const documentSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return allDocuments
      .filter((document) =>
        getDocumentSearchTerms(document)
          .some((value) => String(value || '').toLowerCase().includes(query))
      )
      .slice(0, 20)
      .map((document) => ({
        id: document.id,
        categoryId: 'documents',
        categoryName: document.type,
        displayTitle: document.path,
        data: document,
        timestamp: new Date(document.addedAt || 0).toISOString(),
        hideStatus: true,
      }));
  }, [allDocuments, searchQuery]);
  useEffect(() => {
    onSearchResultsChange?.(documentSuggestions);
  }, [documentSuggestions, onSearchResultsChange]);

  const filteredDocuments = allDocuments.filter((document) => {
    const matchesSearch = !searchQuery.trim() ||
      getDocumentSearchTerms(document)
        .some((value) => String(value || '').toLowerCase().includes(searchQuery.trim().toLowerCase()));
    const matchesMonth = selectedMonth === 'all' || getDocumentMonth(document) === selectedMonth;
    return matchesSearch && matchesMonth;
  }).sort((left, right) => getDocumentTimestamp(right) - getDocumentTimestamp(left));
  const documentFolders = useMemo(() => {
    const folders = new Map([
      ...RECORD_CATEGORY_FOLDERS.map((name) => [name, []]),
      ['Other Documents', []],
    ]);
    filteredDocuments.forEach((document) => {
      const folderName = getDocumentFolderName(document);
      folders.get(folderName).push(document);
    });
    return Array.from(folders.entries())
      .map(([name, folderDocuments]) => [
        name,
        folderDocuments.sort((left, right) => getDocumentTimestamp(right) - getDocumentTimestamp(left)),
      ])
      .sort(([, leftDocuments], [, rightDocuments]) => {
        const latestLeft = leftDocuments.length ? getDocumentTimestamp(leftDocuments[0]) : -1;
        const latestRight = rightDocuments.length ? getDocumentTimestamp(rightDocuments[0]) : -1;
        return latestRight - latestLeft;
      });
  }, [filteredDocuments]);

  useEffect(() => () => {
    documentUrls.filter(({ revoke }) => revoke).forEach(({ url }) => URL.revokeObjectURL(url));
  }, [documentUrls]);

  const refresh = useCallback(async () => {
    try {
      const items = await withDocumentStore('readonly', (store) => store.getAll());
      setDocuments((items || []).sort((left, right) => right.addedAt - left.addedAt));
      setError('');
    } catch (loadError) {
      console.error('Could not load saved documents:', loadError);
      setError(`Could not load documents: ${loadError.message}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const preventFileNavigation = (event) => {
      if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
        event.preventDefault();
      }
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const database = await openDocumentDatabase();
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          files.forEach((file) => {
            store.put({
              id: createDocumentId(),
              name: file.name,
              path: file.webkitRelativePath || file.name,
              type: getFileType(file),
              size: file.size,
              addedAt: Date.now(),
              blob: file,
            });
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error || new Error('Could not save selected files.'));
          transaction.onabort = () => reject(transaction.error || new Error('Document upload was cancelled.'));
        });
      } finally {
        database.close();
      }
      await refresh();
    } catch (uploadError) {
      console.error('Could not save selected documents:', uploadError);
      setError(`Could not upload selected files: ${uploadError.message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await withDocumentStore('readwrite', (store) => store.delete(id));
      await refresh();
    } catch (removeError) {
      console.error('Could not remove saved document:', removeError);
      setError(`Could not remove document: ${removeError.message}`);
    }
  };

  return (
    <section
      className={`rounded-3xl border p-5 shadow-sm sm:p-8 ${cardClass}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (Array.from(event.dataTransfer?.types || []).includes('Files')) setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) {
          setError('No files were detected. Drop files directly into the Documents panel.');
          return;
        }
        void addFiles(files);
      }}
    >
      <input
        id="admin-document-file-input"
        ref={fileInput}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
        className="hidden"
        aria-label="Choose documents to upload"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          event.target.value = '';
          void addFiles(files);
        }}
      />

      <div className="mb-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Uploaded files <span className="text-sm font-normal text-gray-500">({filteredDocuments.length})</span>
          </h2>
          <label className="relative flex items-center">
            <span className="sr-only">Filter documents by month</span>
            <select
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setOpenedFolder(null);
              }}
              className="appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm text-gray-700 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="all">All months</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>{formatMonth(month)}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 text-gray-500" aria-hidden="true" />
          </label>
        </div>
        {filteredDocuments.length === 0 && (searchQuery || selectedMonth !== 'all') ? (
          <p className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            {searchQuery || selectedMonth !== 'all'
              ? 'No files match the selected filters.'
              : 'Your uploaded pictures and documents will appear here.'}
          </p>
        ) : (
          openedFolder ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setOpenedFolder(null)}
                className="mb-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-violet-700 hover:bg-violet-50"
              >
                <ChevronLeft size={17} aria-hidden="true" />
                All folders
              </button>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">{openedFolder}</h3>
              {(documentFolders.find(([name]) => name === openedFolder)?.[1] || []).length === 0 ? (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                  No files in this category yet.
                </p>
              ) : <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(documentFolders.find(([month]) => month === openedFolder)?.[1] || []).map((document) => {
              const fileUrl = documentUrls.find((entry) => entry.id === document.id)?.url;
              const imageUrl = (document.type || '').startsWith('image/') ? fileUrl : null;
              return (
                <li key={document.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-sm">
                  {imageUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewDocument({ ...document, previewUrl: imageUrl })}
                      className="block w-full cursor-zoom-in"
                      aria-label={`View ${document.name}`}
                    >
                      <img src={imageUrl} alt={document.name} className="h-36 w-full bg-gray-100 object-cover" />
                    </button>
                  ) : (
                    <a
                      href={fileUrl}
                      download={document.name}
                      className="grid h-36 place-items-center bg-violet-50"
                      aria-label={`Download ${document.name}`}
                    >
                      <FileText size={42} className="text-violet-400" aria-hidden="true" />
                      <span className="text-xs font-semibold text-violet-700">Download file</span>
                    </a>
                  )}
                  <div className="p-3">
                    <p className="truncate text-sm font-medium" title={document.path}>{document.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatDocumentDate(document.recordDate || document.addedAt) || 'Date unavailable'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{formatFileSize(document.size)}</p>
                    {document.source === 'PWA' && (
                      <p className="mt-1 text-[11px] font-medium text-violet-700">PWA record photo</p>
                    )}
                    <div className="mt-2 flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (document.source === 'PWA') {
                            if (onDeletePwaPhoto) onDeletePwaPhoto(document);
                            else setError('Photo deletion is unavailable. Refresh the dashboard and try again.');
                            return;
                          }
                          void remove(document.id);
                        }}
                        className="rounded-lg p-2 text-gray-500 hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Delete ${document.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </li>
              );
                })}
              </ul>}
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {documentFolders.map(([folderName, folderDocuments]) => (
                <li key={folderName}>
                  <button
                    type="button"
                    onClick={() => setOpenedFolder(folderName)}
                    className="flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md"
                    aria-label={`Open ${folderName} folder`}
                  >
                    <Folder size={62} strokeWidth={1.6} className="fill-amber-300 text-amber-500" aria-hidden="true" />
                    <span className="mt-2 line-clamp-2 text-sm font-medium text-gray-800">{folderName}</span>
                    <span className="mt-0.5 text-xs text-gray-500">
                      {folderDocuments.length} {folderDocuments.length === 1 ? 'file' : 'files'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {previewDocument && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewDocument(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewDocument.name}`}
        >
          <button
            type="button"
            onClick={() => setPreviewDocument(null)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            aria-label="Close image preview"
          >
            <X size={22} />
          </button>
          <img
            src={previewDocument.previewUrl}
            alt={previewDocument.name}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
          />
          <p className="absolute bottom-4 left-4 right-4 truncate text-center text-sm text-white">
            {previewDocument.name}
          </p>
        </div>
      )}

      <div
        className={`rounded-2xl border-2 border-dashed px-4 py-10 text-center transition sm:py-14 ${
          dragging ? 'border-violet-500 bg-violet-50' : 'border-violet-200 bg-violet-50/40'
        }`}
      >
        {dragging ? (
          <Image size={38} className="mx-auto text-violet-500" aria-hidden="true" />
        ) : (
          <UploadCloud size={38} className="mx-auto text-violet-500" aria-hidden="true" />
        )}
        <h2 className="mt-3 text-lg font-semibold">Drag and drop your documents file instantly</h2>
        <p className="mt-1 text-sm text-gray-500">Or choose files to upload.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileText size={16} /> Browse files
          </button>
        </div>
        {busy && <p role="status" className="mt-4 text-sm text-violet-700">Saving files…</p>}
      </div>
      <p className="mt-3 text-xs text-gray-500">Files are saved on this browser and remain available offline on this device.</p>
    </section>
  );
}
