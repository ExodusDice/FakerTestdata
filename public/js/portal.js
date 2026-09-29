(function () {
  const chatLog = document.getElementById('chatLog');
  const composer = document.getElementById('composer');
  const userEmail = window.__USER_EMAIL__ || '';

  const answers = { testTypes: [] };
  const files = {}; // key -> File

  const steps = [
    {
      key: 'projectName',
      type: 'text',
      prompt: "Let's set up a new test data request.\nWhat's the Project Name?",
      placeholder: 'e.g. BankY Payment Gateway'
    },
    {
      key: 'brdFsd',
      type: 'file',
      prompt: 'Please attach the BRD / FSD document for this project (or Skip if not available).'
    },
    {
      key: 'testCase',
      type: 'file',
      prompt: 'Please attach the existing Test Case document (or Skip).'
    },
    {
      key: 'testPlan',
      type: 'file',
      prompt: 'Please attach the Test Plan document (or Skip).'
    },
    {
      key: 'condition',
      type: 'text',
      prompt: 'Any condition the generated data should follow?\n(e.g. "test data must be unique for each tester")',
      placeholder: 'Condition (optional - press Enter to skip)',
      optional: true
    },
    {
      key: 'testTypes',
      type: 'chips',
      prompt: 'Which test type(s) should I generate? Select one or more, then Continue.',
      options: ['Happy test', 'Negative test', 'Boundary test']
    },
    {
      key: 'email',
      type: 'text',
      prompt: 'Which VASUP email should receive the generated file?',
      placeholder: 'name@vasup.co.th',
      prefill: userEmail
    },
    {
      key: 'goal',
      type: 'text',
      prompt: "Lastly, what's the goal of this test data request?",
      placeholder: 'e.g. Regression testing for release 3.2',
      optional: true
    }
  ];

  let stepIndex = -1;

  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return div;
  }

  function addHtmlMessage(role, html) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = html;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return div;
  }

  function next() {
    stepIndex += 1;
    if (stepIndex >= steps.length) return renderSummary();
    const step = steps[stepIndex];
    addMessage('bot', step.prompt);
    renderComposer(step);
  }

  function renderComposer(step) {
    composer.innerHTML = '';
    if (step.type === 'text') {
      composer.innerHTML = `
        <div class="chat-input-row">
          <input type="text" id="textInput" placeholder="${step.placeholder || ''}" value="${step.prefill || ''}" />
          <button class="btn" id="sendBtn">Send</button>
        </div>`;
      const input = document.getElementById('textInput');
      input.focus();
      const submit = () => {
        const val = input.value.trim();
        if (!val && !step.optional) return;
        answers[step.key] = val;
        addMessage('user', val || '(skipped)');
        next();
      };
      document.getElementById('sendBtn').onclick = submit;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }

    if (step.type === 'file') {
      composer.innerHTML = `
        <div class="chat-input-row" style="align-items:center;">
          <input type="file" id="fileInput" style="flex:1;" />
          <button class="btn" id="attachBtn">Attach &amp; Continue</button>
          <button class="btn secondary" id="skipBtn">Skip</button>
        </div>`;
      document.getElementById('attachBtn').onclick = () => {
        const f = document.getElementById('fileInput').files[0];
        if (!f) return;
        files[step.key] = f;
        addMessage('user', '📎 ' + f.name);
        next();
      };
      document.getElementById('skipBtn').onclick = () => {
        addMessage('user', '(skipped)');
        next();
      };
    }

    if (step.type === 'chips') {
      const selected = new Set();
      const chipsHtml = step.options
        .map((o, i) => `<div class="chip" data-i="${i}">${o}</div>`)
        .join('');
      composer.innerHTML = `
        <div class="chip-row">${chipsHtml}</div>
        <div class="chat-input-row">
          <input type="text" id="customType" placeholder="Other test type (optional)" />
          <button class="btn" id="continueBtn">Continue</button>
        </div>`;
      composer.querySelectorAll('.chip').forEach((chip) => {
        chip.onclick = () => {
          const label = step.options[Number(chip.dataset.i)];
          if (selected.has(label)) { selected.delete(label); chip.classList.remove('selected'); }
          else { selected.add(label); chip.classList.add('selected'); }
        };
      });
      document.getElementById('continueBtn').onclick = () => {
        const custom = document.getElementById('customType').value.trim();
        if (custom) selected.add(custom);
        if (selected.size === 0) return;
        answers.testTypes = Array.from(selected);
        addMessage('user', answers.testTypes.join(', '));
        next();
      };
    }
  }

  function renderSummary() {
    composer.innerHTML = '';
    addHtmlMessage(
      'bot',
      `Here's what I have:<br/>
      <b>Project:</b> ${escapeHtml(answers.projectName)}<br/>
      <b>Condition:</b> ${escapeHtml(answers.condition || '(none)')}<br/>
      <b>Test Type(s):</b> ${escapeHtml(answers.testTypes.join(', '))}<br/>
      <b>Email:</b> ${escapeHtml(answers.email)}<br/>
      <b>Goal:</b> ${escapeHtml(answers.goal || '(none)')}<br/>
      <b>Attachments:</b> ${['brdFsd', 'testCase', 'testPlan'].map((k) => files[k] ? files[k].name : '(none)').join(', ')}
      <br/><br/>Ready to generate the mock test data?`
    );
    composer.innerHTML = `<button class="btn" id="generateBtn">Generate Test Data</button>
      <button class="btn secondary" id="restartBtn">Start over</button>`;
    document.getElementById('generateBtn').onclick = generate;
    document.getElementById('restartBtn').onclick = () => location.reload();
  }

  async function generate() {
    composer.innerHTML = '<div class="typing">VASUP-Testdata AI is generating your test data...</div>';
    const fd = new FormData();
    fd.append('projectName', answers.projectName);
    fd.append('condition', answers.condition || '');
    fd.append('goal', answers.goal || '');
    fd.append('email', answers.email);
    answers.testTypes.forEach((t) => fd.append('testTypes', t));
    ['brdFsd', 'testCase', 'testPlan'].forEach((k) => { if (files[k]) fd.append(k, files[k]); });

    try {
      const res = await fetch('/portal/api/generate', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        addMessage('system', 'Error: ' + (data.error || 'generation failed'));
        composer.innerHTML = '<button class="btn secondary" id="restartBtn">Start over</button>';
        document.getElementById('restartBtn').onclick = () => location.reload();
        return;
      }
      renderResult(data);
      prependHistory(data);
    } catch (err) {
      addMessage('system', 'Network error: ' + err.message);
    }
  }

  function renderResult(data) {
    const rows = data.rows.slice(0, 8);
    const table = `
      <table style="font-size:12px; margin-top:8px;">
        <tr><th>Project</th><th>Test Name</th><th>Position</th><th>Test Case</th><th>Test Data</th><th>Type</th></tr>
        ${rows.map((r) => `<tr>
          <td>${escapeHtml(r.project_name)}</td>
          <td>${escapeHtml(r.test_name)}</td>
          <td>${escapeHtml(r.tester_position)}</td>
          <td>${escapeHtml(r.test_case)}</td>
          <td>${escapeHtml(r.test_data)}</td>
          <td>${escapeHtml(r.test_type)}</td>
        </tr>`).join('')}
      </table>
      ${data.rows.length > 8 ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">+ ${data.rows.length - 8} more rows in the exported file</div>` : ''}
    `;
    const modeNote = data.mode === 'mock'
      ? '<div class="msg system">⚠ Generated in offline/mock mode (no ANTHROPIC_API_KEY configured on the server).</div>'
      : '';
    const emailNote = data.emailMocked
      ? `<div class="msg system">✉ SMTP is not configured - the email was written to the server outbox instead of actually sent.</div>`
      : `<div class="msg system">✉ Emailed to the requested address.</div>`;

    addHtmlMessage('bot', `Done! Generated <b>${data.rows.length}</b> rows.${table}
      <div style="margin-top:10px;">
        <a class="btn small" href="${data.downloadXlsx}">Download Excel</a>
        <a class="btn small secondary" href="${data.downloadCsv}">Download CSV</a>
      </div>`);
    chatLog.insertAdjacentHTML('beforeend', modeNote + emailNote);
    chatLog.scrollTop = chatLog.scrollHeight;

    composer.innerHTML = '<button class="btn" id="newReqBtn">Start another request</button>';
    document.getElementById('newReqBtn').onclick = () => location.reload();
  }

  function prependHistory(data) {
    const panel = document.querySelector('.history-panel .card');
    if (!panel) return;
    const empty = panel.querySelector('div[style*="No requests"]');
    if (empty) empty.remove();
    const container = panel.children[1] || panel;
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="proj">${escapeHtml(answers.projectName)}</div>
      <div>${data.rows.length} rows &middot; ${escapeHtml(answers.testTypes.join(', '))}</div>
      <div style="color:#64748b;">${new Date().toLocaleString()}</div>
      <div class="links" style="margin-top:6px;">
        <a href="${data.downloadXlsx}">Excel</a>
        <a href="${data.downloadCsv}">CSV</a>
      </div>`;
    container.insertBefore(item, container.firstChild);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  addMessage('bot', "Hi! I'm the VASUP-Testdata AI — the hard-coded test data provider for VASUP projects. I'll ask a few questions, then generate mock test data as CSV/Excel and email it to you.");
  next();
})();
