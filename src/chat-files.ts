function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('contour-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('attachments');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function fileRequest<T>(mode: IDBTransactionMode, perform: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openFiles();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('attachments', mode);
      const request = perform(transaction.objectStore('attachments'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || request.error);
      transaction.onabort = () => reject(transaction.error || Error('Операция с файлом отменена.'));
    });
  } finally { db.close(); }
}

export const storeFile = (project: string, file: File) => fileRequest('readwrite', store => store.put(file, `${project}:${file.name}`));
export const removeFile = (project: string, name: string) => fileRequest('readwrite', store => store.delete(`${project}:${name}`));
export const loadFile = (project: string, name: string) => fileRequest<File | undefined>('readonly', store => store.get(`${project}:${name}`));

export function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
