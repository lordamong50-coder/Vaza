import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

/* =========================================================
   ВАЗА — интерактив и админ-панель
   ========================================================= */

const DRAFT_KEY = 'vase-site-draft-v5';
const LEGACY_DRAFT_KEYS = ['vase-site-draft-v4', 'vase-site-draft-v3', 'vase-site-draft-v2', 'vase-site-draft-v1'];
const ADMIN_FLAG = 'vase-admin-mode';

const COLOR_FIELDS = {
  'Мятный акцент': '--mint',
  'Светлый мятный': '--mint-light',
  'Тёмный бирюзовый': '--teal',
  'Глубокий фон': '--deep',
  'Основной текст': '--ink',
  'Светлый фон': '--bg',
  'Фон секций': '--bg-alt',
  'Кремовый': '--cream',
  'Золотой акцент': '--gold'
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clone = (obj) => JSON.parse(JSON.stringify(obj));

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/* ---------- конфигурация ---------- */
function collectDefaults() {
  const texts = {};
  $$('[data-edit]').forEach((el) => { texts[el.dataset.edit] = el.innerHTML.trim(); });

  const images = {};
  $$('[data-image]').forEach((el) => { images[el.dataset.image] = el.getAttribute('src') || ''; });

  const colors = {};
  const styles = getComputedStyle(document.documentElement);
  for (const [label, varName] of Object.entries(COLOR_FIELDS)) {
    colors[label] = styles.getPropertyValue(varName).trim() || '#2ec4b6';
  }

  return {
    meta: { title: document.title },
    texts,
    images,
    colors,
    model: {
      src: $('#viewer')?.dataset.modelSrc || '',
      scale: 1,
      rotate: true
    }
  };
}

function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return clone(base);
  const result = clone(base);
  for (const group of ['meta', 'texts', 'images', 'colors', 'model']) {
    if (override[group] && typeof override[group] === 'object') {
      result[group] = { ...result[group], ...override[group] };
    }
  }
  return result;
}

const defaults = collectDefaults();
const deployed = window.SITE_CONFIG || {};
let draft = safeParse(localStorage.getItem(DRAFT_KEY));
if (!draft) {
  for (const key of LEGACY_DRAFT_KEYS) {
    const legacy = safeParse(localStorage.getItem(key));
    if (!legacy) continue;
    // Переносим старый черновик, но опубликованные поля берём из site-config.js.
    draft = {
      ...legacy,
      texts: { ...legacy.texts, ...(deployed.texts || {}) },
      images: { ...legacy.images, ...(deployed.images || {}) }
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    break;
  }
}
let config = mergeConfig(mergeConfig(defaults, deployed), draft);
let state = { config: clone(config), editing: false, previewSrc: null, previewExt: null };

function applyConfig(cfg) {
  $$('[data-edit]').forEach((el) => {
    const key = el.dataset.edit;
    if (Object.prototype.hasOwnProperty.call(cfg.texts, key)) el.innerHTML = cfg.texts[key];
  });
  $$('[data-image]').forEach((el) => {
    const key = el.dataset.image;
    if (Object.prototype.hasOwnProperty.call(cfg.images, key) && cfg.images[key]) el.src = cfg.images[key];
  });
  for (const [label, varName] of Object.entries(COLOR_FIELDS)) {
    if (cfg.colors[label]) document.documentElement.style.setProperty(varName, cfg.colors[label]);
  }
  document.title = cfg.meta.title || defaults.meta.title;
  const rotateBtn = $('#btn-rotate');
  if (rotateBtn) rotateBtn.setAttribute('aria-pressed', String(cfg.model.rotate !== false));
  if (viewer) {
    viewer.setScale(Number(cfg.model.scale) || 1);
    viewer.setAutoRotate(cfg.model.rotate !== false);
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.config));
    setStatus('Черновик сохранён в этом браузере.');
  } catch (e) {
    setStatus('Не удалось сохранить черновик: ' + e.message);
  }
}

function setStatus(text) {
  const el = $('#admin-status');
  if (el) el.textContent = text;
}

/* =========================================================
   3D-ПРОСМОТРЩИК
   ========================================================= */
class VaseViewer {
  constructor(container, loader, errorBox) {
    this.container = container;
    this.loader = loader;
    this.errorBox = errorBox;
    this.modelRoot = null;
    this.mixer = null;
    this.clock = new THREE.Clock();
    this.ready = false;

    try {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      this.camera.position.set(3.1, 2.4, 3.7);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      container.prepend(this.renderer.domElement);

      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.07;
      this.controls.target.set(0, 1.2, 0);
      this.controls.minDistance = 2.2;
      this.controls.maxDistance = 9;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 1.5;
      this.controls.update();

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x0f8b8d, 2.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(4, 6, 5);
      this.scene.add(key);
      const fill = new THREE.DirectionalLight(0x7bdccf, 1.1);
      fill.position.set(-4, 2, -3);
      this.scene.add(fill);

      this.resize();
      if (window.ResizeObserver) {
        new ResizeObserver(() => this.resize()).observe(container);
      } else {
        window.addEventListener('resize', () => this.resize());
      }
      this.animate();
      this.ready = true;
    } catch (err) {
      console.error('Three.js не инициализирован:', err);
      this.showError();
    }
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 420;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.renderer) return;
    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setAutoRotate(value) { if (this.controls) this.controls.autoRotate = !!value; }
  setScale(value) { if (this.modelRoot) this.modelRoot.scale.setScalar(Number(value) || 1); }

  hideLoader() {
    if (this.loader) {
      this.loader.classList.add('done');
      setTimeout(() => { this.loader.hidden = true; }, 420);
    }
  }

  showError() {
    this.hideLoader();
    if (this.errorBox) this.errorBox.hidden = false;
  }

  clearModel() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.modelRoot || this.scene);
      this.mixer = null;
    }
    if (!this.modelRoot) return;
    this.scene.remove(this.modelRoot);
    this.modelRoot.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.modelRoot = null;
  }

  normalize(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return object;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const height = Math.max(size.y, 0.0001);
    const factor = 2.4 / height;
    object.scale.setScalar(factor);
    object.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor);
    return object;
  }

  loadProcedural() {
    if (!this.ready) return;
    this.clearModel();
    const points = [
      [0.34, 0], [0.42, 0.06], [0.56, 0.18], [0.72, 0.42], [0.80, 0.70],
      [0.78, 0.96], [0.66, 1.22], [0.46, 1.48], [0.30, 1.72], [0.27, 1.96],
      [0.32, 2.10], [0.30, 2.16]
    ].map(([x, y]) => new THREE.Vector2(x, y));

    const geometry = new THREE.LatheGeometry(points, 72);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x4bcab9, roughness: 0.26, metalness: 0.04,
      clearcoat: 0.7, clearcoatRoughness: 0.22, side: THREE.DoubleSide
    });
    const vase = new THREE.Mesh(geometry, material);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.026, 12, 64),
      new THREE.MeshStandardMaterial({ color: 0xffcb72, roughness: 0.35, metalness: 0.35 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 2.16;
    vase.add(rim);

    this.modelRoot = new THREE.Group();
    this.modelRoot.add(vase);
    this.scene.add(this.modelRoot);
    this.setScale(config.model.scale || 1);
    this.hideLoader();
  }

  setModel(src, extHint, animationSrc = '') {
    if (!this.ready) return;
    if (!src) { this.loadProcedural(); return; }

    const clean = src.split('?')[0].split('#')[0];
    const ext = (extHint || clean.split('.').pop() || '').toLowerCase();
    const loadUrl = (src.startsWith('blob:') || src.startsWith('data:')) ? src : encodeURI(src);
    this.hideLoader();

    const onDone = (object, animations = []) => {
      let hasMesh = false;
      object.traverse((child) => { if (child.isMesh) hasMesh = true; });
      if (!hasMesh) {
        onFail(new Error('В файле модели нет мешей — проверьте, что экспортирована ваза, а не камера/пустая сцена.'));
        return;
      }
      this.clearModel();
      this.normalize(object);
      object.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material || new THREE.MeshStandardMaterial({ color: 0x4bcab9, roughness: 0.4 });
          child.castShadow = true;
        }
      });
      this.modelRoot = new THREE.Group();
      this.modelRoot.add(object);
      this.scene.add(this.modelRoot);

      if (animations.length) {
        this.mixer = new THREE.AnimationMixer(object);
        animations.forEach((clip) => this.mixer.clipAction(clip).play());
        // Модель уже вращается сама — камере не нужно вращаться одновременно.
        this.controls.autoRotate = false;
      } else {
        this.setAutoRotate(config.model.rotate !== false);
      }
      this.setScale(config.model.scale || 1);
      if (this.errorBox) this.errorBox.hidden = true;
    };

    const onFail = (err) => {
      console.error('Ошибка загрузки модели:', err);
      this.loadProcedural();
      this.showError();
    };

    try {
      if (ext === 'glb' || ext === 'gltf') {
        const useModel = (gltf) => {
          if (!animationSrc) { onDone(gltf.scene, gltf.animations || []); return; }
          const animUrl = (animationSrc.startsWith('blob:') || animationSrc.startsWith('data:'))
            ? animationSrc : encodeURI(animationSrc);
          new GLTFLoader().load(
            animUrl,
            (animGltf) => onDone(gltf.scene, animGltf.animations || []),
            undefined,
            () => onDone(gltf.scene, gltf.animations || [])
          );
        };
        new GLTFLoader().load(loadUrl, useModel, undefined, onFail);
      } else if (ext === 'obj') {
        const plainObj = () => new OBJLoader().load(loadUrl, onDone, undefined, onFail);
        const mtlUrl = clean.replace(/\.obj$/i, '.mtl');
        if (mtlUrl !== clean && !src.startsWith('blob:')) {
          new MTLLoader().load(encodeURI(mtlUrl), (materials) => {
            materials.preload();
            new OBJLoader().setMaterials(materials).load(loadUrl, onDone, undefined, plainObj);
          }, undefined, plainObj);
        } else {
          plainObj();
        }
      } else if (ext === 'stl') {
        new STLLoader().load(loadUrl, (geometry) => {
          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x4bcab9, roughness: 0.35, metalness: 0.1 }));
          onDone(mesh);
        }, undefined, onFail);
      } else {
        onFail(new Error('Неизвестный формат модели: ' + ext));
      }
    } catch (err) { onFail(err); }
  }

}

let viewer = null;
let animationViewer = null;

/* =========================================================
   ИНТЕРФЕЙС
   ========================================================= */
function initInterface() {
  const burger = $('#burger');
  const nav = $('#nav');
  burger?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.classList.toggle('active', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  $$('.nav a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('open');
    burger?.classList.remove('active');
    burger?.setAttribute('aria-expanded', 'false');
  }));

  $$('.switch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      $$('.switch-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      $$('.panel').forEach((panel) => {
        const active = panel.dataset.panel === mode;
        panel.hidden = !active;
        panel.classList.toggle('active', active);
      });
      if (mode === 'model') viewer?.resize();
      if (mode === 'animation') animationViewer?.resize();
    });
  });

  $('#btn-rotate')?.addEventListener('click', (e) => {
    const next = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(next));
    viewer?.setAutoRotate(next);
    state.config.model.rotate = next;
    saveDraft();
  });
  const revealItems = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    revealItems.forEach((el) => io.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('visible'));
  }

  initLightbox();
}

function initLightbox() {
  const box = $('#lightbox');
  if (!box) return;
  const img = $('#lightbox-img');
  const caption = $('#lightbox-caption');
  const frames = $$('.gallery-frame');
  let index = 0;

  const show = (i) => {
    if (!frames.length) return;
    index = (i + frames.length) % frames.length;
    const source = frames[index].querySelector('img');
    img.src = source?.src || '';
    img.alt = source?.alt || '';
    caption.innerHTML = frames[index].nextElementSibling?.innerHTML || '';
  };
  frames.forEach((frame, i) => frame.addEventListener('click', () => { show(i); box.hidden = false; }));
  $('.lightbox-close', box)?.addEventListener('click', () => { box.hidden = true; });
  $('.lightbox-prev', box)?.addEventListener('click', () => show(index - 1));
  $('.lightbox-next', box)?.addEventListener('click', () => show(index + 1));
  box.addEventListener('click', (e) => { if (e.target === box) box.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') box.hidden = true;
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
}

/* =========================================================
   АДМИН-ПАНЕЛЬ
   ========================================================= */
function buildTextList() {
  const list = $('#text-list');
  if (!list) return;
  list.innerHTML = '';
  Object.keys(state.config.texts).forEach((key) => {
    const el = $(`[data-edit="${CSS.escape(key)}"]`);
    const item = document.createElement('div');
    item.className = 'admin-item';
    const label = document.createElement('label');
    label.textContent = key;
    const snippet = document.createElement('small');
    snippet.textContent = (el?.textContent || '').trim().slice(0, 90) + '…';
    const btn = document.createElement('button');
    btn.className = 'admin-btn';
    btn.textContent = 'Найти на странице';
    btn.addEventListener('click', () => {
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'background .3s';
      el.style.background = 'rgba(255,203,114,.55)';
      setTimeout(() => { el.style.background = ''; }, 1400);
    });
    item.append(label, snippet, btn);
    list.appendChild(item);
  });
}

function buildColorList() {
  const list = $('#color-list');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(COLOR_FIELDS).forEach(([label, varName]) => {
    const item = document.createElement('div');
    item.className = 'admin-item';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = toHex(state.config.colors[label] || defaults.colors[label]);
    input.addEventListener('input', () => {
      state.config.colors[label] = input.value;
      document.documentElement.style.setProperty(varName, input.value);
    });
    input.addEventListener('change', saveDraft);
    item.append(lab, input);
    list.appendChild(item);
  });
}

function toHex(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const div = document.createElement('div');
  div.style.color = value;
  document.body.appendChild(div);
  const rgb = getComputedStyle(div).color.match(/\d+/g);
  div.remove();
  if (!rgb) return '#2ec4b6';
  return '#' + rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function buildImageList() {
  const list = $('#image-list');
  if (!list) return;
  list.innerHTML = '';
  $$('[data-image]').forEach((el) => {
    const key = el.dataset.image;
    const item = document.createElement('div');
    item.className = 'admin-item';
    const lab = document.createElement('label');
    lab.textContent = key;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = state.config.images[key] || '';
    input.placeholder = 'assets/... или https://...';
    input.addEventListener('change', () => {
      state.config.images[key] = input.value;
      if (input.value) el.src = input.value;
      saveDraft();
    });
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.config.images[key] = String(reader.result);
        el.src = String(reader.result);
        input.value = String(reader.result).slice(0, 60) + '…';
        saveDraft();
      };
      reader.readAsDataURL(f);
    });
    const preview = document.createElement('img');
    preview.src = el.src;
    preview.alt = '';
    item.append(lab, input, file, preview);
    list.appendChild(item);
  });
}

function syncModelControls() {
  const src = $('#model-src');
  const scale = $('#model-scale');
  const rotate = $('#model-rotate');
  if (src) src.value = state.config.model.src || '';
  if (scale) { scale.value = state.config.model.scale || 1; $('#scale-value').textContent = scale.value; }
  if (rotate) rotate.checked = state.config.model.rotate !== false;
}

function applyModel(fromFile = false) {
  const srcInput = $('#model-src');
  const scaleInput = $('#model-scale');
  const rotateInput = $('#model-rotate');
  const scale = Number(scaleInput?.value) || 1;
  const rotate = rotateInput?.checked !== false;

  state.config.model.scale = scale;
  state.config.model.rotate = rotate;

  let src = state.previewSrc || srcInput?.value || '';
  let ext = state.previewExt || null;

  if (fromFile && !state.previewSrc) src = srcInput?.value || '';
  if (!fromFile) { state.previewSrc = null; state.previewExt = null; src = srcInput?.value || ''; }

  state.config.model.src = fromFile ? (srcInput?.value || '') : src;
  viewer?.setScale(scale);
  viewer?.setAutoRotate(rotate);
  viewer?.setModel(src, ext);
  saveDraft();
  setStatus('Модель применена. Для всех пользователей положите файл в assets/ и опубликуйте конфиг.');
}

function exportConfig() {
  const payload = '/* Сгенерировано админ-панелью сайта «Ваза». */\nwindow.SITE_CONFIG = ' +
    JSON.stringify(state.config, null, 2) + ';\n';
  const blob = new Blob([payload], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'site-config.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importConfig(text) {
  let json = text.trim();
  const match = json.match(/window\.SITE_CONFIG\s*=\s*([\s\S]*)/);
  if (match) json = match[1].trim().replace(/;\s*$/, '');
  const parsed = JSON.parse(json);
  state.config = mergeConfig(defaults, parsed);
  config = state.config;
  applyConfig(config);
  buildTextList(); buildColorList(); buildImageList(); syncModelControls();
  viewer?.setModel(config.model.src || '');
  saveDraft();
  setStatus('Конфиг загружен.');
}

function initAdmin() {
  const panel = $('#admin-panel');
  const fab = $('#admin-fab');
  const toggleEdit = $('#toggle-edit');

  const collectTexts = () => {
    $$('[data-edit]').forEach((el) => { state.config.texts[el.dataset.edit] = el.innerHTML.trim(); });
  };

  function setEditing(on) {
    state.editing = on;
    document.body.classList.toggle('editing', on);
    if (toggleEdit) toggleEdit.textContent = on ? '✅ Готово — сохранить' : '✏️ Редактировать тексты';
    if (!on) { collectTexts(); buildTextList(); saveDraft(); }
  }

  function enableAdmin(open = false) {
    localStorage.setItem(ADMIN_FLAG, '1');
    fab?.classList.add('visible');
    if (open) panel.hidden = false;
  }

  if (localStorage.getItem(ADMIN_FLAG) === '1' || new URLSearchParams(location.search).get('admin') === '1') {
    enableAdmin(false);
  }

  fab?.addEventListener('click', () => { panel.hidden = false; });
  $('#admin-close')?.addEventListener('click', () => { if (state.editing) setEditing(false); panel.hidden = true; });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')) {
      e.preventDefault();
      if (!fab?.classList.contains('visible')) enableAdmin(true);
      else panel.hidden = !panel.hidden;
    }
  });

  $$('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.admin-view').forEach((v) => v.classList.toggle('active', v.dataset.view === tab.dataset.tab));
    });
  });

  toggleEdit?.addEventListener('click', () => setEditing(!state.editing));

  $('#model-scale')?.addEventListener('input', (e) => {
    $('#scale-value').textContent = e.target.value;
    viewer?.setScale(Number(e.target.value));
  });
  $('#model-apply')?.addEventListener('click', () => applyModel(false));
  $('#model-clear')?.addEventListener('click', () => {
    state.previewSrc = null; state.previewExt = null;
    state.config.model.src = '';
    $('#model-src').value = '';
    viewer?.loadProcedural();
    saveDraft();
    setStatus('Включена ваза-заглушка.');
  });
  $('#model-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (state.previewSrc) URL.revokeObjectURL(state.previewSrc);
    state.previewSrc = URL.createObjectURL(file);
    state.previewExt = file.name.split('.').pop().toLowerCase();
    $('#model-src').value = 'assets/' + file.name;
    viewer?.setModel(state.previewSrc, state.previewExt);
    setStatus('Файл открыт для предпросмотра. Положите его в assets/ и опубликуйте конфиг.');
  });

  $('#export-config')?.addEventListener('click', () => { collectTexts(); exportConfig(); });
  $('#import-config')?.addEventListener('click', () => $('#config-file').click());
  $('#config-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { importConfig(await file.text()); } catch (err) { setStatus('Ошибка конфига: ' + err.message); }
  });
  $('#reset-config')?.addEventListener('click', () => {
    localStorage.removeItem(DRAFT_KEY);
    state.config = clone(defaults);
    config = state.config;
    applyConfig(config);
    buildTextList(); buildColorList(); buildImageList(); syncModelControls();
    viewer?.setModel(config.model.src || '');
    setStatus('Черновик удалён. Если на сервере лежит site-config.js — удалите или замените его.');
  });

  buildTextList(); buildColorList(); buildImageList(); syncModelControls();
}

/* =========================================================
   ЗАПУСК
   ========================================================= */
applyConfig(config);
initInterface();
initAdmin();

viewer = new VaseViewer($('#viewer'), $('#loader'), $('#viewer-error'));
if (state.previewSrc) viewer.setModel(state.previewSrc, state.previewExt);
else viewer.setModel(config.model.src || '');

// Вкладка анимации: геометрия берётся из основной модели, движение — из отдельного GLB пользователя.
const animationStage = $('#animation-viewer');
if (animationStage) {
  animationViewer = new VaseViewer(animationStage, null, null);
  animationViewer.setAutoRotate(false);
  animationViewer.setModel(
    animationStage.dataset.modelSrc || config.model.src || '',
    null,
    animationStage.dataset.animationSrc || ''
  );
}
