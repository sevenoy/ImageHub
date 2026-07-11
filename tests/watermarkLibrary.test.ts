// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIndexedDbWatermarkRepository,
  createSupabaseWatermarkRepository,
  type SupabaseWatermarkClient,
} from '../utils/cloudWatermarkLibrary';

const watermark = (name = 'logo.png') => new File(['watermark'], name, { type: 'image/png' });

const makeCloudClient = (): SupabaseWatermarkClient => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-a', email: 'a@example.com' }),
  listAssets: vi.fn().mockResolvedValue([]),
  findByHash: vi.fn().mockResolvedValue(null),
  upload: vi.fn().mockResolvedValue(undefined),
  insertAsset: vi.fn().mockResolvedValue(undefined),
  removeObject: vi.fn().mockResolvedValue(undefined),
  deleteAsset: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue(watermark()),
});

describe('watermark repositories', () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase('instagrid-watermark-library');
  });

  it('keeps a watermark in IndexedDB while signed out', async () => {
    const repository = createIndexedDbWatermarkRepository();

    const saved = await repository.save(watermark());

    expect(saved.source).toBe('local');
    expect(await repository.list()).toHaveLength(1);
  });

  it('lists only cloud metadata for the signed-in user', async () => {
    const client = makeCloudClient();
    client.listAssets = vi.fn().mockResolvedValue([
      { id: 'cloud-1', user_id: 'user-a', name: 'logo.png', mime_type: 'image/png', size_bytes: 9, storage_path: 'user-a/cloud-1/logo.png', sha256: 'hash', created_at: '2026-01-01T00:00:00.000Z' },
    ]);
    const repository = createSupabaseWatermarkRepository(client);

    const assets = await repository.list();

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ id: 'cloud-1', source: 'cloud' });
    expect(client.listAssets).toHaveBeenCalledWith('user-a');
  });

  it('does not expose another user metadata even if a faulty client returns it', async () => {
    const client = makeCloudClient();
    client.listAssets = vi.fn().mockResolvedValue([
      { id: 'mine', user_id: 'user-a', name: 'mine.png', mime_type: 'image/png', size_bytes: 9, storage_path: 'user-a/mine/mine.png', sha256: 'mine', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'other', user_id: 'user-b', name: 'other.png', mime_type: 'image/png', size_bytes: 9, storage_path: 'user-b/other/other.png', sha256: 'other', created_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const assets = await createSupabaseWatermarkRepository(client).list();

    expect(assets.map((asset) => asset.id)).toEqual(['mine']);
  });

  it('removes an uploaded object when cloud metadata creation fails', async () => {
    const client = makeCloudClient();
    client.insertAsset = vi.fn().mockRejectedValue(new Error('metadata unavailable'));
    const repository = createSupabaseWatermarkRepository(client);

    await expect(repository.save(watermark())).rejects.toThrow('metadata unavailable');
    expect(client.upload).toHaveBeenCalledOnce();
    expect(client.removeObject).toHaveBeenCalledOnce();
  });

  it('does not upload the same SHA-256 twice for one user', async () => {
    const client = makeCloudClient();
    client.findByHash = vi.fn().mockResolvedValue({ id: 'existing', user_id: 'user-a', name: 'logo.png', mime_type: 'image/png', size_bytes: 9, storage_path: 'user-a/existing/logo.png', sha256: 'known', created_at: '2026-01-01T00:00:00.000Z' });
    const repository = createSupabaseWatermarkRepository(client, { hashFile: vi.fn().mockResolvedValue('known') });

    const result = await repository.save(watermark());

    expect(result.id).toBe('existing');
    expect(client.upload).not.toHaveBeenCalled();
  });

  it('deletes the object, metadata, and cached local watermark together', async () => {
    const client = makeCloudClient();
    const local = createIndexedDbWatermarkRepository();
    const repository = createSupabaseWatermarkRepository(client, { localCache: local });
    await local.save(watermark(), { id: 'cloud-1', source: 'cloud' });

    await repository.remove({ id: 'cloud-1', storagePath: 'user-a/cloud-1/logo.png', source: 'cloud' });

    expect(client.removeObject).toHaveBeenCalledWith('user-a/cloud-1/logo.png');
    expect(client.deleteAsset).toHaveBeenCalledWith('user-a', 'cloud-1');
    expect(await local.get('cloud-1')).toBeNull();
  });
});
