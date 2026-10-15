import { describe, expect, it } from "vitest";
import { normalizePostUrl } from "./submission-url";

describe("normalizePostUrl", () => {
  it("accepts each platform's hosts and strips fragments, tracking queries and trailing slashes", () => {
    expect(normalizePostUrl("tiktok", " https://WWW.TikTok.com/@me/video/123/?lang=en#x ")).toEqual({ ok: true, url: "https://www.tiktok.com/@me/video/123" });
    expect(normalizePostUrl("tiktok", "https://vm.tiktok.com/ZMabc/")).toEqual({ ok: true, url: "https://vm.tiktok.com/ZMabc" });
    expect(normalizePostUrl("instagram", "https://www.instagram.com/reel/Cxyz/?igsh=1")).toEqual({ ok: true, url: "https://www.instagram.com/reel/Cxyz" });
    expect(normalizePostUrl("snapchat", "https://www.snapchat.com/spotlight/abc")).toEqual({ ok: true, url: "https://www.snapchat.com/spotlight/abc" });
    expect(normalizePostUrl("facebook_reels", "https://m.facebook.com/reel/123")).toEqual({ ok: true, url: "https://www.facebook.com/reel/123" });
    expect(normalizePostUrl("tiktok", "https://tiktok.com/@me/video/123")).toEqual({ ok: true, url: "https://www.tiktok.com/@me/video/123" });
  });

  it("keeps only the YouTube video parameter", () => {
    expect(normalizePostUrl("youtube", "https://www.youtube.com/watch?v=abc123&t=10s")).toEqual({ ok: true, url: "https://www.youtube.com/watch?v=abc123" });
    expect(normalizePostUrl("youtube", "https://youtube.com/shorts/xyz?feature=share")).toEqual({ ok: true, url: "https://www.youtube.com/shorts/xyz" });
    expect(normalizePostUrl("youtube", "https://youtu.be/xyz")).toEqual({ ok: true, url: "https://youtu.be/xyz" });
  });

  it("rejects other hosts, look-alike hosts, non-https links, credentials, ports and bare home pages", () => {
    expect(normalizePostUrl("tiktok", "https://www.instagram.com/reel/1")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "https://tiktok.com.example.test/@me/video/1")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "https://nottiktok.com/@me/video/1")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "http://www.tiktok.com/@me/video/1")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "https://user:pw@www.tiktok.com/@me/video/1")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "https://www.tiktok.com:8443/@me/video/1")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "https://www.tiktok.com/")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "javascript:alert(1)")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", "")).toMatchObject({ ok: false });
    expect(normalizePostUrl("tiktok", `https://www.tiktok.com/${"a".repeat(600)}`)).toMatchObject({ ok: false });
  });
});
