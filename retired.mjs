export default {
  fetch() {
    return new Response("This service has been retired.\n", {
      status: 410,
      headers: { "Cache-Control": "no-store" }
    });
  }
};
