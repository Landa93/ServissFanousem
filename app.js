async function renderGallery() {
  if (!currentCustomer) {
    return;
  }

  const gallery = $("gallery");
  const count = $("photoCount");

  const {
    data: photos,
    error: photosError
  } = await sb
    .from("photos")
    .select("*")
    .eq(
      "customer_id",
      currentCustomer.id
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (photosError) {
    console.error(
      "CHYBA DB FOTEK:",
      photosError
    );

    toast(
      `Fotky: ${photosError.message}`
    );

    return;
  }

  const list = photos || [];

  if (count) {
    count.textContent =
      String(list.length);
  }

  if (!gallery) {
    return;
  }

  gallery.innerHTML = "";

  if (!list.length) {
    gallery.innerHTML =
      `<p class="muted">
        Zatím zde nejsou žádné fotky.
      </p>`;

    return;
  }

  for (let i = 0; i < list.length; i++) {
    const photo = list[i];

    try {
      const {
        data: signed,
        error: signedError
      } = await sb.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(
          photo.path,
          3600
        );

      if (signedError) {
        console.error(
          "CHYBA URL FOTKY:",
          photo.path,
          signedError
        );

        toast(
          `Fotku nelze zobrazit: ${signedError.message}`
        );

        continue;
      }

      if (
        !signed ||
        !signed.signedUrl
      ) {
        console.error(
          "SUPABASE NEVRÁTIL URL:",
          photo
        );

        continue;
      }

      const figure =
        document.createElement(
          "figure"
        );

      figure.className =
        "gallery-item";

      const image =
        document.createElement(
          "img"
        );

      image.src =
        signed.signedUrl;

      image.alt =
        `Fotka ${i + 1}`;

      image.loading =
        "lazy";

      image.style.cursor =
        "pointer";

      image.addEventListener(
        "click",
        () => {
          window.open(
            signed.signedUrl,
            "_blank"
          );
        }
      );

      image.addEventListener(
        "error",
        () => {
          console.error(
            "PROHLÍŽEČ NENAČETL FOTKU:",
            signed.signedUrl
          );

          image.style.display =
            "none";

          const errorText =
            document.createElement(
              "div"
            );

          errorText.textContent =
            "Fotku se nepodařilo načíst.";

          figure.appendChild(
            errorText
          );
        }
      );

      figure.appendChild(
        image
      );

      gallery.appendChild(
        figure
      );

    } catch (error) {
      console.error(
        "CHYBA GALERIE:",
        error
      );

      toast(
        `Galerie: ${error.message}`
      );
    }
  }
}
