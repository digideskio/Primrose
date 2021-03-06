pliny.value({
  name: "isWebKit",
  type: "Boolean",
  description: "Flag indicating the browser is one of Chrome, Safari, or Opera.\n\
WebKit browsers have certain issues in common that can be treated together, like\n\
a common basis for orientation events."
});
const isWebKit = !(/iP(hone|od|ad)/.test(navigator.userAgent || "")) || isOpera || isChrome;