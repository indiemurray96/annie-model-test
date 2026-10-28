// markdown-it is bundled locally; model output must never enable raw HTML.
(function (root) {
  "use strict";

  const markdown = typeof root.markdownit === "function"
    ? root.markdownit({ html: false, breaks: false, linkify: false, typographer: false })
    : null;

  if (markdown) {
    const defaultValidateLink = markdown.validateLink.bind(markdown);
    markdown.validateLink = function (url) {
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
      return (!scheme || /^(https?|mailto):$/i.test(scheme[0])) && defaultValidateLink(url);
    };
    const defaultLinkOpen = markdown.renderer.rules.link_open || function (tokens, index, options, env, renderer) {
      return renderer.renderToken(tokens, index, options);
    };
    markdown.renderer.rules.link_open = function (tokens, index, options, env, renderer) {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noopener noreferrer");
      return defaultLinkOpen(tokens, index, options, env, renderer);
    };
    markdown.renderer.rules.table_open = () => '<div class="table-scroll"><table>\n';
    markdown.renderer.rules.table_close = () => '</table></div>\n';
    // A model-generated image URL must not silently make a third-party request.
    markdown.renderer.rules.image = (tokens, index) =>
      '<span class="image-description">[Image: ' + markdown.utils.escapeHtml(tokens[index].content || "") + ']</span>';
  }

  function render(source) {
    return markdown ? markdown.render(String(source || "")) : null;
  }

  function renderMessage(element, role, source) {
    const text = String(source || "");
    const html = role === "assistant" ? render(text) : null;
    if (html === null) element.textContent = text;
    else element.innerHTML = html;
  }

  root.NoraMarkdown = Object.freeze({ render, renderMessage });
})(typeof window !== "undefined" ? window : globalThis);
