/**
 * =========================================================
 *  dashboard.js
 *  Hotel Work Management System (HWMS)
 *  --------------------------------------------------------
 *  โลจิกเฉพาะหน้า Dashboard: การ์ดสรุปสถานะ, กราฟ, ตารางงานล่าสุด
 * =========================================================
 */

let dashboardCharts = {};

document.addEventListener("DOMContentLoaded", async function () {
  const user = await initLayout("dashboard", "Dashboard");
  if (!user) return;
  const tickets = getAllTickets();

  renderStatCards(tickets);
  renderMonthlyChart(tickets);
  renderCategoryChart(tickets);
  renderDepartmentChart(tickets);
  renderRecentTickets(tickets);

  // รีเฟรชหน้า Dashboard อัตโนมัติเมื่อมีงานใหม่/มีการอัปเดตแบบเรียลไทม์
  document.addEventListener("hwms:ticketsUpdated", function () {
    const latest = getAllTickets();
    renderStatCards(latest);
    renderMonthlyChart(latest);
    renderCategoryChart(latest);
    renderDepartmentChart(latest);
    renderRecentTickets(latest);
  });
});

/** คำนวณและแสดงการ์ดสรุปสถานะงานทั้ง 4 ประเภท */
function renderStatCards(tickets) {
  const newCount = tickets.filter(t => t.status === "new").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress" || t.status === "accepted").length;
  const completedCount = tickets.filter(t => t.status === "completed").length;
  const overdueCount = tickets.filter(t => t.overdue).length;

  const cards = [
    { label: "งานใหม่", value: newCount, icon: "fa-inbox", color: "primary" },
    { label: "กำลังดำเนินการ", value: inProgressCount, icon: "fa-spinner", color: "warning" },
    { label: "งานเสร็จสิ้น", value: completedCount, icon: "fa-circle-check", color: "success" },
    { label: "งานเกินกำหนด", value: overdueCount, icon: "fa-triangle-exclamation", color: "danger" }
  ];

  const row = document.getElementById("statCardsRow");
  row.innerHTML = cards.map(c => `
    <div class="col-6 col-lg-3">
      <div class="hwms-card hwms-stat-card">
        <div class="hwms-stat-icon hwms-badge-${c.color}">
          <i class="fa-solid ${c.icon}"></i>
        </div>
        <div>
          <div class="hwms-stat-value">${c.value}</div>
          <div class="hwms-stat-label">${c.label}</div>
        </div>
      </div>
    </div>
  `).join("");
}

/** สร้างกราฟแท่ง/เส้นแสดงจำนวนงานย้อนหลัง 6 เดือน */
function renderMonthlyChart(tickets) {
  const months = [];
  const counts = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
    months.push(label);
    const count = tickets.filter(t => {
      const td = new Date(t.createdDate);
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
    }).length;
    counts.push(count);
  }

  const ctx = document.getElementById("monthlyChart");
  if (dashboardCharts.monthly) dashboardCharts.monthly.destroy();
  dashboardCharts.monthly = new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        label: "จำนวนงาน",
        data: counts,
        borderColor: "#2563EB",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: "#2563EB",
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "#F1F5F9" } },
        x: { grid: { display: false } }
      }
    }
  });
}

/** สร้างกราฟโดนัทแสดงสัดส่วนงานตามประเภท */
function renderCategoryChart(tickets) {
  const categories = getDB().categories;
  const counts = categories.map(c => tickets.filter(t => t.category === c.id).length);

  const ctx = document.getElementById("categoryChart");
  if (dashboardCharts.category) dashboardCharts.category.destroy();
  dashboardCharts.category = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: categories.map(c => c.nameTh),
      datasets: [{
        data: counts,
        backgroundColor: ["#2563EB", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: "65%",
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }
    }
  });
}

/** สร้างกราฟแท่งแนวนอนแสดงจำนวนงานตามแผนก */
function renderDepartmentChart(tickets) {
  const departments = getDB().departments;
  const counts = departments.map(d => tickets.filter(t => t.department === d.id).length);

  const ctx = document.getElementById("departmentChart");
  if (dashboardCharts.department) dashboardCharts.department.destroy();
  dashboardCharts.department = new Chart(ctx, {
    type: "bar",
    data: {
      labels: departments.map(d => d.nameTh),
      datasets: [{
        label: "จำนวนงาน",
        data: counts,
        backgroundColor: "#60A5FA",
        borderRadius: 6,
        maxBarThickness: 34
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: "#F1F5F9" } },
        x: { grid: { display: false } }
      }
    }
  });
}

/** แสดงตารางงานล่าสุด 10 รายการ */
function renderRecentTickets(tickets) {
  const recent = tickets.slice(0, 10);
  const tbody = document.getElementById("recentTicketsBody");

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="hwms-empty-state"><i class="fa-regular fa-folder-open"></i><div>ยังไม่มีรายการงาน</div></td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(t => `
    <tr>
      <td><a class="hwms-ticket-link" href="ticket-detail.html?id=${t.id}">${t.ticketNo}</a></td>
      <td>${t.subject}</td>
      <td>${getDepartmentName(t.department)}</td>
      <td>${t.assigneeName}</td>
      <td>${renderPriorityBadge(t.priority)}</td>
      <td>${renderStatusBadge(t.status)}</td>
      <td>${formatThaiDateTime(t.createdDate)}</td>
    </tr>
  `).join("");
}
