SERVISSFANOUŠEM – RYCHLÉ SPUŠTĚNÍ

1. V Supabase vytvoř nový projekt.
2. V SQL Editoru spusť celý soubor supabase.sql.
3. V Authentication > Providers > Email nastav:
   - povolit Email provider
   - pro nejrychlejší první spuštění lze vypnout Confirm email.
   - pro bezpečnější produkční použití doporučuji Confirm email ponechat zapnutý.
4. V Supabase najdi Project URL a Publishable/anon key.
5. Otevři app.js a nahraď:
   PASTE_YOUR_SUPABASE_URL_HERE
   PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE
6. Nahraj všechny soubory do GitHub repozitáře.
7. Ve Vercelu dej Add New > Project > Import Git Repository.
8. Framework Preset: Other. Build Command nech prázdný.
9. Deploy.
10. Otevři URL Vercelu. Zaregistruj se.

Poznámky:
- Nikdy nevkládej service_role key do app.js.
- Přihlášení je persistentní přes Supabase Auth.
- Realtime okamžitě obnovuje seznam při změně v databázi.
- Fotky se v telefonu nejprve zmenší přes Canvas a JPEG kompresi, cílem je cca 200 KB.
- Fotografie jsou v privátním Storage bucketu a zobrazují se přes časově omezené signed URL.
- Sekce "Blížící se servisy" ukazuje roční servis v termínu <= 14 dní včetně po termínu.
- Tato jednoduchá verze neposílá spolehlivé systémové push notifikace, když je aplikace úplně zavřená. Upozornění je řešeno přímo v aplikaci; pro skutečné iOS push notifikace je potřeba doplnit Web Push + serverovou/cron část.
