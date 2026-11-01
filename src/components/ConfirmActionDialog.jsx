import { AlertTriangle } from 'lucide-react';

export default function ConfirmActionDialog({
  open,
  title = 'Confirm action',
  message,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${destructive ? 'bg-rose-100 text-rose-600' : 'bg-violet-100 text-violet-700'}`}>
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 id="confirm-action-title" className="font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-gray-600">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'}`}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
