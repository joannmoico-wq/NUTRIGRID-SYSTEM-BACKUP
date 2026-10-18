import React, { useState } from 'react';
import { Check, Camera, MapPin, X } from 'lucide-react';

/**
 * CATEGORY-SPECIFIC FORMS FOR NUTRIGRID
 * Each category has its own data collection form
 */

// Environmental Sanitation Form
export const EnvironmentalSanitationForm = ({ onSubmit, onCancel, currentLocation, userName, initialData = null }) => {
  const [formData, setFormData] = useState({
    purok: '',
    total_hh: '',
    total_families: '',
    compost_pit: false,
    garbage_collect: false,
    garbage_others: false,
    water_level_i: false,
    water_level_ii: false,
    water_level_iii: false,
    toilet_sanitary: false,
    toilet_not_sanitary: false,
    selling_iodized_sari: false,
    selling_iodized_grocery: false,
    selling_iodized_bakery: false,
    selling_iodized_carenderia: false,
    selling_fortified_grocery: false,
    selling_fortified_bakery: false,
    selling_fortified_restaurant: false,
    establishments_hospital: false,
    establishments_hotel: false,
    establishments_restaurant: false,
    establishments_carenderia: false,
    establishments_bakery: false,
    establishments_grocery: false,
    establishments_sari: false,
    visit_date: new Date().toISOString().split('T')[0],
    visited_by: userName,
    notes: ''
  });

  const [photoPreview, setPhotoPreview] = useState(initialData?.photo_url || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({ ...prev, ...initialData }));
      setPhotoPreview(initialData.photo_url || null);
    }
  }, [initialData]);

  const handlePhotoCapture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setPhotoPreview(event.target.result);
          setFormData({...formData, photo_url: event.target.result});
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const visitData = {
      ...formData,
      category: 'environmental',
      id: initialData?.id || Date.now(),
      synced: initialData?.synced ?? false,
      created_at: initialData?.created_at || new Date().toISOString(),
      status: initialData?.status || 'pending',
      gps_lat: currentLocation?.lat || initialData?.gps_lat || '',
      gps_lng: currentLocation?.lng || initialData?.gps_lng || ''
    };

    onSubmit(visitData);
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Purok *</label>
          <input
            type="text"
            required
            value={formData.purok}
            onChange={(e) => setFormData({...formData, purok: e.target.value})}
            className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Purok 1"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Total HH *</label>
          <input
            type="number"
            required
            value={formData.total_hh}
            onChange={(e) => setFormData({...formData, total_hh: e.target.value})}
            className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Total Families *</label>
        <input
          type="number"
          required
          value={formData.total_families}
          onChange={(e) => setFormData({...formData, total_families: e.target.value})}
          className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="0"
        />
      </div>

      {/* Garbage Disposal Section */}
      <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3">🗑️ Garbage Disposal</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.compost_pit}
              onChange={(e) => setFormData({...formData, compost_pit: e.target.checked})}
              className="w-5 h-5 text-blue-600 rounded"
            />
            <span className="text-gray-700">Compost Pit</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.garbage_collect}
              onChange={(e) => setFormData({...formData, garbage_collect: e.target.checked})}
              className="w-5 h-5 text-blue-600 rounded"
            />
            <span className="text-gray-700">Collect by Barangay</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.garbage_others}
              onChange={(e) => setFormData({...formData, garbage_others: e.target.checked})}
              className="w-5 h-5 text-blue-600 rounded"
            />
            <span className="text-gray-700">Others</span>
          </label>
        </div>
      </div>

      {/* Water Supply Section */}
      <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
        <h3 className="font-semibold text-green-900 mb-3">💧 Household Water Supply</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.water_level_i}
              onChange={(e) => setFormData({...formData, water_level_i: e.target.checked})}
              className="w-5 h-5 text-green-600 rounded"
            />
            <span className="text-gray-700">Level I (Piped Water)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.water_level_ii}
              onChange={(e) => setFormData({...formData, water_level_ii: e.target.checked})}
              className="w-5 h-5 text-green-600 rounded"
            />
            <span className="text-gray-700">Level II (Dug Well)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.water_level_iii}
              onChange={(e) => setFormData({...formData, water_level_iii: e.target.checked})}
              className="w-5 h-5 text-green-600 rounded"
            />
            <span className="text-gray-700">Level III (Other)</span>
          </label>
        </div>
      </div>

      {/* Toilet Facility Section */}
      <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
        <h3 className="font-semibold text-purple-900 mb-3">🚽 Household Toilet Facility</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.toilet_sanitary}
              onChange={(e) => setFormData({...formData, toilet_sanitary: e.target.checked})}
              className="w-5 h-5 text-purple-600 rounded"
            />
            <span className="text-gray-700">With Sanitary Toilet</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.toilet_not_sanitary}
              onChange={(e) => setFormData({...formData, toilet_not_sanitary: e.target.checked})}
              className="w-5 h-5 text-purple-600 rounded"
            />
            <span className="text-gray-700">Without Sanitary Toilet</span>
          </label>
        </div>
      </div>

      {/* Selling Iodized Salt Section */}
      <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
        <h3 className="font-semibold text-yellow-900 mb-3">🧂 Selling Iodized Salt</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_iodized_sari}
              onChange={(e) => setFormData({...formData, selling_iodized_sari: e.target.checked})}
              className="w-5 h-5 text-yellow-600 rounded"
            />
            <span className="text-gray-700">Sari-Sari Store</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_iodized_grocery}
              onChange={(e) => setFormData({...formData, selling_iodized_grocery: e.target.checked})}
              className="w-5 h-5 text-yellow-600 rounded"
            />
            <span className="text-gray-700">Grocery Stores</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_iodized_bakery}
              onChange={(e) => setFormData({...formData, selling_iodized_bakery: e.target.checked})}
              className="w-5 h-5 text-yellow-600 rounded"
            />
            <span className="text-gray-700">Bakery</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_iodized_carenderia}
              onChange={(e) => setFormData({...formData, selling_iodized_carenderia: e.target.checked})}
              className="w-5 h-5 text-yellow-600 rounded"
            />
            <span className="text-gray-700">Carenderia</span>
          </label>
        </div>
      </div>

      {/* Selling Fortified Foods Section */}
      <div className="bg-orange-50 p-4 rounded-lg border-2 border-orange-200">
        <h3 className="font-semibold text-orange-900 mb-3">🍞 Selling Fortified Foods</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_fortified_grocery}
              onChange={(e) => setFormData({...formData, selling_fortified_grocery: e.target.checked})}
              className="w-5 h-5 text-orange-600 rounded"
            />
            <span className="text-gray-700">Grocery Stores</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_fortified_bakery}
              onChange={(e) => setFormData({...formData, selling_fortified_bakery: e.target.checked})}
              className="w-5 h-5 text-orange-600 rounded"
            />
            <span className="text-gray-700">Bakery</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.selling_fortified_restaurant}
              onChange={(e) => setFormData({...formData, selling_fortified_restaurant: e.target.checked})}
              className="w-5 h-5 text-orange-600 rounded"
            />
            <span className="text-gray-700">Restaurant</span>
          </label>
        </div>
      </div>

      {/* Establishments Using Iodized Salt Section */}
      <div className="bg-pink-50 p-4 rounded-lg border-2 border-pink-200">
        <h3 className="font-semibold text-pink-900 mb-3">🏢 Establishments Using Iodized Salt</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_hospital}
              onChange={(e) => setFormData({...formData, establishments_hospital: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Hospital</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_hotel}
              onChange={(e) => setFormData({...formData, establishments_hotel: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Hotel & Restaurant</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_restaurant}
              onChange={(e) => setFormData({...formData, establishments_restaurant: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Restaurant</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_carenderia}
              onChange={(e) => setFormData({...formData, establishments_carenderia: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Carenderia</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_bakery}
              onChange={(e) => setFormData({...formData, establishments_bakery: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Bakery</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_grocery}
              onChange={(e) => setFormData({...formData, establishments_grocery: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Grocery Store</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.establishments_sari}
              onChange={(e) => setFormData({...formData, establishments_sari: e.target.checked})}
              className="w-5 h-5 text-pink-600 rounded"
            />
            <span className="text-gray-700">Sari-Sari Store</span>
          </label>
        </div>
      </div>

      {/* Photo */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Photo</label>
        {photoPreview && (
          <div className="relative mb-4 rounded-lg overflow-hidden">
            <img src={photoPreview} alt="Preview" className="w-full h-32 object-cover rounded-lg border-2 border-green-500" />
            <button
              type="button"
              onClick={() => {setPhotoPreview(null); setFormData({...formData, photo_url: null});}}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full"
            >
              ×
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={handlePhotoCapture}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-dashed border-blue-400 rounded-lg hover:bg-blue-50"
        >
          <Camera size={20} className="text-blue-600" />
          <span className="font-semibold text-blue-600">Capture Photo</span>
        </button>
      </div>

      {/* GPS */}
      {currentLocation && (
        <div className="bg-green-50 p-3 rounded-lg border-2 border-green-300">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-green-600" />
            <span className="text-sm font-semibold text-green-700">GPS Location Tagged</span>
          </div>
          <p className="text-xs text-green-600 font-mono">📍 {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Additional Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          rows="3"
          placeholder="Any observations..."
        />
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg font-bold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              Saving...
            </>
          ) : (
            <>
              <Check size={20} />
              Save Environmental Data
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// Simple Residents Form (columns: Purok, Head, Members, Status, Last Visit)
export const ResidentsForm = ({ onSubmit, onCancel, currentLocation, userName, initialData = null }) => {
  const buildDefaults = () => ({
    purok: '',
    household_head: '',
    total_members: '',
    visit_date: new Date().toISOString().split('T')[0],
    visited_by: userName,
    notes: '',
    photo_url: null,
  });

  const [formData, setFormData] = useState(() =>
    initialData ? { ...buildDefaults(), ...initialData } : buildDefaults()
  );
  const [photoPreview, setPhotoPreview] = useState(initialData?.photo_url || null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoCapture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoPreview(event.target.result);
        setFormData((prev) => ({ ...prev, photo_url: event.target.result }));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    onSubmit({
      ...formData,
      category: 'residents',
      id: initialData?.id || Date.now(),
      synced: initialData?.synced ?? false,
      created_at: initialData?.created_at || new Date().toISOString(),
      status: initialData?.status || 'pending',
      gps_lat: currentLocation?.lat || initialData?.gps_lat || '',
      gps_lng: currentLocation?.lng || initialData?.gps_lng || '',
    });
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Purok *</label>
        <input
          type="text"
          required
          value={formData.purok}
          onChange={(e) => setFormData({ ...formData, purok: e.target.value })}
          className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg"
          placeholder="Purok 1"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Head (Household Head) *</label>
        <input
          type="text"
          required
          value={formData.household_head}
          onChange={(e) => setFormData({ ...formData, household_head: e.target.value })}
          className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg"
          placeholder="Juan Dela Cruz"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Members *</label>
          <input
            type="number"
            required
            min="1"
            value={formData.total_members}
            onChange={(e) => setFormData({ ...formData, total_members: e.target.value })}
            className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg"
            placeholder="5"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Last Visit *</label>
          <input
            type="date"
            required
            value={formData.visit_date}
            onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })}
            className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
        Status is set automatically as <span className="font-semibold">Pending</span> until the record is synced.
      </p>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Household Photo (optional)</label>
        {photoPreview && (
          <div className="relative mb-3 rounded-lg overflow-hidden">
            <img src={photoPreview} alt="Household" className="w-full h-40 object-cover rounded-lg border-2 border-blue-400" />
            <button
              type="button"
              onClick={() => {
                setPhotoPreview(null);
                setFormData((prev) => ({ ...prev, photo_url: null }));
              }}
              className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full text-xs"
            >
              ×
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={handlePhotoCapture}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-blue-400 rounded-lg text-blue-700 font-semibold hover:bg-blue-50"
        >
          <Camera size={20} />
          Capture Photo
        </button>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Notes (optional)</label>
        <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg" rows="3" />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg font-bold disabled:opacity-50">
          {isSubmitting ? 'Saving...' : initialData ? 'Update Resident' : 'Save Resident Data'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
};

// Pregnant Woman registration form (BNS template)
export const PregnantWomanForm = ({ onSubmit, onCancel, currentLocation, userName, initialData = null }) => {
  const fieldClass = 'w-full px-4 py-2 border-2 border-purple-300 rounded-lg text-sm';

  const [formData, setFormData] = useState(() => ({
    date_of_registration: new Date().toISOString().split('T')[0],
    family_serial_number: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    spouse_name: '',
    contact_number: '',
    birthday: '',
    age: '',
    civil_status: '',
    lmp: '',
    expected_date_of_delivery: '',
    philhealth_member: '',
    four_ps_beneficiary: '',
    weight: '',
    height: '',
    bmi: '',
    muac: '',
    visited_by: userName,
    ...initialData,
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (initialData) setFormData((prev) => ({ ...prev, ...initialData }));
  }, [initialData]);

  const updateField = (key, value) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      const wt = parseFloat(next.weight);
      const htCm = parseFloat(next.height);
      if (wt > 0 && htCm > 0) {
        const htM = htCm / 100;
        next.bmi = (wt / (htM * htM)).toFixed(1);
      } else {
        next.bmi = '';
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    onSubmit({
      ...formData,
      category: 'pregnantwoman',
      id: initialData?.id || Date.now(),
      synced: initialData?.synced ?? false,
      created_at: initialData?.created_at || new Date().toISOString(),
      status: initialData?.status || 'pending',
      gps_lat: currentLocation?.lat || initialData?.gps_lat || '',
      gps_lng: currentLocation?.lng || initialData?.gps_lng || '',
    });
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Registration *</label>
          <input
            type="date"
            required
            value={formData.date_of_registration}
            onChange={(e) => updateField('date_of_registration', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Family Serial Number *</label>
          <input
            type="text"
            required
            value={formData.family_serial_number}
            onChange={(e) => updateField('family_serial_number', e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <p className="text-xs font-bold text-purple-800 uppercase tracking-wide">Name of PW</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name *</label>
          <input type="text" required value={formData.last_name} onChange={(e) => updateField('last_name', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">First Name *</label>
          <input type="text" required value={formData.first_name} onChange={(e) => updateField('first_name', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Middle Name</label>
          <input type="text" value={formData.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Name of Spouse</label>
        <input type="text" value={formData.spouse_name} onChange={(e) => updateField('spouse_name', e.target.value)} className={fieldClass} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Number *</label>
        <input type="tel" required value={formData.contact_number} onChange={(e) => updateField('contact_number', e.target.value)} className={fieldClass} placeholder="09XXXXXXXXX" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Birthday *</label>
          <input type="date" required value={formData.birthday} onChange={(e) => updateField('birthday', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Age *</label>
          <input type="number" required min="10" max="60" value={formData.age} onChange={(e) => updateField('age', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Civil Status *</label>
        <select required value={formData.civil_status} onChange={(e) => updateField('civil_status', e.target.value)} className={fieldClass}>
          <option value="">Select...</option>
          <option value="Single">Single</option>
          <option value="Married">Married</option>
          <option value="Widowed">Widowed</option>
          <option value="Separated">Separated</option>
          <option value="Live-in">Live-in</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">LMP *</label>
          <input type="date" required value={formData.lmp} onChange={(e) => updateField('lmp', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Expected Date of Delivery *</label>
          <input type="date" required value={formData.expected_date_of_delivery} onChange={(e) => updateField('expected_date_of_delivery', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">PhilHealth Member (Y/N) *</label>
          <select required value={formData.philhealth_member} onChange={(e) => updateField('philhealth_member', e.target.value)} className={fieldClass}>
            <option value="">Select...</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">4Ps Beneficiary (Y/N) *</label>
          <select required value={formData.four_ps_beneficiary} onChange={(e) => updateField('four_ps_beneficiary', e.target.value)} className={fieldClass}>
            <option value="">Select...</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Wt (kg) *</label>
          <input type="number" required step="0.1" min="30" value={formData.weight} onChange={(e) => updateField('weight', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Ht (cm) *</label>
          <input type="number" required step="0.1" min="100" value={formData.height} onChange={(e) => updateField('height', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">BMI</label>
          <input type="text" readOnly value={formData.bmi} className={`${fieldClass} bg-gray-50`} placeholder="Auto" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">MUAC (cm) *</label>
          <input type="number" required step="0.1" min="15" max="40" value={formData.muac} onChange={(e) => updateField('muac', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-lg font-bold disabled:opacity-50">
          {isSubmitting ? 'Saving...' : 'Save Registration'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
};

// Lactating Woman registration form (BNS template)
export const LactatingWomanForm = ({ onSubmit, onCancel, currentLocation, userName, initialData = null }) => {
  const fieldClass = 'w-full px-4 py-2 border-2 border-red-300 rounded-lg text-sm';

  const [formData, setFormData] = useState(() => ({
    date_of_registration: new Date().toISOString().split('T')[0],
    family_serial_number: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    spouse_name: '',
    contact_number: '',
    birthday: '',
    age: '',
    civil_status: '',
    philhealth_member: '',
    four_ps_beneficiary: '',
    weight: '',
    height: '',
    bmi: '',
    muac: '',
    date_delivered: '',
    visited_by: userName,
    ...initialData,
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (key, value) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      const wt = parseFloat(next.weight);
      const htCm = parseFloat(next.height);
      if (wt > 0 && htCm > 0) {
        const htM = htCm / 100;
        next.bmi = (wt / (htM * htM)).toFixed(1);
      } else {
        next.bmi = '';
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    onSubmit({
      ...formData,
      category: 'lactatingwoman',
      id: initialData?.id || Date.now(),
      synced: initialData?.synced ?? false,
      created_at: initialData?.created_at || new Date().toISOString(),
      status: initialData?.status || 'pending',
      gps_lat: currentLocation?.lat || initialData?.gps_lat || '',
      gps_lng: currentLocation?.lng || initialData?.gps_lng || '',
    });
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Registration *</label>
          <input
            type="date"
            required
            value={formData.date_of_registration}
            onChange={(e) => updateField('date_of_registration', e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Family Serial Number *</label>
          <input
            type="text"
            required
            value={formData.family_serial_number}
            onChange={(e) => updateField('family_serial_number', e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Name of LW</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name *</label>
          <input type="text" required value={formData.last_name} onChange={(e) => updateField('last_name', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">First Name *</label>
          <input type="text" required value={formData.first_name} onChange={(e) => updateField('first_name', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Middle Name</label>
          <input type="text" value={formData.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Name of Spouse</label>
        <input type="text" value={formData.spouse_name} onChange={(e) => updateField('spouse_name', e.target.value)} className={fieldClass} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Number *</label>
        <input type="tel" required value={formData.contact_number} onChange={(e) => updateField('contact_number', e.target.value)} className={fieldClass} placeholder="09XXXXXXXXX" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Birthday *</label>
          <input type="date" required value={formData.birthday} onChange={(e) => updateField('birthday', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Age *</label>
          <input type="number" required min="10" max="60" value={formData.age} onChange={(e) => updateField('age', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Civil Status *</label>
        <select required value={formData.civil_status} onChange={(e) => updateField('civil_status', e.target.value)} className={fieldClass}>
          <option value="">Select...</option>
          <option value="Single">Single</option>
          <option value="Married">Married</option>
          <option value="Widowed">Widowed</option>
          <option value="Separated">Separated</option>
          <option value="Live-in">Live-in</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">PhilHealth Member (Y/N) *</label>
          <select required value={formData.philhealth_member} onChange={(e) => updateField('philhealth_member', e.target.value)} className={fieldClass}>
            <option value="">Select...</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">4Ps Beneficiary (Y/N) *</label>
          <select required value={formData.four_ps_beneficiary} onChange={(e) => updateField('four_ps_beneficiary', e.target.value)} className={fieldClass}>
            <option value="">Select...</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Wt (kg) *</label>
          <input type="number" required step="0.1" min="30" value={formData.weight} onChange={(e) => updateField('weight', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Ht (cm) *</label>
          <input type="number" required step="0.1" min="100" value={formData.height} onChange={(e) => updateField('height', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">BMI</label>
          <input type="text" readOnly value={formData.bmi} className={`${fieldClass} bg-gray-50`} placeholder="Auto" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">MUAC (cm) *</label>
          <input type="number" required step="0.1" min="15" max="40" value={formData.muac} onChange={(e) => updateField('muac', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Date Delivered *</label>
        <input type="date" required value={formData.date_delivered} onChange={(e) => updateField('date_delivered', e.target.value)} className={fieldClass} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-red-600 to-red-700 text-white py-3 rounded-lg font-bold disabled:opacity-50">
          {isSubmitting ? 'Saving...' : 'Save Registration'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
};

// Monthly Natality with Weight & Height (BNS template)
export const MonthlyNatalityForm = ({ onSubmit, onCancel, currentLocation, userName, initialData = null }) => {
  const fieldClass = 'w-full px-4 py-2 border-2 border-amber-300 rounded-lg text-sm';

  const [formData, setFormData] = useState(() => ({
    month: new Date().toISOString().slice(0, 7),
    mother_name: '',
    mother_age: '',
    child_name: '',
    dob: '',
    dow: new Date().toISOString().split('T')[0],
    weight_kg: '',
    height_cm: '',
    aim: '',
    w_a: '',
    h_a: '',
    w_l_h: '',
    visited_by: userName,
    ...initialData,
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const calcAgeInMonths = (dob, dow) => {
    if (!dob || !dow) return '';
    const birth = new Date(dob);
    const weigh = new Date(dow);
    let months = (weigh.getFullYear() - birth.getFullYear()) * 12 + (weigh.getMonth() - birth.getMonth());
    if (weigh.getDate() < birth.getDate()) months -= 1;
    return months >= 0 ? String(months) : '';
  };

  const updateField = (key, value) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'dob' || key === 'dow') {
        next.aim = calcAgeInMonths(
          key === 'dob' ? value : prev.dob,
          key === 'dow' ? value : prev.dow
        );
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    onSubmit({
      ...formData,
      category: 'monthlynatal',
      id: initialData?.id || Date.now(),
      synced: initialData?.synced ?? false,
      created_at: initialData?.created_at || new Date().toISOString(),
      status: initialData?.status || 'pending',
      gps_lat: currentLocation?.lat || initialData?.gps_lat || '',
      gps_lng: currentLocation?.lng || initialData?.gps_lng || '',
    });
    setIsSubmitting(false);
  };

  const statusOptions = ['', 'Normal', 'Underweight', 'Overweight', 'Stunted', 'Wasted', 'At Risk'];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
        Monthly Natality with Weight &amp; Height — Barangay Camambugan
      </p>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Month *</label>
        <input type="month" required value={formData.month} onChange={(e) => updateField('month', e.target.value)} className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Name of Mother *</label>
          <input type="text" required value={formData.mother_name} onChange={(e) => updateField('mother_name', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Age *</label>
          <input type="number" required min="10" max="60" value={formData.mother_age} onChange={(e) => updateField('mother_age', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Name of Child *</label>
        <input type="text" required value={formData.child_name} onChange={(e) => updateField('child_name', e.target.value)} className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">DOB *</label>
          <input type="date" required value={formData.dob} onChange={(e) => updateField('dob', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">DOW (Date of Weighing) *</label>
          <input type="date" required value={formData.dow} onChange={(e) => updateField('dow', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Wt (kg) *</label>
          <input type="number" required step="0.01" min="0" value={formData.weight_kg} onChange={(e) => updateField('weight_kg', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Ht (cm) *</label>
          <input type="number" required step="0.1" min="0" value={formData.height_cm} onChange={(e) => updateField('height_cm', e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">AIM (Age in Months)</label>
          <input type="text" readOnly value={formData.aim} className={`${fieldClass} bg-gray-50`} placeholder="Auto from DOB & DOW" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">W/A *</label>
          <select required value={formData.w_a} onChange={(e) => updateField('w_a', e.target.value)} className={fieldClass}>
            {statusOptions.map((opt) => (
              <option key={opt || 'blank'} value={opt}>{opt || 'Select...'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">H/A *</label>
          <select required value={formData.h_a} onChange={(e) => updateField('h_a', e.target.value)} className={fieldClass}>
            {statusOptions.map((opt) => (
              <option key={opt || 'blank-ha'} value={opt}>{opt || 'Select...'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">W/L/H *</label>
          <select required value={formData.w_l_h} onChange={(e) => updateField('w_l_h', e.target.value)} className={fieldClass}>
            {statusOptions.map((opt) => (
              <option key={opt || 'blank-wlh'} value={opt}>{opt || 'Select...'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 text-white py-3 rounded-lg font-bold disabled:opacity-50">
          {isSubmitting ? 'Saving...' : 'Save Record'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
};

const FEEDING_METHODS = ['', 'EBF', 'Mixed', 'Formula', 'Water/Tea', 'Other'];

// Infant Feeding — Edad ng Sanggol sa Pagbisita (BNS template)
export const InfantFeedingForm = ({ onSubmit, onCancel, currentLocation, userName, initialData = null }) => {
  const fieldClass = 'w-full px-4 py-2 border-2 border-pink-300 rounded-lg text-sm';

  const [formData, setFormData] = useState(() => ({
    mother_name: '',
    child_name: '',
    feeding_1_week: '',
    feeding_1_month: '',
    feeding_2_month: '',
    feeding_3_month: '',
    feeding_4_month: '',
    feeding_5_month: '',
    visited_by: userName,
    ...initialData,
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    onSubmit({
      ...formData,
      category: 'infantfeeding',
      id: initialData?.id || Date.now(),
      synced: initialData?.synced ?? false,
      created_at: initialData?.created_at || new Date().toISOString(),
      status: initialData?.status || 'pending',
      gps_lat: currentLocation?.lat || initialData?.gps_lat || '',
      gps_lng: currentLocation?.lng || initialData?.gps_lng || '',
    });
    setIsSubmitting(false);
  };

  const feedingFields = [
    { key: 'feeding_1_week', label: '1 Linggo (1 Week)' },
    { key: 'feeding_1_month', label: '1 Buwan (1 Month)' },
    { key: 'feeding_2_month', label: '2 Buwan (2 Months)' },
    { key: 'feeding_3_month', label: '3 Buwan (3 Months)' },
    { key: 'feeding_4_month', label: '4 Buwan (4 Months)' },
    { key: 'feeding_5_month', label: '5 Buwan (5 Months)' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs font-bold text-pink-800 uppercase tracking-wide">
        Edad ng Sanggol sa Pagbisita — Paraan ng Pagpapakain o Pagpapainom
      </p>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Pangalan ng Nanay *</label>
        <input type="text" required value={formData.mother_name} onChange={(e) => updateField('mother_name', e.target.value)} className={fieldClass} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Pangalan ng Bata *</label>
        <input type="text" required value={formData.child_name} onChange={(e) => updateField('child_name', e.target.value)} className={fieldClass} />
      </div>

      <div className="space-y-3 bg-pink-50 rounded-xl p-4 border border-pink-200">
        <p className="text-xs font-semibold text-pink-900">Feeding method at each visit age</p>
        {feedingFields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
            <select
              value={formData[key]}
              onChange={(e) => updateField(key, e.target.value)}
              className={fieldClass}
            >
              {FEEDING_METHODS.map((opt) => (
                <option key={opt || `blank-${key}`} value={opt}>{opt || '— Not yet / N/A —'}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-pink-600 to-pink-700 text-white py-3 rounded-lg font-bold disabled:opacity-50">
          {isSubmitting ? 'Saving...' : 'Save Record'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-bold">
          Cancel
        </button>
      </div>
    </form>
  );
};

// Export form selector
export const getCategoryForm = (category) => {
  const forms = {
    'residents': ResidentsForm,
    'environmental': EnvironmentalSanitationForm,
    'infantfeeding': InfantFeedingForm,
    'lactatingwoman': LactatingWomanForm,
    'pregnantwoman': PregnantWomanForm,
    'monthlynatal': MonthlyNatalityForm,
    // 'monthlyreport': No form needed
  };
  return forms[category] || ResidentsForm;
};

export default {
  EnvironmentalSanitationForm,
  ResidentsForm,
  PregnantWomanForm,
  LactatingWomanForm,
  InfantFeedingForm,
  MonthlyNatalityForm,
  getCategoryForm
};