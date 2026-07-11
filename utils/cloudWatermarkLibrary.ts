import {
  dataUrlToFile,
  deleteSavedWatermark,
  fileToDataUrl,
  getSavedWatermark,
  loadSavedWatermarks,
  saveWatermark,
  type SavedWatermark,
} from './watermarkLibrary';

export const WATERMARK_BUCKET = 'watermark-assets';
export const MAX_WATERMARK_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_WATERMARK_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export type CloudWatermarkAsset = {
  id: string;
  user_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  sha256: string;
  created_at: string;
};

export type WatermarkRepository = {
  list(): Promise<SavedWatermark[]>;
  save(file: File, options?: { id?: string; name?: string; source?: 'local' | 'cloud' }): Promise<SavedWatermark>;
  remove(item: Pick<SavedWatermark, 'id' | 'source' | 'storagePath'>): Promise<void>;
  download(item: SavedWatermark): Promise<File>;
  get(id: string): Promise<SavedWatermark | null>;
};

export type SupabaseWatermarkClient = {
  getCurrentUser(): Promise<{ id: string; email?: string | null } | null>;
  listAssets(userId: string): Promise<CloudWatermarkAsset[]>;
  findByHash(userId: string, sha256: string): Promise<CloudWatermarkAsset | null>;
  upload(path: string, file: File): Promise<void>;
  insertAsset(asset: CloudWatermarkAsset): Promise<void>;
  removeObject(path: string): Promise<void>;
  deleteAsset(userId: string, id: string): Promise<void>;
  download(path: string): Promise<File>;
};

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'watermark.png';
const newId = () => crypto.randomUUID();

const assertWatermarkFile = (file: File) => {
  if (!ALLOWED_WATERMARK_TYPES.has(file.type)) {
    throw new Error('水印仅支持 PNG、JPEG 或 WebP 格式');
  }
  if (file.size > MAX_WATERMARK_FILE_BYTES) {
    throw new Error('水印文件不能超过 2 MB');
  }
};

export const sha256File = async (file: Blob) => {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持 SHA-256 校验');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
};

const toSavedWatermark = (asset: CloudWatermarkAsset): SavedWatermark => ({
  id: asset.id,
  name: asset.name,
  mimeType: asset.mime_type,
  size: asset.size_bytes,
  createdAt: asset.created_at,
  source: 'cloud',
  storagePath: asset.storage_path,
  sha256: asset.sha256,
});

export const createIndexedDbWatermarkRepository = (): WatermarkRepository => ({
  async list() {
    return (await loadSavedWatermarks()).map((item) => ({ ...item, source: item.source || 'local' }));
  },
  async get(id) {
    const item = await getSavedWatermark(id);
    return item ? { ...item, source: item.source || 'local' } : null;
  },
  async save(file, options = {}) {
    assertWatermarkFile(file);
    const item: SavedWatermark = {
      id: options.id || `watermark-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: options.name || file.name,
      mimeType: file.type,
      dataUrl: await fileToDataUrl(file),
      createdAt: new Date().toISOString(),
      size: file.size,
      source: options.source || 'local',
    };
    await saveWatermark(item);
    return item;
  },
  async remove(item) {
    await deleteSavedWatermark(item.id);
  },
  async download(item) {
    const saved = await getSavedWatermark(item.id);
    if (!saved?.dataUrl) throw new Error('本机没有缓存这个水印');
    return dataUrlToFile(saved.dataUrl, saved.name, saved.mimeType);
  },
});

export const createSupabaseWatermarkRepository = (
  client: SupabaseWatermarkClient,
  options: { localCache?: WatermarkRepository; hashFile?: (file: File) => Promise<string> } = {}
): WatermarkRepository => {
  const localCache = options.localCache || createIndexedDbWatermarkRepository();
  const hashFile = options.hashFile || sha256File;

  const getUser = async () => {
    const user = await client.getCurrentUser();
    if (!user) throw new Error('请先登录后同步云端水印');
    return user;
  };

  return {
    async list() {
      const user = await getUser();
      return (await client.listAssets(user.id))
        .filter((asset) => asset.user_id === user.id)
        .map(toSavedWatermark);
    },
    async get(id) {
      const items = await this.list();
      return items.find((item) => item.id === id) || null;
    },
    async save(file, saveOptions = {}) {
      assertWatermarkFile(file);
      const user = await getUser();
      const sha256 = await hashFile(file);
      const duplicate = await client.findByHash(user.id, sha256);
      if (duplicate) return toSavedWatermark(duplicate);

      const id = saveOptions.id || newId();
      const name = safeFileName(saveOptions.name || file.name);
      const storagePath = `${user.id}/${id}/${name}`;
      const asset: CloudWatermarkAsset = {
        id,
        user_id: user.id,
        name,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: storagePath,
        sha256,
        created_at: new Date().toISOString(),
      };

      await client.upload(storagePath, file);
      try {
        await client.insertAsset(asset);
      } catch (error) {
        try {
          await client.removeObject(storagePath);
        } catch {
          // Preserve the original metadata error; report cleanup in caller telemetry if configured.
        }
        throw error;
      }

      const saved = toSavedWatermark(asset);
      await localCache.save(file, { id, name, source: 'cloud' });
      return saved;
    },
    async remove(item) {
      if (!item.storagePath) throw new Error('缺少云端水印路径，无法安全删除');
      const user = await getUser();
      await client.removeObject(item.storagePath);
      await client.deleteAsset(user.id, item.id);
      await localCache.remove(item);
    },
    async download(item) {
      const cached = await localCache.get(item.id);
      if (cached?.dataUrl) return dataUrlToFile(cached.dataUrl, cached.name, cached.mimeType);
      if (!item.storagePath) throw new Error('缺少云端水印路径');
      const file = await client.download(item.storagePath);
      await localCache.save(file, { id: item.id, name: item.name, source: 'cloud' });
      return file;
    },
  };
};
