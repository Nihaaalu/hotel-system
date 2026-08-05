export interface RoomTimelineSegment {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  rooms: number[];   // list of room numbers
}

/**
 * Returns ONLY the clean user-entered guest remarks.
 * Strips all internal system tags ([PAYMENT:...], [ROOM_TIMELINE:...]),
 * ROOM_TIMELINE JSON strings, and internal metadata.
 * If empty, invalid object/array, or only tags, returns "".
 */
export function getCleanGuestRemarks(remarksInput: any): string {
  if (!remarksInput) return '';
  if (typeof remarksInput !== 'string') return '';

  let str = remarksInput.trim();
  if (!str) return '';

  // 1. Strip [PAYMENT:total=...,advance=...]
  str = str.replace(/\[PAYMENT:total=[\d.]+,advance=[\d.]+\]\s*/gi, '');

  // 2. Strip [ROOM_TIMELINE:[...]]
  const tag = '[ROOM_TIMELINE:';
  let tagIdx = str.indexOf(tag);
  while (tagIdx !== -1) {
    const jsonStart = tagIdx + tag.length;
    let depth = 0;
    let jsonEnd = -1;
    let inString = false;
    let escape = false;

    for (let i = jsonStart; i < str.length; i++) {
      const char = str[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '[') {
          depth++;
        } else if (char === ']') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd !== -1) {
      let tagEnd = jsonEnd;
      if (str[tagEnd] === ']') {
        tagEnd++;
      }
      str = (str.slice(0, tagIdx) + str.slice(tagEnd)).trim();
      tagIdx = str.indexOf(tag);
    } else {
      str = str.slice(0, tagIdx).trim();
      break;
    }
  }

  // 3. Strip any unparsed ROOM_TIMELINE or PAYMENT patterns
  str = str.replace(/\[?ROOM_TIMELINE:[\s\S]*?\]\]?/gi, '');
  str = str.replace(/ROOM_TIMELINE:\s*(\[[\s\S]*?\]|\{[\s\S]*?\})/gi, '');
  str = str.replace(/\[PAYMENT:[\s\S]*?\]/gi, '');

  str = str.replace(/\s+/g, ' ').trim();

  // 4. Check if remaining string is pure JSON array or object
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      JSON.parse(str);
      return '';
    } catch (e) {
      // not JSON
    }
  }

  return str;
}

export function parsePaymentMetadata(remarksStr: string): { totalAmount: number; advancePaid: number; cleanRemarks: string } {
  if (!remarksStr || typeof remarksStr !== 'string') return { totalAmount: 0, advancePaid: 0, cleanRemarks: '' };
  
  const match = remarksStr.match(/\[PAYMENT:total=([\d.]+),advance=([\d.]+)\]/);
  const totalAmount = match ? Number(match[1]) || 0 : 0;
  const advancePaid = match ? Number(match[2]) || 0 : 0;
  const cleanRemarks = getCleanGuestRemarks(remarksStr);
  
  return { totalAmount, advancePaid, cleanRemarks };
}

/**
 * Parses [ROOM_TIMELINE:[...]] from a remarks string.
 */
export function parseRoomTimeline(remarksStr: string): {
  timeline: RoomTimelineSegment[];
  cleanRemarks: string;
} {
  if (!remarksStr || typeof remarksStr !== 'string') return { timeline: [], cleanRemarks: '' };

  const cleanRemarks = getCleanGuestRemarks(remarksStr);

  const tag = '[ROOM_TIMELINE:';
  const tagIdx = remarksStr.indexOf(tag);
  if (tagIdx !== -1) {
    const jsonStart = tagIdx + tag.length;
    let depth = 0;
    let jsonEnd = -1;
    let inString = false;
    let escape = false;

    for (let i = jsonStart; i < remarksStr.length; i++) {
      const char = remarksStr[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '[') {
          depth++;
        } else if (char === ']') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    if (jsonEnd !== -1) {
      try {
        const jsonStr = remarksStr.slice(jsonStart, jsonEnd);
        const parsed = JSON.parse(jsonStr);
        return {
          timeline: Array.isArray(parsed) ? parsed : [],
          cleanRemarks,
        };
      } catch (e) {
        console.error('Error parsing room timeline JSON:', e);
      }
    }
  }

  return { timeline: [], cleanRemarks };
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

  const userClean = getCleanGuestRemarks(cleanUserRemarks);
  if (userClean) {
    result += (result ? ' ' : '') + userClean;
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

