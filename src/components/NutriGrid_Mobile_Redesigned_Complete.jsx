import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  MapPin, 
  Wifi, 
  WifiOff, 
  Check, 
  Plus, 
  Upload, 
  List, 
  Home,
  Menu,
  X,
  AlertCircle,
  CheckCircle,
  LogOut,
  Search,
  Users,
  Leaf,
  Baby,
  Heart,
  Calendar,
  FileText,
  TrendingUp
} from 'lucide-react';
import WelcomePage from './WelcomePage';
import SignInPage from './SignInPage';
import {
  EnvironmentalSanitationForm,
  ResidentsForm,
  PregnantWomanForm,
  LactatingWomanForm,
  InfantFeedingForm,
  getCategoryForm
} from './CategorySpecificForms';

/**
 * NUTRIGRID - MOBILE-FIRST APP
 * - Forms appear below categories
 * - No Monthly Report
 * - Single layout (mobile optimized)
 * - No status bar or bells
 */

const NutriGridMobileFinal = () => {
  // Authentication States
  const [appState, setAppState] = useState('welcome');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // App States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [pendingVisits, setPendingVisits] = useState([]);
  const [activeView, setActiveView] = useState('home');
  const [userName, setUserName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  
  // Category Form States
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [currentFormType, setCurrentFormType] = useState(null);
  const [categoryRecords, setCategoryRecords] = useState({});

  // Initialize app
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        }
      );
    }

    const pending = JSON.parse(localStorage.getItem('pendingVisits') || '[]');
    setPendingVisits(pending);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ====================================================================
  // HANDLERS
  // ====================================================================

  const handleWelcomeComplete = () => {
    setAppState('signin');
  };

  const handleSignIn = (userData) => {
    setCurrentUser(userData);
    setUserName(userData.email.split('@')[0]);
    setIsAuthenticated(true);
    setAppState('app');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveView('home');
    setAppState('signin');
    setSelectedCategory(null);
  };

  // Handle Category Form Submission
  const handleCategoryFormSubmit = (formData) => {
    const categoryKey = `records_${formData.category}`;
    const existingRecords = JSON.parse(localStorage.getItem(categoryKey) || '[]');
    const updatedRecords = [...existingRecords, formData];
    
    localStorage.setItem(categoryKey, JSON.stringify(updatedRecords));
    setCategoryRecords({...categoryRecords, [formData.category]: updatedRecords});
    
    alert('✅ Data saved successfully!');
    setShowCategoryForm(false);
    setSelectedCategory(null);
  };

  // ====================================================================
  // SYNC DATA FUNCTION
  // ====================================================================

  const syncData = async () => {
    const pending = pendingVisits.filter(v => !v.synced);

    if (pending.length === 0) {
      alert('✅ All records already synced!');
      return;
    }

    try {
      alert(`📤 Syncing ${pending.length} record(s)...`);

      const updated = pendingVisits.map(v => 
        pending.find(p => p.id === v.id) 
          ? {...v, synced: true} 
          : v
      );
      localStorage.setItem('pendingVisits', JSON.stringify(updated));
      setPendingVisits(updated);

      alert(`✅ Synced ${pending.length} visits successfully!`);
    } catch (error) {
      alert('❌ Sync failed. Try again.');
    }
  };

  // ====================================================================
  // HOME SCREEN - MOBILE LAYOUT
  // ====================================================================

  const HomeScreen = () => {
    // ONLY 6 CATEGORIES (No Monthly Report)
    const categories = [
      { id: 'residents', name: 'Residents', emoji: '👥', color: 'from-blue-400 to-blue-600', bgColor: 'bg-blue-100', count: 245 },
      { id: 'environmental', name: 'Environmental\nSanitation', emoji: '🌍', color: 'from-green-400 to-green-600', bgColor: 'bg-green-100', count: 89 },
      { id: 'infantfeeding', name: 'Infant\nFeeding', emoji: '🍼', color: 'from-pink-400 to-pink-600', bgColor: 'bg-pink-100', count: 142 },
      { id: 'lactatingwoman', name: 'Lactating\nWoman', emoji: '❤️', color: 'from-red-400 to-red-600', bgColor: 'bg-red-100', count: 35 },
      { id: 'pregnantwoman', name: 'Pregnant\nWoman', emoji: '🤰', color: 'from-purple-400 to-purple-600', bgColor: 'bg-purple-100', count: 28 },
      { id: 'monthlynatal', name: 'Monthly\nNatality', emoji: '📅', color: 'from-yellow-400 to-yellow-600', bgColor: 'bg-yellow-100', count: 12 }
    ];

    const selectedCategoryData = categories.find(c => c.id === selectedCategory);
    const pendingCount = pendingVisits.filter(v => !v.synced).length;
    
    // Get records for selected category
    const categoryKey = selectedCategory ? `records_${selectedCategory}` : null;
    const categoryRecordsData = categoryKey ? JSON.parse(localStorage.getItem(categoryKey) || '[]') : [];

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50 pb-32">
        
        {/* HEADER */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 sticky top-0 z-40">
          <h1 className="text-3xl font-bold mb-4">
            Welcome, <span className="text-blue-100">{userName.split('@')[0] || 'User'}</span>
          </h1>

          <div className="relative">
            <Search className="absolute left-4 top-3 text-blue-300" size={20} />
            <input
              type="text"
              placeholder="Search records..."
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-blue-500 bg-opacity-30 text-white placeholder-blue-200 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-4 space-y-4">
          
          {/* CATEGORIES SECTION */}
          {!selectedCategory ? (
            <>
              <h2 className="text-lg font-bold text-gray-800">Categories</h2>
              
              <div className="grid grid-cols-3 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`p-4 rounded-2xl transition transform hover:scale-105 ${cat.bgColor} text-gray-600 hover:shadow-md`}
                  >
                    <div className="text-3xl mb-2">{cat.emoji}</div>
                    <p className="text-xs font-semibold leading-tight">{cat.name}</p>
                    <p className="text-xs opacity-75 mt-1">{cat.count}</p>
                  </button>
                ))}
              </div>

              {/* ALERT BANNER */}
              {pendingCount > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex gap-3 mt-6">
                  <AlertCircle className="text-red-500 flex-shrink-0" size={24} />
                  <div>
                    <h3 className="font-bold text-red-700 text-sm">⚠️ {pendingCount} Pending</h3>
                    <p className="text-red-600 text-xs mt-1">Data waiting to sync</p>
                  </div>
                </div>
              )}

              {/* SYNC BUTTON */}
              {isOnline && pendingCount > 0 && (
                <button
                  onClick={syncData}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-2xl font-bold hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <TrendingUp size={20} />
                  Sync {pendingCount} Record(s)
                </button>
              )}

              {/* LOGOUT BUTTON */}
              <button
                onClick={handleLogout}
                className="w-full bg-red-50 text-red-600 py-3 rounded-2xl font-bold border-2 border-red-200 hover:bg-red-100"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              {/* CATEGORY SELECTED - SHOW STATS & BUTTONS BELOW */}
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-blue-600 font-semibold mb-4 flex items-center gap-2"
              >
                ← Back to Categories
              </button>

              {/* CATEGORY HEADER */}
              <div className={`bg-gradient-to-br ${selectedCategoryData.color} rounded-3xl p-6 text-white`}>
                <h2 className="text-3xl font-bold flex items-center gap-2 mb-4">
                  <span className="text-4xl">{selectedCategoryData.emoji}</span>
                  {selectedCategoryData.name}
                </h2>
                <div>
                  <div className="text-4xl font-bold">{selectedCategoryData.count}</div>
                  <p className="text-sm opacity-90">Total Records</p>
                </div>
              </div>

              {/* STATS */}
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-gray-800">Quick Stats</h3>
                
                <div className="bg-white rounded-2xl p-4 border-2 border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600 font-semibold">This Month</span>
                    <span className="text-lg font-bold text-blue-600">+{Math.floor(selectedCategoryData.count * 0.15)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '65%' }}></div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border-2 border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600 font-semibold">Completed</span>
                    <span className="text-lg font-bold text-green-600">87%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '87%' }}></div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border-2 border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600 font-semibold">Pending</span>
                    <span className="text-lg font-bold text-orange-600">{pendingCount}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-orange-600 h-2 rounded-full" style={{ width: '30%' }}></div>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="space-y-3 mt-6 pt-4 border-t-2 border-gray-200">
                <button
                  onClick={() => {
                    setShowCategoryForm(true);
                    setCurrentFormType(selectedCategory);
                  }}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-xl font-bold hover:shadow-lg flex items-center justify-center gap-2 transition"
                >
                  <Plus size={20} />
                  New Visit
                </button>
              </div>

              {/* SHOW RECORDS FOR THIS CATEGORY */}
              {categoryRecordsData.length > 0 && (
                <div className="space-y-3 mt-6">
                  <h3 className="text-lg font-bold text-gray-800">Recent Records</h3>
                  
                  {categoryRecordsData.map((record, idx) => (
                    <div key={idx} className="bg-white rounded-2xl p-4 border-2 border-gray-300">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-bold text-gray-900">{record.household_head || record.name || `Record ${idx + 1}`}</p>
                          <p className="text-sm text-gray-600">{record.address || 'No address'}</p>
                        </div>
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-200 text-green-800">
                          ✓ Saved
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        📅 {new Date(record.visit_date).toLocaleDateString('en-PH')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* FORM MODAL */}
        {showCategoryForm && selectedCategory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  {selectedCategoryData?.name} - New Visit
                </h2>
                <button
                  onClick={() => setShowCategoryForm(false)}
                  className="text-white hover:bg-blue-500 p-2 rounded-full transition"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                {currentFormType === 'environmental' && (
                  <EnvironmentalSanitationForm
                    onSubmit={handleCategoryFormSubmit}
                    onCancel={() => setShowCategoryForm(false)}
                    currentLocation={currentLocation}
                    userName={userName}
                  />
                )}
                {currentFormType === 'residents' && (
                  <ResidentsForm
                    onSubmit={handleCategoryFormSubmit}
                    onCancel={() => setShowCategoryForm(false)}
                    currentLocation={currentLocation}
                    userName={userName}
                  />
                )}
                {currentFormType === 'infantfeeding' && (
                  <InfantFeedingForm
                    onSubmit={handleCategoryFormSubmit}
                    onCancel={() => setShowCategoryForm(false)}
                    currentLocation={currentLocation}
                    userName={userName}
                  />
                )}
                {currentFormType === 'lactatingwoman' && (
                  <LactatingWomanForm
                    onSubmit={handleCategoryFormSubmit}
                    onCancel={() => setShowCategoryForm(false)}
                    currentLocation={currentLocation}
                    userName={userName}
                  />
                )}
                {currentFormType === 'pregnantwoman' && (
                  <PregnantWomanForm
                    onSubmit={handleCategoryFormSubmit}
                    onCancel={() => setShowCategoryForm(false)}
                    currentLocation={currentLocation}
                    userName={userName}
                  />
                )}
                {currentFormType === 'monthlynatal' && (
                  <ResidentsForm
                    onSubmit={handleCategoryFormSubmit}
                    onCancel={() => setShowCategoryForm(false)}
                    currentLocation={currentLocation}
                    userName={userName}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ====================================================================
  // MAIN RENDER
  // ====================================================================

  if (appState === 'welcome') {
    return <WelcomePage onComplete={handleWelcomeComplete} />;
  }

  if (appState === 'signin') {
    return <SignInPage onSignIn={handleSignIn} />;
  }

  if (appState === 'app' && isAuthenticated) {
    return (
      <div className="bg-white min-h-screen">
        <HomeScreen />
      </div>
    );
  }

  return null;
};

export default NutriGridMobileFinal;