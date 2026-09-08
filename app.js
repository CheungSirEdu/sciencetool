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
  const SITE_URL = "https://cheungsiredu.github.io/sciencetool/";
  const isPublic = () =>
    location.protocol === "https:" || /github\.io$/i.test(location.hostname);
  const shareUrl = () => SITE_URL;

  const state = {
    data: { items: [], photos: [], updatedAt: null, grades: [1, 2, 3, 4, 5, 6], lanUrl: "" },
    edit: false,
    local: false,
    route: { page: "home" },
    lightbox: null,
    modal: null,
    q: "",
  };

  if (!isPublic() && new URLSearchParams(location.search).get("edit") === "1") state.edit = true;

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

  const photoUrl = (name) => "photos/" + encodeURIComponent(name);

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

  function itemsOf(grade, topic) {
    return (state.data.items || []).filter((it) => {
      if (grade && it.grade !== grade) return false;
      if (topic && it.topic !== topic) return false;
      return true;
    });
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
    setTimeout(() => n.remove(), 2800);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      ...opts,
      body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "儲存失敗");
    return data;
  }

  async function load() {
    if (isPublic()) {
      const res = await fetch("data.json", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "未能載入資料");
      state.data = data;
      state.local = false;
      state.edit = false;
    } else {
      const data = await api("/api/data");
      state.data = data;
      state.local = true;
    }
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
          text: state.local
            ? "一至六年級科學教具。電腦、平板、電話均用同一公開網址。進入課題後可查看實物相片。本機可按「編輯教具」更新，再執行「更新科學教具上網」。"
            : "一至六年級科學教具。電腦、平板、電話均用同一網址。進入課題後可查看實物相片。",
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
          el("p", { text: "請把以下網址或二維碼分享給同事。電腦、平板、電話均開啟同一頁面，無須轉換網絡。" }),
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
          el("p", { text: items.length ? `${GRADE_LABEL[g]} · ${items.length} 件教具` : "本課題暫未有教具。" }),
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
    for (const it of items) {
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
            el("div", {}, ["暫無相片", el("small", { text: "可於編輯模式上傳" })]),
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
            el("button", { class: "icon-btn", type: "button", text: "編輯", onclick: () => openModal(it) }),
            el("button", {
              class: "icon-btn",
              type: "button",
              text: "刪除",
              onclick: () => removeItem(it),
            }),
          ])
        );
      }
      const card = el("article", { class: "item-card" }, [thumb, el("div", { class: "cap" }, capKids)]);
      if (showWhere) {
        card.style.cursor = "pointer";
        card.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          go(`#/${it.grade}/${encodeURIComponent(it.topic)}`);
        });
      }
      grid.append(card);
    }
    return grid;
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

    const file = el("input", { type: "file", accept: "image/*" });
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      try {
        const fd = new FormData();
        fd.append("file", file.files[0]);
        if (m.id) fd.append("itemId", m.id);
        const out = await api("/api/upload", { method: "POST", body: fd });
        if (!m.photos.includes(out.filename)) m.photos.push(out.filename);
        await load();
        toast("相片已上傳");
        drawModal();
      } catch (err) {
        toast(err.message);
      }
    });

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
          el("span", { text: "相片（可選擇現有相片或上傳新相片，可選多張）" }),
          photoPick,
          file,
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
      await load();
      toast("已儲存");
    } catch (err) {
      toast(err.message);
    }
  }

  async function removeItem(it) {
    if (!confirm(`確定刪除「${it.name}」？`)) return;
    try {
      await api("/api/items/" + it.id, { method: "DELETE" });
      await load();
      toast("已刪除");
    } catch (err) {
      toast(err.message);
    }
  }

  function render() {
    state.route = parseHash();
    if (!state.local) state.edit = false;
    document.body.classList.toggle("editing", state.edit);
    btnEdit.hidden = !state.local;
    btnReload.hidden = !state.local;
    const actions = document.querySelector(".top-actions");
    if (actions) actions.hidden = !state.local;
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

  btnEdit.addEventListener("click", () => {
    if (!state.local) return;
    state.edit = !state.edit;
    render();
  });
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
      const h = await api("/api/health");
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
  if (!isPublic()) setInterval(poll, 8000);
})();
