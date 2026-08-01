import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Room } from '../types';

function logQuery(table: string, action: string, columns: string, where: string) {
  console.log(`TABLE: ${table} | ACTION: ${action} | COLUMNS: ${columns} | WHERE: ${where}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data count: ${data ? data.length : 0}`);
  if (error) {
    console.error(`Returned Supabase Error:`, JSON.stringify(error, null, 2));
  }
}

/**
 * Service for managing hotel rooms via Supabase
 */
export const RoomService = {
  /**
   * Fetches rooms directly from Supabase 'rooms' table.
   * Supabase is the single source of truth.
   */
  async getRooms(): Promise<Room[]> {
    if (!isSupabaseConfigured) {
      return [];
    }

    try {
      logQuery('rooms', 'SELECT', '*', 'is_active = true ORDER BY room_number ASC');
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('room_number', { ascending: true });

      logResponse(data, error);

      if (error) {
        console.error('FULL SUPABASE ERROR fetching rooms:', error);
        throw new Error(`Supabase rooms query failed: ${error.message || JSON.stringify(error)}`);
      }

      if (!data) return [];

      return data.map((item: any) => ({
        id: item.id,
        room_number: Number(item.room_number ?? item.id),
        floor: Number(item.floor ?? 1),
        room_type: String(item.room_type ?? 'Standard'),
        bed_type: item.bed_type ? String(item.bed_type) : undefined,
        capacity: item.capacity ? Number(item.capacity) : undefined,
        is_active: item.is_active !== false,
        created_at: item.created_at ? String(item.created_at) : undefined,
        // Helper aliases for existing UI components
        number: Number(item.room_number ?? item.id),
        type: String(item.room_type ?? 'Standard'),
      }));
    } catch (err) {
      console.error('Exception in getRooms:', err);
      throw err;
    }
  },

  async seedRoomsIfEmpty(): Promise<void> {
    // Rooms are managed dynamically in Supabase table
  },
};

