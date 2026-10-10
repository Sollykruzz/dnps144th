/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import dominionCrestLogo from '../assets/images/dominion_crest_logo_1787759938482.jpg';
import dgosPayLogo from '../assets/images/dgos_pay_logo_1787759158741.jpg';
import eminentLogo from '../assets/images/eminent_academy_logo_1788183573201.jpg';
import { getStoredBranding, subscribeBranding, AppBrandingConfig } from '../services/brandingService';

// Fallback logo sources for bundled and public hosting
const DEFAULT_LOGO_SOURCES = [
  dominionCrestLogo,
  dgosPayLogo,
  eminentLogo,
  '/dominion_crest_logo.jpg',
  '/dgos_pay_logo.jpg',
  '/eminent_logo.jpg',
  '/favicon.jpg',
  '/apple-touch-icon.jpg',
];

export interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'receipt';
  showText?: boolean;
  subtitle?: string;
  className?: string;
  variant?: 'light' | 'dark' | 'mono';
  overrideBranding?: Partial<AppBrandingConfig>;
}

export const DGOSLogo: React.FC<LogoProps> = ({
  size = 'md',
  showText = false,
  subtitle,
  className = '',
  variant = 'light',
  overrideBranding,
}) => {
  const [branding, setBranding] = useState<AppBrandingConfig>(() => getStoredBranding());
  const [sourceIndex, setSourceIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  useEffect(() => {
    const unsub = subscribeBranding((updated) => {
      setBranding(updated);
      setSourceIndex(0);
      setAllFailed(false);
    });
    return unsub;
  }, []);

  const active = { ...branding, ...overrideBranding };

  const handleImageError = () => {
    if (active.logoType === 'url' || active.logoType === 'custom_upload') {
      setAllFailed(true);
      return;
    }
    if (sourceIndex < DEFAULT_LOGO_SOURCES.length - 1) {
      setSourceIndex((prev) => prev + 1);
    } else {
      setAllFailed(true);
    }
  };

  // Size dimensions for emblem icon container
  const iconDimensions = {
    xs: 'w-7 h-7 rounded-full text-xs',
    sm: 'w-9 h-9 rounded-full text-sm',
    md: 'w-11 h-11 rounded-full text-base',
    lg: 'w-16 h-16 rounded-full text-xl',
    xl: 'w-24 h-24 rounded-full text-2xl',
    receipt: 'w-12 h-12 rounded-full text-base',
  }[size];

  // Font size styling for the wordmark
  const titleSizeClass = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl sm:text-2xl',
    xl: 'text-3xl',
    receipt: 'text-base',
  }[size];

  // Render preset heraldic / academic SVG emblem based on selection
  const renderEmblemSvg = (type: string, color: string) => {
    switch (type) {
      case 'shield':
        return (
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 8 L85 24 V52 C85 72 50 92 50 92 C50 92 15 72 15 52 V24 Z" fill={color} />
            <path d="M50 14 L80 28 V50 C80 67 50 84 50 84 C50 84 20 67 20 50 V28 Z" fill="#ffffff" fillOpacity="0.2" />
            <polygon points="50,30 55,42 68,42 58,50 62,62 50,54 38,62 42,50 32,42 45,42" fill="#ffffff" />
          </svg>
        );
      case 'mortarboard':
        return (
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full p-2" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill={color} />
            <path d="M50 28 L82 42 L50 56 L18 42 Z" fill="#ffffff" />
            <path d="M30 48 V65 C30 73 70 73 70 65 V48" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
            <path d="M78 45 V68" stroke="#FDE047" strokeWidth="3" strokeLinecap="round" />
            <circle cx="78" cy="71" r="3" fill="#FDE047" />
          </svg>
        );
      case 'book':
        return (
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full p-2" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill={color} />
            <path d="M50 68 C42 62 26 62 20 66 V34 C26 30 42 30 50 36 C58 30 74 30 80 34 V66 C74 62 58 62 50 68 Z" fill="#ffffff" />
            <line x1="50" y1="36" x2="50" y2="68" stroke={color} strokeWidth="3" />
            <polygon points="50,22 53,28 60,28 55,32 57,38 50,34 43,38 45,32 40,28 47,28" fill="#FDE047" />
          </svg>
        );
      case 'torch':
        return (
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full p-2" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill={color} />
            <path d="M50 18 C50 18 40 28 40 38 C40 44 45 48 50 48 C55 48 60 44 60 38 C60 28 50 18 50 18 Z" fill="#F59E0B" />
            <path d="M50 25 C50 25 44 32 44 38 C44 41 47 44 50 44 C53 44 56 41 56 38 C56 32 50 25 50 25 Z" fill="#EF4444" />
            <path d="M42 48 L46 78 H54 L58 48 Z" fill="#ffffff" />
            <rect x="40" y="46" width="20" height="4" rx="2" fill="#FDE047" />
          </svg>
        );
      case 'crest':
      case 'crown':
      default:
        return (
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full p-2" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill={color} />
            <circle cx="50" cy="50" r="40" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.4" />
            <path d="M25 64 L30 38 L42 50 L50 32 L58 50 L70 38 L75 64 Z" fill="#FDE047" />
            <rect x="25" y="64" width="50" height="6" rx="2" fill="#ffffff" />
            <circle cx="50" cy="54" r="3" fill="#DC2626" />
            <circle cx="37" cy="56" r="2.5" fill={color} />
            <circle cx="63" cy="56" r="2.5" fill={color} />
          </svg>
        );
    }
  };

  // Determine what image source to display
  const hasCustomUpload = (active.logoType === 'custom_upload' || active.logoType === 'url') && Boolean(active.customLogoData);

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Emblem / Logo Mark */}
      <div
        className={`${iconDimensions} relative flex items-center justify-center shrink-0 overflow-hidden shadow-xs border bg-white border-slate-200 transition-transform`}
        style={{ borderColor: `${active.primaryColor}30` }}
      >
        {active.logoType === 'preset_emblem' ? (
          renderEmblemSvg(active.presetEmblem, active.emblemColor || active.primaryColor)
        ) : hasCustomUpload && !allFailed ? (
          <img
            key={`custom-logo-${active.customLogoData?.substring(0, 30)}`}
            src={active.customLogoData}
            alt={`${active.appName} Logo`}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="w-full h-full object-contain object-center scale-100"
          />
        ) : !allFailed ? (
          <img
            key={`default-logo-src-${sourceIndex}`}
            src={DEFAULT_LOGO_SOURCES[sourceIndex]}
            alt={`${active.appName} Crest`}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className="w-full h-full object-contain object-center scale-100"
          />
        ) : (
          renderEmblemSvg('crown', active.primaryColor || '#0044B5')
        )}
      </div>

      {/* Wordmark */}
      {showText && (
        <div className="flex flex-col min-w-0 text-left">
          <div className={`font-black tracking-tight uppercase leading-tight ${titleSizeClass}`}>
            <span className={variant === 'dark' ? 'text-white' : 'text-[#0f172a]'}>
              {active.shortName || active.appName.substring(0, 14)}
            </span>
          </div>
          {(subtitle || active.appName) && (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-[200px] sm:max-w-xs">
              {subtitle || active.appName}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Aliased exports for full backward compatibility across all imports
export const EminentLogo = DGOSLogo;
