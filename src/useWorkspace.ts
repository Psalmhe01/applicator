import { useEffect, useState } from 'react';
import { emptyWorkspace, workspaceSchema, type Workspace, type Profile, type Job } from './model';
const key='applicator.workspace.v1';
export function useWorkspace() {
  const [initial] = useState(()=>{try{const raw=localStorage.getItem(key);return {value:raw?workspaceSchema.parse(JSON.parse(raw)):emptyWorkspace(),error:''};}catch{return {value:emptyWorkspace(),error:'The saved workspace could not be read. Export the recovery file before resetting local storage.'};}});
  const [workspace,setWorkspace]=useState<Workspace>(initial.value);
  const [storageError,setStorageError]=useState(initial.error);
  const [recoveryNeeded,setRecoveryNeeded]=useState(Boolean(initial.error));
  const [saveState,setSaveState]=useState('Saved on this device');
  useEffect(()=>{if(recoveryNeeded)return;try{localStorage.setItem(key,JSON.stringify(workspace));setStorageError('');setSaveState('Saved on this device');}catch{setStorageError('Device storage is full or unavailable. Export a backup now to preserve your work.');setSaveState('Device save failed');}},[workspace,recoveryNeeded]);
  const update=(fn:(previous:Workspace)=>Workspace)=>setWorkspace(prev=>({...fn(prev),updatedAt:new Date().toISOString()}));
  const saveProfile=(profile:Profile)=>update(w=>({...w,profile}));
  const saveJob=(job:Job)=>update(w=>({...w,jobs:w.jobs.some(j=>j.id===job.id)?w.jobs.map(j=>j.id===job.id?job:j):[job,...w.jobs]}));
  const removeJob=(id:string)=>update(w=>({...w,jobs:w.jobs.filter(j=>j.id!==id)}));
  const replace=(next:Workspace)=>{workspaceSchema.parse(next);setRecoveryNeeded(false);setWorkspace(next);};
  return {workspace,saveProfile,saveJob,removeJob,replace,storageError,saveState,recoveryNeeded,recoveryRaw:()=>localStorage.getItem(key)||'',reset:()=>replace(emptyWorkspace())};
}
