import { Hono } from 'hono';
import {
  getIssueBySlug,
  getIssuePortalByToken,
  listPublishedIssues,
  listGalleryImages,
  listIssueSubmissionsForPortal,
} from '../lib/db';
import type { Env } from '../types/bindings';

const styles = `:root { color-scheme: light dark; }
body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
a { color: #38bdf8; }
header { padding: 3rem 1.5rem 2rem; text-align: center; background: radial-gradient(circle at top, rgba(56,189,248,0.35), transparent 60%); }
main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
.issue-card { border: 1px solid rgba(148,163,184,0.25); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.25rem; background: rgba(15,23,42,0.65); box-shadow: 0 18px 55px rgba(15,23,42,0.45); transition: transform 0.2s ease, box-shadow 0.2s ease; }
.issue-card:hover { transform: translateY(-4px); box-shadow: 0 26px 70px rgba(15,23,42,0.6); }
.issue-card h2 { margin-top: 0; }
.badge { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; background: rgba(30,64,175,0.6); color: #bfdbfe; padding: 0.35rem 0.75rem; border-radius: 999px; }
.grid { display: grid; gap: 1.5rem; }
@media (min-width: 768px) { .grid { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); } }
.gallery { display: grid; gap: 1rem; }
@media (min-width: 768px) { .gallery { grid-template-columns: repeat(3, 1fr); } }
.gallery figure { background: rgba(15,23,42,0.55); border-radius: 1rem; overflow: hidden; margin: 0; border: 1px solid rgba(51,65,85,0.6); box-shadow: 0 12px 30px rgba(8,47,73,0.35); }
.gallery img { display: block; width: 100%; height: auto; object-fit: cover; }
.gallery figcaption { padding: 0.75rem 1rem; font-size: 0.85rem; color: rgba(226,232,240,0.85); }
.gallery-layout { min-height: 100vh; display: flex; background: linear-gradient(145deg, rgba(15,23,42,0.95), rgba(8,47,73,0.92)); }
.gallery-sidebar { width: 280px; padding: 2.5rem 2rem; background: rgba(10,21,38,0.85); border-right: 1px solid rgba(30,64,175,0.25); display: flex; flex-direction: column; gap: 2.5rem; position: sticky; top: 0; min-height: 100vh; }
.gallery-brand { display: flex; flex-direction: column; gap: 1.25rem; }
.gallery-logo { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #facc15, #fb7185); color: #0f172a; display: grid; place-items: center; font-size: 1.65rem; font-weight: 700; box-shadow: 0 18px 38px rgba(248,113,113,0.35); }
.gallery-brand h1 { margin: 0; font-size: 1.85rem; letter-spacing: 0.05em; }
.gallery-brand p { margin: 0; color: rgba(226,232,240,0.7); line-height: 1.6; }
.gallery-nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.gallery-nav a { display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.75rem 1rem; border-radius: 0.85rem; text-decoration: none; color: rgba(226,232,240,0.78); background: transparent; border: 1px solid transparent; transition: all 0.2s ease; font-weight: 500; letter-spacing: 0.01em; }
.gallery-nav a:hover { background: rgba(56,189,248,0.12); border-color: rgba(56,189,248,0.35); color: rgba(224,242,254,0.95); transform: translateX(4px); }
.gallery-nav a.is-active { background: rgba(248,250,252,0.92); color: #0f172a; border-color: transparent; box-shadow: 0 18px 40px rgba(148,163,184,0.35); }
.gallery-social { display: flex; gap: 0.75rem; }
.gallery-social a { width: 38px; height: 38px; border-radius: 999px; display: grid; place-items: center; background: rgba(15,23,42,0.65); border: 1px solid rgba(148,163,184,0.25); color: rgba(226,232,240,0.85); text-decoration: none; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.06em; transition: transform 0.2s ease, background 0.2s ease; }
.gallery-social a:hover { background: rgba(56,189,248,0.28); transform: translateY(-2px); color: #0f172a; }
.gallery-sidebar small { color: rgba(148,163,184,0.7); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
.gallery-main { flex: 1; padding: 3rem 3rem 4rem; max-width: 1100px; width: 100%; margin: 0 auto; }
.gallery-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; margin-bottom: 2.5rem; }
.gallery-header h1 { margin: 0; font-size: clamp(2.2rem, 4vw, 3rem); letter-spacing: 0.03em; }
.gallery-header p { margin: 0.5rem 0 0; color: rgba(148,163,184,0.85); max-width: 520px; line-height: 1.7; }
.gallery-pill-group { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.gallery-pill { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.9rem; border-radius: 999px; border: 1px solid rgba(56,189,248,0.35); background: rgba(56,189,248,0.15); color: rgba(224,242,254,0.9); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; }
.gallery-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.gallery-card { background: rgba(15,23,42,0.65); border: 1px solid rgba(51,65,85,0.45); border-radius: 1.35rem; overflow: hidden; box-shadow: 0 16px 40px rgba(8,47,73,0.38); transition: transform 0.25s ease, box-shadow 0.25s ease; display: flex; flex-direction: column; }
.gallery-card:hover { transform: translateY(-6px); box-shadow: 0 26px 55px rgba(8,47,73,0.55); }
.gallery-image { position: relative; overflow: hidden; }
.gallery-image::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgba(15,23,42,0.45)); opacity: 0; transition: opacity 0.25s ease; }
.gallery-card:hover .gallery-image::after { opacity: 1; }
.gallery-image img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
.gallery-card:hover .gallery-image img { transform: scale(1.05); }
.gallery-card:nth-child(3n+1) .gallery-image img { aspect-ratio: 4 / 5; }
.gallery-card:nth-child(3n+2) .gallery-image img { aspect-ratio: 5 / 4; }
.gallery-card:nth-child(3n) .gallery-image img { aspect-ratio: 1; }
.gallery-card figcaption { padding: 1rem 1.25rem 1.2rem; display: flex; flex-direction: column; gap: 0.45rem; }
.gallery-caption-title { font-weight: 600; font-size: 1rem; color: rgba(248,250,252,0.95); }
.gallery-caption-meta { color: rgba(148,163,184,0.85); font-size: 0.85rem; }
.gallery-caption-link { font-size: 0.85rem; color: #38bdf8; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem; }
.gallery-caption-link:hover { text-decoration: underline; }
.gallery-empty { padding: 3rem; border-radius: 1.25rem; border: 1px dashed rgba(148,163,184,0.35); background: rgba(15,23,42,0.35); text-align: center; color: rgba(148,163,184,0.85); font-size: 0.95rem; line-height: 1.8; }
@media (max-width: 960px) { .gallery-layout { flex-direction: column; } .gallery-sidebar { position: static; width: 100%; min-height: auto; border-right: none; border-bottom: 1px solid rgba(30,64,175,0.25); padding: 2rem 1.5rem; } .gallery-nav ul { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); } .gallery-main { padding: 2.5rem 1.5rem 3rem; } }
@media (max-width: 640px) { .gallery-nav ul { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); } .gallery-header { flex-direction: column; align-items: flex-start; } .gallery-pill-group { width: 100%; } }
.admin-container { max-width: 1080px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
.card { background: rgba(15,23,42,0.65); border-radius: 1rem; padding: 1.5rem; border: 1px solid rgba(51,65,85,0.5); box-shadow: 0 15px 40px rgba(8,47,73,0.4); margin-bottom: 1.5rem; }
button, input, select, textarea { font: inherit; border-radius: 0.75rem; border: 1px solid rgba(148,163,184,0.3); padding: 0.65rem 1rem; background: rgba(15,23,42,0.5); color: #e2e8f0; }
button { cursor: pointer; background: linear-gradient(120deg, #38bdf8, #6366f1); border: none; color: #0f172a; font-weight: 600; box-shadow: 0 10px 25px rgba(56,189,248,0.35); }
button:hover { box-shadow: 0 16px 32px rgba(99,102,241,0.35); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.65rem 0.75rem; border-bottom: 1px solid rgba(71,85,105,0.4); text-align: left; }
th { font-size: 0.85rem; color: rgba(148,163,184,0.85); }
.admin-grid { display: grid; gap: 1.5rem; }
@media (min-width: 1024px) { .admin-grid { grid-template-columns: 2fr 1fr; } }
.toast { position: fixed; bottom: 2rem; right: 2rem; background: rgba(15,23,42,0.95); padding: 1rem 1.25rem; border-radius: 0.75rem; border: 1px solid rgba(37,99,235,0.4); display: none; }
`;

const adminScript = `<script type="module">
const tokenInput = document.getElementById('admin-token');
const saveBtn = document.getElementById('save-token');
const clearBtn = document.getElementById('clear-token');
const statusEl = document.getElementById('token-status');
const submissionsContainer = document.getElementById('submissions');
const auditContainer = document.getElementById('audit-logs');
const issueForm = document.getElementById('issue-form');
const toast = document.getElementById('toast');

if (!tokenInput || !saveBtn || !clearBtn || !statusEl || !submissionsContainer || !auditContainer || !issueForm || !toast) {
  console.warn('Admin dashboard failed to initialize due to missing elements');
} else {
  let token = localStorage.getItem('filmweekly-admin-token') || '';

  if (token) {
    tokenInput.value = token;
    statusEl.textContent = '已加载令牌，正在同步数据…';
    refreshAll();
  }

  saveBtn.addEventListener('click', () => {
    token = tokenInput.value.trim();
    if (!token) {
      statusEl.textContent = '请填写 token';
      return;
    }
    localStorage.setItem('filmweekly-admin-token', token);
    statusEl.textContent = '令牌已保存，开始同步数据…';
    refreshAll();
  });

  clearBtn.addEventListener('click', () => {
    token = '';
    tokenInput.value = '';
    localStorage.removeItem('filmweekly-admin-token');
    submissionsContainer.innerHTML = '';
    auditContainer.innerHTML = '';
    statusEl.textContent = '令牌已清除';
  });

  issueForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(issueForm);
    const payload = {};
    formData.forEach((value, key) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }
        if (key === 'publishAt' || key === 'submissionDeadline') {
          const date = new Date(trimmed);
          if (!Number.isNaN(date.getTime())) {
            payload[key] = date.toISOString();
          }
          return;
        }
        payload[key] = trimmed;
        return;
      }
      payload[key] = value;
    });

    try {
      const response = await apiFetch('/api/issues', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      let message = '期刊创建成功';
      if (response && typeof response === 'object' && 'data' in response && response.data) {
        const data = response.data;
        if (data && typeof data === 'object' && 'portal_token' in data && data.portal_token) {
          try {
            const url = new URL('/submit/' + data.portal_token, window.location.origin);
            message = '期刊创建成功，投稿链接：' + url.toString();
          } catch (err) {
            message = '期刊创建成功，投稿口令：' + data.portal_token;
          }
        }
      }
      showToast(message);
      issueForm.reset();
      await refreshAll();
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? error.message : null;
      showToast(message || '创建失败');
    }
  });

  async function apiFetch(path, options) {
    if (!token) {
      throw new Error('请先保存管理员 token');
    }
    const response = await fetch(path, {
      method: options && options.method ? options.method : 'GET',
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        options && options.headers ? options.headers : {}
      ),
      body: options && options.body ? options.body : undefined,
    });

    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch (err) {
        console.warn('Failed to parse error payload', err);
      }
      throw new Error((data && data.error) || response.statusText);
    }

    return response.json();
  }

  async function refreshAll() {
    try {
      const [submissions, auditLogs] = await Promise.all([
        apiFetch('/api/submissions'),
        apiFetch('/api/admin/audit-logs'),
      ]);
      renderSubmissions(Array.isArray(submissions.data) ? submissions.data : []);
      renderAuditLogs(Array.isArray(auditLogs.data) ? auditLogs.data : []);
      statusEl.textContent = '数据已更新';
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? error.message : null;
      statusEl.textContent = message || '同步失败';
    }
  }

  function renderSubmissions(items) {
    submissionsContainer.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('p');
      empty.style.color = 'rgba(148,163,184,0.8)';
      empty.textContent = '暂无待处理投稿。';
      submissionsContainer.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'card';
      article.style.background = 'rgba(8,47,73,0.4)';

      const heading = document.createElement('h3');
      heading.style.marginTop = '0';
      heading.textContent = item && item.title ? item.title : '未命名投稿';
      article.appendChild(heading);

      const meta = document.createElement('p');
      meta.style.color = 'rgba(148,163,184,0.8)';
      meta.style.fontSize = '0.9rem';
      meta.textContent =
        '作者：' +
        (item && item.author_name ? item.author_name : '匿名') +
        ' ｜ 期刊：' +
        (item && item.issue_title ? item.issue_title : '未知期刊');
      article.appendChild(meta);

      const status = document.createElement('p');
      status.style.color = 'rgba(148,163,184,0.75)';
      status.textContent =
        '投稿状态：' +
        (item && item.status ? item.status : 'pending') +
        ' ｜ 审核：' +
        (item && item.moderation_status ? item.moderation_status : 'pending');
      article.appendChild(status);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '0.5rem';
      actions.style.marginTop = '0.75rem';
      actions.style.flexWrap = 'wrap';

      const decisions = [
        { action: 'approve', label: '通过', background: null },
        { action: 'needs-revision', label: '修改', background: 'rgba(234,179,8,0.85)' },
        { action: 'rejected', label: '拒绝', background: 'rgba(239,68,68,0.85)' },
      ];

      decisions.forEach((decision) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = decision.action;
        button.dataset.id = String(item && item.id ? item.id : '');
        button.textContent = decision.label;
        if (decision.background) {
          button.style.background = decision.background;
          button.style.color = '#0f172a';
        }
        button.addEventListener('click', async () => {
          if (!button.dataset.id) {
            return;
          }
          try {
            await apiFetch('/api/submissions/' + button.dataset.id + '/review', {
              method: 'POST',
              body: JSON.stringify({ decision: decision.action }),
            });
            showToast('审核已提交');
            await refreshAll();
          } catch (error) {
            const message = error && typeof error === 'object' && 'message' in error ? error.message : null;
            showToast(message || '审核失败');
          }
        });
        actions.appendChild(button);
      });

      article.appendChild(actions);
      submissionsContainer.appendChild(article);
    });
  }

  function renderAuditLogs(items) {
    auditContainer.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = '暂无记录';
      auditContainer.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const entry = document.createElement('div');
      const actor = item && item.actor ? item.actor : 'unknown';
      const action = item && item.action ? item.action : '未知操作';
      const entity = item && item.entity ? item.entity : 'entity';
      const entityId = item && item.entity_id ? item.entity_id : '-';
      const createdAt = item && item.created_at ? item.created_at : '';
      entry.textContent = '· [' + createdAt + '] ' + actor + ' → ' + action + ' (' + entity + '#' + entityId + ')';
      auditContainer.appendChild(entry);
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 2200);
  }
}
</script>`;


function layout(title: string, body: string, extraHead = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${title}</title><style>${styles}</style>${extraHead}</head><body>${body}</body></html>`;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function toMediaPath(key: string) {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export const pagesRoute = new Hono<{ Bindings: Env }>();

pagesRoute.get('/', async (c) => {
  let issues: Array<Record<string, any>> = [];
  try {
    issues = (await listPublishedIssues(c.env)) as Array<Record<string, any>>;
  } catch (error) {
    console.error('Failed to load published issues', error);
  }

  const issueCards = issues.length
    ? issues
        .map(
          (issue) => `
              <article class="issue-card">
                <div class="badge">第 ${issue.slug} 期 · ${formatDate(issue.publish_at as string | null)}</div>
                <h2><a href="/issues/${issue.slug}" style="color: inherit; text-decoration: none;">${issue.title}</a></h2>
                <p style="color: rgba(226,232,240,0.75); line-height: 1.6;">${issue.summary ?? ''}</p>
                <p style="margin-top: 1rem; color: rgba(148,163,184,0.75); font-size: 0.9rem;">导向语：${issue.guidance}</p>
                <a href="/issues/${issue.slug}" style="display:inline-flex; gap:0.4rem; align-items:center; margin-top:1.2rem; font-weight:600;">查看详情 →</a>
              </article>
            `,
        )
        .join('')
    : '<p style="color: rgba(148,163,184,0.8);">暂无已发布的期刊，敬请期待后续更新。</p>';
  const body = `
    <header>
      <h1 style="font-size: clamp(2rem, 4vw, 3rem); margin-bottom: 0.75rem;">FilmWeekly 胶片摄影期刊</h1>
      <p style="max-width: 660px; margin: 0 auto; color: rgba(148,163,184,0.85); font-size: 1.05rem;">每周精选来自全球胶片摄影师的投稿，展现光影与颗粒感的独特魅力。浏览已发布的期刊，探索更多故事。</p>
    </header>
    <main>
      <section class="grid">
        ${issueCards}
      </section>
    </main>
  `;
  return c.html(layout('FilmWeekly', body));
});

pagesRoute.get('/gallery', async (c) => {
  let images: Array<Record<string, any>> = [];
  try {
    images = (await listGalleryImages(c.env)) as Array<Record<string, any>>;
  } catch (error) {
    console.error('Failed to load gallery images', error);
  }
  const validImages = images.filter((image) => {
    const record = image as Record<string, any>;
    return typeof record.thumbnail_key === 'string' && record.thumbnail_key.length > 0;
  });
  const totalImages = validImages.length;
  const galleryItems = validImages
    .map((image) => {
      const record = image as Record<string, any>;
      const title = (record.submission_title as string | null) ?? '未命名作品';
      const author = (record.author_name as string | null) ?? '匿名摄影师';
      const issueTitle = (record.issue_title as string | null) ?? '';
      const issueSlug = (record.issue_slug as string | null) ?? '';
      const originalName = (record.original_name as string | null) ?? title;
      const issueMeta = issueTitle ? ` · ${issueTitle}` : '';
      const issueLink = issueSlug
        ? `<a class="gallery-caption-link" href="/issues/${issueSlug}">查看期刊 →</a>`
        : '';
      return `
        <figure class="gallery-card">
          <div class="gallery-image">
            <img src="/media/${toMediaPath(record.thumbnail_key as string)}" alt="${originalName}" loading="lazy" />
          </div>
          <figcaption>
            <span class="gallery-caption-title">${title}</span>
            <span class="gallery-caption-meta">${author}${issueMeta}</span>
            ${issueLink}
          </figcaption>
        </figure>
      `;
    })
    .join('');

  const body = `
    <div class="gallery-layout">
      <aside class="gallery-sidebar">
        <div class="gallery-brand">
          <div class="gallery-logo">📷</div>
          <h1>Capture</h1>
          <p>FilmWeekly 画廊收录了我们最钟爱的胶片瞬间。留在这里，随时捕捉灵感。</p>
        </div>
        <nav class="gallery-nav" aria-label="主要导航">
          <ul>
            <li><a href="/">首页</a></li>
            <li><a href="/gallery" class="is-active">作品画廊</a></li>
            <li><a href="https://github.com/lex/FilmWeekly#readme" target="_blank" rel="noopener">关于</a></li>
            <li><a href="https://github.com/lex/FilmWeekly" target="_blank" rel="noopener">博客</a></li>
            <li><a href="mailto:hello@filmweekly.test">联系</a></li>
          </ul>
        </nav>
        <div>
          <small>FOLLOW US</small>
          <div class="gallery-social">
            <a href="https://instagram.com" target="_blank" rel="noopener" aria-label="Instagram">IG</a>
            <a href="https://weibo.com" target="_blank" rel="noopener" aria-label="Weibo">WB</a>
            <a href="mailto:hello@filmweekly.test" aria-label="Email">✉</a>
          </div>
        </div>
      </aside>
      <main class="gallery-main">
        <header class="gallery-header">
          <div>
            <div class="gallery-pill-group">
              <span class="gallery-pill">精选作品</span>
              <span class="gallery-pill">胶片质感</span>
            </div>
            <h1>胶片摄影作品画廊</h1>
            <p>沉浸式浏览来自社区投稿的胶片摄影作品。每一帧都是光影与颗粒的交织，呈现真实的模拟质感。</p>
          </div>
          <div class="gallery-pill-group">
            <span class="gallery-pill">${totalImages} 张作品</span>
            <span class="gallery-pill">每周更新</span>
          </div>
        </header>
        ${
          totalImages
            ? `<section class="gallery-grid">${galleryItems}</section>`
            : '<div class="gallery-empty">暂时还没有可以展示的作品。欢迎稍后再来，或前往首页查看最新一期的胶片期刊。</div>'
        }
      </main>
    </div>
  `;

  return c.html(layout('作品画廊 · FilmWeekly', body));
});

pagesRoute.get('/issues/:slug', async (c) => {
  const slug = c.req.param('slug');
  const issue = await getIssueBySlug(c.env, slug);
  if (!issue) {
    return c.notFound();
  }

  const issueRecord = issue as Record<string, any>;
  const submissions = Array.isArray(issueRecord.submissions)
    ? (issueRecord.submissions as Array<Record<string, any>>)
    : [];

  const body = `
    <header>
      <a href="/" style="display:inline-flex; align-items:center; gap:0.5rem; color: rgba(148,163,184,0.85);">← 返回首页</a>
      <h1 style="font-size: clamp(2rem, 4vw, 3rem); margin-bottom: 0.5rem;">${issueRecord.title}</h1>
      <div class="badge">发布日期：${formatDate(issueRecord.publish_at as string | null)}</div>
      <p style="max-width: 680px; margin: 1.5rem auto 0; color: rgba(226,232,240,0.75); line-height: 1.7;">${issueRecord.summary ?? ''}</p>
      <p style="max-width: 680px; margin: 1rem auto 0; color: rgba(148,163,184,0.85);">导向语：${issueRecord.guidance}</p>
    </header>
    <main>
      ${submissions.length
        ? submissions
            .map((submission) => `
              <section class="card">
                <h2 style="margin-top:0;">${submission.title}</h2>
                <p style="color: rgba(148,163,184,0.85); margin-top: 0.2rem;">作者：${submission.author_name ?? '匿名'}</p>
                ${submission.description ? `<p style="line-height:1.6; color: rgba(226,232,240,0.78);">${submission.description}</p>` : ''}
                ${Array.isArray(submission.images) && submission.images.length
                  ? `<div class="gallery">${submission.images
                      .map(
                        (image: any) => `
                          <figure>
                            <img src="/media/${toMediaPath(image.thumbnail_key)}" alt="${image.original_name ?? submission.title}" loading="lazy" />
                            <figcaption>${image.original_name ?? ''}</figcaption>
                          </figure>
                        `,
                      )
                      .join('')}</div>`
                  : ''}
              </section>
            `)
            .join('')
        : '<p style="color: rgba(148,163,184,0.8);">该期刊暂未发布公开作品。</p>'}
    </main>
  `;
  return c.html(layout(`${issueRecord.title} · FilmWeekly`, body));
});

pagesRoute.get('/submit/:token', async (c) => {
  const token = c.req.param('token');
  if (!token) {
    return c.html(
      layout(
        '投稿入口不可用 · FilmWeekly',
        '<main style="padding:4rem 1.5rem; text-align:center;">缺少投稿口令。</main>',
      ),
      400,
    );
  }

  const portal = await getIssuePortalByToken(c.env, token);
  if (!portal) {
    return c.html(
      layout(
        '投稿入口不可用 · FilmWeekly',
        '<main style="padding:4rem 1.5rem; text-align:center;">未找到对应的投稿入口。</main>',
      ),
      404,
    );
  }

  const issueId = portal.issue_id as number;
  const submissions = await listIssueSubmissionsForPortal(c.env, issueId);
  const issueTitle = (portal.issue_title as string | null) ?? '匿名投稿';
  const summary = (portal.summary as string | null) ?? '';
  const guidance = (portal.guidance as string | null) ?? '';
  const deadline = portal.submission_deadline as string | null;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const submissionClosed = deadlineDate
    ? !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now()
    : false;
  const deadlineLabel = deadline ? formatDate(deadline) || deadline : '未设置';
  const votingOpen = submissionClosed;

  const portalPayload = {
    portal: { token: portal.token, createdAt: portal.created_at },
    issue: {
      id: issueId,
      slug: portal.issue_slug,
      title: issueTitle,
      summary,
      guidance,
      publishAt: portal.publish_at,
      submissionDeadline: deadline,
      status: portal.issue_status,
    },
    voting: {
      isOpen: votingOpen,
      limitPerIp: 5,
    },
    submissions,
  };

  const portalData = JSON.stringify(portalPayload).replace(/</g, '\\u003c');
  const initialDeadlineText = submissionClosed
    ? `投稿已于 ${deadlineLabel} 截止`
    : `投稿截止：${deadlineLabel}`;

  const scriptParts: string[] = [];
  scriptParts.push('<script type="module">(() => {');
  scriptParts.push(`const initialState = ${portalData};`);
  scriptParts.push('let portalState = initialState;');
  scriptParts.push("const form = document.getElementById('portal-form');");
  scriptParts.push("const fileInput = document.getElementById('portal-images');");
  scriptParts.push("const statusEl = document.getElementById('portal-status');");
  scriptParts.push("const deadlineEl = document.getElementById('portal-deadline');");
  scriptParts.push("const submissionsEl = document.getElementById('portal-submissions');");
  scriptParts.push("const votingNotice = document.getElementById('portal-voting-notice');");
  scriptParts.push("const refreshBtn = document.getElementById('portal-refresh');");
  scriptParts.push("const submitBtn = document.getElementById('portal-submit');");
  scriptParts.push('if (!form || !fileInput || !statusEl || !deadlineEl || !submissionsEl || !votingNotice || !refreshBtn || !submitBtn) { console.warn("Portal page failed to initialize"); return; }');
  scriptParts.push('render(portalState);');
  scriptParts.push('refreshBtn.addEventListener("click", () => refreshPortal());');
  scriptParts.push('form.addEventListener("submit", (event) => submitEntry(event));');
  scriptParts.push('async function refreshPortal() { try { const res = await fetch("/api/portals/" + encodeURIComponent(portalState.portal.token)); const payload = await res.json().catch(() => null); if (!res.ok || !payload || !payload.data) throw new Error((payload && payload.error) || "刷新失败"); portalState = payload.data; render(portalState); } catch (error) { const message = error && typeof error === "object" && "message" in error ? error.message : null; setStatus(message || "刷新失败", "error"); } }');
  scriptParts.push('function render(state) { updateDeadline(state.issue.submissionDeadline); updateVoting(state.voting); renderSubmissions(Array.isArray(state.submissions) ? state.submissions : []); }');
  scriptParts.push('function updateDeadline(deadline) { if (!deadline) { deadlineEl.textContent = "投稿截止：未设置（长期开放）"; deadlineEl.style.color = "rgba(148,163,184,0.85)"; toggleForm(true); return; } const time = new Date(deadline); const closed = !Number.isNaN(time.getTime()) && time.getTime() < Date.now(); const formatted = new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "short" }).format(time); deadlineEl.textContent = closed ? "投稿已于 " + formatted + " 截止" : "投稿截止：" + formatted; deadlineEl.style.color = closed ? "#f87171" : "rgba(148,163,184,0.85)"; toggleForm(!closed); }');
  scriptParts.push('function toggleForm(enabled) { Array.from(form.elements).forEach((el) => { if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) { if (el instanceof HTMLButtonElement && el.type === "button") { el.disabled = false; } else { el.disabled = !enabled; } if (el instanceof HTMLButtonElement && el.type === "submit") { el.textContent = enabled ? "提交作品" : "投稿已截止"; } } }); if (!enabled) { setStatus("投稿已截止，感谢你的关注。", "warning"); } else { setStatus("", "info"); } }');
  scriptParts.push('function updateVoting(voting) { if (!voting || !voting.isOpen) { if (portalState.issue.submissionDeadline) { votingNotice.textContent = "投票将在投稿截止后开放。"; } else { votingNotice.textContent = "当前期刊暂未启用投票。"; } return; } votingNotice.textContent = "投票已开放，每个 IP 最多 " + voting.limitPerIp + " 票，每个作品仅可投一次。"; }');
  scriptParts.push('function renderSubmissions(items) { submissionsEl.innerHTML = ""; if (!items.length) { const empty = document.createElement("p"); empty.textContent = "尚无公开作品，期待你的投稿。"; empty.style.color = "rgba(148,163,184,0.85)"; submissionsEl.appendChild(empty); return; } items.forEach((item) => { const card = document.createElement("article"); card.className = "card"; card.style.background = "rgba(8,47,73,0.45)"; const title = document.createElement("h3"); title.textContent = item && item.title ? item.title : "未命名作品"; title.style.marginTop = "0"; card.appendChild(title); const author = document.createElement("p"); author.textContent = "作者：" + (item && item.author_name ? item.author_name : "匿名"); author.style.color = "rgba(148,163,184,0.85)"; author.style.marginTop = "0.2rem"; card.appendChild(author); if (item && item.description) { const desc = document.createElement("p"); desc.textContent = item.description; desc.style.color = "rgba(226,232,240,0.78)"; desc.style.lineHeight = "1.6"; card.appendChild(desc); } const footer = document.createElement("div"); footer.style.display = "flex"; footer.style.justifyContent = "space-between"; footer.style.alignItems = "center"; footer.style.marginTop = "0.75rem"; const votes = document.createElement("span"); votes.textContent = "当前票数：" + (item && item.vote_count != null ? item.vote_count : 0); votes.style.color = "rgba(148,163,184,0.85)"; footer.appendChild(votes); const button = document.createElement("button"); button.type = "button"; button.textContent = "投票"; button.disabled = !portalState.voting || !portalState.voting.isOpen; button.addEventListener("click", () => voteFor(item.id, button)); footer.appendChild(button); card.appendChild(footer); submissionsEl.appendChild(card); }); }');
  scriptParts.push('async function voteFor(submissionId, button) { if (!portalState.voting || !portalState.voting.isOpen) { setStatus("投票尚未开放", "warning"); return; } button.disabled = true; try { const res = await fetch("/api/submissions/" + submissionId + "/votes", { method: "POST" }); const payload = await res.json().catch(() => null); if (!res.ok || !payload || !payload.data) throw new Error((payload && payload.error) || "投票失败"); const remaining = payload.data.remainingVotes; setStatus("投票成功" + (typeof remaining === "number" ? "，剩余票数：" + remaining : ""), "success"); await refreshPortal(); } catch (error) { const message = error && typeof error === "object" && "message" in error ? error.message : null; setStatus(message || "投票失败", "error"); } finally { button.disabled = false; } }');
  scriptParts.push('async function submitEntry(event) { event.preventDefault(); if (!fileInput.files || !fileInput.files.length) { setStatus("请至少选择一张图片（单张文件需大于 10MB）", "error"); return; } const formData = new FormData(form); const payload = { portalToken: portalState.portal.token, issueId: portalState.issue.id, title: "", images: [] }; formData.forEach((value, key) => { if (key === "images") return; if (typeof value === "string") { const trimmed = value.trim(); if (!trimmed) return; if (key === "title") { payload.title = trimmed; } else if (key === "authorName" || key === "authorContact" || key === "location" || key === "shotAt" || key === "equipment" || key === "description") { payload[key] = trimmed; } } }); if (!payload.title) { setStatus("请填写作品标题", "error"); return; } submitBtn.disabled = true; try { const files = Array.from(fileInput.files); const images = []; let index = 0; for (const file of files) { index += 1; setStatus("正在上传第 " + index + " 张图片…", "info"); const image = await uploadImage(file); images.push(image); } payload.images = images; setStatus("正在提交投稿…", "info"); const res = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const responsePayload = await res.json().catch(() => null); if (!res.ok) throw new Error((responsePayload && responsePayload.error) || "投稿失败"); setStatus("投稿成功，感谢参与！", "success"); form.reset(); await refreshPortal(); } catch (error) { const message = error && typeof error === "object" && "message" in error ? error.message : null; setStatus(message || "投稿失败，请稍后再试", "error"); } finally { submitBtn.disabled = false; } }');
  scriptParts.push('async function uploadImage(file) { const initRes = await fetch("/api/uploads/initiate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type || "application/octet-stream" }) }); const initJson = await initRes.json().catch(() => null); if (!initRes.ok || !initJson || !initJson.data) throw new Error((initJson && initJson.error) || "初始化上传失败"); const uploadInfo = initJson.data; const partRes = await fetch("/api/uploads/multipart/" + uploadInfo.uploadId + "/part/1", { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: await file.arrayBuffer() }); const partJson = await partRes.json().catch(() => null); if (!partRes.ok || !partJson || !partJson.data) throw new Error((partJson && partJson.error) || "上传分片失败"); const completeRes = await fetch("/api/uploads/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: uploadInfo.uploadId, key: uploadInfo.key, parts: [{ partNumber: 1, etag: partJson.data.etag }] }) }); const completeJson = await completeRes.json().catch(() => null); if (!completeRes.ok) throw new Error((completeJson && completeJson.error) || "完成上传失败"); return { r2Key: uploadInfo.key, thumbnailKey: uploadInfo.thumbnailKey, originalName: file.name, size: file.size }; }');
  scriptParts.push('function setStatus(message, variant) { statusEl.textContent = message || ""; if (!message) { statusEl.style.color = "rgba(148,163,184,0.85)"; return; } if (variant === "error") { statusEl.style.color = "#f87171"; } else if (variant === "success") { statusEl.style.color = "#4ade80"; } else if (variant === "warning") { statusEl.style.color = "#facc15"; } else { statusEl.style.color = "rgba(148,163,184,0.85)"; } }');
  scriptParts.push('})();</script>');

  const bodySegments = [
    '<header style="padding:3rem 1.5rem 2.5rem; text-align:center; background: radial-gradient(circle at top, rgba(56,189,248,0.25), transparent 60%);">',
    `  <h1 style="font-size: clamp(2.2rem, 4vw, 3rem); margin-bottom: 0.5rem;">${issueTitle}</h1>`,
    `  <div class="badge" style="margin-top: 1rem; display:inline-flex;">${initialDeadlineText}</div>`,
    summary
      ? `  <p style="max-width: 680px; margin: 1.25rem auto 0; color: rgba(226,232,240,0.78); line-height: 1.7;">${summary}</p>`
      : '',
    `  <p style="max-width: 680px; margin: 1rem auto 0; color: rgba(148,163,184,0.85);">导向语：${guidance || '自由投稿'}</p>`,
    '</header>',
    '<main style="max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem 4rem; display: grid; gap: 1.5rem;">',
    '  <section class="card">',
    '    <h2 style="margin-top:0;">提交作品</h2>',
    `    <p id="portal-deadline" style="color: rgba(148,163,184,0.85); margin-top:0.5rem;">${initialDeadlineText}</p>`,
    '    <form id="portal-form" style="display:grid; gap:0.75rem; margin-top:1.5rem;">',
    '      <input name="title" placeholder="作品标题" required />',
    '      <input name="authorName" placeholder="作者 (可选)" />',
    '      <input name="authorContact" placeholder="联系方式 (可选)" />',
    '      <input name="location" placeholder="拍摄地点 (可选)" />',
    '      <input name="shotAt" placeholder="拍摄时间 (可选，如 2023 夏)" />',
    '      <input name="equipment" placeholder="器材信息 (可选)" />',
    '      <textarea name="description" placeholder="作品简介 (可选)"></textarea>',
    '      <label style="display:flex; flex-direction:column; gap:0.4rem;">',
    '        <span style="font-size:0.85rem; color: rgba(148,163,184,0.85);">上传原图（支持多张，每张需 ≥10MB）</span>',
    '        <input id="portal-images" name="images" type="file" accept="image/*" multiple required />',
    '      </label>',
    '      <button id="portal-submit" type="submit">提交作品</button>',
    '    </form>',
    '    <p id="portal-status" style="min-height:1.5rem; margin-top:0.75rem; color: rgba(148,163,184,0.85);"></p>',
    '  </section>',
    '  <section class="card">',
    '    <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">',
    '      <h2 style="margin:0;">参赛作品</h2>',
    '      <button id="portal-refresh" type="button" style="background: rgba(148,163,184,0.18); color:#e2e8f0;">刷新</button>',
    '    </div>',
    '    <p id="portal-voting-notice" style="color: rgba(148,163,184,0.85); margin-top:0.75rem;"></p>',
    '    <div id="portal-submissions" style="display:grid; gap:0.75rem; margin-top:1rem;"></div>',
    '  </section>',
    '</main>',
    scriptParts.join('\n'),
  ];

  const htmlBody = bodySegments.join('\n');

  return c.html(layout(`${issueTitle} 投稿入口 · FilmWeekly`, htmlBody));
});

pagesRoute.get('/admin', (c) => {
  const body = `
    <header>
      <h1 style="font-size: clamp(2rem, 4vw, 3rem); margin-bottom: 0.75rem;">后台管理</h1>
      <p style="color: rgba(148,163,184,0.85);">输入管理员令牌以加载投稿、期刊、审计日志并进行审核操作。</p>
    </header>
    <div class="admin-container">
      <section class="card" style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
        <label style="flex:1; min-width: 240px;">
          <span style="display:block; font-size:0.85rem; color: rgba(148,163,184,0.85); margin-bottom:0.35rem;">管理员 API Token</span>
          <input id="admin-token" type="password" placeholder="粘贴 Bearer Token" />
        </label>
        <button id="save-token" type="button">保存</button>
        <button id="clear-token" type="button" style="background: rgba(239,68,68,0.85); color: #fff; box-shadow:none;">清除</button>
        <span id="token-status" style="flex-basis:100%; color: rgba(148,163,184,0.85); font-size:0.9rem; margin-top:0.5rem;"></span>
      </section>
      <div class="admin-grid">
        <section class="card">
          <h2 style="margin-top:0;">投稿审核</h2>
          <div id="submissions"></div>
        </section>
        <section class="card">
          <h2 style="margin-top:0;">快速创建期刊</h2>
          <form id="issue-form" style="display:grid; gap:0.75rem;">
            <input name="slug" placeholder="期刊 slug，如 2024-week-10" required />
            <input name="title" placeholder="期刊标题" required />
            <textarea name="guidance" placeholder="导向语" required></textarea>
            <textarea name="summary" placeholder="期刊摘要"></textarea>
            <label style="display:flex; flex-direction:column; gap:0.35rem;">
              <span style="font-size:0.85rem; color: rgba(148,163,184,0.85);">发布时间（期刊将于该时间自动公开）</span>
              <input name="publishAt" type="datetime-local" placeholder="选择发布时间 (可选)" />
            </label>
            <label style="display:flex; flex-direction:column; gap:0.35rem;">
              <span style="font-size:0.85rem; color: rgba(148,163,184,0.85);">投稿截止时间（超过此时间停止接受投稿）</span>
              <input name="submissionDeadline" type="datetime-local" placeholder="选择投稿截止时间 (可选)" />
            </label>
            <button type="submit">创建期刊</button>
          </form>
          <h3 style="margin-top:1.5rem;">审计日志</h3>
          <div id="audit-logs" style="max-height:240px; overflow:auto; font-size:0.85rem; line-height:1.6; color: rgba(148,163,184,0.85);"></div>
        </section>
      </div>
    </div>
    <div class="toast" id="toast"></div>
    ${adminScript}
  `;
  return c.html(layout('后台管理 · FilmWeekly', body));
});

export default pagesRoute;
