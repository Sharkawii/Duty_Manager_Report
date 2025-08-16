// server/server.js
'use strict';
console.log('__dirname is:', __dirname);
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const sql        = require('mssql');
const fs         = require('fs-extra');
const path       = require('path');
const puppeteer  = require('puppeteer');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// لو ناقص ENV ننوّه
['DB_USER','DB_PASSWORD','DB_HOST','DB_NAME','EMAIL_USER','EMAIL_PASS','ADMIN_EMAIL','ADMIN_EMAILS']
  .forEach(k => { if (!process.env[k]) console.warn(`⚠️ Missing ENV: ${k}`); });

// ميدلوير أساسي
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// مجلدات ثابتة
const pdfDir = path.join(__dirname, '../pdfs');
fs.ensureDirSync(pdfDir);
app.use('/pdfs', express.static(pdfDir));
app.use(express.static(path.join(__dirname, '../public')));

// ==== إعداد SQL Server (Azure أو داخلي) ====
const isAzure = /\.database\.windows\.net$/i.test(process.env.DB_HOST || '');
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST || '',
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  options: {
    encrypt: isAzure,               // Azure => true
    trustServerCertificate: !isAzure
  }
};

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

/* ================= Helpers ================= */
function safeStr(v, fb='-'){ if(v==null) return fb; const s=String(v); return s.trim()===''?fb:s; }
function h(v, fb='-'){
  if(v==null) return fb;
  const s = String(v);
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ============== HTML (PDF) ============== */
function buildReportHTML({ username, submissionDate, answers, actions, logoUrl, fontPath, primary = '#1565c0' }) {
  const toFileUrl = p => 'file:///' + p.replace(/\\/g, '/');
  const fontUrl = fs.existsSync(fontPath) ? toFileUrl(fontPath) : '';

  const questionLabels = {
    attendance_all: "حضور جميع العاملين في الوقت المحدد",
    departments_rep: "جميع الإدارات ممثلة بموظف واحد على الأقل",
    building_clean_inside: "النظافة الداخلية للمبنى",
    building_clean_outside: "النظافة الخارجية للمبنى",
    production_clean: "النظافة داخل صالة الإنتاج",
    warehouse_clean: "النظافة داخل المخازن",
    uniform_company: "ارتداء جميع العاملين زي الشركة",
    appearance: "التزام جميع العاملين بالمظهر العام (حلاقة الذقن)",
    uniform_factory: "ارتداء جميع العاملين بالمصنع زي التصنيع (غطاء الرأس – الكمامة – القفازات)",
    trucks_loaded: "جميع السيارات تم تحميلها و خروجها للتوزيع",
    production_orders: "جميع أوامر الإنتاج منفذة و مفعلة على النظام",
    cafeteria_ready: "الكافتيريا مجهزة و معدة لاستقبال العاملين",
    leaving_on_time: "جميع العاملين ملتزمون بموعد الانصراف"
  };

  function toArabicAnswer(ans){
    const a = safeStr(ans, '');
    if(!a) return '-';
    const n=a.toLowerCase();
    if(n==='yes') return 'نعم';
    if(n==='no')  return 'لا';
    return a;
  }

  const sections = [
    { title: "1- الحضور", keys: ["attendance_all", "departments_rep"] },
    { title: "2- جولة تفقدية", keys: ["building_clean_inside","building_clean_outside","production_clean","warehouse_clean","uniform_company","appearance","uniform_factory"] },
    { title: "3- سير العمل", keys: ["trucks_loaded", "production_orders", "cafeteria_ready"] },
    { title: "4- الإنصراف", keys: ["leaving_on_time"] },
  ];

  const sectionsHTML = sections.map(sec=>{
    const rows = sec.keys.map(key=>{
      const v = (answers && answers[key]) || {};
      const label = questionLabels[key] || key;
      const ans = toArabicAnswer(v.answer);
      const time   = (String(v.answer||'').toLowerCase()==='yes') ? (v.time||'-')   : '-';
      const reason = (String(v.answer||'').toLowerCase()==='no')  ? (v.reason||'-') : '-';
      const action = (String(v.answer||'').toLowerCase()==='no')  ? (v.action||'-') : '-';
      return `
        <tr>
          <td class="q">${h(label)}</td>
          <td class="ans">${h(ans)}</td>
          <td class="time">${h(time)}</td>
          <td class="reason">${h(reason)}</td>
          <td class="act">${h(action)}</td>
        </tr>`;
    }).join('');
    return `
      <div class="sec">
        <div class="sec-title">${h(sec.title)}</div>
        <table class="grid">
          <thead>
            <tr>
              <th class="q">السؤال</th>
              <th class="ans">الإجابة</th>
              <th class="time">وقت الملاحظة</th>
              <th class="reason">السبب</th>
              <th class="act">الإجراء</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  const customTasks = Array.isArray(answers?.custom_tasks) ? answers.custom_tasks : [];
  const customTasksHTML = customTasks.length ? `
    <div class="sec">
      <div class="sec-title">5- أعمال محددة من مدير كل قسم للمتابعة</div>
      <div class="tasks">
        ${customTasks.map(t=>`<div class="task">- ${h(t)}</div>`).join('')}
      </div>
    </div>` : '';

  const actionsHTML = (Array.isArray(actions) && actions.length) ? `
    <div class="sec">
      <div class="sec-title">جدول الإجراءات (ملاحظات + صور)</div>
      <table class="grid">
        <colgroup>
          <col style="width:16%">
          <col style="width:36%">
          <col style="width:14%">
          <col style="width:20%">
          <col style="width:14%">
        </colgroup>
        <thead>
          <tr>
            <th class="img">الصورة</th>
            <th class="notes">الملاحظات</th>
            <th class="date">التاريخ</th>
            <th class="taken">الإجراء المتخذ</th>
            <th class="dept">الإدارة</th>
          </tr>
        </thead>
        <tbody>
          ${actions.map(a=>{
            const deptText = Array.isArray(a?.departments) ? a.departments.join('، ')
                             : (typeof a?.departments === 'string' ? a.departments : '-');
            return `
              <tr>
                <td class="img">${a.image ? `<img class="thumb" src="${h(a.image)}" />` : '-'}</td>
                <td class="notes">${h(a.notes||'-')}</td>
                <td class="date">${h(a.actionDate ? new Date(a.actionDate).toLocaleDateString('ar-EG') : '-')}</td>
                <td class="taken">${h(a.action_taken||'-')}</td>
                <td class="dept">${h(deptText||'-')}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '';

  const headerHTML = `
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ''}
      <div class="head-text">
        <div class="title">تقرير السيرفاي اليومي</div>
        <div class="meta">
          <div>المستخدم: ${h(username)}</div>
          <div>تاريخ التقديم: ${h(new Date(submissionDate).toLocaleString('ar-EG'))}</div>
        </div>
      </div>
    </div>`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face{
        font-family:'Amiri';
        src:url('${fontUrl}') format('truetype');
        font-weight:normal;
        font-style:normal;
      }
      *{ box-sizing:border-box; }
      body{
        font-family:'Amiri','Tahoma',sans-serif;
        direction:rtl; text-align:right; color:#111;
        margin:0; padding:18mm 12mm 22mm;
        background:#fff;
      }
      .header{
        display:flex; align-items:center; gap:12px; margin-bottom:12px;
        border:1px solid ${primary}33; border-radius:12px; padding:10px 12px; background:#fff;
        box-shadow:0 2px 10px rgba(0,0,0,0.06);
      }
      .logo{ width:64px; height:auto; }
      .head-text{ flex:1; }
      .title{ font-size:18px; font-weight:700; color:${primary}; margin-bottom:4px; }
      .meta{ font-size:12px; color:#333; display:grid; gap:2px; }

      .sec{ margin-top:14px; }
      .sec-title{
        display:inline-block;
        background:${primary}; color:#fff; padding:6px 10px; border-radius:8px;
        font-size:13px; font-weight:700; margin-bottom:8px;
      }

      table.grid{ width:100%; border-collapse:collapse; margin-top:8px; table-layout:fixed; }
      table.grid th, table.grid td{
        border:1px solid #9eb6cf; padding: 10px 12px; vertical-align:top; word-break:break-word; line-height: 1.6; font-size: 13px;
      }
      table.grid thead th{ background:#e3f2fd; color:#1565c0; text-align:center; font-weight:700; }
      table.grid tbody tr:nth-child(odd){ background:#fafcff; }
      td.time, td.ans, td.date { text-align:center; }
      td.q{ width:34%; } td.reason{ width:22%; } td.act{ width:16%; }

      /* الصورة دينامِك */
      table.grid td.img { padding: 6px; }
      table.grid td.img img.thumb{
        display:block; width:100%; height:auto; max-width:100%;
        margin:4px auto; border:1px solid #e0e0e0; border-radius:8px; page-break-inside:avoid;
      }
      table.grid tr{ page-break-inside:avoid; }

      .tasks .task{
        border:1px solid #9eb6cf; padding:6px 8px; margin:6px 0; border-radius:8px; background:#fff;
      }
    </style>
  </head>
  <body>
    ${headerHTML}
    ${sectionsHTML}
    ${customTasksHTML}
    ${actionsHTML}
  </body>
</html>`;
}

function buildFooterTemplate({ primary = '#1565c0' }) {
  return `
  <div dir="rtl" style="
      width:100%;
      font-size:10px;
      padding:6px 10px;
      color:${primary};
      border-top:1px solid ${primary}33;
      display:flex; align-items:center; justify-content:space-between;">
    <div style="visibility:hidden">.</div>
    <div>تحت إدارة قسم الـ IT</div>
    <div><span class="pageNumber"></span> / <span class="totalPages"></span></div>
  </div>`;
}

/* ============== PDF Generation ============== */
async function generatePDF(responseId, username, answers, actions, submissionDate = new Date()){
  const formattedDateForFile = new Date(submissionDate).toLocaleDateString('en-GB').replace(/\//g,'-');
  const formattedTimeForFile = new Date(submissionDate)
    .toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit', hour12: true})
    .replace(':','-');

  const safeUsername = safeStr(username,'user').replace(/\s+/g,'_');
  const fileName = `Response ${responseId} - ${formattedDateForFile} - ${formattedTimeForFile} - ${safeUsername}.pdf`;
  const filePath = path.join(pdfDir, fileName);

  const displayDate = new Date(submissionDate).toLocaleDateString('en-GB');
  const displayTime = new Date(submissionDate).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit', hour12: true});

  const primary  = '#1565c0';
  const logoUrl  = `${BASE_URL}/phpI4rSko.png`;
  const fontPath = path.join(__dirname,'../fonts/Amiri-Regular.ttf');

  const html = buildReportHTML({
    username, submissionDate, answers: answers||{}, actions: Array.isArray(actions)?actions:[],
    logoUrl, fontPath, primary
  });

  const footerTemplate = buildFooterTemplate({ primary });

  // ✅ Puppeteer جوه الدالة
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=medium'
    ]
  });

  try{
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
      margin: { top: '14mm', right: '10mm', bottom: '22mm', left: '10mm' }
    });
  } finally {
    await browser.close();
  }

  return { filePath, fileName, formattedDate: displayDate, formattedTime: displayTime };
}

/* ============== API ============== */
app.post('/save-response', async (req, res) => {
  try {
    const { username='unknown', name, timestamp, answers } = req.body;
    const displayName = name || username;

    const submissionDate = timestamp ? new Date(timestamp) : new Date();
    if (!answers) return res.status(400).json({ message: '❌ Missing answers' });

    const pool = await sql.connect(dbConfig);
    const respResult = await pool.request()
      .input('username', sql.NVarChar, username)
      .input('submission_date', sql.DateTime, submissionDate)
      .query(`INSERT INTO responses (username, submission_date) OUTPUT INSERTED.id VALUES (@username, @submission_date)`);
    const responseId = respResult.recordset[0].id;

    // باقي الحقول (ما عدا actions)
    for (const [key, value] of Object.entries(answers)) {
      if (key === 'actions') continue;
      await pool.request()
        .input('response_id', sql.Int, responseId)
        .input('field_name', sql.NVarChar, key)
        .input('field_value', sql.NVarChar(sql.MAX), JSON.stringify(value ?? ''))
        .query(`INSERT INTO response_fields (response_id, field_name, field_value) VALUES (@response_id, @field_name, @field_value)`);
    }

    // الإجراءات + الإدارات
    const actionsSafe = Array.isArray(answers.actions) ? answers.actions : [];
    for (const a of actionsSafe) {
      await pool.request()
        .input('response_id', sql.Int, responseId)
        .input('notes', sql.NVarChar(sql.MAX), safeStr(a?.notes,''))
        .input('action_taken', sql.NVarChar(sql.MAX), safeStr(a?.action_taken,''))
        .input('action_date', sql.Date, a?.actionDate || null)
        .input('departments', sql.NVarChar(sql.MAX), Array.isArray(a?.departments) ? JSON.stringify(a.departments) : '[]')
        .input('image_base64', sql.NVarChar(sql.MAX), a?.image || null)
        .query(`INSERT INTO responses_actions (response_id, notes, action_taken, action_date, departments, image_base64)
                VALUES (@response_id, @notes, @action_taken, @action_date, @departments, @image_base64)`);
    }

    const { filePath, fileName, formattedDate, formattedTime } =
      await generatePDF(responseId, username, answers, actionsSafe, submissionDate);

    // === إعداد المستلمين من ENV ===
    // ADMIN_EMAILS ممكن تكون "a@x.com,b@y.com; c@z.com"
    const recipients = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      console.warn('⚠️ No ADMIN_EMAIL/ADMIN_EMAILS configured. Mail will be sent to EMAIL_USER as fallback.');
      recipients.push(process.env.EMAIL_USER);
    }

    // ملخص الإيميل
    const actionsCount = actionsSafe.length;
    const emailText = `تـحـيـة طـيـبـة،

أرفق لكم تقرير "Duty Manager Report".

الملخص:
- رقم التقرير: ${responseId}
- المرسل: ${displayName} (${username})
- تاريخ الإرسال: ${formattedDate} – ${formattedTime}
- عدد الإجراءات المسجلة: ${actionsCount}

للاطلاع أو التحميل:
${BASE_URL}/pdfs/${encodeURIComponent(fileName)}

(يوجد نسخة PDF مرفقة بالتقرير).`;

    const logoCid = 'dmr-logo@inline';
    const emailHtml = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#111;line-height:1.8">
        <div style="text-align:center;margin-bottom:12px">
          <img src="cid:${logoCid}" alt="Company Logo" style="height:64px;max-width:100%;display:inline-block" />
        </div>
        <p>تحية طيبة،</p>
        <p>أرفق لكم تقرير "Duty Manager Report".</p>
        <ul style="padding-right:20px;margin:0 0 12px 0">
          <li>رقم التقرير: <strong>${responseId}</strong></li>
          <li>المرسل: <strong>${displayName}</strong> || أسم المستخدم: (<span dir="ltr">${username}</span>)</li>
          <li>تاريخ الإرسال: <strong>${formattedDate} – ${formattedTime}</strong></li>
          <li>عدد الإجراءات المسجلة: <strong>${actionsCount}</strong></li>
        </ul>
        <p>
          رابط العرض/التحميل:
          <a href="${BASE_URL}/pdfs/${encodeURIComponent(fileName)}">
            ${BASE_URL}/pdfs/${encodeURIComponent(fileName)}
          </a>
        </p>
        <p style="margin-top:16px;color:#555">مع خالص الشكر،<br>قسم الـ IT</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipients, // ← مصفوفة مستلمين
      subject: `Duty_Manager_Report - Response ${responseId} - ${username} - ${displayName} - ${formattedDate} – ${formattedTime}`,
      text: emailText,
      html: emailHtml,
      attachments: [
        { filename: fileName, path: filePath },
        { filename: 'logo.png', path: path.join(__dirname, '../public/phpI4rSko.png'), cid: logoCid }
      ]
    });

    console.log(`✅ Response ${responseId} saved & emailed - ${formattedDate} ${formattedTime}.`);
    res.json({ message: '✅ Response saved and emailed', responseId, fileName });

  } catch (err) {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ message: '❌ Internal Server Error', error: err.message });
  }
});

/* ============== Routes & Boot ============== */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// اختبار اتصال بقاعدة البيانات (اختياري)
sql.connect(dbConfig)
  .then(() => console.log('✅ Connected to SQL Server Database successfully!'))
  .catch(err => console.error('❌ Failed to connect to SQL Server:', err.message));
