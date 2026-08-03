export interface RoomTimelineSegment {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  rooms: number[];   // list of room numbers
}

export function parsePaymentMetadata(remarksStr: string): { totalAmount: number; advancePaid: number; cleanRemarks: string } {
  if (!remarksStr) return { totalAmount: 0, advancePaid: 0, cleanRemarks: '' };
  
  const match = remarksStr.match(/\[PAYMENT:total=([\d.]+),advance=([\d.]+)\]/);
  if (match) {
    const totalAmount = Number(match[1]) || 0;
    const advancePaid = Number(match[2]) || 0;
    const cleanRemarks = remarksStr.replace(/\[PAYMENT:total=[\d.]+,advance=[\d.]+\]\s*/, '').trim();
    return { totalAmount, advancePaid, cleanRemarks };
  }
  
  return { totalAmount: 0, advancePaid: 0, cleanRemarks: remarksStr };
}

/**
 * Parses [ROOM_TIMELINE:[...]] from a remarks string.
 */
export function parseRoomTimeline(remarksStr: string): {
  timeline: RoomTimelineSegment[];
  cleanRemarks: string;
} {
  if (!remarksStr) return { timeline: [], cleanRemarks: '' };

  const match = remarksStr.match(/\[ROOM_TIMELINE:(.*?)\]/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanRemarks = remarksStr.replace(/\[ROOM_TIMELINE:.*?\]\s*/, '').trim();
      return { timeline: Array.isArray(parsed) ? parsed : [], cleanRemarks };
    } catch (e) {
      console.error('Error parsing room timeline JSON:', e);
    }
  }
  return { timeline: [], cleanRemarks: remarksStr };
}

/**
 * Encodes a room timeline array into [ROOM_TIMELINE:[...]] string.
 */
export function encodeRoomTimeline(timeline: RoomTimelineSegment[]): string {
  if (!timeline || timeline.length === 0) return '';
  return `[ROOM_TIMELINE:${JSON.stringify(timeline)}]`;
}

/**
 * Adds N days to YYYY-MM-DD string and returns YYYY-MM-DD
 */
export function addDaysYMD(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const cleanStr = dateStr.split('T')[0].trim();
  const [y, m, d] = cleanStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Combines existing payment metadata, timeline metadata, and clean remarks string.
 */
export function buildCombinedRemarks(
  cleanUserRemarks: string,
  timeline?: RoomTimelineSegment[],
  paymentMeta?: { totalAmount: number; advancePaid: number }
): string {
  let result = '';

  if (paymentMeta && (paymentMeta.totalAmount > 0 || paymentMeta.advancePaid > 0)) {
    result += `[PAYMENT:total=${paymentMeta.totalAmount},advance=${paymentMeta.advancePaid}]`;
  }

  if (timeline && timeline.length > 0) {
    result += encodeRoomTimeline(timeline);
  }

  if (cleanUserRemarks && cleanUserRemarks.trim()) {
    result += (result ? ' ' : '') + cleanUserRemarks.trim();
  }

  return result;
}

export interface RoomInterval {
  roomNumber: number;
  startDate: string;
  endDate: string;
}

/**
 * Extracts merged date intervals for each room from a timeline array.
 */
export function getRoomIntervalsFromTimeline(
  timeline: RoomTimelineSegment[],
  defaultCheckIn: string,
  defaultCheckOut: string,
  allocatedRooms: number[]
): RoomInterval[] {
  if (!timeline || timeline.length === 0) {
    return Array.from(new Set(allocatedRooms)).map((r) => ({
      roomNumber: r,
      startDate: defaultCheckIn,
      endDate: defaultCheckOut,
    }));
  }

  const roomIntervalMap = new Map<number, { startDate: string; endDate: string }[]>();

  for (const seg of timeline) {
    const segStart = (seg.startDate || '').split('T')[0].trim();
    const segEnd = (seg.endDate || '').split('T')[0].trim();
    if (!segStart || !segEnd) continue;

    for (const rNum of seg.rooms || []) {
      if (!roomIntervalMap.has(rNum)) {
        roomIntervalMap.set(rNum, []);
      }
      roomIntervalMap.get(rNum)!.push({ startDate: segStart, endDate: segEnd });
    }
  }

  for (const rNum of allocatedRooms) {
    if (!roomIntervalMap.has(rNum) && rNum > 0) {
      roomIntervalMap.set(rNum, [{ startDate: defaultCheckIn, endDate: defaultCheckOut }]);
    }
  }

  const results: RoomInterval[] = [];

  for (const [rNum, intervals] of roomIntervalMap.entries()) {
    intervals.sort((a, b) => a.startDate.localeCompare(b.startDate));

    const merged: { startDate: string; endDate: string }[] = [];
    for (const curr of intervals) {
      if (merged.length === 0) {
        merged.push({ ...curr });
      } else {
        const last = merged[merged.length - 1];
        if (last.endDate === curr.startDate) {
          last.endDate = curr.endDate;
        } else if (curr.startDate < last.endDate) {
          if (curr.endDate > last.endDate) {
            last.endDate = curr.endDate;
          }
        } else {
          merged.push({ ...curr });
        }
      }
    }

    for (const item of merged) {
      results.push({
        roomNumber: rNum,
        startDate: item.startDate,
        endDate: item.endDate,
      });
    }
  }

  return results;
}

