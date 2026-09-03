/* eslint-env serviceworker */

/**
 * Service Worker（2-11）。
 *
 * オフラインで起動・閲覧・編集できることが Phase 2 の完了条件にある。
 * マップの実体は選んだローカルフォルダにあり、ここで賄うのは
 * 「アプリそのもの（HTML / JS / CSS / アイコン）を通信なしで出せること」だけである。
 *
 * ライブラリを入れずに手で書いてある。やることは2種類しかないためで、
 * 増やしたくなったら vite-plugin-pwa の導入を検討すること。
 *
 * | 対象 | 方針 | 理由 |
 * |---|---|---|
 * | 画面遷移（HTML） | ネットワーク優先、失敗したらキャッシュ | 新しい版を配ったら次の起動で反映される |
 * | 同一オリジンの静的ファイル | キャッシュ優先、無ければ取得して蓄える | ファイル名にハッシュが入るので古い内容が混ざらない |
 *
 * 他オリジンへの要求には一切触らない。
 */

const CACHE = "mieru-v1";

/** このワーカーが受け持つ範囲。GitHub Pages のサブパス配信でも正しく解決する */
const SCOPE = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  // 起点となる HTML だけ先に取っておく。残りは使われた分だけ蓄える
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SCOPE.pathname, { cache: "reload" })))
      // 初回インストール時に通信が無くても、登録自体は成功させる
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

/** 画面遷移。新しい版を優先し、通信できないときだけ手元の版を出す */
async function handleNavigate(request) {
  try {
    const response = await fetch(request);
    // **エラー応答を起点として蓄えない。** 配信先が変わって旧 URL が 404 になったとき、
    // それをアプリの起点として保存すると、以後オフライン時に 404 が「アプリ」として
    // 出続け、利用者の側から復旧できなくなる（静的ファイル側と同じ理由）。
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(SCOPE.pathname, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SCOPE.pathname);
    if (cached !== undefined) return cached;
    throw error;
  }
}

/** 静的ファイル。ファイル名にハッシュが入るため、あるものはそのまま使ってよい */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  // エラー応答を蓄えない。一度の失敗が永続すると復旧できなくなる
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  event.respondWith(request.mode === "navigate" ? handleNavigate(request) : handleAsset(request));
});
