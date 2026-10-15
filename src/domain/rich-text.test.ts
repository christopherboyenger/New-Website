import { describe, expect, it } from "vitest";
import { RICH_TEXT_MAX_CHARS, richTextLength, richTextPlainText, sanitizeRichText, validateRichText } from "./rich-text";

describe("sanitizeRichText", () => {
  it("keeps the allowed formatting", () => {
    const html =
      "<h2>Rules</h2><h3>Tone</h3><p>Be <strong>bold</strong>, <em>calm</em> and <u>clear</u>.<br>Next line</p><ul><li>One</li></ul><ol><li>Two</li></ol>";
    expect(sanitizeRichText(html)).toBe(html.replace("<br>", "<br />"));
  });

  it("removes script and style elements with their contents", () => {
    expect(sanitizeRichText("<p>Hi</p><script>alert(1)</script><style>p{color:red}</style>")).toBe("<p>Hi</p>");
  });

  it("strips event handlers and style attributes", () => {
    expect(sanitizeRichText('<p onclick="alert(1)" style="color:red">Text</p><img src=x onerror=alert(1)>')).toBe("<p>Text</p>");
  });

  it("drops javascript:, data: and http: links but keeps their text", () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">click</a></p>')).toBe("<p>click</p>");
    expect(sanitizeRichText('<p><a href="java&#x09;script:alert(1)">tab</a></p>')).toBe("<p>tab</p>");
    expect(sanitizeRichText('<p><a href="data:text/html,hi">data</a></p>')).toBe("<p>data</p>");
    expect(sanitizeRichText('<p><a href="http://example.com">plain</a></p>')).toBe("<p>plain</p>");
    expect(sanitizeRichText('<p><a href="//example.com">relative</a></p>')).toBe("<p>relative</p>");
    expect(sanitizeRichText('<p><a href="javascript:x">bad</a> <a href="https://ok.example">ok</a> <a>none</a></p>')).toBe(
      '<p>bad <a href="https://ok.example/" rel="noopener noreferrer" target="_blank">ok</a> none</p>',
    );
  });

  it("forces rel and target on allowed links and drops other attributes", () => {
    expect(sanitizeRichText('<a href="https://example.com/a" class="x" target="_self" onmouseover="x()">site</a>')).toBe(
      '<a href="https://example.com/a" rel="noopener noreferrer" target="_blank">site</a>',
    );
    expect(sanitizeRichText('<a href="mailto:team@example.com">mail</a>')).toBe(
      '<a href="mailto:team@example.com" rel="noopener noreferrer" target="_blank">mail</a>',
    );
  });

  it("removes disallowed tags but keeps their text, and normalizes editor output", () => {
    expect(sanitizeRichText("<div>Line <b>b</b> <i>i</i> <span style='x'>s</span></div><h1>Big</h1><table><tr><td>cell</td></tr></table>")).toBe(
      "<p>Line <strong>b</strong> <em>i</em> s</p><h2>Big</h2>cell",
    );
    expect(sanitizeRichText('<iframe src="https://example.com">x</iframe><p>ok</p>')).toBe("<p>ok</p>");
  });

  it("returns an empty string when nothing visible remains", () => {
    expect(sanitizeRichText("<p><br></p><p>   </p>")).toBe("");
    expect(sanitizeRichText("<script>x</script>")).toBe("");
  });
});

describe("rich text length and limit", () => {
  it("counts text characters only, decoding entities", () => {
    expect(richTextLength("<p><strong>Ab</strong> &amp; c</p>")).toBe(6);
    expect(richTextPlainText("<p>1 &lt; 2</p>")).toBe("1 < 2");
    expect(richTextLength("<p>👋</p>")).toBe(1);
  });

  it("accepts exactly 1,000 characters and rejects 1,001", () => {
    const ok = validateRichText(`<p>${"a".repeat(RICH_TEXT_MAX_CHARS)}</p>`);
    expect(ok).toMatchObject({ ok: true, length: 1000 });
    const tooLong = validateRichText(`<p><strong>${"a".repeat(RICH_TEXT_MAX_CHARS + 1)}</strong></p>`);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/1,000 characters/);
  });

  it("does not count markup or removed content against the limit", () => {
    const text = "a".repeat(990);
    const result = validateRichText(`<h2>${text}</h2><script>${"x".repeat(500)}</script>`);
    expect(result).toMatchObject({ ok: true, length: 990 });
  });

  it("rejects oversized markup before parsing", () => {
    expect(validateRichText("<p></p>".repeat(5000)).ok).toBe(false);
  });
});
