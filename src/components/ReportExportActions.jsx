import { useRef, useState } from 'react';
import { FileDown, FileUp } from 'lucide-react';

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
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
}) {
  const signatureInput = useRef(null);
  const [signature, setSignature] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

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
      setSignature({ name: file.name, dataUrl: reader.result, type: file.type });
      setError('');
    };
    reader.onerror = () => setError('Could not read the selected signature image.');
    reader.readAsDataURL(file);
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
      TextRun,
      WidthType,
    } = await import('docx');
    const cellParagraph = (value, bold = false) => new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: String(value ?? ''), bold, size: 16 })],
    });
    const approvalColumns = [
      ['PREPARED BY:', 'LAARNI B. POMADA', 'Barangay Nutrition Scholar'],
      ['CHECKED:', 'EVANGELINE S. CANIT, RM', 'Rural Health Midwife'],
      ['NOTED:', 'ANITA P. AURO, RN, RM', 'Municipal Nutrition Action Officer II'],
    ];
    const footer = new Footer({
      children: [
        new Table({
          rows: [
            new TableRow({
              children: approvalColumns.map(([label]) => new TableCell({ children: [cellParagraph(label, true)] })),
            }),
            new TableRow({
              children: approvalColumns.map(([, name]) => new TableCell({ children: [cellParagraph(name, true)] })),
            }),
            new TableRow({
              children: approvalColumns.map(([, , role]) => new TableCell({ children: [cellParagraph(role)] })),
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [3000, 3000, 3000],
        }),
      ],
    });
    const tableRows = [
      new TableRow({ children: headers.map((header) => new TableCell({ children: [cellParagraph(header, true)] })) }),
      ...rows.map((row) => new TableRow({
        children: row.map((value) => new TableCell({ children: [cellParagraph(value)] })),
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
      new Paragraph({ text: '' }),
    ];

    if (signature) {
      const { width, height } = await getImageDimensions(signature.dataUrl);
      const scale = Math.min(160 / width, 60 / height);
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          data: dataUrlToBytes(signature.dataUrl),
          transformation: { width: width * scale, height: height * scale },
          type: signature.type === 'image/png' ? 'png' : 'jpg',
        })],
      }));
    }

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

  const exportFiles = async (includeSignature) => {
    setBusy(true);
    setError('');
    try {
      if (includeSignature) {
        await exportWord();
      } else {
        await onExportPdf(null);
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
      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#E8DCEF] bg-white p-4 shadow-xl">
        <input
          ref={signatureInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleSignatureFile}
        />
        <button
          type="button"
          onClick={() => signatureInput.current?.click()}
          className="flex w-full items-center gap-2 rounded-lg border border-[#E8DCEF] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-violet-50"
        >
          <FileUp size={16} />
          {signature ? 'Change E-signature' : 'Insert E-signature'}
        </button>
        {signature && (
          <span className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <img src={signature.dataUrl} alt="Signature preview" className="h-9 max-w-24 object-contain" />
            {signature.name}
          </span>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportFiles(false)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E8DCEF] px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <FileDown size={16} /> Export PDF only
          </button>
          <button
            type="button"
            disabled={busy || !signature}
            onClick={() => void exportFiles(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <FileDown size={16} /> {busy ? 'Exporting…' : 'E-sign & export Word'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
