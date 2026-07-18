/**
 * =========================================================
 *  reports.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  โลจิกหน้า "รายงาน": ตัวกรอง, การ์ดสรุป, กราฟ, ตารางสรุปตามแผนก,
 *  และปุ่ม Export จริง (Excel ผ่าน SheetJS, PDF ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์)
 * =========================================================
 */

let reportCharts = {};

document.addEventListener("DOMContentLoaded", async function () {
  const user = await initLayout("reports", "รายงาน");
  if (!user) return;

  const db = getDB();
  setupReportFilters(db);
  renderReport();

  document.getElementById("reportMonth").addEventListener("change", renderReport);
  document.getElementById("reportYear").addEventListener("change", renderReport);
  document.getElementById("reportDepartment").addEventListener("change", renderReport);
  document.getElementById("reportStatus").addEventListener("change", renderReport);

  document.getElementById("exportExcelBtn").addEventListener("click", exportToExcel);
  document.getElementById("exportPdfBtn").addEventListener("click", exportToPDF);

  // รีเฟรชรายงานอัตโนมัติเมื่อมีงานใหม่/มีการอัปเดตแบบเรียลไทม์
  document.addEventListener("hwms:ticketsUpdated", renderReport);
});

/** เติมตัวเลือกตัวกรองของหน้ารายงาน */
function setupReportFilters(db) {
  const monthNames = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const monthSelect = document.getElementById("reportMonth");
  monthNames.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  });

  const yearSelect = document.getElementById("reportYear");
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 2; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y + 543;
    yearSelect.appendChild(opt);
  }

  fillSelect("reportDepartment", db.departments, "id", "nameTh");
  fillSelect("reportStatus", db.statuses, "id", "labelTh");
}

/** กรองข้อมูล ticket ตามตัวกรองปัจจุบันของหน้ารายงาน */
function getFilteredReportTickets() {
  const month = document.getElementById("reportMonth").value;
  const year = document.getElementById("reportYear").value;
  const department = document.getElementById("reportDepartment").value;
  const status = document.getElementById("reportStatus").value;

  return getAllTickets().filter(t => {
    const d = new Date(t.createdDate);
    if (month !== "" && d.getMonth() !== Number(month)) return false;
    if (year !== "" && d.getFullYear() !== Number(year)) return false;
    if (department && t.department !== department) return false;
    if (status && t.status !== status) return false;
    return true;
  });
}

/** วาดรายงานทั้งหมด (การ์ด, กราฟ, ตาราง) ใหม่ตามตัวกรองปัจจุบัน */
function renderReport() {
  const tickets = getFilteredReportTickets();
  renderReportSummary(tickets);
  renderReportCharts(tickets);
  renderReportTable(tickets);
}

/** วาดการ์ดสรุปตัวเลขหลักของรายงาน */
function renderReportSummary(tickets) {
  const total = tickets.length;
  const completed = tickets.filter(t => t.status === "completed").length;
  const overdue = tickets.filter(t => t.overdue).length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const cards = [
    { label: "งานทั้งหมด", value: total, icon: "fa-clipboard-list", color: "primary" },
    { label: "งานเสร็จสิ้น", value: completed, icon: "fa-circle-check", color: "success" },
    { label: "งานเกินกำหนด", value: overdue, icon: "fa-triangle-exclamation", color: "danger" },
    { label: "อัตราความสำเร็จ", value: rate + "%", icon: "fa-gauge-high", color: "warning" }
  ];

  document.getElementById("reportSummaryRow").innerHTML = cards.map(c => `
    <div class="col-6 col-lg-3">
      <div class="hwms-card hwms-stat-card">
        <div class="hwms-stat-icon hwms-badge-${c.color}"><i class="fa-solid ${c.icon}"></i></div>
        <div>
          <div class="hwms-stat-value">${c.value}</div>
          <div class="hwms-stat-label">${c.label}</div>
        </div>
      </div>
    </div>
  `).join("");
}

/** วาดกราฟทั้งหมดของหน้ารายงาน (ทำลายของเดิมก่อนวาดใหม่ทุกครั้ง) */
function renderReportCharts(tickets) {
  Object.values(reportCharts).forEach(c => c.destroy());
  reportCharts = {};

  const db = getDB();

  // สัดส่วนสถานะ (ใช้สีจริงของแต่ละสถานะจากฐานข้อมูล แทนสีตายตัว เผื่อมีการเพิ่ม/แก้สถานะภายหลัง)
  const statusColorMap = {
    primary: "#2563EB", info: "#06B6D4", warning: "#F59E0B",
    secondary: "#94A3B8", success: "#22C55E", danger: "#EF4444"
  };
  const statusCounts = db.statuses.map(s => tickets.filter(t => t.status === s.id).length);
  reportCharts.status = new Chart(document.getElementById("reportStatusChart"), {
    type: "pie",
    data: {
      labels: db.statuses.map(s => s.labelTh),
      datasets: [{
        data: statusCounts,
        backgroundColor: db.statuses.map(s => statusColorMap[s.color] || "#94A3B8"),
        borderWidth: 0
      }]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } } }
  });

  // เปรียบเทียบตามแผนก
  const deptCounts = db.departments.map(d => tickets.filter(t => t.department === d.id).length);
  reportCharts.dept = new Chart(document.getElementById("reportDeptChart"), {
    type: "bar",
    data: {
      labels: db.departments.map(d => d.nameTh),
      datasets: [{ label: "จำนวนงาน", data: deptCounts, backgroundColor: "#2563EB", borderRadius: 6, maxBarThickness: 28 }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: "#F1F5F9" } }, y: { grid: { display: false } } }
    }
  });

  // แนวโน้มรายเดือน (12 เดือนย้อนหลัง จากข้อมูลทั้งหมด ไม่ใช้ตัวกรองเดือน/ปี)
  const months = [];
  const counts = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }));
    const count = getAllTickets().filter(t => {
      const td = new Date(t.createdDate);
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
    }).length;
    counts.push(count);
  }
  reportCharts.trend = new Chart(document.getElementById("reportTrendChart"), {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        label: "จำนวนงาน", data: counts, borderColor: "#22C55E",
        backgroundColor: "rgba(34,197,94,0.1)", fill: true, tension: 0.35, pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: "#F1F5F9" } }, x: { grid: { display: false } } }
    }
  });
}

/** วาดตารางสรุปข้อมูลตามแผนก */
function renderReportTable(tickets) {
  const db = getDB();
  const rows = db.departments.map(dep => {
    const deptTickets = tickets.filter(t => t.department === dep.id);
    const total = deptTickets.length;
    const completed = deptTickets.filter(t => t.status === "completed").length;
    const overdue = deptTickets.filter(t => t.overdue).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { dep, total, completed, overdue, rate };
  });

  document.getElementById("reportTableBody").innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.dep.nameTh}</strong></td>
      <td>${r.total}</td>
      <td>${r.completed}</td>
      <td>${r.overdue > 0 ? `<span class="hwms-badge hwms-badge-danger">${r.overdue}</span>` : "0"}</td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="progress flex-grow-1" style="height:6px; max-width:100px;">
            <div class="progress-bar bg-success" style="width:${r.rate}%;"></div>
          </div>
          <span style="font-size:12px; font-weight:700;">${r.rate}%</span>
        </div>
      </td>
    </tr>
  `).join("");
}

/** Export ข้อมูลรายงานปัจจุบัน (ตามตัวกรอง) เป็นไฟล์ Excel จริงด้วย SheetJS */
function exportToExcel() {
  const tickets = getFilteredReportTickets();

  if (tickets.length === 0) {
    Swal.fire({ icon: "warning", title: "ไม่มีข้อมูล", text: "ไม่พบข้อมูลตามเงื่อนไขที่เลือก ลองปรับตัวกรองใหม่", confirmButtonColor: "#2563EB" });
    return;
  }

  // ชีตที่ 1: รายการ ticket ทั้งหมด
  const rows = tickets.map(t => ({
    "เลขที่ Ticket": t.ticketNo,
    "เรื่อง": t.subject,
    "แผนก": getDepartmentName(t.department),
    "ประเภทงาน": getCategoryName(t.category),
    "สถานที่": t.location,
    "ผู้แจ้ง": t.requesterName,
    "ผู้รับผิดชอบ": t.assigneeName,
    "ความสำคัญ": getPriorityInfo(t.priority).labelTh,
    "สถานะ": getStatusInfo(t.status).labelTh,
    "เกินกำหนด": t.overdue ? "ใช่" : "ไม่",
    "วันที่แจ้ง": formatThaiDateTime(t.createdDate),
    "กำหนดเสร็จ": formatThaiDateTime(t.dueDate)
  }));
  const sheet1 = XLSX.utils.json_to_sheet(rows);
  sheet1["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 20 }));

  // ชีตที่ 2: สรุปตามแผนก
  const db = getDB();
  const summaryRows = db.departments.map(dep => {
    const deptTickets = tickets.filter(t => t.department === dep.id);
    const total = deptTickets.length;
    const completed = deptTickets.filter(t => t.status === "completed").length;
    const overdue = deptTickets.filter(t => t.overdue).length;
    return {
      "แผนก": dep.nameTh,
      "งานทั้งหมด": total,
      "งานเสร็จสิ้น": completed,
      "งานเกินกำหนด": overdue,
      "อัตราความสำเร็จ (%)": total > 0 ? Math.round((completed / total) * 100) : 0
    };
  });
  const sheet2 = XLSX.utils.json_to_sheet(summaryRows);
  sheet2["!cols"] = Object.keys(summaryRows[0]).map(() => ({ wch: 20 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet1, "รายการงาน");
  XLSX.utils.book_append_sheet(workbook, sheet2, "สรุปตามแผนก");

  const fileName = `HWMS_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  showToast("Export Excel สำเร็จ");
}

/**
 * Export ข้อมูลรายงานเป็น PDF โดยเปิดหน้าต่างพิมพ์ของเบราว์เซอร์เอง (window.print())
 * แล้วให้ผู้ใช้เลือก "Save as PDF" เป็นปลายทางพิมพ์
 * ใช้วิธีนี้แทน library สร้าง PDF ตรง ๆ เพราะฟอนต์ไทยจะเพี้ยน/ไม่แสดงผลถ้าไม่ฝังฟอนต์เอง
 * แต่การพิมพ์ผ่านเบราว์เซอร์ใช้ฟอนต์ที่หน้าเว็บโหลดอยู่แล้วจึงแสดงภาษาไทยถูกต้อง 100%
 */
function exportToPDF() {
  const tickets = getFilteredReportTickets();

  if (tickets.length === 0) {
    Swal.fire({ icon: "warning", title: "ไม่มีข้อมูล", text: "ไม่พบข้อมูลตามเงื่อนไขที่เลือก ลองปรับตัวกรองใหม่", confirmButtonColor: "#2563EB" });
    return;
  }

  const rowsHtml = tickets.map(t => `
    <tr>
      <td>${t.ticketNo}</td>
      <td>${t.subject}</td>
      <td>${getDepartmentName(t.department)}</td>
      <td>${t.assigneeName}</td>
      <td>${getPriorityInfo(t.priority).labelTh}</td>
      <td>${getStatusInfo(t.status).labelTh}</td>
      <td>${formatThaiDateTime(t.createdDate)}</td>
    </tr>
  `).join("");

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>รายงาน HWMS</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: "Noto Sans Thai", sans-serif; padding: 30px; color: #0F172A; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #64748B; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #CBD5E1; padding: 6px 8px; text-align: left; }
        th { background: #F1F5F9; }
      </style>
    </head>
    <body>
      <h1>รายงานสรุปงานแจ้งซ่อม - Hotel Work Management System</h1>
      <div class="meta">พิมพ์เมื่อ ${formatThaiDateTime(new Date())} • ทั้งหมด ${tickets.length} รายการ</div>
      <table>
        <thead>
          <tr>
            <th>เลขที่ Ticket</th><th>เรื่อง</th><th>แผนก</th><th>ผู้รับผิดชอบ</th>
            <th>ความสำคัญ</th><th>สถานะ</th><th>วันที่แจ้ง</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <script>
        window.onload = function () { setTimeout(function () { window.print(); }, 300); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
