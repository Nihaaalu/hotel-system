import { Guest, Booking, Payment, Room } from '../types';

const DB_NAME = 'HotelManagementDB';
const DB_VERSION = 1;

export const FIXED_ROOMS: Room[] = [
  { number: 101, floor: 1, type: '4 Sharing' },
  { number: 102, floor: 1, type: '4 Sharing' },
  { number: 103, floor: 1, type: '6 Bed' },
  { number: 104, floor: 1, type: '6 Bed' },
  { number: 105, floor: 1, type: '2 Bed King' },
  { number: 106, floor: 1, type: '2 Bed King' },
  { number: 107, floor: 1, type: '3 Bed King' },
  { number: 108, floor: 1, type: '3 Bed King' },
  { number: 201, floor: 2, type: '2 Bed King' },
  { number: 202, floor: 2, type: '2 Bed King' },
  { number: 203, floor: 2, type: '3 Bed King' },
  { number: 204, floor: 2, type: '3 Bed King' },
  { number: 205, floor: 2, type: '4 Bed King' },
];

/**
 * SQLite Schema Reference for Tauri Desktop Port
 *
 * CREATE TABLE IF NOT EXISTS rooms (
 *   number INTEGER PRIMARY KEY,
 *   floor INTEGER NOT NULL,
 *   type TEXT NOT NULL
 * );
 *
 * CREATE TABLE IF NOT EXISTS guests (
 *   id TEXT PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   phone TEXT NOT NULL,
 *   address TEXT NOT NULL,
 *   idProof TEXT NOT NULL,
 *   createdAt TEXT NOT NULL,
 *   updatedAt TEXT NOT NULL,
 *   synced INTEGER DEFAULT 0
 * );
 * CREATE INDEX IF NOT EXISTS idx_guests_phone ON guests(phone);
 * CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(name);
 *
 * CREATE TABLE IF NOT EXISTS bookings (
 *   id TEXT PRIMARY KEY,
 *   guestId TEXT NOT NULL,
 *   roomNumber INTEGER NOT NULL,
 *   checkInDate TEXT NOT NULL,
 *   checkOutDate TEXT NOT NULL,
 *   status TEXT NOT NULL,
 *   totalAmount REAL NOT NULL,
 *   advancePaid REAL NOT NULL,
 *   remarks TEXT,
 *   createdAt TEXT NOT NULL,
 *   updatedAt TEXT NOT NULL,
 *   synced INTEGER DEFAULT 0,
 *   FOREIGN KEY (guestId) REFERENCES guests(id),
 *   FOREIGN KEY (roomNumber) REFERENCES rooms(number)
 * );
 * CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(checkInDate, checkOutDate);
 * CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(roomNumber);
 *
 * CREATE TABLE IF NOT EXISTS payments (
 *   id TEXT PRIMARY KEY,
 *   bookingId TEXT NOT NULL,
 *   amount REAL NOT NULL,
 *   paymentDate TEXT NOT NULL,
 *   paymentMethod TEXT NOT NULL,
 *   remarks TEXT,
 *   createdAt TEXT NOT NULL,
 *   synced INTEGER DEFAULT 0,
 *   FOREIGN KEY (bookingId) REFERENCES bookings(id)
 * );
 * CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(bookingId);
 */

// Helper to open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Rooms Store
      if (!db.objectStoreNames.contains('rooms')) {
        db.createObjectStore('rooms', { keyPath: 'number' });
      }

      // 2. Guests Store
      if (!db.objectStoreNames.contains('guests')) {
        const guestStore = db.createObjectStore('guests', { keyPath: 'id' });
        guestStore.createIndex('name', 'name', { unique: false });
        guestStore.createIndex('phone', 'phone', { unique: false });
        guestStore.createIndex('_synced', '_synced', { unique: false });
      }

      // 3. Bookings Store
      if (!db.objectStoreNames.contains('bookings')) {
        const bookingStore = db.createObjectStore('bookings', { keyPath: 'id' });
        bookingStore.createIndex('roomNumber', 'roomNumber', { unique: false });
        bookingStore.createIndex('guestId', 'guestId', { unique: false });
        bookingStore.createIndex('status', 'status', { unique: false });
        bookingStore.createIndex('checkInDate', 'checkInDate', { unique: false });
        bookingStore.createIndex('_synced', '_synced', { unique: false });
      }

      // 4. Payments Store
      if (!db.objectStoreNames.contains('payments')) {
        const paymentStore = db.createObjectStore('payments', { keyPath: 'id' });
        paymentStore.createIndex('bookingId', 'bookingId', { unique: false });
        paymentStore.createIndex('_synced', '_synced', { unique: false });
      }
    };
  });
}

// Global initialization
let dbInstance: IDBDatabase | null = null;
export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB();
  await seedRoomsIfEmpty(dbInstance);
  return dbInstance;
}

// Seed the rooms
async function seedRoomsIfEmpty(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('rooms', 'readwrite');
    const store = transaction.objectStore('rooms');
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      if (countRequest.result === 0) {
        FIXED_ROOMS.forEach((room) => {
          store.put(room);
        });
      }
      resolve();
    };

    countRequest.onerror = () => reject(countRequest.error);
  });
}

// Generic store methods wrapper
export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getByFieldRange<T>(
  storeName: string,
  indexName: string,
  range: IDBKeyRange
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getByIndex<T>(
  storeName: string,
  indexName: string,
  value: any
): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getByIdFromStore<T>(storeName: string, id: any): Promise<T | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result ? (request.result as T) : null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToStore<T>(storeName: string, data: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFromStore(storeName: string, id: any): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ---------------- GUESTS OPERATIONS ----------------

export async function getGuests(): Promise<Guest[]> {
  return getAllFromStore<Guest>('guests');
}

export async function getGuestById(id: string): Promise<Guest | null> {
  return getByIdFromStore<Guest>('guests', id);
}

export async function saveGuest(guest: Guest): Promise<void> {
  await saveToStore('guests', guest);
}

export async function searchGuests(query: string): Promise<Guest[]> {
  const all = await getGuests();
  if (!query) return all;
  const lower = query.toLowerCase().trim();
  return all.filter(
    (g) =>
      g.name.toLowerCase().includes(lower) ||
      g.phone.includes(lower) ||
      g.idProof.toLowerCase().includes(lower)
  );
}

// ---------------- BOOKINGS OPERATIONS ----------------

export async function getBookings(): Promise<Booking[]> {
  const bookings = await getAllFromStore<Booking>('bookings');
  // Enrich bookings with Guest information for easy visualization
  const enriched = await Promise.all(
    bookings.map(async (b) => {
      const guest = await getGuestById(b.guestId);
      return {
        ...b,
        guestName: guest?.name || 'Unknown',
        guestPhone: guest?.phone || '',
        guestIdProof: guest?.idProof || '',
      };
    })
  );
  // Sort by date (check-in) DESC
  return enriched.sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const b = await getByIdFromStore<Booking>('bookings', id);
  if (!b) return null;
  const guest = await getGuestById(b.guestId);
  return {
    ...b,
    guestName: guest?.name || 'Unknown',
    guestPhone: guest?.phone || '',
    guestIdProof: guest?.idProof || '',
  };
}

export async function checkOverlappingBooking(
  roomNumber: number,
  checkIn: string, // YYYY-MM-DD
  checkOut: string, // YYYY-MM-DD
  ignoreBookingId?: string
): Promise<boolean> {
  if (!checkIn || !checkOut) return false;
  const bookings = await getAllFromStore<Booking>('bookings');
  
  // Clean dates to ensure perfect comparison
  const cIn = new Date(checkIn).getTime();
  const cOut = new Date(checkOut).getTime();

  for (const b of bookings) {
    if (Number(b.roomNumber) !== Number(roomNumber)) continue;
    if (b.status === 'checked-out' || b.status === 'cancelled') continue; // Historical/Cancelled, skip
    if (ignoreBookingId && b.id === ignoreBookingId) continue;

    const bIn = new Date(b.checkInDate).getTime();
    const bOut = new Date(b.checkOutDate).getTime();

    // Overlap condition: (StartA < EndB) and (EndA > StartB)
    const hasOverlap = cIn < bOut && cOut > bIn;

    console.log(`Room Number: ${b.roomNumber}
Existing Check-In: ${b.checkInDate}
Existing Check-Out: ${b.checkOutDate}
Requested Check-In: ${checkIn}
Requested Check-Out: ${checkOut}
Availability Result: ${hasOverlap ? 'Unavailable' : 'Available'}`);

    if (hasOverlap) {
      return true; // Overlap detected!
    }
  }
  return false;
}

export async function createBooking(
  guestData: Omit<Guest, 'id' | 'createdAt' | 'updatedAt'>,
  bookingData: Omit<Booking, 'id' | 'guestId' | 'createdAt' | 'updatedAt' | 'status'>
): Promise<Booking> {
  // 1. Double check overlap
  const isOverlapping = await checkOverlappingBooking(
    bookingData.roomNumber,
    bookingData.checkInDate,
    bookingData.checkOutDate
  );
  if (isOverlapping) {
    throw new Error(`Room ${bookingData.roomNumber} is already booked for these dates.`);
  }

  // 2. Find or create guest
  const allGuests = await getGuests();
  let guest = allGuests.find(
    (g) => g.phone === guestData.phone || g.idProof.toLowerCase() === guestData.idProof.toLowerCase()
  );

  const now = new Date().toISOString();
  const guestId = guest ? guest.id : 'g_' + Math.random().toString(36).substr(2, 9);

  if (!guest) {
    guest = {
      id: guestId,
      ...guestData,
      createdAt: now,
      updatedAt: now,
      _synced: false,
    };
    await saveGuest(guest);
  } else {
    // Update existing guest
    guest = {
      ...guest,
      name: guestData.name,
      address: guestData.address,
      idProof: guestData.idProof,
      updatedAt: now,
      _synced: false,
    };
    await saveGuest(guest);
  }

  // 3. Create Booking
  const bookingId = 'b_' + Math.random().toString(36).substr(2, 9);
  const booking: Booking = {
    ...bookingData,
    id: bookingId,
    guestId,
    status: 'booked',
    createdAt: now,
    updatedAt: now,
    _synced: false,
  };

  await saveToStore('bookings', booking);

  // 4. Record Initial Payment (Advance Paid)
  if (bookingData.advancePaid > 0) {
    const paymentId = 'p_' + Math.random().toString(36).substr(2, 9);
    const payment: Payment = {
      id: paymentId,
      bookingId,
      amount: bookingData.advancePaid,
      paymentDate: now,
      paymentMethod: 'cash', // Default to cash for advance
      remarks: 'Advance paid at the time of booking creation',
      createdAt: now,
      _synced: false,
    };
    await saveToStore('payments', payment);
  }

  return booking;
}

export async function updateBookingStatus(
  id: string,
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
): Promise<Booking> {
  const b = await getByIdFromStore<Booking>('bookings', id);
  if (!b) throw new Error('Booking not found');

  const now = new Date().toISOString();

  // If checking out, we should auto-record the balance payment if it's zeroed by cashier
  // or remind them. We just update the booking status.
  const updated: Booking = {
    ...b,
    status,
    updatedAt: now,
    _synced: false,
  };

  await saveToStore('bookings', updated);
  return updated;
}

export async function deleteBooking(id: string): Promise<void> {
  return deleteFromStore('bookings', id);
}

export async function getNextBookingGroupId(): Promise<string> {
  const bookings = await getAllFromStore<Booking>('bookings');
  let maxNum = 0;
  for (const b of bookings) {
    if (b.bookingGroupId) {
      const match = b.bookingGroupId.match(/^(BG-|R-)(\d+)/);
      if (match) {
        const parsed = parseInt(match[2], 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }
  }
  const nextNum = maxNum + 1;
  return `R-${String(nextNum).padStart(4, '0')}`;
}

// ---------------- PAYMENTS OPERATIONS ----------------

export async function getPaymentsForBooking(bookingId: string): Promise<Payment[]> {
  const allPayments = await getAllFromStore<Payment>('payments');
  return allPayments
    .filter((p) => p.bookingId === bookingId)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
}

export async function addPayment(
  bookingId: string,
  amount: number,
  method: 'cash' | 'card' | 'upi' | 'net_banking',
  remarks: string
): Promise<Payment> {
  const booking = await getByIdFromStore<Booking>('bookings', bookingId);
  if (!booking) throw new Error('Booking not found');

  const now = new Date().toISOString();
  const paymentId = 'p_' + Math.random().toString(36).substr(2, 9);

  const payment: Payment = {
    id: paymentId,
    bookingId,
    amount,
    paymentDate: now,
    paymentMethod: method,
    remarks,
    createdAt: now,
    _synced: false,
  };

  // Save payment
  await saveToStore('payments', payment);

  // Update booking's advancePaid (which is total paid count)
  const updatedBooking: Booking = {
    ...booking,
    advancePaid: Number(booking.advancePaid) + Number(amount),
    updatedAt: now,
    _synced: false,
  };
  await saveToStore('bookings', updatedBooking);

  return payment;
}

// ---------------- LOCAL DATABASE ADMIN/SYNC ----------------

/**
 * Returns all records flagged as unsynced
 */
export async function getUnsyncedRecords() {
  const guests = await getAllFromStore<Guest>('guests');
  const bookings = await getAllFromStore<Booking>('bookings');
  const payments = await getAllFromStore<Payment>('payments');

  return {
    guests: guests.filter((g) => !g._synced),
    bookings: bookings.filter((b) => !b._synced),
    payments: payments.filter((p) => !p._synced),
  };
}

/**
 * Marks records as synced
 */
export async function markRecordAsSynced(
  storeName: 'guests' | 'bookings' | 'payments',
  id: string
): Promise<void> {
  const record = await getByIdFromStore<any>(storeName, id);
  if (record) {
    record._synced = true;
    await saveToStore(storeName, record);
  }
}
