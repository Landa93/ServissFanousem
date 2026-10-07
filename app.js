/* =========================================================
   ServisSFanoušem – NOVÁ VERZE
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
let authMode = "login";

const $ = id => document.getElementById(id);

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(
    () => el.classList.remove("show"),
    3500
  );
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[ch])
  );
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

function daysUntil(value) {
  if (!value) return 999999;

  const d = new Date(`${value}T00:00:00`);
  const now = new Date();

  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  return Math.ceil(
    (d - now) / 86400000
  );
}

function nextAnnualDate(baseDate = new Date()) {
  const d = new Date(baseDate);

  d.setFullYear(
    d.getFullYear() + 1
  );

  return d.toISOString().slice(0, 10);
}

function showView(id) {
  [
    "homeView",
    "customersView",
    "customerFormView",
    "detailView"
  ].forEach(name => {
    const el = $(name);

    if (el) {
      el.classList.add("hidden");
    }
  });

  const target = $(id);

  if (target) {
    target.classList.remove("hidden");
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
    .querySelectorAll("[data-auth-tab]")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.authTab === mode
      );
    });

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      mode === "login"
        ? "Přihlásit"
        : "Vytvořit účet";
  }
}

async function signIn() {
  const email =
    $("authEmail")?.value.trim();

  const password =
    $("authPassword")?.value || "";

  if (!email || !password) {
    toast("Vyplň e-mail a heslo.");
    return;
  }

  const {
    data,
    error
  } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error(error);

    toast(
      `Přihlášení se nepodařilo: ${error.message}`
    );

    return;
  }

  if (!data.session) {
    toast(
      "Přihlášení se nepodařilo dokončit."
    );

    return;
  }

  await startApp(data.session);
}

async function signUp() {
  const email =
    $("authEmail")?.value.trim();

  const password =
    $("authPassword")?.value || "";

  if (!email || !password) {
    toast("Vyplň e-mail a heslo.");
    return;
  }

  if (password.length < 6) {
    toast(
      "Heslo musí mít alespoň 6 znaků."
    );

    return;
  }

  const {
    data,
    error
  } = await sb.auth.signUp({
    email,
    password
  });

  if (error) {
    toast(
      `Registrace se nepodařila: ${error.message}`
    );

    return;
  }

  if (data.session) {
    await startApp(data.session);
  } else {
    toast(
      "Účet je vytvořen. Pokud Supabase vyžaduje potvrzení e-mailu, potvrď ho a potom se přihlas."
    );
  }
}

async function logout() {
  await sb.auth.signOut();

  currentUser = null;
  customers = [];
  currentCustomer = null;

  if ($("appView")) {
    $("appView").classList.add("hidden");
  }

  if ($("authView")) {
    $("authView").classList.remove("hidden");
  }

  showView("homeView");
}


/* =========================================================
   ZÁKAZNÍCI
   ========================================================= */

async function loadCustomers() {
  if (!currentUser) return;

  const {
    data,
    error
  } = await sb
    .from("customers")
    .select("*")
    .eq(
      "user_id",
      currentUser.id
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {
    console.error(error);

    toast(
      `Chyba zákazníků: ${error.message}`
    );

    return;
  }

  customers = data || [];

  renderHome();
  renderCustomers();

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

function renderHome() {
  const reminders =
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

  if ($("reminderCount")) {
    $("reminderCount").textContent =
      reminders.length;
  }

  if ($("reminders")) {
    $("reminders").innerHTML =
      reminders.length
        ? reminders
            .map(c => {
              const days =
                daysUntil(
                  c.annual_service_due
                );

              const when =
                days < 0
                  ? `po termínu o ${Math.abs(days)} dní`
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
                      ${esc(c.full_name)}
                    </strong>

                    <span>
                      ${esc(c.phone || "")}
                    </span>

                    <small>
                      Roční servis
                      ${fmtDate(
                        c.annual_service_due
                      )}
                      —
                      <b>${when}</b>
                    </small>

                  </div>

                  <button
                    class="primary"
                    data-open-customer="${c.id}"
                  >
                    Otevřít
                  </button>

                </div>
              `;
            })
            .join("")
        : "<p class='muted'>Žádný servis není do 14 dní.</p>";
  }

  if ($("stats")) {
    $("stats").innerHTML = `
      <div class="stat">
        <span>Zákazníků</span>
        <b>${customers.length}</b>
      </div>

      <div class="stat">
        <span>Naplánováno</span>
        <b>
          ${
            customers.filter(
              c =>
                c.status ===
                "Naplánováno"
            ).length
          }
        </b>
      </div>

      <div class="stat">
        <span>Roční servis</span>
        <b>
          ${
            customers.filter(
              c =>
                c.annual_service_due
            ).length
          }
        </b>
      </div>
    `;
  }
}

function renderCustomers() {
  const search =
    $("customerSearch")
      ?.value
      .toLowerCase()
      .trim() || "";

  const list =
    customers.filter(c =>
      [
        c.full_name,
        c.phone,
        c.email,
        c.address,
        c.problem
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );

  if (!$("customerList")) {
    return;
  }

  $("customerList").innerHTML =
    list.length
      ? list
          .map(
            c => `
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

                    ${esc(
                      c.status || ""
                    )}

                    ${
                      c.appointment_at
                        ? ` · servis ${fmtDate(
                            c.appointment_at,
                            true
                          )}`
                        : ""
                    }

                    ${
                      c.annual_service_due
                        ? ` · roční servis ${fmtDate(
                            c.annual_service_due
                          )}`
                        : ""
                    }

                  </small>

                </div>

                <button
                  class="primary"
                  data-open-customer="${c.id}"
                >
                  Detail
                </button>

              </div>
            `
          )
          .join("")
      : "<p class='muted'>Žádný zákazník.</p>";
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
        c.status === "Dokončeno"
          ? "done"
          : "planned"
      }">
        ${esc(
          c.status ||
          "Naplánováno"
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
    $("completeBtn").classList.toggle(
      "hidden",
      ![
        "Naplánováno",
        "V řešení"
      ].includes(c.status)
    );
  }

  if ($("saveDetailBtn")) {
    $("saveDetailBtn").textContent =
      "Upravit zákazníka";
  }

  renderNotes();
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

  showView("detailView");

  await renderGallery();
}

async function editCustomer() {
  if (!currentCustomer) {
    return;
  }

  const fullName =
    prompt(
      "Jméno a příjmení:",
      currentCustomer.full_name || ""
    );

  if (fullName === null) return;

  const phone =
    prompt(
      "Telefon:",
      currentCustomer.phone || ""
    );

  if (phone === null) return;

  const email =
    prompt(
      "E-mail:",
      currentCustomer.email || ""
    );

  if (email === null) return;

  const address =
    prompt(
      "Adresa:",
      currentCustomer.address || ""
    );

  if (address === null) return;

  const problem =
    prompt(
      "Popis problému:",
      currentCustomer.problem || ""
    );

  if (problem === null) return;

  const {
    data,
    error
  } = await sb
    .from("customers")
    .update({
      full_name:
        fullName.trim(),

      phone:
        phone.trim(),

      email:
        email.trim(),

      address:
        address.trim(),

      problem:
        problem.trim()
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

  customers =
    customers.map(c =>
      c.id === data.id
        ? data
        : c
    );

  renderHome();
  renderCustomers();
  renderDetail();

  toast(
    "Zákazník uložen."
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
      ?.value
      .trim();

  if (!fullName) {
    toast(
      "Vyplňte jméno zákazníka."
    );

    return;
  }

  const appointmentValue =
    $("appointmentAt")
      ?.value || "";

  const payload = {
    user_id:
      currentUser.id,

    full_name:
      fullName,

    phone:
      $("phone")
        ?.value
        .trim() || "",

    email:
      $("email")
        ?.value
        .trim() || "",

    address:
      $("address")
        ?.value
        .trim() || "",

    problem:
      $("problem")
        ?.value
        .trim() || "",

    appointment_at:
      appointmentValue
        ? new Date(
            appointmentValue
          ).toISOString()
        : null,

    status:
      "Naplánováno",

    completed_at:
      null,

    annual_service_due:
      null
  };

  const {
    data,
    error
  } = await sb
    .from("customers")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error(error);

    toast(
      `Zákazník se nepodařil uložit: ${error.message}`
    );

    return;
  }

  customers = [
    data,
    ...customers.filter(
      c =>
        c.id !== data.id
    )
  ];

  if ($("customerForm")) {
    $("customerForm").reset();
  }

  currentCustomer =
    data;

  renderHome();
  renderCustomers();
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
   DOKONČENÍ OPRAVY
   → DALŠÍ ROČNÍ SERVIS
   ========================================================= */

async function completeRepair() {
  if (
    !currentCustomer ||
    !currentUser
  ) {
    return;
  }

  const base =
    currentCustomer
      .appointment_at
      ? new Date(
          currentCustomer
            .appointment_at
        )
      : new Date();

  const annualDate =
    nextAnnualDate(base);

  const confirmed =
    confirm(
      `Oprava zákazníka ${currentCustomer.full_name} bude dokončena.\n\n`
      +
      `Další roční servis bude naplánován na ${fmtDate(annualDate)}.\n\n`
      +
      `14 dní před termínem se zobrazí upozornění.`
    );

  if (!confirmed) {
    return;
  }

  const {
    data,
    error
  } = await sb
    .from("customers")
    .update({
      status:
        "Dokončeno",

      completed_at:
        new Date().toISOString(),

      annual_service_due:
        annualDate
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

  customers =
    customers.map(c =>
      c.id === data.id
        ? data
        : c
    );

  renderHome();
  renderCustomers();
  renderDetail();

  toast(
    `Hotovo. Další servis: ${fmtDate(
      annualDate
    )}.`
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

  const name =
    currentCustomer.full_name;

  if (
    !confirm(
      `Opravdu smazat zákazníka ${name}?\n\n`
      +
      `Smažou se také jeho fotky a poznámky.`
    )
  ) {
    return;
  }

  const customerId =
    currentCustomer.id;

  const {
    data: photos,
    error: photoListError
  } = await sb
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

  if (photoListError) {
    toast(
      photoListError.message
    );

    return;
  }

  if (photos?.length) {
    const {
      error
    } =
      await sb.storage
        .from(
          PHOTO_BUCKET
        )
        .remove(
          photos.map(
            p => p.path
          )
        );

    if (error) {
      console.warn(
        "Storage delete:",
        error
      );
    }
  }

  const {
    error: photosDeleteError
  } = await sb
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

  if (photosDeleteError) {
    toast(
      photosDeleteError.message
    );

    return;
  }

  const {
    error
  } = await sb
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
    toast(error.message);
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

  showView(
    "customersView"
  );

  toast(
    "Zákazník byl smazán."
  );
}


/* =========================================================
   POZNÁMKY
   ========================================================= */

async function renderNotes() {
  if (
    !currentCustomer ||
    !$("notesBox")
  ) {
    return;
  }

  $("notesBox").value =
    currentCustomer.notes ||
    "";
}

async function saveNotes() {
  if (
    !currentCustomer ||
    !currentUser
  ) {
    return;
  }

  const notes =
    $("notesBox")
      ?.value || "";

  const {
    data,
    error
  } = await sb
    .from("customers")
    .update({
      notes
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
      "Poznámky nelze uložit. Spusť dodané SQL v Supabase."
    );

    console.error(error);

    return;
  }

  currentCustomer =
    data;

  customers =
    customers.map(c =>
      c.id === data.id
        ? data
        : c
    );

  toast(
    "Poznámky uloženy."
  );
}


/* =========================================================
   FOTKY
   ========================================================= */

function loadImage(file) {
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

      img.onerror = () => {
        URL.revokeObjectURL(
          url
        );

        reject(
          new Error(
            "Fotku nelze načíst."
          )
        );
      };

      img.src = url;
    }
  );
}

function blobFromCanvas(
  canvas,
  quality
) {
  return new Promise(
    resolve =>
      canvas.toBlob(
        resolve,
        "image/jpeg",
        quality
      )
  );
}

async function compressImage(
  file
) {
  const img =
    await loadImage(file);

  let width =
    img.naturalWidth;

  let height =
    img.naturalHeight;

  const maxSide =
    1600;

  const scale =
    Math.min(
      1,
      maxSide /
        Math.max(
          width,
          height
        )
    );

  width =
    Math.max(
      1,
      Math.round(
        width * scale
      )
    );

  height =
    Math.max(
      1,
      Math.round(
        height * scale
      )
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  const ctx =
    canvas.getContext(
      "2d"
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
    await blobFromCanvas(
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
    quality -= 0.07;

    if (
      quality < 0.25
    ) {
      break;
    }

    blob =
      await blobFromCanvas(
        canvas,
        quality
      );
  }

  if (!blob) {
    throw new Error(
      "Fotku se nepodařilo zpracovat."
    );
  }

  if (
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
          width * ratio
        )
      );

    height =
      Math.max(
        480,
        Math.round(
          height * ratio
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
      await blobFromCanvas(
        canvas,
        0.72
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
    !currentUser ||
    !files.length
  ) {
    return;
  }

  let uploaded = 0;

  for (
    const file of files
  ) {
    try {
      const compressed =
        await compressImage(
          file
        );

      const path =
        `${currentUser.id}/${currentCustomer.id}/${compressed.name}`;

      const {
        error: uploadError
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

      if (uploadError) {
        throw uploadError;
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
        await sb.storage
          .from(
            PHOTO_BUCKET
          )
          .remove([
            path
          ]);

        throw dbError;
      }

      uploaded++;

    } catch (error) {
      console.error(error);

      toast(
        `Fotku se nepodařilo nahrát: ${error.message}`
      );
    }
  }

  if (uploaded) {
    toast(
      `${uploaded} fotka/fotek nahráno.`
    );
  }

  await renderGallery();
}

async function renderGallery() {
  if (
    !currentCustomer ||
    !$("gallery")
  ) {
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
      `Fotky: ${error.message}`
    );

    return;
  }

  const photos =
    data || [];

  if ($("photoCount")) {
    $("photoCount")
      .textContent =
      photos.length;
  }

  if (!photos.length) {
    $("gallery").innerHTML =
      "<p class='muted'>Zatím zde nejsou žádné fotky.</p>";

    return;
  }

  $("gallery").innerHTML =
    "";

  for (
    let i = 0;
    i < photos.length;
    i++
  ) {
    const photo =
      photos[i];

    const {
      data: signed,
      error: signedError
    } =
      await sb.storage
        .from(
          PHOTO_BUCKET
        )
        .createSignedUrl(
          photo.path,
          3600
        );

    const figure =
      document.createElement(
        "figure"
      );

    if (
      signedError ||
      !signed?.signedUrl
    ) {
      figure.innerHTML =
        "<p style='color:#b00020'>Fotku nelze zobrazit.</p>";
    } else {
      const img =
        document.createElement(
          "img"
        );

      img.src =
        signed.signedUrl;

      img.alt =
        `Fotka ${i + 1}`;

      img.loading =
        "lazy";

      img.style.cursor =
        "pointer";

      img.onclick = () =>
        window.open(
          signed.signedUrl,
          "_blank"
        );

      figure.appendChild(
        img
      );
    }

    $("gallery")
      .appendChild(
        figure
      );
  }
}


/* =========================================================
   START APLIKACE
   ========================================================= */

async function startApp(
  session
) {
  if (!session) {
    currentUser =
      null;

    customers = [];

    currentCustomer =
      null;

    if ($("appView")) {
      $("appView")
        .classList
        .add("hidden");
    }

    if ($("authView")) {
      $("authView")
        .classList
        .remove("hidden");
    }

    return;
  }

  currentUser =
    session.user;

  if ($("userLabel")) {
    $("userLabel")
      .textContent =
      currentUser.email ||
      "";
  }

  if ($("authView")) {
    $("authView")
      .classList
      .add("hidden");
  }

  if ($("appView")) {
    $("appView")
      .classList
      .remove("hidden");
  }

  await loadCustomers();

  showView(
    "homeView"
  );
}


/* =========================================================
   EVENTY
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

      renderHome();

      return;
    }

    if (
      e.target.closest(
        "[data-back]"
      )
    ) {
      showView(
        "customersView"
      );

      renderCustomers();

      return;
    }
  }
);


/* =========================================================
   FORMULÁŘE A TLAČÍTKA
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
      async e => {

        const files =
          [
            ...e.target.files
          ];

        e.target.value =
          "";

        await uploadPhotos(
          files
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

if ($("saveNotesBtn")) {
  $("saveNotesBtn")
    .addEventListener(
      "click",
      saveNotes
    );
}


/* =========================================================
   SPUŠTĚNÍ APLIKACE
   ========================================================= */

setAuthMode(
  "login"
);

sb.auth.onAuthStateChange(
  (event, session) => {

    if (
      event ===
      "SIGNED_OUT"
    ) {
      startApp(
        null
      );
    }
  }
);

(async function boot() {

  const {
    data,
    error
  } =
    await sb.auth
      .getSession();

  if (error) {
    console.error(
      error
    );

    toast(
      `Chyba přihlášení: ${error.message}`
    );

    return;
  }

  await startApp(
    data.session
  );

})();
