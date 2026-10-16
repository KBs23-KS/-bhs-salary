import {randomBytes} from 'node:crypto';
import {db,requireAdmin,startSession,endSession,audit,onlyMethod,json,fail,error,teacherKey,nationalIdOk,periodKey,documentKey,hashPin,newPin,safeText,googleDrive,ensureFolders,oauth,backupSnapshot,timestamp} from './_lib.js';
const statuses=['active','moved','resigned','retired'];
async function getAll(){
 const [teachers,periods,documents,trash,audits,drive]=await Promise.all([
   db().collection('teachers').get(),db().collection('periods').get(),db().collection('documents').get(),
   db().collection('trash').limit(200).get(),db().collection('audit_logs').orderBy('at','desc').limit(150).get(),db().doc('settings/drive').get()
 ]);
 const entries=s=>s.docs.map(d=>({key:d.id,...d.data()}));
 return {teachers:entries(teachers).map(({pin,...t})=>({...t,pinSet:!!pin})),periods:entries(periods),documents:entries(documents),trash:entries(trash),audits:entries(audits),driveConnected:!!drive.data()?.folderId};
}
function validatePerson(input){
 const nationalId=String(input.nationalId??'').trim(),name=safeText(input.name),position=safeText(input.position),dept=safeText(input.dept);
 if(!nationalIdOk(nationalId)||!name||!position||!dept) throw error('กรอกข้อมูลครูให้ครบ และเลขประชาชนต้องมี 13 หลัก');
 return {nationalId,name,position,dept};
}
async function saveTeacher(b){
 const p=validatePerson(b),key=teacherKey(p.nationalId),ref=db().doc(`teachers/${key}`),sn=await ref.get(),old=sn.data();
 if(old?.status==='trash') throw error('ครูอยู่ในถังขยะ กรุณากู้คืนก่อน',409);
 const status=statuses.includes(b.status)?b.status:(old?.status||'active');
 const update={nationalId:p.nationalId,name:p.name,position:p.position,dept:p.dept,status,allowFormerAccess:b.allowFormerAccess===undefined?(old?.allowFormerAccess??false):!!b.allowFormerAccess,updatedAt:timestamp()};
 let pin;
 if(b.pin){pin=String(b.pin);update.pin=hashPin(pin);}
 else if(!old?.pin){pin=newPin();update.pin=hashPin(pin);}
 if(!old) update.createdAt=timestamp();
 await ref.set(update,{merge:true});
 await audit(old?'แก้ไขครู':'เพิ่มครู',{teacherKey:key,old:old?{name:old.name,position:old.position,dept:old.dept,status:old.status}:null,now:{name:p.name,position:p.position,dept:p.dept,status}});
 return {key,pin:pin||null};
}
async function importTeachers(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>400) throw error('รองรับ Excel ครั้งละ 1–400 คน');
 const seen=new Set(),results=[];
 for(const entry of rows){
  const p=validatePerson(entry),key=teacherKey(p.nationalId);
  if(seen.has(key)) throw error(`พบเลขประชาชนซ้ำในไฟล์: ${p.name}`);
  seen.add(key);
  const ref=db().doc(`teachers/${key}`),old=(await ref.get()).data();
  if(old?.status==='trash') throw error(`${p.name} อยู่ในถังขยะ กรุณากู้คืนก่อน`);
  const changed=!old||old.name!==p.name||old.position!==p.position||old.dept!==p.dept;
  let pin=null;
  if(changed){
    const update={...p,updatedAt:timestamp()};
    if(!old) {pin=newPin();update.pin=hashPin(pin);update.status='active';update.allowFormerAccess=false;update.createdAt=timestamp();}
    await ref.set(update,{merge:true});
  }
  results.push({name:p.name,nationalId:p.nationalId,status:old?(changed?'updated':'same'):'added',pin});
 }
 await audit('นำเข้า Excel',{count:rows.length,added:results.filter(x=>x.status==='added').length,updated:results.filter(x=>x.status==='updated').length});
 return results;
}
async function makePeriod(b){
 const year=Number(b.year),round=Number(b.round),p=periodKey(year,round),ref=db().doc(`periods/${p}`),old=await ref.get();
 if(old.exists) throw error('ปีและรอบนี้มีอยู่แล้ว',409);
 const people=await db().collection('teachers').where('status','==','active').get();
 const members=people.docs.map(d=>d.id);
 await ref.create({year,round,status:'draft',members,allowDownload:false,createdAt:timestamp()});
 await audit('สร้างรอบประเมิน',{periodId:p,count:members.length});
 return {periodId:p,count:members.length};
}
async function changeRoster(b){
 const p=periodKey(b.year,b.round),ref=db().doc(`periods/${p}`),sn=await ref.get();
 if(!sn.exists) throw error('ไม่พบรอบประเมิน',404);
 const list=Array.isArray(b.members)?b.members:[];
 if(list.length>800||new Set(list).size!==list.length) throw error('รายชื่อซ้ำหรือจำนวนมากเกินไป');
 const refs=await Promise.all(list.map(x=>db().doc(`teachers/${x}`).get()));
 if(refs.some(x=>!x.exists||x.data().status==='trash')) throw error('มีรายชื่อครูที่ไม่ถูกต้อง');
 await ref.update({members:list,updatedAt:timestamp()});
 await audit('ปรับผู้เข้าร่วมประเมิน',{periodId:p,oldCount:sn.data().members?.length||0,newCount:list.length});
 return {count:list.length};
}
async function publishing(b,person=false){
 const p=periodKey(b.year,b.round),ref=db().doc(`periods/${p}`),ps=await ref.get();
 if(!ps.exists) throw error('ไม่พบรอบประเมิน',404);
 const period=ps.data();
 if(person&&period.status!=='published') throw error('ต้องเผยแพร่ทั้งรอบครั้งแรกก่อน');
 if(!person&&!period.members?.length) throw error('ไม่มีรายชื่อผู้เข้าร่วม');
 const docRefs=person?[db().doc(`documents/${documentKey(p,String(b.teacherKey))}`)]:period.members.map(t=>db().doc(`documents/${documentKey(p,t)}`));
 const docs=await Promise.all(docRefs.map(r=>r.get()));
 const pending=docs.filter(x=>x.data()?.pending).length;
 if(!person&&!b.confirm) return {confirmNeeded:true,participants:period.members.length,pending,missing:docs.filter(x=>!x.data()?.pending&&!x.data()?.current).length};
 if(person&&!pending) throw error('ไม่พบ PDF ฉบับร่างสำหรับครูคนนี้');
 // Firestore batches limited to 500 operations; school size normally much smaller.
 if(docs.length>450) throw error('กรุณาติดต่อผู้พัฒนาเพื่อรองรับมากกว่า 450 คนต่อรอบ');
 const batch=db().batch();let changed=0;
 for(const ds of docs){const d=ds.data();if(!d?.pending)continue;
   const history=[...(d.history||[])];if(d.current) history.push(d.current);
   batch.update(ds.ref,{current:{...d.pending,publishedAt:timestamp()},pending:null,history});changed++;
 }
 if(!person)batch.update(ref,{status:'published',publishedAt:timestamp()});
 await batch.commit();
 await audit(person?'เผยแพร่ PDF รายบุคคล':'เผยแพร่ทั้งรอบ',{periodId:p,teacherKey:person?String(b.teacherKey):null,changed});
 return {published:changed};
}
async function uploadStart(b){
 const p=periodKey(b.year,b.round),teacherId=String(b.teacherKey||''),size=Number(b.size);
 if(!/^[a-f0-9]{64}$/.test(teacherId)) throw error('ครูไม่ถูกต้อง');
 if(!Number.isSafeInteger(size)||size<1||size>25*1024*1024) throw error('รองรับ PDF ขนาดไม่เกิน 25 MB ต่อไฟล์');
 if(!String(b.name||'').toLowerCase().endsWith('.pdf')) throw error('กรุณาใช้ไฟล์ PDF');
 const ps=await db().doc(`periods/${p}`).get();
 if(!ps.exists||!ps.data().members?.includes(teacherId)) throw error('ครูไม่ได้เข้าร่วมรอบนี้');
 const {folderId}=await ensureFolders(b.year,b.round);
 const {auth}=await googleDrive(),token=(await auth.getAccessToken()).token;
 const created=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/pdf','X-Upload-Content-Length':String(size)},
  body:JSON.stringify({name:`${randomBytes(12).toString('hex')}.pdf`,mimeType:'application/pdf',parents:[folderId]})
 });
 if(!created.ok) throw error(`Google Drive เริ่มอัปโหลดไม่สำเร็จ (${created.status})`,502);
 const uploadUrl=created.headers.get('location');if(!uploadUrl)throw error('ไม่ได้รับ Upload URL',502);
 const id=randomBytes(18).toString('base64url');
 await db().doc(`upload_sessions/${id}`).set({uploadUrl,size,offset:0,exp:timestamp()+60*60*1000,complete:false,periodId:p,teacherId,originalName:safeText(b.name,180)});
 return {id,offset:0};
}
async function trashPdf(b){
 const p=periodKey(b.year,b.round),t=String(b.teacherKey),dref=db().doc(`documents/${documentKey(p,t)}`),snap=await dref.get(),d=snap.data();
 if(!d?.current&&!d?.pending) throw error('ไม่มี PDF ให้ลบ');
 const key=randomBytes(10).toString('hex');
 await db().collection('trash').doc(key).set({type:'pdf',periodId:p,teacherId:t,data:d,at:timestamp()});
 await dref.set({current:null,pending:null,history:d.history||[]},{merge:true});
 await audit('ย้าย PDF เข้าถังขยะ',{periodId:p,teacherKey:t,trashId:key});
 return {trashId:key};
}
async function trashTeacher(b){
 const key=String(b.teacherKey),ref=db().doc(`teachers/${key}`),sn=await ref.get();
 if(!sn.exists) throw error('ไม่พบครู');
 if(sn.data().status==='trash') throw error('อยู่ในถังขยะแล้ว');
 const id=randomBytes(10).toString('hex');
 await db().doc(`trash/${id}`).set({type:'teacher',teacherId:key,previousStatus:sn.data().status,at:timestamp()});
 await ref.update({status:'trash'});
 await audit('ย้ายข้อมูลครูเข้าถังขยะ',{teacherKey:key,trashId:id});return {trashId:id};
}
async function restoreTrash(b){
 const id=String(b.trashId),ref=db().doc(`trash/${id}`),sn=await ref.get(),it=sn.data();if(!it) throw error('ไม่พบรายการในถังขยะ');
 if(it.type==='teacher') await db().doc(`teachers/${it.teacherId}`).update({status:it.previousStatus});
 else if(it.type==='pdf') {
   const dref=db().doc(`documents/${documentKey(it.periodId,it.teacherId)}`),curr=(await dref.get()).data()||{};
   if(curr.current||curr.pending) throw error('มีเอกสารใหม่แล้ว ไม่สามารถกู้ทับได้');
   await dref.set({...it.data,current:null,pending:it.data.current||it.data.pending||null},{merge:true});
 } else throw error('ประเภทถังขยะไม่ถูกต้อง');
 await ref.delete();await audit('กู้คืนจากถังขยะ',{trashId:id,type:it.type});return {restored:true};
}
async function updateDownload(b){
 const p=periodKey(b.year,b.round),ref=db().doc(`periods/${p}`),sn=await ref.get();
 if(!sn.exists) throw error('ไม่พบรอบประเมิน');
 await ref.update({allowDownload:!!b.allowDownload});
 await audit('เปลี่ยนสิทธิ์ดาวน์โหลด',{periodId:p,from:!!sn.data().allowDownload,to:!!b.allowDownload});return {saved:true};
}
async function togglePeriod(b){
 const p=periodKey(b.year,b.round),ref=db().doc(`periods/${p}`),sn=await ref.get();
 if(!sn.exists) throw error('ไม่พบรอบประเมิน');
 const next=sn.data().status==='published'?'closed':'published';
 if(next==='published'&&!sn.data().publishedAt) throw error('กรุณาเผยแพร่รอบครั้งแรกก่อน');
 await ref.update({status:next});await audit('เปลี่ยนสถานะเผยแพร่',{periodId:p,to:next});return {status:next};
}
async function connectDrive(){
 const state=randomBytes(24).toString('hex');
 await db().doc(`oauth_states/${state}`).set({used:false,exp:timestamp()+10*60*1000});
 const url=oauth().generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive.file'],state});
 return {url};
}
export default async function handler(req,res){
 try {
  const action=String(req.query?.action||'');
  onlyMethod(req,'POST');
  if(action==='sessionStart') {await startSession(req);return json(res,{ok:true});}
  if(action==='sessionEnd') {await endSession(req);return json(res,{ok:true});}
  await requireAdmin(req);
  const b=req.body||{};let out;
  switch(action){
   case 'bootstrap':out=await getAll();break;
   case 'teacherSave':out=await saveTeacher(b);break;
   case 'teacherImport':out={results:await importTeachers(b.rows)};break;
   case 'pinReset':{
      const key=String(b.teacherKey),ref=db().doc(`teachers/${key}`),sn=await ref.get();if(!sn.exists)throw error('ไม่พบครู');
      const pin=b.pin?String(b.pin):newPin();await ref.update({pin:hashPin(pin)});await audit('ตั้งรหัส PDF ใหม่',{teacherKey:key});out={pin};break;
   }
   case 'periodCreate':out=await makePeriod(b);break;
   case 'rosterSave':out=await changeRoster(b);break;
   case 'publishPeriod':out=await publishing(b,false);break;
   case 'publishOne':out=await publishing(b,true);break;
   case 'periodToggle':out=await togglePeriod(b);break;
   case 'downloadSetting':out=await updateDownload(b);break;
   case 'uploadStart':out=await uploadStart(b);break;
   case 'trashPdf':out=await trashPdf(b);break;
   case 'trashTeacher':out=await trashTeacher(b);break;
   case 'restore':out=await restoreTrash(b);break;
   case 'driveConnect':out=await connectDrive();break;
   case 'backupNow':out={name:await backupSnapshot(),note:'สำรอง metadata เท่านั้น ยังไม่ใช่สำรอง PDF เต็มรูปแบบ'};await audit('สำรองข้อมูลด้วยตนเอง',{name:out.name});break;
   default:throw error('คำสั่งไม่ถูกต้อง',404);
  }
  json(res,{ok:true,...out});
 }catch(e){fail(res,e);}
}
