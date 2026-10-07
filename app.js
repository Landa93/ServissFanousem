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
let currentCustomer = null;
let customers = [];
let appStarted = false;

function $(id) {
  return document.getElementById(id);
}

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    "cs-CZ",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(
    "cs-CZ",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function showView(id) {
  document
    .querySelectorAll(".view")
    .forEach(view => {
      view.classList.add("hidden");
    });

  const view = $(id);

  if (view) {
    view.classList.remove("hidden");
  }
}

function setAuthMode(mode) {
  const login = mode === "login";

  if ($("loginForm")) {
    $("loginForm").classList.toggle(
      "hidden",
      !login
    );
  }

  if ($("registerForm")) {
    $("registerForm").classList.toggle(
      "hidden",
      login
    );
  }

  document
    .querySelectorAll("[data-auth-tab]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.authTab === mode
      );
    });
}

/* =========================================================
   PŘIHLÁŠENÍ
   ========================================================= */

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
    console.error(
      "CHYBA PŘIHLÁŠENÍ:",
      error
    );

    toast(
      `Přihlášení se nepodařilo: ${error.message}`
    );

    return;
  }

  toast("Přihlášení proběhlo úspěšně.");
}

async function signUp() {
  const email =
    $("authEmail").value.trim();

  const password =
    $("authPassword").value;

  const { error } =
    await sb.auth.signUp({
      email,
      password
    });

  if (error) {
    toast(
      `Registrace se nepodařila: ${error.message}`
    );

    return;
  }

  toast(
    "Registrace proběhla. Pokud je zapnuté potvrzení e-mailu, zkontroluj e-mail."
  );
}

async function signOut() {
  const { error } =
    await sb.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  currentUser = null;
  currentCustomer = null;
  customers = [];

  showView("authView");
}

/* =========================================================
   ZÁKAZNÍCI
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
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  if (error) {
    console.error(
      "CHYBA NAČTENÍ ZÁKAZNÍKŮ:",
      error
    );

    toast(
      `Zákazníky se nepodařilo načíst: ${error.message}`
    );

    return;
  }

  customers = data || [];

  renderCustomers();
  renderUpcomingServices();
}

function renderCustomers() {
  const list = $("customersList");

  if (!list) return;

  if (!customers.length) {
    list.innerHTML =
      "<p class='muted'>Zatím zde nejsou žádní zákazníci.</p>";

    return;
  }

  list.innerHTML =
    customers
      .map(customer => {
        const status =
          customer.status || "Oprava";

        return `
          <button
            class="customer-card"
            data-open-customer="${escapeHtml(customer.id)}"
          >
            <strong>
              ${escapeHtml(customer.full_name)}
            </strong>

            <span>
              ${escapeHtml(customer.phone || "")}
            </span>

            <small>
              ${escapeHtml(status)}
            </small>
          </button>
        `;
      })
      .join("");
}

function getDaysUntil(value) {
  if (!value) return null;

  const now = new Date();

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const target =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  return Math.ceil(
    (target - today) /
      (1000 * 60 * 60 * 24)
  );
}

function renderUpcomingServices() {
  const list =
    $("upcomingServices");

  if (!list) return;

  const upcoming =
    customers
      .filter(customer => {
        if (
          customer.status !==
          "Dokončeno"
        ) {
          return false;
        }

        const days =
          getDaysUntil(
            customer.annual_service_due
          );

        return (
          days !== null &&
          days >= 0 &&
          days <= 14
        );
      })
      .sort(
        (a, b) =>
          new Date(
            a.annual_service_due
          ) -
          new Date(
            b.annual_service_due
          )
      );

  if (!upcoming.length) {
    list.innerHTML =
      "<p class='muted'>Žádný servis není v příštích 14 dnech.</p>";

    return;
  }

  list.innerHTML =
    upcoming
      .map(customer => {
        const days =
          getDaysUntil(
            customer.annual_service_due
          );

        return `
          <button
            class="service-alert"
            data-open-customer="${escapeHtml(customer.id)}"
          >
            <strong>
              ${escapeHtml(customer.full_name)}
            </strong>

            <span>
              Servis:
              ${formatDate(
                customer.annual_service_due
              )}
            </span>

            <b>
              ${
                days === 0
                  ? "DNES"
                  : `za ${days} dní`
              }
            </b>
          </button>
        `;
      })
      .join("");
}

/* =========================================================
   NOVÝ ZÁKAZNÍK
   ========================================================= */

async function createCustomer() {
  if (!currentUser) return;

  const fullName =
    $("customerName").value.trim();

  const phone =
    $("customerPhone").value.trim();

  const email =
    $("customerEmail").value.trim();

  const address =
    $("customerAddress").value.trim();

  const problem =
    $("customerProblem").value.trim();

  const appointment =
    $("customerAppointment").value;

  if (!fullName) {
    toast("Vyplň jméno zákazníka.");
    return;
  }

  const { data, error } =
    await sb
      .from("customers")
      .insert({
        user_id:
          currentUser.id,

        full_name:
          fullName,

        phone,

        email,

        address,

        problem,

        appointment_at:
          appointment || null,

        status:
          "Nový",

        completed_at:
          null,

        annual_service_due:
          null
      })
      .select()
      .single();

  if (error) {
    console.error(
      "CHYBA VYTVOŘENÍ ZÁKAZNÍKA:",
      error
    );

    toast(
      `Zákazníka se nepodařilo vytvořit: ${error.message}`
    );

    return;
  }

  customers.unshift(data);

  if ($("customerName")) {
    $("customerName").value = "";
  }

  if ($("customerPhone")) {
    $("customerPhone").value = "";
  }

  if ($("customerEmail")) {
    $("customerEmail").value = "";
  }

  if ($("customerAddress")) {
    $("customerAddress").value = "";
  }

  if ($("customerProblem")) {
    $("customerProblem").value = "";
  }

  if ($("customerAppointment")) {
    $("customerAppointment").value = "";
  }

  toast("Zákazník byl uložen.");

  renderCustomers();
  renderUpcomingServices();

  showView("customersView");
}

/* =========================================================
   DETAIL ZÁKAZNÍKA
   ========================================================= */

async function openCustomer(id) {
  const customer =
    customers.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!customer) {
    toast(
      "Zákazníka se nepodařilo najít."
    );

    return;
  }

  currentCustomer = customer;

  if ($("detailTitle")) {
    $("detailTitle").textContent =
      customer.full_name || "Zákazník";
  }

  if ($("detailPhone")) {
    $("detailPhone").textContent =
      customer.phone || "—";

    $("detailPhone").href =
      customer.phone
        ? `tel:${customer.phone}`
        : "#";
  }

  if ($("detailEmail")) {
    $("detailEmail").textContent =
      customer.email || "—";

    $("detailEmail").href =
      customer.email
        ? `mailto:${customer.email}`
        : "#";
  }

  if ($("detailAddress")) {
    $("detailAddress").textContent =
      customer.address || "—";
  }

  if ($("detailProblem")) {
    $("detailProblem").textContent =
      customer.problem || "—";
  }

  if ($("detailAppointment")) {
    $("detailAppointment").textContent =
      formatDateTime(
        customer.appointment_at
      );
  }

  if ($("detailAnnual")) {
    $("detailAnnual").textContent =
      formatDate(
        customer.annual_service_due
      );
  }

  if ($("detailStatus")) {
    $("detailStatus").textContent =
      customer.status || "—";
  }

  if ($("editPhone")) {
    $("editPhone").value =
      customer.phone || "";
  }

  if ($("editEmail")) {
    $("editEmail").value =
      customer.email || "";
  }

  if ($("editAddress")) {
    $("editAddress").value =
      customer.address || "";
  }

  if ($("editProblem")) {
    $("editProblem").value =
      customer.problem || "";
  }

  if ($("editAppointment")) {
    $("editAppointment").value =
      customer.appointment_at
        ? customer.appointment_at.slice(
            0,
            16
          )
        : "";
  }

  showView("detailView");

  await renderGallery();
}

/* =========================================================
   ULOŽENÍ ZMĚN
   ========================================================= */

async function saveCustomerDetail() {
  if (
    !currentUser ||
    !currentCustomer
  ) {
    return;
  }

  const updates = {
    phone:
      $("editPhone")?.value.trim() ||
      "",

    email:
      $("editEmail")?.value.trim() ||
      "",

    address:
      $("editAddress")?.value.trim() ||
      "",

    problem:
      $("editProblem")?.value.trim() ||
      "",

    appointment_at:
      $("editAppointment")?.value ||
      null
  };

  const { data, error } =
    await sb
      .from("customers")
      .update(updates)
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
      `Změny se nepodařilo uložit: ${error.message}`
    );

    return;
  }

  currentCustomer = data;

  customers =
    customers.map(customer =>
      String(customer.id) ===
      String(data.id)
        ? data
        : customer
    );

  await openCustomer(data.id);

  toast("Změny byly uloženy.");
}

/* =========================================================
   DOKONČENÍ OPRAVY → ROČNÍ SERVIS
   ========================================================= */

async function completeRepair() {
  if (
    !currentUser ||
    !currentCustomer
  ) {
    return;
  }

  const today =
    new Date();

  const annual =
    new Date(
      today.getFullYear() + 1,
      today.getMonth(),
      today.getDate()
    );

  const annualDate =
    annual.toISOString();

  const { data, error } =
    await sb
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
    toast(
      `Opravu se nepodařilo dokončit: ${error.message}`
    );

    return;
  }

  currentCustomer = data;

  customers =
    customers.map(customer =>
      String(customer.id) ===
      String(data.id)
        ? data
        : customer
    );

  await openCustomer(data.id);

  renderUpcomingServices();

  toast(
    `Oprava dokončena. Roční servis je naplánovaný na ${formatDate(annualDate)}.`
  );
}

/* =========================================================
   SMAZÁNÍ ZÁKAZNÍKA
   ========================================================= */

async function deleteCustomer() {
  if (
    !currentUser ||
    !currentCustomer
  ) {
    return;
  }

  const confirmed =
    confirm(
      `Opravdu chceš smazat zákazníka "${currentCustomer.full_name}"?`
    );

  if (!confirmed) return;

  const { data: photos } =
    await sb
      .from("photos")
      .select("path")
      .eq(
        "customer_id",
        currentCustomer.id
      );

  if (photos?.length) {
    const paths =
      photos
        .map(photo => photo.path)
        .filter(Boolean);

    if (paths.length) {
      await sb.storage
        .from(PHOTO_BUCKET)
        .remove(paths);
    }
  }

  await sb
    .from("photos")
    .delete()
    .eq(
      "customer_id",
      currentCustomer.id
    );

  const { error } =
    await sb
      .from("customers")
      .delete()
      .eq(
        "id",
        currentCustomer.id
      )
      .eq(
        "user_id",
        currentUser.id
      );

  if (error) {
    toast(
      `Zákazníka se nepodařilo smazat: ${error.message}`
    );

    return;
  }

  customers =
    customers.filter(
      customer =>
        String(customer.id) !==
        String(currentCustomer.id)
    );

  currentCustomer = null;

  renderCustomers();
  renderUpcomingServices();

  showView("customersView");

  toast("Zákazník byl smazán.");
}

/* =========================================================
   KOMPRESNÍ FOTKY
   ========================================================= */

async function compressImage(file) {
  const image =
    new Image();

  const url =
    URL.createObjectURL(file);

  try {
    await new Promise(
      (resolve, reject) => {
        image.onload =
          resolve;

        image.onerror =
          reject;

        image.src = url;
      }
    );

    const maxSize = 1600;

    let width =
      image.naturalWidth;

    let height =
      image.naturalHeight;

    if (
      width > maxSize ||
      height > maxSize
    ) {
      const ratio =
        Math.min(
          maxSize / width,
          maxSize / height
        );

      width =
        Math.round(
          width * ratio
        );

      height =
        Math.round(
          height * ratio
        );
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext("2d");

    ctx.drawImage(
      image,
      0,
      0,
      width,
      height
    );

    let quality = 0.8;

    let blob =
      await new Promise(
        resolve =>
          canvas.toBlob(
            resolve,
            "image/jpeg",
            quality
          )
      );

    while (
      blob &&
      blob.size > TARGET_BYTES &&
      quality > 0.35
    ) {
      quality -= 0.1;

      blob =
        await new Promise(
          resolve =>
            canvas.toBlob(
              resolve,
              "image/jpeg",
              quality
            )
        );
    }

    if (!blob) {
      throw new Error(
        "Fotku se nepodařilo zpracovat."
      );
    }

    const name =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.jpg`;

    return new File(
      [blob],
      name,
      {
        type: "image/jpeg"
      }
    );

  } finally {
    URL.revokeObjectURL(url);
  }
}

/* =========================================================
   NAHRÁVÁNÍ FOTEK
   ========================================================= */

async function uploadPhotos(files) {
  if (
    !currentCustomer ||
    !files.length
  ) {
    return;
  }

  if (!currentUser) {
    toast(
      "Nejsi přihlášen."
    );

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
        "CHYBA UPLOADU FOTKY:",
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

/* =========================================================
   GALERIE FOTEK
   ========================================================= */



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

  const gallery =
    $("gallery");

  if (!gallery) return;

  gallery.innerHTML = "";

  for (
    let index = 0;
    index < photos.length;
    index++
  ) {
    const photo =
      photos[index];

    const figure =
      document.createElement(
        "figure"
      );

    try {
      const {
        data: signedData,
        error: signedError
      } =
        await sb.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(
            photo.path,
            3600
          );

      if (signedError) {
        throw signedError;
      }

      if (
        !signedData ||
        !signedData.signedUrl
      ) {
        throw new Error(
          "Supabase nevytvořil odkaz k fotce."
        );
      }

      const img =
        document.createElement(
          "img"
        );

      img.loading =
        "lazy";

      img.src =
        signedData.signedUrl;

      img.alt =
        `Fotka okna ${index + 1}`;

      img.style.cursor =
        "pointer";

      img.addEventListener(
        "click",
        () => {
          window.open(
            signedData.signedUrl,
            "_blank"
          );
        }
      );

      img.addEventListener(
        "error",
        () => {
          figure.innerHTML = `
            <p style="color:#b00020;">
              Fotku se nepodařilo načíst.
            </p>
          `;
        }
      );

      figure.appendChild(
        img
      );

    } catch (error) {
      console.error(
        "CHYBA ZOBRAZENÍ FOTKY:",
        error
      );

      figure.innerHTML = `
        <p style="color:#b00020;">
          Fotku nelze zobrazit.<br>
          ${error.message || "Neznámá chyba"}
        </p>
      `;
    }

    gallery.appendChild(
      figure
    );
  }
}

/* =========================================================
   SPUŠTĚNÍ APLIKACE
   ========================================================= */

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
    console.error(
      "CHYBA NAČTENÍ FOTEK:",
      error
    );

    toast(
      `Chyba načtení fotek: ${error.message}`
    );

    return;
  }

  const photos = data || [];

  if ($("photoCount")) {
    $("photoCount").textContent =
      photos.length;
  }

  const gallery =
    $("gallery");

  if (!gallery) return;

  gallery.innerHTML = "";

  if (!photos.length) {
    gallery.innerHTML =
      "<p class='muted'>Zatím zde nejsou žádné fotky.</p>";

    return;
  }

  for (
    let index = 0;
    index < photos.length;
    index++
  ) {
    const photo =
      photos[index];

    const figure =
      document.createElement(
        "figure"
      );

    try {
      const {
        data: signedData,
        error: signedError
      } =
        await sb.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(
            photo.path,
            3600
          );

      if (signedError) {
        throw signedError;
      }

      if (
        !signedData ||
        !signedData.signedUrl
      ) {
        throw new Error(
          "Supabase nevytvořil odkaz k fotce."
        );
      }

      const img =
        document.createElement(
          "img"
        );

      img.src =
        signedData.signedUrl;

      img.alt =
        `Fotka ${index + 1}`;

      img.loading =
        "lazy";

      img.style.cursor =
        "pointer";

      img.addEventListener(
        "click",
        () => {
          window.open(
            signedData.signedUrl,
            "_blank"
          );
        }
      );

      img.addEventListener(
        "error",
        () => {
          figure.innerHTML =
            "<p style='color:#b00020;'>Fotku se nepodařilo načíst.</p>";
        }
      );

      figure.appendChild(
        img
      );

    } catch (error) {
      console.error(
        "CHYBA ZOBRAZENÍ FOTKY:",
        error
      );

      figure.innerHTML = `
        <p style="color:#b00020;">
          Fotku nelze zobrazit.<br>
          ${error.message || "Neznámá chyba"}
        </p>
      `;
    }

    gallery.appendChild(
      figure
    );
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
      showView(
        "homeView"
      );

      return;
    }

    if (
      e.target.closest(
        "#saveDetailBtn"
      )
    ) {
      await saveCustomerDetail();

      return;
    }

    if (
      e.target.closest(
        "#completeBtn"
      )
    ) {
      await completeRepair();

      return;
    }

    if (
      e.target.closest(
        "#deleteCustomerBtn"
      )
    ) {
      await deleteCustomer();

      return;
    }

    if (
      e.target.closest(
        "#logoutBtn"
      )
    ) {
      await signOut();

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

      return;
    }

    if (
      e.target.closest(
        "#loginBtn"
      )
    ) {
      await signIn();

      return;
    }

    if (
      e.target.closest(
        "#registerBtn"
      )
    ) {
      await signUp();

      return;
    }

    if (
      e.target.closest(
        "#createCustomerBtn"
      )
    ) {
      await createCustomer();

      return;
    }
  }
);

/* =========================================================
   FOTKY
   ========================================================= */

document.addEventListener(
  "change",
  async e => {

    if (
      e.target.matches(
        "#photoInput"
      )
    ) {
      const files =
        Array.from(
          e.target.files || []
        );

      if (!files.length) {
        return;
      }

      await uploadPhotos(
        files
      );

      e.target.value = "";
    }
  }
);

/* =========================================================
   REALTIME
   ========================================================= */

function subscribeRealtime() {
  if (!currentUser) return;

  sb
    .channel(
      `customers-${currentUser.id}`
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

        if (
          currentCustomer
        ) {
          const updated =
            customers.find(
              customer =>
                String(
                  customer.id
                ) ===
                String(
                  currentCustomer.id
                )
            );

          if (updated) {
            currentCustomer =
              updated;

            await openCustomer(
              updated.id
            );
          }
        }
      }
    )
    .subscribe();
}

/* =========================================================
   AUTH STAV
   ========================================================= */

sb.auth.onAuthStateChange(
  async (
    event,
    session
  ) => {
    await startApp(
      session
    );
  }
);

/* =========================================================
   START
   ========================================================= */

(async function init() {
  const {
    data: {
      session
    }
  } =
    await sb.auth.getSession();

  await startApp(
    session
  );
})();
