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

  // ไฟล์แนบ
  const attachWrap = document.getElementById("attachmentList");
  if (ticket.attachments && ticket.attachments.length > 0) {
    attachWrap.innerHTML = ticket.attachments.map(a => `
      <a href="${a.url || '#'}" target="_blank" rel="noopener" class="hwms-badge hwms-badge-secondary" style="text-decoration:none;">
        <i class="fa-solid fa-paperclip"></i> ${a.name} (${a.size})
      </a>
    `).join("");
  } else {
    attachWrap.innerHTML = `<span class="text-muted" style="font-size:13px;">ไม่มีไฟล์แนบ</span>`;
  }

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

  // การ์ดสรุปการแก้ไขปัญหา (แสดงเฉพาะเมื่อมีการกรอกสาเหตุ/วิธีแก้ไขแล้ว)
  const resolutionCard = document.getElementById("resolutionSummaryCard");
  if (ticket.resolutionCause || ticket.resolutionAction) {
    resolutionCard.style.display = "block";
    document.getElementById("resolutionCauseDisplay").textContent = ticket.resolutionCause || "-";
    document.getElementById("resolutionActionDisplay").textContent = ticket.resolutionAction || "-";
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
        document.getElementById("confirmResolvedBtn").onclick = async function () {
          const cause = document.getElementById("resolutionCauseInput").value.trim();
          const action = document.getElementById("resolutionActionInput").value.trim();
          if (!cause || !action) {
            Swal.fire({ icon: "warning", title: "กรอกข้อมูลไม่ครบ", text: "กรุณากรอกทั้งสาเหตุและวิธีการแก้ไขปัญหา", confirmButtonColor: "#2563EB" });
            return;
          }
          await performStatusChange(ticket.id, step.to, currentUser, { cause, action });
        };
        return;
      }

      await performStatusChange(ticket.id, step.to, currentUser);
    });
  });
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
function printTicketWorkOrder() {
  const ticket = _currentTicketDetail;
  if (!ticket) {
    Swal.fire({ icon: "warning", title: "ยังโหลดข้อมูลไม่เสร็จ", text: "กรุณารอสักครู่แล้วลองใหม่อีกครั้ง", confirmButtonColor: "#2563EB" });
    return;
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

  // สร้าง QR Code ใหม่ทุกครั้ง (ลบของเดิมก่อน กันซ้อนกันเวลากดพิมพ์หลายรอบ)
  const qrContainer = document.getElementById("printQrcode");
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, {
    text: window.location.href,
    width: 90,
    height: 90,
    colorDark: "#0F172A",
    colorLight: "#ffffff"
  });

  // หน่วงเล็กน้อยให้ QR code วาดเสร็จก่อนค่อยเปิดหน้าต่างพิมพ์
  setTimeout(() => window.print(), 200);
}
