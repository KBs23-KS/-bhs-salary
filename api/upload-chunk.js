import {db,requireAdmin,googleDrive,error,fail,json,audit,documentKey,timestamp} from './_lib.js';
export const config={api:{bodyParser:false}};
async function bytes(req,max){
 const chunks=[];let len=0;
 for await(const c of req){len+=c.length;if(len>max) throw error('ชิ้นไฟล์ใหญ่เกินกำหนด',413);chunks.push(c);}
 return Buffer.concat(chunks);
}
export default async function handler(req,res){
 try {
  if(req.method!=='POST') throw error('Method not allowed',405);
  await requireAdmin(req);
  const sid=String(req.query?.id||'');
  if(!/^[a-zA-Z0-9_-]{20,70}$/.test(sid)) throw error('รหัสการอัปโหลดไม่ถูกต้อง');
  const ref=db().doc(`upload_sessions/${sid}`),snap=await ref.get(),s=snap.data();
  if(!s||s.complete||Date.now()>s.exp) throw error('การอัปโหลดหมดอายุ กรุณาเริ่มใหม่',409);
  // Vercel Node functions may expose an octet-stream body as a Buffer.
  const chunk=Buffer.isBuffer(req.body)?req.body:await bytes(req,1024*1024);
  if(!chunk.length||chunk.length>1024*1024) throw error('ขนาดชิ้นไฟล์ไม่ถูกต้อง');
  if(s.offset===0&&!chunk.subarray(0,1024).includes(Buffer.from('%PDF-'))) throw error('เนื้อหาไฟล์ไม่ใช่ PDF');
  if(s.offset+chunk.length<s.size&&chunk.length%(256*1024)!==0) throw error('ขนาดชิ้นไฟล์ต้องเป็นผลคูณของ 256 KB');
  const from=s.offset,to=s.offset+chunk.length-1;
  if(to>=s.size) throw error('ข้อมูลเกินขนาดไฟล์');
  const {auth}=await googleDrive(),token=(await auth.getAccessToken()).token;
  const driveResult=await fetch(s.uploadUrl,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Length':String(chunk.length),'Content-Range':`bytes ${from}-${to}/${s.size}`,'Content-Type':'application/pdf'},body:chunk});
  if(driveResult.status===308){
    const m=/bytes=0-(\d+)/.exec(driveResult.headers.get('range')||'');
    const next=m?Number(m[1])+1:0;
    await ref.update({offset:next});
    return json(res,{complete:false,offset:next});
  }
  if(!driveResult.ok) throw error(`Google Drive ไม่สามารถบันทึกชิ้นไฟล์ (${driveResult.status})`,502);
  const created=await driveResult.json(),fileId=created.id;
  if(!fileId) throw error('Google Drive ไม่ส่ง File ID กลับมา',502);
  const docId=documentKey(s.periodId,s.teacherId),dref=db().doc(`documents/${docId}`);
  await db().runTransaction(async tx=>{
    const snap=await tx.get(dref),old=snap.data()||{};
    const history=[...(old.history||[])];
    if(old.pending) history.push({...old.pending,discarded:true});
    tx.set(dref,{periodId:s.periodId,teacherId:s.teacherId,current:old.current||null,pending:{fileId,name:s.originalName,uploadedAt:timestamp()},history},{merge:true});
  });
  await ref.update({offset:s.size,complete:true,fileId});
  await audit('อัปโหลด PDF ฉบับร่าง',{periodId:s.periodId,teacherId:s.teacherId,docId,fileId});
  json(res,{complete:true,offset:s.size});
 }catch(e){fail(res,e);}
}
