/**
 * =========================================================
 *  settings.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  โลจิกหน้า "ตั้งค่า": สลับแท็บ, แสดงข้อมูลหลัก (Department,
 *  Category, Priority, Status), ผู้ใช้งาน, Role, และโปรไฟล์บริษัท
 * =========================================================
 */

document.addEventListener("DOMContentLoaded", async function () {
  const user = await initLayout("settings", "ตั้งค่า");
  if (!user) return;

  setupSettingsTabs();

  const db = getDB();
  renderDepartmentTable(db);
  renderCategoryTable(db);
  renderPriorityTable(db);
  renderStatusTable(db);
  renderUsersTable(db);
  renderRoleCards();

  // เปิดแท็บผู้ใช้งานทันทีถ้ามาจาก #users ใน URL
  if (window.location.hash === "#users") {
    activateSettingsTab("tab-users");
  }

  document.getElementById("companyForm").addEventListener("submit", function (e) {
    e.preventDefault();
    showToast("บันทึกข้อมูลบริษัทเรียบร้อยแล้ว");
  });
});

/** ตั้งค่าการทำงานของเมนูแท็บด้านซ้ายของหน้าตั้งค่า */
function setupSettingsTabs() {
  document.querySelectorAll("#settingsNav .list-group-item").forEach(item => {
    item.addEventListener("click", function () {
      activateSettingsTab(this.dataset.tab);
    });
  });
}

/** สลับไปแสดงแท็บที่ต้องการ */
function activateSettingsTab(tabId) {
  document.querySelectorAll("#settingsNav .list-group-item").forEach(i => i.classList.remove("active"));
  document.querySelector(`#settingsNav [data-tab="${tabId}"]`).classList.add("active");

  document.querySelectorAll(".hwms-settings-tab").forEach(t => t.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
}

/** วาดตารางแผนกทั้งหมด พร้อมจำนวนงานของแต่ละแผนก */
function renderDepartmentTable(db) {
  const tickets = db.tickets;
  document.getElementById("departmentTableBody").innerHTML = db.departments.map(d => `
    <tr>
      <td><strong>${d.id}</strong></td>
      <td>${d.name}</td>
      <td>${d.nameTh}</td>
      <td>${tickets.filter(t => t.department === d.id).length}</td>
      <td>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showToast('แก้ไขแผนก ${d.nameTh} (ตัวอย่างจำลอง)')"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** วาดตารางหมวดหมู่งานทั้งหมด */
function renderCategoryTable(db) {
  document.getElementById("categoryTableBody").innerHTML = db.categories.map(c => `
    <tr>
      <td><i class="fa-solid ${c.icon}" style="color:var(--hwms-primary);"></i></td>
      <td><strong>${c.id}</strong></td>
      <td>${c.name}</td>
      <td>${c.nameTh}</td>
      <td>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showToast('แก้ไขหมวดหมู่ ${c.nameTh} (ตัวอย่างจำลอง)')"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** วาดตารางระดับความสำคัญทั้งหมด */
function renderPriorityTable(db) {
  document.getElementById("priorityTableBody").innerHTML = db.priorities.map(p => `
    <tr>
      <td><span class="hwms-priority-dot" style="background:${p.color}"></span></td>
      <td><strong>${p.id}</strong></td>
      <td>${p.label}</td>
      <td>${p.labelTh}</td>
    </tr>
  `).join("");
}

/** วาดตารางสถานะงานทั้งหมด */
function renderStatusTable(db) {
  document.getElementById("statusTableBody").innerHTML = db.statuses.map(s => `
    <tr>
      <td><strong>${s.id}</strong></td>
      <td>${s.label}</td>
      <td>${s.labelTh}</td>
      <td>${renderStatusBadge(s.id)}</td>
    </tr>
  `).join("");
}

/** วาดตารางผู้ใช้งานทั้งหมดในระบบ */
function renderUsersTable(db) {
  document.getElementById("usersTableBody").innerHTML = db.users.map(u => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="hwms-avatar" style="background:${u.avatarColor}; width:32px; height:32px; font-size:12px;">${getInitials(u.fullName)}</div>
          <div>
            <div style="font-weight:700; font-size:13px;">${u.fullName}</div>
            <div style="font-size:11px; color:var(--hwms-text-muted);">@${u.username}</div>
          </div>
        </div>
      </td>
      <td>${u.email}</td>
      <td>${getDepartmentName(u.department)}</td>
      <td><span class="hwms-badge hwms-badge-primary">${u.role}</span></td>
      <td>${u.active ? '<span class="hwms-badge hwms-badge-success">ใช้งานอยู่</span>' : '<span class="hwms-badge hwms-badge-secondary">ปิดใช้งาน</span>'}</td>
      <td>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showToast('แก้ไขผู้ใช้งาน ${u.fullName} (ตัวอย่างจำลอง)')"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** วาดการ์ดแสดงสิทธิ์การใช้งาน (Role) แต่ละระดับ */
function renderRoleCards() {
  const roles = [
    { name: "Admin", desc: "จัดการระบบทั้งหมด ตั้งค่า และผู้ใช้งานได้ทุกส่วน", icon: "fa-user-shield", color: "danger" },
    { name: "Manager", desc: "ดูรายงาน มอบหมายงาน และอนุมัติการเปลี่ยนสถานะ", icon: "fa-user-tie", color: "primary" },
    { name: "Technician", desc: "รับงาน อัปเดตสถานะ และปิดงานที่ได้รับมอบหมาย", icon: "fa-user-gear", color: "warning" },
    { name: "Staff", desc: "แจ้งงานใหม่ และติดตามสถานะงานของตนเอง", icon: "fa-user", color: "success" }
  ];
  document.getElementById("roleCards").innerHTML = roles.map(r => `
    <div class="col-md-6">
      <div class="hwms-card hwms-card-body d-flex flex-row align-items-start gap-3">
        <div class="hwms-stat-icon hwms-badge-${r.color}"><i class="fa-solid ${r.icon}"></i></div>
        <div>
          <div style="font-weight:800; font-size:14px;">${r.name}</div>
          <div style="font-size:12px; color:var(--hwms-text-muted);">${r.desc}</div>
        </div>
      </div>
    </div>
  `).join("");
}
