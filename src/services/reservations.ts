import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Booking, Guest } from '../types';
import { RoomService } from './rooms';
import { updatePaymentSummary, getCleanReservationId, getCleanRoomRowId } from './paymentSummary';
import { getISTDateStr } from '../utils/formatters';
import { parsePaymentMetadata, parseRoomTimeline, getRoomIntervalsFromTimeline } from '../utils/timeline';

const DEBUG = false;

function logQuery(table: string, action: string, where: string, payload?: any) {
  if (DEBUG) console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  if (DEBUG) console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  if (DEBUG) console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
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
        const rrByResId = new Map<string, any[]>();
        (roomsData || []).forEach((rr: any) => {
          const resIdKey = String(rr.reservation_id);
          if (!rrByResId.has(resIdKey)) {
            rrByResId.set(resIdKey, []);
          }
          rrByResId.get(resIdKey)!.push(rr);
        });

        const bookings: Booking[] = [];

        for (const [resId, rrList] of rrByResId.entries()) {
          const parentRes = resMap.get(resId);
          if (!parentRes) continue;

          const defaultCheckIn = String(parentRes.check_in_date || '').split('T')[0].trim();
          const defaultCheckOut = String(parentRes.check_out_date || '').split('T')[0].trim();

          const allocatedRooms: number[] = [];
          const rrByRoomNum = new Map<number, any>();

          for (const rr of rrList) {
            const roomNum =
              roomIdToNumMap.get(rr.room_id) ??
              roomIdToNumMap.get(String(rr.room_id)) ??
              Number(rr.room_id || 0);

            if (roomNum > 0) {
              allocatedRooms.push(roomNum);
              rrByRoomNum.set(roomNum, rr);
            }
          }

          const { timeline } = parseRoomTimeline(String(parentRes.remarks || ''));
          const intervals = getRoomIntervalsFromTimeline(
            timeline,
            defaultCheckIn,
            defaultCheckOut,
            allocatedRooms
          );

          const { totalAmount: parsedTotal, advancePaid: parsedAdvance, cleanRemarks } = parsePaymentMetadata(String(parentRes.remarks || ''));

          for (const interval of intervals) {
            const rr = rrByRoomNum.get(interval.roomNumber);
            const isCancelled =
              (rr && (rr.cancelled === true || rr.status === 'Cancelled' || rr.status === 'cancelled')) ||
              parentRes.status === 'Cancelled' ||
              parentRes.status === 'cancelled';

            const rawStatus = isCancelled ? 'Cancelled' : String(rr?.status || parentRes.status || 'Booked');
            const mappedStatus: Booking['status'] =
              rawStatus === 'Booked' || rawStatus === 'reserved' || rawStatus === 'booked'
                ? 'booked'
                : rawStatus === 'Checked In' || rawStatus === 'checked_in' || rawStatus === 'checked-in'
                ? 'checked-in'
                : rawStatus === 'Checked Out' || rawStatus === 'checked_out' || rawStatus === 'checked-out'
                ? 'checked-out'
                : rawStatus === 'Cancelled' || rawStatus === 'cancelled'
                ? 'cancelled'
                : 'booked';

            bookings.push({
              id: String(rr?.id ? `${rr.id}_${interval.startDate}` : `${parentRes.id}_${interval.roomNumber}_${interval.startDate}`),
              bookingGroupId: String(parentRes.id),
              guestId: String(parentRes.id),
              guestName: String(parentRes.booking_name || 'Guest'),
              guestPhone: '',
              guestIdProof: '',
              roomNumber: interval.roomNumber,
              checkInDate: interval.startDate,
              checkOutDate: interval.endDate,
              status: mappedStatus,
              totalAmount: parsedTotal,
              advancePaid: parsedAdvance,
              remarks: cleanRemarks,
              createdAt: String(rr?.created_at || parentRes.created_at || new Date().toISOString()),
              updatedAt: String(rr?.created_at || parentRes.created_at || new Date().toISOString()),
            });
          }
        }

        if (bookings.length > 0) {
          return bookings;
        }
      }

      // Fallback if reservation_rooms is empty
      const fallbackBookings: Booking[] = resData.map((res: any) => {
        const isCancelled = res.status === 'Cancelled' || res.status === 'cancelled';
        const rawStatus = isCancelled ? 'Cancelled' : String(res.status || 'Booked');
        const mappedStatus: Booking['status'] =
          rawStatus === 'Booked' || rawStatus === 'reserved' || rawStatus === 'booked'
            ? 'booked'
            : rawStatus === 'Checked In' || rawStatus === 'checked_in' || rawStatus === 'checked-in'
            ? 'checked-in'
            : rawStatus === 'Checked Out' || rawStatus === 'checked_out' || rawStatus === 'checked-out'
            ? 'checked-out'
            : rawStatus === 'Cancelled' || rawStatus === 'cancelled'
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
      status: 'Booked',
    };

    if (DEBUG) console.log('[RESERVATIONS INSERT] Creating reservation with payload:', JSON.stringify(reservationPayload, null, 2));
    logQuery('reservations', 'INSERT', 'N/A', reservationPayload);
    const { data: resDataArr, error: resError } = await supabase
      .from('reservations')
      .insert(reservationPayload)
      .select();
    
    const resData = resDataArr && resDataArr.length > 0 ? resDataArr[0] : null;
    logResponse(resData, resError);

    if (resError) {
      console.error('Failed to create reservation in Supabase:', resError);
      throw new Error(`Failed to create reservation: ${resError.message || JSON.stringify(resError)}`);
    }

    if (!resData || !resData.id) {
      throw new Error('Reservation was created, but returned ID was empty.');
    }

    const resId = resData.id;

    // 2. Insert 1 row into 'reservation_rooms' for EACH selected room using room_id (rooms.id)
    const uniqueRoomNumbers = Array.from(new Set(selectedRoomNumbers));
    const roomRows = uniqueRoomNumbers.map((roomNum) => {
      const roomId = roomNumToIdMap.get(roomNum) ?? roomNum;
      return {
        reservation_id: resId,
        room_id: roomId,
        status: 'Booked',
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
      throw new Error(`Failed to allocate rooms: ${roomsError.message || JSON.stringify(roomsError)}`);
    }

    // 3. Insert payment record using updatePaymentSummary
    await updatePaymentSummary({
      reservationId: resId,
      paymentAmount: advPaid,
      isAdvance: true,
      paymentMethod: 'cash',
      remarks: bookingDetails.remarks ? `Initial booking: ${bookingDetails.remarks}` : 'Initial booking payment',
      options: {
        totalAmount: totalAmt,
      },
    });

    // Guest name and details stored on reservations table
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
    if (!isSupabaseConfigured) return;

    const reservationId = await getCleanReservationId(id);

    // Fetch reservation details to validate check-in date
    const { data: resData } = await supabase
      .from('reservations')
      .select('check_in_date')
      .eq('id', reservationId)
      .maybeSingle();

    if (resData?.check_in_date) {
      const checkInDateYMD = String(resData.check_in_date).split('T')[0].split(' ')[0].trim();
      const todayStr = getISTDateStr();
      if (checkInDateYMD && checkInDateYMD > todayStr) {
        throw new Error('Check-in is not allowed before the reservation date.');
      }
    }

    // 1. Update ALL reservation_rooms for this reservation: status = "Checked In"
    const rrPayload = { status: 'Checked In', cancelled: false };
    logQuery('reservation_rooms', 'UPDATE', `reservation_id = ${reservationId}`, rrPayload);
    const { error: rrErr } = await supabase
      .from('reservation_rooms')
      .update(rrPayload)
      .eq('reservation_id', reservationId);

    if (rrErr) {
      console.error('Failed to update reservation_rooms status to Checked In:', rrErr);
      throw rrErr;
    }

    // 2. Update reservations: status = "Checked In"
    const resPayload = { status: 'Checked In' };
    logQuery('reservations', 'UPDATE', `id = ${reservationId}`, resPayload);
    const { error: resErr } = await supabase
      .from('reservations')
      .update(resPayload)
      .eq('id', reservationId);

    if (resErr) {
      console.error('Failed to update reservations status to Checked In:', resErr);
      throw resErr;
    }

    // 3. Keep payment summary logged and updated at check-in (processed exactly once)
    await updatePaymentSummary({
      reservationId: String(reservationId),
      paymentAmount: 0,
      isAdvance: false,
      remarks: 'Check-in processed',
    });
  },

  /**
   * CHECKOUT GUEST Action:
   * Sets status = 'checked_out' in reservation_rooms and reservations.
   * Preserves booking history, payments, and guest details.
   */
  async checkoutGuest(id: string, remarks?: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    const reservationId = await getCleanReservationId(id);

    // 1. Update ALL reservation_rooms for this reservation to 'Checked Out'
    logQuery('reservation_rooms', 'UPDATE', `reservation_id = ${reservationId}`, { status: 'Checked Out' });
    const { error: rrErr } = await supabase
      .from('reservation_rooms')
      .update({ status: 'Checked Out' })
      .eq('reservation_id', reservationId);

    if (rrErr) throw rrErr;

    // 2. Update reservations status to 'Checked Out'
    logQuery('reservations', 'UPDATE', `id = ${reservationId}`, { status: 'Checked Out' });
    const { error: resErr } = await supabase
      .from('reservations')
      .update({ status: 'Checked Out' })
      .eq('id', reservationId);

    if (resErr) throw resErr;

    // 3. Update payment summary ONCE
    await updatePaymentSummary({
      reservationId: String(reservationId),
      paymentAmount: 0,
      isAdvance: false,
      remarks: remarks || 'Checkout processed',
    });
  },

  /**
   * Extend reservation check-out date and update remarks metadata
   */
  async extendReservation(reservationId: string, newCheckOutDate: string, updatedRemarks?: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    const targetResId = await getCleanReservationId(reservationId);
    const payload: any = { check_out_date: newCheckOutDate };
    if (updatedRemarks !== undefined) {
      payload.remarks = updatedRemarks;
    }

    logQuery('reservations', 'UPDATE', `id = ${targetResId}`, payload);
    const { error } = await supabase
      .from('reservations')
      .update(payload)
      .eq('id', targetResId);

    if (error) {
      console.error('Failed to extend reservation:', error);
      throw error;
    }
  },

  /**
   * Records check-in payment details into payments table, including Irshad wallet transfer options
   */
  async recordCheckInPayment(
    id: string,
    paymentData: {
      amountCollected: number;
      transferredToIrshad: number;
      transferToIrshad: boolean;
      balanceDueWallet?: boolean;
      remainingBalance?: number;
      remarks?: string;
    }
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const reservationId = await getCleanReservationId(id);

      // Validate check-in date
      const { data: resData } = await supabase
        .from('reservations')
        .select('check_in_date')
        .eq('id', reservationId)
        .maybeSingle();

      if (resData?.check_in_date) {
        const checkInDateYMD = String(resData.check_in_date).split('T')[0].split(' ')[0].trim();
        const todayStr = getISTDateStr();
        if (checkInDateYMD && checkInDateYMD > todayStr) {
          throw new Error('Check-in is not allowed before the reservation date.');
        }
      }

      await updatePaymentSummary({
        reservationId,
        paymentAmount: Number(paymentData.amountCollected || 0),
        isAdvance: false,
        paymentMethod: 'cash',
        remarks:
          paymentData.remarks ||
          (paymentData.balanceDueWallet
            ? 'Customer outstanding balance due recorded'
            : paymentData.transferToIrshad
            ? 'Transferred remaining balance to Irshad Wallet'
            : 'Check-in payment'),
        options: {
          balanceDueWallet: Boolean(paymentData.balanceDueWallet),
          transferToIrshad: Boolean(paymentData.transferToIrshad),
          transferredToIrshad: Number(paymentData.transferredToIrshad || 0),
        },
      });
    } catch (err) {
      console.error('Exception recording check-in payment:', err);
      throw err;
    }
  },

  /**
   * Helper to delete payments, due_payment_transactions and checkin_logs for a reservation
   */
  async purgeReservationDependencies(reservationId: string): Promise<void> {
    if (!reservationId || !isSupabaseConfigured) return;
    const targetResId = await getCleanReservationId(reservationId);
    if (DEBUG) {
      console.log("Reservation UUID:", reservationId);
      console.log("Reservation UUID Used:", targetResId);
    }

    try {
      await supabase.from('due_payment_transactions').delete().eq('reservation_id', targetResId);
    } catch (e) {
      // ignore
    }

    try {
      logQuery('checkin_logs', 'DELETE', `reservation_id = ${targetResId}`);
      await supabase.from('checkin_logs').delete().eq('reservation_id', targetResId);
    } catch (e) {
      // ignore
    }

    try {
      logQuery('payments', 'DELETE', `reservation_id = ${targetResId}`);
      await supabase.from('payments').delete().eq('reservation_id', targetResId);
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

    // Fetch before update
    let beforeData: any[] = [];
    if (roomRow) {
      beforeData = [roomRow];
    } else if (reservationId) {
      const { data: bData } = await supabase
        .from('reservation_rooms')
        .select('*')
        .eq('reservation_id', reservationId);
      beforeData = bData || [];
    }
    if (DEBUG) console.log('reservation_rooms before update:', beforeData);

    // Delete reservation_room
    let deleteData: any[] | null = null;
    let deleteError: any = null;

    if (roomRow?.id) {
      logQuery('reservation_rooms', 'DELETE', `id = ${roomRow.id}`);
      const res = await supabase.from('reservation_rooms').delete().eq('id', roomRow.id).select();
      deleteData = res.data;
      deleteError = res.error;
    } else if (reservationId) {
      logQuery('reservation_rooms', 'DELETE', `reservation_id = ${reservationId}`);
      const res = await supabase.from('reservation_rooms').delete().eq('reservation_id', reservationId).select();
      deleteData = res.data;
      deleteError = res.error;
    }

    if (deleteError) {
      console.error('Error deleting reservation_rooms:', deleteError);
      throw deleteError;
    }
    if (!deleteData || deleteData.length === 0) {
      throw new Error(`DELETE on reservation_rooms failed: returned row count 0 for id ${id}`);
    }

    // Check remaining rooms for this reservation
    if (reservationId) {
      const { data: remaining } = await supabase
        .from('reservation_rooms')
        .select('*')
        .eq('reservation_id', reservationId);

      if (DEBUG) console.log('reservation_rooms after update:', remaining || []);

      if (!remaining || remaining.length === 0) {
        // Zero rooms remain -> update reservations.status = 'Cancelled'
        logQuery('reservations', 'UPDATE', `id = ${reservationId}`, { status: 'Cancelled' });
        const { data: resData, error: resErr } = await supabase
          .from('reservations')
          .update({ status: 'Cancelled' })
          .eq('id', reservationId)
          .select();

        if (resErr) {
          console.error('Error updating reservation status to Cancelled:', resErr);
          throw resErr;
        }
        if (!resData || resData.length === 0) {
          throw new Error(`UPDATE on reservations status to Cancelled failed: returned row count 0 for reservation_id ${reservationId}`);
        }
      }
    }

    const { data: reloadedRR } = await supabase.from('reservation_rooms').select('*');
    if (DEBUG) console.log('reservationRooms state after refresh:', reloadedRR || []);
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

    const rrPayload = { status: 'Booked', cancelled: false };
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

    const resPayload = { status: 'Booked' };
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

    const targetResId = await getCleanReservationId(reservationId);
    if (DEBUG) {
      console.log("Reservation UUID:", reservationId);
      console.log("Reservation UUID Used:", targetResId);
    }

    const { data: beforeData } = await supabase
      .from('reservation_rooms')
      .select('*')
      .eq('reservation_id', targetResId);
    if (DEBUG) console.log('reservation_rooms before update:', beforeData || []);

    // Purge dependencies (payments, checkin_logs)
    await this.purgeReservationDependencies(targetResId);

    logQuery('reservation_rooms', 'DELETE', `reservation_id = ${targetResId}`);
    const { data: delRooms, error: errRooms } = await supabase
      .from('reservation_rooms')
      .delete()
      .eq('reservation_id', targetResId)
      .select();

    if (errRooms) throw errRooms;
    if (!delRooms || delRooms.length === 0) {
      throw new Error(`DELETE on reservation_rooms failed: returned row count 0 for reservation_id ${targetResId}`);
    }

    if (DEBUG) console.log('reservation_rooms after update:', []);

    logQuery('reservations', 'UPDATE', `id = ${targetResId}`, { status: 'Cancelled' });
    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .update({ status: 'Cancelled' })
      .eq('id', targetResId)
      .select();

    if (resErr) throw resErr;
    if (!resData || resData.length === 0) {
      throw new Error(`UPDATE on reservations status to Cancelled failed: returned row count 0 for reservation_id ${targetResId}`);
    }

    const { data: reloadedRR } = await supabase.from('reservation_rooms').select('*');
    if (DEBUG) console.log('reservationRooms state after refresh:', reloadedRR || []);
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
  async replaceRoom(reservationRoomId: string, newRoomNumber: number): Promise<any[]> {
    if (!isSupabaseConfigured) return [];

    // 1. Get room list to find room ID for newRoomNumber
    const rooms = await RoomService.getRooms();
    const targetRoom = rooms.find(
      (r) => Number(r.room_number ?? r.number) === Number(newRoomNumber)
    );
    const newRoomId = targetRoom ? targetRoom.id : newRoomNumber;

    // 2. Fetch reservation_rooms before update
    let targetRowId = reservationRoomId;
    const { data: beforeData, error: beforeError } = await supabase
      .from('reservation_rooms')
      .select('*')
      .eq('id', reservationRoomId);

    if (beforeError) {
      console.error('Error fetching reservation_rooms before update:', beforeError);
    }
    if (DEBUG) console.log('reservation_rooms before update:', beforeData);

    // Fallback if ID was composite string
    if ((!beforeData || beforeData.length === 0) && reservationRoomId.includes('_')) {
      const parts = reservationRoomId.split('_');
      const resId = parts[0];
      const oldRoomNum = Number(parts[1]);
      const oldRoom = rooms.find((r) => Number(r.room_number ?? r.number) === oldRoomNum);
      if (oldRoom) {
        const { data: fallbackData } = await supabase
          .from('reservation_rooms')
          .select('*')
          .eq('reservation_id', resId)
          .eq('room_id', oldRoom.id);
        if (fallbackData && fallbackData.length > 0) {
          targetRowId = fallbackData[0].id;
          if (DEBUG) console.log('Found reservation_rooms row via fallback:', fallbackData);
        }
      }
    }

    logQuery('reservation_rooms', 'UPDATE', `id = ${targetRowId}`, { room_id: newRoomId });
    const { data: afterData, error } = await supabase
      .from('reservation_rooms')
      .update({ room_id: newRoomId })
      .eq('id', targetRowId)
      .select();

    logResponse(afterData, error);
    if (error) {
      console.error('Error replacing room in reservation_rooms:', error);
      throw error;
    }

    if (!afterData || afterData.length !== 1) {
      throw new Error(`UPDATE on reservation_rooms failed: returned row count ${afterData ? afterData.length : 0}, expected 1.`);
    }

    if (DEBUG) console.log('reservation_rooms after update:', afterData);

    // 3. Immediately reload reservation_rooms from Supabase
    const { data: reloadedRR, error: reloadError } = await supabase
      .from('reservation_rooms')
      .select('*');

    if (reloadError) {
      console.error('Error reloading reservation_rooms after update:', reloadError);
    } else {
      if (DEBUG) console.log('reservationRooms state after refresh:', reloadedRR);
    }

    return reloadedRR || [];
  },

  /**
   * Adds extra room(s) to an existing reservation:
   * 1. Resolves room numbers to room IDs in rooms table.
   * 2. Finds existing reservation and reservation_rooms to determine status ('Booked' or 'Checked In').
   * 3. Inserts a row into 'reservation_rooms' for EACH selected room:
   *    { reservation_id: resId, room_id: roomId, status: newRoomStatus, cancelled: false }
   * 4. Updates payment summary / total amount if newTotalAmount is specified.
   */
  async addRoomsToReservation(
    reservationId: string,
    roomNumbers: number[],
    newTotalAmount?: number
  ): Promise<number> {
    if (!isSupabaseConfigured) return;
    if (!roomNumbers || roomNumbers.length === 0) return;

    // 0. Resolve target reservation_id
    let targetResId = await getCleanReservationId(reservationId);
    if (DEBUG) {
      console.log("Reservation UUID:", reservationId);
      console.log("Reservation UUID Used:", targetResId);
    }

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

    if (!targetResId || !resData) {
      throw new Error(`Reservation not found for id ${reservationId}`);
    }

    // Determine status of new rooms based on existing reservation/rooms
    const { data: existingRR } = await supabase
      .from('reservation_rooms')
      .select('status, room_id')
      .eq('reservation_id', targetResId);

    const isCheckedIn = (existingRR || []).some(
      (r) => r.status === 'Checked In' || r.status === 'checked_in' || r.status === 'checked-in'
    ) || resData.status === 'Checked In' || resData.status === 'checked_in';

    const newRoomStatus = isCheckedIn ? 'Checked In' : 'Booked';

    // 1. Resolve room_number to rooms.id foreign key
    const rooms = await RoomService.getRooms();
    const roomNumToIdMap = new Map<number, string | number>();
    rooms.forEach((r) => {
      roomNumToIdMap.set(r.number, r.id);
    });

    const existingRoomIds = new Set((existingRR || []).map((r) => String(r.room_id)));

    const uniqueRoomNumbers = Array.from(new Set(roomNumbers));
    const newRoomNumbers = uniqueRoomNumbers.filter((roomNum) => {
      const roomId = roomNumToIdMap.get(roomNum) ?? roomNum;
      return !existingRoomIds.has(String(roomId));
    });

    let insertedCount = 0;
    if (newRoomNumbers.length > 0) {
      const roomRows = newRoomNumbers.map((roomNum) => {
        const roomId = roomNumToIdMap.get(roomNum) ?? roomNum;
        return {
          reservation_id: targetResId,
          room_id: roomId,
          status: newRoomStatus,
          cancelled: false,
        };
      });

      logQuery('reservation_rooms', 'INSERT', 'N/A', roomRows);
      const { data: insertedRooms, error: roomsError } = await supabase
        .from('reservation_rooms')
        .insert(roomRows)
        .select();

      logResponse(insertedRooms, roomsError);
      if (roomsError) {
        console.error('Failed to add extra rooms in database:', roomsError);
        throw new Error(`Failed to add extra rooms: ${roomsError.message || JSON.stringify(roomsError)}`);
      }
      insertedCount = insertedRooms ? insertedRooms.length : newRoomNumbers.length;
    }

    // 2. Recalculate and update payment summary / total amount if newTotalAmount provided
    if (newTotalAmount !== undefined && newTotalAmount >= 0) {
      await updatePaymentSummary({
        reservationId: targetResId,
        paymentAmount: 0,
        isAdvance: false,
        options: {
          totalAmount: newTotalAmount,
        },
        remarks: `Added ${uniqueRoomNumbers.length} extra room(s): ${uniqueRoomNumbers.join(', ')}`,
      });

      // Update remarks metadata on reservations table
      const currentRemarksStr = resData.remarks || '';
      const { cleanRemarks, advancePaid: curAdvance } = parsePaymentMetadata(currentRemarksStr);
      const newMetadata = `[PAYMENT:total=${newTotalAmount},advance=${curAdvance}]`;
      const updatedRemarks = `${newMetadata} ${cleanRemarks}`.trim();

      await supabase
        .from('reservations')
        .update({ remarks: updatedRemarks })
        .eq('id', targetResId);
    }

    return insertedCount;
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
    advancePaid?: number
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    let targetResId = await getCleanReservationId(reservationId);
    if (!targetResId) return;

    if (DEBUG) {
      console.log("Reservation UUID:", reservationId);
      console.log("Reservation UUID Used:", targetResId);
    }

    // Call updatePaymentSummary with paymentAmount = 0 so no payment transaction is modified/inserted,
    // and total_amount, remaining_balance, and payment_status are updated based on existing payment ledger.
    await updatePaymentSummary({
      reservationId: targetResId,
      paymentAmount: 0,
      options: {
        totalAmount,
      },
      remarks: 'Updated booking total',
    });
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

    let targetResId = await getCleanReservationId(reservationId);
    if (DEBUG) {
      console.log("Reservation UUID:", reservationId);
      console.log("Reservation UUID Used:", targetResId);
    }

    if (!targetResId) return;

    if (data.totalAmount !== undefined && data.totalAmount > 0) {
      await updatePaymentSummary({
        reservationId: targetResId,
        paymentAmount: 0,
        options: {
          totalAmount: data.totalAmount,
        },
        remarks: 'Updated booking total',
      });
    }

    const { data: resData } = await supabase
      .from('reservations')
      .select('remarks')
      .eq('id', targetResId)
      .maybeSingle();

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
  },
};
