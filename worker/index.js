export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || isAssetRequest(request)) {
      return response;
    }

    const indexUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }
};

function isAssetRequest(request) {
  const { pathname } = new URL(request.url);
  return pathname.includes(".") || pathname.startsWith("/icons/");
}
