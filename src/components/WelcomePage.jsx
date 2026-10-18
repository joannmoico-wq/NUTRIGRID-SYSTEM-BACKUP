import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, BarChart2, WifiOff } from 'lucide-react';

/**
 * BNS HEALTH - WELCOME ONBOARDING PAGE
 * Updated with an even lighter, softer pink/lavender card background.
 */

const WelcomePage = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const screens = [
    {
      id: 1,
      badgeText: "BARANGAY NUTRITION SCHOLAR",
      title: "Track every child's growth and health",
      description: "Monitor weight, height, and nutrition status, then bring the right support to every household.",
      pillLabel: "Growth records",
      iconType: "chart",
    },
    {
      id: 2,
      badgeText: "FIELD WORKER TOOLS",
      title: "Collect data, even when offline",
      description: "Capture household and health information wherever you are. Everything syncs when you're connected again.",
      pillLabel: "Ready in the field",
      iconType: "offline",
    },
  ];

  const currentScreen = screens[currentStep];
  const totalSteps = screens.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete?.();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  return (
    /* Outer background is pure white */
    <div className="min-h-[100svh] w-full bg-white flex items-center justify-center p-3 sm:p-4">
      {/* Mobile card container is now a much lighter, softer pink/lavender */}
      <div className="w-full max-w-[440px] min-h-[min(880px,calc(100svh-1.5rem))] bg-[#fbf7fa] rounded-[28px] shadow-2xl border border-[#f5ecf4] flex flex-col justify-between relative overflow-hidden text-gray-900">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#7a2652] rounded-xl flex items-center justify-center text-white shadow-md">
              <BarChart2 className="w-4 h-4" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight text-base">NUTRIGRID</span>
          </div>
          <span className="text-xs font-semibold text-gray-400 tracking-widest">
            {String(currentStep + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
          </span>
        </div>

        {/* Center Graphic / Illustration Box */}
        <div className="px-6 py-2 flex justify-center">
          <div className="relative w-full max-w-[320px] h-[clamp(150px,30svh,230px)] bg-[#f4eaf2] rounded-[32px] flex items-center justify-center overflow-hidden shadow-inner">
            {/* Decorative Floating Circles */}
            <div className="absolute top-6 right-6 w-16 h-16 bg-[#eadae8] rounded-full opacity-60 blur-[1px]"></div>
            <div className="absolute bottom-6 left-6 w-12 h-12 bg-[#ffcbb2] rounded-full opacity-80"></div>

            {/* Inner Icon Card */}
            {currentScreen.iconType === 'chart' ? (
              <div className="relative z-10 w-24 h-24 bg-[#7a2652] rounded-2xl shadow-xl flex items-center justify-center transform transition hover:scale-105 duration-300">
                <BarChart2 className="w-10 h-10 text-white" />
              </div>
            ) : (
              <div className="relative z-10 w-24 h-24 bg-white rounded-2xl shadow-xl flex items-center justify-center transform transition hover:scale-105 duration-300">
                <WifiOff className="w-10 h-10 text-[#7a2652]" />
              </div>
            )}
          </div>
        </div>

        {/* Text and Badge Content Section */}
        <div className="px-7 sm:px-8 pt-6 pb-14 flex flex-col justify-center gap-5">
          <span className="text-xs font-bold text-[#7a2652] tracking-wider">
            {currentScreen.badgeText}
          </span>
          <h1 className="text-[34px] sm:text-[36px] font-extrabold text-gray-900 tracking-tight leading-[1.12]">
            {currentScreen.title}
          </h1>
          <p className="text-gray-600 text-base leading-relaxed">
            {currentScreen.description}
          </p>

          {/* Pill Badge */}
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#fde8e3] text-[#7a2652] rounded-full text-sm font-semibold shadow-sm">
              {currentScreen.iconType === 'chart' ? (
                <BarChart2 className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
              {currentScreen.pillLabel}
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="px-8 pb-8 pt-2 flex items-center justify-between">
          {currentStep > 0 ? (
            <button
              onClick={handlePrev}
              className="w-12 h-12 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-700 hover:bg-gray-50 transition shadow-sm"
              aria-label="Previous step"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition px-2 py-1"
            >
              Skip
            </button>
          )}

          {/* Pagination Indicators */}
          <div className="flex items-center gap-1.5">
            {screens.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep ? 'w-6 bg-[#7a2652]' : 'w-2 bg-[#ebd2e4]'
                }`}
              />
            ))}
          </div>

          {/* Action Button */}
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-[#7a2652] hover:bg-[#651f43] text-white px-6 py-3.5 rounded-full font-semibold text-sm shadow-lg shadow-purple-900/20 transition transform active:scale-95"
          >
            {currentStep === totalSteps - 1 ? 'Get started' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};

export default WelcomePage;