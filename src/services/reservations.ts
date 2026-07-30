import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Booking, Guest } from '../types';
import { RoomService } from './rooms';

function logQuery(table: string, action: string, where: string, payload?: any) {
  console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
}

function parsePaymentMetadata(remarksStr: string): { totalAmount: number; advancePaid: number; cleanRemarks: string } {
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
 * Service for managing reservations and reservation_rooms in Supabase.
 * Supabase is the single source of truth for all booking operations.
 */
export const ReservationService = {
  /**
   * Generates a unique group ID for multi-room bookings
   */
  async getNextBookingGroupId(): Promise<string> {
    return `GRP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  },

  /**
   * Fetches all bookings directly from Supabase.
   * Joins 'reservation_rooms' with parent 'reservations'.
   */
  async getBookings(): Promise<Booking[]> {
    if (!isSupabaseConfigured) {
      return [];
    }

    try {
      // 0. Fetch live rooms to map room_id -> room_number
      const rooms = await RoomService.getRooms();
      const roomIdToNumMap = new Map<string | number, number>();
      rooms.forEach((r) => {
        roomIdToNumMap.set(r.id, r.number);
        roomIdToNumMap.set(String(r.id), r.number);
        roomIdToNumMap.set(r.number, r.number);
      });

      // 1. Fetch reservation_rooms
      logQuery('reservation_rooms', 'SELECT', 'ALL');
      const { data: roomsData, error: roomsError } = await supabase
        .from('reservation_rooms')
        .select('*');
      logResponse(roomsData, roomsError);

      if (roomsError) {
        console.error('Error fetching reservation_rooms:', roomsError);
        throw roomsError;
      }

      // 2. Fetch reservations
      logQuery('reservations', 'SELECT', 'ALL');
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select('*');
      logResponse(resData, resError);

      if (resError) {
        console.error('Error fetching reservations:', resError);
        throw resError;
      }

      if (!resData || resData.length === 0) {
        return [];
      }

      // Map parent reservation by ID
      const resMap = new Map<string, any>();
      (resData || []).forEach((r: any) => {
        resMap.set(String(r.id), r);
      });

      if (roomsData && roomsData.length > 0) {
        const bookings: Booking[] = [];

        for (const rr of roomsData) {
          const parentRes = resMap.get(String(rr.reservation_id));
          if (!parentRes) continue; // Skip orphan room reservations if parent doesn't exist

          const isCancelled = rr.cancelled === true || rr.status === 'cancelled' || parentRes.status === 'cancelled';
          const rawStatus = isCancelled ? 'cancelled' : String(rr.status || parentRes.status || 'reserved');
          const mappedStatus: Booking['status'] =
            rawStatus === 'reserved' || rawStatus === 'booked'
              ? 'booked'
              : rawStatus === 'checked_in' || rawStatus === 'checked-in'
              ? 'checked-in'
              : rawStatus === 'checked_out' || rawStatus === 'checked-out'
              ? 'checked-out'
              : rawStatus === 'cancelled'
              ? 'cancelled'
              : 'booked';

          const roomNum =
            roomIdToNumMap.get(rr.room_id) ??
            roomIdToNumMap.get(String(rr.room_id)) ??
            Number(rr.room_id || 0);

          const checkIn = String(parentRes.check_in_date || '');
          const checkOut = String(parentRes.check_out_date || '');
          const name = String(parentRes.booking_name || 'Guest');

          const { totalAmount: parsedTotal, advancePaid: parsedAdvance, cleanRemarks } = parsePaymentMetadata(String(parentRes.remarks || rr.remarks || ''));

          bookings.push({
            id: String(rr.id || `${rr.reservation_id}_${roomNum}`),
            bookingGroupId: String(parentRes.id),
            guestId: String(parentRes.id),
            guestName: name,
            guestPhone: '',
            guestIdProof: '',
            roomNumber: roomNum,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            status: mappedStatus,
            totalAmount: parsedTotal,
            advancePaid: parsedAdvance,
            remarks: cleanRemarks,
            createdAt: String(parentRes.created_at || rr.created_at || new Date().toISOString()),
            updatedAt: String(parentRes.created_at || rr.created_at || new Date().toISOString()),
          });
        }

        if (bookings.length > 0) {
          return bookings;
        }
      }

      // Fallback if reservation_rooms is empty
      const fallbackBookings: Booking[] = resData.map((res: any) => {
        const rawStatus = String(res.status || 'reserved');
        const mappedStatus: Booking['status'] =
          rawStatus === 'reserved' || rawStatus === 'booked'
            ? 'booked'
            : rawStatus === 'checked_in' || rawStatus === 'checked-in'
            ? 'checked-in'
            : rawStatus === 'checked_out' || rawStatus === 'checked-out'
            ? 'checked-out'
            : rawStatus === 'cancelled'
            ? 'cancelled'
            : 'booked';

        const { totalAmount: parsedTotal, advancePaid: parsedAdvance, cleanRemarks } = parsePaymentMetadata(String(res.remarks || ''));

        return {
          id: String(res.id),
          bookingGroupId: String(res.id),
          guestId: String(res.id),
          guestName: String(res.booking_name || 'Guest'),
          guestPhone: '',
          guestIdProof: '',
          roomNumber: 0,
          checkInDate: String(res.check_in_date || ''),
          checkOutDate: String(res.check_out_date || ''),
          status: mappedStatus,
          totalAmount: parsedTotal,
          advancePaid: parsedAdvance,
          remarks: cleanRemarks,
          createdAt: String(res.created_at || new Date().toISOString()),
          updatedAt: String(res.created_at || new Date().toISOString()),
        };
      });

      return fallbackBookings;
    } catch (err: any) {
      console.error('Supabase getBookings exception:', err?.message || err);
      throw err;
    }
  },

  /**
   * Fetches a single booking by ID from Supabase
   */
  async getBookingById(id: string): Promise<Booking | null> {
    const all = await this.getBookings();
    return all.find((b) => b.id === id) || null;
  },

  /**
   * Creates a multi-room or single-room booking directly in Supabase:
   * 1. Inserts 1 row into 'reservations'
   *    { booking_name, remarks, check_in_date, check_out_date, status: "reserved" }
   * 2. Gets returned reservation id.
   * 3. Inserts 1 row into 'reservation_rooms' for EACH selected room:
   *    { reservation_id, room_id, status: "reserved", cancelled: false }
   */
  async createMultiRoomBooking(
    guestData: { name: string; phone?: string; address?: string; idProof?: string },
    selectedRoomNumbers: number[],
    bookingDetails: {
      checkInDate: string;
      checkOutDate: string;
      totalAmount?: number;
      advancePaid?: number;
      remarks?: string;
      bookingGroupId?: string;
    }
  ): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    // 0. Resolve room_number to rooms.id foreign key
    const rooms = await RoomService.getRooms();
    const roomNumToIdMap = new Map<number, string | number>();
    rooms.forEach((r) => {
      roomNumToIdMap.set(r.number, r.id);
    });

    // 1. Insert 1 record into 'reservations'
    const totalAmt = Number(bookingDetails.totalAmount || 0);
    const advPaid = Number(bookingDetails.advancePaid || 0);
    const rawRemarks = bookingDetails.remarks || '';
    const metadataPrefix = totalAmt > 0 || advPaid > 0 ? `[PAYMENT:total=${totalAmt},advance=${advPaid}]` : '';
    const remarksPayload = `${metadataPrefix} ${rawRemarks}`.trim();

    const reservationPayload = {
      booking_name: guestData.name,
      remarks: remarksPayload,
      check_in_date: bookingDetails.checkInDate,
      check_out_date: bookingDetails.checkOutDate,
      status: 'reserved',
    };

    logQuery('reservations', 'INSERT', 'N/A', reservationPayload);
    const { data: resData, error: resError } = await supabase
      .from('reservations')
      .insert(reservationPayload)
      .select()
      .single();
    logResponse(resData, resError);

    if (resError) {
      console.error('Failed to create reservation:', resError);
      throw resError;
    }

    if (!resData || !resData.id) {
      throw new Error('Reservation was created, but returned ID was empty.');
    }

    const resId = String(resData.id);

    // 2. Insert 1 row into 'reservation_rooms' for EACH selected room using room_id (rooms.id)
    const uniqueRoomNumbers = Array.from(new Set(selectedRoomNumbers));
    const roomRows = uniqueRoomNumbers.map((roomNum) => {
      const roomId = roomNumToIdMap.get(roomNum) ?? roomNum;
      return {
        reservation_id: resId,
        room_id: roomId,
        status: 'reserved',
        cancelled: false,
      };
    });

    logQuery('reservation_rooms', 'INSERT', 'N/A', roomRows);
    const { data: roomsData, error: roomsError } = await supabase
      .from('reservation_rooms')
      .insert(roomRows)
      .select();
    logResponse(roomsData, roomsError);

    if (roomsError) {
      console.error('Failed to allocate rooms in database:', roomsError);
      throw roomsError;
    }

    // 3. Insert payment record storing: reservation_id, total_amount, advance_paid, payment_status
    const paymentStatus = advPaid >= totalAmt ? 'paid' : 'pending';

    const paymentPayload = {
      reservation_id: resId,
      total_amount: totalAmt,
      advance_paid: advPaid,
      payment_status: paymentStatus,
      amount: advPaid,
      payment_method: 'cash',
      remarks: bookingDetails.remarks ? `Initial booking: ${bookingDetails.remarks}` : 'Initial booking payment',
    };

    logQuery('payments', 'INSERT', 'N/A', paymentPayload);
    const { data: payData, error: payErr } = await supabase
      .from('payments')
      .insert(paymentPayload)
      .select();
    logResponse(payData, payErr);

    if (payErr) {
      console.warn('Payment insert warning:', payErr);
    }

    // 4. Upsert guest profile in 'profiles' optional table if provided
    if (guestData.name) {
      const profilePayload = {
        name: guestData.name,
        phone: guestData.phone || '',
        address: guestData.address || '',
        id_proof: guestData.idProof || '',
      };
      logQuery('profiles', 'UPSERT', 'N/A', profilePayload);
      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .upsert(profilePayload)
        .select();
      logResponse(profData, profErr);
      if (profErr) {
        console.warn('Profile upsert warning:', profErr);
      }
    }
  },

  /**
   * Compatibility wrapper for single room creation
   */
  async createBooking(
    guestData: Omit<Guest, 'id' | 'createdAt' | 'updatedAt'>,
    bookingData: Omit<Booking, 'id' | 'guestId' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<void> {
    await this.createMultiRoomBooking(
      guestData,
      [bookingData.roomNumber],
      {
        checkInDate: bookingData.checkInDate,
        checkOutDate: bookingData.checkOutDate,
        totalAmount: bookingData.totalAmount,
        advancePaid: bookingData.advancePaid,
        remarks: bookingData.remarks,
        bookingGroupId: bookingData.bookingGroupId,
      }
    );
  },

  /**
   * CHECK-IN GUEST Action:
   * 1. Updates reservation_rooms: status = "checked_in" for selected reservation_id + room_id
   * 2. Updates reservations: status = "checked_in"
   */
  async checkInGuest(
    id: string,
    remarks?: string,
    checkedInBy: string = 'Staff'
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    if (!isSupabaseConfigured) return;

    // Fetch target reservation_room row
    logQuery('reservation_rooms', 'SELECT', `id = ${id}`);
    let { data: roomRow, error: findErr } = await supabase
      .from('reservation_rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    logResponse(roomRow, findErr);

    if (findErr) {
      console.error('Error finding reservation_room row:', findErr);
      throw findErr;
    }

    let reservationId = roomRow?.reservation_id || id;
    let roomId = roomRow?.room_id;

    if (!roomRow) {
      logQuery('reservation_rooms', 'SELECT', `reservation_id = ${id}`);
      const { data: siblingRooms, error: sibErr } = await supabase
        .from('reservation_rooms')
        .select('*')
        .eq('reservation_id', id);
      logResponse(siblingRooms, sibErr);

      if (sibErr) {
        console.error('Error finding sibling reservation_rooms:', sibErr);
        throw sibErr;
      }

      if (siblingRooms && siblingRooms.length > 0) {
        roomRow = siblingRooms[0];
        reservationId = roomRow.reservation_id;
        roomId = roomRow.room_id;
      }
    }

    // 1. Update reservation_rooms: status = "checked_in"
    const rrPayload = { status: 'checked_in', cancelled: false };
    if (roomRow?.id) {
      logQuery('reservation_rooms', 'UPDATE', `id = ${roomRow.id}`, rrPayload);
      const { data: rrData, error: rrErr } = await supabase
        .from('reservation_rooms')
        .update(rrPayload)
        .eq('id', roomRow.id)
        .select();
      logResponse(rrData, rrErr);

      if (rrErr) {
        console.error('Failed to update reservation_rooms status to checked_in:', rrErr);
        throw rrErr;
      }
    } else if (reservationId && roomId) {
      logQuery('reservation_rooms', 'UPDATE', `reservation_id = ${reservationId} AND room_id = ${roomId}`, rrPayload);
      const { data: rrData, error: rrErr } = await supabase
        .from('reservation_rooms')
        .update(rrPayload)
        .match({ reservation_id: reservationId, room_id: roomId })
        .select();
      logResponse(rrData, rrErr);

      if (rrErr) {
        console.error('Failed to update reservation_rooms status to checked_in:', rrErr);
        throw rrErr;
      }
    } else {
      logQuery('reservation_rooms', 'UPDATE', `reservation_id = ${reservationId}`, rrPayload);
      const { data: rrData, error: rrErr } = await supabase
        .from('reservation_rooms')
        .update(rrPayload)
        .eq('reservation_id', reservationId)
        .select();
      logResponse(rrData, rrErr);

      if (rrErr) {
        console.error('Failed to update reservation_rooms status to checked_in:', rrErr);
        throw rrErr;
      }
    }

    // 2. Update reservations: status = "checked_in"
    const resPayload = { status: 'checked_in' };
    logQuery('reservations', 'UPDATE', `id = ${reservationId}`, resPayload);
    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .update(resPayload)
      .eq('id', reservationId)
      .select();
    logResponse(resData, resErr);

    if (resErr) {
      console.error('Failed to update reservations status to checked_in:', resErr);
      throw resErr;
    }

    // 3. Automatically update payment_status = "paid" if pending. Do NOT modify advance_paid or total_amount.
    try {
      logQuery('payments', 'SELECT', `reservation_id = ${reservationId}`);
      const { data: payRows } = await supabase
        .from('payments')
        .select('*')
        .eq('reservation_id', reservationId);

      if (payRows && payRows.length > 0) {
        for (const p of payRows) {
          if (p.payment_status === 'pending' || p.status === 'pending') {
            logQuery('payments', 'UPDATE', `id = ${p.id}`, { payment_status: 'paid' });
            await supabase
              .from('payments')
              .update({ payment_status: 'paid' })
              .eq('id', p.id);
          }
        }
      } else {
        // Create paid payment row if none exists
        const payPayload = {
          reservation_id: reservationId,
          payment_status: 'paid',
          payment_method: 'cash',
          remarks: 'Payment settled automatically at Check-In',
        };
        logQuery('payments', 'INSERT', 'N/A', payPayload);
        await supabase.from('payments').insert(payPayload);
      }
    } catch (payErr) {
      console.warn('Note updating payment_status at check-in:', payErr);
    }
  },

  /**
   * CHECKOUT GUEST Action:
   * Sets status = 'checked_out' in reservation_rooms and reservations.
   * Preserves booking history, payments, and guest details.
   */
  async checkoutGuest(id: string, remarks?: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    logQuery('reservation_rooms', 'SELECT', `id = ${id}`);
    let { data: roomRow } = await supabase
      .from('reservation_rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    let reservationId = roomRow?.reservation_id || id;

    if (roomRow?.id) {
      logQuery('reservation_rooms', 'UPDATE', `id = ${roomRow.id}`, { status: 'checked_out' });
      await supabase
        .from('reservation_rooms')
        .update({ status: 'checked_out' })
        .eq('id', roomRow.id);
    } else if (reservationId) {
      logQuery('reservation_rooms', 'UPDATE', `reservation_id = ${reservationId}`, { status: 'checked_out' });
      await supabase
        .from('reservation_rooms')
        .update({ status: 'checked_out' })
        .eq('reservation_id', reservationId);
    }

    if (reservationId) {
      const { data: siblingRooms } = await supabase
        .from('reservation_rooms')
        .select('status')
        .eq('reservation_id', reservationId);

      const allCheckedOut = !siblingRooms || siblingRooms.every((r) => r.status === 'checked_out' || r.status === 'checked-out');
      if (allCheckedOut) {
        logQuery('reservations', 'UPDATE', `id = ${reservationId}`, { status: 'checked_out' });
        await supabase
          .from('reservations')
          .update({ status: 'checked_out' })
          .eq('id', reservationId);
      }
    }
  },

  /**
   * Helper to delete payments and checkin_logs for a reservation
   */
  async purgeReservationDependencies(reservationId: string): Promise<void> {
    if (!reservationId || !isSupabaseConfigured) return;
    try {
      logQuery('checkin_logs', 'DELETE', `reservation_id = ${reservationId}`);
      await supabase.from('checkin_logs').delete().eq('reservation_id', reservationId);
    } catch (e) {
      // ignore if checkin_logs table does not exist
    }

    try {
      logQuery('payments', 'DELETE', `reservation_id = ${reservationId}`);
      await supabase.from('payments').delete().eq('reservation_id', reservationId);
    } catch (e) {
      console.warn('Error purging payments:', e);
    }
  },

  /**
   * RELEASE THIS ROOM Action:
   * Removes ONLY this room allocation from reservation_rooms.
   * Only deletes parent reservation and dependencies if no remaining rooms exist.
   */
  async releaseRoom(id: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    logQuery('reservation_rooms', 'SELECT', `id = ${id}`);
    const { data: roomRow } = await supabase
      .from('reservation_rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const reservationId = roomRow?.reservation_id || id;

    // Delete reservation_room
    if (roomRow?.id) {
      logQuery('reservation_rooms', 'DELETE', `id = ${roomRow.id}`);
      await supabase.from('reservation_rooms').delete().eq('id', roomRow.id);
    } else if (reservationId) {
      logQuery('reservation_rooms', 'DELETE', `reservation_id = ${reservationId}`);
      await supabase.from('reservation_rooms').delete().eq('reservation_id', reservationId);
    }

    // Delete parent reservation if no remaining rooms
    if (reservationId) {
      const { data: remaining } = await supabase
        .from('reservation_rooms')
        .select('id')
        .eq('reservation_id', reservationId);

      if (!remaining || remaining.length === 0) {
        await this.purgeReservationDependencies(reservationId);
        logQuery('reservations', 'DELETE', `id = ${reservationId}`);
        await supabase.from('reservations').delete().eq('id', reservationId);
      }
    }
  },

  /**
   * Updates booking status ('booked' | 'checked-in' | 'checked-out' | 'cancelled')
   */
  async updateBookingStatus(
    id: string,
    status: Booking['status'] | 'checked_in' | 'checked_out'
  ): Promise<void> {
    if (status === 'checked-in' || status === 'checked_in') {
      return this.checkInGuest(id);
    }
    if (status === 'checked-out' || status === 'checked_out') {
      return this.checkoutGuest(id);
    }
    if (status === 'cancelled') {
      return this.cancelSingleRoom(id);
    }

    if (!isSupabaseConfigured) return;

    logQuery('reservation_rooms', 'SELECT', `id = ${id}`);
    const { data: roomRow, error: findErr } = await supabase
      .from('reservation_rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    logResponse(roomRow, findErr);

    if (findErr) {
      console.error('Error finding reservation_room row:', findErr);
      throw findErr;
    }

    const reservationId = roomRow?.reservation_id || id;

    const rrPayload = { status: 'reserved', cancelled: false };
    logQuery('reservation_rooms', 'UPDATE', `id = ${id}`, rrPayload);
    const { data: rrData, error: rrErr } = await supabase
      .from('reservation_rooms')
      .update(rrPayload)
      .eq('id', id)
      .select();
    logResponse(rrData, rrErr);

    if (rrErr) {
      console.error('Failed to update reservation_rooms status:', rrErr);
      throw rrErr;
    }

    const resPayload = { status: 'reserved' };
    logQuery('reservations', 'UPDATE', `id = ${reservationId}`, resPayload);
    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .update(resPayload)
      .eq('id', reservationId)
      .select();
    logResponse(resData, resErr);

    if (resErr) {
      console.error('Failed to update reservations status:', resErr);
      throw resErr;
    }
  },

  /**
   * Cancels ALL rooms under a parent reservation_id (Group Cancel)
   */
  async cancelEntireReservation(reservationId: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    // Purge dependencies (payments, checkin_logs)
    await this.purgeReservationDependencies(reservationId);

    logQuery('reservation_rooms', 'DELETE', `reservation_id = ${reservationId}`);
    await supabase.from('reservation_rooms').delete().eq('reservation_id', reservationId);

    logQuery('reservations', 'DELETE', `id = ${reservationId}`);
    await supabase.from('reservations').delete().eq('id', reservationId);
  },

  /**
   * Cancels ONLY a single selected room (reservation_rooms row ID)
   */
  async cancelSingleRoom(reservationRoomId: string): Promise<void> {
    await this.releaseRoom(reservationRoomId);
  },

  /**
   * Permanently deletes a booking row from Supabase
   */
  async deleteBooking(id: string): Promise<void> {
    await this.releaseRoom(id);
  },

  /**
   * Replaces the room for a given reservation_rooms row ID
   */
  async replaceRoom(reservationRoomId: string, newRoomNumber: number): Promise<void> {
    if (!isSupabaseConfigured) return;

    // 1. Get room list to find room ID for newRoomNumber
    const rooms = await RoomService.getRooms();
    const targetRoom = rooms.find((r) => r.number === newRoomNumber);
    const newRoomId = targetRoom ? targetRoom.id : newRoomNumber;

    logQuery('reservation_rooms', 'UPDATE', `id = ${reservationRoomId}`, { room_id: newRoomId });
    const { data, error } = await supabase
      .from('reservation_rooms')
      .update({ room_id: newRoomId })
      .eq('id', reservationRoomId)
      .select();

    logResponse(data, error);
    if (error) {
      console.error('Error replacing room in reservation_rooms:', error);
      throw error;
    }
  },

  /**
   * Checks if a room has overlapping active bookings in Supabase
   */
  async checkOverlappingBooking(
    roomNumber: number,
    checkInDate: string,
    checkOutDate: string,
    ignoreBookingId?: string
  ): Promise<boolean> {
    const allBookings = await this.getBookings();

    const activeBookings = allBookings.filter(
      (b) =>
        b.roomNumber === roomNumber &&
        b.status !== 'cancelled' &&
        b.status !== 'checked-out' &&
        b.id !== ignoreBookingId &&
        b.bookingGroupId !== ignoreBookingId
    );

    for (const b of activeBookings) {
      if (checkInDate < b.checkOutDate && checkOutDate > b.checkInDate) {
        return true;
      }
    }

    return false;
  },

  /**
   * EDIT PAYMENT AFTER BOOKING:
   * Updates total_amount and advance_paid for a reservation.
   * Updates 'reservations' remarks metadata and 'payments' table.
   */
  async updateBookingPayment(
    reservationId: string,
    totalAmount: number,
    advancePaid: number
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    if (advancePaid > totalAmount) {
      throw new Error('Advance paid cannot exceed total amount');
    }

    const paymentStatus = advancePaid >= totalAmount ? 'paid' : 'pending';

    // 1. Fetch reservation to get current remarks
    logQuery('reservations', 'SELECT', `id = ${reservationId}`);
    let targetResId = reservationId;
    let { data: resData } = await supabase
      .from('reservations')
      .select('remarks')
      .eq('id', targetResId)
      .maybeSingle();

    if (!resData) {
      const { data: rrData } = await supabase
        .from('reservation_rooms')
        .select('reservation_id')
        .eq('id', targetResId)
        .maybeSingle();
      
      if (rrData?.reservation_id) {
        targetResId = String(rrData.reservation_id);
        const { data: parentRes } = await supabase
          .from('reservations')
          .select('remarks')
          .eq('id', targetResId)
          .maybeSingle();
        resData = parentRes;
      }
    }

    const currentRemarksStr = resData?.remarks || '';
    const { cleanRemarks } = parsePaymentMetadata(currentRemarksStr);
    const newMetadata = `[PAYMENT:total=${totalAmount},advance=${advancePaid}]`;
    const newRemarksPayload = `${newMetadata} ${cleanRemarks}`.trim();

    // 2. Update reservations table
    logQuery('reservations', 'UPDATE', `id = ${targetResId}`, { remarks: newRemarksPayload });
    const { error: resUpdateErr } = await supabase
      .from('reservations')
      .update({ remarks: newRemarksPayload })
      .eq('id', targetResId);

    if (resUpdateErr) {
      console.error('Failed to update reservation remarks for payment edit:', resUpdateErr);
    }

    // 3. Update or insert into payments table
    logQuery('payments', 'SELECT', `reservation_id = ${targetResId}`);
    const { data: payRows } = await supabase
      .from('payments')
      .select('id')
      .eq('reservation_id', targetResId);

    if (payRows && payRows.length > 0) {
      for (const p of payRows) {
        logQuery('payments', 'UPDATE', `id = ${p.id}`, {
          total_amount: totalAmount,
          advance_paid: advancePaid,
          amount: advancePaid,
          payment_status: paymentStatus,
        });
        await supabase
          .from('payments')
          .update({
            total_amount: totalAmount,
            advance_paid: advancePaid,
            amount: advancePaid,
            payment_status: paymentStatus,
          })
          .eq('id', p.id);
      }
    } else {
      const paymentPayload = {
        reservation_id: targetResId,
        total_amount: totalAmount,
        advance_paid: advancePaid,
        amount: advancePaid,
        payment_status: paymentStatus,
        payment_method: 'cash',
        remarks: 'Payment details updated',
      };
      logQuery('payments', 'INSERT', 'N/A', paymentPayload);
      await supabase.from('payments').insert(paymentPayload);
    }
  },

  /**
   * Updates booking details (guestName, checkInDate, checkOutDate, remarks, totalAmount, advancePaid)
   */
  async updateBookingDetails(
    reservationId: string,
    data: {
      guestName?: string;
      checkInDate?: string;
      checkOutDate?: string;
      remarks?: string;
      totalAmount?: number;
      advancePaid?: number;
    }
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    let targetResId = reservationId;
    let { data: resData } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', targetResId)
      .maybeSingle();

    if (!resData) {
      const { data: rrData } = await supabase
        .from('reservation_rooms')
        .select('reservation_id')
        .eq('id', targetResId)
        .maybeSingle();
      if (rrData?.reservation_id) {
        targetResId = String(rrData.reservation_id);
        const { data: parentRes } = await supabase
          .from('reservations')
          .select('*')
          .eq('id', targetResId)
          .maybeSingle();
        resData = parentRes;
      }
    }

    if (!targetResId) return;

    const payload: any = {};
    if (data.checkInDate) payload.check_in_date = data.checkInDate;
    if (data.checkOutDate) payload.check_out_date = data.checkOutDate;

    const currentRemarksStr = resData?.remarks || '';
    const { cleanRemarks, totalAmount: curTotal, advancePaid: curAdvance } = parsePaymentMetadata(currentRemarksStr);

    const finalTotal = data.totalAmount !== undefined ? data.totalAmount : curTotal;
    const finalAdvance = data.advancePaid !== undefined ? data.advancePaid : curAdvance;
    const finalCleanRemarks = data.remarks !== undefined ? data.remarks : cleanRemarks;

    const newMetadata = `[PAYMENT:total=${finalTotal},advance=${finalAdvance}]`;
    payload.remarks = `${newMetadata} ${finalCleanRemarks}`.trim();

    logQuery('reservations', 'UPDATE', `id = ${targetResId}`, payload);
    const { error: updateErr } = await supabase
      .from('reservations')
      .update(payload)
      .eq('id', targetResId);

    if (updateErr) {
      console.error('Failed to update reservation details:', updateErr);
      throw updateErr;
    }

    if (data.guestName && resData?.guest_id) {
      await supabase
        .from('profiles')
        .update({ full_name: data.guestName })
        .eq('id', resData.guest_id);
    }
  },
};
