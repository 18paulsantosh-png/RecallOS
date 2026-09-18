// ── RecallOS ──────────────────────────────────────────────
// All settings (provider + API key/URL) are saved in this
// browser's localStorage only. Nothing is sent anywhere except
// directly to the AI provider you choose below.
// ──────────────────────────────────────────────────────────

const els = {
  provider: document.getElementById('provider'),
  apiKeyRow: document.getElementById('apiKeyRow'),
  apiKey: document.getElementById('apiKey'),
  endpointRow: document.getElementById('endpointRow'),
  endpoint: document.getElementById('endpoint'),
  saveSettings: document.getElementById('saveSettings'),
  settingsStatus: document.getElementById('settingsStatus'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsBody: document.getElementById('settingsBody'),
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  chips: document.getElementById('chips'),
  askBtn: document.getElementById('askBtn'),
  question: document.getElementById('question'),
  status: document.getElementById('status'),
  result: document.getElementById('result'),
  qText: document.getElementById('qText'),
  aText: document.getElementById('aText'),
  sources: document.getElementById('sources'),
};

// ---------- Settings ----------
function loadSettings(){
  const s = JSON.parse(localStorage.getItem('recallos_settings') || '{}');
  if (s.provider) els.provider.value = s.provider;
  if (s.apiKey) els.apiKey.value = s.apiKey;
  if (s.endpoint) els.endpoint.value = s.endpoint;
  toggleProviderFields();
  updateSettingsStatus();
}

function saveSettings(){
  const s = {
    provider: els.provider.value,
    apiKey: els.apiKey.value.trim(),
    endpoint: els.endpoint.value.trim(),
  };
  localStorage.setItem('recallos_settings', JSON.stringify(s));
  updateSettingsStatus();
  els.settingsBody.classList.remove('open-forced');
}

function getSettings(){
  return JSON.parse(localStorage.getItem('recallos_settings') || '{}');
}

function updateSettingsStatus(){
  const s = getSettings();
  if (s.provider === 'custom' && s.endpoint) {
    els.settingsStatus.textContent = `Connected to backend: ${s.endpoint}`;
  } else if (s.apiKey) {
    els.settingsStatus.textContent = `Connected — using ${s.provider === 'openai' ? 'OpenAI' : 'Gemini'}`;
  } else {
    els.settingsStatus.textContent = 'No API key saved yet — running in demo mode.';
  }
}

function toggleProviderFields(){
  const isCustom = els.provider.value === 'custom';
  els.apiKeyRow.style.display = isCustom ? 'none' : 'block';
  els.endpointRow.style.display = isCustom ? 'block' : 'none';
}

els.provider.addEventListener('change', toggleProviderFields);
els.saveSettings.addEventListener('click', saveSettings);
els.settingsToggle.addEventListener('click', () => {
  els.settingsBody.style.display = els.settingsBody.style.display === 'none' ? 'block' : 'none';
});

// ---------- Files ----------
const files = []; // { name, textContent | null }

function renderChips(){
  els.chips.innerHTML = '';
  files.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${f.name}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = () => { files.splice(i, 1); renderChips(); };
    chip.appendChild(btn);
    els.chips.appendChild(chip);
  });
}

function addFiles(fileList){
  Array.from(fileList).forEach(file => {
    const entry = { name: file.name, textContent: null };
    files.push(entry);
    if (/\.(txt|md)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = e => { entry.textContent = e.target.result; };
      reader.readAsText(file);
    }
  });
  renderChips();
}

els.fileInput.addEventListener('change', e => addFiles(e.target.files));
els.dropZone.addEventListener('dragover', e => { e.preventDefault(); els.dropZone.classList.add('over'); });
els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('over'));
els.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  els.dropZone.classList.remove('over');
  addFiles(e.dataTransfer.files);
});

// ---------- Ask ----------
function buildContext(){
  const withText = files.filter(f => f.textContent);
  if (!withText.length) return '';
  return withText.map(f => `--- ${f.name} ---\n${f.textContent}`).join('\n\n');
}

async function askGemini(question, context, apiKey){
  const prompt = context
    ? `Using only the notes below, answer the question. If the answer isn't in the notes, say so.\n\nNOTES:\n${context}\n\nQUESTION: ${question}`
    : question;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(no answer returned)';
}

async function askOpenAI(question, context, apiKey){
  const prompt = context
    ? `Using only the notes below, answer the question. If the answer isn't in the notes, say so.\n\nNOTES:\n${context}\n\nQUESTION: ${question}`
    : question;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(no answer returned)';
}

async function askCustomBackend(question, endpoint){
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return res.json(); // expects { answer, sources }
}

async function askQuestion(){
  const question = els.question.value.trim();
  if (!question) return;

  els.askBtn.disabled = true;
  els.status.textContent = 'Thinking…';
  els.result.classList.remove('show');

  const settings = getSettings();
  const context = buildContext();

  try {
    let answer, sources = [];

    if (settings.provider === 'custom' && settings.endpoint) {
      const data = await askCustomBackend(question, settings.endpoint);
      answer = data.answer;
      sources = data.sources || [];
    } else if (settings.provider === 'openai' && settings.apiKey) {
      answer = await askOpenAI(question, context, settings.apiKey);
      sources = files.map(f => ({ label: f.name }));
    } else if (settings.provider === 'gemini' && settings.apiKey) {
      answer = await askGemini(question, context, settings.apiKey);
      sources = files.map(f => ({ label: f.name }));
    } else {
      // DEMO MODE — no key saved yet
      await new Promise(r => setTimeout(r, 500));
      answer = 'This is a demo answer. Save an API key above (Gemini/OpenAI) or a backend URL to get real answers.';
      sources = [{ label: 'demo-source.pdf — Page 1' }];
    }

    els.qText.textContent = question;
    els.aText.textContent = answer;
    els.sources.innerHTML = '';
    sources.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s.label || s;
      els.sources.appendChild(li);
    });
    els.result.classList.add('show');
    els.status.textContent = '';
  } catch (err) {
    els.status.textContent = 'Something went wrong: ' + err.message;
  } finally {
    els.askBtn.disabled = false;
  }
}

els.askBtn.addEventListener('click', askQuestion);
els.question.addEventListener('keydown', e => { if (e.key === 'Enter') askQuestion(); });

loadSettings();
