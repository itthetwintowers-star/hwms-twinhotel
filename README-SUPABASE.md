# HWMS — Supabase + GitHub Pages Edition

เวอร์ชันนี้ใช้ **Supabase** (Postgres + Auth + Storage + REST API แบบสำเร็จรูป) เป็น backend
ทั้งหมด แทนที่ Node.js/Express/MySQL เดิม จึงไม่ต้องมีเซิร์ฟเวอร์ของตัวเองเลย —
โฮสต์เว็บทั้งหมดบน **GitHub Pages** (ไฟล์ static ล้วน) ได้ทันที

## ทำไมถึงไม่ต้องมี Node.js server อีกต่อไป?

GitHub Pages โฮสต์ได้แค่ไฟล์ static (HTML/CSS/JS) รันเซิร์ฟเวอร์เองไม่ได้
Supabase จึงเข้ามาแทนที่ backend ทั้งหมด:

| ของเดิม (Node/Express/MySQL) | ตอนนี้ใช้ |
|---|---|
| MySQL database | Supabase Postgres |
| Express REST API | Supabase Auto-generated REST API (เรียกผ่าน `supabase-js`) |
| JWT + bcrypt (เขียนเอง) | Supabase Auth (จัดการรหัสผ่าน/session ให้ทั้งหมด) |
| Multer (อัปโหลดไฟล์) | Supabase Storage |
| Express middleware ตรวจสิทธิ์ | Row Level Security (RLS) ในฐานข้อมูลโดยตรง |

---

## ขั้นตอนที่ 1: สร้างโปรเจกต์ Supabase

1. ไปที่ [supabase.com](https://supabase.com) → สมัคร/ล็อกอิน → **New Project**
2. ตั้งชื่อโปรเจกต์ (เช่น `hwms-hotel`) และตั้งรหัสผ่านฐานข้อมูล (เก็บไว้ให้ดี)
3. รอสักครู่จนโปรเจกต์พร้อมใช้งาน (สถานะ "Active")

## ขั้นตอนที่ 2: สร้างตารางฐานข้อมูล + Row Level Security

1. ไปที่เมนู **SQL Editor** (แถบซ้าย) → **New query**
2. เปิดไฟล์ `supabase/schema.sql` ในโปรเจกต์นี้ คัดลอกทั้งหมด วางแล้วกด **Run**
3. ควรเห็นข้อความ "Success. No rows returned" แปลว่าสร้างตารางครบ (12 ตาราง + RLS + Storage bucket)

ตรวจสอบ: ไปที่เมนู **Table Editor** ควรเห็นตาราง `departments`, `categories`, `tickets`,
`profiles` ฯลฯ พร้อมข้อมูลอ้างอิงเริ่มต้น (แผนก 10 แผนก, หมวดหมู่ 5 แบบ ฯลฯ)

## ขั้นตอนที่ 3: สร้างผู้ใช้ Admin คนแรก

Supabase Auth จัดการรหัสผ่านเอง **จึงต้องสร้างผู้ใช้ผ่าน Dashboard เท่านั้น** (ไม่ใช่ SQL insert
ตรงๆ ที่ตาราง `auth.users`) — เปิดไฟล์ `supabase/seed-admin.sql` มีคำอธิบายละเอียด สรุปคือ:

1. ไปที่ **Authentication → Users → Add user**
   - Email: `admin@hwms.local`
   - Password: ตั้งรหัสผ่านที่ต้องการ
   - ติ๊ก "Auto Confirm User" ด้วย
2. คัดลอก UUID ของผู้ใช้ที่สร้าง (แสดงในตาราง Users)
3. กลับไปที่ **SQL Editor** รันคำสั่งนี้ (แทน UUID ให้ตรง):
   ```sql
   insert into profiles (id, full_name, username, email, role, department_id, avatar_color, active)
   values ('วาง-UUID-ตรงนี้', 'ผู้ดูแลระบบ', 'admin', 'admin@hwms.local', 'Admin', 'D06', '#2563EB', true);
   ```

> **หมายเหตุ**: ฟอร์ม login ของเว็บยังใช้ "ชื่อผู้ใช้งาน" (username) เหมือนเดิม แต่เบื้องหลัง
> ระบบจะแปลงเป็นอีเมล `<username>@hwms.local` ให้อัตโนมัติก่อนส่งให้ Supabase Auth
> ผู้ใช้ทุกคนที่สร้างใหม่จึงต้องตั้งอีเมลตามรูปแบบนี้เสมอ

ทำซ้ำขั้นตอนนี้เพื่อเพิ่มพนักงานคนอื่น ๆ (เปลี่ยน role เป็น Manager/Technician/Staff และ
department_id ตามจริง)

## ขั้นตอนที่ 4: เชื่อม Frontend เข้ากับโปรเจกต์ Supabase ของคุณ

1. ไปที่ **Settings → API** ในโปรเจกต์ Supabase
2. คัดลอกค่า **Project URL** และ **anon public key**
3. เปิดไฟล์ `js/supabase-client.js` แก้ 2 บรรทัดแรกในหัวไฟล์:
   ```javascript
   const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
   ```

> **ปลอดภัยหรือไม่ที่ใส่ anon key ไว้ในโค้ด frontend ที่ทุกคนมองเห็นได้?**
> ปลอดภัยครับ — anon key ถูกออกแบบมาให้เปิดเผยได้ (เหมือน API key สาธารณะ)
> การเข้าถึงข้อมูลจริงถูกควบคุมด้วย **Row Level Security** ที่ตั้งไว้ในฐานข้อมูล
> ไม่ใช่จากการซ่อน key แต่อย่าเผลอใส่ **service_role key** (สิทธิ์สูงสุด) ในโค้ด frontend เด็ดขาด

## ขั้นตอนที่ 5: ทดสอบก่อนขึ้น GitHub Pages

เปิด `login.html` ด้วย Live Server (VS Code extension) หรือรัน:
```bash
npx serve .
```
แล้วเข้า `http://localhost:3000/login.html` ล็อกอินด้วย `admin` / รหัสผ่านที่ตั้งไว้

> ⚠️ เปิดไฟล์ด้วยการดับเบิลคลิก (`file://`) อาจมีปัญหา CORS กับบางเบราว์เซอร์
> แนะนำให้รันผ่าน local server เล็ก ๆ เสมอตอนทดสอบ

## ขั้นตอนที่ 6: ขึ้น GitHub Pages

1. สร้าง repository ใหม่บน GitHub (เช่น `hwms-hotel`)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ (ยกเว้นโฟลเดอร์ `supabase/` จะเก็บไว้ใน repo ก็ได้ไม่มีผลอะไร
   เพราะเป็นแค่ไฟล์ .sql อ้างอิง ไม่ถูกเรียกใช้จากหน้าเว็บ)
   ```bash
   git init
   git add .
   git commit -m "Initial commit: HWMS with Supabase backend"
   git branch -M main
   git remote add origin https://github.com/<your-username>/hwms-hotel.git
   git push -u origin main
   ```
3. ไปที่ repo บน GitHub → **Settings → Pages**
4. Source เลือก **Deploy from a branch** → Branch: `main` → Folder: `/ (root)` → **Save**
5. รอ 1-2 นาที จะได้ URL ประมาณ `https://<your-username>.github.io/hwms-hotel/`
6. เปิด URL นั้น ต่อท้ายด้วย `/login.html` เพื่อเริ่มใช้งาน

## ขั้นตอนที่ 7: ตั้งค่า CORS ฝั่ง Supabase (ถ้าจำเป็น)

โดยปกติ Supabase อนุญาต request จากทุกโดเมนสำหรับ anon key อยู่แล้ว แต่ถ้าต้องการจำกัด
เฉพาะโดเมน GitHub Pages ของคุณ ไปที่ **Settings → API → CORS Configuration** แล้วเพิ่ม:
```
https://<your-username>.github.io
```

---

## สิ่งที่เปลี่ยนไปจากเวอร์ชัน mock/localStorage เดิม

- `js/mockdata.js` ถูกลบออก แทนที่ด้วย `js/supabase-client.js` (DATA ACCESS LAYER ใหม่)
- ฟังก์ชันที่ติดต่อฐานข้อมูล (`initLayout`, `addTicket`, การเปลี่ยนสถานะ/มอบหมายงาน/คอมเมนต์,
  `findUserByCredentials`) เป็น **async ทั้งหมด** และมีการ `await` ในทุกจุดที่เรียกใช้แล้ว
- ไฟล์แนบตอนสร้าง ticket ใหม่ **อัปโหลดขึ้น Supabase Storage จริง** (bucket `attachments`)
  ไม่ใช่แค่ชื่อไฟล์จำลองเหมือนก่อน
- ระบบ login เปลี่ยนจากเช็ค username/password ใน localStorage เป็น Supabase Auth จริง
  (username ถูกแปลงเป็นอีเมล `<username>@hwms.local` เบื้องหลัง)
- การเพิ่มผู้ใช้งานใหม่ต้องทำผ่าน Supabase Dashboard เท่านั้น (ปุ่ม "เพิ่มผู้ใช้งาน" ในแอป
  จะแสดงคำแนะนำแทนการสร้างจริง) เพราะการสร้างผู้ใช้ต้องใช้ service_role key ซึ่งไม่ปลอดภัย
  ที่จะฝังในเว็บ static

## Row Level Security ที่ตั้งไว้ (ปรับได้ตามต้องการ)

- ทุกตารางเปิด RLS แล้ว ผู้ใช้ต้อง login (authenticated) ก่อนจึงจะอ่าน/เขียนข้อมูลได้
- ข้อมูลอ้างอิง (แผนก/หมวดหมู่/ความสำคัญ/สถานะ) — อ่านได้ทุกคน แก้ไขได้เฉพาะ Admin
- Ticket — อ่านได้ทุกคนที่ login, สร้างได้เฉพาะของตัวเอง, แก้ไขสถานะ/มอบหมายได้ทุกคน
  (ตรงกับพฤติกรรมเดิมของระบบ mock) — ถ้าต้องการจำกัดเฉพาะ Manager/Technician/Admin
  ดูคอมเมนต์ในไฟล์ `supabase/schema.sql` ส่วน policy "update ticket status/assign"
- ไฟล์แนบ — อัปโหลดได้เฉพาะคนที่ login, เปิดดูได้แบบ public (เพราะตั้ง bucket เป็น public)

## ข้อจำกัดที่ควรรู้

- **การเพิ่มผู้ใช้งานใหม่** ต้องทำผ่าน Supabase Dashboard เสมอ (ไม่สามารถทำผ่านหน้าเว็บได้
  ด้วยเหตุผลด้านความปลอดภัยตามที่อธิบายไว้ข้างบน)
- **Export PDF/Excel** ในหน้ารายงานยังเป็นตัวอย่างจำลอง (mock) เหมือนเดิม ยังไม่ได้ต่อ library
  จริง (jsPDF/SheetJS) — แจ้งได้ถ้าต้องการให้ทำต่อ
- Supabase free tier มีข้อจำกัดเรื่องขนาดฐานข้อมูล/Storage/แบนด์วิธ ตรวจสอบราคาที่
  [supabase.com/pricing](https://supabase.com/pricing) หากคาดว่าจะมีผู้ใช้งานจำนวนมาก
