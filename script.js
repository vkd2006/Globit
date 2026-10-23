// ---------- Data layer (localStorage with fallback) ----------
const KEY = "equip_logistics_v1";
let db = { employees: [], requests: [], seq: 1 };
try { const s = localStorage.getItem(KEY); if (s) db = JSON.parse(s); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
const uid = p => p + "-" + String(db.seq++).padStart(4, "0");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const emp = id => db.employees.find(e => e.id === id);
const today = () => new Date().toISOString().slice(0, 10);

const SHIP = ["Not shipped", "Packed", "Shipped", "In transit", "Customs", "Out for delivery", "Delivered"];
const RET = ["Requested", "Label sent", "In transit", "Received", "Inspected"];

// ---------- Navigation ----------
const tabs = { employees: "1. Employees", procurement: "2. Procurement", assets: "3. Asset Tracking", shipments: "4. Shipments", offboarding: "5. Offboarding" };
let tab = "employees";
function render() {
  document.getElementById("nav").innerHTML = Object.entries(tabs)
    .map(([k, v]) => `<button class="${k === tab ? "on" : ""}" onclick="tab='${k}';render()">${v}</button>`).join("");
  document.getElementById("app").innerHTML = views[tab]();
}

const input = (id, label, type = "text", req = true) =>
  `<div><label>${label}</label><input id="${id}" type="${type}" ${req ? "required" : ""}></div>`;
const val = id => document.getElementById(id).value.trim();
const tag = s => `<span class="tag ${esc(s)}">${esc(s)}</span>`;
const table = (heads, rows) => rows.length
  ? `<div class="wrap"><table><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr>${rows.join("")}</table></div>`
  : `<div class="empty">Nothing here yet.</div>`;

// ---------- Views ----------
const views = {
  // 1. Employee management
  employees() {
    return `<div class="card"><h2>Add remote employee</h2>
    <form onsubmit="addEmployee(event)">
      ${input("n", "Full name")}${input("em", "Email", "email")}
      ${input("co", "Country")}${input("ci", "City")}
      ${input("ad", "Shipping address")}
      <div style="align-self:end"><button class="btn">Add employee</button></div>
    </form></div>
    <div class="card"><h2>Employees (${db.employees.length})</h2>
    ${table(["ID", "Name", "Email", "Location", "Address", ""], db.employees.map(e =>
      `<tr><td>${e.id}</td><td>${esc(e.name)}</td><td>${esc(e.email)}</td><td>${esc(e.city)}, ${esc(e.country)}</td><td>${esc(e.address)}</td>
       <td><button class="btn r s" onclick="delEmployee('${e.id}')">Delete</button></td></tr>`))}</div>`;
  },

  // 2. Laptop procurement
  procurement() {
    const opts = db.employees.map(e => `<option value="${e.id}">${esc(e.name)} (${esc(e.country)})</option>`).join("");
    return `<div class="card"><h2>Request a laptop</h2>
    ${db.employees.length ? `<form onsubmit="addRequest(event)">
      <div><label>Employee</label><select id="rq_e">${opts}</select></div>
      <div><label>Model</label><select id="rq_m"><option>MacBook Pro 14"</option><option>MacBook Air 13"</option><option>Dell XPS 15</option><option>ThinkPad T14</option></select></div>
      ${input("rq_r", "Reason / notes", "text", false)}
      <div style="align-self:end"><button class="btn">Submit request</button></div>
    </form>` : `<div class="empty">Add an employee first.</div>`}</div>
    <div class="card"><h2>Requests</h2>
    ${table(["ID", "Employee", "Model", "Reason", "Date", "Status", "Action"], db.requests.map(r =>
      `<tr><td>${r.id}</td><td>${esc(emp(r.empId)?.name || "(removed)")}</td><td>${esc(r.model)}</td><td>${esc(r.reason)}</td><td>${r.date}</td><td>${tag(r.status)}</td>
      <td>${r.status === "Pending" ? `<button class="btn g s" onclick="decide('${r.id}',true)">Approve</button> <button class="btn r s" onclick="decide('${r.id}',false)">Reject</button>` : ""}</td></tr>`))}</div>`;
  },

  // 3. Asset tracking
  assets() {
    const rows = db.requests.filter(r => r.assetTag).map(r =>
      `<tr><td>${r.assetTag}</td><td>${esc(r.model)}</td><td>${esc(emp(r.empId)?.name || "(removed)")}</td>
       <td>${esc(emp(r.empId)?.country || "")}</td><td>${tag(r.ret ? (r.ret.status === "Inspected" ? "Returned" : "Returning") : r.ship.status === "Delivered" ? "Assigned" : "In logistics")}</td></tr>`);
    return `<div class="card"><h2>Laptop ↔ employee assignments</h2>
    ${table(["Asset tag", "Model", "Assigned to", "Country", "State"], rows)}</div>`;
  },

  // 4. Shipment tracking
  shipments() {
    const rows = db.requests.filter(r => r.assetTag).map(r => {
      const i = SHIP.indexOf(r.ship.status);
      return `<tr><td>${r.assetTag}<br><small>${esc(emp(r.empId)?.name || "")}</small></td>
        <td><select onchange="setShip('${r.id}',this.value)">${SHIP.map(s => `<option ${s === r.ship.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        <div class="steps">${SHIP.map((_, k) => `<i class="${k <= i && i > 0 ? "d" : ""}"></i>`).join("")}</div></td>
        <td><input value="${esc(r.ship.carrier)}" placeholder="Carrier" onchange="setField('${r.id}','carrier',this.value)"></td>
        <td><input value="${esc(r.ship.tracking)}" placeholder="Tracking no." onchange="setField('${r.id}','tracking',this.value)"></td></tr>`;
    });
    return `<div class="card"><h2>Shipment status (manual entry)</h2>
    ${table(["Asset / employee", "Status", "Carrier", "Tracking #"], rows)}</div>`;
  },

  // 5. Offboarding
  offboarding() {
    const out = db.requests.filter(r => r.assetTag && !r.ret && r.ship.status === "Delivered");
    const rets = db.requests.filter(r => r.ret);
    return `<div class="card"><h2>Laptops eligible for return</h2>
    ${table(["Asset", "Employee", ""], out.map(r =>
      `<tr><td>${r.assetTag} – ${esc(r.model)}</td><td>${esc(emp(r.empId)?.name || "")}</td>
       <td><button class="btn s" onclick="startReturn('${r.id}')">Request return</button></td></tr>`))}</div>
    <div class="card"><h2>Return / recovery status</h2>
    ${table(["Asset", "Employee", "Status", "Date"], rets.map(r =>
      `<tr><td>${r.assetTag}</td><td>${esc(emp(r.empId)?.name || "")}</td>
       <td><select onchange="setRet('${r.id}',this.value)">${RET.map(s => `<option ${s === r.ret.status ? "selected" : ""}>${s}</option>`).join("")}</select></td><td>${r.ret.date}</td></tr>`))}</div>`;
  }
};

// ---------- Actions ----------
function addEmployee(ev) {
  ev.preventDefault();
  db.employees.push({ id: uid("EMP"), name: val("n"), email: val("em"), country: val("co"), city: val("ci"), address: val("ad") });
  save(); render();
}
function delEmployee(id) {
  if (db.requests.some(r => r.empId === id && !(r.ret && r.ret.status === "Inspected")) &&
      !confirm("This employee has active equipment. Delete anyway?")) return;
  db.employees = db.employees.filter(e => e.id !== id); save(); render();
}
function addRequest(ev) {
  ev.preventDefault();
  db.requests.push({ id: uid("REQ"), empId: val("rq_e"), model: val("rq_m"), reason: val("rq_r"), date: today(), status: "Pending",
    assetTag: null, ship: { status: "Not shipped", carrier: "", tracking: "" }, ret: null });
  save(); render();
}
function decide(id, ok) {
  const r = db.requests.find(x => x.id === id);
  r.status = ok ? "Approved" : "Rejected";
  if (ok) r.assetTag = uid("LAP");
  save(); render();
}
const find = id => db.requests.find(x => x.id === id);
function setShip(id, s) { find(id).ship.status = s; save(); render(); }
function setField(id, f, v) { find(id).ship[f] = v; save(); }
function startReturn(id) { find(id).ret = { status: "Requested", date: today() }; save(); render(); }
function setRet(id, s) { find(id).ret.status = s; save(); render(); }

render();