(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const errorMessage = payload => payload?.error?.message || payload?.message || (typeof payload?.error === 'string' ? payload.error : '') || 'Microsoft Authenticator could not verify this code.';

  function close() {
    document.querySelector('#corecare-mfa-dialog')?.remove();
  }

  function recoveryView(codes, onComplete, result) {
    const dialog = document.querySelector('#corecare-mfa-dialog');
    dialog.innerHTML = `<form method="dialog" class="mfa-card"><p class="mfa-eyebrow">Account protected</p><h2>Save your recovery codes</h2><p>Store these one-use codes somewhere private. They are the only alternative if you lose access to Microsoft Authenticator.</p><div class="mfa-recovery-codes">${codes.map(code => `<code>${escapeHtml(code)}</code>`).join('')}</div><p id="mfa-message" class="mfa-message" role="status"></p><div class="mfa-actions"><button id="mfa-copy-codes" class="mfa-secondary" type="button">Copy codes</button><button id="mfa-continue" class="mfa-primary" type="button">I have saved them</button></div></form>`;
    dialog.querySelector('#mfa-copy-codes').onclick = async () => {
      await navigator.clipboard.writeText(codes.join('\n'));
      dialog.querySelector('#mfa-message').textContent = 'Recovery codes copied. Store them somewhere private.';
    };
    dialog.querySelector('#mfa-continue').onclick = () => { close(); onComplete(result); };
  }

  async function open(mfa, { onComplete = () => location.reload(), onCancel = () => location.replace('/') } = {}) {
    close();
    const dialog = document.createElement('dialog');
    dialog.id = 'corecare-mfa-dialog';
    dialog.className = 'corecare-mfa-dialog';
    const enrolment = Boolean(mfa?.enrollmentRequired);
    dialog.innerHTML = `<form id="corecare-mfa-form" class="mfa-card"><p class="mfa-eyebrow">Microsoft Authenticator</p><h2>${enrolment ? 'Protect this account' : 'Confirm it is you'}</h2><p>${enrolment ? 'In Microsoft Authenticator, select +, choose Other account, then enter the account and secret key below.' : 'Enter the current six-digit code. You can also use one unused recovery code.'}</p>${enrolment ? `<div class="mfa-setup"><span>Account</span><strong>${escapeHtml(document.querySelector('input[type=email]')?.value || 'Your CoreCare account')}</strong><span>Secret key</span><code id="mfa-secret">${escapeHtml(mfa.secret || '')}</code><div class="mfa-inline-actions"><button id="mfa-copy-secret" type="button" class="mfa-secondary">Copy key</button>${mfa.otpAuthUri ? `<a class="mfa-secondary" href="${escapeHtml(mfa.otpAuthUri)}">Open Authenticator</a>` : ''}</div></div>` : ''}<label for="mfa-code">Authenticator or recovery code</label><input id="mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="32" required autofocus><p id="mfa-error" class="mfa-error" role="alert" hidden></p><div class="mfa-actions"><button id="mfa-cancel" class="mfa-secondary" type="button">Start sign-in again</button><button class="mfa-primary" type="submit">Verify and continue</button></div></form>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('#mfa-copy-secret')?.addEventListener('click', async () => navigator.clipboard.writeText(mfa.secret || ''));
    dialog.querySelector('#mfa-cancel').onclick = onCancel;
    const form = dialog.querySelector('#corecare-mfa-form');
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]'), error = form.querySelector('#mfa-error');
      button.disabled = true; button.textContent = 'Verifying…'; error.hidden = true;
      try {
        const verification = await fetch('/api/auth/mfa/verify', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ challengeToken: mfa.challengeToken || '', code: form.elements.code.value }),
        });
        const result = await verification.json().catch(() => ({}));
        if (!verification.ok) throw new Error(errorMessage(result));
        if (Array.isArray(result.recoveryCodes) && result.recoveryCodes.length) recoveryView(result.recoveryCodes, onComplete, result);
        else { close(); onComplete(result); }
      } catch (failure) {
        error.textContent = failure.message || 'The code could not be verified.';
        error.hidden = false;
        form.elements.code.select();
      } finally {
        if (document.body.contains(button)) { button.disabled = false; button.textContent = 'Verify and continue'; }
      }
    };
  }

  async function resume(options = {}) {
    const challenge = await fetch('/api/auth/mfa/challenge', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const payload = await challenge.json().catch(() => ({}));
    if (!challenge.ok || !payload.mfa) throw new Error(errorMessage(payload));
    return open(payload.mfa, options);
  }

  window.CoreCareMfa = { open, resume };
})();
