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
      detectSessionInUrl: true
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
  console.error("CHYBA UPLOADU FOTKY:", error);
  toast(`Upload chyba: ${error.message}`);
  return;
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
    console.error("CHYBA NAČÍTÁNÍ ZÁKAZNÍKŮ:", error);
    toast(error.message);
    return;
  }

  customers = Array.isArray(data)
    ? data
    : [];

  console.log(
    "NAČTENI ZÁKAZNÍCI:",
    customers.length
  );

  renderHome();
  renderCustomers();

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
   DOMOV
   ========================================================= */

function renderHome() {
  const due = customers
    .filter(c => c.annual_service_due)
    .filter(
      c => daysUntil(c.annual_service_due) <= 14
    );

  if ($("reminderCount")) {
    $("reminderCount").textContent = due.length;
  }

  if ($("reminders")) {
    $("reminders").innerHTML = due.length
      ? due
          .sort(
            (a, b) =>
              a.annual_service_due.localeCompare(
                b.annual_service_due
              )
          )
          .map(c => {
            const days = daysUntil(
              c.annual_service_due
            );

            const text =
              days < 0
                ? `po termínu o ${Math.abs(days)} dní`
                : days === 0
                ? "dnes"
                : `za ${days} dní`;

            return `
              <div class="reminder ${
                days < 0 ? "overdue" : ""
              }">
                <div>
                  <strong>${esc(c.full_name)}</strong>
                  <span>
                    ${esc(c.phone || "")}
                    ·
                    ${esc(c.address || "")}
                  </span>
                  <br>
                  <small>
                    Roční servis:
                    ${fmtDate(c.annual_service_due)}
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

  const planned = customers.filter(
    c => c.status !== "Dokončeno"
  ).length;

  const done = customers.filter(
    c => c.status === "Dokončeno"
  ).length;

  const total = customers.length;

  if ($("stats")) {
    $("stats").innerHTML = `
      <div class="stat">
        <span>Zákazníků</span>
        <b>${total}</b>
      </div>

      <div class="stat">
        <span>Aktivních oprav</span>
        <b>${planned}</b>
      </div>

      <div class="stat">
        <span>Dokončeno</span>
        <b>${done}</b>
      </div>
    `;
  }
}

/* =========================================================
   SEZNAM ZÁKAZNÍKŮ
   ========================================================= */

function renderCustomers() {
  const search =
    $("customerSearch")?.value
      ?.toLowerCase()
      .trim() || "";

  const list = customers.filter(c => {
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

  if (!$("customerList")) return;

  $("customerList").innerHTML =
    list.length
      ? list
          .map(c => {
            const due = c.annual_service_due
              ? ` · servis ${fmtDate(
                  c.annual_service_due
                )}`
              : "";

            return `
              <div class="customer-card">

                <div>
                  <h3>
                    ${esc(c.full_name)}
                  </h3>

                  <p>
                    ${esc(c.phone || "")}
                    ${esc(c.address || "")}
                  </p>

                  <small>
                    ${esc(c.status || "")}
                    ${due}
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
      : "<p class='muted'>Nic nenalezeno.</p>";
}

/* =========================================================
   DETAIL ZÁKAZNÍKA
   ========================================================= */

function renderDetail() {
  const c = currentCustomer;

  if (!c) return;

  if ($("detailTitle")) {
    $("detailTitle").textContent =
      c.full_name;
  }

  if ($("detailStatus")) {
    $("detailStatus").innerHTML = `
      <span class="status ${
        c.status === "Dokončeno"
          ? "done"
          : "planned"
      }">
        ${esc(c.status || "")}
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
    $("completeBtn").classList.toggle(
      "hidden",
      c.status === "Dokončeno"
    );
  }
}

async function openCustomer(id) {
  const customer =
    customers.find(c => c.id === id);

  if (!customer) {
    toast("Zákazník nebyl nalezen.");
    return;
  }

  currentCustomer = customer;

  renderDetail();

  showView("detailView");

  await renderGallery();
}

/* =========================================================
   ÚPRAVA ZÁKAZNÍKA
   ========================================================= */

async function editCustomer() {
  if (!currentCustomer) return;

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

  for (const [label, value] of fields) {
    const result = prompt(
      label,
      value
    );

    if (result === null) return;

    values.push(result);
  }

  const patch = {
    full_name: values[0],
    phone: values[1],
    email: values[2],
    address: values[3],
    problem: values[4]
  };

  const { data, error } =
    await sb
      .from("customers")
      .update(patch)
      .eq("id", currentCustomer.id)
      .eq("user_id", currentUser.id)
      .select()
      .single();

  if (error) {
    toast(error.message);
    return;
  }

  currentCustomer = data;

  const index = customers.findIndex(
    c => c.id === data.id
  );

  if (index !== -1) {
    customers[index] = data;
  }

  renderHome();
  renderCustomers();
  renderDetail();

  toast("Změny uloženy.");
}

/* =========================================================
   SMAZÁNÍ ZÁKAZNÍKA
   ========================================================= */

async function deleteCustomer() {
  if (!currentCustomer || !currentUser) return;

  const confirmed = confirm(
    `Opravdu chcete smazat zákazníka ${currentCustomer.full_name}?\n\nSmaže se zákazník i všechny jeho fotografie. Tuto akci nelze vrátit.`
  );

  if (!confirmed) return;

  const customerId = currentCustomer.id;

  const { data: photos, error: photosError } =
    await sb
      .from("photos")
      .select("path")
      .eq("customer_id", customerId)
      .eq("user_id", currentUser.id);

  if (photosError) {
    toast(photosError.message);
    return;
  }

  if (photos && photos.length) {
    const paths = photos.map(photo => photo.path);

    const { error: storageError } =
      await sb.storage
        .from(PHOTO_BUCKET)
        .remove(paths);

    if (storageError) {
      toast(storageError.message);
      return;
    }
  }

  const { error: dbPhotosError } =
    await sb
      .from("photos")
      .delete()
      .eq("customer_id", customerId)
      .eq("user_id", currentUser.id);

  if (dbPhotosError) {
    toast(dbPhotosError.message);
    return;
  }

  const { error } =
    await sb
      .from("customers")
      .delete()
      .eq("id", customerId)
      .eq("user_id", currentUser.id);

  if (error) {
    toast(error.message);
    return;
  }

  customers = customers.filter(
    c => c.id !== customerId
  );

  currentCustomer = null;

  renderHome();
  renderCustomers();
  showView("customersView");

  toast("Zákazník byl smazán.");
}

/* =========================================================
   DOKONČENÍ OPRAVY
   ========================================================= */

async function completeRepair() {
  if (!currentCustomer) return;

  const due = nextYearDate();

  const confirmed = confirm(
    `Označit opravu ${
      currentCustomer.full_name
    } jako dokončenou a naplánovat roční servis na ${fmtDate(
      due
    )}?`
  );

  if (!confirmed) return;

  const { data, error } =
    await sb
      .from("customers")
      .update({
        status: "Dokončeno",
        completed_at:
          new Date().toISOString(),
        annual_service_due: due
      })
      .eq("id", currentCustomer.id)
      .eq("user_id", currentUser.id)
      .select()
      .single();

  if (error) {
    toast(error.message);
    return;
  }

  currentCustomer = data;

  const index = customers.findIndex(
    c => c.id === data.id
  );

  if (index !== -1) {
    customers[index] = data;
  }

  renderHome();
  renderCustomers();
  renderDetail();

  toast(
    `Hotovo. Roční servis je naplánovaný na ${fmtDate(
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
    toast("Nejste přihlášen.");
    return;
  }

  const fullName =
    $("fullName").value.trim();

  if (!fullName) {
    toast("Vyplňte jméno zákazníka.");
    return;
  }

  const payload = {
    user_id: currentUser.id,

    full_name: fullName,

    phone:
      $("phone").value.trim(),

    email:
      $("email").value.trim(),

    address:
      $("address").value.trim(),

    problem:
      $("problem").value.trim(),

    appointment_at:
      $("appointmentAt").value
        ? new Date(
            $("appointmentAt").value
          ).toISOString()
        : null,

    status: "Naplánováno"
  };

  console.log(
    "UKLÁDÁM ZÁKAZNÍKA:",
    payload
  );

  const { data, error } =
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

    toast(error.message);
    return;
  }

  console.log(
    "NOVÝ ZÁKAZNÍK:",
    data
  );

  customers = [
    data,
    ...customers.filter(
      c => c.id !== data.id
    )
  ];

  $("customerForm").reset();

  renderHome();
  renderCustomers();

  currentCustomer = data;

  renderDetail();

  showView("detailView");

  await renderGallery();

  toast("Zákazník uložen.");
}

/* =========================================================
   FOTOGRAFIE
   ========================================================= */

function fileToImage(file) {
  return new Promise(
    (resolve, reject) => {
      const url =
        URL.createObjectURL(file);

      const img =
        new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = reject;

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
    await fileToImage(file);

  let maxSide = 1600;

  const scale = Math.min(
    1,
    maxSide /
      Math.max(
        img.naturalWidth,
        img.naturalHeight
      )
  );

  let width = Math.max(
    1,
    Math.round(
      img.naturalWidth * scale
    )
  );

  let height = Math.max(
    1,
    Math.round(
      img.naturalHeight * scale
    )
  );

  const canvas =
    document.createElement(
      "canvas"
    );

  const ctx =
    canvas.getContext(
      "2d",
      { alpha: false }
    );

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(
    img,
    0,
    0,
    width,
    height
  );

  let quality = 0.82;

  let blob =
    await canvasBlob(
      canvas,
      quality
    );

  for (
    let i = 0;
    i < 8 &&
    blob &&
    blob.size > TARGET_BYTES;
    i++
  ) {
    quality -= 0.08;

    if (quality < 0.25) break;

    blob =
      await canvasBlob(
        canvas,
        quality
      );
  }

  if (
    blob &&
    blob.size > TARGET_BYTES
  ) {
    const ratio =
      Math.sqrt(
        TARGET_BYTES /
          blob.size
      ) * 0.92;

    width = Math.max(
      640,
      Math.round(
        width * ratio
      )
    );

    height = Math.max(
      480,
      Math.round(
        height * ratio
      )
    );

    canvas.width = width;
    canvas.height = height;

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
      type: "image/jpeg"
    }
  );
}

async function uploadPhotos(files) {
  if (
    !currentCustomer ||
    !files.length
  ) {
    return;
  }

  let ok = 0;

  for (const original of files) {
    try {
      const compressed =
        await compressImage(
          original
        );

      const path =
        `${currentUser.id}/${currentCustomer.id}/${compressed.name}`;

      const { error } =
        await sb.storage
          .from(PHOTO_BUCKET)
          .upload(
            path,
            compressed,
            {
              contentType:
                "image/jpeg",
              cacheControl:
                "31536000",
              upsert: false
            }
          );

      if (error) {
        throw error;
      }

      const { error: dbError } =
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
      console.error(error);

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
  if (!currentCustomer) return;

  const { data, error } =
    await sb
      .from("photos")
      .select("*")
      .eq(
        "customer_id",
        currentCustomer.id
      )
      .order("created_at", {
        ascending: false
      });

  if (error) {
    toast(error.message);
    return;
  }

  const photos = data || [];

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
      photo => photo.path
    );

  const {
    data: urls,
    error: urlError
  } =
    await sb.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(
        paths,
        3600
      );

  if (urlError) {
    toast(urlError.message);
    return;
  }

  if ($("gallery")) {
    $("gallery").innerHTML =
      (urls || [])
        .map(
          (item, index) => `
            <figure>
              <img
                loading="lazy"
                src="${item.signedUrl}"
                alt="Fotka okna ${index + 1}">
            </figure>
          `
        )
        .join("");
  }
}

/* =========================================================
   SPUŠTĚNÍ APLIKACE
   ========================================================= */

async function startApp(session) {
  if (!session) {
    currentUser = null;
    customers = [];
    currentCustomer = null;
    appStarted = false;

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

  currentUser = session.user;

  if ($("userLabel")) {
    $("userLabel").textContent =
      currentUser.email || "";
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

  await loadCustomers();

  if (!appStarted) {
    subscribeRealtime();
    appStarted = true;
  }

  showView("homeView");

  if (
    "serviceWorker" in navigator
  ) {
    navigator.serviceWorker
      .register("/sw.js")
      .catch(console.warn);
  }
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
        authTab.dataset.authTab
      );
      return;
    }

    const open =
      e.target.closest(
        "[data-open-customer]"
      );

    if (open) {
      await openCustomer(
        open.dataset.openCustomer
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
      showView("homeView");
      return;
    }

    if (
      e.target.closest(
        "[data-back]"
      )
    ) {
      showView("homeView");
      return;
    }
  }
);

/* =========================================================
   FORMULÁŘE A OVLÁDÁNÍ
   ========================================================= */

if ($("authForm")) {
  $("authForm").addEventListener(
    "submit",
    e => {
      e.preventDefault();

      if (authMode === "login") {
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
        [...e.target.files]
      );
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

if ($("deleteCustomerBtn")) {
  $("deleteCustomerBtn").addEventListener(
    "click",
    deleteCustomer
  );
}

/* =========================================================
   SUPABASE AUTH
   ========================================================= */

setAuthMode("login");

async function initApp() {
  const {
    data: { session }
  } = await sb.auth.getSession();

  await startApp(session);

  sb.auth.onAuthStateChange(
    async (_event, newSession) => {
      await startApp(newSession);
    }
  );
}

initApp();
