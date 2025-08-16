// App.js
let currentUser = null;
let actions = [];

/* ===== Elements ===== */
const newBlankAction = () => ({ notes:"", action_taken:"", actionDate:"", image:null, departments:[] });
const loginSection      = document.getElementById("loginSection");
const formSection       = document.getElementById("formSection");
const loginBtn          = document.getElementById("loginBtn");
const submitBtn         = document.getElementById("submitBtn");
const addActionBtn      = document.getElementById("addActionBtn");
const removeActionBtn   = document.getElementById("removeActionBtn");
const actionsTableBody  = document.querySelector("#actionsTable tbody");

/* Header */
const userNameDisplay = document.getElementById("userNameDisplay");
const userEmailDisplay = document.getElementById("userEmailDisplay");
const currentDate = document.getElementById("currentDate");
const currentTime = document.getElementById("currentTime");

/* ===== Utils ===== */
const fmtNow = () => {
  const now = new Date();
  currentDate.textContent = now.toLocaleDateString('ar-EG');
  currentTime.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};
setInterval(fmtNow, 60 * 1000);
fmtNow();

const DEPARTMENTS = ["الإنتاج", "التشغيل", "التفعيل", "الإدراك"];

/* صف إجراء فاضي جاهز للاستخدام */
function blankAction(){
  return { notes:"", action_taken:"", actionDate:"", image:null, departments:[] };
}

/* =========================
   Helpers - Errors handling
   ========================= */
function getErrFor(el){
  const block = el.closest('.question-block');
  const sel = block ? block.querySelector('select.answer') : null;
  const key = sel ? sel.dataset.key : '';
  if (el.classList.contains('time'))   return `time-${key}`;
  if (el.classList.contains('reason')) return `reason-${key}`;
  if (el.classList.contains('action')) return `action-${key}`;
  if (el.classList.contains('answer')) return `ans-${key}`;
  return '';
}

function setSubmitting(flag) {
  if (!submitBtn) return;
  submitBtn.disabled = flag;
  if (flag) {
    if (!submitBtn.dataset.prev) submitBtn.dataset.prev = submitBtn.innerHTML;
    submitBtn.classList.add('is-loading');
    submitBtn.innerHTML = '<span>جاري الإرسال...</span><span class="spinner"></span>';
  } else {
    submitBtn.classList.remove('is-loading');
    submitBtn.innerHTML = submitBtn.dataset.prev || 'تسجيل';
    submitBtn.dataset.prev = '';
  }
}

function addFieldError(el, msg = "هذا الحقل مطلوب"){
  if(!el) return;
  clearFieldError(el);
  el.style.border = "2px solid #e53935";
  const small = document.createElement("small");
  small.className = "error-msg";
  small.dataset.errFor = getErrFor(el);
  small.style.color = "#e53935";
  small.textContent = msg;
  el.insertAdjacentElement("afterend", small);
}

function clearFieldError(el){
  if(!el) return;
  el.style.border = "";
  const next = el.nextElementSibling;
  if (next && next.classList && next.classList.contains('error-msg')) next.remove();

  const id = getErrFor(el);
  if (id && el.parentElement) {
    el.parentElement.querySelectorAll('.error-msg').forEach(sm=>{
      if (sm.dataset.errFor === id) sm.remove();
    });
  }
}

function autoClearOnInput(el){
  if (!el) return;
  const ev = (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'time') ? 'change' : 'input';
  el.addEventListener(ev, () => clearFieldError(el));
}

/* إغلاق أي قوائم إدارة مفتوحة عند الضغط خارجها */
document.addEventListener('click', () => {
  document.querySelectorAll('.dept-menu.portal').forEach(m => {
    m.dispatchEvent(new CustomEvent('forceClose'));
  });
});

/* ===== Login ===== */
loginBtn.addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  let users = [];
  try {
    const res = await fetch('./users.json', { cache: 'no-store' });
    users = await res.json();
  } catch {
    document.getElementById("loginError").textContent = "تعذر تحميل بيانات المستخدمين";
    return;
  }

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    document.getElementById("loginError").textContent = "❌ اسم المستخدم أو كلمة السر غير صحيحة";
    return;
  }

  currentUser = user;
  document.getElementById("loginError").textContent = "";
  loginSection.classList.add("hidden");
  formSection.classList.remove("hidden");

  userNameDisplay.textContent = user.name || user.username;
  userEmailDisplay.textContent = user.email || '';
  fmtNow();

  renderSurvey();

  // ثبّت صف افتراضي واحد جاهز
  actions = [newBlankAction()];
  renderActions();
  updateActionButtonsState();
});

function updateActionButtonsState(){
  if (!removeActionBtn) return;
  removeActionBtn.disabled = actions.length < 1;
}

/* ===== Survey ===== */
function renderSurvey() {
  const surveyContainer = document.getElementById('surveyContainer');
  surveyContainer.innerHTML = '';

  const sections = [
    {
      title: "الحضور",
      questions: [
        { key: 'attendance_all', text: '➢ حضور جميع العاملين في الوقت المحدد' },
        { key: 'departments_rep', text: '➢ جميع الإدارات ممثلة بموظف واحد على الأقل' }
      ]
    },
    {
      title: "جولة تفقدية",
      questions: [
        { key: 'building_clean_inside', text: '➢ النظافة الداخلية للمبنى' },
        { key: 'building_clean_outside', text: '➢ النظافة الخارجية للمبنى' },
        { key: 'production_clean', text: '➢ النظافة داخل صالة الإنتاج' },
        { key: 'warehouse_clean', text: '➢ النظافة داخل المخازن' },
        { key: 'uniform_company', text: '➢ ارتداء جميع العاملين زي الشركة' },
        { key: 'appearance', text: '➢ التزام جميع العاملين بالمظهر العام (حلاقة الذقن)' },
        { key: 'uniform_factory', text: '➢ ارتداء جميع العاملين بالمصنع زي التصنيع (غطاء الرأس – الكمامة – القفازات)' }
      ]
    },
    {
      title: "سير العمل",
      questions: [
        { key: 'trucks_loaded', text: '➢ جميع السيارات تم تحميلها و خروجها للتوزيع' },
        { key: 'production_orders', text: '➢ جميع أوامر الإنتاج منفذة و مفعلة على النظام' },
        { key: 'cafeteria_ready', text: '➢ الكافتيريا مجهزة و معدة لاستقبال العاملين' }
      ]
    },
    {
      title: "أعمال محددة من مدير كل قسم للمتابعة",
      questions: []
    },
    {
      title: "الإنصراف",
      questions: [
        { key: 'leaving_on_time', text: '➢ جميع العاملين ملتزمون بموعد الانصراف' }
      ]
    }
  ];

  sections.forEach(section => {
    const titleEl = document.createElement('h3');
    titleEl.textContent = section.title;
    titleEl.className = 'text-xl font-bold mb-4 mt-6 text-white bg-blue-600 p-2 rounded';
    surveyContainer.appendChild(titleEl);

    if (section.questions.length === 0) {
      for (let i = 0; i < 5; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'border w-full mb-2 p-2 placeholder-gray-400 custom-task';
        input.placeholder = "➢";
        surveyContainer.appendChild(input);
      }
      return;
    }

    section.questions.forEach(q => {
      const div = document.createElement('div');
      div.className = 'mb-4 text-right question-block';
      div.innerHTML = `
        <label class="block mb-2">${q.text}</label>
        <select class="border w-full mb-2 p-2 answer" data-key="${q.key}">
          <option value="">اختر...</option>
          <option value="yes">نعم</option>
          <option value="no">لا</option>
        </select>
        <div class="extra-time hidden">
          <input type="time" class="border w-full mb-2 p-2 time">
        </div>
        <div class="extra-reason hidden">
          <input type="text" class="border w-full mb-2 p-2 reason" placeholder="سبب عدم التنفيذ">
          <input type="text" class="border w-full mb-2 p-2 action" placeholder="الإجراء المتخذ">
        </div>
      `;
      surveyContainer.appendChild(div);

      const select = div.querySelector('select.answer');
      const extraTime = div.querySelector('.extra-time');
      const extraReason = div.querySelector('.extra-reason');
      const timeInput = div.querySelector('.time');
      const reasonInput = div.querySelector('.reason');
      const actionInput = div.querySelector('.action');

      [select, timeInput, reasonInput, actionInput].forEach(autoClearOnInput);

      select.addEventListener('change', () => {
        if (select.value === 'yes') {
          extraTime.classList.remove('hidden');
          extraReason.classList.add('hidden');
          clearFieldError(reasonInput);
          clearFieldError(actionInput);
          if (reasonInput) reasonInput.value = '';
          if (actionInput) actionInput.value = '';
        } else if (select.value === 'no') {
          extraTime.classList.add('hidden');
          extraReason.classList.remove('hidden');
          clearFieldError(timeInput);
          if (timeInput) timeInput.value = '';
        } else {
          extraTime.classList.add('hidden');
          extraReason.classList.add('hidden');
          if (timeInput)   timeInput.value = '';
          if (reasonInput) reasonInput.value = '';
          if (actionInput) actionInput.value = '';
          clearFieldError(select);
          clearFieldError(timeInput);
          clearFieldError(reasonInput);
          clearFieldError(actionInput);
        }
      });
    });
  });
}

/* ===== Actions Table ===== */
function renderActions() {
  document.querySelectorAll('.dept-menu.portal').forEach(m => {
    m.dispatchEvent(new CustomEvent('forceClose'));
  });

  actionsTableBody.innerHTML = "";
  actions.forEach((action, index) => {
    if (!Array.isArray(action.departments)) action.departments = [];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <textarea class="notes-input" placeholder="...ملاحظة">${action.notes || ''}</textarea>
      </td>
      <td>
        <input type="date" value="${action.actionDate || ''}" class="date-input">
      </td>
      <td>
        <textarea class="action-input" placeholder="...الإجراء المتخذ">${action.action_taken || ''}</textarea>
      </td>

      <!-- الإدارة: زر Dropdown متعدد الاختيار -->
      <td style="position: relative;">
        <div class="dept-select">
          <button type="button" class="dept-btn">اختر الإدارة (0/2)</button>
          <div class="dept-menu hidden">
            ${DEPARTMENTS.map(d => `
              <label class="menu-item"
                     style="display:flex;flex-direction:row-reverse;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e6eef6;border-radius:10px;background:#fff;cursor:pointer;">
                <input type="checkbox" data-dept="${d}" />
                <span>${d}</span>
              </label>
            `).join('')}
          </div>
          <div class="dept-chips"></div>
        </div>
      </td>

      <td>
        <label class="file-picker">
          <span>📎 رفع صورة</span>
          <input type="file" class="image-input" accept="image/*" hidden>
        </label>
        <span class="file-name"></span>
        ${action.image ? `<img class="img-preview" src="${action.image}" alt="preview">` : `<img class="img-preview" style="display:none" />`}
      </td>

      <!-- عمود الحذف (فاضي عمداً) -->
      <td class="no-remove"></td>
    `;
    actionsTableBody.appendChild(tr);

    // Bind نصوص
    tr.querySelector(".notes-input").addEventListener("input", e => actions[index].notes = e.target.value);
    tr.querySelector(".date-input").addEventListener("input",  e => actions[index].actionDate = e.target.value);
    tr.querySelector(".action-input").addEventListener("input",e => actions[index].action_taken = e.target.value);

    // صورة + معاينة + اسم ملف
    const fileInput = tr.querySelector(".image-input");
    const imgPrev   = tr.querySelector(".img-preview");
    const fileName  = tr.querySelector(".file-name");

    fileInput.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      fileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = () => {
        actions[index].image = reader.result; // dataURL
        imgPrev.src = reader.result;
        imgPrev.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    /* ====== Department dropdown logic (Portal) ====== */
    const wrap  = tr.querySelector('.dept-select');
    const btn   = wrap.querySelector('.dept-btn');
    const menu  = wrap.querySelector('.dept-menu');
    const chips = wrap.querySelector('.dept-chips');

    const placeholder = document.createComment('dept-menu-placeholder');
    let isOpen = false;

    function positionMenu() {
      const r = btn.getBoundingClientRect();
      const top  = r.bottom + 6;
      const left = r.left;
      const minW = Math.max(r.width, 240);
      menu.style.top  = `${top}px`;
      menu.style.left = `${left}px`;
      menu.style.width = `${minW}px`;
      menu.style.right = 'auto';
    }

    function openMenu() {
      if (isOpen) return;
      isOpen = true;
      wrap.insertBefore(placeholder, menu);
      menu.classList.add('portal');
      menu.classList.remove('hidden');
      document.body.appendChild(menu);
      positionMenu();
      window.addEventListener('scroll', positionMenu, true);
      window.addEventListener('resize', positionMenu);
    }

    function closeMenu() {
      if (!isOpen) return;
      isOpen = false;
      window.removeEventListener('scroll', positionMenu, true);
      window.removeEventListener('resize', positionMenu);
      menu.classList.remove('portal');
      menu.classList.add('hidden');
      if (placeholder.parentNode) {
        placeholder.parentNode.insertBefore(menu, placeholder);
        placeholder.parentNode.removeChild(placeholder);
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dept-menu.portal').forEach(m => {
        if (m !== menu) m.dispatchEvent(new CustomEvent('forceClose'));
      });
      isOpen ? closeMenu() : openMenu();
    });

    menu.addEventListener('forceClose', closeMenu);

    menu.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb.matches('input[type="checkbox"][data-dept]')) return;

      const name = cb.dataset.dept;
      let list = actions[index].departments || [];

      if (cb.checked) {
        if (list.length >= 2) {
          cb.checked = false;
          Swal.fire({ icon:'info', title:'تنبيه', text:'يمكن اختيار إدارتين فقط', timer:1500, showConfirmButton:false });
          return;
        }
        list = [...list, name];
      } else {
        list = list.filter(x => x !== name);
      }
      actions[index].departments = list;
      refreshDeptUI();
    });

    chips.addEventListener('click', (e) => {
      if (!e.target.classList.contains('x')) return;
      const d = e.target.closest('.chip')?.dataset.dept;
      actions[index].departments = (actions[index].departments || []).filter(x => x !== d);
      refreshDeptUI();
    });

    function refreshDeptUI() {
      const list = actions[index].departments || [];
      btn.textContent = list.length ? `الإدارات (${list.length}/2)` : 'اختر الإدارة (0/2)';

      chips.innerHTML = list.map(d =>
        `<span class="chip" data-dept="${d}">${d}<span class="x" title="إزالة">×</span></span>`
      ).join('');

      menu.querySelectorAll('input[type="checkbox"][data-dept]').forEach(cb => {
        cb.checked = list.includes(cb.dataset.dept);
      });
    }

    document.addEventListener('scroll', () => { if (isOpen) positionMenu(); }, true);

    refreshDeptUI();
  });

  updateActionButtonsState();
}

/* أزرار الإضافة والحذف */
addActionBtn.addEventListener("click", () => {
  actions.push(blankAction());
  renderActions();
});

removeActionBtn.addEventListener("click", () => {
  if (actions.length <= 1) {
    // مسح بيانات الصف الوحيد بدل حذفه
    actions[0] = blankAction();
    renderActions();
    Swal.fire({ icon:'info', title:'تم مسح بيانات الصف', timer:1200, showConfirmButton:false });
  } else {
    actions.pop();
    renderActions();
  }
});

/* ===== Submit ===== */
submitBtn.addEventListener("click", async () => {
  // حماية إضافية لو البوتون لسه Disabled
  if (submitBtn.disabled) return;

  if (!currentUser) return;

  let allGood = true;
  const answers = {};

  // نظّف أخطاء قديمة
  document.querySelectorAll(".error-msg").forEach(e => e.remove());

  document.querySelectorAll('#surveyContainer .answer').forEach(select => {
    const key = select.dataset.key;
    const parent = select.closest('.question-block');
    const value = select.value;

    const timeInput   = parent.querySelector('.time');
    const reasonInput = parent.querySelector('.reason');
    const actionInput = parent.querySelector('.action');

    [select, timeInput, reasonInput, actionInput].forEach(el => {
      if (!el) return;
      el.style.border = "";
      const next = el.nextElementSibling;
      if (next && next.classList && next.classList.contains('error-msg')) next.remove();
    });

    const showError = (el) => {
      el.style.border = "2px solid red";
      const msg = document.createElement("small");
      msg.className = "error-msg";
      msg.style.color = "red";
      msg.textContent = "هذا الحقل مطلوب";
      el.insertAdjacentElement("afterend", msg);
      allGood = false;
    };

    if (!value) {
      showError(select);
    } else if (value === "yes" && !timeInput.value) {
      showError(timeInput);
    } else if (value === "no") {
      if (!reasonInput.value) showError(reasonInput);
      if (!actionInput.value) showError(actionInput);
    }

    answers[key] = {
      answer: value || '',
      time: timeInput?.value || '',
      reason: reasonInput?.value || '',
      action: actionInput?.value || ''
    };
  });

  // لو في أخطاء ما نكملش ولا نفعّل اللودينج
  if (!allGood) return;

  // Custom tasks
  const customTasks = [];
  document.querySelectorAll('.custom-task').forEach(input => {
    const v = input.value.trim();
    if (v !== '') customTasks.push(v);
  });
  answers.custom_tasks = customTasks;

  // Actions
  answers.actions = actions;

  // === تشغيل اللودينج ومنع النقرات المتكررة ===
  setSubmitting(true);

  try {
    const response = await fetch("/save-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUser.username,
        name: currentUser.name || currentUser.username,
        timestamp: new Date(),
        answers
      })
    });

    const data = await response.json();
    if (response.ok) {
      Swal.fire({
        title: "تم إرسال التقرير",
        text: "شكراً لمجهودك، تم استلام التقرير بنجاح",
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "تحميل PDF",
        cancelButtonText: "تقرير جديد",
        reverseButtons: true
      }).then((result) => {
        if (result.isConfirmed) {
          window.open(`/pdfs/${encodeURIComponent(data.fileName)}`, "_blank");
          logout(); // ← تسجيل خروج تلقائي بعد التحميل
        } else {
          resetForm();
        }
      });
    } else {
      Swal.fire("خطأ", data.message || "فشل الإرسال", "error");
    }
  } catch {
    Swal.fire("خطأ", "تعذر الاتصال بالخادم", "error");
  } finally {
    // إيقاف اللودينج وإرجاع الزر لوضعه الطبيعي
    setSubmitting(false);
  }
});

/* ===== Reset ===== */
function resetForm() {
  // اقفل أي قوائم مفتوحة
  document.querySelectorAll('.dept-menu.portal').forEach(m => {
    m.dispatchEvent(new CustomEvent('forceClose'));
  });

  // رجّع صف واحد فاضي جاهز
  actions = [newBlankAction()];
  renderActions();
  updateActionButtonsState();

  // امسح أخطاء وارجع كل حاجة افتراضي
  document.querySelectorAll(".error-msg").forEach(e => e.remove());

  document.querySelectorAll('#surveyContainer .answer').forEach(select => {
    select.value = "";
    const parent = select.closest('.question-block');
    parent?.querySelectorAll('input').forEach(i => i.value = "");
    parent?.querySelectorAll('.extra-time, .extra-reason').forEach(div => div.classList.add('hidden'));
    clearFieldError(select);
  });
  document.querySelectorAll('.custom-task').forEach(i => i.value = '');
}

/* ===== Logout ===== */
function logout() {
  currentUser = null;
  resetForm(); // يمسح كل حاجة في الفورم
  // اخفاء الفورم وإظهار شاشة الدخول
  formSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  // تنظيف الهيدر وحقول الدخول
  userNameDisplay.textContent = "";
  userEmailDisplay.textContent = "";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}
