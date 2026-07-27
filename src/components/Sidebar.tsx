import React, { useState } from 'react';
import { LayoutDashboard, Calendar, Package, Menu, X } from 'lucide-react';

interface SidebarProps {
  currentTab: 'dashboard' | 'calendar' | 'inventory';
  onTabChange: (tab: 'dashboard' | 'calendar' | 'inventory') => void;
}

export default function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Booking Calendar', icon: Calendar },
    { id: 'inventory', label: 'Inventory', icon: Package },
  ] as const;

  const handleSelectTab = (tab: 'dashboard' | 'calendar' | 'inventory') => {
    onTabChange(tab);
    setIsMobileDrawerOpen(false);
  };

  return (
    <>
      {/* Mobile Hamburger Menu Button */}
      <div className="sm:hidden fixed top-2.5 left-2.5 z-40">
        <button
          onClick={() => setIsMobileDrawerOpen(true)}
          className="p-2 bg-slate-900 text-slate-100 rounded-lg shadow-md border border-slate-800 flex items-center justify-center cursor-pointer active:scale-95 transition"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5 text-indigo-400" />
        </button>
      </div>

      {/* Mobile Slide-Over Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 sm:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Sheet */}
          <div className="relative w-64 bg-slate-900 text-slate-100 min-h-full flex flex-col justify-between shadow-2xl z-10 p-5 animate-slide-in">
            <div className="flex flex-col">
              {/* Brand Header with Close Button */}
              <div className="pb-4 border-b border-slate-800 flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 font-sans"></span>
                  <span className="font-sans font-black tracking-wider text-sm uppercase text-slate-100">Hotel PMS</span>
                </div>
                <button
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Elements */}
              <div className="space-y-2 mt-5">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20'
                          : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-3xs text-slate-500 font-mono uppercase tracking-wider text-center">
              Mobile Core
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <div className="hidden sm:flex w-64 bg-slate-900 text-slate-100 flex-col justify-between border-r border-slate-800 min-h-screen shrink-0" id="app_sidebar_control">
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="p-6 border-b border-slate-800 flex flex-col gap-1 select-none">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 font-sans"></span>
              <span className="font-sans font-black tracking-wider text-sm uppercase text-slate-100">Hotel PMS</span>
            </div>
            <span className="text-3xs text-slate-400 font-mono uppercase tracking-widest mt-0.5">Desktop Core</span>
          </div>

          {/* Navigation Elements */}
          <div className="p-4 space-y-1.5 flex-1 mt-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/10'
                      : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-300'}`} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}



