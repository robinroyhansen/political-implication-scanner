import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database
export interface ScanRecord {
  id?: string;
  created_at?: string;
  total_articles: number;
  sentiment_score: number;
  americas_sentiment: number;
  europe_sentiment: number;
  asia_sentiment: number;
  summary_report?: string;
}

export interface WatchlistRecord {
  id?: string;
  user_id?: string;
  tickers: string[];
  created_at?: string;
  updated_at?: string;
}

// Save a scan to Supabase
export async function saveScan(scan: Omit<ScanRecord, 'id' | 'created_at'>): Promise<ScanRecord | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const { data, error } = await supabase
      .from('scans')
      .insert([scan])
      .select()
      .single();

    if (error) {
      console.error('Error saving scan:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Error saving scan:', err);
    return null;
  }
}

// Get recent scans for the chart
export async function getRecentScans(limit = 20): Promise<ScanRecord[]> {
  if (!supabaseUrl || !supabaseAnonKey) return [];

  try {
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching scans:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error fetching scans:', err);
    return [];
  }
}

// Save watchlist to Supabase
export async function saveWatchlist(tickers: string[], userId?: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;

  try {
    // Upsert based on user_id (or anonymous)
    const { error } = await supabase
      .from('watchlists')
      .upsert({
        user_id: userId || 'anonymous',
        tickers,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      console.error('Error saving watchlist:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error saving watchlist:', err);
    return false;
  }
}

// Get watchlist from Supabase
export async function getWatchlist(userId?: string): Promise<string[]> {
  if (!supabaseUrl || !supabaseAnonKey) return [];

  try {
    const { data, error } = await supabase
      .from('watchlists')
      .select('tickers')
      .eq('user_id', userId || 'anonymous')
      .single();

    if (error) {
      // No watchlist found is not an error
      if (error.code === 'PGRST116') return [];
      console.error('Error fetching watchlist:', error);
      return [];
    }
    return data?.tickers || [];
  } catch (err) {
    console.error('Error fetching watchlist:', err);
    return [];
  }
}

// Update scan with summary report
export async function updateScanSummary(scanId: string, summaryReport: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;

  try {
    const { error } = await supabase
      .from('scans')
      .update({ summary_report: summaryReport })
      .eq('id', scanId);

    if (error) {
      console.error('Error updating scan summary:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error updating scan summary:', err);
    return false;
  }
}
