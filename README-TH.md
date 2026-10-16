# BHS Salary – คู่มือเชื่อม Firebase + Google Drive + GitHub + Vercel

> **อัปเดต:** ตั้งค่าด้านหน้าเว็บสำหรับ Firebase โปรเจกต์ `bhs-salary` ใน `.env.production` ให้แล้ว โปรดอ่าน `เริ่มต้นตั้งค่า-Firebase-TH.md` ก่อนตั้งค่า Vercel

> รุ่นเริ่มต้น (MVP): ใช้เว็บไซต์เดิมเป็นต้นแบบหน้าแรก, มีปุ่มแอดมิน, เพิ่มครู/Excel, ปี/รอบ, เลือกผู้เข้าร่วม, อัปโหลด PDF รายคน/หลายไฟล์, เผยแพร่ทั้งรอบ/รายคน, ตรวจรหัสก่อนเปิด PDF, สิทธิ์ดาวน์โหลด, ถังขยะพร้อมกู้คืน, Audit Log, สำรองข้อมูลประกอบรายวัน และออกจากระบบเมื่อไม่มีการใช้งาน 30 นาที
>
> **ยังไม่ควรใช้ข้อมูลเงินเดือนจริงจนกว่าจะทดสอบสิทธิ์ ความปลอดภัย และกู้คืนจริงอย่างครบถ้วน** โดยเฉพาะการแสดงชื่อครูหลังกรอกเลขประชาชน และการดู PDF แบบไม่เข้ารหัสไฟล์

## ต้องเตรียม

- บัญชี GitHub, Vercel และ Gmail เดิมที่จะเก็บไฟล์ PDF
- โปรเจกต์ Firebase **ใหม่** ไม่ใช้ Google Sheets เดิม
- Node.js 22 ขึ้นไป หากต้องการทดสอบโค้ดบนเครื่อง
- โปรด **อย่าส่งหรืออัปโหลด** service account key, client secret, refresh token และรหัสผ่านใน GitHub หรือในแชต

## ขั้นที่ 1 — สร้าง Firebase

1. เข้า https://console.firebase.google.com/ > **Add project** สร้างโปรเจกต์ เช่น `bhs-salary`
2. ไปที่ **Build > Firestore Database > Create database** และเลือกที่ตั้งฐานข้อมูลตามความเหมาะสม (ตั้งแล้วเปลี่ยนไม่ได้ง่าย)
3. ไปที่แท็บ **Rules** แทนที่กฎด้วยเนื้อหาไฟล์ `firestore.rules` แล้ว Publish (ตัวเว็บอ่าน Firestore ผ่าน API ระบบหลังบ้านเท่านั้น)
4. ไปที่ **Authentication > Sign-in method** เปิด **Email/Password**
5. ไปที่ **Authentication > Users > Add user** สร้างผู้ดูแลเพียงคนเดียวด้วยอีเมลที่คุณควบคุมเอง และ **ตั้งรหัสผ่านที่เดายากทันที** (ไม่ใช้ 123456 บนระบบจริง)
6. คัดลอก **UID** ของบัญชีนี้สำหรับ `ADMIN_UID`
7. ไปที่ **Project settings > General > Your apps > Add Web app** สร้าง Web app แล้วคัดลอก `apiKey`, `authDomain`, `projectId`, `appId` ไปยังตัวแปร `VITE_FIREBASE_*`
8. ไปที่ **Project settings > Service accounts > Generate new private key** ดาวน์โหลด JSON แล้วอ่านเพียง 3 ค่า `project_id`, `client_email`, `private_key` ใช้ใน `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` ตามลำดับ **ห้ามอัปโหลด JSON ขึ้น GitHub**

## ขั้นที่ 2 — เปิด Google Drive API และ OAuth

1. เข้า https://console.cloud.google.com/ เลือก **Google Cloud project เดียวกับ Firebase** จากรายการโครงการ
2. ไปที่ **APIs & Services > Library** ค้นหา **Google Drive API** แล้วกด Enable
3. ไปที่ **Google Auth Platform / OAuth consent screen** ตั้งชื่อแอป อีเมลติดต่อ และเลือก External สำหรับบัญชี Gmail ทั่วไป
4. เพิ่ม scope: `https://www.googleapis.com/auth/drive.file` เพื่อให้แอปจัดการไฟล์ที่แอปสร้างเองโดยไม่ต้องอ่าน Drive ทั้งบัญชี
5. ไปที่ **Clients > Create client > Web application** ตั้งชื่อ และเพิ่ม **Authorized redirect URI** ให้ตรงกับโดเมนเว็บไซต์จริง เช่น `https://bhs-salary.vercel.app/api/google-callback`
6. คัดลอก Client ID / Client Secret ไปที่ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` และใส่ URL เดียวกันใน `GOOGLE_REDIRECT_URI`
7. ในระหว่างโหมด Testing เพิ่ม Gmail ของผู้ใช้งานเป็น Test user ตามข้อกำหนดของ Google **ข้อควรทราบ:** OAuth ในโหมด Testing สำหรับบาง scope อาจได้ Refresh Token อายุสั้นเพียง 7 วัน ต้องตั้งค่าการเผยแพร่ OAuth ให้เหมาะสมก่อนใช้งานต่อเนื่อง
8. หลังนำเว็บไซต์ขึ้น Vercel แล้ว ให้ล็อกอินแอดมิน > **ตั้งค่า > เชื่อมต่อ Google Drive** เลือก **Gmail เดิม** และอนุญาตสิทธิ์ ระบบจะสร้างโฟลเดอร์ `BHS-Salary-System` พร้อม `PDF-Documents`, `PDF-Archive`, `Backups` ให้

**ข้อควรระวัง:** หากเชื่อม Gmail ใหม่ขณะที่มี PDF เก่าอยู่ ระบบปัจจุบันจะสร้างโฟลเดอร์ใหม่ ไม่ย้าย PDF เดิมอัตโนมัติ การเชื่อมใหม่ต้องตรวจสอบก่อน

## ขั้นที่ 3 — เตรียมรหัสลับ Environment Variables

เปิดไฟล์ `.env.example` เพื่อดูชื่อตัวแปรทั้งหมด (ไฟล์ตัวอย่างนี้ไม่มีรหัสลับจริง)

บนเครื่องที่ติดตั้ง Node.js สามารถสร้างค่าลับได้ด้วยคำสั่งต่อไปนี้ (รันแยก 3 ครั้งเพื่อให้ได้ 3 ค่าที่ไม่ซ้ำ):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

- ค่าครั้งที่ 1 → `DRIVE_TOKEN_KEY_BASE64` (ต้องเป็น base64 ของ 32 bytes)
- ค่าครั้งที่ 2 → `ID_HASH_SECRET`
- ค่าครั้งที่ 3 → `PIN_PEPPER`
- สร้างค่าอีกครั้ง → `CRON_SECRET` สำหรับงานสำรองอัตโนมัติ
- **สำคัญ:** เก็บค่าเหล่านี้ไว้อย่างปลอดภัย หากเปลี่ยน `DRIVE_TOKEN_KEY_BASE64` จะถอดรหัส token Drive เดิมไม่ได้ หากเปลี่ยน `ID_HASH_SECRET` จะหาครูเดิมไม่เจอ และหากเปลี่ยน `PIN_PEPPER` รหัส PDF ที่มีอยู่จะตรวจสอบไม่ได้
- `FIREBASE_PRIVATE_KEY` ต้องใส่ค่า private key ตาม JSON แบบขึ้นบรรทัดด้วย `\n` โดยไม่เผยแพร่สู่ frontend

## ขั้นที่ 4 — นำซอร์สขึ้น GitHub

วิธีผ่านเว็บไซต์ (ไม่ต้องลง Git):

1. แตก ZIP โครงการนี้
2. เข้า https://github.com/new ตั้ง Repository เป็น **Private**
3. กด **uploading an existing file** แล้วลากไฟล์และโฟลเดอร์ทั้งหมดจากในโฟลเดอร์โครงการขึ้นไป (ต้องคงโครงสร้าง `api/`, `src/`, `public/`)
4. **อย่าอัปโหลดไฟล์ `.env`, service account JSON หรือ token ใด ๆ** และอย่าคัดลอกไฟล์ส่วนตัวลง repo

หรือใช้เทอร์มินัลในโฟลเดอร์โครงการ:

```bash
git init
git add .
git commit -m "Initial BHS Salary Firebase Drive"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## ขั้นที่ 5 — นำขึ้น Vercel

1. ไป https://vercel.com/new เลือก **Import Git Repository** จาก GitHub
2. เลือก Repo นี้ ระบบควรตรวจเป็น Vite; Build Command = `npm run build`, Output Directory = `dist`
3. เข้า **Project > Settings > Environment Variables** ใส่ตัวแปรทั้งหมดจาก `.env.example` ทั้งที่ขึ้นต้น `VITE_` และตัวแปรฝั่ง server
4. ใส่ `GOOGLE_REDIRECT_URI` ให้ตรงกับโดเมน **Production URL จริง** ของคุณ (อย่าคาดเดาชื่อโดเมนก่อนทราบ URL)
5. กด Deploy/Redeploy และนำ Production URL ไปเพิ่มใน Google OAuth Redirect URI และ Firebase Authentication > Settings > Authorized domains (โดเมนอย่างเดียว ไม่รวม https)
6. หากมีการแก้ไข Environment Variables ให้ Redeploy อีกครั้ง
7. ตรวจสอบหน้าแรก > ปุ่มแอดมิน > ล็อกอิน และเชื่อม Drive ด้วย Gmail เดิม

## ขั้นที่ 6 — ทดสอบข้อมูลตัวอย่างก่อนใช้จริง

1. ล็อกอินแอดมินในเว็บ
2. ไปที่ **จัดการครู** กดเพิ่มครูตัวอย่าง หรือเลือก `public/teachers-template.csv` เพื่อทดสอบการนำเข้า Excel/CSV
3. เมื่อสร้างครูใหม่ ระบบสุ่มรหัส PDF และแสดง **ครั้งเดียว** โปรดบันทึกไว้สำหรับการทดสอบ
4. ไปที่ **ปีและรอบ** สร้างปี 2569 รอบ 1 ระบบจะนำรายชื่อครูที่ยังปฏิบัติงานเข้ารอบให้อัตโนมัติ
5. ไป **จัดการ PDF** อัปโหลด PDF ทดลองตามชื่อครู เช่น `นายตัวอย่าง ใจดี.pdf`; ตรวจชื่อก่อนยืนยัน
6. ไป **ปีและรอบ** กดเผยแพร่ทั้งรอบ
7. ออกจากระบบแอดมิน กลับหน้าแรก ใส่เลขประชาชนของครูตัวอย่าง เลือกปี/รอบ > ค้นหา > เปิด PDF > กรอกรหัส PDF
8. กลับแอดมินทดสอบเปลี่ยน PDF ฉบับร่าง เผยแพร่เฉพาะคน ลบ/กู้คืน ถังขยะ และการปิดสิทธิ์ดาวน์โหลด
9. ก่อนใส่ข้อมูลจริง ให้ตรวจสอบว่า Google Drive ไม่มีสิทธิ์แชร์ PDF สาธารณะ และทดสอบจากเบราว์เซอร์ที่ไม่ได้ล็อกอิน Google ว่าเปิดไฟล์ไม่ได้หากไม่มีรหัสที่ถูกต้อง

## ฟังก์ชันที่ทำแล้ว และข้อจำกัดของรุ่นนี้

**มีในรุ่นนี้**
- หน้าเดิมพร้อมช่องเลขประชาชน ปี รอบ และปุ่มแอดมิน
- Firebase Authentication (บัญชีเดียวตรวจ UID ฝั่งเซิร์ฟเวอร์), Email Reset Password, 30-minute idle checking
- เพิ่ม/แก้ไข/ปิดสถานะครู, Excel/CSV พรีวิวก่อนนำเข้า, สุ่ม/ตั้งรหัส PDF รายบุคคล
- สร้างรอบ, เสนอผู้เข้าร่วมอัตโนมัติ, แก้ไขรายชื่อ, เผยแพร่ทั้งรอบแม้ PDF ไม่ครบ
- Google Drive OAuth ผ่านแอดมิน, อัปโหลด PDF ทีละไฟล์หรือหลายไฟล์ ตามชื่อครู, อัปโหลดเป็นชิ้นละ 1 MB รองรับสูงสุด 25 MB ต่อไฟล์
- เปิด PDF แบบผ่านรหัสผ่าน, ลิงก์ชมอายุ 5 นาที, ตั้งค่าสิทธิ์ดาวน์โหลดแยกปี/รอบ
- เผยแพร่ PDF ฉบับแก้ไขรายบุคคล, เก็บประวัติฉบับเก่าใน Firestore, ถังขยะพร้อมกู้คืน และ Audit Log
- สำรอง **ข้อมูลประกอบ** เป็น JSON เข้า Drive ตาม Cron ทุกวันหรือกดเองได้

**ยังไม่ครบ (ควรทำก่อนใช้จริงในระยะยาว)**
- การสำรอง **เนื้อหา PDF ทุกไฟล์ไปยังพื้นที่อิสระ** และการกู้คืนเต็มระบบ/รายบุคคลจาก backup (M3/N3 แบบสมบูรณ์)
- ปุ่ม **ลบถาวร** จาก Drive พร้อมนโยบายเก็บรักษา (O3 ที่สมบูรณ์); ขณะนี้ลบได้เฉพาะย้ายเข้าถังขยะและกู้คืน
- ระบบ preview PDF ฉบับร่างโดยแอดมิน (ควรตรวจไฟล์ต้นฉบับบนเครื่องก่อนอัปโหลด)
- ระบบจับคู่ชื่อไฟล์ที่มีคำสะกดต่างกัน/ชื่อซ้ำโดยอัตโนมัติ (ปัจจุบันเลือกจับคู่เองได้)
- การทำ OAuth refresh/reconnect ที่ไม่สร้างโฟลเดอร์ซ้ำ, การรองรับ token ถูกเพิกถอน และฟังก์ชันซ่อมแซมการอัปโหลดที่ขาดช่วง
- การป้องกันการไล่ค้นเลขประชาชนที่รัดกุมกว่าการจำกัดตาม IP; ขณะนี้เว็บไซต์อาจแสดงชื่อจากเลขประชาชนได้ตามข้อกำหนดเดิม ต้องตรวจข้อกำหนดคุ้มครองข้อมูลส่วนบุคคลก่อนใช้งานจริง
- การทดสอบ end-to-end กับ Firebase, Google Drive และ Vercel จริง (ต้องเชื่อมบัญชีของคุณก่อน)

**คำแนะนำ:** ใช้ชุดนี้เป็นระบบทดสอบออนไลน์ด้วยข้อมูลจำลองก่อน อย่าเพิ่งเก็บเอกสารเงินเดือนจริงจนกว่าจะผ่านการทดสอบด้านสิทธิ์และสำรอง/กู้คืนครบ

## แก้ปัญหาทั่วไป

- หน้าเว็บเปิดได้แต่แอดมินเข้าสู่ระบบไม่ได้: ตรวจ `VITE_FIREBASE_*`, `VITE_ADMIN_EMAIL`, Firebase Auth และ Firebase Authorized domains
- เข้าสู่ระบบแต่ขึ้น 403: ตรวจ `ADMIN_UID` ว่าตรงกับ UID ใน Firebase Authentication
- ขึ้น Missing server environment variable: ใส่ตัวแปรชื่อที่แจ้งใน Vercel แล้ว Redeploy
- Drive error redirect_uri_mismatch: `GOOGLE_REDIRECT_URI` ต้องตรงกับ URI ที่ตั้งใน Google Cloud ทุกตัวอักษร
- OAuth app ในโหมด Testing: อาจต้องเพิ่ม Test user และเชื่อมใหม่เมื่อ token หมดอายุ
- PDF ไม่ขึ้น: ตรวจการเผยแพร่, รหัส PDF, การเชื่อม Drive, และสถานะ PDF ในหน้าแอดมิน
- PDF อัปโหลดไม่สำเร็จบางไฟล์: ตรวจชื่อ นามสกุล ขนาดไม่เกิน 25 MB และพื้นที่ว่าง Drive; รุ่นนี้ยังไม่รองรับ Resume หลังหน้าต่างเบราว์เซอร์ถูกปิด
- ไม่พบรอบ: ต้องสร้างรอบและเผยแพร่ก่อน จึงปรากฏบนหน้าครู
