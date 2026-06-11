export type SavedWatermark = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
  size: number;
};

const dbName = 'instagrid-watermark-library';
const storeName = 'watermarks';
const dbVersion = 1;

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }

    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开常用水印库失败'));
  });

const runStoreRequest = async <T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
) => {
  const db = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = createRequest(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('常用水印库操作失败'));
      transaction.onerror = () => reject(transaction.error || new Error('常用水印库事务失败'));
    });
  } finally {
    db.close();
  }
};

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('读取水印图片失败'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('读取水印图片失败'));
    reader.readAsDataURL(file);
  });

export const dataUrlToFile = async (dataUrl: string, name: string, mimeType: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: mimeType || blob.type || 'image/png' });
};

export const loadSavedWatermarks = async () => {
  const items = await runStoreRequest<SavedWatermark[]>('readonly', (store) => store.getAll());
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const saveWatermark = async (item: SavedWatermark) => {
  await runStoreRequest<IDBValidKey>('readwrite', (store) => store.put(item));
};

export const deleteSavedWatermark = async (id: string) => {
  await runStoreRequest<undefined>('readwrite', (store) => store.delete(id));
};

