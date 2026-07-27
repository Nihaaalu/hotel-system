import React from 'react';
import { LayoutDashboard, Calendar, Users, FolderOpen } from 'lucide-react';

interface SidebarProps {
  currentTab: 'dashboard' | 'calendar' | 'onsite' | 'crm';
  onTabChange: (tab: 'dashboard' | 'calendar' | 'onsite' | 'crm') => void;
}

export default function Sidebar({ currentTab, onTabChange }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Booking Calendar', icon: Calendar },
    { id: 'onsite', label: 'Onsite Guests', icon: Users },
    { id: 'crm', label: 'Guest Ledger', icon: FolderOpen },
  ] as const;

  return (
    <div className="w-64 bg-slate-900 text-slate-100 flex flex-col justify-between border-r border-slate-800 min-h-screen" id="app_sidebar_control">
      {/* Upper Module */}
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800 flex flex-col gap-1 select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 font-sans"></span>
            <span className="font-sans font-black tracking-wider text-sm uppercase text-slate-100">Hotel PMS Client</span>
          </div>
          <span className="text-3xs text-slate-400 font-mono uppercase tracking-widest mt-0.5">Desktop Core client</span>
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
  );
}

