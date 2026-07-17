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

  document.getElementById("companyForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const hotelName = document.getElementById("companyHotelName").value.trim();
    const phone = document.getElementById("companyPhone").value.trim();
    const address = document.getElementById("companyAddress").value.trim();
    const themeColor = document.getElementById("companyThemeColor").value;

    if (!hotelName) {
      Swal.fire({ icon: "warning", title: "กรอกข้อมูลไม่ครบ", text: "กรุณากรอกชื่อโรงแรม", confirmButtonColor: "#2563EB" });
      return;
    }

    try {
      await updateCompanyProfile({ hotelName, phone, address, themeColor });
      showToast("บันทึกข้อมูลบริษัทเรียบร้อยแล้ว");
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });

  renderCompanyProfileForm(db);
  setupThemeSwatches();
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
      <td class="text-nowrap">
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showEditDepartmentModal('${d.id}', '${escapeJs(d.name)}', '${escapeJs(d.nameTh)}')" title="แก้ไข"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="handleDeleteDepartment('${d.id}', '${escapeJs(d.nameTh)}')" title="ลบ"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** เปิด modal เพิ่มแผนกใหม่ */
function showAddDepartmentModal() {
  Swal.fire({
    title: "เพิ่มแผนกใหม่",
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">รหัสแผนก (เช่น D11)</label>
        <input type="text" id="swalDeptId" class="swal2-input" placeholder="D11" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ชื่อแผนก (English)</label>
        <input type="text" id="swalDeptName" class="swal2-input" placeholder="Laundry" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ชื่อแผนก (ไทย)</label>
        <input type="text" id="swalDeptNameTh" class="swal2-input" placeholder="ซักรีด" style="margin:4px 0;">
      </div>
    `,
    confirmButtonText: "เพิ่มแผนก",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const id = document.getElementById("swalDeptId").value.trim();
      const name = document.getElementById("swalDeptName").value.trim();
      const nameTh = document.getElementById("swalDeptNameTh").value.trim();
      if (!id || !name || !nameTh) {
        Swal.showValidationMessage("กรุณากรอกข้อมูลให้ครบทุกช่อง");
        return false;
      }
      return { id, name, nameTh };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await addDepartment(result.value.id, result.value.name, result.value.nameTh);
      showToast("เพิ่มแผนกเรียบร้อยแล้ว");
      renderDepartmentTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "เพิ่มแผนกไม่สำเร็จ", text: err.message || "รหัสแผนกนี้อาจมีอยู่แล้ว", confirmButtonColor: "#EF4444" });
    }
  });
}

/** เปิด modal แก้ไขแผนก */
function showEditDepartmentModal(id, name, nameTh) {
  Swal.fire({
    title: `แก้ไขแผนก ${id}`,
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">ชื่อแผนก (English)</label>
        <input type="text" id="swalDeptName" class="swal2-input" value="${name}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ชื่อแผนก (ไทย)</label>
        <input type="text" id="swalDeptNameTh" class="swal2-input" value="${nameTh}" style="margin:4px 0;">
      </div>
    `,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const newName = document.getElementById("swalDeptName").value.trim();
      const newNameTh = document.getElementById("swalDeptNameTh").value.trim();
      if (!newName || !newNameTh) {
        Swal.showValidationMessage("กรุณากรอกข้อมูลให้ครบทุกช่อง");
        return false;
      }
      return { newName, newNameTh };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await updateDepartment(id, result.value.newName, result.value.newNameTh);
      showToast("แก้ไขแผนกเรียบร้อยแล้ว");
      renderDepartmentTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "แก้ไขไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
}

/** ลบแผนก (มีการยืนยันก่อนเสมอ) */
async function handleDeleteDepartment(id, nameTh) {
  const confirmed = await confirmAction("ลบแผนกนี้?", `ต้องการลบแผนก "${nameTh}" ใช่หรือไม่ การลบไม่สามารถย้อนกลับได้`, "ลบ");
  if (!confirmed) return;
  try {
    await deleteDepartment(id);
    showToast("ลบแผนกเรียบร้อยแล้ว");
    renderDepartmentTable(getDB());
  } catch (err) {
    console.error(err);
    Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", text: err.message || "เกิดข้อผิดพลาด", confirmButtonColor: "#EF4444" });
  }
}

/** ป้องกัน single quote/backslash ทำลาย syntax ตอนฝังค่าใน onclick="...('...')" attribute */
function escapeJs(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** เติมค่าจริงจากฐานข้อมูลลงในฟอร์มข้อมูลบริษัท */
function renderCompanyProfileForm(db) {
  const company = db.companyProfile;
  if (!company) return;

  document.getElementById("companyHotelName").value = company.hotelName || "";
  document.getElementById("companyPhone").value = company.phone || "";
  document.getElementById("companyAddress").value = company.address || "";
  document.getElementById("companyThemeColor").value = company.themeColor || "#2563EB";
  highlightSelectedSwatch(company.themeColor || "#2563EB");
}

/** ทำให้คลิกเลือกสี swatch แล้วอัปเดตช่อง hidden input + ไฮไลต์สีที่เลือก */
function setupThemeSwatches() {
  document.querySelectorAll("#companyThemeSwatches span").forEach(swatch => {
    swatch.addEventListener("click", function () {
      const color = this.dataset.color;
      document.getElementById("companyThemeColor").value = color;
      highlightSelectedSwatch(color);
    });
  });
}

/** ใส่กรอบไฮไลต์ swatch สีที่กำลังถูกเลือกอยู่ */
function highlightSelectedSwatch(color) {
  document.querySelectorAll("#companyThemeSwatches span").forEach(swatch => {
    swatch.style.border = swatch.dataset.color === color ? "2px solid var(--hwms-text)" : "2px solid transparent";
  });
}

/** วาดตารางหมวดหมู่งานทั้งหมด */
function renderCategoryTable(db) {
  document.getElementById("categoryTableBody").innerHTML = db.categories.map(c => `
    <tr>
      <td><i class="fa-solid ${c.icon}" style="color:var(--hwms-primary);"></i></td>
      <td><strong>${c.id}</strong></td>
      <td>${c.name}</td>
      <td>${c.nameTh}</td>
      <td class="text-nowrap">
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showEditCategoryModal('${c.id}', '${escapeJs(c.name)}', '${escapeJs(c.nameTh)}', '${escapeJs(c.icon)}')" title="แก้ไข"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="handleDeleteCategory('${c.id}', '${escapeJs(c.nameTh)}')" title="ลบ"><i class="fa-solid fa-trash" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** เปิด modal เพิ่มหมวดหมู่ใหม่ */
function showAddCategoryModal() {
  Swal.fire({
    title: "เพิ่มหมวดหมู่ใหม่",
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">รหัสหมวดหมู่ (เช่น C06)</label>
        <input type="text" id="swalCatId" class="swal2-input" placeholder="C06" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ชื่อ (English)</label>
        <input type="text" id="swalCatName" class="swal2-input" placeholder="Laundry Service" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ชื่อ (ไทย)</label>
        <input type="text" id="swalCatNameTh" class="swal2-input" placeholder="งานซักรีด" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ไอคอน (Font Awesome class เช่น fa-shirt)</label>
        <input type="text" id="swalCatIcon" class="swal2-input" placeholder="fa-shirt" value="fa-tag" style="margin:4px 0;">
      </div>
    `,
    confirmButtonText: "เพิ่มหมวดหมู่",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const id = document.getElementById("swalCatId").value.trim();
      const name = document.getElementById("swalCatName").value.trim();
      const nameTh = document.getElementById("swalCatNameTh").value.trim();
      const icon = document.getElementById("swalCatIcon").value.trim() || "fa-tag";
      if (!id || !name || !nameTh) {
        Swal.showValidationMessage("กรุณากรอกข้อมูลให้ครบทุกช่อง");
        return false;
      }
      return { id, name, nameTh, icon };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await addCategory(result.value.id, result.value.name, result.value.nameTh, result.value.icon);
      showToast("เพิ่มหมวดหมู่เรียบร้อยแล้ว");
      renderCategoryTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "เพิ่มหมวดหมู่ไม่สำเร็จ", text: err.message || "รหัสหมวดหมู่นี้อาจมีอยู่แล้ว", confirmButtonColor: "#EF4444" });
    }
  });
}

/** เปิด modal แก้ไขหมวดหมู่ */
function showEditCategoryModal(id, name, nameTh, icon) {
  Swal.fire({
    title: `แก้ไขหมวดหมู่ ${id}`,
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">ชื่อ (English)</label>
        <input type="text" id="swalCatName" class="swal2-input" value="${name}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ชื่อ (ไทย)</label>
        <input type="text" id="swalCatNameTh" class="swal2-input" value="${nameTh}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">ไอคอน (Font Awesome class)</label>
        <input type="text" id="swalCatIcon" class="swal2-input" value="${icon}" style="margin:4px 0;">
      </div>
    `,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const newName = document.getElementById("swalCatName").value.trim();
      const newNameTh = document.getElementById("swalCatNameTh").value.trim();
      const newIcon = document.getElementById("swalCatIcon").value.trim() || "fa-tag";
      if (!newName || !newNameTh) {
        Swal.showValidationMessage("กรุณากรอกข้อมูลให้ครบทุกช่อง");
        return false;
      }
      return { newName, newNameTh, newIcon };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await updateCategory(id, result.value.newName, result.value.newNameTh, result.value.newIcon);
      showToast("แก้ไขหมวดหมู่เรียบร้อยแล้ว");
      renderCategoryTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "แก้ไขไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
}

/** ลบหมวดหมู่ (มีการยืนยันก่อนเสมอ) */
async function handleDeleteCategory(id, nameTh) {
  const confirmed = await confirmAction("ลบหมวดหมู่นี้?", `ต้องการลบหมวดหมู่ "${nameTh}" ใช่หรือไม่ การลบไม่สามารถย้อนกลับได้`, "ลบ");
  if (!confirmed) return;
  try {
    await deleteCategory(id);
    showToast("ลบหมวดหมู่เรียบร้อยแล้ว");
    renderCategoryTable(getDB());
  } catch (err) {
    console.error(err);
    Swal.fire({ icon: "error", title: "ลบไม่สำเร็จ", text: err.message || "เกิดข้อผิดพลาด", confirmButtonColor: "#EF4444" });
  }
}

/** วาดตารางระดับความสำคัญทั้งหมด */
function renderPriorityTable(db) {
  document.getElementById("priorityTableBody").innerHTML = db.priorities.map(p => `
    <tr>
      <td><span class="hwms-priority-dot" style="background:${p.color}"></span></td>
      <td><strong>${p.id}</strong></td>
      <td>${p.label}</td>
      <td>${p.labelTh}</td>
      <td>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showEditPriorityModal('${p.id}', '${escapeJs(p.labelTh)}', '${escapeJs(p.color)}')" title="แก้ไข"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** เปิด modal แก้ไขป้ายชื่อ/สีของระดับความสำคัญ (ไม่รองรับเพิ่ม/ลบ เพราะ id ถูกอ้างอิงตรง ๆ ในโค้ดหลายจุด) */
function showEditPriorityModal(id, labelTh, color) {
  Swal.fire({
    title: `แก้ไขระดับความสำคัญ: ${id}`,
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">ชื่อ (ไทย)</label>
        <input type="text" id="swalPrioLabel" class="swal2-input" value="${labelTh}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">สี</label>
        <input type="color" id="swalPrioColor" value="${color}" style="width:100%; height:42px; border:1px solid var(--hwms-border); border-radius:8px; margin:4px 0;">
      </div>
    `,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const newLabel = document.getElementById("swalPrioLabel").value.trim();
      const newColor = document.getElementById("swalPrioColor").value;
      if (!newLabel) {
        Swal.showValidationMessage("กรุณากรอกชื่อ");
        return false;
      }
      return { newLabel, newColor };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await updatePriority(id, result.value.newLabel, result.value.newColor);
      showToast("แก้ไขเรียบร้อยแล้ว");
      renderPriorityTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "แก้ไขไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
}

/** วาดตารางสถานะงานทั้งหมด */
function renderStatusTable(db) {
  document.getElementById("statusTableBody").innerHTML = db.statuses.map(s => `
    <tr>
      <td><strong>${s.id}</strong></td>
      <td>${s.label}</td>
      <td>${s.labelTh}</td>
      <td>${renderStatusBadge(s.id)}</td>
      <td>
        <button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showEditStatusModal('${s.id}', '${escapeJs(s.labelTh)}', '${escapeJs(s.color)}')" title="แก้ไข"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>
      </td>
    </tr>
  `).join("");
}

/** เปิด modal แก้ไขป้ายชื่อ/สีของสถานะงาน (ไม่รองรับเพิ่ม/ลบ เพราะ id ถูกอ้างอิงตรง ๆ ในโค้ดหลายจุด) */
function showEditStatusModal(id, labelTh, color) {
  const colorOptions = ["primary", "info", "warning", "secondary", "success", "danger"];
  Swal.fire({
    title: `แก้ไขสถานะ: ${id}`,
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">ชื่อ (ไทย)</label>
        <input type="text" id="swalStatusLabel" class="swal2-input" value="${labelTh}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">สี (ธีมของระบบ)</label>
        <select id="swalStatusColor" class="swal2-select" style="margin:4px 0;">
          ${colorOptions.map(c => `<option value="${c}" ${c === color ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
    `,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const newLabel = document.getElementById("swalStatusLabel").value.trim();
      const newColor = document.getElementById("swalStatusColor").value;
      if (!newLabel) {
        Swal.showValidationMessage("กรุณากรอกชื่อ");
        return false;
      }
      return { newLabel, newColor };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await updateStatus(id, result.value.newLabel, result.value.newColor);
      showToast("แก้ไขเรียบร้อยแล้ว");
      renderStatusTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "แก้ไขไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
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
      <td>
        ${isAdmin
          ? `<div class="form-check form-switch mb-0">
               <input class="form-check-input" type="checkbox" role="switch" ${u.active ? "checked" : ""} onchange="handleToggleUserActive('${u.id}', this.checked)" style="cursor:pointer;">
               <label class="form-check-label" style="font-size:12px;">${u.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</label>
             </div>`
          : (u.active ? '<span class="hwms-badge hwms-badge-success">ใช้งานอยู่</span>' : '<span class="hwms-badge hwms-badge-secondary">ปิดใช้งาน</span>')}
      </td>
      <td class="text-nowrap">
        ${isAdmin ? `<button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="showEditUserModal('${u.id}', '${escapeJs(u.fullName)}', '${escapeJs(u.email)}', '${u.role}', '${u.department || ""}')" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen" style="font-size:11px;"></i></button>` : ""}
        ${isAdmin ? `<button class="hwms-icon-btn" style="width:32px;height:32px;" onclick="handleAdminResetPassword('${u.id}', '${escapeJs(u.fullName)}')" title="รีเซ็ตรหัสผ่าน (ลืมรหัสผ่าน)"><i class="fa-solid fa-key" style="font-size:11px;"></i></button>` : ""}
      </td>
    </tr>
  `).join("");
}

/** เปิด modal แก้ไขข้อมูลผู้ใช้งาน (ชื่อ, อีเมล, สิทธิ์, แผนก) — Admin เท่านั้น */
function showEditUserModal(userId, fullName, email, role, departmentId) {
  const db = getDB();
  const roleOptions = ["Staff", "Technician", "Manager", "Admin"];

  Swal.fire({
    title: "แก้ไขข้อมูลผู้ใช้งาน",
    html: `
      <div class="text-start">
        <label class="hwms-label" style="font-size:13px;">ชื่อ-นามสกุล</label>
        <input type="text" id="swalUserFullName" class="swal2-input" value="${fullName}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">อีเมล</label>
        <input type="email" id="swalUserEmail" class="swal2-input" value="${email}" style="margin:4px 0 12px;">
        <label class="hwms-label" style="font-size:13px;">สิทธิ์ (Role)</label>
        <select id="swalUserRole" class="swal2-select" style="margin:4px 0 12px;">
          ${roleOptions.map(r => `<option value="${r}" ${r === role ? "selected" : ""}>${r}</option>`).join("")}
        </select>
        <label class="hwms-label" style="font-size:13px;">แผนก</label>
        <select id="swalUserDept" class="swal2-select" style="margin:4px 0;">
          ${db.departments.map(d => `<option value="${d.id}" ${d.id === departmentId ? "selected" : ""}>${d.nameTh}</option>`).join("")}
        </select>
      </div>
    `,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    showCancelButton: true,
    confirmButtonColor: "#2563EB",
    cancelButtonColor: "#64748B",
    preConfirm: () => {
      const newFullName = document.getElementById("swalUserFullName").value.trim();
      const newEmail = document.getElementById("swalUserEmail").value.trim();
      const newRole = document.getElementById("swalUserRole").value;
      const newDept = document.getElementById("swalUserDept").value;
      if (!newFullName || !newEmail) {
        Swal.showValidationMessage("กรุณากรอกข้อมูลให้ครบทุกช่อง");
        return false;
      }
      return { newFullName, newEmail, newRole, newDept };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    try {
      await updateUserProfile(userId, {
        fullName: result.value.newFullName,
        email: result.value.newEmail,
        role: result.value.newRole,
        departmentId: result.value.newDept
      });
      showToast("แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว");
      renderUsersTable(getDB());
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: "error", title: "แก้ไขไม่สำเร็จ", text: err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
    }
  });
}

/** เปิด/ปิดการใช้งานบัญชี (สลับผ่าน toggle switch ในตาราง) */
async function handleToggleUserActive(userId, active) {
  try {
    await toggleUserActive(userId, active);
    showToast(active ? "เปิดใช้งานบัญชีแล้ว" : "ปิดใช้งานบัญชีแล้ว");
    renderUsersTable(getDB());
  } catch (err) {
    console.error(err);
    showToast("ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
    renderUsersTable(getDB()); // รีเซ็ต toggle กลับสถานะเดิมถ้าล้มเหลว
  }
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
