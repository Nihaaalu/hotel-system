import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Room } from '../types';

function logQuery(table: string, action: string, where: string, payload?: any) {
  console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
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
      logQuery('rooms', 'SELECT', 'is_active = true');
      let { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('room_number', { ascending: true });
      logResponse(data, error);

      if (error) {
        logQuery('rooms', 'SELECT', 'ALL (order room_number)');
        const res1 = await supabase
          .from('rooms')
          .select('*')
          .order('room_number', { ascending: true });
        logResponse(res1.data, res1.error);

        if (res1.error) {
          logQuery('rooms', 'SELECT', 'ALL (order number)');
          const res2 = await supabase
            .from('rooms')
            .select('*')
            .order('number', { ascending: true });
          logResponse(res2.data, res2.error);
          data = res2.data;
          error = res2.error;
        } else {
          data = res1.data;
          error = res1.error;
        }
      }

      if (error) {
        console.error('Error fetching rooms from Supabase:', error);
        throw error;
      }

      if (!data) return [];

      return data
        .filter((item: any) => item.is_active !== false)
        .map((item: any) => ({
          id: item.id ?? item.room_number ?? item.number,
          number: Number(item.room_number ?? item.number ?? item.id),
          floor: Number(item.floor ?? 1),
          type: String(item.room_type ?? item.type ?? 'Standard'),
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
