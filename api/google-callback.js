import {db,oauth,encrypt,fail,error,audit} from './_lib.js';
import {google} from 'googleapis';
export default async function handler(req,res){
 try {
  if(req.method!=='GET') throw error('Method not allowed',405);
  const state=String(req.query?.state||''),code=String(req.query?.code||'');
  if(!/^[a-f0-9]{48}$/.test(state)||!code) throw error('OAuth state หรือ code ไม่ถูกต้อง',403);
  const ref=db().doc(`oauth_states/${state}`),snap=await ref.get();
  if(!snap.exists||snap.data().used||Date.now()>snap.data().exp) throw error('คำขอเชื่อมต่อหมดอายุ',403);
  await ref.update({used:true});
  const auth=oauth();const {tokens}=await auth.getToken(code);
  if(!tokens.refresh_token) throw error('ไม่ได้รับ Refresh Token กรุณายกเลิกสิทธิ์เก่าใน Google แล้วเชื่อมต่อใหม่',400);
  auth.setCredentials(tokens);
  const drive=google.drive({version:'v3',auth});
  const root=await drive.files.create({requestBody:{name:'BHS-Salary-System',mimeType:'application/vnd.google-apps.folder'},fields:'id,name'});
  const id=root.data.id;
  for(const name of ['PDF-Documents','PDF-Archive','Backups']) await drive.files.create({requestBody:{name,mimeType:'application/vnd.google-apps.folder',parents:[id]},fields:'id'});
  await db().doc('settings/drive').set({refresh:encrypt(tokens.refresh_token),folderId:id,connectedAt:Date.now()});
  await audit('เชื่อมต่อ Google Drive',{folderId:id});
  res.status(200).setHeader('Content-Type','text/html; charset=utf-8').setHeader('Cache-Control','no-store').end('<!doctype html><meta charset="utf-8"><title>เชื่อมต่อสำเร็จ</title><body style="font:20px sans-serif;padding:40px"><h2>เชื่อมต่อ Google Drive สำเร็จแล้ว</h2><p>กลับไปยังหน้าแอดมินและกดรีเฟรชข้อมูลได้เลย</p><a href="/">กลับหน้าเว็บไซต์</a></body>');
 }catch(e){fail(res,e);}
}
