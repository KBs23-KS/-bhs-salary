import {db,onlyMethod,json,fail} from './_lib.js';
export default async function handler(req,res){try{
 onlyMethod(req,'GET');
 const docs=await db().collection('periods').where('status','==','published').get();
 json(res,{periods:docs.docs.map(x=>({year:x.data().year,round:x.data().round})).sort((a,b)=>b.year-a.year||a.round-b.round)});
}catch(e){fail(res,e);}}
