const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const MarkdownIt = require("../public/vendor/markdown-it.min.js");

function renderer(withParser = true) {
  const context = withParser ? { markdownit: MarkdownIt } : {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/markdown-renderer.js"), "utf8"), context);
  return context.NoraMarkdown;
}
const md = renderer();

test("assistant prose, emphasis and lists render as semantic Markdown", () => {
  const html = md.render("Hello **Indie**.\n\n*An idea*\n\n- First\n- Second");
  assert.match(html, /<p>Hello <strong>Indie<\/strong>\.<\/p>/);
  assert.match(html, /<em>An idea<\/em>/);
  assert.match(html, /<ul>\s*<li>First<\/li>\s*<li>Second<\/li>/);
});

test("tables are rendered inside a horizontal scrolling wrapper", () => {
  const html = md.render("| What | Why |\n| --- | --- |\n| **Model** | Correct |\n");
  assert.match(html, /<div class="table-scroll"><table>/);
  assert.match(html, /<th>What<\/th>/);
  assert.match(html, /<td><strong>Model<\/strong><\/td>/);
  assert.match(html, /<\/table><\/div>/);
});

test("code stays literal and cannot create an executable element", () => {
  const html = md.render("```html\n<script>alert(1)</script>\n```\n\n`<img src=x onerror=alert(1)>`");
  assert.match(html, /<pre><code class="language-html">&lt;script&gt;/);
  assert.match(html, /<code>&lt;img src=x onerror=alert\(1\)&gt;<\/code>/);
  assert.doesNotMatch(html, /<script|<img/i);
});

test("raw HTML is escaped, including event handlers and iframe markup", () => {
  const html = md.render('<img src=x onerror="alert(1)">\n<iframe src="https://example.com"></iframe>');
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;iframe/);
  assert.doesNotMatch(html, /<img|<iframe/i);
});

for (const url of ["javascript:alert(1)", "vbscript:msgbox(1)", "data:text/html,hello", "file:///secret.txt", "blob:https://example.com/id", "java&#x73;cript:alert(1)"]) {
  test("unsafe Markdown URL is not turned into a link: " + url, () => {
    const html = md.render("[click](" + url + ")");
    assert.doesNotMatch(html, /<a\b/);
  });
}

test("ordinary web links render with safe opener behavior", () => {
  const html = md.render("[Source](https://example.com/path?x=1&y=2)");
  assert.match(html, /href="https:\/\/example.com\/path\?x=1&amp;y=2"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("model-generated image descriptions do not load third-party resources", () => {
  const html = md.render("![chart](https://example.com/tracking.png)");
  assert.match(html, /\[Image: chart\]/);
  assert.doesNotMatch(html, /<img|src=/i);
});

test("user messages remain literal even when they contain Markdown or HTML", () => {
  const element = {textContent: "", innerHTML: "unchanged"};
  md.renderMessage(element, "user", "**hello** <script>bad()</script>");
  assert.equal(element.textContent, "**hello** <script>bad()</script>");
  assert.equal(element.innerHTML, "unchanged");
});

test("streamed assistant prefixes and final responses use the same safe renderer", () => {
  const element = {textContent: "", innerHTML: ""};
  for (const partial of ["Hello **", "Hello **Indie**.", "<script", "<script>alert(1)</script>"]) {
    md.renderMessage(element, "assistant", partial);
    assert.doesNotMatch(element.innerHTML, /<script\b/i);
  }
  md.renderMessage(element, "assistant", "Hello **Indie**.");
  assert.match(element.innerHTML, /<strong>Indie<\/strong>/);
});

test("parser loading failure falls back to plain text", () => {
  const element = {textContent: "", innerHTML: "unchanged"};
  renderer(false).renderMessage(element, "assistant", "**hello**");
  assert.equal(element.textContent, "**hello**");
  assert.equal(element.innerHTML, "unchanged");
});
