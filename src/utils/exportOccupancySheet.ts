import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Room, Booking } from '../types';

interface ExportOccupancySheetOptions {
  rooms: Room[];
  bookings: Booking[];
  currentMonth: Date;
  exportType: 'pdf' | 'jpeg';
}

const COUPLE_ROOMS = new Set([101, 102, 103, 201, 202, 203, 204, 205]);

/**
 * Generates an A4 Landscape Occupancy Register report for Dreamy Vacations Resorts
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

  // Generated on: DD/MM/YYYY HH:MM
  const formatGenDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  const genDateStr = formatGenDate(todayObj);

  // Generate days array for month
  const daysList = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const ymd = formatYMD(year, month, d);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const isFriSatSun = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

    daysList.push({
      dayNum: d,
      formattedDayNum: String(d).padStart(2, '0'),
      ymd,
      dayName,
      isFriSatSun,
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
    color: '#000000',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    zIndex: '-9999',
    overflow: 'hidden',
  });

  // Calculate row height dynamically to guarantee 100% 1-page fit
  const headerSectionHeight = 65;
  const footerSectionHeight = 40;
  const totalGridAvailableHeight = 1000 - 40 - headerSectionHeight - footerSectionHeight; // ~855px
  const rowCount = daysInMonth + 1; // days + header row
  const rowHeightPx = Math.max(14, Math.floor(totalGridAvailableHeight / rowCount));
  const baseFontSizePx = Math.max(7, Math.min(10, Math.floor(rowHeightPx * 0.52)));
  // Increased font sizes specifically for dates, weekdays, room headers, and guest names
  const headerFontSizePx = baseFontSizePx + 6;
  const dateFontSizePx = baseFontSizePx + 5;
  const cellFontSizePx = baseFontSizePx + 6;

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
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #444444; padding-bottom: 8px; height: 58px; box-sizing: border-box;">
      <!-- TOP LEFT: MONTH AND YEAR -->
      <div style="flex: 1; text-align: left;">
        <div style="font-size: 22px; font-weight: 900; color: #D32F2F; text-transform: uppercase; letter-spacing: -0.3px;">
          ${monthName} ${yearStr}
        </div>
      </div>

      <!-- CENTER: HOTEL NAME AND REPORT TITLE -->
      <div style="flex: 2; text-align: center;">
        <h1 style="font-size: 24px; font-weight: 900; margin: 0; color: #000000; text-transform: uppercase; letter-spacing: -0.2px;">
          DREAMY VACATIONS RESORTS
        </h1>
        <div style="font-size: 13px; font-weight: 800; color: #444444; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;">
          MONTHLY OCCUPANCY REPORT
        </div>
      </div>

      <!-- TOP RIGHT: GENERATED DATE ONLY -->
      <div style="flex: 1; text-align: right;">
        <div style="font-size: 10px; font-weight: 800; color: #555555; text-transform: uppercase;">
          Generated on:
        </div>
        <div style="font-size: 11px; font-weight: 900; color: #000000; margin-top: 1px;">
          ${genDateStr}
        </div>
      </div>
    </div>

    <!-- 2. OCCUPANCY MATRIX GRID TABLE -->
    <div style="flex: 1; margin-top: 8px; margin-bottom: 8px; overflow: hidden; display: flex;">
      <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-family: monospace;">
        <thead>
          <tr style="height: ${rowHeightPx}px;">
            <th style="width: 80px; background-color: #333333; color: #FFFFFF; font-size: ${headerFontSizePx}px; font-weight: 900; border: 1px solid #444444; text-align: center; vertical-align: middle;">
              <span style="position: relative; top: -6px; display: inline-block;">DATE</span>
            </th>
            ${rooms
              .map((room) => {
                const isCouple = COUPLE_ROOMS.has(Number(room.number));
                const bg = isCouple ? '#FFF4D6' : '#E2E8F0';
                return `
                  <th style="background-color: ${bg}; color: #000000; font-size: ${headerFontSizePx}px; font-weight: 900; border: 1px solid #444444; text-align: center; vertical-align: middle;">
                    <span style="position: relative; top: -6px; display: inline-block;">${room.number}</span>
                  </th>
                `;
              })
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${daysList
            .map((day) => {
              // Date cell styling: Fri/Sat/Sun -> Red (#D32F2F) with white text; Mon-Thu -> White with black text
              const dateCellBg = day.isFriSatSun ? '#D32F2F' : '#FFFFFF';
              const dateCellColor = day.isFriSatSun ? '#FFFFFF' : '#000000';

              return `
              <tr style="height: ${rowHeightPx}px;">
                <td style="background-color: ${dateCellBg}; color: ${dateCellColor}; font-size: ${dateFontSizePx}px; font-weight: 900; border: 1px solid #444444; text-align: center; vertical-align: middle; padding: 0;">
                  <span style="position: relative; top: -6px; display: inline-block;">${day.formattedDayNum} ${day.dayName.toUpperCase()}</span>
                </td>

                ${rooms
                  .map((room) => {
                    const booking = getBookingForRoomAndDate(room.number, day.ymd);
                    const isCouple = COUPLE_ROOMS.has(Number(room.number));

                    let bg = isCouple ? '#FFF4D6' : '#FFFFFF'; // Available
                    let textColor = '#000000';
                    let textDecoration = 'none';
                    let guestText = '';

                    if (booking) {
                      guestText = formatGuestName(booking.guestName || 'GUEST');

                      if (booking.status === 'checked-in') {
                        bg = '#E53935'; // Red
                        textColor = '#FFFFFF';
                      } else if (booking.status === 'checked-out') {
                        bg = isCouple ? '#FFF4D6' : '#FFFFFF'; // White / Cream
                        textColor = '#757575'; // Grey
                        textDecoration = 'line-through'; // Strike-through
                      } else if (booking.status === 'booked') {
                        bg = '#FFF176'; // Yellow
                        textColor = '#000000';
                      } else if (booking.status === 'cancelled') {
                        bg = '#E0E0E0'; // Light Grey
                        textColor = '#616161';
                      }
                    }

                    return `
                      <td style="background-color: ${bg}; color: ${textColor}; text-decoration: ${textDecoration}; font-size: ${cellFontSizePx}px; font-weight: 800; border: 1px solid #444444; text-align: center; vertical-align: middle; padding: 0 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${guestText ? `<span style="position: relative; top: -6px; display: inline-block;">${guestText}</span>` : ''}
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
    <div style="display: flex; align-items: center; justify-content: space-between; border-top: 2px solid #444444; padding-top: 6px; font-size: 11px; font-weight: 700; color: #000000;">
      <!-- Centered Legend Badges -->
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 20px;">
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: #FFFFFF; border: 1px solid #444444; border-radius: 2px;"></span>
          <span style="position: relative; top: -6px; display: inline-block;">White = Available</span>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: #FFF176; border: 1px solid #444444; border-radius: 2px;"></span>
          <span style="position: relative; top: -6px; display: inline-block;">Yellow = Reserved</span>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: #E53935; border: 1px solid #444444; border-radius: 2px;"></span>
          <span style="position: relative; top: -6px; display: inline-block;">Red = Checked In</span>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: #E0E0E0; border: 1px solid #444444; border-radius: 2px;"></span>
          <span style="position: relative; top: -6px; display: inline-block;">Grey = Cancelled</span>
        </div>
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: #FFF4D6; border: 1px solid #444444; border-radius: 2px;"></span>
          <span style="position: relative; top: -6px; display: inline-block;">Cream = Couple Room</span>
        </div>
      </div>

      <div style="font-family: monospace; font-size: 11px; font-weight: 800; color: #444444;">
        <span style="position: relative; top: -6px; display: inline-block;">${rooms.length} ROOMS • ${daysInMonth} DAYS</span>
      </div>
    </div>
  `;

  document.body.appendChild(exportContainer);

  try {
    // Wait for DOM layout
    await new Promise((res) => setTimeout(res, 100));

    // Render HTML to high resolution canvas
    const canvas = await html2canvas(exportContainer, {
      scale: 2.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
    });

    const fileNameBase = `Dreamy_Vacations_Resorts_Occupancy_${monthName}_${yearStr}`;

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

