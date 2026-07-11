import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  WATERMARK_BUCKET,
  type CloudWatermarkAsset,
  type SupabaseWatermarkClient,
} from './cloudWatermarkLibrary';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
const cloudEnabled = viteEnv.VITE_WATERMARK_CLOUD_ENABLED === 'true';
const supabaseUrl = viteEnv.VITE_SUPABASE_URL || '';
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || '';

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!cloudEnabled || !supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
};

const raiseIfError = (error: Error | null) => {
  if (error) throw error;
};

export const createSupabaseWatermarkClient = (supabase: SupabaseClient): SupabaseWatermarkClient => ({
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    raiseIfError(error);
    return data.user ? { id: data.user.id, email: data.user.email } : null;
  },
  async listAssets(userId) {
    const { data, error } = await supabase
      .from('watermark_assets')
      .select('id,user_id,name,mime_type,size_bytes,storage_path,sha256,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    raiseIfError(error);
    return (data || []) as CloudWatermarkAsset[];
  },
  async findByHash(userId, sha256) {
    const { data, error } = await supabase
      .from('watermark_assets')
      .select('id,user_id,name,mime_type,size_bytes,storage_path,sha256,created_at')
      .eq('user_id', userId)
      .eq('sha256', sha256)
      .maybeSingle();
    raiseIfError(error);
    return data as CloudWatermarkAsset | null;
  },
  async upload(path, file) {
    const { error } = await supabase.storage.from(WATERMARK_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    raiseIfError(error);
  },
  async insertAsset(asset) {
    const { error } = await supabase.from('watermark_assets').insert(asset);
    raiseIfError(error);
  },
  async removeObject(path) {
    const { error } = await supabase.storage.from(WATERMARK_BUCKET).remove([path]);
    raiseIfError(error);
  },
  async deleteAsset(userId, id) {
    const { error } = await supabase.from('watermark_assets').delete().eq('user_id', userId).eq('id', id);
    raiseIfError(error);
  },
  async download(path) {
    const { data, error } = await supabase.storage.from(WATERMARK_BUCKET).download(path);
    raiseIfError(error);
    const fileName = path.split('/').pop() || 'watermark.png';
    return new File([data], fileName, { type: data.type || 'image/png' });
  },
});

export const requestMagicLink = async (email: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('云端水印同步尚未配置');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  raiseIfError(error);
};

export const signOutSupabase = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  raiseIfError(error);
};
