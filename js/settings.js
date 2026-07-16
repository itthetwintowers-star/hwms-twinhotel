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
  await renderPendingUsersTable(db);

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
  const currentUser = getCurrentUser();
  const isAdmin = currentUser && currentUser.role === "Admin";

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
      <td class="text-nowrap">
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showToast('แก้ไขผู้ใช้งาน ${u.fullName} (ตัวอย่างจำลอง)')" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
        ${isAdmin ? `<button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="handleAdminResetPassword('${u.id}', '${u.fullName.replace(/'/g, "\\'")}')" title="รีเซ็ตรหัสผ่าน (ลืมรหัสผ่าน)"><i class="fa-solid fa-key" style="font-size:11px;"></i></button>` : ""}
      </td>
    </tr>
  `).join("");
}

/** Admin กดรีเซ็ตรหัสผ่านให้ผู้ใช้ที่ลืมรหัสผ่าน (ผ่าน Edge Function ที่ปลอดภัย) */
function handleAdminResetPassword(userId, userFullName) {
  Swal.fire({
    title: `รีเซ็ตรหัสผ่าน: ${userFullName}`,
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">รหัสผ่านชั่วคราวใหม่</label>
        <input type="text" id="swalTempPassword" class="swal2-input" placeholder="อย่างน้อย 6 ตัวอักษร" style="margin:4px 0;">
        <div style="font-size:11px; color:var(--hwms-text-muted); text-align:left;">
          แจ้งรหัสผ่านนี้ให้ผู้ใช้ทางช่องทางที่ปลอดภัย แนะนำให้ผู้ใช้เปลี่ยนรหัสผ่านเองทันทีหลัง login
        </div>
      </div>
    `,
    confirmButtonText: "รีเซ็ตรหัสผ่าน",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#EF4444",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const pwd = document.getElementById("swalTempPassword").value;
      if (!pwd || pwd.length < 6) {
        Swal.showValidationMessage("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        return false;
      }
      return pwd;
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await adminResetPassword(userId, result.value);
      Swal.fire({ icon: "success", title: "รีเซ็ตรหัสผ่านสำเร็จ", text: "กรุณาแจ้งรหัสผ่านใหม่นี้ให้ผู้ใช้", confirmButtonColor: "#2563EB" });
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "รีเซ็ตรหัสผ่านไม่สำเร็จ", text: err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
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

/** ดึงรายชื่อผู้สมัครที่รออนุมัติ แล้ววาดตารางพร้อม dropdown เลือก Role/แผนกจริงตอนอนุมัติ */
async function renderPendingUsersTable(db) {
  const badge = document.getElementById("pendingCountBadge");
  const tbody = document.getElementById("pendingUsersTableBody");

  let pendingUsers = [];
  try {
    pendingUsers = await getPendingUsers();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="hwms-empty-state">ไม่สามารถโหลดข้อมูลได้</td></tr>`;
    return;
  }

  if (pendingUsers.length === 0) {
    badge.style.display = "none";
    tbody.innerHTML = `<tr><td colspan="6" class="hwms-empty-state"><i class="fa-regular fa-circle-check"></i><div>ไม่มีผู้ใช้งานที่รออนุมัติ</div></td></tr>`;
    return;
  }

  badge.style.display = "inline-flex";
  badge.textContent = pendingUsers.length;

  const roleOptions = ["Staff", "Technician", "Manager", "Admin"];

  tbody.innerHTML = pendingUsers.map(u => `
    <tr data-user-id="${u.id}">
      <td>
        <div style="font-weight:700; font-size:13px;">${u.fullName}</div>
        <div style="font-size:11px; color:var(--hwms-text-muted);">@${u.username}</div>
      </td>
      <td>${getDepartmentName(u.department)}</td>
      <td>${u.createdAt ? formatThaiDateTime(u.createdAt) : "-"}</td>
      <td>
        <select class="form-select hwms-input pending-role-select" style="min-width:130px;">
          ${roleOptions.map(r => `<option value="${r}" ${r === "Staff" ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </td>
      <td>
        <select class="form-select hwms-input pending-dept-select" style="min-width:150px;">
          ${db.departments.map(d => `<option value="${d.id}" ${d.id === u.department ? "selected" : ""}>${d.nameTh}</option>`).join("")}
        </select>
      </td>
      <td class="text-nowrap">
        <button class="btn btn-hwms-primary btn-sm approve-btn" style="padding:6px 12px;"><i class="fa-solid fa-check"></i></button>
        <button class="btn btn-hwms-outline btn-sm reject-btn" style="padding:6px 12px;"><i class="fa-solid fa-xmark"></i></button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", async function () {
      const row = this.closest("tr");
      const userId = row.dataset.userId;
      const role = row.querySelector(".pending-role-select").value;
      const departmentId = row.querySelector(".pending-dept-select").value;

      const confirmed = await confirmAction(
        "อนุมัติผู้ใช้งานนี้?",
        `จะอนุมัติในฐานะ ${role} แผนก ${getDepartmentName(departmentId)}`,
        "อนุมัติ"
      );
      if (!confirmed) return;

      try {
        await approveUser(userId, role, departmentId);
        showToast("อนุมัติผู้ใช้งานเรียบร้อยแล้ว");
        await renderPendingUsersTable(getDB());
        renderUsersTable(getDB());
      } catch (err) {
        console.error(err);
        showToast("อนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
      }
    });
  });

  tbody.querySelectorAll(".reject-btn").forEach(btn => {
    btn.addEventListener("click", async function () {
      const row = this.closest("tr");
      const userId = row.dataset.userId;

      const confirmed = await confirmAction(
        "ปฏิเสธคำขอสมัครสมาชิก?",
        "ข้อมูลโปรไฟล์ของผู้สมัครนี้จะถูกลบทิ้ง (บัญชี Auth เบื้องหลังต้องลบเองใน Supabase Dashboard)",
        "ปฏิเสธ"
      );
      if (!confirmed) return;

      try {
        await rejectUser(userId);
        showToast("ปฏิเสธคำขอสมัครสมาชิกแล้ว");
        await renderPendingUsersTable(getDB());
      } catch (err) {
        console.error(err);
        showToast("ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
      }
    });
  });
}
