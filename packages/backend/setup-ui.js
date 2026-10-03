const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instalar DMMarket</title>
<link rel="stylesheet" href="/setup.css">
<script src="/setup.js" defer></script>
</head>
<body>
<main class="card">
  <header><div class="brand">DM<span>Market</span></div><span class="tag">Asistente de instalación</span></header>
  <div class="progress"><div id="progress-fill"></div></div>
  <p id="step-label" class="eyebrow">Paso 1 de 6 · Bienvenida</p>
  <div id="error" class="notice error" role="alert" hidden></div>
  <form id="wizard" autocomplete="off" novalidate>
    <section data-step="1">
      <h1>Tu servidor, listo en unos pasos</h1>
      <p>Vamos a conectar la base de datos del negocio y dejar DMMarket encendido automáticamente, incluso antes de iniciar sesión.</p>
      <ol class="journey"><li>Conecta tu base MySQL existente.</li><li>Elige cómo acceder al sistema.</li><li>Confirma y deja que instalemos el servicio.</li></ol>
      <div id="existing-note" class="notice" hidden>Encontramos una configuración anterior. Puedes conservarla o corregir los datos. La contraseña guardada no se mostrará.</div>
      <p class="muted">No instalamos MySQL ni importamos o reemplazamos tu base de datos. La configuración solo se guarda cuando confirmas la instalación.</p>
    </section>
    <section data-step="2" hidden>
      <h1>Conecta la base del negocio</h1>
      <p>Usa los datos del MySQL donde ya están los productos, clientes y operaciones. Si no los conoces, pídelos a quien administra esa base.</p>
      <div class="grid">
        <label>Servidor MySQL<input id="DATABASE_HOST" required maxlength="255" placeholder="localhost o 192.168.1.10"><small>localhost si MySQL está en esta misma máquina.</small></label>
        <label>Puerto MySQL<input id="DATABASE_PORT" required type="number" min="1" max="65535" value="3306"></label>
      </div>
      <label>Nombre de la base de datos<input id="DATABASE_NAME" required maxlength="255" placeholder="Nombre de la base del negocio"></label>
      <label>Usuario MySQL<input id="DATABASE_USER" required maxlength="255" placeholder="Usuario con acceso a la base"></label>
      <label id="saved-password-label" class="check" hidden><input id="use-saved-password" type="checkbox">Conservar la contraseña guardada</label>
      <label>Contraseña MySQL<input id="DATABASE_PASSWORD" type="password" maxlength="1024" autocomplete="off"><small>Se oculta y nunca aparece en el resumen. Puede quedar vacía si tu usuario no usa contraseña.</small></label>
    </section>
    <section data-step="3" hidden>
      <h1>Comprobemos la conexión</h1>
      <p>La prueba es de solo lectura: comprueba el acceso y las tablas principales. No cambia datos ni aplica migraciones.</p>
      <div id="connection-result" class="notice" role="status">Preparando la comprobación…</div>
      <button id="test-button" class="secondary" type="button">Volver a comprobar</button>
      <p class="muted">Si hay un error, vuelve al paso anterior para corregir los datos.</p>
    </section>
    <section data-step="4" hidden>
      <h1>¿Desde dónde vas a acceder?</h1>
      <label>Acceso<select id="HOST"><option value="0.0.0.0">Desde las máquinas de mi red local</option><option value="127.0.0.1">Solo desde este servidor</option></select></label>
      <label>Puerto de DMMarket<input id="PORT" type="number" required min="1" max="65535" value="8000"><small>Recomendado: 8000. El sistema conservará siempre este puerto.</small></label>
      <div id="firewall-options">
        <label class="check"><input id="allow-firewall" type="checkbox">Crear una regla de firewall solo para mi red local</label>
        <label id="network-label" hidden>Red autorizada<input id="network" placeholder="192.168.1.0/24"><small>Ejemplo: 192.168.1.0/24. Comprueba que incluye las máquinas del negocio. No se aceptan redes públicas.</small></label>
      </div>
      <div id="network-note" class="notice"></div>
      <p class="muted">El acceso es para una red local de confianza: no publiques este puerto en Internet. No cambiaremos la IP del servidor ni las reglas de SSH. Reserva una IP fija en tu router y evita que el servidor se suspenda.</p>
    </section>
    <section data-step="5" hidden>
      <h1>Todo listo para instalar</h1>
      <dl id="summary"></dl>
      <div class="notice">DMMarket se iniciará al encender la máquina y se reiniciará si el proceso termina. Las migraciones pendientes de la aplicación se ejecutarán al iniciar.</div>
      <label class="check"><input id="backup-confirmed" type="checkbox">Tengo un respaldo reciente de la base de datos.</label>
      <label class="check"><input id="install-confirmed" type="checkbox">Confirmo la configuración y la instalación del servicio.</label>
      <p class="muted">Si ya estaba instalado, se reiniciará y se guardará la configuración que acabas de revisar.</p>
    </section>
    <section data-step="6" hidden>
      <h1 id="result-title">Comprobando tu servidor…</h1>
      <div id="installation-result" class="notice" role="status">El servicio está registrado. Esperando a que DMMarket responda…</div>
      <ul id="access-links" class="links"></ul>
      <div id="warnings" class="notice" hidden></div>
      <p id="directory" class="muted"></p>
      <div id="diagnostic" hidden><p>Si no inicia, revisa la conexión MySQL o los logs. Puedes volver a comprobar sin instalar de nuevo.</p><code id="diagnostic-command"></code></div>
      <button id="retry-button" class="secondary" type="button" hidden>Volver a comprobar el inicio</button>
      <p class="muted">Comprueba el acceso desde otra máquina y luego reinicia el servidor para verificar el arranque automático. Puedes cerrar esta ventana al finalizar.</p>
    </section>
    <footer><button id="cancel" class="plain" type="button">Cancelar</button><div class="navigation"><button id="back" class="secondary" type="button" hidden>Atrás</button><button id="next" class="primary" type="submit" disabled>Cargando…</button></div></footer>
  </form>
  <p class="security">Asistente local protegido · Sin recursos de terceros</p>
</main>
</body>
</html>`;

const css = `
:root { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172a41; background: #eef3f8; font-size: 16px; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; padding: 40px 20px; }
.card { max-width: 760px; margin: auto; background: white; border-radius: 20px; padding: 36px 42px 20px; box-shadow: 0 12px 50px #172a4110; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.brand { font-size: 26px; font-weight: 800; letter-spacing: -1px; }
.brand span { color: #127d64; }
.tag { font-size: 12px; padding: 7px 10px; border-radius: 20px; background: #edf7f4; color: #127d64; }
.progress { height: 5px; margin-top: 28px; background: #e9eef3; border-radius: 6px; overflow: hidden; }
#progress-fill { height: 100%; width: 16.67%; background: #127d64; transition: width .2s; }
.eyebrow { color: #557087; font-size: 13px; margin: 14px 0 24px; }
h1 { font-size: 27px; letter-spacing: -.6px; margin: 0 0 12px; }
p { line-height: 1.65; color: #506278; }
.journey { padding-left: 24px; margin: 24px 0; }
.journey li { padding: 7px 0; }
label { display: block; margin: 18px 0; font-weight: 600; font-size: 14px; }
input:not([type=checkbox]), select { display: block; width: 100%; margin-top: 8px; padding: 12px 13px; font: inherit; color: #172a41; border: 1px solid #ccd7e1; border-radius: 8px; background: white; }
input:focus, select:focus, button:focus-visible, a:focus-visible { outline: 3px solid #8ad0bc; outline-offset: 2px; }
input:disabled { background: #edf1f5; }
small { display: block; font-weight: 400; color: #65788b; margin-top: 7px; line-height: 1.5; }
.grid { display: grid; grid-template-columns: 2fr 1fr; gap: 18px; }
.check { display: flex; gap: 10px; align-items: flex-start; line-height: 1.55; }
.check input { width: 18px; height: 18px; margin: 2px 0 0; flex-shrink: 0; accent-color: #127d64; }
.notice { background: #eef5fa; border: 1px solid #d7e5ef; color: #34526d; padding: 16px; border-radius: 10px; margin: 20px 0; line-height: 1.55; font-size: 14px; white-space: pre-line; }
.notice.success { background: #ebf8f1; border-color: #bbe5cc; color: #176b43; }
.notice.error { background: #fff1ef; border-color: #f1c4bd; color: #a43726; }
.muted, .security { font-size: 13px; color: #6a7e90; }
.security { text-align: center; font-size: 11px; margin-top: 24px; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid #e5ebf1; margin-top: 32px; padding-top: 24px; }
.navigation { display: flex; gap: 10px; margin-left: auto; }
button { padding: 11px 17px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
button:disabled { opacity: .5; cursor: default; }
.primary { background: #127d64; color: white; }
.primary:hover:not(:disabled) { background: #09644f; }
.secondary { background: white; border-color: #ccd7e1; color: #34526d; }
.plain { background: transparent; color: #65788b; padding-left: 0; }
dl { display: grid; grid-template-columns: 140px 1fr; gap: 12px 18px; font-size: 14px; }
dt { color: #65788b; } dd { margin: 0; overflow-wrap: anywhere; }
.links { padding-left: 20px; line-height: 2; } a { color: #127d64; font-weight: 600; }
code { display: block; background: #f0f4f8; border-radius: 8px; padding: 12px; overflow-wrap: anywhere; font-size: 12px; }
@media (max-width: 600px) { body { padding: 12px; } .card { padding: 25px 20px 15px; } .grid { grid-template-columns: 1fr; gap: 0; } h1 { font-size: 23px; } .tag { display: none; } dl { grid-template-columns: 1fr; gap: 5px; } dd { margin-bottom: 12px; } button { padding: 10px 12px; } }
`;

const script = String.raw`
const byId = (id) => document.getElementById(id);
const token = location.hash.slice(1) || sessionStorage.getItem('dmmarket-setup-token') || '';
if (token) sessionStorage.setItem('dmmarket-setup-token', token);
history.replaceState(null, '', location.pathname);
let step = 1;
let busy = false;
let verified = false;
let metadata;
const names = ['Bienvenida', 'Base de datos', 'Comprobación', 'Acceso', 'Confirmación', 'Resultado'];
const keys = ['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_NAME', 'HOST', 'PORT'];

async function api(path, body) {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || 'No se pudo completar la operación.');
  return result;
}

function payload() {
  const result = Object.fromEntries(keys.map((key) => [key, byId(key).value]));
  result.useSavedPassword = byId('use-saved-password').checked;
  result.allowFirewall = byId('allow-firewall').checked && result.HOST === '0.0.0.0' && metadata.platform !== 'darwin';
  result.network = byId('network').value.trim();
  return result;
}

function error(message) {
  byId('error').textContent = message;
  byId('error').hidden = !message;
}

function updateButtons() {
  byId('back').hidden = step === 1 || step === 6;
  byId('back').disabled = busy;
  byId('cancel').hidden = step === 6;
  byId('cancel').disabled = busy;
  byId('test-button').disabled = busy;
  byId('retry-button').disabled = busy;
  byId('next').textContent = busy ? 'Un momento…' : step === 1 ? 'Comenzar' : step === 5 ? 'Instalar DMMarket' : step === 6 ? 'Finalizar' : 'Siguiente';
  byId('next').disabled = busy || !metadata || (step === 3 && !verified) || (step === 5 && (!byId('backup-confirmed').checked || !byId('install-confirmed').checked));
}

function show(number) {
  step = number;
  document.querySelectorAll('[data-step]').forEach((section) => { section.hidden = Number(section.dataset.step) !== step; });
  byId('step-label').textContent = 'Paso ' + step + ' de 6 · ' + names[step - 1];
  byId('progress-fill').style.width = (step / 6 * 100) + '%';
  error('');
  updateButtons();
  window.scrollTo(0, 0);
}

function networkOptions() {
  const lan = byId('HOST').value === '0.0.0.0';
  byId('firewall-options').hidden = !lan || metadata.platform === 'darwin';
  byId('network-label').hidden = !lan || !byId('allow-firewall').checked;
  byId('network').required = lan && byId('allow-firewall').checked && metadata.platform !== 'darwin';
  byId('network-note').textContent = !lan
    ? 'Solo se podrá acceder desde esta máquina. No se abrirá el firewall.'
    : metadata.platform === 'darwin'
      ? 'Si el firewall de macOS bloquea el acceso, autoriza DMMarket en Ajustes del Sistema → Red → Firewall → Opciones. El asistente no desactiva tu firewall.'
      : 'La regla es opcional y solo permite TCP desde la red indicada. En Ubuntu usa UFW, sin activarlo ni cambiar las reglas de SSH. Si usas otro firewall, deberás autorizar el puerto allí.';
}

function validFields(number) {
  const section = document.querySelector('[data-step="' + number + '"]');
  for (const field of section.querySelectorAll('input, select')) {
    if (!field.disabled && !field.reportValidity()) return false;
  }
  return true;
}

async function checkConnection() {
  busy = true;
  verified = false;
  error('');
  updateButtons();
  byId('connection-result').className = 'notice';
  byId('connection-result').textContent = 'Conectando con MySQL y comprobando las tablas…';
  try {
    const result = await api('test', payload());
    verified = true;
    byId('connection-result').className = 'notice success';
    byId('connection-result').textContent = result.message;
  } catch (failure) {
    byId('connection-result').className = 'notice error';
    byId('connection-result').textContent = failure.message;
  } finally {
    busy = false;
    updateButtons();
  }
}

function summary() {
  const values = payload();
  const rows = [
    ['Base de datos', values.DATABASE_NAME],
    ['MySQL', values.DATABASE_HOST + ':' + values.DATABASE_PORT],
    ['Usuario', values.DATABASE_USER],
    ['Acceso', values.HOST === '0.0.0.0' ? 'Red local · puerto ' + values.PORT : 'Solo este servidor · puerto ' + values.PORT],
    ['Firewall', values.allowFirewall ? 'Permitir solo ' + values.network : 'Sin cambios automáticos'],
    ['Archivos', metadata.directory],
    ['Arranque', 'Automático, sin iniciar sesión'],
  ];
  byId('summary').replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    byId('summary').append(term, description);
  }
}

async function checkStartup() {
  busy = true;
  updateButtons();
  byId('retry-button').hidden = true;
  byId('result-title').textContent = 'Comprobando tu servidor…';
  byId('installation-result').className = 'notice';
  byId('installation-result').textContent = 'El servicio está registrado. Esperando a que DMMarket responda…';
  try {
    const deadline = Date.now() + 45000;
    let result;
    do {
      result = await api('status');
      if (result.ready) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } while (Date.now() < deadline);
    byId('result-title').textContent = result.ready ? '¡DMMarket está listo!' : 'Registrado, pero aún no responde';
    byId('installation-result').className = result.ready ? 'notice success' : 'notice error';
    byId('installation-result').textContent = result.ready
      ? 'El sistema está funcionando y arrancará automáticamente al encender el servidor.'
      : 'No pudimos confirmar el inicio. No des la instalación por terminada: el supervisor seguirá reintentando, pero puede haber un error de MySQL, del puerto o de las migraciones.';
    byId('access-links').replaceChildren();
    for (const url of result.urls) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = url;
      link.textContent = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
      byId('access-links').append(item);
    }
    const notices = [...result.warnings];
    if (result.localOnly) notices.push('Esta dirección es local al servidor. Si estás usando SSH desde otra máquina, también necesitas un túnel para el puerto de DMMarket.');
    byId('warnings').textContent = notices.join('\n\n');
    byId('warnings').hidden = !notices.length;
    byId('directory').textContent = 'La configuración queda en ' + result.directory + '. No necesitas conservar la carpeta de descarga.';
    byId('diagnostic').hidden = result.ready;
    byId('diagnostic-command').textContent = result.diagnostic;
    byId('retry-button').hidden = result.ready;
  } catch (failure) {
    error(failure.message);
    byId('result-title').textContent = 'No pudimos comprobar el inicio';
    byId('retry-button').hidden = false;
  } finally {
    busy = false;
    updateButtons();
  }
}

async function finish(cancelled) {
  busy = true;
  updateButtons();
  try {
    await api('finish', {});
    sessionStorage.removeItem('dmmarket-setup-token');
    if (cancelled) document.querySelectorAll('[data-step]').forEach((section) => { section.hidden = true; });
    const closing = document.createElement('div');
    closing.className = 'notice';
    closing.textContent = cancelled ? 'Asistente cerrado. Puedes volver a abrirlo cuando lo necesites.' : 'Asistente cerrado. Puedes seguir usando DMMarket en la dirección indicada y cerrar esta pestaña.';
    byId('wizard').prepend(closing);
    document.querySelector('footer').hidden = true;
  } catch (failure) {
    error(failure.message);
    busy = false;
    updateButtons();
  }
}

byId('wizard').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (step === 1) show(2);
  else if (step === 2 && validFields(2)) { show(3); await checkConnection(); }
  else if (step === 3 && verified) { show(4); networkOptions(); }
  else if (step === 4 && validFields(4)) { summary(); show(5); }
  else if (step === 5) {
    busy = true;
    updateButtons();
    error('');
    try {
      await api('install', { ...payload(), confirm: byId('install-confirmed').checked, backupConfirmed: byId('backup-confirmed').checked });
      show(6);
      await checkStartup();
    } catch (failure) {
      error(failure.message);
    } finally {
      busy = false;
      updateButtons();
    }
  } else if (step === 6) await finish(false);
});
byId('back').addEventListener('click', () => { if (!busy) show(step - 1); });
byId('cancel').addEventListener('click', () => { if (!busy && confirm('¿Cerrar el asistente sin instalar?')) finish(true); });
byId('test-button').addEventListener('click', checkConnection);
byId('retry-button').addEventListener('click', checkStartup);
byId('HOST').addEventListener('change', networkOptions);
byId('allow-firewall').addEventListener('change', networkOptions);
byId('backup-confirmed').addEventListener('change', updateButtons);
byId('install-confirmed').addEventListener('change', updateButtons);
byId('use-saved-password').addEventListener('change', () => { byId('DATABASE_PASSWORD').disabled = byId('use-saved-password').checked; verified = false; });
for (const key of keys.filter((key) => key.startsWith('DATABASE_'))) byId(key).addEventListener('input', () => { verified = false; });

(async () => {
  try {
    metadata = await api('config');
    for (const [key, value] of Object.entries(metadata.fields)) byId(key).value = value;
    byId('existing-note').hidden = !metadata.installed;
    byId('saved-password-label').hidden = !metadata.hasSavedPassword;
    byId('use-saved-password').checked = metadata.hasSavedPassword;
    byId('DATABASE_PASSWORD').disabled = metadata.hasSavedPassword;
    byId('network').value = metadata.addresses[0]?.network || '';
    byId('allow-firewall').checked = metadata.platform !== 'darwin' && !!metadata.addresses.length;
    networkOptions();
    updateButtons();
    if (metadata.completed) { show(6); await checkStartup(); }
  } catch (failure) {
    error(failure.message + ' Mantén abierta la ventana del instalador y vuelve a abrir su enlace si la sesión expiró.');
    byId('next').textContent = 'Sesión no disponible';
  }
})();
`;

module.exports = { html, css, script };
