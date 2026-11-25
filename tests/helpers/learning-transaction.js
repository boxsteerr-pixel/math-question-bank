// Only the legacy scoring and carryover VM fixtures use this connector.
// Dedicated restore/scope and browser tests independently exercise abort behavior.
export function connectLearningTransaction(db,deleteRow){
  db.openDB=async()=>({transaction(){
    const writes=[];
    let aborted=false;
    const tx={
      abort(){aborted=true},
      objectStore(name){
        return {
          get:key=>request(()=>db.get(name,key)),
          getAll:()=>request(()=>db.all(name)),
          put:row=>writes.push(()=>db.put(name,row)),
          delete:key=>writes.push(()=>deleteRow(name,key))
        };
      }
    };
    let pending=0;
    const request=operation=>{
      const result={};
      pending++;
      Promise.resolve().then(operation).then(value=>{
        result.result=value;
        pending--;
        result.onsuccess();
      });
      return result;
    };
    setImmediate(async function drain(){
      if(aborted){tx.onabort();return}
      if(pending){setImmediate(drain);return}
      for(const write of writes)await write();
      tx.oncomplete();
    });
    return tx;
  }});
}
