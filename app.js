(() => {
  const GRADE_LABEL = {
    1: "一年級",
    2: "二年級",
    3: "三年級",
    4: "四年級",
    5: "五年級",
    6: "六年級",
  };
  const CHINESE_NUM = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };
  const SITE_URL = "https://sciencetool.surge.sh/";
  const GH_RAW = "https://raw.githubusercontent.com/CheungSirEdu/sciencetool/main/";
  const shareUrl = () => SITE_URL;

  const state = {
    data: { items: [], photos: [], updatedAt: null, grades: [1, 2, 3, 4, 5, 6], lanUrl: "" },
    edit: false,
    local: false,
    ghToken: sessionStorage.getItem("kit-gh") || "",
    route: { page: "home" },
    lightbox: null,
    modal: null,
    q: "",
    saving: false,
    dragId: null,
  };

  if (new URLSearchParams(location.search).get("edit") === "1") state.edit = true;
  if (sessionStorage.getItem("kit-edit") === "1") state.edit = true;

  const view = document.getElementById("view");
  const foot = document.getElementById("foot");
  const btnEdit = document.getElementById("btn-edit");
  const btnReload = document.getElementById("btn-reload");

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v === false || v == null) continue;
      else n.setAttribute(k, v);
    }
    for (const kid of [].concat(kids)) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return n;
  };

  const photoUrl = (name) => {
    const q = "?v=" + encodeURIComponent(state.data.updatedAt || Date.now());
    const file = encodeURIComponent(name);
    if (state.local) return "photos/" + file + q;
    return GH_RAW + "photos/" + file + q;
  };

  function parseHash() {
    const raw = decodeURIComponent((location.hash || "#/").replace(/^#/, ""));
    const parts = raw.split("/").filter(Boolean);
    if (!parts.length) return { page: "home" };
    const grade = Number(parts[0]);
    if (!grade) return { page: "home" };
    if (parts.length === 1) return { page: "topics", grade };
    return { page: "items", grade, topic: parts.slice(1).join("/") };
  }

  function go(hash) {
    location.hash = hash;
  }

  function ensureSort() {
    const groups = new Map();
    for (const it of state.data.items || []) {
      const key = `${it.grade}|${it.topic || ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || (a.name || "").localeCompare(b.name || "", "zh-Hant"));
      list.forEach((it, i) => {
        if (it.sort == null) it.sort = (i + 1) * 10;
      });
    }
  }

  function itemsOf(grade, topic) {
    return (state.data.items || [])
      .filter((it) => {
        if (grade && it.grade !== grade) return false;
        if (topic && it.topic !== topic) return false;
        return true;
      })
      .sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || (a.name || "").localeCompare(b.name || "", "zh-Hant"));
  }

  function topicsOf(grade) {
    const map = new Map();
    for (const it of itemsOf(grade)) {
      const t = it.topic || "未分類";
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(it);
    }
    return [...map.entries()].sort((a, b) => topicKey(a[0]) - topicKey(b[0]) || a[0].localeCompare(b[0], "zh-Hant"));
  }

  function topicKey(t) {
    const m = String(t).match(/^\s*(\d+)/);
    return m ? Number(m[1]) : 999;
  }

  function topicIndex(t) {
    const m = String(t).match(/^\s*(\d+)/);
    return m ? m[1] : "·";
  }

  function toast(msg) {
    document.querySelectorAll(".toast").forEach((n) => n.remove());
    const n = el("div", { class: "toast", text: msg });
    document.body.append(n);
    setTimeout(() => n.remove(), 3200);
  }

  function bytesToB64(bytes) {
    let s = "";
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
      s += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  async function unlockWithPassword(password) {
    const res = await fetch("gate.json", { cache: "no-store" });
    if (!res.ok) throw new Error("未能載入編輯設定");
    const gate = await res.json();
    const salt = Uint8Array.from(atob(gate.salt), (c) => c.charCodeAt(0));
    const enc = Uint8Array.from(atob(gate.data), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: gate.iter, hash: "SHA-256" },
      key,
      256
    );
    const k = new Uint8Array(bits);
    const raw = new Uint8Array(enc.length);
    for (let i = 0; i < enc.length; i++) raw[i] = enc[i] ^ k[i % k.length];
    const token = new TextDecoder().decode(raw).replace(/\0+$/g, "").trim();
    if (!/^gh[pous]_/.test(token)) throw new Error("未能開啟網上編輯");
    state.ghToken = token;
    state.ghRepo = gate.repo || "CheungSirEdu/sciencetool";
    sessionStorage.setItem("kit-gh", token);
    sessionStorage.setItem("kit-edit", "1");
  }

  function ghHeaders() {
    return {
      Authorization: "Bearer " + state.ghToken,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };
  }

  async function ghGet(path) {
    const res = await fetch("https://api.github.com/repos/" + (state.ghRepo || "CheungSirEdu/sciencetool") + "/contents/" + path, {
      headers: ghHeaders(),
    });
    if (res.status === 404) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "讀取失敗");
    return data;
  }

  async function ghPut(path, bytes, message) {
    const existing = await ghGet(path);
    const res = await fetch("https://api.github.com/repos/" + (state.ghRepo || "CheungSirEdu/sciencetool") + "/contents/" + path, {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify({
        message,
        content: bytesToB64(bytes),
        sha: existing && existing.sha,
        branch: "main",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "儲存失敗");
    return data;
  }

  async function persistCloud() {
    ensureSort();
    state.data.updatedAt = new Date().toISOString();
    const payload = Object.assign({}, state.data, {
      siteUrl: SITE_URL,
      lanUrl: SITE_URL,
    });
    const text = JSON.stringify(payload, null, 2) + "\n";
    await ghPut("data.json", new TextEncoder().encode(text), "更新科學教具");
  }

  async function compressImage(file) {
    if (!file || !file.type.startsWith("image/")) return file;
    if (file.size < 900000) return file;
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > max || h > max) {
      const scale = max / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    const name = (file.name || "photo.jpg").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  }

  async function localApi(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      ...opts,
      body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "儲存失敗");
    return data;
  }

  async function cloudApi(path, opts = {}) {
    if (!state.ghToken) throw new Error("請先進入編輯模式");
    const method = (opts.method || "GET").toUpperCase();
    if (path === "/api/data") return state.data;
    if (path === "/api/upload") {
      const fd = opts.body;
      const file = fd.get("file") || fd.get("photo");
      if (!file) throw new Error("請選擇相片");
      const packed = await compressImage(file);
      const buf = new Uint8Array(await packed.arrayBuffer());
      const safe = (packed.name || "photo.jpg").replace(/[\\/]+/g, "").replace(/^\.+/, "") || "photo.jpg";
      const stamp = Date.now().toString(36);
      const filename = stamp + "-" + safe;
      await ghPut("photos/" + filename, buf, "上傳教具相片");
      if (!state.data.photos) state.data.photos = [];
      if (!state.data.photos.includes(filename)) state.data.photos.push(filename);
      const itemId = fd.get("itemId");
      let item = null;
      if (itemId) {
        item = (state.data.items || []).find((it) => it.id === itemId);
        if (item) {
          item.photos = item.photos || [];
          if (!item.photos.includes(filename)) item.photos.push(filename);
          item.editedOnWeb = true;
          item.updatedAt = new Date().toISOString();
        }
      }
      await persistCloud();
      return { filename, item };
    }
    const body = opts.body && !(opts.body instanceof FormData) ? opts.body : {};
    if (path === "/api/items" && method === "POST") {
      const item = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        grade: Number(body.grade),
        topic: (body.topic || "未分類").trim() || "未分類",
        name: (body.name || "").trim(),
        photos: body.photos || [],
        source: "web",
        editedOnWeb: true,
        sort: body.sort != null ? Number(body.sort) : (itemsOf(Number(body.grade), body.topic).length + 1) * 10,
        updatedAt: new Date().toISOString(),
      };
      state.data.items.push(item);
      await persistCloud();
      return { item };
    }
    const put = path.match(/^\/api\/items\/([^/]+)$/);
    if (put && method === "PUT") {
      const item = (state.data.items || []).find((it) => it.id === put[1]);
      if (!item) throw new Error("找不到此教具");
      if (body.grade != null) item.grade = Number(body.grade);
      if (body.topic != null) item.topic = String(body.topic).trim() || "未分類";
      if (body.name != null) item.name = String(body.name).trim();
      if (body.photos != null) item.photos = body.photos;
      if (body.sort != null) item.sort = Number(body.sort);
      item.editedOnWeb = true;
      item.updatedAt = new Date().toISOString();
      await persistCloud();
      return { item };
    }
    if (put && method === "DELETE") {
      state.data.items = (state.data.items || []).filter((it) => it.id !== put[1]);
      await persistCloud();
      return { ok: true };
    }
    if (path === "/api/reorder" && method === "POST") {
      const ids = body.ids || [];
      const grade = Number(body.grade);
      const topic = body.topic;
      const list = itemsOf(grade, topic);
      const byId = Object.fromEntries(list.map((it) => [it.id, it]));
      ids.forEach((id, i) => {
        if (byId[id]) {
          byId[id].sort = (i + 1) * 10;
          byId[id].editedOnWeb = true;
        }
      });
      await persistCloud();
      return { ok: true, data: state.data };
    }
    throw new Error("儲存失敗");
  }

  async function api(path, opts = {}) {
    if (state.local) return localApi(path, opts);
    return cloudApi(path, opts);
  }

  async function load() {
    try {
      const h = await fetch("/api/health", { cache: "no-store" });
      if (h.ok) {
        const health = await h.json();
        if (health && health.ok) {
          state.local = true;
          state.data = await localApi("/api/data");
          ensureSort();
          afterLoad();
          return;
        }
      }
    } catch (_) {
      /* public site */
    }
    let res = await fetch(GH_RAW + "data.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) res = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "未能載入資料");
    state.data = data;
    state.local = false;
    ensureSort();
    afterLoad();
  }

  function afterLoad() {
    const active = document.activeElement;
    const typing = active && active.matches && active.matches(".search input");
    const qpos = typing ? [active.selectionStart, active.selectionEnd] : null;
    render();
    if (typing) {
      const box = document.querySelector(".search input");
      if (box) {
        box.focus();
        if (qpos) box.setSelectionRange(qpos[0], qpos[1]);
      }
    }
  }

  function crumbs(parts) {
    const backHref = parts.length <= 1 ? "#/" : parts[parts.length - 2].href;
    const path = el("div", { class: "crumbs-path" }, [
      el("a", { href: "#/", text: "年級" }),
    ]);
    parts.forEach((p, i) => {
      path.append(" › ");
      if (i === parts.length - 1) path.append(el("span", { class: "now", text: p.label }));
      else path.append(el("a", { href: p.href, text: p.label }));
    });
    return el("nav", { class: "crumbs" }, [
      el("a", { class: "back-btn", href: backHref, text: "返回" }),
      path,
    ]);
  }

  function renderHome() {
    const hero = el("div", { class: "hero" }, [
      el("div", {}, [
        el("h2", { text: "選擇年級" }),
        el("p", {
          class: "hero-desc",
          text: "一至六年級科學教具。電腦、平板、電話均用同一網址。進入課題後可查看實物相片。按「編輯教具」可新增、影相、排序，改動會直接更新網站。",
        }),
      ]),
      el("label", { class: "search" }, [
        el("span", { text: "搜尋" }),
        el("input", {
          type: "search",
          placeholder: "教具／課題名稱",
          value: state.q,
          enterkeyhint: "search",
          autocomplete: "off",
          spellcheck: "false",
          oninput: (e) => {
            state.q = e.target.value;
            drawSearchHits();
          },
        }),
      ]),
    ]);

    const grid = el("div", { class: "grade-grid" });
    for (const g of state.data.grades || [1, 2, 3, 4, 5, 6]) {
      const n = itemsOf(g).length;
      const topics = topicsOf(g).length;
      grid.append(
        el("a", { class: `grade-card g-${g}`, href: `#/${g}` }, [
          el("div", { class: "stripe" }),
          el("div", { class: "num", text: CHINESE_NUM[g] }),
          el("div", {}, [
            el("div", { class: "label", text: GRADE_LABEL[g] }),
            el("div", {
              class: "meta",
              text: n ? `${topics} 個課題 · ${n} 件教具` : "暫無教具",
            }),
          ]),
        ])
      );
    }

    view.append(hero, grid);

    const url = shareUrl();
    view.append(
      el("aside", { class: "access-card" }, [
        el("img", { class: "qr", src: "qr.png?v=" + encodeURIComponent(url), alt: "網站二維碼", width: "132", height: "132" }),
        el("div", {}, [
          el("h3", { text: "公開網址（電腦／平板／電話同一條）" }),
          el("p", { text: "請把以下網址或二維碼分享給同事。編輯後網站會即時更新。" }),
          el("div", { class: "url-row" }, [
            el("a", { class: "url-chip phone", href: url }, url),
          ]),
          el("button", {
            class: "btn",
            type: "button",
            text: "複製網址",
            onclick: copyShareUrl,
          }),
        ]),
      ])
    );

    view.append(el("div", { id: "hits" }));
    drawSearchHits();
  }

  function drawSearchHits() {
    const box = document.getElementById("hits");
    if (!box) return;
    box.replaceChildren();
    const q = state.q.trim();
    if (!q) return;
    const hits = (state.data.items || []).filter((it) =>
      (it.name + it.topic + GRADE_LABEL[it.grade]).includes(q)
    );
    box.append(el("h3", { text: hits.length ? `搜尋結果（${hits.length}）` : "沒有符合的教具", style: "margin:28px 0 12px" }));
    if (hits.length) box.append(itemGrid(hits, true));
  }

  function renderTopics() {
    const g = state.route.grade;
    const topics = topicsOf(g);
    view.append(
      crumbs([{ href: `#/${g}`, label: GRADE_LABEL[g] }]),
      el("div", { class: "hero" }, [
        el("div", {}, [
          el("h2", { text: GRADE_LABEL[g] }),
          el("p", { text: topics.length ? "請選擇課題，以查看教具及相片。" : "本年級暫未有教具。" }),
        ]),
      ])
    );
    if (state.edit) {
      view.append(
        el("div", { class: "edit-tools" }, [
          el("button", { class: "btn primary", type: "button", text: "新增教具", onclick: () => openModal({ grade: g }) }),
        ])
      );
    }
    if (!topics.length) {
      view.append(
        el("div", { class: "empty-state" }, [
          el("h3", { text: "暫無教具" }),
          el("p", { text: state.edit ? "請按上方「新增教具」，以新增第一件。" : "進入編輯模式後即可新增。" }),
        ])
      );
      return;
    }
    const list = el("div", { class: "topic-list" });
    for (const [topic, items] of topics) {
      const withPhoto = items.filter((it) => (it.photos || []).length).length;
      list.append(
        el("a", { class: "topic-row", href: `#/${g}/${encodeURIComponent(topic)}` }, [
          el("div", { class: "topic-idx", text: topicIndex(topic) }),
          el("div", {}, [
            el("h3", { text: topic }),
            el("p", { text: `${items.length} 件教具${withPhoto ? ` · ${withPhoto} 件附有相片` : ""}` }),
          ]),
          el("div", { class: "chev", text: "›" }),
        ])
      );
    }
    view.append(list);
  }

  function renderItems() {
    const g = state.route.grade;
    const topic = state.route.topic;
    const items = itemsOf(g, topic);
    view.append(
      crumbs([
        { href: `#/${g}`, label: GRADE_LABEL[g] },
        { href: `#/${g}/${encodeURIComponent(topic)}`, label: topic },
      ]),
      el("div", { class: "hero" }, [
        el("div", {}, [
          el("h2", { text: topic }),
          el("p", { text: items.length ? `${GRADE_LABEL[g]} · ${items.length} 件教具${state.edit ? " · 可拖曳或按上下鍵排序" : ""}` : "本課題暫未有教具。" }),
        ]),
      ])
    );
    if (state.edit) {
      view.append(
        el("div", { class: "edit-tools" }, [
          el("button", {
            class: "btn primary",
            type: "button",
            text: "新增教具",
            onclick: () => openModal({ grade: g, topic }),
          }),
        ])
      );
    }
    if (!items.length) {
      view.append(el("div", { class: "empty-state" }, [el("h3", { text: "暫無教具" })]));
      return;
    }
    view.append(itemGrid(items, false));
  }

  function itemGrid(items, showWhere) {
    const grid = el("div", { class: "item-grid" });
    items.forEach((it, idx) => {
      const photos = it.photos || [];
      const thumb = photos.length
        ? el("div", { class: "thumb", onclick: () => openLightbox(it, 0) }, [
            el("img", {
              src: photoUrl(photos[0]),
              alt: it.name,
              onerror: (e) => {
                e.target.replaceWith(el("div", { class: "thumb empty" }, ["暫無相片"]));
              },
            }),
          ])
        : el("div", { class: "thumb empty" }, [
            el("div", {}, ["暫無相片", el("small", { text: "可於編輯模式影相或上傳" })]),
          ]);
      if (photos.length > 1) {
        const dots = el("div", { class: "dots" });
        photos.forEach((_, i) => dots.append(el("i", { class: i === 0 ? "on" : "" })));
        thumb.append(dots);
      }
      const capKids = [
        el("div", {}, [
          el("h3", { text: it.name }),
          showWhere
            ? el("p", {
                style: "margin:4px 0 0;color:var(--ink-soft);font-size:12px",
                text: `${GRADE_LABEL[it.grade]} · ${it.topic}`,
              })
            : null,
        ]),
      ];
      if (state.edit) {
        capKids.push(
          el("div", { class: "edit-btns" }, [
            el("button", { class: "icon-btn camera", type: "button", text: "影相", onclick: (e) => { e.stopPropagation(); pickPhoto(it, true); } }),
            el("button", { class: "icon-btn", type: "button", text: "上傳", onclick: (e) => { e.stopPropagation(); pickPhoto(it, false); } }),
            el("button", { class: "icon-btn", type: "button", text: "編輯", onclick: (e) => { e.stopPropagation(); openModal(it); } }),
            el("button", { class: "icon-btn", type: "button", text: "刪除", onclick: (e) => { e.stopPropagation(); removeItem(it); } }),
          ])
        );
        if (!showWhere) {
          capKids.push(
            el("div", { class: "sort-btns" }, [
              el("button", { class: "icon-btn", type: "button", text: "上移", disabled: idx === 0, onclick: (e) => { e.stopPropagation(); moveItem(it, -1); } }),
              el("button", { class: "icon-btn", type: "button", text: "下移", disabled: idx === items.length - 1, onclick: (e) => { e.stopPropagation(); moveItem(it, 1); } }),
            ])
          );
        }
      }
      const card = el("article", { class: "item-card" + (state.edit && !showWhere ? " can-drag" : ""), "data-id": it.id }, [thumb, el("div", { class: "cap" }, capKids)]);
      if (state.edit && !showWhere) {
        card.draggable = true;
        card.addEventListener("dragstart", (e) => {
          state.dragId = it.id;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => {
          state.dragId = null;
          card.classList.remove("dragging");
        });
        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          card.classList.add("drag-over");
        });
        card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
        card.addEventListener("drop", (e) => {
          e.preventDefault();
          card.classList.remove("drag-over");
          if (!state.dragId || state.dragId === it.id) return;
          dropReorder(state.dragId, it.id);
        });
      }
      if (showWhere) {
        card.style.cursor = "pointer";
        card.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          go(`#/${it.grade}/${encodeURIComponent(it.topic)}`);
        });
      }
      grid.append(card);
    });
    return grid;
  }

  async function saveOrder(grade, topic) {
    const ids = itemsOf(grade, topic).map((it) => it.id);
    await api("/api/reorder", { method: "POST", body: { grade, topic, ids } });
    if (state.local) await load();
    else render();
    toast("順序已更新，網站正在更新");
  }

  async function moveItem(it, dir) {
    const list = itemsOf(it.grade, it.topic);
    const i = list.findIndex((x) => x.id === it.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i].sort ?? (i + 1) * 10;
    const b = list[j].sort ?? (j + 1) * 10;
    list[i].sort = b;
    list[j].sort = a;
    try {
      await saveOrder(it.grade, it.topic);
    } catch (err) {
      toast(err.message);
    }
  }

  async function dropReorder(fromId, toId) {
    const to = (state.data.items || []).find((x) => x.id === toId);
    if (!to) return;
    const list = itemsOf(to.grade, to.topic);
    const fromIdx = list.findIndex((x) => x.id === fromId);
    const toIdx = list.findIndex((x) => x.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    list.forEach((it, i) => { it.sort = (i + 1) * 10; });
    try {
      await saveOrder(to.grade, to.topic);
    } catch (err) {
      toast(err.message);
    }
  }

  function pickPhoto(item, camera) {
    const input = el("input", { type: "file", accept: "image/*" });
    if (camera) input.setAttribute("capture", "environment");
    input.addEventListener("change", async () => {
      if (!input.files[0]) return;
      try {
        toast(camera ? "正在上傳相片…" : "正在上傳…");
        const fd = new FormData();
        fd.append("file", input.files[0]);
        fd.append("itemId", item.id);
        await api("/api/upload", { method: "POST", body: fd });
        if (state.local) await load();
        else render();
        toast("相片已更新到網站");
      } catch (err) {
        toast(err.message);
      }
    });
    input.click();
  }

  function openLightbox(item, idx) {
    const photos = item.photos || [];
    if (!photos.length) return;
    state.lightbox = { item, idx };
    drawLightbox();
  }

  function drawLightbox() {
    document.querySelectorAll(".lightbox").forEach((n) => n.remove());
    const lb = state.lightbox;
    if (!lb) return;
    const photos = lb.item.photos || [];
    const i = ((lb.idx % photos.length) + photos.length) % photos.length;
    lb.idx = i;
    const box = el("div", { class: "lightbox" }, [
      el("header", {}, [
        el("strong", { text: lb.item.name }),
        el("button", { class: "btn", type: "button", text: "關閉", onclick: () => { state.lightbox = null; drawLightbox(); } }),
      ]),
      el("div", { class: "stage" }, [el("img", { src: photoUrl(photos[i]), alt: lb.item.name })]),
      el("footer", {}, [
        el("button", {
          class: "btn",
          type: "button",
          text: "上一張",
          disabled: photos.length < 2,
          onclick: () => { lb.idx -= 1; drawLightbox(); },
        }),
        el("span", { text: `${i + 1} / ${photos.length}` }),
        el("button", {
          class: "btn",
          type: "button",
          text: "下一張",
          disabled: photos.length < 2,
          onclick: () => { lb.idx += 1; drawLightbox(); },
        }),
      ]),
    ]);
    box.addEventListener("click", (e) => {
      if (e.target === box || e.target.classList.contains("stage")) {
        state.lightbox = null;
        drawLightbox();
      }
    });
    let startX = 0;
    box.addEventListener("touchstart", (e) => {
      startX = e.changedTouches[0].clientX;
    }, { passive: true });
    box.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40 || photos.length < 2) return;
      lb.idx += dx < 0 ? 1 : -1;
      drawLightbox();
    });
    document.body.append(box);
  }

  async function copyShareUrl() {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast("已複製網址");
    } catch (_) {
      toast(url);
    }
  }

  function openModal(item) {
    state.modal = {
      id: item.id || null,
      grade: item.grade || 1,
      topic: item.topic || "",
      name: item.name || "",
      photos: [...(item.photos || [])],
    };
    drawModal();
  }

  function drawModal() {
    document.querySelectorAll(".modal-back").forEach((n) => n.remove());
    const m = state.modal;
    if (!m) return;
    const topics = [...new Set((state.data.items || []).filter((it) => it.grade === Number(m.grade)).map((it) => it.topic))].sort(
      (a, b) => topicKey(a) - topicKey(b) || a.localeCompare(b, "zh-Hant")
    );
    const selected = new Set(m.photos);
    const photoPick = el("div", { class: "photo-pick" });
    for (const name of state.data.photos || []) {
      const lab = el("label", { class: selected.has(name) ? "on" : "", title: name }, [
        el("img", { src: photoUrl(name), alt: name }),
      ]);
      lab.addEventListener("click", () => {
        if (selected.has(name)) m.photos = m.photos.filter((p) => p !== name);
        else m.photos = [...m.photos, name];
        drawModal();
      });
      photoPick.append(lab);
    }

    const camera = el("input", { type: "file", accept: "image/*" });
    camera.setAttribute("capture", "environment");
    const album = el("input", { type: "file", accept: "image/*" });
    const onFile = async (file) => {
      if (!file) return;
      try {
        toast("正在上傳相片…");
        const fd = new FormData();
        fd.append("file", file);
        if (m.id) fd.append("itemId", m.id);
        const out = await api("/api/upload", { method: "POST", body: fd });
        if (!m.photos.includes(out.filename)) m.photos.push(out.filename);
        if (state.local) await load();
        toast("相片已上傳");
        drawModal();
      } catch (err) {
        toast(err.message);
      }
    };
    camera.addEventListener("change", () => onFile(camera.files[0]));
    album.addEventListener("change", () => onFile(album.files[0]));

    const back = el("div", { class: "modal-back" }, [
      el("div", { class: "modal" }, [
        el("h3", { text: m.id ? "修改教具" : "新增教具" }),
        el("label", { class: "field" }, [
          el("span", { text: "年級" }),
          el(
            "select",
            {
              onchange: (e) => {
                m.grade = Number(e.target.value);
                drawModal();
              },
            },
            [1, 2, 3, 4, 5, 6].map((g) =>
              el("option", { value: String(g), selected: g === Number(m.grade), text: GRADE_LABEL[g] })
            )
          ),
        ]),
        el("label", { class: "field" }, [
          el("span", { text: "課題（可輸入新課題）" }),
          (() => {
            const input = el("input", {
              list: "topic-list",
              value: m.topic,
              placeholder: "例如：3. 植物知多少",
              oninput: (e) => { m.topic = e.target.value; },
            });
            return el("div", {}, [
              input,
              el(
                "datalist",
                { id: "topic-list" },
                topics.map((t) => el("option", { value: t }))
              ),
            ]);
          })(),
        ]),
        el("label", { class: "field" }, [
          el("span", { text: "教具名稱" }),
          el("input", {
            value: m.name,
            placeholder: "例如：放大鏡",
            oninput: (e) => { m.name = e.target.value; },
          }),
        ]),
        el("div", { class: "field" }, [
          el("span", { text: "相片（電話可即場影相；電腦可上傳）" }),
          photoPick,
          el("div", { class: "photo-actions" }, [
            el("button", { class: "btn primary", type: "button", text: "影相", onclick: () => camera.click() }),
            el("button", { class: "btn", type: "button", text: "從相簿／檔案", onclick: () => album.click() }),
          ]),
        ]),
        el("div", { class: "modal-actions" }, [
          el("button", { class: "btn", type: "button", text: "取消", onclick: () => { state.modal = null; drawModal(); } }),
          el("button", { class: "btn primary", type: "button", text: "儲存", onclick: saveModal }),
        ]),
      ]),
    ]);
    back.addEventListener("click", (e) => {
      if (e.target === back) {
        state.modal = null;
        drawModal();
      }
    });
    document.body.append(back);
  }

  async function saveModal() {
    const m = state.modal;
    if (!m.name.trim()) {
      toast("請填寫教具名稱");
      return;
    }
    try {
      const payload = { grade: Number(m.grade), topic: m.topic.trim(), name: m.name.trim(), photos: m.photos };
      if (m.id) await api("/api/items/" + m.id, { method: "PUT", body: payload });
      else await api("/api/items", { method: "POST", body: payload });
      state.modal = null;
      drawModal();
      if (state.local) await load();
      else render();
      toast("已儲存，網站正在更新");
    } catch (err) {
      toast(err.message);
    }
  }

  async function removeItem(it) {
    if (!confirm(`確定刪除「${it.name}」？`)) return;
    try {
      await api("/api/items/" + it.id, { method: "DELETE" });
      if (state.local) await load();
      else render();
      toast("已刪除，網站正在更新");
    } catch (err) {
      toast(err.message);
    }
  }

  async function ensureCloudEdit() {
    if (state.local || state.ghToken) return;
    await unlockWithPassword("chilin");
  }

  async function toggleEdit() {
    if (state.edit) {
      state.edit = false;
      render();
      return;
    }
    if (!state.local) {
      try {
        await ensureCloudEdit();
      } catch (err) {
        toast(err.message || "未能開啟網上編輯");
        return;
      }
    }
    state.edit = true;
    sessionStorage.setItem("kit-edit", "1");
    render();
  }

  function render() {
    state.route = parseHash();
    document.body.classList.toggle("editing", state.edit);
    btnEdit.hidden = false;
    btnReload.hidden = !state.local;
    const actions = document.querySelector(".top-actions");
    if (actions) actions.hidden = false;
    const editFull = state.edit ? "完成編輯" : "編輯教具";
    const editShort = state.edit ? "完成" : "編輯";
    btnEdit.replaceChildren(
      el("span", { class: "label-full", text: editFull }),
      el("span", { class: "label-short", text: editShort })
    );
    btnEdit.classList.toggle("edit-on", state.edit);
    view.innerHTML = "";
    if (state.route.page === "topics") renderTopics();
    else if (state.route.page === "items") renderItems();
    else renderHome();
    const n = (state.data.items || []).length;
    const updated = (state.data.updatedAt || "—").replace("T", " ").slice(0, 16);
    foot.replaceChildren(
      el("span", { class: "foot-full", text: `共 ${n} 件教具 · 最後更新 ${state.data.updatedAt || "—"} · 公開網址：${SITE_URL}` }),
      el("span", { class: "foot-short", text: `共 ${n} 件教具 · 更新 ${updated}` })
    );
  }

  btnEdit.addEventListener("click", () => { toggleEdit(); });
  btnReload.addEventListener("click", async () => {
    if (!state.local) return;
    try {
      await api("/api/import-excel", { method: "POST", body: {} });
      await load();
      toast("已從 Excel 重新載入");
    } catch (err) {
      toast(err.message);
    }
  });
  window.addEventListener("hashchange", render);

  let lastStamp = null;
  async function poll() {
    try {
      if (!state.local) return;
      const h = await localApi("/api/health");
      if (lastStamp && h.updatedAt && h.updatedAt !== lastStamp) {
        await load();
        toast("教具表已更新");
      }
      lastStamp = h.updatedAt;
    } catch (_) {
      /* 離線時靜默 */
    }
  }

  load()
    .then(() => {
      lastStamp = state.data.updatedAt;
    })
    .catch((err) => {
      view.append(
        el("div", { class: "empty-state" }, [
          el("h3", { text: "未能載入資料" }),
          el("p", { text: err.message + "。請以網址開啟本網站。" }),
        ])
      );
    });
  setInterval(poll, 8000);
})();
