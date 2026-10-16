# ตั้งค่า Firebase โปรเจกต์ `bhs-salary` (อัปเดตจากค่าที่ส่งมา)

## ตั้งค่า Web App เรียบร้อยในไฟล์แล้ว

ไฟล์ `.env.production` มีค่าที่เปิดเผยได้สำหรับแอปบนเว็บ (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) และจะถูกอ่านโดย Vite ตอนสั่ง `npm run build` บน Vercel

ไม่จำเป็นต้องใช้ `getAnalytics` หรือ `measurementId` ในเวอร์ชันนี้ และ **อย่าใส่ Firebase Admin Service Account Key หรือ Google OAuth Client Secret ลงในไฟล์นี้**

## ทำต่อใน Firebase Console

1. เข้า https://console.firebase.google.com/project/bhs-salary/overview
2. เมนู **Build > Authentication > Sign-in method** เปิด **Email/Password** แล้ว Save
3. เมนู **Authentication > Users > Add user** สร้างผู้ดูแล 1 คนด้วยอีเมลที่คุณมีสิทธิ์รับข้อความรีเซ็ตรหัสผ่าน กำหนดรหัสผ่านที่คาดเดายาก **อย่าใช้ 123456 บนระบบจริง**
4. จากตาราง Users คัดลอก **UID** ของผู้ดูแลเก็บไว้เพื่อนำไปตั้ง `ADMIN_UID` ใน Vercel
5. เมนู **Build > Firestore Database > Create database** เลือก Region แล้วสร้างฐานข้อมูล จากนั้นเปิดแท็บ **Rules** นำเนื้อหาจากไฟล์ `firestore.rules` วางและกด Publish (กฎนี้ปิดการอ่านเขียนจากเบราว์เซอร์โดยตรง)
6. เมนู **Project settings > Service accounts** สร้าง service account private key *เฉพาะเมื่อพร้อมตั้งค่าตัวแปรฝั่ง server* จากไฟล์ JSON ใช้ project_id, client_email, private_key ไปตั้งใน Vercel เท่านั้น ไม่อัปโหลด JSON ขึ้น GitHub หรือส่งเข้าแชต

## สิ่งที่ต้องตั้งใน Vercel Environment Variables ภายหลัง

- `VITE_ADMIN_EMAIL`: อีเมลผู้ดูแลคนเดียวจาก Firebase Authentication (ไม่มีใน `.env.production` เพราะต้องกำหนดเอง)
- `ADMIN_UID`: UID จาก Authentication > Users
- `FIREBASE_PROJECT_ID`: `bhs-salary`
- `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: จาก service account JSON (ความลับของ server)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: จาก Google OAuth2 web client (ภายหลังเมื่อตั้งโดเมนบน Vercel)
- `DRIVE_TOKEN_KEY_BASE64`, `ID_HASH_SECRET`, `PIN_PEPPER`, `CRON_SECRET`: สร้างขึ้นตาม `README-TH.md` (อย่าส่งในแชต)

เมื่อทราบโดเมนจริง เช่น `https://YOUR-PROJECT.vercel.app` ให้เพิ่มโดเมน (เฉพาะ host) ใน **Firebase Authentication > Settings > Authorized domains** และใช้ `https://YOUR-PROJECT.vercel.app/api/google-callback` เป็น Google OAuth Authorized redirect URI และค่าตัวแปร `GOOGLE_REDIRECT_URI` ให้ตรงกันทุกตัวอักษร

## สำคัญ

ไฟล์ชุดนี้เป็นโปรเจกต์สำหรับทดสอบระบบด้วยข้อมูลสมมติก่อน ปัจจุบันยังไม่ทดสอบ end-to-end กับ Firebase/Google Drive จริง และระบบ Backup/PDF recovery ยังไม่ครบตามข้อกำหนดระยะยาว ไม่ควรอัปโหลด PDF เงินเดือนและเลขประชาชนจริงจนกว่าจะทดสอบสิทธิ์ การเผยแพร่ การค้นหาและการเปิดไฟล์สำเร็จครบถ้วน
