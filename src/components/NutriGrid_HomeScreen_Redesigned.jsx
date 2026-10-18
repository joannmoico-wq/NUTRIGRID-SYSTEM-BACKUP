import React, { useState } from 'react';
import {
  Search,
  Menu,
  X,
  Bell,
  Users,
  Leaf,
  Baby,
  Heart,
  Calendar,
  FileText,
  TrendingUp,
  AlertCircle,
  Plus,
  Wifi,
  WifiOff
} from 'lucide-react';

/**
 * NUTRIGRID - REDESIGNED HOME SCREEN
 * Beautiful dashboard matching modern healthcare app design
 * Categories: Residents, Environmental Sanitation, Infant Feeding, 
 *             Lactating Woman, Pregnant Woman, Monthly Natality, Monthly Report
 */

const NutriGridHomeScreen = ({ 
  userName, 
  isOnline, 
  pendingCount, 
  onNewVisit, 
  onViewRecords, 
  onSync, 
  onLogout 
}) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Categories with icons and colors
  const categories = [
    {
      id: 'residents',
      name: 'Residents',
      icon: Users,
      color: 'from-blue-400 to-blue-600',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600',
      count: 245,
      emoji: '👥'
    },
    {
      id: 'environmental',
      name: 'Environmental\nSanitation',
      icon: Leaf,
      color: 'from-green-400 to-green-600',
      bgColor: 'bg-green-100',
      textColor: 'text-green-600',
      count: 89,
      emoji: '🌍'
    },
    {
      id: 'infantfeeding',
      name: 'Infant\nFeeding',
      icon: Baby,
      color: 'from-pink-400 to-pink-600',
      bgColor: 'bg-pink-100',
      textColor: 'text-pink-600',
      count: 142,
      emoji: '🍼'
    },
    {
      id: 'lactatingwoman',
      name: 'Lactating\nWoman',
      icon: Heart,
      color: 'from-red-400 to-red-600',
      bgColor: 'bg-red-100',
      textColor: 'text-red-600',
      count: 35,
      emoji: '❤️'
    },
    {
      id: 'pregnantwoman',
      name: 'Pregnant\nWoman',
      icon: Heart,
      color: 'from-purple-400 to-purple-600',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-600',
      count: 28,
      emoji: '🤰'
    },
    {
      id: 'monthlynatal',
      name: 'Monthly\nNatality',
      icon: Calendar,
      color: 'from-yellow-400 to-yellow-600',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-600',
      count: 12,
      emoji: '📅'
    },
    {
      id: 'monthlyreport',
      name: 'Monthly\nReport',
      icon: FileText,
      color: 'from-indigo-400 to-indigo-600',
      bgColor: 'bg-indigo-100',
      textColor: 'text-indigo-600',
      count: 7,
      emoji: '📊'
    }
  ];

  const selectedCategoryData = categories.find(c => c.id === selectedCategory);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-purple-50">
      {/* Status Bar */}
      <div className={`px-6 py-2 text-white text-sm flex items-center justify-between sticky top-0 z-50 ${
        isOnline ? 'bg-green-600' : 'bg-gray-700'
      }`}>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <Wifi size={16} />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff size={16} />
              <span>Offline</span>
            </>
          )}
        </div>
        <span className="text-xs">
          {new Date().toLocaleTimeString('en-PH', {hour: '2-digit', minute:'2-digit'})}
        </span>
      </div>

      <div className="flex gap-4 p-4 max-w-6xl mx-auto">
        
        {/* LEFT PANEL - MAIN DASHBOARD */}
        <div className="flex-1 space-y-4">
          
          {/* Header Card */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 text-white relative overflow-hidden">
            
            {/* Decorative Background */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full opacity-20 mix-blend-multiply blur-2xl"></div>

            {/* Top Bar */}
            <div className="flex items-center justify-between mb-6 relative z-10">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-blue-500 rounded-lg transition"
              >
                {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <Bell className="text-yellow-300" size={24} />
            </div>

            {/* Welcome Text */}
            <h1 className="text-3xl font-bold mb-6 relative z-10">
              Welcome, <span className="text-blue-100">{userName.split('@')[0]}</span>
            </h1>

            {/* Search Bar */}
            <div className="relative z-10">
              <Search className="absolute left-4 top-3 text-blue-300" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search records..."
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-blue-500 bg-opacity-30 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>
          </div>

          {/* Categories Section */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800 px-2">Categories</h2>
            
            {/* Category Grid */}
            <div className="grid grid-cols-3 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-4 rounded-2xl transition transform hover:scale-105 ${
                    selectedCategory === cat.id
                      ? `bg-gradient-to-br ${cat.color} text-white shadow-lg`
                      : `${cat.bgColor} ${cat.textColor} hover:shadow-md`
                  }`}
                >
                  <div className="text-3xl mb-2">{cat.emoji}</div>
                  <p className="text-xs font-semibold leading-tight">{cat.name}</p>
                  <p className="text-xs opacity-75 mt-1">{cat.count} records</p>
                </button>
              ))}
            </div>

            {/* Show All Link */}
            <button className="w-full text-center text-blue-600 font-semibold py-2 hover:text-blue-700 transition">
              Show All →
            </button>
          </div>

          {/* Alert Banner */}
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-2xl p-4 flex gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0" size={24} />
            <div>
              <h3 className="font-bold text-red-700 text-sm">⚠️ Pending Data</h3>
              <p className="text-red-600 text-xs mt-1">
                {pendingCount} visit(s) waiting to sync. Connect to internet to upload.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onNewVisit}
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-2xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              New Visit
            </button>
            <button
              onClick={onViewRecords}
              className="bg-white border-2 border-blue-300 text-blue-600 py-4 rounded-2xl font-bold hover:bg-blue-50 transition flex items-center justify-center gap-2"
            >
              <FileText size={20} />
              Records
            </button>
          </div>

          {/* Sync Button (if online and pending) */}
          {isOnline && pendingCount > 0 && (
            <button
              onClick={onSync}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-2xl font-bold hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              <TrendingUp size={20} />
              Sync {pendingCount} Record(s)
            </button>
          )}

          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="w-full bg-red-50 text-red-600 py-3 rounded-2xl font-bold border-2 border-red-200 hover:bg-red-100 transition"
          >
            Logout
          </button>
        </div>

        {/* RIGHT PANEL - CATEGORY DETAILS */}
        {selectedCategoryData && (
          <div className="w-96 space-y-4">
            
            {/* Category Header Card */}
            <div className={`bg-gradient-to-br ${selectedCategoryData.color} rounded-3xl p-6 text-white relative overflow-hidden`}>
              
              {/* Decorative Background */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full opacity-10 mix-blend-multiply blur-2xl"></div>

              <div className="flex items-center justify-between mb-4 relative z-10">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <span className="text-3xl">{selectedCategoryData.emoji}</span>
                  {selectedCategoryData.name}
                </h2>
                <Bell className="text-yellow-300" size={24} />
              </div>

              {/* Stats */}
              <div className="space-y-2 relative z-10">
                <div className="text-4xl font-bold">{selectedCategoryData.count}</div>
                <p className="text-sm opacity-90">Total Records</p>
              </div>
            </div>

            {/* Quick Stats Grid */}
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

            {/* Recent Activity */}
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800">Recent Activity</h3>
              
              <div className="bg-white rounded-2xl p-4 border-2 border-gray-200 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users size={20} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">Record Added</p>
                    <p className="text-xs text-gray-500">2 hours ago</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <TrendingUp size={20} className="text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">Data Synced</p>
                    <p className="text-xs text-gray-500">1 day ago</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                    <Plus size={20} className="text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">New Record</p>
                    <p className="text-xs text-gray-500">3 days ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No Category Selected */}
        {!selectedCategory && (
          <div className="w-96 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="text-6xl">👆</div>
              <h3 className="text-xl font-bold text-gray-800">Select a Category</h3>
              <p className="text-gray-600">Choose a category to view details and statistics</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NutriGridHomeScreen;