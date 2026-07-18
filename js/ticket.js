/**
 * =========================================================
 *  ticket.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  โลจิกที่เกี่ยวกับ Ticket โดยตรง:
 *  - หน้า "แจ้งงานใหม่" (new-ticket.html)
 *  - หน้า "รายละเอียดงาน" (ticket-detail.html)
 * =========================================================
 */

let attachedFiles = [];

/**
 * แผนผังลำดับสถานะงาน (workflow) — กำหนดว่าจากสถานะปัจจุบัน ไปสถานะถัดไปได้อะไรบ้าง
 * requiresResolution: true หมายถึงต้องกรอกสาเหตุ+วิธีแก้ไขก่อนถึงจะเปลี่ยนได้
 */
const STATUS_TRANSITIONS = {
  new: [
    { to: "accepted", label: "รับงาน", icon: "fa-hand" }
  ],
  accepted: [
    { to: "in_progress", label: "เริ่มดำเนินการ", icon: "fa-play" }
  ],
  in_progress: [
    { to: "pending", label: "รอดำเนินการ", icon: "fa-pause" },
    { to: "resolved", label: "ดำเนินการแก้ไขแล้ว", icon: "fa-check", requiresResolution: true }
  ],
  pending: [
    { to: "in_progress", label: "กลับมาดำเนินการ", icon: "fa-play" },
    { to: "resolved", label: "ดำเนินการแก้ไขแล้ว", icon: "fa-check", requiresResolution: true }
  ],
  resolved: [
    { to: "reviewing", label: "ส่งให้ผู้แจ้งตรวจสอบ", icon: "fa-magnifying-glass" }
  ],
  reviewing: [
    { to: "in_progress", label: "งานไม่เรียบร้อย — กลับไปแก้ไข", icon: "fa-rotate-left" },
    { to: "completed", label: "ผ่าน — ปิดงาน", icon: "fa-flag-checkered" }
  ],
  completed: [],
  cancelled: []
};

// ยกเลิกงานได้เฉพาะก่อนเริ่มดำเนินการเท่านั้น (งานใหม่ / รับงานแล้ว)
const CANCEL_ALLOWED_STATUSES = ["new", "accepted"];

document.addEventListener("DOMContentLoaded", async function () {
  if (document.getElementById("newTicketForm")) {
    await initNewTicketPage();
  }
  if (document.getElementById("ticketDetailRoot")) {
    await initTicketDetailPage();
  }
  if (document.getElementById("ticketsTableBody")) {
    await initTicketsListPage();
  }
});

/* ================= NEW TICKET PAGE ================= */

/** ตั้งค่าเริ่มต้นของหน้าแจ้งงานใหม่ */
async function initNewTicketPage() {
  const user = await initLayout("new-ticket", "แจ้งงานใหม่");
  if (!user) return;

  const db = getDB();

  // เติมตัวเลือกในฟอร์ม
  fillSelect("category", db.categories, "id", "nameTh");
  fillSelect("department", db.departments, "id", "nameTh");
  fillSelect("priority", db.priorities, "id", "labelTh");

  const locationSelect = document.getElementById("location");
  db.locations.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    locationSelect.appendChild(opt);
  });

  // แสดงตัวอย่างเลข Ticket
  document.getElementById("ticketNoPreview").textContent = generateTicketNo();

  // แสดง Legend ระดับความสำคัญ
  const legend = document.getElementById("priorityLegend");
  legend.innerHTML = db.priorities.map(p => `
    <div class="d-flex align-items-center justify-content-between">
      <span class="d-inline-flex align-items-center" style="font-size:13px; font-weight:600;">
        <span class="hwms-priority-dot" style="background:${p.color}"></span>${p.labelTh}
      </span>
    </div>
  `).join("");

  // จัดการไฟล์แนบ
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.style.borderColor = "#2563EB"; });
  dropzone.addEventListener("dragleave", () => { dropzone.style.borderColor = ""; });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "";
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  // จัดการ submit ฟอร์ม
  document.getElementById("newTicketForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    await submitNewTicket(user);
  });
}

/** จัดการรายการไฟล์ที่ผู้ใช้เลือก/ลากมาวาง (เก็บ File object จริงไว้ด้วยเพื่ออัปโหลดขึ้น Storage) */
function handleFiles(fileListObj) {
  const files = Array.from(fileListObj);
  files.forEach(f => attachedFiles.push({ name: f.name, size: (f.size / 1024).toFixed(0) + " KB", file: f }));
  renderFileList();
}

/** แสดงรายการไฟล์แนบที่เลือกไว้ พร้อมปุ่มลบ */
function renderFileList() {
  const list = document.getElementById("fileList");
  list.innerHTML = attachedFiles.map((f, idx) => `
    <span class="hwms-badge hwms-badge-secondary">
      <i class="fa-solid fa-paperclip"></i> ${f.name}
      <i class="fa-solid fa-xmark ms-1" style="cursor:pointer;" onclick="removeAttachedFile(${idx})"></i>
    </span>
  `).join("");
}

/** ลบไฟล์แนบออกจากรายการ */
function removeAttachedFile(idx) {
  attachedFiles.splice(idx, 1);
  renderFileList();
}

/** บันทึก Ticket ใหม่ขึ้น Supabase พร้อมอัปโหลดไฟล์แนบจริง */
async function submitNewTicket(user) {
  const subject = document.getElementById("subject").value.trim();
  const category = document.getElementById("category").value;
  const department = document.getElementById("department").value;
  const location = document.getElementById("location").value;
  const priority = document.getElementById("priority").value;
  const description = document.getElementById("description").value.trim();

  if (!subject || !category || !department || !location || !priority || !description) {
    Swal.fire({ icon: "warning", title: "กรอกข้อมูลไม่ครบ", text: "กรุณากรอกข้อมูลในช่องที่มีเครื่องหมาย * ให้ครบถ้วน", confirmButtonColor: "#2563EB" });
    return;
  }

  showLoading();
  try {
    const files = attachedFiles.map(f => f.file).filter(Boolean);
    const newTicket = await addTicket({ subject, category, department, location, priority, description }, user, files);

    hideLoading();
    Swal.fire({
      icon: "success",
      title: "บันทึกงานสำเร็จ",
      html: `สร้าง Ticket หมายเลข <strong>${newTicket.ticketNo}</strong> เรียบร้อยแล้ว`,
      confirmButtonText: "ดูรายละเอียด",
      showCancelButton: true,
      cancelButtonText: "แจ้งงานเพิ่ม",
      confirmButtonColor: "#2563EB",
      cancelButtonColor: "#64748B"
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = "ticket-detail.html?id=" + newTicket.id;
      } else {
        window.location.reload();
      }
    });
  } catch (err) {
    hideLoading();
    console.error(err);
    Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: "เกิดข้อผิดพลาดในการบันทึกงาน กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
  }
}

/* ================= TICKET DETAIL PAGE ================= */

/** ตั้งค่าเริ่มต้นของหน้ารายละเอียดงาน */
async function initTicketDetailPage() {
  const user = await initLayout("tickets", "รายละเอียดงาน");
  if (!user) return;

  const ticketId = getQueryParam("id");
  const ticket = getTicketById(ticketId);

  if (!ticket) {
    document.getElementById("ticketDetailRoot").innerHTML = `
      <div class="hwms-empty-state">
        <i class="fa-regular fa-face-frown"></i>
        <div>ไม่พบข้อมูล Ticket ที่ระบุ</div>
        <a href="tickets.html" class="btn btn-hwms-primary mt-3">กลับไปหน้ารายการงาน</a>
      </div>`;
    return;
  }

  renderTicketDetail(ticket, user);
}

/** วาดรายละเอียด Ticket ทั้งหมดลงในหน้า */
let _currentTicketDetail = null;

function renderTicketDetail(ticket, currentUser) {
  const db = getDB();
  _currentTicketDetail = ticket;

  document.getElementById("breadcrumbTicketNo").textContent = ticket.ticketNo;
  document.getElementById("ticketSubject").textContent = ticket.subject;
  document.getElementById("ticketNoTitle").textContent = ticket.ticketNo;
  document.getElementById("ticketStatusBadge").innerHTML = renderStatusBadge(ticket.status);
  document.getElementById("ticketPriorityBadge").innerHTML = renderPriorityBadge(ticket.priority);
  if (ticket.overdue) {
    document.getElementById("overdueBadge").innerHTML = '<span class="hwms-badge hwms-badge-danger"><i class="fa-solid fa-clock"></i> เกินกำหนด</span>';
  }

  document.getElementById("infoRequester").textContent = ticket.requesterName;
  document.getElementById("infoDepartment").textContent = getDepartmentName(ticket.department);
  document.getElementById("infoCategory").textContent = getCategoryName(ticket.category);
  document.getElementById("infoLocation").textContent = ticket.location;
  document.getElementById("infoCreated").textContent = formatThaiDateTime(ticket.createdDate);
  document.getElementById("infoDue").textContent = formatThaiDateTime(ticket.dueDate);
  document.getElementById("infoAssignee").textContent = ticket.assigneeName;
  document.getElementById("ticketDescription").textContent = ticket.description;

  // รูปภาพ/ไฟล์แนบตอนแจ้งงาน (before)
  renderAttachmentGallery("attachmentList", ticket.beforePhotos && ticket.beforePhotos.length ? ticket.beforePhotos : ticket.attachments);

  // Timeline
  const timelineWrap = document.getElementById("ticketTimeline");
  timelineWrap.innerHTML = ticket.timeline.map(t => `
    <div class="hwms-timeline-item">
      <div class="hwms-timeline-title">${t.action}</div>
      <div class="hwms-timeline-meta">โดย ${t.by} • ${formatThaiDateTime(t.date)}</div>
    </div>
  `).join("");

  // Comments
  renderComments(ticket);

  // ปุ่ม "ยกเลิกงาน" แสดงเฉพาะตอนสถานะยังเป็นงานใหม่/รับงานแล้วเท่านั้น
  document.getElementById("cancelTicketBtn").style.display =
    CANCEL_ALLOWED_STATUSES.includes(ticket.status) ? "inline-flex" : "none";

  // เมนู "บันทึกไปยัง Google Drive" แสดงเฉพาะ ticket ที่ "เสร็จสิ้น" แล้วเท่านั้น
  // (ใบงานยังไม่สมบูรณ์ถ้างานยังไม่จบ ไม่ควรอัปโหลดเก็บถาวรก่อนเวลา)
  document.getElementById("saveToDriveMenuItem").style.display =
    ticket.status === "completed" ? "block" : "none";

  // การ์ดสรุปการแก้ไขปัญหา (แสดงเฉพาะเมื่อมีการกรอกสาเหตุ/วิธีแก้ไขแล้ว)
  const resolutionCard = document.getElementById("resolutionSummaryCard");
  if (ticket.resolutionCause || ticket.resolutionAction) {
    resolutionCard.style.display = "block";
    document.getElementById("resolutionCauseDisplay").textContent = ticket.resolutionCause || "-";
    document.getElementById("resolutionActionDisplay").textContent = ticket.resolutionAction || "-";

    const afterSection = document.getElementById("afterPhotosSection");
    if (ticket.afterPhotos && ticket.afterPhotos.length > 0) {
      afterSection.style.display = "block";
      renderAttachmentGallery("afterPhotosGallery", ticket.afterPhotos);
    } else {
      afterSection.style.display = "none";
    }
  } else {
    resolutionCard.style.display = "none";
  }

  // วาดปุ่มขั้นตอนเปลี่ยนสถานะแบบ workflow (แทนที่ dropdown เดิม)
  renderStatusActionButtons(ticket, currentUser);

  const assigneeSelect = document.getElementById("assignTechnicianSelect");
  assigneeSelect.innerHTML = `<option value="">ไม่มอบหมาย</option>` + db.users.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id === ticket.assignee ? "selected" : ""}>${u.fullName} (${getDepartmentName(u.department)})</option>`).join("");

  // ปุ่มบันทึกการมอบหมายงาน
  document.getElementById("saveAssignBtn").onclick = async function () {
    const techId = assigneeSelect.value;
    showLoading();
    try {
      const updated = await updateTicketAssignee(ticket.id, techId || null, currentUser);
      hideLoading();
      showToast("มอบหมายงานเรียบร้อยแล้ว");
      bootstrap.Modal.getInstance(document.getElementById("assignTechnicianModal")).hide();
      renderTicketDetail(updated, currentUser);
    } catch (err) {
      hideLoading();
      console.error(err);
      showToast("มอบหมายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
    }
  };

  // ปุ่มส่งความคิดเห็น
  document.getElementById("submitCommentBtn").onclick = async function () {
    const input = document.getElementById("commentInput");
    const text = input.value.trim();
    if (!text) return;
    showLoading();
    try {
      const updated = await addTicketComment(ticket.id, text, currentUser);
      hideLoading();
      input.value = "";
      renderTicketDetail(updated, currentUser);
    } catch (err) {
      hideLoading();
      console.error(err);
      showToast("ส่งความคิดเห็นไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
    }
  };
}

/**
 * วาดปุ่มขั้นตอนเปลี่ยนสถานะใน modal ตาม STATUS_TRANSITIONS ของสถานะปัจจุบัน
 * ถ้าเลือกขั้นที่ requiresResolution=true (เช่น "ดำเนินการแก้ไขแล้ว") จะเปิดช่องกรอก
 * สาเหตุ/วิธีแก้ไขให้กรอกก่อน แทนที่จะเปลี่ยนสถานะทันที
 */
function renderStatusActionButtons(ticket, currentUser) {
  document.getElementById("currentStatusLabel").innerHTML = renderStatusBadge(ticket.status);

  const wrap = document.getElementById("statusActionButtons");
  const resolutionSection = document.getElementById("resolutionFieldsSection");
  resolutionSection.style.display = "none";
  document.getElementById("resolutionCauseInput").value = "";
  document.getElementById("resolutionActionInput").value = "";
  resolutionPhotoFiles = [];
  document.getElementById("resolutionPhotoPreview").innerHTML = "";

  const nextSteps = STATUS_TRANSITIONS[ticket.status] || [];

  if (nextSteps.length === 0) {
    wrap.innerHTML = `<div class="text-muted" style="font-size:13px;">งานนี้อยู่ในสถานะสุดท้ายแล้ว ไม่สามารถเปลี่ยนสถานะต่อได้</div>`;
    return;
  }

  wrap.innerHTML = nextSteps.map((step, idx) => `
    <button type="button" class="btn btn-hwms-outline text-start" data-step-index="${idx}">
      <i class="fa-solid ${step.icon} me-2"></i>${step.label}
    </button>
  `).join("");

  wrap.querySelectorAll("button[data-step-index]").forEach(btn => {
    btn.addEventListener("click", async function () {
      const step = nextSteps[Number(this.dataset.stepIndex)];

      if (step.requiresResolution) {
        // เปิดช่องกรอกสาเหตุ/วิธีแก้ไข แทนที่จะเปลี่ยนสถานะทันที
        resolutionSection.style.display = "block";
        setupResolutionPhotoDropzone();
        document.getElementById("confirmResolvedBtn").onclick = async function () {
          const cause = document.getElementById("resolutionCauseInput").value.trim();
          const action = document.getElementById("resolutionActionInput").value.trim();
          if (!cause || !action) {
            Swal.fire({ icon: "warning", title: "กรอกข้อมูลไม่ครบ", text: "กรุณากรอกทั้งสาเหตุและวิธีการแก้ไขปัญหา", confirmButtonColor: "#2563EB" });
            return;
          }
          await performStatusChange(ticket.id, step.to, currentUser, { cause, action, photos: resolutionPhotoFiles });
        };
        return;
      }

      await performStatusChange(ticket.id, step.to, currentUser);
    });
  });
}

/** ไฟล์รูปถ่ายหลังดำเนินการแก้ไขที่ผู้ใช้เลือกไว้ (รีเซ็ตทุกครั้งที่เปิด modal เปลี่ยนสถานะใหม่) */
let resolutionPhotoFiles = [];

/** ตั้งค่าปุ่ม/ช่องเลือกรูปถ่ายหลังดำเนินการแก้ไขใน modal เปลี่ยนสถานะ */
function setupResolutionPhotoDropzone() {
  const dropzone = document.getElementById("resolutionPhotoDropzone");
  const fileInput = document.getElementById("resolutionPhotoInput");

  // ล้าง listener เก่าก่อน (ป้องกันการซ้อนกันถ้าเปิด modal หลายรอบ) ด้วยการ clone element
  const newDropzone = dropzone.cloneNode(true);
  dropzone.parentNode.replaceChild(newDropzone, dropzone);
  const newFileInput = newDropzone.querySelector("#resolutionPhotoInput");

  newDropzone.addEventListener("click", () => newFileInput.click());
  newFileInput.addEventListener("change", () => {
    resolutionPhotoFiles.push(...Array.from(newFileInput.files));
    renderResolutionPhotoPreview();
  });
}

/** วาดรูปตัวอย่างของรูปถ่ายหลังดำเนินการแก้ไขที่เลือกไว้ พร้อมปุ่มลบ */
function renderResolutionPhotoPreview() {
  const wrap = document.getElementById("resolutionPhotoPreview");
  wrap.innerHTML = resolutionPhotoFiles.map((f, idx) => `
    <span class="hwms-badge hwms-badge-secondary">
      <i class="fa-solid fa-image"></i> ${f.name}
      <i class="fa-solid fa-xmark ms-1" style="cursor:pointer;" onclick="removeResolutionPhoto(${idx})"></i>
    </span>
  `).join("");
}

/** ลบรูปถ่ายหลังดำเนินการแก้ไขออกจากรายการที่เลือกไว้ */
function removeResolutionPhoto(idx) {
  resolutionPhotoFiles.splice(idx, 1);
  renderResolutionPhotoPreview();
}

/** ดำเนินการเปลี่ยนสถานะจริง (เรียกจากปุ่ม step หรือปุ่มยืนยันหลังกรอกสาเหตุ/วิธีแก้ไข) */
async function performStatusChange(ticketId, newStatus, currentUser, resolution = null) {
  showLoading();
  try {
    const updated = await updateTicketStatus(ticketId, newStatus, currentUser, resolution);
    hideLoading();
    showToast("อัปเดตสถานะเรียบร้อยแล้ว");
    const modalEl = document.getElementById("changeStatusModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
    renderTicketDetail(updated, currentUser);
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
  }
}

/** ยกเลิกงาน (กดได้เฉพาะตอนสถานะยังเป็นงานใหม่/รับงานแล้ว) */
async function handleCancelTicket() {
  const ticket = _currentTicketDetail;
  if (!ticket) return;

  const confirmed = await confirmAction(
    "ยกเลิกงานนี้?",
    `Ticket ${ticket.ticketNo} จะถูกยกเลิก การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
    "ยกเลิกงาน"
  );
  if (!confirmed) return;

  const currentUser = getCurrentUser();
  await performStatusChange(ticket.id, "cancelled", currentUser);
}

/* ================= TICKETS LIST PAGE ================= */

let ticketListState = {
  page: 1,
  pageSize: 10,
  sortField: "createdDate",
  sortDir: "desc",
  search: "",
  status: "",
  priority: "",
  department: "",
  scope: "current" // "current" = เดือนนี้ + งานค้างจากเดือนก่อน, "all" = ทั้งหมด
};

/** ตั้งค่าเริ่มต้นของหน้าติดตามงาน (ตารางรายการ ticket) */
async function initTicketsListPage() {
  const user = await initLayout("tickets", "ติดตามงาน");
  if (!user) return;

  const db = getDB();

  fillSelect("filterStatus", db.statuses, "id", "labelTh");
  fillSelect("filterPriority", db.priorities, "id", "labelTh");
  fillSelect("filterDepartment", db.departments, "id", "nameTh");

  const qParam = getQueryParam("q");
  if (qParam) {
    ticketListState.search = qParam;
    document.getElementById("searchInput").value = qParam;
  }

  document.getElementById("searchInput").addEventListener("input", function () {
    ticketListState.search = this.value.trim();
    ticketListState.page = 1;
    renderTicketsTable();
  });

  document.getElementById("filterStatus").addEventListener("change", function () {
    ticketListState.status = this.value;
    ticketListState.page = 1;
    renderTicketsTable();
  });

  document.getElementById("filterPriority").addEventListener("change", function () {
    ticketListState.priority = this.value;
    ticketListState.page = 1;
    renderTicketsTable();
  });

  document.getElementById("filterDepartment").addEventListener("change", function () {
    ticketListState.department = this.value;
    ticketListState.page = 1;
    renderTicketsTable();
  });

  document.querySelectorAll(".scope-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.scope === ticketListState.scope);
    btn.addEventListener("click", function () {
      ticketListState.scope = this.dataset.scope;
      ticketListState.page = 1;
      document.querySelectorAll(".scope-btn").forEach(b => b.classList.toggle("active", b === this));
      renderTicketsTable();
    });
  });

  document.getElementById("resetFilterBtn").addEventListener("click", function () {
    const keepScope = ticketListState.scope;
    ticketListState = { page: 1, pageSize: 10, sortField: "createdDate", sortDir: "desc", search: "", status: "", priority: "", department: "", scope: keepScope };
    document.getElementById("searchInput").value = "";
    document.getElementById("filterStatus").value = "";
    document.getElementById("filterPriority").value = "";
    document.getElementById("filterDepartment").value = "";
    renderTicketsTable();
  });

  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", function () {
      const field = this.dataset.sort;
      if (ticketListState.sortField === field) {
        ticketListState.sortDir = ticketListState.sortDir === "asc" ? "desc" : "asc";
      } else {
        ticketListState.sortField = field;
        ticketListState.sortDir = "asc";
      }
      renderTicketsTable();
    });
  });

  renderTicketsTable();

  // รีเฟรชตารางอัตโนมัติเมื่อมีงานใหม่/มีการอัปเดตแบบเรียลไทม์
  document.addEventListener("hwms:ticketsUpdated", function () {
    renderTicketsTable();
  });
}

/** กรอง เรียงลำดับ และแบ่งหน้ารายการ ticket ตาม state ปัจจุบัน แล้ววาดตาราง */
function renderTicketsTable() {
  let tickets = getAllTickets();

  if (ticketListState.scope === "current") {
    const now = new Date();
    const openStatuses = ["new", "accepted", "in_progress", "pending", "resolved", "reviewing"];
    tickets = tickets.filter(t => {
      const d = new Date(t.createdDate);
      const isThisMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      const isLeftoverFromBefore = d < new Date(now.getFullYear(), now.getMonth(), 1) && openStatuses.includes(t.status);
      return isThisMonth || isLeftoverFromBefore;
    });
  }

  if (ticketListState.search) {
    const q = ticketListState.search.toLowerCase();
    tickets = tickets.filter(t =>
      t.ticketNo.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.requesterName.toLowerCase().includes(q)
    );
  }
  if (ticketListState.status) tickets = tickets.filter(t => t.status === ticketListState.status);
  if (ticketListState.priority) tickets = tickets.filter(t => t.priority === ticketListState.priority);
  if (ticketListState.department) tickets = tickets.filter(t => t.department === ticketListState.department);

  tickets.sort((a, b) => {
    let av = a[ticketListState.sortField];
    let bv = b[ticketListState.sortField];
    if (ticketListState.sortField === "createdDate") {
      av = new Date(av).getTime();
      bv = new Date(bv).getTime();
    } else if (typeof av === "string") {
      av = av.toLowerCase();
      bv = bv.toLowerCase();
    }
    if (av < bv) return ticketListState.sortDir === "asc" ? -1 : 1;
    if (av > bv) return ticketListState.sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const total = tickets.length;
  const totalPages = Math.max(1, Math.ceil(total / ticketListState.pageSize));
  if (ticketListState.page > totalPages) ticketListState.page = totalPages;
  const start = (ticketListState.page - 1) * ticketListState.pageSize;
  const pageItems = tickets.slice(start, start + ticketListState.pageSize);

  const tbody = document.getElementById("ticketsTableBody");
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="hwms-empty-state"><i class="fa-regular fa-folder-open"></i><div>ไม่พบรายการที่ตรงกับเงื่อนไข</div></td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(t => `
      <tr>
        <td><a class="hwms-ticket-link" href="ticket-detail.html?id=${t.id}">${t.ticketNo}</a></td>
        <td>${t.subject}</td>
        <td>${getDepartmentName(t.department)}</td>
        <td>${t.assigneeName}</td>
        <td>${renderPriorityBadge(t.priority)}</td>
        <td>${renderStatusBadge(t.status)}</td>
        <td>${formatThaiDateTime(t.createdDate)}</td>
        <td>
          <a href="ticket-detail.html?id=${t.id}" class="hwms-icon-btn" style="width:32px;height:32px;" title="ดูรายละเอียด">
            <i class="fa-solid fa-eye" style="font-size:12px;"></i>
          </a>
        </td>
      </tr>
    `).join("");
  }

  document.getElementById("paginationInfo").textContent =
    total === 0 ? "ไม่พบข้อมูล" : `แสดง ${start + 1}-${Math.min(start + ticketListState.pageSize, total)} จากทั้งหมด ${total} รายการ`;

  renderPaginationControls(totalPages);
}

/** วาดปุ่มควบคุมการแบ่งหน้า */
function renderPaginationControls(totalPages) {
  const wrap = document.getElementById("paginationControls");
  let html = "";

  html += `<li class="page-item ${ticketListState.page === 1 ? "disabled" : ""}">
    <button class="page-link" onclick="changeTicketPage(${ticketListState.page - 1})">&laquo;</button></li>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - ticketListState.page) <= 1) {
      html += `<li class="page-item ${i === ticketListState.page ? "active" : ""}">
        <button class="page-link" onclick="changeTicketPage(${i})">${i}</button></li>`;
    } else if (Math.abs(i - ticketListState.page) === 2) {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  html += `<li class="page-item ${ticketListState.page === totalPages ? "disabled" : ""}">
    <button class="page-link" onclick="changeTicketPage(${ticketListState.page + 1})">&raquo;</button></li>`;

  wrap.innerHTML = html;
}

/** เปลี่ยนหน้าปัจจุบันของตารางรายการ */
function changeTicketPage(page) {
  ticketListState.page = page;
  renderTicketsTable();
}

/**
 * วาดแกลเลอรีไฟล์แนบ: รูปภาพแสดงเป็น thumbnail คลิกเพื่อดูขนาดเต็ม, ไฟล์อื่น (เช่น PDF)
 * แสดงเป็น badge ให้คลิกเปิดในแท็บใหม่แทน
 */
function renderAttachmentGallery(containerId, files) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  if (!files || files.length === 0) {
    wrap.innerHTML = `<span class="text-muted" style="font-size:13px;">ไม่มีไฟล์แนบ</span>`;
    return;
  }

  wrap.innerHTML = files.map(f => {
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(f.name || "");
    if (isImage) {
      return `<a href="${f.url || '#'}" target="_blank" rel="noopener">
        <img src="${f.url}" alt="${f.name}" style="width:90px; height:90px; object-fit:cover; border-radius:8px; border:1px solid var(--hwms-border);">
      </a>`;
    }
    return `<a href="${f.url || '#'}" target="_blank" rel="noopener" class="hwms-badge hwms-badge-secondary" style="text-decoration:none;">
      <i class="fa-solid fa-paperclip"></i> ${f.name} (${f.size})
    </a>`;
  }).join("");
}

/** วาดรายการความคิดเห็นของ Ticket */
function renderComments(ticket) {
  const wrap = document.getElementById("commentsList");
  if (!ticket.comments || ticket.comments.length === 0) {
    wrap.innerHTML = `<div class="text-muted" style="font-size:13px;">ยังไม่มีความคิดเห็น</div>`;
    return;
  }
  wrap.innerHTML = ticket.comments.map(c => `
    <div class="hwms-comment">
      <div class="hwms-avatar" style="background:#2563EB; width:34px; height:34px; font-size:12px;">${getInitials(c.by)}</div>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between">
          <strong style="font-size:13px;">${c.by}</strong>
          <span style="font-size:11px; color:var(--hwms-text-soft);">${formatThaiDateTime(c.date)}</span>
        </div>
        <div class="hwms-comment-bubble mt-1">${c.text}</div>
      </div>
    </div>
  `).join("");
}

/* ================= PRINT WORK ORDER + QR CODE ================= */

/**
 * เตรียมข้อมูลใบสั่งงานลงใน #printArea แล้วสั่งพิมพ์ (window.print())
 * QR Code เข้ารหัส URL ของหน้า ticket-detail.html นี้ (พร้อม ?id=...) เพื่อให้
 * สแกนแล้วเปิดกลับมาที่ ticket ใบนี้ได้ทันที
 */
/**
 * เติมข้อมูลทั้งหมดลงในใบสั่งงาน #printArea (ใช้ร่วมกันทั้งพิมพ์, ดาวน์โหลด PDF,
 * และบันทึกขึ้น Google Drive) คืนค่า true ถ้าสำเร็จ, false ถ้ายังไม่มีข้อมูล ticket
 */
async function populatePrintArea() {
  const ticket = _currentTicketDetail;
  if (!ticket) {
    Swal.fire({ icon: "warning", title: "ยังโหลดข้อมูลไม่เสร็จ", text: "กรุณารอสักครู่แล้วลองใหม่อีกครั้ง", confirmButtonColor: "#2563EB" });
    return false;
  }

  const db = getDB();
  const company = db.companyProfile;

  document.getElementById("printHotelName").textContent = (company && company.hotelName) || "Hotel Work Management System";
  document.getElementById("printTicketNo").textContent = ticket.ticketNo;
  document.getElementById("printSubject").textContent = ticket.subject;
  document.getElementById("printDepartment").textContent = getDepartmentName(ticket.department);
  document.getElementById("printCategory").textContent = getCategoryName(ticket.category);
  document.getElementById("printLocation").textContent = ticket.location;
  document.getElementById("printPriority").textContent = getPriorityInfo(ticket.priority).labelTh;
  document.getElementById("printStatus").textContent = getStatusInfo(ticket.status).labelTh;
  document.getElementById("printRequester").textContent = ticket.requesterName;
  document.getElementById("printAssignee").textContent = ticket.assigneeName;
  document.getElementById("printCreated").textContent = formatThaiDateTime(ticket.createdDate);
  document.getElementById("printDue").textContent = formatThaiDateTime(ticket.dueDate);
  document.getElementById("printDescription").textContent = ticket.description;

  // รูปภาพตอนแจ้งงาน
  const beforePhotos = (ticket.beforePhotos && ticket.beforePhotos.length) ? ticket.beforePhotos : ticket.attachments;
  const beforeSection = document.getElementById("printBeforePhotosSection");
  if (beforePhotos && beforePhotos.length > 0) {
    beforeSection.style.display = "block";
    document.getElementById("printBeforePhotos").innerHTML = beforePhotos
      .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f.name || ""))
      .map(f => `<img src="${f.url}" crossorigin="anonymous">`).join("");
  } else {
    beforeSection.style.display = "none";
  }

  // สาเหตุ + วิธีการแก้ไข (แสดงเฉพาะเมื่อมีข้อมูลแล้ว)
  const resolutionSection = document.getElementById("printResolutionSection");
  if (ticket.resolutionCause || ticket.resolutionAction) {
    resolutionSection.style.display = "block";
    document.getElementById("printResolutionCause").textContent = ticket.resolutionCause || "-";
    document.getElementById("printResolutionAction").textContent = ticket.resolutionAction || "-";
  } else {
    resolutionSection.style.display = "none";
  }

  // รูปภาพหลังดำเนินการแก้ไข
  const afterSection = document.getElementById("printAfterPhotosSection");
  if (ticket.afterPhotos && ticket.afterPhotos.length > 0) {
    afterSection.style.display = "block";
    document.getElementById("printAfterPhotos").innerHTML = ticket.afterPhotos
      .map(f => `<img src="${f.url}" crossorigin="anonymous">`).join("");
  } else {
    afterSection.style.display = "none";
  }

  // สร้าง QR Code ด้วย library "qrcode" (เชื่อถือได้กว่าตัวเดิม) เป็น data URL แล้วฝังเป็น <img>
  // encode URL แบบเต็ม (absolute) เสมอ เพื่อให้สแกนแล้วเปิดเว็บได้ตรง ไม่ใช่ path สัมพัทธ์
  const qrContainer = document.getElementById("printQrcode");
  try {
    const qrDataUrl = await QRCode.toDataURL(window.location.href, {
      width: 180, // สร้างใหญ่กว่าที่แสดงจริง (แสดง 90px ใน CSS) เพื่อความคมชัดตอนพิมพ์
      margin: 1,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="QR Code">`;
  } catch (err) {
    console.error("สร้าง QR Code ไม่สำเร็จ:", err);
    qrContainer.innerHTML = "";
  }

  // รอให้รูปภาพทั้งหมดใน printArea โหลดเสร็จก่อน (สำคัญมากสำหรับการพิมพ์/แปลงเป็น PDF
  // ให้ครบถ้วน ไม่งั้นรูปที่ยังโหลดไม่เสร็จจะหายไปตอนพิมพ์)
  await waitForImagesToLoad(document.getElementById("printArea"));

  return true;
}

/** รอให้ <img> ทุกตัวในภาชนะที่กำหนดโหลดเสร็จ (หรือ error) ก่อนไปขั้นตอนถัดไป */
function waitForImagesToLoad(container) {
  const images = Array.from(container.querySelectorAll("img"));
  return Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve; // ไม่บล็อกทั้งหน้าถ้ารูปใดรูปหนึ่งโหลดไม่สำเร็จ
    });
  }));
}

/** พิมพ์ใบงาน (เปิดหน้าต่างพิมพ์ของเบราว์เซอร์ เลือก "Save as PDF" เพื่อบันทึกเป็นไฟล์ได้) */
async function printTicketWorkOrder() {
  showLoading();
  const ready = await populatePrintArea();
  hideLoading();
  if (!ready) return;
  window.print();
}

/** ดาวน์โหลดใบงานเป็นไฟล์ PDF โดยตรง (ใช้ html2canvas แปลง printArea เป็นภาพ แล้วฝังลง PDF) */
async function downloadTicketPdf() {
  showLoading();
  try {
    const blob = await generateWorkOrderPdfBlob();
    hideLoading();
    const ticket = _currentTicketDetail;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticket.ticketNo}-work-order.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    hideLoading();
    console.error(err);
    Swal.fire({ icon: "error", title: "สร้าง PDF ไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
  }
}

/**
 * แปลง #printArea เป็นไฟล์ PDF (Blob) ด้วย html2canvas + jsPDF
 * ใช้วิธี "ถ่ายภาพหน้าจอ" ของ DOM แทนการวาดข้อความลง PDF ตรง ๆ เพื่อเลี่ยงปัญหา
 * ฟอนต์ภาษาไทยเพี้ยนใน jsPDF (jsPDF ไม่มีฟอนต์ไทยในตัว ต้องฝังเองซึ่งไฟล์ใหญ่มาก)
 * วิธีนี้ใช้ฟอนต์ที่เบราว์เซอร์ render อยู่แล้วโดยตรง จึงถูกต้อง 100% เสมอ
 */
async function generateWorkOrderPdfBlob() {
  const ready = await populatePrintArea();
  if (!ready) throw new Error("ไม่พร้อมสร้าง PDF");

  const printArea = document.getElementById("printArea");
  const originalDisplay = printArea.style.display;
  printArea.style.display = "block"; // html2canvas ต้อง element มองเห็นได้ (ไม่ใช่ display:none) ถึงจะ capture ได้

  const canvas = await html2canvas(printArea, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  printArea.style.display = originalDisplay;

  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // ถ้าเนื้อหายาวเกินหนึ่งหน้า A4 ให้ตัดต่อหน้าถัดไปอัตโนมัติ (รองรับ ticket ที่มีรูปภาพเยอะ)
  pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf.output("blob");
}

/**
 * บันทึกใบงาน (PDF) ขึ้น Google Drive โฟลเดอร์ที่กำหนดไว้ล่วงหน้า ผ่าน Edge Function
 * (ใช้ Google Service Account ฝั่งเซิร์ฟเวอร์ ไม่ฝัง credential ใด ๆ ใน frontend)
 * ใช้ได้เฉพาะ ticket ที่ "เสร็จสิ้น" แล้วเท่านั้น (ปุ่มจะถูกซ่อนไว้ก่อนหน้านั้น)
 */
async function handleSaveToGoogleDrive() {
  const ticket = _currentTicketDetail;
  if (!ticket) return;

  showLoading();
  try {
    const blob = await generateWorkOrderPdfBlob();
    const base64Pdf = await blobToBase64(blob);
    await uploadWorkOrderToGoogleDrive(ticket.ticketNo, base64Pdf);
    hideLoading();
    Swal.fire({ icon: "success", title: "บันทึกสำเร็จ", text: `บันทึกใบงาน ${ticket.ticketNo} ไปยัง Google Drive เรียบร้อยแล้ว`, confirmButtonColor: "#2563EB" });
  } catch (err) {
    hideLoading();
    console.error(err);
    Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", confirmButtonColor: "#EF4444" });
  }
}

/** แปลง Blob เป็น base64 string (ไม่รวม data:...;base64, prefix) สำหรับส่งให้ Edge Function */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
