/**
 * =========================================================
 *  reports.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  โลจิกหน้า "รายงาน": ตัวกรอง, การ์ดสรุป, กราฟ, ตารางสรุปตามแผนก,
 *  และปุ่ม Export (Mock)
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

  document.getElementById("exportExcelBtn").addEventListener("click", () => mockExport("Excel"));
  document.getElementById("exportPdfBtn").addEventListener("click", () => mockExport("PDF"));
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

  // สัดส่วนสถานะ
  const statusCounts = db.statuses.map(s => tickets.filter(t => t.status === s.id).length);
  reportCharts.status = new Chart(document.getElementById("reportStatusChart"), {
    type: "pie",
    data: {
      labels: db.statuses.map(s => s.labelTh),
      datasets: [{
        data: statusCounts,
        backgroundColor: ["#2563EB", "#06B6D4", "#F59E0B", "#94A3B8", "#22C55E", "#EF4444"],
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

/** จำลองการ Export รายงาน (Excel / PDF) */
function mockExport(type) {
  showLoading();
  setTimeout(() => {
    hideLoading();
    Swal.fire({
      icon: "success",
      title: `Export ${type} สำเร็จ`,
      text: `ระบบได้สร้างไฟล์รายงานในรูปแบบ ${type} เรียบร้อยแล้ว (ตัวอย่างจำลอง)`,
      confirmButtonColor: "#2563EB"
    });
  }, 900);
}
