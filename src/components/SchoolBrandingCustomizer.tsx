/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Palette,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Check,
  RotateCcw,
  Download,
  FileCode,
  Globe,
  Building,
  Phone,
  Mail,
  FileText,
  Eye,
  Shield,
  Layers,
  Crown,
  BookOpen,
  GraduationCap,
  Flame,
  Award,
  Star,
  Compass,
  Feather,
  Copy,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import {
  getStoredBranding,
  saveStoredBranding,
  resetStoredBranding,
  syncBrandingFromCloud,
  applyCloudBranding,
  AppBrandingConfig,
  DEFAULT_BRANDING,
} from '../services/brandingService';
import { subscribeBrandingFromFirestore } from '../services/firebase';
import { SchoolProfile } from '../types';
import { DGOSLogo } from './DGOSLogo';

const PRESET_EMBLEMS: Array<{ id: AppBrandingConfig['presetEmblem']; label: string; icon: React.ReactNode }> = [
  { id: 'crown', label: 'Royal Crown', icon: <Crown className="w-5 h-5" /> },
  { id: 'shield', label: 'Heraldic Shield', icon: <Shield className="w-5 h-5" /> },
  { id: 'mortarboard', label: 'Mortarboard Cap', icon: <GraduationCap className="w-5 h-5" /> },
  { id: 'book', label: 'Open Scripture / Book', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'torch', label: 'Torch of Wisdom', icon: <Flame className="w-5 h-5" /> },
  { id: 'crest', label: 'Academic Crest', icon: <Award className="w-5 h-5" /> },
  { id: 'star', label: 'Excellence Star', icon: <Star className="w-5 h-5" /> },
];

const PRESET_COLORS = [
  { name: 'Royal Navy', hex: '#0044B5', bgClass: 'bg-[#0044B5]' },
  { name: 'Emerald Green', hex: '#059669', bgClass: 'bg-emerald-600' },
  { name: 'Deep Burgundy', hex: '#991B1B', bgClass: 'bg-red-800' },
  { name: 'Regal Purple', hex: '#7C3AED', bgClass: 'bg-purple-600' },
  { name: 'Ocean Cyan', hex: '#0284C7', bgClass: 'bg-sky-600' },
  { name: 'Amber Gold', hex: '#D97706', bgClass: 'bg-amber-600' },
  { name: 'Midnight Slate', hex: '#0F172A', bgClass: 'bg-slate-900' },
  { name: 'Forest Teal', hex: '#0D9488', bgClass: 'bg-teal-600' },
];

interface SchoolBrandingCustomizerProps {
  onNotify?: (message: string) => void;
  schoolId?: string;
  activeSchool?: SchoolProfile;
  onUpdateSchool?: (updatedSchool: SchoolProfile) => void;
}

export const SchoolBrandingCustomizer: React.FC<SchoolBrandingCustomizerProps> = ({ onNotify, schoolId, activeSchool, onUpdateSchool }) => {
  const targetSchoolId = (schoolId || 'dominion-group').toLowerCase();
  const [branding, setBranding] = useState<AppBrandingConfig>(() => getStoredBranding(targetSchoolId));
  const [activePreviewTab, setActivePreviewTab] = useState<'header' | 'receipt' | 'login'>('header');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isCloudLive, setIsCloudLive] = useState(false);
  const [lastCloudSync, setLastCloudSync] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImportInputRef = useRef<HTMLInputElement>(null);

  // Sync state and connect live Firestore listener
  useEffect(() => {
    let isMounted = true;
    setBranding(getStoredBranding(targetSchoolId));

    // 1. Subscribe to live branding from Firestore
    const unsubscribe = subscribeBrandingFromFirestore(targetSchoolId, (cloudBranding) => {
      if (!isMounted) return;
      applyCloudBranding(cloudBranding, targetSchoolId);
      setBranding(cloudBranding);
      setIsCloudLive(true);
      setLastCloudSync(new Date());
    });

    // 2. Fetch latest config from Firestore on mount
    syncBrandingFromCloud(targetSchoolId).then((cloudBranding) => {
      if (!isMounted) return;
      if (cloudBranding) {
        setBranding(cloudBranding);
      }
      setIsCloudLive(true);
      setLastCloudSync(new Date());
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [targetSchoolId]);

  const handleFieldChange = <K extends keyof AppBrandingConfig>(field: K, value: AppBrandingConfig[K]) => {
    setBranding((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsCloudSyncing(true);
    try {
      const saved = saveStoredBranding(branding, targetSchoolId, true);
      setBranding(saved);

      // Keep the school's registered name in sync with the rebranded app name
      if (activeSchool && onUpdateSchool && saved.appName && saved.appName !== activeSchool.name) {
        onUpdateSchool({ ...activeSchool, name: saved.appName });
      }

      setSaveSuccess(true);
      setIsCloudLive(true);
      setLastCloudSync(new Date());
      if (onNotify) {
        onNotify(`School identity & branding saved and synchronized to Cloud Firestore! App title set to "${saved.appName}".`);
      }
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.warn('[Branding Save Error]:', err);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleReset = () => {
    const def = resetStoredBranding(targetSchoolId);
    setBranding(def);
    setSaveSuccess(true);
    if (onNotify) {
      onNotify('Branding reset to factory default and synced with Cloud Firestore.');
    }
  };

  const handleCloudPull = async () => {
    setIsCloudSyncing(true);
    try {
      const cloudBranding = await syncBrandingFromCloud(targetSchoolId);
      if (cloudBranding) {
        setBranding(cloudBranding);
        if (onNotify) {
          onNotify(`Fetched latest school branding from Cloud Firestore! (${cloudBranding.appName})`);
        }
      } else {
        if (onNotify) {
          onNotify('Local branding is already synchronized with Cloud Firestore.');
        }
      }
      setIsCloudLive(true);
      setLastCloudSync(new Date());
    } finally {
      setIsCloudSyncing(false);
    }
  };


  // Image Upload Handler
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setImportError('Logo image file is too large. Please select an image under 2MB.');
      if (onNotify) {
        onNotify('Logo image file is too large. Please select an image under 2MB.');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      handleFieldChange('customLogoData', dataUrl);
      handleFieldChange('logoType', 'custom_upload');
    };
    reader.readAsDataURL(file);
  };

  // Export JSON Profile
  const handleExportProfile = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(branding, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${branding.shortName.toLowerCase().replace(/\s+/g, '_')}_branding_profile.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON Profile
  const handleImportProfile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          const updated = {
            ...DEFAULT_BRANDING,
            ...parsed,
          };
          setBranding(updated);
          saveStoredBranding(updated, targetSchoolId, true);

          if (activeSchool && onUpdateSchool && updated.appName && updated.appName !== activeSchool.name) {
            onUpdateSchool({ ...activeSchool, name: updated.appName });
          }

          setImportError(null);
          setSaveSuccess(true);
          if (onNotify) {
            onNotify(`Imported branding profile for ${updated.appName}!`);
          }
        }
      } catch (err: any) {
        setImportError('Invalid branding JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 p-5 sm:p-6 rounded-2xl text-white shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
              <Palette className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                  School Branding & White-Label Customizer
                </h3>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
                  <span className={`w-2 h-2 rounded-full ${isCloudLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                  <Cloud className="w-3 h-3" />
                  <span>{isCloudSyncing ? 'Syncing to Firestore...' : isCloudLive ? 'Firestore Live Sync' : 'Connecting Cloud...'}</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Customize this bursary system with your school's unique name, logo, emblem, theme color, and receipt footer policies. Changes are synced across all bursar devices in real time via Cloud Firestore.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={handleCloudPull}
              disabled={isCloudSyncing}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/10 transition-all cursor-pointer disabled:opacity-50"
              title="Pull latest branding from Cloud Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin text-amber-300' : ''}`} />
              <span>{isCloudSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isCloudSyncing}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              <span>{saveSuccess ? 'Saved & Synced!' : isCloudSyncing ? 'Saving...' : 'Save & Sync Cloud'}</span>
            </button>
          </div>
        </div>
      </div>

      {importError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Main Grid: Left Controls, Right Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Customization Forms (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section 1: School Identity & Names */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Building className="w-4 h-4 text-blue-600" />
                <span>School Identity & Titles</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Shown on Header & Receipts</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full School Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={branding.appName}
                  onChange={(e) => handleFieldChange('appName', e.target.value)}
                  placeholder="e.g. St. Jude Model College"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Short Name / Header Abbreviation <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={branding.shortName}
                    onChange={(e) => handleFieldChange('shortName', e.target.value)}
                    placeholder="e.g. ST. JUDE A/C"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Currency Symbol
                  </label>
                  <input
                    type="text"
                    value={branding.currencySymbol}
                    onChange={(e) => handleFieldChange('currencySymbol', e.target.value)}
                    placeholder="e.g. ₦, $, £, €, GHS"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tagline / Motto / Subtitle
                </label>
                <input
                  type="text"
                  value={branding.tagline}
                  onChange={(e) => handleFieldChange('tagline', e.target.value)}
                  placeholder="e.g. Automated School Fee & Bursary Management System"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Logo & Emblem Customizer */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <ImageIcon className="w-4 h-4 text-purple-600" />
                <span>School Logo & Emblem Customizer</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Upload, URL, or Presets</span>
            </div>

            {/* Logo Mode Selection */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleFieldChange('logoType', 'preset_emblem')}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  branding.logoType === 'preset_emblem'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Preset Emblem</span>
              </button>

              <button
                type="button"
                onClick={() => handleFieldChange('logoType', 'custom_upload')}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  branding.logoType === 'custom_upload'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>

              <button
                type="button"
                onClick={() => handleFieldChange('logoType', 'url')}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  branding.logoType === 'url'
                    ? 'bg-purple-50 text-purple-700 border-purple-300 ring-2 ring-purple-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Web URL</span>
              </button>
            </div>

            {/* Mode A: Preset Heraldic Emblems */}
            {branding.logoType === 'preset_emblem' && (
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-700">Choose an Academic Emblem:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_EMBLEMS.map((emblem) => {
                    const isSelected = branding.presetEmblem === emblem.id;
                    return (
                      <button
                        key={emblem.id}
                        type="button"
                        onClick={() => handleFieldChange('presetEmblem', emblem.id)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-50 border-purple-400 text-purple-900 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shadow-xs"
                          style={{ backgroundColor: branding.emblemColor || branding.primaryColor }}
                        >
                          <span className="text-white">{emblem.icon}</span>
                        </div>
                        <span className="text-[11px] font-bold text-center leading-tight">{emblem.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode B: Upload Image File */}
            {branding.logoType === 'custom_upload' && (
              <div className="space-y-3 pt-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoFileUpload}
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/40 p-6 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">Click to upload school logo from your device</p>
                  <p className="text-[10px] text-slate-500 mt-1">PNG, JPG, SVG or WEBP (Max 2MB)</p>
                  {branding.customLogoData && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Custom Logo Uploaded</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode C: External Image URL */}
            {branding.logoType === 'url' && (
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold text-slate-700">School Logo Image URL:</label>
                <input
                  type="url"
                  value={branding.customLogoData || ''}
                  onChange={(e) => handleFieldChange('customLogoData', e.target.value)}
                  placeholder="https://example-school.edu/logo.png"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:border-purple-500 outline-hidden"
                />
                <p className="text-[10px] text-slate-500">Provide any public HTTPS URL hosting your school crest or logo.</p>
              </div>
            )}
          </div>

          {/* Section 3: Theme Color Palette */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Palette className="w-4 h-4 text-emerald-600" />
                <span>Primary Accent Theme Color</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 font-bold">{branding.primaryColor}</span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_COLORS.map((c) => {
                const isSelected = branding.primaryColor.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    onClick={() => {
                      handleFieldChange('primaryColor', c.hex);
                      handleFieldChange('emblemColor', c.hex);
                    }}
                    className={`h-10 rounded-xl ${c.bgClass} flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-xs ${
                      isSelected ? 'ring-3 ring-offset-2 ring-slate-800 scale-105' : ''
                    }`}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="text-xs font-bold text-slate-700 shrink-0">Custom Hex Code:</label>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => {
                    handleFieldChange('primaryColor', e.target.value);
                    handleFieldChange('emblemColor', e.target.value);
                  }}
                  className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={branding.primaryColor}
                  onChange={(e) => {
                    handleFieldChange('primaryColor', e.target.value);
                    handleFieldChange('emblemColor', e.target.value);
                  }}
                  placeholder="#0044B5"
                  className="w-32 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 font-bold"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Official School Contact & Receipt Details */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <FileText className="w-4 h-4 text-amber-600" />
                <span>Official Receipt & Contact Credentials</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Printed on all fee vouchers</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  School Campus Physical Address
                </label>
                <input
                  type="text"
                  value={branding.schoolAddress}
                  onChange={(e) => handleFieldChange('schoolAddress', e.target.value)}
                  placeholder="e.g. Plot 4, Government College Road, Keffi"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bursary Official Phone
                  </label>
                  <input
                    type="text"
                    value={branding.schoolPhone}
                    onChange={(e) => handleFieldChange('schoolPhone', e.target.value)}
                    placeholder="+234 800 000 0000"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bursary Official Email
                  </label>
                  <input
                    type="email"
                    value={branding.schoolEmail}
                    onChange={(e) => handleFieldChange('schoolEmail', e.target.value)}
                    placeholder="bursary@yourschool.edu.ng"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ministry / Tax / Reg No.
                  </label>
                  <input
                    type="text"
                    value={branding.taxOrRegNo}
                    onChange={(e) => handleFieldChange('taxOrRegNo', e.target.value)}
                    placeholder="MOE/NAS/SEC/2026/894"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Signatory Stamp Title
                  </label>
                  <input
                    type="text"
                    value={branding.bursarTitle}
                    onChange={(e) => handleFieldChange('bursarTitle', e.target.value)}
                    placeholder="Authorized Bursar / Accounts Officer"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Receipt Footer Disclaimer Note
                </label>
                <textarea
                  rows={2}
                  value={branding.receiptFooterText}
                  onChange={(e) => handleFieldChange('receiptFooterText', e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Profile Import / Export & Reset Actions */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={profileImportInputRef}
                onChange={handleImportProfile}
                accept="application/json"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => profileImportInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Profile (.json)</span>
              </button>

              <button
                type="button"
                onClick={handleExportProfile}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Profile</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 border border-red-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>
          </div>

        </div>

        {/* Right Column: Live Interactive Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs sticky top-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span>Live Interactive Preview</span>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('header')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    activePreviewTab === 'header' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Header
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('receipt')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    activePreviewTab === 'receipt' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('login')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    activePreviewTab === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Login Card
                </button>
              </div>
            </div>

            {/* Preview Display: Header */}
            {activePreviewTab === 'header' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Navigation Header Look
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <DGOSLogo size="sm" overrideBranding={branding} />
                    <div className="flex flex-col">
                      <h4 className="text-sm font-black tracking-tight text-slate-900 uppercase leading-none">
                        {branding.shortName || 'SCHOOL A/C'}
                      </h4>
                      <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase mt-0.5 truncate max-w-[150px]">
                        {branding.appName}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Online
                  </span>
                </div>
              </div>
            )}

            {/* Preview Display: Receipt */}
            {activePreviewTab === 'receipt' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Official Printable Receipt Header
                </div>
                <div className="bg-white p-4 rounded-xl border-2 border-dashed border-slate-300 space-y-3 text-center">
                  <div className="flex flex-col items-center">
                    <DGOSLogo size="md" overrideBranding={branding} className="mb-2" />
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      {branding.appName}
                    </h3>
                    <p className="text-[10px] font-medium text-slate-500 max-w-[240px]">
                      {branding.schoolAddress}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Tel: {branding.schoolPhone} • Reg: {branding.taxOrRegNo}
                    </p>
                  </div>

                  <div className="py-1 px-3 bg-slate-100 rounded-md text-[10px] font-bold text-slate-700 uppercase tracking-widest inline-block">
                    Official Bursary Payment Receipt
                  </div>

                  <div className="border-t border-b border-slate-100 py-2 text-[10px] text-left space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>Student: <strong>Adebayo Musa</strong></span>
                      <span>Class: <strong>SS 2</strong></span>
                    </div>
                    <div className="flex justify-between">
                      <span>Receipt: <strong>RCP-2026-0042</strong></span>
                      <span>Amount: <strong className="text-emerald-700 font-black">{branding.currencySymbol} 45,000</strong></span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[8px] text-slate-400">
                    <span>{branding.bursarTitle}</span>
                    <span className="font-mono">VALIDATED ★</span>
                  </div>
                </div>
              </div>
            )}

            {/* Preview Display: Login Card */}
            {activePreviewTab === 'login' && (
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Portal Login Screen
                </div>
                <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 text-center space-y-2">
                  <div className="flex justify-center">
                    <DGOSLogo size="lg" overrideBranding={branding} />
                  </div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">
                    {branding.appName}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {branding.tagline}
                  </p>
                  <div className="pt-2">
                    <div
                      className="py-2 px-3 rounded-lg text-white font-bold text-xs"
                      style={{ backgroundColor: branding.primaryColor }}
                    >
                      Bursar Account Access
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Changes apply immediately</span>
              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
