import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {db,googleDrive,fail,error,noCache} from './_lib.js';
export default async function handler(req,res){
 try {
  if(req.method!=='GET') throw error('Method not allowed',405);
  const ticket=String(req.query?.t||'');
  if(!/^[a-f0-9]{64}$/.test(ticket)) throw error('ลิงก์ไม่ถูกต้อง',403);
  const snap=await db().doc(`tickets/${createHash('sha256').update(ticket).digest('hex')}`).get();
  const d=snap.data();if(!d||Date.now()>d.exp) throw error('ลิงก์หมดอายุ กรุณากรอกรหัสผ่านใหม่',403);
  const [ps,ds,ts]=await Promise.all([db().doc(`periods/${d.p}`).get(),db().doc(`documents/${d.docId}`).get(),db().doc(`teachers/${d.t}`).get()]);
  const p=ps.data(),doc=ds.data(),t=ts.data();
  if(p?.status!=='published'||!p.members?.includes(d.t)||doc?.current?.fileId!==d.fileId||!t||t.status==='trash'||(t.status!=='active'&&!t.allowFormerAccess)) throw error('เอกสารนี้ถูกระงับสิทธิ์',403);
  if(req.query.download==='1'&&!p.allowDownload) throw error('ไม่อนุญาตให้ดาวน์โหลดในรอบนี้',403);
  const {auth}=await googleDrive(),accessToken=(await auth.getAccessToken()).token;
  if(!accessToken) throw error('เชื่อมต่อ Google Drive ไม่สำเร็จ',502);
  const headers={Authorization:`Bearer ${accessToken}`};
  if(req.headers.range) headers.Range=String(req.headers.range);
  const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(d.fileId)}?alt=media`,{headers});
  if(!response.ok) throw error(`Google Drive อ่านไฟล์ไม่ได้ (${response.status})`,502);
  noCache(res);res.statusCode=response.status;
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="salary-document.pdf"`);
  res.setHeader('Accept-Ranges','bytes');
  for(const key of ['content-length','content-range']){const v=response.headers.get(key);if(v) res.setHeader(key,v);}
  if(!response.body) {res.end();return;}
  Readable.fromWeb(response.body).pipe(res);
 }catch(e){ if(res.headersSent){res.destroy();}else fail(res,e); }
}
