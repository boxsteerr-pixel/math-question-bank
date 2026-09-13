import {all,saveSetting,LEARNING_STORES,KEY_PATHS,restoreLearningData} from './db.js';

export const BACKUP_VERSION=1;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

export async function exportBackup(){
  const createdAt=new Date().toISOString(),stores={};
  await saveSetting('lastFullBackupAt',createdAt);
  for(const store of LEARNING_STORES)stores[store]=await all(store);
  return {backupVersion:BACKUP_VERSION,createdAt,appVersion:globalThis.MATH_PWA_VERSION?.appVersion||'dev',stores};
}

export function validateBackup(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('无效的备份文件');
  if(!own(data,'backupVersion')||data.backupVersion!==BACKUP_VERSION)throw Error('该备份版本与当前应用不兼容。');
  if(typeof data.createdAt!=='string'||Number.isNaN(Date.parse(data.createdAt)))throw Error('数据异常：缺少或无法识别备份时间');
  if(typeof data.appVersion!=='string'||!data.appVersion.trim())throw Error('数据异常：缺少应用版本');
  if(!data.stores||typeof data.stores!=='object'||Array.isArray(data.stores))throw Error('数据异常：缺少 stores 数据结构');
  const stats={};
  for(const store of LEARNING_STORES){
    const items=data.stores[store],keyPath=KEY_PATHS[store];
    if(!Array.isArray(items))throw Error(`数据异常：${store} 必须是数组`);
    for(const item of items){
      if(!item||typeof item!=='object'||Array.isArray(item))throw Error(`数据异常：${store} 包含非对象记录`);
      if(!own(item,keyPath)||item[keyPath]===null||item[keyPath]==='')throw Error(`数据异常：${store} 缺失关键字段 ${keyPath}`);
    }
    stats[store]=items.length;
  }
  return {backupVersion:data.backupVersion,createdAt:data.createdAt,appVersion:data.appVersion,stats};
}

export async function importBackup(data){
  const meta=validateBackup(data),counts=await restoreLearningData(data.stores);
  for(const [store,expected] of Object.entries(meta.stats))if(counts[store]!==expected)throw Error(`恢复后校验失败：${store} 记录数不一致`);
  return meta;
}
