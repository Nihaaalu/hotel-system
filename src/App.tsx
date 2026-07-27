import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import BookingCalendar from './components/BookingCalendar';
import BookingModal from './components/BookingModal';
import { SupabaseRoomService } from './services/dbServices';
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'calendar'>('dashboard');

  useEffect(() => {
    SupabaseRoomService.seedRoomsIfEmpty();
  }, []);
  
  // Modal controllers
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [modalInitialRoom, setModalInitialRoom] = useState<number | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<string | null>(null);

  // Trigger state to let children refresh their active datasets
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
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
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
 
      {/* 2. Main Desk Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden" id="desk_viewport">
        
        {/* Header toolbar */}
        <header className="bg-white border-b border-gray-100 pl-12 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-lg font-extrabold text-gray-900 tracking-tight capitalize select-none truncate">
              {currentTab === 'dashboard' && 'Dashboard'}
              {currentTab === 'calendar' && 'Booking Calendar'}
            </h1>
          </div>
 
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Operator info label */}
            <div className="hidden md:block text-right border-r border-gray-100 pr-4 select-none">
              <span className="text-3xs font-semibold text-gray-400 font-mono uppercase block">Time Shift</span>
              <span className="text-xs font-bold font-mono text-gray-800">{currentLocalTime} • {getShiftName()}</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 select-none">
              <button
                onClick={() => setIsAdminMode(!isAdminMode)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-2xs sm:text-xs font-bold tracking-tight transition duration-150 cursor-pointer ${
                  isAdminMode
                    ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-gray-250 text-gray-700'
                }`}
                title={isAdminMode ? "Disable Admin Mode" : "Enable Admin Mode"}
                id="toggle_admin_button"
              >
                <ShieldCheck className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isAdminMode ? 'text-slate-950' : 'text-gray-400'}`} />
                <span>{isAdminMode ? 'Admin' : 'Staff'}</span>
              </button>

              <div className="flex items-center gap-2 select-none pl-1.5 sm:pl-2 border-l border-gray-150" id="operator_badge">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-slate-100 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                  {isAdminMode ? 'AD' : 'R1'}
                </div>
                <div className="hidden lg:block">
                  <span className="text-3xs font-semibold text-gray-400 font-mono uppercase block">
                    {isAdminMode ? 'System Admin' : 'Receptionist'}
                  </span>
                  <span className="text-xs font-bold text-gray-800">
                    {isAdminMode ? 'Full Privileges' : 'Room Keys Desk'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Panel Content Area */}
        <main className="flex-1 p-2 sm:p-5 lg:p-8 overflow-y-auto overflow-x-hidden" id="panel_content_viewport">
          
          {/* Active Tab Screen Routing */}
          <div className="max-w-7xl mx-auto space-y-3 sm:space-y-6">
            
            {currentTab === 'dashboard' && (
              <Dashboard
                onSelectBooking={handleSelectBooking}
                onSelectCell={handleSelectCell}
                onNavigateToCalendar={() => setCurrentTab('calendar')}
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
    </div>
  );
}

