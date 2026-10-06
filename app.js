<div class="photo-actions">

  <label class="upload-btn">
    📷 Vyfotit
    <input
      id="cameraInput"
      type="file"
      accept="image/*"
      capture="environment"
    >
  </label>

  <label class="upload-btn">
    🖼️ Vybrat z knihovny
    <input
      id="photoInput"
      type="file"
      accept="image/*"
      multiple
    >
  </label>

</div>

<p class="hint">
  Fotky se před odesláním automaticky zmenší na přibližně 200 KB.
</p>

<div id="gallery" class="gallery"></div>
