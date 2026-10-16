import {db, periodKey, teacherKey, nationalIdOk, rateLimit, onlyMethod, json, fail, error, documentKey} from './_lib.js';
export default async function handler(req,res) {
  try {
    onlyMethod(req,'POST');
    await rateLimit(req,'search',60,60*60*1000);
    const {nationalId,year,round}=req.body||{};
    if(!nationalIdOk(nationalId)) throw error('กรอกเลขประจำตัวประชาชน 13 หลัก');
    const p=periodKey(year,round),t=teacherKey(nationalId);
    const [ps,ts,ds]=await Promise.all([db().doc(`periods/${p}`).get(),db().doc(`teachers/${t}`).get(),db().doc(`documents/${documentKey(p,t)}`).get()]);
    const period=ps.data(), teacher=ts.data();
    if(period?.status!=='published'||!period?.members?.includes(t)||!teacher||teacher.status==='trash'||(teacher.status!=='active'&&!teacher.allowFormerAccess)) {
      return json(res,{found:false});
    }
    json(res,{found:true,name:teacher.name,position:teacher.position,dept:teacher.dept,year:Number(year),round:Number(round),hasPdf:!!ds.data()?.current});
  } catch(e) {fail(res,e);}
}
