import { useEffect, useRef, useState } from 'react';
import { Eye, FileDown, FileUp, Mail, Send, X } from 'lucide-react';

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function prepareSignatureImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = image.naturalWidth;
      sourceCanvas.height = image.naturalHeight;
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!sourceContext) {
        reject(new Error('Could not prepare the selected signature image.'));
        return;
      }
      sourceContext.drawImage(image, 0, 0);
      const { data } = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      let left = sourceCanvas.width;
      let top = sourceCanvas.height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < sourceCanvas.height; y += 1) {
        for (let x = 0; x < sourceCanvas.width; x += 1) {
          const pixel = (y * sourceCanvas.width + x) * 4;
          const visibleInk = data[pixel + 3] > 24
            && Math.min(data[pixel], data[pixel + 1], data[pixel + 2]) < 238;
          if (!visibleInk) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      if (right < left || bottom < top) {
        reject(new Error('The selected image does not contain a visible signature.'));
        return;
      }
      const padding = Math.max(4, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.04));
      left = Math.max(0, left - padding);
      top = Math.max(0, top - padding);
      right = Math.min(sourceCanvas.width - 1, right + padding);
      bottom = Math.min(sourceCanvas.height - 1, bottom + padding);
      const canvas = document.createElement('canvas');
      canvas.width = right - left + 1;
      canvas.height = bottom - top + 1;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not prepare the selected signature image.'));
        return;
      }
      context.drawImage(sourceCanvas, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        type: 'image/png',
        width: canvas.width,
        height: canvas.height,
      });
    };
    image.onerror = () => reject(new Error('Could not decode the selected signature image.'));
    image.src = dataUrl;
  });
}

export default function ReportExportActions({
  title,
  fileName,
  headers,
  rows,
  preamble = [],
  onExportPdf,
  onSendEmail,
  enableEmail = false,
  initialRecipient = '',
  signatureOptions = [],
}) {
  const signatureInput = useRef(null);
  const [signatureSlots, setSignatureSlots] = useState({});
  const [selectedSigner, setSelectedSigner] = useState(null);
  const [signatureChoicesOpen, setSignatureChoicesOpen] = useState(false);
  const [signaturePreviewOpen, setSignaturePreviewOpen] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState('');
  const [signedPdfBlob, setSignedPdfBlob] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [emailSubject, setEmailSubject] = useState(`${title} (PDF)`);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!signedPdfUrl) return undefined;
    return () => URL.revokeObjectURL(signedPdfUrl);
  }, [signedPdfUrl]);

  const signatures = signatureOptions.length
    ? signatureOptions.map((option) => signatureSlots[option.id]).filter(Boolean)
    : Object.values(signatureSlots);
  const allSignaturesAdded = signatureOptions.length
    ? signatureOptions.every((option) => Boolean(signatureSlots[option.id]))
    : signatures.length > 0;

  const handleSignatureFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Choose a PNG or JPEG signature image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Could not read the selected signature image.');
        return;
      }
      void prepareSignatureImage(reader.result).then((preparedImage) => {
        const signature = {
          name: file.name,
          ...preparedImage,
          signer: selectedSigner,
        };
        setSignatureSlots((current) => ({
          ...current,
          [selectedSigner?.id || 'signature']: signature,
        }));
        setSignedPdfUrl('');
        setSignedPdfBlob(null);
        setError('');
      }).catch((imageError) => {
        console.error('Could not prepare selected signature:', imageError);
        setError(imageError.message);
      });
    };
    reader.onerror = () => setError('Could not read the selected signature image.');
    reader.readAsDataURL(file);
  };

  const createSignedPdfPreview = async () => {
    const result = await onExportPdf(signatures, { preview: true });
    const blob = result instanceof Blob
      ? result
      : typeof result === 'string' && result.startsWith('blob:')
        ? await fetch(result).then((response) => response.blob())
        : null;
    if (!blob || !blob.type.startsWith('application/pdf')) {
      throw new Error('Could not generate the signed PDF preview.');
    }
    const url = URL.createObjectURL(blob);
    setSignedPdfUrl(url);
    setSignedPdfBlob(blob);
    return blob;
  };

  const handleOpenEmail = async () => {
    setBusy(true);
    setError('');
    setEmailSent(false);
    setMenuOpen(false);
    setSignaturePreviewOpen(false);
    setEmailModalOpen(true);
    setSignedPdfUrl('');
    setSignedPdfBlob(null);
    try {
      await createSignedPdfPreview();
    } catch (previewError) {
      console.error('Could not prepare monthly report email preview:', previewError);
      setError(previewError.message);
    }
    setBusy(false);
  };

  const handleSendEmail = async (event) => {
    event.preventDefault();
    if (!onSendEmail || !signedPdfBlob) return;
    setBusy(true);
    setError('');
    try {
      const pdfDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not prepare the PDF attachment.'));
        reader.onerror = () => reject(new Error('Could not read the PDF attachment.'));
        reader.readAsDataURL(signedPdfBlob);
      });
      await onSendEmail({
        recipient: recipient.trim(),
        subject: emailSubject.trim(),
        message: emailMessage.trim(),
        fileName: `${fileName}.pdf`,
        pdfBase64: pdfDataUrl.split(',')[1],
      });
      setEmailSent(true);
    } catch (sendError) {
      console.error('Could not send signed monthly report:', sendError);
      setError(sendError.message || 'Could not send the signed PDF.');
    } finally {
      setBusy(false);
    }
  };

  const exportWord = async () => {
    const {
      AlignmentType,
      Document,
      Footer,
      ImageRun,
      PageOrientation,
      Packer,
      Paragraph,
      Table,
      TableCell,
      TableRow,
      TabStopType,
      TextRun,
      WidthType,
    } = await import('docx');
    const cellParagraph = (value, bold = false) => new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: String(value ?? ''), bold, size: 16 })],
    });
    const signatureRuns = await Promise.all(signatures.map(async (signature) => {
      const { width, height } = signature;
      const scale = Math.min(240 / width, 68 / height);
      return new ImageRun({
        data: dataUrlToBytes(signature.dataUrl),
        transformation: { width: width * scale, height: height * scale },
        type: signature.type === 'image/png' ? 'png' : 'jpg',
      });
    }));
    const signatureColumnRuns = signatures.reduce((columns, signature, index) => {
      columns[signature.signer?.id === 'rhm' ? 1 : 0] = signatureRuns[index];
      return columns;
    }, []);
    const approvalTabStops = [
      { type: TabStopType.LEFT, position: 4500 },
      { type: TabStopType.LEFT, position: 9000 },
    ];
    const approvalLine = (values, bold = false, size = 16) => new Paragraph({
      tabStops: approvalTabStops,
      children: [new TextRun({
        text: `\t${values[0]}\t${values[1]}\t${values[2]}`,
        bold,
        size,
      })],
    });
    const signatureLine = new Paragraph({
      tabStops: approvalTabStops,
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun('\t'),
        ...(signatureColumnRuns[0] ? [signatureColumnRuns[0]] : []),
        new TextRun('\t'),
        ...(signatureColumnRuns[1] ? [signatureColumnRuns[1]] : []),
      ],
    });

    const approvalColumns = [
      ['PREPARED BY:', 'LAARNI B. POMADA', 'Barangay Nutrition Scholar'],
      [
        'CHECKED:',
        'EVANGELINE S. CANIT, RM',
        signatureOptions.find((option) => option.id === 'rhm')?.role || 'Rural Health Midwife',
      ],
      ['NOTED:', 'ANITA P. AURO, RN, RM', 'Municipal Nutrition Action Officer II'],
    ];
    const footer = new Footer({
      children: [
        approvalLine(approvalColumns.map(([label]) => label), false, 16),
        signatureLine,
        approvalLine(approvalColumns.map(([, name]) => name), true, 16),
        approvalLine(approvalColumns.map(([, , role]) => role), false, 14),
      ],
    });
    const tableRows = [
      new TableRow({ children: headers.map((header) => new TableCell({ children: [cellParagraph(header, true)] })) }),
      ...rows.map((row) => new TableRow({
        children: row.map((value) => new TableCell({ children: [cellParagraph(value, true)] })),
      })),
    ];
    const children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: title, bold: true, size: 28 })],
      }),
      ...preamble.map((line) => new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: line, size: 18 })],
      })),
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: headers.map(() => Math.floor(9000 / headers.length)),
        alignment: AlignmentType.CENTER,
      }),
    ];

    const document = new Document({
      sections: [{
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children,
        footers: {
          default: footer,
        },
      }],
    });
    const blob = await Packer.toBlob(document);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${fileName}.docx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportFiles = async (format) => {
    setBusy(true);
    setError('');
    try {
      if (format === 'word') {
        await exportWord();
      } else if (format === 'signed-pdf') {
        await onExportPdf(signatures, { preview: false });
      } else if (format === 'preview') {
        await createSignedPdfPreview();
        setSignaturePreviewOpen(true);
      } else {
        await onExportPdf(signatures, { preview: false });
      }
    } catch (exportError) {
      console.error('Could not export report files:', exportError);
      setError(`Could not export report: ${exportError.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition dark:border-gray-500 dark:text-gray-100"
      >
        <FileDown size={16} /> Export
      </button>
      {enableEmail && (
        <button
          type="button"
          onClick={() => void handleOpenEmail()}
          disabled={busy || !allSignaturesAdded}
          title={!allSignaturesAdded ? 'Add both signatures before emailing the signed report.' : 'Review and email the signed monthly report'}
          className="ml-2 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mail size={16} /> E-signed PDF &amp; Email
        </button>
      )}
      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#E8DCEF] bg-white p-4 shadow-xl">
        <input
          ref={signatureInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleSignatureFile}
        />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span aria-hidden="true" />
          {signatureOptions.length ? (
            <button
              type="button"
              onClick={() => setSignatureChoicesOpen((open) => !open)}
              aria-expanded={signatureChoicesOpen}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#E8DCEF] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-violet-50"
            >
              <FileUp size={16} />
              {signatures.length ? 'Manage E-signatures' : 'Insert E-signatures'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => signatureInput.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#E8DCEF] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-violet-50"
            >
              <FileUp size={16} />
              {signatures.length ? 'Change E-signature' : 'Insert E-signature'}
            </button>
          )}
          <button
            type="button"
            disabled={!allSignaturesAdded || busy}
            onClick={() => void exportFiles('preview')}
            className="inline-flex items-center justify-self-end gap-1 rounded-lg border border-violet-200 px-2.5 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Eye size={16} /> Preview
          </button>
        </div>
        {signatureChoicesOpen && signatureOptions.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {signatureOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedSigner(option);
                  setSignatureChoicesOpen(false);
                  signatureInput.current?.click();
                }}
                className="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {signatures.map((signature) => (
          <div key={signature.signer?.id || 'signature'} className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <img src={signature.dataUrl} alt={`${signature.signer?.label || 'E'} signature preview`} className="h-16 max-w-40 object-contain" />
            {signature.signer?.label && <span className="font-semibold">{signature.signer.label}</span>}
            <span className="text-emerald-700">Added</span>
          </div>
        ))}
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportFiles('pdf')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E8DCEF] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <FileDown size={16} /> Export PDF only
          </button>
          <button
            type="button"
            disabled={busy || !allSignaturesAdded}
            onClick={() => void exportFiles('signed-pdf')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <FileDown size={16} /> {busy ? 'Exporting…' : 'E-sign & export PDF'}
          </button>
          <button
            type="button"
            disabled={busy || !allSignaturesAdded}
            onClick={() => void exportFiles('word')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E8DCEF] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <FileDown size={16} /> {busy ? 'Exporting…' : 'E-sign & export Word'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        </div>
      )}
      {signaturePreviewOpen && !emailModalOpen && signedPdfUrl && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSignaturePreviewOpen(false);
              setSignedPdfUrl('');
            }
          }}
        >
          <section
            className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Signed document preview"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Signed document preview</h2>
                <p className="mt-0.5 text-sm text-slate-500">{title} with uploaded signatures</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSignaturePreviewOpen(false);
                  setSignedPdfUrl('');
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close signed document preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="h-[75vh] overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
              <iframe
                title={`${title} signed PDF`}
                src={signedPdfUrl}
                className="h-full w-full"
              />
            </div>
          </section>
        </div>
      )}
      {emailModalOpen && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/70 p-3 sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setEmailModalOpen(false);
          }}
        >
          <section
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Review and email signed report"
          >
            <header className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-900">Review and email signed report</h2>
                <p className="mt-1 text-sm text-slate-500">The signed PDF is attached. Review it before sending.</p>
              </div>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                disabled={busy}
                aria-label="Close email dialog"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
              <form id="monthly-report-email-form" onSubmit={(event) => void handleSendEmail(event)} className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Recipient email
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    placeholder="recipient@example.com"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Subject
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={emailSubject}
                    onChange={(event) => setEmailSubject(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Message <span className="font-normal text-slate-400">(optional)</span>
                  <textarea
                    rows={5}
                    maxLength={10000}
                    value={emailMessage}
                    onChange={(event) => setEmailMessage(event.target.value)}
                    className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    placeholder="Add a message for the recipient..."
                  />
                </label>
                <p className="break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Attached: {fileName}.pdf
                </p>
                {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
                {emailSent && <p role="status" className="text-sm font-semibold text-emerald-700">Email sent successfully.</p>}
              </form>
              <div className="flex min-h-[50vh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <p className="border-b bg-white px-3 py-2 text-sm font-semibold text-slate-700">Signed PDF preview</p>
                {signedPdfUrl ? (
                  <iframe title={`${title} email attachment preview`} src={signedPdfUrl} className="min-h-[50vh] flex-1" />
                ) : (
                  <div className="grid min-h-[50vh] flex-1 place-items-center text-sm text-slate-500">
                    {error || 'Preparing signed PDF preview…'}
                  </div>
                )}
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setEmailModalOpen(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="submit"
                form="monthly-report-email-form"
                disabled={busy || emailSent || !signedPdfBlob}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <Send size={16} /> {busy ? 'Sending…' : emailSent ? 'Sent' : 'Send email'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
