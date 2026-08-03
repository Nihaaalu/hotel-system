import React, { useState, useEffect } from 'react';
import { Menu, RefreshCw } from 'lucide-react';
import Sidebar, { AppTab } from './components/Sidebar';
import Dashboard from './components/Dashboard';
import BookingCalendar from './components/BookingCalendar';
import BookingModal from './components/BookingModal';
import Inventory from './components/Inventory';
import SalaryRent from './components/SalaryRent';
import Irshad from './components/Irshad';
import Dues from './components/Dues';
import Analytics from './components/Analytics';
import ReminderModal from './components/ReminderModal';
import { useHotelData } from './context/HotelContext';

const VALID_TABS: AppTab[] = ['dashboard', 'calendar', 'inventory', 'salary-rent', 'irshad', 'dues', 'analytics'];

function getInitialTab(): AppTab {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '') as AppTab;
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
    const saved = localStorage.getItem('pms_active_tab') as AppTab;
    if (saved && VALID_TABS.includes(saved)) {
      return saved;
    }
  }
  return 'dashboard';
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<AppTab>(getInitialTab);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const { bookings, refreshData } = useHotelData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync route and localStorage
  const handleTabChange = (tab: AppTab) => {
    setCurrentTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pms_active_tab', tab);
      if (window.location.hash !== `#${tab}`) {
        window.history.pushState(null, '', `#${tab}`);
      }
    }
  };

  useEffect(() => {
    const handleLocationChange = () => {
      const hash = window.location.hash.replace('#', '') as AppTab;
      if (VALID_TABS.includes(hash)) {
        setCurrentTab(hash);
        localStorage.setItem('pms_active_tab', hash);
      }
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pms_active_tab', currentTab);
      if (window.location.hash !== `#${currentTab}`) {
        window.history.replaceState(null, '', `#${currentTab}`);
      }
    }
  }, [currentTab]);

  // Modal controllers
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [modalInitialRoom, setModalInitialRoom] = useState<number | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<string | null>(null);

  // Trigger state to let children refresh their active datasets
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAdminMode] = useState(true);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      setRefreshTrigger((prev) => prev + 1);
      await refreshData();
    } catch (err) {
      console.error('Error refreshing page data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    refreshData();
  };

  // Open booking in modal for viewing/check-in/check-out/payments
  const handleSelectBooking = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setModalInitialRoom(null);
    setModalInitialDate(null);
    setIsModalOpen(true);
  };

  // Open empty booking modal prefilled with selected room number and date
  const handleSelectCell = (roomNumber: number, dateStr: string) => {
    setSelectedBookingId(null);
    setModalInitialRoom(roomNumber);
    setModalInitialDate(dateStr);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedBookingId(null);
    setModalInitialRoom(null);
    setModalInitialDate(null);
  };

  const currentLocalTime = new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const getShiftName = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'Morning Shift';
    if (hour >= 14 && hour < 22) return 'Afternoon Shift';
    return 'Night Shift';
  };

  return (
    <div className="flex bg-slate-50 min-h-screen text-gray-800 font-sans antialiased overflow-x-hidden" id="pms_core_root">
      
      {/* 1. Sidebar Panel */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        isMobileDrawerOpen={isMobileDrawerOpen}
        setIsMobileDrawerOpen={setIsMobileDrawerOpen}
      />

      {/* 2. Main Desk Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden" id="desk_viewport">
        
        {/* Unified Top Navigation Header */}
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 py-3 shrink-0 flex items-center justify-between gap-3 h-14 sm:h-16 select-none">
          {/* Left: Menu Button & Page Title with 16px (1rem/gap-4) Spacing */}
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="sm:hidden w-8 h-8 bg-slate-900 text-slate-100 rounded-lg shadow-2xs border border-slate-800 flex items-center justify-center cursor-pointer active:scale-95 transition shrink-0 hover:bg-slate-800"
              aria-label="Open Navigation Menu"
              title="Open Navigation"
            >
              <Menu className="w-4 h-4 text-indigo-400" />
            </button>

            <h1 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight capitalize truncate min-w-0">
              {currentTab === 'dashboard' && 'Dashboard'}
              {currentTab === 'calendar' && 'Booking Calendar'}
              {currentTab === 'inventory' && 'Expense Ledger'}
              {currentTab === 'salary-rent' && 'Employee Salary & Property Rent'}
              {currentTab === 'irshad' && 'Irshad Wallet & Settlement Ledger'}
              {currentTab === 'dues' && 'Customer Dues Ledger'}
              {currentTab === 'analytics' && 'Financial Analytics & Expense Breakdown'}
            </h1>
          </div>

          {/* Right: Refresh Button & Operator Badge & Avatar */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Refresh Button on Header */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-slate-200 shrink-0 shadow-2xs"
              aria-label="Refresh Page Data"
              title="Refresh current page data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            {/* Operator info label */}
            <div className="hidden md:block text-right border-r border-gray-100 pr-3">
              <span className="text-3xs font-semibold text-gray-400 font-mono uppercase block">Time Shift</span>
              <span className="text-xs font-bold font-mono text-gray-800">{currentLocalTime} • {getShiftName()}</span>
            </div>

            <div className="flex items-center gap-2" id="operator_badge">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-slate-100 flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                AD
              </div>
              <div className="hidden lg:block">
                <span className="text-3xs font-semibold text-gray-400 font-mono uppercase block">
                  System Admin
                </span>
                <span className="text-xs font-bold text-gray-800">
                  Room Keys Desk
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Panel Content Area */}
        <main className="flex-1 p-0 sm:p-5 lg:p-8 overflow-y-auto overflow-x-hidden" id="panel_content_viewport">
          
          {/* Active Tab Screen Routing */}
          <div className="max-w-7xl mx-auto space-y-0 sm:space-y-6">
            
            {currentTab === 'dashboard' && (
              <Dashboard
                onSelectBooking={handleSelectBooking}
                onSelectCell={handleSelectCell}
                onNavigateToCalendar={() => handleTabChange('calendar')}
                refreshTrigger={refreshTrigger}
              />
            )}

            {currentTab === 'calendar' && (
              <BookingCalendar
                onSelectCell={handleSelectCell}
                onSelectBooking={handleSelectBooking}
                refreshTrigger={refreshTrigger}
              />
            )}

            {currentTab === 'inventory' && (
              <Inventory refreshTrigger={refreshTrigger} />
            )}

            {currentTab === 'salary-rent' && (
              <SalaryRent refreshTrigger={refreshTrigger} />
            )}

            {currentTab === 'irshad' && (
              <Irshad refreshTrigger={refreshTrigger} />
            )}

            {currentTab === 'dues' && (
              <Dues refreshTrigger={refreshTrigger} />
            )}

            {currentTab === 'analytics' && (
              <Analytics refreshTrigger={refreshTrigger} />
            )}
            
          </div>
        </main>
      </div>

      {/* 3. Booking Reservation creation / modification modal sheet */}
      {isModalOpen && (
        <BookingModal
          bookingId={selectedBookingId}
          initialRoomNumber={modalInitialRoom}
          initialCheckInDate={modalInitialDate}
          isAdminMode={isAdminMode}
          onClose={handleModalClose}
          onSuccess={triggerRefresh}
        />
      )}

      {/* Automatic Check-In / Check-Out Reminder Modal */}
      <ReminderModal
        bookings={bookings}
        onSelectBooking={handleSelectBooking}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}
