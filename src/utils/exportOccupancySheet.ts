import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Room, Booking } from '../types';

interface ExportOccupancySheetOptions {
  rooms: Room[];
  bookings: Booking[];
  currentMonth: Date;
  exportType: 'pdf' | 'jpeg';
}

/**
 * Generates an A4 Landscape Occupancy Register report for the current selected month
 * directly from live Supabase data in memory and triggers immediate browser download.
 */
export async function exportOccupancySheet({
  rooms,
  bookings,
  currentMonth,
  exportType,
}: ExportOccupancySheetOptions): Promise<void> {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long' });
  const yearStr = String(year);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // YYYY-MM-DD formatter
  const formatYMD = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const todayObj = new Date();
  const todayYMD = formatYMD(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());

  // Generate days array for month
  const daysList = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const ymd = formatYMD(year, month, d);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // Sun or Sat
    const isToday = ymd === todayYMD;
    daysList.push({
      dayNum: d,
      formattedDayNum: String(d).padStart(2, '0'),
      ymd,
      dayName,
      isWeekend,
      isToday,
    });
  }

  // Find booking for room and date
  const getBookingForRoomAndDate = (roomNumber: number, dateYMD: string) => {
    // 1. Active bookings first
    const active = bookings.find((b) => {
      if (b.roomNumber !== roomNumber) return false;
      if (b.status === 'cancelled') return false;
      return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
    });
    if (active) return active;

    // 2. Check for cancelled bookings
    const cancelled = bookings.find((b) => {
      if (b.roomNumber !== roomNumber) return false;
      if (b.status !== 'cancelled') return false;
      return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
    });
    return cancelled || null;
  };

  // Create temporary container element off-screen
  const exportContainer = document.createElement('div');
  exportContainer.id = 'temp_occupancy_export_sheet';
  
  // A4 Landscape Aspect Ratio styling: 1414px x 1000px
  Object.assign(exportContainer.style, {
    position: 'fixed',
    left: '-9999px',
    top: '-9999px',
    width: '1414px',
    height: '1000px',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    justify: 'space-between',
    zIndex: '-9999',
    overflow: 'hidden',
  });

  const nowFormatted = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Calculate row height dynamically to guarantee 100% 1-page fit
  const headerSectionHeight = 65;
  const footerSectionHeight = 40;
  const totalGridAvailableHeight = 1000 - 40 - headerSectionHeight - footerSectionHeight; // ~855px
  const rowCount = daysInMonth + 1; // days + header row
  const rowHeightPx = Math.max(14, Math.floor(totalGridAvailableHeight / rowCount));
  const fontSizePx = Math.max(7, Math.min(10, Math.floor(rowHeightPx * 0.52)));

  // Truncate guest name if long
  const formatGuestName = (name: string) => {
    if (!name) return '';
    const clean = name.trim().toUpperCase();
    if (clean.length > 12) {
      return clean.substring(0, 9) + '...';
    }
    return clean;
  };

  // Build HTML Content
  exportContainer.innerHTML = `
    <!-- 1. TOP HEADER -->
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0F172A; padding-bottom: 10px; height: 55px; box-sizing: border-box;">
      <div>
        <h1 style="font-size: 20px; font-weight: 900; margin: 0; color: #0F172A; tracking-tight: -0.5px; text-transform: uppercase;">
          Grand Horizon Hotel & Resort
        </h1>
        <div style="font-size: 13px; font-weight: 800; color: #475569; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;">
          Monthly Room Occupancy Register
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 18px; font-weight: 900; color: #1E293B; text-transform: uppercase;">
          ${monthName} ${yearStr}
        </div>
        <div style="font-size: 10px; font-weight: 600; color: #64748B; margin-top: 2px;">
          Generated: ${nowFormatted} • Live Supabase Register
        </div>
      </div>
    </div>

    <!-- 2. OCCUPANCY MATRIX GRID TABLE -->
    <div style="flex: 1; margin-top: 8px; margin-bottom: 8px; overflow: hidden; display: flex;">
      <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-family: monospace;">
        <thead>
          <tr style="height: ${rowHeightPx}px;">
            <th style="width: 80px; background-color: #0F172A; color: #FFFFFF; font-size: ${fontSizePx + 1}px; font-weight: 900; border: 1px solid #334155; text-align: center; vertical-align: middle;">
              DATE
            </th>
            ${rooms
              .map(
                (room) => `
              <th style="background-color: #1E293B; color: #FFFFFF; font-size: ${fontSizePx + 1}px; font-weight: 900; border: 1px solid #334155; text-align: center; vertical-align: middle;">
                ${room.number}
              </th>
            `
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${daysList
            .map((day) => {
              // Date cell styling
              let dateCellBg = '#F8FAFC';
              let dateCellColor = '#334155';
              let dateFontWeight = '700';

              if (day.isToday) {
                dateCellBg = '#DC2626';
                dateCellColor = '#FFFFFF';
                dateFontWeight = '900';
              } else if (day.isWeekend) {
                dateCellBg = '#FEE2E2';
                dateCellColor = '#991B1B';
                dateFontWeight = '800';
              }

              return `
              <tr style="height: ${rowHeightPx}px; ${day.isToday ? 'outline: 2px solid #EF4444; z-index: 10;' : ''}">
                <td style="background-color: ${dateCellBg}; color: ${dateCellColor}; font-size: ${fontSizePx}px; font-weight: ${dateFontWeight}; border: 1px solid #94A3B8; text-align: center; vertical-align: middle; padding: 0;">
                  ${day.formattedDayNum} ${day.dayName.toUpperCase()}
                </td>

                ${rooms
                  .map((room) => {
                    const booking = getBookingForRoomAndDate(room.number, day.ymd);

                    let bg = '#FFFFFF'; // White for available
                    let textColor = '#1E293B';
                    let borderColor = '#CBD5E1';
                    let guestText = '';

                    if (booking) {
                      guestText = formatGuestName(booking.guestName || 'GUEST');

                      if (booking.status === 'checked-in') {
                        bg = '#BBF7D0'; // Green
                        textColor = '#166534';
                        borderColor = '#22C55E';
                      } else if (booking.status === 'checked-out') {
                        bg = '#BFDBFE'; // Blue
                        textColor = '#1E40AF';
                        borderColor = '#3B82F6';
                      } else if (booking.status === 'booked') {
                        bg = '#FEF08A'; // Yellow
                        textColor = '#854D0E';
                        borderColor = '#EAB308';
                      } else if (booking.status === 'cancelled') {
                        bg = '#E5E7EB'; // Grey
                        textColor = '#4B5563';
                        borderColor = '#9CA3AF';
                      }
                    }

                    return `
                      <td style="background-color: ${bg}; color: ${textColor}; font-size: ${fontSizePx}px; font-weight: 800; border: 1px solid ${borderColor}; text-align: center; vertical-align: middle; padding: 0 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${guestText}
                      </td>
                    `;
                  })
                  .join('')}
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- 3. LEGEND & FOOTER SECTION -->
    <div style="display: flex; align-items: center; justify-between: space-between; border-top: 1px solid #CBD5E1; padding-top: 6px; font-size: 10px; font-weight: 700; color: #334155;">
      <!-- Legend badges -->
      <div style="display: flex; items-center; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 2px;"></span>
          <span>Available</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #FEF08A; border: 1px solid #EAB308; border-radius: 2px;"></span>
          <span>Reserved (Yellow)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #BBF7D0; border: 1px solid #22C55E; border-radius: 2px;"></span>
          <span>Checked In (Green)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #BFDBFE; border: 1px solid #3B82F6; border-radius: 2px;"></span>
          <span>Checked Out (Blue)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #E5E7EB; border: 1px solid #9CA3AF; border-radius: 2px;"></span>
          <span>Cancelled (Grey)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #DC2626; border-radius: 2px;"></span>
          <span>Today (Red)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 12px; height: 12px; background: #FEE2E2; border: 1px solid #991B1B; border-radius: 2px;"></span>
          <span>Weekend (Light Red)</span>
        </div>
      </div>

      <div style="font-family: monospace; font-size: 10px; font-weight: 800; color: #64748B;">
        ${rooms.length} ROOMS • ${daysInMonth} DAYS REGISTER
      </div>
    </div>
  `;

  document.body.appendChild(exportContainer);

  try {
    // Wait for DOM layout
    await new Promise((res) => setTimeout(res, 100));

    // Render HTML to high resolution canvas (300 DPI equivalent)
    const canvas = await html2canvas(exportContainer, {
      scale: 2.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
    });

    const fileNameBase = `Hotel_Occupancy_${monthName}_${yearStr}`;

    if (exportType === 'pdf') {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      // A4 Landscape is 297mm x 210mm
      pdf.addImage(imgData, 'PNG', 0, 0, 297, 210);
      pdf.save(`${fileNameBase}.pdf`);
    } else {
      // JPEG
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const downloadLink = document.createElement('a');
      downloadLink.download = `${fileNameBase}.jpg`;
      downloadLink.href = imgData;
      downloadLink.click();
    }
  } catch (err) {
    console.error('Failed to export occupancy sheet:', err);
    alert('Failed to generate export file. Please try again.');
  } finally {
    if (document.body.contains(exportContainer)) {
      document.body.removeChild(exportContainer);
    }
  }
}
