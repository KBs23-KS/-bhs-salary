import { randomBytes, createHash, createHmac, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { google } from 'googleapis';

export const thirtyMinutes = 30 * 60 * 1000;
export const timestamp = () => Date.now();
const required = (key) => { const v=process.env[key]; if (!v) throw Error(`Missing server environment variable ${key}`); return v; };
export function db() {
  if (!getApps().length) initializeApp({ credential: cert({
    projectId: required('FIREBASE_PROJECT_ID'), clientEmail: required('FIREBASE_CLIENT_EMAIL'),
    privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g,'\n')
  }) });
  return getFirestore();
}
export function adminAuth() { db(); return getAuth(); }
export function nationalIdOk(id) { return /^\d{13}$/.test(String(id ?? '')); }
export function teacherKey(id) { return createHmac('sha256',required('ID_HASH_SECRET')).update(String(id)).digest('hex'); }
export function periodKey(year,round) {
  const y=Number(year), r=Number(round);
  if (!Number.isInteger(y)||y<2500||y>2700||![1,2].includes(r)) throw Error('ปีหรือรอบไม่ถูกต้อง');
  return `${y}-${r}`;
}
export function documentKey(p,t) { return `${p}_${t}`; }
export function safeText(v,len=150) { return String(v??'').trim().slice(0,len); }
export function hashPin(pin) {
  if(typeof pin!=='string'||pin.length<8||pin.length>64) throw Error('รหัส PDF ต้องมี 8–64 ตัวอักษร');
  const salt=randomBytes(16).toString('hex');
  return { salt, hash:scryptSync(pin,`${salt}:${required('PIN_PEPPER')}`,64).toString('hex') };
}
export function verifyPin(pin, rec) {
  if (!rec?.salt||!rec?.hash||!pin||pin.length>64) return false;
  const h=scryptSync(pin,`${rec.salt}:${required('PIN_PEPPER')}`,64);
  const stored=Buffer.from(rec.hash,'hex');
  return h.length===stored.length&&timingSafeEqual(h,stored);
}
export function newPin() { return randomBytes(10).toString('base64url'); }
export function json(res,data,status=200) { res.status(status).setHeader('Cache-Control','no-store').setHeader('Content-Type','application/json; charset=utf-8').json(data); }
export function fail(res,e) {
  const status=e.status||500;
  console.error('API:',e.message);
  json(res,{error:status===500?'ระบบขัดข้อง กรุณาลองใหม่หรือตรวจสอบการตั้งค่า':e.message},status);
}
export function error(message,status=400) { const e=new Error(message);e.status=status;return e; }
export function onlyMethod(req,m) { if(req.method!==m) throw error('Method not allowed',405); }
export function noCache(res) { res.setHeader('Cache-Control','private, no-store, max-age=0'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer'); }

export async function requireAdmin(req,{session=true}={}) {
  const header=String(req.headers.authorization||'');
  if (!header.startsWith('Bearer ')) throw error('กรุณาเข้าสู่ระบบแอดมิน',401);
  let user;
  try { user=await adminAuth().verifyIdToken(header.slice(7),true); } catch { throw error('เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',401); }
  if(user.uid!==required('ADMIN_UID')) throw error('บัญชีนี้ไม่ได้รับสิทธิ์แอดมิน',403);
  if(session) {
    const ref=db().doc(`admin_sessions/${user.uid}`), snap=await ref.get();
    if(!snap.exists||timestamp()-Number(snap.data().lastActive)>thirtyMinutes) throw error('ไม่มีการใช้งานนานเกิน 30 นาที กรุณาเข้าสู่ระบบใหม่',401);
    await ref.set({lastActive:timestamp()},{merge:true});
  }
  return user;
}
export async function startSession(req) {
  const user=await requireAdmin(req,{session:false});
  if (Math.abs(timestamp()-Number(user.auth_time)*1000)>5*60*1000) throw error('กรุณากรอกรหัสผ่านเข้าสู่ระบบใหม่',401);
  await db().doc(`admin_sessions/${user.uid}`).set({lastActive:timestamp()});
  await audit('เข้าสู่ระบบแอดมิน');
  return user;
}
export async function endSession(req) {
  const user=await requireAdmin(req,{session:false});
  await db().doc(`admin_sessions/${user.uid}`).set({lastActive:0});
  await audit('ออกจากระบบแอดมิน');
  return {ended:true};
}
export async function audit(action,details={}) {
  await db().collection('audit_logs').add({action,details,by:'admin',at:timestamp()});
}
export async function rateLimit(req,kind,limit,intervalMs) {
  // Minimal anti-enumeration protection; not a substitute for a CDN/WAF.
  const ip=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
  const bucket=Math.floor(timestamp()/intervalMs);
  const key=createHmac('sha256',required('ID_HASH_SECRET')).update(`${kind}|${ip}|${bucket}`).digest('hex');
  const ref=db().doc(`rate_limits/${key}`);
  let blocked=false;
  await db().runTransaction(async tx=>{
    const sn=await tx.get(ref),count=Number(sn.data()?.count||0)+1;
    if(count>limit) {blocked=true;return;}
    tx.set(ref,{count,kind,expireAt:timestamp()+2*intervalMs},{merge:true});
  });
  if(blocked) throw error('ร้องขอถี่เกินไป กรุณาลองใหม่ภายหลัง',429);
}
const key32=()=>{const key=Buffer.from(required('DRIVE_TOKEN_KEY_BASE64'),'base64');if(key.length!==32) throw Error('DRIVE_TOKEN_KEY_BASE64 must be 32 bytes, base64');return key;};
export function encrypt(text) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key32(),iv);
  const encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}
export function decrypt(value) {
  const [iv,tag,payload]=String(value).split('.');
  const decipher=createDecipheriv('aes-256-gcm',key32(),Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload,'base64')),decipher.final()]).toString('utf8');
}
export function oauth() { return new google.auth.OAuth2(required('GOOGLE_CLIENT_ID'),required('GOOGLE_CLIENT_SECRET'),required('GOOGLE_REDIRECT_URI')); }
export async function googleDrive() {
  const snap=await db().doc('settings/drive').get();
  if(!snap.exists||!snap.data()?.refresh) throw error('แอดมินต้องเชื่อมต่อ Google Drive ก่อน',409);
  const auth=oauth();auth.setCredentials({refresh_token:decrypt(snap.data().refresh)});
  return { drive:google.drive({version:'v3',auth}), auth, settings:snap.data() };
}
export async function ensureFolders(year,round) {
  const {drive,settings}=await googleDrive();
  async function folder(name,parent) {
    const q=`name = '${name.replace(/'/g,"\\'")}' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const list=await drive.files.list({q,fields:'files(id,name)',pageSize:20});
    if(list.data.files.length) return list.data.files[0].id;
    const file=await drive.files.create({requestBody:{name,mimeType:'application/vnd.google-apps.folder',parents:[parent]},fields:'id'});
    return file.data.id;
  }
  const root=settings.folderId;
  if(!root) throw error('ยังไม่มีโฟลเดอร์หลักใน Google Drive',409);
  const d=await folder('PDF-Documents',root), y=await folder(String(year),d), r=await folder(`รอบที่ ${round}`,y);
  return {folderId:r,drive};
}
export async function storeDriveJSON(name,payload) {
  const {drive,settings}=await googleDrive();
  const root=settings.folderId;
  const q=`name = 'Backups' and '${root}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing=await drive.files.list({q,fields:'files(id)',pageSize:1});
  let folderId=existing.data.files?.[0]?.id;
  if(!folderId) folderId=(await drive.files.create({requestBody:{name:'Backups',mimeType:'application/vnd.google-apps.folder',parents:[root]},fields:'id'})).data.id;
  const {Readable}=await import('node:stream');
  return drive.files.create({requestBody:{name,mimeType:'application/json',parents:[folderId]},media:{mimeType:'application/json',body:Readable.from([JSON.stringify(payload)])},fields:'id,name'});
}
export async function backupSnapshot() {
  const names=['teachers','periods','documents','trash','audit_logs'];
  const collections={};
  for(const name of names) collections[name]=(await db().collection(name).get()).docs.map(x=>({id:x.id,...x.data()}));
  // Never export live PIN hashes or admin Google OAuth secrets into general-purpose backups.
  collections.teachers=collections.teachers.map(({pin,...t})=>t);
  const name=`firestore-metadata-${new Date().toISOString().replace(/[.:]/g,'-')}.json`;
  await storeDriveJSON(name,{createdAt:timestamp(),notice:'Metadata-only backup, does not include actual PDF bytes or password hashes; not a full disaster recovery backup.',collections});
  return name;
}
