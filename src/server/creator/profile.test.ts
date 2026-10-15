import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../tests/support/db";
import { makeOrg, makePost, makeUser } from "../../../tests/support/factories";
import { cookieJar, resetRequestContext, signInAs } from "../../../tests/support/request-context";
import { getDb } from "../db/client";
import { creators, socialAccounts, users } from "../db/schema";
import { loadCreatorContext } from "./context";
import { addSocialAccount, createCreatorProfile, listSocialAccounts, removeSocialAccount, signUpCreator, updateCreatorProfile } from "./profile";
import { linkAccount, makeCreatorUser } from "./test-helpers";

const signUpInput = {
  email: "New.Creator@example.test",
  password: "a long enough password",
  firstName: "New",
  lastName: "Creator",
  displayName: "New Creator",
  country: "us",
};

describe("creator registration", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("creates the user through the auth service, signs in, and links a creator profile", async () => {
    const result = await signUpCreator(signUpInput);
    expect(result).toMatchObject({ ok: true });
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, "new.creator@example.test"));
    const [creator] = await db.select().from(creators).where(eq(creators.userId, user.id));
    expect(creator).toMatchObject({ displayName: "New Creator", country: "US", level: "bronze" });
    expect(cookieJar.size).toBe(1);
  });

  it("validates login and profile fields together without creating anything", async () => {
    const result = await signUpCreator({ ...signUpInput, password: "short", displayName: " ", country: "ZZ" });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    if (!result.ok) expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["country", "displayName", "password"]);
    const db = await getDb();
    expect(await db.select().from(users)).toEqual([]);
  });

  it("lets a signed-in brand user add a creator profile once", async () => {
    const { owner } = await makeOrg();
    expect(await createCreatorProfile({ displayName: "Brand Person", country: "GB" })).toMatchObject({ ok: false, code: "forbidden" });
    await signInAs(owner.id);
    expect(await createCreatorProfile({ displayName: "Brand Person", country: "GB" })).toMatchObject({ ok: true });
    expect(await createCreatorProfile({ displayName: "Again", country: "GB" })).toMatchObject({ ok: false, code: "conflict" });
    expect((await loadCreatorContext())?.creator.displayName).toBe("Brand Person");
  });

  it("updates only the signed-in creator's profile", async () => {
    const { user, creator } = await makeCreatorUser({ displayName: "Before" });
    const { creator: other } = await makeCreatorUser({ displayName: "Other" });
    await signInAs(user.id);
    expect(await updateCreatorProfile({ displayName: "After", country: "CA" })).toMatchObject({ ok: true });
    const db = await getDb();
    expect((await db.select().from(creators).where(eq(creators.id, creator.id)))[0]).toMatchObject({ displayName: "After", country: "CA" });
    expect((await db.select().from(creators).where(eq(creators.id, other.id)))[0]).toMatchObject({ displayName: "Other" });
  });

  it("requires a creator profile for creator commands", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    expect(await updateCreatorProfile({ displayName: "X", country: "US" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("social accounts", () => {
  beforeEach(async () => {
    await createTestDb();
    resetRequestContext();
  });

  it("adds accounts as unverified with normalized handles and refuses duplicates", async () => {
    const { user, creator } = await makeCreatorUser();
    await signInAs(user.id);
    expect(await addSocialAccount({ platform: "tiktok", handle: " @My.Handle ", dedicated: true })).toMatchObject({ ok: true });
    const accounts = await listSocialAccounts({ creator });
    expect(accounts).toEqual([expect.objectContaining({ platform: "tiktok", handle: "my.handle", verification: "unverified", dedicated: true, submissions: 0 })]);
    expect(await addSocialAccount({ platform: "tiktok", handle: "my.handle" })).toMatchObject({ ok: false, code: "conflict", fieldErrors: { handle: expect.any(String) } });
    expect(await addSocialAccount({ platform: "myspace", handle: "x" })).toMatchObject({ ok: false, fieldErrors: { platform: expect.any(String) } });
    expect(await addSocialAccount({ platform: "tiktok", handle: "bad handle!" })).toMatchObject({ ok: false, fieldErrors: { handle: expect.any(String) } });
  });

  it("removes only the creator's own accounts, and keeps accounts with submissions", async () => {
    const { user, creator } = await makeCreatorUser();
    const { creator: other } = await makeCreatorUser();
    const mine = await linkAccount(creator.id, "instagram", "mine");
    const used = await linkAccount(creator.id, "tiktok", "used");
    const theirs = await linkAccount(other.id, "instagram", "theirs");
    const { org } = await makeOrg();
    await makePost(org.id, creator.id, { socialAccountId: used.id });
    await signInAs(user.id);

    expect(await removeSocialAccount({ accountId: theirs.id })).toMatchObject({ ok: false, code: "not_found" });
    expect(await removeSocialAccount({ accountId: used.id })).toMatchObject({ ok: false, code: "conflict" });
    expect(await removeSocialAccount({ accountId: mine.id })).toMatchObject({ ok: true });
    const db = await getDb();
    expect((await db.select().from(socialAccounts)).map((a) => a.handle).sort()).toEqual(["theirs", "used"]);
  });
});
