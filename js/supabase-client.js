/**
 * =========================================================
 *  supabase-client.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  DATA ACCESS LAYER ตัวใหม่ที่คุยกับ Supabase (Postgres + Auth
 *  + Storage) แทนที่ localStorage เดิมใน mockdata.js
 *
 *  ออกแบบให้ฟังก์ชันชื่อเดิมที่หน้าอื่น ๆ เรียกใช้อยู่แล้ว
 *  (getAllTickets, getDepartmentName, renderStatusBadge ฯลฯ)
 *  ยังใช้งานได้เหมือนเดิมโดยแทบไม่ต้องแก้ไฟล์อื่น เพียงแต่ฟังก์ชัน
 *  ที่ต้องติดต่อเซิร์ฟเวอร์ (login, สร้าง/แก้ ticket) ตอนนี้เป็น
 *  async function ที่ต้องใช้ await
 *
 *  วิธีตั้งค่า: แก้ค่า SUPABASE_URL และ SUPABASE_ANON_KEY ด้านล่าง
 *  ให้ตรงกับโปรเจกต์ Supabase ของคุณ (Settings > API)
 * =========================================================
 */

/* ================= CONFIG (แก้ตรงนี้ให้ตรงกับโปรเจกต์ของคุณ) ================= */
const SUPABASE_URL = "https://lxrzwyoagrtyzwyzfloy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4cnp3eW9hZ3J0eXp3eXpmbG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwODE4ODMsImV4cCI6MjA5OTY1Nzg4M30.EwQ8Q0Szz7jiySTgvu3QzkqVO0qyNI6Z5BgR5_xPkw8";

// ตัว anon key นี้ "ปลอดภัยที่จะฝังในโค้ด frontend" (เช่นบน GitHub Pages)
// เพราะสิทธิ์การเข้าถึงข้อมูลจริงถูกควบคุมด้วย Row Level Security (RLS)
// ที่ตั้งไว้ใน supabase/schema.sql ไม่ใช่ตัว key เอง

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================= IN-MEMORY CACHE =================
 * โหลดข้อมูลอ้างอิง + tickets + users ทั้งหมดมาเก็บไว้ในตัวแปรนี้ครั้งเดียว
 * ตอนเข้าแอปแต่ละหน้า เพื่อให้หน้า UI เดิม (dashboard.js, ticket.js ฯลฯ)
 * อ่านข้อมูลแบบ synchronous ได้เหมือนตอนใช้ localStorage
 * ===================================================== */
let _cache = {
  departments: [],
  categories: [],
  priorities: [],
  statuses: [],
  locations: [],
  users: [],
  tickets: [],
  notifications: []
};

/** คืนค่า cache ทั้งหมด (ใช้แทน getDB() เดิม) */
function getDB() {
  return _cache;
}

/**
 * โหลดข้อมูลทั้งหมดจาก Supabase มาไว้ใน cache
 * ต้องเรียกและ await ก่อนวาดหน้าใด ๆ (ทำอยู่แล้วใน initLayout ของ app.js)
 */
async function loadAppData() {
  const [
    { data: departments },
    { data: categories },
    { data: priorities },
    { data: statuses },
    { data: locations },
    { data: profiles },
    { data: tickets }
  ] = await Promise.all([
    supabaseClient.from("departments").select("*").order("id"),
    supabaseClient.from("categories").select("*").order("id"),
    supabaseClient.from("priorities").select("*").order("sort_order"),
    supabaseClient.from("statuses").select("*").order("sort_order"),
    supabaseClient.from("locations").select("*").order("name"),
    supabaseClient.from("profiles").select("*").order("created_at"),
    supabaseClient.from("tickets").select("*").order("created_at", { ascending: false })
  ]);

  _cache.departments = (departments || []).map(d => ({ id: d.id, name: d.name, nameTh: d.name_th }));
  _cache.categories = (categories || []).map(c => ({ id: c.id, name: c.name, nameTh: c.name_th, icon: c.icon }));
  _cache.priorities = (priorities || []).map(p => ({ id: p.id, label: p.label, labelTh: p.label_th, color: p.color }));
  _cache.statuses = (statuses || []).map(s => ({ id: s.id, label: s.label, labelTh: s.label_th, color: s.color }));
  _cache.locations = (locations || []).map(l => l.name);
  _cache.users = (profiles || []).map(mapProfileRow);

  const usersById = Object.fromEntries(_cache.users.map(u => [u.id, u]));

  _cache.tickets = await Promise.all((tickets || []).map(t => hydrateTicket(t, usersById)));

  _cache.notifications = buildNotificationsFromTickets(_cache.tickets);
}

/** แปลง row ของตาราง profiles ให้อยู่ในรูปแบบ user object ที่หน้า UI เดิมใช้ */
function mapProfileRow(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    department: row.department_id,
    avatarColor: row.avatar_color,
    active: row.active
  };
}

/** ดึง timeline/comments/attachments ของ ticket หนึ่งใบ แล้วประกอบเป็น object เดียวกับ mock เดิม */
async function hydrateTicket(row, usersById) {
  const [{ data: timeline }, { data: comments }, { data: attachments }] = await Promise.all([
    supabaseClient.from("ticket_timeline").select("*").eq("ticket_id", row.id).order("created_at"),
    supabaseClient.from("ticket_comments").select("*").eq("ticket_id", row.id).order("created_at"),
    supabaseClient.from("ticket_attachments").select("*").eq("ticket_id", row.id)
  ]);

  const requester = usersById[row.requester_id];
  const assignee = row.assignee_id ? usersById[row.assignee_id] : null;
  const dueDate = row.due_date ? new Date(row.due_date) : null;
  const overdue = dueDate ? (dueDate < new Date() && !["completed", "cancelled"].includes(row.status_id)) : false;

  return {
    id: row.id,
    ticketNo: row.ticket_no,
    subject: row.subject,
    category: row.category_id,
    department: row.department_id,
    location: row.location,
    priority: row.priority_id,
    status: row.status_id,
    overdue,
    description: row.description,
    requester: row.requester_id,
    requesterName: requester ? requester.fullName : "ไม่ทราบชื่อ",
    assignee: row.assignee_id,
    assigneeName: assignee ? assignee.fullName : "ยังไม่มอบหมาย",
    attachments: (attachments || []).map(a => ({
      name: a.file_name,
      size: a.file_size ? Math.round(a.file_size / 1024) + " KB" : "",
      path: a.file_path,
      url: supabaseClient.storage.from("attachments").getPublicUrl(a.file_path).data.publicUrl
    })),
    createdDate: row.created_at,
    dueDate: row.due_date,
    timeline: (timeline || []).map(t => ({
      action: t.action,
      by: (usersById[t.by_user_id] && usersById[t.by_user_id].fullName) || "ระบบ",
      date: t.created_at
    })),
    comments: (comments || []).map(c => ({
      by: (usersById[c.by_user_id] && usersById[c.by_user_id].fullName) || "ไม่ทราบชื่อ",
      text: c.comment_text,
      date: c.created_at
    }))
  };
}

/** สร้างรายการแจ้งเตือนแบบเดียวกับตอนใช้ mock (คำนวณจาก ticket ล่าสุด ไม่ได้เก็บตารางแยก) */
function buildNotificationsFromTickets(tickets) {
  return tickets.slice(0, 8).map((t, idx) => ({
    id: "N" + String(idx + 1).padStart(3, "0"),
    icon: t.overdue ? "fa-triangle-exclamation" : "fa-clipboard-check",
    iconColor: t.overdue ? "danger" : "primary",
    title: t.overdue ? `งานเกินกำหนด: ${t.ticketNo}` : `งานใหม่: ${t.ticketNo}`,
    message: t.subject,
    date: t.createdDate,
    read: idx > 3
  }));
}

/* ================= GETTERS (อ่านจาก cache แบบ synchronous เหมือนเดิม) ================= */

function getAllTickets() { return _cache.tickets; }
function getTicketById(id) { return _cache.tickets.find(t => t.id === id); }
function getAllUsers() { return _cache.users; }
function getAllNotifications() { return _cache.notifications; }

function getDepartmentName(id) {
  const d = _cache.departments.find(x => x.id === id);
  return d ? d.nameTh : "-";
}
function getCategoryName(id) {
  const c = _cache.categories.find(x => x.id === id);
  return c ? c.nameTh : "-";
}
function getStatusInfo(id) {
  return _cache.statuses.find(s => s.id === id) || _cache.statuses[0];
}
function getPriorityInfo(id) {
  return _cache.priorities.find(p => p.id === id) || _cache.priorities[2];
}

/** สร้างเลขที่ Ticket อัตโนมัติรูปแบบ TKYYYYMMDDxxxx จากข้อมูลใน cache */
function generateTicketNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = `TK${y}${m}${d}`;
  const todayCount = _cache.tickets.filter(t => t.ticketNo.startsWith(prefix)).length;
  return prefix + String(todayCount + 1).padStart(4, "0");
}

/* ================= AUTH ================= */

/**
 * เข้าสู่ระบบด้วย "ชื่อผู้ใช้งาน" (username) แทนอีเมล
 * ภายในจะแปลง username เป็นอีเมลรูปแบบ <username>@hwms.local ก่อนส่งให้ Supabase Auth
 * (ผู้ใช้ทุกคนต้องถูกสร้างด้วยอีเมลรูปแบบนี้ตอน setup ครั้งแรก ดู supabase/seed-admin.sql)
 */
async function findUserByCredentials(username, password) {
  const email = username.includes("@") ? username : `${username}@hwms.local`;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;

  const { data: profile } = await supabaseClient.from("profiles").select("*").eq("id", data.user.id).single();
  if (!profile || !profile.active) {
    await supabaseClient.auth.signOut();
    return null;
  }

  return mapProfileRow(profile);
}

/** ออกจากระบบทั้งฝั่ง Supabase session และล้าง cache ท้องถิ่น */
async function signOutSupabase() {
  await supabaseClient.auth.signOut();
}

/* ================= MUTATIONS (เขียนข้อมูลขึ้น Supabase แล้วอัปเดต cache) ================= */

/**
 * สร้าง Ticket ใหม่ พร้อมอัปโหลดไฟล์แนบจริงขึ้น Supabase Storage (ถ้ามี)
 * @param {object} ticketInput - ข้อมูลฟอร์ม (subject, category, department, location, priority, description)
 * @param {object} user - ผู้ใช้ปัจจุบัน (จาก getCurrentUser())
 * @param {File[]} files - ไฟล์แนบจริงจาก <input type="file">
 */
async function addTicket(ticketInput, user, files = []) {
  const now = new Date();
  const dueDate = new Date(now.getTime() + 24 * 60 * 60000);
  const ticketNo = generateTicketNo();
  const ticketId = "T" + Date.now();

  const { error: insertError } = await supabaseClient.from("tickets").insert({
    id: ticketId,
    ticket_no: ticketNo,
    subject: ticketInput.subject,
    category_id: ticketInput.category,
    department_id: ticketInput.department,
    location: ticketInput.location,
    priority_id: ticketInput.priority,
    status_id: "new",
    description: ticketInput.description,
    requester_id: user.id,
    due_date: dueDate.toISOString()
  });
  if (insertError) throw insertError;

  await supabaseClient.from("ticket_timeline").insert({
    ticket_id: ticketId,
    action: "สร้างงานแจ้งซ่อม",
    by_user_id: user.id
  });

  for (const file of files) {
    const path = `${ticketId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabaseClient.storage.from("attachments").upload(path, file);
    if (!uploadError) {
      await supabaseClient.from("ticket_attachments").insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_path: path,
        file_size: file.size
      });
    }
  }

  await loadAppData(); // รีเฟรช cache ให้ตรงกับฐานข้อมูลล่าสุด
  return getTicketById(ticketId);
}

/**
 * อัปเดต ticket (สถานะ, ผู้รับผิดชอบ) พร้อมบันทึก timeline
 * @param {string} id - ticket id
 * @param {object} changes - { status?, assignee?, timelineAction?, byUser? }
 */
async function updateTicketStatus(id, newStatusId, byUser) {
  await supabaseClient.from("tickets").update({ status_id: newStatusId }).eq("id", id);
  await supabaseClient.from("ticket_timeline").insert({
    ticket_id: id,
    action: `เปลี่ยนสถานะเป็น "${getStatusInfo(newStatusId).labelTh}"`,
    by_user_id: byUser.id
  });
  await loadAppData();
  return getTicketById(id);
}

/** มอบหมาย/ยกเลิกมอบหมายผู้รับผิดชอบงาน */
async function updateTicketAssignee(id, assigneeId, byUser) {
  await supabaseClient.from("tickets").update({ assignee_id: assigneeId || null }).eq("id", id);

  let actionText = "ยกเลิกการมอบหมายงาน";
  if (assigneeId) {
    const tech = _cache.users.find(u => u.id === assigneeId);
    actionText = `มอบหมายงานให้ ${tech ? tech.fullName : assigneeId}`;
  }
  await supabaseClient.from("ticket_timeline").insert({
    ticket_id: id, action: actionText, by_user_id: byUser.id
  });
  await loadAppData();
  return getTicketById(id);
}

/** เพิ่มความคิดเห็นใน ticket */
async function addTicketComment(id, text, byUser) {
  await supabaseClient.from("ticket_comments").insert({
    ticket_id: id, by_user_id: byUser.id, comment_text: text
  });
  await loadAppData();
  return getTicketById(id);
}

/* ================= BADGE / DISPLAY HELPERS (เหมือนเดิม อ่านจาก cache) ================= */

function renderStatusBadge(statusId) {
  const info = getStatusInfo(statusId);
  return `<span class="hwms-badge hwms-badge-${info.color}">${info.labelTh}</span>`;
}

function renderPriorityBadge(priorityId) {
  const info = getPriorityInfo(priorityId);
  return `<span class="d-inline-flex align-items-center" style="font-weight:700; font-size:12.5px; color:${info.color}">
      <span class="hwms-priority-dot" style="background:${info.color}"></span>${info.labelTh}
    </span>`;
}

/* ================= DATE HELPERS (เหมือนเดิม ไม่พึ่งพา Supabase) ================= */

function formatThaiDateTime(dateInput) {
  const date = new Date(dateInput);
  const thMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const day = date.getDate();
  const month = thMonths[date.getMonth()];
  const year = date.getFullYear() + 543;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

function timeAgo(dateInput) {
  const date = new Date(dateInput);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} วันที่แล้ว`;
}
