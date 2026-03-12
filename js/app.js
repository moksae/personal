// ═══════════════════════════════════════════════════
//  Personal Homepage — app.js  (clean rewrite v8)
// ═══════════════════════════════════════════════════

const App = (() => {

  const S = {
    data: { config:{}, posts:[], reviews:[], writings:[], pics:[] },
    isAdmin: false, token: null, owner: null, repo: null,
    section: 'home',
    feedView: 'list', feedThreadId: null,
    feedPage: 0, FEED_PER_PAGE: 10, pendingPicsImgs: [],
    replyTo: null, editPost: null,
    reviewCat: 'all', reviewView: 'list', reviewId: null, editReview: null,
    writingView: 'list', writingId: null, editWriting: null,
    picsView: 'grid', lbPicId: null, lbImgIdx: 0,
    pendingFeedImgs: [], pendingWritingImgs: [], pendingPicsImgs: [],
  };

  const CATS = {
    movie:  { label:'Movie',  emoji:'🎬', color:'var(--cat-movie)',  textColor:'var(--text-sub)' },
    game:   { label:'Game',   emoji:'🎮', color:'var(--cat-game)',   textColor:'var(--text-sub)' },
    drama:  { label:'Drama',  emoji:'📺', color:'var(--cat-drama)',  textColor:'var(--text-sub)' },
    book:   { label:'Book',   emoji:'📚', color:'var(--cat-book)',   textColor:'#ffffff' },
    travel: { label:'Travel', emoji:'✈️', color:'var(--cat-travel)', textColor:'var(--cat-travel-text)' },
  };

  // ── Utilities ──────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function relTime(iso) {
    const d = (Date.now() - new Date(iso)) / 1000;
    if (d < 60)     return 'just now';
    if (d < 3600)   return Math.floor(d/60)   + 'm ago';
    if (d < 86400)  return Math.floor(d/3600)  + 'h ago';
    if (d < 604800) return Math.floor(d/86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    const yy  = String(d.getFullYear()).slice(2);
    const mon = d.toLocaleDateString('en-US', { month: 'short' });
    const day = String(d.getDate()).padStart(2, '0');
    return yy + '. ' + mon + '. ' + day;
  }
  function fmtContent(t) {
    return esc(t).replace(/\n/g,'<br>').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" onclick="event.stopPropagation()">$1</a>');
  }
  function fmtWriting(t) {
    return esc(t).split(/\n\n+/).map(p => '<p>' + p.replace(/\n/g,'<br>') + '</p>').join('');
  }
  let _tt;
  function toast(msg, type) {
    const e = ge('toast'); if (!e) return;
    e.textContent = msg; e.className = 'toast ' + (type||'') + ' show';
    clearTimeout(_tt); _tt = setTimeout(() => e.classList.remove('show'), 2800);
  }
  function ge(id) { return document.getElementById(id); }
  function bindClick(id, fn) { const e = ge(id); if (e) e.onclick = fn; }

  // ── Giscus Comments ───────────────────────────
  function loadGiscus(container, identifier) {
    const gc = window.GISCUS_CONFIG || {};
    if (!gc.repo) {
      container.innerHTML = '<div style="padding:16px;text-align:center;font-size:13px;color:var(--text-sub)">Set up <a href="https://giscus.app" target="_blank" style="color:var(--accent)">Giscus</a> for comments</div>';
      return;
    }
    container.innerHTML = '';

    // If Giscus iframe is already on the page, send a navigation message to reset it
    const existing = document.querySelector('iframe.giscus-frame');
    if (existing) {
      existing.contentWindow.postMessage(
        { giscus: { setConfig: {
          term: identifier,
          reactionsEnabled: false,
          lang: 'en',
        }}},
        'https://giscus.app'
      );
      // Move the iframe into the new container
      const wrap = existing.closest('.giscus');
      if (wrap) container.appendChild(wrap);
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.setAttribute('data-repo',              gc.repo);
    s.setAttribute('data-repo-id',           gc.repoId     || '');
    s.setAttribute('data-category',          gc.category   || 'General');
    s.setAttribute('data-category-id',       gc.categoryId || '');
    s.setAttribute('data-mapping',           'specific');
    s.setAttribute('data-term',              identifier);
    s.setAttribute('data-reactions-enabled', '0');
    s.setAttribute('data-emit-metadata',     '0');
    s.setAttribute('data-input-position',    'top');
    s.setAttribute('data-theme',             'light');
    s.setAttribute('data-lang',              'en');
    s.setAttribute('crossorigin',            'anonymous');
    s.async = true;
    container.appendChild(s);
  }


  // ── GitHub XHR (avoids fetch ISO-8859-1 header bug) ──
  function utf8b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  // Clean a string to guaranteed ASCII-only, char by char
  // Works on any input including tokens with invisible unicode copied from browser
  function toASCII(s) {
    let out = '';
    for (let i = 0; i < (s||'').length; i++) {
      const cp = (s||'').charCodeAt(i);
      if (cp >= 0x20 && cp <= 0x7E) out += s[i];
    }
    return out;
  }

  // GitHub API via fetch() with guaranteed-ASCII Authorization header
  // toASCII() processes character-by-character so no unicode can slip through
  async function ghFetch(method, path, body) {
    const tok   = toASCII(S.token);
    const owner = toASCII(S.owner);
    const repo  = toASCII(S.repo);
    if (!tok) throw new Error('Token is empty after cleaning — please re-enter your PAT');
    const url = 'https://api.github.com/repos/' + owner + '/' + repo + path;
    const headers = { 'Authorization': 'token ' + tok, 'Accept': 'application/vnd.github.v3+json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  }
  // ── File-specific save helpers ────────────────
  async function saveFile(filePath, data, msg) {
    if (!S.token || !S.owner || !S.repo) throw new Error('Not logged in as admin');
    const get = await ghFetch('GET', '/contents/' + filePath);
    if (get.status !== 200) throw new Error('Cannot read ' + filePath + ' (HTTP ' + get.status + ')');
    const sha = get.body.sha;
    if (!sha) throw new Error('No SHA for ' + filePath);
    const put = await ghFetch('PUT', '/contents/' + filePath, {
      message: msg || 'Update', sha,
      content: utf8b64(JSON.stringify(data, null, 2))
    });
    if (put.status !== 200 && put.status !== 201)
      throw new Error((put.body && put.body.message) || 'Save failed (' + put.status + ')');
  }

  async function savePostsData(msg) {
    await saveFile('data/posts.json', { config: S.data.config, posts: S.data.posts }, msg);
  }
  async function saveReviewsData(category, msg) {
    const items = S.data.reviews.filter(r => r.category === category);
    await saveFile('data/reviews-' + category + '.json', items, msg);
  }
  async function saveWritingsData(msg) {
    await saveFile('data/writings.json', S.data.writings, msg);
  }
  async function savePicsData(msg) {
    await saveFile('data/pics.json', S.data.pics, msg);
  }

  // Legacy alias — saves all changed files (used by toggleHidden for all types)
  async function saveData(msg) {
    await savePostsData(msg);
  }
  async function uploadImage(file) {
    if (!S.token) throw new Error('Not logged in');
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const name = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2,6) + '.' + ext;
    const b64  = await new Promise((res,rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej; r.readAsDataURL(file);
    });
    const put = await ghFetch('PUT', '/contents/images/' + name, { message:'Upload image', content:b64 });
    if (put.status !== 200 && put.status !== 201)
      throw new Error((put.body && put.body.message) || 'Image upload failed');
    return 'https://raw.githubusercontent.com/' + S.owner + '/' + S.repo + '/main/images/' + name;
  }

  // ── Load Data ──────────────────────────────────
  function getBase() {
    const parts = window.location.pathname.split('/').filter(x => x && !x.includes('.'));
    return parts.length ? '/' + parts[0] : '';
  }
  async function loadData() {
    const base = getBase();
    const FILES = [
      'posts.json',
      'reviews-movie.json', 'reviews-game.json', 'reviews-drama.json',
      'reviews-book.json', 'reviews-travel.json',
      'writings.json', 'pics.json'
    ];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ts = Date.now();
        const results = await Promise.all(
          FILES.map(f => fetch(base + '/data/' + f + '?_t=' + ts).then(r => { if (!r.ok) throw new Error(f + ' HTTP ' + r.status); return r.json(); }))
        );
        const [postsFile, movie, game, drama, book, travel, writings, pics] = results;
        S.data.config   = postsFile.config   || {};
        S.data.posts    = postsFile.posts     || [];
        S.data.reviews  = [...(movie||[]), ...(game||[]), ...(drama||[]), ...(book||[]), ...(travel||[])];
        S.data.writings = writings || [];
        S.data.pics     = pics     || [];
        renderAll(); return;
      } catch(e) {
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
        else {
          const el = ge('posts-list');
          if (el) el.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-msg">Could not load data — <a href="" style="color:var(--accent)">refresh</a></div></div>';
        }
      }
    }
  }

  // ── Render ─────────────────────────────────────
  function renderAll() { renderProfile(); renderCounts(); renderSection(S.section); }

  function renderProfile() {
    const c = S.data.config || {};
    if (ge('profile-name'))  ge('profile-name').textContent  = c.author || 'Author';
    if (ge('profile-bio'))   ge('profile-bio').textContent   = c.bio    || '';
    const vis = arr => arr.filter(x => S.isAdmin || !x.hidden);
    const total = vis(S.data.posts.filter(p=>!p.parentId)).length + vis(S.data.reviews).length + vis(S.data.writings).length;
    if (ge('stat-posts'))    ge('stat-posts').textContent    = total;
    if (ge('stat-reviews'))  ge('stat-reviews').textContent  = vis(S.data.reviews).length;
    if (ge('stat-writings')) ge('stat-writings').textContent = vis(S.data.writings).length;
  }

  function renderCounts() {
    const vis = arr => arr.filter(x => S.isAdmin || !x.hidden);
    if (ge('badge-home'))     ge('badge-home').textContent     = vis(S.data.posts.filter(p=>!p.parentId)).length;
    if (ge('badge-reviews'))  ge('badge-reviews').textContent  = vis(S.data.reviews).length;
    if (ge('badge-writings')) ge('badge-writings').textContent = vis(S.data.writings).length;
    if (ge('badge-pics'))     ge('badge-pics').textContent     = vis(S.data.pics||[]).length;
    Object.keys(CATS).forEach(cat => {
      const e = ge('sub-count-' + cat);
      if (e) e.textContent = vis(S.data.reviews).filter(r => r.category === cat).length;
    });
    const allEl = ge('sub-count-all');
    if (allEl) allEl.textContent = vis(S.data.reviews).length;
  }

  function pushNav(sec, subState) {
    const state = { sec, sub: subState || null };
    const hash = '#' + sec + (subState ? '/' + subState : '');
    history.pushState(state, '', hash);
    _renderSection(sec);
  }

  function renderSection(sec) {
    _renderSection(sec);
  }

  function _renderSection(sec) {
    S.section = sec;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pageId = { home:'page-home', reviews:'page-reviews', writings:'page-writings', pics:'page-pics', search:'page-search', guestbook:'page-guestbook' }[sec];
    if (pageId && ge(pageId)) ge(pageId).classList.add('active');
    if (ge('nav-' + sec)) ge('nav-' + sec).classList.add('active');
    if (sec === 'home')      renderFeed();
    if (sec === 'reviews')   renderReviews();
    if (sec === 'writings')  renderWritings();
    if (sec === 'pics')      renderPics();
    if (sec === 'search')    { const si=ge('search-input'); if(si){si.focus();runSearch(si.value);} }
    if (sec === 'guestbook') renderGuestbook();
  }

  // ── Home Feed ──────────────────────────────────
  function renderFeed() {
    if (ge('compose-wrap')) ge('compose-wrap').className = 'compose ' + (S.isAdmin ? 'show' : '');
    const all = S.data.posts.filter(p => !p.parentId && (S.isAdmin || !p.hidden));
    all.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    const total = all.length;
    const start = S.feedPage * S.FEED_PER_PAGE;
    const items = all.slice(start, start + S.FEED_PER_PAGE);
    const container = ge('posts-list'); if (!container) return;
    if (!total) { container.innerHTML = '<div class="empty"><div class="empty-icon">🌿</div><div class="empty-msg">No posts yet</div></div>'; return; }
    const cards = items.map((p,i) => postCardHTML(p, i===0)).join('');
    const totalPages = Math.ceil(total / S.FEED_PER_PAGE);
    const pagination = totalPages > 1 ? `<div class="pagination">
      <button class="page-btn" onclick="App.feedPageNav(-1)" ${S.feedPage===0?'disabled':''}>← Prev</button>
      <span class="page-info">${S.feedPage+1} / ${totalPages}</span>
      <button class="page-btn" onclick="App.feedPageNav(1)" ${S.feedPage>=totalPages-1?'disabled':''}>Next →</button>
    </div>` : '';
    container.innerHTML = cards + pagination;
  }

  function feedPageNav(dir) {
    const all = S.data.posts.filter(p => !p.parentId && (S.isAdmin || !p.hidden));
    const totalPages = Math.ceil(all.length / S.FEED_PER_PAGE);
    S.feedPage = Math.max(0, Math.min(totalPages - 1, S.feedPage + dir));
    renderFeed();
    window.scrollTo(0, 0);
  }

  const THREAD_PREVIEW = 3;
  // Main feed dot color (between #629FAD and #EDEDCE)
  const FEED_DOT_COLOR = '#A8CBBF';

  function postCardHTML(root, isFirst) {
    const tid = root.threadId || root.id;
    const allReplies = S.data.posts
      .filter(x => x.parentId && x.threadId === tid && (S.isAdmin || !x.hidden))
      .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const totalReplies = allReplies.length;

    function singlePostHTML(p, isRoot) {
      const imgs = (p.images||[]).map(u => '<img src="'+esc(u)+'" class="post-img" loading="lazy">').join('');
      const ab = S.isAdmin
        ? '<button class="act-btn" onclick="event.stopPropagation();App.toggleHidden(\'posts\',\''+p.id+'\')">'+( p.hidden?'👁️':'🔒')+'</button>'
        + '<button class="act-btn" onclick="event.stopPropagation();App.editPost(\''+p.id+'\')">✏️</button>'
        + '<button class="act-btn del" onclick="event.stopPropagation();App.deletePost(\''+p.id+'\')">🗑️</button>'
        + '<button class="act-btn" onclick="event.stopPropagation();App.replyPost(\''+p.id+'\')">↩</button>'
        : '';
      const authorLine = '<div class="tw-meta">'
        + '<span class="tw-author">'+esc(S.data.config.author||'Author')+'</span>'
        + '<span class="tw-time">'+relTime(p.timestamp)+'</span>'
        + (p.edited?'<span class="post-edited">edited</span>':'')
        + (p.hidden?'<span class="post-edited">hidden</span>':'')
        + '</div>';
      const hasLineBelow = isRoot && totalReplies > 0;
      return '<div class="tw-post'+(isRoot?' tw-root':' tw-reply')+'">'
        + '<div class="tw-left">'
        + '<div class="tw-dot" style="background:'+FEED_DOT_COLOR+'"></div>'
        + (hasLineBelow ? '<div class="tw-vline"></div>' : '')
        + '</div>'
        + '<div class="tw-right">'+authorLine
        + '<div class="post-text">'+fmtContent(p.content)+'</div>'
        + (imgs?'<div class="post-images">'+imgs+'</div>':'')
        + '<div class="post-actions">'+ab+'</div>'
        + '</div></div>';
    }

    // Twitter style: first + last always visible, middle collapsed
    const COLLAPSE_MIN = 3; // need at least this many replies to collapse
    const hasMore = allReplies.length >= COLLAPSE_MIN;
    const firstReply  = allReplies.length ? [allReplies[0]] : [];
    const lastReply   = allReplies.length > 1 ? [allReplies[allReplies.length - 1]] : [];
    const middleReplies = hasMore ? allReplies.slice(1, allReplies.length - 1) : [];

    const rootHTML      = singlePostHTML(root, true);
    const firstHTML     = (hasMore ? firstReply : allReplies).map(p => singlePostHTML(p, false)).join('');
    const lastHTML      = hasMore ? lastReply.map(p => singlePostHTML(p, false)).join('') : '';
    const hidHTML       = middleReplies.length
      ? '<div class="tw-more-wrap" id="more-'+tid+'">'
        + '<button class="tw-more-btn" onclick="event.stopPropagation();App.toggleThreadMore(\''+tid+'\')">↓ '+middleReplies.length+'개 더 보기</button>'
        + '<div class="tw-hidden-replies" id="more-body-'+tid+'" style="display:none">'
        + middleReplies.map(p => singlePostHTML(p, false)).join('')
        + '</div></div>'
      : '';

    return '<div class="tw-thread'+(isFirst?' tw-thread-first':'')+(root.hidden?' is-hidden':'')+'">'
      + rootHTML + firstHTML + hidHTML + lastHTML
      + '</div>';
  }

  function reviewCardHTML(r) {
    const c = CATS[r.category] || {label:r.category, emoji:'', color:'var(--text-dim)'};
    const prev = (r.threads||[])[0] ? esc((r.threads[0].content||'').substring(0,120))+'…' : '';
    const hidBtn = S.isAdmin ? '<button class="act-btn" onclick="event.stopPropagation();App.toggleHidden(\'reviews\',\''+r.id+'\')">'+( r.hidden?'👁️':'🔒')+'</button>' : '';
    const ab = S.isAdmin ? hidBtn+'<button class="act-btn" onclick="event.stopPropagation();App.editReview(\''+r.id+'\')">✏️</button><button class="act-btn del" onclick="event.stopPropagation();App.deleteReview(\''+r.id+'\')">🗑️</button>' : '';
    return '<div class="post-wrap"><div class="post-card feed-card-review'+(r.hidden?' is-hidden':'')+'" onclick="App.goToReview(\''+r.id+'\')"><div class="post-body"><div class="post-meta"><span class="feed-type-badge" style="background:'+c.color+'20;color:'+c.color+';border:1px solid '+c.color+'40">'+c.emoji+' '+c.label+'</span><span class="post-time">'+relTime(r.timestamp)+'</span>'+(r.hidden?'<span class="post-edited">hidden</span>':'')+'</div><div class="feed-card-title">'+esc(r.title)+'</div><div class="feed-thread-preview">'+prev+'</div><div class="post-actions">'+ab+'</div></div></div></div>';
  }

  function writingCardHTML(w) {
    const hidBtn = S.isAdmin ? '<button class="act-btn" onclick="event.stopPropagation();App.toggleHidden(\'writings\',\''+w.id+'\')">'+( w.hidden?'👁️':'🔒')+'</button>' : '';
    const ab = S.isAdmin ? hidBtn+'<button class="act-btn" onclick="event.stopPropagation();App.editWriting(\''+w.id+'\')">✏️</button><button class="act-btn del" onclick="event.stopPropagation();App.deleteWriting(\''+w.id+'\')">🗑️</button>' : '';
    return '<div class="post-wrap"><div class="post-card feed-card-writing'+(w.hidden?' is-hidden':'')+'" onclick="App.goToWriting(\''+w.id+'\')"><div class="post-body"><div class="post-meta"><span class="feed-type-badge" style="background:rgba(44,123,229,0.1);color:var(--accent);border:1px solid rgba(44,123,229,0.2)">✍️ Writing</span><span class="post-time">'+relTime(w.timestamp)+'</span>'+(w.hidden?'<span class="post-edited">hidden</span>':'')+'</div><div class="feed-card-title">'+esc(w.title)+'</div><div class="feed-thread-preview">'+esc((w.excerpt||w.content||'').substring(0,120))+'…</div>'+(w.tags&&w.tags.length?'<div class="post-tags">'+w.tags.map(t=>'<span class="p-tag">'+esc(t)+'</span>').join('')+'</div>':'')+'<div class="post-actions">'+ab+'</div></div></div></div>';
  }


  // Feed compose
  function updateCC() {
    const ta = ge('compose-ta'); const btn = ge('send-btn'); if (!ta||!btn) return;
    const cc = ge('char-count'); if (cc) cc.textContent = ta.value.length ? ta.value.length+' chars' : '';
    btn.disabled = (!ta.value.trim() && S.pendingFeedImgs.length === 0);
  }
  function openCompose() {
    if (!S.isAdmin) return;
    S.editPost = null; S.replyTo = null;
    if (ge('reply-banner')) ge('reply-banner').style.display = 'none';
    if (ge('edit-banner'))  ge('edit-banner').className = 'edit-banner';
    if (ge('compose-wrap')) ge('compose-wrap').classList.add('show');
    if (ge('compose-ta'))   ge('compose-ta').focus();
    updateCC();
  }
  function cancelCompose() {
    S.replyTo = null; S.editPost = null; S.pendingFeedImgs = [];
    if (ge('reply-banner'))       ge('reply-banner').style.display = 'none';
    if (ge('edit-banner'))        ge('edit-banner').className = 'edit-banner';
    if (ge('compose-ta'))         ge('compose-ta').value = '';
    if (ge('image-preview-wrap')) ge('image-preview-wrap').innerHTML = '';
    if (ge('image-input'))        ge('image-input').value = '';
    if (ge('compose-wrap')) {
      ge('compose-wrap').classList.remove('show');
      if (S.section === 'home' && S.isAdmin) ge('compose-wrap').classList.add('show');
    }
    updateCC();
  }
  function replyPost(id) {
    const p = S.data.posts.find(x=>x.id===id); if (!p) return;
    S.replyTo=p; S.editPost=null;
    if (ge('reply-banner')) { ge('reply-banner').style.display='flex'; const t=ge('reply-banner-text'); if(t) t.textContent='Replying: "'+p.content.substring(0,40)+'..."'; }
    if (ge('compose-wrap')) ge('compose-wrap').classList.add('show');
    if (ge('compose-ta'))   { ge('compose-ta').value=''; ge('compose-ta').focus(); }
    updateCC();
  }
  function editPost(id) {
    const p = S.data.posts.find(x=>x.id===id); if (!p) return;
    S.editPost=p; S.replyTo=null;
    if (ge('edit-banner'))  ge('edit-banner').className='edit-banner show';
    if (ge('reply-banner')) ge('reply-banner').style.display='none';
    if (ge('compose-ta'))   ge('compose-ta').value = p.content;
    if (ge('image-preview-wrap')) ge('image-preview-wrap').innerHTML=(p.images||[]).map((u,i)=>'<div class="img-preview-item" data-url="'+esc(u)+'"><img src="'+esc(u)+'"><button type="button" onclick="App.removeFeedImg('+i+',this)">✕</button></div>').join('');
    if (ge('compose-wrap')) ge('compose-wrap').classList.add('show');
    updateCC();
  }
  async function sendPost() {
    const ta = ge('compose-ta'); if (!ta) return;
    const text = ta.value.trim();
    if (!text && S.pendingFeedImgs.length===0) return;
    const btn = ge('send-btn'); if (btn) { btn.disabled=true; btn.textContent='Saving...'; }
    try {
      const imageUrls = [];
      if (S.editPost) (S.editPost.images||[]).forEach(u => { if (document.querySelector('[data-url="'+u+'"]')) imageUrls.push(u); });
      for (let i=0; i<S.pendingFeedImgs.length; i++) {
        if (btn) btn.textContent='Uploading '+(i+1)+'/'+S.pendingFeedImgs.length+'...';
        imageUrls.push(await uploadImage(S.pendingFeedImgs[i]));
      }
      if (btn) btn.textContent='Saving...';
      if (S.editPost) {
        S.editPost.content=text; S.editPost.images=imageUrls; S.editPost.edited=true; S.editPost.editedAt=new Date().toISOString();
      } else {
        const id='post-'+Date.now();
        S.data.posts.unshift({ id, content:text, timestamp:new Date().toISOString(), parentId:S.replyTo?S.replyTo.id:null, threadId:S.replyTo?S.replyTo.threadId:('thread-'+id), images:imageUrls, edited:false, editedAt:null });
      }
      await savePostsData('Save post');
      S.pendingFeedImgs=[]; cancelCompose(); renderAll();
      if (S.feedView==='thread' && S.feedThreadId) openFeedThread(S.feedThreadId);
      toast('Saved ✓', 'ok');
    } catch(e) { toast(e.message, 'err'); }
    if (btn) { btn.disabled=false; btn.textContent='Post'; }
  }
  async function deletePost(id) {
    if (!confirm('Delete this post?')) return;
    const p=S.data.posts.find(x=>x.id===id); const tid=p&&p.threadId;
    S.data.posts=S.data.posts.filter(x=>x.id!==id);
    try { await savePostsData('Delete post'); renderAll(); if(S.feedView==='thread'){const s=S.data.posts.filter(x=>x.threadId===tid); s.length?openFeedThread(tid):closeFeedThread();} toast('Deleted','ok'); }
    catch(e) { toast(e.message,'err'); }
  }
  function removeFeedImg(idx, btn) { S.pendingFeedImgs.splice(idx,1); if(btn) btn.closest('.img-preview-item').remove(); }

  // Feed thread detail
  function openFeedThread(threadId) {
    history.pushState({sec:'home', sub:'thread:'+threadId}, '', '#home/thread:'+threadId);
    S.feedView='thread'; S.feedThreadId=threadId;
    const posts=S.data.posts.filter(p=>p.threadId===threadId).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
    if (!posts.length) return;
    if (ge('feed-list-view'))   ge('feed-list-view').style.display='none';
    if (ge('feed-thread-view')) ge('feed-thread-view').classList.add('show');
    const root=posts[0], rest=posts.slice(1);
    const rootImgs=(root.images||[]).map(u=>'<img src="'+esc(u)+'" class="post-img" loading="lazy">').join('');
    const ar=S.isAdmin?'<div class="td-actions"><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.editPost(\''+root.id+'\')">✏️ Edit</button><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)" onclick="App.deletePost(\''+root.id+'\')">🗑️ Delete</button><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.replyPost(\''+root.id+'\')">↩ Reply</button></div>':'';
    const repliesHTML=rest.map(p=>{
      const ri=(p.images||[]).map(u=>'<img src="'+esc(u)+'" class="post-img" loading="lazy">').join('');
      const rA=S.isAdmin?'<div class="post-actions" style="opacity:1"><button class="act-btn" onclick="App.editPost(\''+p.id+'\')">✏️</button><button class="act-btn del" onclick="App.deletePost(\''+p.id+'\')">🗑️</button><button class="act-btn" onclick="App.replyPost(\''+p.id+'\')">↩</button></div>':'';
      return '<div class="td-reply"><div class="post-body"><div class="post-meta"><span class="post-author">'+esc(S.data.config.author||'Author')+'</span><span class="post-time">'+relTime(p.timestamp)+'</span>'+(p.edited?'<span class="post-edited">edited</span>':'')+'</div><div class="post-text">'+fmtContent(p.content)+'</div>'+(ri?'<div class="post-images">'+ri+'</div>':'')+rA+'</div></div>';
    }).join('');
    const tp=ge('feed-thread-posts');
    if (tp) tp.innerHTML='<div class="td-body"><div class="td-root"><div style="margin-bottom:14px"><div style="font-weight:700;font-size:14px">'+esc(S.data.config.author||'Author')+'</div><div style="font-size:11px;color:var(--text-sub);margin-top:2px">'+relTime(root.timestamp)+'</div></div><div class="td-content">'+fmtContent(root.content)+'</div>'+(rootImgs?'<div class="post-images">'+rootImgs+'</div>':'')+'<div class="td-meta">'+fmtDate(root.timestamp)+(root.edited?' · <em>edited</em>':'')+'</div>'+ar+'</div>'+repliesHTML+'</div>';
    // no Giscus on main feed
    window.scrollTo(0,0);
  }
  function toggleThreadMore(tid) {
    const body = ge('more-body-'+tid);
    const btn = document.querySelector('#more-'+tid+' .ft-more-btn');
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (btn) btn.textContent = open
      ? '↓ ' + body.querySelectorAll('.ft-reply').length + '개 더 보기'
      : '↑ 접기';
  }

  function closeFeedThread() {
    S.feedView='list'; S.feedThreadId=null;
    if (ge('feed-list-view'))   ge('feed-list-view').style.display='';
    if (ge('feed-thread-view')) ge('feed-thread-view').classList.remove('show');
    cancelCompose();
  }

  // ── Reviews ────────────────────────────────────
  function renderReviews() {
    S.reviewView='list';
    if (ge('review-list-view'))   ge('review-list-view').style.display='';
    if (ge('review-detail-view')) ge('review-detail-view').classList.remove('show');
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p.dataset.cat===S.reviewCat));
    document.querySelectorAll('.sub-item').forEach(p => p.classList.toggle('active', p.dataset.cat===S.reviewCat));
    const filtered=S.data.reviews.filter(r=>(S.isAdmin||!r.hidden)&&(S.reviewCat==='all'||r.category===S.reviewCat)).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
    const list=ge('review-list'); if (!list) return;
    if (!filtered.length) { list.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div class="empty-msg">No reviews yet</div></div>'; return; }
    list.innerHTML=filtered.map(r=>{
      const c=CATS[r.category]||{label:r.category,emoji:'',color:'var(--text-dim)'}; const tc=c.textColor||c.color;
      const ab=S.isAdmin?'<div class="review-row-actions"><button class="act-btn" onclick="event.stopPropagation();App.toggleHidden(\'reviews\',\''+r.id+'\')">'+(r.hidden?'👁️':'🔒')+'</button><button class="act-btn" onclick="event.stopPropagation();App.editReview(\''+r.id+'\')">✏️ Edit</button><button class="act-btn del" onclick="event.stopPropagation();App.deleteReview(\''+r.id+'\')">🗑️ Delete</button></div>':'';
      return '<div class="review-row'+(r.hidden?' is-hidden':'')+'" onclick="App.openReview(\''+r.id+'\')">' + '<div class="review-cat-dot" style="background:'+c.color+'"></div><div class="review-info"><div class="review-title">'+esc(r.title)+'</div><div class="review-meta"><span class="review-cat-label" style="color:'+c.color+'">'+c.emoji+' '+c.label+'</span><span class="review-date">'+fmtDate(r.timestamp)+'</span><span class="review-count">'+((r.threads||[]).length)+' threads</span></div>'+ab+'</div><div class="review-arrow">→</div></div>';
    }).join('');
  }

  function openReview(id) {
    const r=S.data.reviews.find(x=>x.id===id); if (!r) return;
    S.reviewView='detail'; S.reviewId=id;
    if (ge('review-list-view'))   ge('review-list-view').style.display='none';
    const dv=ge('review-detail-view'); if (!dv) return;
    dv.classList.add('show');
    const c=CATS[r.category]||{label:r.category,emoji:'',color:'var(--text-dim)'};
    const ab=S.isAdmin?'<div class="wd-actions"><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.editReview(\''+r.id+'\')">✏️ Edit</button><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)" onclick="App.deleteReview(\''+r.id+'\')">🗑️ Delete</button></div>':'';
    const threadsHTML=(r.threads||[]).map((t,i,arr)=>{
      const ti=(t.images||[]).map(u=>'<img src="'+esc(u)+'" class="post-img" loading="lazy">').join('');
      return '<div class="rd-thread-item"><div class="rd-thread-connector"><div class="rd-thread-dot"></div>'+(i<arr.length-1?'<div class="rd-tline"></div>':'')+'</div><div><div class="rd-content">'+fmtContent(t.content)+'</div>'+(ti?'<div class="post-images">'+ti+'</div>':'')+'<div class="rd-time">'+relTime(t.timestamp)+'</div></div></div>';
    }).join('');
    const rdTagsHTML=(r.tags||[]).map(t=>'<span class="w-tag" onclick="App.searchTag(\''+encodeURIComponent(t)+'\')" style="cursor:pointer">'+esc(t)+'</span>').join('');
    dv.innerHTML='<button class="td-back" onclick="App.closeReview()">← Back to reviews</button><div class="rd-header"><div class="rd-cat-badge"><span style="width:7px;height:7px;border-radius:50%;background:'+c.color+';display:inline-block"></span> '+c.emoji+' '+c.label+'</div><div class="rd-title">'+esc(r.title)+'</div>'+(rdTagsHTML?'<div class="writing-footer" style="margin-top:8px;margin-bottom:4px">'+rdTagsHTML+'</div>':'')+'<div class="rd-meta">'+fmtDate(r.timestamp)+(r.edited?' · edited':'')+'</div>'+ab+'</div><div class="rd-threads" style="--rd-cat-color:'+c.color+'">'+threadsHTML+'</div><div class="comments-wrap"><div id="review-comments"></div></div>';
    const gcEl=ge('review-comments');
    if (gcEl) loadGiscus(gcEl, id);
    window.scrollTo(0,0);
  }
  function closeReview() {
    S.reviewView='list'; S.reviewId=null;
    if (ge('review-detail-view')) ge('review-detail-view').classList.remove('show');
    if (ge('review-list-view'))   ge('review-list-view').style.display='';
  }
  function openReviewCompose(isEdit) {
    const rc=ge('review-compose'); if (!rc) return;
    rc.classList.add('show');
    if (!isEdit) {
      if (ge('rc-title')) ge('rc-title').value='';
      if (ge('rc-cat'))   ge('rc-cat').value='movie';
      if (ge('rc-tags'))  ge('rc-tags').value='';
      const w=ge('rc-threads-wrap'); if (w) w.innerHTML=buildThreadEntry();
    }
    rc.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function closeReviewCompose() { const rc=ge('review-compose'); if (rc) rc.classList.remove('show'); S.editReview=null; }
  function buildThreadEntry(content, imgs) {
    const imgHTML=(imgs||[]).map(u=>'<div class="img-preview-item" data-url="'+esc(u)+'"><img src="'+esc(u)+'"><button type="button" onclick="this.closest(\'.img-preview-item\').remove()">✕</button></div>').join('');
    return '<div class="rc-thread-entry"><textarea class="rc-thread-ta" placeholder="Thread content...">'+esc(content||'')+'</textarea><div style="display:flex;align-items:center;gap:8px;margin-top:4px"><div class="image-preview-wrap rc-img-wrap" style="flex:1">'+imgHTML+'</div><label class="img-upload-btn" title="Attach image">📎 <input type="file" class="rc-img-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display:none"></label><button class="rc-del-thread" type="button" onclick="this.closest(\'.rc-thread-entry\').remove()">✕ Remove</button></div></div>';
  }
  function addThreadEntry() { const w=ge('rc-threads-wrap'); if (w) w.insertAdjacentHTML('beforeend',buildThreadEntry()); }
  async function sendReview() {
    const title=(ge('rc-title')?ge('rc-title').value.trim():'');
    const cat=(ge('rc-cat')?ge('rc-cat').value:'movie');
    const tags=(ge('rc-tags')?ge('rc-tags').value.split(',').map(t=>t.trim()).filter(Boolean):[]);
    const entries=document.querySelectorAll('#rc-threads-wrap .rc-thread-entry');
    if (!title||!entries.length) { toast('Title and content required','err'); return; }
    const btn=ge('rc-send'); if (btn) { btn.disabled=true; btn.textContent='Saving...'; }
    try {
      const now=new Date().toISOString(); const threads=[];
      for (let i=0; i<entries.length; i++) {
        const entry=entries[i];
        const text=entry.querySelector('.rc-thread-ta')?entry.querySelector('.rc-thread-ta').value.trim():'';
        if (!text) continue;
        const imgs=[];
        entry.querySelectorAll('.img-preview-item[data-url]').forEach(d=>imgs.push(d.dataset.url));
        const newDivs=entry.querySelectorAll('.img-preview-item:not([data-url])');
        for (const d of newDivs) { if (d._file) { if(btn) btn.textContent='Uploading image...'; imgs.push(await uploadImage(d._file)); } }
        const prev=S.editReview&&(S.editReview.threads||[])[i];
        threads.push({id:prev?prev.id:('rv'+Date.now()+'-t'+i), content:text, images:imgs, timestamp:prev?prev.timestamp:now});
      }
      if (!threads.length) { toast('Please add content','err'); if(btn){btn.disabled=false;btn.textContent='Save';} return; }
      if (btn) btn.textContent='Saving...';
      if (S.editReview) {
        S.editReview.title=title; S.editReview.category=cat; S.editReview.tags=tags; S.editReview.threads=threads; S.editReview.edited=true; S.editReview.editedAt=now; S.editReview=null;
      } else {
        S.data.reviews.unshift({id:'review-'+Date.now(), title, category:cat, tags, timestamp:now, edited:false, editedAt:null, threads});
      }
      await saveReviewsData(cat, 'Save review'); closeReviewCompose(); renderAll(); toast('Review saved ✓','ok');
    } catch(e) { toast(e.message,'err'); }
    if (btn) { btn.disabled=false; btn.textContent='Save'; }
  }
  function editReview(id) {
    const r=S.data.reviews.find(x=>x.id===id); if (!r) return;
    S.editReview=r; if (S.reviewView==='detail') closeReview();
    openReviewCompose(true);
    if (ge('rc-title')) ge('rc-title').value=r.title;
    if (ge('rc-cat'))   ge('rc-cat').value=r.category;
    if (ge('rc-tags'))  ge('rc-tags').value=(r.tags||[]).join(', ');
    const w=ge('rc-threads-wrap'); if (w) w.innerHTML=(r.threads||[]).map(t=>buildThreadEntry(t.content,t.images)).join('');
  }
  async function deleteReview(id) {
    if (!confirm('Delete this review?')) return;
    const rDel=S.data.reviews.find(x=>x.id===id); if(!rDel)return;
    S.data.reviews=S.data.reviews.filter(x=>x.id!==id);
    try { await saveReviewsData(rDel.category, 'Delete review'); if(S.reviewView==='detail') closeReview(); renderAll(); toast('Deleted','ok'); }
    catch(e) { toast(e.message,'err'); }
  }

  // ── Writings ───────────────────────────────────
  function renderWritings() {
    S.writingView='list';
    if (ge('writing-list-view'))   ge('writing-list-view').style.display='';
    if (ge('writing-detail-view')) ge('writing-detail-view').classList.remove('show');
    const all=S.data.writings.filter(w=>S.isAdmin||!w.hidden).slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
    const list=ge('writing-list'); if (!list) return;
    if (!all.length) { list.innerHTML='<div class="empty"><div class="empty-icon">🖊️</div><div class="empty-msg">No writings yet</div></div>'; return; }
    list.innerHTML=all.map(w=>{
      const ab=S.isAdmin?'<div class="writing-row-actions"><button class="act-btn" onclick="event.stopPropagation();App.toggleHidden(\'writings\',\''+w.id+'\')">'+(w.hidden?'👁️':'🔒')+'</button><button class="act-btn" onclick="event.stopPropagation();App.editWriting(\''+w.id+'\')">✏️ Edit</button><button class="act-btn del" onclick="event.stopPropagation();App.deleteWriting(\''+w.id+'\')">🗑️ Delete</button></div>':'';
      return '<div class="writing-row'+(w.hidden?' is-hidden':'')+'" onclick="App.openWriting(\''+w.id+'\')">' + '<div class="writing-title">'+esc(w.title)+'</div><div class="writing-excerpt">'+esc(w.excerpt||(w.content||'').substring(0,100)+'...')+'</div><div class="writing-footer">'+((w.tags||[]).map(t=>'<span class="w-tag">'+esc(t)+'</span>').join(''))+'<span class="w-date">'+fmtDate(w.timestamp)+'</span></div>'+ab+'</div>';
    }).join('');
  }
  function openWriting(id) {
    const w=S.data.writings.find(x=>x.id===id); if (!w) return;
    S.writingView='detail'; S.writingId=id;
    if (ge('writing-list-view')) ge('writing-list-view').style.display='none';
    const dv=ge('writing-detail-view'); if (!dv) return;
    dv.classList.add('show');
    const imgs=(w.images||[]).map(u=>'<img src="'+esc(u)+'" class="post-img" loading="lazy">').join('');
    const ab=S.isAdmin?'<div class="wd-actions"><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.toggleHidden(\'writings\',\''+w.id+'\')">'+(w.hidden?'👁️ Show':'🔒 Hide')+'</button><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px" onclick="App.editWriting(\''+w.id+'\')">✏️ Edit</button><button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--danger)" onclick="App.deleteWriting(\''+w.id+'\')">🗑️ Delete</button></div>':'';
    dv.innerHTML='<button class="td-back" onclick="App.closeWriting()">← Back to writings</button><div class="wd-header"><div class="wd-tags">'+((w.tags||[]).map(t=>'<span class="w-tag">'+esc(t)+'</span>').join(''))+'</div><div class="wd-title">'+esc(w.title)+'</div><div class="wd-meta">'+fmtDate(w.timestamp)+(w.edited?' · edited':'')+'</div>'+ab+'</div><div class="wd-body">'+fmtWriting(w.content)+'</div>'+(imgs?'<div class="post-images" style="padding:0 28px 20px">'+imgs+'</div>':'')+'<div class="comments-wrap"><div id="writing-comments"></div></div>';
    const gcEl=ge('writing-comments');
    if (gcEl) loadGiscus(gcEl, id);
    window.scrollTo(0,0);
  }
  function closeWriting() {
    S.writingView='list'; S.writingId=null;
    if (ge('writing-detail-view')) ge('writing-detail-view').classList.remove('show');
    if (ge('writing-list-view'))   ge('writing-list-view').style.display='';
  }
  function openWritingCompose(isEdit) {
    const wc=ge('writing-compose'); if (!wc) return;
    wc.classList.add('show');
    if (!isEdit) {
      if (ge('wc-title'))   ge('wc-title').value='';
      if (ge('wc-tags'))    ge('wc-tags').value='';
      if (ge('wc-content')) ge('wc-content').value='';
      S.pendingWritingImgs=[]; const w=ge('wc-img-wrap'); if(w) w.innerHTML='';
    }
    wc.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function closeWritingCompose() {
    const wc=ge('writing-compose'); if (wc) wc.classList.remove('show');
    S.editWriting=null; S.pendingWritingImgs=[]; const w=ge('wc-img-wrap'); if(w) w.innerHTML='';
  }
  async function sendWriting() {
    const title=(ge('wc-title')?ge('wc-title').value.trim():'');
    const tagsRaw=(ge('wc-tags')?ge('wc-tags').value.trim():'');
    const content=(ge('wc-content')?ge('wc-content').value.trim():'');
    if (!title||!content) { toast('Title and content required','err'); return; }
    const tags=tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[];
    const excerpt=content.substring(0,80)+(content.length>80?'...':'');
    const btn=ge('wc-send'); if(btn){btn.disabled=true;btn.textContent='Saving...';}
    try {
      const imageUrls=[];
      if (S.editWriting) (S.editWriting.images||[]).forEach(u=>{if(document.querySelector('#wc-img-wrap [data-url="'+u+'"]')) imageUrls.push(u);});
      for (let i=0;i<S.pendingWritingImgs.length;i++) { if(btn) btn.textContent='Uploading '+(i+1)+'/'+S.pendingWritingImgs.length+'...'; imageUrls.push(await uploadImage(S.pendingWritingImgs[i])); }
      if(btn) btn.textContent='Saving...';
      if (S.editWriting) { Object.assign(S.editWriting,{title,content,tags,excerpt,images:imageUrls,edited:true,editedAt:new Date().toISOString()}); S.editWriting=null; }
      else S.data.writings.unshift({id:'writing-'+Date.now(),title,excerpt,content,tags,images:imageUrls,timestamp:new Date().toISOString(),edited:false,editedAt:null});
      S.pendingWritingImgs=[]; await saveWritingsData('Save writing'); closeWritingCompose(); renderAll(); toast('Writing saved ✓','ok');
    } catch(e) { toast(e.message,'err'); }
    if(btn){btn.disabled=false;btn.textContent='Save';}
  }
  function editWriting(id) {
    const w=S.data.writings.find(x=>x.id===id); if (!w) return;
    S.editWriting=w; if(S.writingView==='detail') closeWriting();
    openWritingCompose(true);
    if(ge('wc-title'))   ge('wc-title').value=w.title;
    if(ge('wc-tags'))    ge('wc-tags').value=(w.tags||[]).join(', ');
    if(ge('wc-content')) ge('wc-content').value=w.content;
    S.pendingWritingImgs=[]; const wrap=ge('wc-img-wrap');
    if(wrap) wrap.innerHTML=(w.images||[]).map(u=>'<div class="img-preview-item" data-url="'+esc(u)+'"><img src="'+esc(u)+'"><button type="button" onclick="this.closest(\'.img-preview-item\').remove()">✕</button></div>').join('');
  }
  async function deleteWriting(id) {
    if (!confirm('Delete this writing?')) return;
    S.data.writings=S.data.writings.filter(x=>x.id!==id);
    try { await saveWritingsData('Delete writing'); if(S.writingView==='detail') closeWriting(); renderAll(); toast('Deleted','ok'); }
    catch(e) { toast(e.message,'err'); }
  }

  // ── Admin ──────────────────────────────────────
  function loadCreds() {
    const t=toASCII(localStorage.getItem('gh_token')||'');
    const o=toASCII(localStorage.getItem('gh_owner')||'');
    const r=toASCII(localStorage.getItem('gh_repo') ||'');
    if(t&&o&&r){S.isAdmin=true;S.token=t;S.owner=o;S.repo=r;updateAdminUI();}
  }

  function openMobileNav() {
    const overlay = ge('mobile-nav-overlay');
    const drawer  = ge('mobile-nav-drawer');
    if (overlay) overlay.classList.add('open');
    if (drawer)  drawer.classList.add('open');
    // update active item
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
      btn.style.color = '';
      btn.style.background = '';
    });
  }
  function closeMobileNav() {
    const overlay = ge('mobile-nav-overlay');
    const drawer  = ge('mobile-nav-drawer');
    if (overlay) overlay.classList.remove('open');
    if (drawer)  drawer.classList.remove('open');
  }
  function mobileNav(sec) {
    closeMobileNav();
    pushNav(sec);
    // update mobile active label
    const labels = { home:'Main', reviews:'Reviews', writings:'Writings', pics:'Pics', search:'Search', guestbook:'Guestbook' };
    const el = document.querySelector('.sidebar-active-label');
    if (el) el.textContent = labels[sec] || sec;
  }

  function openAdminModal() { if(S.isAdmin){logoutAdmin();return;} if(ge('m-owner')) ge('m-owner').value=localStorage.getItem('gh_owner')||''; if(ge('m-repo')) ge('m-repo').value=localStorage.getItem('gh_repo')||''; if(ge('m-token')) ge('m-token').value=''; if(ge('admin-modal')) ge('admin-modal').classList.add('show'); }
  function closeAdminModal() { if(ge('admin-modal')) ge('admin-modal').classList.remove('show'); }
  function saveAdmin() {
    const t=(ge('m-token')?ge('m-token').value:'').trim();
    const o=(ge('m-owner')?ge('m-owner').value:'').trim();
    const r=(ge('m-repo') ?ge('m-repo').value :'').trim();
    if(!t||!o||!r){toast('All fields required','err');return;}
    const cleanT=toASCII(t),cleanO=toASCII(o),cleanR=toASCII(r);
    if(!cleanT||!cleanO||!cleanR){toast('All fields required','err');return;}
    localStorage.setItem('gh_token',cleanT); localStorage.setItem('gh_owner',cleanO); localStorage.setItem('gh_repo',cleanR);
    S.isAdmin=true;S.token=cleanT;S.owner=cleanO;S.repo=cleanR;
    closeAdminModal(); updateAdminUI(); renderSection(S.section); toast('Admin mode enabled ✓','ok');
  }
  function logoutAdmin() {
    ['gh_token','gh_owner','gh_repo'].forEach(k=>localStorage.removeItem(k));
    S.isAdmin=false;S.token=S.owner=S.repo=null; updateAdminUI(); renderSection(S.section); toast('Logged out');
  }
  function updateAdminUI() {
    const btn=ge('admin-btn'); const fab=ge('fab');
    const mab=ge('mobile-admin-btn');
    if(S.isAdmin){
      if(btn){btn.classList.add('on');const sp=btn.querySelector('.al');if(sp)sp.textContent='Logout';}
      if(fab)fab.classList.add('show');
      if(mab)mab.textContent='🔓 Logout Admin';
    } else {
      if(btn){btn.classList.remove('on');const sp=btn.querySelector('.al');if(sp)sp.textContent='Admin Login';}
      if(fab)fab.classList.remove('show');
      if(mab)mab.textContent='🔐 Admin';
    }
  }
  function fabAction() { if(!S.isAdmin) return; if(S.section==='home') openCompose(); if(S.section==='reviews') openReviewCompose(); if(S.section==='writings') openWritingCompose(); if(S.section==='pics'){const c=ge('pics-compose');if(c)c.classList.toggle('show');} }

  function goToReview(id)  { renderSection('reviews');  setTimeout(()=>openReview(id),60);  }
  function goToWriting(id) { renderSection('writings'); setTimeout(()=>openWriting(id),60); }

  // ── Image file input helper ────────────────────
  function attachImgInput(inputEl, wrapEl, bucket) {
    if(!inputEl||!wrapEl) return;
    inputEl.addEventListener('change', e => {
      Array.from(e.target.files||[]).forEach(f => {
        if(!f.type.startsWith('image/')){toast('Images only','err');return;}
        if(f.size>10*1024*1024){toast('Max 10MB','err');return;}
        bucket.push(f);
        const reader=new FileReader();
        reader.onload=ev=>{
          const div=document.createElement('div'); div.className='img-preview-item'; div._file=f;
          div.innerHTML='<img src="'+ev.target.result+'"><button type="button">✕</button>';
          div.querySelector('button').onclick=()=>{const i=bucket.indexOf(f);if(i>-1)bucket.splice(i,1);div.remove();};
          wrapEl.appendChild(div);
        };
        reader.readAsDataURL(f);
      });
      inputEl.value='';
    });
  }


  // ── Guestbook ──────────────────────────────────
  function renderGuestbook() {
    // Form submission via Formspree (AJAX)
    const form = ge('gb-form');
    if (form && !form._bound) {
      form._bound = true;
      // Char counter
      const msg = ge('gb-msg');
      if (msg) msg.addEventListener('input', () => { const cc = ge('gb-cc'); if(cc) cc.textContent = msg.value.length; });
      // Submit
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = ge('gb-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
        try {
          const res = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
          });
          if (res.ok) {
            form.style.display = 'none';
            const suc = ge('gb-success'); if (suc) suc.style.display = 'block';
          } else {
            toast('Failed to send. Please try again.', 'err');
            if (btn) { btn.disabled = false; btn.textContent = '보내기 →'; }
          }
        } catch(_) {
          toast('Network error. Please try again.', 'err');
          if (btn) { btn.disabled = false; btn.textContent = '보내기 →'; }
        }
      });
    }
  }

  // ── Pics ───────────────────────────────────────
  let lbIndex = 0, lbItems = [];

  function renderPics() {
    const pics = (S.data.pics||[]).filter(p => S.isAdmin || !p.hidden);
    const grid = ge('pics-grid');
    if (!grid) return;
    if (!pics.length) {
      grid.innerHTML = '<div class="loading-state" style="padding:40px;text-align:center;color:var(--text-dim)">' + (S.isAdmin ? 'No pics yet — click ✏️ to upload' : 'Nothing here yet') + '</div>';
    } else {
      grid.innerHTML = pics.map((p, i) => {
        const src = (p.images||[])[0] || '';
        const hb = p.hidden ? '<span class="hidden-badge">hidden</span>' : '';
        return '<div class="pic-item" onclick="App.openLightbox('+i+')"><img src="'+esc(src)+'" loading="lazy" alt="'+esc(p.caption||'')+'">'+hb+'</div>';
      }).join('');
    }
    const compose = ge('pics-compose');
    if (compose && !compose._bound) {
      compose._bound = true;
      attachImgInput(ge('pc-img-input'), ge('pc-img-wrap'), S.pendingPicsImgs);
      bindClick('pc-cancel', () => { compose.classList.remove('show'); S.pendingPicsImgs.length=0; const w=ge('pc-img-wrap'); if(w) w.innerHTML=''; const c=ge('pc-caption'); if(c) c.value=''; const t=ge('pc-tags'); if(t) t.value=''; });
      bindClick('pc-send', savePic);
    }
  }

  async function savePic() {
    if (!S.isAdmin) return;
    const caption = (ge('pc-caption')||{}).value || '';
    const picTags = (ge('pc-tags')||{}).value ? (ge('pc-tags').value.split(',').map(t=>t.trim()).filter(Boolean)) : [];
    const wrap = ge('pc-img-wrap');
    const imgDivs = wrap ? Array.from(wrap.querySelectorAll('.img-preview-item')) : [];
    if (!imgDivs.length) { toast('Upload at least one image', 'err'); return; }
    const btn = ge('pc-send'); if (btn) { btn.disabled=true; btn.textContent='Saving…'; }
    try {
      const images = [];
      for (const div of imgDivs) {
        if (div._file) { images.push(await uploadImage(div._file)); }
        else { const img = div.querySelector('img'); if (img) images.push(img.src); }
      }
      const pic = { id:'pic-'+Date.now(), caption, tags:picTags, images, timestamp: new Date().toISOString(), hidden: false };
      if (!S.data.pics) S.data.pics = [];
      S.data.pics.unshift(pic);
      await savePicsData('Add pic');
      ge('pics-compose').classList.remove('show');
      S.pendingPicsImgs.length=0;
      if (wrap) wrap.innerHTML='';
      if (ge('pc-caption')) ge('pc-caption').value='';
      if (ge('pc-tags'))    ge('pc-tags').value='';
      renderPics(); renderCounts();
      toast('Posted ✓', 'ok');
    } catch(e) { toast(e.message,'err'); }
    finally { if(btn){btn.disabled=false;btn.textContent='Post';} }
  }

  function openLightbox(i) {
    lbItems = (S.data.pics||[]).filter(p => S.isAdmin || !p.hidden);
    lbIndex = i; showLb();
    const lb = ge('pics-lightbox'); if (lb) lb.classList.add('show');
  }

  function showLb() {
    const p = lbItems[lbIndex]; if (!p) return;
    const img = ge('lb-img'); if (img) img.src = (p.images||[])[0]||'';
    const cap = ge('lb-caption'); if (cap) cap.textContent = p.caption||'';
    const lbTags = ge('lb-tags');
    if (lbTags) lbTags.innerHTML = (p.tags||[]).map(t=>'<span class="w-tag" onclick="App.searchTag(\''+encodeURIComponent(t)+'\')" style="cursor:pointer">'+esc(t)+'</span>').join('');
    const meta = ge('lb-meta'); if (meta) meta.textContent = fmtDate(p.timestamp);
    const prev = ge('lb-prev'); if (prev) prev.style.display = lbIndex>0?'':'none';
    const next = ge('lb-next'); if (next) next.style.display = lbIndex<lbItems.length-1?'':'none';
    const ab = ge('lb-admin-bar');
    if (ab) {
      ab.style.display = S.isAdmin ? 'flex' : 'none';
      if (S.isAdmin) {
        const hidLabel = p.hidden ? 'Make Public' : 'Hide';
        ab.innerHTML = '<button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="App.togglePicHidden(\''+p.id+'\')">'+( p.hidden?'👁️':'🔒')+' '+hidLabel+'</button><button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;color:var(--danger)" onclick="App.deletePic(\''+p.id+'\')">🗑️ Delete</button>';
      }
    }
  }

  function closeLightbox() { const lb=ge('pics-lightbox'); if(lb) lb.classList.remove('show'); }
  function lbNav(dir) { lbIndex=Math.max(0,Math.min(lbItems.length-1,lbIndex+dir)); showLb(); }

  async function deletePic(id) {
    if (!confirm('Delete this pic?')) return;
    S.data.pics = (S.data.pics||[]).filter(p=>p.id!==id);
    await savePicsData('Delete pic');
    closeLightbox(); renderPics(); renderCounts(); toast('Deleted','ok');
  }

  async function togglePicHidden(id) {
    const p = (S.data.pics||[]).find(x=>x.id===id); if (!p) return;
    p.hidden = !p.hidden;
    await savePicsData(p.hidden?'Hide pic':'Show pic');
    showLb(); renderPics(); renderCounts();
    toast(p.hidden?'🔒 Hidden':'👁️ Public','ok');
  }

  // ── Public/Hidden toggle for posts, reviews, writings ──
  async function toggleHidden(type, id) {
    const arr = S.data[type]||[];
    const item = arr.find(x=>x.id===id); if (!item) return;
    item.hidden = !item.hidden;
    const msg = (item.hidden?'Hide ':'Show ')+type;
    if (type==='posts')    { await savePostsData(msg);                        renderFeed();     renderCounts(); }
    if (type==='reviews')  { await saveReviewsData(item.category, msg);       renderReviews();  renderCounts(); }
    if (type==='writings') { await saveWritingsData(msg);                     renderWritings(); renderCounts(); }
    if (type==='pics')     { await savePicsData(msg);                         renderPics();     renderCounts(); }
    toast(item.hidden ? '🔒 Hidden' : '👁️ Public', 'ok');
  }

  // ── Bind all events ────────────────────────────

  // ── Search ─────────────────────────────────────────────────────

  function searchTag(tag) {
    const decoded = decodeURIComponent(tag);
    const si = ge('search-input');
    if (si) si.value = decoded;
    pushNav('search');
    runSearch(decoded);
  }

  function runSearch(query) {
    const out = ge('search-results'); if (!out) return;
    const q = (query || '').trim().toLowerCase();
    if (!q) { out.innerHTML = '<div class="search-empty">검색어를 입력하세요</div>'; return; }

    const results = [];

    // Posts
    S.data.posts.forEach(p => {
      if (!p.parentId && (p.content || '').toLowerCase().includes(q)) {
        const replies = S.data.posts.filter(x => x.threadId === p.threadId && x.parentId);
        results.push({ type: 'post', title: p.content.substring(0, 60), sub: replies.length + ' threads', id: p.threadId || p.id, ts: p.timestamp });
      }
    });

    // Reviews (search title + thread content)
    S.data.reviews.forEach(r => {
      const hit = (r.title || '').toLowerCase().includes(q) ||
        (r.threads || []).some(t => (t.content || '').toLowerCase().includes(q)) ||
        (r.tags||[]).some(t=>t.toLowerCase().includes(q));
      if (hit) results.push({ type: 'review', title: r.title, sub: CATS[r.category] ? CATS[r.category].emoji + ' ' + CATS[r.category].label : r.category, id: r.id, ts: r.timestamp, color: CATS[r.category] ? CATS[r.category].color : 'var(--text-dim)' });
    });

    // Writings
    S.data.writings.forEach(w => {
      const hit = (w.title || '').toLowerCase().includes(q) ||
        (w.content || '').toLowerCase().includes(q) ||
        (w.excerpt || '').toLowerCase().includes(q) ||
        (w.tags||[]).some(t=>t.toLowerCase().includes(q));
      if (hit) results.push({ type: 'writing', title: w.title, sub: (w.tags || []).join(' · '), id: w.id, ts: w.timestamp });
    });

    // Pics
    S.data.pics.forEach(p => {
      const hit = (p.caption || '').toLowerCase().includes(q) ||
        (p.tags||[]).some(t=>t.toLowerCase().includes(q));
      if (hit) results.push({ type: 'pic', title: p.caption || '(no caption)', sub: (p.tags||[]).join(' · '), id: p.id, ts: p.timestamp, thumb: (p.images||[])[0] });
    });

    // Reviews — also search tags
    // (already done above but re-check for tag-only hits)
    // Reviews already includes tag search via threads content; let's ensure tags are included:

    results.sort((a, b) => new Date(b.ts) - new Date(a.ts));

    if (!results.length) { out.innerHTML = '<div class="search-empty">결과 없음</div>'; return; }

    out.innerHTML = results.map(r => {
      const icon = r.type === 'post' ? '🏠' : r.type === 'review' ? '📋' : '🖊️';
      const dot = r.color ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + r.color + ';margin-right:5px;flex-shrink:0"></span>' : '';
      const action = r.type === 'post'
        ? 'App.openFeedThread(\'' + r.id + '\')'
        : r.type === 'review'
        ? 'App.goToReview(\'' + r.id + '\')'
        : r.type === 'writing'
        ? 'App.goToWriting(\'' + r.id + '\')'
        : 'App.pushNav(\'pics\')';
      const thumb = r.thumb ? '<img src="'+esc(r.thumb)+'" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0"> ' : '';
      return '<div class="search-result-item" onclick="' + action + '">'
        + '<div class="sr-type">' + icon + ' ' + r.type.charAt(0).toUpperCase() + r.type.slice(1) + '</div>'
        + '<div class="sr-title" style="align-items:flex-start">' + thumb + dot + esc(r.title) + '</div>'
        + (r.sub ? '<div class="sr-sub">' + esc(r.sub) + '</div>' : '')
        + '<div class="sr-date">' + fmtDate(r.ts) + '</div>'
        + '</div>';
    }).join('');
  }

  function bindGlobal() {
    // Browser back/forward
    window.addEventListener('popstate', (e) => {
      const sec = (e.state && e.state.sec) || 'home';
      // restore sub-state if needed
      if (S.feedView === 'thread') closeFeedThread();
      if (S.reviewView === 'detail') closeReview();
      if (S.writingView === 'detail') closeWriting();
      _renderSection(sec);
    });

    bindClick('nav-home',     ()=>{ pushNav('home'); });
    bindClick('nav-reviews',  ()=>{pushNav('reviews');const s=ge('review-subnav');if(s)s.classList.add('open');});
    bindClick('nav-writings', ()=>pushNav('writings'));
    bindClick('nav-pics',     ()=>pushNav('pics'));
    bindClick('nav-guestbook',()=>pushNav('guestbook'));
    bindClick('nav-search',    ()=>pushNav('search'));
    document.querySelectorAll('.sub-item').forEach(item=>{ item.onclick=()=>{S.reviewCat=item.dataset.cat;pushNav('reviews');}; });
    document.querySelectorAll('.cat-pill').forEach(pill=>{ pill.onclick=()=>{S.reviewCat=pill.dataset.cat;renderReviews();}; });
    bindClick('admin-btn',   openAdminModal);

    // Search
    const si = ge('search-input');
    if (si) {
      si.addEventListener('input', () => runSearch(si.value));
      si.addEventListener('keydown', e => { if (e.key === 'Escape') { si.value = ''; runSearch(''); } });
    }
    bindClick('search-clear', () => { if (si) { si.value = ''; si.focus(); } runSearch(''); });

    // Scroll top / bottom
    bindClick('scroll-top-btn', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    bindClick('scroll-bot-btn', () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    bindClick('m-save',      saveAdmin);
    bindClick('m-cancel',    closeAdminModal);
    const modal=ge('admin-modal'); if(modal) modal.onclick=e=>{if(e.target===modal)closeAdminModal();};
    bindClick('fab', fabAction);
    bindClick('send-btn',         sendPost);
    bindClick('cancel-btn',       cancelCompose);
    bindClick('feed-thread-back', closeFeedThread);
    const ta=ge('compose-ta');
    if(ta){ta.addEventListener('input',updateCC);ta.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')sendPost();});}
    const rb=ge('cancel-reply'); if(rb) rb.onclick=()=>{S.replyTo=null;if(ge('reply-banner'))ge('reply-banner').style.display='none';};
    attachImgInput(ge('image-input'),ge('image-preview-wrap'),S.pendingFeedImgs);
    bindClick('rc-send',       sendReview);
    bindClick('rc-cancel',     closeReviewCompose);
    bindClick('rc-add-thread', addThreadEntry);
    const rcWrap=ge('rc-threads-wrap');
    if(rcWrap){rcWrap.addEventListener('change',e=>{const input=e.target.closest('.rc-img-input');if(!input)return;const entry=input.closest('.rc-thread-entry');const wrap=entry&&entry.querySelector('.rc-img-wrap');if(!wrap)return;Array.from(input.files||[]).forEach(f=>{if(f.size>10*1024*1024){toast('Max 10MB','err');return;}const reader=new FileReader();reader.onload=ev=>{const div=document.createElement('div');div.className='img-preview-item';div._file=f;div.innerHTML='<img src="'+ev.target.result+'"><button type="button">✕</button>';div.querySelector('button').onclick=()=>div.remove();wrap.appendChild(div);};reader.readAsDataURL(f);});input.value='';});}
    bindClick('wc-send',   sendWriting);
    bindClick('wc-cancel', closeWritingCompose);
    attachImgInput(ge('wc-img-input'),ge('wc-img-wrap'),S.pendingWritingImgs);
  }

  // ── Init ───────────────────────────────────────
  function init() {
    bindGlobal();
    loadCreds();
    loadData();
  }

  return {
    init,
    openFeedThread, closeFeedThread, editPost, deletePost, replyPost, removeFeedImg,
    goToReview, goToWriting,
    openReview, closeReview, editReview, deleteReview, runSearch, searchTag, pushNav,
    openMobileNav, closeMobileNav, mobileNav,
    openWriting, closeWriting, editWriting, deleteWriting,
    openLightbox, closeLightbox, lbNav, deletePic, togglePicHidden, toggleHidden,
    feedPageNav, toggleThreadMore,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
