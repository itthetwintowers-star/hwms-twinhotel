-- =========================================================
--  supabase/schema.sql
--  Hotel Work Management System (HWMS) - Supabase Schema
--  ---------------------------------------------------------
--  รันไฟล์นี้ทั้งหมดใน Supabase Dashboard > SQL Editor > New query
--  ใช้แทน MySQL เดิม โดย Supabase = Postgres + Auth + Storage + REST API
--  พร้อมให้ frontend (บน GitHub Pages) เรียกใช้ได้ตรง ๆ ผ่าน supabase-js
--  โดยไม่ต้องมี Node.js/Express server เลย
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- Roles ----------
create table if not exists roles (
  id           text primary key,
  name         text not null,
  description  text
);

insert into roles (id, name, description) values
('Admin',      'ผู้ดูแลระบบ',   'จัดการระบบทั้งหมด ตั้งค่า และผู้ใช้งานได้ทุกส่วน'),
('Manager',    'ผู้จัดการ',     'ดูรายงาน มอบหมายงาน และอนุมัติการเปลี่ยนสถานะ'),
('Technician', 'ช่างเทคนิค',    'รับงาน อัปเดตสถานะ และปิดงานที่ได้รับมอบหมาย'),
('Staff',      'พนักงานทั่วไป', 'แจ้งงานใหม่ และติดตามสถานะงานของตนเอง')
on conflict (id) do nothing;

-- ---------- Departments ----------
create table if not exists departments (
  id        text primary key,
  name      text not null,
  name_th   text not null
);

insert into departments (id, name, name_th) values
('D01','Housekeeping','แม่บ้าน'),
('D02','Front Office','แผนกต้อนรับ'),
('D03','Engineering','ช่างซ่อมบำรุง'),
('D04','F&B Service','บริการอาหารและเครื่องดื่ม'),
('D05','Kitchen','ครัว'),
('D06','IT Department','เทคโนโลยีสารสนเทศ'),
('D07','Security','รักษาความปลอดภัย'),
('D08','Human Resources','ทรัพยากรบุคคล'),
('D09','Sales & Marketing','ขายและการตลาด'),
('D10','Spa & Recreation','สปาและสันทนาการ')
on conflict (id) do nothing;

-- ---------- Categories ----------
create table if not exists categories (
  id       text primary key,
  name     text not null,
  name_th  text not null,
  icon     text default 'fa-tag'
);

insert into categories (id, name, name_th, icon) values
('C01','Maintenance','งานซ่อมบำรุง','fa-screwdriver-wrench'),
('C02','Cleaning','งานทำความสะอาด','fa-broom'),
('C03','IT Support','งานไอที','fa-laptop'),
('C04','Guest Request','คำขอจากแขก','fa-bell-concierge'),
('C05','Security Issue','งานความปลอดภัย','fa-shield-halved')
on conflict (id) do nothing;

-- ---------- Priorities ----------
create table if not exists priorities (
  id          text primary key,
  label       text not null,
  label_th    text not null,
  color       text not null,
  sort_order  int default 0
);

insert into priorities (id, label, label_th, color, sort_order) values
('critical','Critical','วิกฤต','#EF4444',1),
('high','High','สูง','#F59E0B',2),
('medium','Medium','ปานกลาง','#2563EB',3),
('low','Low','ต่ำ','#22C55E',4)
on conflict (id) do nothing;

-- ---------- Statuses ----------
create table if not exists statuses (
  id          text primary key,
  label       text not null,
  label_th    text not null,
  color       text not null,
  sort_order  int default 0
);

insert into statuses (id, label, label_th, color, sort_order) values
('new','New','งานใหม่','primary',1),
('accepted','Accepted','รับงานแล้ว','info',2),
('in_progress','In Progress','กำลังดำเนินการ','warning',3),
('pending','Pending','รอดำเนินการ','secondary',4),
('completed','Completed','เสร็จสิ้น','success',5),
('cancelled','Cancelled','ยกเลิก','danger',6)
on conflict (id) do nothing;

-- ---------- Locations ----------
create table if not exists locations (
  id    bigint generated always as identity primary key,
  name  text not null
);

-- ใส่ข้อมูลเริ่มต้นเฉพาะตอนตารางยังว่างอยู่ (locations ไม่มี unique constraint บน name
-- จึงใช้ "insert...select...where not exists" แทน on conflict)
insert into locations (name)
select v from (values
  ('ห้อง 101'),('ห้อง 102'),('ห้อง 205'),('ห้อง 310'),('ห้อง 412'),
  ('ห้อง 520'),('ห้อง 618'),('ล็อบบี้ชั้น 1'),('ห้องอาหาร Grand Hall'),
  ('สระว่ายน้ำ'),('ห้องประชุม Orchid'),('ที่จอดรถ B1'),('สปาชั้น 3'),
  ('ฟิตเนสเซ็นเตอร์'),('ห้องซักรีด'),('ครัวกลาง'),('ห้องเก็บของ'),
  ('ทางเดินชั้น 4'),('ลิฟต์โดยสาร A'),('สำนักงานหน้าบ้าน')
) as t(v)
where not exists (select 1 from locations);

-- ---------- Profiles ----------
-- ตารางนี้ "ต่อยอด" จาก auth.users ของ Supabase (id เดียวกัน)
-- Supabase Auth จัดการรหัสผ่าน/session ให้ทั้งหมด เราเก็บแค่ข้อมูลเสริม
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text not null,
  username        text unique not null,
  email           text unique not null,
  role            text not null default 'Staff' references roles(id),
  department_id   text references departments(id),
  avatar_color    text default '#2563EB',
  active          boolean default true,
  created_at      timestamptz default now()
);

-- ---------- Tickets ----------
create table if not exists tickets (
  id              text primary key,
  ticket_no       text unique not null,
  subject         text not null,
  category_id     text references categories(id),
  department_id   text references departments(id),
  location        text,
  priority_id     text references priorities(id),
  status_id       text not null default 'new' references statuses(id),
  description     text,
  requester_id    uuid references profiles(id),
  assignee_id     uuid references profiles(id),
  created_at      timestamptz default now(),
  due_date        timestamptz,
  updated_at      timestamptz default now()
);

create index if not exists idx_tickets_status on tickets(status_id);
create index if not exists idx_tickets_department on tickets(department_id);
create index if not exists idx_tickets_created on tickets(created_at);

-- ---------- Ticket Timeline / Activity Log ----------
create table if not exists ticket_timeline (
  id           bigint generated always as identity primary key,
  ticket_id    text references tickets(id) on delete cascade,
  action       text not null,
  by_user_id   uuid references profiles(id),
  created_at   timestamptz default now()
);

-- ---------- Ticket Comments ----------
create table if not exists ticket_comments (
  id             bigint generated always as identity primary key,
  ticket_id      text references tickets(id) on delete cascade,
  by_user_id     uuid references profiles(id),
  comment_text   text not null,
  created_at     timestamptz default now()
);

-- ---------- Ticket Attachments ----------
-- ไฟล์จริงเก็บใน Supabase Storage bucket ชื่อ "attachments"
-- ตารางนี้เก็บแค่ metadata ชี้ไปยัง path ของไฟล์ใน bucket
create table if not exists ticket_attachments (
  id           bigint generated always as identity primary key,
  ticket_id    text references tickets(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,
  file_size    int,
  uploaded_at  timestamptz default now()
);

-- ---------- Company Profile (แถวเดียว) ----------
create table if not exists company_profile (
  id           int primary key default 1,
  hotel_name   text,
  phone        text,
  address      text,
  logo_path    text,
  theme_color  text default '#2563EB',
  constraint single_row check (id = 1)
);

insert into company_profile (id, hotel_name, phone, address, theme_color) values
(1, 'Grand Riverside Hotel', '02-123-4567', '123 ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500', '#2563EB')
on conflict (id) do nothing;


-- =========================================================
--  Row Level Security (RLS)
--  เปิด RLS ทุกตาราง แล้วกำหนดสิทธิ์ตาม role ใน profiles
-- =========================================================

-- ฟังก์ชันช่วยเช็คว่าผู้ใช้ปัจจุบันเป็น Admin หรือไม่ (ใช้ซ้ำในหลาย policy)
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'Admin' and active = true
  );
$$ language sql security definer stable;

-- ฟังก์ชันช่วยเช็คว่าผู้ใช้ปัจจุบันเป็น Admin หรือ Manager
create or replace function is_admin_or_manager()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('Admin','Manager') and active = true
  );
$$ language sql security definer stable;

-- ฟังก์ชันช่วยเช็คว่าผู้ใช้ปัจจุบันได้รับการอนุมัติ (active) แล้วหรือยัง
-- ใช้ป้องกันไม่ให้ผู้ที่เพิ่งสมัครสมาชิก (รอ Admin อนุมัติ) เข้าถึงข้อมูลจริงได้
-- ทั้งที่ login สำเร็จแล้ว (Supabase สร้าง session ให้ทันทีตอนสมัคร)
create or replace function is_active_user()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and active = true
  );
$$ language sql security definer stable;

alter table roles enable row level security;
alter table departments enable row level security;
alter table categories enable row level security;
alter table priorities enable row level security;
alter table statuses enable row level security;
alter table locations enable row level security;
alter table profiles enable row level security;
alter table tickets enable row level security;
alter table ticket_timeline enable row level security;
alter table ticket_comments enable row level security;
alter table ticket_attachments enable row level security;
alter table company_profile enable row level security;

-- ---------- Reference/Master data ----------
-- อ่านได้แม้ยังไม่ login เลย (anon) เพราะหน้า "สมัครสมาชิก" ต้องโชว์รายชื่อแผนก
-- ให้เลือกก่อนที่จะมีบัญชีด้วยซ้ำ ข้อมูลชุดนี้ไม่ใช่ข้อมูลอ่อนไหว (แค่ชื่อแผนก/หมวดหมู่)
drop policy if exists "public read reference data" on roles;
create policy "public read reference data" on roles for select to anon, authenticated using (true);
drop policy if exists "public read reference data" on departments;
create policy "public read reference data" on departments for select to anon, authenticated using (true);
drop policy if exists "public read reference data" on categories;
create policy "public read reference data" on categories for select to anon, authenticated using (true);
drop policy if exists "public read reference data" on priorities;
create policy "public read reference data" on priorities for select to anon, authenticated using (true);
drop policy if exists "public read reference data" on statuses;
create policy "public read reference data" on statuses for select to anon, authenticated using (true);
drop policy if exists "public read reference data" on locations;
create policy "public read reference data" on locations for select to anon, authenticated using (true);

drop policy if exists "admin manage departments" on departments;
create policy "admin manage departments" on departments for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admin manage categories" on categories;
create policy "admin manage categories" on categories for all to authenticated using (is_admin()) with check (is_admin());
-- priorities/statuses: Admin แก้ไขได้เฉพาะ label/color (id คงที่ตายตัว ดูหมายเหตุใน supabase-client.js)
drop policy if exists "admin manage priorities" on priorities;
create policy "admin manage priorities" on priorities for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "admin manage statuses" on statuses;
create policy "admin manage statuses" on statuses for update to authenticated using (is_admin()) with check (is_admin());

-- ---------- Profiles ----------
drop policy if exists "read all profiles" on profiles;
create policy "read all profiles" on profiles for select to authenticated
  using (is_active_user() or auth.uid() = id);

drop policy if exists "user updates own profile" on profiles;
create policy "user updates own profile" on profiles for update to authenticated
  using (auth.uid() = id or is_admin())
  with check (auth.uid() = id or is_admin());

drop policy if exists "admin inserts profiles" on profiles;
create policy "admin inserts profiles" on profiles for insert to authenticated with check (is_admin());

-- อนุญาตให้ผู้ใช้ "สมัครสมาชิกเอง" ได้ แต่บังคับว่าต้องเป็น role Staff และ active=false
-- เสมอ (รอ Admin อนุมัติก่อนถึงจะ login เข้าใช้งานจริงได้)
drop policy if exists "self register as staff pending approval" on profiles;
create policy "self register as staff pending approval" on profiles for insert to authenticated
  with check (auth.uid() = id and role = 'Staff' and active = false);

-- ---------- ป้องกันการ "ยกระดับสิทธิ์ตัวเอง" (privilege escalation) ----------
-- แม้ policy ด้านบนจะอนุญาตให้ผู้ใช้แก้ไขแถวของตัวเองได้ (เช่น เปลี่ยนชื่อ, สีอวตาร์)
-- แต่ trigger นี้จะปฏิเสธทันทีถ้ามีใครพยายามแก้ role/active/department_id ของตัวเอง
-- โดยที่ไม่ใช่ Admin เป็นคนแก้ (เช่น พยายามยิง request ตรงเปลี่ยน active เป็น true เอง)
create or replace function prevent_privilege_escalation()
returns trigger as $$
begin
  if not is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.department_id is distinct from old.department_id then
      raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลนี้ กรุณาติดต่อผู้ดูแลระบบ';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_privilege_escalation on profiles;
create trigger trg_prevent_privilege_escalation
before update on profiles
for each row execute function prevent_privilege_escalation();

-- ---------- Tickets: เฉพาะผู้ใช้ที่ได้รับอนุมัติแล้ว (active) เท่านั้นที่ดู/สร้าง/แก้ได้ ----------
drop policy if exists "read all tickets" on tickets;
create policy "read all tickets" on tickets for select to authenticated using (is_active_user());
drop policy if exists "create own ticket" on tickets;
create policy "create own ticket" on tickets for insert to authenticated
  with check (requester_id = auth.uid() and is_active_user());
drop policy if exists "update ticket status/assign" on tickets;
create policy "update ticket status/assign" on tickets for update to authenticated
  using (is_active_user()) with check (is_active_user());
-- หมายเหตุ: การอนุญาตให้ทุกคน (ที่ active แล้ว) update ticket ได้ตรงกับพฤติกรรมเดิมของระบบ mock
-- ถ้าต้องการจำกัดเฉพาะ Manager/Technician/Admin ให้เปลี่ยนเป็น:
--   using (is_admin_or_manager() or assignee_id = auth.uid())

-- ---------- Timeline / Comments / Attachments ----------
drop policy if exists "read timeline" on ticket_timeline;
create policy "read timeline" on ticket_timeline for select to authenticated using (is_active_user());
drop policy if exists "insert timeline" on ticket_timeline;
create policy "insert timeline" on ticket_timeline for insert to authenticated with check (is_active_user());

drop policy if exists "read comments" on ticket_comments;
create policy "read comments" on ticket_comments for select to authenticated using (is_active_user());
drop policy if exists "insert own comment" on ticket_comments;
create policy "insert own comment" on ticket_comments for insert to authenticated
  with check (by_user_id = auth.uid() and is_active_user());

drop policy if exists "read attachments" on ticket_attachments;
create policy "read attachments" on ticket_attachments for select to authenticated using (is_active_user());
drop policy if exists "insert attachments" on ticket_attachments;
create policy "insert attachments" on ticket_attachments for insert to authenticated with check (is_active_user());

-- ---------- Company profile ----------
drop policy if exists "read company profile" on company_profile;
create policy "read company profile" on company_profile for select to authenticated using (is_active_user());
drop policy if exists "admin update company profile" on company_profile;
create policy "admin update company profile" on company_profile for update to authenticated
  using (is_admin()) with check (is_admin());


-- =========================================================
--  Storage: bucket สำหรับไฟล์แนบของ Ticket
-- =========================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists "authenticated upload attachments" on storage.objects;
create policy "authenticated upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and is_active_user());

drop policy if exists "public read attachments" on storage.objects;
create policy "public read attachments" on storage.objects for select
  using (bucket_id = 'attachments');


-- =========================================================
--  Realtime: เปิดให้หน้าเว็บรับการแจ้งเตือนสดเมื่อมี ticket ใหม่/มีการเปลี่ยนแปลง
--  (Realtime จะเช็ค RLS ของผู้ใช้แต่ละคนก่อนส่ง event ให้เสมอ ผู้ใช้ที่ active=false
--  จะไม่เห็น event เหล่านี้เลย เพราะ policy "read all tickets" กำหนดไว้ว่าต้อง
--  is_active_user() เท่านั้น)
-- =========================================================
-- ใช้ DO block ดักจับ error กรณีตาราง tickets ถูกเพิ่มเข้า publication นี้ไปแล้ว
-- (ทำให้ไฟล์นี้ปลอดภัยที่จะรันซ้ำได้เสมอ ไม่ error ถ้าเคยรันไปแล้วก่อนหน้านี้)
do $$
begin
  alter publication supabase_realtime add table tickets;
exception
  when duplicate_object then null;
end $$;
