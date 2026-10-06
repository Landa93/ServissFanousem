async function renderGallery() {
  if (!currentCustomer) return;

  const { data: photos, error } = await sb
    .from("photos")
    .select("*")
    .eq("customer_id", currentCustomer.id)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    toast(`Chyba načtení fotek: ${error.message}`);
    return;
  }

  const list = photos || [];

  if ($("photoCount")) {
    $("photoCount").textContent = list.length;
  }

  if (!list.length) {
    if ($("gallery")) {
      $("gallery").innerHTML =
        "<p class='muted'>Zatím zde nejsou žádné fotky.</p>";
    }
    return;
  }

  const gallery = $("gallery");

  if (!gallery) return;

  gallery.innerHTML = "";

  for (let i = 0; i < list.length; i++) {
    const photo = list[i];

    const figure = document.createElement("figure");
    figure.className = "photo-item";

    try {
      const { data, error: signedError } =
        await sb.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(
            photo.path,
            3600
          );

      if (signedError) {
        throw signedError;
      }

      if (!data || !data.signedUrl) {
        throw new Error(
          "Supabase nevytvořil odkaz k fotce."
        );
      }

      const img = document.createElement("img");

      img.src = data.signedUrl;
      img.alt = `Fotka okna ${i + 1}`;
      img.loading = "lazy";

      img.addEventListener("click", () => {
        window.open(
          data.signedUrl,
          "_blank"
        );
      });

      img.addEventListener("error", () => {
        figure.innerHTML =
          "<p>Fotku se nepodařilo načíst.</p>";
      });

      figure.appendChild(img);

    } catch (error) {
      console.error(
        "CHYBA ZOBRAZENÍ FOTKY:",
        error
      );

      figure.innerHTML = `
        <p style="color:#b00020;">
          Fotku nelze zobrazit.<br>
          ${error.message}
        </p>
      `;
    }

    gallery.appendChild(figure);
  }
}
