import {randomBytes,createHash} from 'node:crypto';
import {db,periodKey,teacherKey,nationalIdOk,rateLimit,onlyMethod,json,fail,error,documentKey,verifyPin,timestamp} from './_lib.js';
export default async function handler(req,res) {
 try {
  onlyMethod(req,'POST'); await rateLimit(req,'pdf-pin',16,60*60*1000);
  const {nationalId,year,round,pin}=req.body||{};
  if(!nationalIdOk(nationalId)||typeof pin!=='string') throw error('ข้อมูลไม่ถูกต้อง');
  const p=periodKey(year,round),t=teacherKey(nationalId);
  const [ps,ts,ds]=await Promise.all([db().doc(`periods/${p}`).get(),db().doc(`teachers/${t}`).get(),db().doc(`documents/${documentKey(p,t)}`).get()]);
  const period=ps.data(),teacher=ts.data(),doc=ds.data();
  if(period?.status!=='published'||!period.members?.includes(t)||!teacher||teacher.status==='trash'||(teacher.status!=='active'&&!teacher.allowFormerAccess)||!doc?.current) throw error('ไม่สามารถเปิดเอกสารรายการนี้ได้',403);
  if(!verifyPin(pin,teacher.pin)) throw error('รหัสผ่านไม่ถูกต้อง',403);
  const ticket=randomBytes(32).toString('hex');
  await db().doc(`tickets/${createHash('sha256').update(ticket).digest('hex')}`).set({t,p,docId:documentKey(p,t),fileId:doc.current.fileId,exp:timestamp()+5*60*1000});
  json(res,{url:`/api/file?t=${ticket}`,downloadAllowed:!!period.allowDownload});
 }catch(e){fail(res,e);}
}
