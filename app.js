let adminToken = null;

function initials(name){
  return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}
function formatDob(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function buildBarcode(){
  const bc = document.getElementById('barcode');
  bc.innerHTML = '';
  for(let i=0;i<28;i++){
    const bar = document.createElement('span');
    const h = 12 + Math.floor(Math.random()*18);
    bar.style.height = h + 'px';
    bc.appendChild(bar);
  }
}
function showBanner(bannerEl, textEl, msg){
  if(textEl) textEl.textContent = msg;
  bannerEl.classList.add('show');
}
function hideBanner(bannerEl){
  bannerEl.classList.remove('show');
}

/* ---------- Student search ---------- */
document.getElementById('findBtn').addEventListener('click', async () => {
  const errBanner = document.getElementById('errorBanner');
  const errText = document.getElementById('errorText');
  hideBanner(errBanner);

  const roll = document.getElementById('roll').value.trim();
  const dob = document.getElementById('dob').value;
  if(!roll || !dob){
    showBanner(errBanner, errText, 'Enter both your roll number and date of birth to continue.');
    return;
  }

  const findBtn = document.getElementById('findBtn');
  findBtn.disabled = true;
  findBtn.textContent = 'Searching...';

  try{
    const res = await fetch('/api/find-admit-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roll, dob })
    });
    const data = await res.json();
    if(!res.ok){
      showBanner(errBanner, errText, data.error || 'No admit card found for that roll number and date of birth.');
      return;
    }
    renderAdmitCard(data);
  }catch(err){
    showBanner(errBanner, errText, 'Could not reach the server. Is it running?');
  }finally{
    findBtn.disabled = false;
    findBtn.textContent = 'Find my admit card';
  }
});

function renderAdmitCard(match){
  document.getElementById('stubRoll').textContent = match.roll;
  document.getElementById('examTitle').textContent = match.semester + ' \u2014 end semester examination';
  document.getElementById('photoInitials').textContent = initials(match.name);
  document.getElementById('stName').textContent = match.name;
  document.getElementById('stRoll').textContent = match.roll;
  document.getElementById('stCourse').textContent = match.course;
  document.getElementById('stSem').textContent = match.semester;
  document.getElementById('stDob').textContent = formatDob(match.dob);
  document.getElementById('stCentre').textContent = match.centre;

  const body = document.getElementById('scheduleBody');
  body.innerHTML = '';
  match.subjects.forEach(sub => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>'+sub.name+'</td><td class="mono">'+sub.date+'</td><td class="mono">'+sub.time+'</td>';
    body.appendChild(tr);
  });

  buildBarcode();
  document.getElementById('result').classList.add('show');
  document.getElementById('result').scrollIntoView({ behavior:'smooth', block:'start' });
}

document.getElementById('backBtn').addEventListener('click', () => {
  document.getElementById('result').classList.remove('show');
  document.getElementById('roll').value = '';
  document.getElementById('dob').value = '';
  hideBanner(document.getElementById('errorBanner'));
  window.scrollTo({ top:0, behavior:'smooth' });
});
document.getElementById('printBtn').addEventListener('click', () => window.print());
document.getElementById('roll').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('findBtn').click(); });
document.getElementById('dob').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('findBtn').click(); });

/* ---------- Tab switching ---------- */
const tabStudent = document.getElementById('tabStudent');
const tabAdmin = document.getElementById('tabAdmin');
const studentView = document.getElementById('studentView');
const adminView = document.getElementById('adminView');

tabStudent.addEventListener('click', () => {
  tabStudent.classList.add('active');
  tabAdmin.classList.remove('active');
  studentView.style.display = '';
  adminView.style.display = 'none';
});
tabAdmin.addEventListener('click', () => {
  tabAdmin.classList.add('active');
  tabStudent.classList.remove('active');
  studentView.style.display = 'none';
  adminView.style.display = '';
});

/* ---------- Admin login ---------- */
document.getElementById('unlockBtn').addEventListener('click', async () => {
  const code = document.getElementById('adminCode').value.trim();
  const errBanner = document.getElementById('adminErrorBanner');
  const errText = document.getElementById('adminErrorText');
  hideBanner(errBanner);

  if(!code){
    showBanner(errBanner, errText, 'Enter the admin access code.');
    return;
  }

  try{
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if(!res.ok){
      showBanner(errBanner, errText, data.error || 'Incorrect access code.');
      return;
    }
    adminToken = data.token;
    document.getElementById('gateWrap').style.display = 'none';
    document.getElementById('adminPanel').style.display = '';
    loadRecords();
  }catch(err){
    showBanner(errBanner, errText, 'Could not reach the server. Is it running?');
  }
});
document.getElementById('adminCode').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('unlockBtn').click(); });

/* ---------- Subject rows ---------- */
function addSubjectRow(name, date, time){
  const row = document.createElement('div');
  row.className = 'subject-row';
  row.innerHTML =
    '<input type="text" class="subj-name" placeholder="Subject name" value="'+(name||'')+'">' +
    '<input type="text" class="subj-date" placeholder="18 Aug 2026" value="'+(date||'')+'">' +
    '<input type="text" class="subj-time" placeholder="10:00 AM" value="'+(time||'')+'">' +
    '<button type="button" class="remove-row-btn" aria-label="Remove subject"><i class="ti ti-x"></i></button>';
  row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
  document.getElementById('subjectRows').appendChild(row);
}
document.getElementById('addSubjectBtn').addEventListener('click', () => addSubjectRow());
addSubjectRow();
addSubjectRow();

function clearForm(){
  ['fRoll','fDob','fName','fCourse','fSem','fCentre'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('subjectRows').innerHTML = '';
  addSubjectRow();
  addSubjectRow();
}

/* ---------- Save record ---------- */
document.getElementById('saveRecordBtn').addEventListener('click', async () => {
  const formErr = document.getElementById('formErrorBanner');
  const formErrText = document.getElementById('formErrorText');
  const successBanner = document.getElementById('formSuccessBanner');
  hideBanner(formErr);
  successBanner.classList.remove('show');

  const roll = document.getElementById('fRoll').value.trim();
  const dob = document.getElementById('fDob').value;
  const name = document.getElementById('fName').value.trim();
  const course = document.getElementById('fCourse').value.trim();
  const semester = document.getElementById('fSem').value.trim();
  const centre = document.getElementById('fCentre').value.trim();

  const subjectRows = Array.from(document.querySelectorAll('.subject-row'));
  const subjects = subjectRows.map(row => ({
    name: row.querySelector('.subj-name').value.trim(),
    date: row.querySelector('.subj-date').value.trim(),
    time: row.querySelector('.subj-time').value.trim()
  })).filter(s => s.name && s.date && s.time);

  try{
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ roll, dob, name, course, semester, centre, subjects })
    });
    const data = await res.json();
    if(!res.ok){
      showBanner(formErr, formErrText, data.error || 'Could not save this record.');
      return;
    }
    successBanner.classList.add('show');
    clearForm();
    loadRecords();
  }catch(err){
    showBanner(formErr, formErrText, 'Could not reach the server. Is it running?');
  }
});

/* ---------- Record list ---------- */
async function loadRecords(){
  const list = document.getElementById('recordList');
  try{
    const res = await fetch('/api/admin/students', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if(!res.ok){
      list.innerHTML = '<div class="empty-list">Session expired. Log in again.</div>';
      document.getElementById('recordCount').textContent = '0';
      return;
    }
    const students = await res.json();
    renderRecordList(students);
  }catch(err){
    list.innerHTML = '<div class="empty-list">Could not reach the server.</div>';
  }
}

function renderRecordList(students){
  const list = document.getElementById('recordList');
  document.getElementById('recordCount').textContent = students.length;
  list.innerHTML = '';
  if(students.length === 0){
    list.innerHTML = '<div class="empty-list">No admit card records yet.</div>';
    return;
  }
  students.forEach(s => {
    const item = document.createElement('div');
    item.className = 'record-item';
    item.innerHTML =
      '<div class="rec-info"><div>'+s.name+'</div><div>'+s.roll+' \u2014 '+formatDob(s.dob)+'</div></div>' +
      '<button class="del-btn" aria-label="Delete record"><i class="ti ti-trash"></i></button>';
    item.querySelector('.del-btn').addEventListener('click', () => deleteRecord(s.roll));
    list.appendChild(item);
  });
}

async function deleteRecord(roll){
  try{
    const res = await fetch('/api/admin/students/' + encodeURIComponent(roll), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if(res.ok) loadRecords();
  }catch(err){
    // silent - list stays as-is, user can retry
  }
}
