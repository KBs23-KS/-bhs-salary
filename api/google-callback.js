
import {db,oauth,encrypt,fail,error,audit} from './_lib.js';
import {google} from 'googleapis';

export default async function handler(req,res){
  try {
    if(req.method!=='GET') throw error('Method not allowed',405);

    const state=String(req.query?.state||'');
    const code=String(req.query?.code||'');

    if(!/^[a-f0-9]{48}$/.test(state)||!code)
      throw error('OAuth state หรือ code ไม่ถูกต้อง',403);

    const stateRef=db().doc(`oauth_states/${state}`);
    const stateSnap=await stateRef.get();

    if(!stateSnap.exists||
       stateSnap.data().used||
       Date.now()>stateSnap.data().exp)
      throw error('คำขอเชื่อมต่อหมดอายุ',403);

    await stateRef.update({used:true});

    const auth=oauth();
    const {tokens}=await auth.getToken(code);

    if(!tokens.refresh_token)
      throw error(
        'ไม่ได้รับ Refresh Token กรุณาอนุญาต Google Drive อีกครั้ง',
        400
      );

    auth.setCredentials(tokens);

    const drive=google.drive({version:'v3',auth});

    const configRef=db().doc('settings/drive');
    const previous=await configRef.get();

    const previousFolderId=previous.data()?.folderId;
    let folderId=previousFolderId;

    if(folderId){
      // เชื่อมใหม่โดยคงโฟลเดอร์เดิมไว้
      // ไม่สร้างโฟลเดอร์ใหม่ทับข้อมูลอ้างอิง

      let oldFolder;

      try {
        oldFolder=(await drive.files.get({
          fileId:folderId,
          fields:'id,name,mimeType,trashed'
        })).data;

      }catch(e){
        console.error(
          'Existing Google Drive folder cannot be accessed:',
          e.message
        );

        throw error(
          'บัญชี Google ที่เลือกเข้าไม่ถึงโฟลเดอร์ PDF เดิม ' +
          'กรุณาใช้ Gmail เจ้าของไฟล์เดิม ' +
          'ไม่ได้เปลี่ยนข้อมูลการเชื่อมต่อ',
          409
        );
      }

      if(
        oldFolder.mimeType!==
          'application/vnd.google-apps.folder' ||
        oldFolder.trashed
      ){
        throw error(
          'โฟลเดอร์ PDF เดิมไม่พร้อมใช้งาน ' +
          'ไม่ได้เปลี่ยนข้อมูลการเชื่อมต่อ',
          409
        );
      }

    }else{
      // สร้างโฟลเดอร์เฉพาะเมื่อเชื่อมครั้งแรก

      const root=await drive.files.create({
        requestBody:{
          name:'BHS-Salary-System',
          mimeType:'application/vnd.google-apps.folder'
        },
        fields:'id,name'
      });

      folderId=root.data.id;

      for(const name of [
        'PDF-Documents',
        'PDF-Archive',
        'Backups'
      ]){
        await drive.files.create({
          requestBody:{
            name,
            mimeType:'application/vnd.google-apps.folder',
            parents:[folderId]
          },
          fields:'id'
        });
      }
    }

    // เก็บ Refresh Token ใหม่ แต่คงรหัสโฟลเดอร์เดิม
    await configRef.set({
      refresh:encrypt(tokens.refresh_token),
      folderId,
      connectedAt:Date.now()
    },{merge:true});

    await audit('เชื่อมต่อ Google Drive',{
      folderId,
      reusedExistingFolder:!!previousFolderId
    });

    res.status(200)
      .setHeader(
        'Content-Type',
        'text/html; charset=utf-8'
      )
      .setHeader('Cache-Control','no-store')
      .end(
        '<!doctype html>' +
        '<meta charset="utf-8">' +
        '<title>เชื่อมต่อสำเร็จ</title>' +
        '<body style="font:20px sans-serif;padding:40px">' +
        '<h2>เชื่อมต่อ Google Drive สำเร็จแล้ว</h2>' +
        '<p>ใช้โฟลเดอร์ PDF เดิม (ถ้ามี) ' +
        'กลับไปหน้าแอดมินและรีเฟรชข้อมูลได้เลย</p>' +
        '<a href="/">กลับหน้าเว็บไซต์</a></body>'
      );

  }catch(e){
    fail(res,e);
  }
}
