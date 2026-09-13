import {all,put,saveSetting,LEARNING_STORES} from './db.js';
const stores=LEARNING_STORES;
export async function exportBackup(){const exportedAt=new Date().toISOString(),out={version:3,exportedAt};await saveSetting('lastFullBackupAt',exportedAt);for(const store of stores)out[store]=await all(store);return out}
/* Restore merges records by their stable key; it never clears any local learning store. */
export async function importBackup(data){for(const store of stores)for(const item of(data?.[store]||[]))await put(store,item)}
