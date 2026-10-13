/* =========================================================
   ServisSFanoušem
   KOMPLETNÍ app.js
   ========================================================= */

const SUPABASE_URL =
  "https://ujtpluckaenrplkfpzgi.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_5Sf5fpEYUA2Q3dp74c1q3w_XzKRTST7";

const PHOTO_BUCKET = "photos";
const TARGET_BYTES = 200 * 1024;

/* =========================================================
   SUPABASE
   ========================================================= */

const sb = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

/* =========================================================
   STAV
   ========================================================= */

let currentUser = null;
let customers = [];
let currentCustomer = null;
let realtimeChannel = null;
let authMode = "login";
let appStarted = false;

let calendarDate = new Date();
let selectedCalendarDay = null;

/* =========================================================
   POMOCNÉ FUNKCE
   ========================================================= */

const $ = id =>
  document.getElementById(id);

const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    m =>
      ({
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

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "cs-CZ",
    withTime
      ? {
          dateStyle: "medium",
          timeStyle: "short"
        }
      : {
          dateStyle: "medium"
        }
  ).format(d);
}

function daysUntil(dateValue) {
  if (!dateValue) return 999999;

  const d =
    new Date(
      dateValue + "T00:00:00"
    );

  const now = new Date();

  now.setHours(
    0,
    0,
    0,
    0
  );

  return Math.ceil(
    (d - now) / 86400000
  );
}

function nextYearDate() {
  const d = new Date();

  d.setFullYear(
    d.getFullYear() + 1
  );

  return d
    .toISOString()
    .slice(0, 10);
}

function pad2(value) {
  return String(value).padStart(
    2,
    "0"
  );
}

function localDateKey(date) {
  return (
    date.getFullYear() +
    "-" +
    pad2(date.getMonth() + 1) +
    "-" +
    pad2(date.getDate())
  );
}

function appointmentDateKey(value) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return localDateKey(d);
}

function appointmentTime(value) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return (
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

function showView(name) {
  [
    "homeView",
    "customersView",
    "customerFormView",
    "detailView",
    "annualServicesView",
    "calendarView",
    "doneView"
  ].forEach(view => {
    const el = $(view);

    if (el) {
      el.classList.add("hidden");
    }
  });

  const target = $(name);

  if (target) {
    target.classList.remove(
      "hidden"
    );
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   PŘIHLÁŠENÍ
   ========================================================= */

function setAuthMode(mode) {
  authMode = mode;

  document
    .querySelectorAll(
      "[data-auth-tab]"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.authTab ===
          mode
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
  const email =
    $("authEmail").value.trim();

  const password =
    $("authPassword").value;

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
  const email =
    $("authEmail").value.trim();

  const password =
    $("authPassword").value;

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
    toast(
      "Účet vytvořen a přihlášen."
    );
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
  appStarted = false;

  if (realtimeChannel) {
    await sb.removeChannel(
      realtimeChannel
    );

    realtimeChannel = null;
  }
}

/* =========================================================
   NAČTENÍ ZÁKAZNÍKŮ
   ========================================================= */

async function loadCustomers() {
  if (!currentUser) return;

  const { data, error } =
    await sb
      .from("customers")
      .select("*")
      .eq(
        "user_id",
        currentUser.id
      )
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

  renderHome();
  renderCustomers();
  renderAnnualServices();
  renderDone();

  if (calendarDate) {
    renderCalendar();
  }

  if (currentCustomer) {
    const fresh =
      customers.find(
        c =>
          c.id ===
          currentCustomer.id
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
    sb.removeChannel(
      realtimeChannel
    );
  }

  realtimeChannel =
    sb
      .channel(
        "customers-live-" +
          currentUser.id
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
          filter:
            `user_id=eq.${currentUser.id}`
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
          filter:
            `user_id=eq.${currentUser.id}`
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
   DOMOV
   ========================================================= */

function renderHome() {
  const due =
    customers
      .filter(
        c => c.annual_service_due
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
                  ? `po termínu o ${Math.abs(
                      days
                    )} dní`
                  : days === 0
                  ? "dnes"
                  : `za ${days} dní`;

              return `
                <div class="reminder ${
                  days < 0
                    ? "overdue"
                    : ""
                }">
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
                      <b>${text}</b>
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
        : "<p class='muted'>Žádný roční servis není do 14 dní.</p>";
  }

  const active =
    customers.filter(
      c =>
        c.status !==
        "Dokončeno"
    ).length;

  const done =
    customers.filter(
      c =>
        c.status ===
        "Dokončeno"
    ).length;

  const total =
    customers.length;

  if ($("stats")) {
    $("stats").innerHTML = `
      <div class="stat">
        <span>Zákazníků</span>
        <b>${total}</b>
      </div>

      <div class="stat">
        <span>Aktivních oprav</span>
        <b>${active}</b>
      </div>

      <div class="stat">
        <span>Dokončeno</span>
        <b>${done}</b>
      </div>
    `;
  }
}

/* =========================================================
   SEZNAM AKTIVNÍCH ZÁKAZNÍKŮ
   ========================================================= */

function renderCustomers() {
  const search =
    $("customerSearch")
      ?.value
      ?.toLowerCase()
      .trim() || "";

  const list =
    customers
      .filter(
        c =>
          c.status !==
          "Dokončeno"
      )
      .filter(c => {
        return [
          c.full_name,
          c.phone,
          c.address,
          c.email
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });

  if (!$("customerList")) {
    return;
  }

  $("customerList").innerHTML =
    list.length
      ? list
          .map(c => {
            const appointment =
              c.appointment_at
                ? ` · ${fmtDate(
                    c.appointment_at,
                    true
                  )}`
                : "";

            return `
              <div class="customer-card">

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
                    ${esc(
                      c.address || ""
                    )}
                  </p>

                  <small>
                    ${esc(
                      c.status ||
                        "Naplánováno"
                    )}
                    ${appointment}
                  </small>
                </div>

                <button
                  class="primary"
                  data-open-customer="${c.id}">
                  Detail
                </button>

              </div>
            `;
          })
          .join("")
      : "<p class='muted'>Žádní aktivní zákazníci.</p>";
}

/* =========================================================
   DETAIL ZÁKAZNÍKA
   ========================================================= */

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
      <span class="status ${
        c.status ===
        "Dokončeno"
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
  // Samostatné dokončení servisu
  // bez automatického převodu na roční servis
  $("completeBtn").textContent = "✓ Servis hotov";

  $("completeBtn").classList.toggle(
    "hidden",
    c.status === "Dokončeno"
  );
}

  ensureAnnualButton();

  const annualBtn =
    $("transferAnnualBtn");

  if (annualBtn) {
    annualBtn.classList.toggle(
      "hidden",
      !(
        c.status ===
          "Dokončeno" &&
        !c.annual_service_due
      )
    );
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
   RUČNÍ PŘEVOD NA ROČNÍ SERVIS
   ========================================================= */

function ensureAnnualButton() {
  const detail =
    $("detailView");

  if (!detail) return;

  let button =
    $("transferAnnualBtn");

  if (!button) {
    button =
      document.createElement(
        "button"
      );

    button.id =
      "transferAnnualBtn";

    button.className =
      "primary";

    button.textContent =
      "🔧 Převést na roční servis";

    const completeBtn =
      $("completeBtn");

    if (
      completeBtn &&
      completeBtn.parentElement
    ) {
      completeBtn.parentElement.appendChild(
        button
      );
    } else {
      detail.appendChild(
        button
      );
    }

    button.addEventListener(
      "click",
      transferToAnnualService
    );
  }
}

async function transferToAnnualService() {
  if (
    !currentCustomer ||
    !currentUser
  ) {
    return;
  }

  if (
    currentCustomer.status !==
    "Dokončeno"
  ) {
    toast(
      "Na roční servis lze převést pouze dokončený servis."
    );
    return;
  }

  if (
    currentCustomer.annual_service_due
  ) {
    toast(
      "Tento zákazník už má roční servis naplánovaný."
    );
    return;
  }

  const baseDate =
    currentCustomer.completed_at ||
    currentCustomer.appointment_at ||
    new Date().toISOString();

  const d =
    new Date(baseDate);

  d.setFullYear(
    d.getFullYear() + 1
  );

  const annualDue =
    d.toISOString().slice(
      0,
      10
    );

  const confirmed =
    confirm(
      `Převést zákazníka ${
        currentCustomer.full_name
      } na roční servis?\n\nTermín ročního servisu bude ${fmtDate(
        annualDue
      )}.`
    );

  if (!confirmed) {
    return;
  }

  const { data, error } =
    await sb
      .from("customers")
      .update({
        annual_service_due:
          annualDue,
        updated_at:
          new Date().toISOString()
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
    toast(error.message);
    return;
  }

  currentCustomer =
    data;

  const index =
    customers.findIndex(
      c =>
        c.id === data.id
    );

  if (index !== -1) {
    customers[index] =
      data;
  }

  renderHome();
  renderDone();
  renderAnnualServices();
  renderDetail();

  toast(
    `Převedeno na roční servis: ${fmtDate(
      annualDue
    )}`
  );
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
      currentCustomer.phone ||
        ""
    ],
    [
      "E-mail",
      currentCustomer.email ||
        ""
    ],
    [
      "Adresa",
      currentCustomer.address ||
        ""
    ],
    [
      "Popis problému",
      currentCustomer.problem ||
        ""
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
      values[4],
    updated_at:
      new Date().toISOString()
  };

  const { data, error } =
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
    toast(error.message);
    return;
  }

  currentCustomer =
    data;

  const index =
    customers.findIndex(
      c =>
        c.id === data.id
    );

  if (index !== -1) {
    customers[index] =
      data;
  }

  renderHome();
  renderCustomers();
  renderAnnualServices();
  renderDone();
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
      error:
        storageError
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
    error:
      dbPhotosError
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
  renderAnnualServices();
  renderDone();

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

/*
   POZOR:
   TADY SE ROČNÍ SERVIS NENASTAVUJE.

   Dokončení opravy pouze:
   - změní stav na Dokončeno
   - uloží datum dokončení

   Převod na roční servis se dělá zvlášť
   tlačítkem "Převést na roční servis".
*/

async function completeRepair() {
  if (!currentCustomer) {
    return;
  }

  const confirmed =
    confirm(
      `Označit servis zákazníka ${
        currentCustomer.full_name
      } jako dokončený?`
    );

  if (!confirmed) {
    return;
  }

  const { data, error } =
    await sb
      .from("customers")
      .update({
        status:
          "Dokončeno",
        completed_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString()
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
        c.id === data.id
    );

  if (index !== -1) {
    customers[index] =
      data;
  }

  renderHome();
  renderCustomers();
  renderAnnualServices();
  renderDone();
  renderDetail();

  toast(
    "Servis byl označen jako hotový."
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

  const appointmentInput =
    $("appointmentAt");

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
      appointmentInput &&
      appointmentInput.value
        ? new Date(
            appointmentInput.value
          ).toISOString()
        : null,

    status:
      "Naplánováno"
  };

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

  customers = [
    data,
    ...customers.filter(
      c =>
        c.id !==
        data.id
    )
  ];

  if ($("customerForm")) {
    $("customerForm").reset();
  }

  renderHome();
  renderCustomers();
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

function fileToImage(file) {
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

      img.src = url;
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

async function compressImage(file) {
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
      quality < 0.25
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
      ) * 0.92;

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
    const original of files
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
        error:
          dbError
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
      .eq(
        "user_id",
        currentUser.id
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

  if (!photos.length) {
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
   HOTOVÉ
   ========================================================= */

function renderDone() {
  const container =
    $("doneList");

  if (!container) {
    return;
  }

  const done =
    customers
      .filter(
        c =>
          c.status ===
          "Dokončeno"
      )
      .sort(
        (a, b) => {
          const aa =
            a.completed_at ||
            a.updated_at ||
            "";

          const bb =
            b.completed_at ||
            b.updated_at ||
            "";

          return bb.localeCompare(
            aa
          );
        }
      );

  container.innerHTML =
    done.length
      ? done
          .map(c => {
            return `
              <div
                class="customer-card done-card"
                style="
                  border-left:5px solid #16a34a;
                  background:#f0fdf4;
                ">

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
                    ${esc(
                      c.address || ""
                    )}
                  </p>

                  <small>
                    <strong
                      style="color:#16a34a">
                      ✓ HOTOVO
                    </strong>

                    ${
                      c.completed_at
                        ? ` · dokončeno ${fmtDate(
                            c.completed_at
                          )}`
                        : ""
                    }
                  </small>

                  ${
                    c.annual_service_due
                      ? `
                        <br>
                        <small>
                          Roční servis:
                          <strong>
                            ${fmtDate(
                              c.annual_service_due
                            )}
                          </strong>
                        </small>
                      `
                      : `
                        <br>
                        <small>
                          Roční servis:
                          zatím nepřeveden
                        </small>
                      `
                  }
                </div>

                <button
                  class="primary"
                  data-open-customer="${c.id}">
                  Detail
                </button>

              </div>
            `;
          })
          .join("")
      : "<p class='muted'>Zatím nemáte žádný dokončený servis.</p>";
}

/* =========================================================
   ROČNÍ SERVISY
   ========================================================= */

function renderAnnualServices() {
  const container =
    $("annualServiceList");

  if (!container) {
    return;
  }

  const list =
    customers
      .filter(
        c =>
          !!c.annual_service_due
      )
      .sort(
        (a, b) =>
          a.annual_service_due.localeCompare(
            b.annual_service_due
          )
      );

  container.innerHTML =
    list.length
      ? list
          .map(c => {
            const days =
              daysUntil(
                c.annual_service_due
              );

            const urgency =
              days < 0
                ? "po termínu"
                : days === 0
                ? "dnes"
                : `za ${days} dní`;

            return `
              <div class="customer-card">

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
                    ${esc(
                      c.address || ""
                    )}
                  </p>

                  <small>
                    Roční servis:
                    <strong>
                      ${fmtDate(
                        c.annual_service_due
                      )}
                    </strong>
                    —
                    ${urgency}
                  </small>
                </div>

                <button
                  class="primary"
                  data-open-customer="${c.id}">
                  Detail
                </button>

              </div>
            `;
          })
          .join("")
      : "<p class='muted'>Zatím nemáte žádný zákazník převedený na roční servis.</p>";
}

/* =========================================================
   KALENDÁŘ
   ========================================================= */

function getCalendarJobs(
  year,
  month
) {
  return customers.filter(
    c => {
      if (
        c.status ===
        "Dokončeno"
      ) {
        return false;
      }

      if (
        !c.appointment_at
      ) {
        return false;
      }

      const d =
        new Date(
          c.appointment_at
        );

      return (
        d.getFullYear() ===
          year &&
        d.getMonth() ===
          month
      );
    }
  );
}

function calendarMonthName(
  date
) {
  return new Intl.DateTimeFormat(
    "cs-CZ",
    {
      month:
        "long",
      year:
        "numeric"
    }
  ).format(date);
}

function renderCalendar() {
  const container =
    $("calendarContainer");

  if (!container) {
    return;
  }

  const year =
    calendarDate.getFullYear();

  const month =
    calendarDate.getMonth();

  const jobs =
    getCalendarJobs(
      year,
      month
    );

  const first =
    new Date(
      year,
      month,
      1
    );

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  let startDay =
    first.getDay();

  /*
    JavaScript:
    neděle = 0
    pondělí = 1

    Pro český kalendář:
    pondělí = 0
  */

  startDay =
    startDay === 0
      ? 6
      : startDay - 1;

  const weekdays = [
    "Po",
    "Út",
    "St",
    "Čt",
    "Pá",
    "So",
    "Ne"
  ];

  let html = `
    <div
      class="calendar-wrapper"
      style="
        width:100%;
        max-width:900px;
      ">

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          margin-bottom:15px;
        ">

        <button
          class="secondary"
          id="calendarPrev">
          ◀
        </button>

        <h2
          style="
            margin:0;
            text-transform:capitalize;
          ">
          ${esc(
            calendarMonthName(
              calendarDate
            )
          )}
        </h2>

        <button
          class="secondary"
          id="calendarNext">
          ▶
        </button>

      </div>

      <div
        class="calendar-grid"
        style="
          display:grid;
          grid-template-columns:
            repeat(7,minmax(0,1fr));
          gap:5px;
        ">

        ${weekdays
          .map(
            day => `
              <div
                style="
                  text-align:center;
                  font-weight:bold;
                  padding:8px 2px;
                ">
                ${day}
              </div>
            `
          )
          .join("")}
  `;

  for (
    let i = 0;
    i < startDay;
    i++
  ) {
    html += `
      <div
        style="
          min-height:70px;
        ">
      </div>
    `;
  }

  for (
    let day = 1;
    day <=
    daysInMonth;
    day++
  ) {
    const key =
      year +
      "-" +
      pad2(
        month + 1
      ) +
      "-" +
      pad2(day);

    const dayJobs =
      jobs.filter(
        c =>
          appointmentDateKey(
            c.appointment_at
          ) === key
      );

    const isToday =
      localDateKey(
        new Date()
      ) === key;

    const selected =
      selectedCalendarDay ===
      key;

    html += `
      <button
        type="button"
        class="calendar-day"
        data-calendar-day="${key}"
        style="
          min-height:80px;
          border:1px solid
            ${
              selected
                ? "#16a34a"
                : "#ddd"
            };
          border-radius:10px;
          background:
            ${
              selected
                ? "#f0fdf4"
                : "#fff"
            };
          padding:8px;
          text-align:left;
          cursor:pointer;
          ${
            isToday
              ? "box-shadow:inset 0 0 0 2px #2563eb;"
              : ""
          }
        ">

        <div
          style="
            font-weight:bold;
            margin-bottom:5px;
          ">
          ${day}
        </div>

        ${
          dayJobs.length
            ? `
              <div
                style="
                  color:#166534;
                  font-weight:bold;
                  font-size:13px;
                ">
                ${dayJobs.length}
                ${
                  dayJobs.length ===
                  1
                    ? " servis"
                    : " servisy"
                }
              </div>
            `
            : `
              <div
                style="
                  color:#888;
                  font-size:12px;
                ">
                volno
              </div>
            `
        }

      </button>
    `;
  }

  html += `
      </div>

      <div
        id="calendarDayDetail"
        style="
          margin-top:20px;
        ">
      </div>

    </div>
  `;

  container.innerHTML =
    html;

  const detail =
    $("calendarDayDetail");

  if (
    selectedCalendarDay
  ) {
    renderCalendarDay(
      selectedCalendarDay
    );
  } else if (detail) {
    detail.innerHTML = `
      <div
        class="muted"
        style="
          padding:15px;
        ">
        Klikni na den v kalendáři
        a zobrazí se naplánované
        servisy a volné hodiny.
      </div>
    `;
  }

  const prev =
    $("calendarPrev");

  const next =
    $("calendarNext");

  if (prev) {
    prev.onclick = () => {
      calendarDate =
        new Date(
          year,
          month - 1,
          1
        );

      selectedCalendarDay =
        null;

      renderCalendar();
    };
  }

  if (next) {
    next.onclick = () => {
      calendarDate =
        new Date(
          year,
          month + 1,
          1
        );

      selectedCalendarDay =
        null;

      renderCalendar();
    };
  }
}

function renderCalendarDay(
  key
) {
  const container =
    $("calendarDayDetail");

  if (!container) {
    return;
  }

  selectedCalendarDay =
    key;

  const jobs =
    customers
      .filter(
        c =>
          c.status !==
          "Dokončeno"
      )
      .filter(
        c =>
          c.appointment_at
      )
      .filter(
        c =>
          appointmentDateKey(
            c.appointment_at
          ) === key
      )
      .sort(
        (a, b) =>
          appointmentTime(
            a.appointment_at
          ).localeCompare(
            appointmentTime(
              b.appointment_at
            )
          )
      );

  /*
    Pracovní doba:
    08:00 až 17:00
    servis = 1 hodina
  */

  const slots = [];

  for (
    let hour = 8;
    hour < 17;
    hour++
  ) {
    slots.push(
      pad2(hour) +
        ":00"
    );
  }

  const date =
    new Date(
      key +
        "T12:00:00"
    );

  const heading =
    new Intl.DateTimeFormat(
      "cs-CZ",
      {
        dateStyle:
          "full"
      }
    ).format(date);

  container.innerHTML = `
    <div
      style="
        border:1px solid #ddd;
        border-radius:12px;
        padding:15px;
      ">

      <h3
        style="
          margin-top:0;
          text-transform:capitalize;
        ">
        ${esc(heading)}
      </h3>

      <div
        style="
          display:flex;
          flex-direction:column;
          gap:8px;
        ">

        ${slots
          .map(time => {
            const job =
              jobs.find(
                c =>
                  appointmentTime(
                    c.appointment_at
                  ) === time
              );

            if (job) {
              return `
                <div
                  style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:10px;
                    padding:12px;
                    border-radius:10px;
                    background:#fee2e2;
                    border-left:5px solid #dc2626;
                  ">

                  <div>
                    <strong>
                      ${time}
                    </strong>

                    <span
                      style="
                        margin-left:10px;
                      ">
                      ${esc(
                        job.full_name
                      )}
                    </span>
                  </div>

                  <button
                    class="primary"
                    data-open-customer="${job.id}">
                    Otevřít
                  </button>

                </div>
              `;
            }

            return `
              <div
                style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:10px;
                  padding:12px;
                  border-radius:10px;
                  background:#f0fdf4;
                  border-left:5px solid #16a34a;
                ">

                <div>
                  <strong>
                    ${time}
                  </strong>

                  <span
                    style="
                      margin-left:10px;
                      color:#166534;
                    ">
                    VOLNO
                  </span>
                </div>

                <button
                  class="secondary"
                  data-plan-time="${key}|${time}">
                  Naplánovat
                </button>

              </div>
            `;
          })
          .join("")}

      </div>
    </div>
  `;

  document
    .querySelectorAll(
      "[data-plan-time]"
    )
    .forEach(button => {
      button.onclick =
        () => {
          planFromCalendar(
            button.dataset
              .planTime
          );
        };
    });
}

function openCalendar() {
  showView(
    "calendarView"
  );

  renderCalendar();
}

function openDone() {
  showView(
    "doneView"
  );

  renderDone();
}

function openAnnualServices() {
  showView(
    "annualServicesView"
  );

  renderAnnualServices();
}

function planFromCalendar(
  value
) {
  const parts =
    value.split("|");

  const dateKey =
    parts[0];

  const time =
    parts[1];

  showView(
    "customerFormView"
  );

  setTimeout(() => {
    const input =
      $("appointmentAt");

    if (!input) {
      return;
    }

    input.value =
      `${dateKey}T${time}`;
  }, 50);
}

/* =========================================================
   DYNAMICKÉ SEKCE
   ========================================================= */

function ensurePlanningViews() {
  const appView =
    $("appView");

  if (!appView) {
    return;
  }

  if (
    !$("annualServicesView")
  ) {
    const annual =
      document.createElement(
        "section"
      );

    annual.id =
      "annualServicesView";

    annual.className =
      "hidden";

    annual.innerHTML = `
      <div class="view-header">
        <button
          class="secondary"
          data-nav="home">
          ← Domů
        </button>

        <h2>Roční servisy</h2>
      </div>

      <div
        id="annualServiceList">
      </div>
    `;

    appView.appendChild(
      annual
    );
  }

  if (
    !$("calendarView")
  ) {
    const calendar =
      document.createElement(
        "section"
      );

    calendar.id =
      "calendarView";

    calendar.className =
      "hidden";

    calendar.innerHTML = `
      <div class="view-header">
        <button
          class="secondary"
          data-nav="home">
          ← Domů
        </button>

        <h2>Kalendář</h2>
      </div>

      <div
        id="calendarContainer">
      </div>
    `;

    appView.appendChild(
      calendar
    );
  }

  if (!$("doneView")) {
    const done =
      document.createElement(
        "section"
      );

    done.id =
      "doneView";

    done.className =
      "hidden";

    done.innerHTML = `
      <div class="view-header">
        <button
          class="secondary"
          data-nav="home">
          ← Domů
        </button>

        <h2>Hotové</h2>
      </div>

      <div
        id="doneList">
      </div>
    `;

    appView.appendChild(
      done
    );
  }

  addHomePlanningButtons();
}

function addHomePlanningButtons() {
  const home =
    $("homeView");

  if (!home) {
    return;
  }

  if (
    $("homePlanningButtons")
  ) {
    return;
  }

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.id =
    "homePlanningButtons";

  wrapper.style.display =
    "grid";

  wrapper.style.gridTemplateColumns =
    "repeat(auto-fit,minmax(180px,1fr))";

  wrapper.style.gap =
    "10px";

  wrapper.style.margin =
    "20px 0";

  wrapper.innerHTML = `
    <button
      class="secondary"
      data-nav="calendar">
      📅 Kalendář
    </button>

    <button
      class="secondary"
      data-nav="annual">
      🔔 Roční servisy
    </button>

    <button
      class="secondary"
      data-nav="done">
      ✅ Hotové
    </button>
  `;

  /*
    Vložíme tlačítka na začátek
    domovské stránky.
  */

  home.insertBefore(
    wrapper,
    home.firstChild
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

    const calendarDay =
      e.target.closest(
        "[data-calendar-day]"
      );

    if (calendarDay) {
      selectedCalendarDay =
        calendarDay.dataset
          .calendarDay;

      renderCalendar();

      renderCalendarDay(
        selectedCalendarDay
      );

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
        '[data-nav="calendar"]'
      )
    ) {
      openCalendar();

      return;
    }

    if (
      e.target.closest(
        '[data-nav="annual"]'
      )
    ) {
      openAnnualServices();

      return;
    }

    if (
      e.target.closest(
        '[data-nav="done"]'
      )
    ) {
      openDone();

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
   FORMULÁŘE
   ========================================================= */

if ($("authForm")) {
  $("authForm").addEventListener(
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
  $("logoutBtn").addEventListener(
    "click",
    logout
  );
}

if ($("customerForm")) {
  $("customerForm").addEventListener(
    "submit",
    createCustomer
  );
}

if ($("customerSearch")) {
  $("customerSearch").addEventListener(
    "input",
    renderCustomers
  );
}

if ($("photoInput")) {
  $("photoInput").addEventListener(
    "change",
    e => {
      uploadPhotos(
        [
          ...e.target
            .files
        ]
      );

      e.target.value =
        "";
    }
  );
}

if ($("completeBtn")) {
  $("completeBtn").addEventListener(
    "click",
    completeRepair
  );
}

if ($("saveDetailBtn")) {
  $("saveDetailBtn").addEventListener(
    "click",
    editCustomer
  );
}

if (
  $("deleteCustomerBtn")
) {
  $("deleteCustomerBtn").addEventListener(
    "click",
    deleteCustomer
  );
}

/* =========================================================
   SUPABASE AUTH
   ========================================================= */

setAuthMode(
  "login"
);

/* =========================================================
   SPUŠTĚNÍ APLIKACE
   ========================================================= */

async function startApp(
  session
) {
  ensurePlanningViews();

  if (!session) {
    currentUser =
      null;

    customers = [];

    currentCustomer =
      null;

    appStarted =
      false;

    if ($("appView")) {
      $("appView").classList.add(
        "hidden"
      );
    }

    if ($("authView")) {
      $("authView").classList.remove(
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
    $("authView").classList.add(
      "hidden"
    );
  }

  if ($("appView")) {
    $("appView").classList.remove(
      "hidden"
    );
  }

  ensurePlanningViews();

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
   INIT
   ========================================================= */

async function initApp() {
  ensurePlanningViews();

  const {
    data: {
      session
    }
  } =
    await sb.auth.getSession();

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
/* =========================================================
   SERVIS S FANOUŠEM
   ROČNÍ SERVISY + PLÁNOVÁNÍ Z DETAILU
   ========================================================= */


/* =========================================================
   1. TLAČÍTKO V DETAILU ZÁKAZNÍKA
   ========================================================= */

const puvodniEnsureAnnualButton = ensureAnnualButton;

ensureAnnualButton = function () {

  puvodniEnsureAnnualButton();

  const detail = document.getElementById("detailView");

  if (!detail) return;

  let button = document.getElementById("planCustomerBtn");

  if (!button) {

    button = document.createElement("button");

    button.id = "planCustomerBtn";

    button.className = "primary";

    button.textContent = "📅 Naplánovat do kalendáře";

    button.style.margin = "10px 5px";
    button.style.background = "#2563eb";
    button.style.color = "white";

    const completeBtn = document.getElementById("completeBtn");

    if (completeBtn && completeBtn.parentElement) {

      completeBtn.parentElement.appendChild(button);

    } else {

      detail.appendChild(button);

    }

    button.addEventListener("click", planCustomerFromDetail);

  }

};


/* =========================================================
   2. PLÁNOVÁNÍ Z DETAILU
   ========================================================= */

async function planCustomerFromDetail() {

  if (!currentCustomer || !currentUser) {

    toast("Nejprve otevři zákazníka.");

    return;

  }

  const customer = currentCustomer;

  const today = localDateKey(new Date());

  const defaultDate = customer.appointment_at
    ? appointmentDateKey(customer.appointment_at)
    : customer.annual_service_due || today;

  const date = prompt(
    "Zadej datum návštěvy (RRRR-MM-DD):",
    defaultDate
  );

  if (date === null) return;

  const dateText = date.trim();

  const parsedDate = new Date(dateText + "T12:00:00");

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateText) ||
    Number.isNaN(parsedDate.getTime()) ||
    localDateKey(parsedDate) !== dateText
  ) {

    toast("Neplatné datum. Použij například 2027-10-13.");

    return;

  }

  const defaultTime = customer.appointment_at
    ? appointmentTime(customer.appointment_at)
    : "09:00";

  const time = prompt(
    "Zadej čas návštěvy (HH:MM):",
    defaultTime
  );

  if (time === null) return;

  const timeText = time.trim();

  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeText)
  ) {

    toast("Neplatný čas. Použij například 09:00.");

    return;

  }

  const appointment = new Date(
    dateText + "T" + timeText + ":00"
  );

  const confirmed = confirm(
    "Naplánovat zákazníka " +
    customer.full_name +
    " na " +
    fmtDate(appointment.toISOString(), true) +
    "?"
  );

  if (!confirmed) return;

  const { data, error } = await sb
    .from("customers")
    .update({
      appointment_at: appointment.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", customer.id)
    .eq("user_id", currentUser.id)
    .select()
    .single();

  if (error) {

    toast("Chyba při ukládání: " + error.message);

    return;

  }

  const index = customers.findIndex(
    c => c.id === data.id
  );

  if (index !== -1) {
    customers[index] = data;
  }

  currentCustomer = data;

  calendarDate = new Date(
    appointment.getFullYear(),
    appointment.getMonth(),
    1
  );

  selectedCalendarDay = dateText;

  renderDetail();
  renderHome();
  renderCustomers();
  renderAnnualServices();
  renderDone();
  renderCalendar();

  toast("Návštěva byla uložena do kalendáře.");

}


/* =========================================================
   3. SPOLEČNÝ SEZNAM UDÁLOSTÍ
   ========================================================= */

function getAllCalendarEvents() {

  const events = [];

  customers.forEach(customer => {

    /*
      Ručně naplánovaná návštěva
    */

    if (customer.appointment_at) {

      events.push({
        ...customer,
        status: "Naplánováno",
        calendarType: "manual"
      });

    }

    /*
      Automatický roční servis
    */

    if (customer.annual_service_due) {

      const annualDate = customer.annual_service_due;

      const manualDate = customer.appointment_at
        ? appointmentDateKey(customer.appointment_at)
        : null;

      /*
        Pokud je ruční návštěva ve stejný den
        jako roční servis, nevytvoříme duplicitu.
      */

      if (manualDate !== annualDate) {

        events.push({
          ...customer,
          appointment_at: annualDate + "T09:00:00",
          status: "Naplánováno",
          calendarType: "annual"
        });

      }

    }

  });

  return events;

}


/* =========================================================
   4. ZOBRAZENÍ ROČNÍCH SERVISŮ V KALENDÁŘI
   ========================================================= */

const originalRenderCalendar = renderCalendar;

const originalRenderCalendarDay = renderCalendarDay;


/*
  Pro vykreslení použijeme společný seznam.
  Původní zákazníky v paměti neměníme.
*/

function withCalendarEvents(callback) {

  const originalCustomers = customers;

  try {

    customers = getAllCalendarEvents();

    return callback();

  } finally {

    customers = originalCustomers;

  }

}


/*
  Původní kalendář zůstává zachovaný.
  Pouze mu při vykreslení předáme
  i automatické roční servisy.
*/

renderCalendar = function () {

  return withCalendarEvents(() => {

    originalRenderCalendar();

  });

};


renderCalendarDay = function (key) {

  return withCalendarEvents(() => {

    originalRenderCalendarDay(key);

  });

};


/* =========================================================
   KONEC ÚPRAV
   ========================================================= */
/* =========================================================
   PLÁNOVÁNÍ ZÁKAZNÍKA PŘES VELKÝ KALENDÁŘ
   ========================================================= */

// Zákazník, kterého právě plánujeme
let planningCustomerId = null;


/* =========================================================
   1. OTEVŘENÍ KALENDÁŘE Z DETAILU
   ========================================================= */

planCustomerFromDetail = function () {

  if (!currentCustomer) {
    toast("Nejprve vyber zákazníka.");
    return;
  }

  planningCustomerId = currentCustomer.id;

  // Otevřeme měsíc, ve kterém má zákazník
  // roční servis, případně současný měsíc.
  const date = currentCustomer.annual_service_due
    ? new Date(currentCustomer.annual_service_due + "T12:00:00")
    : new Date();

  calendarDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );

  selectedCalendarDay = null;

  openCalendar();

};


/* =========================================================
   2. INFORMAČNÍ PANEL NAD KALENDÁŘEM
   ========================================================= */

const puvodniRenderCalendarPrehled = renderCalendar;

renderCalendar = function () {

  puvodniRenderCalendarPrehled();

  const container = $("calendarContainer");

  if (!container) return;

  // Pokud právě nikoho neplánujeme,
  // zobrazíme běžný kalendář.
  if (!planningCustomerId) return;

  const customer = customers.find(
    c => c.id === planningCustomerId
  );

  if (!customer) {
    planningCustomerId = null;
    return;
  }

  const panel = document.createElement("div");

  panel.id = "planningInfo";

  panel.style.cssText = `
    background: #eff6ff;
    border: 2px solid #2563eb;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
  `;

  panel.innerHTML = `
    <h3 style="margin-top:0">
      📅 Plánování zákazníka
    </h3>

    <strong>${esc(customer.full_name)}</strong>

    <p>
      Vyber den v kalendáři a potom
      klikni na volnou hodinu.
    </p>

    <button
      type="button"
      id="cancelPlanningBtn"
      class="secondary">
      Zrušit plánování
    </button>
  `;

  container.prepend(panel);

  $("cancelPlanningBtn").onclick = () => {

    planningCustomerId = null;

    renderCalendar();

  };

};


/* =========================================================
   3. VÝBĚR VOLNÉHO ČASU
   ========================================================= */

const puvodniPlanFromCalendar = planFromCalendar;

planFromCalendar = async function (value) {

  // Pokud zákazníka neplánujeme,
  // zachováme původní funkci kalendáře.
  if (!planningCustomerId) {

    puvodniPlanFromCalendar(value);

    return;
  }

  if (!currentUser) {
    toast("Nejprve se přihlas.");
    return;
  }

  const customer = customers.find(
    c => c.id === planningCustomerId
  );

  if (!customer) {
    toast("Zákazník nebyl nalezen.");
    return;
  }

  const [dateKey, time] = value.split("|");

  const appointment = new Date(
    `${dateKey}T${time}:00`
  );

  if (Number.isNaN(appointment.getTime())) {
    toast("Neplatné datum nebo čas.");
    return;
  }

  // Ověříme, jestli už na tuto hodinu
  // není naplánovaný jiný zákazník.
  const occupied = getAllCalendarEvents().some(event => {

    if (event.id === customer.id) return false;

    return (
      appointmentDateKey(event.appointment_at) === dateKey &&
      appointmentTime(event.appointment_at) === time
    );

  });

  if (occupied) {
    toast("Tento čas už je obsazený.");
    return;
  }

  const confirmed = confirm(
    `Naplánovat zákazníka ${customer.full_name}\n` +
    `na ${fmtDate(appointment.toISOString(), true)}?`
  );

  if (!confirmed) return;

  const { data, error } = await sb
    .from("customers")
    .update({
      appointment_at: appointment.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", customer.id)
    .eq("user_id", currentUser.id)
    .select()
    .single();

  if (error) {

    toast("Nepodařilo se uložit: " + error.message);

    return;

  }

  // Aktualizace zákazníka v aplikaci
  const index = customers.findIndex(
    c => c.id === data.id
  );

  if (index !== -1) {
    customers[index] = data;
  }

  currentCustomer = data;

  // Ukončíme režim plánování
  planningCustomerId = null;

  // Zobrazíme kalendář na uloženém dni
  calendarDate = new Date(
    appointment.getFullYear(),
    appointment.getMonth(),
    1
  );

  selectedCalendarDay = dateKey;

  renderHome();
  renderCustomers();
  renderAnnualServices();
  renderDone();
  renderCalendar();

  toast(
    `Zákazník ${data.full_name} byl naplánován.`
  );

};


/* =========================================================
   4. PŘEHLED ZÁKAZNÍKŮ PŘÍMO V KALENDÁŘI
   ========================================================= */

const puvodniRenderCalendarSeJmeny = renderCalendar;

renderCalendar = function () {

  puvodniRenderCalendarSeJmeny();

  const events = getAllCalendarEvents();

  document.querySelectorAll(
    "#calendarContainer [data-calendar-day]"
  ).forEach(button => {

    const dateKey = button.dataset.calendarDay;

    const dayEvents = events.filter(event =>
      appointmentDateKey(event.appointment_at) === dateKey
    );

    if (!dayEvents.length) return;

    const names = document.createElement("div");

    names.style.cssText = `
      margin-top: 5px;
      font-size: 11px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    `;

    names.innerHTML = dayEvents.map(event => {

      const annual = event.calendarType === "annual";

      return `
        <div style="
          margin-top: 3px;
          padding: 3px;
          border-radius: 4px;
          background: ${annual ? "#dcfce7" : "#fee2e2"};
        ">
          ${annual ? "🔧" : "📅"}
          ${esc(event.full_name)}
        </div>
      `;

    }).join("");

    button.appendChild(names);

  });

};


/* =========================================================
   5. UKONČENÍ REŽIMU PLÁNOVÁNÍ
   ========================================================= */

const puvodniOpenCalendar = openCalendar;

openCalendar = function () {

  // Běžné otevření kalendáře z domovské stránky
  // ponecháme beze změny.
  puvodniOpenCalendar();

};
