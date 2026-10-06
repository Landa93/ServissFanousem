async function renderGallery() {
  if (!currentCustomer) {
    return;
  }

  const gallery = $("gallery");
  const count = $("photoCount");

  const {
    data: photos,
    error
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

  if (error) {
    console.error(
      "PHOTO DATABASE ERROR:",
      error
    );

    toast(
      `Fotky: ${error.message}`
    );

    return;
  }

  const list =
    photos || [];

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

  const paths =
    list.map(
      photo =>
        photo.path
    );

  const {
    data: signedUrls,
    error: urlError
  } =
    await sb.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(
        paths,
        3600
      );

  if (urlError) {
    console.error(
      "PHOTO URL ERROR:",
      urlError
    );

    toast(
      `Fotku nelze zobrazit: ${urlError.message}`
    );

    return;
  }

  list.forEach(
    (photo, index) => {
      const result =
        signedUrls?.[index];

      if (
        !result ||
        !result.signedUrl
      ) {
        console.error(
          "CHYBÍ SIGNED URL:",
          photo,
          result
        );

        return;
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
        result.signedUrl;

      image.alt =
        `Fotka okna ${index + 1}`;

      image.loading =
        "lazy";

      image.style.cursor =
        "pointer";

      image.addEventListener(
        "click",
        () => {
          window.open(
            result.signedUrl,
            "_blank"
          );
        }
      );

      image.addEventListener(
        "error",
        () => {
          image.alt =
            "Fotku se nepodařilo zobrazit";

          console.error(
            "IMAGE LOAD ERROR:",
            result.signedUrl
          );
        }
      );

      figure.appendChild(
        image
      );

      gallery.appendChild(
        figure
      );
    }
  );
}
