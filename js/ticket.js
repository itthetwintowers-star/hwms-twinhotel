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

/** เติม option ให้ select จาก array ของ object */
function fillSelect(elementId, items, valueField, labelField) {
  const select = document.getElementById(elementId);
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item[valueField];
    opt.textContent = item[labelField];
    select.appendChild(opt);
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
function renderTicketDetail(ticket, currentUser) {
  const db = getDB();

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

  // Select ตัวเลือกในการเปลี่ยนสถานะ / มอบหมายงาน
  const statusSelect = document.getElementById("changeStatusSelect");
  statusSelect.innerHTML = db.statuses.map(s => `<option value="${s.id}" ${s.id === ticket.status ? "selected" : ""}>${s.labelTh}</option>`).join("");

  const assigneeSelect = document.getElementById("assignTechnicianSelect");
  assigneeSelect.innerHTML = `<option value="">ไม่มอบหมาย</option>` + db.users.filter(u => u.active).map(u => `<option value="${u.id}" ${u.id === ticket.assignee ? "selected" : ""}>${u.fullName} (${getDepartmentName(u.department)})</option>`).join("");

  // ปุ่มบันทึกการเปลี่ยนสถานะ
  document.getElementById("saveStatusBtn").onclick = async function () {
    const newStatus = statusSelect.value;
    showLoading();
    try {
      const updated = await updateTicketStatus(ticket.id, newStatus, currentUser);
      hideLoading();
      showToast("อัปเดตสถานะเรียบร้อยแล้ว");
      bootstrap.Modal.getInstance(document.getElementById("changeStatusModal")).hide();
      renderTicketDetail(updated, currentUser);
    } catch (err) {
      hideLoading();
      console.error(err);
      showToast("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "error");
    }
  };

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

/* ================= TICKETS LIST PAGE ================= */

let ticketListState = {
  page: 1,
  pageSize: 10,
  sortField: "createdDate",
  sortDir: "desc",
  search: "",
  status: "",
  priority: "",
  department: ""
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

  document.getElementById("resetFilterBtn").addEventListener("click", function () {
    ticketListState = { page: 1, pageSize: 10, sortField: "createdDate", sortDir: "desc", search: "", status: "", priority: "", department: "" };
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
}

/** กรอง เรียงลำดับ และแบ่งหน้ารายการ ticket ตาม state ปัจจุบัน แล้ววาดตาราง */
function renderTicketsTable() {
  let tickets = getAllTickets();

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
