import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMapEvents } from 'react-leaflet';
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

function getOffsetPosition(lat, lng, index, count, zoom, markerRadius) {
  const angle = (2 * Math.PI * index) / Math.max(count, 1);
  const latitudeRadians = (lat * Math.PI) / 180;
  const metersPerPixel = (156543.03392 * Math.cos(latitudeRadians)) / (2 ** zoom);
  const offsetMeters = markerRadius * 2.4 * metersPerPixel;
  const latitudeOffset = offsetMeters / 111320;
  const longitudeOffset = offsetMeters / (111320 * Math.cos(latitudeRadians));
  return [
    lat + Math.sin(angle) * latitudeOffset,
    lng + Math.cos(angle) * longitudeOffset,
  ];
}

function createPurokPin(color, size) {
  const height = Math.round(size * 1.3);
  return divIcon({
    className: 'nutrigrid-map-pin',
    html: `<svg width="${size}" height="${height}" viewBox="0 0 32 42" aria-hidden="true" style="overflow:visible;filter:drop-shadow(0 2px 3px rgba(15,23,42,.4))">
      <path d="M16 41S3 25.8 3 16A13 13 0 1 1 29 16C29 25.8 16 41 16 41Z" fill="${color}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="16" cy="16" r="5" fill="#fff" stroke="rgba(15,23,42,.18)" stroke-width="1"/>
    </svg>`,
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height + 3],
    tooltipAnchor: [0, -height + 2],
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
  const markerSize = Math.min(46, Math.max(16, 16 + (mapZoom - 12) * 5));

  return (
    <div className="space-y-6">
      <style>{`
        .nutrigrid-map-pin { background: transparent; border: 0; }
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
              style={{ height: '500px', width: '100%' }}
              className="rounded-lg"
            >
              <MapZoomTracker onZoomChange={setMapZoom} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              {puroks.map((purok) => {
                const washMarkers = [
                  { key: 'black', label: 'Without potable water source', color: COLORS.black, count: purok.stats.noPotableWater },
                  { key: 'gray', label: 'Without sanitary toilet', color: COLORS.gray, count: purok.stats.noSanitaryToilets },
                ].filter((marker) => marker.count > 0);
                const visibleMarkers = mapMode === 'nutritional'
                  ? purok.stats.categoryMarkers
                  : washMarkers;
                return (
                  <React.Fragment key={purok.id}>
                    {mapMode === 'nutritional' && visibleMarkers.length === 0 && (
                      <Marker
                        position={[purok.lat, purok.lng]}
                        icon={createPurokPin('#94a3b8', markerSize)}
                      >
                        <Tooltip direction="top" permanent>{purok.name}</Tooltip>
                        <Popup
                          className="nutrigrid-purok-popup"
                          minWidth={Math.round(180 + markerSize * 2)}
                          maxWidth={340}
                        >
                          <div className="text-base font-bold">{purok.name}</div>
                          <div className="mt-1 text-sm">No nutrition records available.</div>
                        </Popup>
                      </Marker>
                    )}
                    {visibleMarkers.map((marker, index) => (
                      <Marker
                        key={`${purok.id}-${marker.key}`}
                        position={getOffsetPosition(
                          purok.lat,
                          purok.lng,
                          index,
                          visibleMarkers.length,
                          mapZoom,
                          markerSize
                        )}
                        icon={createPurokPin(marker.color, markerSize)}
                      >
                        {index === 0 && (
                          <Tooltip direction="top" permanent>{purok.name}</Tooltip>
                        )}
                        <Popup
                          className="nutrigrid-purok-popup"
                          minWidth={Math.round(180 + markerSize * 2)}
                          maxWidth={340}
                        >
                          <div className="text-base font-bold">{purok.name}</div>
                          <div className="mt-1 text-sm">{marker.label}: {marker.count}</div>
                          {mapMode === 'nutritional' && ['orange', 'yellow'].includes(marker.key) && (
                            <div
                              role="alert"
                              className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm font-bold ${
                                marker.key === 'orange'
                                  ? 'border-red-300 bg-red-50 text-red-800'
                                  : 'border-amber-300 bg-amber-50 text-amber-900'
                              }`}
                            >
                              <AlertTriangle size={20} className="shrink-0" aria-hidden="true" />
                              <span>
                                {marker.key === 'orange'
                                  ? 'NEED OF FEEDING PROGRAM'
                                  : 'NEED OF PARENTS GUIDE'}
                              </span>
                            </div>
                          )}
                        </Popup>
                      </Marker>
                    ))}
                  </React.Fragment>
                );
              })}
            </MapContainer>
          </div>
          <p className={`mt-2 text-xs ${secondaryTextClass}`}>
            All ten purok markers are placed within Barangay Alawihao. Markers grow as you zoom in.
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
