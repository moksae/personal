// ═══════════════════════════════════════════════════
//  Personal Homepage — Full App
//  Sections: Home Feed · Reviews · Writings
// ═══════════════════════════════════════════════════

const App = (() => {

  // ─── State ─────────────────────────────────────
  const S = {
    data: { config: {}, posts: [], reviews: [], writings: [] },
    isAdmin: false,
    token: null, owner: null, repo: null,
    // Feed
    feedView: 'list',     // 'list' | 'thread'
    feedThreadId: null,
    replyTo: null,
    editPost: null,
    // Reviews
    reviewCat: 'all',
    reviewView: 'list',   // 'list' | 'detail'
    reviewId: null,
    editReview: null,     // review being edited
    // Writings
    writingView: 'list',  // 'list' | 'detail'
    writingId: null,
    editWriting: null,
    // Current section
    section: 'home',
    _pendingImages: [],        // feed post images
    _pendingReviewImages: [],     // review images
    _pendingWritingImages: [],    // writing images
    _fileSha: null,      // cached GitHub SHA
  };

  // ─── Category Config ────────────────────────────
  const CATS = {
    movie:  { label: 'Movie',  emoji: '🎬' },
    game:   { label: 'Game',   emoji: '🎮' },
    drama:  { label: 'Drama',  emoji: '📺' },
    book:   { label: 'Book',   emoji: '📚' },
    travel: { label: 'Travel', emoji: '✈️' },
  };

  // ─── Init ───────────────────────────────────────
  function init() {
    loadCreds();
    loadData();
    bindGlobal();
  }

  // ─── Data ───────────────────────────────────────
  function getBase() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length && !parts[0].includes('.') && !parts[0].endsWith('.html')) {
      return '/' + parts[0];
    }
    return '';
  }

  async function loadData(attempt = 1) {
    try {
      const url = getBase() + '/data/posts.json?_t=' + Date.now();
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      S.data = await r.json();
      S.data.posts    = S.data.posts    || [];
      S.data.reviews  = S.data.reviews  || [];
      S.data.writings = S.data.writings || [];
      renderAll();
    } catch(e) {
      if (attempt < 3) {
        setTimeout(() => loadData(attempt + 1), 800 * attempt);
      } else {
        document.getElementById('posts-list').innerHTML =
          '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-msg">Could not load data. <a href="" style="color:var(--accent)">Refresh</a></div></div>';
      }
    }
  }

  // ── GitHub API via XHR ──────────────────────────────
  // XHR does NOT enforce ISO-8859-1 on header values.
  // This permanently fixes the "non ISO-8859-1 code point" fetch error.

  function utf8ToBase64(str) {
    // Proper UTF-8 → base64 (supports all Korean, emoji, etc.)
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function ghXHR(method, path, bodyObj) {
    // Returns a Promise. Uses XMLHttpRequest instead of fetch to avoid
    // the browser's strict ISO-8859-1 header validation in fetch().
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = 'https://api.github.com/repos/' + S.owner + '/' + S.repo + path;
      xhr.open(method, url, true);
      xhr.setRequestHeader('Authorization', 'token ' + S.token);
      xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
      if (bodyObj !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = () => {
        try { resolve({ status: xhr.status, body: JSON.parse(xhr.responseText) }); }
        catch (_) { resolve({ status: xhr.status, body: {} }); }
      };
      xhr.onerror = () => reject(new Error('Network error — check your internet connection'));
      xhr.send(bodyObj !== undefined ? JSON.stringify(bodyObj) : null);
    });
  }

  async function saveData(msg) {
    if (!S.token || !S.owner || !S.repo) throw new Error('Not logged in as admin');
    const label = msg || 'Update';

    // Step 1: get current SHA (always fresh)
    const getRes = await ghXHR('GET', '/contents/data/posts.json');
    if (getRes.status !== 200) throw new Error('Could not read posts.json (HTTP ' + getRes.status + ')');
    const sha = getRes.body.sha;
    if (!sha) throw new Error('No SHA returned — check repo/file exists');

    // Step 2: write new content
    const content = utf8ToBase64(JSON.stringify(S.data, null, 2));
    const putRes = await ghXHR('PUT', '/contents/data/posts.json', { message: label, content, sha });
    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new Error((putRes.body && putRes.body.message) || 'Save failed (HTTP ' + putRes.status + ')');
    }
  }

  async function uploadImageXHR(file) {
    if (!S.token || !S.owner || !S.repo) throw new Error('Admin login required');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fname = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2,6) + '.' + ext;
    // Read file as base64
    const b64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const r = await ghXHR('PUT', '/contents/images/' + fname, { message: 'Upload image', content: b64 });
    if (r.status !== 200 && r.status !== 201) {
      throw new Error((r.body && r.body.message) || 'Image upload failed (HTTP ' + r.status + ')');
    }
    return 'https://raw.githubusercontent.com/' + S.owner + '/' + S.repo + '/main/images/' + fname;
  }

  // ─── Render All ─────────────────────────────────
  function renderAll() {
    renderProfile();
    renderSidebarCounts();
    renderSection(S.section);
  }

  function renderProfile() {
    const c = S.data.config || {};
    document.getElementById('profile-name').textContent = c.author || 'Author';
    document.getElementById('profile-bio').textContent  = c.bio || '';
    const topPosts   = S.data.posts.filter(p => !p.parentId).length;
    const totalAll   = topPosts + S.data.reviews.length + S.data.writings.length;
    document.getElementById('stat-posts').textContent    = totalAll;
    document.getElementById('stat-reviews').textContent  = S.data.reviews.length;
    document.getElementById('stat-writings').textContent = S.data.writings.length;
  }

  function renderSidebarCounts() {
    const _topPosts = S.data.posts.filter(p=>!p.parentId).length;
    document.getElementById('badge-home').textContent     = _topPosts + S.data.reviews.length + S.data.writings.length;
    document.getElementById('badge-reviews').textContent  = S.data.reviews.length;
    document.getElementById('badge-writings').textContent = S.data.writings.length;

    // Review sub-nav counts
    const rv = S.data.reviews;
    Object.keys(CATS).forEach(cat => {
      const el = document.getElementById(`sub-count-${cat}`);
      if (el) el.textContent = rv.filter(r => r.category === cat).length;
    });
    const allEl = document.getElementById("sub-count-all");
    if (allEl) allEl.textContent = S.data.reviews.length;
  }

  // Feed category dropdown removed

  // ─── Section Navigation ─────────────────────────
  function renderSection(sec) {
    S.section = sec;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageMap = { home: 'page-home', reviews: 'page-reviews', writings: 'page-writings' };
    document.getElementById(pageMap[sec])?.classList.add('active');
    document.getElementById(`nav-${sec}`)?.classList.add('active');

    if (sec === 'home')     renderFeed();
    if (sec === 'reviews')  renderReviews();
    if (sec === 'writings') renderWritings();
  }

  // ═══════════════════════════════
  //  HOME FEED  (unified timeline)
  // ═══════════════════════════════
  function renderFeed() {
    const el = document.getElementById('posts-list');
    document.getElementById('compose-wrap').className = `compose ${S.isAdmin ? 'show' : ''}`;

    // Build unified item list from all content types
    const items = [];
    S.data.posts.filter(p => !p.parentId).forEach(p => {
      items.push({ type: 'post', ts: p.timestamp, data: p });
    });
    S.data.reviews.forEach(r => {
      items.push({ type: 'review', ts: r.timestamp, data: r });
    });
    S.data.writings.forEach(w => {
      items.push({ type: 'writing', ts: w.timestamp, data: w });
    });

    // Sort newest first, show only latest 3
    items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const shown = items.slice(0, 3);

    if (!shown.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">🌿</div><div class="empty-msg">No posts yet</div></div>';
      return;
    }

    el.innerHTML = shown.map(item => {
      if (item.type === 'post')    return postCardHTML(item.data);
      if (item.type === 'review')  return reviewCardHTML(item.data);
      if (item.type === 'writing') return writingCardHTML(item.data);
      return '';
    }).join('');
  }

  function reviewCardHTML(r) {
    const catColor = { movie:'var(--cat-movie)', game:'var(--cat-game)', drama:'var(--cat-drama)', book:'var(--cat-book)', travel:'var(--cat-travel)' };
    const col = catColor[r.category] || 'var(--text-dim)';
    const adminA = S.isAdmin ? `
      <button class="act-btn" onclick="event.stopPropagation();App.editReview('${r.id}')">✏️ Edit</button>
      <button class="act-btn del" onclick="event.stopPropagation();App.deleteReview('${r.id}')">🗑️ Delete</button>` : '';
    return `
      <div class="post-wrap">
        <div class="post-card feed-card-review" onclick="App.goToReview('${r.id}')">
          <div class="post-body">
            <div class="post-meta">
              <span class="feed-type-badge" style="background:${col}20;color:${col};border:1px solid ${col}40">${CATS[r.category]?.emoji||''} ${CATS[r.category]?.label||r.category}</span>
              <span class="post-time">${relTime(r.timestamp)}</span>
            </div>
            <div class="feed-card-title">${esc(r.title)}</div>
            <div class="feed-thread-preview">${(r.threads||[]).slice(0,1).map(t=>esc(t.content.substring(0,120))+'…').join('')}</div>
            <div class="post-actions">${adminA}</div>
          </div>
        </div>
      </div>`;
  }

  function writingCardHTML(w) {
    const adminA = S.isAdmin ? `
      <button class="act-btn" onclick="event.stopPropagation();App.editWriting('${w.id}')">✏️ Edit</button>
      <button class="act-btn del" onclick="event.stopPropagation();App.deleteWriting('${w.id}')">🗑️ Delete</button>` : '';
    return `
      <div class="post-wrap">
        <div class="post-card feed-card-writing" onclick="App.goToWriting('${w.id}')">
          <div class="post-body">
            <div class="post-meta">
              <span class="feed-type-badge" style="background:rgba(44,123,229,0.1);color:var(--accent);border:1px solid rgba(44,123,229,0.2)">✍️ Writing</span>
              <span class="post-time">${relTime(w.timestamp)}</span>
            </div>
            <div class="feed-card-title">${esc(w.title)}</div>
            <div class="feed-thread-preview">${esc((w.excerpt||w.content).substring(0,120))}…</div>
            ${(w.tags||[]).length ? `<div class="post-tags">${w.tags.map(t=>`<span class="p-tag">${esc(t)}</span>`).join('')}</div>` : ''}
            <div class="post-actions">${adminA}</div>
          </div>
        </div>
      </div>`;
  }

  function postCardHTML(p, showLine) {
    const adminA = S.isAdmin ? `
      <button class="act-btn" onclick="event.stopPropagation();App.editPost('${p.id}')">✏️ Edit</button>
      <button class="act-btn del" onclick="event.stopPropagation();App.deletePost('${p.id}')">🗑️ Delete</button>
      <button class="act-btn reply" onclick="event.stopPropagation();App.replyPost('${p.id}')">↩ Reply</button>` : '';
    const rc = S.data.posts.filter(x => x.parentId === p.id).length;
    const imgs = (p.images||[]).map(url =>
      `<img src="${url}" class="post-img" onclick="event.stopPropagation()" loading="lazy">`
    ).join('');
    return `
      <div class="post-wrap">
        <div class="post-card${showLine ? ' has-thread' : ''}" onclick="App.openFeedThread('${p.threadId}')">
          <div class="post-body">
            <div class="post-meta">
              <span class="post-author">${esc(S.data.config.author || 'Author')}</span>
              <span class="post-time">${relTime(p.timestamp)}</span>
              ${p.edited ? '<span class="post-edited">edited</span>' : ''}
            </div>
            <div class="post-text">${fmtContent(p.content)}</div>
            ${imgs ? `<div class="post-images">${imgs}</div>` : ''}
            ${(p.categories||[]).length ? `<div class="post-tags">${p.categories.map(t=>`<span class="p-tag" onclick="event.stopPropagation()">#${t}</span>`).join('')}</div>` : ''}
            <div class="post-actions">
              ${rc ? `<button class="act-btn" onclick="event.stopPropagation();App.openFeedThread('${p.threadId}')">💬 ${rc}</button>` : ''}
              ${adminA}
            </div>
          </div>
        </div>
      </div>`;
  }

  // Feed Thread Detail
  function openFeedThread(threadId) {
    S.feedView = 'thread'; S.feedThreadId = threadId;
    const tposts = S.data.posts.filter(p => p.threadId === threadId)
      .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (!tposts.length) return;

    document.getElementById('feed-list-view').style.display = 'none';
    const dv = document.getElementById('feed-thread-view');
    dv.classList.add('show');

    const root = tposts[0];
    const rest = tposts.slice(1);

    const adminRootA = S.isAdmin ? `
      <div class="td-actions">
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.editPost('${root.id}')">✏️ Edit</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)" onclick="App.deletePost('${root.id}')">🗑️ Delete</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.replyPost('${root.id}')">↩ 답글</button>
      </div>` : '';

    document.getElementById('feed-thread-posts').innerHTML = `
      <div class="td-body">
        <div class="td-root">
          <div style="margin-bottom:14px">
              <div style="font-weight:700;font-size:14px;font-family:var(--font-ko-title)">${esc(S.data.config.author||'Author')}</div>
              <div style="font-size:11px;color:var(--text-sub);font-family:var(--font-mono)">${relTime(root.timestamp)}</div>
          </div>
          <div class="td-content">${fmtContent(root.content)}</div>
          ${(root.images||[]).length ? `<div class="post-images">${root.images.map(u=>`<img src="${u}" class="post-img" loading="lazy">`).join('')}</div>` : ''}
          ${(root.categories||[]).length ? `<div class="post-tags">${root.categories.map(t=>`<span class="p-tag">#${t}</span>`).join('')}</div>` : ''}
          <div class="td-meta">${fmtDate(root.timestamp)}${root.edited?' · <em>edited</em>':''}</div>
          ${adminRootA}
        </div>
        ${rest.map(p => `
          <div class="td-reply" style="padding:14px 0;border-bottom:1px solid var(--border)">
            <div class="post-body">
              <div class="post-meta">
                <span class="post-author">${esc(S.data.config.author||'Author')}</span>
                <span class="post-time">${relTime(p.timestamp)}</span>
                ${p.edited?'<span class="post-edited">edited</span>':''}
              </div>
              <div class="post-text">${fmtContent(p.content)}</div>
              ${(p.categories||[]).length ? `<div class="post-tags">${p.categories.map(t=>`<span class="p-tag">#${t}</span>`).join('')}</div>` : ''}
              ${S.isAdmin ? `<div class="post-actions" style="opacity:1">
                <button class="act-btn" onclick="App.editPost('${p.id}')">✏️</button>
                <button class="act-btn del" onclick="App.deletePost('${p.id}')">🗑️</button>
                <button class="act-btn reply" onclick="App.replyPost('${p.id}')">↩</button>
              </div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;

    // Giscus
    const gc = window.GISCUS_CONFIG || {};
    document.getElementById('feed-comments').innerHTML = gc.repo
      ? `<script src="https://giscus.app/client.js" data-repo="${gc.repo}" data-repo-id="${gc.repoId||''}" data-category="${gc.category||'General'}" data-category-id="${gc.categoryId||''}" data-mapping="specific" data-term="${threadId}" data-reactions-enabled="1" data-theme="light" data-lang="ko" crossorigin="anonymous" async></scr` + `ipt>`
      : `<div style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);text-align:center;font-size:13px;color:var(--text-sub)">댓글 활성화: <a href="https://giscus.app/ko" target="_blank" style="color:var(--accent)">Giscus 설정하기 →</a></div>`;

    window.scrollTo(0, 0);
    window.location.hash = `feed-${threadId}`;
  }

  function closeFeedThread() {
    S.feedView = 'list'; S.feedThreadId = null;
    document.getElementById('feed-list-view').style.display = '';
    document.getElementById('feed-thread-view').classList.remove('show');
    cancelCompose();
    window.location.hash = '';
  }

  // Feed compose
  function openCompose() {
    if (!S.isAdmin) return;
    S.editPost = null; S.replyTo = null;
    document.getElementById('edit-banner').className = 'edit-banner';
    document.getElementById('reply-banner').style.display = 'none';
    document.getElementById('compose-wrap').classList.add('show');
    document.getElementById('compose-ta').value = '';
    document.getElementById('compose-ta').focus();
    updateCC();
  }

  function cancelCompose() {
    S.replyTo = null; S.editPost = null;
    S._pendingImages = [];
    clearImagePreviews();
    document.getElementById('compose-wrap').classList.remove('show');
    if (S.section === 'home' && S.isAdmin)
      document.getElementById('compose-wrap').classList.add('show');
    document.getElementById('compose-ta').value = '';
    document.getElementById('reply-banner').style.display = 'none';
    document.getElementById('edit-banner').className = 'edit-banner';
    updateCC();
  }

  function replyPost(id) {
    const p = S.data.posts.find(x => x.id === id); if (!p) return;
    S.replyTo = p; S.editPost = null;
    document.getElementById('reply-banner').style.display = 'flex';
    document.getElementById('reply-banner-text').textContent = `답글: "${p.content.substring(0,40)}..."`;
    document.getElementById('compose-wrap').classList.add('show');
    document.getElementById('compose-ta').value = '';
    document.getElementById('compose-ta').focus();
    updateCC();
  }

  function editPost(id) {
    const p = S.data.posts.find(x => x.id === id); if (!p) return;
    S.editPost = p; S.replyTo = null;
    document.getElementById('edit-banner').className = 'edit-banner show';
    document.getElementById('reply-banner').style.display = 'none';
    document.getElementById('compose-wrap').classList.add('show');
    document.getElementById('compose-ta').value = p.content;
    // category select removed
    document.getElementById('compose-ta').focus();
    updateCC();
  }

  async function sendPost() {
    const text = document.getElementById('compose-ta').value.trim();
    if (!text && S._pendingImages.length === 0) return;
    const cat = '';  // feed categories removed
    const btn = document.getElementById('send-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      // Upload any pending images first
      const imageUrls = [];
      for (const file of S._pendingImages) {
        btn.textContent = `Uploading image…`;
        const url = await uploadImageXHR(file);
        imageUrls.push(url);
      }

      if (S.editPost) {
        S.editPost.content = text;
        if (cat) S.editPost.categories = [cat];
        if (imageUrls.length) S.editPost.images = [...(S.editPost.images||[]), ...imageUrls];
        S.editPost.edited = true; S.editPost.editedAt = new Date().toISOString();
      } else {
        const id = `post-${Date.now()}`;
        S.data.posts.unshift({
          id, content: text, timestamp: new Date().toISOString(),
          categories: cat ? [cat] : [],
          parentId: S.replyTo ? S.replyTo.id : null,
          threadId: S.replyTo ? S.replyTo.threadId : `thread-${id}`,
          images: imageUrls,
          edited: false, editedAt: null
        });
      }

      btn.textContent = 'Saving...';
      await saveData(S.editPost ? 'Edit post' : 'New post');
      S._pendingImages = [];
      clearImagePreviews();
      cancelCompose();
      renderProfile(); renderSidebarCounts(); renderFeed();
      if (S.feedView === 'thread') openFeedThread(S.feedThreadId);
      toast('Saved ✓', 'ok');
    } catch(e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = 'Post';
  }


  function clearImagePreviews() {
    const wrap = document.getElementById('image-preview-wrap');
    if (wrap) wrap.innerHTML = '';
    const inp = document.getElementById('image-input');
    if (inp) inp.value = '';
  }

  async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    const p = S.data.posts.find(x => x.id === id);
    const tid = p?.threadId;
    S.data.posts = S.data.posts.filter(x => x.id !== id);
    try {
      await saveData('Delete post');
      renderProfile(); renderSidebarCounts(); renderFeed();
      if (S.feedView === 'thread') {
        const still = S.data.posts.filter(x => x.threadId === tid);
        still.length ? openFeedThread(tid) : closeFeedThread();
      }
      toast('Deleted', 'ok');
    } catch(e) { toast(e.message, 'err'); loadData(); }
  }



  function updateCC() {
    const len = document.getElementById('compose-ta').value.length;
    const max = 5000;
    const el = document.getElementById('char-count');
    el.textContent = `${len.toLocaleString()} chars`;
    el.className = `cc${len>max*.9?' over':len>max*.75?' warn':''}`;
    document.getElementById('send-btn').disabled = !len || len > max;
  }

  // ═══════════════════════════════
  //  REVIEWS
  // ═══════════════════════════════
  function renderReviews() {
    S.reviewView = 'list';
    document.getElementById('review-list-view').style.display = '';
    document.getElementById('review-detail-view').classList.remove('show');

    const all = S.data.reviews.slice().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const filtered = S.reviewCat === 'all' ? all : all.filter(r => r.category === S.reviewCat);

    // Update cat bar
    document.querySelectorAll('.cat-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.cat === S.reviewCat);
    });

    const list = document.getElementById('review-list');
    if (!filtered.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-msg">No reviews yet</div></div>';
      return;
    }

    const catColor = { movie:'var(--cat-movie)', game:'var(--cat-game)', drama:'var(--cat-drama)', book:'var(--cat-book)', travel:'var(--cat-travel)' };

    list.innerHTML = filtered.map(r => {
      const col = catColor[r.category] || 'var(--text-dim)';
      const adminA = S.isAdmin ? `
        <div class="review-row-actions">
          <button class="act-btn" onclick="event.stopPropagation();App.editReview('${r.id}')">✏️ Edit</button>
          <button class="act-btn del" onclick="event.stopPropagation();App.deleteReview('${r.id}')">🗑️ Delete</button>
        </div>` : '';
      return `
        <div class="review-row" onclick="App.openReview('${r.id}')">
          <div class="review-cat-dot" style="background:${col}"></div>
          <div class="review-info">
            <div class="review-title">${esc(r.title)}</div>
            <div class="review-meta">
              <span class="review-cat-label" style="color:${col}">${CATS[r.category]?.emoji||''} ${CATS[r.category]?.label||r.category}</span>
              <span class="review-date">${fmtDate(r.timestamp)}</span>
              <span class="review-count">${r.threads?.length || 0} threads</span>
              ${r.edited ? '<span style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">edited</span>' : ''}
            </div>
            ${adminA}
          </div>
          <div class="review-arrow">→</div>
        </div>`;
    }).join('');
  }

  function openReview(id) {
    const r = S.data.reviews.find(x => x.id === id); if (!r) return;
    S.reviewView = 'detail'; S.reviewId = id;
    document.getElementById('review-list-view').style.display = 'none';
    const dv = document.getElementById('review-detail-view');
    dv.classList.add('show');

    const catColor = { movie:'var(--cat-movie)', game:'var(--cat-game)', drama:'var(--cat-drama)', book:'var(--cat-book)', travel:'var(--cat-travel)' };
    const col = catColor[r.category] || 'var(--text-dim)';

    const adminA = S.isAdmin ? `
      <div class="wd-actions">
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.editReview('${r.id}')">✏️ Edit</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)" onclick="App.deleteReview('${r.id}')">🗑️ Delete</button>
      </div>` : '';

    dv.innerHTML = `
      <button class="td-back" onclick="App.closeReview()">← Back to reviews</button>
      <div class="rd-header">
        <div class="rd-cat-badge"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block"></span> ${CATS[r.category]?.emoji||''} ${CATS[r.category]?.label||r.category}</div>
        <div class="rd-title">${esc(r.title)}</div>
        <div class="rd-meta">${fmtDate(r.timestamp)}${r.edited?' · edited':''}</div>
        ${adminA}
      </div>
      <div class="rd-threads">
        ${(r.threads||[]).map((t, i, arr) => `
          <div class="rd-thread-item">
            <div class="rd-thread-connector">
              <div class="rd-thread-dot"></div>
              ${i < arr.length-1 ? '<div class="rd-tline"></div>' : ''}
            </div>
            <div>
              <div class="rd-content">${fmtContent(t.content)}</div>
              ${(t.images||[]).length ? `<div class="post-images">${t.images.map(u=>'<img src="'+u+'" class="post-img" loading="lazy">').join('')}</div>` : ''}
              <div class="rd-time">${relTime(t.timestamp)}</div>
            </div>
          </div>`).join('')}
      </div>
      <div class="comments-wrap" style="padding:0 24px 32px">
        <div class="comments-title">Comments</div>
        <div id="review-comments"></div>
      </div>`;

    const gc = window.GISCUS_CONFIG || {};
    document.getElementById('review-comments').innerHTML = gc.repo
      ? `<script src="https://giscus.app/client.js" data-repo="${gc.repo}" data-repo-id="${gc.repoId||''}" data-category="${gc.category||'General'}" data-category-id="${gc.categoryId||''}" data-mapping="specific" data-term="${id}" data-reactions-enabled="1" data-theme="light" data-lang="ko" crossorigin="anonymous" async></scr` + `ipt>`
      : `<div style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);text-align:center;font-size:13px;color:var(--text-sub)"><a href="https://giscus.app/ko" target="_blank" style="color:var(--accent)">Giscus 설정하기 →</a></div>`;

    window.scrollTo(0,0);
    window.location.hash = `review-${id}`;
  }

  function closeReview() {
    S.reviewView = 'list'; S.reviewId = null;
    document.getElementById('review-detail-view').classList.remove('show');
    document.getElementById('review-list-view').style.display = '';
    window.location.hash = '';
  }

  // Review Compose (admin)
  function openReviewCompose(isEdit = false) {
    const rc = document.getElementById('review-compose');
    rc.classList.add('show');
    if (!isEdit) {
      document.getElementById('rc-title').value = '';
      document.getElementById('rc-cat').value = 'movie';
      document.getElementById('rc-threads-wrap').innerHTML = buildThreadEntry();
    }
    rc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeReviewCompose() {
    document.getElementById('review-compose').classList.remove('show');
    S.editReview = null;
  }

  function buildThreadEntry(content = '', imgs = []) {
    const imgPreviews = imgs.map((u,i) =>
      `<div class="img-preview-item" data-url="${u}"><img src="${u}"><button onclick="this.closest('.img-preview-item').remove()" type="button">✕</button></div>`
    ).join('');
    return `<div class="rc-thread-entry">
      <textarea class="rc-thread-ta" placeholder="Content...">${esc(content)}</textarea>
      <div class="rc-thread-imgs">
        <div class="image-preview-wrap rc-img-wrap">${imgPreviews}</div>
        <label class="img-upload-btn" title="Attach image" style="margin-top:4px">
          📎 <input type="file" class="rc-img-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display:none">
        </label>
      </div>
      <button class="rc-del-thread" onclick="this.closest('.rc-thread-entry').remove()" type="button">✕</button>
    </div>`;
  }

  function addThreadEntry() {
    document.getElementById('rc-threads-wrap').insertAdjacentHTML('beforeend', buildThreadEntry());
  }

  async function sendReview() {
    const title = document.getElementById('rc-title').value.trim();
    const cat   = document.getElementById('rc-cat').value;
    const entries = [...document.querySelectorAll('#rc-threads-wrap .rc-thread-entry')];
    if (!title || !entries.length) { toast('Title and content required', 'err'); return; }

    const btn = document.getElementById('rc-send');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const now = new Date().toISOString();
      const threadData = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const text = entry.querySelector('.rc-thread-ta').value.trim();
        if (!text) continue;
        // Upload any new image files for this thread
        const imgs = [];
        // Existing images (from data-url)
        entry.querySelectorAll('.img-preview-item[data-url]').forEach(el => imgs.push(el.dataset.url));
        // New files (attached as ._file on preview divs)
        const newImgDivs = entry.querySelectorAll('.img-preview-item:not([data-url])');
        for (const div of newImgDivs) {
          if (div._file) {
            btn.textContent = 'Uploading image…';
            imgs.push(await uploadImageXHR(div._file));
          }
        }
        const prev = S.editReview && S.editReview.threads && S.editReview.threads[i];
        threadData.push({
          id: prev ? prev.id : `rv${Date.now()}-t${i}`,
          content: text,
          images: imgs,
          timestamp: prev ? prev.timestamp : now
        });
      }
      if (!threadData.length) { toast('Please add content', 'err'); btn.disabled = false; btn.textContent = 'Save'; return; }

      btn.textContent = 'Saving...';
      if (S.editReview) {
        S.editReview.title = title;
        S.editReview.category = cat;
        S.editReview.threads = threadData;
        S.editReview.edited = true; S.editReview.editedAt = now;
        S.editReview = null;
      } else {
        const id = 'review-' + Date.now();
        S.data.reviews.unshift({ id, title, category: cat, timestamp: now, edited: false, editedAt: null, threads: threadData });
      }
      await saveData('Save review');
      closeReviewCompose();
      renderProfile(); renderSidebarCounts(); renderReviews();
      toast('Review saved ✓', 'ok');
    } catch(e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = 'Save';
  }

  function editReview(id) {
    const r = S.data.reviews.find(x => x.id === id); if (!r) return;
    S.editReview = r;
    if (S.reviewView === 'detail') closeReview();
    openReviewCompose(true);
    document.getElementById('rc-title').value = r.title;
    document.getElementById('rc-cat').value = r.category;
    document.getElementById('rc-threads-wrap').innerHTML =
      (r.threads||[]).map(t => buildThreadEntry(t.content)).join('');
  }

  async function deleteReview(id) {
    if (!confirm('Delete this review?')) return;
    S.data.reviews = S.data.reviews.filter(x => x.id !== id);
    try {
      await saveData('Delete review');
      if (S.reviewView === 'detail') closeReview();
      renderProfile(); renderSidebarCounts(); renderReviews();
      toast('Deleted', 'ok');
    } catch(e) { toast(e.message, 'err'); loadData(); }
  }

  // ═══════════════════════════════
  //  WRITINGS
  // ═══════════════════════════════
  function renderWritings() {
    S.writingView = 'list';
    document.getElementById('writing-list-view').style.display = '';
    document.getElementById('writing-detail-view').classList.remove('show');

    const all = S.data.writings.slice().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const list = document.getElementById('writing-list');
    if (!all.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">🖊️</div><div class="empty-msg">No writings yet</div></div>';
      return;
    }
    list.innerHTML = all.map(w => {
      const adminA = S.isAdmin ? `
        <div class="writing-row-actions">
          <button class="act-btn" onclick="event.stopPropagation();App.editWriting('${w.id}')">✏️ Edit</button>
          <button class="act-btn del" onclick="event.stopPropagation();App.deleteWriting('${w.id}')">🗑️ Delete</button>
        </div>` : '';
      return `
        <div class="writing-row" onclick="App.openWriting('${w.id}')">
          <div class="writing-title">${esc(w.title)}</div>
          <div class="writing-excerpt">${esc(w.excerpt||w.content.substring(0,100)+'...')}</div>
          <div class="writing-footer">
            ${(w.tags||[]).map(t=>`<span class="w-tag">${esc(t)}</span>`).join('')}
            <span class="w-date">${fmtDate(w.timestamp)}</span>
          </div>
          ${adminA}
        </div>`;
    }).join('');
  }

  function openWriting(id) {
    const w = S.data.writings.find(x => x.id === id); if (!w) return;
    S.writingView = 'detail'; S.writingId = id;
    document.getElementById('writing-list-view').style.display = 'none';
    const dv = document.getElementById('writing-detail-view');
    dv.classList.add('show');

    const adminA = S.isAdmin ? `
      <div class="wd-actions">
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.editWriting('${w.id}')">✏️ Edit</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)" onclick="App.deleteWriting('${w.id}')">🗑️ Delete</button>
      </div>` : '';

    dv.innerHTML = `
      <button class="td-back" onclick="App.closeWriting()">← Back to writings</button>
      <div class="wd-header">
        <div class="wd-tags">${(w.tags||[]).map(t=>`<span class="w-tag">${esc(t)}</span>`).join('')}</div>
        <div class="wd-title">${esc(w.title)}</div>
        <div class="wd-meta">${fmtDate(w.timestamp)}${w.edited?' · edited':''}</div>
        ${adminA}
      </div>
      <div class="wd-body">${fmtWriting(w.content)}</div>
      ${(w.images||[]).length ? `<div class="post-images" style="padding:0 28px 20px">${w.images.map(u=>'<img src="'+u+'" class="post-img" loading="lazy">').join('')}</div>` : ''}
      <div class="comments-wrap" style="padding:0 24px 32px">
        <div class="comments-title">Comments</div>
        <div id="writing-comments"></div>
      </div>`;

    const gc = window.GISCUS_CONFIG || {};
    document.getElementById('writing-comments').innerHTML = gc.repo
      ? `<script src="https://giscus.app/client.js" data-repo="${gc.repo}" data-repo-id="${gc.repoId||''}" data-category="${gc.category||'General'}" data-category-id="${gc.categoryId||''}" data-mapping="specific" data-term="${id}" data-reactions-enabled="1" data-theme="light" data-lang="ko" crossorigin="anonymous" async></scr` + `ipt>`
      : `<div style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);text-align:center;font-size:13px;color:var(--text-sub)"><a href="https://giscus.app/ko" target="_blank" style="color:var(--accent)">Giscus 설정하기 →</a></div>`;

    window.scrollTo(0,0);
    window.location.hash = `writing-${id}`;
  }

  function closeWriting() {
    S.writingView = 'list'; S.writingId = null;
    document.getElementById('writing-detail-view').classList.remove('show');
    document.getElementById('writing-list-view').style.display = '';
    window.location.hash = '';
  }

  // Writing compose
  function openWritingCompose(isEdit = false) {
    const wc = document.getElementById('writing-compose');
    wc.classList.add('show');
    if (!isEdit) {
      document.getElementById('wc-title').value = '';
      document.getElementById('wc-tags').value = '';
      document.getElementById('wc-content').value = '';
      document.getElementById('wc-img-wrap').innerHTML = '';
      S._pendingWritingImages = [];
    }
    wc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeWritingCompose() {
    document.getElementById('writing-compose').classList.remove('show');
    S.editWriting = null;
    S._pendingWritingImages = [];
    const wrap = document.getElementById('wc-img-wrap');
    if (wrap) wrap.innerHTML = '';
  }

  async function sendWriting() {
    const title    = document.getElementById('wc-title').value.trim();
    const tagsRaw  = document.getElementById('wc-tags').value.trim();
    const wContent = document.getElementById('wc-content').value.trim();
    if (!title || !wContent) { toast('Title and content required', 'err'); return; }
    const tags    = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
    const excerpt = wContent.substring(0, 80) + (wContent.length > 80 ? '...' : '');

    const btn = document.getElementById('wc-send');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      // Upload images
      const imageUrls = [];
      if (S.editWriting) {
        // Keep existing images
        (S.editWriting.images || []).forEach(u => {
          const keep = document.querySelector(`#wc-img-wrap [data-url="${u}"]`);
          if (keep) imageUrls.push(u);
        });
      }
      for (const f of S._pendingWritingImages) {
        btn.textContent = 'Uploading image…';
        imageUrls.push(await uploadImageXHR(f));
      }
      btn.textContent = 'Saving...';

      if (S.editWriting) {
        Object.assign(S.editWriting, { title, content: wContent, tags, excerpt, images: imageUrls, edited: true, editedAt: new Date().toISOString() });
        S.editWriting = null;
      } else {
        S.data.writings.unshift({ id: 'writing-' + Date.now(), title, excerpt, content: wContent, tags, images: imageUrls, timestamp: new Date().toISOString(), edited: false, editedAt: null });
      }
      S._pendingWritingImages = [];
      await saveData('Save writing');
      closeWritingCompose();
      renderProfile(); renderSidebarCounts(); renderWritings();
      toast('Writing saved ✓', 'ok');
    } catch(e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = 'Save';
  }

  function editWriting(id) {
    const w = S.data.writings.find(x => x.id === id); if (!w) return;
    S.editWriting = w;
    if (S.writingView === 'detail') closeWriting();
    openWritingCompose(true);
    document.getElementById('wc-title').value = w.title;
    document.getElementById('wc-tags').value = (w.tags||[]).join(', ');
    document.getElementById('wc-content').value = w.content;
    S._pendingWritingImages = [];
    const wcWrap = document.getElementById('wc-img-wrap');
    if (wcWrap) wcWrap.innerHTML = (w.images||[]).map(u =>
      `<div class="img-preview-item" data-url="${u}"><img src="${u}"><button onclick="this.closest('.img-preview-item').remove()" type="button">✕</button></div>`
    ).join('');
  }

  async function deleteWriting(id) {
    if (!confirm('Delete this writing?')) return;
    S.data.writings = S.data.writings.filter(x => x.id !== id);
    try {
      await saveData('Delete writing');
      if (S.writingView === 'detail') closeWriting();
      renderProfile(); renderSidebarCounts(); renderWritings();
      toast('Deleted', 'ok');
    } catch(e) { toast(e.message, 'err'); loadData(); }
  }

  // ─── Admin ──────────────────────────────────────
  // Strip anything non-ASCII — prevents "non ISO-8859-1 code point" fetch error
  function sanitizeASCII(s) {
    return (s || '').replace(/[^\x20-\x7E]/g, '').trim();
  }

  function loadCreds() {
    const t = sanitizeASCII(localStorage.getItem('gh_token'));
    const o = sanitizeASCII(localStorage.getItem('gh_owner'));
    const r = sanitizeASCII(localStorage.getItem('gh_repo'));
    if (t && o && r) { S.isAdmin = true; S.token = t; S.owner = o; S.repo = r; updateAdminUI(); }
  }

  function openAdminModal() {
    if (S.isAdmin) { logoutAdmin(); return; }
    document.getElementById('m-owner').value = localStorage.getItem('gh_owner') || '';
    document.getElementById('m-repo').value  = localStorage.getItem('gh_repo') || '';
    document.getElementById('m-token').value = '';
    document.getElementById('admin-modal').classList.add('show');
  }

  function closeAdminModal() {
    document.getElementById('admin-modal').classList.remove('show');
  }

  function saveAdmin() {
    const t = sanitizeASCII(document.getElementById('m-token').value);
    const o = sanitizeASCII(document.getElementById('m-owner').value);
    const r = sanitizeASCII(document.getElementById('m-repo').value);
    if (!t || !o || !r) { toast('All fields required', 'err'); return; }
    localStorage.setItem('gh_token', t);
    localStorage.setItem('gh_owner', o);
    localStorage.setItem('gh_repo', r);
    S.isAdmin = true; S.token = t; S.owner = o; S.repo = r;
    closeAdminModal(); updateAdminUI(); renderSection(S.section);
    toast('Admin mode enabled ✓', 'ok');
  }

  function logoutAdmin() {
    ['gh_token','gh_owner','gh_repo'].forEach(k => localStorage.removeItem(k));
    S.isAdmin = false; S.token = S.owner = S.repo = null;
    updateAdminUI(); renderSection(S.section);
    toast('Logged out');
  }

  function updateAdminUI() {
    const btn = document.getElementById('admin-btn');
    const fab = document.getElementById('fab');
    if (S.isAdmin) {
      btn.classList.add('on');
      btn.querySelector('.al').textContent = 'Logout';
      fab.classList.add('show');
    } else {
      btn.classList.remove('on');
      btn.querySelector('.al').textContent = 'Admin Login';
      fab.classList.remove('show');
    }
  }

  // ─── FAB ────────────────────────────────────────
  function fabAction() {
    if (!S.isAdmin) return;
    if (S.section === 'home')     openCompose();
    if (S.section === 'reviews')  openReviewCompose();
    if (S.section === 'writings') openWritingCompose();
  }

  // ─── Util ───────────────────────────────────────
  function relTime(iso) {
    const d = (Date.now() - new Date(iso)) / 1000;
    if (d < 60)     return 'just now';
    if (d < 3600)   return Math.floor(d/60) + 'm ago';
    if (d < 86400)  return Math.floor(d/3600) + 'h ago';
    if (d < 604800) return Math.floor(d/86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtContent(t) {
    return esc(t).replace(/\n/g,'<br>').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" onclick="event.stopPropagation()">$1</a>');
  }
  function fmtWriting(t) {
    return esc(t).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
  }

  let _tt;
  function toast(msg, type='') {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = `toast ${type} show`;
    clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ─── Global Events ──────────────────────────────
  function bindGlobal() {
    // Nav
    document.getElementById('nav-home').onclick = () => renderSection('home');
    document.getElementById('nav-reviews').onclick = () => renderSection('reviews');
    document.getElementById('nav-writings').onclick = () => renderSection('writings');

    // Review sub-nav
    document.querySelectorAll('.sub-item').forEach(el => {
      el.onclick = () => {
        S.reviewCat = el.dataset.cat;
        document.querySelectorAll('.sub-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        renderSection('reviews');
      };
    });

    // Review sub-nav toggle
    document.getElementById('nav-reviews').addEventListener('click', () => {
      document.getElementById('review-subnav').classList.toggle('open');
    });

    // Cat bar (reviews page)
    document.querySelectorAll('.cat-pill').forEach(p => {
      p.onclick = () => { S.reviewCat = p.dataset.cat; renderReviews(); };
    });

    // Admin
    document.getElementById('admin-btn').onclick = openAdminModal;
    document.getElementById('m-save').onclick = saveAdmin;
    document.getElementById('m-cancel').onclick = closeAdminModal;
    document.getElementById('admin-modal').onclick = e => { if (e.target.id === 'admin-modal') closeAdminModal(); };

    // FAB
    document.getElementById('fab').onclick = fabAction;

    // Image file input
    const imgInput = document.getElementById('image-input');
    if (imgInput) {
      imgInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
        files.forEach(f => {
          if (!allowed.includes(f.type)) { toast('Only JPG/PNG/GIF/WEBP allowed', 'err'); return; }
          if (f.size > 10 * 1024 * 1024) { toast('Max image size: 10MB', 'err'); return; }
          S._pendingImages.push(f);
          // Show preview
          const reader = new FileReader();
          reader.onload = ev => {
            const wrap = document.getElementById('image-preview-wrap');
            const div = document.createElement('div');
            div.className = 'img-preview-item';
            div.innerHTML = `<img src="${ev.target.result}"><button onclick="App._removeImg(${S._pendingImages.length-1}, this)">✕</button>`;
            wrap.appendChild(div);
          };
          reader.readAsDataURL(f);
        });
        imgInput.value = '';
      });
    }

    // Feed compose
    document.getElementById('compose-ta').addEventListener('input', updateCC);
    document.getElementById('compose-ta').addEventListener('keydown', e => {
      if ((e.ctrlKey||e.metaKey) && e.key === 'Enter') sendPost();
      if (e.key === 'Escape') cancelCompose();
    });
    document.getElementById('send-btn').onclick = sendPost;
    document.getElementById('cancel-btn').onclick = cancelCompose;
    document.getElementById('cancel-reply').onclick = () => {
      S.replyTo = null;
      document.getElementById('reply-banner').style.display = 'none';
    };

    // Thread back
    document.getElementById('feed-thread-back').onclick = closeFeedThread;

    // Review compose
    document.getElementById('rc-send').onclick = sendReview;
    document.getElementById('rc-cancel').onclick = closeReviewCompose;
    document.getElementById('rc-add-thread').onclick = addThreadEntry;

    // Writing compose
    document.getElementById('wc-send').onclick = sendWriting;
    document.getElementById('wc-cancel').onclick = closeWritingCompose;

    const wcImgInput = document.getElementById('wc-img-input');
    if (wcImgInput) {
      wcImgInput.addEventListener('change', e => {
        const files = Array.from(e.target.files || []);
        const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
        const wrap = document.getElementById('wc-img-wrap');
        files.forEach(f => {
          if (!allowed.includes(f.type)) { toast('JPG/PNG/GIF/WEBP only', 'err'); return; }
          if (f.size > 10*1024*1024) { toast('Max 10MB per image', 'err'); return; }
          S._pendingWritingImages.push(f);
          const reader = new FileReader();
          reader.onload = ev => {
            const div = document.createElement('div');
            div.className = 'img-preview-item';
            const idx = S._pendingWritingImages.length - 1;
            div.innerHTML = `<img src="${ev.target.result}"><button type="button" onclick="S._pendingWritingImages.splice(${idx},1);this.closest('.img-preview-item').remove()">✕</button>`;
            wrap.appendChild(div);
          };
          reader.readAsDataURL(f);
        });
        wcImgInput.value = '';
      });
    }

    // rc-img inputs (review thread images) — delegated
    document.getElementById('rc-threads-wrap').addEventListener('change', e => {
      const input = e.target.closest('.rc-img-input');
      if (!input) return;
      const entry = input.closest('.rc-thread-entry');
      const wrap  = entry.querySelector('.rc-img-wrap');
      Array.from(input.files || []).forEach(f => {
        if (f.size > 10*1024*1024) { toast('Max 10MB per image', 'err'); return; }
        const reader = new FileReader();
        reader.onload = ev => {
          const div = document.createElement('div');
          div.className = 'img-preview-item';
          div.innerHTML = `<img src="${ev.target.result}"><button type="button" onclick="this.closest('.img-preview-item').remove()">✕</button>`;
          div.querySelector('img').dataset.file = 'new';
          div._file = f;
          wrap.appendChild(div);
        };
        reader.readAsDataURL(f);
      });
      input.value = '';
    });
  }

  // Navigate from Main feed card → correct section + detail
  function _removeImg(idx, btn) {
    S._pendingImages.splice(idx, 1);
    btn.closest('.img-preview-item').remove();
    // Re-index remaining items
    document.querySelectorAll('#image-preview-wrap .img-preview-item button').forEach((b, i) => {
      b.setAttribute('onclick', `App._removeImg(${i}, this)`);
    });
  }

  function goToReview(id) {
    renderSection('reviews');
    setTimeout(() => openReview(id), 50);
  }

  function goToWriting(id) {
    renderSection('writings');
    setTimeout(() => openWriting(id), 50);
  }

  return {
    init,
    // Feed
    openFeedThread, closeFeedThread, replyPost, editPost, deletePost,
    goToReview, goToWriting, _removeImg,
    // Reviews
    openReview, closeReview, editReview, deleteReview,
    // Writings
    openWriting, closeWriting, editWriting, deleteWriting,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
