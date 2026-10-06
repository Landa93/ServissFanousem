/* =========================================================
   ServisSFanoušem
   
   2) Spusť SQL ze souboru supabase.sql.
   ========================================================= */
const SUPABASE_URL = "https://ujtpluckaenrplkfpzgi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5Sf5fpEYUA2Q3dp74c1q3w_XzKRTST7";
const PHOTO_BUCKET = "photos";
const TARGET_BYTES = 200 * 1024;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let currentUser = null;
let customers = [];
let currentCustomer = null;
let realtimeChannel = null;
let authMode = "login";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function toast(message){
  const el=$("toast"); el.textContent=message; el.classList.add("show");
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove("show"),3200);
}
function fmtDate(value, withTime=false){
  if(!value) return "—";
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("cs-CZ",withTime?{dateStyle:"medium",timeStyle:"short"}:{dateStyle:"medium"}).format(d);
}
function daysUntil(dateValue){
  const d=new Date(dateValue+"T00:00:00");
  const now=new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d-now)/86400000);
}
function nextYearDate(){
  const d=new Date();
  d.setFullYear(d.getFullYear()+1);
  return d.toISOString().slice(0,10);
}
function showView(name){
  ["homeView","customersView","customerFormView","detailView"].forEach(v=>$(v).classList.add("hidden"));
  $(name).classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}
function setAuthMode(mode){
  authMode=mode;
  document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("active",b.dataset.authTab===mode));
  $("authSubmit").textContent=mode==="login"?"Přihlásit":"Vytvořit účet";
  $("authPassword").autocomplete=mode==="login"?"current-password":"new-password";
  $("authHint").textContent=mode==="login"?"Přihlášení zůstává uložené v tomto zařízení.":"Vytvoř účet e-mailem a heslem.";
}

async function loadCustomers(){
  const {data,error}=await sb.from("customers").select("*").order("created_at",{ascending:false});
  if(error){ toast(error.message); return; }
  customers=data||[];
  renderHome();
  renderCustomers();
  if(currentCustomer) {
    const fresh=customers.find(c=>c.id===currentCustomer.id);
    if(fresh){ currentCustomer=fresh; renderDetail(); }
  }
}
function subscribeRealtime(){
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel=sb.channel("customers-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"customers",filter:`user_id=eq.${currentUser.id}`},()=>loadCustomers())
    .on("postgres_changes",{event:"*",schema:"public",table:"photos",filter:`user_id=eq.${currentUser.id}`},()=>{
      if(currentCustomer) renderGallery();
    })
    .subscribe();
}
function renderHome(){
  const due=customers.filter(c=>c.annual_service_due).filter(c=>daysUntil(c.annual_service_due)<=14);
  $("reminderCount").textContent=due.length;
  $("reminders").innerHTML=due.length?due.sort((a,b)=>a.annual_service_due.localeCompare(b.annual_service_due)).map(c=>{
    const days=daysUntil(c.annual_service_due);
    const text=days<0?`po termínu o ${Math.abs(days)} dní`:days===0?"dnes":`za ${days} dní`;
    return `<div class="reminder ${days<0?"overdue":""}">
      <div><strong>${esc(c.full_name)}</strong><span>${esc(c.phone||"")} · ${esc(c.address||"")}</span><br><small>Roční servis: ${fmtDate(c.annual_service_due)} — <b>${text}</b></small></div>
      <button class="primary" data-open-customer="${c.id}">Otevřít</button>
    </div>`;
  }).join(""):"<p class='muted'>Žádný roční servis není do 14 dní.</p>";

  const planned=customers.filter(c=>c.status!=="Dokončeno").length;
  const done=customers.filter(c=>c.status==="Dokončeno").length;
  const total=customers.length;
  $("stats").innerHTML=`<div class="stat"><span>Zákazníků</span><b>${total}</b></div>
    <div class="stat"><span>Aktivních oprav</span><b>${planned}</b></div>
    <div class="stat"><span>Dokončeno</span><b>${done}</b></div>`;
}
function renderCustomers(){
  const q=($("customerSearch")?.value||"").toLowerCase().trim();
  const list=customers.filter(c=>[c.full_name,c.phone,c.address,c.email].join(" ").toLowerCase().includes(q));
  $("customerList").innerHTML=list.length?list.map(c=>{
    const due=c.annual_service_due?` · servis ${fmtDate(c.annual_service_due)}`:"";
    return `<div class="customer-card">
      <div><h3>${esc(c.full_name)}</h3><p>${esc(c.phone||"")} ${esc(c.address||"")}</p><small>${esc(c.status)}${due}</small></div>
      <button class="primary" data-open-customer="${c.id}">Detail</button>
    </div>`;
  }).join(""):"<p class='muted'>Nic nenalezeno.</p>";
}
function renderDetail(){
  const c=currentCustomer; if(!c)return;
  $("detailTitle").textContent=c.full_name;
  $("detailStatus").innerHTML=`<span class="status ${c.status==="Dokončeno"?"done":"planned"}">${esc(c.status)}</span>`;
  $("detailPhone").textContent=c.phone||"—"; $("detailPhone").href=c.phone?`tel:${c.phone}`:"#";
  $("detailEmail").textContent=c.email||"—"; $("detailEmail").href=c.email?`mailto:${c.email}`:"#";
  $("detailAddress").textContent=c.address||"—";
  $("detailProblem").textContent=c.problem||"—";
  $("detailAppointment").textContent=fmtDate(c.appointment_at,true);
  $("detailAnnual").textContent=fmtDate(c.annual_service_due);
  $("completeBtn").classList.toggle("hidden",c.status==="Dokončeno");
}
async function openCustomer(id){
  const c=customers.find(x=>x.id===id); if(!c)return;
  currentCustomer=c; renderDetail(); showView("detailView"); await renderGallery();
}
async function saveDetail(){
  const {data,error}=await sb.from("customers").update({
    full_name:currentCustomer.full_name,
    phone:$("detailPhone").textContent,
    email:$("detailEmail").textContent,
    address:$("detailAddress").textContent,
    problem:$("detailProblem").textContent
  }).eq("id",currentCustomer.id).select().single();
  if(error) toast(error.message); else { currentCustomer=data; await loadCustomers(); toast("Změny uloženy."); }
}
/* Detail text is intentionally made editable through prompt to keep the UI compact. */
async function editCustomer(){
  if(!currentCustomer)return;
  const fields=[
    ["Jméno a příjmení",currentCustomer.full_name],
    ["Telefon",currentCustomer.phone||""],
    ["E-mail",currentCustomer.email||""],
    ["Adresa",currentCustomer.address||""],
    ["Popis problému",currentCustomer.problem||""]
  ];
  const values=[];
  for(const [label,value] of fields){
    const v=prompt(label,value); if(v===null)return; values.push(v);
  }
  const patch={full_name:values[0],phone:values[1],email:values[2],address:values[3],problem:values[4]};
  const {data,error}=await sb.from("customers").update(patch).eq("id",currentCustomer.id).select().single();
  if(error) toast(error.message); else {currentCustomer=data;await loadCustomers();renderDetail();toast("Změny uloženy.");}
}
async function completeRepair(){
  if(!currentCustomer)return;
  if(!confirm(`Označit opravu ${currentCustomer.full_name} jako dokončenou a naplánovat roční servis na ${fmtDate(nextYearDate())}?`))return;
  const due=nextYearDate();
  const {data,error}=await sb.from("customers").update({
    status:"Dokončeno", completed_at:new Date().toISOString(), annual_service_due:due
  }).eq("id",currentCustomer.id).select().single();
  if(error){toast(error.message);return}
  currentCustomer=data; await loadCustomers(); renderDetail();
  toast(`Hotovo. Roční servis je naplánovaný na ${fmtDate(due)}.`);
}
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)}; img.onerror=reject; img.src=url;
  });
}
function canvasBlob(canvas,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
}
async function compressImage(file){
  const img=await fileToImage(file);
  let maxSide=1600;
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  let w=Math.max(1,Math.round(img.naturalWidth*scale));
  let h=Math.max(1,Math.round(img.naturalHeight*scale));
  const canvas=document.createElement("canvas"); const ctx=canvas.getContext("2d",{alpha:false});
  canvas.width=w;canvas.height=h;ctx.drawImage(img,0,0,w,h);
  let quality=.82, blob=await canvasBlob(canvas,quality);
  for(let i=0;i<8 && blob && blob.size>TARGET_BYTES;i++){
    quality-=.08; if(quality<.25)break;
    blob=await canvasBlob(canvas,quality);
  }
  if(blob && blob.size>TARGET_BYTES){
    const ratio=Math.sqrt(TARGET_BYTES/blob.size)*.92;
    w=Math.max(640,Math.round(w*ratio));h=Math.max(480,Math.round(h*ratio));
    canvas.width=w;canvas.height=h;ctx.drawImage(img,0,0,w,h);
    blob=await canvasBlob(canvas,.72);
  }
  if(!blob)throw new Error("Prohlížeč neumí převést fotografii.");
  return new File([blob],`${crypto.randomUUID()}.jpg`,{type:"image/jpeg"});
}
async function uploadPhotos(files){
  if(!currentCustomer||!files.length)return;
  let ok=0;
  for(const original of files){
    try{
      const compressed=await compressImage(original);
      const path=`${currentUser.id}/${currentCustomer.id}/${compressed.name}`;
      const {error}=await sb.storage.from(PHOTO_BUCKET).upload(path,compressed,{contentType:"image/jpeg",cacheControl:"31536000",upsert:false});
      if(error)throw error;
      const {error:dbError}=await sb.from("photos").insert({user_id:currentUser.id,customer_id:currentCustomer.id,path});
      if(dbError)throw dbError;
      ok++;
    }catch(e){console.error(e);toast(`Fotku se nepodařilo nahrát: ${e.message}`);}
  }
  if(ok)toast(`${ok} fotka/fotek nahráno.`);
  await renderGallery();
}
async function renderGallery(){
  if(!currentCustomer)return;
  const {data,error}=await sb.from("photos").select("*").eq("customer_id",currentCustomer.id).order("created_at",{ascending:false});
  if(error){toast(error.message);return}
  $("photoCount").textContent=(data||[]).length;
  if(!data?.length){$("gallery").innerHTML="<p class='muted'>Zatím zde nejsou žádné fotky.</p>";return}
  const paths=data.map(p=>p.path);
  const {data:urls,error:uerr}=await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths,3600);
  if(uerr){toast(uerr.message);return}
  $("gallery").innerHTML=urls.map((u,i)=>`<figure><img loading="lazy" src="${u.signedUrl}" alt="Fotka okna ${i+1}"></figure>`).join("");
}
async function createCustomer(e){
  e.preventDefault();
  const payload={
    user_id:currentUser.id,full_name:$("fullName").value.trim(),phone:$("phone").value.trim(),
    email:$("email").value.trim(),address:$("address").value.trim(),problem:$("problem").value.trim(),
    appointment_at:$("appointmentAt").value?new Date($("appointmentAt").value).toISOString():null,
    status:"Naplánováno"
  };
  const {data,error}=await sb.from("customers").insert(payload).select().single();
  if(error){toast(error.message);return}
  $("customerForm").reset();await loadCustomers();await openCustomer(data.id);toast("Zákazník uložen.");
}
async function signIn(){
  const email=$("authEmail").value.trim(),password=$("authPassword").value;
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error)toast(error.message);
}
async function signUp(){
  const email=$("authEmail").value.trim(),password=$("authPassword").value;
  const {data,error}=await sb.auth.signUp({email,password});
  if(error){toast(error.message);return}
  if(data.session) toast("Účet vytvořen a přihlášen.");
  else toast("Účet vytvořen. Potvrď e-mail a potom se přihlas.");
}
async function logout(){await sb.auth.signOut();}
async function startApp(session){
  if(!session){currentUser=null;$("appView").classList.add("hidden");$("authView").classList.remove("hidden");return}
  currentUser=session.user;$("userLabel").textContent=currentUser.email||"";
  $("authView").classList.add("hidden");$("appView").classList.remove("hidden");
  await loadCustomers();subscribeRealtime();showView("homeView");
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(console.warn);
}

document.addEventListener("click",async e=>{
  const authTab=e.target.closest("[data-auth-tab]"); if(authTab){setAuthMode(authTab.dataset.authTab);return}
  const open=e.target.closest("[data-open-customer]"); if(open){await openCustomer(open.dataset.openCustomer);return}
  if(e.target.closest("#newCustomerBtn")||e.target.closest('[data-nav="new"]')){showView("customerFormView");return}
  if(e.target.closest("#customersBtn")||e.target.closest('[data-nav="customers"]')){showView("customersView");renderCustomers();return}
  if(e.target.closest('[data-nav="home"]')){showView("homeView");return}
  if(e.target.closest("[data-back]")){showView("homeView");return}
});
$("authForm").addEventListener("submit",e=>{e.preventDefault();authMode==="login"?signIn():signUp()});
$("logoutBtn").addEventListener("click",logout);
$("customerForm").addEventListener("submit",createCustomer);
$("customerSearch").addEventListener("input",renderCustomers);
$("photoInput").addEventListener("change",e=>uploadPhotos([...e.target.files]));
$("completeBtn").addEventListener("click",completeRepair);
$("saveDetailBtn").addEventListener("click",editCustomer);

sb.auth.onAuthStateChange((_event,session)=>startApp(session));
setAuthMode("login");
sb.auth.getSession().then(({data})=>startApp(data.session));
