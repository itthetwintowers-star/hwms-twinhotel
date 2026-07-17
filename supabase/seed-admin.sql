-- =========================================================
--  supabase/seed-admin.sql
--  วิธีสร้างผู้ใช้ Admin คนแรกของระบบ (ทำครั้งเดียวตอนตั้งระบบ)
-- =========================================================

-- ขั้นตอนที่ 1: สร้างผู้ใช้ใน Supabase Auth ก่อน (ทำผ่าน Dashboard เท่านั้น ห้ามใช้ SQL insert
-- ลง auth.users ตรง ๆ เพราะ Supabase Auth ต้องจัดการ password hashing เอง)
--
--   ไปที่ Supabase Dashboard > Authentication > Users > Add user
--   Email:    admin@hwms.local
--   Password: กำหนดรหัสผ่านที่ต้องการ (เช่น Admin123!)
--   กด "Auto Confirm User" ด้วย เพื่อไม่ต้องยืนยันอีเมล (ระบบภายในองค์กร)
--
-- หมายเหตุ: ใช้ email รูปแบบ "<username>@hwms.local" เพื่อให้ frontend ที่ยังใช้ฟอร์ม
-- "ชื่อผู้ใช้งาน" (ไม่ใช่อีเมล) ทำงานร่วมกับ Supabase Auth ได้โดยไม่ต้องแก้ UI

-- ขั้นตอนที่ 2: คัดลอก UUID ของผู้ใช้ที่เพิ่งสร้าง (แสดงในหน้า Authentication > Users)
-- แล้วนำมาแทนที่ 'PASTE_USER_UUID_HERE' ด้านล่าง จากนั้นรันคำสั่งนี้ใน SQL Editor:

insert into profiles (id, full_name, username, email, role, department_id, avatar_color, active)
values (
  'PASTE_USER_UUID_HERE',   -- UUID จากขั้นตอนที่ 1
  'ผู้ดูแลระบบ',
  'admin',
  'admin@hwms.local',
  'Admin',
  'D06',
  '#2563EB',
  true
);

-- ตรวจสอบว่าสร้างสำเร็จ:
-- select * from profiles where username = 'admin';

-- =========================================================
-- ทำซ้ำขั้นตอนเดียวกันสำหรับผู้ใช้งานคนอื่น ๆ ที่ต้องการเพิ่ม เช่น
--   Email: somchai@hwms.local, role: Technician, department_id: D03
--
-- หมายเหตุด้านความปลอดภัยที่สำคัญ: การสร้างผู้ใช้ใหม่ "ต้องทำผ่าน Supabase
-- Dashboard เท่านั้น" (ขั้นตอนที่ 1-2 ข้างบน) ห้ามสร้างจากหน้าเว็บ (GitHub Pages)
-- โดยตรง เพราะการสร้างผู้ใช้ต้องใช้ "service_role key" ซึ่งมีสิทธิ์สูงสุด
-- ถ้าฝังไว้ในโค้ด frontend (ไฟล์ static ที่ใครก็เปิดดูได้) จะทำให้ผู้ไม่หวังดี
-- ยึดครองระบบทั้งหมดได้ ปุ่ม "เพิ่มผู้ใช้งาน" ในหน้าตั้งค่าของแอปจึงแสดงคำแนะนำ
-- ให้แอดมินมาทำตามขั้นตอนนี้แทน ไม่ได้สร้างผู้ใช้ตรงจากหน้าเว็บ
-- =========================================================
