import {backupSnapshot,error,fail,json,audit} from './_lib.js';
export default async function handler(req,res){
 try {
  if(req.method!=='GET') throw error('Method not allowed',405);
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`) throw error('Unauthorized',401);
  const name=await backupSnapshot();
  await audit('สำรองข้อมูลรายวัน',{name,kind:'metadata-only'});
  json(res,{ok:true,name,note:'Metadata only; PDF contents require a separate independent backup'});
 }catch(e){fail(res,e);}
}
