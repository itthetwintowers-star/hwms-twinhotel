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

/* ================= IMAGE COMPRESSION ================= */

/**
 * บีบอัดรูปภาพฝั่ง client ก่อนอัปโหลด เพื่อประหยัดพื้นที่ Supabase Storage
 * (free tier ให้แค่ 1GB รูปจากมือถือเดี๋ยวนี้มักมีขนาด 3-5MB ต่อรูป อัปโหลดตรง ๆ
 * ไม่กี่สิบรูปก็เต็มพื้นที่แล้ว) ลดขนาดภาพให้ด้านยาวสุดไม่เกิน maxDimension px
 * และบีบอัดเป็น JPEG คุณภาพตามที่กำหนด ไฟล์ที่ไม่ใช่รูปภาพ (เช่น PDF) จะคืนค่าเดิมไว้เฉย ๆ
 */
function compressImage(file, maxDimension = 1600, quality = 0.75) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file); // ไม่ใช่รูปภาพ (เช่น .pdf) ส่งคืนไฟล์เดิมไม่แตะต้อง
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; } // เผื่อ toBlob ล้มเหลว ใช้ไฟล์เดิมแทน
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.\w+$/, ".jpg"),
            { type: "image/jpeg" }
          );
          resolve(compressedFile);
        }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(file); // เผื่อไฟล์เสีย ใช้ไฟล์เดิมแทนไม่ให้ทั้งฟอร์มพัง
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}


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
  notifications: [],
  companyProfile: null
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
    { data: tickets },
    { data: companyProfileRow }
  ] = await Promise.all([
    supabaseClient.from("departments").select("*").order("id"),
    supabaseClient.from("categories").select("*").order("id"),
    supabaseClient.from("priorities").select("*").order("sort_order"),
    supabaseClient.from("statuses").select("*").order("sort_order"),
    supabaseClient.from("locations").select("*").order("name"),
    supabaseClient.from("profiles").select("*").order("created_at"),
    supabaseClient.from("tickets").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("company_profile").select("*").eq("id", 1).single()
  ]);

  _cache.departments = (departments || []).map(d => ({ id: d.id, name: d.name, nameTh: d.name_th }));
  _cache.categories = (categories || []).map(c => ({ id: c.id, name: c.name, nameTh: c.name_th, icon: c.icon }));
  _cache.priorities = (priorities || []).map(p => ({ id: p.id, label: p.label, labelTh: p.label_th, color: p.color, slaHours: p.sla_hours || 24 }));
  _cache.statuses = (statuses || []).map(s => ({ id: s.id, label: s.label, labelTh: s.label_th, color: s.color }));
  _cache.locations = (locations || []).map(l => l.name);
  _cache.users = (profiles || []).map(mapProfileRow);
  _cache.companyProfile = companyProfileRow
    ? {
        hotelName: companyProfileRow.hotel_name,
        phone: companyProfileRow.phone,
        address: companyProfileRow.address,
        logoPath: companyProfileRow.logo_path,
        themeColor: companyProfileRow.theme_color
      }
    : null;

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
    active: row.active,
    createdAt: row.created_at
  };
}

/** แปลง row ของตาราง ticket_attachments ให้อยู่ในรูปแบบที่หน้า UI ใช้ พร้อม public URL */
function mapAttachmentRow(a) {
  return {
    name: a.file_name,
    size: a.file_size ? Math.round(a.file_size / 1024) + " KB" : "",
    path: a.file_path,
    type: a.attachment_type,
    url: supabaseClient.storage.from("attachments").getPublicUrl(a.file_path).data.publicUrl
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
  // งานที่ "แก้ไขแล้ว/รอตรวจสอบ/เสร็จสิ้น/ยกเลิก" ไม่นับว่าเกินกำหนดอีกต่อไป
  // เพราะไม่มีงานที่ต้องทำเพิ่มแล้ว (รอแค่ผู้แจ้งยืนยันหรือปิดงานเท่านั้น)
  const closedStatuses = ["completed", "cancelled", "resolved", "reviewing"];
  const overdue = dueDate ? (dueDate < new Date() && !closedStatuses.includes(row.status_id)) : false;

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
    resolutionCause: row.resolution_cause,
    resolutionAction: row.resolution_action,
    driveBackedUpAt: row.drive_backed_up_at,
    requester: row.requester_id,
    requesterName: requester ? requester.fullName : "ไม่ทราบชื่อ",
    assignee: row.assignee_id,
    assigneeName: assignee ? assignee.fullName : "ยังไม่มอบหมาย",
    attachments: (attachments || []).map(a => mapAttachmentRow(a)),
    beforePhotos: (attachments || []).filter(a => a.attachment_type === "before").map(a => mapAttachmentRow(a)),
    afterPhotos: (attachments || []).filter(a => a.attachment_type === "after").map(a => mapAttachmentRow(a)),
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
 * ภายในจะค้นหาอีเมลจริงที่ผูกกับ username นี้ผ่านฟังก์ชัน get_email_by_username()
 * ก่อน (Supabase Auth ต้องการอีเมลเสมอ ไม่รองรับ login ด้วย username ตรง ๆ) แล้ว
 * ค่อยส่งอีเมลที่ได้ไปให้ Supabase Auth ตรวจสอบรหัสผ่านตามปกติ
 *
 * หมายเหตุ: ผู้ใช้ที่สร้างผ่าน Supabase Dashboard โดยตรง (เช่น Admin คนแรก) อาจใช้
 * อีเมลปลอมรูปแบบ <username>@hwms-users.app ได้ตามปกติ (Dashboard ไม่ตรวจสอบ
 * ความมีอยู่จริงของโดเมน) แต่ผู้ใช้ที่สมัครเองผ่านหน้าเว็บ (register.html) ต้องใช้
 * อีเมลจริงเสมอ เพราะ Supabase ตรวจสอบโดเมนอีเมลตอนเรียก auth.signUp() จริง
 *
 * คืนค่าเป็น { status, user? }
 *   status: "ok"      -> เข้าสู่ระบบสำเร็จ, มี user แนบมาด้วย
 *           "pending" -> username/password ถูกต้อง แต่ยังไม่ได้รับอนุมัติจาก Admin
 *           "invalid" -> username หรือ password ไม่ถูกต้อง
 */
async function findUserByCredentials(usernameOrEmail, password) {
  let email = usernameOrEmail;

  if (!usernameOrEmail.includes("@")) {
    const { data: resolvedEmail, error: lookupError } = await supabaseClient.rpc(
      "get_email_by_username",
      { input_username: usernameOrEmail }
    );
    if (lookupError || !resolvedEmail) return { status: "invalid" };
    email = resolvedEmail;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { status: "invalid" };

  const { data: profile } = await supabaseClient.from("profiles").select("*").eq("id", data.user.id).single();
  if (!profile) {
    await supabaseClient.auth.signOut();
    return { status: "invalid" };
  }
  if (!profile.active) {
    await supabaseClient.auth.signOut();
    return { status: "pending" };
  }

  return { status: "ok", user: mapProfileRow(profile) };
}

/** ออกจากระบบทั้งฝั่ง Supabase session และล้าง cache ท้องถิ่น */
async function signOutSupabase() {
  await supabaseClient.auth.signOut();
}

/** เปลี่ยนรหัสผ่านของตัวเอง (ต้อง login อยู่แล้ว ใช้ตอนจำรหัสผ่านเดิมไม่ได้แต่ยัง login ค้างอยู่ไม่ได้/ลืมทีหลัง) */
async function changeOwnPassword(newPassword) {
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return true;
}

/**
 * ให้ Admin รีเซ็ตรหัสผ่านของผู้ใช้คนอื่น (กรณีลืมรหัสผ่านจนเข้าระบบไม่ได้เลย)
 * เรียกผ่าน Supabase Edge Function "admin-reset-password" (ดู supabase/functions/)
 * ฟังก์ชันนี้ตรวจสอบสิทธิ์ Admin อีกชั้นที่ฝั่งเซิร์ฟเวอร์เสมอ ต่อให้เรียกจาก client ที่ถูกแก้ไข
 */
async function adminResetPassword(targetUserId, newPassword) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("session หมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({ targetUserId, newPassword })
  });

  const result = await response.json();
  if (!result.success) throw new Error(result.message || "รีเซ็ตรหัสผ่านไม่สำเร็จ");
  return true;
}

/**
 * บันทึกไฟล์ PDF ใบงานขึ้น Google Drive ผ่าน Edge Function "upload-to-drive"
 * (ดูรายละเอียดการตั้งค่าใน supabase/functions/upload-to-drive/index.ts)
 */
async function uploadWorkOrderToGoogleDrive(ticketNo, base64Pdf) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("session หมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-to-drive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({ ticketNo, base64Pdf })
  });

  const result = await response.json();
  if (!result.success) throw new Error(result.message || "บันทึกขึ้น Google Drive ไม่สำเร็จ");
  return result.webViewLink;
}

/**
 * ดึงรายการ ticket ที่ "เสร็จสิ้น" แล้ว แต่ยังไม่เคยสำรองขึ้น Google Drive
 * (drive_backed_up_at ยังเป็น NULL อยู่) ใช้ในหน้าตั้งค่า > สำรองข้อมูล
 */
function getTicketsPendingBackup() {
  return _cache.tickets.filter(t => t.status === "completed" && !t.driveBackedUpAt);
}

/** ทำเครื่องหมายว่า ticket นี้สำรองขึ้น Google Drive แล้ว (บันทึกเวลาปัจจุบัน) */
async function markTicketBackedUp(ticketId) {
  const { error } = await supabaseClient
    .from("tickets")
    .update({ drive_backed_up_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw error;
  await loadAppData();
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
  const priorityInfo = _cache.priorities.find(p => p.id === ticketInput.priority);
  const slaHours = (priorityInfo && priorityInfo.slaHours) || 24;
  const dueDate = new Date(now.getTime() + slaHours * 60 * 60000);
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

  const { error: timelineInsertError } = await supabaseClient.from("ticket_timeline").insert({
    ticket_id: ticketId,
    action: "สร้างงานแจ้งซ่อม",
    by_user_id: user.id
  });
  if (timelineInsertError) console.error("บันทึก timeline ไม่สำเร็จ:", timelineInsertError);

  await uploadTicketAttachments(ticketId, files, "before");

  await loadAppData(); // รีเฟรช cache ให้ตรงกับฐานข้อมูลล่าสุด
  return getTicketById(ticketId);
}

/**
 * อัปโหลดไฟล์แนบของ ticket (บีบอัดรูปภาพก่อนเสมอ) แล้วบันทึก metadata ลงตาราง
 * ticket_attachments พร้อมระบุประเภท 'before' (ตอนแจ้งงาน) หรือ 'after' (หลังแก้ไขเสร็จ)
 */
async function uploadTicketAttachments(ticketId, files, attachmentType) {
  for (const originalFile of files) {
    const file = await compressImage(originalFile);
    const path = `${ticketId}/${attachmentType}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabaseClient.storage.from("attachments").upload(path, file);
    if (!uploadError) {
      await supabaseClient.from("ticket_attachments").insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        attachment_type: attachmentType
      });
    }
  }
}

/**
 * อัปเดต ticket (สถานะ, ผู้รับผิดชอบ) พร้อมบันทึก timeline
 * @param {string} id - ticket id
 * @param {object} changes - { status?, assignee?, timelineAction?, byUser? }
 */
/**
 * เปลี่ยนสถานะ ticket พร้อมบันทึก timeline
 * @param {object} resolution - { cause, action } ใส่เฉพาะตอนเปลี่ยนเป็นสถานะ "resolved" เท่านั้น
 */
/**
 * เปลี่ยนสถานะ ticket พร้อมบันทึก timeline
 * @param {object} resolution - { cause, action, photos } ใส่เฉพาะตอนเปลี่ยนเป็นสถานะ "resolved" เท่านั้น
 *   photos คือ array ของ File object (รูปถ่ายหลังดำเนินการแก้ไข ไม่บังคับ)
 */
async function updateTicketStatus(id, newStatusId, byUser, resolution = null) {
  const updates = { status_id: newStatusId };
  if (resolution) {
    updates.resolution_cause = resolution.cause;
    updates.resolution_action = resolution.action;
  }

  // สำคัญ: supabase-js ไม่ throw error ให้อัตโนมัติเมื่อถูก RLS/trigger ปฏิเสธ
  // (เช่น trigger enforce_ticket_update_rules บล็อกเพราะไม่มีสิทธิ์) ต้องเช็ค
  // error เองแล้ว throw ต่อเสมอ ไม่งั้นโค้ดจะเข้าใจผิดว่าสำเร็จและบันทึก timeline
  // เท็จทั้งที่สถานะจริงไม่ได้เปลี่ยนเลย
  const { error: updateError } = await supabaseClient.from("tickets").update(updates).eq("id", id);
  if (updateError) throw new Error(updateError.message || "ไม่มีสิทธิ์เปลี่ยนสถานะงานนี้");

  const { error: timelineError } = await supabaseClient.from("ticket_timeline").insert({
    ticket_id: id,
    action: `เปลี่ยนสถานะเป็น "${getStatusInfo(newStatusId).labelTh}"`,
    by_user_id: byUser.id
  });
  if (timelineError) console.error("บันทึก timeline ไม่สำเร็จ:", timelineError);

  if (resolution && resolution.photos && resolution.photos.length > 0) {
    await uploadTicketAttachments(id, resolution.photos, "after");
  }

  await loadAppData();
  return getTicketById(id);
}

/** มอบหมาย/ยกเลิกมอบหมายผู้รับผิดชอบงาน */
async function updateTicketAssignee(id, assigneeId, byUser) {
  const { error: updateError } = await supabaseClient.from("tickets").update({ assignee_id: assigneeId || null }).eq("id", id);
  if (updateError) throw new Error(updateError.message || "ไม่มีสิทธิ์มอบหมายงานนี้");

  let actionText = "ยกเลิกการมอบหมายงาน";
  if (assigneeId) {
    const tech = _cache.users.find(u => u.id === assigneeId);
    actionText = `มอบหมายงานให้ ${tech ? tech.fullName : assigneeId}`;
  }
  const { error: timelineError } = await supabaseClient.from("ticket_timeline").insert({
    ticket_id: id, action: actionText, by_user_id: byUser.id
  });
  if (timelineError) console.error("บันทึก timeline ไม่สำเร็จ:", timelineError);

  await loadAppData();
  return getTicketById(id);
}

/** เพิ่มความคิดเห็นใน ticket */
async function addTicketComment(id, text, byUser) {
  const { error } = await supabaseClient.from("ticket_comments").insert({
    ticket_id: id, by_user_id: byUser.id, comment_text: text
  });
  if (error) throw new Error(error.message || "ไม่สามารถเพิ่มความคิดเห็นได้");

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

/* ================= REALTIME (แจ้งเตือนสด เมื่อมี ticket ใหม่/มีการเปลี่ยนแปลง) ================= */

let _realtimeChannel = null;

/**
 * เริ่มติดตามการเปลี่ยนแปลงของตาราง tickets แบบเรียลไทม์
 * เรียกครั้งเดียวตอน initLayout (ดู app.js) เมื่อมี ticket ใหม่/มีการอัปเดต จะ:
 *   1. โหลด cache ใหม่ให้ตรงกับฐานข้อมูลล่าสุด
 *   2. ยิง custom event "hwms:ticketsUpdated" ให้หน้าเพจต่าง ๆ (dashboard.js, ticket.js)
 *      ฟังแล้วรีเฟรชตาราง/กราฟของตัวเองได้ โดยไม่ต้องรีเฟรชหน้าทั้งหน้า
 */
function subscribeRealtimeTickets(currentUser) {
  if (_realtimeChannel) return; // ติดตามอยู่แล้ว ไม่ต้องสมัครซ้ำ

  _realtimeChannel = supabaseClient
    .channel("tickets-realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, async (payload) => {
      await loadAppData();
      renderHeader();
      document.dispatchEvent(new CustomEvent("hwms:ticketsUpdated", { detail: { type: "insert", row: payload.new } }));

      // ไม่ต้อง toast แจ้งเตือนถ้าเป็น ticket ที่ตัวเองเพิ่งสร้างเอง (เพิ่งเห็นผลลัพธ์ทันทีอยู่แล้ว)
      if (payload.new.requester_id !== currentUser.id) {
        showToast(`มีงานแจ้งเข้าใหม่: ${payload.new.ticket_no}`, "info");
      }
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets" }, async (payload) => {
      await loadAppData();
      renderHeader();
      document.dispatchEvent(new CustomEvent("hwms:ticketsUpdated", { detail: { type: "update", row: payload.new } }));
    })
    .subscribe();
}

/** ยกเลิกการติดตามแบบเรียลไทม์ (เรียกตอน logout) */
function unsubscribeRealtimeTickets() {
  if (_realtimeChannel) {
    supabaseClient.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}
/* ================= MASTER DATA CRUD (Settings page) ================= */
/* หมายเหตุ: priorities/statuses อนุญาตให้แก้ไข "ป้ายชื่อ/สี" เท่านั้น ไม่ให้เพิ่ม/ลบ
   เพราะ id ของทั้งสองตารางถูกอ้างอิงตรง ๆ ในโค้ดหลายจุด (เช่น เช็ค overdue จาก
   status ที่ไม่ใช่ "completed"/"cancelled") การเพิ่ม/ลบเองอาจทำให้ตรรกะเพี้ยน */

/** เพิ่มแผนกใหม่ */
async function addDepartment(id, name, nameTh) {
  const { error } = await supabaseClient.from("departments").insert({ id, name, name_th: nameTh });
  if (error) throw error;
  await loadAppData();
}

/** แก้ไขแผนก */
async function updateDepartment(id, name, nameTh) {
  const { error } = await supabaseClient.from("departments").update({ name, name_th: nameTh }).eq("id", id);
  if (error) throw error;
  await loadAppData();
}

/** ลบแผนก (จะไม่สำเร็จถ้ามี ticket/ผู้ใช้งานอ้างอิงอยู่ เพราะมี foreign key ป้องกันไว้) */
async function deleteDepartment(id) {
  const { error } = await supabaseClient.from("departments").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") throw new Error("ไม่สามารถลบได้ เนื่องจากมีงานหรือผู้ใช้งานที่ใช้แผนกนี้อยู่");
    throw error;
  }
  await loadAppData();
}

/** เพิ่มหมวดหมู่งานใหม่ */
async function addCategory(id, name, nameTh, icon) {
  const { error } = await supabaseClient.from("categories").insert({ id, name, name_th: nameTh, icon });
  if (error) throw error;
  await loadAppData();
}

/** แก้ไขหมวดหมู่งาน */
async function updateCategory(id, name, nameTh, icon) {
  const { error } = await supabaseClient.from("categories").update({ name, name_th: nameTh, icon }).eq("id", id);
  if (error) throw error;
  await loadAppData();
}

/** ลบหมวดหมู่งาน (จะไม่สำเร็จถ้ามี ticket อ้างอิงอยู่) */
async function deleteCategory(id) {
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") throw new Error("ไม่สามารถลบได้ เนื่องจากมีงานที่ใช้หมวดหมู่นี้อยู่");
    throw error;
  }
  await loadAppData();
}

/** แก้ไขป้ายชื่อ/สีของระดับความสำคัญ (ไม่รองรับเพิ่ม/ลบ ดูหมายเหตุด้านบน) */
async function updatePriority(id, labelTh, color, slaHours) {
  const { error } = await supabaseClient.from("priorities").update({ label_th: labelTh, color, sla_hours: slaHours }).eq("id", id);
  if (error) throw error;
  await loadAppData();
}

/** แก้ไขป้ายชื่อ/สีของสถานะงาน (ไม่รองรับเพิ่ม/ลบ ดูหมายเหตุด้านบน) */
async function updateStatus(id, labelTh, color) {
  const { error } = await supabaseClient.from("statuses").update({ label_th: labelTh, color }).eq("id", id);
  if (error) throw error;
  await loadAppData();
}

/** แก้ไขข้อมูลผู้ใช้งาน (Admin เท่านั้นที่ทำได้ ตาม RLS) */
async function updateUserProfile(userId, { fullName, email, role, departmentId }) {
  const { error } = await supabaseClient
    .from("profiles")
    .update({ full_name: fullName, email, role, department_id: departmentId })
    .eq("id", userId);
  if (error) throw error;
  await loadAppData();
}

/** เปิด/ปิดการใช้งานบัญชีผู้ใช้ (Admin เท่านั้น) */
async function toggleUserActive(userId, active) {
  const { error } = await supabaseClient.from("profiles").update({ active }).eq("id", userId);
  if (error) throw error;
  await loadAppData();
}

/** บันทึกข้อมูลบริษัท/โรงแรม (Admin เท่านั้น) */
async function updateCompanyProfile({ hotelName, phone, address, themeColor }) {
  const { error } = await supabaseClient
    .from("company_profile")
    .update({ hotel_name: hotelName, phone, address, theme_color: themeColor })
    .eq("id", 1);
  if (error) throw error;
  await loadAppData();
}

/**
 * อัปโหลดโลโก้บริษัทขึ้น Supabase Storage (bucket "attachments") แล้วบันทึก URL
 * ลงในตาราง company_profile ทันที ใช้ path คงที่ (logo.<นามสกุล>) พร้อม upsert
 * เพื่อให้อัปโหลดใหม่ทับของเดิมได้เรื่อย ๆ โดยไม่มีไฟล์เก่าตกค้าง
 */
async function uploadCompanyLogo(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const path = `company-logo/logo.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("attachments")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabaseClient.storage.from("attachments").getPublicUrl(path);
  // เติม timestamp ต่อท้าย URL กัน browser cache รูปเก่าไว้ (public URL เดิมไม่เปลี่ยนตาม path)
  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabaseClient
    .from("company_profile")
    .update({ logo_path: publicUrl })
    .eq("id", 1);
  if (updateError) throw updateError;

  await loadAppData();
  return publicUrl;
}
