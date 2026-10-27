import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, ZoomControl, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle } from 'lucide-react';
import { calculateWhoGrowthStatuses } from '../utils/childGrowth';
import { normalizePurokName, PUROK_OPTIONS } from '../utils/purok';

const COLORS = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  orange: '#f97316',
  pink: '#ec4899',
  violet: '#a855f7',
  maroon: '#7c2d12',
  purple: '#9333ea',
  brown: '#78350f',
  blue: '#3b82f6',
  black: '#000000',
  gray: '#6b7280',
};

const ALAWIHAO_CENTERS = [
  [14.1093473, 122.9291014],
  [14.1102473, 122.9297514],
  [14.1102473, 122.9284514],
  [14.1093473, 122.9304014],
  [14.1093473, 122.9278014],
  [14.1084473, 122.9297514],
  [14.1084473, 122.9284514],
  [14.1108973, 122.9304014],
  [14.1108973, 122.9278014],
  [14.1077973, 122.9291014],
];

const LANDMARKS = [
  {
    name: 'Alawihao Elementary School',
    position: [14.1096995, 122.9303074],
  },
];

const COLOR_CATEGORIES = [
  { key: 'green', label: 'Normal weight / length / height' },
  { key: 'yellow', label: 'Underweight / stunted / wasted' },
  { key: 'red', label: 'Severely underweight / stunted / wasted' },
  { key: 'orange', label: 'Overweight / obese' },
  { key: 'pink', label: 'Pregnant women' },
  { key: 'violet', label: 'Lactating women' },
  { key: 'maroon', label: 'Exclusive breastfeeding' },
  { key: 'purple', label: 'Complementary feeding' },
  { key: 'brown', label: 'Infants 0–11 months' },
  { key: 'blue', label: 'Households with more than 5 members' },
  { key: 'black', label: 'No potable water source' },
  { key: 'gray', label: 'No sanitary toilet' },
];

const unwrap = (record) => record?._raw || record || {};

function toBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function hasRecordedStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return status !== '' && !['—', '-', 'n/a', 'na'].includes(status);
}

function normalizeGrowthStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  const abbreviations = {
    n: 'normal',
    uw: 'underweight',
    st: 'stunted',
    w: 'wasted',
    suw: 'severely underweight',
    sst: 'severely stunted',
    sw: 'severely wasted',
    ow: 'overweight',
    ob: 'obese',
  };
  return abbreviations[status] || status;
}

function numericCount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function getChildKey(record, index) {
  const raw = unwrap(record);
  const birthDate = raw.dob || '';
  const childName = raw.child_name || raw.name_of_child || '';
  const childKey = birthDate && childName
    ? `${birthDate}:${childName.toLowerCase()}`
    : String(record.id ?? `${raw.dow || ''}:${index}`);
  return `${normalizePurokName(raw.purok) || ''}:${childKey}`;
}

function getNutritionClassification(record) {
  const raw = unwrap(record);
  const sex = String(raw.sex || '').trim().toLowerCase();
  const calculated = calculateWhoGrowthStatuses({
    sex: sex === 'male' ? 'boys' : sex === 'female' ? 'girls' : sex,
    birthday: raw.dob,
    weighingDate: raw.dow,
    weightKg: raw.weight_kg ?? raw.wt_kg,
    lengthCm: raw.length_cm,
    heightCm: raw.height_cm ?? raw.ht_cm,
  });
  const storedStatuses = [raw.w_a, raw.h_a, raw.w_l_h];
  const calculatedStatuses = [calculated.w_a, calculated.h_a, calculated.w_l_h];
  const statuses = storedStatuses.map((status, index) =>
    hasRecordedStatus(status) ? status : calculatedStatuses[index]
  ).map(normalizeGrowthStatus)
    .map((status) => ['—', '-', 'n/a', 'na'].includes(status) ? '' : status);
  const recordedStatuses = statuses.filter(Boolean);
  if (!recordedStatuses.length) return null;

  const severelyUnderweight = statuses.includes('severely underweight');
  const underweight = statuses.includes('underweight');
  const severelyStunted = statuses.includes('severely stunted');
  const stunted = statuses.includes('stunted');
  const severelyWasted = statuses.includes('severely wasted');
  const wasted = statuses.includes('wasted');
  const overweight = statuses.includes('overweight');
  const obese = statuses.includes('obese');
  const critical =
    severelyUnderweight || severelyStunted || severelyWasted;
  const atRisk =
    underweight ||
    stunted ||
    wasted ||
    overweight ||
    obese ||
    statuses.includes('high weight-for-age') ||
    statuses.includes('at risk of overweight');

  return {
    statuses,
    normal: recordedStatuses.every((status) => status === 'normal'),
    critical,
    atRisk: !critical && atRisk,
    underweight,
    severelyUnderweight,
    stunted,
    severelyStunted,
    wasted,
    severelyWasted,
    overweight,
    obese,
  };
}

function makePurokStats(name, datasets) {
  const recordsForPurok = (records) =>
    records.filter((record) => normalizePurokName(record.purok) === name);
  const residents = recordsForPurok(datasets.households);
  const children = recordsForPurok(datasets.natality);
  const pregnant = recordsForPurok(datasets.pregnant);
  const lactating = recordsForPurok(datasets.lactating);
  const feeding = recordsForPurok(datasets.feeding);
  const wash = recordsForPurok(datasets.environmental);
  const latestWashRecord = wash.reduce((latest, record) => {
    const raw = unwrap(record);
    const latestRaw = latest ? unwrap(latest) : null;
    return !latest || String(raw.visit_date || raw.created_at || '') >
      String(latestRaw.visit_date || latestRaw.created_at || '')
      ? record
      : latest;
  }, null);

  const latestChildRecords = new Map();
  children.forEach((record, index) => {
    const raw = unwrap(record);
    const key = getChildKey(record, index);
    const current = latestChildRecords.get(key);
    const visitDate = raw.dow || '';
    if (!current || visitDate > current.visitDate) {
      latestChildRecords.set(key, { record, raw, visitDate });
    }
  });

  const stats = {
    children: latestChildRecords.size,
    classifiedChildren: 0,
    normal: 0,
    normalRate: null,
    atRisk: 0,
    criticallyMalnourished: 0,
    underweight: 0,
    severelyUnderweight: 0,
    stunted: 0,
    severelyStunted: 0,
    wasted: 0,
    severelyWasted: 0,
    overweight: 0,
    obese: 0,
    pregnant: pregnant.length,
    lactating: lactating.length,
    exclusiveBreastfeeding: 0,
    complementaryFeeding: 0,
    infants: feeding.length,
    largeFamilies: 0,
    noPotableWater: 0,
    noSanitaryToilets: 0,
    washRecords: wash.length,
    households: residents.length,
    population: 0,
    families: numericCount(
      latestWashRecord
        ? unwrap(latestWashRecord).total_families ?? latestWashRecord.totalFamilies
        : null
    ) ?? 0,
    categoryCounts: {
      green: 0,
      yellow: 0,
      red: 0,
      orange: 0,
      pink: pregnant.length,
      violet: lactating.length,
      maroon: 0,
      purple: 0,
      brown: feeding.length,
      blue: 0,
    },
  };

  latestChildRecords.forEach(({ record, raw }) => {
    const classification = getNutritionClassification(record);
    if (!classification) return;
    stats.classifiedChildren += 1;
    if (classification.critical) stats.categoryCounts.red += 1;
    else if (classification.overweight || classification.obese) stats.categoryCounts.orange += 1;
    else if (classification.atRisk) stats.categoryCounts.yellow += 1;
    else if (classification.normal) stats.categoryCounts.green += 1;
    if (classification.normal) stats.normal += 1;
    if (classification.critical) stats.criticallyMalnourished += 1;
    else if (classification.atRisk) stats.atRisk += 1;
    if (classification.underweight) stats.underweight += 1;
    if (classification.severelyUnderweight) stats.severelyUnderweight += 1;
    if (classification.stunted) stats.stunted += 1;
    if (classification.severelyStunted) stats.severelyStunted += 1;
    if (classification.wasted) stats.wasted += 1;
    if (classification.severelyWasted) stats.severelyWasted += 1;
    if (classification.overweight) stats.overweight += 1;
    if (classification.obese) stats.obese += 1;
  });
  if (stats.classifiedChildren > 0) {
    stats.normalRate = (stats.normal / stats.classifiedChildren) * 100;
  }

  feeding.forEach((record) => {
    const raw = unwrap(record);
    const values = [
      raw.feeding_1_week,
      raw.feeding_1_month,
      raw.feeding_2_month,
      raw.feeding_3_month,
      raw.feeding_4_month,
      raw.feeding_5_month,
      record.week1,
      record.month1,
      record.month2,
      record.month3,
      record.month4,
      record.month5,
    ].map((value) => String(value || '').trim().toLowerCase());
    if (values.some((value) => ['e', 'ebf'].includes(value) || value.includes('exclusive'))) {
      stats.exclusiveBreastfeeding += 1;
      stats.categoryCounts.maroon += 1;
    }
    if (
      values.some((value) =>
        ['m', 'mixed'].includes(value) || value.includes('complementary')
      )
    ) {
      stats.complementaryFeeding += 1;
      stats.categoryCounts.purple += 1;
    }
  });

  wash.forEach((record) => {
    const raw = unwrap(record);
    if (toBoolean(raw.toilet_not_sanitary) === true) stats.noSanitaryToilets += 1;
    if (toBoolean(raw.without_potable_water) === true) stats.noPotableWater += 1;
  });

  residents.forEach((record) => {
    const raw = unwrap(record);
    const members = numericCount(raw.total_members ?? record.members);
    if (members !== null) {
      stats.population += members;
      if (members > 5) {
        stats.largeFamilies += 1;
        stats.categoryCounts.blue += 1;
      }
    }
  });

  const reportedHouseholds = numericCount(
    latestWashRecord
      ? unwrap(latestWashRecord).total_hh ?? latestWashRecord.totalHH
      : null
  );
  if (reportedHouseholds !== null) stats.households = reportedHouseholds;

  stats.categoryMarkers = COLOR_CATEGORIES
    .filter(({ key }) => (stats.categoryCounts[key] || 0) > 0)
    .map(({ key, label }) => ({
      key,
      label,
      color: COLORS[key],
      count: stats.categoryCounts[key],
    }));

  return stats;
}

function createPurokSummaryIcon(markers, size) {
  const total = markers.reduce((sum, marker) => sum + marker.count, 0);
  let startAngle = 0;
  const slices = markers.map((marker) => {
    const endAngle = startAngle + (marker.count / total) * 360;
    const slice = `${marker.color} ${startAngle}deg ${endAngle}deg`;
    startAngle = endAngle;
    return slice;
  });
  const badgeSize = 20;
  const radius = size * 0.9;
  const canvasSize = Math.ceil(size + radius * 2 + badgeSize);
  const center = canvasSize / 2;
  const iconForCategory = (key) => {
    if (key === 'pink') {
      return '<circle cx="8" cy="3" r="2" fill="#fff"/><path d="M7 6h2.5a3 3 0 0 1 3 3v1.5a2.5 2.5 0 0 1-2.5 2.5H9v2H6.5v-4h3V9H7V6Z" fill="#fff"/><path d="M9.5 9.5a2.5 2.5 0 0 1 2.5 2.5" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>';
    }
    if (key === 'violet' || key === 'maroon') {
      return '<circle cx="6" cy="3" r="2" fill="#fff"/><circle cx="10.5" cy="9.5" r="1.7" fill="#fff"/><path d="M3 14v-2a3 3 0 0 1 3-3h1l2 2-1.5 1.5L9 15H6l-1.5-2V15H3Z" fill="#fff"/><path d="M7 8.5c1.8-1 4.5-.2 5 1.8" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>';
    }
    if (key === 'brown' || key === 'purple') {
      return '<circle cx="8" cy="5" r="3" fill="#fff"/><path d="M3.5 14a4.5 4.5 0 0 1 9 0v1h-9v-1Z" fill="#fff"/><circle cx="5" cy="5" r=".6" fill="' + COLORS.brown + '"/><circle cx="11" cy="5" r=".6" fill="' + COLORS.brown + '"/>';
    }
    if (key === 'blue') {
      return '<circle cx="5" cy="5" r="2" fill="#fff"/><circle cx="11" cy="5" r="2" fill="#fff"/><circle cx="8" cy="3.5" r="2" fill="#fff"/><path d="M1.5 14a3.5 3.5 0 0 1 7 0v1h-7v-1Zm6 1v-1a3.5 3.5 0 0 1 7 0v1h-7Z" fill="#fff"/>';
    }
    if (key === 'black') {
      return '<path d="M8 1.5S3.5 7 3.5 10.2a4.5 4.5 0 0 0 9 0C12.5 7 8 1.5 8 1.5Z" fill="#fff"/><path d="M6 10.5a2.2 2.2 0 0 0 2.2 2.2" fill="none" stroke="' + COLORS.black + '" stroke-width="1.2" stroke-linecap="round"/>';
    }
    if (key === 'gray') {
      return '<path d="M4 2h7v4H4zM5 6v2h5V6m-5 2v3a3 3 0 0 0 6 0V8" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return '<circle cx="8" cy="3.7" r="2.2" fill="#fff"/><path d="M4.2 14.3v-2.1c0-2 1.6-3.6 3.8-3.6s3.8 1.6 3.8 3.6v2.1H9.9v-2.1c0-1-.7-1.8-1.9-1.8s-1.9.8-1.9 1.8v2.1z" fill="#fff"/>';
  };
  const badges = markers.map((marker, index) => {
    const angle = (-90 + (360 * index) / markers.length) * (Math.PI / 180);
    const left = center + Math.cos(angle) * radius - badgeSize / 2;
    const top = center + Math.sin(angle) * radius - badgeSize / 2;
    return `<span title="${marker.label}: ${marker.count}" style="position:absolute;left:${left}px;top:${top}px;display:grid;place-items:center;width:${badgeSize}px;height:${badgeSize}px;border:1px solid #fff;border-radius:50%;background:${marker.color};box-shadow:0 1px 3px rgba(15,23,42,.35)">
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">${iconForCategory(marker.key)}</svg>
    </span>`;
  }).join('');
  return divIcon({
    className: 'nutrigrid-map-summary',
    html: `<div aria-hidden="true" style="position:relative;width:${canvasSize}px;height:${canvasSize}px">
      <div style="position:absolute;left:${center - size / 2}px;top:${center - size / 2}px;width:${size}px;height:${size}px;border:2px solid #fff;border-radius:50%;background:conic-gradient(${slices.join(',')});box-shadow:0 2px 5px rgba(15,23,42,.45)"></div>
      ${badges}
    </div>`,
    iconSize: [canvasSize, canvasSize],
    iconAnchor: [center, center],
    popupAnchor: [0, -center],
    tooltipAnchor: [0, -center],
  });
}

function createLandmarkIcon() {
  return divIcon({
    className: 'nutrigrid-map-landmark',
    html: '<div style="display:flex;align-items:center;gap:5px;width:max-content;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:5px 8px;color:#1e293b;font:600 12px/1.2 system-ui;box-shadow:0 2px 5px rgba(15,23,42,.25)"><span aria-hidden="true">🏫</span><span>Alawihao Elementary School</span></div>',
    iconSize: [230, 30],
    iconAnchor: [115, 15],
    popupAnchor: [0, -15],
  });
}

function MapZoomTracker({ onZoomChange }) {
  useMapEvents({
    zoomend(event) {
      onZoomChange(event.target.getZoom());
    },
  });
  return null;
}

const InteractiveMapComponent = ({
  darkMode = false,
  households = [],
  pregnantWomenData = [],
  lactatingWomenData = [],
  infantFeedingData = [],
  environmentalSanitationData = [],
  natalityData = [],
  dataStatus = 'loading',
}) => {
  const [mapMode, setMapMode] = useState('nutritional');
  const [mapZoom, setMapZoom] = useState(15);
  const panelClass = darkMode ? 'bg-[#26263B] border-[#333348]' : 'bg-white border-gray-200';
  const primaryTextClass = darkMode ? 'text-white' : 'text-gray-900';
  const secondaryTextClass = darkMode ? 'text-slate-300' : 'text-gray-600';

  const datasets = useMemo(() => ({
    households,
    pregnant: pregnantWomenData,
    lactating: lactatingWomenData,
    feeding: infantFeedingData,
    environmental: environmentalSanitationData,
    natality: natalityData,
  }), [
    households,
    pregnantWomenData,
    lactatingWomenData,
    infantFeedingData,
    environmentalSanitationData,
    natalityData,
  ]);

  const puroks = useMemo(
    () =>
      PUROK_OPTIONS.map((name, index) => {
        const stats = makePurokStats(name, datasets);
        const [lat, lng] = ALAWIHAO_CENTERS[index];
        return {
          id: index + 1,
          name,
          lat,
          lng,
          stats,
        };
      }),
    [datasets]
  );
  const totals = puroks.reduce(
    (sum, purok) => ({
      households: sum.households + purok.stats.households,
      population: sum.population + purok.stats.population,
      families: sum.families + purok.stats.families,
      children: sum.children + purok.stats.children,
      normal: sum.normal + purok.stats.normal,
      atRisk: sum.atRisk + purok.stats.atRisk,
      criticallyMalnourished: sum.criticallyMalnourished + purok.stats.criticallyMalnourished,
    }),
    { households: 0, population: 0, families: 0, children: 0, normal: 0, atRisk: 0, criticallyMalnourished: 0 }
  );
  const washTotals = puroks.reduce(
    (summary, { stats }) => ({
      records: summary.records + stats.washRecords,
      households: summary.households + stats.households,
      noPotableWater: summary.noPotableWater + stats.noPotableWater,
      noSanitaryToilets: summary.noSanitaryToilets + stats.noSanitaryToilets,
    }),
    { records: 0, households: 0, noPotableWater: 0, noSanitaryToilets: 0 }
  );
  const markerSize = Math.min(46, Math.max(34, 34 + (mapZoom - 15) * 3));

  return (
    <div className="space-y-6">
      <style>{`
        .nutrigrid-map-summary, .nutrigrid-map-landmark { background: transparent; border: 0; }
        .nutrigrid-purok-popup .leaflet-popup-content-wrapper {
          border-radius: 16px;
          padding: 8px 12px;
          background: #fff;
          color: #1f2937;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
        }
        .nutrigrid-purok-popup .leaflet-popup-content {
          margin: 8px 10px;
          line-height: 1.5;
          font-size: 14px;
        }
      `}</style>
      <div className={`rounded-lg border p-6 ${darkMode ? 'border-slate-700 bg-gradient-to-r from-slate-900 via-[#252242] to-[#351b4b]' : 'border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50'}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className={`text-2xl font-bold ${primaryTextClass}`}>Barangay Alawihao, Daet, Camarines Norte</h2>
            <p className={`${secondaryTextClass} mt-1`}>{dataStatus === 'loaded' ? 'Shared Supabase data loaded' : dataStatus === 'offline' ? 'Showing saved Admin data offline' : 'Loading shared records'}</p>
          </div>
          <div className="flex shrink-0 gap-2" role="group" aria-label="Map view">
            {[
              ['nutritional', 'Nutrition'],
              ['wash', 'WASH'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={mapMode === mode}
                onClick={() => setMapMode(mode)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mapMode === mode
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <dl className={`grid grid-cols-3 gap-3 border-t pt-4 text-center ${darkMode ? 'border-slate-700' : 'border-blue-200'}`}>
          <div><dd className={`text-xl font-bold ${primaryTextClass}`}>13,302</dd><dt className={`text-xs ${secondaryTextClass}`}>Population</dt></div>
          <div><dd className={`text-xl font-bold ${primaryTextClass}`}>3,099</dd><dt className={`text-xs ${secondaryTextClass}`}>Households</dt></div>
          <div><dd className={`text-xl font-bold ${primaryTextClass}`}>3,639</dd><dt className={`text-xs ${secondaryTextClass}`}>Families</dt></div>
        </dl>
      </div>

      <div className="space-y-5">
        <div>
          <div className={`relative z-0 isolate overflow-hidden rounded-lg border shadow-lg ${panelClass}`}>
            <MapContainer
              center={[14.1093473, 122.9291014]}
              zoom={15}
              minZoom={13}
              maxZoom={19}
              scrollWheelZoom
              touchZoom
              doubleClickZoom
              zoomControl={false}
              style={{ height: '500px', width: '100%' }}
              className="rounded-lg"
            >
              <MapZoomTracker onZoomChange={setMapZoom} />
              <ZoomControl position="topright" />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
                maxNativeZoom={19}
                maxZoom={19}
              />
              {mapZoom >= 16 && LANDMARKS.map((landmark) => (
                <Marker
                  key={landmark.name}
                  position={landmark.position}
                  icon={createLandmarkIcon()}
                  zIndexOffset={1000}
                >
                  <Popup>{landmark.name}</Popup>
                </Marker>
              ))}
              {puroks.map((purok) => {
                const washMarkers = [
                  { key: 'black', label: 'Without potable water source', color: COLORS.black, count: purok.stats.noPotableWater },
                  { key: 'gray', label: 'Without sanitary toilet', color: COLORS.gray, count: purok.stats.noSanitaryToilets },
                ].filter((marker) => marker.count > 0);
                const visibleMarkers = mapMode === 'nutritional'
                  ? purok.stats.categoryMarkers
                  : washMarkers;
                if (!visibleMarkers.length) return null;
                return (
                  <Marker
                    key={purok.id}
                    position={[purok.lat, purok.lng]}
                    icon={createPurokSummaryIcon(visibleMarkers, markerSize)}
                  >
                    <Tooltip direction="top" permanent>{purok.name}</Tooltip>
                    <Popup
                      className="nutrigrid-purok-popup"
                      minWidth={Math.round(200 + markerSize)}
                      maxWidth={360}
                    >
                      <div className="text-base font-bold">{purok.name}</div>
                      <div className="mt-2 space-y-1">
                        {visibleMarkers.map((marker) => (
                          <div key={marker.key} className="flex items-center justify-between gap-4 text-sm">
                            <span className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: marker.color }} />
                              {marker.label}
                            </span>
                            <strong>{marker.count}</strong>
                          </div>
                        ))}
                      </div>
                      {mapMode === 'nutritional' && visibleMarkers.some((marker) => marker.key === 'orange' || marker.key === 'yellow') && (
                        <div
                          role="alert"
                          className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm font-bold ${
                            visibleMarkers.some((marker) => marker.key === 'orange')
                              ? 'border-red-300 bg-red-50 text-red-800'
                              : 'border-amber-300 bg-amber-50 text-amber-900'
                          }`}
                        >
                          <AlertTriangle size={20} className="shrink-0" aria-hidden="true" />
                          <span>
                            {visibleMarkers.some((marker) => marker.key === 'orange')
                              ? 'NEED OF FEEDING PROGRAM'
                              : 'NEED OF PARENTS GUIDE'}
                          </span>
                        </div>
                      )}
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
          <p className={`mt-2 text-xs ${secondaryTextClass}`}>
            Use the map zoom buttons or pinch to reveal mapped roads and landmarks. Color-coded people icons show the categories recorded in each purok.
          </p>
          <div className={`mt-4 rounded-lg border p-4 ${panelClass}`}>
            <h3 className={`mb-1 font-bold ${primaryTextClass}`}>Color legend</h3>
            <p className={`mb-4 text-xs ${secondaryTextClass}`}>
              {mapMode === 'nutritional'
                ? 'Share of children with normal nutritional status'
                : 'Environmental records from Supabase: water source and toilet sanitation'}
            </p>
            <div className={`grid grid-cols-2 gap-3 ${mapMode === 'nutritional' ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
              {(mapMode === 'nutritional'
                ? [
                  { color: COLORS.green, label: '≥95%' },
                  { color: COLORS.yellow, label: '85–94%' },
                  { color: COLORS.orange, label: '70–84%' },
                  { color: COLORS.red, label: '<70%' },
                ]
                : [
                  { color: COLORS.black, label: 'Without potable water source' },
                  { color: COLORS.gray, label: 'Without sanitary toilet' },
                ]
              ).map(({ color, label }) => (
                <div className={`flex items-center gap-2 text-sm ${secondaryTextClass}`} key={label}>
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      <section className={`rounded-lg border p-5 sm:p-6 ${darkMode ? 'border-emerald-900/60 bg-gradient-to-r from-emerald-950/40 to-blue-950/40' : 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50'}`}>
        <h3 className={`mb-4 text-center font-bold ${primaryTextClass}`}>
          Barangay Summary (2026) · {mapMode === 'nutritional' ? 'Nutrition' : 'Environmental'}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(mapMode === 'nutritional' ? [
            { label: 'Total Children', value: totals.children, color: COLORS.green, border: 'border-emerald-200' },
            {
              label: 'Children with normal nutritional status',
              value: totals.normal,
              color: COLORS.green,
              border: 'border-emerald-200',
            },
            { label: 'At-Risk Children', value: totals.atRisk, color: COLORS.yellow, border: 'border-amber-200' },
            {
              label: 'Critically Malnourished',
              value: totals.criticallyMalnourished,
              color: COLORS.red,
              border: 'border-red-200',
            },
          ] : [
            { label: 'Environmental records', value: washTotals.records, color: COLORS.blue, border: 'border-blue-200' },
            { label: 'Households reported', value: washTotals.households, color: COLORS.violet, border: 'border-violet-200' },
            { label: 'Without potable water', value: washTotals.noPotableWater, color: COLORS.black, border: 'border-slate-300' },
            { label: 'Without sanitary toilet', value: washTotals.noSanitaryToilets, color: COLORS.gray, border: 'border-gray-300' },
          ]).map(({ label, value, color, border }) => (
            <div key={label} className={`rounded-lg border ${border} p-4 text-center ${darkMode ? 'bg-[#202031]' : 'bg-white'}`}>
              <p className={`text-sm ${secondaryTextClass}`}>{label}</p>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-lg border p-5 ${panelClass}`}>
        <h3 className={`mb-1 font-bold ${primaryTextClass}`}>Spot-map color coding</h3>
        <p className={`mb-3 text-xs ${secondaryTextClass}`}>Category colors follow the barangay spot-map coding shown below.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_CATEGORIES.map(({ key, label }) => (
            <div className="flex items-center gap-2" key={key}>
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: COLORS[key] }} />
              <span className={`text-xs ${secondaryTextClass}`}>{label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default InteractiveMapComponent;
