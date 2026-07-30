import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, ChevronDown } from 'lucide-react';
import { Room, Booking } from '../types';
import { exportOccupancySheet } from '../utils/exportOccupancySheet';

interface ExportOccupancyButtonProps {
  rooms: Room[];
  bookings: Booking[];
  currentMonth: Date;
  variant?: 'desktop' | 'mobile';
}

export default function ExportOccupancyButton({
  rooms,
  bookings,
  currentMonth,
  variant = 'desktop',
}: ExportOccupancyButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (type: 'pdf' | 'jpeg') => {
    setIsOpen(false);
    setIsExporting(true);
    try {
      await exportOccupancySheet({
        rooms,
        bookings,
        currentMonth,
        exportType: type,
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (variant === 'mobile') {
    return (
      <div className="relative inline-block text-left" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isExporting}
          className="px-1.5 py-0.5 bg-emerald-600 active:bg-emerald-700 text-white text-[10px] font-extrabold rounded shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
          title="Export Occupancy Sheet"
        >
          {isExporting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          <span>Export</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-80" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1 w-36 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden text-[11px] font-sans font-bold text-slate-100 animate-fadeIn backdrop-blur-md">
            <button
              onClick={() => handleExport('pdf')}
              className="w-full px-2.5 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition border-b border-slate-800"
            >
              <FileText className="w-3.5 h-3.5 text-red-400" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={() => handleExport('jpeg')}
              className="w-full px-2.5 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition"
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Export JPEG</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Desktop variant
  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
        title="Export Monthly Occupancy Sheet (PDF / JPEG)"
      >
        {isExporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        <span>Export</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-80" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden text-xs font-semibold text-gray-800 animate-fadeIn py-1">
          <button
            onClick={() => handleExport('pdf')}
            className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 flex items-center gap-2.5 cursor-pointer transition"
          >
            <FileText className="w-4 h-4 text-red-500" />
            <div className="flex flex-col">
              <span className="font-bold text-gray-900">Export PDF</span>
              <span className="text-[10px] text-gray-400 font-normal">A4 Landscape Report</span>
            </div>
          </button>
          <div className="border-t border-gray-100 my-0.5"></div>
          <button
            onClick={() => handleExport('jpeg')}
            className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 flex items-center gap-2.5 cursor-pointer transition"
          >
            <ImageIcon className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col">
              <span className="font-bold text-gray-900">Export JPEG</span>
              <span className="text-[10px] text-gray-400 font-normal">High Resolution Image</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
