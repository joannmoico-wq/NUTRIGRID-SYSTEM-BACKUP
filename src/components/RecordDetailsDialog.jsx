import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Baby,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  FileText,
  Globe,
  Hash,
  Heart,
  Image,
  Maximize2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
  UserCircle,
  X,
} from 'lucide-react';
import { getRecords, storageKeyForCategory, toAdminEnvironmental } from '../utils/bnsStorage';
import { calculateWhoBmiForAge } from '../utils/childGrowth';
import { formatPhilippineDateTime } from '../utils/philippineDateTime';

/**
 * Record details pop-up shared by the Admin Dashboard and the field-worker PWA.
 * Props: record, onClose.
 * Closes with the X button, a click outside the card, or Esc.
 * "Copy ID" copies text; "Inspect" opens a full-view photo.
 */

const PHOTO_FIELDS = [
  ['photo_url', 'Visit documentation photo'],
  ['residents_photo', 'Household photo'],
  ['residentsPhoto', 'Household photo'],
  ['environmental_sanitation_photo', 'Environmental sanitation photo'],
];

const INTERNAL_FIELDS = new Set([
  '_raw',
  'data',
  'category',
  'categoryId',
  'photo_url',
  'residents_photo',
  'residentsPhoto',
  'environmental_sanitation_photo',
  'photo_taken_at',
  'sync_error',
  'device_id',
  'local_id',
  'user_id',
  'created_by_user_id',
  'created_by_name',
  'created_by',
  'sync_status',
  'last_sync_at',
  'synced_at',
  'last_edited_at',
  'status',
  'synced',
  'id',
  'updated_at',
  'created_at',
]);

const CATEGORY_TITLES = {
  residents: 'Household & visit information',
  environmental: 'Environmental sanitation information',
  infantfeeding: 'Infant feeding information',
  pregnantwoman: 'Pregnancy information',
  lactatingwoman: 'Lactating woman information',
  monthlynatal: 'Natality information',
};

const FIELD_LABELS = {
  household_head: 'Household head',
  total_members: 'Total members',
  visit_date: 'Visit date',
  visited_by: 'Visited by',
  date_of_registration: 'Date of registration',
  family_serial_number: 'Family serial number',
  mother_name: 'Mother',
  child_name: 'Child',
  mother_birthday: 'Mother birthday',
  dob: 'Date of birth',
  dow: 'Date of weighing',
  date_delivered: 'Date delivered',
  expected_date_of_delivery: 'Expected delivery date',
  iron_folic_acid: 'Iron with folic acid',
  iron_folic_acid_type: 'Iron/folic acid type',
  total_hh: 'Total households',
  total_families: 'Total families',
  total_population: 'Total population',
  hh_with_occupation: 'Households with occupation',
  w_a: 'Weight for age',
  h_a: 'Height for age',
  w_l_h: 'Weight for length/height',
  gps_lat: 'GPS latitude',
  gps_lng: 'GPS longitude',
  feeding_1_week: '1 week',
  feeding_1_month: '1 month',
  feeding_2_month: '2 months',
  feeding_3_month: '3 months',
  feeding_4_month: '4 months',
  feeding_5_month: '5 months',
  feeding_6_month: '6 months',
  feeding_7_month: '7 months',
  feeding_8_month: '8 months',
};

const FIELD_ICONS = {
  purok: MapPin,
  visit_date: CalendarDays,
  date_of_registration: CalendarDays,
  dob: CalendarDays,
  dow: CalendarDays,
  birthday: CalendarDays,
  mother_birthday: CalendarDays,
  date_delivered: CalendarDays,
  expected_date_of_delivery: CalendarDays,
  total_members: Users,
  household_head: UserCircle,
  visited_by: UserCircle,
  mother_name: Heart,
  child_name: Baby,
  notes: FileText,
  remarks: FileText,
  gps_lat: Compass,
  gps_lng: Globe,
  status: CheckCircle2,
  synced: RefreshCw,
  id: Hash,
  created_at: Clock3,
  updated_at: Clock3,
  created_by: UserCircle,
  created_by_user_id: UserCircle,
};

const TONES = {
  pink: 'bg-pink-50 text-pink-500',
  rose: 'bg-rose-50 text-rose-500',
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-500',
  amber: 'bg-amber-50 text-amber-500',
  slate: 'bg-slate-50 text-slate-500',
};

function toneFor(field) {
  if (/note|remark|date|dob|dow|birthday|lmp/.test(field)) return TONES.rose;
  if (/status|synced/.test(field)) return TONES.green;
  if (/gps/.test(field)) return TONES.violet;
  if (/member|count|total/.test(field)) return TONES.amber;
  if (field === 'id' || /^created|^updated/.test(field)) return TONES.slate;
  return TONES.pink;
}

const SYNC_BADGES = {
  synced: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  syncing: 'border-sky-200 bg-sky-50 text-sky-700',
  pending_sync: 'border-amber-200 bg-amber-50 text-amber-800',
  sync_failed: 'border-red-200 bg-red-50 text-red-700',
};

function formatLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const hasTime = /T\d{2}:\d{2}/.test(String(value));
  return formatPhilippineDateTime(value, hasTime
    ? { ...dateOptions, hour: 'numeric', minute: '2-digit' }
    : dateOptions);
}

function formatValue(value, key = '') {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([itemKey, itemValue]) => `${formatLabel(itemKey)}: ${formatValue(itemValue, itemKey)}`)
      .join(' · ');
  }
  if (
    typeof value === 'string' &&
    /(^|_)(date|dob|birthday|lmp|dow|created_at|updated_at|synced_at|last_sync_at)/i.test(key) &&
    value.trim()
  ) return formatDateValue(value);
  return String(value);
}

function formatStamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return formatPhilippineDateTime(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).replace(/-/g, '/');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (error) {
      console.error('Could not copy to the clipboard:', error);
      return false;
    }
  }
}

function SectionHeading({ title, detail }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.1em] text-[#A13D70]">
        <span className="h-4 w-1 rounded-full bg-[#F278B5]" />
        {title}
      </h3>
      {detail ? <span className="text-xs font-medium text-slate-500">{detail}</span> : null}
    </div>
  );
}

function DetailCard({ field, label, value, mono = false, children }) {
  const Icon = FIELD_ICONS[field] || FileText;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-pink-100/70 bg-[#FFFAFC] px-3.5 py-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneFor(field)}`}>
        <Icon size={17} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#B36A8D]">
          {label || formatLabel(field)}
        </dt>
        <dd className={`mt-0.5 whitespace-pre-wrap break-words text-base font-semibold leading-6 text-[#34313A] ${mono ? 'font-mono text-[13px]' : ''}`}>
          {children ?? formatValue(value, field)}
        </dd>
      </div>
    </div>
  );
}

function PhotoLightbox({ inspectPhoto, onClose, personName, purok, stamp }) {
  if (!inspectPhoto) return null;
  return (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-rose-950/45 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${inspectPhoto.label}, full view`}
            className="rdd-pop flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Image size={16} className="text-pink-500" aria-hidden="true" />
                {inspectPhoto.label} — full view
              </h3>
              <button
                type="button"
                onClick={() => onClose()}
                className="grid h-8 w-8 place-items-center rounded-full border border-pink-100 text-pink-700 transition hover:bg-pink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                aria-label="Close full view"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5">
              <img
                src={inspectPhoto.src}
                alt={`${inspectPhoto.label}, full size`}
                className="mx-auto max-h-[68dvh] w-full rounded-xl object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm text-slate-500">
              <span>
                {personName ? (
                  <><strong className="font-bold text-slate-800">{personName}</strong></>
                ) : 'Record photo'}
                {purok ? ` (${purok})` : ''}
              </span>
              {stamp ? <span className="font-medium text-pink-600">{stamp}</span> : null}
            </div>
          </div>
        </div>
  );
}


const POP_CSS = `
  @keyframes rdd-pop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
  .rdd-pop { animation: rdd-pop .18s ease-out; }
  @media (prefers-reduced-motion: reduce) { .rdd-pop { animation: none; } }
`;

const NAT_TONES = {
  severe: { pill: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500', value: 'text-rose-600' },
  risk: { pill: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', value: 'text-amber-600' },
  normal: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', value: 'text-pink-600' },
  none: { pill: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400', value: 'text-slate-600' },
};

const CARE_CARD_TONES = {
  amber: { icon: 'border-amber-200 bg-amber-50', dot: 'bg-amber-500' },
  rose: { icon: 'border-rose-200 bg-rose-50', dot: 'bg-rose-500' },
};

const CARE_TAG_TONES = {
  green: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  violet: { pill: 'border-violet-200 bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  slate: { pill: 'border-slate-200 bg-slate-50 text-slate-500', dot: 'bg-slate-400' },
};

const LONG_DATE = { month: 'long', day: '2-digit', year: 'numeric' };
const SHORT_DATE = { month: 'short', day: 'numeric', year: 'numeric' };

function toDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtDate(value, options) {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', options) : '';
}

function ageText(dob, reference) {
  const birth = toDate(dob);
  if (!birth) return '';
  const ref = toDate(reference) || new Date();
  let months = (ref.getFullYear() - birth.getFullYear()) * 12 + ref.getMonth() - birth.getMonth();
  if (ref.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (rest || !years) parts.push(`${rest} ${rest === 1 ? 'mo' : 'mos'}`);
  return parts.join(', ');
}

const join = (parts, sep = ' • ') => parts.filter(Boolean).join(sep);
const yn = (v) => {
  const t = String(v ?? '').trim();
  if (/^y(es)?$/i.test(t)) return 'Yes';
  if (/^n(o)?$/i.test(t)) return 'No';
  return t;
};
const has = (v) => v !== undefined && v !== null && v !== '';
const withUnit = (v, unit) => (has(v) ? `${v} ${unit}` : '');

function nutritionStatus(raw) {
  const items = [raw.w_a, raw.h_a, raw.w_l_h].map((v) => String(v || '').trim()).filter(Boolean);
  const lower = items.map((v) => v.toLowerCase());
  const severe = lower.findIndex((v) => v.includes('severely'));
  if (severe >= 0) return { label: items[severe], tone: 'severe' };
  const risk = lower.findIndex((v) => /underweight|stunted|wasted|overweight|obese/.test(v));
  if (risk >= 0) return { label: items[risk], tone: 'risk' };
  if (items.length) return { label: 'Normal', tone: 'normal' };
  return { label: 'Not assessed', tone: 'none' };
}

function fullName(raw) {
  return [raw.first_name, raw.middle_name, raw.last_name].filter(Boolean).join(' ').trim();
}

function motherProfile(raw, ctx) {
  return [
    ['Age & civil status', join([has(raw.age) ? `${raw.age} yrs` : '', raw.civil_status])],
    ['Birthday', fmtDate(raw.birthday, LONG_DATE)],
    ['Spouse', raw.spouse_name],
    ['Contact & address', join([raw.contact_number, ctx.purok])],
    ['Family serial no.', raw.family_serial_number],
  ];
}

function mothersStats(raw) {
  const wh = join([withUnit(raw.weight, 'kg'), withUnit(raw.height, 'cm')], ' / ');
  return [
    ['Weight / height', wh || '—'],
    ['BMI', has(raw.bmi) ? String(raw.bmi) : '—'],
    ['MUAC', withUnit(raw.muac, 'cm') || '—'],
  ];
}

const FEEDING_FIELDS = [
  ['1 week', 'feeding_1_week'], ['1 month', 'feeding_1_month'], ['2 months', 'feeding_2_month'],
  ['3 months', 'feeding_3_month'], ['4 months', 'feeding_4_month'], ['5 months', 'feeding_5_month'],
  ['6 months', 'feeding_6_month'], ['7 months', 'feeding_7_month'], ['8 months', 'feeding_8_month'],
];

function feedingKind(value) {
  const t = String(value).trim().toLowerCase();
  if (['e', 'ebf', 'exclusive breastfeeding'].includes(t)) return 'exclusive';
  if (['m', 'mixed', 'mixed feeding'].includes(t)) return 'mixed';
  if (['n', 'not breastfeeding'].includes(t)) return 'none';
  return 'other';
}

function selectedLabels(raw, choices) {
  return choices
    .filter(([key]) => isChecked(raw[key]))
    .map(([, label]) => label)
    .join(', ');
}

function isChecked(value) {
  return value === true || value === 1 || /^(true|yes|1)$/i.test(String(value ?? '').trim());
}

function ironCareItems(raw) {
  const value = join([
    raw.iron_folic_acid_type,
    has(raw.iron_folic_acid) && `${raw.iron_folic_acid} tabs`,
  ]);
  return value ? [{ label: 'Iron with folic acid', value, tone: 'rose' }] : [];
}

const BUILDERS = {
  monthlynatal(raw, ctx) {
    const name = String(raw.child_name || raw.name_of_child || 'Child').trim();
    const sex = raw.sex === 'boys' ? 'Male' : raw.sex === 'girls' ? 'Female' : String(raw.sex || '');
    const weight = Number(raw.weight_kg);
    const bmiForAge = calculateWhoBmiForAge({
      sex: raw.sex,
      birthday: raw.dob,
      weighingDate: raw.dow,
      weightKg: raw.weight_kg,
      lengthCm: raw.length_cm,
      heightCm: raw.height_cm,
    });
    const careItems = [
      raw.vitamin_a && {
        label: 'Vitamin A',
        value: join([raw.vitamin_a, raw.vitamin_a_count && `(×${raw.vitamin_a_count})`], ' '),
        tone: 'amber',
      },
      (raw.iron_status || raw.iron_given) && {
        label: 'Iron drops',
        value: String(raw.iron_status || raw.iron_given),
        tone: 'rose',
      },
    ].filter(Boolean);
    const careTags = [
      isChecked(raw.fully_immunized) && {
        label: 'Fully immunized',
        tone: 'green',
      },
      isChecked(raw.newborn_babies) && {
        label: 'Newborn',
        tone: 'violet',
      },
    ].filter(Boolean);
    const indices = [['W/A', raw.w_a], ['H/A', raw.h_a], ['W/L/H', raw.w_l_h]]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .concat([`BMI-for-age (WHO): ${bmiForAge.classification}`])
      .join('  ·  ');
    return {
      kind: 'Monthly Natality', program: 'Monthly Natality', name,
      statusCaption: 'Current nutritional status', status: nutritionStatus(raw), note: indices,
      careItems,
      careTags,
      stats: [
        ['Weight / height', weight > 0 ? `${weight} kg / ${raw.height_cm || raw.length_cm || '—'} cm` : '—'],
        ['BMI (kg/m²)', bmiForAge.bmi || '—', true],
      ],
      leftTitle: 'Beneficiary profile',
      left: [
        ['Age & sex', join([ageText(raw.dob, raw.dow), sex])],
        ['Date of birth', fmtDate(raw.dob, LONG_DATE)],
        ['Parent / guardian', raw.mother_name || raw.guardian_name],
        ['Contact & address', join([raw.contact_number || raw.mother_contact || raw.mother_contact_number, ctx.purok])],
      ],
      rightTitle: 'Program & assessment details',
      right: [
        ['Program category', 'Monthly Natality'],
        ['Last assessment date', fmtDate(raw.dow || raw.month || raw.updated_at || raw.created_at, SHORT_DATE)],
        ['Assigned health worker', ctx.worker],
      ],
      remarks: String(raw.remarks || raw.notes || '').trim(),
      photoTitle: 'Monthly weighing & height documentation', filePrefix: 'NAT',
    };
  },

  pregnantwoman(raw, ctx) {
    const name = fullName(raw) || 'Pregnant woman';
    const lmp = toDate(raw.lmp);
    const edd = toDate(raw.expected_date_of_delivery);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let status = { label: 'Pregnancy dates not recorded', tone: 'none' };
    if (edd && edd < today) status = { label: 'Past expected delivery date', tone: 'risk' };
    else if (lmp) {
      const weeks = Math.floor((today - lmp) / (7 * 86400000));
      status = weeks < 0
        ? { label: 'Check LMP date', tone: 'none' }
        : { label: `Trimester ${weeks < 14 ? 1 : weeks < 28 ? 2 : 3} • Week ${weeks}`, tone: 'normal' };
    }
    return {
      kind: 'Pregnant Woman', program: 'Pregnant Woman', name,
      statusCaption: 'Pregnancy status', status,
      note: edd ? `Expected delivery: ${fmtDate(edd, SHORT_DATE)}` : '',
      stats: mothersStats(raw),
      leftTitle: 'Mother profile', left: motherProfile(raw, ctx),
      rightTitle: 'Pregnancy & program details',
      right: [
        ['Date of registration', fmtDate(raw.date_of_registration, LONG_DATE)],
        ['Last menstrual period (LMP)', fmtDate(raw.lmp, LONG_DATE)],
        ['Expected delivery date', fmtDate(raw.expected_date_of_delivery, LONG_DATE)],
        ['PhilHealth & 4Ps', join([has(raw.philhealth_member) && `PhilHealth: ${yn(raw.philhealth_member)}`, has(raw.four_ps_beneficiary) && `4Ps: ${yn(raw.four_ps_beneficiary)}`])],
        ['Assigned health worker', ctx.worker],
      ],
      careItems: ironCareItems(raw),
      remarks: String(raw.notes || '').trim(),
      photoTitle: 'Pregnancy registration documentation', filePrefix: 'PW',
    };
  },

  lactatingwoman(raw, ctx) {
    const name = fullName(raw) || 'Lactating woman';
    const since = ageText(raw.date_delivered);
    return {
      kind: 'Lactating Woman', program: 'Lactating Woman', name,
      statusCaption: 'Postpartum status',
      status: since
        ? { label: `Delivered ${since} ago`, tone: 'normal' }
        : { label: 'Delivery date not recorded', tone: 'none' },
      note: raw.date_delivered ? `Date delivered: ${fmtDate(raw.date_delivered, SHORT_DATE)}` : '',
      stats: mothersStats(raw),
      leftTitle: 'Mother profile', left: motherProfile(raw, ctx),
      rightTitle: 'Program & assessment details',
      right: [
        ['Date of registration', fmtDate(raw.date_of_registration, LONG_DATE)],
        ['Date delivered', fmtDate(raw.date_delivered, LONG_DATE)],
        ['PhilHealth & 4Ps', join([has(raw.philhealth_member) && `PhilHealth: ${yn(raw.philhealth_member)}`, has(raw.four_ps_beneficiary) && `4Ps: ${yn(raw.four_ps_beneficiary)}`])],
        ['Assigned health worker', ctx.worker],
      ],
      careItems: ironCareItems(raw),
      remarks: String(raw.notes || '').trim(),
      photoTitle: 'Lactating woman documentation', filePrefix: 'LW',
    };
  },

  infantfeeding(raw, ctx) {
    const entries = FEEDING_FIELDS.map(([label, key]) => [label, String(raw[key] ?? '').trim()]);
    const recorded = entries.filter(([, v]) => v);
    const latest = recorded[recorded.length - 1];
    const kinds = recorded.map(([, v]) => feedingKind(v));
    const count = (k) => kinds.filter((x) => x === k).length;
    const labelFor = (v) => ({
      exclusive: 'Exclusive Breastfeeding', mixed: 'Mixed Feeding', none: 'Not Breastfeeding',
    }[feedingKind(v)] || v);
    const total = recorded.length;
    return {
      kind: 'Infant Feeding', program: 'Infant Feeding (0–8 mo)',
      name: String(raw.child_name || 'Infant').trim(),
      statusCaption: 'Current feeding method',
      status: latest
        ? { label: labelFor(latest[1]), tone: feedingKind(latest[1]) === 'exclusive' ? 'normal' : 'risk' }
        : { label: 'No feeding data yet', tone: 'none' },
      note: latest ? `As of ${latest[0]}` : '',
      stats: [
        ['Latest entry', latest ? latest[0] : '—'],
        ['Months recorded', `${total} of ${FEEDING_FIELDS.length}`],
      ],
      leftTitle: 'Beneficiary profile',
      left: [
        ['Child', raw.child_name],
        ['Mother / guardian', raw.mother_name],
        ['Contact & address', join([raw.contact_number, ctx.purok])],
      ],
      rightTitle: 'Feeding summary',
      right: [
        ['Exclusive breastfeeding', total ? `${count('exclusive')} of ${total} entries` : ''],
        ['Mixed feeding', total ? `${count('mixed')} of ${total} entries` : ''],
        ['Formula, other or not breastfeeding', total ? `${count('other') + count('none')} of ${total} entries` : ''],
        ['Assigned health worker', ctx.worker],
      ],
      chipsTitle: 'Feeding timeline', chips: entries.map(([l, v]) => [l, v ? labelFor(v) : '—']),
      remarks: String(raw.notes || '').trim(),
      photoTitle: 'Infant feeding documentation', filePrefix: 'IF',
    };
  },

  environmental(raw, ctx) {
    const visit = raw.visit_date || raw.created_at;
    if (ctx.compact) {
      const row = toAdminEnvironmental([raw])[0];
      const foodFields = [
        ['Vegetable garden', 'vegetableGarden'],
        ['Herbal garden', 'herbalGarden'],
        ['Backyard poultry / livestock', 'backyardPoultry'],
        ['Swine', 'swine'],
        ['Fish pond', 'fishPond'],
        ['Uses iodized salt', 'usesIodizedSalt'],
        ['With malunggay tree', 'malunggayTree'],
      ];
      const selectedValues = (fields) =>
        fields.filter(([, key]) => row[key]).map(([label]) => label).join(', ') || 'None recorded';
      const population = join([
        `${row.maleCount} male`,
        `${row.femaleCount} female`,
      ]);
      const activeFoodCount = foodFields.filter(([, key]) => row[key]).length;
      const waterSource = selectedValues([
        ['Level I', 'waterSourceI'],
        ['Level II', 'waterSourceII'],
        ['Level III', 'waterSourceIII'],
        ['Without potable water', 'withoutPotableWater'],
      ]);
      const toiletType = selectedValues([
        ['Water-sealed (WS)', 'toiletVS'],
        ['Open pit (OP)', 'toiletOP'],
        ['Communal', 'toiletCommunal'],
        ['No sanitary toilet', 'toiletNone'],
      ]);
      const electricity = selectedValues([
        ['Electricity owned', 'electricityOwned'],
        ['Electricity connected', 'electricityConnected'],
      ]);
      const garbageDisposal = selectedValues([
        ['Collected by barangay', 'garbageCollect'],
        ['Compost pit', 'garbageCompostPit'],
        ['Burned', 'garbageBurned'],
      ]);
      const iodizedSaltSources = selectedValues([
        ['Sari-sari store', 'iodizedSaltSariSari'],
        ['Grocery', 'iodizedSaltGrocery'],
      ]);
      const establishmentTypes = selectedValues([
        ['Bakery', 'estBakery'],
        ['Carenderia', 'estCarenderia'],
        ['Restaurant', 'estRestaurant'],
        ['Hotel', 'estHotelRest'],
      ]);
      const hasIodizedSaltSource = iodizedSaltSources !== 'None recorded';
      const activeEstablishmentCount = [
        'estBakery',
        'estCarenderia',
        'estRestaurant',
        'estHotelRest',
      ].filter((key) => row[key]).length;

      return {
        kind: 'Environmental record',
        program: 'Environmental sanitation',
        name: raw.purok ? `${raw.purok} sanitation survey` : 'Environmental sanitation survey',
        statusCaption: 'Environmental record',
        status: visit
          ? { label: `Visited ${fmtDate(visit, SHORT_DATE)}`, tone: 'normal' }
          : { label: 'No visit date recorded', tone: 'none' },
        note: '',
        stats: [
          ['Households', String(row.totalHH)],
          ['Families', String(row.totalFamilies)],
          ['Population', String(row.totalPopulation)],
        ],
        centerLastStat: true,
        environmentalSections: [
          {
            title: 'Household & demographics',
            cards: [
              {
                label: 'Male / female population',
                value: population,
                detail: `Total population: ${row.totalPopulation}`,
                tone: 'neutral',
              },
              {
                label: 'Households with occupation',
                value: String(row.hhWithOccupation),
                tone: 'neutral',
              },
              {
                label: 'Survey date',
                value: fmtDate(visit, LONG_DATE) || 'Not recorded',
                tone: 'neutral',
              },
              {
                label: 'Visited by',
                value: raw.visited_by || ctx.worker || 'Not recorded',
                tone: 'neutral',
              },
            ],
          },
          {
            title: 'Sanitation, water & utilities',
            cards: [
              {
                label: 'Household water supply',
                value: waterSource === 'None recorded' ? raw.water_source || waterSource : waterSource,
                badge: row.withoutPotableWater ? 'No potable source' : waterSource === 'None recorded' ? 'Not recorded' : 'Recorded',
                tone: row.withoutPotableWater ? 'danger' : waterSource === 'None recorded' ? 'neutral' : 'success',
              },
              {
                label: 'Toilet type',
                value: toiletType === 'None recorded' ? raw.toilet_type || toiletType : toiletType,
                badge: row.toiletVS ? 'Sanitary' : row.toiletOP || row.toiletNone ? 'Priority WASH' : toiletType === 'None recorded' ? 'Not recorded' : 'Communal',
                tone: row.toiletVS ? 'success' : row.toiletOP || row.toiletNone ? 'danger' : 'neutral',
              },
              {
                label: 'Electricity',
                value: electricity,
                badge: electricity === 'None recorded' ? 'Not recorded' : 'Recorded',
                tone: electricity === 'None recorded' ? 'neutral' : 'success',
              },
              {
                label: 'Garbage disposal',
                value: garbageDisposal,
                badge: garbageDisposal === 'None recorded' ? 'Not recorded' : 'Recorded',
                tone: garbageDisposal === 'None recorded' ? 'neutral' : 'success',
              },
            ],
          },
        ],
        careTitle: 'Food production & nutrition practices',
        careSummary: `${activeFoodCount} / ${foodFields.length} active`,
        careTags: foodFields.map(([label, key]) => ({
          label: `${row[key] ? '✓' : '—'} ${label}`,
          tone: row[key] ? 'green' : 'slate',
        })),
        environmentalHealthTitle: 'Health & household indicators',
        environmentalHealthCards: [
          {
            label: 'Household smoking status',
            value: row.householdSmoker
              ? 'With smoker'
              : row.householdNonsmoker
                ? 'Non-smoker household'
                : 'Not recorded',
            badge: row.householdSmoker
              ? 'Exposure risk'
              : row.householdNonsmoker
                ? 'Smoke-free'
                : 'No record',
            tone: row.householdSmoker ? 'danger' : row.householdNonsmoker ? 'success' : 'neutral',
          },
          {
            label: 'Child / lactating / father indicator (CH. NL father)',
            value: row.fatherReceivingRe ? 'Yes (1)' : 'None',
            badge: row.fatherReceivingRe ? 'Present' : '0',
            tone: row.fatherReceivingRe ? 'warning' : 'neutral',
          },
          {
            label: 'Home-based store (iodized salt)',
            value: hasIodizedSaltSource ? iodizedSaltSources : 'None (residential only)',
            badge: hasIodizedSaltSource ? 'Compliant' : 'Residential',
            tone: hasIodizedSaltSource ? 'success' : 'neutral',
          },
          {
            label: 'Establishments',
            value: establishmentTypes,
            badge: activeEstablishmentCount ? `${activeEstablishmentCount} recorded` : 'None recorded',
            tone: activeEstablishmentCount ? 'success' : 'neutral',
          },
        ],
        remarksTitle: 'Survey notes / remarks',
        remarksBadge: raw.visited_by ? `Surveyed by: ${raw.visited_by}` : '',
        remarks: String(raw.notes || raw.remarks || '').trim(),
        photoTitle: 'Environmental sanitation documentation',
        filePrefix: 'ENV',
      };
    }

    const population = join([
      has(raw.male_count) && `${raw.male_count} male`,
      has(raw.female_count) && `${raw.female_count} female`,
    ]);
    return {
      kind: 'Environmental record', program: 'Environmental sanitation',
      name: String(raw.household_head || raw.household_name || 'Household survey').trim(),
      statusCaption: 'Environmental record',
      status: visit
        ? { label: `Visited ${fmtDate(visit, SHORT_DATE)}`, tone: 'normal' }
        : { label: 'No visit date recorded', tone: 'none' },
      note: '',
      stats: [
        ['Households', has(raw.total_hh) ? String(raw.total_hh) : '—'],
        ['Families', has(raw.total_families) ? String(raw.total_families) : '—'],
        ['Population', has(raw.total_population) ? String(raw.total_population) : population || '—'],
      ],
      leftTitle: 'Household profile',
      left: [
        ['Total households', raw.total_hh],
        ['Total families', raw.total_families],
        ['Male / female population', population],
        ['Total population', raw.total_population],
        ['Households with occupation', raw.hh_with_occupation],
        ['Purok', ctx.purok],
      ],
      rightTitle: 'Water, sanitation & household details',
      right: [
        ['Water source', raw.water_source || selectedLabels(raw, [
          ['water_level_i', 'Level I'],
          ['water_level_ii', 'Level II'],
          ['water_level_iii', 'Level III'],
          ['without_potable_water', 'Without potable water'],
        ])],
        ['Toilet type', raw.toilet_type || selectedLabels(raw, [
          ['toilet_sanitary', 'Sanitary toilet'],
          ['toilet_not_sanitary', 'Non-sanitary toilet'],
          ['toilet_communal', 'Communal toilet'],
          ['toilet_none', 'No toilet'],
        ])],
        ['Garbage disposal', selectedLabels(raw, [
          ['compost_pit', 'Compost pit'],
          ['garbage_collect', 'Collected by barangay'],
          ['garbage_others', 'Burned / other'],
        ])],
        ['Household resources', selectedLabels(raw, [
          ['electricity_owned', 'Electricity owned'],
          ['electricity_connected', 'Electricity connected'],
          ['has_veg_garden', 'Vegetable garden'],
          ['has_herbal_garden', 'Herbal garden'],
          ['has_backyard_poultry', 'Backyard poultry'],
          ['has_swine', 'Swine'],
          ['has_fish_pond', 'Fish pond'],
          ['uses_iodized_salt', 'Uses iodized salt'],
          ['has_malunggay_tree', 'Malunggay tree'],
        ])],
        ['Visit date', fmtDate(visit, LONG_DATE)],
        ['Visited by', raw.visited_by || ctx.worker],
        ['Assigned health worker', ctx.worker],
      ],
      remarks: String(raw.notes || raw.remarks || '').trim(),
      photoTitle: 'Environmental sanitation documentation', filePrefix: 'ENV',
    };
  },

  residents(raw, ctx) {
    const members = raw.total_members;
    const visit = raw.visit_date || raw.created_at;
    const count = has(members) ? Number(members) : NaN;
    return {
      kind: 'Residents', program: 'Household visit',
      name: String(raw.household_head || 'Household').trim(),
      statusCaption: 'Household record',
      status: visit
        ? { label: `Visited ${fmtDate(visit, SHORT_DATE)}`, tone: 'normal' }
        : { label: 'No visit date recorded', tone: 'none' },
      note: '',
      stats: [
        ['Household members', has(members) ? String(members) : '—'],
        ['Last visit', fmtDate(visit, SHORT_DATE) || '—'],
      ],
      leftTitle: 'Household profile',
      left: [
        ['Household head', raw.household_head],
        ['Total members', Number.isFinite(count) ? `${count} ${count === 1 ? 'member' : 'members'}` : ''],
        ['Contact & address', join([raw.contact_number, raw.address, ctx.purok])],
      ],
      rightTitle: 'Visit details',
      right: [
        ['Visit date', fmtDate(visit, LONG_DATE)],
        ['Visited by', raw.visited_by || ctx.worker],
      ],
      remarks: String(raw.notes || '').trim(),
      photoTitle: 'Household visit documentation', filePrefix: 'HH',
    };
  },
};

function detectCategory(raw) {
  const c = raw.category || raw.categoryId;
  if (BUILDERS[c]) return c;
  if ('child_name' in raw && ('dow' in raw || 'weight_kg' in raw || 'w_a' in raw)) return 'monthlynatal';
  if ('feeding_1_week' in raw || 'feeding_1_month' in raw) return 'infantfeeding';
  if ('lmp' in raw || 'expected_date_of_delivery' in raw) return 'pregnantwoman';
  if ('date_delivered' in raw && 'last_name' in raw) return 'lactatingwoman';
  if ('total_hh' in raw || 'water_level_i' in raw || 'water_source' in raw) return 'environmental';
  if ('household_head' in raw) return 'residents';
  return null;
}

function buildProfile(raw, ctx) {
  const builder = BUILDERS[detectCategory(raw)];
  if (!builder) return null;
  const worker = ctx.owner ? `BHW ${String(ctx.owner).replace(/^BHW\s+/i, '')}` : '';
  const cfg = builder(raw, { ...ctx, worker });
  const year = (toDate(raw.created_at) || toDate(raw.dow) || new Date()).getFullYear();
  const suffix = String(raw.id ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  const initials = cfg.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return {
    ...cfg, worker, initials, suffix,
    recLabel: `REC-${year}-${suffix}`, recFull: String(raw.id ?? ''),
  };
}

function geoStamp(raw, fallback) {
  const lat = has(raw.gps_lat) ? Number(raw.gps_lat) : NaN;
  const lng = has(raw.gps_lng) ? Number(raw.gps_lng) : NaN;
  const source = raw.photo_taken_at || raw.created_at || raw.updated_at;
  const when = toDate(source);
  const date = when
    ? formatPhilippineDateTime(when, SHORT_DATE)
    : '';
  const time = when && /T\d{2}:\d{2}/.test(String(source))
    ? formatPhilippineDateTime(source, { hour: 'numeric', minute: '2-digit' })
    : '';
  const stampText = join([date, time]) || fallback;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { hasGeo: false, text: stampText };
  const coords = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
  return { hasGeo: true, text: [coords, stampText].filter(Boolean).join('  |  ') };
}

function InfoRow({ label, value }) {
  return (
    <div className="py-2.5">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-base font-semibold leading-snug text-slate-900">{value || '—'}</dd>
    </div>
  );
}

const ENVIRONMENTAL_CARD_TONES = {
  danger: 'border-rose-200 bg-rose-50/70',
  neutral: 'border-slate-100 bg-slate-50',
  success: 'border-emerald-200 bg-emerald-50/70',
  warning: 'border-amber-200 bg-amber-50/70',
};

const ENVIRONMENTAL_BADGE_TONES = {
  danger: 'border-rose-200 bg-rose-100 text-rose-700',
  neutral: 'border-slate-200 bg-white text-slate-600',
  success: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  warning: 'border-amber-200 bg-amber-100 text-amber-700',
};

function EnvironmentalDataCard({ card }) {
  const tone = ENVIRONMENTAL_CARD_TONES[card.tone] || ENVIRONMENTAL_CARD_TONES.neutral;
  const badgeTone = ENVIRONMENTAL_BADGE_TONES[card.tone] || ENVIRONMENTAL_BADGE_TONES.neutral;
  return (
    <article className={`min-w-0 rounded-2xl border p-3 ${tone}`}>
      <p className="text-[11px] font-medium leading-tight text-slate-500">{card.label}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-1.5">
        <p className="min-w-0 flex-1 break-words text-sm font-bold leading-snug text-slate-900">
          {card.value ?? '—'}
        </p>
        {card.badge ? (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeTone}`}>
            {card.badge}
          </span>
        ) : null}
      </div>
      {card.detail ? <p className="mt-1 break-words text-[10px] leading-snug text-slate-500">{card.detail}</p> : null}
    </article>
  );
}

function RecordNavButton({ nav, direction }) {
  if (!nav) return null;
  const isPrevious = direction === 'previous';
  const action = isPrevious ? nav.prev : nav.next;
  const Icon = isPrevious ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={action}
      disabled={!action}
      aria-label={isPrevious ? 'Previous record' : 'Next record'}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-pink-50 hover:text-pink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:cursor-not-allowed disabled:opacity-35 sm:text-sm"
    >
      {isPrevious && <Icon size={16} />}
      <span className="whitespace-nowrap">
        {isPrevious ? 'Previous record' : 'Next record'}
      </span>
      {!isPrevious && <Icon size={16} />}
    </button>
  );
}

function NavCount({ nav }) {
  return nav ? (
    <span className="justify-self-center text-sm font-semibold tabular-nums text-slate-500" aria-live="polite">
      {nav.index + 1} / {nav.total}
    </span>
  ) : <span aria-hidden="true" />;
}

function RecordCard({ profile: p, raw, photos, purok, stamp, cardRef, sync, onClose, onInspect, nav, compact }) {
  const tone = NAT_TONES[p.status.tone];
  const geo = geoStamp(raw, stamp);
  const bodyRef = useRef(null);
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [p.recFull]);
  const colHead = 'mb-1 border-b border-pink-100 pb-2 text-sm font-extrabold uppercase tracking-[0.1em] text-[#C0285F]';
  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-details-title"
      className={`rdd-pop flex max-h-[94vh] w-full ${compact ? 'max-w-lg' : 'max-w-4xl'} flex-col overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-[0_24px_70px_rgba(190,24,93,0.2)] outline-none`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-pink-100 bg-white px-3 py-2.5 sm:px-4">
        <RecordNavButton nav={nav} direction="previous" />
        <RecordNavButton nav={nav} direction="next" />
      </div>

      <header className="flex shrink-0 items-center gap-3 border-b border-pink-100 bg-gradient-to-r from-[#FFF3F8] via-[#FFF9FB] to-white px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <span className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-400 font-extrabold text-white shadow-sm ${
            compact ? 'h-14 w-14 text-base' : 'h-16 w-16 text-xl'
          }`}>
            {p.initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="record-details-title" className="break-words text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">{p.name}</h2>
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
              <span title={p.recFull ? `Record ID ${p.recFull}` : undefined} className="max-w-full rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[11px] font-bold text-pink-700 sm:px-2.5 sm:text-[13px]">
                {p.recLabel}
              </span>
              {sync && (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold sm:px-2.5 sm:text-[13px] ${sync.cls}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                  {sync.label}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">{join([purok, p.program])}</p>
          </div>
        </div>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <section className="rounded-3xl border border-slate-100 bg-[#FAF8FA] p-4 sm:p-5" aria-label={`${p.kind} record overview`}>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{p.statusCaption}</p>
            <span className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold ${tone.pill}`}>
              <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
              {p.status.label}
            </span>
            {p.note ? <p className="mx-auto mt-2 max-w-2xl break-words text-xs text-slate-500">{p.note}</p> : null}
          </div>
          {p.stats.length > 0 && (
            <div className={`mt-4 grid gap-3 ${compact || p.stats.length < 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {p.stats.map(([label, value, emphasis], index) => {
                const centerStat = compact && p.centerLastStat && index === p.stats.length - 1;
                return (
                  <div
                    key={label}
                    className={`min-w-0 rounded-2xl border border-slate-100 bg-white px-2.5 py-3 text-center sm:px-3 ${
                      centerStat ? 'col-span-2 w-1/2 justify-self-center' : ''
                    }`}
                  >
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 sm:text-xs">{label}</p>
                  <p className={`mt-1.5 break-words text-lg font-bold leading-tight sm:text-xl ${emphasis ? tone.value : 'text-slate-900'}`}>{value}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 sm:gap-6">
            {p.environmentalSections ? (
              <div className="col-span-2 space-y-5">
                {p.environmentalSections.map((section) => (
                  <section key={section.title} aria-label={section.title}>
                    <h3 className={colHead}>{section.title}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {section.cards.map((card) => (
                        <EnvironmentalDataCard key={card.label} card={card} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <>
                <section aria-label={p.leftTitle}>
                  <h3 className={colHead}>{p.leftTitle}</h3>
                  <dl>{p.left.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</dl>
                </section>
                <section aria-label={p.rightTitle}>
                  <h3 className={colHead}>{p.rightTitle}</h3>
                  <dl>{p.right.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</dl>
                </section>
              </>
            )}
          </div>
        </section>

        {((p.careItems?.length || 0) + (p.careTags?.length || 0)) > 0 && (
          <section className="rounded-3xl border border-rose-100 bg-[#FFFAFC] p-4 sm:p-5" aria-label={p.careTitle || 'Supplementation and care'}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-rose-100 text-rose-600">
                  <ShieldCheck size={16} aria-hidden="true" />
                </span>
                <h3 className="text-sm font-extrabold uppercase tracking-[0.08em] text-rose-600">{p.careTitle || 'Supplementation & Care'}</h3>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                {p.careSummary || `${(p.careItems?.length || 0) + (p.careTags?.length || 0)} care items`}
              </span>
            </div>
            {p.careItems?.length > 0 && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {p.careItems.map((item) => {
                  const tone = CARE_CARD_TONES[item.tone] || CARE_CARD_TONES.rose;
                  return (
                    <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${tone.icon}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{item.label}</p>
                        <p className="mt-0.5 break-words text-sm font-bold leading-snug text-slate-900">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {p.careTags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.careTags.map((tag) => {
                  const tone = CARE_TAG_TONES[tag.tone] || CARE_TAG_TONES.green;
                  return (
                    <span key={tag.label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${tone.pill}`}>
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
                      {tag.label}
                    </span>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {p.environmentalHealthCards?.length > 0 && (
          <section className="rounded-3xl border border-slate-100 bg-white p-4 sm:p-5" aria-label={p.environmentalHealthTitle}>
            <h3 className={colHead}>{p.environmentalHealthTitle}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {p.environmentalHealthCards.map((card) => (
                <EnvironmentalDataCard key={card.label} card={card} />
              ))}
            </div>
          </section>
        )}

        {p.chips ? (
          <section aria-label={p.chipsTitle}>
            <h3 className={colHead}>{p.chipsTitle}</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {p.chips.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-pink-100 bg-[#FFF8FA] px-3 py-2.5 text-center">
                  <p className="text-[13px] font-medium text-slate-500">{label}</p>
                  <p className="mt-0.5 break-words text-sm font-bold leading-snug text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="rounded-2xl border border-slate-100 bg-[#F6F9FC] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold text-slate-600">{p.remarksTitle || (p.kind === 'Residents' ? 'Visit notes' : 'Field assessment remarks')}</p>
            {p.remarksBadge ? (
              <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-[11px] font-semibold text-pink-700">
                {p.remarksBadge}
              </span>
            ) : null}
          </div>
          <p className={`mt-1 whitespace-pre-wrap break-words text-lg leading-relaxed ${p.remarks ? 'text-slate-800' : 'text-slate-500'}`}>
            {p.remarks || 'No remarks recorded.'}
          </p>
        </div>

        <section aria-label="Documentation and field proof">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.1em] text-[#C0285F]">
              <Camera size={16} aria-hidden="true" /> Documentation &amp; field proof
            </h3>
            {photos.length > 0 && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold ${
                geo.hasGeo ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                <CheckCircle2 size={14} aria-hidden="true" />
                {geo.hasGeo ? 'Geo-verified photo' : 'Photo attached'}
              </span>
            )}
          </div>
          {photos.length > 0 ? (
            <div className="space-y-3">
              {photos.map((photo) => {
                const ext = (photo.src.match(/^data:image\/([a-z0-9.+-]+);/i)?.[1] ||
                  photo.src.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1] || 'jpeg').toUpperCase().replace('JPEG', 'JPG');
                return (
                  <figure key={photo.key} className="overflow-hidden rounded-2xl border border-pink-100 bg-white">
                    <div className="relative bg-pink-50">
                      <img src={photo.src} alt={`${photo.label} for ${p.name}`} className="aspect-[16/9] w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onInspect(photo)}
                        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-pink-700 shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                      >
                        <Maximize2 size={15} /> Inspect photo
                      </button>
                      {geo.text && (
                        <span className="absolute bottom-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg bg-slate-800/85 px-3 py-1.5 font-mono text-[13px] text-white backdrop-blur">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${geo.hasGeo ? 'bg-emerald-400' : 'bg-slate-400'}`} aria-hidden="true" />
                          <span className="truncate">{geo.text}</span>
                        </span>
                      )}
                    </div>
                    <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-900">{p.photoTitle}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {join([purok && `Captured in ${purok}`, p.worker && `Uploaded by ${p.worker}`]) || photo.label}
                        </p>
                      </div>
                      <span className="rounded-md border border-pink-100 bg-pink-50 px-2 py-1 font-mono text-[13px] text-pink-700">
                        IMG_{p.filePrefix}_{p.suffix}.{ext}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-pink-200 bg-[#FFFAFC] px-4 py-6 text-base text-slate-600">
              <Image size={24} className="shrink-0 text-pink-300" aria-hidden="true" />
              No documentation photo was attached to this record.
            </div>
          )}
        </section>
      </div>

      <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-pink-100 bg-[#FFFAFC] px-5 py-3.5 sm:px-7">
        <span aria-hidden="true" />
        <NavCount nav={nav} />
        <button
          type="button"
          onClick={onClose}
          className="justify-self-end rounded-xl bg-pink-600 px-6 py-2.5 text-base font-bold text-white shadow-sm transition hover:bg-pink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2"
        >
          Done viewing
        </button>
      </footer>
    </section>
  );
}

function RecordDetailsDialogInner({ record, recordCategory, onClose, barangay = 'Alawihao', nav, compact }) {
  const [copied, setCopied] = useState('');
  const [inspectPhoto, setInspectPhoto] = useState(null);
  const cardRef = useRef(null);
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    setCopied('');
    setInspectPhoto(null);
  }, [record]);

  useEffect(() => {
    if (!record) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'ArrowLeft' && !inspectPhoto) { navRef.current?.prev?.(); return; }
      if (event.key === 'ArrowRight' && !inspectPhoto) { navRef.current?.next?.(); return; }
      if (event.key !== 'Escape') return;
      if (inspectPhoto) setInspectPhoto(null);
      else onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    cardRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [record, onClose, inspectPhoto]);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const details = useMemo(() => {
    if (!record) return null;
    const recordData = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? { ...record.data, ...record }
      : record;
    const raw = recordCategory && !recordData.category && !recordData.categoryId
      ? { ...recordData, category: recordCategory }
      : recordData;
    const photos = PHOTO_FIELDS
      .map(([key, label]) => ({ key, label, src: raw[key] }))
      .filter(({ src }) => typeof src === 'string' && src.length > 0)
      .filter((photo, index, list) => list.findIndex(({ src }) => src === photo.src) === index);
    const fields = Object.entries(raw)
      .filter(([key, value]) => !INTERNAL_FIELDS.has(key) && value !== undefined)
      .filter(([, value]) => value !== null && value !== '')
      .filter(([, value]) => !(typeof value === 'string' && (value.startsWith('data:image/') || value.length > 800)));
    return { raw, photos, fields };
  }, [record, recordCategory]);

  if (!record || !details) return null;

  const raw = details.raw;
  const syncKey = (() => {
    const explicit = String(raw.sync_status || '').toLowerCase();
    if (SYNC_BADGES[explicit]) return explicit;
    return raw.synced === true || String(raw.status || '').toLowerCase() === 'synced'
      ? 'synced'
      : 'pending_sync';
  })();
  const isSynced = syncKey === 'synced';
  const badgeLabel = {
    synced: 'Verified & synced',
    syncing: 'Syncing',
    pending_sync: 'Pending sync',
    sync_failed: 'Sync failed',
  }[syncKey];
  const title = CATEGORY_TITLES[raw.category || raw.categoryId] || 'Record information';
  const recordId = raw.id == null ? '' : String(raw.id);
  const owner = raw.created_by_name || raw.created_by || raw.visited_by || '';
  const personName = raw.household_head || raw.child_name || raw.mother_name ||
    [raw.first_name, raw.middle_name, raw.last_name].filter(Boolean).join(' ');
  const purok = raw.purok ? formatValue(raw.purok, 'purok') : '';
  const stamp = formatStamp(raw.photo_taken_at || raw.created_at || raw.updated_at);

  const doCopy = async (kind, text) => {
    setCopied((await copyText(text)) ? kind : `${kind}-failed`);
  };
  const copyBtn = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300';
  const btnTone = (kind) => (
    copied === kind
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : copied === `${kind}-failed`
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-[#F0D8E5] bg-white text-[#A13D70] hover:bg-[#FFF3F8]'
  );
  const btnLabel = (kind, idle, done) => (
    copied === kind ? done : copied === `${kind}-failed` ? 'Could not copy' : idle
  );

  const profile = buildProfile(raw, { owner, purok, compact });
  if (profile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[6000] flex items-center justify-center bg-rose-950/30 p-2.5 backdrop-blur-sm sm:p-5"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <style>{POP_CSS}</style>
        <RecordCard
          profile={profile}
          raw={raw}
          photos={details.photos}
          purok={purok}
          stamp={stamp}
          cardRef={cardRef}
          sync={{ label: badgeLabel, cls: SYNC_BADGES[syncKey] }}
          onClose={onClose}
          onInspect={setInspectPhoto}
          nav={nav}
          compact={compact}
        />
        <PhotoLightbox
          inspectPhoto={inspectPhoto}
          onClose={() => setInspectPhoto(null)}
          personName={profile.name}
          purok={purok}
          stamp={stamp}
        />
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center bg-rose-950/30 p-2.5 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes rdd-pop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
        .rdd-pop { animation: rdd-pop .18s ease-out; }
        @media (prefers-reduced-motion: reduce) { .rdd-pop { animation: none; } }
      `}</style>
      <section
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-details-title"
        className={`rdd-pop flex max-h-[94vh] w-full ${compact ? 'max-w-md' : 'max-w-4xl'} flex-col overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-[0_24px_70px_rgba(190,24,93,0.18)] outline-none sm:rounded-[1.75rem]`}
      >
        <header className="shrink-0 border-b border-pink-100 bg-gradient-to-b from-[#FFF7FA] to-white px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="record-details-title" className="text-lg font-extrabold tracking-tight text-[#302B34] sm:text-2xl">
                  Saved record details
                </h2>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${SYNC_BADGES[syncKey]}`}>
                  {isSynced ? <ShieldCheck size={12} /> : <Clock3 size={12} />}
                  {badgeLabel}
                </span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-[#B84F84]">
                  <MapPin size={13} />
                  Barangay {barangay}
                </span>
                <span>{title}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {recordId ? (
                <button
                  type="button"
                  onClick={() => doCopy('id', recordId)}
                  className={`${copyBtn} ${btnTone('id')}`}
                  aria-label="Copy record ID"
                >
                  {copied === 'id' ? <Check size={14} /> : <Hash size={14} />}
                  <span className="hidden sm:inline">{btnLabel('id', 'Copy ID', 'ID copied')}</span>
                </button>
              ) : null}
              <RecordNavButton nav={nav} direction="previous" />
              <RecordNavButton nav={nav} direction="next" />
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-white px-4 py-5 sm:px-7 sm:py-6">
          <section aria-label={title}>
            <SectionHeading
              title={title}
              detail={`${details.fields.length} ${details.fields.length === 1 ? 'field' : 'fields'}`}
            />
            {details.fields.length > 0 ? (
              <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {details.fields.map(([key, value]) => (
                  <DetailCard key={key} field={key} value={value} />
                ))}
              </dl>
            ) : (
              <p className="rounded-xl border border-dashed border-pink-200 px-4 py-6 text-center text-sm text-slate-500">
                No additional record fields are available.
              </p>
            )}
          </section>

          <section aria-label="System and synchronization information">
            <SectionHeading title="System & synchronization information" detail="Audit metadata" />
            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {recordId ? <DetailCard field="id" label="Record ID" value={recordId} mono /> : null}
              {raw.created_at ? <DetailCard field="created_at" label="Created at" value={raw.created_at} /> : null}
              {owner ? <DetailCard field="created_by" label="Created by BHW" value={owner} /> : null}
              {raw.updated_at ? <DetailCard field="updated_at" label="Updated at" value={raw.updated_at} /> : null}
              <DetailCard field="status" label="Sync status" value={syncKey.replace(/_/g, ' ').toUpperCase()} />
              {raw.created_by_user_id ? (
                <DetailCard field="created_by_user_id" label="Created by user ID" value={raw.created_by_user_id} mono />
              ) : null}
              {raw.sync_error ? <DetailCard field="sync_error" label="Sync details" value={raw.sync_error} /> : null}
            </dl>
          </section>

          <section aria-label="Visit documentation photos">
            <SectionHeading title="Visit documentation photo" detail="Captured on site" />
            {details.photos.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {details.photos.map((photo) => {
                  const format = (photo.src.match(/^data:image\/([a-z0-9.+-]+);/i)?.[1] ||
                    photo.src.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1] || 'jpeg')
                    .toUpperCase().replace('JPG', 'JPEG');
                  return (
                    <figure key={photo.key} className="rounded-2xl border border-pink-100/70 bg-[#FFFAFC] p-3">
                      <div className="relative overflow-hidden rounded-xl bg-pink-50">
                        <img
                          src={photo.src}
                          alt={photo.label}
                          className="aspect-[4/3] w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setInspectPhoto(photo)}
                          className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-pink-700 shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
                        >
                          <Maximize2 size={13} /> Inspect
                        </button>
                        {stamp ? (
                          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-slate-900/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                            <Camera size={12} /> {stamp}
                          </span>
                        ) : null}
                      </div>
                      <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-slate-500">
                        <span>
                          {photo.label}
                          {owner ? <> · by <strong className="font-bold text-slate-700">BHW {owner}</strong></> : null}
                        </span>
                        <span className="font-medium text-pink-600">{format} • Verified</span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-pink-200 bg-[#FFFAFC] px-4 py-6 text-sm text-slate-500">
                <Image size={22} className="shrink-0 text-pink-300" aria-hidden="true" />
                No documentation photo was attached to this record.
              </div>
            )}
          </section>
        </div>
      </section>

      <PhotoLightbox
        inspectPhoto={inspectPhoto}
        onClose={() => setInspectPhoto(null)}
        personName={personName}
        purok={purok}
        stamp={stamp}
      />
    </div>,
    document.body
  );
}

/**
 * Public component. Props:
 *  - record, onClose            (required, same as before)
 *  - records, onNavigate        (optional) the visible list for the arrows, and a setter
 *                               if the parent owns the open record. Without `records`
 *                               the arrows walk the locally stored records of the category.
 */
export default function RecordDetailsDialog({ record, records, recordCategory, onClose, onNavigate, barangay, compact = false }) {
  const [override, setOverride] = useState(null);

  useEffect(() => {
    setOverride(null);
  }, [record]);

  const current = override || record;
  const category = recordCategory || current?.category || current?.categoryId ||
    (current ? detectCategory(current) : null);
  const list = useMemo(() => {
    if (Array.isArray(records)) return records;
    if (!category) return [];
    try {
      return getRecords(storageKeyForCategory(category)) || [];
    } catch (error) {
      console.error('Could not load sibling records for navigation:', error);
      return [];
    }
  }, [records, category]);

  const nav = useMemo(() => {
    if (!current || list.length < 2) return null;
    const index = list.findIndex((item) => String((item?._raw || item)?.id) === String(current.id));
    if (index < 0) return null;
    const go = (item) => {
      const next = item?._raw || item;
      if (onNavigate) onNavigate(next);
      else setOverride(next);
    };
    return {
      index,
      total: list.length,
      prev: index > 0 ? () => go(list[index - 1]) : null,
      next: index < list.length - 1 ? () => go(list[index + 1]) : null,
    };
  }, [current, list, onNavigate]);

  if (!current) return null;
  return <RecordDetailsDialogInner record={current} recordCategory={category} onClose={onClose} barangay={barangay} nav={nav} compact={compact} />;
}