/**
 * =========================================================
 *  app.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  Logic ที่ใช้ร่วมกันทุกหน้า: Authentication, Sidebar, Header,
 *  Notification Dropdown, Toast, และฟังก์ชันช่วยเหลือทั่วไป
 * =========================================================
 */

const HWMS_SESSION_KEY = "hwms_current_user";

/* ================= AUTH ================= */

/** ตรวจสอบว่ามีผู้ใช้ล็อกอินอยู่หรือไม่ ถ้าไม่มีให้ redirect ไปหน้า login */
function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

/** ดึงข้อมูลผู้ใช้ปัจจุบันจาก sessionStorage */
function getCurrentUser() {
  const raw = sessionStorage.getItem(HWMS_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** บันทึกผู้ใช้ปัจจุบันหลัง login สำเร็จ */
function setCurrentUser(user) {
  sessionStorage.setItem(HWMS_SESSION_KEY, JSON.stringify(user));
}

/** ล็อกเอาท์ผู้ใช้งาน */
function logout() {
  Swal.fire({
    title: "ออกจากระบบ?",
    text: "คุณต้องการออกจากระบบใช่หรือไม่",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "ออกจากระบบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#EF4444",
    cancelButtonColor: "#64748B"
  }).then(async (result) => {
    if (result.isConfirmed) {
      unsubscribeRealtimeTickets();
      await signOutSupabase();
      sessionStorage.removeItem(HWMS_SESSION_KEY);
      window.location.href = "login.html";
    }
  });
}

/* ================= INITIALS / AVATAR ================= */

/** ดึงตัวอักษรย่อจากชื่อเต็มเพื่อใช้แสดงใน Avatar */
function getInitials(fullName) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(" ");
  return parts[0] ? parts[0].charAt(0) : "?";
}

/* ================= SIDEBAR ================= */

const HWMS_NAV_ITEMS = [
  { key: "dashboard", icon: "fa-gauge-high", label: "Dashboard", href: "dashboard.html" },
  { key: "new-ticket", icon: "fa-square-plus", label: "แจ้งงาน", href: "new-ticket.html" },
  { key: "tickets", icon: "fa-list-check", label: "ติดตามงาน", href: "tickets.html" },
  { key: "reports", icon: "fa-chart-column", label: "รายงาน", href: "reports.html" },
  { key: "settings", icon: "fa-gear", label: "ตั้งค่า", href: "settings.html" }
];

/** สร้าง HTML ของ Sidebar และแทรกลงใน container ที่กำหนด */
function renderSidebar(activeKey) {
  const container = document.getElementById("sidebarContainer");
  if (!container) return;

  const navHtml = HWMS_NAV_ITEMS.map(item => `
    <a href="${item.href}" class="hwms-nav-link ${item.key === activeKey ? "active" : ""}">
      <i class="fa-solid ${item.icon}"></i>
      <span>${item.label}</span>
    </a>
  `).join("");

  container.innerHTML = `
    <div class="hwms-sidebar-backdrop" id="sidebarBackdrop"></div>
    <aside class="hwms-sidebar">
      <div class="hwms-sidebar-brand">
        <div class="logo-icon"><i class="fa-solid fa-hotel"></i></div>
        <div class="brand-text">
          HWMS
          <small>Hotel Work Management</small>
        </div>
      </div>
      <nav class="hwms-nav">
        ${navHtml}
      </nav>
      <div class="hwms-sidebar-footer">
        <a href="#" class="hwms-nav-link" onclick="logout(); return false;">
          <i class="fa-solid fa-right-from-bracket"></i>
          <span>Logout</span>
        </a>
      </div>
    </aside>
  `;

  const backdrop = document.getElementById("sidebarBackdrop");
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      document.getElementById("hwmsApp").classList.remove("sidebar-mobile-open");
    });
  }
}

/** สลับสถานะ Sidebar ย่อ/ขยาย (Desktop) หรือเปิด/ปิด (Mobile) */
function toggleSidebar() {
  const app = document.getElementById("hwmsApp");
  if (window.innerWidth <= 991) {
    app.classList.toggle("sidebar-mobile-open");
  } else {
    app.classList.toggle("sidebar-collapsed");
    localStorage.setItem("hwms_sidebar_collapsed", app.classList.contains("sidebar-collapsed"));
  }
}

/* ================= HEADER ================= */

/** สร้าง HTML ของ Header และแทรกลงใน container ที่กำหนด */
function renderHeader(pageTitle) {
  const container = document.getElementById("headerContainer");
  if (!container) return;

  const user = getCurrentUser() || { fullName: "ผู้ใช้งาน", role: "Guest", avatarColor: "#2563EB" };
  const today = new Date();
  const dateStr = formatThaiDateTime(today).split(" ").slice(0, 3).join(" ");
  const notifications = getAllNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  container.innerHTML = `
    <header class="hwms-header">
      <div class="d-flex align-items-center gap-3 flex-grow-1">
        <button class="hwms-icon-btn hwms-mobile-toggle" onclick="toggleSidebar()" aria-label="เปิดเมนู">
          <i class="fa-solid fa-bars"></i>
        </button>
        <button class="hwms-icon-btn d-none d-lg-flex" onclick="toggleSidebar()" aria-label="ย่อเมนู">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="hwms-header-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" placeholder="ค้นหา Ticket, ผู้ใช้งาน..." id="globalSearchInput">
        </div>
      </div>
      <div class="hwms-header-actions">
        <div class="hwms-date-pill"><i class="fa-regular fa-calendar me-1"></i> ${dateStr}</div>
        <button class="hwms-icon-btn" onclick="toggleDarkMode()" aria-label="สลับโหมดกลางวัน/กลางคืน" title="สลับโหมดกลางวัน/กลางคืน">
          <i class="fa-solid ${localStorage.getItem("hwms_theme") === "dark" ? "fa-sun" : "fa-moon"}" id="themeToggleIcon"></i>
        </button>
        <div class="dropdown">
          <button class="hwms-icon-btn" data-bs-toggle="dropdown" aria-label="การแจ้งเตือน">
            <i class="fa-regular fa-bell"></i>
            ${unreadCount > 0 ? '<span class="badge-dot"></span>' : ""}
          </button>
          <div class="dropdown-menu dropdown-menu-end p-0" style="width:340px; border-radius:12px; overflow:hidden;">
            <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
              <strong>การแจ้งเตือน</strong>
              <span class="hwms-badge hwms-badge-primary">${unreadCount} ใหม่</span>
            </div>
            <div style="max-height:340px; overflow-y:auto;">
              ${notifications.map(n => `
                <div class="d-flex gap-2 p-3 border-bottom ${n.read ? "" : "bg-light"}">
                  <div class="hwms-stat-icon hwms-badge-${n.iconColor}" style="width:36px;height:36px;font-size:14px;">
                    <i class="fa-solid ${n.icon}"></i>
                  </div>
                  <div class="flex-grow-1">
                    <div style="font-size:13px; font-weight:700;">${n.title}</div>
                    <div style="font-size:12px; color:var(--hwms-text-muted);">${n.message}</div>
                    <div style="font-size:11px; color:var(--hwms-text-soft); margin-top:2px;">${timeAgo(n.date)}</div>
                  </div>
                </div>
              `).join("")}
            </div>
            <div class="p-2 text-center">
              <a href="tickets.html" style="font-size:12px; font-weight:700;">ดูทั้งหมด</a>
            </div>
          </div>
        </div>
        <div class="dropdown">
          <div class="hwms-user-chip" data-bs-toggle="dropdown">
            <div class="hwms-avatar" style="background:${user.avatarColor}">${getInitials(user.fullName)}</div>
            <div class="user-meta">
              <div class="name">${user.fullName}</div>
              <div class="role">${user.role}</div>
            </div>
            <i class="fa-solid fa-chevron-down" style="font-size:10px; color:var(--hwms-text-soft);"></i>
          </div>
          <ul class="dropdown-menu dropdown-menu-end" style="border-radius:12px;">
            <li><a class="dropdown-item" href="settings.html"><i class="fa-solid fa-user me-2"></i>โปรไฟล์ของฉัน</a></li>
            <li><a class="dropdown-item" href="#" onclick="openChangePasswordModal(); return false;"><i class="fa-solid fa-key me-2"></i>เปลี่ยนรหัสผ่าน</a></li>
            <li><a class="dropdown-item" href="settings.html"><i class="fa-solid fa-gear me-2"></i>ตั้งค่า</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="logout(); return false;"><i class="fa-solid fa-right-from-bracket me-2"></i>ออกจากระบบ</a></li>
          </ul>
        </div>
      </div>
    </header>
    ${pageTitle ? "" : ""}
  `;

  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        window.location.href = "tickets.html?q=" + encodeURIComponent(searchInput.value.trim());
      }
    });
  }
}

/* ================= LAYOUT INIT ================= */

/**
 * ฟังก์ชันหลักที่แต่ละหน้าเรียกใช้ตอนเริ่มต้น (เป็น async แล้ว ต้อง await เสมอ)
 * ทำหน้าที่ตรวจสอบสิทธิ์ + โหลดข้อมูลจาก Supabase + วาด Sidebar/Header
 */
async function initLayout(activeKey, pageTitle) {
  const user = requireAuth();
  if (!user) return null;

  // โหลดข้อมูลทั้งหมดจาก Supabase มาไว้ใน cache ก่อนวาดหน้าใด ๆ
  await loadAppData();

  // ใช้สีธีมที่บันทึกไว้ในข้อมูลบริษัท (ถ้ามี) กับทั้งแอปทันที
  applyCompanyTheme(getDB().companyProfile);

  // เริ่มติดตามการเปลี่ยนแปลงของ ticket แบบเรียลไทม์ (แจ้งเตือนสดเมื่อมีงานใหม่)
  subscribeRealtimeTickets(user);

  renderSidebar(activeKey);
  renderHeader(pageTitle);

  // จดจำสถานะ sidebar ย่อ/ขยายจากครั้งก่อน
  const collapsed = localStorage.getItem("hwms_sidebar_collapsed") === "true";
  if (collapsed && window.innerWidth > 991) {
    document.getElementById("hwmsApp").classList.add("sidebar-collapsed");
  }

  return user;
}

/* ================= TOAST HELPERS (SweetAlert2) ================= */

/** แสดง Toast แจ้งเตือนสั้น ๆ มุมขวาบน */
function showToast(message, icon = "success") {
  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true
  });
  Toast.fire({ icon, title: message });
}

/** แสดง Modal ยืนยันก่อนทำรายการที่มีผลถาวร เช่น ลบข้อมูล */
function confirmAction(title, text, confirmText = "ยืนยัน") {
  return Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#EF4444",
    cancelButtonColor: "#64748B",
    reverseButtons: true
  }).then(r => r.isConfirmed);
}

/* ================= LOADING OVERLAY ================= */

/** แสดง overlay โหลดข้อมูล (ใช้ตอนเปลี่ยนหน้า / บันทึกข้อมูล) */
function showLoading() {
  if (document.getElementById("hwmsLoadingOverlay")) return;
  const el = document.createElement("div");
  el.id = "hwmsLoadingOverlay";
  el.className = "hwms-loading-overlay";
  el.innerHTML = '<div class="hwms-spinner"></div>';
  document.body.appendChild(el);
}

/** ซ่อน overlay โหลดข้อมูล */
function hideLoading() {
  const el = document.getElementById("hwmsLoadingOverlay");
  if (el) el.remove();
}

/* ================= QUERY STRING HELPER ================= */

/** อ่านค่าพารามิเตอร์จาก URL เช่น ticket-detail.html?id=T0001 */
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/** เติม option ให้ select จาก array ของ object (ใช้ร่วมกันหลายหน้า: new-ticket, reports, settings) */
function fillSelect(elementId, items, valueField, labelField) {
  const select = document.getElementById(elementId);
  if (!select) return;
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item[valueField];
    opt.textContent = item[labelField];
    select.appendChild(opt);
  });
}

/* ================= DARK MODE ================= */

/** สลับโหมดกลางวัน/กลางคืน และจดจำค่าไว้ใน localStorage */
function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  const icon = document.getElementById("themeToggleIcon");

  if (isDark) {
    html.removeAttribute("data-theme");
    localStorage.setItem("hwms_theme", "light");
    if (icon) icon.className = "fa-solid fa-moon";
  } else {
    html.setAttribute("data-theme", "dark");
    localStorage.setItem("hwms_theme", "dark");
    if (icon) icon.className = "fa-solid fa-sun";
  }
}

/* ================= COMPANY THEME COLOR ================= */

/**
 * นำสีธีมที่ตั้งไว้ในหน้าตั้งค่า > ข้อมูลบริษัท มาใช้จริงกับทั้งแอป
 * โดยเซ็ต CSS variable --hwms-primary (และเฉดอ่อน/เข้ม) ที่ <html> โดยตรง
 * ซึ่งจะ override ค่า default ใน style.css ทันทีทุกหน้าที่เรียก initLayout()
 */
function applyCompanyTheme(companyProfile) {
  const color = companyProfile && companyProfile.themeColor;
  if (!color) return;

  const root = document.documentElement;
  root.style.setProperty("--hwms-primary", color);
  root.style.setProperty("--hwms-primary-dark", shadeHexColor(color, -18));
  root.style.setProperty("--hwms-primary-light", shadeHexColor(color, 82));
}

/** ปรับสี hex ให้อ่อนลง/เข้มขึ้น percent: บวก = อ่อนลง(ผสมขาว), ลบ = เข้มขึ้น */
function shadeHexColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  let nr, ng, nb;
  if (percent >= 0) {
    nr = Math.round(r + (255 - r) * (percent / 100));
    ng = Math.round(g + (255 - g) * (percent / 100));
    nb = Math.round(b + (255 - b) * (percent / 100));
  } else {
    nr = Math.round(r * (1 + percent / 100));
    ng = Math.round(g * (1 + percent / 100));
    nb = Math.round(b * (1 + percent / 100));
  }
  return rgbToHex(clampByte(nr), clampByte(ng), clampByte(nb));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function clampByte(v) {
  return Math.max(0, Math.min(255, v));
}

/* ================= CHANGE PASSWORD ================= */

/** เปิด modal ให้ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (ใช้ตอนยัง login อยู่ ไม่ใช่ตอนลืมรหัสผ่าน) */
function openChangePasswordModal() {
  Swal.fire({
    title: "เปลี่ยนรหัสผ่าน",
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">รหัสผ่านใหม่</label>
        <input type="password" id="swalNewPassword" class="swal2-input" placeholder="อย่างน้อย 6 ตัวอักษร" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ยืนยันรหัสผ่านใหม่</label>
        <input type="password" id="swalConfirmPassword" class="swal2-input" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" style="margin:4px 0;">
      </div>
    `,
    confirmButtonText: "บันทึกรหัสผ่านใหม่",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const newPassword = document.getElementById("swalNewPassword").value;
      const confirmPassword = document.getElementById("swalConfirmPassword").value;

      if (!newPassword || newPassword.length < 6) {
        Swal.showValidationMessage("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        return false;
      }
      if (newPassword !== confirmPassword) {
        Swal.showValidationMessage("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
        return false;
      }
      return newPassword;
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await changeOwnPassword(result.value);
      showToast("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "เปลี่ยนรหัสผ่านไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
}
