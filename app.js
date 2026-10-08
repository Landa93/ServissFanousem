/* =========================================================
   ServisSFanoušem
   Kompletní app.js
   ========================================================= */

const SUPABASE_URL = "https://ujtpluckaenrplkfpzgi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5Sf5fpEYUA2Q3dp74c1q3w_XzKRTST7";

const PHOTO_BUCKET = "photos";
const TARGET_BYTES = 200 * 1024;

const sb = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);

let currentUser = null;
let customers = [];
let currentCustomer = null;
let realtimeChannel = null;
let authMode = "login";
let appStarted = false;

/* =========================================================
   Pomocné funkce
   ========================================================= */

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => {
    el.classList.remove("show");
  }, 3200);
}

function fmtDate(value, withTime = false) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(
    "cs-CZ",
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }
  ).format(d);
}

function daysUntil(dateValue) {
  if (!dateValue) return 999999;

  const d = new Date(dateValue + "T00:00:00");

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return Math.ceil((d - now) / 86400000);
}

function nextYearDate() {
  const d = new Date();

  d.setFullYear(d.getFullYear() + 1);

  return d.toISOString().slice(0, 10);
}

function showView(name) {
  [
    "homeView",
    "customersView",
    "calendarView",
    "annualServicesView",
    "doneView",
    "customerFormView",
    "detailView"
  ].forEach(view => {
    const el = $(view);
    if (el) el.classList.add("hidden");
  });

  const target = $(name);

  if (target) {
    target.classList.remove("hidden");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   Přihlášení
   ========================================================= */

function setAuthMode(mode) {
  authMode = mode;

  document
    .querySelectorAll("[data-auth-tab]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.authTab === mode
      );
    });

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      mode === "login"
        ? "Přihlásit"
        : "Vytvořit účet";
  }

  if ($("authPassword")) {
    $("authPassword").autocomplete =
      mode === "login"
        ? "current-password"
        : "new-password";
  }

  if ($("authHint")) {
    $("authHint").textContent =
      mode === "login"
        ? "Přihlášení zůstává uložené v tomto zařízení."
        : "Vytvoř účet e-mailem a heslem.";
  }
}

async function signIn() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  const { error } =
    await sb.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    toast(error.message);
  }
}

async function signUp() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  const { data, error } =
    await sb.auth.signUp({
      email,
      password
    });

  if (error) {
    toast(error.message);
    return;
  }

  if (data.session) {
    toast("Účet vytvořen a přihlášen.");
  } else {
    toast(
      "Účet vytvořen. Potvrď e-mail a potom se přihlas."
    );
  }
}

async function logout() {
  await sb.auth.signOut();

  currentUser = null;
  customers = [];
  currentCustomer = null;

  if (realtimeChannel) {
    await sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  appStarted = false;
}

/* =========================================================
   ZÁKAZNÍCI - NAČTENÍ
   ========================================================= */

async function loadCustomers() {
  if (!currentUser) return;

  const { data, error } = await sb
    .from("customers")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error(
      "CHYBA NAČÍTÁNÍ ZÁKAZNÍKŮ:",
      error
    );

    toast(error.message);
    return;
  }

  customers = Array.isArray(data)
    ? data
    : [];

  ensureServiceViews();

  renderHome();
  renderCustomers();
  renderDone();
  renderAnnualServices();
  renderCalendar();

  if (currentCustomer) {
    const fresh = customers.find(
      c => c.id === currentCustomer.id
    );

    if (fresh) {
      currentCustomer = fresh;
      renderDetail();
    }
  }
}

/* =========================================================
   REALTIME
   ========================================================= */

function subscribeRealtime() {
  if (!currentUser) return;

  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
  }

  realtimeChannel = sb
    .channel("customers-live-" + currentUser.id)

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "customers",
        filter: `user_id=eq.${currentUser.id}`
      },
      async () => {
        await loadCustomers();
      }
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "photos",
        filter: `user_id=eq.${currentUser.id}`
      },
      async () => {
        if (currentCustomer) {
          await renderGallery();
        }
      }
    )

    .subscribe();
}

/* =========================================================
   SERVISNÍ SEKCE
   ========================================================= */

const WORK_START_HOUR = 8;
const WORK_END_HOUR = 17;
const SERVICE_SLOT_MINUTES = 60;

let calendarDate = new Date();
let calendarSelectedDate = null;

function dateKeyLocal(date) {
  const d =
    date instanceof Date
      ? date
      : new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function parseAppointment(value) {
  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? null
    : d;
}

function formatTime(value) {
  const d = parseAppointment(value);

  if (!d) return "—";

  return new Intl.DateTimeFormat(
    "cs-CZ",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(d);
}

function formatDayLong(key) {
  if (!key) return "";

  const d =
    new Date(`${key}T12:00:00`);

  return new Intl.DateTimeFormat(
    "cs-CZ",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  ).format(d);
}

function addAppStyles() {
  if ($("servicePlannerStyles")) return;

  const style =
    document.createElement("style");

  style.id =
    "servicePlannerStyles";

  style.textContent = `
    .planner-nav {
      display:flex;
      gap:8px;
      align-items:center;
      justify-content:space-between;
      margin:12px 0;
      flex-wrap:wrap;
    }

    .planner-month {
      font-size:1.15rem;
      font-weight:700;
      text-transform:capitalize;
    }

    .calendar-grid {
      display:grid;
      grid-template-columns:repeat(7,minmax(0,1fr));
      gap:6px;
    }

    .calendar-weekday {
      text-align:center;
      font-size:.78rem;
      font-weight:700;
      padding:5px 2px;
      opacity:.7;
    }

    .calendar-day {
      min-height:78px;
      border:1px solid rgba(127,127,127,.22);
      border-radius:12px;
      padding:7px;
      background:var(--card,#fff);
      cursor:pointer;
      text-align:left;
    }

    .calendar-day:hover {
      transform:translateY(-1px);
    }

    .calendar-day.empty {
      opacity:.25;
      cursor:default;
    }

    .calendar-day.today {
      outline:2px solid currentColor;
    }

    .calendar-day.selected {
      box-shadow:inset 0 0 0 2px currentColor;
    }

    .calendar-day-number {
      font-weight:700;
    }

    .calendar-count {
      margin-top:7px;
      font-size:.72rem;
      line-height:1.25;
    }

    .calendar-free {
      font-size:.72rem;
      opacity:.75;
    }

    .appointment-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:12px;
      border:1px solid rgba(127,127,127,.22);
      border-radius:12px;
      margin:8px 0;
    }

    .appointment-time {
      font-weight:800;
      min-width:52px;
    }

    .free-slot {
      display:inline-block;
      margin:4px;
      padding:7px 10px;
      border-radius:999px;
      border:1px dashed rgba(80,160,100,.55);
      cursor:pointer;
      font-size:.85rem;
    }

    .done-card {
      border-left:5px solid #24a148;
      background:rgba(36,161,72,.08);
    }

    .done-badge {
      display:inline-block;
      color:#16803c;
      font-weight:800;
      margin-top:4px;
    }

    @media (max-width:600px) {
      .calendar-day {
        min-height:62px;
        padding:5px;
      }

      .calendar-count {
        font-size:.65rem;
      }

      .calendar-weekday {
        font-size:.68rem;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   DYNAMICKÉ VIEWS
   ========================================================= */

function ensureServiceViews() {
  addAppStyles();

  const appView = $("appView");

  if (!appView) return;

  if (!$("calendarView")) {
    const el =
      document.createElement("section");

    el.id = "calendarView";
    el.className = "view hidden";

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h2>📅 Plánovací kalendář</h2>
          <p class="muted">
            Přehled naplánovaných servisů a volných hodin.
          </p>
        </div>

        <button
          type="button"
          class="secondary"
          data-back>
          ← Zpět
        </button>
      </div>

      <div class="planner-nav">
        <button
          type="button"
          class="secondary"
          id="calendarPrev">
          ←
        </button>

        <div
          class="planner-month"
          id="calendarMonth">
        </div>

        <button
          type="button"
          class="secondary"
          id="calendarNext">
          →
        </button>
      </div>

      <div id="calendarGrid"></div>

      <div
        id="calendarDayDetail"
        style="margin-top:16px">
      </div>
    `;

    appView.appendChild(el);

    $("calendarPrev")
      .addEventListener(
        "click",
        () => {
          calendarDate.setMonth(
            calendarDate.getMonth() - 1
          );

          renderCalendar();
        }
      );

    $("calendarNext")
      .addEventListener(
        "click",
        () => {
          calendarDate.setMonth(
            calendarDate.getMonth() + 1
          );

          renderCalendar();
        }
      );
  }

  if (!$("annualServicesView")) {
    const el =
      document.createElement("section");

    el.id =
      "annualServicesView";

    el.className =
      "view hidden";

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h2>🔧 Roční servisy</h2>
          <p class="muted">
            Zákazníci ručně převedení do ročního servisu.
          </p>
        </div>

        <button
          type="button"
          class="secondary"
          data-back>
          ← Zpět
        </button>
      </div>

      <div id="annualServiceList"></div>
    `;

    appView.appendChild(el);
  }

  if (!$("doneView")) {
    const el =
      document.createElement("section");

    el.id =
      "doneView";

    el.className =
      "view hidden";

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h2>✅ Hotové</h2>
          <p class="muted">
            Dokončené opravy a servisy.
          </p>
        </div>

        <button
          type="button"
          class="secondary"
          data-back>
          ← Zpět
        </button>
      </div>

      <div id="doneList"></div>
    `;

    appView.appendChild(el);
  }

  const home =
    $("homeView");

  if (
    home &&
    !$("serviceNavigation")
  ) {
    const nav =
      document.createElement("div");

    nav.id =
      "serviceNavigation";

    nav.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:16px 0;";

    nav.innerHTML = `
      <button
        type="button"
        class="primary"
        id="calendarBtn">
        📅 Kalendář
      </button>

      <button
        type="button"
        class="primary"
        id="annualServicesBtn">
        🔧 Roční servisy
      </button>

      <button
        type="button"
        class="primary"
        id="doneBtn">
        ✅ Hotové
      </button>
    `;

    const first =
      home.firstElementChild;

    if (first) {
      first.insertAdjacentElement(
        "afterend",
        nav
      );
    } else {
      home.appendChild(nav);
    }

    $("calendarBtn")
      .addEventListener(
        "click",
        openCalendar
      );

    $("annualServicesBtn")
      .addEventListener(
        "click",
        openAnnualServices
      );

    $("doneBtn")
      .addEventListener(
        "click",
        openDone
      );
  }
}

function activeCustomers() {
  return customers.filter(
    c => c.status !== "Dokončeno"
  );
}

function completedCustomers() {
  return customers.filter(
    c => c.status === "Dokončeno"
  );
}

/* =========================================================
   HOTOVÉ
   ========================================================= */

function renderDone() {
  ensureServiceViews();

  const list =
    $("doneList");

  if (!list) return;

  const done =
    completedCustomers()
      .sort((a, b) => {
        const aa =
          a.completed_at ||
          a.updated_at ||
          "";

        const bb =
          b.completed_at ||
          b.updated_at ||
          "";

        return String(bb)
          .localeCompare(
            String(aa)
          );
      });

  list.innerHTML =
    done.length
      ? done.map(c => `
          <div class="customer-card done-card">
            <div>
              <h3>${esc(c.full_name)}</h3>

              <p>
                ${esc(c.phone || "")}
                ${
                  c.address
                    ? ` · ${esc(c.address)}`
                    : ""
                }
              </p>

              <span class="done-badge">
                ✓ Hotové
              </span>

              <br>

              <small>
                Dokončeno:
                ${fmtDate(c.completed_at, true)}

                ${
                  c.annual_service_due
                    ? `
                      · další roční servis:
                      ${fmtDate(c.annual_service_due)}
                    `
                    : ""
                }
              </small>
            </div>

            <button
              type="button"
              class="primary"
              data-open-customer="${c.id}">
              Otevřít složku
            </button>
          </div>
        `).join("")
      : `
          <p class="muted">
            Zatím není žádný hotový servis.
          </p>
        `;
}

function openDone() {
  ensureServiceViews();

  renderDone();

  showView("doneView");
}

/* =========================================================
   ROČNÍ SERVISY
   ========================================================= */

function renderAnnualServices() {
  ensureServiceViews();

  const list =
    $("annualServiceList");

  if (!list) return;

  /*
    POZOR:
    Do této sekce se dostanou pouze zákazníci,
    kteří byli RUČNĚ převedeni do ročního servisu.
  */

  const annual =
    customers
      .filter(
        c =>
          c.status === "Dokončeno" &&
          c.annual_service_due
      )
      .sort(
        (a, b) =>
          String(
            a.annual_service_due
          ).localeCompare(
            String(
              b.annual_service_due
            )
          )
      );

  list.innerHTML =
    annual.length
      ? annual.map(c => {
          const days =
            daysUntil(
              c.annual_service_due
            );

          const urgent =
            days <= 14;

          const label =
            days < 0
              ? `po termínu o ${Math.abs(days)} dní`
              : days === 0
              ? "servis je dnes"
              : `za ${days} dní`;

          return `
            <div
              class="customer-card ${
                urgent
                  ? "done-card"
                  : ""
              }">

              <div>
                <h3>
                  ${esc(c.full_name)}
                </h3>

                <p>
                  ${esc(c.phone || "")}
                  ${
                    c.address
                      ? ` · ${esc(c.address)}`
                      : ""
                  }
                </p>

                <small>
                  Roční servis:
                  <b>
                    ${fmtDate(
                      c.annual_service_due
                    )}
                  </b>

                  ·

                  <b>
                    ${esc(label)}
                  </b>
                </small>
              </div>

              <button
                type="button"
                class="primary"
                data-open-customer="${c.id}">
                Otevřít složku
              </button>

            </div>
          `;
        }).join("")
      : `
          <p class="muted">
            Zatím není žádný zákazník převedený
            do ročního servisu.
          </p>
        `;
}

function openAnnualServices() {
  ensureServiceViews();

  renderAnnualServices();

  showView(
    "annualServicesView"
  );
}

/* =========================================================
   KALENDÁŘ
   ========================================================= */

function renderCalendar() {
  ensureServiceViews();

  const monthEl =
    $("calendarMonth");

  const gridEl =
    $("calendarGrid");

  if (!monthEl || !gridEl) {
    return;
  }

  const y =
    calendarDate.getFullYear();

  const m =
    calendarDate.getMonth();

  monthEl.textContent =
    new Intl.DateTimeFormat(
      "cs-CZ",
      {
        month: "long",
        year: "numeric"
      }
    ).format(calendarDate);

  const first =
    new Date(y, m, 1);

  const daysInMonth =
    new Date(
      y,
      m + 1,
      0
    ).getDate();

  const mondayIndex =
    (first.getDay() + 6) % 7;

  const weekdays = [
    "Po",
    "Út",
    "St",
    "Čt",
    "Pá",
    "So",
    "Ne"
  ];

  let html =
    `<div class="calendar-grid">`;

  html += weekdays
    .map(
      d =>
        `<div class="calendar-weekday">${d}</div>`
    )
    .join("");

  for (
    let i = 0;
    i < mondayIndex;
    i++
  ) {
    html +=
      `<div class="calendar-day empty"></div>`;
  }

  const todayKey =
    dateKeyLocal(
      new Date()
    );

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    const d =
      new Date(
        y,
        m,
        day
      );

    const key =
      dateKeyLocal(d);

    /*
      Dokončené servisy už v plánovacím
      kalendáři nezabíráme.
    */

    const appointments =
      customers
        .filter(
          c =>
            c.status !== "Dokončeno" &&
            c.appointment_at &&
            dateKeyLocal(
              new Date(
                c.appointment_at
              )
            ) === key
        )
        .sort(
          (a, b) =>
            new Date(
              a.appointment_at
            ) -
            new Date(
              b.appointment_at
            )
        );

    const totalSlots =
      (
        (WORK_END_HOUR -
          WORK_START_HOUR) *
        60
      ) /
      SERVICE_SLOT_MINUTES;

    const freeCount =
      Math.max(
        0,
        totalSlots -
          appointments.length
      );

    html += `
      <button
        type="button"
        class="
          calendar-day
          ${
            key === todayKey
              ? "today"
              : ""
          }
          ${
            key === calendarSelectedDate
              ? "selected"
              : ""
          }
        "
        data-calendar-date="${key}">

        <div
          class="calendar-day-number">
          ${day}
        </div>

        <div
          class="calendar-count">

          ${
            appointments.length
              ? `
                📌 ${appointments.length}
                servis${
                  appointments.length === 1
                    ? ""
                    : "y"
                }
              `
              : "—"
          }

        </div>

        <div
          class="calendar-free">
          volno: ${freeCount} h
        </div>

      </button>
    `;
  }

  html +=
    `</div>`;

  gridEl.innerHTML =
    html;

  document
    .querySelectorAll(
      "[data-calendar-date]"
    )
    .forEach(btn => {
      btn.addEventListener(
        "click",
        () => {
          calendarSelectedDate =
            btn.dataset.calendarDate;

          renderCalendar();

          renderCalendarDay(
            calendarSelectedDate
          );
        }
      );
    });

  if (calendarSelectedDate) {
    const selectedMonth =
      calendarSelectedDate.slice(
        0,
        7
      );

    const currentMonth =
      `${y}-${String(
        m + 1
      ).padStart(2, "0")}`;

    if (
      selectedMonth ===
      currentMonth
    ) {
      renderCalendarDay(
        calendarSelectedDate
      );
    }
  }
}
function renderCalendarDay(key) {
  const el =
    $("calendarDayDetail");

  if (!el) return;

  const appointments =
    customers
      .filter(
        c =>
          c.status !== "Dokončeno" &&
          c.appointment_at &&
          dateKeyLocal(
            new Date(
              c.appointment_at
            )
          ) === key
      )
      .sort(
        (a, b) =>
          new Date(
            a.appointment_at
          ) -
          new Date(
            b.appointment_at
          )
      );

  const occupiedHours =
    new Set(
      appointments.map(c => {
        const d =
          new Date(
            c.appointment_at
          );

        return `${String(
          d.getHours()
        ).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
      })
    );

  const free = [];

  for (
    let hour =
      WORK_START_HOUR;
    hour < WORK_END_HOUR;
    hour++
  ) {
    const time =
      `${String(hour).padStart(
        2,
        "0"
      )}:00`;

    if (
      !occupiedHours.has(
        time
      )
    ) {
      free.push(time);
    }
  }

  el.innerHTML = `
    <div>
      <h3>
        📅 ${esc(
          formatDayLong(key)
        )}
      </h3>

      <p class="muted">
        Naplánováno:
        <b>${appointments.length}</b>

        ·

        Volné hodinové sloty:
        <b>${free.length}</b>
      </p>
    </div>

    <div>
      <h4>
        Naplánované servisy
      </h4>

      ${
        appointments.length
          ? appointments
              .map(
                c => `
                  <div
                    class="appointment-row">

                    <div
                      class="appointment-time">
                      ${esc(
                        formatTime(
                          c.appointment_at
                        )
                      )}
                    </div>

                    <div
                      style="flex:1">

                      <strong>
                        ${esc(
                          c.full_name
                        )}
                      </strong>

                      <div
                        class="muted">
                        ${esc(
                          c.address ||
                            ""
                        )}
                      </div>

                    </div>

                    <button
                      type="button"
                      class="primary"
                      data-open-customer="${c.id}">
                      Otevřít
                    </button>

                  </div>
                `
              )
              .join("")
          : `
              <p class="muted">
                Na tento den není nic naplánováno.
              </p>
            `
      }
    </div>

    <div
      style="margin-top:14px">

      <h4>
        Volné kapacity
      </h4>

      ${
        free.length
          ? free
              .map(
                t => `
                  <button
                    type="button"
                    class="free-slot"
                    data-free-time="${key}T${t}">
                    ${t}
                  </button>
                `
              )
              .join("")
          : `
              <p class="muted">
                Tento den je plně obsazený.
              </p>
            `
      }

      <p
        class="muted"
        style="margin-top:8px">

        Kapacita je zatím počítána jako
        1 servis = 1 hodina,
        pracovní doba
        ${WORK_START_HOUR}:00–${WORK_END_HOUR}:00.

      </p>
    </div>
  `;

  el
    .querySelectorAll(
      "[data-free-time]"
    )
    .forEach(btn => {
      btn.addEventListener(
        "click",
        () => {
          openNewCustomerAt(
            btn.dataset.freeTime
          );
        }
      );
    });
}

function openCalendar() {
  ensureServiceViews();

  renderCalendar();

  showView(
    "calendarView"
  );
}

function openNewCustomerAt(
  value
) {
  showView(
    "customerFormView"
  );

  const input =
    $("appointmentAt");

  if (!input) return;

  const d =
    new Date(value);

  const pad =
    n =>
      String(n).padStart(
        2,
        "0"
      );

  input.value =
    `${d.getFullYear()}-${pad(
      d.getMonth() + 1
    )}-${pad(
      d.getDate()
    )}T${pad(
      d.getHours()
    )}:${pad(
      d.getMinutes()
    )}`;

  input.focus();
}

/* =========================================================
   DOMOV
   ========================================================= */

function renderHome() {
  /*
    Roční servis se počítá podle annual_service_due,
    nikoliv podle statusu.
    
    Díky tomu může být zákazník současně:
    - v Hotové
    - a v Ročních servisech
  */

  const due =
    customers
      .filter(
        c =>
          c.annual_service_due
      )
      .filter(
        c =>
          daysUntil(
            c.annual_service_due
          ) <= 14
      );

  if ($("reminderCount")) {
    $("reminderCount").textContent =
      due.length;
  }

  if ($("reminders")) {
    $("reminders").innerHTML =
      due.length
        ? due
            .sort(
              (a, b) =>
                a.annual_service_due.localeCompare(
                  b.annual_service_due
                )
            )
            .map(c => {
              const days =
                daysUntil(
                  c.annual_service_due
                );

              const text =
                days < 0
                  ? `po termínu o ${Math.abs(days)} dní`
                  : days === 0
                  ? "dnes"
                  : `za ${days} dní`;

              return `
                <div
                  class="
                    reminder
                    ${
                      days < 0
                        ? "overdue"
                        : ""
                    }
                  ">

                  <div>
                    <strong>
                      ${esc(
                        c.full_name
                      )}
                    </strong>

                    <span>
                      ${esc(
                        c.phone || ""
                      )}
                      ·
                      ${esc(
                        c.address || ""
                      )}
                    </span>

                    <br>

                    <small>
                      Roční servis:
                      ${fmtDate(
                        c.annual_service_due
                      )}
                      —
                      <b>
                        ${text}
                      </b>
                    </small>
                  </div>

                  <button
                    class="primary"
                    data-open-customer="${c.id}">
                    Otevřít
                  </button>

                </div>
              `;
            })
            .join("")
        : `
            <p class="muted">
              Žádný roční servis není do 14 dní.
            </p>
          `;
  }

  const planned =
    customers.filter(
      c =>
        c.status !== "Dokončeno"
    ).length;

  const done =
    customers.filter(
      c =>
        c.status === "Dokončeno"
    ).length;

  if ($("totalCustomers")) {
    $("totalCustomers").textContent =
      customers.length;
  }

  if ($("activeCustomers")) {
    $("activeCustomers").textContent =
      planned;
  }

  if ($("doneCustomers")) {
    $("doneCustomers").textContent =
      done;
  }
}

/* =========================================================
   SEZNAM ZÁKAZNÍKŮ
   ========================================================= */

function renderCustomers() {
  const list =
    $("customersList");

  if (!list) return;

  const search =
    (
      $("customerSearch")?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const filtered =
    activeCustomers()
      .filter(c => {
        if (!search) {
          return true;
        }

        return [
          c.full_name,
          c.phone,
          c.email,
          c.address,
          c.problem
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

  list.innerHTML =
    filtered.length
      ? filtered
          .map(
            c => `
              <div
                class="customer-card">

                <div>
                  <h3>
                    ${esc(
                      c.full_name
                    )}
                  </h3>

                  <p>
                    ${esc(
                      c.phone || ""
                    )}
                  </p>

                  <small>
                    ${
                      c.appointment_at
                        ? `Servis:
                            ${fmtDate(
                              c.appointment_at,
                              true
                            )}`
                        : "Termín není nastaven"
                    }
                  </small>
                </div>

                <button
                  type="button"
                  class="primary"
                  data-open-customer="${c.id}">
                  Otevřít
                </button>

              </div>
            `
          )
          .join("")
      : `
          <p class="muted">
            Žádní aktivní zákazníci.
          </p>
        `;
}

/* =========================================================
   DETAIL ZÁKAZNÍKA
   ========================================================= */

function ensureAnnualTransferButton() {
  let button =
    $("transferAnnualBtn");

  if (button) {
    return button;
  }

  const completeButton =
    $("completeBtn");

  const parent =
    completeButton?.parentElement ||
    $("detailView");

  if (!parent) {
    return null;
  }

  button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.id =
    "transferAnnualBtn";

  button.className =
    "primary hidden";

  button.textContent =
    "🔧 Převést na roční servis";

  button.style.marginTop =
    "10px";

  button.addEventListener(
    "click",
    transferToAnnualService
  );

  if (
    completeButton &&
    completeButton.parentElement ===
      parent
  ) {
    completeButton.insertAdjacentElement(
      "afterend",
      button
    );
  } else {
    parent.appendChild(
      button
    );
  }

  return button;
}

function renderDetail() {
  const c =
    currentCustomer;

  if (!c) return;

  if ($("detailTitle")) {
    $("detailTitle").textContent =
      c.full_name;
  }

  if ($("detailStatus")) {
    $("detailStatus").innerHTML = `
      <span
        class="status ${
          c.status === "Dokončeno"
            ? "done"
            : "planned"
        }">

        ${esc(
          c.status || ""
        )}

      </span>
    `;
  }

  if ($("detailPhone")) {
    $("detailPhone").textContent =
      c.phone || "—";

    $("detailPhone").href =
      c.phone
        ? `tel:${c.phone}`
        : "#";
  }

  if ($("detailEmail")) {
    $("detailEmail").textContent =
      c.email || "—";

    $("detailEmail").href =
      c.email
        ? `mailto:${c.email}`
        : "#";
  }

  if ($("detailAddress")) {
    $("detailAddress").textContent =
      c.address || "—";
  }

  if ($("detailProblem")) {
    $("detailProblem").textContent =
      c.problem || "—";
  }

  if ($("detailAppointment")) {
    $("detailAppointment").textContent =
      fmtDate(
        c.appointment_at,
        true
      );
  }

  if ($("detailAnnual")) {
    $("detailAnnual").textContent =
      fmtDate(
        c.annual_service_due
      );
  }

  if ($("completeBtn")) {
    $("completeBtn")
      .classList.toggle(
        "hidden",
        c.status ===
          "Dokončeno"
      );
  }

  const annualButton =
    ensureAnnualTransferButton();

  if (annualButton) {
    const canTransfer =
      c.status ===
        "Dokončeno" &&
      !c.annual_service_due;

    annualButton.classList.toggle(
      "hidden",
      !canTransfer
    );

    if (
      c.annual_service_due
    ) {
      annualButton.textContent =
        `✓ Roční servis aktivní — ${fmtDate(
          c.annual_service_due
        )}`;

      annualButton.classList.remove(
        "hidden"
      );

      annualButton.disabled =
        true;
    } else {
      annualButton.textContent =
        "🔧 Převést na roční servis";

      annualButton.disabled =
        false;
    }
  }
}

async function openCustomer(id) {
  const customer =
    customers.find(
      c => c.id === id
    );

  if (!customer) {
    toast(
      "Zákazník nebyl nalezen."
    );
    return;
  }

  currentCustomer =
    customer;

  renderDetail();

  showView(
    "detailView"
  );

  await renderGallery();
}

/* =========================================================
   ÚPRAVA ZÁKAZNÍKA
   ========================================================= */

async function editCustomer() {
  if (!currentCustomer) {
    return;
  }

  const fields = [
    [
      "Jméno a příjmení",
      currentCustomer.full_name
    ],
    [
      "Telefon",
      currentCustomer.phone || ""
    ],
    [
      "E-mail",
      currentCustomer.email || ""
    ],
    [
      "Adresa",
      currentCustomer.address || ""
    ],
    [
      "Popis problému",
      currentCustomer.problem || ""
    ]
  ];

  const values = [];

  for (
    const [label, value]
    of fields
  ) {
    const result =
      prompt(
        label,
        value
      );

    if (
      result === null
    ) {
      return;
    }

    values.push(
      result
    );
  }

  const patch = {
    full_name:
      values[0],

    phone:
      values[1],

    email:
      values[2],

    address:
      values[3],

    problem:
      values[4]
  };

  const {
    data,
    error
  } =
    await sb
      .from("customers")
      .update(patch)
      .eq(
        "id",
        currentCustomer.id
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .select()
      .single();

  if (error) {
    toast(
      error.message
    );
    return;
  }

  currentCustomer =
    data;

  const index =
    customers.findIndex(
      c =>
        c.id ===
        data.id
    );

  if (
    index !== -1
  ) {
    customers[index] =
      data;
  }

  renderHome();
  renderCustomers();
  renderDone();
  renderAnnualServices();
  renderCalendar();
  renderDetail();

  toast(
    "Změny uloženy."
  );
}
/* =========================================================
   SMAZÁNÍ ZÁKAZNÍKA
   ========================================================= */

async function deleteCustomer() {
  if (
    !currentCustomer ||
    !currentUser
  ) {
    return;
  }

  const confirmed =
    confirm(
      `Opravdu chcete smazat zákazníka ${currentCustomer.full_name}?\n\nSmaže se zákazník i všechny jeho fotografie. Tuto akci nelze vrátit.`
    );

  if (!confirmed) {
    return;
  }

  const customerId =
    currentCustomer.id;

  const {
    data: photos,
    error: photosError
  } =
    await sb
      .from("photos")
      .select("path")
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "user_id",
        currentUser.id
      );

  if (photosError) {
    toast(
      photosError.message
    );
    return;
  }

  if (
    photos &&
    photos.length
  ) {
    const paths =
      photos.map(
        photo =>
          photo.path
      );

    const {
      error: storageError
    } =
      await sb.storage
        .from(
          PHOTO_BUCKET
        )
        .remove(paths);

    if (storageError) {
      toast(
        storageError.message
      );
      return;
    }
  }

  const {
    error: dbPhotosError
  } =
    await sb
      .from("photos")
      .delete()
      .eq(
        "customer_id",
        customerId
      )
      .eq(
        "user_id",
        currentUser.id
      );

  if (dbPhotosError) {
    toast(
      dbPhotosError.message
    );
    return;
  }

  const { error } =
    await sb
      .from("customers")
      .delete()
      .eq(
        "id",
        customerId
      )
      .eq(
        "user_id",
        currentUser.id
      );

  if (error) {
    toast(
      error.message
    );
    return;
  }

  customers =
    customers.filter(
      c =>
        c.id !==
        customerId
    );

  currentCustomer =
    null;

  renderHome();
  renderCustomers();
  renderDone();
  renderAnnualServices();
  renderCalendar();

  showView(
    "customersView"
  );

  toast(
    "Zákazník byl smazán."
  );
}

/* =========================================================
   DOKONČENÍ OPRAVY
   ========================================================= */

async function completeRepair() {
  if (!currentCustomer) {
    return;
  }

  const confirmed =
    confirm(
      `Označit opravu ${currentCustomer.full_name} jako dokončenou?\n\nRoční servis se nyní NEVYTVOŘÍ. Pokud ho budeš chtít, později použiješ tlačítko „Převést na roční servis“.`
    );

  if (!confirmed) {
    return;
  }

  /*
    TADY JE DŮLEŽITÁ ZMĚNA:

    Dokončení opravy pouze nastaví:
    - Dokončeno
    - datum dokončení

    annual_service_due se zde vůbec nenastavuje.
  */

  const {
    data,
    error
  } =
    await sb
      .from("customers")
      .update({
        status:
          "Dokončeno",

        completed_at:
          new Date()
            .toISOString(),

        updated_at:
          new Date()
            .toISOString()
      })
      .eq(
        "id",
        currentCustomer.id
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .select()
      .single();

  if (error) {
    toast(
      error.message
    );
    return;
  }

  currentCustomer =
    data;

  const index =
    customers.findIndex(
      c =>
        c.id ===
        data.id
    );

  if (
    index !== -1
  ) {
    customers[index] =
      data;
  }

  renderHome();
  renderCustomers();
  renderDone();
  renderAnnualServices();
  renderCalendar();
  renderDetail();

  toast(
    "Servis je hotový a přesunul se do záložky Hotové."
  );
}

/* =========================================================
   RUČNÍ PŘEVOD DO ROČNÍHO SERVISU
   ========================================================= */

function annualDueDateForCustomer(
  customer
) {
  /*
    Datum dalšího ročního servisu
    počítáme jeden rok od dokončení.

    Pokud by completed_at chyběl,
    použije se appointment_at.
  */

  const baseValue =
    customer.completed_at ||
    customer.appointment_at ||
    new Date().toISOString();

  const d =
    new Date(
      baseValue
    );

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return nextYearDate();
  }

  d.setFullYear(
    d.getFullYear() + 1
  );

  return d
    .toISOString()
    .slice(0, 10);
}

async function transferToAnnualService() {
  if (!currentCustomer) {
    return;
  }

  if (
    currentCustomer.status !==
    "Dokončeno"
  ) {
    toast(
      "Nejdříve dokonči servis."
    );
    return;
  }

  if (
    currentCustomer.annual_service_due
  ) {
    toast(
      `Roční servis už je nastavený na ${fmtDate(
        currentCustomer.annual_service_due
      )}.`
    );
    return;
  }

  const due =
    annualDueDateForCustomer(
      currentCustomer
    );

  const confirmed =
    confirm(
      `Převést ${currentCustomer.full_name} do ročního servisu?\n\nDalší roční servis bude nastaven na ${fmtDate(due)}.\n\nZákazník zůstane zároveň v záložce Hotové.`
    );

  if (!confirmed) {
    return;
  }

  const {
    data,
    error
  } =
    await sb
      .from("customers")
      .update({
        annual_service_due:
          due,

        updated_at:
          new Date()
            .toISOString()
      })
      .eq(
        "id",
        currentCustomer.id
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .select()
      .single();

  if (error) {
    toast(
      error.message
    );
    return;
  }

  currentCustomer =
    data;

  const index =
    customers.findIndex(
      c =>
        c.id ===
        data.id
    );

  if (
    index !== -1
  ) {
    customers[index] =
      data;
  }

  renderHome();
  renderCustomers();
  renderDone();
  renderAnnualServices();
  renderCalendar();
  renderDetail();

  toast(
    `Převedeno do ročního servisu: ${fmtDate(
      due
    )}.`
  );
}

/* =========================================================
   NOVÝ ZÁKAZNÍK
   ========================================================= */

async function createCustomer(e) {
  e.preventDefault();

  if (!currentUser) {
    toast(
      "Nejste přihlášen."
    );
    return;
  }

  const fullName =
    $("fullName")
      .value
      .trim();

  if (!fullName) {
    toast(
      "Vyplňte jméno zákazníka."
    );
    return;
  }

  const payload = {
    user_id:
      currentUser.id,

    full_name:
      fullName,

    phone:
      $("phone")
        .value
        .trim(),

    email:
      $("email")
        .value
        .trim(),

    address:
      $("address")
        .value
        .trim(),

    problem:
      $("problem")
        .value
        .trim(),

    appointment_at:
      $("appointmentAt").value
        ? new Date(
            $("appointmentAt")
              .value
          ).toISOString()
        : null,

    status:
      "Naplánováno"
  };

  console.log(
    "UKLÁDÁM ZÁKAZNÍKA:",
    payload
  );

  const {
    data,
    error
  } =
    await sb
      .from("customers")
      .insert(payload)
      .select()
      .single();

  if (error) {
    console.error(
      "CHYBA PŘI UKLÁDÁNÍ:",
      error
    );

    toast(
      error.message
    );

    return;
  }

  console.log(
    "NOVÝ ZÁKAZNÍK:",
    data
  );

  customers = [
    data,
    ...customers.filter(
      c =>
        c.id !==
        data.id
    )
  ];

  $("customerForm")
    .reset();

  renderHome();
  renderCustomers();
  renderDone();
  renderAnnualServices();
  renderCalendar();

  currentCustomer =
    data;

  renderDetail();

  showView(
    "detailView"
  );

  await renderGallery();

  toast(
    "Zákazník uložen."
  );
}

/* =========================================================
   FOTOGRAFIE
   ========================================================= */

function fileToImage(
  file
) {
  return new Promise(
    (resolve, reject) => {
      const url =
        URL.createObjectURL(
          file
        );

      const img =
        new Image();

      img.onload = () => {
        URL.revokeObjectURL(
          url
        );

        resolve(img);
      };

      img.onerror =
        reject;

      img.src =
        url;
    }
  );
}

function canvasBlob(
  canvas,
  quality
) {
  return new Promise(
    resolve => {
      canvas.toBlob(
        resolve,
        "image/jpeg",
        quality
      );
    }
  );
}

async function compressImage(
  file
) {
  const img =
    await fileToImage(
      file
    );

  let maxSide =
    1600;

  const scale =
    Math.min(
      1,
      maxSide /
        Math.max(
          img.naturalWidth,
          img.naturalHeight
        )
    );

  let width =
    Math.max(
      1,
      Math.round(
        img.naturalWidth *
          scale
      )
    );

  let height =
    Math.max(
      1,
      Math.round(
        img.naturalHeight *
          scale
      )
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  const ctx =
    canvas.getContext(
      "2d",
      {
        alpha: false
      }
    );

  canvas.width =
    width;

  canvas.height =
    height;

  ctx.drawImage(
    img,
    0,
    0,
    width,
    height
  );

  let quality =
    0.82;

  let blob =
    await canvasBlob(
      canvas,
      quality
    );

  for (
    let i = 0;
    i < 8 &&
    blob &&
    blob.size >
      TARGET_BYTES;
    i++
  ) {
    quality -=
      0.08;

    if (
      quality <
      0.25
    ) {
      break;
    }

    blob =
      await canvasBlob(
        canvas,
        quality
      );
  }

  if (
    blob &&
    blob.size >
      TARGET_BYTES
  ) {
    const ratio =
      Math.sqrt(
        TARGET_BYTES /
          blob.size
      ) *
      0.92;

    width =
      Math.max(
        640,
        Math.round(
          width *
            ratio
        )
      );

    height =
      Math.max(
        480,
        Math.round(
          height *
            ratio
        )
      );

    canvas.width =
      width;

    canvas.height =
      height;

    ctx.drawImage(
      img,
      0,
      0,
      width,
      height
    );

    blob =
      await canvasBlob(
        canvas,
        0.72
      );
  }

  if (!blob) {
    throw new Error(
      "Prohlížeč neumí převést fotografii."
    );
  }

  return new File(
    [blob],
    `${crypto.randomUUID()}.jpg`,
    {
      type:
        "image/jpeg"
    }
  );
}

async function uploadPhotos(
  files
) {
  if (
    !currentCustomer ||
    !files.length
  ) {
    return;
  }

  let ok = 0;

  for (
    const original
    of files
  ) {
    try {
      const compressed =
        await compressImage(
          original
        );

      const path =
        `${currentUser.id}/${currentCustomer.id}/${compressed.name}`;

      const {
        error
      } =
        await sb.storage
          .from(
            PHOTO_BUCKET
          )
          .upload(
            path,
            compressed,
            {
              contentType:
                "image/jpeg",

              cacheControl:
                "31536000",

              upsert:
                false
            }
          );

      if (error) {
        throw error;
      }

      const {
        error: dbError
      } =
        await sb
          .from("photos")
          .insert({
            user_id:
              currentUser.id,

            customer_id:
              currentCustomer.id,

            path
          });

      if (dbError) {
        throw dbError;
      }

      ok++;

    } catch (error) {
      console.error(
        error
      );

      toast(
        `Fotku se nepodařilo nahrát: ${error.message}`
      );
    }
  }

  if (ok) {
    toast(
      `${ok} fotka/fotek nahráno.`
    );
  }

  await renderGallery();
}

async function renderGallery() {
  if (!currentCustomer) {
    return;
  }

  const {
    data,
    error
  } =
    await sb
      .from("photos")
      .select("*")
      .eq(
        "customer_id",
        currentCustomer.id
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      );

  if (error) {
    toast(
      error.message
    );
    return;
  }

  const photos =
    data || [];

  if ($("photoCount")) {
    $("photoCount").textContent =
      photos.length;
  }

  if (
    !photos.length
  ) {
    if ($("gallery")) {
      $("gallery").innerHTML =
        "<p class='muted'>Zatím zde nejsou žádné fotky.</p>";
    }

    return;
  }

  const paths =
    photos.map(
      photo =>
        photo.path
    );

  const {
    data: urls,
    error: urlError
  } =
    await sb.storage
      .from(
        PHOTO_BUCKET
      )
      .createSignedUrls(
        paths,
        3600
      );

  if (urlError) {
    toast(
      urlError.message
    );
    return;
  }

  if ($("gallery")) {
    $("gallery").innerHTML =
      (urls || [])
        .map(
          (
            item,
            index
          ) => `
            <figure>
              <img
                loading="lazy"
                src="${item.signedUrl}"
                alt="Fotka okna ${
                  index + 1
                }">
            </figure>
          `
        )
        .join("");
  }
}

/* =========================================================
   SPUŠTĚNÍ APLIKACE
   ========================================================= */

async function startApp(
  session
) {
  if (!session) {
    currentUser =
      null;

    customers =
      [];

    currentCustomer =
      null;

    appStarted =
      false;

    if ($("appView")) {
      $("appView")
        .classList
        .add(
          "hidden"
        );
    }

    if ($("authView")) {
      $("authView")
        .classList
        .remove(
          "hidden"
        );
    }

    return;
  }

  currentUser =
    session.user;

  if ($("userLabel")) {
    $("userLabel").textContent =
      currentUser.email ||
      "";
  }

  if ($("authView")) {
    $("authView")
      .classList
      .add(
        "hidden"
      );
  }

  if ($("appView")) {
    $("appView")
      .classList
      .remove(
        "hidden"
      );
  }

  ensureServiceViews();

  await loadCustomers();

  if (!appStarted) {
    subscribeRealtime();

    appStarted =
      true;
  }

  showView(
    "homeView"
  );
}

/* =========================================================
   KLIKNUTÍ V APLIKACI
   ========================================================= */

document.addEventListener(
  "click",
  async e => {

    const authTab =
      e.target.closest(
        "[data-auth-tab]"
      );

    if (authTab) {
      setAuthMode(
        authTab.dataset
          .authTab
      );

      return;
    }

    const open =
      e.target.closest(
        "[data-open-customer]"
      );

    if (open) {
      await openCustomer(
        open.dataset
          .openCustomer
      );

      return;
    }

    if (
      e.target.closest(
        "#calendarBtn"
      ) ||
      e.target.closest(
        '[data-nav="calendar"]'
      )
    ) {
      openCalendar();
      return;
    }

    if (
      e.target.closest(
        "#annualServicesBtn"
      ) ||
      e.target.closest(
        '[data-nav="annual"]'
      )
    ) {
      openAnnualServices();
      return;
    }

    if (
      e.target.closest(
        "#doneBtn"
      ) ||
      e.target.closest(
        '[data-nav="done"]'
      )
    ) {
      openDone();
      return;
    }

    if (
      e.target.closest(
        "#newCustomerBtn"
      ) ||
      e.target.closest(
        '[data-nav="new"]'
      )
    ) {
      showView(
        "customerFormView"
      );

      return;
    }

    if (
      e.target.closest(
        "#customersBtn"
      ) ||
      e.target.closest(
        '[data-nav="customers"]'
      )
    ) {
      showView(
        "customersView"
      );

      renderCustomers();

      return;
    }

    if (
      e.target.closest(
        '[data-nav="home"]'
      )
    ) {
      showView(
        "homeView"
      );

      return;
    }

    if (
      e.target.closest(
        "[data-back]"
      )
    ) {
      showView(
        "homeView"
      );

      return;
    }
  }
);

/* =========================================================
   FORMULÁŘE A OVLÁDÁNÍ
   ========================================================= */

if ($("authForm")) {
  $("authForm")
    .addEventListener(
      "submit",
      e => {
        e.preventDefault();

        if (
          authMode ===
          "login"
        ) {
          signIn();
        } else {
          signUp();
        }
      }
    );
}

if ($("logoutBtn")) {
  $("logoutBtn")
    .addEventListener(
      "click",
      logout
    );
}

if ($("customerForm")) {
  $("customerForm")
    .addEventListener(
      "submit",
      createCustomer
    );
}

if ($("customerSearch")) {
  $("customerSearch")
    .addEventListener(
      "input",
      renderCustomers
    );
}

if ($("photoInput")) {
  $("photoInput")
    .addEventListener(
      "change",
      e => {
        uploadPhotos(
          [
            ...e.target
              .files
          ]
        );
      }
    );
}

if ($("completeBtn")) {
  $("completeBtn")
    .addEventListener(
      "click",
      completeRepair
    );
}

if ($("saveDetailBtn")) {
  $("saveDetailBtn")
    .addEventListener(
      "click",
      editCustomer
    );
}

if ($("deleteCustomerBtn")) {
  $("deleteCustomerBtn")
    .addEventListener(
      "click",
      deleteCustomer
    );
}

/* =========================================================
   SUPABASE AUTH
   ========================================================= */

ensureServiceViews();

setAuthMode(
  "login"
);

async function initApp() {
  const {
    data: {
      session
    }
  } =
    await sb.auth
      .getSession();

  await startApp(
    session
  );

  sb.auth.onAuthStateChange(
    async (
      _event,
      newSession
    ) => {
      await startApp(
        newSession
      );
    }
  );
}

initApp();
