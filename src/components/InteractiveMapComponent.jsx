import React, { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, TrendingUp, Users, Activity, Droplet } from 'lucide-react';

/**
 * NUTRIGRID - INTERACTIVE HEAT MAP
 * Barangay Alawihao (10 Puroks) - Real Color Coding from Spot Map
 * Admin Dashboard Feature
 */

const InteractiveMapComponent = ({ onPurokSelect, darkMode = false }) => {
  const [selectedPurok, setSelectedPurok] = useState(null);
  const [heatMapMode, setHeatMapMode] = useState('nutritional'); // 'nutritional' or 'wash'
  const panelClass = darkMode ? 'bg-[#26263B] border-[#333348]' : 'bg-white border-gray-200';
  const softPanelClass = darkMode ? 'bg-[#202031]' : 'bg-gray-50';
  const primaryTextClass = darkMode ? 'text-white' : 'text-gray-900';
  const secondaryTextClass = darkMode ? 'text-slate-300' : 'text-gray-600';

  // Color Legend from Barangay Spot Map (2026 Data)
  const COLOR_LEGEND = {
    // Nutritional Status (Children)
    green: '#22c55e',      // 96.90% - Normal weight/length/height
    yellow: '#eab308',     // 1.60% - Underweight/stunted/wasted
    red: '#ef4444',        // 0.3-0.7% - Severely underweight/stunted/wasted
    orange: '#f97316',     // 0.6-0.7% - Overweight/obese
    
    // Maternal/Child Health
    pink: '#ec4899',       // Pregnant women
    violet: '#a855f7',     // Lactating women
    maroon: '#7c2d12',     // Exclusive breastfeeding (0-6mo)
    purple: '#9333ea',     // Complementary + breastmilk (6mo+)
    
    // Household/Environmental
    brown: '#78350f',      // With infants 0-11 months
    blue: '#3b82f6',       // Large family size (>5 members)
    black: '#000000',      // No potable water
    gray: '#6b7280'        // No sanitary toilets
  };

  // Purok locations and health figures are illustrative until verified local data is available.
  const PUROKS = [
    {
      id: 1,
      name: 'Purok 1',
      lat: 14.1097473,
      lng: 122.9302014,
      stats: {
        // Nutritional Status (Children 0-5 years)
        normal: 92,          // GREEN
        underweight: 3,      // YELLOW
        severely_underweight: 1, // RED
        overweight: 1,       // ORANGE
        total_children: 97,
        
        // Maternal Health
        pregnant_women: 12,  // PINK
        lactating_women: 8,  // VIOLET
        
        // Infant Feeding
        exclusive_breastfed: 8,  // MAROON
        complementary_breastfed: 9, // PURPLE
        
        // Household Info
        infants_0_11mo: 15,  // BROWN
        large_families: 125, // BLUE (>5 members)
        
        // Environmental/WASH
        no_potable_water: 0, // BLACK
        no_sanitary_toilets: 0, // GRAY
        
        // Health Indicators
        vitamin_a_supplemented: 65,
        macra_practicing_family_planning: 48,
        children_attending_daycare: 11,
        immunized_children: 23
      }
    },
    {
      id: 2,
      name: 'Purok 2',
      lat: 14.1106473,
      lng: 122.9351014,
      stats: {
        normal: 85,
        underweight: 4,
        severely_underweight: 1,
        overweight: 0,
        total_children: 90,
        pregnant_women: 14,
        lactating_women: 9,
        exclusive_breastfed: 7,
        complementary_breastfed: 8,
        infants_0_11mo: 18,
        large_families: 118,
        no_potable_water: 0,
        no_sanitary_toilets: 1,
        vitamin_a_supplemented: 58,
        macra_practicing_family_planning: 52,
        children_attending_daycare: 9,
        immunized_children: 20
      }
    },
    {
      id: 3,
      name: 'Purok 3',
      lat: 14.1083473,
      lng: 122.9251014,
      stats: {
        normal: 88,
        underweight: 2,
        severely_underweight: 0,
        overweight: 1,
        total_children: 91,
        pregnant_women: 11,
        lactating_women: 7,
        exclusive_breastfed: 9,
        complementary_breastfed: 10,
        infants_0_11mo: 16,
        large_families: 112,
        no_potable_water: 0,
        no_sanitary_toilets: 0,
        vitamin_a_supplemented: 62,
        macra_practicing_family_planning: 45,
        children_attending_daycare: 12,
        immunized_children: 22
      }
    },
    {
      id: 4,
      name: 'Purok 4',
      lat: 14.1128473,
      lng: 122.9311014,
      stats: {
        normal: 95,
        underweight: 1,
        severely_underweight: 0,
        overweight: 0,
        total_children: 96,
        pregnant_women: 10,
        lactating_women: 6,
        exclusive_breastfed: 10,
        complementary_breastfed: 11,
        infants_0_11mo: 14,
        large_families: 108,
        no_potable_water: 0,
        no_sanitary_toilets: 0,
        vitamin_a_supplemented: 68,
        macra_practicing_family_planning: 50,
        children_attending_daycare: 14,
        immunized_children: 25
      }
    },
    {
      id: 5,
      name: 'Purok 5',
      lat: 14.1053473,
      lng: 122.9301014,
      stats: {
        normal: 83,
        underweight: 5,
        severely_underweight: 1,
        overweight: 1,
        total_children: 90,
        pregnant_women: 13,
        lactating_women: 8,
        exclusive_breastfed: 7,
        complementary_breastfed: 8,
        infants_0_11mo: 17,
        large_families: 120,
        no_potable_water: 0,
        no_sanitary_toilets: 2,
        vitamin_a_supplemented: 55,
        macra_practicing_family_planning: 43,
        children_attending_daycare: 8,
        immunized_children: 18
      }
    },
    {
      id: 6,
      name: 'Purok 6',
      lat: 14.1093473,
      lng: 122.9291014,
      stats: {
        normal: 94,
        underweight: 1,
        severely_underweight: 0,
        overweight: 0,
        total_children: 95,
        pregnant_women: 9,
        lactating_women: 7,
        exclusive_breastfed: 11,
        complementary_breastfed: 12,
        infants_0_11mo: 13,
        large_families: 105,
        no_potable_water: 0,
        no_sanitary_toilets: 0,
        vitamin_a_supplemented: 70,
        macra_practicing_family_planning: 55,
        children_attending_daycare: 16,
        immunized_children: 27
      }
    },
    {
      id: 7,
      name: 'Purok 7',
      lat: 14.1118473,
      lng: 122.9371014,
      stats: {
        normal: 86,
        underweight: 3,
        severely_underweight: 1,
        overweight: 0,
        total_children: 90,
        pregnant_women: 11,
        lactating_women: 8,
        exclusive_breastfed: 8,
        complementary_breastfed: 9,
        infants_0_11mo: 15,
        large_families: 115,
        no_potable_water: 0,
        no_sanitary_toilets: 1,
        vitamin_a_supplemented: 60,
        macra_practicing_family_planning: 47,
        children_attending_daycare: 10,
        immunized_children: 21
      }
    },
    {
      id: 8,
      name: 'Purok 8',
      lat: 14.1118473,
      lng: 122.9231014,
      stats: {
        normal: 91,
        underweight: 2,
        severely_underweight: 0,
        overweight: 1,
        total_children: 94,
        pregnant_women: 10,
        lactating_women: 7,
        exclusive_breastfed: 9,
        complementary_breastfed: 10,
        infants_0_11mo: 14,
        large_families: 110,
        no_potable_water: 0,
        no_sanitary_toilets: 0,
        vitamin_a_supplemented: 66,
        macra_practicing_family_planning: 51,
        children_attending_daycare: 13,
        immunized_children: 24
      }
    },
    {
      id: 9,
      name: 'Purok 9',
      lat: 14.1063473,
      lng: 122.9371014,
      stats: {
        normal: 87,
        underweight: 4,
        severely_underweight: 1,
        overweight: 0,
        total_children: 92,
        pregnant_women: 12,
        lactating_women: 8,
        exclusive_breastfed: 7,
        complementary_breastfed: 8,
        infants_0_11mo: 16,
        large_families: 122,
        no_potable_water: 0,
        no_sanitary_toilets: 1,
        vitamin_a_supplemented: 58,
        macra_practicing_family_planning: 46,
        children_attending_daycare: 9,
        immunized_children: 19
      }
    },
    {
      id: 10,
      name: 'Purok 10',
      lat: 14.1063473,
      lng: 122.9231014,
      stats: {
        normal: 89,
        underweight: 3,
        severely_underweight: 0,
        overweight: 1,
        total_children: 93,
        pregnant_women: 11,
        lactating_women: 8,
        exclusive_breastfed: 8,
        complementary_breastfed: 9,
        infants_0_11mo: 15,
        large_families: 116,
        no_potable_water: 0,
        no_sanitary_toilets: 0,
        vitamin_a_supplemented: 64,
        macra_practicing_family_planning: 49,
        children_attending_daycare: 11,
        immunized_children: 23
      }
    }
  ];

  // Calculate health status color for each purok
  const getPurokColor = (stats) => {
    const total = stats.total_children;
    if (total === 0) return COLOR_LEGEND.gray;
    
    const normalPercent = (stats.normal / total) * 100;
    
    // Color coding based on nutritional status percentage
    if (normalPercent >= 95) return COLOR_LEGEND.green;      // ≥95% normal
    if (normalPercent >= 85) return COLOR_LEGEND.yellow;     // 85-94% normal
    if (normalPercent >= 70) return COLOR_LEGEND.orange;     // 70-84% normal
    return COLOR_LEGEND.red;                                  // <70% normal (critical)
  };

  // Calculate health status level
  const getHealthStatus = (stats) => {
    const total = stats.total_children;
    if (total === 0) return 'Unknown';
    
    const normalPercent = (stats.normal / total) * 100;
    
    if (normalPercent >= 95) return '✅ Excellent';
    if (normalPercent >= 85) return '⚠️ At Risk';
    if (normalPercent >= 70) return '🔴 Critical';
    return '🚨 Severe';
  };

  return (
    <div className="space-y-6">
      {/* Map Title */}
      <div className={`rounded-lg p-6 border ${darkMode ? 'bg-gradient-to-r from-slate-900 via-[#252242] to-[#351b4b] border-slate-700' : 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className={`text-2xl font-bold ${primaryTextClass}`}>Barangay Alawihao, Daet, Camarines Norte</h2>
            <p className={`${secondaryTextClass} mt-1`}>Interactive map with all 10 puroks</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHeatMapMode('nutritional')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                heatMapMode === 'nutritional'
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Nutritional Status
            </button>
            <button
              onClick={() => setHeatMapMode('wash')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                heatMapMode === 'wash'
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              WASH Status
            </button>
          </div>
        </div>
        <dl className={`grid grid-cols-3 gap-3 border-t pt-4 ${darkMode ? 'border-slate-700' : 'border-blue-200'}`} aria-label="Barangay population and household totals">
          <div>
            <dd className={`text-xl font-bold ${primaryTextClass}`}>13,302</dd>
            <dt className={`text-xs ${secondaryTextClass}`}>Population</dt>
          </div>
          <div>
            <dd className={`text-xl font-bold ${primaryTextClass}`}>3,099</dd>
            <dt className={`text-xs ${secondaryTextClass}`}>Households</dt>
          </div>
          <div>
            <dd className={`text-xl font-bold ${primaryTextClass}`}>3,639</dd>
            <dt className={`text-xs ${secondaryTextClass}`}>Families</dt>
          </div>
        </dl>
      </div>

      {/* Map Container */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        
        {/* Left: Map */}
        <div>
          <div className={`relative z-0 isolate overflow-hidden rounded-lg shadow-lg border ${panelClass}`}>
            <MapContainer
              center={[14.1093473, 122.9291014]}
              zoom={15}
              style={{ height: '500px', width: '100%' }}
              className="rounded-lg"
            >
              {/* Base Map Layer */}
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              {/* Purok Markers */}
              {PUROKS.map((purok) => {
                const markerColor = getPurokColor(purok.stats);
                const radius = 14;

                return (
                  <CircleMarker
                    key={purok.id}
                    center={[purok.lat, purok.lng]}
                    radius={radius}
                    fillColor={markerColor}
                    color={markerColor}
                    weight={3}
                    opacity={0.9}
                    fillOpacity={0.8}
                    eventHandlers={{
                      click: () => {
                        setSelectedPurok(purok);
                        onPurokSelect?.(purok);
                      }
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -8]} permanent className={darkMode ? 'leaflet-tooltip-dark' : ''}>
                      {purok.name}
                    </Tooltip>
                    <Popup className={darkMode ? 'leaflet-popup-dark' : ''}>
                      <div className={`font-semibold ${primaryTextClass}`}>
                        {purok.name}
                      </div>
                      <div className={`text-sm ${secondaryTextClass} mt-2`}>
                        Children: {purok.stats.total_children}
                      </div>
                      <div className={`text-sm ${secondaryTextClass}`}>
                        Normal nutritional status: {purok.stats.normal} ({((purok.stats.normal / purok.stats.total_children) * 100).toFixed(1)}%)
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>

          <p className={`mt-2 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Purok positions are approximate; health figures shown here are sample data and should be replaced with verified barangay records.
          </p>

          {/* Color Legend */}
          <div className={`mt-4 rounded-lg p-4 border ${panelClass}`}>
            <h3 className={`font-bold ${primaryTextClass} mb-1`}>Color legend</h3>
            <p className={`text-xs ${secondaryTextClass} mb-3`}>Share of children with normal nutritional status</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_LEGEND.green }}></div>
                <span className={`text-sm ${secondaryTextClass}`}>≥95%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_LEGEND.yellow }}></div>
                <span className={`text-sm ${secondaryTextClass}`}>85-94%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_LEGEND.orange }}></div>
                <span className={`text-sm ${secondaryTextClass}`}>70-84%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_LEGEND.red }}></div>
                <span className={`text-sm ${secondaryTextClass}`}>&lt;70%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Selected Purok Details */}
        <div>
          {selectedPurok ? (
            <div className={`rounded-lg shadow-lg border p-6 space-y-6 max-h-[600px] overflow-y-auto ${panelClass}`}>
              
              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: getPurokColor(selectedPurok.stats) }}
                  ></div>
                  <h3 className={`text-lg font-bold ${primaryTextClass}`}>
                    {selectedPurok.name}
                  </h3>
                </div>
                <p className="text-sm font-semibold" style={{ color: getPurokColor(selectedPurok.stats) }}>
                  {getHealthStatus(selectedPurok.stats)}
                </p>
              </div>

              {/* Nutritional Status */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-bold text-gray-900">
                  <Activity size={18} className="text-blue-600" />
                  Nutritional Status
                </div>
                <div className={`rounded-lg p-3 space-y-2 ${softPanelClass}`}>
                  <div className="flex justify-between text-sm">
                    <span className={secondaryTextClass}>Normal nutritional status</span>
                    <span className="font-semibold text-green-600">
                      {selectedPurok.stats.normal} ({((selectedPurok.stats.normal / selectedPurok.stats.total_children) * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={secondaryTextClass}>Underweight</span>
                    <span className="font-semibold text-yellow-600">{selectedPurok.stats.underweight}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={secondaryTextClass}>Severely Underweight</span>
                    <span className="font-semibold text-red-600">{selectedPurok.stats.severely_underweight}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={secondaryTextClass}>Overweight/Obese</span>
                    <span className="font-semibold text-orange-600">{selectedPurok.stats.overweight}</span>
                  </div>
                </div>
              </div>

              {/* Maternal & Child Health */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-bold text-gray-900">
                  <Users size={18} className="text-pink-600" />
                  Maternal & Infant Health
                </div>
                <div className={`rounded-lg p-3 space-y-2 text-sm ${softPanelClass} ${!darkMode && 'bg-pink-50'}`}>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>Pregnant Women</span>
                    <span className="font-semibold">{selectedPurok.stats.pregnant_women}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>Lactating Women</span>
                    <span className="font-semibold">{selectedPurok.stats.lactating_women}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>Exclusive Breastfed</span>
                    <span className="font-semibold">{selectedPurok.stats.exclusive_breastfed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>Complementary Fed</span>
                    <span className="font-semibold">{selectedPurok.stats.complementary_breastfed}</span>
                  </div>
                </div>
              </div>

              {/* WASH Status */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-bold text-gray-900">
                  <Droplet size={18} className="text-blue-600" />
                  WASH Status
                </div>
                <div className={`rounded-lg p-3 space-y-2 text-sm ${softPanelClass} ${!darkMode && 'bg-blue-50'}`}>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>No Potable Water</span>
                    <span className="font-semibold text-red-600">
                      {selectedPurok.stats.no_potable_water}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>No Sanitary Toilets</span>
                    <span className="font-semibold text-orange-600">
                      {selectedPurok.stats.no_sanitary_toilets}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={secondaryTextClass}>Large Families (&gt;5)</span>
                    <span className="font-semibold text-blue-600">
                      {selectedPurok.stats.large_families}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className={`pt-4 border-t space-y-2 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                <button className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition">
                  📊 View Records
                </button>
                <button className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition">
                  ➕ Assign Task
                </button>
              </div>
            </div>
          ) : (
            <div className={`rounded-lg border-2 border-dashed p-6 text-center flex flex-col items-center justify-center h-full ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-300'}`}>
              <AlertCircle size={32} className="text-gray-400 mb-3" />
              <p className={`${secondaryTextClass} font-semibold`}>Click a purok on the map</p>
              <p className={`${darkMode ? 'text-slate-400' : 'text-gray-500'} text-sm mt-1`}>to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className={`rounded-lg p-6 border ${darkMode ? 'bg-gradient-to-r from-slate-900 to-[#202b3c] border-slate-700' : 'bg-gradient-to-r from-green-50 to-blue-50 border-green-200'}`}>
        <h3 className={`font-bold ${primaryTextClass} mb-4`}>Barangay Summary (2026)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`rounded-lg p-4 border ${darkMode ? 'bg-[#26263B] border-slate-700' : 'bg-white border-green-200'}`}>
            <div className={`text-sm ${secondaryTextClass}`}>Total Children</div>
            <div className="text-2xl font-bold text-green-600">
              {PUROKS.reduce((sum, p) => sum + p.stats.total_children, 0)}
            </div>
          </div>
          <div className={`rounded-lg p-4 border ${darkMode ? 'bg-[#26263B] border-slate-700' : 'bg-white border-green-200'}`}>
            <div className={`text-sm ${secondaryTextClass}`}>Children with normal nutritional status</div>
            <div className="text-2xl font-bold text-green-600">
              {PUROKS.reduce((sum, p) => sum + p.stats.normal, 0)}
            </div>
          </div>
          <div className={`rounded-lg p-4 border ${darkMode ? 'bg-[#26263B] border-slate-700' : 'bg-white border-yellow-200'}`}>
            <div className={`text-sm ${secondaryTextClass}`}>At-Risk Children</div>
            <div className="text-2xl font-bold text-yellow-600">
              {PUROKS.reduce((sum, p) => sum + p.stats.underweight + p.stats.overweight, 0)}
            </div>
          </div>
          <div className={`rounded-lg p-4 border ${darkMode ? 'bg-[#26263B] border-slate-700' : 'bg-white border-red-200'}`}>
            <div className={`text-sm ${secondaryTextClass}`}>Critically Malnourished</div>
            <div className="text-2xl font-bold text-red-600">
              {PUROKS.reduce((sum, p) => sum + p.stats.severely_underweight, 0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractiveMapComponent;