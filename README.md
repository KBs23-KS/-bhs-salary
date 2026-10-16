# Banhaedsuksa Salary Result Portal

Minimal GitHub + Vercel + Firebase Firestore/Auth + private Google Drive PDF app.

**ภาษาไทย:** อ่าน [README-TH.md](README-TH.md) เพื่อทำตามขั้นตอนตั้งค่าและข้อจำกัดด้านความปลอดภัย

**Important:** This is an MVP for testing with synthetic records. It is NOT production-ready for sensitive salary/identity data without further security review, disaster-recovery work, and end-to-end testing with actual connected services.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Use Vercel environment variables for all server-only credentials; do not commit them to GitHub. Firebase Firestore security rules are deny-all (the Admin SDK on your server accesses them). OAuth `drive.file` limits Drive access to app-created files. The Drive OAuth callback is `/api/google-callback`.
